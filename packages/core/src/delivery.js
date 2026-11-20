// Background delivery of the placement result. The contact step answers the student right away
// and marks each channel (email, WhatsApp) as 'pending' on the attempt; this module sends them.
//
// The attempt row works as the outbox. A server claims an attempt with a short lease before it
// sends and records the outcome afterwards, so two servers (the old and the new one during a
// deploy) never send the same result. A lease that has run out means its server stopped in the
// middle of a send, so a later sweep sends that result again. In that rare case one message can
// arrive twice, which is better than a result that never arrives.

import { nowSeconds } from "./http.js";
import { loadLevels, levelFor, publicLevel, addActivity } from "./store.js";
import { buildResultEmail, buildMockupDoneEmail } from "./email.js";
import { sendWhatsApp, buildResultWhatsApp, buildMockupDoneWhatsApp, PLACEMENT_LEAD_SOURCE } from "./whatsapp.js";
import { isFinalStatus, speakingFacts } from "./speaking-result.js";

// A result with a speaking recording waits until that recording is graded, graded by hand, or
// skipped. The grading (speaking.js) and the dashboard call deliverInBackground again then.
const SPEAKING_DONE = "NOT EXISTS (SELECT 1 FROM speaking_submissions s WHERE s.attempt_id = attempts.id AND s.status NOT IN ('graded', 'manual', 'skipped'))";

export const EMAIL_SKIPPED = "skipped: email not configured";

const LEASE_SECONDS = 90;
// Both sends run side by side and give up after 20 seconds, so a delivery ends well inside the
// 30 seconds that Render waits after asking a server to stop.
const WHATSAPP_TIMEOUT_MS = 20_000;
const SWEEP_LIMIT = 100;
const DEFAULT_FROM = "Titik Nol English Course <placement@index-now.dev>";

const running = new Set();
let stopping = false;
let recheckTimer = null;

/** Runs a task without making the caller wait, and keeps track of it for a clean shutdown. */
export function runInBackground(task) {
  const job = Promise.resolve()
    .then(task)
    .catch((error) => console.error("result delivery", error))
    .finally(() => running.delete(job));
  running.add(job);
  return job;
}

/** Sends one attempt's result in the background, right after its contact step. */
export function deliverInBackground(env, attemptId) {
  return runInBackground(() => deliverResult(env, attemptId));
}

/** Waits for running sends before the server stops, for at most timeoutMs. */
export async function drainDeliveries(timeoutMs = 20_000) {
  stopping = true;
  clearTimeout(recheckTimer);
  const deadline = Date.now() + timeoutMs;
  while (running.size > 0 && Date.now() < deadline) {
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, deadline - Date.now()); });
    await Promise.race([Promise.allSettled([...running]), timeout]);
    clearTimeout(timer);
  }
  return running.size === 0;
}

/** Claims one attempt, sends its pending channels, and records what happened. */
export async function deliverResult(env, attemptId) {
  const speaking = await env.DB.prepare(
    "SELECT status, cefr_overall, ielts_overall, scores, transcript FROM speaking_submissions WHERE attempt_id = ?",
  ).bind(attemptId).first();
  if (speaking && !isFinalStatus(speaking.status)) return null; // the recording is still being scored
  const now = nowSeconds();
  const attempt = await env.DB.prepare(
    `UPDATE attempts SET delivery_lease_until = ?
      WHERE id = ? AND (email_status = 'pending' OR wa_status = 'pending')
        AND (delivery_lease_until IS NULL OR delivery_lease_until < ?) AND ${SPEAKING_DONE}
      RETURNING id, student_id, name, email, whatsapp, score, total, level_key, email_status, wa_status, result_token`,
  ).bind(now + LEASE_SECONDS, attemptId, now).first();
  if (!attempt) return null; // nothing waiting, or another server is sending it

  const levels = await loadLevels(env);
  const level = publicLevel(levels.find((l) => l.key === attempt.level_key) || levelFor(levels, attempt.score ?? 0));
  // The private link to the full result page, sent inside both channels.
  const resultUrl = attempt.result_token ? `${env.PUBLIC_WEB_URL}/hasil?token=${attempt.result_token}` : null;
  const facts = { name: attempt.name, email: attempt.email, score: attempt.score ?? 0, total: attempt.total, level, speaking: speakingFacts(speaking), resultUrl };
  const waText = buildResultWhatsApp(facts);
  const [mail, wa] = await Promise.all([
    attempt.email_status === "pending" ? sendResultEmail(env, facts) : null,
    attempt.wa_status === "pending"
      ? sendWhatsApp(env, { to: attempt.whatsapp, text: waText, source: PLACEMENT_LEAD_SOURCE, timeoutMs: WHATSAPP_TIMEOUT_MS })
      : null,
  ]);

  const at = nowSeconds();
  const sid = attempt.student_id;
  const statements = [];
  if (mail) {
    statements.push(env.DB.prepare("UPDATE attempts SET email_status = ?, email_sent_at = ? WHERE id = ?").bind(mail.status, mail.ok ? at : null, attemptId));
    if (sid && mail.status !== EMAIL_SKIPPED) {
      statements.push(addActivity(env, sid, "email", mail.ok
        ? `Email hasil terkirim ke ${attempt.email}.`
        : `Email hasil gagal terkirim ke ${attempt.email}. Periksa alamatnya sebelum mengirim ulang.`, null, null, at));
    }
  }
  if (wa) {
    const waStatus = wa.ok ? "sent" : wa.status === "skipped" ? "skipped" : `failed: ${String(wa.error).slice(0, 180)}`;
    statements.push(env.DB.prepare("UPDATE attempts SET wa_status = ?, wa_sent_at = ? WHERE id = ?").bind(waStatus, wa.ok ? at : null, attemptId));
    if (sid && wa.status !== "skipped") {
      statements.push(env.DB.prepare("INSERT INTO wa_messages (student_id, to_number, text, status, provider_message_id, error, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(sid, attempt.whatsapp, waText, wa.status, wa.messageId || null, wa.error || null, at, "Sistem"));
      statements.push(addActivity(env, sid, "wa", wa.ok
        ? `Hasil placement${facts.speaking ? " dan speaking" : ""} terkirim otomatis lewat WhatsApp:\n${waText}`
        : `Hasil placement gagal terkirim lewat WhatsApp. ${wa.error}`, null, { attemptId }, at));
    }
  }
  statements.push(env.DB.prepare("UPDATE attempts SET delivery_lease_until = NULL WHERE id = ?").bind(attemptId));
  await env.DB.batch(statements);
  return { email: mail ? mail.status : null, whatsapp: wa ? wa.status : null };
}

/**
 * Sends every result that is still waiting, for example one left by a server that crashed.
 * Runs when the test app starts. Safe to run on several servers at once.
 */
export async function deliverPending(env) {
  if (stopping) return;
  clearTimeout(recheckTimer);
  recheckTimer = null;
  const { results } = await env.DB.prepare(
    `SELECT id, delivery_lease_until FROM attempts
      WHERE (email_status = 'pending' OR wa_status = 'pending') AND ${SPEAKING_DONE}
      ORDER BY submitted_at LIMIT ${SWEEP_LIMIT}`,
  ).all();
  let nextExpiry = null;
  for (const row of results) {
    if (stopping) return;
    if (row.delivery_lease_until && row.delivery_lease_until >= nowSeconds()) {
      nextExpiry = Math.min(nextExpiry ?? row.delivery_lease_until, row.delivery_lease_until);
      continue;
    }
    await runInBackground(() => deliverResult(env, row.id));
  }
  // Another server is sending some of these right now. Look again once its lease runs out,
  // in case that server stopped before it finished.
  if (nextExpiry !== null && !stopping) {
    const waitMs = Math.max(1, nextExpiry - nowSeconds() + 2) * 1000;
    recheckTimer = setTimeout(() => runInBackground(() => deliverPending(env)), waitMs);
    recheckTimer.unref?.();
  }
}

async function sendResultEmail(env, facts) {
  if (!env.SEND_EMAIL) return { ok: false, status: EMAIL_SKIPPED };
  const { subject, html, text } = buildResultEmail(facts);
  try {
    await env.SEND_EMAIL.send({ from: env.RESULT_FROM_EMAIL || DEFAULT_FROM, to: facts.email, subject, html, text });
    return { ok: true, status: "sent" };
  } catch (error) {
    console.error("email failed", error);
    return { ok: false, status: `failed: ${String(error).slice(0, 180)}` };
  }
}

/**
 * The mockup completion notification, sent in the background right after a submitted IELTS mockup
 * attempt has nothing left to process (writing graded or failed, speaking done or skipped). It
 * reuses the placement lease column so two servers never send it twice, and it is one-shot: the
 * channels flip straight to sent or failed, never back to pending.
 */
export async function deliverMockupDone(env, attemptId) {
  const attempt = await env.DB.prepare(
    "SELECT a.id, a.student_id, a.name, a.email, a.whatsapp, a.bands, a.delivery_lease_until, s.email AS student_email, s.whatsapp AS student_whatsapp FROM attempts a LEFT JOIN students s ON s.id = a.student_id WHERE a.id = ?",
  ).bind(attemptId).first();
  if (!attempt || !attempt.student_id) return null;
  const now = nowSeconds();
  const claimed = await env.DB.prepare(
    "UPDATE attempts SET delivery_lease_until = ? WHERE id = ? AND delivery_lease_until IS NULL RETURNING id",
  ).bind(now + LEASE_SECONDS, attemptId).first();
  if (!claimed) return null; // another server is sending it, or it was already sent
  const email = attempt.email || attempt.student_email;
  const whatsapp = attempt.whatsapp || attempt.student_whatsapp;
  const stored = attempt.bands ? JSON.parse(attempt.bands) : null;
  // The auto-issued certificate of this attempt, with its PDF when composition succeeded. The
  // notification mentions the number and carries the file: attachment on email, document on WhatsApp.
  const cert = await env.DB.prepare(
    "SELECT number, pdf, pdf_name, pdf_token FROM certificates WHERE attempt_id = ?",
  ).bind(attemptId).first();
  const facts = {
    name: attempt.name,
    overall: stored?.overall ?? null,
    skills: stored?.skills || [],
    resultUrl: `${env.PUBLIC_WEB_URL}/hasil?attempt=${encodeURIComponent(attemptId)}`,
    speakingPending: false,
    certificateNumber: cert?.number || null,
  };
  const certFileUrl = cert?.pdf_token ? `${env.ADMIN_URL}/cert-file/${cert.pdf_token}` : null;
  const [mail, wa] = await Promise.all([
    email ? (async () => {
      if (!env.SEND_EMAIL) return { ok: false, status: EMAIL_SKIPPED };
      const { subject, html, text } = buildMockupDoneEmail(facts);
      try {
        await env.SEND_EMAIL.send({
          from: env.RESULT_FROM_EMAIL || DEFAULT_FROM, to: email, subject, html, text,
          ...(cert?.pdf ? { attachments: [{ filename: cert.pdf_name || "sertifikat.pdf", content: Buffer.from(cert.pdf).toString("base64") }] } : {}),
        });
        return { ok: true, status: "sent" };
      } catch (error) {
        console.error("mockup done email failed", error);
        return { ok: false, status: `failed: ${String(error).slice(0, 180)}` };
      }
    })() : null,
    whatsapp ? sendWhatsApp(env, {
      to: whatsapp, text: buildMockupDoneWhatsApp(facts), timeoutMs: WHATSAPP_TIMEOUT_MS,
      ...(certFileUrl ? { media: { kind: "document", url: certFileUrl, filename: cert.pdf_name || "sertifikat.pdf" } } : {}),
    }) : null,
  ]);
  const at = nowSeconds();
  const lines = [];
  if (mail) {
    lines.push(addActivity(env, attempt.student_id, "email", mail.ok
      ? `Email rangkuman IELTS Mockup terkirim ke ${email}.`
      : `Email rangkuman IELTS Mockup gagal terkirim ke ${email}.`, null, { attemptId }, at));
  }
  if (wa) {
    lines.push(env.DB.prepare("INSERT INTO wa_messages (student_id, to_number, text, status, provider_message_id, error, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(attempt.student_id, whatsapp, buildMockupDoneWhatsApp(facts), wa.status, wa.messageId || null, wa.error || null, at, "Sistem"));
    lines.push(addActivity(env, attempt.student_id, "wa", wa.ok
      ? `Rangkuman IELTS Mockup terkirim lewat WhatsApp:\n${buildMockupDoneWhatsApp(facts)}`
      : `Rangkuman IELTS Mockup gagal terkirim lewat WhatsApp. ${wa.error}`, null, { attemptId }, at));
  }
  lines.push(env.DB.prepare("UPDATE attempts SET delivery_lease_until = NULL WHERE id = ?").bind(attemptId));
  await env.DB.batch(lines);
  return { email: mail ? mail.status : null, whatsapp: wa ? wa.status : null };
}

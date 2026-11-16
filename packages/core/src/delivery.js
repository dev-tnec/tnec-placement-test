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
import { buildResultEmail } from "./email.js";
import { sendWhatsApp, buildResultWhatsApp, PLACEMENT_LEAD_SOURCE } from "./whatsapp.js";

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
  const now = nowSeconds();
  const attempt = await env.DB.prepare(
    `UPDATE attempts SET delivery_lease_until = ?
      WHERE id = ? AND (email_status = 'pending' OR wa_status = 'pending')
        AND (delivery_lease_until IS NULL OR delivery_lease_until < ?)
      RETURNING id, student_id, name, email, whatsapp, score, total, level_key, email_status, wa_status`,
  ).bind(now + LEASE_SECONDS, attemptId, now).first();
  if (!attempt) return null; // nothing waiting, or another server is sending it

  const levels = await loadLevels(env);
  const level = publicLevel(levels.find((l) => l.key === attempt.level_key) || levelFor(levels, attempt.score ?? 0));
  const facts = { name: attempt.name, email: attempt.email, score: attempt.score ?? 0, total: attempt.total, level };
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
        ? `Hasil placement terkirim otomatis lewat WhatsApp:\n${waText}`
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
      WHERE email_status = 'pending' OR wa_status = 'pending'
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

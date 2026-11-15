// TNEC Placement Test Worker.
// Serves the static app from ./public and the JSON API from D1.
// The answer key never leaves this Worker.

import { QUESTIONS, TOTAL_QUESTIONS, publicQuestions } from "./questions.js";
import { levelForScore, publicLevel } from "./levels.js";
import {
  CONSENT_VERSION,
  PRIVACY,
  TERMS,
  TEST_DURATION_SECONDS,
  WHATSAPP,
} from "./legal.js";
import { buildResultEmail } from "./email.js";

const MAX_BODY_BYTES = 16 * 1024;
const ATTEMPT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHOICES = new Set(["A", "B", "C", "D"]);
const VIOLATION_TYPES = new Set([
  "fullscreen_exit",
  "tab_hidden",
  "window_blur",
  "copy_attempt",
  "shortcut_blocked",
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await handleApi(request, env, url);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
      }
      console.error("unhandled", error);
      return json({ error: "Terjadi kesalahan pada server." }, 500);
    }
  },
};

async function handleApi(request, env, url) {
  const path = url.pathname;

  if (path === "/api/config" && request.method === "GET") {
    return json(
      {
        consentVersion: CONSENT_VERSION,
        durationSeconds: TEST_DURATION_SECONDS,
        totalQuestions: TOTAL_QUESTIONS,
        whatsapp: WHATSAPP,
        terms: TERMS,
        privacy: PRIVACY,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  }

  if (path === "/api/attempts" && request.method === "POST") {
    return createAttempt(request, env);
  }

  const match = path.match(
    /^\/api\/attempts\/([0-9a-f-]{36})\/(violation|submit|contact)$/,
  );
  if (match && request.method === "POST") {
    const [, attemptId, action] = match;
    if (!ATTEMPT_ID_RE.test(attemptId)) {
      throw new HttpError(400, "ID percobaan tidak valid.");
    }
    if (action === "violation") return logViolation(request, env, attemptId);
    if (action === "submit") return submitAttempt(request, env, attemptId);
    return saveContact(request, env, attemptId);
  }

  throw new HttpError(404, "Endpoint tidak ditemukan.");
}

async function createAttempt(request, env) {
  const body = await readJson(request);
  const consent = body?.consent;

  if (!consent || consent.accepted !== true) {
    throw new HttpError(400, "Kamu harus menyetujui syarat dan kebijakan privasi sebelum memulai tes.");
  }
  if (consent.version !== CONSENT_VERSION) {
    throw new HttpError(
      409,
      "Syarat dan kebijakan sudah berubah, jadi muat ulang halaman ini lalu setujui versi barunya.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  const userAgent = (request.headers.get("user-agent") || "").slice(0, 300);
  const country = request.cf?.country || null;

  await env.DB.prepare(
    `INSERT INTO attempts
       (id, started_at, expires_at, total, consent_version, consent_at, user_agent, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      now,
      now + TEST_DURATION_SECONDS,
      TOTAL_QUESTIONS,
      CONSENT_VERSION,
      now,
      userAgent,
      country,
    )
    .run();

  return json({
    attemptId: id,
    secondsLeft: TEST_DURATION_SECONDS,
    total: TOTAL_QUESTIONS,
    questions: publicQuestions(),
  });
}

async function logViolation(request, env, attemptId) {
  const body = await readJson(request);
  const type = String(body?.type || "");
  if (!VIOLATION_TYPES.has(type)) {
    throw new HttpError(400, "Jenis pelanggaran tidak dikenal.");
  }

  const now = Math.floor(Date.now() / 1000);
  const entry = `${now}:${type};`.slice(0, 200);

  const result = await env.DB.prepare(
    `UPDATE attempts
        SET violations = violations + 1,
            violation_log = COALESCE(violation_log, '') || ?
      WHERE id = ? AND status = 'in_progress'`,
  )
    .bind(entry, attemptId)
    .run();

  if (!result.meta?.changes) {
    return json({ ok: true, counted: false });
  }
  return json({ ok: true, counted: true });
}

async function submitAttempt(request, env, attemptId) {
  const body = await readJson(request);
  const attempt = await env.DB.prepare(
    "SELECT * FROM attempts WHERE id = ?",
  )
    .bind(attemptId)
    .first();

  if (!attempt) throw new HttpError(404, "Percobaan tes tidak ditemukan.");

  if (attempt.status === "submitted") {
    return json({ ok: true, total: attempt.total ?? TOTAL_QUESTIONS });
  }

  const rawAnswers = body?.answers;
  if (!rawAnswers || typeof rawAnswers !== "object") {
    throw new HttpError(400, "Jawaban tidak ditemukan.");
  }

  const now = Math.floor(Date.now() / 1000);
  let score = 0;
  const statements = QUESTIONS.map((question) => {
    const choice = normalizeChoice(rawAnswers[question.id]);
    const isCorrect = choice === question.answer ? 1 : 0;
    if (isCorrect) score += 1;
    return env.DB.prepare(
      `INSERT OR REPLACE INTO answers (attempt_id, question_id, choice, is_correct)
       VALUES (?, ?, ?, ?)`,
    ).bind(attemptId, question.id, choice, isCorrect);
  });

  const level = levelForScore(score);
  const timedOut = now > attempt.expires_at ? 1 : 0;
  const durationSeconds = Math.max(0, now - attempt.started_at);

  statements.push(
    env.DB.prepare(
      `UPDATE attempts
          SET status = 'submitted', submitted_at = ?, score = ?, level_key = ?,
              timed_out = ?, duration_seconds = ?
        WHERE id = ?`,
    ).bind(now, score, level.key, timedOut, durationSeconds, attemptId),
  );

  await env.DB.batch(statements);

  // The score is withheld until the contact step, so the result is only
  // revealed after the user has given their name, email, and WhatsApp.
  return json({
    ok: true,
    total: TOTAL_QUESTIONS,
    timedOut: Boolean(timedOut),
  });
}

async function saveContact(request, env, attemptId) {
  const body = await readJson(request);
  const name = String(body?.name || "").trim().slice(0, 80);
  const email = String(body?.email || "").trim().toLowerCase().slice(0, 160);
  const whatsapp = normalizeWhatsapp(body?.whatsapp);

  if (name.length < 2) throw new HttpError(400, "Nama harus terdiri dari minimal 2 karakter.");
  if (!isEmail(email)) throw new HttpError(400, "Alamat email belum benar. Periksa kembali penulisannya.");
  if (!whatsapp) {
    throw new HttpError(400, "Nomor WhatsApp belum benar. Contoh penulisan yang benar: 08123456789.");
  }

  const attempt = await env.DB.prepare(
    "SELECT * FROM attempts WHERE id = ?",
  )
    .bind(attemptId)
    .first();

  if (!attempt) throw new HttpError(404, "Percobaan tes tidak ditemukan.");
  if (attempt.status !== "submitted") {
    throw new HttpError(409, "Kirim jawaban tes kamu dulu sebelum mengisi data.");
  }

  const level = levelForScore(attempt.score ?? 0);
  const now = Math.floor(Date.now() / 1000);
  const alreadySent = Boolean(attempt.email_sent_at);
  let emailSent = alreadySent;
  let emailStatus = attempt.email_status || null;

  if (!alreadySent) {
    ({ emailSent, emailStatus } = await sendResultEmail(env, {
      name,
      email,
      score: attempt.score ?? 0,
      level,
    }));
  }

  await env.DB.prepare(
    `UPDATE attempts
        SET name = ?, email = ?, whatsapp = ?, email_sent_at = ?, email_status = ?
      WHERE id = ?`,
  )
    .bind(
      name,
      email,
      whatsapp,
      alreadySent ? attempt.email_sent_at : emailSent ? now : null,
      emailStatus,
      attemptId,
    )
    .run();

  return json({
    emailSent,
    result: {
      score: attempt.score ?? 0,
      total: attempt.total ?? TOTAL_QUESTIONS,
      level: publicLevel(level),
      timedOut: Boolean(attempt.timed_out),
      violations: attempt.violations,
    },
  });
}

async function sendResultEmail(env, { name, email, score, level }) {
  if (!env.SEND_EMAIL) {
    return { emailSent: false, emailStatus: "skipped: binding missing" };
  }

  const { subject, html, text } = buildResultEmail({
    name,
    email,
    score,
    total: TOTAL_QUESTIONS,
    level,
  });

  try {
    await env.SEND_EMAIL.send({
      from: env.RESULT_FROM_EMAIL || "Titik Nol English Course <placement@index-now.dev>",
      to: email,
      subject,
      html,
      text,
    });
    return { emailSent: true, emailStatus: "sent" };
  } catch (error) {
    console.error("email failed", error);
    return {
      emailSent: false,
      emailStatus: `failed: ${String(error).slice(0, 180)}`,
    };
  }
}

function normalizeChoice(value) {
  const choice = typeof value === "string" ? value.trim().toUpperCase() : "";
  return CHOICES.has(choice) ? choice : null;
}

function normalizeWhatsapp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  let normalized = null;
  if (digits.startsWith("62")) normalized = digits;
  else if (digits.startsWith("0")) normalized = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) normalized = `62${digits}`;

  if (!normalized || normalized.length < 10 || normalized.length > 15) {
    return null;
  }
  return `+${normalized}`;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) {
    throw new HttpError(413, "Data terlalu besar.");
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new HttpError(413, "Data terlalu besar.");
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "Format data tidak valid.");
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...extraHeaders,
    },
  });
}

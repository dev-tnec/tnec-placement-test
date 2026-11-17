// Public test API for the web app: config, invites, attempts, violations, submit, speaking, and
// contact. The answer key never leaves the server, and no route ever sends a recording back.

import { HttpError, json, readJson, nowSeconds, normalizeWhatsapp, isEmail } from "@tnec/core/http";
import {
  TEST_NAMES, PER_MODE_GRACE_SECONDS, loadTest, loadQuestions, loadLevels, levelFor, publicLevel,
  focusStrikes, addActivity, upsertStudentFromContact, newId,
} from "@tnec/core/store";
import { CONSENT_VERSION, PRIVACY, TERMS, WHATSAPP, fillLegal } from "@tnec/core/legal";
import { whatsappConfigured } from "@tnec/core/whatsapp";
import { deliverInBackground, EMAIL_SKIPPED } from "@tnec/core/delivery";
import { sha256Hex } from "@tnec/core/crypto";
import { SPEAKING_MAX_BYTES, speakingType, speechaceConfigured, gradeInBackground } from "@tnec/core/speaking";
import { isFinalStatus } from "@tnec/core/speaking-result";

const PUBLIC_BODY_LIMIT = 16 * 1024;
// The recording comes as the raw request body. The cap is 3 MB plus room for nothing else.
export const SPEAKING_ROUTE = /^\/api\/attempts\/[0-9a-f-]{36}\/speaking$/;
export const SPEAKING_BODY_LIMIT = SPEAKING_MAX_BYTES + 1024;
// A recording has to arrive within 2 hours of submitting the multiple choice answers.
const SPEAKING_UPLOAD_WINDOW = 2 * 3600;
const SPEAKING_MIN_BYTES = 1024;
const SKIP_REASONS = {
  mic: "Mikrofon tidak bisa dipakai di perangkat peserta, jadi peserta melewati bagian speaking.",
  unsupported: "Browser peserta tidak bisa merekam suara, jadi peserta melewati bagian speaking.",
};
const SUBMIT_GRACE_SECONDS = 15;
const ATTEMPT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHOICES = new Set(["A", "B", "C", "D"]);
const VIOLATION_TYPES = new Set(["fullscreen_exit", "tab_hidden", "window_blur", "copy_attempt", "shortcut_blocked"]);

export async function handlePublic(request, env, url = new URL(request.url)) {
  try {
    return await handleApi(request, env, url);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, ...error.extra }, error.status);
    console.error("public api", error);
    return json({ error: "Terjadi kesalahan pada server." }, 500);
  }
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  if (path === "/api/config" && request.method === "GET") return getConfig(env);

  const invite = path.match(/^\/api\/invites\/([A-Za-z0-9_-]{20,80})$/);
  if (invite && request.method === "GET") return getInvite(env, invite[1]);

  if (path === "/api/attempts" && request.method === "POST") return createAttempt(request, env);

  const match = path.match(/^\/api\/attempts\/([0-9a-f-]{36})\/(violation|submit|contact|speaking|speaking-skip)$/);
  if (match && request.method === "POST") {
    const [, attemptId, action] = match;
    if (!ATTEMPT_ID_RE.test(attemptId)) throw new HttpError(400, "ID percobaan tidak valid.");
    if (action === "violation") return logViolation(request, env, attemptId);
    if (action === "submit") return submitAttempt(request, env, attemptId);
    if (action === "speaking") return uploadSpeaking(request, env, attemptId);
    if (action === "speaking-skip") return skipSpeaking(request, env, attemptId);
    return saveContact(request, env, attemptId);
  }
  throw new HttpError(404, "Endpoint tidak ditemukan.");
}

/* ---------- Settings shared by config, invites, and new attempts ---------- */

function spanText(seconds) {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  if (!m) return `${s} detik`;
  return s ? `${m} menit ${s} detik` : `${m} menit`;
}

// Read fresh on every request, so a change in the dashboard applies to the next test right away.
async function liveTest(env, key) {
  const [test, questions] = await Promise.all([loadTest(env, key), loadQuestions(env, key, { activeOnly: true })]);
  const durationSeconds = test.timeMode === "per" ? questions.reduce((sum, q) => sum + q.seconds, 0) : test.totalSeconds;
  return { test, questions, durationSeconds };
}

// Speaking runs on the placement test only, and only with a question to answer.
const speakingOn = (test) => test.key === "placement" && test.speakingEnabled && Boolean(test.speakingPrompt);

function publicConfig({ test, questions, durationSeconds }) {
  const values = { total: questions.length, duration: spanText(durationSeconds), strikes: test.maxViolations, speakingSeconds: test.speakingSeconds };
  return {
    consentVersion: CONSENT_VERSION,
    open: test.open && questions.length > 0,
    timeMode: test.timeMode,
    durationSeconds,
    totalQuestions: questions.length,
    maxViolations: test.maxViolations,
    whatsapp: WHATSAPP,
    speaking: speakingOn(test)
      ? { enabled: true, seconds: test.speakingSeconds, minSeconds: test.speakingMinSeconds, prompt: test.speakingPrompt }
      : { enabled: false },
    terms: fillLegal(TERMS, values),
    privacy: fillLegal(PRIVACY, values),
  };
}

async function getConfig(env) {
  return json(publicConfig(await liveTest(env, "placement")));
}

async function findInvite(env, token) {
  const row = await env.DB.prepare(
    `SELECT i.*, s.name AS student_name FROM invites i JOIN students s ON s.id = i.student_id WHERE i.token_hash = ?`,
  ).bind(await sha256Hex(token)).first();
  if (!row) throw new HttpError(404, "Tautan tes ini tidak ditemukan. Minta tautan baru ke admin Titik Nol.");
  if (row.used_at) throw new HttpError(410, "Tautan ini sudah dipakai untuk mengirim jawaban. Hubungi admin Titik Nol kalau kamu perlu mengulang.");
  if (row.expires_at < nowSeconds()) throw new HttpError(410, "Tautan ini sudah kedaluwarsa. Minta tautan baru ke admin Titik Nol.");
  return row;
}

async function getInvite(env, token) {
  const invite = await findInvite(env, token);
  const live = await liveTest(env, invite.test_key);
  return json({
    ...publicConfig(live),
    invite: { test: invite.test_key, testName: TEST_NAMES[invite.test_key], firstName: String(invite.student_name).split(/\s+/)[0] },
  });
}

/* ---------- Attempts ---------- */

async function createAttempt(request, env) {
  const body = await readJson(request, PUBLIC_BODY_LIMIT);
  const consent = body?.consent;
  if (!consent || consent.accepted !== true) {
    throw new HttpError(400, "Kamu harus menyetujui syarat dan kebijakan privasi sebelum memulai tes.");
  }
  if (consent.version !== CONSENT_VERSION) {
    throw new HttpError(409, "Syarat dan kebijakan sudah berubah, jadi muat ulang halaman ini lalu setujui versi barunya.");
  }

  const invite = body.invite ? await findInvite(env, String(body.invite)) : null;
  const testKey = invite ? invite.test_key : "placement";
  const { test, questions, durationSeconds } = await liveTest(env, testKey);
  if (!test.open) throw new HttpError(423, "Tes ini sedang ditutup sementara. Silakan coba lagi nanti atau hubungi admin Titik Nol.");
  if (!questions.length) throw new HttpError(423, "Tes ini belum punya soal aktif. Hubungi admin Titik Nol.");

  const now = nowSeconds();
  const id = crypto.randomUUID();
  const perMode = test.timeMode === "per";
  const expiresAt = now + durationSeconds + (perMode ? PER_MODE_GRACE_SECONDS : 0);

  await env.DB.prepare(
    `INSERT INTO attempts
       (id, started_at, expires_at, total, consent_version, consent_at, user_agent, country,
        test_key, student_id, question_ids, time_mode, limit_seconds, max_violations, pass_score, invite_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, now, expiresAt, questions.length, CONSENT_VERSION, now,
    (request.headers.get("user-agent") || "").slice(0, 300), (request.headers.get("cf-ipcountry") || "").slice(0, 2) || null,
    testKey, invite ? invite.student_id : null, JSON.stringify(questions.map((q) => q.id)), test.timeMode,
    durationSeconds, test.maxViolations, testKey === "post" ? test.passScore ?? 70 : null, invite ? invite.id : null,
  ).run();

  return json({
    attemptId: id,
    secondsLeft: durationSeconds,
    total: questions.length,
    timeMode: test.timeMode,
    maxViolations: test.maxViolations,
    questions: questions.map((q) => ({
      id: q.id,
      skill: q.skill,
      prompt: q.prompt,
      ...(q.passage ? { passage: q.passage } : {}),
      options: q.options,
      ...(perMode ? { seconds: q.seconds } : {}),
    })),
  });
}

async function getAttempt(env, attemptId) {
  const attempt = await env.DB.prepare("SELECT * FROM attempts WHERE id = ?").bind(attemptId).first();
  if (!attempt) throw new HttpError(404, "Percobaan tes tidak ditemukan.");
  return attempt;
}

async function logViolation(request, env, attemptId) {
  const body = await readJson(request, PUBLIC_BODY_LIMIT);
  const type = String(body?.type || "");
  if (!VIOLATION_TYPES.has(type)) throw new HttpError(400, "Jenis pelanggaran tidak dikenal.");
  const entry = `${nowSeconds()}:${type};`.slice(0, 200);
  const result = await env.DB.prepare(
    `UPDATE attempts SET violations = violations + 1, violation_log = COALESCE(violation_log, '') || ?
      WHERE id = ? AND status = 'in_progress'`,
  ).bind(entry, attemptId).run();
  return json({ ok: true, counted: Boolean(result.meta?.changes) });
}

function inviteResult(attempt, score, total, passed) {
  const nilai = total ? Math.round((score / total) * 100) : 0;
  return {
    test: attempt.test_key,
    testName: TEST_NAMES[attempt.test_key],
    score,
    total,
    nilai,
    passed: passed === null || passed === undefined ? null : Boolean(passed),
    passScore: attempt.pass_score,
  };
}

async function submitAttempt(request, env, attemptId) {
  const body = await readJson(request, PUBLIC_BODY_LIMIT);
  const attempt = await getAttempt(env, attemptId);

  if (attempt.status === "submitted") {
    return json({
      ok: true,
      total: attempt.total,
      ...(attempt.invite_id ? { result: inviteResult(attempt, attempt.score, attempt.total, attempt.passed) } : {}),
    });
  }

  const now = nowSeconds();
  if (focusStrikes(attempt.violation_log) >= (attempt.max_violations || 3)) {
    throw new HttpError(409, "Percobaan ini sudah gagal karena batas pelanggaran tercapai, jadi jawabannya tidak bisa dikirim.");
  }
  if (now > attempt.expires_at + SUBMIT_GRACE_SECONDS) {
    throw new HttpError(409, "Waktu pengerjaan sudah habis, jadi jawaban tidak bisa dikirim. Mulai percobaan baru untuk mendapatkan hasil.");
  }

  const rawAnswers = body?.answers;
  if (!rawAnswers || typeof rawAnswers !== "object") throw new HttpError(400, "Jawaban tidak ditemukan.");

  const all = await loadQuestions(env, attempt.test_key || "placement");
  const byId = new Map(all.map((q) => [q.id, q]));
  const ids = attempt.question_ids ? JSON.parse(attempt.question_ids) : all.filter((q) => q.status === "aktif").map((q) => q.id);
  const list = ids.map((id) => byId.get(id)).filter(Boolean);

  let score = 0;
  const statements = list.map((question) => {
    const choice = normalizeChoice(rawAnswers[question.id]);
    const isCorrect = choice === question.answer ? 1 : 0;
    score += isCorrect;
    return env.DB.prepare(
      `INSERT INTO answers (attempt_id, question_id, choice, is_correct, answer_key) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (attempt_id, question_id) DO UPDATE SET choice = EXCLUDED.choice, is_correct = EXCLUDED.is_correct, answer_key = EXCLUDED.answer_key`,
    ).bind(attemptId, question.id, choice, isCorrect, question.answer);
  });

  const total = list.length;
  let levelKey = null;
  let passed = null;
  if ((attempt.test_key || "placement") === "placement") {
    levelKey = levelFor(await loadLevels(env), score).key;
  } else if (attempt.test_key === "post") {
    passed = (total ? Math.round((score / total) * 100) : 0) >= (attempt.pass_score ?? 70) ? 1 : 0;
  }
  const timedOut = now > attempt.expires_at ? 1 : 0;

  statements.push(env.DB.prepare(
    `UPDATE attempts SET status = 'submitted', submitted_at = ?, score = ?, total = ?, level_key = ?, timed_out = ?,
            duration_seconds = ?, passed = ? WHERE id = ?`,
  ).bind(now, score, total, levelKey, timedOut, Math.max(0, now - attempt.started_at), passed, attemptId));

  if (attempt.invite_id) {
    const nilai = total ? Math.round((score / total) * 100) : 0;
    statements.push(env.DB.prepare("UPDATE invites SET used_at = ?, attempt_id = ? WHERE id = ?").bind(now, attemptId, attempt.invite_id));
    statements.push(addActivity(
      env, attempt.student_id, "test",
      attempt.test_key === "post"
        ? `Mengerjakan post-test dengan nilai ${nilai} dan ${passed ? "dinyatakan lulus" : "belum mencapai nilai kelulusan"}.`
        : `Mengerjakan pre-test dengan nilai ${nilai}.`,
      null, { attemptId }, now,
    ));
  }

  await env.DB.batch(statements);

  // Placement scores stay hidden until the contact step. Invite attempts already
  // belong to a known student, so their result is returned right away.
  return json({
    ok: true,
    total,
    timedOut: Boolean(timedOut),
    ...(attempt.invite_id ? { result: inviteResult(attempt, score, total, passed) } : {}),
  });
}

async function saveContact(request, env, attemptId) {
  const body = await readJson(request, PUBLIC_BODY_LIMIT);
  const name = String(body?.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const email = String(body?.email || "").trim().toLowerCase().slice(0, 160);
  const whatsapp = normalizeWhatsapp(body?.whatsapp);

  if (name.length < 2) throw new HttpError(400, "Nama harus terdiri dari minimal 2 karakter.");
  if (!isEmail(email)) throw new HttpError(400, "Alamat email belum benar. Periksa kembali penulisannya.");
  if (!whatsapp) throw new HttpError(400, "Nomor WhatsApp belum benar. Contoh penulisan yang benar: 08123456789.");

  const attempt = await getAttempt(env, attemptId);
  if ((attempt.test_key || "placement") !== "placement") throw new HttpError(409, "Tes ini tidak memakai langkah pengisian data.");
  if (attempt.status !== "submitted") throw new HttpError(409, "Kirim jawaban tes kamu dulu sebelum mengisi data.");

  const levels = await loadLevels(env);
  const level = levels.find((l) => l.key === attempt.level_key) || levelFor(levels, attempt.score ?? 0);
  const score = attempt.score ?? 0;
  const now = nowSeconds();

  // Save the contact and mark the result email and WhatsApp as waiting, then answer at once.
  // The sends run in the background (packages/core/src/delivery.js). A channel that already
  // delivered for this attempt keeps its status, so a repeated contact step never sends it twice;
  // the check sits in SQL so a send finishing at the same moment cannot be overwritten.
  const student = attempt.student_id ? { id: attempt.student_id, created: false } : await upsertStudentFromContact(env, { name, email, whatsapp });
  const statements = [
    env.DB.prepare(`UPDATE attempts SET name = ?, email = ?, whatsapp = ?, student_id = ?,
        email_status = CASE WHEN email_sent_at IS NOT NULL THEN email_status ELSE ? END,
        wa_status = CASE WHEN wa_sent_at IS NOT NULL THEN wa_status ELSE ? END
      WHERE id = ? RETURNING email_status, wa_status`)
      .bind(name, email, whatsapp, student.id, env.SEND_EMAIL ? "pending" : EMAIL_SKIPPED, whatsappConfigured(env) ? "pending" : "skipped", attemptId),
  ];
  if (!attempt.student_id) {
    statements.push(addActivity(env, student.id, "test", `Mengerjakan placement test dengan skor ${score} dari ${attempt.total} dan masuk level ${level.label}.`, null, { attemptId }, now));
  }
  const [saved] = await env.DB.batch(statements);
  const channels = saved.results[0] || {};

  // Read the recording only after the channels are saved as waiting. Grading saves its result
  // before it starts the delivery, so whichever of the two finishes last sends the result.
  const speaking = await env.DB.prepare("UPDATE speaking_submissions SET student_id = ? WHERE attempt_id = ? RETURNING status")
    .bind(student.id, attemptId).first();
  if (!speaking || isFinalStatus(speaking.status)) deliverInBackground(env, attemptId);
  const delivery = { email: channelState(channels.email_status), whatsapp: channelState(channels.wa_status) };

  // With a recording, the full result goes out by email and WhatsApp after it is scored, and the
  // page only says so. A student who skipped speaking sees the result right away, as before.
  if (speaking && speaking.status !== "skipped") {
    return json({ delivery, result: null, speaking: { status: speaking.status } });
  }
  return json({
    delivery,
    result: {
      score: attempt.score ?? 0,
      total: attempt.total,
      level: publicLevel(level),
      timedOut: Boolean(attempt.timed_out),
      violations: attempt.violations,
    },
  });
}

/* ---------- Speaking ---------- */

async function speakingAttempt(env, attemptId) {
  const attempt = await getAttempt(env, attemptId);
  if ((attempt.test_key || "placement") !== "placement") throw new HttpError(409, "Tes ini tidak memakai bagian speaking.");
  if (attempt.status !== "submitted") throw new HttpError(409, "Kirim jawaban pilihan ganda dulu sebelum mengirim rekaman.");
  return attempt;
}

/**
 * Stores the one recording of an attempt and starts scoring it in the background. The body is the
 * raw audio. While a stored recording has not been picked up for scoring, a repeated upload
 * replaces it, so a retry after a dropped connection is safe; after that it is refused.
 */
async function uploadSpeaking(request, env, attemptId) {
  const mime = speakingType(request.headers.get("content-type"));
  if (!mime) throw new HttpError(415, "Format rekaman ini tidak didukung. Rekam ulang dengan Chrome, Edge, Firefox, atau Safari versi terbaru.");
  const audio = await request.bytes();
  if (audio.length > SPEAKING_MAX_BYTES) throw new HttpError(413, "Rekaman terlalu besar, maksimal 3 MB. Rekam ulang dengan jawaban yang lebih singkat.");
  if (audio.length < SPEAKING_MIN_BYTES) throw new HttpError(400, "Rekaman kosong. Rekam ulang jawaban kamu.");

  const attempt = await speakingAttempt(env, attemptId);
  const now = nowSeconds();
  if (now - (attempt.submitted_at || 0) > SPEAKING_UPLOAD_WINDOW) {
    throw new HttpError(410, "Waktu untuk mengirim rekaman sudah lewat. Lanjutkan dengan mengisi data kamu.", { code: "speaking_closed" });
  }
  const test = await loadTest(env, "placement");
  if (!speakingOn(test)) throw new HttpError(409, "Bagian speaking sedang tidak dipakai. Lanjutkan dengan mengisi data kamu.", { code: "speaking_off" });
  const declared = Number(request.headers.get("x-duration"));
  const duration = Number.isFinite(declared) && declared > 0 ? Math.min(120, Math.max(1, Math.round(declared))) : null;
  if (duration !== null && duration < test.speakingMinSeconds - 1) {
    throw new HttpError(400, `Rekaman kamu terlalu pendek. Jawab minimal ${test.speakingMinSeconds} detik, lalu rekam ulang.`, { code: "speaking_short" });
  }

  // Without a Speechace key on this server the recording goes straight to the team's queue.
  const ready = speechaceConfigured(env);
  const status = ready ? "pending" : "failed";
  const error = ready ? null : "Kunci Speechace belum diisi di server, jadi rekaman ini menunggu dinilai tim.";
  const saved = await env.DB.prepare(
    `INSERT INTO speaking_submissions (id, attempt_id, student_id, prompt, audio, audio_mime, audio_bytes, duration_seconds, status, needs_review, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (attempt_id) DO UPDATE SET prompt = EXCLUDED.prompt, audio = EXCLUDED.audio, audio_mime = EXCLUDED.audio_mime,
         audio_bytes = EXCLUDED.audio_bytes, duration_seconds = EXCLUDED.duration_seconds, status = EXCLUDED.status,
         needs_review = EXCLUDED.needs_review, error = EXCLUDED.error, created_at = EXCLUDED.created_at
       WHERE speaking_submissions.status = 'pending' AND speaking_submissions.tries = 0
         AND (speaking_submissions.lease_until IS NULL OR speaking_submissions.lease_until < ?)
     RETURNING id, status`,
  ).bind(newId("spk"), attemptId, attempt.student_id, test.speakingPrompt, audio, mime, audio.length, duration, status, ready ? 0 : 1, error, now, now).first();
  if (!saved) throw new HttpError(409, "Rekaman untuk tes ini sudah terkirim.", { code: "speaking_done" });
  if (saved.status === "pending") gradeInBackground(env, saved.id);
  return json({ ok: true, status: saved.status === "failed" ? "pending" : saved.status });
}

/** Records that the student could not record, so the result goes out without the speaking part. */
async function skipSpeaking(request, env, attemptId) {
  const body = await readJson(request, PUBLIC_BODY_LIMIT);
  const reason = SKIP_REASONS[body?.reason] ? body.reason : "mic";
  const attempt = await speakingAttempt(env, attemptId);
  const test = await loadTest(env, "placement");
  const now = nowSeconds();
  await env.DB.prepare(
    `INSERT INTO speaking_submissions (id, attempt_id, student_id, prompt, status, error, scores, graded_at, created_at)
     VALUES (?, ?, ?, ?, 'skipped', ?, ?, ?, ?) ON CONFLICT (attempt_id) DO NOTHING`,
  ).bind(newId("spk"), attemptId, attempt.student_id, test.speakingPrompt || "", SKIP_REASONS[reason], JSON.stringify({ source: "student", reason }), now, now).run();
  return json({ ok: true });
}

// What the result page says about each channel: already delivered, on its way, or not used.
function channelState(status) {
  if (status === "sent") return "sent";
  if (status === "pending") return "sending";
  return "off";
}

function normalizeChoice(value) {
  const choice = typeof value === "string" ? value.trim().toUpperCase() : "";
  return CHOICES.has(choice) ? choice : null;
}

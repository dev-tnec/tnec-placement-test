// Public test API for the web app: config, invites, attempts, violations, submit, speaking, and
// contact. The answer key never leaves the server, and no route ever sends a recording back.

import { HttpError, json, readJson, nowSeconds, normalizeWhatsapp, isEmail } from "@tnec/core/http";
import {
  TEST_NAMES, PER_MODE_GRACE_SECONDS, loadTest, loadQuestions, loadSections, loadLevels, levelFor, publicLevel, programCards,
  addActivity, upsertStudentFromContact, newId,
} from "@tnec/core/store";
import { normalizeTextAnswer, bandForRaw, overallBand } from "@tnec/core/bands";
import { gradeWritingTask, writingBand } from "@tnec/core/writing";
import { CONSENT_VERSION, PRIVACY, TERMS, WHATSAPP, fillLegal } from "@tnec/core/legal";
import { whatsappConfigured } from "@tnec/core/whatsapp";
import { deliverInBackground, runInBackground, EMAIL_SKIPPED } from "@tnec/core/delivery";
import { sha256Hex, randomToken } from "@tnec/core/crypto";
import { SPEAKING_MAX_BYTES, speakingType, speechaceConfigured, gradeInBackground, purgeExpiredAttempts } from "@tnec/core/speaking";
import { isFinalStatus, speakingFacts, aggregateSpeakingFacts } from "@tnec/core/speaking-result";
import { mockupSpeakingPlan, mockupSpeakingQuestion, MOCKUP_SPEAKING_TOTAL } from "@tnec/core/speaking-mockup";
import { gradeAnswer as gradeMockupAnswer } from "@tnec/core/speaking-mockup-worker";
import { formatWib } from "@tnec/core/mockup-bulk";
import { branchKey } from "@tnec/core/branches";
import { pickSpeakingQuestions } from "@tnec/core/speaking-bank";

const PUBLIC_BODY_LIMIT = 16 * 1024;
// Two writing essays need more room than the other JSON bodies.
const SUBMIT_BODY_LIMIT = 64 * 1024;
// The recording comes as the raw request body. The cap is 3 MB plus room for nothing else.
export const SPEAKING_ROUTE = /^\/api\/attempts\/[0-9a-f-]{36}\/(speaking|speaking-answer)$/;
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
const CHOICES = new Set(["A", "B", "C", "D", "E", "F"]);
const VIOLATION_TYPES = new Set(["fullscreen_exit", "tab_hidden", "window_blur", "copy_attempt", "shortcut_blocked"]);
// The violation log keeps at most this many entries; each entry is about 20 bytes, so the cap
// also bounds the RIGHT() slice in bytes well above the longest single 200-char entry.
const VIOLATION_LOG_MAX = 50;

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

  const result = path.match(/^\/api\/results\/([A-Za-z0-9_-]{20,80})$/);
  if (result && request.method === "GET") return getResultLink(env, result[1]);

  if (path === "/api/attempts" && request.method === "POST") return createAttempt(request, env);

  const attemptResult = path.match(/^\/api\/attempts\/([0-9a-f-]{36})\/result$/);
  if (attemptResult && request.method === "GET") return getAttemptResult(env, attemptResult[1]);

  const match = path.match(/^\/api\/attempts\/([0-9a-f-]{36})\/(violation|submit|contact|speaking|speaking-skip|audio-played|speaking-answer)$/);
  if (match && request.method === "POST") {
    const [, attemptId, action] = match;
    if (!ATTEMPT_ID_RE.test(attemptId)) throw new HttpError(400, "ID percobaan tidak valid.");
    if (action === "violation") return logViolation(request, env, attemptId);
    if (action === "submit") return submitAttempt(request, env, attemptId);
    if (action === "audio-played") return markAudioPlayed(request, env, attemptId);
    if (action === "speaking-answer") return uploadMockupSpeaking(request, env, attemptId, url);
    if (action === "speaking") return uploadSpeaking(request, env, attemptId, url);
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
async function liveTest(env, key, packageId = null) {
  const [test, questions, sections] = await Promise.all([loadTest(env, key), loadQuestions(env, key, { activeOnly: true, packageId }), loadSections(env, key, { packageId })]);
  const durationSeconds = test.timeMode === "per" ? questions.reduce((sum, q) => sum + q.seconds, 0) : test.totalSeconds;
  return { test, questions, sections, durationSeconds };
}

/* The mockup package for an attempt: the invite's package when set, otherwise a random active
   package that still has questions. */
async function resolvePackage(env, testKey, requestedId) {
  if (testKey !== "ielts-mockup") return null;
  const requested = String(requestedId || "").trim();
  const sql = `SELECT p.id FROM question_packages p
               WHERE p.test_key = ? AND p.is_active = 1
                 AND EXISTS (SELECT 1 FROM questions q WHERE q.package_id = p.id AND q.status = 'aktif')
                 ${requested ? "AND p.id = ?" : ""}
               ORDER BY RANDOM() LIMIT 1`;
  const row = requested ? await env.DB.prepare(sql).bind(testKey, requested).first() : await env.DB.prepare(sql).bind(testKey).first();
  return row ? row.id : null;
}

// Speaking runs on the placement test only, and only when the bank has a question to ask.
const speakingOn = (test) => test.key === "placement" && test.speakingEnabled;

/** The placement speaking bank, position order. */
async function loadSpeakingBank(env) {
  const { results } = await env.DB.prepare("SELECT id, position, prompt, status FROM speaking_questions ORDER BY position, id").all();
  return results;
}

// The IELTS mockup uses four section timers: Listening, Reading, Writing, and the speaking
// interview. The values live on the test row so the dashboard can change them.
const SECTION_DEFAULTS = { Listening: 1920, Reading: 3600, Writing: 3600, Speaking: 900 };
function sectionPlan(test) {
  if (test.timeMode !== "sections") return null;
  return [
    { skill: "Listening", seconds: Number(test.listeningSeconds) || SECTION_DEFAULTS.Listening },
    { skill: "Reading", seconds: Number(test.readingSeconds) || SECTION_DEFAULTS.Reading },
    { skill: "Writing", seconds: Number(test.writingSeconds) || SECTION_DEFAULTS.Writing },
    { skill: "Speaking", seconds: Number(test.speakingBlockSeconds) || SECTION_DEFAULTS.Speaking },
  ];
}

function publicConfig({ test, questions, durationSeconds }, speakingBank = []) {
  const values = { total: questions.length, duration: spanText(durationSeconds), strikes: test.maxViolations, speakingSeconds: test.speakingSeconds };
  return {
    consentVersion: CONSENT_VERSION,
    open: test.open && questions.length > 0,
    timeMode: test.timeMode,
    durationSeconds,
    totalQuestions: questions.length,
    maxViolations: test.maxViolations,
    whatsapp: WHATSAPP,
    sectionPlan: sectionPlan(test),
    // The questions themselves travel per attempt: the runner gets the picked set when the test
    // starts, so a mid-test change to the bank never changes what a student already saw.
    speaking: speakingOn(test) && speakingBank.some((q) => q.status === "aktif")
      ? { enabled: true, seconds: test.speakingSeconds, minSeconds: test.speakingMinSeconds }
      : { enabled: false },
    terms: fillLegal(TERMS, values),
    privacy: fillLegal(PRIVACY, values),
  };
}

async function getConfig(env) {
  return json(publicConfig(await liveTest(env, "placement"), await loadSpeakingBank(env)));
}

async function findInvite(env, token) {
  const row = await env.DB.prepare(
    `SELECT i.*, s.name AS student_name FROM invites i JOIN students s ON s.id = i.student_id WHERE i.token_hash = ?`,
  ).bind(await sha256Hex(token)).first();
  if (!row) throw new HttpError(404, "Tautan tes ini tidak ditemukan. Minta tautan baru ke admin Titik Nol.");
  if (row.used_at) throw new HttpError(410, "Kode undangan ini sudah pernah dipakai untuk mengirim jawaban, jadi tautannya tidak bisa dibuka lagi. Hubungi admin Titik Nol kalau kamu perlu mengulang.");
  if (row.code_tries >= 3) throw new HttpError(423, "Kode sudah salah tiga kali, jadi undangan ini terkunci. Minta admin membuatkan undangan baru.");
  if (row.expires_at < nowSeconds()) throw new HttpError(410, "Tautan ini sudah kedaluwarsa. Minta tautan baru ke admin Titik Nol.");
  if (row.opens_at && row.opens_at > nowSeconds()) {
    throw new HttpError(423, `Tes ini baru bisa dibuka pada ${formatWib(row.opens_at)}. Buka kembali tautan ini lagi nanti.`);
  }
  return row;
}

async function getInvite(env, token) {
  const invite = await findInvite(env, token);
  const pkg = invite.package_id ? await env.DB.prepare("SELECT name FROM question_packages WHERE id = ?").bind(invite.package_id).first() : null;
  const live = await liveTest(env, invite.test_key, invite.package_id || null);
  return json({
    ...publicConfig(live, await loadSpeakingBank(env)),
    invite: {
      test: invite.test_key,
      testName: TEST_NAMES[invite.test_key],
      firstName: String(invite.student_name).split(/\s+/)[0],
      needsCode: Boolean(invite.code),
      packageName: pkg ? pkg.name : null,
    },
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
  if (invite?.code) {
    const code = String(body.inviteCode || "").replace(/\s+/g, "").toLowerCase();
    if (!code) throw new HttpError(400, "Masukkan kode 6 karakter dari pesan WhatsApp kamu.");
    if (code !== String(invite.code).toLowerCase()) {
      const row = await env.DB.prepare("UPDATE invites SET code_tries = code_tries + 1 WHERE id = ? RETURNING code_tries").bind(invite.id).first();
      const left = Math.max(0, 3 - (row?.code_tries ?? 3));
      if (left <= 0) throw new HttpError(423, "Kode sudah salah tiga kali, jadi undangan ini terkunci. Minta admin membuatkan undangan baru.");
      throw new HttpError(403, `Kode belum benar. Sisa ${left} percobaan lagi sebelum undangan terkunci.`, { field: "inviteCode" });
    }
  }
  const packageId = await resolvePackage(env, testKey, invite?.package_id);
  if (testKey === "ielts-mockup" && !packageId) throw new HttpError(423, "Paket soal untuk tes ini belum siap. Hubungi admin Titik Nol.");
  const { test, questions, sections, durationSeconds } = await liveTest(env, testKey, packageId);
  if (!test.open) throw new HttpError(423, "Tes ini sedang ditutup sementara. Silakan coba lagi nanti atau hubungi admin Titik Nol.");
  if (!questions.length) throw new HttpError(423, "Tes ini belum punya soal aktif. Hubungi admin Titik Nol.");

  // The placement speaking questions are picked now and stored on the attempt, so grading and
  // the team always see the same questions the student saw, whatever happens to the bank later.
  const speakingQuestions = testKey === "placement" && test.speakingEnabled
    ? pickSpeakingQuestions(await loadSpeakingBank(env), { count: test.speakingCount, randomize: test.speakingRandomize })
    : [];

  const now = nowSeconds();
  const id = crypto.randomUUID();
  const perMode = test.timeMode === "per";
  const expiresAt = now + durationSeconds + (perMode ? PER_MODE_GRACE_SECONDS : 0);

  await env.DB.prepare(
    `INSERT INTO attempts
       (id, started_at, expires_at, total, consent_version, consent_at, user_agent, country,
        test_key, student_id, question_ids, time_mode, limit_seconds, max_violations, pass_score, invite_id, package_id, speaking_questions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, now, expiresAt, questions.length, CONSENT_VERSION, now,
    (request.headers.get("user-agent") || "").slice(0, 300), (request.headers.get("cf-ipcountry") || "").slice(0, 2) || null,
    testKey, invite ? invite.student_id : null, JSON.stringify(questions.map((q) => q.id)), test.timeMode,
    durationSeconds, test.maxViolations, testKey === "post" ? test.passScore ?? 70 : null, invite ? invite.id : null, packageId,
    speakingQuestions.length ? JSON.stringify(speakingQuestions.map((q) => ({ position: q.position, prompt: q.prompt }))) : null,
  ).run();

  // Somebody is testing again, so attempts whose time ran out long ago are cleaned up now.
  runInBackground(() => purgeExpiredAttempts(env));

  return json({
    attemptId: id,
    secondsLeft: durationSeconds,
    total: questions.length,
    timeMode: test.timeMode,
    maxViolations: test.maxViolations,
    autoSubmit: test.autoSubmit,
    sectionPlan: sectionPlan(test),
    mockupSpeaking: test.key === "ielts-mockup" && test.speakingEnabled ? mockupSpeakingPlan() : null,
    speakingQuestions: speakingQuestions.map((q) => ({ position: q.position, prompt: q.prompt })),
    sections: sections.map((s) => ({ id: s.id, title: s.title, skill: s.skill, part: s.part, passage: s.passage, audio: s.audio, image: s.image })),
    questions: questions.map((q) => ({
      id: q.id,
      skill: q.skill,
      prompt: q.prompt,
      type: q.type,
      ...(q.part ? { part: q.part } : {}),
      ...(q.sectionId ? { sectionId: q.sectionId } : {}),
      ...(q.type === "longtext" ? { minWords: q.minWords || 150 } : {}),
      ...(q.passage ? { passage: q.passage } : {}),
      ...(q.type === "choice" ? { options: q.options } : {}),
      ...(perMode ? { seconds: q.seconds } : {}),
    })),
  });
}

/* The listening audio of a section plays once per attempt. A second request is refused, so a
   reload never grants another play. */
async function markAudioPlayed(request, env, attemptId) {
  const body = await readJson(request, PUBLIC_BODY_LIMIT);
  const sectionId = String(body?.sectionId || "");
  const attempt = await getAttempt(env, attemptId);
  const section = await env.DB.prepare("SELECT id, audio_url FROM question_sections WHERE id = ? AND test_key = ?")
    .bind(sectionId, attempt.test_key || "placement").first();
  if (!section || !section.audio_url) throw new HttpError(404, "Bagian audio tidak ditemukan.");
  const now = nowSeconds();
  const inserted = await env.DB.prepare(
    "INSERT INTO attempt_audio_plays (attempt_id, section_id, played_at) VALUES (?, ?, ?) ON CONFLICT (attempt_id, section_id) DO NOTHING RETURNING played_at",
  ).bind(attemptId, sectionId, now).first();
  if (!inserted) throw new HttpError(409, "Audio bagian ini sudah pernah diputar, dan aturan mock IELTS hanya mengizinkan satu kali.");
  await env.DB.prepare("UPDATE attempts SET audio_played_at = COALESCE(audio_played_at, ?) WHERE id = ?").bind(now, attemptId).run();
  return json({ ok: true });
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
  // The limit no longer ends anything on the server: the runner pauses the test behind a
  // continue-or-leave dialog, so the row must survive for the student to continue.
  // The log keeps only the last VIOLATION_LOG_MAX entries: the anti-cheat feature needs at
  // most max_violations strikes, and an uncapped append would let a scripted client bloat the
  // TEXT column with a full-row rewrite per request.
  const row = await env.DB.prepare(
    `UPDATE attempts SET violations = violations + 1, violation_log = RIGHT(COALESCE(violation_log, '') || ?, ?)
      WHERE id = ? AND status = 'in_progress' RETURNING violation_log, max_violations`,
  ).bind(entry, VIOLATION_LOG_MAX * 32, attemptId).first();
  return json({ ok: true, counted: Boolean(row) });
}

/** A stable public reference for the report header, for example TN-IELTS-MOCKUP-2026-1A2B. */
function resultCode(attempt) {
  const year = new Date(((attempt.submitted_at || attempt.started_at) || nowSeconds()) * 1000).getUTCFullYear();
  const short = String(attempt.id || "").replace(/-/g, "").slice(0, 4).toUpperCase() || "0000";
  return `TN-${String(attempt.test_key || "placement").toUpperCase()}-${year}-${short}`;
}

/** The name and package behind an invite attempt, for the report header. */
async function inviteMeta(env, attempt) {
  const invite = attempt.invite_id
    ? await env.DB.prepare("SELECT s.name FROM invites i JOIN students s ON s.id = i.student_id WHERE i.id = ?").bind(attempt.invite_id).first()
    : null;
  const pkg = attempt.package_id
    ? await env.DB.prepare("SELECT name FROM question_packages WHERE id = ?").bind(attempt.package_id).first()
    : null;
  return { firstName: String(invite?.name || "").split(/\s+/)[0], packageName: pkg?.name || null };
}

function inviteResult(attempt, score, total, passed, bands, writing = null, speaking = null, meta = {}) {
  const base = {
    test: attempt.test_key,
    testName: TEST_NAMES[attempt.test_key],
    date: attempt.submitted_at || attempt.started_at || null,
    code: resultCode(attempt),
    whatsapp: WHATSAPP,
    ...meta,
  };
  if (bands) {
    return {
      ...base,
      overall: bands.overall,
      skills: bands.skills,
      ...(writing ? { writingStatus: writing.status || null, writingError: writing.error || "" } : {}),
      ...(speaking ? { speakingStatus: speaking.status || null, speakingError: speaking.error || "" } : {}),
      disclaimer: "Hasil ini adalah perkiraan dan bukan skor resmi IELTS. Skor resmi hanya diterbitkan oleh British Council atau IDP.",
    };
  }
  const nilai = total ? Math.round((score / total) * 100) : 0;
  return {
    ...base,
    score,
    total,
    nilai,
    passed: passed === null || passed === undefined ? null : Boolean(passed),
    passScore: attempt.pass_score,
  };
}

/* The mockup bands: raw per skill from the graded answers, band per skill from band_scales, and the
   overall band as the mean rounded to the nearest half. Stored on the attempt so a later scale edit
   never changes a finished result. */
/* The mockup bands: raw per skill, band per skill from band_scales, and the overall band as the
   mean rounded to the nearest half. Stored on the attempt so editing a scale never changes a
   finished result. */
async function computeBands(env, correctBySkill, skillTotals = new Map()) {
  const skills = [];
  for (const [skill, correct] of correctBySkill) {
    const { results } = await env.DB.prepare(
      "SELECT raw, band FROM band_scales WHERE test_key = 'ielts-mockup' AND skill = ?",
    ).bind(skill).all();
    const raw = correct;
    const band = results.length ? bandForRaw(results.map((r) => ({ raw: r.raw, band: Number(r.band) })), raw) : 0;
    skills.push({ skill, raw, total: skillTotals.get(skill) || 0, band });
  }
  return { skills, overall: overallBand(skills.map((s) => s.band)) };
}

/** One answer against one question: letters for choice, loose text matching for text questions. */
function gradeAnswer(question, raw) {
  if (question.type === "text") {
    const value = normalizeTextAnswer(raw);
    const accepted = (question.accepted || []).map(normalizeTextAnswer);
    const hit = accepted.find((a) => a !== "" && a === value);
    return { correct: Boolean(hit), key: hit || (question.accepted || [])[0] || "" };
  }
  const choice = normalizeChoice(raw);
  return { correct: choice === question.answer, key: question.answer };
}

async function submitAttempt(request, env, attemptId) {
  const body = await readJson(request, SUBMIT_BODY_LIMIT);
  const attempt = await getAttempt(env, attemptId);

  if (attempt.status === "submitted") {
    const stored = attempt.bands ? JSON.parse(attempt.bands) : null;
    const writing = attempt.test_key === "ielts-mockup" ? { status: attempt.writing_status || null, error: attempt.writing_error || "" } : null;
    const speaking = attempt.test_key === "ielts-mockup" ? { status: attempt.speaking_status || null, error: attempt.speaking_error || "" } : null;
    return json({
      ok: true,
      total: attempt.total,
      ...(attempt.invite_id ? { result: inviteResult(attempt, attempt.score, attempt.total, attempt.passed, stored, writing, speaking) } : {}),
    });
  }

  const now = nowSeconds();
  if (now > attempt.expires_at + SUBMIT_GRACE_SECONDS) {
    throw new HttpError(409, "Waktu pengerjaan sudah habis, jadi jawaban tidak bisa dikirim. Mulai percobaan baru untuk mendapatkan hasil.");
  }

  const rawAnswers = body?.answers;
  if (!rawAnswers || typeof rawAnswers !== "object") throw new HttpError(400, "Jawaban tidak ditemukan.");

  const all = await loadQuestions(env, attempt.test_key || "placement", { packageId: attempt.package_id || undefined });
  const byId = new Map(all.map((q) => [q.id, q]));
  const ids = attempt.question_ids ? JSON.parse(attempt.question_ids) : all.filter((q) => q.status === "aktif").map((q) => q.id);
  const list = ids.map((id) => byId.get(id)).filter(Boolean);

  let score = 0;
  const correctBySkill = new Map();
  const skillTotals = new Map();
  const statements = [];
  for (const question of list) {
    const raw = rawAnswers[question.id];
    if (question.type === "longtext") {
      // The essay is stored as the answer; it has no key and never counts in the raw score.
      statements.push(env.DB.prepare(
        `INSERT INTO answers (attempt_id, question_id, choice, is_correct, answer_key) VALUES (?, ?, ?, 0, '')
         ON CONFLICT (attempt_id, question_id) DO UPDATE SET choice = EXCLUDED.choice, is_correct = 0, answer_key = ''`,
      ).bind(attemptId, question.id, String(raw ?? "").slice(0, 20000)));
      continue;
    }
    const graded = gradeAnswer(question, raw);
    const isCorrect = graded.correct ? 1 : 0;
    score += isCorrect;
    correctBySkill.set(question.skill, (correctBySkill.get(question.skill) || 0) + isCorrect);
    skillTotals.set(question.skill, (skillTotals.get(question.skill) || 0) + 1);
    const stored = question.type === "text" ? String(raw ?? "").slice(0, 300) : normalizeChoice(raw);
    statements.push(env.DB.prepare(
      `INSERT INTO answers (attempt_id, question_id, choice, is_correct, answer_key) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (attempt_id, question_id) DO UPDATE SET choice = EXCLUDED.choice, is_correct = EXCLUDED.is_correct, answer_key = EXCLUDED.answer_key`,
    ).bind(attemptId, question.id, stored, isCorrect, graded.key));
  }

  const total = list.length;
  const testKey = attempt.test_key || "placement";
  let levelKey = null;
  let passed = null;
  let bands = null;
  let writingStatus = null;
  let writingError = null;
  if (testKey === "placement") {
    levelKey = levelFor(await loadLevels(env), score).key;
  } else if (testKey === "post") {
    passed = (total ? Math.round((score / total) * 100) : 0) >= (attempt.pass_score ?? 70) ? 1 : 0;
  } else if (testKey === "ielts-mockup") {
    bands = await computeBands(env, correctBySkill, skillTotals);
    const essays = list.filter((q) => q.type === "longtext");
    if (essays.length) {
      try {
        const tasks = await Promise.all(essays.map((q) => gradeWritingTask(env, {
          taskNumber: q.part || 1,
          prompt: q.prompt,
          text: String(rawAnswers[q.id] ?? "").slice(0, 20000),
          minWords: q.minWords || 150,
        })));
        const writing = { skill: "Writing", band: writingBand(tasks), tasks };
        bands = { skills: [...bands.skills, writing], overall: overallBand([...bands.skills.map((s) => s.band), writing.band]) };
        writingStatus = "graded";
      } catch (error) {
        writingStatus = "failed";
        writingError = String(error?.message || "Penilaian AI writing gagal.").slice(0, 500);
      }
    }
  }

  let speakingStatus = attempt.speaking_status || null;
  let speakingError = attempt.speaking_error || "";
  let speakingPending = false;
  let speakingAnswered = 0;
  if (testKey === "ielts-mockup") {
    const test = await loadTest(env, "ielts-mockup");
    if (test.speakingEnabled) {
      const { results: speakingRows } = await env.DB.prepare("SELECT status, error FROM speaking_answers WHERE attempt_id = ?").bind(attemptId).all();
      speakingAnswered = speakingRows.length;
      if (speakingStatus === "skipped") {
        // The student skipped speaking after a microphone failure.
      } else if (!speakingAnswered && now <= attempt.expires_at) {
        throw new HttpError(409, "Selesaikan bagian speaking dulu sebelum mengirim jawaban.");
      } else if (speakingRows.some((r) => r.status === "pending" || r.status === "grading")) {
        speakingPending = true;
      } else if (speakingRows.some((r) => r.status === "failed")) {
        speakingStatus = "failed";
        speakingError = speakingRows.find((r) => r.status === "failed")?.error || "Penilaian speaking gagal.";
      }
    }
    // The worker may have added Speaking while the essays were being scored.
    if (bands) {
      const stored = await env.DB.prepare("SELECT bands FROM attempts WHERE id = ?").bind(attemptId).first();
      const storedSpeaking = stored?.bands ? (JSON.parse(stored.bands).skills || []).find((s) => s.skill === "Speaking") : null;
      if (storedSpeaking && !bands.skills.some((s) => s.skill === "Speaking")) {
        bands = { skills: [...bands.skills, storedSpeaking], overall: overallBand([...bands.skills.map((s) => s.band), storedSpeaking.band]) };
      }
    }
  }
  const timedOut = now > attempt.expires_at ? 1 : 0;

  statements.push(env.DB.prepare(
    `UPDATE attempts SET status = 'submitted', submitted_at = ?, score = ?, total = ?, level_key = ?, timed_out = ?,
            duration_seconds = ?, passed = ?, bands = ?, writing_status = ?, writing_error = ? WHERE id = ?`,
  ).bind(now, score, total, levelKey, timedOut, Math.max(0, now - attempt.started_at), passed, bands ? JSON.stringify(bands) : attempt.bands, writingStatus, writingError, attemptId));

  if (attempt.invite_id) {
    const nilai = total ? Math.round((score / total) * 100) : 0;
    statements.push(env.DB.prepare("UPDATE invites SET used_at = ?, attempt_id = ? WHERE id = ?").bind(now, attemptId, attempt.invite_id));
    statements.push(addActivity(
      env, attempt.student_id, "test",
      attempt.test_key === "post"
        ? `Mengerjakan post-test dengan nilai ${nilai} dan ${passed ? "dinyatakan lulus" : "belum mencapai nilai kelulusan"}.`
        : attempt.test_key === "ielts-mockup"
          ? `Mengerjakan IELTS Mockup dengan band keseluruhan ${bands ? bands.overall : 0}.`
          : `Mengerjakan pre-test dengan nilai ${nilai}.`,
      null, { attemptId }, now,
    ));
  }

  await env.DB.batch(statements);

  // Placement scores stay hidden until the contact step. Invite attempts already
  // belong to a known student, so their result is returned right away.
  if (speakingPending) {
    return json({
      ok: true,
      total,
      timedOut: Boolean(timedOut),
      result: null,
      speaking: { status: "pending", answered: speakingAnswered, total: MOCKUP_SPEAKING_TOTAL },
    });
  }
  const writing = testKey === "ielts-mockup" ? { status: writingStatus, error: writingError || "" } : null;
  const speaking = testKey === "ielts-mockup" ? { status: speakingStatus, error: speakingError } : null;
  return json({
    ok: true,
    total,
    timedOut: Boolean(timedOut),
    ...(attempt.invite_id ? { result: inviteResult(attempt, score, total, passed, bands, writing, speaking) } : {}),
  });
}

async function saveContact(request, env, attemptId) {
  const body = await readJson(request, PUBLIC_BODY_LIMIT);
  const name = String(body?.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const email = String(body?.email || "").trim().toLowerCase().slice(0, 160);
  const whatsapp = normalizeWhatsapp(body?.whatsapp);
  const branch = branchKey(body?.branch);

  if (name.length < 2) throw new HttpError(400, "Nama harus terdiri dari minimal 2 karakter.");
  if (!isEmail(email)) throw new HttpError(400, "Alamat email belum benar. Periksa kembali penulisannya.");
  if (!whatsapp) throw new HttpError(400, "Nomor WhatsApp belum benar. Contoh penulisan yang benar: 08123456789.");
  if (!branch) throw new HttpError(400, "Pilih cabang tempat kamu ingin belajar.", { field: "branch" });

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
  // A failed channel can be re-armed exactly once, by the retry that follows it: the re-arm
  // count sits in the same row, so a loop of replays cannot burn the outbound channels
  // indefinitely while the sends keep failing.
  const student = attempt.student_id ? { id: attempt.student_id, created: false } : await upsertStudentFromContact(env, { name, email, whatsapp, branch });
  // The private link to this result, sent by email and WhatsApp and used by the waiting screen.
  const resultToken = attempt.result_token || randomToken(24);
  const statements = [
    env.DB.prepare(`UPDATE attempts SET name = ?, email = ?, whatsapp = ?, student_id = ?, result_token = COALESCE(result_token, ?),
        email_status = CASE WHEN email_sent_at IS NOT NULL THEN email_status WHEN email_rearms >= 1 THEN email_status ELSE ? END,
        email_rearms = CASE WHEN email_sent_at IS NOT NULL THEN email_rearms WHEN email_rearms >= 1 THEN email_rearms ELSE email_rearms + 1 END,
        wa_status = CASE WHEN wa_sent_at IS NOT NULL THEN wa_status WHEN wa_rearms >= 1 THEN wa_status ELSE ? END,
        wa_rearms = CASE WHEN wa_sent_at IS NOT NULL THEN wa_rearms WHEN wa_rearms >= 1 THEN wa_rearms ELSE wa_rearms + 1 END
      WHERE id = ? RETURNING email_status, wa_status`)
      .bind(name, email, whatsapp, student.id, resultToken, env.SEND_EMAIL ? "pending" : EMAIL_SKIPPED, whatsappConfigured(env) ? "pending" : "skipped", attemptId),
  ];
  if (!attempt.student_id) {
    statements.push(addActivity(env, student.id, "test", `Mengerjakan placement test dengan skor ${score} dari ${attempt.total} dan masuk level ${level.label}.`, null, { attemptId }, now));
  }
  const [saved] = await env.DB.batch(statements);
  const channels = saved.results[0] || {};

  // Read the recording only after the channels are saved as waiting. Grading saves its result
  // before it starts the delivery, so whichever of the two finishes last sends the result.
  // One attempt now carries one row per speaking question, so every row must be final.
  const speakingRows = await env.DB.prepare("UPDATE speaking_submissions SET student_id = ? WHERE attempt_id = ? RETURNING status")
    .bind(student.id, attemptId).all();
  const rows = speakingRows.results || [];
  const waiting = rows.find((r) => !isFinalStatus(r.status)) || null;
  if (!rows.length || !waiting) deliverInBackground(env, attemptId);
  const delivery = { email: channelState(channels.email_status), whatsapp: channelState(channels.wa_status) };

  // With a recording waiting, the full result goes out by email and WhatsApp after it is scored, and the
  // page only says so. A student who skipped speaking sees the result right away, as before.
  if (waiting) {
    return json({ delivery, result: null, speaking: { status: waiting.status }, resultToken, name });
  }
  return json({
    delivery,
    resultToken,
    programs: programCards(levels, level.key),
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
async function uploadSpeaking(request, env, attemptId, url) {
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

  // The question being answered is one of the ones picked for this attempt. Attempts from before
  // the bank carry no pick, so they keep the old single question at position 1.
  const picked = JSON.parse(attempt.speaking_questions || "[]");
  let position;
  let prompt;
  if (picked.length) {
    position = Number(url.searchParams.get("position"));
    const question = picked.find((q) => q.position === position);
    if (!question) throw new HttpError(400, "Pertanyaan speaking ini tidak termasuk pada percobaan kamu.", { code: "speaking_question" });
    prompt = question.prompt;
  } else {
    position = 1;
    prompt = test.speakingPrompt || "";
  }

  // The duration is the gate, with no slack: anything shorter than the minimum is refused and
  // the student records the answer again. A missing or unreadable duration never passes.
  const declared = Number(request.headers.get("x-duration"));
  const duration = Number.isFinite(declared) && declared > 0 ? Math.min(120, Math.max(1, Math.round(declared))) : null;
  if (duration === null || duration < test.speakingMinSeconds) {
    const counted = duration === null ? "durasi rekaman tidak terbaca" : `rekaman kamu ${duration} detik`;
    throw new HttpError(400, `Rekaman terlalu pendek: ${counted}, minimal ${test.speakingMinSeconds} detik. Rekam ulang jawaban kamu.`, { code: "speaking_short" });
  }

  // Without a Speechace key on this server the recording goes straight to the team's queue.
  const ready = speechaceConfigured(env);
  const status = ready ? "pending" : "failed";
  const error = ready ? null : "Kunci Speechace belum diisi di server, jadi rekaman ini menunggu dinilai tim.";
  const saved = await env.DB.prepare(
    `INSERT INTO speaking_submissions (id, attempt_id, student_id, position, prompt, audio, audio_mime, audio_bytes, duration_seconds, status, needs_review, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (attempt_id, position) DO UPDATE SET prompt = EXCLUDED.prompt, audio = EXCLUDED.audio, audio_mime = EXCLUDED.audio_mime,
         audio_bytes = EXCLUDED.audio_bytes, duration_seconds = EXCLUDED.duration_seconds, status = EXCLUDED.status,
         needs_review = EXCLUDED.needs_review, error = EXCLUDED.error, created_at = EXCLUDED.created_at
       WHERE speaking_submissions.status = 'pending' AND speaking_submissions.tries = 0
         AND (speaking_submissions.lease_until IS NULL OR speaking_submissions.lease_until < ?)
     RETURNING id, status`,
  ).bind(newId("spk"), attemptId, attempt.student_id, position, prompt, audio, mime, audio.length, duration, status, ready ? 0 : 1, error, now, now).first();
  if (!saved) throw new HttpError(409, "Rekaman untuk pertanyaan ini sudah terkirim.", { code: "speaking_done" });
  if (saved.status === "pending") gradeInBackground(env, saved.id);
  return json({ ok: true, status: saved.status === "failed" ? "pending" : saved.status });
}

/** Records that the student could not record, so the result goes out without the speaking part. */
/* One recording per mockup speaking question. The audio is stored, then the worker sends it to
   Speechace; a re-recording replaces the audio only while the answer is still pending or failed. */
async function uploadMockupSpeaking(request, env, attemptId, url) {
  const attempt = await getAttempt(env, attemptId);
  if ((attempt.test_key || "placement") !== "ielts-mockup") throw new HttpError(404, "Percobaan speaking tidak ditemukan.");
  const test = await loadTest(env, "ielts-mockup");
  if (!test.speakingEnabled) throw new HttpError(409, "Bagian speaking sedang tidak dipakai di tes ini.");
  if (attempt.status !== "in_progress") throw new HttpError(409, "Jawaban sudah dikirim, jadi rekaman baru tidak bisa ditambahkan.");
  const part = Number(url.searchParams.get("part"));
  const promptNo = Number(url.searchParams.get("prompt"));
  const found = mockupSpeakingQuestion(part, promptNo);
  if (!found) throw new HttpError(400, "Pertanyaan speaking tidak dikenal.");
  const mime = speakingType(request.headers.get("content-type") || "");
  if (!mime) throw new HttpError(415, "Format rekaman tidak dikenal. Coba rekam ulang dari browser ini.");
  // Same clamp and minimum as the placement upload: an unclamped or sub-minimum duration must
  // never reach the paid scoring queue, and a nonsense header must not become a stored value.
  const duration = Math.min(120, Math.max(1, Math.round(Number(request.headers.get("x-duration") || 0)) || 1));
  const audio = await request.bytes();
  if (audio.length < SPEAKING_MIN_BYTES) throw new HttpError(400, "Rekaman kosong atau terlalu pendek. Coba rekam ulang.");
  if (audio.length > SPEAKING_MAX_BYTES) throw new HttpError(413, "Rekaman terlalu besar. Coba rekam ulang.");
  const now = nowSeconds();
  const row = await env.DB.prepare(
    `INSERT INTO speaking_answers (attempt_id, part, prompt_no, prompt, video_url, audio, audio_mime, audio_bytes, duration_seconds, status, tries, next_attempt_at, lease_until, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, 0, ?)
     ON CONFLICT (attempt_id, part, prompt_no) DO UPDATE SET
       audio = EXCLUDED.audio, audio_mime = EXCLUDED.audio_mime, audio_bytes = EXCLUDED.audio_bytes,
       duration_seconds = EXCLUDED.duration_seconds, status = 'pending', tries = 0, next_attempt_at = 0,
       lease_until = 0, error = NULL, scores = NULL, transcript = NULL, ielts_overall = NULL, needs_review = 0
     WHERE speaking_answers.status = 'pending' AND speaking_answers.tries = 0
       AND (speaking_answers.lease_until IS NULL OR speaking_answers.lease_until < ?)
     RETURNING id`,
  ).bind(attemptId, found.part.part, found.question.no, found.question.text, found.question.video, audio, mime, audio.length, duration, now, now).first();
  if (!row) throw new HttpError(409, "Jawaban ini sudah masuk penilaian atau sudah dinilai, jadi rekamannya tidak bisa diganti.");
  runInBackground(() => gradeMockupAnswer(env, row.id));
  return json({ ok: true });
}

/* The result after the submit for an invited test. The attempt id is a random UUID and only this
   attempt's result comes back, so the report can load without a session. While Speechace finishes
   the mockup speaking answers it answers not ready, so the report keeps checking. */
async function getAttemptResult(env, attemptId) {
  const attempt = await getAttempt(env, attemptId);
  const testKey = attempt.test_key || "placement";
  if (!attempt.invite_id || !["pre", "post", "ielts-mockup"].includes(testKey)) throw new HttpError(404, "Hasil tidak ditemukan.");
  // A voided result is cancelled: the team suppressed it, so it must not be readable by the
  // attempt UUID either (audit hardening from wave 2).
  if (attempt.voided_at) throw new HttpError(404, "Hasil tidak ditemukan.");
  if (attempt.status !== "submitted") return json({ ready: false });
  const meta = await inviteMeta(env, attempt);

  if (testKey === "ielts-mockup") {
    const { results } = await env.DB.prepare("SELECT status FROM speaking_answers WHERE attempt_id = ?").bind(attemptId).all();
    if (results.some((r) => r.status === "pending" || r.status === "grading")) {
      return json({ ready: false, speaking: { status: "pending", answered: results.length, total: MOCKUP_SPEAKING_TOTAL } });
    }
  }
  const stored = attempt.bands ? JSON.parse(attempt.bands) : null;
  const writing = testKey === "ielts-mockup" ? { status: attempt.writing_status || null, error: attempt.writing_error || "" } : null;
  const speaking = testKey === "ielts-mockup" ? { status: attempt.speaking_status || null, error: attempt.speaking_error || "" } : null;
  return json({ ready: true, result: inviteResult(attempt, attempt.score, attempt.total, attempt.passed, stored, writing, speaking, meta) });
}

async function skipSpeaking(request, env, attemptId) {
  const attempt = await getAttempt(env, attemptId);
  if ((attempt.test_key || "placement") === "ielts-mockup") {
    if (attempt.status !== "in_progress") throw new HttpError(409, "Percobaan ini sudah dikirim, jadi speaking tidak bisa dilewati.");
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM speaking_answers WHERE attempt_id = ?").bind(attemptId).first();
    if (count?.n) throw new HttpError(409, "Jawaban speaking sudah direkam, jadi tidak bisa dilewati.");
    await env.DB.prepare("UPDATE attempts SET speaking_status = 'skipped', speaking_error = NULL WHERE id = ?").bind(attemptId).run();
    return json({ ok: true });
  }
  const body = await readJson(request, PUBLIC_BODY_LIMIT);
  const reason = SKIP_REASONS[body?.reason] ? body.reason : "mic";
  const placementAttempt = await speakingAttempt(env, attemptId);
  const now = nowSeconds();
  // Position 0 is the skip marker: it never collides with a question answer, and the reader
  // side treats a final marker like any other finished row.
  await env.DB.prepare(
    `INSERT INTO speaking_submissions (id, attempt_id, student_id, position, prompt, status, error, scores, graded_at, created_at)
     VALUES (?, ?, ?, 0, ?, 'skipped', ?, ?, ?, ?) ON CONFLICT (attempt_id, position) DO NOTHING`,
  ).bind(newId("spk"), attemptId, placementAttempt.student_id, "", SKIP_REASONS[reason], JSON.stringify({ source: "student", reason }), now, now).run();
  return json({ ok: true });
}

/* ---------- The private result link ---------- */

/**
 * The result behind the link from the email and the WhatsApp message. While the recording is still
 * being scored, it answers not ready, so the page can keep checking. The link carries no session,
 * so it only ever returns this one result and no contact details.
 */
async function getResultLink(env, token) {
  const attempt = await env.DB.prepare(
    "SELECT id, test_key, status, name, score, total, level_key, timed_out, violations, started_at, submitted_at FROM attempts WHERE result_token = ?",
  ).bind(token).first();
  if (!attempt) throw new HttpError(404, "Tautan hasil ini tidak ditemukan. Periksa kembali tautan yang kami kirim ke email dan WhatsApp kamu.");
  if ((attempt.test_key || "placement") !== "placement" || attempt.status !== "submitted") {
    throw new HttpError(410, "Hasil tautan ini belum siap. Buka kembali tautannya setelah tes selesai.");
  }

  const speakingRows = await env.DB.prepare(
    "SELECT status, cefr_overall, ielts_overall, scores, transcript FROM speaking_submissions WHERE attempt_id = ? ORDER BY position",
  ).bind(attempt.id).all();
  const rows = speakingRows.results || [];
  const levels = await loadLevels(env);
  const level = levels.find((l) => l.key === attempt.level_key) || levelFor(levels, attempt.score ?? 0);
  const next = levels[levels.indexOf(level) + 1] || null;

  if (rows.some((r) => !isFinalStatus(r.status))) {
    return json({ ready: false, name: attempt.name || "" });
  }
  return json({
    ready: true,
    name: attempt.name || "",
    result: {
      score: attempt.score ?? 0,
      total: attempt.total,
      level: publicLevel(level),
      timedOut: Boolean(attempt.timed_out),
      violations: attempt.violations,
      speaking: aggregateSpeakingFacts(rows),
      date: attempt.submitted_at || attempt.started_at,
      code: resultCode(attempt),
      whatsapp: WHATSAPP,
      levels: levels.map((l) => ({ key: l.key, label: l.label, min: l.min, max: l.max })),
      next: next ? { key: next.key, label: next.label, min: next.min } : null,
    },
    programs: programCards(levels, level.key),
  });
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

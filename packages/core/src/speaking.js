// Background scoring of the placement speaking answer with Speechace (docs/prd-speaking-section.md).
//
// The student uploads one recording after the multiple choice part. Its row in
// speaking_submissions is the work queue, following the lease pattern of delivery.js: a server
// claims the row for 120 seconds, sends the audio to Speechace, and stores the transcript and the
// five scores. A server error or a timeout is tried again after 60 seconds and after 5 minutes.
// After the third failed try, or after an error that waiting cannot fix (a refused key, an empty
// quota, no speech, another language), the row waits for the team in the dashboard. The result
// email and WhatsApp only go out once the row is graded, graded by hand, or skipped.
//
// Nothing here queries the database on a fixed beat unless work is due. Retries are timers in
// memory, a scan at start-up picks up rows an earlier run left behind, and a safety scan runs
// every 6 hours. A query every minute would keep the Neon compute from ever suspending.

import { nowSeconds } from "./http.js";
import { sha256Hex } from "./crypto.js";
import { addActivity } from "./store.js";
import { runInBackground, deliverInBackground, deliverPending } from "./delivery.js";
import { MAX_TRIES, DEFAULT_RETRY_SECONDS, mapSpeechaceResult, classifyFailure, afterFailure, formatBand } from "./speaking-result.js";

export const SPEAKING_MAX_BYTES = 3 * 1024 * 1024;
export const AUDIO_RETENTION_DAYS = 30;
// Browsers record webm or ogg (Opus) or mp4 (AAC). Speechace reads all of them, and wav too.
export const SPEAKING_TYPES = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav" };
const TYPE_ALIASES = { "audio/x-wav": "audio/wav", "audio/wave": "audio/wav", "audio/x-m4a": "audio/mp4", "audio/m4a": "audio/mp4" };
export const DEFAULT_SPEECHACE_BASE = "https://api2.speechace.com";

const LEASE_SECONDS = 120;
const CALL_TIMEOUT_MS = 60_000;
const RESPONSE_KEEP_BYTES = 200 * 1024;
const TICK_MS = 60_000;
const SCAN_EVERY_MS = 6 * 3600 * 1000;
const PURGE_EVERY_MS = 24 * 3600 * 1000;
const SCAN_LIMIT = 200;

const timers = new Map();
let ticker = null;
let stopping = false;
let lastScan = 0;
let lastPurge = 0;

export function speechaceConfigured(env) {
  return Boolean(env.SPEECHACE_KEY);
}

/** The audio type without codec parameters, or null when it is not one Speechace reads. */
export function speakingType(contentType) {
  const base = String(contentType || "").split(";")[0].trim().toLowerCase();
  const type = TYPE_ALIASES[base] || base;
  return SPEAKING_TYPES[type] ? type : null;
}

/** Seconds to wait after the first and second failed tries. SPEAKING_RETRY_SECONDS can change them, for example in tests. */
export function retryDelays(env) {
  const list = String(env.SPEAKING_RETRY_SECONDS || "").split(",").map((v) => Number(v.trim())).filter((n) => Number.isInteger(n) && n > 0);
  return list.length ? list : DEFAULT_RETRY_SECONDS;
}

/** One score/speech call. Never throws: a network error or timeout comes back as `error`. */
export async function callSpeechace(env, { audio, mime, prompt, dialect = "en-us", userId, timeoutMs = CALL_TIMEOUT_MS }) {
  const base = String(env.SPEECHACE_API_BASE || DEFAULT_SPEECHACE_BASE).replace(/\/+$/, "");
  const form = new FormData();
  form.append("user_audio_file", new Blob([audio], { type: mime }), `answer.${SPEAKING_TYPES[mime] || "webm"}`);
  form.append("include_ielts_feedback", "1");
  form.append("relevance_context", prompt);
  // An answer in another language comes back as non_dialect_language_detected instead of a low score.
  form.append("enforce_dialect", "1");
  form.append("question_info", "placement-speaking");
  // This endpoint only reads the key from the query string, so the URL is never logged.
  const url = `${base}/api/scoring/speech/v9/json?key=${encodeURIComponent(env.SPEECHACE_KEY)}&dialect=${encodeURIComponent(dialect)}&user_id=${encodeURIComponent(userId)}`;
  const started = Date.now();
  try {
    const response = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
    const raw = await response.text();
    let body = null;
    try { body = JSON.parse(raw); } catch { body = null; }
    return {
      httpStatus: response.status,
      body,
      raw,
      ms: Date.now() - started,
      quota: response.headers.get("x-speechace-scoring-quota"),
      requestId: body?.request_id || response.headers.get("x-request-id") || null,
    };
  } catch (error) {
    return { httpStatus: null, body: null, raw: "", error, ms: Date.now() - started, quota: null, requestId: null };
  }
}

/** Scores one recording now, in the background. */
export function gradeInBackground(env, submissionId) {
  return runInBackground(() => gradeSubmission(env, submissionId));
}

function schedule(env, id, atSeconds) {
  if (stopping) return;
  clearTimeout(timers.get(id));
  const timer = setTimeout(() => {
    timers.delete(id);
    gradeInBackground(env, id);
  }, Math.max(0, atSeconds * 1000 - Date.now()) + 500);
  timer.unref?.();
  timers.set(id, timer);
}

function log(outcome, row, call, extra = "") {
  console.log(`speaking ${outcome} submission=${row.id} attempt=${row.attempt_id} request=${call.requestId || "-"} http=${call.httpStatus ?? "-"} tries=${row.tries} ms=${call.ms} quota=${call.quota ?? "-"}${extra}`);
}

/** Claims one recording, sends it to Speechace, and records the outcome. Returns null when there was nothing to do. */
export async function gradeSubmission(env, id) {
  if (stopping || !speechaceConfigured(env)) return null;
  const now = nowSeconds();
  const row = await env.DB.prepare(
    `UPDATE speaking_submissions SET status = 'grading', lease_until = ?, tries = tries + 1
      WHERE id = ? AND status IN ('pending', 'grading') AND tries < ? AND audio IS NOT NULL
        AND (lease_until IS NULL OR lease_until < ?) AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      RETURNING id, attempt_id, student_id, prompt, audio, audio_mime, tries`,
  ).bind(now + LEASE_SECONDS, id, MAX_TRIES, now, now).first();
  if (!row) return checkLater(env, id);

  const test = await env.DB.prepare("SELECT speaking_dialect FROM tests WHERE key = 'placement'").first();
  const call = await callSpeechace(env, {
    audio: row.audio,
    mime: row.audio_mime,
    prompt: row.prompt,
    dialect: test?.speaking_dialect || "en-us",
    // Speechace never sees who answered: only a hash of the attempt id.
    userId: (await sha256Hex(`tnec-speaking:${row.attempt_id}`)).slice(0, 32),
  });
  const at = nowSeconds();
  const kept = call.raw ? call.raw.slice(0, RESPONSE_KEEP_BYTES) : null;

  if (call.httpStatus === 200 && call.body?.status === "success") {
    const result = mapSpeechaceResult(call.body);
    const saved = await env.DB.prepare(
      `UPDATE speaking_submissions SET status = 'graded', needs_review = ?, transcript = ?, cefr_overall = ?, ielts_overall = ?,
          scores = ?, provider_request_id = ?, provider_response = ?, error = NULL, lease_until = NULL, next_attempt_at = NULL,
          graded_at = ?, graded_by = NULL
        WHERE id = ? AND status = 'grading' RETURNING attempt_id, student_id`,
    ).bind(result.needsReview ? 1 : 0, result.transcript, result.cefr, result.ielts, JSON.stringify(result.scores), result.requestId || call.requestId, kept, at, id).first();
    log("graded", row, call, ` cefr=${result.cefr || "-"} review=${result.needsReview ? 1 : 0}`);
    // A null here means the team graded or skipped it by hand while Speechace was answering.
    if (!saved) return null;
    if (saved.student_id) {
      const ielts = result.ielts === null ? "" : `, IELTS ${formatBand(result.ielts)}`;
      await addActivity(env, saved.student_id, "test", `Speaking dinilai Speechace: CEFR ${result.cefr || "tidak ada"}${ielts}.${result.needsReview ? " Perlu dicek tim." : ""}`, null, { attemptId: saved.attempt_id }, at).run();
    }
    deliverInBackground(env, saved.attempt_id);
    return { status: "graded", needsReview: result.needsReview, cefr: result.cefr };
  }

  const failure = classifyFailure(call);
  const next = afterFailure(failure, row.tries, at, retryDelays(env));
  const saved = await env.DB.prepare(
    `UPDATE speaking_submissions SET status = ?, needs_review = ?, error = ?, next_attempt_at = ?, lease_until = NULL,
        provider_request_id = COALESCE(?, provider_request_id), provider_response = COALESCE(?, provider_response)
      WHERE id = ? AND status = 'grading' RETURNING attempt_id, student_id`,
  ).bind(next.status, next.needsReview, next.error, next.nextAttemptAt, call.requestId, kept, id).first();
  log(next.status === "pending" ? "retry" : "failed", row, call, ` code=${failure.code}`);
  if (!saved) return null;
  if (next.status === "pending") {
    schedule(env, id, next.nextAttemptAt);
  } else if (saved.student_id) {
    await addActivity(env, saved.student_id, "test", `Speaking gagal dinilai otomatis dan menunggu dinilai tim. ${next.error}`, null, { attemptId: saved.attempt_id }, at).run();
  }
  return { status: next.status, error: next.error };
}

/** A row that could not be claimed: set a timer if it is waiting, and fail it if a crashed server left it on its last try. */
async function checkLater(env, id) {
  const now = nowSeconds();
  const row = await env.DB.prepare("SELECT status, tries, next_attempt_at, lease_until, audio IS NOT NULL AS has_audio FROM speaking_submissions WHERE id = ?").bind(id).first();
  if (!row || (row.status !== "pending" && row.status !== "grading")) return null;
  const leaseLive = row.lease_until && row.lease_until >= now;
  if (leaseLive) {
    schedule(env, id, row.lease_until + 2); // in case the server holding it stops before it finishes
    return null;
  }
  if (row.tries >= MAX_TRIES || !row.has_audio) {
    const error = row.has_audio
      ? `Penilaian terhenti di tengah jalan pada percobaan ke-${row.tries}, jadi rekaman ini menunggu dinilai tim.`
      : "Rekaman sudah terhapus sebelum sempat dinilai.";
    await env.DB.prepare(
      `UPDATE speaking_submissions SET status = 'failed', needs_review = 1, error = ?, lease_until = NULL, next_attempt_at = NULL
        WHERE id = ? AND status IN ('pending', 'grading') AND (lease_until IS NULL OR lease_until < ?)`,
    ).bind(error, id, now).run();
    return { status: "failed", error };
  }
  if (row.next_attempt_at && row.next_attempt_at > now) schedule(env, id, row.next_attempt_at);
  return null;
}

/**
 * Picks up every recording still waiting, for example one left by a server that stopped in the
 * middle of a call. Due rows are scored one at a time, so a backlog does not burst Speechace.
 */
export async function gradePending(env) {
  if (stopping || !speechaceConfigured(env)) return;
  const now = nowSeconds();
  const { results } = await env.DB.prepare(
    `SELECT id, status, next_attempt_at, lease_until FROM speaking_submissions
      WHERE status IN ('pending', 'grading') ORDER BY created_at LIMIT ${SCAN_LIMIT}`,
  ).all();
  for (const row of results) {
    if (stopping) return;
    const leaseLive = row.lease_until && row.lease_until >= now;
    const due = Math.max(row.next_attempt_at || 0, leaseLive ? row.lease_until + 2 : 0);
    if (due > now) schedule(env, row.id, due);
    else await runInBackground(() => gradeSubmission(env, row.id));
  }
}

/** Deletes recordings older than 30 days. Scores and transcripts stay. */
export async function purgeOldAudio(env, now = nowSeconds()) {
  const cutoff = now - AUDIO_RETENTION_DAYS * 86400;
  const purged = await env.DB.prepare(
    `UPDATE speaking_submissions SET audio = NULL,
        status = CASE WHEN status IN ('pending', 'grading') THEN 'failed' ELSE status END,
        needs_review = CASE WHEN status IN ('pending', 'grading') THEN 1 ELSE needs_review END,
        error = CASE WHEN status IN ('pending', 'grading') THEN 'Rekaman sudah terhapus sebelum sempat dinilai.' ELSE error END
      WHERE audio IS NOT NULL AND created_at < ?`,
  ).bind(cutoff).run();
  const mockup = await env.DB.prepare(
    `UPDATE speaking_answers SET audio = NULL,
        status = CASE WHEN status IN ('pending', 'grading') THEN 'failed' ELSE status END,
        needs_review = CASE WHEN status IN ('pending', 'grading') THEN 1 ELSE needs_review END,
        error = CASE WHEN status IN ('pending', 'grading') THEN 'Rekaman sudah terhapus sebelum sempat dinilai.' ELSE error END
      WHERE audio IS NOT NULL AND created_at < ?`,
  ).bind(cutoff).run();
  const count = (purged.meta?.changes || 0) + (mockup.meta?.changes || 0);
  if (count) console.log(`speaking audio purged count=${count} older_than_days=${AUDIO_RETENTION_DAYS}`);
  return count;
}

// The client may still submit up to 15 seconds after the deadline, so wait past that.
const EXPIRED_GRACE_SECONDS = 60;

/**
 * Deletes attempts whose time ran out long ago, answers and recordings included. The owner asked
 * for failed attempts not to sit in the database as "Tanpa nama". This runs when a new test starts
 * and in the six-hourly safety scan, not on a timer, so the Neon compute can still suspend.
 */
export async function purgeExpiredAttempts(env, now = nowSeconds()) {
  const purged = await env.DB.prepare(
    `DELETE FROM attempts WHERE status = 'in_progress' AND expires_at + ${EXPIRED_GRACE_SECONDS} < ?`,
  ).bind(now).run();
  const count = purged.meta?.changes || 0;
  if (count) console.log(`attempts purged count=${count} reason=expired`);
  return count;
}

/** Starts the scan at start-up, the retries, the 6-hourly safety scan, and the daily audio purge. */
export function startSpeakingWorker(env) {
  if (ticker) return;
  stopping = false;
  let first = true;
  const tick = () => {
    if (stopping) return;
    const nowMs = Date.now();
    if (nowMs - lastPurge >= PURGE_EVERY_MS) {
      lastPurge = nowMs;
      runInBackground(() => purgeOldAudio(env));
    }
    if (nowMs - lastScan >= SCAN_EVERY_MS) {
      lastScan = nowMs;
      runInBackground(() => gradePending(env));
      runInBackground(() => purgeExpiredAttempts(env));
      // The apps send waiting results at start-up themselves. The later scans also catch a result
      // whose recording was graded right before its server stopped.
      if (!first) runInBackground(() => deliverPending(env));
    }
    first = false;
  };
  tick();
  ticker = setInterval(tick, TICK_MS);
  ticker.unref?.();
}

/** Stops new work before a shutdown. Running calls are awaited by drainDeliveries. */
export function stopSpeakingWorker() {
  stopping = true;
  clearInterval(ticker);
  ticker = null;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

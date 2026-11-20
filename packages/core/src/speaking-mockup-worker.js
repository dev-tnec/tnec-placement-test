// Background Speechace scoring for the IELTS mockup speaking answers. Each question has its own
// recording row in speaking_answers; the worker claims one with a lease, scores it, and when every
// answer is final it adds the Speaking skill to the attempt's bands and recomputes the overall.

import { callSpeechace } from "./speaking.js";
import { mapSpeechaceResult, classifyFailure, afterFailure, MAX_TRIES } from "./speaking-result.js";
import { nowSeconds } from "./http.js";
import { sha256Hex } from "./crypto.js";
import { addActivity } from "./store.js";
import { overallBand } from "./bands.js";
import { speakingCriteria, speakingBandFromCriteria } from "./speaking-mockup.js";

const LEASE_SECONDS = 120;
const RESPONSE_KEEP_BYTES = 64 * 1024;
const POLL_MS = 6000;
const BATCH = 3;

let timer = null;
let stopping = false;

export function startMockupSpeakingWorker(env) {
  if (timer) return;
  stopping = false;
  const tick = () => {
    if (!stopping) runOnce(env).catch((error) => console.error("mockup speaking:", error.message));
  };
  timer = setInterval(tick, POLL_MS);
  timer.unref?.();
  tick();
}

export function stopMockupSpeakingWorker() {
  stopping = true;
  clearInterval(timer);
  timer = null;
}

function mockMapped() {
  const aspect = { cefr: "B2", ielts: 6, score: 60 };
  return {
    transcript: "Mock transcript.",
    cefr: "B2",
    ielts: 6,
    scores: {
      source: "mock",
      overall: { cefr: "B2", ielts: 6, score: 60 },
      aspects: { pronunciation: aspect, fluency: aspect, grammar: aspect, vocab: aspect, coherence: aspect },
      relevance: null,
      issues: [],
      notes: [],
      language: "en",
      version: "mock",
    },
    needsReview: false,
    requestId: null,
  };
}

async function runOnce(env) {
  if (!env.SPEECHACE_KEY && env.SPEECHACE_MOCK !== "1") return;
  const now = nowSeconds();
  // A row that used its last try and lost its lease is waiting for the team.
  await env.DB.prepare(
    `UPDATE speaking_answers SET status = 'failed', needs_review = 1,
        error = COALESCE(error, 'Penilaian terhenti sebelum selesai.'), lease_until = 0, next_attempt_at = 0
      WHERE status IN ('pending', 'grading') AND lease_until < ? AND tries >= ?`,
  ).bind(now, MAX_TRIES).run();
  const { results } = await env.DB.prepare(
    `SELECT id FROM speaking_answers
      WHERE status IN ('pending', 'grading') AND audio IS NOT NULL AND tries < ?
        AND lease_until < ? AND next_attempt_at <= ?
      ORDER BY id LIMIT ?`,
  ).bind(MAX_TRIES, now, now, BATCH).all();
  for (const row of results) await gradeAnswer(env, row.id);
}

/** Scores one answer. Returns null when another server holds it or it is already final. */
export async function gradeAnswer(env, id) {
  if (stopping) return null;
  const now = nowSeconds();
  const row = await env.DB.prepare(
    `UPDATE speaking_answers SET status = 'grading', lease_until = ?, tries = tries + 1
      WHERE id = ? AND status IN ('pending', 'grading') AND tries < ? AND audio IS NOT NULL
        AND lease_until < ? AND next_attempt_at <= ?
      RETURNING id, attempt_id, prompt, audio, audio_mime, tries, lease_until`,
  ).bind(now + LEASE_SECONDS, id, MAX_TRIES, now, now).first();
  if (!row) return null;

  let mapped;
  let call = null;
  if (env.SPEECHACE_MOCK === "1") {
    mapped = mockMapped();
  } else {
    call = await callSpeechace(env, {
      audio: row.audio,
      mime: row.audio_mime,
      prompt: row.prompt,
      dialect: "en-us",
      // Speechace never sees who answered: only a hash of the attempt id.
      userId: (await sha256Hex(`tnec-mockup-speaking:${row.attempt_id}`)).slice(0, 32),
    });
    mapped = call.httpStatus === 200 && call.body?.status === "success"
      ? mapSpeechaceResult(call.body)
      : { failure: classifyFailure(call) };
  }
  const at = nowSeconds();

  if (mapped.failure) {
    const next = afterFailure(mapped.failure, row.tries, at);
    await env.DB.prepare(
      `UPDATE speaking_answers SET status = ?, needs_review = ?, error = ?, next_attempt_at = ?,
          lease_until = 0, response = COALESCE(?, response)
        WHERE id = ? AND status = 'grading' AND lease_until = ?`,
    ).bind(next.status, next.needsReview, next.error, next.nextAttemptAt, call?.raw ? call.raw.slice(0, RESPONSE_KEEP_BYTES) : null, id, row.lease_until).run();
    if (next.status === "pending") return { status: "pending" };
    await finalizeAttempt(env, row.attempt_id);
    return { status: "failed", error: next.error };
  }

  await env.DB.prepare(
    `UPDATE speaking_answers SET status = 'graded', needs_review = ?, transcript = ?, scores = ?, ielts_overall = ?,
        response = ?, error = NULL, lease_until = 0, next_attempt_at = 0, graded_at = ?
      WHERE id = ? AND status = 'grading' AND lease_until = ?`,
  ).bind(mapped.needsReview ? 1 : 0, mapped.transcript, JSON.stringify(mapped.scores), mapped.ielts, null, at, id, row.lease_until).run();
  await finalizeAttempt(env, row.attempt_id);
  return { status: "graded" };
}

/** Adds the Speaking skill once every answer is final, and recomputes the overall. */
export async function finalizeAttempt(env, attemptId) {
  const { results: answers } = await env.DB.prepare(
    "SELECT status, scores, error FROM speaking_answers WHERE attempt_id = ?",
  ).bind(attemptId).all();
  if (!answers.length) return;
  if (answers.some((a) => a.status === "pending" || a.status === "grading")) return;

  const attempt = await env.DB.prepare("SELECT id, test_key, student_id, bands FROM attempts WHERE id = ?").bind(attemptId).first();
  if (!attempt) return;
  const failed = answers.find((a) => a.status === "failed");
  const graded = answers.filter((a) => a.status === "graded" && a.scores);
  if (failed || !graded.length) {
    await env.DB.prepare("UPDATE attempts SET speaking_status = 'failed', speaking_error = ? WHERE id = ?")
      .bind(failed?.error || "Tidak ada jawaban speaking yang bisa dinilai.", attemptId).run();
    return;
  }

  const totals = { pronunciation: [], fluency_coherence: [], lexical_resource: [], grammatical_range_accuracy: [] };
  for (const answer of graded) {
    let scores;
    try { scores = JSON.parse(answer.scores); } catch { continue; }
    const criteria = speakingCriteria(scores);
    for (const key of Object.keys(totals)) if (Number.isFinite(criteria[key])) totals[key].push(criteria[key]);
  }
  const criteria = Object.fromEntries(Object.entries(totals).map(([key, list]) => [
    key, list.length ? Math.round((list.reduce((sum, v) => sum + v, 0) / list.length) * 10) / 10 : null,
  ]));
  const band = speakingBandFromCriteria(criteria);

  const stored = attempt.bands ? JSON.parse(attempt.bands) : { skills: [] };
  const skills = [...(stored.skills || []).filter((s) => s.skill !== "Speaking"), { skill: "Speaking", band, criteria, answers: graded.length }];
  const bands = { skills, overall: overallBand(skills.map((s) => s.band)) };
  await env.DB.prepare("UPDATE attempts SET bands = ?, speaking_status = 'graded', speaking_error = NULL WHERE id = ?")
    .bind(JSON.stringify(bands), attemptId).run();
  if (attempt.student_id) {
    await addActivity(env, attempt.student_id, "test", `Speaking IELTS Mockup dinilai otomatis: band ${band}.`, null, { attemptId }, nowSeconds()).run();
    // The attempt is already submitted, so the certificate and the completion notification can go
    // out with the final band. The certificate issues first so the notification can attach its PDF.
    const submitted = await env.DB.prepare("SELECT status FROM attempts WHERE id = ?").bind(attemptId).first();
    if (submitted?.status === "submitted") {
      const { autoIssueMockupCertificate } = await import("./certificate-auto.js");
      await autoIssueMockupCertificate(env, attemptId).catch((error) => console.error("auto certificate failed", error));
      const { deliverMockupDone } = await import("./delivery.js");
      deliverMockupDone(env, attemptId).catch((error) => console.error("mockup done delivery failed", error));
    }
  }
}

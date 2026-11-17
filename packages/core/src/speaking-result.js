// Speaking scores: reading a Speechace score/speech response, deciding what happens after a
// failed call, and the shape that the result email, the WhatsApp message, and the dashboard read.
// Pure functions with no I/O, so tests/smoke.mjs can check them directly.

export const ASPECTS = [
  { key: "pronunciation", label: "Pronunciation" },
  { key: "fluency", label: "Fluency" },
  { key: "grammar", label: "Grammar" },
  { key: "vocab", label: "Vocabulary" },
  { key: "coherence", label: "Coherence" },
];

// The result email and WhatsApp wait until a recording reaches one of these.
export const FINAL_STATUSES = ["graded", "manual", "skipped"];
export const isFinalStatus = (status) => FINAL_STATUSES.includes(status);

// Speechace reports CEFR from A0 to C2 with plus steps (B1+, C1+). The team grades by hand with the
// plain levels.
export const MANUAL_CEFR = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];
export const MAX_TRIES = 3;
export const DEFAULT_RETRY_SECONDS = [60, 300];

// Warnings that make Speechace lower or zero the overall score. The result still goes out, and the
// recording is flagged for the team.
const REVIEW_ISSUES = new Set(["response_too_short", "response_relevance_false", "response_too_similar"]);
const MAX_NOTES = 3;

export const cefrOf = (v) => (typeof v === "string" && /^(A0|[ABC][12]\+?)$/.test(v.trim()) ? v.trim() : null);
const numberOf = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Plain text: tags removed, whitespace collapsed, cut to max characters. */
export function cleanText(value, max = 300) {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

export const formatBand = (v) => (v === null || v === undefined ? "" : Number(v).toFixed(1));

function lowMessages(metrics) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (node.level === "low" && node.message) found.push(cleanText(node.message));
    for (const value of Object.values(node)) walk(value);
  };
  for (const value of Object.values(metrics || {})) walk(value);
  return found.filter(Boolean);
}

/**
 * Up to three feedback lines for the student: grammar errors first, then low metrics taken in
 * turn from grammar, vocabulary, and coherence, so one weak area does not fill every line.
 */
export function feedbackNotes(score) {
  const notes = (score?.grammar?.errors || []).map((e) => cleanText(e?.message)).filter(Boolean);
  const lists = ["grammar", "vocab", "coherence"].map((key) => lowMessages(score?.[key]?.overall_metrics));
  for (let i = 0; lists.some((list) => list.length > i); i += 1) {
    for (const list of lists) if (list[i]) notes.push(list[i]);
  }
  return [...new Set(notes)].slice(0, MAX_NOTES);
}

/** Reads a successful score/speech response into what the database stores. Numbers are taken as Speechace sends them. */
export function mapSpeechaceResult(data) {
  const s = data?.speech_score || {};
  const cefr = s.cefr_score || {};
  const ielts = s.ielts_score || {};
  const points = s.speechace_score || {};
  const aspects = Object.fromEntries(ASPECTS.map(({ key }) => [key, { cefr: cefrOf(cefr[key]), ielts: numberOf(ielts[key]), score: numberOf(points[key]) }]));
  const issues = (Array.isArray(s.score_issue_list) ? s.score_issue_list : [])
    .map((issue) => ({ code: cleanText(issue?.short_message, 60), message: cleanText(issue?.detail_message, 200) }))
    .filter((issue) => issue.code);
  const relevanceClass = String(s.relevance?.class || "").toUpperCase();
  const scores = {
    source: "speechace",
    overall: { cefr: cefrOf(cefr.overall), ielts: numberOf(ielts.overall), score: numberOf(points.overall) },
    aspects,
    relevance: relevanceClass === "TRUE" || relevanceClass === "FALSE" ? relevanceClass : null,
    issues,
    notes: feedbackNotes(s),
    language: cleanText(s.detected_dialect?.lang_id, 10) || null,
    version: cleanText(data?.version, 20) || null,
  };
  return {
    transcript: cleanText(s.transcript, 5000),
    cefr: scores.overall.cefr,
    ielts: scores.overall.ielts,
    scores,
    needsReview: issues.some((issue) => REVIEW_ISSUES.has(issue.code)) || !scores.overall.cefr,
    requestId: cleanText(data?.request_id, 80) || null,
  };
}

const AUDIO_UNREADABLE = new Set(["error_convert_audio", "error_audio_empty", "error_audio_missing"]);
const AUDIO_TOO_BIG = new Set(["error_audio_too_long", "error_file_too_large"]);

/**
 * Explains a failed Speechace call for the dashboard and says whether waiting can fix it.
 * Server errors and timeouts are tried again. A refused key, an empty quota, no speech, and another
 * language go straight to the team, as the PRD's error table says.
 */
export function classifyFailure({ httpStatus = null, body = null, error = null } = {}) {
  if (error) {
    const timeout = error.name === "TimeoutError" || error.name === "AbortError";
    return {
      retry: true,
      code: timeout ? "timeout" : "network",
      message: timeout ? "Speechace belum menjawab dalam 60 detik." : `Tidak bisa menghubungi Speechace: ${cleanText(error.message, 120)}.`,
    };
  }
  const code = cleanText(body?.short_message, 60);
  const detail = cleanText(body?.detail_message, 160);
  const name = code || `HTTP ${httpStatus}`;
  if (httpStatus === 401 || httpStatus === 403 || code === "error_key_expired") {
    return { retry: false, code: code || `http_${httpStatus}`, message: "Speechace menolak kunci API. Periksa SPEECHACE_KEY di server dan status langganan Premium." };
  }
  if (httpStatus === 429 || code === "error_too_many_requests") {
    return { retry: false, code: code || "http_429", message: "Kuota atau batas permintaan Speechace habis. Periksa sisa kuota di akun Speechace." };
  }
  if (code === "error_feature_unavailable") {
    return { retry: false, code, message: "Langganan Speechace ini belum mencakup score speech, yang butuh paket Premium." };
  }
  if (code === "error_no_speech") {
    return { retry: false, code, message: "Speechace tidak menemukan suara di rekaman ini. Dengarkan rekamannya, lalu nilai manual." };
  }
  if (code === "non_dialect_language_detected") {
    return { retry: false, code, message: "Rekaman terdeteksi bukan bahasa Inggris. Siswa mungkin menjawab dalam bahasa Indonesia." };
  }
  if (AUDIO_UNREADABLE.has(code)) return { retry: false, code, message: "Speechace tidak bisa membaca berkas rekaman ini." };
  if (AUDIO_TOO_BIG.has(code)) return { retry: false, code, message: "Rekaman melebihi batas durasi atau ukuran di langganan Speechace." };
  if ((httpStatus && httpStatus >= 500) || code === "error_timeout" || code === "error_internal") {
    return { retry: true, code: code || `http_${httpStatus}`, message: `Speechace sedang bermasalah (${name}).` };
  }
  return { retry: false, code: code || `http_${httpStatus}`, message: `Speechace menolak rekaman ini (${name}${detail ? `: ${detail}` : ""}).` };
}

/** What the row becomes after the `tries`-th call failed. */
export function afterFailure(failure, tries, now, delays = DEFAULT_RETRY_SECONDS) {
  if (failure.retry && tries < MAX_TRIES) {
    const wait = delays[Math.min(tries - 1, delays.length - 1)] ?? DEFAULT_RETRY_SECONDS[0];
    return { status: "pending", needsReview: 0, nextAttemptAt: now + wait, error: `Percobaan ${tries} dari ${MAX_TRIES} gagal: ${failure.message} Sistem mencoba lagi otomatis.` };
  }
  return {
    status: "failed",
    needsReview: 1,
    nextAttemptAt: null,
    error: failure.retry ? `Gagal setelah ${tries} percobaan: ${failure.message}` : failure.message,
  };
}

const parseScores = (raw) => {
  try { return JSON.parse(raw || "{}") || {}; } catch { return {}; }
};

/** The speaking part of the result email and WhatsApp, or null when there is nothing to show. */
export function speakingFacts(row) {
  if (!row || (row.status !== "graded" && row.status !== "manual")) return null;
  const scores = parseScores(row.scores);
  const cefr = cefrOf(row.cefr_overall) || cefrOf(scores.overall?.cefr);
  if (!cefr) return null;
  const ielts = numberOf(row.ielts_overall) ?? numberOf(scores.overall?.ielts);
  const aspects = ASPECTS.map(({ key, label }) => {
    const a = scores.aspects?.[key] || {};
    return { key, label, cefr: cefrOf(a.cefr), ielts: numberOf(a.ielts), score: numberOf(a.score) };
  }).filter((a) => a.cefr || a.score !== null);
  const issues = Array.isArray(scores.issues) ? scores.issues : [];
  const manual = row.status === "manual";
  return {
    source: manual ? "manual" : "speechace",
    cefr,
    ielts,
    aspects,
    relevance: manual ? null : scores.relevance || null,
    tooShort: !manual && issues.some((i) => i.code === "response_too_short"),
    offTopic: !manual && (scores.relevance === "FALSE" || issues.some((i) => i.code === "response_relevance_false" || i.code === "response_too_similar")),
    transcript: cleanText(row.transcript, 5000),
    notes: manual ? (scores.note ? [cleanText(scores.note, 500)] : []) : (Array.isArray(scores.notes) ? scores.notes.map((n) => cleanText(n)).filter(Boolean).slice(0, MAX_NOTES) : []),
  };
}

/** One aspect for a message: "Pronunciation 78 (B2)", or "Pronunciation B2" when only the CEFR is known. */
export function aspectLine(aspect) {
  if (aspect.score !== null && aspect.score !== undefined) return `${aspect.label} ${Math.round(aspect.score)}${aspect.cefr ? ` (${aspect.cefr})` : ""}`;
  return `${aspect.label} ${aspect.cefr}`;
}

// Small self-check for the rules that must not drift:
// question integrity, the level boundaries, the answer key staying server side,
// the seed migration, password hashing, attempt status, the database placeholders,
// the email transport, the AttCos client, the result WhatsApp message, the hosted settings,
// the first admin setup code, the background result delivery, and the certificate numbers and templates.
// Runs without a database.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  QUESTIONS,
  TOTAL_QUESTIONS,
  publicQuestions,
} from "@tnec/core/questions";
import { levelForScore } from "@tnec/core/levels";
import { buildResultEmail } from "@tnec/core/email";
import { hashPassword, verifyPassword, randomToken, sha256Hex } from "@tnec/core/crypto";
import { fillLegal, TERMS } from "@tnec/core/legal";
import { attemptStatus, focusStrikes } from "@tnec/core/store";
import { normalizeWhatsapp } from "@tnec/core/http";
import { sendWhatsApp, whatsappConfigured, buildResultWhatsApp, PLACEMENT_LEAD_SOURCE } from "@tnec/core/whatsapp";
import { runInBackground, drainDeliveries, deliverResult } from "@tnec/core/delivery";
import {
  mapSpeechaceResult, classifyFailure, afterFailure, speakingFacts, aspectLine, isFinalStatus,
} from "@tnec/core/speaking-result";
import { speakingType, retryDelays, SPEAKING_MAX_BYTES } from "@tnec/core/speaking";
import { numberPlaceholders } from "@tnec/core/db";
import { createMailer, parseAddress } from "@tnec/core/mailer";
import { buildEnv } from "@tnec/core/env";
import { announceSetup, createAdminHandler } from "../apps/admin/server.js";
import {
  BUILT_IN_FIELDS, CERT_DIR, TEMPLATES, englishDate, formatCertificateNumber, isIsoDate,
  numberFormatProblem, numberPattern, periodKey, renderCertificateHtml,
} from "../apps/admin/src/certificates.js";

/* ---------- Questions and levels ---------- */
assert.equal(TOTAL_QUESTIONS, 25);

for (const question of QUESTIONS) {
  assert.deepEqual(Object.keys(question.options), ["A", "B", "C", "D"]);
  assert.ok(question.options[question.answer], `Q${question.id} has no answer`);
}

const publicPayload = JSON.stringify(publicQuestions());
assert.equal(publicPayload.includes('"answer"'), false);

const boundaries = [
  [0, "starter"],
  [5, "starter"],
  [6, "basic"],
  [10, "basic"],
  [11, "intermediate"],
  [15, "intermediate"],
  [16, "advanced"],
  [19, "advanced"],
  [20, "toefl-prep"],
  [23, "toefl-prep"],
  [24, "toefl-scoring"],
  [25, "toefl-scoring"],
];

for (const [score, key] of boundaries) {
  assert.equal(levelForScore(score).key, key, `score ${score}`);
}

/* ---------- Seed migration matches the source questions ---------- */
const migration = readFileSync(new URL("../db/migrations/0001_init.sql", import.meta.url), "utf8");
const seeded = new Map();
for (const line of migration.split(/\r?\n/)) {
  const m = line.match(/^\((\d+), '(placement|pre|post)', \d+, .*, '([ABCD])', (\d+), '(aktif|draf)', EXTRACT/);
  if (m) seeded.set(Number(m[1]), { test: m[2], answer: m[3], status: m[5] });
}
for (const question of QUESTIONS) {
  const row = seeded.get(question.id);
  assert.ok(row, `seed has placement question ${question.id}`);
  assert.equal(row.test, "placement");
  assert.equal(row.answer, question.answer, `seed answer for Q${question.id}`);
  assert.equal(row.status, "aktif");
}
const drafts = [...seeded.values()].filter((r) => r.test !== "placement");
assert.ok(drafts.length >= 2 && drafts.every((r) => r.status === "draf"), "pre-test and post-test samples start as drafts");

/* ---------- Email ---------- */
const email = buildResultEmail({
  name: "<script>alert(1)</script>",
  email: "test@example.com",
  score: 18,
  total: 25,
  level: levelForScore(18),
});
assert.equal(email.html.includes("<script>"), false);
assert.ok(email.subject.includes("Advanced"));
assert.equal(/background:#E3201F;[^"]*text-align:center/i.test(email.html), false, "the email CTA is not red");

/* ---------- Passwords and tokens ---------- */
const { hash, salt, iterations } = await hashPassword("correct horse battery", null, 1000);
const user = { password_hash: hash, password_salt: salt, password_iter: iterations };
assert.equal(await verifyPassword("correct horse battery", user), true);
assert.equal(await verifyPassword("correct horse batterY", user), false);
assert.notEqual((await hashPassword("correct horse battery", null, 1000)).hash, hash, "salt is random");
assert.match(randomToken(24), /^[A-Za-z0-9_-]{32}$/);
assert.equal((await sha256Hex("abc")).length, 64);

/* ---------- Legal text follows the live settings ---------- */
const filled = fillLegal(TERMS, { total: 30, duration: "8 menit", strikes: 2, speakingSeconds: 45 });
const termsText = JSON.stringify(filled);
assert.ok(termsText.includes("30 soal") && termsText.includes("8 menit") && termsText.includes("ke-2"));
assert.ok(termsText.includes("45 detik"), "the speaking duration reaches the legal text");
assert.equal(termsText.includes("{{"), false);

/* ---------- Attempt status ---------- */
const now = 1_800_000_000;
const base = { status: "in_progress", started_at: now - 100, expires_at: now + 200, violation_log: "", max_violations: 3, voided_at: null, student_id: null, name: null };
assert.equal(attemptStatus(base, now), "progress");
assert.equal(attemptStatus({ ...base, expires_at: now - 60 }, now), "timeout");
assert.equal(attemptStatus({ ...base, violation_log: `${now - 50}:tab_hidden;${now - 40}:copy_attempt;${now - 30}:window_blur;${now - 20}:fullscreen_exit;` }, now), "violation");
assert.equal(focusStrikes(`${now}:copy_attempt;${now}:tab_hidden;`), 1);
assert.equal(attemptStatus({ ...base, status: "submitted" }, now), "nocontact");
assert.equal(attemptStatus({ ...base, status: "submitted", name: "Rani" }, now), "done");
assert.equal(attemptStatus({ ...base, status: "submitted", student_id: "stu_1", voided_at: now }, now), "void");

/* ---------- WhatsApp numbers ---------- */
assert.equal(normalizeWhatsapp("0812-3456-7890"), "6281234567890");
assert.equal(normalizeWhatsapp("+62 812 3456 7890"), "6281234567890");
assert.equal(normalizeWhatsapp("812 3456 7890"), "6281234567890");
assert.ok(!normalizeWhatsapp("12345"));

/* ---------- AttCos client with a stubbed fetch ---------- */
const env = { ATTCOS_API_KEY: "test-key", ATTCOS_CHANNEL_ID: "6a94705f-8df3-47e7-9262-639637209fc5", ATTCOS_API_BASE: "https://attcos.test/api/v1/" };
assert.equal(whatsappConfigured({}), false);
assert.equal((await sendWhatsApp({}, { to: "62812", text: "x" })).status, "skipped");

const realFetch = globalThis.fetch;
const calls = [];
const reply = (status, body) => async (url, init) => {
  calls.push({ url, init });
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
};
try {
  globalThis.fetch = reply(200, { success: true, data: { messageId: "msg_1", conversationId: "conv_1", channelId: env.ATTCOS_CHANNEL_ID } });
  const ok = await sendWhatsApp(env, { to: "+6281234567890", text: "Halo" });
  assert.deepEqual([ok.ok, ok.status, ok.messageId], [true, "sent", "msg_1"]);
  assert.equal(calls[0].url, "https://attcos.test/api/v1/messages");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(calls[0].init.body), { to: "6281234567890", channelId: env.ATTCOS_CHANNEL_ID, text: "Halo" }, "dashboard messages carry no lead source");
  await sendWhatsApp(env, { to: "+6281234567890", text: "Hasil", source: PLACEMENT_LEAD_SOURCE });
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { to: "6281234567890", channelId: env.ATTCOS_CHANNEL_ID, text: "Hasil", source: "Placement Test" }, "the result message names its lead source");

  globalThis.fetch = reply(422, { success: false, error: { code: "WINDOW_CLOSED", message: "window closed" } });
  const closed = await sendWhatsApp(env, { to: "6281234567890", text: "Halo" });
  assert.equal(closed.ok, false);
  assert.equal(closed.httpStatus, 422);
  assert.ok(closed.error.includes("24 jam"));

  globalThis.fetch = async () => { throw new TypeError("network down"); };
  const down = await sendWhatsApp(env, { to: "6281234567890", text: "Halo" });
  assert.equal(down.status, "failed");

  // The automatic result message uses a shorter wait, so a slow AttCos cannot hold the result screen.
  globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const slow = await sendWhatsApp(env, { to: "6281234567890", text: "Halo", timeoutMs: 300 });
  assert.equal(slow.status, "failed");
  assert.ok(slow.error.includes("belum merespons"));
} finally {
  globalThis.fetch = realFetch;
}

/* ---------- Result message for WhatsApp ---------- */
const waResult = buildResultWhatsApp({ name: "Rani Putri Lestari", score: 18, total: 25, level: levelForScore(18) });
assert.ok(waResult.startsWith("Halo Rani,"), "greets by first name");
assert.ok(waResult.includes("Skor kamu 18 dari 25") && waResult.includes(`*${levelForScore(18).label}*`) && waResult.includes(`*${levelForScore(18).program}*`));
assert.ok(waResult.includes("bukan sertifikat resmi"), "carries the no certificate line");
assert.equal(/[\u2013\u2014]/.test(waResult), false, "no en or em dash");

/* ---------- Database placeholders ---------- */
assert.equal(numberPlaceholders("SELECT ? AS a WHERE b = '?' AND c = ? AND d = 'it''s ?'"), "SELECT $1 AS a WHERE b = '?' AND c = $2 AND d = 'it''s ?'");
assert.equal(numberPlaceholders("UPDATE t SET a = ?, b = ? WHERE id IN (?, ?)"), "UPDATE t SET a = $1, b = $2 WHERE id IN ($3, $4)");

/* ---------- Email transport ---------- */
assert.deepEqual(parseAddress("Titik Nol English Course <placement@index-now.dev>"), { address: "placement@index-now.dev", name: "Titik Nol English Course" });
assert.deepEqual(parseAddress("placement@index-now.dev"), { address: "placement@index-now.dev" });
assert.equal(createMailer({}), null, "no token means no mailer");
const sent = [];
const mailer = createMailer({ CLOUDFLARE_EMAIL_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "acc" }, async (url, init) => {
  sent.push({ url, init });
  return new Response(JSON.stringify({ success: true, result: { id: "m1" } }), { status: 200 });
});
await mailer.send({ from: "TNEC <placement@index-now.dev>", to: "rani@example.com", subject: "Hasil", html: "<p>x</p>", text: "x" });
assert.equal(sent[0].url, "https://api.cloudflare.com/client/v4/accounts/acc/email/sending/send");
assert.equal(sent[0].init.headers.Authorization, "Bearer t");
assert.deepEqual(JSON.parse(sent[0].init.body).from, { address: "placement@index-now.dev", name: "TNEC" });
const failing = createMailer({ CLOUDFLARE_EMAIL_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "acc" }, async () => new Response(JSON.stringify({ success: false, errors: [{ message: "domain not verified" }] }), { status: 403 }));
await assert.rejects(() => failing.send({ from: "a@b.co", to: "c@d.co", subject: "s", text: "t" }), /domain not verified/);

/* ---------- Hosted settings (no connection is opened) ---------- */
const hosted = buildEnv({
  DATABASE_URL: "postgresql://u:p@db.example.test/x?sslmode=require",
  ADMIN_SETUP_CODE: " abcd2345efgh ",
  TRUST_PROXY: "1",
  PUBLIC_WEB_URL: "https://tes.example.test/",
});
assert.equal(hosted.ADMIN_SETUP_CODE, "ABCD2345EFGH");
assert.equal(hosted.TRUST_PROXY, true);
assert.equal(hosted.PUBLIC_WEB_URL, "https://tes.example.test");
await hosted.DB.close();

/* ---------- First admin setup code from ADMIN_SETUP_CODE, from a non-local address ---------- */
const noAdmins = {
  DB: { prepare: () => ({ first: async () => ({ n: 0 }) }) },
  ADMIN_SETUP_CODE: hosted.ADMIN_SETUP_CODE,
  ADMIN_URL: "https://admin.example.test",
};
const quiet = console.log;
console.log = () => {};
try { await announceSetup(noAdmins); } finally { console.log = quiet; }
const setupPost = (body) => ({
  method: "POST",
  url: "https://admin.example.test/api/admin/setup",
  headers: new Headers({ origin: "https://admin.example.test", "content-type": "application/json" }),
  async text() { return JSON.stringify(body); },
});
const adminHandler = createAdminHandler();
const remote = { remoteAddress: "10.0.0.5" };
assert.equal((await adminHandler(setupPost({ code: "WRONG2345", name: "A" }), noAdmins, remote)).status, 403, "a wrong setup code is refused");
assert.equal((await adminHandler(setupPost({ code: "abcd2345efgh", name: "A" }), noAdmins, remote)).status, 400, "the fixed code passes, then the short name is refused");

/* ---------- Background result delivery ---------- */
const leaseHeld = { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
assert.equal(await deliverResult(leaseHeld, "attempt"), null, "nothing is sent while another server holds the lease");

// A result whose recording is still being scored waits, whatever the email status says.
// The stub answers only the speaking SELECT; the delivery claim itself finds nothing.
function speakingStub(row) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              first: async () => (sql.startsWith("SELECT status, cefr_overall") ? row : null),
            };
          },
        };
      },
    },
  };
}
assert.equal(await deliverResult(speakingStub({ status: "pending" }), "attempt"), null, "the result waits for the speaking score");
assert.equal(await deliverResult(speakingStub({ status: "graded", cefr_overall: "B2", ielts_overall: 6, scores: "{}", transcript: "" }), "attempt"), null, "a graded recording no longer blocks the claim, which finds nothing waiting");

/* ---------- Speaking: reading a Speechace response ---------- */const speechaceOk = {
  status: "success",
  request_id: "req_1",
  version: "9.17",
  speech_score: {
    transcript: "I like visiting <b>Bali</b> because the beaches are beautiful.",
    relevance: { class: "TRUE" },
    cefr_score: { pronunciation: "B2", fluency: "B2", grammar: "B1", coherence: "B2", vocab: "B1", overall: "B2" },
    ielts_score: { pronunciation: 6.5, fluency: 6.5, grammar: 5.5, coherence: 6, vocab: 5.5, overall: 6 },
    speechace_score: { pronunciation: 78, fluency: 80, grammar: 62, coherence: 70, vocab: 64, overall: 72 },
    score_issue_list: [],
    grammar: { errors: [{ message: "Use 'because' to connect the reason." }], overall_metrics: {} },
    vocab: { overall_metrics: { word_specificity: { level: "low", message: "Use more specific nouns." } } },
    coherence: { overall_metrics: {} },
  },
};
const graded = mapSpeechaceResult(speechaceOk);
assert.equal(graded.cefr, "B2");
assert.equal(graded.ielts, 6);
assert.equal(graded.needsReview, false);
assert.equal(graded.transcript.includes("<"), false, "the transcript is plain text");
assert.deepEqual(graded.scores.aspects.pronunciation, { cefr: "B2", ielts: 6.5, score: 78 });
assert.deepEqual(graded.scores.notes, ["Use 'because' to connect the reason.", "Use more specific nouns."]);
assert.equal(graded.scores.relevance, "TRUE");

const tooShort = mapSpeechaceResult({
  ...speechaceOk,
  speech_score: {
    ...speechaceOk.speech_score,
    cefr_score: { ...speechaceOk.speech_score.cefr_score, overall: "A0" },
    score_issue_list: [{ short_message: "response_too_short", detail_message: "The response is less than 20 words." }],
  },
});
assert.equal(tooShort.needsReview, true, "a too short answer still scores, but is flagged");

/* ---------- Speaking: failures and retries ---------- */
assert.equal(classifyFailure({ error: Object.assign(new Error("x"), { name: "TimeoutError" }) }).retry, true);
assert.equal(classifyFailure({ httpStatus: 500, body: null }).retry, true);
assert.equal(classifyFailure({ httpStatus: 401, body: null }).retry, false);
assert.equal(classifyFailure({ httpStatus: 429, body: null }).retry, false);
assert.equal(classifyFailure({ httpStatus: 200, body: { short_message: "error_no_speech" } }).retry, false);
assert.equal(classifyFailure({ httpStatus: 200, body: { short_message: "non_dialect_language_detected" } }).retry, false);
const retryAt = 1_800_000_000;
const firstTry = afterFailure({ retry: true, code: "timeout", message: "Speechace belum menjawab." }, 1, retryAt, [60, 300]);
assert.equal(firstTry.status, "pending");
assert.equal(firstTry.nextAttemptAt, retryAt + 60);
const lastTry = afterFailure({ retry: true, code: "timeout", message: "Speechace belum menjawab." }, 3, retryAt, [60, 300]);
assert.equal(lastTry.status, "failed");
assert.equal(lastTry.needsReview, 1);
const refused = afterFailure({ retry: false, code: "error_no_speech", message: "Tidak ada suara." }, 1, retryAt, [60, 300]);
assert.equal(refused.status, "failed", "an error waiting cannot fix goes straight to the team");

/* ---------- Speaking: what the result email and WhatsApp say ---------- */
const facts = speakingFacts({ status: "graded", cefr_overall: "B2", ielts_overall: 6, transcript: "I like visiting Bali.", scores: JSON.stringify(graded.scores) });
assert.equal(facts.source, "auto", "the student-facing payload never names the vendor");
assert.equal(facts.aspects.length, 5);
assert.equal(aspectLine(facts.aspects[0]), "Pronunciation 78 (B2)");
assert.equal(speakingFacts({ status: "skipped", scores: "{}" }), null, "a skipped recording adds no speaking block");
const manualFacts = speakingFacts({
  status: "manual", cefr_overall: "B1", ielts_overall: null, transcript: "",
  scores: JSON.stringify({ source: "manual", overall: { cefr: "B1", ielts: null, score: null }, aspects: { grammar: { cefr: "B1" } }, note: "Bagus, tapi banyak jeda." }),
});
assert.equal(manualFacts.source, "manual");
assert.deepEqual(manualFacts.aspects.map((a) => a.label), ["Grammar"]);
assert.equal(aspectLine(manualFacts.aspects[0]), "Grammar B1");
assert.equal(isFinalStatus("pending"), false);
assert.equal(isFinalStatus("manual"), true);

const emailSpeaking = buildResultEmail({ name: "Rani", email: "rani@example.com", score: 13, total: 25, level: levelForScore(13), speaking: facts });
assert.ok(emailSpeaking.subject.includes("Speaking B2"));
assert.ok(emailSpeaking.html.includes("Pronunciation"));
assert.ok(emailSpeaking.text.includes("Speaking: CEFR B2, IELTS 6.0"));
assert.equal(emailSpeaking.html.includes("Speechace"), false, "the email never names the vendor");
assert.equal(emailSpeaking.text.includes("Speechace"), false, "the plain text email never names the vendor either");
assert.equal(emailSpeaking.html.includes("<b>Bali</b>"), false, "the transcript is escaped in the email");
const emailManual = buildResultEmail({ name: "Rani", email: "rani@example.com", score: 13, total: 25, level: levelForScore(13), speaking: manualFacts });
assert.ok(emailManual.text.includes("dinilai oleh tim Titik Nol"));

const waSpeaking = buildResultWhatsApp({ name: "Rani Putri Lestari", score: 13, total: 25, level: levelForScore(13), speaking: facts, resultUrl: "https://tes.example.test/?hasil=token123" });
assert.ok(waSpeaking.includes("\nSpeaking:\n"), "the WhatsApp header carries no vendor name");
assert.ok(waSpeaking.includes("CEFR B2, IELTS 6.0"));
assert.ok(waSpeaking.includes("Pronunciation 78 (B2)"));
assert.ok(waSpeaking.includes("Hasil lengkap: https://tes.example.test/?hasil=token123"));
assert.ok(waSpeaking.includes("bukan sertifikat resmi"));
assert.ok(waSpeaking.length <= 1000, "the WhatsApp result stays under 1,000 characters");
assert.equal(/[\u2013\u2014]/.test(waSpeaking), false, "no en or em dash");
const waPlainLink = buildResultWhatsApp({ name: "Rani", score: 13, total: 25, level: levelForScore(13), resultUrl: "https://tes.example.test/?hasil=token123" });
assert.ok(waPlainLink.includes("Hasil lengkap: https://tes.example.test/?hasil=token123"), "the result link reaches a student without speaking too");

/* ---------- The program cards and the result link ---------- */
import { programCards, publicLevel } from "@tnec/core/store";
const levelRows = [
  { key: "starter", label: "Starter", min: 0, max: 5, program: "Program Starter", programUrl: "https://titiknolenglish.com/product/general-english-offline/", programImage: "general.webp" },
  { key: "basic", label: "Basic", min: 6, max: 10, program: "Program Basic", programUrl: "https://titiknolenglish.com/product/general-english-offline/", programImage: "general.webp" },
  { key: "toefl-prep", label: "TOEFL/IELTS Preparation", min: 20, max: 23, program: "Kelas TOEFL/IELTS Preparation", programUrl: "https://titiknolenglish.com/product/toefl-preparation-itp-offline/", programImage: "toefl.webp" },
];
const cards = programCards(levelRows, "basic");
assert.equal(cards.length, 2, "one card per distinct product page");
assert.equal(cards[0].url, "https://titiknolenglish.com/product/general-english-offline/", "the recommended card comes first");
assert.equal(cards[0].recommended, true);
assert.equal(cards[0].levelLabel, "Basic");
assert.equal(cards[0].levels.join(","), "Starter,Basic");
assert.equal(cards[1].recommended, undefined);
assert.equal(programCards([{ key: "x", label: "X", program: "P", programUrl: "", programImage: "" }], "x").length, 0, "levels without a url render no cards");
const publicIntermediate = publicLevel({ key: "intermediate", label: "Intermediate", program: "Program Intermediate", programUrl: "https://titiknolenglish.com/product/general-english-offline/", programImage: "general.webp" });
assert.equal(publicIntermediate.programUrl, "https://titiknolenglish.com/product/general-english-offline/");
const emailWithLink = buildResultEmail({ name: "Rani", email: "rani@example.com", score: 13, total: 25, level: levelForScore(13), speaking: facts, resultUrl: "https://tes.example.test/?hasil=token123" });
assert.ok(emailWithLink.html.includes("https://tes.example.test/?hasil=token123"), "the email links to the result page");
assert.ok(emailWithLink.text.includes("Hasil lengkap kamu: https://tes.example.test/?hasil=token123"));
assert.ok(emailWithLink.html.includes("Buka hasil lengkap di web"));
const emailNoLink = buildResultEmail({ name: "Rani", email: "rani@example.com", score: 13, total: 25, level: levelForScore(13) });
assert.equal(emailNoLink.html.includes("Halaman hasil lengkap"), false, "without a token the panel stays away");

/* ---------- Pendaftaran: the shared rules ---------- */
import { latestPendaftaran, daftarCount, isColdLead, normalizeBirthDate, normalizeOption, LEAD_COLD_DAYS } from "@tnec/core/pendaftaran";
const pdfRows = [
  { status: "aktif", registered_at: 1_700_000_000, program_id: "prg_a" },
  { status: "batal", registered_at: 1_710_000_000, program_id: "prg_b" },
  { status: "selesai", registered_at: 1_720_000_000, program_id: "prg_c" },
];
const latest = latestPendaftaran(pdfRows);
assert.equal(latest.program_id, "prg_c", "a cancelled row never becomes the latest");
assert.equal(latestPendaftaran([{ status: "batal", registered_at: 5 }]), null);
assert.equal(daftarCount(pdfRows), 2, "cancelled rows still count as a registration");
assert.equal(daftarCount([]), 0);
assert.equal(isColdLead({ stage: "baru" }, 1_000_000, 1_000_000 + (LEAD_COLD_DAYS + 1) * 86400), true, "a lead untouched past 90 days goes cold");
assert.equal(isColdLead({ stage: "baru" }, 1_000_000, 1_000_000 + (LEAD_COLD_DAYS - 1) * 86400), false);
assert.equal(isColdLead({ stage: "lepas" }, 1, 1_000_000_000), false, "lepas is never cold");
assert.equal(normalizeBirthDate("2005-08-17"), "2005-08-17");
assert.equal(normalizeBirthDate(""), "");
assert.equal(normalizeBirthDate("17-08-2005"), null);
assert.equal(normalizeBirthDate("2005-02-30"), null, "31 February does not exist");
assert.equal(normalizeBirthDate("3000-01-01"), null, "a birthdate in the future is refused");
assert.equal(normalizeOption("S1", ["SD", "SMP", "SMA/SMK", "D3", "S1", "S2", "S3"]), "S1");
assert.equal(normalizeOption("", ["S1"]), "");
assert.equal(normalizeOption("S4", ["S1"]), null);


assert.equal(SPEAKING_MAX_BYTES, 3 * 1024 * 1024);
assert.equal(speakingType("audio/webm;codecs=opus"), "audio/webm");
assert.equal(speakingType("Audio/MP4"), "audio/mp4");
assert.equal(speakingType("audio/x-wav"), "audio/wav");
assert.equal(speakingType("audio/mpeg"), null, "mp3 is refused, the recorder never produces it");
assert.deepEqual(retryDelays({ SPEAKING_RETRY_SECONDS: "5, 10" }), [5, 10]);
assert.deepEqual(retryDelays({}), [60, 300]);

/* ---------- IELTS mockup: text answers, band conversion, and band rounding ---------- */
import { normalizeTextAnswer, bandForRaw, overallBand } from "@tnec/core/bands";

assert.equal(normalizeTextAnswer("  Radio   Programme! "), "radio programme");
assert.equal(normalizeTextAnswer("LS14 2JW"), "ls14 2jw");
assert.equal(normalizeTextAnswer("a-radio-program"), "a radio program");
assert.equal(normalizeTextAnswer(""), "");
const scale = Array.from({ length: 41 }, (_, raw) => ({ raw, band: raw >= 39 ? 9 : raw >= 37 ? 8.5 : raw >= 35 ? 8 : raw >= 32 ? 7.5 : raw >= 30 ? 7 : raw >= 26 ? 6.5 : raw >= 23 ? 6 : raw >= 18 ? 5.5 : raw >= 16 ? 5 : raw >= 13 ? 4.5 : raw >= 10 ? 4 : raw >= 8 ? 3.5 : raw >= 6 ? 3 : raw >= 4 ? 2.5 : raw >= 3 ? 2 : raw >= 2 ? 1.5 : raw >= 1 ? 1 : 0 }));
assert.equal(bandForRaw(scale, 40), 9);
assert.equal(bandForRaw(scale, 38), 8.5);
assert.equal(bandForRaw(scale, 24), 6);
assert.equal(bandForRaw(scale, 0), 0);
assert.equal(bandForRaw([], 20), 0, "a missing scale scores zero, never throws");
assert.equal(overallBand([6, 5.5]), 6, "the mean rounds to the nearest half");
assert.equal(overallBand([6.5, 5.5, 6, 7]), 6.5);
assert.equal(overallBand([6.25, 5.75]), 6);
assert.equal(overallBand([]), 0);

/* The dashboard bootstrap cache: round trip, TTL, and clear. */
const cacheStore = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
  setItem: (k, v) => cacheStore.set(k, String(v)),
  removeItem: (k) => cacheStore.delete(k),
};
const bootstrapCache = await import("../apps/admin/client/src/bootstrap-cache.js");
const cachedPayload = { me: { name: "Test" }, now: 1 };
bootstrapCache.writeBootstrapCache(cachedPayload);
assert.deepEqual(bootstrapCache.readBootstrapCache(), cachedPayload, "the bootstrap cache round trips");
assert.ok(cacheStore.get(bootstrapCache.BOOTSTRAP_CACHE).includes('"at"'));
bootstrapCache.clearBootstrapCache();
assert.equal(bootstrapCache.readBootstrapCache(), null, "the cache clears on logout or a 401");
cacheStore.set(bootstrapCache.BOOTSTRAP_CACHE, JSON.stringify({ at: Date.now() - 13 * 60 * 60 * 1000, data: cachedPayload }));
assert.equal(bootstrapCache.readBootstrapCache(), null, "a payload older than the 12 hour session is ignored");
delete globalThis.sessionStorage;

let finished = false;
runInBackground(() => new Promise((resolve) => setTimeout(() => { finished = true; resolve(); }, 150)));
const loud = console.error;
console.error = () => {};
try {
  await runInBackground(() => Promise.reject(new Error("provider down"))); // a failed send never throws
} finally {
  console.error = loud;
}
assert.equal(await drainDeliveries(2000), true, "a stopping server waits for running sends");
assert.equal(finished, true);

/* ---------- Certificate numbers, resets, templates, and escaping ---------- */
const certIso = "2026-11-15";
assert.equal(formatCertificateNumber("{nomor}/MoM/MKT/TNEC/{bulan_romawi}/{tahun}", { seq: 146, code: "MOM", iso: certIso }), "146/MoM/MKT/TNEC/XI/2026");
assert.equal(formatCertificateNumber("{nomor:3}/{kode}/{bulan:2}/{tahun}", { seq: 7, code: "TOEFL", iso: "2026-03-01" }), "007/TOEFL/03/2026");
assert.equal(formatCertificateNumber("{Nomor:2}-{KODE}", { seq: 1234, code: "C", iso: certIso }), "1234-C", "tokens ignore case and padding never cuts digits");
assert.equal(periodKey("tahun", certIso), "2026");
assert.equal(periodKey("bulan", certIso), "2026-11");
assert.equal(periodKey("tidak", certIso), "semua");
const formatCases = [
  ["{nomor}/{kode}/TNEC/{bulan_romawi}/{tahun}", "tahun", null],
  ["{nomor}/{kode}/{bulan_romawi}/{tahun}", "bulan", null],
  ["{nomor:4}/{kode}", "tidak", null],
  ["{kode}/{tahun}", "tahun", /\{nomor\}/],
  ["{nomor}/{kode}", "tahun", /\{tahun\}/],
  ["{nomor}/{tahun}", "bulan", /\{bulan\}/],
  ["{nomor}/{tanggal}", "tidak", /tidak dikenal/],
  ["{nomor}/{kode:2}", "tidak", /digit/],
  ["{nomor:9}", "tidak", /antara 1 dan 8/],
  ["   ", "tahun", /wajib/],
];
for (const [format, reset, expected] of formatCases) {
  const problem = numberFormatProblem(format, reset);
  if (expected) assert.match(problem || "", expected, `${format} with reset ${reset}`);
  else assert.equal(problem, null, `${format} with reset ${reset}`);
}
assert.notEqual(numberPattern("{nomor}/{kode}/{tahun}", "TOEFL"), numberPattern("{nomor}/{kode}/{tahun}", "IELTS"));
assert.equal(numberPattern("{Nomor}/{kode}/{tahun}", "X"), numberPattern("{nomor}/X/{TAHUN}", "Y"), "two types that would print the same numbers are caught");
assert.equal(englishDate("2026-11-15"), "15 November 2026");
assert.equal(isIsoDate("2026-02-30"), false);
assert.equal(isIsoDate("2026-02-28"), true);

// The dashboard mirrors the number rules for its live preview, so both sides must agree.
const certMirror = readFileSync(new URL("../apps/admin/client/src/cert-number.js", import.meta.url), "utf8");
const mirrorSource = certMirror.slice(certMirror.indexOf("const CERT_RESETS"), certMirror.indexOf("/* ===================== end of the certificate number rules")).replaceAll("export ", "");
const clientRules = new Function("MONTHS_LONG", `${mirrorSource}; return { formatCertNumber, certFormatProblem, certPeriodKey };`)(Array(12).fill("Bulan"));
for (const [format, reset] of formatCases) {
  assert.equal(clientRules.certFormatProblem(format, reset), numberFormatProblem(format, reset), `dashboard and server agree on ${format}`);
  assert.equal(clientRules.certPeriodKey(reset, certIso), periodKey(reset, certIso));
  if (!numberFormatProblem(format, reset)) {
    assert.equal(clientRules.formatCertNumber(format, 146, "MOM", certIso), formatCertificateNumber(format, { seq: 146, code: "MOM", iso: certIso }));
  }
}

// The React dashboard build output is committed, so Render needs no build command. The smoke check
// guards against pushing a source change without rebuilding, and keeps the strict CSP possible.
const builtIndex = readFileSync(new URL("../apps/admin/public/admin/index.html", import.meta.url), "utf8");
const entry = builtIndex.match(/src="(\/admin\/assets\/[^"]+\.js)"/);
assert.ok(entry, "the dashboard build output exists");
assert.ok(existsSync(new URL(`../apps/admin/public${entry[1]}`, import.meta.url)), "the dashboard entry bundle exists on disk");
assert.equal(/<script(?![^>]*\bsrc=)/i.test(builtIndex), false, "the built dashboard uses no inline script");

// Every {{placeholder}} in a template is a built-in value or one of its fields, and every field shows up.
for (const [key, template] of Object.entries(TEMPLATES)) {
  const html = readFileSync(`${CERT_DIR}/${template.file}`, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const used = new Set([...html.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
  const known = new Set([...BUILT_IN_FIELDS, ...template.fields.map((f) => f.key)]);
  for (const name of used) assert.ok(known.has(name), `${key} template uses an unknown {{${name}}}`);
  for (const name of known) assert.ok(used.has(name), `${key} template never shows ${name}`);
  assert.equal(/<script|<style| style="/i.test(html), false, `${key} template needs no inline script or style`);
}

// Names are escaped, and a "$" in a value stays literal instead of acting as a replace pattern.
const certHtml = await renderCertificateHtml({
  templateKey: "toefl",
  values: { nomor: "1/TOEFL/TNEC/XI/2026", nama: "<script>alert(1)</script> $& $1", listening: "50", structure: "48", reading: "52", skor_akhir: "500", tanggal: "15 November 2026", penanda_tangan: "A", jabatan: "B" },
  title: "Rani $&", info: "Info", note: "Catatan", back: "/admin/", revoked: true,
});
assert.equal(certHtml.includes("<script>alert(1)</script>"), false);
assert.ok(certHtml.includes("&lt;script&gt;alert(1)&lt;/script&gt; $&amp; $1"));
assert.ok(certHtml.includes("<title>Rani $&amp;</title>"));
assert.ok(certHtml.includes('class="cert-void"'), "a cancelled certificate carries the DIBATALKAN mark");
assert.ok(certHtml.includes('href="logo.css"'), "the template keeps its relative stylesheet links");
assert.equal(/\{\{\w+\}\}/.test(certHtml), false, "no placeholder is left on the page");

console.log("smoke ok");

// Small self-check for the rules that must not drift:
// question integrity, the level boundaries, the answer key staying server side,
// the seed migration, password hashing, attempt status, the database placeholders,
// the email transport, the AttCos client, the result WhatsApp message, the hosted settings,
// the first admin setup code, the background result delivery, and the certificate numbers and templates.
// Runs without a database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const filled = fillLegal(TERMS, { total: 30, duration: "8 menit", strikes: 2 });
const termsText = JSON.stringify(filled);
assert.ok(termsText.includes("30 soal") && termsText.includes("8 menit") && termsText.includes("ke-2"));
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
const adminJs = readFileSync(new URL("../apps/admin/public/admin/assets/admin.js", import.meta.url), "utf8");
const mirrorSource = adminJs.slice(adminJs.indexOf("const CERT_RESETS"), adminJs.indexOf("/* ===================== Database"));
const clientRules = new Function("MONTHS_LONG", `${mirrorSource}; return { formatCertNumber, certFormatProblem, certPeriodKey };`)(Array(12).fill("Bulan"));
for (const [format, reset] of formatCases) {
  assert.equal(clientRules.certFormatProblem(format, reset), numberFormatProblem(format, reset), `dashboard and server agree on ${format}`);
  assert.equal(clientRules.certPeriodKey(reset, certIso), periodKey(reset, certIso));
  if (!numberFormatProblem(format, reset)) {
    assert.equal(clientRules.formatCertNumber(format, 146, "MOM", certIso), formatCertificateNumber(format, { seq: 146, code: "MOM", iso: certIso }));
  }
}

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

// Small self-check for the rules that must not drift:
// question integrity, the level boundaries, the answer key staying server side,
// the seed migration, password hashing, attempt status, the database placeholders,
// the email transport, the AttCos client, the hosted settings, and the first admin setup code.
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
import { sendWhatsApp, whatsappConfigured } from "@tnec/core/whatsapp";
import { numberPlaceholders } from "@tnec/core/db";
import { createMailer, parseAddress } from "@tnec/core/mailer";
import { buildEnv } from "@tnec/core/env";
import { announceSetup, createAdminHandler } from "../apps/admin/server.js";

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
  assert.deepEqual(JSON.parse(calls[0].init.body), { to: "6281234567890", channelId: env.ATTCOS_CHANNEL_ID, text: "Halo" });

  globalThis.fetch = reply(422, { success: false, error: { code: "WINDOW_CLOSED", message: "window closed" } });
  const closed = await sendWhatsApp(env, { to: "6281234567890", text: "Halo" });
  assert.equal(closed.ok, false);
  assert.equal(closed.httpStatus, 422);
  assert.ok(closed.error.includes("24 jam"));

  globalThis.fetch = async () => { throw new TypeError("network down"); };
  const down = await sendWhatsApp(env, { to: "6281234567890", text: "Halo" });
  assert.equal(down.status, "failed");
} finally {
  globalThis.fetch = realFetch;
}

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

console.log("smoke ok");

// Admin dashboard: protected pages under /admin and the JSON API under /api/admin.
// Sessions are random tokens in an HttpOnly cookie; only their SHA-256 hash is stored in the database.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError, json, readJson, nowSeconds, normalizeWhatsapp, isEmail, text, multiline, int } from "@tnec/core/http";
import { randomToken, sha256Hex, verifyPassword, hashPassword, DUMMY_USER } from "@tnec/core/crypto";
import { TEST_KEYS, TEST_NAMES, mapTest, mapQuestion, mapSection, mapPackage, loadQuestions, loadLevels, publicLevel, attemptStatus, focusStrikes, addActivity, newId } from "@tnec/core/store";
import { overallBand } from "@tnec/core/bands";
import { gradeWritingTask, writingBand } from "@tnec/core/writing";
import {
  latestPendaftaran, daftarCount, normalizeBirthDate, normalizeOption,
  JENJANG_PENDIDIKAN, TAHU_DARI, PENDAFTARAN_STATUS,
} from "@tnec/core/pendaftaran";
import { sendWhatsApp, whatsappConfigured, resetChannelCache } from "@tnec/core/whatsapp";
import { buildResultEmail, buildInviteEmail } from "@tnec/core/email";
import { parseRosterCsv, inviteWindow, formatWib, EMAIL_DAILY_LIMIT, mockupCode, pickPackage } from "@tnec/core/mockup-bulk";
import { staticResponse, textResponse } from "@tnec/core/node-server";
import { deliverInBackground, runInBackground } from "@tnec/core/delivery";
import { drainInviteQueue, emailsSentRecently } from "./invite-queue.js";
import { gradeInBackground, speechaceConfigured } from "@tnec/core/speaking";
import { ASPECTS, MANUAL_CEFR, isFinalStatus, speakingFacts, aggregateSpeakingFacts } from "@tnec/core/speaking-result";
import { mockupSpeakingPlan } from "@tnec/core/speaking-mockup";
import {
  CERT_DIR, certificateData, certificatePage, saveCertificateType, deleteCertificateType,
  issueCertificate, updateCertificate, certificateAction,
  uploadCertificatePdf, sendCertificateEmail, sendCertificateWhatsApp, certificatePdfByToken,
} from "./certificates.js";

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
// The manifest is read at request time: scripts/start.mjs imports this module before its build
// step runs, so a manifest read at import time would name the previous build's deleted files.
let adminManifest = null;
const manifestEntry = (entry) => {
  adminManifest ??= JSON.parse(readFileSync(resolve(PUBLIC_DIR, "admin/admin-manifest.json"), "utf8"));
  return adminManifest[entry];
};

/* The dashboard and login shells are built here from the hashed files the Node build wrote into
   admin-manifest.json. No HTML file is stored or served from disk. */
function adminShell(entry) {
  const { js, css } = manifestEntry(entry);
  const title = entry === "login" ? "Masuk | Dasbor Titik Nol" : "Dasbor Titik Nol";
  const bodyClass = entry === "login" ? ' class="login-page"' : "";
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${title}</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  ${css ? `<link rel="stylesheet" crossorigin href="${css}">` : ""}
  <script type="module" crossorigin src="${js}"></script>
</head>
<body${bodyClass}>
  <div id="root"></div>
  ${entry === "app" ? '<div class="menu" id="menu" role="menu" hidden></div>\n  <div class="toasts" id="toasts" role="status" aria-live="polite"></div>' : ""}
</body>
</html>`;
}

const SESSION_COOKIE = "tnec_admin";
const SESSION_TTL = 60 * 60 * 12;
const LOCK_AFTER = 5;
const LOCK_SECONDS = 15 * 60;
const INVITE_TTL = 14 * 24 * 60 * 60;
const STAGES = { baru: "Baru", dihubungi: "Dihubungi", konsultasi: "Konsultasi", terdaftar: "Terdaftar", lepas: "Tidak lanjut" };
const SOURCES = ["Placement test", "WhatsApp", "Instagram", "Datang langsung", "Rekomendasi alumni", "IELTS Mockup"];
const MODES = ["Offline di Pare", "Online", "Online dan offline"];
const SKILLS = ["Grammar", "Vocabulary", "Reading", "Listening", "Writing"];
const CHOICES = ["A", "B", "C", "D", "E", "F"];
const ADMIN_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
const ms = (s) => (s ? s * 1000 : null);
const WIB_OFFSET = 7 * 3600;
const dateToSeconds = (d) => Math.floor(Date.parse(`${d}T08:00:00+07:00`) / 1000);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const fmtDate = (sec) => {
  const d = new Date((sec + WIB_OFFSET) * 1000);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/* ===================== Pages ===================== */
export async function serveAdminPage(request, env, url) {
  const path = url.pathname;
  if (request.method !== "GET" && request.method !== "HEAD") return withHeaders(textResponse(405, "Metode tidak diizinkan."));
  if (path === "/" || path === "/admin") return Response.redirect(new URL("/admin/", url), 302);
  if (path.startsWith("/admin/assets/") || path.startsWith("/assets/") || path === "/favicon.png") {
    const file = await staticResponse(PUBLIC_DIR, path, { cacheControl: path === "/favicon.png" ? "public, max-age=86400" : "private, max-age=300" });
    return withHeaders(file || textResponse(404, "File tidak ditemukan."), null);
  }
  // The stylesheets and drawings of the certificate templates. The HTML templates are never served raw.
  const certAsset = path.match(/^\/admin\/certificates\/([\w.-]+\.(?:css|svg))$/);
  if (certAsset) {
    const file = await staticResponse(CERT_DIR, `/${certAsset[1]}`, { cacheControl: "private, max-age=300" });
    return withHeaders(file || textResponse(404, "File tidak ditemukan."), null);
  }
  // The uploaded certificate PDF behind its unguessable token, so AttCos can fetch it for the
  // WhatsApp document send. No session: the token is the secret, like the result link.
  const certFile = path.match(/^\/cert-file\/([A-Za-z0-9_-]{20,80})$/);
  if (certFile) {
    const file = await certificatePdfByToken(env, certFile[1]);
    return withHeaders(file || textResponse(404, "File tidak ditemukan."), "no-store");
  }
  const user = await currentUser(request, env);
  // A printable certificate (crt_...) or a sample of a certificate type (ctp_...). The page sits
  // next to the template assets, so the templates' relative links to their CSS keep working.
  const certPage = path.match(/^\/admin\/certificates\/((?:crt|ctp)_[\w-]+)$/);
  if (certPage) {
    if (!user) return Response.redirect(new URL("/admin/login", url), 302);
    const html = await certificatePage(env, certPage[1]);
    if (!html) return withHeaders(textResponse(404, "Sertifikat tidak ditemukan."));
    return withHeaders(new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }));
  }
  if (path === "/admin/login" || path === "/admin/login/") {
    if (user) return Response.redirect(new URL("/admin/", url), 302);
    return withHeaders(new Response(adminShell("login"), { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  }
  if (path === "/admin/" || path === "/admin/index.html") {
    if (!user) return Response.redirect(new URL("/admin/login", url), 302);
    return withHeaders(new Response(adminShell("app"), { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  }
  return withHeaders(textResponse(404, "Halaman tidak ditemukan."));
}

function withHeaders(response, cache = "no-store") {
  const r = new Response(response.body, response);
  r.headers.set("Content-Security-Policy", ADMIN_CSP);
  r.headers.set("X-Frame-Options", "DENY");
  r.headers.set("X-Content-Type-Options", "nosniff");
  r.headers.set("Referrer-Policy", "same-origin");
  r.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (cache) r.headers.set("Cache-Control", cache);
  return r;
}

/* ===================== Session ===================== */
function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
// Secure is set on HTTPS and on localhost (browsers accept it there). Plain HTTP on another host
// would drop a Secure cookie, so it is left off there; put the admin app behind HTTPS in production.
function secureFor(request) {
  const url = new URL(request.url);
  return url.protocol === "https:" || url.hostname === "localhost";
}
const sessionCookie = (token, maxAge, secure) => `${SESSION_COOKIE}=${token}; Path=/; HttpOnly;${secure ? " Secure;" : ""} SameSite=Strict; Max-Age=${maxAge}`;

// Session lookups are cached for a minute so every dashboard request does not hit the database.
const SESSION_CACHE_MS = 60_000;
const sessionCache = new Map();

async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || token.length < 20 || token.length > 100) return null;
  const tokenHash = await sha256Hex(token);
  const hit = sessionCache.get(tokenHash);
  if (hit && hit.until > Date.now()) return hit.user;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, s.expires_at FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.active = 1`,
  ).bind(tokenHash).first();
  if (!row || row.expires_at < nowSeconds()) {
    sessionCache.delete(tokenHash);
    return null;
  }
  const user = { id: row.id, email: row.email, name: row.name, role: row.role, tokenHash };
  if (sessionCache.size > 500) sessionCache.clear();
  sessionCache.set(tokenHash, { user, until: Math.min(Date.now() + SESSION_CACHE_MS, row.expires_at * 1000) });
  return user;
}

function checkOrigin(request, url) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (!origin || origin !== url.origin) throw new HttpError(403, "Permintaan ditolak karena asalnya tidak dikenal.");
}

async function login(request, env) {
  const body = await readJson(request, 4096);
  const email = text(body.email, 160).toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) throw new HttpError(400, "Isi email dan kata sandi.");
  const user = await env.DB.prepare("SELECT * FROM admin_users WHERE email = ?").bind(email).first();
  const now = nowSeconds();
  // Dummy verify for unknown or inactive emails so both 401 branches cost one KDF and
  // response time never reveals which staff emails have accounts.
  if (!user || !user.active) {
    await verifyPassword(password, DUMMY_USER);
    throw new HttpError(401, "Email atau kata sandi salah.");
  }
  if (user.locked_until && user.locked_until > now) {
    throw new HttpError(429, `Akun ini terkunci sementara karena terlalu banyak percobaan masuk. Coba lagi dalam ${Math.ceil((user.locked_until - now) / 60)} menit.`);
  }
  if (!(await verifyPassword(password, user))) {
    // The increment must be atomic in SQL: a JavaScript-side counter from a pre-read row
    // collapses concurrent wrong passwords into about one failure per wave, so parallel
    // guessing would never reach LOCK_AFTER.
    const failed = await env.DB.prepare(
      "UPDATE admin_users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= ? THEN ? ELSE locked_until END WHERE id = ? RETURNING failed_logins"
    ).bind(LOCK_AFTER, now + LOCK_SECONDS, user.id).first();
    if (failed.failed_logins >= LOCK_AFTER) {
      await env.DB.prepare("UPDATE admin_users SET failed_logins = 0 WHERE id = ?").bind(user.id).run();
    }
    throw new HttpError(401, "Email atau kata sandi salah.");
  }
  const token = randomToken(32);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO admin_sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256Hex(token), user.id, now, now + SESSION_TTL, (request.headers.get("user-agent") || "").slice(0, 200)),
    env.DB.prepare("UPDATE admin_users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?").bind(now, user.id),
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").bind(now),
  ]);
  return json({ ok: true, user: { name: user.name, email: user.email, role: user.role } }, 200, { "Set-Cookie": sessionCookie(token, SESSION_TTL, secureFor(request)) });
}

async function logout(request, env, user) {
  sessionCache.delete(user.tokenHash);
  await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(user.tokenHash).run();
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0, secureFor(request)) });
}

/* ===================== First admin account ===================== */
// While no admin exists, the login page offers to create the first account. From this computer
// (localhost) no code is needed; from anywhere else the setup code printed in the server log is.
let setupCode = null;
export function setSetupCode(code) { setupCode = code; }
export async function adminCount(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_users").first();
  return r ? r.n : 0;
}
function isLocalRequest(request, ctx) {
  const ip = String(ctx?.remoteAddress || "");
  const loopback = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  const host = new URL(request.url).hostname;
  return loopback && !request.headers.get("x-forwarded-for") && ["localhost", "127.0.0.1", "[::1]"].includes(host);
}
async function setupStatus(request, env, ctx) {
  const needed = (await adminCount(env)) === 0;
  return json({ needed, local: needed && isLocalRequest(request, ctx) });
}
async function setupFirstAdmin(request, env, ctx) {
  const body = await readJson(request, 4096);
  if ((await adminCount(env)) > 0) throw new HttpError(409, "Akun admin sudah ada. Masuk dengan akun tersebut.");
  if (!isLocalRequest(request, ctx) && (!setupCode || String(body.code || "").trim().toUpperCase() !== setupCode)) {
    throw new HttpError(403, "Kode setup salah. Kode ada di log server saat aplikasi admin dijalankan.", { field: "code" });
  }
  const name = text(body.name, 80);
  const email = text(body.email, 160).toLowerCase();
  const password = String(body.password || "");
  if (name.length < 2) throw new HttpError(400, "Nama minimal 2 karakter.", { field: "name" });
  if (!isEmail(email)) throw new HttpError(400, "Format email belum benar.", { field: "email" });
  if (password.length < 12) throw new HttpError(400, "Kata sandi minimal 12 karakter.", { field: "password" });
  const { hash, salt, iterations } = await hashPassword(password);
  const id = `adm_${randomToken(9)}`;
  const now = nowSeconds();
  const token = randomToken(32);
  // The setup serializes on a transaction-scoped advisory lock: under READ COMMITTED the
  // WHERE NOT EXISTS probe alone cannot see an uncommitted competitor, so two concurrent
  // setups would both create an admin (audit finding admin-auth/setup-race-double-admin).
  // The lock is the pattern migrate.js already uses.
  const [created] = await env.DB.batch([
    env.DB.prepare("SELECT pg_advisory_xact_lock(9401)"),
    env.DB.prepare(`INSERT INTO admin_users (id, email, name, role, password_hash, password_salt, password_iter, created_at)
                    SELECT ?, ?, ?, 'admin', ?, ?, ?::integer, ?::bigint WHERE NOT EXISTS (SELECT 1 FROM admin_users)`)
      .bind(id, email, name, hash, salt, iterations, now),
  ]);
  if (!created.meta.changes) throw new HttpError(409, "Akun admin sudah dibuat dari tempat lain. Masuk dengan akun tersebut.");
  await env.DB.prepare("INSERT INTO admin_sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), id, now, now + SESSION_TTL, (request.headers.get("user-agent") || "").slice(0, 200)).run();
  setupCode = null;
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token, SESSION_TTL, secureFor(request)) });
}

/* ===================== Router ===================== */
const ROUTES = [
  ["GET", /^\/api\/admin\/bootstrap$/, bootstrap],
  ["POST", /^\/api\/admin\/logout$/, logout],
  ["POST", /^\/api\/admin\/students$/, createStudent],
  ["POST", /^\/api\/admin\/students\/bulk$/, bulkStudents],
  ["GET", /^\/api\/admin\/students\/([\w-]+)$/, getStudent],
  ["PATCH", /^\/api\/admin\/students\/([\w-]+)$/, updateStudent],
  ["DELETE", /^\/api\/admin\/students\/([\w-]+)$/, deleteStudent],
  ["POST", /^\/api\/admin\/students\/([\w-]+)\/notes$/, addNote],
  ["POST", /^\/api\/admin\/students\/([\w-]+)\/whatsapp$/, sendStudentWhatsApp],
  ["POST", /^\/api\/admin\/students\/([\w-]+)\/invite$/, createInvite],
  ["POST", /^\/api\/admin\/mockup\/sessions$/, saveMockupSession],
  ["GET", /^\/api\/admin\/mockup\/students$/, searchMockupStudents],
  ["PUT", /^\/api\/admin\/mockup\/sessions\/([\w-]+)$/, saveMockupSession],
  ["POST", /^\/api\/admin\/mockup\/sessions\/([\w-]+)\/import$/, previewSessionImport],
  ["POST", /^\/api\/admin\/mockup\/sessions\/([\w-]+)\/import\/confirm$/, confirmSessionImport],
  ["POST", /^\/api\/admin\/mockup\/sessions\/([\w-]+)\/send$/, sendSessionQueue],
  ["POST", /^\/api\/admin\/mockup\/sessions\/([\w-]+)\/pause$/, pauseSessionQueue],
  ["POST", /^\/api\/admin\/mockup\/sessions\/([\w-]+)\/test-send$/, testSendSessionMessage],
  ["GET", /^\/api\/admin\/mockup\/sessions\/([\w-]+)\/roster$/, getSessionRoster],
  ["POST", /^\/api\/admin\/mockup\/invites\/([\w-]+)\/retry$/, retryInviteChannel],
  ["POST", /^\/api\/admin\/mockup\/invites\/([\w-]+)\/move$/, moveInviteToSession],
  ["POST", /^\/api\/admin\/pendaftaran$/, createPendaftaran],
  ["PUT", /^\/api\/admin\/pendaftaran\/([\w-]+)$/, updatePendaftaran],
  ["PUT", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)$/, updateTestSettings],
  ["POST", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/questions$/, createQuestion],
  ["PUT", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/questions\/(\d+)$/, updateQuestion],
  ["DELETE", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/questions\/(\d+)$/, deleteQuestion],
  ["POST", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/questions\/(\d+)\/(up|down|duplicate|toggle)$/, questionAction],
  ["POST", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/apply-seconds$/, applySeconds],
  ["POST", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/sections$/, createSection],
  ["PUT", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/sections\/([\w-]+)$/, updateSection],
  ["DELETE", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/sections\/([\w-]+)$/, deleteSection],
  ["POST", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/packages$/, createPackage],
  ["PUT", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/packages\/([\w-]+)$/, updatePackage],
  ["PUT", /^\/api\/admin\/levels$/, updateLevels],
  ["GET", /^\/api\/admin\/attempts\/([0-9a-f-]{36})$/, getAttemptDetail],
  ["POST", /^\/api\/admin\/attempts\/([0-9a-f-]{36})\/(void|restore|resend-email)$/, attemptAction],
  ["POST", /^\/api\/admin\/attempts\/([0-9a-f-]{36})\/writing-grade$/, regradeWriting],
  ["POST", /^\/api\/admin\/attempts\/([0-9a-f-]{36})\/speaking-retry$/, retryMockupSpeaking],
  ["GET", /^\/api\/admin\/speaking-answers\/(\d+)\/audio$/, getSpeakingAnswerAudio],
  ["POST", /^\/api\/admin\/speaking-questions$/, saveSpeakingQuestion],
  ["PUT", /^\/api\/admin\/speaking-questions\/(\d+)$/, saveSpeakingQuestion],
  ["DELETE", /^\/api\/admin\/speaking-questions\/(\d+)$/, deleteSpeakingQuestion],
  ["POST", /^\/api\/admin\/speaking-questions\/(\d+)\/(up|down)$/, moveSpeakingQuestion],
  ["DELETE", /^\/api\/admin\/attempts\/([0-9a-f-]{36})$/, deleteAttempt],
  ["POST", /^\/api\/admin\/attempts\/bulk-delete$/, bulkDeleteAttempts],
  ["POST", /^\/api\/admin\/programs$/, saveProgram],
  ["PUT", /^\/api\/admin\/programs\/([\w-]+)$/, saveProgram],
  ["DELETE", /^\/api\/admin\/programs\/([\w-]+)$/, deleteProgram],
  ["POST", /^\/api\/admin\/periods$/, savePeriod],
  ["PUT", /^\/api\/admin\/periods\/([\w-]+)$/, savePeriod],
  ["DELETE", /^\/api\/admin\/periods\/([\w-]+)$/, deletePeriod],
  ["POST", /^\/api\/admin\/classes$/, saveClass],
  ["PUT", /^\/api\/admin\/classes\/([\w-]+)$/, saveClass],
  ["DELETE", /^\/api\/admin\/classes\/([\w-]+)$/, deleteClass],
  ["POST", /^\/api\/admin\/tutors$/, createTutor],
  ["DELETE", /^\/api\/admin\/tutors\/([\w-]+)$/, deleteTutor],
  ["POST", /^\/api\/admin\/certificate-types$/, saveCertificateType],
  ["PUT", /^\/api\/admin\/certificate-types\/([\w-]+)$/, saveCertificateType],
  ["DELETE", /^\/api\/admin\/certificate-types\/([\w-]+)$/, deleteCertificateType],
  ["GET", /^\/api\/admin\/whatsapp-channels$/, listWhatsAppChannels],
  ["PUT", /^\/api\/admin\/whatsapp-channels\/(\w+)$/, saveWhatsAppChannel],
  ["POST", /^\/api\/admin\/whatsapp-channels\/(\w+)\/test$/, testWhatsAppChannel],
  ["GET", /^\/api\/admin\/staff$/, listStaff],
  ["POST", /^\/api\/admin\/staff$/, createStaff],
  ["PUT", /^\/api\/admin\/staff\/([\w-]+)\/(active|password|role)$/, updateStaff],
  ["POST", /^\/api\/admin\/certificates$/, issueCertificate],
  ["PUT", /^\/api\/admin\/certificates\/([\w-]+)$/, updateCertificate],
  ["POST", /^\/api\/admin\/certificates\/([\w-]+)\/pdf$/, uploadCertificatePdf],
  ["POST", /^\/api\/admin\/certificates\/([\w-]+)\/(send-email|send-whatsapp|revoke|restore)$/, certificateSendOrAction],
  ["GET", /^\/api\/admin\/speaking\/([\w-]+)\/audio$/, speakingAudio],
  ["POST", /^\/api\/admin\/speaking\/([\w-]+)\/grade$/, gradeSpeaking],
  ["POST", /^\/api\/admin\/speaking\/([\w-]+)\/(retry|skip|reviewed)$/, speakingAction],
];

export async function handleAdmin(request, env, url, ctx) {
  try {
    return await handleAdminApi(request, env, url, ctx);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, ...error.extra }, error.status);
    console.error("admin api", error);
    return json({ error: "Terjadi kesalahan pada server." }, 500);
  }
}

async function handleAdminApi(request, env, url, ctx) {
  checkOrigin(request, url);
  if (url.pathname === "/api/admin/login" && request.method === "POST") return login(request, env);
  if (url.pathname === "/api/admin/setup" && request.method === "GET") return setupStatus(request, env, ctx);
  if (url.pathname === "/api/admin/setup" && request.method === "POST") return setupFirstAdmin(request, env, ctx);
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "Sesi kamu sudah berakhir. Masuk lagi untuk melanjutkan.", { code: "auth" });
  // Tutor is a read-only role on the server: every write route is refused with 403, whatever the
  // client shows. Staff management routes also stay owner-only.
  if (user.role === "tutor" && request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(403, "Akun Tutor hanya bisa melihat data, tidak mengubahnya.");
  }
  if (user.role !== "admin" && /^\/api\/admin\/(staff|whatsapp-channels)/.test(url.pathname)) {
    throw new HttpError(403, "Hanya Administrator yang boleh membuka pengaturan ini.");
  }
  for (const [method, pattern, handler] of ROUTES) {
    if (method !== request.method) continue;
    const m = url.pathname.match(pattern);
    if (m) return handler(request, env, user, url, ...m.slice(1));
  }
  throw new HttpError(404, "Endpoint tidak ditemukan.");
}

/* ===================== Bootstrap ===================== */
async function bootstrap(request, env, user, url) {
  const now = nowSeconds();
  const db = env.DB;
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
  // A tutor's bootstrap never carries other students: the class tutor link is the boundary, applied
  // on the server so the full student list never reaches the tutor's browser.
  let tutorStudentIds = null;
  if (user.role === "tutor") {
    const { results: tutorStudents } = await db.prepare(
      `SELECT DISTINCT s.id FROM students s
         JOIN pendaftaran pd ON pd.student_id = s.id AND pd.status != 'batal'
         JOIN classes c ON c.id = pd.class_id
        WHERE c.tutor_id = (SELECT t.id FROM tutors t WHERE t.name = ?)`,
    ).bind(user.name).all();
    tutorStudentIds = new Set(tutorStudents.map((r) => r.id));
    if (!tutorStudentIds.size) tutorStudentIds = new Set(["__tidak-ada__"]);
  }
  const statSql = `SELECT a.test_key, an.question_id, COUNT(*) AS n, SUM(an.is_correct) AS correct
    FROM answers an JOIN attempts a ON a.id = an.attempt_id
    WHERE a.status = 'submitted' AND a.voided_at IS NULL AND a.started_at >= ? GROUP BY a.test_key, an.question_id`;
  const [res, certificates] = await Promise.all([db.batch([
    stmt("SELECT * FROM tests"),
    stmt("SELECT * FROM questions ORDER BY test_key, position, id"),
    stmt("SELECT * FROM question_sections ORDER BY test_key, position, id"),
    stmt("SELECT * FROM question_packages ORDER BY test_key, position, id"),
    stmt("SELECT * FROM levels ORDER BY position"),
    tutorStudentIds
      ? stmt(`SELECT s.* FROM students s WHERE s.id IN (${[...tutorStudentIds].map(() => "?").join(",")}) ORDER BY s.created_at DESC`, ...tutorStudentIds)
      : stmt("SELECT * FROM students ORDER BY created_at DESC"),
    stmt(tutorStudentIds
      ? `SELECT a.id, a.test_key, a.student_id, 0 AS started_at, 0 AS expires_at, 0 AS submitted_at, a.status, a.score, a.total, a.level_key, a.name,
                 a.violation_log, a.duration_seconds, a.limit_seconds, a.max_violations, a.email_status, a.pass_score, a.passed,
                 a.voided_at, a.voided_by, a.void_reason, a.user_agent, a.country, a.bands, a.audio_played_at, a.package_id, a.writing_status, a.writing_error, a.speaking_status, a.speaking_error,
                 i.session_id AS invite_session_id
         FROM attempts a LEFT JOIN invites i ON i.id = a.invite_id
         WHERE 1 = 0`
      : `SELECT a.id, a.test_key, a.student_id, a.started_at, a.expires_at, a.submitted_at, a.status, a.score, a.total, a.level_key, a.name,
                 a.violation_log, a.duration_seconds, a.limit_seconds, a.max_violations, a.email_status, a.pass_score, a.passed,
                 a.voided_at, a.voided_by, a.void_reason, a.user_agent, a.country, a.bands, a.audio_played_at, a.package_id, a.writing_status, a.writing_error, a.speaking_status, a.speaking_error,
                 i.session_id AS invite_session_id
                 FROM attempts a LEFT JOIN invites i ON i.id = a.invite_id
                 WHERE a.test_key = 'ielts-mockup' AND i.session_id IS NULL AND i.id IS NOT NULL
                 ORDER BY a.started_at DESC LIMIT 5000`),
    stmt(tutorStudentIds
      ? `SELECT a.id, a.test_key, a.student_id, a.started_at, a.expires_at, a.submitted_at, a.status, a.score, a.total, a.level_key, a.name,
                  a.violation_log, a.duration_seconds, a.limit_seconds, a.max_violations, a.email_status, a.pass_score, a.passed,
                  a.voided_at, a.voided_by, a.void_reason, a.user_agent, a.country, a.bands, a.audio_played_at, a.package_id, a.writing_status, a.writing_error, a.speaking_status, a.speaking_error
           FROM attempts a WHERE a.student_id IN (${[...tutorStudentIds].map(() => "?").join(",")}) ORDER BY a.started_at DESC LIMIT 5000`
      : `SELECT id, test_key, student_id, started_at, expires_at, submitted_at, status, score, total, level_key, name,
                  violation_log, duration_seconds, limit_seconds, max_violations, email_status, pass_score, passed,
                  voided_at, voided_by, void_reason, user_agent, country, bands, audio_played_at, package_id, writing_status, writing_error, speaking_status, speaking_error FROM attempts
         WHERE test_key != 'ielts-mockup' OR invite_id IS NULL ORDER BY started_at DESC LIMIT 5000`,
      ...(tutorStudentIds ? [...tutorStudentIds] : [])),
    stmt(`SELECT s.*,
                 (SELECT COUNT(*) FROM invites i WHERE i.session_id = s.id) AS roster,
                 (SELECT COUNT(*) FROM mockup_invite_queue q JOIN invites i ON i.id = q.invite_id WHERE i.session_id = s.id AND q.wa_status = 'sent') AS wa_sent,
                 (SELECT COUNT(*) FROM mockup_invite_queue q JOIN invites i ON i.id = q.invite_id WHERE i.session_id = s.id AND q.email_status = 'sent') AS email_sent,
                 (SELECT COUNT(*) FROM invites i JOIN attempts a ON a.invite_id = i.id WHERE i.session_id = s.id AND a.submitted_at IS NOT NULL) AS done
                 FROM mockup_sessions s ORDER BY s.created_at DESC, s.id`),
    stmt(`SELECT (SELECT COUNT(*) FROM attempts WHERE email_sent_at > ?) + (SELECT COUNT(*) FROM mockup_invite_queue WHERE email_sent_at > ?) AS sent`,
      now - 24 * 3600, now - 24 * 3600),
    stmt("SELECT student_id, MAX(at) AS last_at FROM activities GROUP BY student_id"),
    stmt("SELECT MIN(registered_at) AS at FROM pendaftaran WHERE status != 'batal' GROUP BY student_id"),
    stmt("SELECT * FROM programs ORDER BY name"),
    stmt("SELECT * FROM program_durations ORDER BY program_id, position"),
    stmt("SELECT pt.program_id, t.name FROM program_tutors pt JOIN tutors t ON t.id = pt.tutor_id"),
    stmt("SELECT * FROM tutors ORDER BY name"),
    stmt("SELECT * FROM periods ORDER BY start_date"),
    stmt("SELECT c.*, t.name AS tutor_name FROM classes c JOIN tutors t ON t.id = c.tutor_id ORDER BY c.code"),
    stmt(statSql, now - 7 * 86400),
    stmt(statSql, now - 30 * 86400),
    stmt(`SELECT id, attempt_id, status, needs_review, cefr_overall, ielts_overall, graded_at, created_at
            FROM speaking_submissions ORDER BY created_at DESC LIMIT 5000`),
    stmt(tutorStudentIds
      ? `SELECT * FROM pendaftaran WHERE student_id IN (${[...tutorStudentIds].map(() => "?").join(",")}) ORDER BY registered_at, id`
      : "SELECT * FROM pendaftaran ORDER BY registered_at, id",
      ...(tutorStudentIds ? [...tutorStudentIds] : [])),
    stmt("SELECT session_id, package_id FROM mockup_session_packages"),
    stmt("SELECT id, position, prompt, status FROM speaking_questions ORDER BY position, id"),
  ]), certificateData(env)]);
  const [tests, questions, sections, packages, levels, students, strayAttempts, attempts, sessions, emailUse, lastActs, enrolled, programs, durations, programTutors, tutors, periods, classes, s7, s30, speaking, pendaftaran, sessionPkgs, speakingBank] = res.map((r) => r.results);
  // One placement attempt now carries one row per speaking question, so the brief the submission
  // lists read is a merge: the working status wins, the review flag is any, and the scores are
  // the mean of what has been graded so far. The merge itself lives next to speakingBrief.
  const speakingByAttempt = new Map();
  for (const row of speaking) {
    const list = speakingByAttempt.get(row.attempt_id) ?? [];
    list.push(row);
    speakingByAttempt.set(row.attempt_id, list);
  }
  const packagesBySession = new Map();
  for (const row of sessionPkgs) {
    const list = packagesBySession.get(row.session_id) ?? [];
    list.push(row.package_id);
    packagesBySession.set(row.session_id, list);
  }
  // Mockup invites without a session are the legacy back door: flagged so the Submission list can
  // mark them and the team can decide to cancel or let them expire.
  const straySet = new Set(strayAttempts.map((a) => a.id));
  const last = new Map(lastActs.map((r) => [r.student_id, r.last_at]));
  // Registrations per student, oldest to newest: they drive the registered filter and the count.
  const rowsByStudent = new Map();
  const pendaftaranRows = pendaftaran.map((p) => {
    const row = {
      id: p.id, studentId: p.student_id, programId: p.program_id, durationId: p.duration_id || null,
      periodId: p.period_id, classId: p.class_id || null, status: p.status, note: p.note || "",
      registeredAt: ms(p.registered_at), registeredBy: p.registered_by || "",
    };
    const list = rowsByStudent.get(p.student_id) ?? [];
    list.push(row);
    rowsByStudent.set(p.student_id, list);
    return row;
  });
  const stats = {};
  for (const [bucket, rows] of [["d7", s7], ["d30", s30]]) {
    for (const r of rows) {
      stats[r.test_key] ??= { d7: {}, d30: {} };
      stats[r.test_key][bucket][r.question_id] = { n: r.n, correct: r.correct };
    }
  }
  return json({
    me: { name: user.name, email: user.email, role: user.role },
    // Only the owner sees the staff roster in the bootstrap; other roles get nothing to render.
    ...(user.role === "admin" ? { staff: (await env.DB.prepare("SELECT id, name, email, role, active, last_login_at FROM admin_users ORDER BY created_at").all())
      .results.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, active: Boolean(r.active), lastLoginAt: r.last_login_at ? ms(r.last_login_at) : null })) } : {}),
    now: Date.now(),
    publicUrl: env.PUBLIC_WEB_URL,
    whatsapp: { configured: whatsappConfigured(env) },
    speakingCefr: MANUAL_CEFR,
    jenjang: JENJANG_PENDIDIKAN,
    tahuDari: TAHU_DARI,
    tests: Object.fromEntries(TEST_KEYS.map((key) => [key, {
      key,
      settings: mapTest(tests.find((t) => t.key === key)),
      questions: questions.filter((q) => q.test_key === key).map(mapQuestion),
      sections: sections.filter((s) => s.test_key === key).map(mapSection),
      packages: packages.filter((p) => p.test_key === key).map(mapPackage),
      mockupSpeaking: key === "ielts-mockup" ? mockupSpeakingPlan() : null,
      stats: stats[key] || { d7: {}, d30: {} },
    }])),
    levels: levels.map((l) => ({ key: l.key, label: l.label, min: l.min_score, max: l.max_score, program: l.program })),
    students: students.map((s) => ({
      id: s.id, name: s.name, email: s.email || "", wa: s.whatsapp || "", city: s.city || "", source: s.source, stage: s.stage,
      branch: s.branch || "",
      programId: s.program_id, durationId: s.duration_id, periodId: s.period_id, classId: s.class_id,
      tempatLahir: s.tempat_lahir || "", tanggalLahir: s.tanggal_lahir || "", provinsi: s.provinsi || "",
      kodePos: s.kode_pos || "", jenjang: s.jenjang_pendidikan || "", tahuDari: s.tahu_dari || "",
      daftarCount: daftarCount(rowsByStudent.get(s.id)),
      pendaftaranStatus: latestPendaftaran(rowsByStudent.get(s.id))?.status || null,
      createdAt: ms(s.created_at), lastActivityAt: ms(Math.max(s.updated_at || 0, last.get(s.id) || 0, s.created_at)),
    })),
    pendaftaran: pendaftaranRows,
    sessions: sessions.map((s) => ({
      id: s.id, name: s.name, windowMode: s.window_mode,
      rangeStart: ms(s.range_start), rangeEnd: ms(s.range_end), entryGraceSeconds: s.entry_grace_seconds,
      programId: s.program_id, periodId: s.period_id, durationId: s.duration_id,
      packageIds: packagesBySession.get(s.id) || [],
      quota: s.quota, queuePaused: Boolean(s.queue_paused), status: s.status,
      createdBy: s.created_by || "", createdAt: ms(s.created_at),
      counts: { roster: s.roster, waSent: s.wa_sent, emailSent: s.email_sent, done: s.done },
    })),
    emailUsage: { sent: emailUse[0]?.sent ?? 0, limit: EMAIL_DAILY_LIMIT },
    attempts: attempts.map((a) => mapAttempt(a, now, speakingByAttempt.get(a.id), straySet.has(a.id))),
    speakingBank: speakingBank.map((q) => ({ id: q.id, position: q.position, prompt: q.prompt, status: q.status })),
    speaking: speakingSummary(env, speaking, now),
    enrolledAt: enrolled.map((r) => ms(r.at)),
    catalog: {
      programs: programs.map((p) => ({
        id: p.id, name: p.name, mode: p.mode, status: p.status,
        tutors: programTutors.filter((t) => t.program_id === p.id).map((t) => t.name),
        durations: durations.filter((d) => d.program_id === p.id).map((d) => ({ id: d.id, label: d.label, days: d.days, price: d.price || 0 })),
      })),
      tutors: tutors.map((t) => ({ id: t.id, name: t.name })),
      periods: periods.map((p) => ({ id: p.id, start: ms(dateToSeconds(p.start_date)), startDate: p.start_date, note: p.note || "" })),
      classes: classes.map((c) => ({ id: c.id, code: c.code, programId: c.program_id, periodId: c.period_id, tutorId: c.tutor_id, tutor: c.tutor_name, capacity: c.capacity })),
    },
    certificates,
  });
}

/** Counts for the Speaking settings panel and the alert when Speechace keeps failing. */
function speakingSummary(env, rows, now) {
  const count = (pred) => rows.filter(pred).length;
  const graded = rows.filter((s) => s.status === "graded" && s.graded_at && s.created_at >= now - 30 * 86400);
  return {
    configured: speechaceConfigured(env),
    waiting: count((s) => s.status === "pending" || s.status === "grading"),
    review: count((s) => s.status === "failed" || (s.status === "graded" && s.needs_review)),
    failed: count((s) => s.status === "failed"),
    manual: count((s) => s.status === "manual"),
    graded30: graded.length,
    avgSeconds: graded.length ? Math.round(graded.reduce((sum, s) => sum + (s.graded_at - s.created_at), 0) / graded.length) : null,
    failedLastHour: count((s) => s.status === "failed" && s.created_at >= now - 3600),
  };
}

const speakingBrief = (s) => (s ? {
  id: s.id, status: s.status, needsReview: Boolean(s.needs_review), cefr: s.cefr_overall || null,
  ielts: s.ielts_overall ?? null, gradedAt: ms(s.graded_at), createdAt: ms(s.created_at),} : null);

/* One placement attempt carries one speaking row per question. The brief the lists read is a
   merge of those rows: the working status wins, the review flag is any of them, and the scores
   are the mean of what has been graded so far. */
const CEFR_STEPS = ["A0", "A1", "A2", "B1", "B1+", "B2", "B2+", "C1", "C1+", "C2"];
function mergeSpeakingRows(rows) {
  const byStatus = (status) => rows.some((r) => r.status === status);
  const ieltsList = rows.map((r) => Number(r.ielts_overall)).filter(Number.isFinite);
  const cefrList = rows.map((r) => CEFR_STEPS.indexOf(String(r.cefr_overall || "").toUpperCase())).filter((v) => v >= 0);
  return {
    id: rows[0].id,
    attempt_id: rows[0].attempt_id,
    status: byStatus("grading") ? "grading"
      : byStatus("pending") ? "pending"
        : byStatus("failed") ? "failed"
          : byStatus("manual") ? "manual"
            : byStatus("graded") ? "graded"
              : byStatus("skipped") ? "skipped"
                : rows[0].status,
    needs_review: rows.some((r) => r.status === "failed" || (r.status === "graded" && r.needs_review)) ? 1 : 0,
    cefr_overall: cefrList.length ? CEFR_STEPS[Math.round((cefrList.reduce((a, b) => a + b, 0) / cefrList.length) * 2) / 2] : null,
    ielts_overall: ieltsList.length ? Math.round((ieltsList.reduce((a, b) => a + b, 0) / ieltsList.length) * 2) / 2 : null,
    graded_at: rows.reduce((top, r) => Math.max(top, r.graded_at || 0), 0) || null,
    created_at: rows.reduce((low, r) => Math.min(low, r.created_at || Infinity), Infinity),
    recordings: rows.filter((r) => r.status !== "skipped").length,
  };
}

function mapAttempt(a, now, speaking = null, stray = false) {
  const status = attemptStatus(a, now);
  const strikes = focusStrikes(a.violation_log);
  const failed = status === "timeout" || status === "violation";
  let duration = a.duration_seconds;
  if (duration === null || duration === undefined) {
    if (status === "timeout") duration = a.limit_seconds || a.expires_at - a.started_at;
    else if (status === "violation") {
      const times = String(a.violation_log || "").split(";").filter(Boolean).map((e) => Number(e.split(":")[0]));
      duration = times.length ? Math.max(...times) - a.started_at : 0;
    } else duration = Math.max(0, Math.min(now, a.expires_at) - a.started_at);
  }
  const email = a.email_status === "sent" ? "sent" : a.email_status === "pending" ? "pending" : String(a.email_status || "").startsWith("failed") ? "failed" : null;
  return {
    id: a.id, short: a.id.slice(0, 6).toUpperCase(), test: a.test_key || "placement", studentId: a.student_id, startedAt: ms(a.started_at),
    status, score: failed ? null : a.score, total: a.total, levelKey: a.level_key, violations: strikes, maxViolations: a.max_violations || 3,
    device: deviceLabel(a.user_agent), country: a.country || "",
    durationSec: Math.max(0, duration || 0), limitSec: a.limit_seconds || a.expires_at - a.started_at,
    emailStatus: email, passScore: a.pass_score, passed: a.passed === null || a.passed === undefined ? null : Boolean(a.passed),
    voidBy: a.voided_by, voidAt: ms(a.voided_at), voidReason: a.void_reason || "", contactName: a.name || "",
    bands: a.bands ? JSON.parse(a.bands) : null, audioPlayedAt: ms(a.audio_played_at), packageId: a.package_id || null,
    writingStatus: a.writing_status || null, writingError: a.writing_error || "",
    speakingStatus: a.speaking_status || null, speakingError: a.speaking_error || "",
    speaking: speakingBrief(Array.isArray(speaking) ? mergeSpeakingRows(speaking) : speaking),
    ...(stray ? { noSession: true } : {}),
  };
}

/* ===================== Students ===================== */
async function getStudentRow(env, id) {
  const s = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(id).first();
  if (!s) throw new HttpError(404, "Data siswa tidak ditemukan.");
  return s;
}

async function getStudent(request, env, user, url, id) {
  const s = await getStudentRow(env, id);
  const [acts, msgs, speaking, journey] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM activities WHERE student_id = ? ORDER BY at DESC, id DESC LIMIT 300").bind(id),
    env.DB.prepare("SELECT id, text, status, error, created_at, created_by FROM wa_messages WHERE student_id = ? ORDER BY created_at DESC LIMIT 50").bind(id),
    env.DB.prepare(`SELECT sp.id, sp.attempt_id, sp.status, sp.needs_review, sp.cefr_overall, sp.ielts_overall, sp.scores, sp.created_at
                      FROM speaking_submissions sp JOIN attempts a ON a.id = sp.attempt_id
                     WHERE a.student_id = ? ORDER BY sp.created_at DESC LIMIT 20`).bind(id),
    env.DB.prepare(`SELECT pd.id, pd.program_id, pd.duration_id, pd.period_id, pd.class_id, pd.status, pd.note, pd.registered_at, pd.registered_by,
                           p.name AS program_name, d.label AS duration_label, pr.start_date AS period_start, c.code AS class_code, t.name AS tutor_name
                      FROM pendaftaran pd
                      JOIN programs p ON p.id = pd.program_id
                      LEFT JOIN program_durations d ON d.id = pd.duration_id
                      JOIN periods pr ON pr.id = pd.period_id
                      LEFT JOIN classes c ON c.id = pd.class_id
                      LEFT JOIN tutors t ON t.id = c.tutor_id
                     WHERE pd.student_id = ? ORDER BY pd.registered_at, pd.id`).bind(id),
  ]);
  return json({
    id: s.id,
    identity: {
      tempatLahir: s.tempat_lahir || "", tanggalLahir: s.tanggal_lahir || "", provinsi: s.provinsi || "",
      kodePos: s.kode_pos || "", jenjang: s.jenjang_pendidikan || "", tahuDari: s.tahu_dari || "",
    },
    pendaftaran: journey.results.map((r) => ({
      id: r.id, programId: r.program_id, programName: r.program_name, durationId: r.duration_id || null,
      durationLabel: r.duration_label || "", periodId: r.period_id, periodStart: r.period_start,
      classId: r.class_id || null, classCode: r.class_code || "", tutorName: r.tutor_name || "",
      status: r.status, note: r.note || "", registeredAt: ms(r.registered_at), registeredBy: r.registered_by || "",
    })),
    activities: acts.results.map((a) => ({ id: a.id, at: ms(a.at), type: a.type, text: a.text, by: a.by_name })),
    messages: msgs.results.map((m) => ({ id: m.id, at: ms(m.created_at), text: m.text, status: m.status, error: m.error, by: m.created_by })),
    speaking: speaking.results.map((sp) => {
      const scores = parseJson(sp.scores);
      return {
        ...speakingBrief(sp), attemptId: sp.attempt_id,
        aspects: Object.fromEntries(ASPECTS.map(({ key }) => [key, scores.aspects?.[key]?.cefr || null])),
      };
    }),
  });
}

const parseJson = (raw) => {
  try { return JSON.parse(raw || "{}") || {}; } catch { return {}; }
};

/* Validates program, duration, period, and class together, because they depend on each other. */
async function checkEnrollment(env, data) {
  const { programId, durationId, periodId, classId } = data;
  if (programId) {
    const p = await env.DB.prepare("SELECT id FROM programs WHERE id = ?").bind(programId).first();
    if (!p) throw new HttpError(400, "Program yang dipilih tidak ditemukan.");
    if (durationId && !(await env.DB.prepare("SELECT id FROM program_durations WHERE id = ? AND program_id = ?").bind(durationId, programId).first())) {
      throw new HttpError(400, "Durasi yang dipilih bukan milik program ini.");
    }
  } else if (durationId || classId) throw new HttpError(400, "Pilih program dulu sebelum memilih durasi atau kelas.");
  if (periodId && !(await env.DB.prepare("SELECT id FROM periods WHERE id = ?").bind(periodId).first())) throw new HttpError(400, "Periode yang dipilih tidak ditemukan.");
  if (classId) {
    const c = await env.DB.prepare("SELECT * FROM classes WHERE id = ?").bind(classId).first();
    if (!c) throw new HttpError(400, "Kelas yang dipilih tidak ditemukan.");
    if (c.program_id !== programId || c.period_id !== periodId) throw new HttpError(400, "Kelas harus sesuai dengan program dan periode siswa.");
  }
  if (data.stage === "terdaftar" && (!programId || !periodId)) throw new HttpError(400, "Siswa berstatus Terdaftar perlu program dan periode.");
}

async function classText(env, classId) {
  const c = await env.DB.prepare("SELECT c.code, t.name AS tutor, p.start_date FROM classes c JOIN tutors t ON t.id = c.tutor_id JOIN periods p ON p.id = c.period_id WHERE c.id = ?").bind(classId).first();
  return c ? `Masuk kelas ${c.code} periode ${fmtDate(dateToSeconds(c.start_date))} dengan tutor ${c.tutor}.` : "Masuk kelas.";
}

function readStudentInput(body, partial) {
  const out = {};
  const has = (k) => !partial || Object.prototype.hasOwnProperty.call(body, k);
  if (has("name")) { out.name = text(body.name, 80); if (out.name.length < 2) throw new HttpError(400, "Nama minimal 2 karakter."); }
  if (has("wa")) { out.wa = normalizeWhatsapp(body.wa); if (!out.wa) throw new HttpError(400, "Nomor WhatsApp terlihat belum lengkap. Periksa lagi jumlah digitnya."); }
  if (has("email")) { out.email = text(body.email, 160).toLowerCase() || null; if (out.email && !isEmail(out.email)) throw new HttpError(400, "Format email belum benar."); }
  if (has("city")) out.city = text(body.city, 80) || null;
  if (has("source")) { out.source = SOURCES.includes(body.source) ? body.source : "WhatsApp"; }
  if (has("stage")) { if (!STAGES[body.stage]) throw new HttpError(400, "Status tidak dikenal."); out.stage = body.stage; }
  for (const k of ["programId", "durationId", "periodId", "classId"]) if (has(k)) out[k] = body[k] ? String(body[k]) : null;
  if (has("tempatLahir")) out.tempatLahir = text(body.tempatLahir, 80) || null;
  if (has("tanggalLahir")) {
    const v = normalizeBirthDate(body.tanggalLahir);
    if (v === null) throw new HttpError(400, "Tanggal lahir belum benar. Contohnya 2005-08-17.", { field: "tanggalLahir" });
    out.tanggalLahir = v || null;
  }
  if (has("provinsi")) out.provinsi = text(body.provinsi, 60) || null;
  if (has("kodePos")) out.kodePos = text(body.kodePos, 12) || null;
  if (has("jenjang")) {
    const v = normalizeOption(body.jenjang, JENJANG_PENDIDIKAN);
    if (v === null) throw new HttpError(400, `Jenjang pendidikan pilih salah satu: ${JENJANG_PENDIDIKAN.join(", ")}.`, { field: "jenjang" });
    out.jenjang = v || null;
  }
  if (has("tahuDari")) {
    const v = normalizeOption(body.tahuDari, TAHU_DARI);
    if (v === null) throw new HttpError(400, `Asal informasi pilih salah satu: ${TAHU_DARI.join(", ")}.`, { field: "tahuDari" });
    out.tahuDari = v || null;
  }
  return out;
}

async function assertUnique(env, data, selfId) {
  if (data.wa) {
    const dup = await env.DB.prepare("SELECT name FROM students WHERE whatsapp = ? AND id != ?").bind(data.wa, selfId || "").first();
    if (dup) throw new HttpError(409, `Nomor ini sudah tercatat atas nama ${dup.name}.`, { field: "wa" });
  }
  if (data.email) {
    const dup = await env.DB.prepare("SELECT name FROM students WHERE email = ? AND id != ?").bind(data.email, selfId || "").first();
    if (dup) throw new HttpError(409, `Email ini sudah tercatat atas nama ${dup.name}.`, { field: "email" });
  }
}

/** The unique indexes on students.email and students.whatsapp are the last guard against two
 *  concurrent creates passing assertUnique; map their violation to the same 409 the check
 *  path already returns, instead of a bare 500 (audit finding admin-data/duplicate-email-race). */
function duplicateStudentCatch(error) {
  if (error && (error.code === "23505" || /students_email|students_whatsapp/i.test(String(error.message || "")))) {
    throw new HttpError(409, "Email atau nomor ini sudah tercatat atas nama siswa lain.", { field: "email" });
  }
  throw error;
}

async function createStudent(request, env, user) {
  const body = await readJson(request);
  const data = readStudentInput(body, false);
  await assertUnique(env, data);
  await checkEnrollment(env, data);
  const id = newId("stu");
  const now = nowSeconds();
  const stmts = [
    env.DB.prepare(`INSERT INTO students (id, name, email, whatsapp, city, source, stage, program_id, duration_id, period_id, class_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, data.name, data.email, data.wa, data.city, data.source, data.stage, data.programId, data.durationId, data.periodId, data.classId, now, now),
    addActivity(env, id, "system", `Ditambahkan manual oleh ${user.name} dengan sumber ${data.source}.`, user.name, null, now),
  ];
  if (data.classId) stmts.push(addActivity(env, id, "class", await classText(env, data.classId), user.name, null, now));
  const note = multiline(body.note, 2000);
  if (note) stmts.push(addActivity(env, id, "note", note, user.name, null, now));
  try {
    await env.DB.batch(stmts);
  } catch (error) {
    duplicateStudentCatch(error);
  }
  return json({ ok: true, id });
}

async function updateStudent(request, env, user, url, id) {
  const s = await getStudentRow(env, id);
  const body = await readJson(request);
  const patch = readStudentInput(body, true);
  const next = {
    name: s.name, wa: s.whatsapp, email: s.email, city: s.city, source: s.source, stage: s.stage,
    programId: s.program_id, durationId: s.duration_id, periodId: s.period_id, classId: s.class_id, ...patch,
  };
  if (patch.programId !== undefined && patch.programId !== s.program_id && patch.durationId === undefined) next.durationId = null;
  if ((next.programId !== s.program_id || next.periodId !== s.period_id) && patch.classId === undefined) next.classId = null;
  await assertUnique(env, patch, id);
  await checkEnrollment(env, next);
  const now = nowSeconds();
  const stmts = [env.DB.prepare(`UPDATE students SET name = ?, whatsapp = ?, email = ?, city = ?, source = ?, stage = ?, program_id = ?, duration_id = ?,
                                  period_id = ?, class_id = ?, tempat_lahir = ?, tanggal_lahir = ?, provinsi = ?, kode_pos = ?, jenjang_pendidikan = ?, tahu_dari = ?, updated_at = ? WHERE id = ?`)
    .bind(next.name, next.wa, next.email, next.city, next.source, next.stage, next.programId, next.durationId, next.periodId, next.classId,
      patch.tempatLahir ?? s.tempat_lahir, patch.tanggalLahir ?? s.tanggal_lahir, patch.provinsi ?? s.provinsi, patch.kodePos ?? s.kode_pos,
      patch.jenjang ?? s.jenjang_pendidikan, patch.tahuDari ?? s.tahu_dari, now, id)];
  if (next.stage !== s.stage) stmts.push(addActivity(env, id, "stage", `Mengubah status dari ${STAGES[s.stage]} ke ${STAGES[next.stage]}.`, user.name, { from: s.stage, to: next.stage }, now));
  if (next.classId !== s.class_id) stmts.push(addActivity(env, id, "class", next.classId ? await classText(env, next.classId) : "Dikeluarkan dari kelas.", user.name, null, now));
  if (next.periodId !== s.period_id && !next.classId) {
    const p = next.periodId ? await env.DB.prepare("SELECT start_date FROM periods WHERE id = ?").bind(next.periodId).first() : null;
    stmts.push(addActivity(env, id, "class", p ? `Periode diatur ke ${fmtDate(dateToSeconds(p.start_date))}.` : "Periode dikosongkan.", user.name, null, now));
  }
  const detailKeys = ["name", "wa", "email", "city", "source", "programId", "durationId"];
  if (detailKeys.some((k) => patch[k] !== undefined && patch[k] !== { name: s.name, wa: s.whatsapp, email: s.email, city: s.city, source: s.source, programId: s.program_id, durationId: s.duration_id }[k])) {
    stmts.push(addActivity(env, id, "system", "Memperbarui data siswa.", user.name, null, now));
  }
  try {
    await env.DB.batch(stmts);
  } catch (error) {
    duplicateStudentCatch(error);
  }
  return json({ ok: true });
}

/* ===================== Pendaftaran ===================== */

/** Reads the six identity fields from a registration body, filling only what is still empty. */
function identityPatch(body, student) {
  const data = readStudentInput(body, true);
  const patch = {};
  for (const [key, column] of [
    ["tempatLahir", "tempat_lahir"], ["tanggalLahir", "tanggal_lahir"], ["provinsi", "provinsi"],
    ["kodePos", "kode_pos"], ["jenjang", "jenjang_pendidikan"], ["tahuDari", "tahu_dari"],
  ]) {
    if (data[key] === undefined) continue;
    if (data[key] && !student[column]) patch[column] = data[key]; // never overwrite what the team already wrote
    else if (!data[key] && student[column]) delete patch[column]; // keep existing data when the form sends blanks
  }
  return patch;
}

/**
 * Registers a person into a program. An existing lead or student is linked and keeps its data; an
 * unknown person is created first. The new row is by definition the latest registration, so the
 * program columns on the student follow it, and the stage moves to terdaftar.
 */
async function createPendaftaran(request, env, user) {
  const body = await readJson(request);
  const programId = String(body.programId || "");
  const periodId = String(body.periodId || "");
  const durationId = body.durationId ? String(body.durationId) : null;
  const classId = body.classId ? String(body.classId) : null;
  if (!programId || !periodId) throw new HttpError(400, "Program dan periode wajib dipilih.", { field: "programId" });
  await checkEnrollment(env, { programId, durationId, periodId, classId, stage: "terdaftar" });

  const now = nowSeconds();
  const stmts = [];
  let studentId = body.studentId ? String(body.studentId) : "";
  let patch = {};
  if (studentId) {
    const student = await getStudentRow(env, studentId);
    patch = identityPatch(body, student);
    const keys = Object.keys(patch);
    if (keys.length) {
      stmts.push(env.DB.prepare(`UPDATE students SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
        .bind(...keys.map((k) => patch[k]), now, studentId));
    }
  } else {
    const data = readStudentInput({ ...body, stage: "baru" }, false); // a fresh registration starts as a lead that immediately registers
    if (!data.wa) throw new HttpError(400, "Nomor WhatsApp wajib diisi.", { field: "wa" });
    if (data.source === "WhatsApp" && !body.source) data.source = "Datang langsung"; // pendaftaran walk-in default
    await assertUnique(env, data);
    studentId = newId("stu");
    stmts.push(env.DB.prepare(`INSERT INTO students (id, name, email, whatsapp, city, source, stage, created_at, updated_at,
                                tempat_lahir, tanggal_lahir, provinsi, kode_pos, jenjang_pendidikan, tahu_dari)
                               VALUES (?, ?, ?, ?, ?, ?, 'baru', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(studentId, data.name, data.email, data.wa, data.city, data.source, now, now,
        data.tempatLahir ?? null, data.tanggalLahir ?? null, data.provinsi ?? null, data.kodePos ?? null, data.jenjang ?? null, data.tahuDari ?? null));
    stmts.push(addActivity(env, studentId, "system", `Ditambahkan saat pendaftaran oleh ${user.name}.`, user.name, null, now));
  }

  const program = await env.DB.prepare("SELECT name FROM programs WHERE id = ?").bind(programId).first();
  const period = await env.DB.prepare("SELECT start_date FROM periods WHERE id = ?").bind(periodId).first();
  const note = multiline(body.note, 2000);
  const id = newId("pdf");
  stmts.push(env.DB.prepare(`INSERT INTO pendaftaran (id, student_id, program_id, duration_id, period_id, class_id, status, note, registered_at, registered_by)
                             VALUES (?, ?, ?, ?, ?, ?, 'aktif', ?, ?, ?)`)
    .bind(id, studentId, programId, durationId, periodId, classId, note || null, now, user.name));
  stmts.push(env.DB.prepare(`UPDATE students SET program_id = ?, duration_id = ?, period_id = ?, class_id = ?, stage = 'terdaftar', updated_at = ? WHERE id = ?`)
    .bind(programId, durationId, periodId, classId, now, studentId));
  stmts.push(addActivity(env, studentId, "system",
    `Mendaftar ke program ${program.name} periode ${fmtDate(dateToSeconds(period.start_date))}.`, user.name, { pendaftaranId: id }, now));
  if (classId) stmts.push(addActivity(env, studentId, "class", await classText(env, classId), user.name, { pendaftaranId: id }, now));
  try {
    await env.DB.batch(stmts);
  } catch (error) {
    duplicateStudentCatch(error);
  }
  return json({ ok: true, id, studentId });
}

/** Edits a registration, then mirrors the latest non-cancelled row back onto the student. */
async function updatePendaftaran(request, env, user, url, id) {
  const row = await env.DB.prepare("SELECT * FROM pendaftaran WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "Pendaftaran tidak ditemukan.");
  const body = await readJson(request);
  const next = {
    programId: body.programId !== undefined ? String(body.programId || "") : row.program_id,
    durationId: body.durationId !== undefined ? (body.durationId ? String(body.durationId) : null) : row.duration_id,
    periodId: body.periodId !== undefined ? String(body.periodId || "") : row.period_id,
    classId: body.classId !== undefined ? (body.classId ? String(body.classId) : null) : row.class_id,
    status: body.status !== undefined ? String(body.status) : row.status,
    note: body.note !== undefined ? (multiline(body.note, 2000) || null) : row.note,
  };
  if (!PENDAFTARAN_STATUS.includes(next.status)) throw new HttpError(400, "Status pendaftaran tidak dikenal.", { field: "status" });
  if (!next.programId || !next.periodId) throw new HttpError(400, "Program dan periode wajib dipilih.", { field: "programId" });
  await checkEnrollment(env, { programId: next.programId, durationId: next.durationId, periodId: next.periodId, classId: next.classId, stage: "terdaftar" });

  const now = nowSeconds();
  const stmts = [env.DB.prepare(`UPDATE pendaftaran SET program_id = ?, duration_id = ?, period_id = ?, class_id = ?, status = ?, note = ? WHERE id = ?`)
    .bind(next.programId, next.durationId, next.periodId, next.classId, next.status, next.note, id)];
  if (next.status !== row.status) {
    const label = { aktif: "aktif", selesai: "selesai", batal: "batal" }[next.status];
    stmts.push(addActivity(env, row.student_id, "system", `Status pendaftaran diubah menjadi ${label}.`, user.name, { pendaftaranId: id }, now));
  }

  // The student row shows the newest registration that still counts. Cancelling the only one
  // returns the person to the lead side.
  const { results } = await env.DB.prepare("SELECT * FROM pendaftaran WHERE student_id = ? ORDER BY registered_at, id").bind(row.student_id).all();
  const rows = results.map((r) => ({ ...r, status: r.id === id ? next.status : r.status }));
  const latest = latestPendaftaran(rows);
  if (latest) {
    stmts.push(env.DB.prepare(`UPDATE students SET program_id = ?, duration_id = ?, period_id = ?, class_id = ?,
        stage = CASE WHEN stage IN ('baru', 'dihubungi', 'konsultasi') THEN 'terdaftar' ELSE stage END, updated_at = ? WHERE id = ?`)
      .bind(latest.program_id, latest.duration_id, latest.period_id, latest.class_id, now, row.student_id));
  } else {
    stmts.push(env.DB.prepare(`UPDATE students SET program_id = NULL, duration_id = NULL, period_id = NULL, class_id = NULL,
        stage = CASE WHEN stage = 'terdaftar' THEN 'konsultasi' ELSE stage END, updated_at = ? WHERE id = ?`)
      .bind(now, row.student_id));
  }
  await env.DB.batch(stmts);
  return json({ ok: true });
}

function deleteStudentStatements(env, id) {  return [
    // The placement attempt stays for the statistics, so its speaking scores stay too, but the
    // voice, the transcript, and the raw response are personal data and go with the student.
    env.DB.prepare(`UPDATE speaking_submissions SET audio = NULL, transcript = NULL, provider_response = NULL, student_id = NULL
                     WHERE student_id = ? OR attempt_id IN (SELECT id FROM attempts WHERE student_id = ?)`).bind(id, id),
    env.DB.prepare("DELETE FROM answers WHERE attempt_id IN (SELECT id FROM attempts WHERE student_id = ? AND test_key != 'placement')").bind(id),
    env.DB.prepare("DELETE FROM attempts WHERE student_id = ? AND test_key != 'placement'").bind(id),
    env.DB.prepare("UPDATE attempts SET student_id = NULL, name = NULL, email = NULL, whatsapp = NULL WHERE student_id = ?").bind(id),
    env.DB.prepare("DELETE FROM wa_messages WHERE student_id = ?").bind(id),
    env.DB.prepare("DELETE FROM activities WHERE student_id = ?").bind(id),
    env.DB.prepare("DELETE FROM invites WHERE student_id = ?").bind(id),
    env.DB.prepare("DELETE FROM students WHERE id = ?").bind(id),
  ];
}

async function deleteStudent(request, env, user, url, id) {
  await getStudentRow(env, id);
  await env.DB.batch(deleteStudentStatements(env, id));
  return json({ ok: true });
}

async function bulkStudents(request, env, user) {
  const body = await readJson(request);
  const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 500) : [];
  if (!ids.length) throw new HttpError(400, "Pilih minimal satu siswa.");
  const now = nowSeconds();
  const stmts = [];
  if (body.action === "delete") {
    for (const id of ids) stmts.push(...deleteStudentStatements(env, id));
  } else if (body.action === "stage") {
    if (!STAGES[body.value]) throw new HttpError(400, "Status tidak dikenal.");
    const rows = (await env.DB.prepare(`SELECT id, stage FROM students WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results;
    for (const r of rows) {
      if (r.stage === body.value) continue;
      stmts.push(env.DB.prepare("UPDATE students SET stage = ?, updated_at = ? WHERE id = ?").bind(body.value, now, r.id));
      stmts.push(addActivity(env, r.id, "stage", `Mengubah status dari ${STAGES[r.stage]} ke ${STAGES[body.value]}.`, user.name, { from: r.stage, to: body.value }, now));
    }
  } else if (body.action === "period") {
    const period = body.value ? await env.DB.prepare("SELECT * FROM periods WHERE id = ?").bind(String(body.value)).first() : null;
    if (body.value && !period) throw new HttpError(400, "Periode tidak ditemukan.");
    const rows = (await env.DB.prepare(`SELECT id, period_id FROM students WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results;
    for (const r of rows) {
      if (r.period_id === (period ? period.id : null)) continue;
      stmts.push(env.DB.prepare("UPDATE students SET period_id = ?, class_id = NULL, updated_at = ? WHERE id = ?").bind(period ? period.id : null, now, r.id));
      stmts.push(addActivity(env, r.id, "class", period ? `Periode diatur ke ${fmtDate(dateToSeconds(period.start_date))}.` : "Periode dikosongkan.", user.name, null, now));
    }
  } else throw new HttpError(400, "Aksi tidak dikenal.");
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, count: ids.length });
}

async function addNote(request, env, user, url, id) {
  await getStudentRow(env, id);
  const body = await readJson(request);
  const note = multiline(body.text, 2000);
  if (!note) throw new HttpError(400, "Tulis catatan dulu sebelum menyimpan.");
  await addActivity(env, id, "note", note, user.name).run();
  return json({ ok: true });
}

async function logWhatsApp(env, user, student, textBody, result, label) {
  const now = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO wa_messages (student_id, to_number, text, status, provider_message_id, error, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(student.id, student.whatsapp, textBody, result.status, result.messageId || null, result.error || null, now, user.name),
    addActivity(env, student.id, "wa", result.ok ? `${label} lewat WhatsApp:\n${textBody}` : `${label} lewat WhatsApp gagal. ${result.error}`, user.name, null, now),
  ]);
}

async function sendStudentWhatsApp(request, env, user, url, id) {
  const s = await getStudentRow(env, id);
  if (!s.whatsapp) throw new HttpError(400, "Siswa ini belum punya nomor WhatsApp.");
  const body = await readJson(request);
  const message = multiline(body.text, 4000);
  if (!message) throw new HttpError(400, "Tulis pesan dulu sebelum mengirim.");
  const result = await sendWhatsApp(env, { to: s.whatsapp, text: message, branch: s.branch || null });
  await logWhatsApp(env, user, s, message, result, body.label ? text(body.label, 80) : "Mengirim pesan");
  if (!result.ok) throw new HttpError(result.status === "skipped" ? 503 : 502, result.error);
  return json({ ok: true, messageId: result.messageId });
}

/* The IELTS mockup invite code comes from the shared pure module, so the smoke test covers it. */

async function createInvite(request, env, user, url, id) {
  const s = await getStudentRow(env, id);
  const body = await readJson(request);
  const test = TEST_KEYS.includes(body.test) ? body.test : null;
  if (!test) throw new HttpError(400, "Jenis tes tidak dikenal.");
  if (test === "placement") return json({ ok: true, link: `${env.PUBLIC_WEB_URL}/`, expiresAt: null });
  // IELTS Mockup is paid and runs in waves: every invite is born from a session with its quota,
  // window, and queue. Sending one straight from a student profile would bypass all of that.
  if (test === "ielts-mockup") {
    throw new HttpError(400, "Undangan IELTS Mockup hanya bisa dibuat dari sesi. Buka tab Sesi dan tambahkan pesertanya di sana.");
  }
  const token = randomToken(24);
  const now = nowSeconds();
  let code = null;
  let packageId = null;
  let packageName = null;
  let packageTotal = null;
  if (test === "ielts-mockup") {
    for (let i = 0; i < 5 && !code; i += 1) {
      const candidate = mockupCode();
      const taken = await env.DB.prepare("SELECT 1 FROM invites WHERE code = ?").bind(candidate).first();
      if (!taken) code = candidate;
    }
    if (!code) throw new HttpError(500, "Kode undangan tidak bisa dibuat, coba lagi.");
    // A specific package when the team picks one, otherwise a random active package with questions.
    const requested = String(body.packageId || "").trim();
    const pkg = requested
      ? await env.DB.prepare("SELECT id, name FROM question_packages WHERE id = ? AND test_key = ? AND is_active = 1").bind(requested, test).first()
      : await env.DB.prepare(`SELECT p.id, p.name FROM question_packages p
                              WHERE p.test_key = ? AND p.is_active = 1
                                AND EXISTS (SELECT 1 FROM questions q WHERE q.package_id = p.id AND q.status = 'aktif')
                              ORDER BY RANDOM() LIMIT 1`).bind(test).first();
    if (!pkg) throw new HttpError(requested ? 400 : 503, requested
      ? "Paket soal tidak ditemukan atau tidak aktif."
      : "Belum ada paket soal aktif dengan soal. Tambahkan paket dan soalnya dulu.");
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM questions WHERE package_id = ? AND status = 'aktif'").bind(pkg.id).first();
    if (!count || !count.n) throw new HttpError(503, "Paket soal ini belum punya soal aktif.");
    packageId = pkg.id;
    packageName = pkg.name;
    packageTotal = count.n;
  }
  await env.DB.prepare("INSERT INTO invites (id, token_hash, student_id, test_key, code, package_id, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId("inv"), await sha256Hex(token), s.id, test, code, packageId, now, now + INVITE_TTL, user.name).run();
  return json({ ok: true, link: `${env.PUBLIC_WEB_URL}/?undangan=${token}`, code, packageName, packageTotal, expiresAt: ms(now + INVITE_TTL) });
}

/* ===================== Mockup sessions and the bulk import ===================== */

/** The roster CSV arrives as JSON, so the import routes need a bigger body than the admin default. */
const IMPORT_CSV_LIMIT = 2 * 1024 * 1024;

const rangeDaySeconds = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Math.floor(value);
  const at = Date.parse(`${String(value)}T00:00:00+07:00`);
  return Number.isNaN(at) ? null : Math.floor(at / 1000);
};

function mapSessionRow(s, packageIds = []) {
  return {
    id: s.id, name: s.name, windowMode: s.window_mode,
    rangeStart: ms(s.range_start), rangeEnd: ms(s.range_end), entryGraceSeconds: s.entry_grace_seconds,
    programId: s.program_id, periodId: s.period_id, durationId: s.duration_id, packageIds,
    quota: s.quota, queuePaused: Boolean(s.queue_paused), status: s.status,
    createdBy: s.created_by || "", createdAt: ms(s.created_at),
    counts: { roster: s.roster ?? 0, waSent: s.wa_sent ?? 0, emailSent: s.email_sent ?? 0, done: s.done ?? 0 },
  };
}

/** The package set of a session, from the join table. */
async function sessionPackageIds(env, sessionId) {
  const rows = await env.DB.prepare("SELECT package_id FROM mockup_session_packages WHERE session_id = ?").bind(sessionId).all();
  return rows.results.map((r) => r.package_id);
}

/** Student search for the Tambah peserta dialog: partial name, WhatsApp number or suffix, or exact
 *  email. Capped at 8 rows, needs at least 2 characters, and returns what the team needs to pick
 *  the right person: identity, branch, and the last test. */
async function searchMockupStudents(request, env, user, url) {
  const q = String(new URL(request.url, env.PUBLIC_WEB_URL).searchParams.get("q") || "").trim();
  if (q.length < 2) return json({ ok: true, results: [] });
  const wa = normalizeWhatsapp(q);
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const rows = await env.DB.prepare(
    `SELECT s.id, s.name, s.whatsapp, s.email, s.branch,
            (SELECT a.test_key || ':' || a.status FROM attempts a WHERE a.student_id = s.id ORDER BY a.started_at DESC LIMIT 1) AS last_test
       FROM students s
      WHERE s.name ILIKE ? OR (? <> '' AND s.whatsapp LIKE ?) OR (? <> '' AND s.email = ?)
      ORDER BY s.created_at DESC LIMIT 8`,
  ).bind(like, wa || "", wa ? `%${wa}` : "", q.toLowerCase(), q.toLowerCase()).all();
  return json({
    ok: true,
    results: rows.results.map((r) => ({
      id: r.id, name: r.name,
      whatsapp: r.whatsapp || "", email: r.email || "", branch: r.branch || "",
      lastTest: r.last_test || "",
    })),
  });
}

function sessionRow(env, id) {
  return env.DB.prepare("SELECT * FROM mockup_sessions WHERE id = ?").bind(id).first();
}

async function saveMockupSession(request, env, user, url, id) {
  const body = await readJson(request);
  const name = text(body.name, 120);
  if (name.length < 2) throw new HttpError(400, "Nama sesi minimal 2 karakter.", { field: "name" });
  const windowMode = body.windowMode === "fleksibel" ? "fleksibel" : "terjadwal";
  let rangeStart = null;
  let rangeEnd = null;
  let entryGrace = 7200;
  if (windowMode === "fleksibel") {
    rangeStart = rangeDaySeconds(body.rangeStart);
    rangeEnd = rangeDaySeconds(body.rangeEnd);
    if (!rangeStart || !rangeEnd) throw new HttpError(400, "Rentang tanggal sesi wajib diisi.", { field: "rangeStart" });
    if (rangeEnd <= rangeStart) throw new HttpError(400, "Akhir rentang harus setelah awalnya.", { field: "rangeEnd" });
  } else {
    const v = int(body.entryGraceSeconds ?? 7200, { min: 300, max: 24 * 3600 });
    if (v === null) throw new HttpError(400, "Masa tenggang harus antara 5 menit dan 24 jam.", { field: "entryGraceSeconds" });
    entryGrace = v;
  }
  const programId = String(body.programId || "");
  const periodId = String(body.periodId || "");
  const durationId = body.durationId ? String(body.durationId) : null;
  // A session carries one or more packages: every imported student gets one of them, so
  // one wave can sit different packages. The old single packageId still arrives as a set.
  const packageIds = [...new Set((Array.isArray(body.packageIds) ? body.packageIds : [body.packageId])
    .map((value) => String(value || "").trim()).filter(Boolean))];
  if (!packageIds.length) throw new HttpError(400, "Centang minimal satu paket soal.", { field: "packageIds" });
  await checkEnrollment(env, { programId, durationId, periodId, classId: null });
  for (const packageId of packageIds) {
    const pkg = await env.DB.prepare("SELECT id FROM question_packages WHERE id = ? AND test_key = 'ielts-mockup' AND is_active = 1").bind(packageId).first();
    if (!pkg) throw new HttpError(400, `Paket soal ${packageId} tidak ditemukan atau tidak aktif.`, { field: "packageIds" });
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM questions WHERE package_id = ? AND status = 'aktif'").bind(packageId).first();
    if (!count?.n) throw new HttpError(503, "Setiap paket di sesi ini harus punya soal aktif.");
  }
  let quota = null;
  if (body.quota !== undefined && body.quota !== null && body.quota !== "") {
    quota = int(body.quota, { min: 1, max: 5000 });
    if (quota === null) throw new HttpError(400, "Kuota harus angka bulat dari 1 sampai 5000.", { field: "quota" });
  }
  const now = nowSeconds();
  if (id) {
    const row = await sessionRow(env, id);
    if (!row) throw new HttpError(404, "Sesi tidak ditemukan.");
    const roster = await env.DB.prepare("SELECT COUNT(*) AS n FROM invites WHERE session_id = ?").bind(id).first();
    if (roster?.n && (row.program_id !== programId || row.period_id !== periodId)) {
      throw new HttpError(400, "Sesi ini sudah punya peserta, jadi program dan periodenya tidak bisa diubah.");
    }
    if (roster?.n) {
      // Participants keep the package on their invite, so a package some invite already
      // uses must stay in the set. Adding more packages for the next import is allowed.
      const used = await env.DB.prepare("SELECT DISTINCT package_id FROM invites WHERE session_id = ? AND package_id IS NOT NULL").bind(id).all();
      const missing = used.results.map((r) => r.package_id).filter((pkg) => !packageIds.includes(pkg));
      if (missing.length) throw new HttpError(400, "Peserta sesi ini sudah memakai paket itu, jadi paketnya harus tetap dicentang. Tambah paket baru boleh, hapus yang sudah dipakai tidak.", { field: "packageIds" });
    }
    const status = ["draft", "open", "closed", "cancelled"].includes(body.status) ? body.status : row.status;
    await env.DB.batch([
      env.DB.prepare(`UPDATE mockup_sessions SET name = ?, window_mode = ?, range_start = ?, range_end = ?, entry_grace_seconds = ?,
          program_id = ?, period_id = ?, duration_id = ?, quota = ?, status = ?, updated_at = ? WHERE id = ?`)
        .bind(name, windowMode, rangeStart, rangeEnd, windowMode === "fleksibel" ? row.entry_grace_seconds : entryGrace,
          programId, periodId, durationId, quota, status, now, id),
      env.DB.prepare(`DELETE FROM mockup_session_packages WHERE session_id = ? AND package_id NOT IN (${packageIds.map(() => "?").join(",")})`)
        .bind(id, ...packageIds),
      ...packageIds.map((pkg) => env.DB.prepare("INSERT INTO mockup_session_packages (session_id, package_id) VALUES (?, ?) ON CONFLICT DO NOTHING").bind(id, pkg)),
    ]);
    return json({ ok: true, id });
  }
  const sessionId = newId("msn");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO mockup_sessions (id, name, window_mode, range_start, range_end, entry_grace_seconds,
        program_id, period_id, duration_id, quota, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`)
      .bind(sessionId, name, windowMode, rangeStart, rangeEnd, entryGrace, programId, periodId, durationId, quota, user.name, now, now),
    ...packageIds.map((pkg) => env.DB.prepare("INSERT INTO mockup_session_packages (session_id, package_id) VALUES (?, ?)").bind(sessionId, pkg)),
  ]);
  return json({ ok: true, id: sessionId });
}

/** Parses the CSV, matches every row to a student, and computes each window. Shared by preview and confirm. */
async function matchRosterRows(env, session, csv) {
  const parsed = parseRosterCsv(csv, { scheduled: session.window_mode === "terjadwal" });
  if (parsed.fatal) throw new HttpError(400, parsed.fatal);
  const out = [];
  for (const row of parsed.rows) {
    const item = { ...row, studentId: null, studentName: null, nameMismatch: null, inviteExisting: false, registrationExisting: false, opensAt: null, expiresAt: null, windowError: null };
    if (!row.errors.length && row.wa) {
      const byWa = await env.DB.prepare("SELECT id, name FROM students WHERE whatsapp = ?").bind(row.wa).first();
      const byEmail = row.email ? await env.DB.prepare("SELECT id, name FROM students WHERE email = ? AND id != ?").bind(row.email, byWa?.id || "").first() : null;
      if (byWa && byEmail) row.errors.push(`WhatsApp dan email menunjuk ke dua siswa berbeda: ${byWa.name} dan ${byEmail.name}.`);
      else if (byWa || byEmail) {
        item.studentId = (byWa || byEmail).id;
        item.studentName = (byWa || byEmail).name;
        // The typed name is only a warning, never a match rule: the number already identifies the
        // person. A completely different first name means the team should confirm before a second
        // student row is created under this number.
        const typedFirst = String(row.name || "").trim().split(/\s+/)[0].toLowerCase();
        const knownFirst = String(item.studentName).trim().split(/\s+/)[0].toLowerCase();
        if (typedFirst && knownFirst && typedFirst !== knownFirst) {
          item.nameMismatch = `Nomor ini terdaftar atas nama ${item.studentName}, tetapi baris ini menulis ${row.name}.`;
        }
      }
    }
    if (!row.errors.length) {
      const window = inviteWindow({
        windowMode: session.window_mode, rangeStart: session.range_start,
        rangeEnd: session.range_end, entryGraceSeconds: session.entry_grace_seconds,
      }, row.scheduledAt);
      if (window.error) item.windowError = window.error;
      else { item.opensAt = window.opensAt; item.expiresAt = window.expiresAt; }
    }
    if (!row.errors.length && item.studentId) {
      item.inviteExisting = Boolean(await env.DB.prepare("SELECT 1 FROM invites WHERE session_id = ? AND student_id = ?").bind(session.id, item.studentId).first());
      item.registrationExisting = Boolean(await env.DB.prepare(
        "SELECT 1 FROM pendaftaran WHERE student_id = ? AND program_id = ? AND period_id = ? AND status != 'batal'",
      ).bind(item.studentId, session.program_id, session.period_id).first());
    }
    out.push(item);
  }
  return out;
}

async function previewSessionImport(request, env, user, url, id) {
  const session = await sessionRow(env, id);
  if (!session) throw new HttpError(404, "Sesi tidak ditemukan.");
  if (session.status === "cancelled") throw new HttpError(400, "Sesi ini sudah dibatalkan.");
  const body = await readJson(request, IMPORT_CSV_LIMIT);
  const rows = await matchRosterRows(env, session, String(body.csv || ""));
  const valid = rows.filter((r) => !r.errors.length && !r.windowError);
  return json({
    ok: true,
    rows,
    counts: {
      total: rows.length,
      invalid: rows.length - valid.length,
      newStudents: valid.filter((r) => !r.studentId).length,
      existingStudents: valid.filter((r) => r.studentId).length,
      skipped: valid.filter((r) => r.inviteExisting).length,
    },
  });
}

async function confirmSessionImport(request, env, user, url, id) {
  const session = await sessionRow(env, id);
  if (!session) throw new HttpError(404, "Sesi tidak ditemukan.");
  if (session.status === "cancelled") throw new HttpError(400, "Sesi ini sudah dibatalkan.");
  const body = await readJson(request, IMPORT_CSV_LIMIT);
  const rows = await matchRosterRows(env, session, String(body.csv || ""));
  const bad = rows.filter((r) => r.errors.length || r.windowError);
  if (bad.length) throw new HttpError(400, `${bad.length} baris bermasalah. Baris ${bad[0].line}: ${bad[0].errors[0] || bad[0].windowError}`, { rows: bad });
  // A row whose number belongs to an existing student but whose typed name does not match needs an
  // explicit acceptance, so the team consciously confirms against the registered name.
  const accepted = new Set(Array.isArray(body.accept) ? body.accept : []);
  const mismatched = rows.filter((r) => r.nameMismatch && !accepted.has(r.line));
  if (mismatched.length) {
    throw new HttpError(400, `Baris ${mismatched[0].line}: ${mismatched[0].nameMismatch} Periksa datanya, atau centang baris ini kalau memang benar.`, {
      rows: mismatched.map((r) => ({ line: r.line, mismatch: r.nameMismatch, studentName: r.studentName })),
      code: "name_mismatch",
    });
  }
  const fresh = rows.filter((r) => !r.inviteExisting);
  // The quota check and the inserts run inside one transaction under a session-row lock, so
  // two concurrent confirms serialize and the quota cannot be overshot by both passing the
  // count check at once (audit finding admin-data/session-quota-race).
  const sessionPkgs = await sessionPackageIds(env, session.id);
  if (!sessionPkgs.length) throw new HttpError(503, "Sesi ini belum punya paket soal.");
  const outcome = await env.DB.transaction(async (tx) => {
    const locked = await tx.prepare("SELECT quota FROM mockup_sessions WHERE id = ? FOR UPDATE").bind(session.id).first();
    const roster = await tx.prepare("SELECT COUNT(*) AS n FROM invites WHERE session_id = ?").bind(session.id).first();
    if (locked?.quota && (roster?.n ?? 0) + fresh.length > locked.quota) {
      throw new HttpError(400, `Kuota sesi ${locked.quota} peserta. Impor ini menambah ${fresh.length}, jadi melebihi kuota.`);
    }
    const now = nowSeconds();
    const stmts = [];
    const usedCodes = new Set();
    let created = 0;
    let studentsNew = 0;
    let registrations = 0;
    for (const row of fresh) {
      let studentId = row.studentId;
      if (!studentId) {
        studentId = newId("stu");
        studentsNew += 1;
        stmts.push(env.DB.prepare(`INSERT INTO students (id, name, email, whatsapp, source, stage, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'IELTS Mockup', 'terdaftar', ?, ?)`)
          .bind(studentId, row.name, row.email || null, row.wa, now, now));
        stmts.push(addActivity(env, studentId, "system", `Ditambahkan lewat impor peserta mockup oleh ${user.name}.`, user.name, null, now));
      }
      if (!row.registrationExisting) {
        registrations += 1;
        const pdfId = newId("pdf");
        stmts.push(env.DB.prepare(`INSERT INTO pendaftaran (id, student_id, program_id, duration_id, period_id, class_id, status, note, registered_at, registered_by)
            VALUES (?, ?, ?, ?, ?, NULL, 'aktif', ?, ?, ?)`)
          .bind(pdfId, studentId, session.program_id, session.duration_id, session.period_id, `Mockup ${session.name}`, now, user.name));
        stmts.push(env.DB.prepare("UPDATE students SET program_id = ?, duration_id = ?, period_id = ?, stage = 'terdaftar', updated_at = ? WHERE id = ?")
          .bind(session.program_id, session.duration_id, session.period_id, now, studentId));
      }
      let code = null;
      for (let i = 0; i < 20 && !code; i += 1) {
        const candidate = mockupCode();
        if (usedCodes.has(candidate)) continue;
        if (await env.DB.prepare("SELECT 1 FROM invites WHERE code = ?").bind(candidate).first()) continue;
        usedCodes.add(candidate);
        code = candidate;
      }
      if (!code) throw new HttpError(500, "Kode undangan tidak bisa dibuat, coba lagi.");
      const token = randomToken(24);
      const inviteId = newId("inv");
      stmts.push(env.DB.prepare(`INSERT INTO invites (id, token_hash, student_id, test_key, code, package_id, session_id, opens_at, created_at, expires_at, created_by)
          VALUES (?, ?, ?, 'ielts-mockup', ?, ?, ?, ?, ?, ?, ?)`)
        .bind(inviteId, await sha256Hex(token), studentId, code, pickPackage(sessionPkgs), session.id, row.opensAt, now, row.expiresAt, user.name));
      stmts.push(env.DB.prepare(`INSERT INTO mockup_invite_queue (id, invite_id, email_status, wa_status, plain_token, created_at)
          VALUES (?, ?, ?, 'pending', ?, ?)`)
        .bind(newId("ivq"), inviteId, row.email ? "pending" : "dilewati", token, now));
      stmts.push(addActivity(env, studentId, "system", `Undangan IELTS Mockup ${session.name} dibuat lewat impor massal oleh ${user.name}.`, user.name, { inviteId }, now));
      created += 1;
    }
    stmts.push(env.DB.prepare("UPDATE mockup_sessions SET status = 'open', updated_at = ? WHERE id = ? AND status = 'draft'").bind(now, session.id));
    await tx.batch(stmts);
    return { created, studentsNew, registrations };
  });
  return json({ ok: true, created: outcome.created, skipped: rows.length - fresh.length, studentsNew: outcome.studentsNew, registrations: outcome.registrations });
}

async function sendSessionQueue(request, env, user, url, id) {
  const session = await sessionRow(env, id);
  if (!session) throw new HttpError(404, "Sesi tidak ditemukan.");
  if (session.status === "cancelled") throw new HttpError(400, "Sesi ini sudah dibatalkan.");
  const now = nowSeconds();
  await env.DB.prepare("UPDATE mockup_sessions SET queue_paused = 0, status = 'open', updated_at = ? WHERE id = ?").bind(now, id).run();
  const pending = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM mockup_invite_queue q JOIN invites i ON i.id = q.invite_id
     WHERE i.session_id = ? AND (q.wa_status = 'pending' OR q.email_status IN ('pending', 'kuota'))`,
  ).bind(id).first();
  runInBackground(() => drainInviteQueue(env));
  return json({ ok: true, pending: pending?.n ?? 0 });
}

async function pauseSessionQueue(request, env, user, url, id) {
  const body = await readJson(request);
  const paused = body.paused === false ? 0 : 1;
  await env.DB.prepare("UPDATE mockup_sessions SET queue_paused = ?, updated_at = ? WHERE id = ?").bind(paused, nowSeconds(), id).run();
  if (!paused) runInBackground(() => drainInviteQueue(env));
  return json({ ok: true, paused: Boolean(paused) });
}

async function retryInviteChannel(request, env, user, url, inviteId) {
  const row = await env.DB.prepare(
    `SELECT q.id AS queue_id, q.plain_token, s.email FROM mockup_invite_queue q
     JOIN invites i ON i.id = q.invite_id JOIN students s ON s.id = i.student_id WHERE i.id = ?`,
  ).bind(inviteId).first();
  if (!row) throw new HttpError(404, "Undangan tidak ditemukan.");
  const body = await readJson(request);
  const channel = body.channel === "email" ? "email" : "wa";
  if (!row.plain_token) throw new HttpError(400, "Undangan ini sudah selesai dikirim kedua kanalnya.");
  if (channel === "email") {
    if (!row.email) throw new HttpError(400, "Peserta ini tidak punya email.");
    await env.DB.prepare("UPDATE mockup_invite_queue SET email_status = 'pending', email_attempts = 0, email_error = NULL WHERE id = ?").bind(row.queue_id).run();
  } else {
    await env.DB.prepare("UPDATE mockup_invite_queue SET wa_status = 'pending', wa_attempts = 0, wa_error = NULL WHERE id = ?").bind(row.queue_id).run();
  }
  runInBackground(() => drainInviteQueue(env));
  return json({ ok: true });
}

async function moveInviteToSession(request, env, user, url, inviteId) {
  const invite = await env.DB.prepare(
    "SELECT i.*, s.email, s.whatsapp, s.name AS student_name FROM invites i JOIN students s ON s.id = i.student_id WHERE i.id = ?",
  ).bind(inviteId).first();
  if (!invite) throw new HttpError(404, "Undangan tidak ditemukan.");
  if (invite.used_at || invite.attempt_id) throw new HttpError(400, "Undangan ini sudah dipakai, jadi tidak bisa dipindah.");
  const body = await readJson(request);
  const target = await sessionRow(env, String(body.sessionId || ""));
  if (!target) throw new HttpError(404, "Sesi tujuan tidak ditemukan.");
  if (target.id === invite.session_id) throw new HttpError(400, "Pilih sesi lain sebagai tujuan.");
  if (target.status === "cancelled") throw new HttpError(400, "Sesi tujuan sudah dibatalkan.");
  const taken = await env.DB.prepare("SELECT 1 FROM invites WHERE session_id = ? AND student_id = ?").bind(target.id, invite.student_id).first();
  if (taken) throw new HttpError(400, "Siswa ini sudah punya undangan di sesi tujuan.");
  let scheduledAt = null;
  if (target.window_mode === "terjadwal") {
    const at = body.date && body.time ? Date.parse(`${body.date}T${body.time}:00+07:00`) : Number.NaN;
    if (Number.isNaN(at)) throw new HttpError(400, "Tanggal dan jam baru wajib diisi untuk sesi terjadwal.", { field: "date" });
    scheduledAt = Math.floor(at / 1000);
    if (scheduledAt <= nowSeconds()) throw new HttpError(400, "Jadwal baru sudah lewat.");
  }
  const window = inviteWindow({
    windowMode: target.window_mode, rangeStart: target.range_start,
    rangeEnd: target.range_end, entryGraceSeconds: target.entry_grace_seconds,
  }, scheduledAt);
  if (window.error) throw new HttpError(400, window.error);
  // A moved invite keeps its package when the target session still offers it, and gets a
  // fresh pick from the target's set otherwise.
  const targetPkgs = await sessionPackageIds(env, target.id);
  if (!targetPkgs.length) throw new HttpError(503, "Sesi tujuan belum punya paket soal.");
  const movedPackage = invite.package_id && targetPkgs.includes(invite.package_id)
    ? invite.package_id
    : pickPackage(targetPkgs);
  let code = null;
  for (let i = 0; i < 20 && !code; i += 1) {
    const candidate = mockupCode();
    if (await env.DB.prepare("SELECT 1 FROM invites WHERE code = ?").bind(candidate).first()) continue;
    code = candidate;
  }
  if (!code) throw new HttpError(500, "Kode undangan tidak bisa dibuat, coba lagi.");
  const token = randomToken(24);
  const now = nowSeconds();
  const newInviteId = newId("inv");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO invites (id, token_hash, student_id, test_key, code, package_id, session_id, opens_at, created_at, expires_at, created_by)
        VALUES (?, ?, ?, 'ielts-mockup', ?, ?, ?, ?, ?, ?, ?)`)
      .bind(newInviteId, await sha256Hex(token), invite.student_id, code, movedPackage, target.id, window.opensAt, now, window.expiresAt, user.name),
    env.DB.prepare(`INSERT INTO mockup_invite_queue (id, invite_id, email_status, wa_status, plain_token, created_at)
        VALUES (?, ?, ?, 'pending', ?, ?)`)
      .bind(newId("ivq"), newInviteId, invite.email ? "pending" : "dilewati", token, now),
    env.DB.prepare("DELETE FROM invites WHERE id = ?").bind(invite.id),
    addActivity(env, invite.student_id, "system",
      `Undangan IELTS Mockup dipindahkan ke sesi ${target.name} oleh ${user.name}.`, user.name, { inviteId: newInviteId }, now),
  ]);
  runInBackground(() => drainInviteQueue(env));
  return json({ ok: true, id: newInviteId });
}

async function testSendSessionMessage(request, env, user, url, id) {
  const session = await sessionRow(env, id);
  if (!session) throw new HttpError(404, "Sesi tidak ditemukan.");
  const body = await readJson(request);
  const now = nowSeconds();
  const schedule = session.window_mode === "fleksibel"
    ? `${formatWib(session.range_start)} sampai ${formatWib(session.range_end)}`
    : `${formatWib(now + 7200)} (contoh jadwal)`;
  const link = `${env.PUBLIC_WEB_URL}/?undangan=contoh-tautan`;
  const code = "ABC234";
  const deadline = `paling telat ${formatWib(now + 7200 + session.entry_grace_seconds)}`;
  const name = text(body.name || user.name, 80);
  if (body.email) {
    if (!isEmail(String(body.email))) throw new HttpError(400, "Alamat email uji belum benar.", { field: "email" });
    // A test send spends the same shared 24 hour Cloudflare quota as real invite emails, so
    // refuse it when the quota is already spent; otherwise the queue believes it has headroom
    // and real invites start failing (audit finding admin-data/testsend-quota-unaccounted).
    const used = await emailsSentRecently(env);
    if (used >= EMAIL_DAILY_LIMIT) throw new HttpError(429, `Jatah email 24 jam terakhir sudah habis (${used} dari ${EMAIL_DAILY_LIMIT}), jadi email uji tidak bisa dikirim. WhatsApp uji tetap bisa.`);
    const mail = buildInviteEmail({ name, sessionName: session.name, schedule, link, code, deadline });
    try {
      if (!env.SEND_EMAIL) throw new Error("Email belum diatur di server. Isi CLOUDFLARE_EMAIL_TOKEN di pengaturan server.");
      await env.SEND_EMAIL.send({ from: env.RESULT_FROM_EMAIL, to: String(body.email).toLowerCase(), subject: mail.subject, html: mail.html, text: mail.text });
      // Count the test send against the same quota the queue reads, so the drain never
      // believes it has headroom the test sends already spent.
      await env.DB.prepare("INSERT INTO wa_messages (student_id, to_number, text, status, provider_message_id, error, created_at, created_by) VALUES (NULL, '', ?, 'email_test', NULL, NULL, ?, ?)")
        .bind(`email uji: ${session.name}`, now, user.name).run();
    } catch (error) {
      throw new HttpError(502, `Email uji gagal terkirim: ${String(error.message || error).slice(0, 200)}`);
    }
  }
  if (body.wa) {
    const to = normalizeWhatsapp(String(body.wa));
    if (!to) throw new HttpError(400, "Nomor WhatsApp uji terlihat belum lengkap.", { field: "wa" });
    const message = buildInviteWhatsApp({ firstName: String(name).split(/\s+/)[0], sessionName: session.name, schedule, link, code, deadline });
    const result = await sendWhatsApp(env, { to, text: message });
    await env.DB.prepare("INSERT INTO wa_messages (student_id, to_number, text, status, provider_message_id, error, created_at, created_by) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)")
      .bind(to, message, result.status, result.messageId || null, result.error || null, now, user.name).run();
    if (!result.ok) throw new HttpError(502, `WhatsApp uji gagal terkirim: ${result.error}`);
  }
  return json({ ok: true });
}

async function getSessionRoster(request, env, user, url, id) {
  const session = await sessionRow(env, id);
  if (!session) throw new HttpError(404, "Sesi tidak ditemukan.");
  const rows = await env.DB.prepare(
    `SELECT i.id AS invite_id, i.code, i.package_id, i.opens_at, i.expires_at, i.used_at, i.attempt_id,
            s.id AS student_id, s.name, s.whatsapp, s.email,
            q.email_status, q.email_attempts, q.email_error, q.email_sent_at, q.wa_status, q.wa_attempts, q.wa_error, q.wa_sent_at, q.plain_token,
            a.status AS attempt_status, a.submitted_at
     FROM invites i
     JOIN students s ON s.id = i.student_id
     LEFT JOIN mockup_invite_queue q ON q.invite_id = i.id
     LEFT JOIN attempts a ON a.invite_id = i.id
     WHERE i.session_id = ?
     ORDER BY i.opens_at, s.name`,
  ).bind(id).all();
  const sent = await emailsSentRecently(env);
  return json({
    ok: true,
    session: mapSessionRow(session, await sessionPackageIds(env, id)),
    emailUsage: { sent, limit: EMAIL_DAILY_LIMIT },
    rows: rows.results.map((r) => ({
      inviteId: r.invite_id, code: r.code, packageId: r.package_id || null, opensAt: ms(r.opens_at), expiresAt: ms(r.expires_at),
      studentId: r.student_id, name: r.name, wa: r.whatsapp, email: r.email || "",
      emailStatus: r.email_status, emailError: r.email_error || "", emailSentAt: ms(r.email_sent_at),
      waStatus: r.wa_status, waError: r.wa_error || "", waSentAt: ms(r.wa_sent_at),
      attemptStatus: r.attempt_status || null, submittedAt: ms(r.submitted_at),
    })),
  });
}

/* ===================== Tests and questions ===================== */
async function updateTestSettings(request, env, user, url, key) {
  const body = await readJson(request);
  const row = await env.DB.prepare("SELECT * FROM tests WHERE key = ?").bind(key).first();
  const next = { ...row };
  if (body.timeMode !== undefined) {
    if (!["total", "per", "sections"].includes(body.timeMode)) throw new HttpError(400, "Mode waktu tidak dikenal.");
    if (body.timeMode === "sections" && key !== "ielts-mockup") throw new HttpError(400, "Mode waktu per bagian hanya untuk IELTS Mockup.");
    next.time_mode = body.timeMode;
  }
  if (body.totalSeconds !== undefined) { const v = int(body.totalSeconds, { min: 60, max: 10800 }); if (v === null) throw new HttpError(400, "Durasi tes harus antara 1 dan 180 menit."); next.total_seconds = v; }
  if (body.perDefault !== undefined) { const v = int(body.perDefault, { min: 5, max: 180 }); if (v === null) throw new HttpError(400, "Waktu bawaan per soal harus antara 5 dan 180 detik."); next.per_default = v; }
  let sectionChanged = false;
  for (const [field, column, label, min, max] of [
    ["listeningSeconds", "listening_seconds", "Listening", 60, 10800],
    ["readingSeconds", "reading_seconds", "Reading", 60, 10800],
    ["writingSeconds", "writing_seconds", "Writing", 60, 10800],
    ["speakingBlockSeconds", "speaking_block_seconds", "Speaking", 60, 10800],
    ["listeningBreakSeconds", "listening_break_seconds", "Jeda Listening", 0, 1800],
    ["readingBreakSeconds", "reading_break_seconds", "Jeda Reading", 0, 1800],
    ["writingBreakSeconds", "writing_break_seconds", "Jeda Writing", 0, 1800],
  ]) {
    if (body[field] === undefined) continue;
    const v = int(body[field], { min, max });
    if (v === null) throw new HttpError(400, max === 1800 && min === 0
      ? `${label} harus antara 0 dan 30 menit.`
      : `Waktu ${label} harus antara 1 dan 180 menit.`, { field });
    next[column] = v;
    if (!field.includes("Break")) sectionChanged = true;
  }
  if (sectionChanged || next.time_mode === "sections") {
    const sum = (next.listening_seconds || 0) + (next.reading_seconds || 0) + (next.writing_seconds || 0) + (next.speaking_block_seconds || 0);
    if (sum) next.total_seconds = sum;
  }
  if (body.open !== undefined) next.is_open = body.open ? 1 : 0;
  if (body.maxViolations !== undefined) { const v = int(body.maxViolations, { min: 1, max: 5 }); if (v === null) throw new HttpError(400, "Batas pelanggaran harus antara 1 dan 5."); next.max_violations = v; }
  if (body.passScore !== undefined && key === "post") { const v = int(body.passScore, { min: 0, max: 100 }); if (v === null) throw new HttpError(400, "Nilai kelulusan harus angka bulat dari 0 sampai 100."); next.pass_score = v; }
  if (body.autoSubmit !== undefined && key === "ielts-mockup") next.auto_submit = body.autoSubmit ? 1 : 0;
  if (body.audioUrl !== undefined && key === "ielts-mockup") {
    const url = String(body.audioUrl || "").trim();
    if (url && !url.startsWith("/")) throw new HttpError(400, "Alamat audio harus dimulai dengan / dan dihosting di situs tes ini.", { field: "audioUrl" });
    next.audio_url = url || null;
  }
  readSpeakingSettings(body, key, next);
  await env.DB.prepare(`UPDATE tests SET time_mode = ?, total_seconds = ?, per_default = ?, listening_seconds = ?, reading_seconds = ?, writing_seconds = ?, speaking_block_seconds = ?, listening_break_seconds = ?, reading_break_seconds = ?, writing_break_seconds = ?, is_open = ?, max_violations = ?, pass_score = ?,
      speaking_enabled = ?, speaking_seconds = ?, speaking_min_seconds = ?, speaking_prompt = ?, speaking_dialect = ?, speaking_count = ?, speaking_randomize = ?, auto_submit = ?, audio_url = ?, updated_at = ?, updated_by = ? WHERE key = ?`)
    .bind(next.time_mode, next.total_seconds, next.per_default, next.listening_seconds ?? null, next.reading_seconds ?? null, next.writing_seconds ?? null, next.speaking_block_seconds ?? null, next.listening_break_seconds ?? 0, next.reading_break_seconds ?? 0, next.writing_break_seconds ?? 0, next.is_open, next.max_violations, next.pass_score,
      next.speaking_enabled, next.speaking_seconds, next.speaking_min_seconds, next.speaking_prompt, next.speaking_dialect,
      next.speaking_count ?? 1, next.speaking_randomize ?? 0,
      next.auto_submit ?? 0, next.audio_url ?? null, nowSeconds(), user.name, key).run();
  return json({ ok: true });
}

/* The Speaking part of Placement Test, Pengaturan. The questions live in the Speaking tab; the
   prompt column stays only so attempts from before the bank keep their single question. */
function readSpeakingSettings(body, key, next) {
  const keys = ["speakingEnabled", "speakingSeconds", "speakingMinSeconds", "speakingPrompt", "speakingDialect", "speakingCount", "speakingRandomize"];
  if (!keys.some((k) => body[k] !== undefined)) return;
  if (key !== "placement") throw new HttpError(400, "Bagian speaking baru tersedia untuk placement test.");
  if (body.speakingPrompt !== undefined) {
    const prompt = String(body.speakingPrompt ?? "").replace(/\s+/g, " ").trim();
    if (prompt.length > 300) throw new HttpError(400, "Pertanyaan speaking maksimal 300 karakter.", { field: "speakingPrompt" });
    next.speaking_prompt = prompt || null;
  }
  if (body.speakingSeconds !== undefined) {
    const v = int(body.speakingSeconds, { min: 15, max: 90 });
    if (v === null) throw new HttpError(400, "Durasi maksimal rekaman harus antara 15 dan 90 detik.", { field: "speakingSeconds" });
    next.speaking_seconds = v;
  }
  if (body.speakingMinSeconds !== undefined) {
    const v = int(body.speakingMinSeconds, { min: 5, max: 30 });
    if (v === null) throw new HttpError(400, "Durasi minimal rekaman harus antara 5 dan 30 detik.", { field: "speakingMinSeconds" });
    next.speaking_min_seconds = v;
  }
  if (body.speakingDialect !== undefined) {
    if (!["en-us", "en-gb"].includes(body.speakingDialect)) throw new HttpError(400, "Pilih aksen penilaian en-US atau en-GB.", { field: "speakingDialect" });
    next.speaking_dialect = body.speakingDialect;
  }
  if (body.speakingCount !== undefined) {
    const v = int(body.speakingCount, { min: 1, max: 50 });
    if (v === null) throw new HttpError(400, "Jumlah pertanyaan speaking harus angka 1 sampai 50.", { field: "speakingCount" });
    next.speaking_count = v;
  }
  if (body.speakingRandomize !== undefined) next.speaking_randomize = body.speakingRandomize ? 1 : 0;
  if (body.speakingEnabled !== undefined) next.speaking_enabled = body.speakingEnabled ? 1 : 0;
  if (next.speaking_min_seconds >= next.speaking_seconds) throw new HttpError(400, "Durasi minimal harus lebih pendek dari durasi maksimal.", { field: "speakingMinSeconds" });
}

function readQuestionInput(body) {
  const rawPrompt = String(body.prompt ?? "").replace(/\r\n/g, "\n").trim();
  const rawPassage = String(body.passage ?? "").replace(/\r\n/g, "\n").trim();
  // Long text is refused, never silently cut: the reading passages are longer than the old cap.
  if (rawPrompt.length > 1000) throw new HttpError(400, "Teks soal terlalu panjang, maksimal 1.000 karakter.");
  if (rawPassage.length > 20000) throw new HttpError(400, "Bacaan terlalu panjang, maksimal 20.000 karakter.");
  const prompt = rawPrompt;
  const passage = rawPassage;
  if (!prompt) throw new HttpError(400, "Teks soal wajib diisi.");
  const part = body.part === undefined || body.part === null || body.part === "" ? null : int(body.part, { min: 1, max: 9 });
  if (body.part !== undefined && body.part !== null && body.part !== "" && part === null) throw new HttpError(400, "Nomor bagian harus angka 1 sampai 9.");
  const seconds = body.seconds === undefined ? null : int(body.seconds, { min: 5, max: 180 });
  if (body.seconds !== undefined && seconds === null) throw new HttpError(400, "Waktu soal harus antara 5 dan 180 detik.");
  const base = { prompt, passage: passage || null, part, skill: SKILLS.includes(body.skill) ? body.skill : "Grammar", status: body.status === "draf" ? "draf" : "aktif", seconds };

  if (body.type === "longtext") {
    const minWords = int(body.minWords, { min: 50, max: 1000 });
    if (minWords === null) throw new HttpError(400, "Jumlah kata minimal harus angka 50 sampai 1.000.", { field: "minWords" });
    return { ...base, type: "longtext", accepted: null, options: {}, answer: "ESSAY", minWords };
  }

  if (body.type === "text") {
    const accepted = (Array.isArray(body.accepted) ? body.accepted : String(body.accepted || "").split(/\n/))
      .map((a) => text(a, 300)).filter(Boolean);
    if (!accepted.length) throw new HttpError(400, "Tulis minimal satu jawaban yang diterima.");
    if (new Set(accepted.map((a) => a.toLowerCase())).size !== accepted.length) throw new HttpError(400, "Ada jawaban diterima yang ditulis dua kali.");
    return { ...base, type: "text", accepted, options: {}, answer: accepted[0] };
  }

  const options = {};
  for (const k of CHOICES) {
    const value = text(body.options?.[k], 300);
    if (value) options[k] = value;
  }
  const filled = CHOICES.filter((k) => options[k]);
  if (filled.length < 2) throw new HttpError(400, "Isi minimal dua pilihan jawaban.");
  if (filled.some((k, i) => filled.slice(0, i).some((j) => options[j].toLowerCase() === options[k].toLowerCase()))) throw new HttpError(400, "Ada pilihan jawaban yang sama. Setiap pilihan harus berbeda.");
  if (!CHOICES.includes(body.answer) || !options[body.answer]) throw new HttpError(400, "Pilih satu jawaban yang benar dari pilihan yang terisi.");
  return { ...base, type: "choice", accepted: null, options, answer: body.answer };
}

async function readPackageId(env, key, body) {
  if (key !== "ielts-mockup") return null;
  const raw = String(body.packageId || "").trim();
  if (!raw) throw new HttpError(400, "Pilih paket soal dulu.", { field: "packageId" });
  const row = await env.DB.prepare("SELECT id FROM question_packages WHERE id = ? AND test_key = ?").bind(raw, key).first();
  if (!row) throw new HttpError(400, "Paket soal tidak ditemukan di tes ini.", { field: "packageId" });
  return row.id;
}

async function readSectionId(env, key, body, packageId) {
  const raw = String(body.sectionId || "").trim();
  if (!raw) return null;
  const row = await env.DB.prepare("SELECT id FROM question_sections WHERE id = ? AND test_key = ? AND package_id IS NOT DISTINCT FROM ?").bind(raw, key, packageId).first();
  if (!row) throw new HttpError(400, "Bagian tidak ditemukan di paket ini.", { field: "sectionId" });
  return row.id;
}

async function createQuestion(request, env, user, url, key) {
  const body = await readJson(request);
  const q = readQuestionInput(body);
  const packageId = await readPackageId(env, key, body);
  const sectionId = await readSectionId(env, key, body, packageId);
  const test = await env.DB.prepare("SELECT per_default FROM tests WHERE key = ?").bind(key).first();
  const max = await env.DB.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM questions WHERE test_key = ? AND package_id IS NOT DISTINCT FROM ?").bind(key, packageId).first();
  const now = nowSeconds();
  const r = await env.DB.prepare(`INSERT INTO questions (test_key, package_id, position, skill, part, section_id, prompt, passage, option_a, option_b, option_c, option_d, option_e, option_f, answer, seconds, status, type, accepted, min_words, created_at, updated_at)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(key, packageId, max.p + 1, q.skill, q.part, sectionId, q.prompt, q.passage,
      q.options.A ?? null, q.options.B ?? null, q.options.C ?? null, q.options.D ?? null, q.options.E ?? null, q.options.F ?? null,
      q.answer, q.seconds ?? test.per_default, q.status, q.type, q.accepted ? JSON.stringify(q.accepted) : null, q.minWords ?? null, now, now).first();
  return json({ ok: true, id: r ? r.id : null });
}

async function getQuestionRow(env, key, id) {
  const q = await env.DB.prepare("SELECT * FROM questions WHERE id = ? AND test_key = ?").bind(id, key).first();
  if (!q) throw new HttpError(404, "Soal tidak ditemukan.");
  return q;
}

async function updateQuestion(request, env, user, url, key, id) {
  const row = await getQuestionRow(env, key, Number(id));
  const body = await readJson(request);
  const q = readQuestionInput(body);
  const sectionId = await readSectionId(env, key, body, row.package_id);
  await env.DB.prepare(`UPDATE questions SET skill = ?, part = ?, section_id = ?, prompt = ?, passage = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, option_e = ?, option_f = ?,
                         answer = ?, seconds = ?, status = ?, type = ?, accepted = ?, min_words = ?, updated_at = ? WHERE id = ?`)
    .bind(q.skill, q.part, sectionId, q.prompt, q.passage,
      q.options.A ?? null, q.options.B ?? null, q.options.C ?? null, q.options.D ?? null, q.options.E ?? null, q.options.F ?? null,
      q.answer, q.seconds ?? row.seconds, q.status, q.type, q.accepted ? JSON.stringify(q.accepted) : null, q.minWords ?? null, nowSeconds(), row.id).run();
  return json({ ok: true, keyChanged: row.answer !== q.answer });
}

async function renumber(env, key, packageId = null) {
  const { results } = await env.DB.prepare("SELECT id FROM questions WHERE test_key = ? AND package_id IS NOT DISTINCT FROM ? ORDER BY position, id").bind(key, packageId).all();
  if (results.length) await env.DB.batch(results.map((r, i) => env.DB.prepare("UPDATE questions SET position = ? WHERE id = ?").bind(i + 1, r.id)));
}

async function deleteQuestion(request, env, user, url, key, id) {
  const row = await getQuestionRow(env, key, Number(id));
  await env.DB.prepare("DELETE FROM questions WHERE id = ?").bind(row.id).run();
  await renumber(env, key, row.package_id);
  return json({ ok: true });
}

/* ---------- Question sections: a question range with its passage and audio ---------- */

function readSectionInput(body) {
  const title = text(body.title, 80);
  if (!title) throw new HttpError(400, "Nama bagian wajib diisi.", { field: "title" });
  const skill = ["Listening", "Reading"].includes(body.skill) ? body.skill : "Reading";
  const part = body.part === undefined || body.part === null || body.part === "" ? null : int(body.part, { min: 1, max: 9 });
  if (body.part !== undefined && body.part !== null && body.part !== "" && part === null) throw new HttpError(400, "Nomor bagian harus angka 1 sampai 9.", { field: "part" });
  const from = int(body.from, { min: 1, max: 500 });
  const to = int(body.to, { min: 1, max: 500 });
  if (from === null || to === null || from > to) throw new HttpError(400, "Rentang soal tidak valid.", { field: "from" });
  const rawPassage = String(body.passage ?? "").replace(/\r\n/g, "\n").trim();
  if (rawPassage.length > 20000) throw new HttpError(400, "Bacaan terlalu panjang, maksimal 20.000 karakter.", { field: "passage" });
  const audioUrl = String(body.audioUrl || "").trim();
  if (audioUrl && !audioUrl.startsWith("/")) throw new HttpError(400, "Alamat audio harus dimulai dengan / dan dihosting di situs tes ini.", { field: "audioUrl" });
  const imageUrl = String(body.imageUrl || "").trim();
  if (imageUrl && !imageUrl.startsWith("/")) throw new HttpError(400, "Alamat gambar harus dimulai dengan / dan dihosting di situs tes ini.", { field: "imageUrl" });
  return { title, skill, part, from, to, passage: rawPassage || null, audioUrl: audioUrl || null, imageUrl: imageUrl || null };
}

async function assignSectionRange(env, key, sectionId, from, to, part, packageId) {
  await env.DB.prepare("UPDATE questions SET section_id = ?, part = COALESCE(?, part) WHERE test_key = ? AND package_id IS NOT DISTINCT FROM ? AND position BETWEEN ? AND ?")
    .bind(sectionId, part, key, packageId, from, to).run();
}

async function createSection(request, env, user, url, key) {
  const body = await readJson(request);
  const s = readSectionInput(body);
  const packageId = await readPackageId(env, key, body);
  const max = await env.DB.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM question_sections WHERE test_key = ? AND package_id IS NOT DISTINCT FROM ?").bind(key, packageId).first();
  const now = nowSeconds();
  const id = newId("sec");
  await env.DB.prepare(`INSERT INTO question_sections (id, test_key, package_id, position, title, skill, part, passage, audio_url, image_url, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, key, packageId, max.p + 1, s.title, s.skill, s.part, s.passage, s.audioUrl, s.imageUrl, now, now).run();
  await assignSectionRange(env, key, id, s.from, s.to, s.part, packageId);
  return json({ ok: true, id });
}

async function getSectionRow(env, key, id) {
  const row = await env.DB.prepare("SELECT * FROM question_sections WHERE id = ? AND test_key = ?").bind(id, key).first();
  if (!row) throw new HttpError(404, "Bagian tidak ditemukan.");
  return row;
}

async function updateSection(request, env, user, url, key, id) {
  const row = await getSectionRow(env, key, id);
  const s = readSectionInput(await readJson(request));
  await env.DB.prepare(`UPDATE question_sections SET title = ?, skill = ?, part = ?, passage = ?, audio_url = ?, image_url = ?, updated_at = ? WHERE id = ?`)
    .bind(s.title, s.skill, s.part, s.passage, s.audioUrl, s.imageUrl, nowSeconds(), row.id).run();
  // Questions outside the new range leave the section; questions inside it join, even when they
  // belonged to another section before.
  await env.DB.prepare("UPDATE questions SET section_id = NULL WHERE section_id = ? AND (position < ? OR position > ?)").bind(row.id, s.from, s.to).run();
  await assignSectionRange(env, key, row.id, s.from, s.to, s.part, row.package_id);
  return json({ ok: true });
}

async function deleteSection(request, env, user, url, key, id) {
  const row = await getSectionRow(env, key, id);
  await env.DB.prepare("DELETE FROM question_sections WHERE id = ?").bind(row.id).run();
  return json({ ok: true });
}

/* ---------- Question packages: the question set a student gets ---------- */

function readPackageInput(body) {
  const name = text(body.name, 60);
  if (!name) throw new HttpError(400, "Nama paket wajib diisi.", { field: "name" });
  const active = body.active === undefined ? true : Boolean(body.active);
  return { name, active };
}

async function createPackage(request, env, user, url, key) {
  if (key !== "ielts-mockup") throw new HttpError(400, "Paket soal hanya dipakai tes IELTS Mockup.");
  const p = readPackageInput(await readJson(request));
  const max = await env.DB.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM question_packages WHERE test_key = ?").bind(key).first();
  const now = nowSeconds();
  const id = newId("pkg");
  await env.DB.prepare("INSERT INTO question_packages (id, test_key, name, position, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, key, p.name, max.p + 1, p.active ? 1 : 0, now, now).run();
  return json({ ok: true, id });
}

async function updatePackage(request, env, user, url, key, id) {
  if (key !== "ielts-mockup") throw new HttpError(400, "Paket soal hanya dipakai tes IELTS Mockup.");
  const row = await env.DB.prepare("SELECT * FROM question_packages WHERE id = ? AND test_key = ?").bind(id, key).first();
  if (!row) throw new HttpError(404, "Paket soal tidak ditemukan.");
  const p = readPackageInput(await readJson(request));
  await env.DB.prepare("UPDATE question_packages SET name = ?, is_active = ?, updated_at = ? WHERE id = ?")
    .bind(p.name, p.active ? 1 : 0, nowSeconds(), row.id).run();
  return json({ ok: true });
}

async function questionAction(request, env, user, url, key, id, action) {
  const row = await getQuestionRow(env, key, Number(id));
  const now = nowSeconds();
  await renumber(env, key, row.package_id);
  const fresh = await getQuestionRow(env, key, row.id);
  if (action === "toggle") {
    await env.DB.prepare("UPDATE questions SET status = ?, updated_at = ? WHERE id = ?").bind(fresh.status === "aktif" ? "draf" : "aktif", now, fresh.id).run();
  } else if (action === "duplicate") {
    await env.DB.batch([
      env.DB.prepare("UPDATE questions SET position = position + 1 WHERE test_key = ? AND package_id IS NOT DISTINCT FROM ? AND position > ?").bind(key, fresh.package_id, fresh.position),
      env.DB.prepare(`INSERT INTO questions (test_key, package_id, position, skill, part, section_id, prompt, passage, option_a, option_b, option_c, option_d, option_e, option_f, answer, seconds, status, type, accepted, min_words, created_at, updated_at)
                      SELECT test_key, package_id, position + 1, skill, part, section_id, prompt, passage, option_a, option_b, option_c, option_d, option_e, option_f, answer, seconds, 'draf', type, accepted, min_words, ?::bigint, ?::bigint FROM questions WHERE id = ?`).bind(now, now, fresh.id),
    ]);
  } else {
    const other = await env.DB.prepare(`SELECT id, position FROM questions WHERE test_key = ? AND package_id IS NOT DISTINCT FROM ? AND position ${action === "up" ? "< ? ORDER BY position DESC" : "> ? ORDER BY position ASC"} LIMIT 1`)
      .bind(key, fresh.package_id, fresh.position).first();
    if (other) {
      await env.DB.batch([
        env.DB.prepare("UPDATE questions SET position = ? WHERE id = ?").bind(other.position, fresh.id),
        env.DB.prepare("UPDATE questions SET position = ? WHERE id = ?").bind(fresh.position, other.id),
      ]);
    }
  }
  return json({ ok: true });
}

async function applySeconds(request, env, user, url, key) {
  const body = await readJson(request);
  const v = int(body.seconds, { min: 5, max: 180 });
  if (v === null) throw new HttpError(400, "Waktu bawaan per soal harus antara 5 dan 180 detik.");
  await env.DB.batch([
    env.DB.prepare("UPDATE questions SET seconds = ?, updated_at = ? WHERE test_key = ?").bind(v, nowSeconds(), key),
    env.DB.prepare("UPDATE tests SET per_default = ?, updated_at = ?, updated_by = ? WHERE key = ?").bind(v, nowSeconds(), user.name, key),
  ]);
  return json({ ok: true });
}

async function updateLevels(request, env) {
  const body = await readJson(request);
  const current = await loadLevels(env);
  const input = Array.isArray(body.levels) ? body.levels : [];
  const active = (await loadQuestions(env, "placement", { activeOnly: true })).length;
  const rows = current.map((l) => {
    const v = input.find((x) => x.key === l.key) || {};
    return { ...l, min: int(v.min, { min: 0, max: 200 }), max: int(v.max, { min: 0, max: 200 }) };
  });
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (r.min === null || r.max === null) throw new HttpError(400, `Isi skor minimum dan maksimum untuk level ${r.label}.`);
    if (r.min > r.max) throw new HttpError(400, `Skor minimum ${r.label} lebih besar dari skor maksimumnya.`);
    if (i === 0 && r.min !== 0) throw new HttpError(400, "Level pertama harus dimulai dari skor 0.");
    if (i > 0 && r.min !== rows[i - 1].max + 1) throw new HttpError(400, `Level ${r.label} harus dimulai tepat setelah ${rows[i - 1].label}, yaitu dari skor ${rows[i - 1].max + 1}.`);
  }
  if (rows[rows.length - 1].max !== active) throw new HttpError(400, `Level terakhir harus berakhir di skor ${active}, sesuai jumlah soal aktif.`);
  await env.DB.batch(rows.map((r) => env.DB.prepare("UPDATE levels SET min_score = ?, max_score = ? WHERE key = ?").bind(r.min, r.max, r.key)));
  return json({ ok: true });
}

/* ===================== Attempts ===================== */
async function getAttemptRow(env, id) {
  const a = await env.DB.prepare("SELECT * FROM attempts WHERE id = ?").bind(id).first();
  if (!a) throw new HttpError(404, "Submission tidak ditemukan.");
  return a;
}

async function getAttemptDetail(request, env, user, url, id) {
  const a = await getAttemptRow(env, id);
  const { results } = await env.DB.prepare("SELECT question_id, choice, is_correct, answer_key FROM answers WHERE attempt_id = ? ORDER BY question_id").bind(id).all();
  const order = a.question_ids ? JSON.parse(a.question_ids) : null;
  const answers = results.map((r) => ({ questionId: r.question_id, choice: r.choice, ok: Boolean(r.is_correct), key: r.answer_key }));
  if (order) answers.sort((x, y) => order.indexOf(x.questionId) - order.indexOf(y.questionId));
  const log = [{ at: ms(a.consent_at), type: "consent", consent: a.consent_version }, { at: ms(a.started_at), type: "start" }];
  if (a.audio_played_at) log.push({ at: ms(a.audio_played_at), type: "audio_played" });
  let strike = 0;
  for (const entry of String(a.violation_log || "").split(";").filter(Boolean)) {
    const [t, type] = entry.split(":");
    const focus = ["fullscreen_exit", "tab_hidden", "window_blur"].includes(type);
    if (focus) strike += 1;
    log.push({ at: ms(Number(t)), type, strike: focus ? strike : null });
  }
  const status = attemptStatus(a);
  if (a.submitted_at) log.push({ at: ms(a.submitted_at), type: "submit" });
  else if (status === "timeout") log.push({ at: ms(a.expires_at), type: "timeout" });
  else if (status === "violation") log.push({ at: log[log.length - 1].at + 400, type: "violation_stop" });
  if (a.email_sent_at) log.push({ at: ms(a.email_sent_at), type: "email_sent" });
  else if (String(a.email_status || "").startsWith("failed")) log.push({ at: ms(a.submitted_at) + 60000, type: "email_failed" });
  if (a.voided_at) log.push({ at: ms(a.voided_at), type: "voided", by: a.voided_by });
  // The placement speaking carries one row per question now. The summary keeps the old `speaking`
  // shape (a merge), and `speakingSubmissions` lists every recording in question order.
  const spRows = (await env.DB.prepare(
    `SELECT id, status, needs_review, position, prompt, transcript, cefr_overall, ielts_overall, scores, error, tries, next_attempt_at,
            provider_request_id, graded_at, graded_by, created_at, duration_seconds, audio_bytes, audio_mime, (audio IS NOT NULL) AS has_audio
       FROM speaking_submissions WHERE attempt_id = ? ORDER BY position, created_at`,
  ).bind(id).all()).results || [];
  const speaking = spRows.length ? speakingDetail(mergeSpeakingRows(spRows)) : null;
  const speakingSubmissions = spRows.map((row) => ({ ...speakingDetail(row), position: row.position }));
  for (const sp of spRows) {
    const studentSkip = sp.status === "skipped" && parseJson(sp.scores).source === "student";
    log.push({ at: ms(sp.created_at), type: studentSkip ? "speaking_student_skip" : "speaking_uploaded" });
    if (sp.graded_at && !studentSkip) log.push({ at: ms(sp.graded_at), type: `speaking_${sp.status}`, by: sp.graded_by || "" });
  }
  const { results: speakingRows } = await env.DB.prepare(
    `SELECT id, part, prompt_no, prompt, status, transcript, scores, ielts_overall, needs_review, error, duration_seconds, audio_bytes, (audio IS NOT NULL) AS has_audio
     FROM speaking_answers WHERE attempt_id = ? ORDER BY part, prompt_no`,
  ).bind(id).all();
  const speakingAnswers = speakingRows.map((r) => ({ ...r, scores: parseJson(r.scores), needs_review: Boolean(r.needs_review) }));
  log.sort((x, y) => x.at - y.at);
  return json({ id: a.id, answers, log, device: deviceLabel(a.user_agent), country: a.country || "", consent: a.consent_version, speaking, speakingSubmissions, speakingAnswers });
}

function speakingDetail(sp) {
  return {
    ...speakingBrief(sp),
    prompt: sp.prompt, transcript: sp.transcript || "", scores: parseJson(sp.scores), error: sp.error || "",
    tries: sp.tries, nextAttemptAt: ms(sp.next_attempt_at), requestId: sp.provider_request_id || "", gradedBy: sp.graded_by || "",
    durationSeconds: sp.duration_seconds, audioBytes: sp.audio_bytes, audioMime: sp.audio_mime || "", hasAudio: Boolean(sp.has_audio),
  };
}

/* ===================== The placement speaking bank ===================== */

function readSpeakingQuestionInput(body) {
  const prompt = String(body.prompt ?? "").replace(/\s+/g, " ").trim();
  if (prompt.length < 5) throw new HttpError(400, "Pertanyaan speaking minimal 5 karakter.", { field: "prompt" });
  if (prompt.length > 300) throw new HttpError(400, "Pertanyaan speaking maksimal 300 karakter.", { field: "prompt" });
  const status = body.status === "draf" ? "draf" : "aktif";
  return { prompt, status };
}

async function saveSpeakingQuestion(request, env, user, url, id = null) {
  const body = await readJson(request);
  const { prompt, status } = readSpeakingQuestionInput(body);
  const now = nowSeconds();
  if (id) {
    const row = await env.DB.prepare("SELECT id FROM speaking_questions WHERE id = ?").bind(Number(id)).first();
    if (!row) throw new HttpError(404, "Pertanyaan speaking tidak ditemukan.");
    await env.DB.prepare("UPDATE speaking_questions SET prompt = ?, status = ?, updated_at = ? WHERE id = ?")
      .bind(prompt, status, now, Number(id)).run();
    return json({ ok: true, id: Number(id) });
  }
  const max = await env.DB.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM speaking_questions").first();
  const saved = await env.DB.prepare(
    "INSERT INTO speaking_questions (position, prompt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
  ).bind((max?.p ?? 0) + 1, prompt, status, now, now).first();
  return json({ ok: true, id: saved.id });
}

async function deleteSpeakingQuestion(request, env, user, url, id) {
  const now = nowSeconds();
  const gone = await env.DB.prepare("DELETE FROM speaking_questions WHERE id = ? RETURNING position").bind(Number(id)).first();
  if (!gone) throw new HttpError(404, "Pertanyaan speaking tidak ditemukan.");
  // The attempts keep the questions they were built with, so deleting a bank question never
  // touches a result that already went out. The rest of the bank closes the gap.
  await env.DB.prepare("UPDATE speaking_questions SET position = position - 1, updated_at = ? WHERE position > ?")
    .bind(now, gone.position).run();
  return json({ ok: true });
}

async function moveSpeakingQuestion(request, env, user, url, id, direction) {
  const row = await env.DB.prepare("SELECT id, position FROM speaking_questions WHERE id = ?").bind(Number(id)).first();
  if (!row) throw new HttpError(404, "Pertanyaan speaking tidak ditemukan.");
  const other = await env.DB.prepare(
    `SELECT id, position FROM speaking_questions WHERE position ${direction === "up" ? "< ? ORDER BY position DESC" : "> ? ORDER BY position ASC"} LIMIT 1`,
  ).bind(row.position).first();
  if (!other) return json({ ok: true });
  const now = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("UPDATE speaking_questions SET position = ?, updated_at = ? WHERE id = ?").bind(other.position, now, row.id),
    env.DB.prepare("UPDATE speaking_questions SET position = ?, updated_at = ? WHERE id = ?").bind(row.position, now, other.id),
  ]);
  return json({ ok: true });
}

/** The certificate routes fan out: the two sends are their own handlers, revoke and restore
 *  keep the old action handler. */
async function certificateSendOrAction(request, env, user, url, id, action) {
  if (action === "send-email") return sendCertificateEmail(request, env, user, url, id);
  if (action === "send-whatsapp") return sendCertificateWhatsApp(request, env, user, url, id);
  return certificateAction(request, env, user, url, id, action);
}

async function getSpeakingRow(env, id) {
  const row = await env.DB.prepare("SELECT id, attempt_id, student_id, status, needs_review, scores, (audio IS NOT NULL) AS has_audio FROM speaking_submissions WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "Rekaman speaking tidak ditemukan.");
  return row;
}

/** Sends the result of an attempt if its email or WhatsApp is still waiting. Returns whether it did. */
async function sendIfWaiting(env, attemptId) {
  const a = await env.DB.prepare("SELECT email_status, wa_status FROM attempts WHERE id = ?").bind(attemptId).first();
  const waiting = Boolean(a && (a.email_status === "pending" || a.wa_status === "pending"));
  if (waiting) deliverInBackground(env, attemptId);
  return waiting;
}

/**
 * The recording, for the audio player on the submission page. Only with a dashboard session, never
 * cached, and with byte ranges so every browser can seek in it.
 */
async function speakingAudio(request, env, user, url, id) {
  const row = await env.DB.prepare("SELECT audio, audio_mime FROM speaking_submissions WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "Rekaman speaking tidak ditemukan.");
  if (!row.audio) throw new HttpError(410, "Rekaman sudah dihapus. Rekaman disimpan 30 hari setelah tes.");
  const audio = row.audio;
  const size = audio.length;
  const headers = {
    "Content-Type": row.audio_mime || "application/octet-stream",
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    return new Response(audio.subarray(start, end + 1), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}` } });
  }
  return new Response(audio, { status: 200, headers });
}

/**
 * A grade by hand for a recording Speechace could not score, or one it scored with a warning.
 * The result goes out once: a recording graded by hand cannot be graded again, and the delivery
 * only sends channels that are still waiting.
 */
async function gradeSpeaking(request, env, user, url, id) {
  const body = await readJson(request, 8 * 1024);
  const row = await getSpeakingRow(env, id);
  const open = row.status === "failed" || (row.status === "graded" && row.needs_review);
  if (!open) {
    throw new HttpError(409, row.status === "pending" || row.status === "grading"
      ? "Rekaman ini masih dinilai Speechace. Tunggu sampai selesai."
      : "Rekaman ini sudah selesai dinilai.");
  }
  const cefr = String(body.cefr || "").trim().toUpperCase();
  if (!MANUAL_CEFR.includes(cefr)) throw new HttpError(400, "Pilih CEFR keseluruhan.", { field: "cefr" });
  let ielts = null;
  if (body.ielts !== undefined && body.ielts !== null && String(body.ielts).trim() !== "") {
    const v = Number(String(body.ielts).replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || v > 9 || v * 2 !== Math.round(v * 2)) throw new HttpError(400, "IELTS harus angka 0 sampai 9 dengan kelipatan 0.5, misalnya 6.5.", { field: "ielts" });
    ielts = v;
  }
  const aspects = {};
  for (const { key, label } of ASPECTS) {
    const v = String(body.aspects?.[key] || "").trim().toUpperCase();
    if (!v) continue;
    if (!MANUAL_CEFR.includes(v)) throw new HttpError(400, `CEFR ${label} tidak dikenal.`, { field: key });
    aspects[key] = { cefr: v, ielts: null, score: null };
  }
  const note = multiline(body.note, 500);
  const previous = parseJson(row.scores).overall || null;
  const scores = { source: "manual", overall: { cefr, ielts, score: null }, aspects, note, previous, relevance: null, issues: [], notes: [] };
  const now = nowSeconds();
  const saved = await env.DB.prepare(
    `UPDATE speaking_submissions SET status = 'manual', needs_review = 0, cefr_overall = ?, ielts_overall = ?, scores = ?,
        graded_at = ?, graded_by = ?, next_attempt_at = NULL, lease_until = NULL
      WHERE id = ? AND (status = 'failed' OR (status = 'graded' AND needs_review = 1)) RETURNING attempt_id, student_id`,
  ).bind(cefr, ielts, JSON.stringify(scores), now, user.name, id).first();
  if (!saved) throw new HttpError(409, "Rekaman ini baru saja berubah. Muat ulang halaman lalu coba lagi.");
  if (saved.student_id) {
    await addActivity(env, saved.student_id, "test", `Menilai speaking secara manual: CEFR ${cefr}${ielts === null ? "" : `, IELTS ${ielts.toFixed(1)}`}.`, user.name, { attemptId: saved.attempt_id }, now).run();
  }
  return json({ ok: true, sending: await sendIfWaiting(env, saved.attempt_id) });
}

/** Coba lagi (score again), Tidak dinilai (send the result without speaking), and Sudah dicek (clear the flag). */
async function speakingAction(request, env, user, url, id, action) {
  const body = await readJson(request, 4 * 1024);
  const row = await getSpeakingRow(env, id);
  const now = nowSeconds();
  if (action === "retry") {
    if (row.status !== "failed") throw new HttpError(409, "Hanya rekaman yang gagal dinilai yang bisa dinilai ulang.");
    if (!row.has_audio) throw new HttpError(410, "Rekaman sudah dihapus, jadi tidak bisa dinilai ulang. Nilai manual saja.");
    if (!speechaceConfigured(env)) throw new HttpError(409, "Kunci Speechace belum diisi di server dasbor, jadi penilaian ulang belum bisa dijalankan dari sini.");
    const saved = await env.DB.prepare(
      `UPDATE speaking_submissions SET status = 'pending', error = NULL, tries = 0, next_attempt_at = NULL, lease_until = NULL, needs_review = 0
        WHERE id = ? AND status = 'failed' RETURNING id`,
    ).bind(id).first();
    if (!saved) throw new HttpError(409, "Rekaman ini baru saja berubah. Muat ulang halaman lalu coba lagi.");
    if (row.student_id) await addActivity(env, row.student_id, "test", "Mengulang penilaian speaking dengan Speechace.", user.name, { attemptId: row.attempt_id }, now).run();
    gradeInBackground(env, id);
    return json({ ok: true });
  }
  if (action === "skip") {
    if (row.status !== "failed") throw new HttpError(409, "Hanya rekaman yang gagal dinilai yang bisa dilewati.");
    const reason = text(body.reason, 300);
    const saved = await env.DB.prepare(
      `UPDATE speaking_submissions SET status = 'skipped', needs_review = 0, scores = ?, graded_at = ?, graded_by = ?, next_attempt_at = NULL, lease_until = NULL
        WHERE id = ? AND status = 'failed' RETURNING attempt_id`,
    ).bind(JSON.stringify({ source: "team", reason }), now, user.name, id).first();
    if (!saved) throw new HttpError(409, "Rekaman ini baru saja berubah. Muat ulang halaman lalu coba lagi.");
    if (row.student_id) await addActivity(env, row.student_id, "test", `Speaking tidak dinilai, jadi hasil dikirim tanpa nilai speaking.${reason ? ` Alasan: ${reason}` : ""}`, user.name, { attemptId: row.attempt_id }, now).run();
    return json({ ok: true, sending: await sendIfWaiting(env, saved.attempt_id) });
  }
  if (row.status !== "graded" || !row.needs_review) throw new HttpError(409, "Rekaman ini tidak sedang menunggu dicek.");
  await env.DB.prepare("UPDATE speaking_submissions SET needs_review = 0 WHERE id = ? AND status = 'graded'").bind(id).run();
  if (row.student_id) await addActivity(env, row.student_id, "test", "Menandai nilai speaking dari Speechace sudah dicek.", user.name, { attemptId: row.attempt_id }, now).run();
  return json({ ok: true });
}

function deviceLabel(ua) {
  const s = String(ua || "");
  const browser = /Edg\//.test(s) ? "Edge" : /SamsungBrowser/.test(s) ? "Samsung Internet" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "Browser";
  const os = /Android/.test(s) ? "Android" : /iPhone|iPad/.test(s) ? "iPhone" : /Windows/.test(s) ? "Windows" : /Mac OS X/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "perangkat lain";
  return `${browser} di ${os}`;
}

/* Re-run the AI writing score for a submitted attempt, for example after the key was fixed.
 * Submitted and not voided: the graded bands are final state, and a voided attempt's result
 * must not be rewritten (audit hardening from wave 2). */
async function regradeWriting(request, env, user, url, id) {
  const a = await getAttemptRow(env, id);
  if ((a.test_key || "placement") !== "ielts-mockup") throw new HttpError(400, "Penilaian writing hanya untuk IELTS Mockup.");
  if (a.status !== "submitted") throw new HttpError(409, "Penilaian writing hanya untuk percobaan yang sudah dikirim.");
  if (a.voided_at) throw new HttpError(409, "Hasil ini sudah dibatalkan, jadi penilaiannya tidak bisa diubah. Pulihkan dulu kalau masih dipakai.");
  const all = await loadQuestions(env, "ielts-mockup", { packageId: a.package_id || undefined });
  const byId = new Map(all.map((q) => [q.id, q]));
  const ids = a.question_ids ? JSON.parse(a.question_ids) : [];
  const essays = ids.map((qid) => byId.get(qid)).filter((q) => q && q.type === "longtext");
  if (!essays.length) throw new HttpError(400, "Percobaan ini tidak punya soal writing.");
  const { results: answers } = await env.DB.prepare("SELECT question_id, choice FROM answers WHERE attempt_id = ?").bind(id).all();
  const answerById = new Map(answers.map((x) => [x.question_id, x.choice]));
  const tasks = await Promise.all(essays.map((q) => gradeWritingTask(env, {
    taskNumber: q.part || 1,
    prompt: q.prompt,
    text: String(answerById.get(q.id) ?? "").slice(0, 20000),
    minWords: q.minWords || 150,
  })));
  const writing = { skill: "Writing", band: writingBand(tasks), tasks };
  const stored = a.bands ? JSON.parse(a.bands) : { skills: [] };
  const skills = [...(stored.skills || []).filter((s) => s.skill !== "Writing"), writing];
  const bands = { skills, overall: overallBand(skills.map((s) => s.band)) };
  await env.DB.prepare("UPDATE attempts SET bands = ?, writing_status = 'graded', writing_error = NULL WHERE id = ?").bind(JSON.stringify(bands), id).run();
  return json({ ok: true, bands });
}

/* Re-queue the failed speaking answers. The web app's worker scores them again. Submitted and
 * not voided: an in-progress attempt's queue is not re-armed from the dashboard, and a voided
 * attempt's rows stay cold (audit hardening from wave 2). */
async function retryMockupSpeaking(request, env, user, url, id) {
  const a = await getAttemptRow(env, id);
  if ((a.test_key || "placement") !== "ielts-mockup") throw new HttpError(400, "Penilaian speaking hanya untuk IELTS Mockup.");
  if (a.status !== "submitted") throw new HttpError(409, "Penilaian ulang speaking hanya untuk percobaan yang sudah dikirim.");
  if (a.voided_at) throw new HttpError(409, "Hasil ini sudah dibatalkan, jadi penilaiannya tidak bisa diulang. Pulihkan dulu kalau masih dipakai.");
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM speaking_answers WHERE attempt_id = ?").bind(id).first();
  if (!count?.n) throw new HttpError(400, "Percobaan ini tidak punya jawaban speaking.");
  await env.DB.prepare("UPDATE speaking_answers SET status = 'pending', tries = 0, next_attempt_at = 0, lease_until = 0, error = NULL WHERE attempt_id = ? AND status = 'failed'").bind(id).run();
  await env.DB.prepare("UPDATE attempts SET speaking_status = NULL, speaking_error = NULL WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function getSpeakingAnswerAudio(request, env, user, url, id) {
  const row = await env.DB.prepare("SELECT audio, audio_mime FROM speaking_answers WHERE id = ?").bind(Number(id)).first();
  if (!row || !row.audio) throw new HttpError(404, "Rekaman tidak ditemukan.");
  return new Response(row.audio, {
    status: 200,
    headers: { "Content-Type": row.audio_mime || "audio/webm", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function attemptAction(request, env, user, url, id, action) {
  const a = await getAttemptRow(env, id);
  const now = nowSeconds();
  const name = TEST_NAMES[a.test_key] || "tes";
  if (action === "void") {
    const body = await readJson(request);
    const reason = text(body.reason, 300);
    const stmts = [env.DB.prepare("UPDATE attempts SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?").bind(now, user.name, reason || null, id)];
    if (a.student_id) stmts.push(addActivity(env, a.student_id, "void", `Membatalkan hasil ${name} ${fmtDate(a.started_at)}.${reason ? ` Alasan: ${reason}` : ""}`, user.name, null, now));
    await env.DB.batch(stmts);
    return json({ ok: true });
  }
  if (action === "restore") {
    const stmts = [env.DB.prepare("UPDATE attempts SET voided_at = NULL, voided_by = NULL, void_reason = NULL WHERE id = ?").bind(id)];
    if (a.student_id) stmts.push(addActivity(env, a.student_id, "system", `Memulihkan hasil ${name} ${fmtDate(a.started_at)}.`, user.name, null, now));
    await env.DB.batch(stmts);
    return json({ ok: true });
  }
  if (a.test_key !== "placement" || a.status !== "submitted" || !a.email) throw new HttpError(400, "Email hasil hanya bisa dikirim ulang untuk placement test yang sudah punya kontak.");
  // A voided result must never go out, and the manual send must not race the background
  // delivery: the lease claim is the single-writer guard, so refuse while either holds.
  if (a.voided_at) throw new HttpError(409, "Hasil ini sudah dibatalkan, jadi emailnya tidak bisa dikirim ulang. Pulihkan dulu kalau masih dipakai.");
  if (a.delivery_lease_until && a.delivery_lease_until > now) throw new HttpError(409, "Pengiriman otomatis untuk hasil ini sedang berjalan. Tunggu sampai selesai sebelum mengirim ulang.");
  if (a.email_status === "pending") throw new HttpError(409, "Email hasil ini masih menunggu pengiriman otomatis. Tunggu sampai selesai sebelum mengirim ulang.");
  if (!env.SEND_EMAIL) throw new HttpError(503, "Pengiriman email belum diatur di server ini.");
  const spRows = (await env.DB.prepare("SELECT status, cefr_overall, ielts_overall, scores, transcript FROM speaking_submissions WHERE attempt_id = ? ORDER BY position").bind(id).all()).results || [];
  const waitingRow = spRows.find((r) => !isFinalStatus(r.status));
  if (waitingRow) throw new HttpError(409, "Speaking belum selesai dinilai, jadi email hasil belum bisa dikirim. Email terkirim otomatis setelah penilaian selesai.");
  const levels = await loadLevels(env);
  const level = levels.find((l) => l.key === a.level_key) || levels[0];
  const { subject, html, text: plain } = buildResultEmail({ name: a.name, email: a.email, score: a.score, total: a.total, level: publicLevel(level), speaking: aggregateSpeakingFacts(spRows) });
  try {
    await env.SEND_EMAIL.send({ from: env.RESULT_FROM_EMAIL || "Titik Nol English Course <placement@index-now.dev>", to: a.email, subject, html, text: plain });
  } catch (error) {
    await env.DB.prepare("UPDATE attempts SET email_status = ? WHERE id = ?").bind(`failed: ${String(error).slice(0, 180)}`, id).run();
    throw new HttpError(502, "Email gagal dikirim. Periksa alamat email siswa lalu coba lagi.");
  }
  const stmts = [env.DB.prepare("UPDATE attempts SET email_sent_at = ?, email_status = 'sent' WHERE id = ? AND (delivery_lease_until IS NULL OR delivery_lease_until < ?)").bind(now, id, now)];
  if (a.student_id) stmts.push(addActivity(env, a.student_id, "email", `Email hasil dikirim ulang ke ${a.email}.`, user.name, null, now));
  await env.DB.batch(stmts);
  return json({ ok: true, email: a.email });
}

async function deleteAttempt(request, env, user, url, id) {
  await getAttemptRow(env, id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM answers WHERE attempt_id = ?").bind(id),
    env.DB.prepare("DELETE FROM attempts WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}

async function bulkDeleteAttempts(request, env) {
  const body = await readJson(request);
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 500) : [];
  if (!ids.length) throw new HttpError(400, "Pilih minimal satu submission.");
  await env.DB.batch(ids.flatMap((id) => [
    env.DB.prepare("DELETE FROM answers WHERE attempt_id = ?").bind(id),
    env.DB.prepare("DELETE FROM attempts WHERE id = ?").bind(id),
  ]));
  return json({ ok: true, count: ids.length });
}

/* ===================== WhatsApp channels per branch ===================== */

async function listWhatsAppChannels(request, env) {
  const { results } = await env.DB.prepare("SELECT branch, channel_id, updated_at, updated_by FROM whatsapp_channels ORDER BY branch").all();
  return json({ ok: true, channels: results.map((r) => ({ branch: r.branch, channelId: r.channel_id || "", updatedAt: r.updated_at ? ms(r.updated_at) : null, updatedBy: r.updated_by || "" })) });
}

async function saveWhatsAppChannel(request, env, user, url, branch) {
  if (!["pare", "jogja", "medan", "online"].includes(branch)) throw new HttpError(400, "Cabang tidak dikenal.");
  const body = await readJson(request);
  const channelId = text(body.channelId, 100).trim();
  // Pare is the default channel every other branch falls back to, so it cannot be emptied.
  if (branch === "pare" && !channelId && !env.ATTCOS_CHANNEL_ID) throw new HttpError(400, "Saluran Pare wajib terisi karena menjadi cadangan semua cabang.", { field: "channelId" });
  await env.DB.prepare("UPDATE whatsapp_channels SET channel_id = ?, updated_at = ?, updated_by = ? WHERE branch = ?")
    .bind(channelId, nowSeconds(), user.name, branch).run();
  resetChannelCache();
  return json({ ok: true });
}

async function testWhatsAppChannel(request, env, user, url, branch) {
  if (!["pare", "jogja", "medan", "online"].includes(branch)) throw new HttpError(400, "Cabang tidak dikenal.");
  const body = await readJson(request);
  const to = normalizeWhatsapp(String(body?.to || ""));
  if (!to) throw new HttpError(400, "Isi nomor WhatsApp tujuan pesan uji, misalnya nomor kamu sendiri.", { field: "to" });
  const result = await sendWhatsApp(env, { to, text: `Pesan uji saluran WhatsApp ${branch} dari dasbor Titik Nol. Kalau pesan ini tiba, salurannya siap dipakai.`, branch });
  if (!result.ok) throw new HttpError(result.status === "skipped" ? 503 : 502, result.error);
  return json({ ok: true });
}

/* ===================== Staff accounts ===================== */

function requireAdmin(user) {
  if (user.role !== "admin") throw new HttpError(403, "Hanya Administrator yang boleh mengelola akun staf.");
}

async function listStaff(request, env, user) {
  requireAdmin(user);
  const { results } = await env.DB.prepare("SELECT id, name, email, role, active, last_login_at, created_at FROM admin_users ORDER BY created_at").all();
  return json({ ok: true, staff: results.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, active: Boolean(r.active), lastLoginAt: r.last_login_at ? ms(r.last_login_at) : null })) });
}

async function createStaff(request, env, user) {
  requireAdmin(user);
  const body = await readJson(request);
  const name = text(body.name, 80).trim();
  const email = text(body.email, 160).toLowerCase();
  const role = ["staf", "tutor", "admin"].includes(body.role) ? body.role : "staf";
  const password = String(body.password || "");
  if (name.length < 2) throw new HttpError(400, "Nama minimal 2 karakter.", { field: "name" });
  if (!isEmail(email)) throw new HttpError(400, "Format email belum benar.", { field: "email" });
  if (password.length < 8) throw new HttpError(400, "Kata sandi minimal 8 karakter.", { field: "password" });
  const taken = await env.DB.prepare("SELECT 1 FROM admin_users WHERE email = ?").bind(email).first();
  if (taken) throw new HttpError(400, "Email ini sudah dipakai akun lain.", { field: "email" });
  const { hash, salt, iterations } = await hashPassword(password);
  const id = newId("adm");
  await env.DB.prepare(`INSERT INTO admin_users (id, email, name, role, password_hash, password_salt, password_iter, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?::integer, ?)`)
    .bind(id, email, name, role, hash, salt, iterations, nowSeconds()).run();
  return json({ ok: true, id });
}

async function updateStaff(request, env, user, url, id, action) {
  requireAdmin(user);
  const row = await env.DB.prepare("SELECT id, email, role FROM admin_users WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "Akun tidak ditemukan.");
  if (row.id === user.id && action !== "password") throw new HttpError(400, "Kamu tidak bisa mengubah status atau peran akunmu sendiri. Minta Administrator lain.");
  const body = await readJson(request);
  const now = nowSeconds();
  if (action === "active") {
    const active = body.active ? 1 : 0;
    // The last active owner account cannot be deactivated, or nobody could manage staff again.
    if (!active && row.role === "admin") {
      const others = await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_users WHERE role = 'admin' AND active = 1 AND id != ?").bind(id).first();
      if (!others?.n) throw new HttpError(400, "Ini satu-satunya akun Administrator aktif, jadi tidak bisa dinonaktifkan.");
    }
    await env.DB.prepare("UPDATE admin_users SET active = ? WHERE id = ?").bind(active, id).run();
    return json({ ok: true });
  }
  if (action === "password") {
    const password = String(body.password || "");
    if (password.length < 8) throw new HttpError(400, "Kata sandi minimal 8 karakter.", { field: "password" });
    const { hash, salt, iterations } = await hashPassword(password);
    await env.DB.prepare("UPDATE admin_users SET password_hash = ?, password_salt = ?, password_iter = ?, failed_logins = 0, locked_until = NULL WHERE id = ?")
      .bind(hash, salt, iterations, id).run();
    return json({ ok: true });
  }
  // action === "role"
  const role = ["staf", "tutor", "admin"].includes(body.role) ? body.role : null;
  if (!role) throw new HttpError(400, "Peran tidak dikenal.");
  if (row.role === "admin" && role !== "admin") {
    const others = await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_users WHERE role = 'admin' AND active = 1 AND id != ?").bind(id).first();
    if (!others?.n) throw new HttpError(400, "Ini satu-satunya akun Administrator, jadi perannya tidak bisa diturunkan.");
  }
  await env.DB.prepare("UPDATE admin_users SET role = ? WHERE id = ?").bind(role, id).run();
  return json({ ok: true });
}

/* ===================== Catalog ===================== */
async function saveProgram(request, env, user, url, id) {
  const body = await readJson(request);
  const name = text(body.name, 80);
  if (!name) throw new HttpError(400, "Nama program wajib diisi.");
  const dup = await env.DB.prepare("SELECT id FROM programs WHERE lower(name) = lower(?) AND id != ?").bind(name, id || "").first();
  if (dup) throw new HttpError(409, "Nama program ini sudah ada.");
  const mode = MODES.includes(body.mode) ? body.mode : MODES[0];
  const status = body.status === "nonaktif" ? "nonaktif" : "aktif";
  const list = Array.isArray(body.durations) ? body.durations.slice(0, 20) : [];
  if (!list.length) throw new HttpError(400, "Tambahkan minimal satu durasi.");
  const durations = list.map((d) => {
    const label = text(d.label, 60);
    const days = int(d.days, { min: 1, max: 365 });
    const price = d.price === "" || d.price === null || d.price === undefined ? null : int(d.price, { min: 0, max: 1000000000 });
    if (!label) throw new HttpError(400, "Setiap durasi perlu nama, misalnya 2 minggu atau 1 bulan.");
    if (days === null) throw new HttpError(400, `Jumlah hari untuk ${label} harus antara 1 dan 365.`);
    if (d.price !== "" && d.price !== null && d.price !== undefined && price === null) throw new HttpError(400, `Harga ${label} harus angka bulat dan tidak boleh negatif.`);
    return { id: d.id ? String(d.id) : null, label, days, price };
  });
  if (new Set(durations.map((d) => d.label.toLowerCase())).size < durations.length) throw new HttpError(400, "Ada nama durasi yang sama. Setiap durasi harus berbeda.");
  const tutorNames = Array.isArray(body.tutors) ? body.tutors.map(String) : [];
  const tutorRows = tutorNames.length ? (await env.DB.prepare(`SELECT id, name FROM tutors WHERE name IN (${tutorNames.map(() => "?").join(",")})`).bind(...tutorNames).all()).results : [];
  const now = nowSeconds();
  const pid = id || newId("prg");
  const stmts = [];
  if (id) {
    const existing = await env.DB.prepare("SELECT id FROM programs WHERE id = ?").bind(id).first();
    if (!existing) throw new HttpError(404, "Program tidak ditemukan.");
    const old = (await env.DB.prepare("SELECT id, label FROM program_durations WHERE program_id = ?").bind(id).all()).results;
    const kept = new Set(durations.map((d) => d.id).filter(Boolean));
    for (const d of old.filter((x) => !kept.has(x.id))) {
      const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM students WHERE duration_id = ?").bind(d.id).first();
      if (used.n) throw new HttpError(409, `Durasi ${d.label} masih dipakai ${used.n} siswa, jadi belum bisa dihapus.`);
      stmts.push(env.DB.prepare("DELETE FROM program_durations WHERE id = ?").bind(d.id));
    }
    stmts.push(env.DB.prepare("UPDATE programs SET name = ?, mode = ?, status = ?, updated_at = ? WHERE id = ?").bind(name, mode, status, now, id));
  } else {
    stmts.push(env.DB.prepare("INSERT INTO programs (id, name, mode, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(pid, name, mode, status, now, now));
  }
  durations.forEach((d, i) => {
    if (d.id) stmts.push(env.DB.prepare("UPDATE program_durations SET label = ?, days = ?, price = ?, position = ? WHERE id = ? AND program_id = ?").bind(d.label, d.days, d.price, i + 1, d.id, pid));
    else stmts.push(env.DB.prepare("INSERT INTO program_durations (id, program_id, position, label, days, price) VALUES (?, ?, ?, ?, ?, ?)").bind(newId("dur"), pid, i + 1, d.label, d.days, d.price));
  });
  stmts.push(env.DB.prepare("DELETE FROM program_tutors WHERE program_id = ?").bind(pid));
  for (const t of tutorRows) stmts.push(env.DB.prepare("INSERT INTO program_tutors (program_id, tutor_id) VALUES (?, ?)").bind(pid, t.id));
  await env.DB.batch(stmts);
  return json({ ok: true, id: pid });
}

async function deleteProgram(request, env, user, url, id) {
  const used = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM students WHERE program_id = ?) + (SELECT COUNT(*) FROM classes WHERE program_id = ?) AS n").bind(id, id).first();
  if (used.n) throw new HttpError(409, "Program ini masih dipakai siswa atau kelas, jadi belum bisa dihapus.");
  await env.DB.prepare("DELETE FROM programs WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function savePeriod(request, env, user, url, id) {
  const body = await readJson(request);
  const startDate = String(body.startDate || "");
  if (!isDate(startDate)) throw new HttpError(400, "Pilih tanggal mulai.");
  const dup = await env.DB.prepare("SELECT id FROM periods WHERE start_date = ? AND id != ?").bind(startDate, id || "").first();
  if (dup) throw new HttpError(409, "Periode dengan tanggal ini sudah ada.");
  const note = text(body.note, 160) || null;
  if (id) await env.DB.prepare("UPDATE periods SET start_date = ?, note = ? WHERE id = ?").bind(startDate, note, id).run();
  else await env.DB.prepare("INSERT INTO periods (id, start_date, note, created_at) VALUES (?, ?, ?, ?)").bind(newId("per"), startDate, note, nowSeconds()).run();
  return json({ ok: true });
}

async function deletePeriod(request, env, user, url, id) {
  const used = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM students WHERE period_id = ?) + (SELECT COUNT(*) FROM classes WHERE period_id = ?) AS n").bind(id, id).first();
  if (used.n) throw new HttpError(409, "Periode ini masih dipakai siswa atau kelas, jadi belum bisa dihapus.");
  await env.DB.prepare("DELETE FROM periods WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function saveClass(request, env, user, url, id) {
  const body = await readJson(request);
  const code = text(body.code, 8).toUpperCase().replace(/\s+/g, "");
  const capacity = int(body.capacity, { min: 1, max: 100 });
  if (!code) throw new HttpError(400, "Kode kelas wajib diisi.");
  if (capacity === null) throw new HttpError(400, "Kapasitas harus antara 1 dan 100 siswa.");
  const program = await env.DB.prepare("SELECT id, name FROM programs WHERE id = ?").bind(String(body.programId || "")).first();
  const period = await env.DB.prepare("SELECT id FROM periods WHERE id = ?").bind(String(body.periodId || "")).first();
  const tutor = await env.DB.prepare("SELECT id, name FROM tutors WHERE id = ?").bind(String(body.tutorId || "")).first();
  if (!program || !period || !tutor) throw new HttpError(400, "Pilih program, periode, dan tutor.");
  const teaches = await env.DB.prepare("SELECT 1 FROM program_tutors WHERE program_id = ? AND tutor_id = ?").bind(program.id, tutor.id).first();
  if (!teaches) throw new HttpError(400, `${tutor.name} belum tercatat sebagai tutor ${program.name}. Centang namanya di formulir program dulu.`, { field: "tutor" });
  const dup = await env.DB.prepare("SELECT id FROM classes WHERE period_id = ? AND code = ? AND id != ?").bind(period.id, code, id || "").first();
  if (dup) throw new HttpError(409, `Kode ${code} sudah dipakai di periode ini.`, { field: "code" });
  if (id) {
    const c = await env.DB.prepare("SELECT * FROM classes WHERE id = ?").bind(id).first();
    if (!c) throw new HttpError(404, "Kelas tidak ditemukan.");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM students WHERE class_id = ?").bind(id).first();
    if (n.n && (c.program_id !== program.id || c.period_id !== period.id)) throw new HttpError(409, "Program dan periode kelas yang sudah berisi siswa tidak bisa diganti. Buat kelas baru lalu pindahkan siswanya.");
    await env.DB.prepare("UPDATE classes SET code = ?, program_id = ?, period_id = ?, tutor_id = ?, capacity = ? WHERE id = ?").bind(code, program.id, period.id, tutor.id, capacity, id).run();
  } else {
    await env.DB.prepare("INSERT INTO classes (id, code, program_id, period_id, tutor_id, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(newId("cls"), code, program.id, period.id, tutor.id, capacity, nowSeconds()).run();
  }
  return json({ ok: true, label: `${tutor.name} / ${code}` });
}

async function deleteClass(request, env, user, url, id) {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM students WHERE class_id = ?").bind(id).first();
  if (n.n) throw new HttpError(409, "Kelas ini masih berisi siswa, jadi belum bisa dihapus.");
  await env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function createTutor(request, env) {
  const body = await readJson(request);
  const name = text(body.name, 60);
  if (!name) throw new HttpError(400, "Nama tutor wajib diisi.");
  const dup = await env.DB.prepare("SELECT id FROM tutors WHERE lower(name) = lower(?)").bind(name).first();
  if (dup) throw new HttpError(409, "Tutor dengan nama ini sudah ada.");
  await env.DB.prepare("INSERT INTO tutors (id, name, created_at) VALUES (?, ?, ?)").bind(newId("tut"), name, nowSeconds()).run();
  return json({ ok: true });
}

async function deleteTutor(request, env, user, url, id) {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM classes WHERE tutor_id = ?").bind(id).first();
  if (n.n) throw new HttpError(409, "Tutor ini masih mengajar kelas, jadi belum bisa dihapus.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM program_tutors WHERE tutor_id = ?").bind(id),
    env.DB.prepare("DELETE FROM tutors WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}

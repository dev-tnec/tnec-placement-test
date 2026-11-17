// Admin dashboard: protected pages under /admin and the JSON API under /api/admin.
// Sessions are random tokens in an HttpOnly cookie; only their SHA-256 hash is stored in the database.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError, json, readJson, nowSeconds, normalizeWhatsapp, isEmail, text, multiline, int } from "@tnec/core/http";
import { randomToken, sha256Hex, verifyPassword, hashPassword } from "@tnec/core/crypto";
import { TEST_KEYS, TEST_NAMES, mapTest, mapQuestion, loadQuestions, loadLevels, publicLevel, attemptStatus, focusStrikes, addActivity, newId } from "@tnec/core/store";
import {
  latestPendaftaran, daftarCount, normalizeBirthDate, normalizeOption,
  JENJANG_PENDIDIKAN, TAHU_DARI, PENDAFTARAN_STATUS,
} from "@tnec/core/pendaftaran";
import { sendWhatsApp, whatsappConfigured } from "@tnec/core/whatsapp";
import { buildResultEmail } from "@tnec/core/email";
import { staticResponse, textResponse } from "@tnec/core/node-server";
import { deliverInBackground } from "@tnec/core/delivery";
import { gradeInBackground, speechaceConfigured } from "@tnec/core/speaking";
import { ASPECTS, MANUAL_CEFR, isFinalStatus, speakingFacts } from "@tnec/core/speaking-result";
import {
  CERT_DIR, certificateData, certificatePage, saveCertificateType, deleteCertificateType,
  issueCertificate, updateCertificate, certificateAction,
} from "./certificates.js";

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../public");

const SESSION_COOKIE = "tnec_admin";
const SESSION_TTL = 60 * 60 * 12;
const LOCK_AFTER = 5;
const LOCK_SECONDS = 15 * 60;
const INVITE_TTL = 14 * 24 * 60 * 60;
const STAGES = { baru: "Baru", dihubungi: "Dihubungi", konsultasi: "Konsultasi", terdaftar: "Terdaftar", lepas: "Tidak lanjut" };
const SOURCES = ["Placement test", "WhatsApp", "Instagram", "Datang langsung", "Rekomendasi alumni"];
const MODES = ["Offline di Pare", "Online", "Online dan offline"];
const SKILLS = ["Grammar", "Vocabulary", "Reading", "Listening"];
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
  if (path.startsWith("/admin/assets/") || path.startsWith("/assets/") || path === "/favicon.svg") {
    const file = await staticResponse(PUBLIC_DIR, path, { cacheControl: path === "/favicon.svg" ? "public, max-age=86400" : "private, max-age=300" });
    return withHeaders(file || textResponse(404, "File tidak ditemukan."), null);
  }
  // The stylesheets and drawings of the certificate templates. The HTML templates are never served raw.
  const certAsset = path.match(/^\/admin\/certificates\/([\w.-]+\.(?:css|svg))$/);
  if (certAsset) {
    const file = await staticResponse(CERT_DIR, `/${certAsset[1]}`, { cacheControl: "private, max-age=300" });
    return withHeaders(file || textResponse(404, "File tidak ditemukan."), null);
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
    return withHeaders(await staticResponse(PUBLIC_DIR, "/admin/login.html"));
  }
  if (path === "/admin/" || path === "/admin/index.html") {
    if (!user) return Response.redirect(new URL("/admin/login", url), 302);
    return withHeaders(await staticResponse(PUBLIC_DIR, "/admin/index.html"));
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
  if (!user || !user.active) throw new HttpError(401, "Email atau kata sandi salah.");
  if (user.locked_until && user.locked_until > now) {
    throw new HttpError(429, `Akun ini terkunci sementara karena terlalu banyak percobaan masuk. Coba lagi dalam ${Math.ceil((user.locked_until - now) / 60)} menit.`);
  }
  if (!(await verifyPassword(password, user))) {
    const failed = user.failed_logins + 1;
    await env.DB.prepare("UPDATE admin_users SET failed_logins = ?, locked_until = ? WHERE id = ?")
      .bind(failed >= LOCK_AFTER ? 0 : failed, failed >= LOCK_AFTER ? now + LOCK_SECONDS : null, user.id).run();
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
  const [created] = await env.DB.batch([
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
  ["POST", /^\/api\/admin\/pendaftaran$/, createPendaftaran],
  ["PUT", /^\/api\/admin\/pendaftaran\/([\w-]+)$/, updatePendaftaran],
  ["PUT", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)$/, updateTestSettings],
  ["POST", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/questions$/, createQuestion],
  ["PUT", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/questions\/(\d+)$/, updateQuestion],
  ["DELETE", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/questions\/(\d+)$/, deleteQuestion],
  ["POST", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/questions\/(\d+)\/(up|down|duplicate|toggle)$/, questionAction],
  ["POST", /^\/api\/admin\/tests\/(placement|pre|post|ielts-mockup)\/apply-seconds$/, applySeconds],
  ["PUT", /^\/api\/admin\/levels$/, updateLevels],
  ["GET", /^\/api\/admin\/attempts\/([0-9a-f-]{36})$/, getAttemptDetail],
  ["POST", /^\/api\/admin\/attempts\/([0-9a-f-]{36})\/(void|restore|resend-email)$/, attemptAction],
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
  ["POST", /^\/api\/admin\/certificates$/, issueCertificate],
  ["PUT", /^\/api\/admin\/certificates\/([\w-]+)$/, updateCertificate],
  ["POST", /^\/api\/admin\/certificates\/([\w-]+)\/(revoke|restore)$/, certificateAction],
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
  const statSql = `SELECT a.test_key, an.question_id, COUNT(*) AS n, SUM(an.is_correct) AS correct
    FROM answers an JOIN attempts a ON a.id = an.attempt_id
    WHERE a.status = 'submitted' AND a.voided_at IS NULL AND a.started_at >= ? GROUP BY a.test_key, an.question_id`;
  const [res, certificates] = await Promise.all([db.batch([
    stmt("SELECT * FROM tests"),
    stmt("SELECT * FROM questions ORDER BY test_key, position, id"),
    stmt("SELECT * FROM levels ORDER BY position"),
    stmt("SELECT * FROM students ORDER BY created_at DESC"),
    stmt(`SELECT id, test_key, student_id, started_at, expires_at, submitted_at, status, score, total, level_key, name,
                 violation_log, duration_seconds, limit_seconds, max_violations, email_status, pass_score, passed,
                 voided_at, voided_by, void_reason, user_agent, country, bands, audio_played_at FROM attempts ORDER BY started_at DESC LIMIT 5000`),
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
    stmt("SELECT * FROM pendaftaran ORDER BY registered_at, id"),
  ]), certificateData(env)]);
  const [tests, questions, levels, students, attempts, lastActs, enrolled, programs, durations, programTutors, tutors, periods, classes, s7, s30, speaking, pendaftaran] = res.map((r) => r.results);
  const speakingByAttempt = new Map(speaking.map((s) => [s.attempt_id, s]));
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
      stats: stats[key] || { d7: {}, d30: {} },
    }])),
    levels: levels.map((l) => ({ key: l.key, label: l.label, min: l.min_score, max: l.max_score, program: l.program })),
    students: students.map((s) => ({
      id: s.id, name: s.name, email: s.email || "", wa: s.whatsapp || "", city: s.city || "", source: s.source, stage: s.stage,
      programId: s.program_id, durationId: s.duration_id, periodId: s.period_id, classId: s.class_id,
      tempatLahir: s.tempat_lahir || "", tanggalLahir: s.tanggal_lahir || "", provinsi: s.provinsi || "",
      kodePos: s.kode_pos || "", jenjang: s.jenjang_pendidikan || "", tahuDari: s.tahu_dari || "",
      daftarCount: daftarCount(rowsByStudent.get(s.id)),
      pendaftaranStatus: latestPendaftaran(rowsByStudent.get(s.id))?.status || null,
      createdAt: ms(s.created_at), lastActivityAt: ms(Math.max(s.updated_at || 0, last.get(s.id) || 0, s.created_at)),
    })),
    pendaftaran: pendaftaranRows,
    attempts: attempts.map((a) => mapAttempt(a, now, speakingByAttempt.get(a.id))),
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
  ielts: s.ielts_overall ?? null, gradedAt: ms(s.graded_at), createdAt: ms(s.created_at),
} : null);

function mapAttempt(a, now, speaking = null) {
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
    bands: a.bands ? JSON.parse(a.bands) : null, audioPlayedAt: ms(a.audio_played_at),
    speaking: speakingBrief(speaking),
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
  await env.DB.batch(stmts);
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
  await env.DB.batch(stmts);
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
  await env.DB.batch(stmts);
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
  const result = await sendWhatsApp(env, { to: s.whatsapp, text: message });
  await logWhatsApp(env, user, s, message, result, body.label ? text(body.label, 80) : "Mengirim pesan");
  if (!result.ok) throw new HttpError(result.status === "skipped" ? 503 : 502, result.error);
  return json({ ok: true, messageId: result.messageId });
}

/* The IELTS mockup invite carries a 6 character code that the student types in; the other tests
   keep plain links. Unambiguous letters only, so reading it over WhatsApp is easy. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

async function createInvite(request, env, user, url, id) {
  const s = await getStudentRow(env, id);
  const body = await readJson(request);
  const test = TEST_KEYS.includes(body.test) ? body.test : null;
  if (!test) throw new HttpError(400, "Jenis tes tidak dikenal.");
  if (test === "placement") return json({ ok: true, link: `${env.PUBLIC_WEB_URL}/`, expiresAt: null });
  const token = randomToken(24);
  const now = nowSeconds();
  let code = null;
  if (test === "ielts-mockup") {
    for (let i = 0; i < 5 && !code; i += 1) {
      const candidate = randomCode();
      const taken = await env.DB.prepare("SELECT 1 FROM invites WHERE code = ?").bind(candidate).first();
      if (!taken) code = candidate;
    }
    if (!code) throw new HttpError(500, "Kode undangan tidak bisa dibuat, coba lagi.");
  }
  await env.DB.prepare("INSERT INTO invites (id, token_hash, student_id, test_key, code, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(newId("inv"), await sha256Hex(token), s.id, test, code, now, now + INVITE_TTL, user.name).run();
  return json({ ok: true, link: `${env.PUBLIC_WEB_URL}/?undangan=${token}`, code, expiresAt: ms(now + INVITE_TTL) });
}

/* ===================== Tests and questions ===================== */
async function updateTestSettings(request, env, user, url, key) {
  const body = await readJson(request);
  const row = await env.DB.prepare("SELECT * FROM tests WHERE key = ?").bind(key).first();
  const next = { ...row };
  if (body.timeMode !== undefined) { if (!["total", "per"].includes(body.timeMode)) throw new HttpError(400, "Mode waktu tidak dikenal."); next.time_mode = body.timeMode; }
  if (body.totalSeconds !== undefined) { const v = int(body.totalSeconds, { min: 60, max: 7200 }); if (v === null) throw new HttpError(400, "Durasi tes harus antara 1 dan 120 menit."); next.total_seconds = v; }
  if (body.perDefault !== undefined) { const v = int(body.perDefault, { min: 5, max: 180 }); if (v === null) throw new HttpError(400, "Waktu bawaan per soal harus antara 5 dan 180 detik."); next.per_default = v; }
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
  await env.DB.prepare(`UPDATE tests SET time_mode = ?, total_seconds = ?, per_default = ?, is_open = ?, max_violations = ?, pass_score = ?,
      speaking_enabled = ?, speaking_seconds = ?, speaking_min_seconds = ?, speaking_prompt = ?, speaking_dialect = ?, auto_submit = ?, audio_url = ?, updated_at = ?, updated_by = ? WHERE key = ?`)
    .bind(next.time_mode, next.total_seconds, next.per_default, next.is_open, next.max_violations, next.pass_score,
      next.speaking_enabled, next.speaking_seconds, next.speaking_min_seconds, next.speaking_prompt, next.speaking_dialect,
      next.auto_submit ?? 0, next.audio_url ?? null, nowSeconds(), user.name, key).run();
  return json({ ok: true });
}

/* The Speaking part of Placement Test, Pengaturan. The PRD keeps it to the placement test for now. */
function readSpeakingSettings(body, key, next) {
  const keys = ["speakingEnabled", "speakingSeconds", "speakingMinSeconds", "speakingPrompt", "speakingDialect"];
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
  if (body.speakingEnabled !== undefined) next.speaking_enabled = body.speakingEnabled ? 1 : 0;
  if (next.speaking_min_seconds >= next.speaking_seconds) throw new HttpError(400, "Durasi minimal harus lebih pendek dari durasi maksimal.", { field: "speakingMinSeconds" });
  if (next.speaking_enabled && !next.speaking_prompt) throw new HttpError(400, "Tulis pertanyaannya dulu sebelum menyalakan bagian speaking.", { field: "speakingPrompt" });
}

function readQuestionInput(body) {
  const prompt = multiline(body.prompt, 1000);
  const passage = multiline(body.passage, 4000);
  if (!prompt) throw new HttpError(400, "Teks soal wajib diisi.");
  const part = body.part === undefined || body.part === null || body.part === "" ? null : int(body.part, { min: 1, max: 9 });
  if (body.part !== undefined && body.part !== null && body.part !== "" && part === null) throw new HttpError(400, "Nomor bagian harus angka 1 sampai 9.");
  const seconds = body.seconds === undefined ? null : int(body.seconds, { min: 5, max: 180 });
  if (body.seconds !== undefined && seconds === null) throw new HttpError(400, "Waktu soal harus antara 5 dan 180 detik.");
  const base = { prompt, passage: passage || null, part, skill: SKILLS.includes(body.skill) ? body.skill : "Grammar", status: body.status === "draf" ? "draf" : "aktif", seconds };

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

async function createQuestion(request, env, user, url, key) {
  const q = readQuestionInput(await readJson(request));
  const test = await env.DB.prepare("SELECT per_default FROM tests WHERE key = ?").bind(key).first();
  const max = await env.DB.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM questions WHERE test_key = ?").bind(key).first();
  const now = nowSeconds();
  const r = await env.DB.prepare(`INSERT INTO questions (test_key, position, skill, part, prompt, passage, option_a, option_b, option_c, option_d, option_e, option_f, answer, seconds, status, type, accepted, created_at, updated_at)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(key, max.p + 1, q.skill, q.part, q.prompt, q.passage,
      q.options.A ?? null, q.options.B ?? null, q.options.C ?? null, q.options.D ?? null, q.options.E ?? null, q.options.F ?? null,
      q.answer, q.seconds ?? test.per_default, q.status, q.type, q.accepted ? JSON.stringify(q.accepted) : null, now, now).first();
  return json({ ok: true, id: r ? r.id : null });
}

async function getQuestionRow(env, key, id) {
  const q = await env.DB.prepare("SELECT * FROM questions WHERE id = ? AND test_key = ?").bind(id, key).first();
  if (!q) throw new HttpError(404, "Soal tidak ditemukan.");
  return q;
}

async function updateQuestion(request, env, user, url, key, id) {
  const row = await getQuestionRow(env, key, Number(id));
  const q = readQuestionInput(await readJson(request));
  await env.DB.prepare(`UPDATE questions SET skill = ?, part = ?, prompt = ?, passage = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, option_e = ?, option_f = ?,
                         answer = ?, seconds = ?, status = ?, type = ?, accepted = ?, updated_at = ? WHERE id = ?`)
    .bind(q.skill, q.part, q.prompt, q.passage,
      q.options.A ?? null, q.options.B ?? null, q.options.C ?? null, q.options.D ?? null, q.options.E ?? null, q.options.F ?? null,
      q.answer, q.seconds ?? row.seconds, q.status, q.type, q.accepted ? JSON.stringify(q.accepted) : null, nowSeconds(), row.id).run();
  return json({ ok: true, keyChanged: row.answer !== q.answer });
}

async function renumber(env, key) {
  const { results } = await env.DB.prepare("SELECT id FROM questions WHERE test_key = ? ORDER BY position, id").bind(key).all();
  if (results.length) await env.DB.batch(results.map((r, i) => env.DB.prepare("UPDATE questions SET position = ? WHERE id = ?").bind(i + 1, r.id)));
}

async function deleteQuestion(request, env, user, url, key, id) {
  const row = await getQuestionRow(env, key, Number(id));
  await env.DB.prepare("DELETE FROM questions WHERE id = ?").bind(row.id).run();
  await renumber(env, key);
  return json({ ok: true });
}

async function questionAction(request, env, user, url, key, id, action) {
  const row = await getQuestionRow(env, key, Number(id));
  const now = nowSeconds();
  await renumber(env, key);
  const fresh = await getQuestionRow(env, key, row.id);
  if (action === "toggle") {
    await env.DB.prepare("UPDATE questions SET status = ?, updated_at = ? WHERE id = ?").bind(fresh.status === "aktif" ? "draf" : "aktif", now, fresh.id).run();
  } else if (action === "duplicate") {
    await env.DB.batch([
      env.DB.prepare("UPDATE questions SET position = position + 1 WHERE test_key = ? AND position > ?").bind(key, fresh.position),
      env.DB.prepare(`INSERT INTO questions (test_key, position, skill, part, prompt, passage, option_a, option_b, option_c, option_d, option_e, option_f, answer, seconds, status, type, accepted, created_at, updated_at)
                      SELECT test_key, position + 1, skill, part, prompt, passage, option_a, option_b, option_c, option_d, option_e, option_f, answer, seconds, 'draf', type, accepted, ?::bigint, ?::bigint FROM questions WHERE id = ?`).bind(now, now, fresh.id),
    ]);
  } else {
    const other = await env.DB.prepare(`SELECT id, position FROM questions WHERE test_key = ? AND position ${action === "up" ? "< ? ORDER BY position DESC" : "> ? ORDER BY position ASC"} LIMIT 1`)
      .bind(key, fresh.position).first();
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
  const sp = await env.DB.prepare(
    `SELECT id, status, needs_review, prompt, transcript, cefr_overall, ielts_overall, scores, error, tries, next_attempt_at,
            provider_request_id, graded_at, graded_by, created_at, duration_seconds, audio_bytes, audio_mime, (audio IS NOT NULL) AS has_audio
       FROM speaking_submissions WHERE attempt_id = ?`,
  ).bind(id).first();
  const speaking = sp ? speakingDetail(sp) : null;
  if (speaking) {
    const studentSkip = sp.status === "skipped" && speaking.scores.source === "student";
    log.push({ at: ms(sp.created_at), type: studentSkip ? "speaking_student_skip" : "speaking_uploaded" });
    if (sp.graded_at && !studentSkip) log.push({ at: ms(sp.graded_at), type: `speaking_${sp.status}`, by: sp.graded_by || "" });
  }
  log.sort((x, y) => x.at - y.at);
  return json({ id: a.id, answers, log, device: deviceLabel(a.user_agent), country: a.country || "", consent: a.consent_version, speaking });
}

function speakingDetail(sp) {
  return {
    ...speakingBrief(sp),
    prompt: sp.prompt, transcript: sp.transcript || "", scores: parseJson(sp.scores), error: sp.error || "",
    tries: sp.tries, nextAttemptAt: ms(sp.next_attempt_at), requestId: sp.provider_request_id || "", gradedBy: sp.graded_by || "",
    durationSeconds: sp.duration_seconds, audioBytes: sp.audio_bytes, audioMime: sp.audio_mime || "", hasAudio: Boolean(sp.has_audio),
  };
}

/* ===================== Speaking ===================== */
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
  if (!env.SEND_EMAIL) throw new HttpError(503, "Pengiriman email belum diatur di server ini.");
  const sp = await env.DB.prepare("SELECT status, cefr_overall, ielts_overall, scores, transcript FROM speaking_submissions WHERE attempt_id = ?").bind(id).first();
  if (sp && !isFinalStatus(sp.status)) throw new HttpError(409, "Speaking belum selesai dinilai, jadi email hasil belum bisa dikirim. Email terkirim otomatis setelah penilaian selesai.");
  const levels = await loadLevels(env);
  const level = levels.find((l) => l.key === a.level_key) || levels[0];
  const { subject, html, text: plain } = buildResultEmail({ name: a.name, email: a.email, score: a.score, total: a.total, level: publicLevel(level), speaking: speakingFacts(sp) });
  try {
    await env.SEND_EMAIL.send({ from: env.RESULT_FROM_EMAIL || "Titik Nol English Course <placement@index-now.dev>", to: a.email, subject, html, text: plain });
  } catch (error) {
    await env.DB.prepare("UPDATE attempts SET email_status = ? WHERE id = ?").bind(`failed: ${String(error).slice(0, 180)}`, id).run();
    throw new HttpError(502, "Email gagal dikirim. Periksa alamat email siswa lalu coba lagi.");
  }
  const stmts = [env.DB.prepare("UPDATE attempts SET email_sent_at = ?, email_status = 'sent' WHERE id = ?").bind(now, id)];
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

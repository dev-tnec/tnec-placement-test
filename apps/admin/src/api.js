// Admin dashboard: protected pages under /admin and the JSON API under /api/admin.
// Sessions are random tokens in an HttpOnly cookie; only their SHA-256 hash is stored in the database.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError, json, readJson, nowSeconds, normalizeWhatsapp, isEmail, text, multiline, int } from "@tnec/core/http";
import { randomToken, sha256Hex, verifyPassword, hashPassword } from "@tnec/core/crypto";
import { TEST_KEYS, TEST_NAMES, mapTest, mapQuestion, loadQuestions, loadLevels, publicLevel, attemptStatus, focusStrikes, addActivity, newId } from "@tnec/core/store";
import { sendWhatsApp, whatsappConfigured } from "@tnec/core/whatsapp";
import { buildResultEmail } from "@tnec/core/email";
import { staticResponse, textResponse } from "@tnec/core/node-server";
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
const SKILLS = ["Grammar", "Vocabulary", "Reading"];
const CHOICES = ["A", "B", "C", "D"];
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
  ["PUT", /^\/api\/admin\/tests\/(placement|pre|post)$/, updateTestSettings],
  ["POST", /^\/api\/admin\/tests\/(placement|pre|post)\/questions$/, createQuestion],
  ["PUT", /^\/api\/admin\/tests\/(placement|pre|post)\/questions\/(\d+)$/, updateQuestion],
  ["DELETE", /^\/api\/admin\/tests\/(placement|pre|post)\/questions\/(\d+)$/, deleteQuestion],
  ["POST", /^\/api\/admin\/tests\/(placement|pre|post)\/questions\/(\d+)\/(up|down|duplicate|toggle)$/, questionAction],
  ["POST", /^\/api\/admin\/tests\/(placement|pre|post)\/apply-seconds$/, applySeconds],
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
                 voided_at, voided_by, void_reason, user_agent, country FROM attempts ORDER BY started_at DESC LIMIT 5000`),
    stmt("SELECT student_id, MAX(at) AS last_at FROM activities GROUP BY student_id"),
    stmt("SELECT at FROM activities WHERE type = 'stage' AND meta LIKE '%\"to\":\"terdaftar\"%' AND at >= ?", now - 60 * 86400),
    stmt("SELECT * FROM programs ORDER BY name"),
    stmt("SELECT * FROM program_durations ORDER BY program_id, position"),
    stmt("SELECT pt.program_id, t.name FROM program_tutors pt JOIN tutors t ON t.id = pt.tutor_id"),
    stmt("SELECT * FROM tutors ORDER BY name"),
    stmt("SELECT * FROM periods ORDER BY start_date"),
    stmt("SELECT c.*, t.name AS tutor_name FROM classes c JOIN tutors t ON t.id = c.tutor_id ORDER BY c.code"),
    stmt(statSql, now - 7 * 86400),
    stmt(statSql, now - 30 * 86400),
  ]), certificateData(env)]);
  const [tests, questions, levels, students, attempts, lastActs, enrolled, programs, durations, programTutors, tutors, periods, classes, s7, s30] = res.map((r) => r.results);
  const last = new Map(lastActs.map((r) => [r.student_id, r.last_at]));
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
      createdAt: ms(s.created_at), lastActivityAt: ms(Math.max(s.updated_at || 0, last.get(s.id) || 0, s.created_at)),
    })),
    attempts: attempts.map((a) => mapAttempt(a, now)),
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

function mapAttempt(a, now) {
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
  const [acts, msgs] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM activities WHERE student_id = ? ORDER BY at DESC, id DESC LIMIT 300").bind(id),
    env.DB.prepare("SELECT id, text, status, error, created_at, created_by FROM wa_messages WHERE student_id = ? ORDER BY created_at DESC LIMIT 50").bind(id),
  ]);
  return json({
    id: s.id,
    activities: acts.results.map((a) => ({ id: a.id, at: ms(a.at), type: a.type, text: a.text, by: a.by_name })),
    messages: msgs.results.map((m) => ({ id: m.id, at: ms(m.created_at), text: m.text, status: m.status, error: m.error, by: m.created_by })),
  });
}

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
                                  period_id = ?, class_id = ?, updated_at = ? WHERE id = ?`)
    .bind(next.name, next.wa, next.email, next.city, next.source, next.stage, next.programId, next.durationId, next.periodId, next.classId, now, id)];
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

function deleteStudentStatements(env, id) {
  return [
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

async function createInvite(request, env, user, url, id) {
  const s = await getStudentRow(env, id);
  const body = await readJson(request);
  const test = TEST_KEYS.includes(body.test) ? body.test : null;
  if (!test) throw new HttpError(400, "Jenis tes tidak dikenal.");
  if (test === "placement") return json({ ok: true, link: `${env.PUBLIC_WEB_URL}/`, expiresAt: null });
  const token = randomToken(24);
  const now = nowSeconds();
  await env.DB.prepare("INSERT INTO invites (id, token_hash, student_id, test_key, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(newId("inv"), await sha256Hex(token), s.id, test, now, now + INVITE_TTL, user.name).run();
  return json({ ok: true, link: `${env.PUBLIC_WEB_URL}/?undangan=${token}`, expiresAt: ms(now + INVITE_TTL) });
}

/* ===================== Tests and questions ===================== */
async function updateTestSettings(request, env, user, url, key) {
  const body = await readJson(request);
  const row = await env.DB.prepare("SELECT * FROM tests WHERE key = ?").bind(key).first();
  const next = { ...row };
  if (body.timeMode !== undefined) { if (!["total", "per"].includes(body.timeMode)) throw new HttpError(400, "Mode waktu tidak dikenal."); next.time_mode = body.timeMode; }
  if (body.totalSeconds !== undefined) { const v = int(body.totalSeconds, { min: 60, max: 3600 }); if (v === null) throw new HttpError(400, "Durasi tes harus antara 1 dan 60 menit."); next.total_seconds = v; }
  if (body.perDefault !== undefined) { const v = int(body.perDefault, { min: 5, max: 180 }); if (v === null) throw new HttpError(400, "Waktu bawaan per soal harus antara 5 dan 180 detik."); next.per_default = v; }
  if (body.open !== undefined) next.is_open = body.open ? 1 : 0;
  if (body.maxViolations !== undefined) { const v = int(body.maxViolations, { min: 1, max: 5 }); if (v === null) throw new HttpError(400, "Batas pelanggaran harus antara 1 dan 5."); next.max_violations = v; }
  if (body.passScore !== undefined && key === "post") { const v = int(body.passScore, { min: 0, max: 100 }); if (v === null) throw new HttpError(400, "Nilai kelulusan harus angka bulat dari 0 sampai 100."); next.pass_score = v; }
  await env.DB.prepare("UPDATE tests SET time_mode = ?, total_seconds = ?, per_default = ?, is_open = ?, max_violations = ?, pass_score = ?, updated_at = ?, updated_by = ? WHERE key = ?")
    .bind(next.time_mode, next.total_seconds, next.per_default, next.is_open, next.max_violations, next.pass_score, nowSeconds(), user.name, key).run();
  return json({ ok: true });
}

function readQuestionInput(body) {
  const prompt = multiline(body.prompt, 1000);
  const passage = multiline(body.passage, 4000);
  const options = {};
  for (const k of CHOICES) options[k] = text(body.options?.[k], 300);
  if (!prompt) throw new HttpError(400, "Teks soal wajib diisi.");
  if (CHOICES.some((k) => !options[k])) throw new HttpError(400, "Isi keempat pilihan jawaban.");
  if (new Set(CHOICES.map((k) => options[k].toLowerCase())).size < 4) throw new HttpError(400, "Ada pilihan jawaban yang sama. Setiap pilihan harus berbeda.");
  if (!CHOICES.includes(body.answer)) throw new HttpError(400, "Pilih satu jawaban yang benar.");
  const seconds = body.seconds === undefined ? null : int(body.seconds, { min: 5, max: 180 });
  if (body.seconds !== undefined && seconds === null) throw new HttpError(400, "Waktu soal harus antara 5 dan 180 detik.");
  return { prompt, passage: passage || null, options, answer: body.answer, skill: SKILLS.includes(body.skill) ? body.skill : "Grammar", status: body.status === "draf" ? "draf" : "aktif", seconds };
}

async function createQuestion(request, env, user, url, key) {
  const q = readQuestionInput(await readJson(request));
  const test = await env.DB.prepare("SELECT per_default FROM tests WHERE key = ?").bind(key).first();
  const max = await env.DB.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM questions WHERE test_key = ?").bind(key).first();
  const now = nowSeconds();
  const r = await env.DB.prepare(`INSERT INTO questions (test_key, position, skill, prompt, passage, option_a, option_b, option_c, option_d, answer, seconds, status, created_at, updated_at)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(key, max.p + 1, q.skill, q.prompt, q.passage, q.options.A, q.options.B, q.options.C, q.options.D, q.answer, q.seconds ?? test.per_default, q.status, now, now).first();
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
  await env.DB.prepare(`UPDATE questions SET skill = ?, prompt = ?, passage = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, answer = ?, seconds = ?, status = ?, updated_at = ? WHERE id = ?`)
    .bind(q.skill, q.prompt, q.passage, q.options.A, q.options.B, q.options.C, q.options.D, q.answer, q.seconds ?? row.seconds, q.status, nowSeconds(), row.id).run();
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
      env.DB.prepare(`INSERT INTO questions (test_key, position, skill, prompt, passage, option_a, option_b, option_c, option_d, answer, seconds, status, created_at, updated_at)
                      SELECT test_key, position + 1, skill, prompt, passage, option_a, option_b, option_c, option_d, answer, seconds, 'draf', ?::bigint, ?::bigint FROM questions WHERE id = ?`).bind(now, now, fresh.id),
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
  log.sort((x, y) => x.at - y.at);
  return json({ id: a.id, answers, log, device: deviceLabel(a.user_agent), country: a.country || "", consent: a.consent_version });
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
  const levels = await loadLevels(env);
  const level = levels.find((l) => l.key === a.level_key) || levels[0];
  const { subject, html, text: plain } = buildResultEmail({ name: a.name, email: a.email, score: a.score, total: a.total, level: publicLevel(level) });
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

// Database access shared by the public test API and the admin API.
// Questions, test settings, and level thresholds live in the database so the dashboard can edit them.

import { LEVELS as LEVEL_COPY } from "./levels.js";
import { randomToken } from "./crypto.js";
import { nowSeconds } from "./http.js";

export const TEST_KEYS = ["placement", "pre", "post"];
export const TEST_NAMES = { placement: "Placement Test", pre: "Pre-test", post: "Post-test" };
export const FOCUS_TYPES = new Set(["fullscreen_exit", "tab_hidden", "window_blur"]);
export const PER_MODE_GRACE_SECONDS = 120;

export const newId = (prefix) => `${prefix}_${randomToken(9)}`;

export function mapTest(row) {
  if (!row) return null;
  return {
    key: row.key,
    timeMode: row.time_mode,
    totalSeconds: row.total_seconds,
    perDefault: row.per_default,
    open: Boolean(row.is_open),
    maxViolations: row.max_violations,
    passScore: row.pass_score,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function loadTest(env, key) {
  return mapTest(await env.DB.prepare("SELECT * FROM tests WHERE key = ?").bind(key).first());
}

export function mapQuestion(row) {
  return {
    id: row.id,
    test: row.test_key,
    position: row.position,
    skill: row.skill,
    prompt: row.prompt,
    passage: row.passage || "",
    options: { A: row.option_a, B: row.option_b, C: row.option_c, D: row.option_d },
    answer: row.answer,
    seconds: row.seconds,
    status: row.status,
  };
}

export async function loadQuestions(env, key, { activeOnly = false } = {}) {
  const sql = `SELECT * FROM questions WHERE test_key = ?${activeOnly ? " AND status = 'aktif'" : ""} ORDER BY position, id`;
  const { results } = await env.DB.prepare(sql).bind(key).all();
  return results.map(mapQuestion);
}

export async function loadLevels(env) {
  const { results } = await env.DB.prepare("SELECT * FROM levels ORDER BY position").all();
  return results.map((r) => ({ key: r.key, position: r.position, label: r.label, min: r.min_score, max: r.max_score, program: r.program }));
}

export function levelFor(levels, score) {
  return levels.find((l) => score >= l.min && score <= l.max) || levels[levels.length - 1];
}

/* Public result copy keeps the summary and description from src/levels.js, keyed by level. */
export function publicLevel(level) {
  const copy = LEVEL_COPY.find((l) => l.key === level.key) || {};
  return { key: level.key, label: level.label, program: level.program, summary: copy.summary || "", description: copy.description || "" };
}

export function focusStrikes(log) {
  if (!log) return 0;
  return String(log).split(";").filter(Boolean).filter((entry) => FOCUS_TYPES.has(entry.split(":")[1])).length;
}

/* Status as the dashboard shows it. Failed attempts never reach submit, so they are derived. */
export function attemptStatus(row, now = nowSeconds()) {
  if (row.voided_at) return "void";
  if (row.status === "submitted") return row.student_id || row.name ? "done" : "nocontact";
  if (now > row.expires_at + 30) return focusStrikes(row.violation_log) >= (row.max_violations || 3) ? "violation" : "timeout";
  return focusStrikes(row.violation_log) >= (row.max_violations || 3) ? "violation" : "progress";
}

export function addActivity(env, studentId, type, text, by = null, meta = null, at = nowSeconds()) {
  return env.DB.prepare("INSERT INTO activities (student_id, at, type, text, by_name, meta) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(studentId, at, type, String(text).slice(0, 2000), by, meta ? JSON.stringify(meta) : null);
}

/* Placement contact step: link the attempt to an existing student, or create a new lead. */
export async function upsertStudentFromContact(env, { name, email, whatsapp }) {
  const existing = await env.DB.prepare("SELECT * FROM students WHERE whatsapp = ? OR (email IS NOT NULL AND email = ?) ORDER BY whatsapp = ? DESC LIMIT 1")
    .bind(whatsapp, email, whatsapp).first();
  const now = nowSeconds();
  if (existing) {
    await env.DB.prepare("UPDATE students SET email = COALESCE(email, ?), updated_at = ? WHERE id = ?").bind(email, now, existing.id).run();
    return { id: existing.id, created: false };
  }
  const id = newId("stu");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO students (id, name, email, whatsapp, source, stage, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 'Placement test', 'baru', ?, ?)`).bind(id, name, email, whatsapp, now, now),
    addActivity(env, id, "system", "Masuk ke database dari placement test.", null, null, now),
  ]);
  return { id, created: true };
}

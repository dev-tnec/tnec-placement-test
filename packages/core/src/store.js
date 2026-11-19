// Database access shared by the public test API and the admin API.
// Questions, test settings, and level thresholds live in the database so the dashboard can edit them.

import { LEVELS as LEVEL_COPY } from "./levels.js";
import { randomToken } from "./crypto.js";
import { nowSeconds } from "./http.js";

export const TEST_KEYS = ["placement", "pre", "post", "ielts-mockup"];
export const TEST_NAMES = { placement: "Placement Test", pre: "Pre-test", post: "Post-test", "ielts-mockup": "IELTS Mockup" };
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
    listeningSeconds: row.listening_seconds ?? null,
    readingSeconds: row.reading_seconds ?? null,
    writingSeconds: row.writing_seconds ?? null,
    speakingBlockSeconds: row.speaking_block_seconds ?? null,
    listeningBreakSeconds: row.listening_break_seconds ?? 0,
    readingBreakSeconds: row.reading_break_seconds ?? 0,
    writingBreakSeconds: row.writing_break_seconds ?? 0,
    open: Boolean(row.is_open),
    maxViolations: row.max_violations,
    passScore: row.pass_score,
    autoSubmit: Boolean(row.auto_submit),
    audioUrl: row.audio_url || "",
    speakingEnabled: Boolean(row.speaking_enabled),
    speakingSeconds: row.speaking_seconds ?? 45,
    speakingMinSeconds: row.speaking_min_seconds ?? 15,
    speakingPrompt: row.speaking_prompt || "",
    speakingCount: row.speaking_count ?? 1,
    speakingRandomize: Boolean(row.speaking_randomize),
    speakingDialect: row.speaking_dialect || "en-us",
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function loadTest(env, key) {
  return mapTest(await env.DB.prepare("SELECT * FROM tests WHERE key = ?").bind(key).first());
}

export function mapQuestion(row) {
  const options = {};
  for (const key of ["A", "B", "C", "D", "E", "F"]) {
    if (row[`option_${key.toLowerCase()}`]) options[key] = row[`option_${key.toLowerCase()}`];
  }
  return {
    id: row.id,
    test: row.test_key,
    position: row.position,
    skill: row.skill,
    part: row.part ?? null,
    type: row.type || "choice",
    accepted: row.accepted ? JSON.parse(row.accepted) : null,
    minWords: row.min_words ?? null,
    prompt: row.prompt,
    passage: row.passage || "",
    sectionId: row.section_id || null,
    packageId: row.package_id || null,
    options,
    answer: row.answer,
    seconds: row.seconds,
    status: row.status,
  };
}

export function mapSection(row) {
  if (!row) return null;
  return {
    id: row.id,
    test: row.test_key,
    packageId: row.package_id || null,
    position: row.position,
    title: row.title,
    skill: row.skill,
    part: row.part ?? null,
    passage: row.passage || "",
    audio: row.audio_url || "",
    image: row.image_url || "",
  };
}

export function mapPackage(row) {
  if (!row) return null;
  return {
    id: row.id,
    test: row.test_key,
    name: row.name,
    position: row.position,
    active: Boolean(row.is_active),
  };
}

export async function loadQuestions(env, key, { activeOnly = false, packageId } = {}) {
  const clauses = ["test_key = ?"];
  const args = [key];
  if (activeOnly) clauses.push("status = 'aktif'");
  if (packageId) {
    clauses.push("package_id = ?");
    args.push(packageId);
  }
  const sql = `SELECT * FROM questions WHERE ${clauses.join(" AND ")} ORDER BY position, id`;
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return results.map(mapQuestion);
}

export async function loadSections(env, key, { packageId } = {}) {
  const clauses = ["test_key = ?"];
  const args = [key];
  if (packageId) {
    clauses.push("package_id = ?");
    args.push(packageId);
  }
  const { results } = await env.DB.prepare(`SELECT * FROM question_sections WHERE ${clauses.join(" AND ")} ORDER BY position, id`).bind(...args).all();
  return results.map(mapSection);
}

export async function loadLevels(env) {
  const { results } = await env.DB.prepare("SELECT * FROM levels ORDER BY position").all();
  return results.map((r) => ({
    key: r.key, position: r.position, label: r.label, min: r.min_score, max: r.max_score,
    program: r.program, programUrl: r.program_url || "", programImage: r.program_image || "",
  }));
}

export function levelFor(levels, score) {
  return levels.find((l) => score >= l.min && score <= l.max) || levels[levels.length - 1];
}

/* Public result copy keeps the summary and description from src/levels.js, keyed by level. */
export function publicLevel(level) {
  const copy = LEVEL_COPY.find((l) => l.key === level.key) || {};
  return {
    key: level.key, label: level.label, program: level.program,
    programUrl: level.programUrl || "", programImage: level.programImage || "",
    summary: copy.summary || "", description: copy.description || "",
  };
}

/**
 * The program cards of the result page, as a grid: the recommended program first with its flag,
 * then the other programs of the level ladder. Each card is one distinct product page.
 */
export function programCards(levels, levelKey) {
  const recommended = levels.find((l) => l.key === levelKey);
  const cards = [];
  for (const level of levels) {
    if (!level.programUrl || cards.some((c) => c.url === level.programUrl)) continue;
    cards.push({ name: level.program, url: level.programUrl, image: level.programImage || "", levels: [level.label] });
  }
  for (const level of levels) {
    const card = cards.find((c) => c.url === level.programUrl);
    if (card && !card.levels.includes(level.label)) card.levels.push(level.label);
  }
  const hit = cards.find((c) => recommended && c.url === recommended.programUrl);
  if (hit) {
    hit.recommended = true;
    hit.levelLabel = recommended.label;
    return [hit, ...cards.filter((c) => c !== hit)];
  }
  return cards;
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

/* Placement contact step: link the attempt to an existing student, or create a new lead.
   The branch answer fills an empty branch column only, so a later registration choice is
   never overwritten by a repeated test. */
export async function upsertStudentFromContact(env, { name, email, whatsapp, branch = null }) {
  const existing = await env.DB.prepare("SELECT * FROM students WHERE whatsapp = ? OR (email IS NOT NULL AND email = ?) ORDER BY whatsapp = ? DESC LIMIT 1")
    .bind(whatsapp, email, whatsapp).first();
  const now = nowSeconds();
  if (existing) {
    await env.DB.prepare("UPDATE students SET email = COALESCE(email, ?), branch = COALESCE(branch, ?), updated_at = ? WHERE id = ?").bind(email, branch, now, existing.id).run();
    return { id: existing.id, created: false };
  }
  const id = newId("stu");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO students (id, name, email, whatsapp, branch, source, stage, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'Placement test', 'baru', ?, ?)`).bind(id, name, email, whatsapp, branch, now, now),
    addActivity(env, id, "system", "Masuk ke database dari placement test.", null, null, now),
  ]);
  return { id, created: true };
}

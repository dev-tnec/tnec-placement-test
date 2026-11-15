// Generates migrations/0002_dashboard.sql from the source question set and levels,
// so the seed data is never retyped by hand. Run: node scripts/seed-sql.mjs
import { writeFileSync } from "node:fs";
import { QUESTIONS } from "../src/questions.js";
import { LEVELS } from "../src/levels.js";

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const SKILL = {
  1: "Vocabulary", 5: "Vocabulary", 7: "Vocabulary", 10: "Vocabulary", 16: "Vocabulary", 23: "Vocabulary",
  11: "Reading", 14: "Reading",
};

// Sample banks for the pre-test and post-test. They are seeded as drafts so nothing
// goes live until the education team reviews or replaces them.
const PRE = [
  ["Grammar", "She ___ to school by bus every morning.", ["goes", "going", "gone", "go"], "A"],
  ["Vocabulary", "Choose the word that means \u201cvery big\u201d.", ["tiny", "huge", "narrow", "quiet"], "B"],
  ["Grammar", "I have lived in Kediri ___ 2019.", ["for", "since", "from", "at"], "B"],
  ["Grammar", "If it rains tomorrow, we ___ at home.", ["stay", "stayed", "will stay", "would stay"], "C"],
  ["Vocabulary", "The opposite of \u201ccheap\u201d is ___ .", ["expensive", "poor", "free", "easy"], "A"],
  ["Grammar", "My brother is ___ than me.", ["tall", "taller", "tallest", "more tall"], "B"],
  ["Grammar", "___ you ever been to Bali?", ["Do", "Did", "Have", "Are"], "C"],
  ["Grammar", "The meeting was postponed ___ the heavy rain.", ["because", "because of", "although", "despite of"], "B"],
  ["Vocabulary", "Which word has the same meaning as \u201cbegin\u201d?", ["finish", "start", "stop", "close"], "B"],
  ["Reading", "What does Rina do before breakfast?", ["She walks to her office.", "She studies English.", "She joins a speaking club.", "She cooks breakfast."], "B",
    "Rina wakes up at five o'clock every day. She studies English for one hour before breakfast, then walks to her office. On Saturdays she joins a speaking club near her house."],
  ["Grammar", "The book ___ by millions of people around the world.", ["has read", "has been read", "is reading", "reads"], "B"],
  ["Grammar", "He apologized ___ being late.", ["for", "of", "about", "to"], "A"],
];
const POST = [
  ["Grammar", "By the time we arrived, the movie ___ .", ["already started", "had already started", "has already started", "already starts"], "B"],
  ["Grammar", "She suggested that he ___ a doctor.", ["sees", "see", "saw", "seeing"], "B"],
  ["Vocabulary", "Choose the word closest in meaning to \u201creluctant\u201d.", ["eager", "unwilling", "careful", "proud"], "B"],
  ["Grammar", "Neither the students nor the teacher ___ aware of the change.", ["were", "was", "are", "have been"], "B"],
  ["Vocabulary", "The new policy will ___ affect small businesses.", ["significant", "significance", "significantly", "signify"], "C"],
  ["Grammar", "I would rather you ___ smoke in here.", ["don't", "didn't", "won't", "not"], "B"],
  ["Grammar", "He is used to ___ up early.", ["get", "getting", "got", "gets"], "B"],
  ["Vocabulary", "The word \u201cabundant\u201d most nearly means ___ .", ["rare", "plentiful", "expensive", "dangerous"], "B"],
  ["Reading", "According to the passage, why do local governments offer free seeds?", ["To reduce traffic in narrow alleys.", "To encourage more households to grow food.", "To replace traditional markets.", "To cool government buildings."], "B",
    "Urban gardens are spreading across Indonesian cities. Residents grow vegetables on rooftops and in narrow alleys, which lowers their food costs and cools the surrounding air. Local governments now offer free seeds and training to encourage more households to take part."],
  ["Grammar", "Hardly had she finished her speech ___ the audience began to clap.", ["when", "than", "then", "that"], "A"],
  ["Grammar", "If I ___ more time, I would have finished the report.", ["had", "had had", "have had", "would have"], "B"],
  ["Grammar", "The results of the survey ___ published next week.", ["will be", "will", "are being", "have"], "A"],
];

const NOW = "CAST(strftime('%s','now') AS INTEGER)";
const rows = [];
QUESTIONS.forEach((x, i) => {
  rows.push(`(${x.id}, 'placement', ${i + 1}, ${q(SKILL[x.id] || "Grammar")}, ${q(x.prompt)}, ${q(x.passage || null)}, ${q(x.options.A)}, ${q(x.options.B)}, ${q(x.options.C)}, ${q(x.options.D)}, ${q(x.answer)}, 12, 'aktif', ${NOW}, ${NOW})`);
});
const bank = (list, testKey, base) => list.forEach(([skill, prompt, opts, answer, passage], i) => {
  rows.push(`(${base + i + 1}, '${testKey}', ${i + 1}, ${q(skill)}, ${q(prompt)}, ${q(passage || null)}, ${q(opts[0])}, ${q(opts[1])}, ${q(opts[2])}, ${q(opts[3])}, ${q(answer)}, 45, 'draf', ${NOW}, ${NOW})`);
});
bank(PRE, "pre", 100);
bank(POST, "post", 200);

const levels = LEVELS.map((l, i) => `(${q(l.key)}, ${i + 1}, ${q(l.label)}, ${l.min}, ${l.max}, ${q(l.program)})`);

const sql = `-- 0002_dashboard.sql
-- Internal dashboard: three tests with editable questions and settings, editable level thresholds,
-- the student database, activities, the program catalog, invites for pre-test and post-test,
-- the WhatsApp message log, and admin accounts. Generated by scripts/seed-sql.mjs.

ALTER TABLE attempts ADD COLUMN test_key TEXT NOT NULL DEFAULT 'placement';
ALTER TABLE attempts ADD COLUMN student_id TEXT;
ALTER TABLE attempts ADD COLUMN question_ids TEXT;
ALTER TABLE attempts ADD COLUMN time_mode TEXT NOT NULL DEFAULT 'total';
ALTER TABLE attempts ADD COLUMN limit_seconds INTEGER;
ALTER TABLE attempts ADD COLUMN max_violations INTEGER NOT NULL DEFAULT 3;
ALTER TABLE attempts ADD COLUMN pass_score INTEGER;
ALTER TABLE attempts ADD COLUMN passed INTEGER;
ALTER TABLE attempts ADD COLUMN invite_id TEXT;
ALTER TABLE attempts ADD COLUMN voided_at INTEGER;
ALTER TABLE attempts ADD COLUMN voided_by TEXT;
ALTER TABLE attempts ADD COLUMN void_reason TEXT;
ALTER TABLE answers ADD COLUMN answer_key TEXT;

CREATE INDEX IF NOT EXISTS idx_attempts_test ON attempts (test_key, started_at);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts (student_id);

CREATE TABLE IF NOT EXISTS tests (
  key            TEXT PRIMARY KEY CHECK (key IN ('placement', 'pre', 'post')),
  time_mode      TEXT NOT NULL DEFAULT 'total' CHECK (time_mode IN ('total', 'per')),
  total_seconds  INTEGER NOT NULL DEFAULT 300,
  per_default    INTEGER NOT NULL DEFAULT 12,
  is_open        INTEGER NOT NULL DEFAULT 1,
  max_violations INTEGER NOT NULL DEFAULT 3,
  pass_score     INTEGER,
  updated_at     INTEGER,
  updated_by     TEXT
);
INSERT OR IGNORE INTO tests (key, time_mode, total_seconds, per_default, is_open, max_violations, pass_score) VALUES
  ('placement', 'total', 300, 12, 1, 3, NULL),
  ('pre', 'total', 600, 45, 0, 3, NULL),
  ('post', 'total', 600, 45, 0, 3, 70);

CREATE TABLE IF NOT EXISTS questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  test_key   TEXT NOT NULL REFERENCES tests(key),
  position   INTEGER NOT NULL,
  skill      TEXT NOT NULL DEFAULT 'Grammar',
  prompt     TEXT NOT NULL,
  passage    TEXT,
  option_a   TEXT NOT NULL,
  option_b   TEXT NOT NULL,
  option_c   TEXT NOT NULL,
  option_d   TEXT NOT NULL,
  answer     TEXT NOT NULL CHECK (answer IN ('A', 'B', 'C', 'D')),
  seconds    INTEGER NOT NULL DEFAULT 12,
  status     TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'draf')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_test ON questions (test_key, position);
INSERT OR IGNORE INTO questions (id, test_key, position, skill, prompt, passage, option_a, option_b, option_c, option_d, answer, seconds, status, created_at, updated_at) VALUES
${rows.join(",\n")};

CREATE TABLE IF NOT EXISTS levels (
  key       TEXT PRIMARY KEY,
  position  INTEGER NOT NULL,
  label     TEXT NOT NULL,
  min_score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  program   TEXT NOT NULL
);
INSERT OR IGNORE INTO levels (key, position, label, min_score, max_score, program) VALUES
${levels.join(",\n")};

CREATE TABLE IF NOT EXISTS students (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  whatsapp    TEXT,
  city        TEXT,
  source      TEXT NOT NULL DEFAULT 'Placement test',
  stage       TEXT NOT NULL DEFAULT 'baru' CHECK (stage IN ('baru', 'dihubungi', 'konsultasi', 'terdaftar', 'lepas')),
  program_id  TEXT,
  duration_id TEXT,
  period_id   TEXT,
  class_id    TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_whatsapp ON students (whatsapp) WHERE whatsapp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_students_email ON students (email);
CREATE INDEX IF NOT EXISTS idx_students_stage ON students (stage, created_at);

CREATE TABLE IF NOT EXISTS activities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  at         INTEGER NOT NULL,
  type       TEXT NOT NULL,
  text       TEXT NOT NULL,
  by_name    TEXT,
  meta       TEXT
);
CREATE INDEX IF NOT EXISTS idx_activities_student ON activities (student_id, at);

CREATE TABLE IF NOT EXISTS tutors (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS programs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mode       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS program_durations (
  id         TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  label      TEXT NOT NULL,
  days       INTEGER NOT NULL,
  price      INTEGER
);

CREATE TABLE IF NOT EXISTS program_tutors (
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  tutor_id   TEXT NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  PRIMARY KEY (program_id, tutor_id)
);

CREATE TABLE IF NOT EXISTS periods (
  id         TEXT PRIMARY KEY,
  start_date TEXT NOT NULL UNIQUE,
  note       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  program_id TEXT NOT NULL REFERENCES programs(id),
  period_id  TEXT NOT NULL REFERENCES periods(id),
  tutor_id   TEXT NOT NULL REFERENCES tutors(id),
  capacity   INTEGER NOT NULL DEFAULT 20,
  created_at INTEGER NOT NULL,
  UNIQUE (period_id, code)
);

CREATE TABLE IF NOT EXISTS invites (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  test_key   TEXT NOT NULL CHECK (test_key IN ('pre', 'post')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  attempt_id TEXT,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_student ON invites (student_id);

CREATE TABLE IF NOT EXISTS wa_messages (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id          TEXT,
  to_number           TEXT NOT NULL,
  text                TEXT NOT NULL,
  status              TEXT NOT NULL,
  provider_message_id TEXT,
  error               TEXT,
  created_at          INTEGER NOT NULL,
  created_by          TEXT
);
CREATE INDEX IF NOT EXISTS idx_wa_student ON wa_messages (student_id, created_at);

CREATE TABLE IF NOT EXISTS admin_users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'admin',
  password_hash  TEXT NOT NULL,
  password_salt  TEXT NOT NULL,
  password_iter  INTEGER NOT NULL,
  failed_logins  INTEGER NOT NULL DEFAULT 0,
  locked_until   INTEGER,
  last_login_at  INTEGER,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON admin_sessions (user_id);
`;

writeFileSync(new URL("../migrations/0002_dashboard.sql", import.meta.url), sql);
console.log(`wrote 0002_dashboard.sql with ${rows.length} questions and ${levels.length} levels`);

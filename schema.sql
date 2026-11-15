-- TNEC Placement Test schema (Cloudflare D1 / SQLite), the original two tables.
-- Kept for reference only. The schema is now managed by migrations/ and applied with
-- npm run db:migrate (remote) or npm run db:migrate:local. Do not apply this file by hand.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS attempts (
  id               TEXT PRIMARY KEY,
  started_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  submitted_at     INTEGER,
  status           TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  score            INTEGER,
  total            INTEGER NOT NULL DEFAULT 25,
  level_key        TEXT,
  timed_out        INTEGER NOT NULL DEFAULT 0,
  name             TEXT,
  email            TEXT,
  whatsapp         TEXT,
  consent_version  TEXT NOT NULL,
  consent_at       INTEGER NOT NULL,
  violations       INTEGER NOT NULL DEFAULT 0,
  violation_log    TEXT,
  duration_seconds INTEGER,
  email_sent_at    INTEGER,
  email_status     TEXT,
  user_agent       TEXT,
  country          TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS answers (
  attempt_id  TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  choice      TEXT,
  is_correct  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_email ON attempts (email);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts (status, started_at);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers (attempt_id);

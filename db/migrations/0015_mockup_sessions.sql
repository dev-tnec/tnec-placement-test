-- Bulk mockup participants (docs/prd-ielts-mockup-bulk.md). One paid wave is one session that
-- owns the roster, the package, the program, and the period. Each invite stores that student's
-- own test window, because one wave spreads its students across several days and times.
-- The invite queue holds one row per invite with a separate status for the email and WhatsApp
-- channels, and keeps the plain invite token only until both channels have delivered.

CREATE TABLE IF NOT EXISTS mockup_sessions (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  window_mode         TEXT NOT NULL DEFAULT 'terjadwal' CHECK (window_mode IN ('terjadwal', 'fleksibel')),
  range_start         BIGINT,
  range_end           BIGINT,
  entry_grace_seconds INTEGER NOT NULL DEFAULT 7200,
  program_id          TEXT NOT NULL REFERENCES programs(id),
  period_id           TEXT NOT NULL REFERENCES periods(id),
  duration_id         TEXT REFERENCES program_durations(id),
  package_id          TEXT NOT NULL REFERENCES question_packages(id),
  quota               INTEGER,
  queue_paused        INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'cancelled')),
  created_by          TEXT,
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mockup_sessions_created ON mockup_sessions (created_at DESC);

ALTER TABLE invites ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES mockup_sessions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_session_student ON invites (session_id, student_id) WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mockup_invite_queue (
  id             TEXT PRIMARY KEY,
  invite_id      TEXT NOT NULL UNIQUE REFERENCES invites(id) ON DELETE CASCADE,
  email_status   TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sending', 'sent', 'failed', 'dilewati', 'kuota')),
  email_attempts INTEGER NOT NULL DEFAULT 0,
  email_error    TEXT,
  email_sent_at  BIGINT,
  wa_status      TEXT NOT NULL DEFAULT 'pending' CHECK (wa_status IN ('pending', 'sending', 'sent', 'failed')),
  wa_attempts    INTEGER NOT NULL DEFAULT 0,
  wa_error       TEXT,
  wa_sent_at     BIGINT,
  plain_token    TEXT,
  created_at    BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invite_queue_statuses ON mockup_invite_queue (wa_status, email_status);

-- The mockup is a program of its own: participants are students with a registration, never
-- leads. The price stays empty for the team to fill in Program & Kelas.
INSERT INTO programs (id, name, mode, status, created_at, updated_at)
VALUES ('prg_ielts_mockup', 'IELTS Mockup', 'Online', 'aktif', EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT)
ON CONFLICT (id) DO NOTHING;

INSERT INTO program_durations (id, program_id, position, label, days, price)
VALUES ('dur_ielts_mockup_1', 'prg_ielts_mockup', 1, '1 hari', 1, NULL)
ON CONFLICT (id) DO NOTHING;

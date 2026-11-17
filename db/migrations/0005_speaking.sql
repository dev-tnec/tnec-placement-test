-- Speaking section of the placement test, scored by Speechace (docs/prd-speaking-section.md).
--
-- The test settings gain a switch, a recording window, one prompt, and the scoring dialect. Each
-- placement attempt can have one speaking submission. The submission row is its own work queue:
-- a server claims it with a lease, calls Speechace, and stores the transcript and the five scores.
-- The result email and WhatsApp wait until the row is graded, graded by hand, or skipped.

ALTER TABLE tests ADD COLUMN IF NOT EXISTS speaking_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS speaking_seconds INTEGER NOT NULL DEFAULT 45;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS speaking_min_seconds INTEGER NOT NULL DEFAULT 15;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS speaking_prompt TEXT;
-- The PRD's settings table has a language select; Speechace scores open speech in en-us or en-gb.
ALTER TABLE tests ADD COLUMN IF NOT EXISTS speaking_dialect TEXT NOT NULL DEFAULT 'en-us'
  CHECK (speaking_dialect IN ('en-us', 'en-gb'));

-- A starting question from the team's own Speechace test page. Speaking stays off until the team
-- switches it on in Placement Test, Pengaturan.
UPDATE tests SET speaking_prompt = 'Describe a place you like to visit and explain why you enjoy it.'
  WHERE key = 'placement' AND speaking_prompt IS NULL;

CREATE TABLE IF NOT EXISTS speaking_submissions (
  id                  TEXT PRIMARY KEY,
  attempt_id          TEXT NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE CASCADE,
  student_id          TEXT,
  prompt              TEXT NOT NULL,
  audio               BYTEA,
  audio_mime          TEXT,
  audio_bytes         INTEGER,
  duration_seconds    INTEGER,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'grading', 'graded', 'failed', 'manual', 'skipped')),
  needs_review        INTEGER NOT NULL DEFAULT 0,
  provider            TEXT NOT NULL DEFAULT 'speechace',
  provider_request_id TEXT,
  provider_response   TEXT,
  transcript          TEXT,
  cefr_overall        TEXT,
  ielts_overall       NUMERIC(3,1),
  scores              TEXT,
  error               TEXT,
  tries               INTEGER NOT NULL DEFAULT 0,
  next_attempt_at     BIGINT,
  lease_until         BIGINT,
  graded_at           BIGINT,
  graded_by           TEXT,
  created_at          BIGINT NOT NULL
);

-- attempt_id is UNIQUE, which already gives it an index, so the PRD's idx_speaking_attempt is left out.
CREATE INDEX IF NOT EXISTS idx_speaking_status ON speaking_submissions (status, next_attempt_at);

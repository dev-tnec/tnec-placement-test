-- The placement speaking becomes a bank of questions the team manages in a Speaking tab,
-- like the mockup interview but for the placement test. The team sets how many questions a
-- student gets (speaking_count) and whether the pick is random (speaking_randomize); the
-- picked questions are stored on the attempt so grading always sees what the student saw.
--
-- A placement attempt now carries several recordings, so speaking_submissions loses its one
-- row per attempt constraint and gains the question position instead. The skip marker row
-- sits at position 0; question answers start at position 1.

CREATE TABLE IF NOT EXISTS speaking_questions (
  id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  position    INTEGER NOT NULL,
  prompt      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'draf')),
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);

-- The current prompt from Pengaturan becomes the first bank question, so nothing breaks.
INSERT INTO speaking_questions (position, prompt, status, created_at, updated_at)
SELECT 1, t.speaking_prompt, 'aktif', EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT
  FROM tests t
 WHERE t.key = 'placement' AND t.speaking_prompt IS NOT NULL AND TRIM(t.speaking_prompt) != '';

ALTER TABLE tests ADD COLUMN IF NOT EXISTS speaking_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS speaking_randomize INTEGER NOT NULL DEFAULT 0;

ALTER TABLE attempts ADD COLUMN IF NOT EXISTS speaking_questions TEXT;

ALTER TABLE speaking_submissions DROP CONSTRAINT IF EXISTS speaking_submissions_attempt_id_key;
ALTER TABLE speaking_submissions ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_speaking_attempt_position ON speaking_submissions (attempt_id, position);

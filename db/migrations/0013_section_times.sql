-- IELTS mockup: separate timers for Listening, Reading, Writing, and Speaking, following the
-- computer-based IELTS format. The student can move freely inside a section, but a section locks
-- when its time ends and the test moves on. The audio stays one file for the whole Listening part.
--
-- The speaking block is separate from tests.speaking_seconds, which is the placement recording
-- limit. The mockup speaking block covers the whole 18-question interview.

ALTER TABLE tests DROP CONSTRAINT IF EXISTS tests_time_mode_check;
ALTER TABLE tests ADD CONSTRAINT tests_time_mode_check CHECK (time_mode IN ('total', 'per', 'sections'));

ALTER TABLE tests ADD COLUMN IF NOT EXISTS listening_seconds INTEGER;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS reading_seconds INTEGER;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS writing_seconds INTEGER;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS speaking_block_seconds INTEGER;

UPDATE tests SET
  time_mode = 'sections',
  listening_seconds = 1920,
  reading_seconds = 3600,
  writing_seconds = 3600,
  speaking_block_seconds = 900,
  total_seconds = 10020
WHERE key = 'ielts-mockup';

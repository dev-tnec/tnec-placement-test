-- Break minutes between the IELTS mockup sections: the pause a student takes after Listening,
-- Reading, and Writing before the next section timer starts. Zero means no break, the current
-- behavior. The minutes live beside the section seconds on the tests row and are editable in the
-- dashboard Pengaturan, like the section durations.

ALTER TABLE tests ADD COLUMN IF NOT EXISTS listening_break_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS reading_break_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS writing_break_seconds INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tests ADD CONSTRAINT tests_break_seconds_check
  CHECK (listening_break_seconds BETWEEN 0 AND 1800
     AND reading_break_seconds BETWEEN 0 AND 1800
     AND writing_break_seconds BETWEEN 0 AND 1800);

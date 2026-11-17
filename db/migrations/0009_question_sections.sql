-- Question sections for the IELTS mockup (docs/prd-ielts-mockup.md): a section owns a range of
-- questions together with the reading passage and the listening audio that belong to them, so a
-- later shuffle can move questions without separating them from their passage or audio.
--
-- The December bank gets four listening sections (the per-part instructions, with the full
-- listening audio on the first one) and three reading sections (the three passages).

CREATE TABLE IF NOT EXISTS question_sections (
  id         TEXT PRIMARY KEY,
  test_key   TEXT NOT NULL REFERENCES tests(key) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  title      TEXT NOT NULL,
  skill      TEXT NOT NULL,
  part       INTEGER,
  passage    TEXT,
  audio_url  TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_question_sections_test ON question_sections (test_key, position);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS section_id TEXT REFERENCES question_sections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_questions_section ON questions (section_id);

-- One audio play per attempt per section. The old attempts.audio_played_at stays for the existing
-- submissions and for the first-play time shown in the dashboard.
CREATE TABLE IF NOT EXISTS attempt_audio_plays (
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  played_at  BIGINT NOT NULL,
  PRIMARY KEY (attempt_id, section_id)
);

-- The seven December sections. The passage comes from the longest stored passage of the part, so a
-- row truncated by an earlier edit cannot shrink the section text.
INSERT INTO question_sections (id, test_key, position, title, skill, part, passage, audio_url, created_at, updated_at)
VALUES
  ('sec_ielts_listen_1', 'ielts-mockup', 1, 'Listening Part 1', 'Listening', 1,
   (SELECT passage FROM questions WHERE test_key = 'ielts-mockup' AND skill = 'Listening' AND part = 1 AND passage IS NOT NULL ORDER BY LENGTH(passage) DESC, position LIMIT 1),
   '/audio/ielts-dec-1.mp3', EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT),
  ('sec_ielts_listen_2', 'ielts-mockup', 2, 'Listening Part 2', 'Listening', 2,
   (SELECT passage FROM questions WHERE test_key = 'ielts-mockup' AND skill = 'Listening' AND part = 2 AND passage IS NOT NULL ORDER BY LENGTH(passage) DESC, position LIMIT 1),
   NULL, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT),
  ('sec_ielts_listen_3', 'ielts-mockup', 3, 'Listening Part 3', 'Listening', 3,
   (SELECT passage FROM questions WHERE test_key = 'ielts-mockup' AND skill = 'Listening' AND part = 3 AND passage IS NOT NULL ORDER BY LENGTH(passage) DESC, position LIMIT 1),
   NULL, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT),
  ('sec_ielts_listen_4', 'ielts-mockup', 4, 'Listening Part 4', 'Listening', 4,
   (SELECT passage FROM questions WHERE test_key = 'ielts-mockup' AND skill = 'Listening' AND part = 4 AND passage IS NOT NULL ORDER BY LENGTH(passage) DESC, position LIMIT 1),
   NULL, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT),
  ('sec_ielts_reading_1', 'ielts-mockup', 5, 'Reading Passage 1', 'Reading', 1,
   (SELECT passage FROM questions WHERE test_key = 'ielts-mockup' AND skill = 'Reading' AND part = 1 AND passage IS NOT NULL ORDER BY LENGTH(passage) DESC, position LIMIT 1),
   NULL, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT),
  ('sec_ielts_reading_2', 'ielts-mockup', 6, 'Reading Passage 2', 'Reading', 2,
   (SELECT passage FROM questions WHERE test_key = 'ielts-mockup' AND skill = 'Reading' AND part = 2 AND passage IS NOT NULL ORDER BY LENGTH(passage) DESC, position LIMIT 1),
   NULL, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT),
  ('sec_ielts_reading_3', 'ielts-mockup', 7, 'Reading Passage 3', 'Reading', 3,
   (SELECT passage FROM questions WHERE test_key = 'ielts-mockup' AND skill = 'Reading' AND part = 3 AND passage IS NOT NULL ORDER BY LENGTH(passage) DESC, position LIMIT 1),
   NULL, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT)
ON CONFLICT (id) DO NOTHING;

-- Every December question joins the section of its skill and part.
UPDATE questions q SET section_id = s.id
FROM question_sections s
WHERE q.test_key = 'ielts-mockup' AND s.test_key = 'ielts-mockup'
  AND q.skill = s.skill AND q.part = s.part;

-- The passages now live on the sections, so the per-question copies go.
UPDATE questions SET passage = NULL WHERE test_key = 'ielts-mockup';

-- Correction of a typo carried over from the old seed: the source HTML reads "the major criticism
-- of windmills - the need for back up on a calm day".
UPDATE question_sections
SET passage = replace(passage, 'windmills to the need', 'windmills: the need')
WHERE test_key = 'ielts-mockup' AND skill = 'Reading' AND part = 2;

-- The audio moved to Listening Part 1.
UPDATE tests SET audio_url = NULL WHERE key = 'ielts-mockup';

-- Existing attempts that already played the old test-level audio count as having played part 1.
INSERT INTO attempt_audio_plays (attempt_id, section_id, played_at)
SELECT id, 'sec_ielts_listen_1', audio_played_at
FROM attempts
WHERE test_key = 'ielts-mockup' AND audio_played_at IS NOT NULL
ON CONFLICT (attempt_id, section_id) DO NOTHING;

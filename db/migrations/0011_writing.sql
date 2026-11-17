-- IELTS Writing for the mockup: the two tasks from the December writing package, the long text
-- question type with its word minimum, the task image, and the AI scoring status on the attempt.
--
-- Writing is scored by Google AI Studio (Gemini), not from an answer key, so the writing band is
-- stored inside attempts.bands with the per-task criteria. The overall band becomes the mean of
-- Listening, Reading, and Writing until Speaking is added.

ALTER TABLE questions ADD COLUMN IF NOT EXISTS min_words INTEGER;
ALTER TABLE question_sections ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS writing_status TEXT;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS writing_error TEXT;

-- A long text answer has no letter key, so the answer check must allow it.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_answer_check;
ALTER TABLE questions ADD CONSTRAINT questions_answer_check
  CHECK (type IN ('text', 'longtext') OR answer IN ('A', 'B', 'C', 'D', 'E', 'F'));

-- The two December writing tasks, inside Paket Demo A.
INSERT INTO question_sections (id, test_key, package_id, position, title, skill, part, passage, audio_url, image_url, created_at, updated_at)
VALUES
  ('sec_ielts_writing_1', 'ielts-mockup', 'pkg_ielts_demo_a', 8, 'Writing Task 1', 'Writing', 1, NULL, NULL,
   '/images/ielts-writing-dalton.png', EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT),
  ('sec_ielts_writing_2', 'ielts-mockup', 'pkg_ielts_demo_a', 9, 'Writing Task 2', 'Writing', 2, NULL, NULL,
   NULL, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT)
ON CONFLICT (id) DO NOTHING;

INSERT INTO questions (id, test_key, package_id, position, skill, part, section_id, prompt, passage,
                       option_a, option_b, option_c, option_d, option_e, option_f, answer, seconds, status, type, accepted, min_words, created_at, updated_at)
VALUES
  (1101, 'ielts-mockup', 'pkg_ielts_demo_a', 81, 'Writing', 1, 'sec_ielts_writing_1',
   'The two maps illustrate the changes in the town of Dalton between the years 1815 and 2015. Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ESSAY', 1200, 'aktif', 'longtext', NULL, 150,
   EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT),
  (1102, 'ielts-mockup', 'pkg_ielts_demo_a', 82, 'Writing', 2, 'sec_ielts_writing_2',
   'Leaders of all kinds are often younger now than in the past. What are the reasons for this? Is it a positive or a negative development? Write at least 250 words.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ESSAY', 2400, 'aktif', 'longtext', NULL, 250,
   EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT)
ON CONFLICT (id) DO NOTHING;

-- The full mock now runs 155 minutes: 95 for Listening and Reading, 60 for Writing.
UPDATE tests SET total_seconds = 9300 WHERE key = 'ielts-mockup';

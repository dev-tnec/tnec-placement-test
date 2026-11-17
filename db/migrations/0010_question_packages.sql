-- Question packages for the IELTS mockup: the same test can hold several question sets, each with
-- its own questions and sections. A student gets one package, either chosen by the team when the
-- invite is made or picked at random from the active packages. The attempt stores the package so
-- grading and the dashboard stay tied to the set the student actually worked on.

CREATE TABLE IF NOT EXISTS question_packages (
  id         TEXT PRIMARY KEY,
  test_key   TEXT NOT NULL REFERENCES tests(key) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_question_packages_test ON question_packages (test_key, position);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS package_id TEXT REFERENCES question_packages(id) ON DELETE CASCADE;
ALTER TABLE question_sections ADD COLUMN IF NOT EXISTS package_id TEXT REFERENCES question_packages(id) ON DELETE CASCADE;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS package_id TEXT REFERENCES question_packages(id) ON DELETE SET NULL;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS package_id TEXT REFERENCES question_packages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_questions_package ON questions (package_id, position);
CREATE INDEX IF NOT EXISTS idx_sections_package ON question_sections (package_id, position);

-- The existing December bank becomes Paket Demo A.
INSERT INTO question_packages (id, test_key, name, position, is_active, created_at, updated_at)
VALUES ('pkg_ielts_demo_a', 'ielts-mockup', 'Paket Demo A', 1, 1, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT)
ON CONFLICT (id) DO NOTHING;

UPDATE questions SET package_id = 'pkg_ielts_demo_a'
WHERE test_key = 'ielts-mockup' AND package_id IS NULL;

UPDATE question_sections SET package_id = 'pkg_ielts_demo_a'
WHERE test_key = 'ielts-mockup' AND package_id IS NULL;

-- Existing attempts and invites belong to the only package that existed until now.
UPDATE attempts SET package_id = 'pkg_ielts_demo_a'
WHERE test_key = 'ielts-mockup' AND package_id IS NULL;

UPDATE invites SET package_id = 'pkg_ielts_demo_a'
WHERE test_key = 'ielts-mockup' AND package_id IS NULL;

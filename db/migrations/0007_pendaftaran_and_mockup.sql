-- Pendaftaran (registration into a program), the identity fields for real students, the Lead
-- model, and the ground work for the IELTS mockup test (docs/prd-pendaftaran-database-lead.md).
--
-- The critical part is the backfill: every student that already has a program and a period gets
-- one pendaftaran row, so switching Database Siswa to registered-only keeps everyone visible.

ALTER TABLE students ADD COLUMN IF NOT EXISTS tempat_lahir TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS tanggal_lahir TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS provinsi TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS kode_pos TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS jenjang_pendidikan TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS tahu_dari TEXT;

CREATE TABLE IF NOT EXISTS pendaftaran (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  program_id    TEXT NOT NULL REFERENCES programs(id),
  duration_id   TEXT REFERENCES program_durations(id) ON DELETE SET NULL,
  period_id     TEXT NOT NULL REFERENCES periods(id),
  class_id      TEXT REFERENCES classes(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'selesai', 'batal')),
  note          TEXT,
  registered_at BIGINT NOT NULL,
  registered_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_pendaftaran_student ON pendaftaran (student_id, registered_at);

-- The fourth test. Its settings and question bank come with the IELTS mockup PRD.
ALTER TABLE tests DROP CONSTRAINT tests_key_check;
ALTER TABLE tests ADD CONSTRAINT tests_key_check CHECK (key IN ('placement', 'pre', 'post', 'ielts-mockup'));
ALTER TABLE invites DROP CONSTRAINT invites_test_key_check;
ALTER TABLE invites ADD CONSTRAINT invites_test_key_check CHECK (test_key IN ('pre', 'post', 'ielts-mockup'));
ALTER TABLE invites ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS opens_at BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_code ON invites (code) WHERE code IS NOT NULL;

INSERT INTO tests (key, time_mode, total_seconds, per_default, is_open, max_violations, pass_score)
  VALUES ('ielts-mockup', 'total', 5700, 60, 0, 3, NULL)
  ON CONFLICT (key) DO NOTHING;

-- One registration row for every student that already sits in a program and a period today,
-- so the registered-only Database Siswa does not start empty after the deploy.
INSERT INTO pendaftaran (id, student_id, program_id, duration_id, period_id, class_id, status, note, registered_at, registered_by)
  SELECT 'pdf_' || s.id, s.id, s.program_id, s.duration_id, s.period_id, s.class_id, 'aktif',
         'Dipindahkan dari data lama saat migrasi.', s.updated_at, 'Migrasi'
    FROM students s
   WHERE s.program_id IS NOT NULL AND s.period_id IS NOT NULL
  ON CONFLICT (id) DO NOTHING;

-- Certificates issued to students.
--
-- A certificate type sets its HTML template, its number format, and when its numbering starts
-- again at 1. Numbers come from certificate_counters, one row per type and period ('2026' for a
-- yearly restart, '2026-11' for a monthly one, 'semua' for none), so a number is never handed out
-- twice. An issued certificate keeps its number, template, name as printed, and filled fields. It
-- is cancelled rather than deleted, so every number stays accounted for.

CREATE TABLE IF NOT EXISTS certificate_types (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL,
  template      TEXT NOT NULL,
  number_format TEXT NOT NULL,
  reset_period  TEXT NOT NULL DEFAULT 'tahun' CHECK (reset_period IN ('tahun', 'bulan', 'tidak')),
  signer_name   TEXT NOT NULL DEFAULT '',
  signer_role   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif')),
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL,
  updated_by    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS certificate_types_name_key ON certificate_types (lower(name));

CREATE TABLE IF NOT EXISTS certificate_counters (
  type_id     TEXT NOT NULL REFERENCES certificate_types(id) ON DELETE CASCADE,
  period      TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  PRIMARY KEY (type_id, period)
);

CREATE TABLE IF NOT EXISTS certificates (
  id             TEXT PRIMARY KEY,
  type_id        TEXT NOT NULL REFERENCES certificate_types(id),
  template       TEXT NOT NULL,
  number         TEXT NOT NULL,
  seq            INTEGER NOT NULL,
  period         TEXT NOT NULL,
  student_id     TEXT REFERENCES students(id) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  issued_at      BIGINT NOT NULL,
  details        TEXT NOT NULL DEFAULT '{}',
  created_at     BIGINT NOT NULL,
  created_by     TEXT,
  updated_at     BIGINT,
  updated_by     TEXT,
  revoked_at     BIGINT,
  revoked_by     TEXT,
  revoke_reason  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_number_key ON certificates (number);
CREATE INDEX IF NOT EXISTS certificates_student ON certificates (student_id);
CREATE INDEX IF NOT EXISTS certificates_type_period ON certificates (type_id, period);

-- The three certificates the owner listed on 16 November 2026, with the signers from their
-- templates. The number format is a starting point that the team changes in Sertifikat, Pengaturan.
INSERT INTO certificate_types (id, name, code, template, number_format, reset_period, signer_name, signer_role, status, created_at, updated_at, updated_by) VALUES
  ('ctp_completion', 'Certificate of Completion', 'COMP', 'completion', '{nomor}/{kode}/TNEC/{bulan_romawi}/{tahun}', 'tahun', 'Yosua Ignatius Manullang', 'Chief Education Officer', 'aktif', EXTRACT(EPOCH FROM now())::bigint, EXTRACT(EPOCH FROM now())::bigint, 'Sistem'),
  ('ctp_toefl', 'TOEFL Prediction', 'TOEFL', 'toefl', '{nomor}/{kode}/TNEC/{bulan_romawi}/{tahun}', 'tahun', 'Ufan Abdurrahman, S.Pd', 'Kepala Akademik', 'aktif', EXTRACT(EPOCH FROM now())::bigint, EXTRACT(EPOCH FROM now())::bigint, 'Sistem'),
  ('ctp_ielts', 'IELTS Prediction', 'IELTS', 'ielts', '{nomor}/{kode}/TNEC/{bulan_romawi}/{tahun}', 'tahun', 'Yosua Ignatius Manullang', 'Chief Education Officer', 'aktif', EXTRACT(EPOCH FROM now())::bigint, EXTRACT(EPOCH FROM now())::bigint, 'Sistem')
ON CONFLICT (id) DO NOTHING;

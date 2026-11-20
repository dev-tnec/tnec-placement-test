-- The auto-issued mockup certificate: one certificate per attempt. Manual certificates keep
-- attempt_id NULL and are untouched by the unique index.

ALTER TABLE certificates ADD COLUMN IF NOT EXISTS attempt_id TEXT REFERENCES attempts(id);

-- One certificate per attempt; partial unique index so manual rows without an attempt are free.
CREATE UNIQUE INDEX IF NOT EXISTS certificates_attempt_key ON certificates (attempt_id) WHERE attempt_id IS NOT NULL;

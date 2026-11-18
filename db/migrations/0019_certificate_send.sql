-- Sending a certificate to the student. The PDF is the one the team saves from the print
-- dialog: it is uploaded onto the certificate row, so both channels send the exact file that
-- was printed. The WhatsApp channel fetches the file from a public, unguessable link, so the
-- row keeps a random token for it, in the pattern of the result link.

ALTER TABLE certificates ADD COLUMN IF NOT EXISTS pdf BYTEA;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS pdf_name TEXT;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS pdf_bytes INTEGER;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS pdf_token TEXT;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS pdf_uploaded_at BIGINT;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS pdf_uploaded_by TEXT;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS email_sent_at BIGINT;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS email_sent_by TEXT;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS wa_sent_at BIGINT;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS wa_sent_by TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_pdf_token ON certificates (pdf_token) WHERE pdf_token IS NOT NULL;

-- The email column gains the unique partial index the whatsapp column already has, so the
-- check-then-act assertUnique in the dashboard can no longer lose a race between two concurrent
-- student creates (audit finding admin-data/duplicate-email-race). Existing duplicates, if any,
-- must be merged before the index builds; the migration fails loudly if any exist.

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email_unique ON students (email) WHERE email IS NOT NULL;

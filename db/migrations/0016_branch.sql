-- The branch where the student wants to learn (Pare, Jogja, Medan, Online), picked at the
-- placement contact step. Stored as a key from @tnec/core/branches, empty until the
-- student answers.

ALTER TABLE students ADD COLUMN IF NOT EXISTS branch TEXT;

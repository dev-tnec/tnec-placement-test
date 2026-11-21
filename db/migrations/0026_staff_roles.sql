-- Staff accounts with roles, per docs/prd-perbaikan-dasbor-dan-akun-staf.md point 4.
-- Roles: 'admin' (the owner, full access), 'staf' (operational admin), 'tutor' (own classes only).
-- The old 'pendidikan' role maps to 'staf'. Accounts are deactivated, never deleted, so activity
-- history keeps its author.

ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check CHECK (role IN ('admin', 'staf', 'tutor', 'pendidikan'));
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1;

-- The first admin stays the owner; everyone else with the old role becomes operational staff.
UPDATE admin_users SET role = 'staf' WHERE role = 'pendidikan';

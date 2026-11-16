// Creates a dashboard account, or resets its password, directly in the database.
//
//   npm run admin:create -- --email someone@example.com --name Aldo [--role admin|pendidikan]
//
// The password is asked in the terminal, or read from ADMIN_PASSWORD. The first account can also
// be created in the browser on the login page, so this is mostly for adding people and resets.
// A reset signs that account out everywhere.
import { createInterface } from "node:readline/promises";
import { loadEnvFile, buildEnv } from "@tnec/core/env";
import { hashPassword, randomToken } from "@tnec/core/crypto";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith("--") ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
const email = String(args.email || "").trim().toLowerCase();
const name = String(args.name || "").trim();
const role = args.role === "pendidikan" ? "pendidikan" : "admin";
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || name.length < 2) {
  console.error("Usage: npm run admin:create -- --email someone@example.com --name Name [--role admin|pendidikan]");
  process.exit(1);
}

let password = process.env.ADMIN_PASSWORD || "";
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  password = await rl.question("Kata sandi (minimal 12 karakter): ");
  rl.close();
}
if (password.length < 12) {
  console.error("Kata sandi minimal 12 karakter.");
  process.exit(1);
}

loadEnvFile();
const env = buildEnv();
try {
  const { hash, salt, iterations } = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `INSERT INTO admin_users (id, email, name, role, password_hash, password_salt, password_iter, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, password_salt = EXCLUDED.password_salt,
       password_iter = EXCLUDED.password_iter, name = EXCLUDED.name, role = EXCLUDED.role,
       failed_logins = 0, locked_until = NULL, active = 1
     RETURNING id`,
  ).bind(`adm_${randomToken(9)}`, email, name, role, hash, salt, iterations, now).first();
  await env.DB.prepare("DELETE FROM admin_sessions WHERE user_id = ?").bind(row.id).run();
  console.log(`Akun ${email} siap dipakai (${role}). Masuk di ${env.ADMIN_URL}/admin/login`);
} finally {
  await env.DB.close();
}

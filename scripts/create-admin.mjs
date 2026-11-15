// Creates an admin account for the dashboard by printing the SQL to run with wrangler.
// The password is hashed here with PBKDF2, so it never appears in the database or the shell history of D1.
//
//   node scripts/create-admin.mjs --email aldo@titiknolenglish.com --name Aldo --out admin.sql
//   npx wrangler d1 execute tnec-placement-test --remote --file=admin.sql
//   del admin.sql
//
// The password is read from the ADMIN_PASSWORD environment variable, or prompted when it is missing.
// Use --out instead of shell redirection: Windows PowerShell 5 writes redirected output as UTF-16,
// which wrangler cannot read as SQL.
import { createInterface } from "node:readline/promises";
import { writeFileSync } from "node:fs";
import { hashPassword, randomToken, PBKDF2_ITERATIONS } from "../src/crypto.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith("--") ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
const email = String(args.email || "").trim().toLowerCase();
const name = String(args.name || "").trim();
const role = String(args.role || "admin").trim();
const iterations = Number(args.iterations || PBKDF2_ITERATIONS);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !name) {
  console.error("Usage: node scripts/create-admin.mjs --email someone@example.com --name Name [--role admin|pendidikan] [--out admin.sql]");
  process.exit(1);
}

let password = process.env.ADMIN_PASSWORD || "";
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  password = await rl.question("Password (min 12 characters): ");
  rl.close();
}
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const { hash, salt } = await hashPassword(password, null, iterations);
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const id = `adm_${randomToken(9)}`;
const sql =
  `INSERT INTO admin_users (id, email, name, role, password_hash, password_salt, password_iter, created_at)\n` +
  `VALUES (${q(id)}, ${q(email)}, ${q(name)}, ${q(role)}, ${q(hash)}, ${q(salt)}, ${iterations}, CAST(strftime('%s','now') AS INTEGER))\n` +
  `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt,\n` +
  `  password_iter = excluded.password_iter, name = excluded.name, role = excluded.role, failed_logins = 0, locked_until = NULL, active = 1;\n`;
if (args.out) {
  writeFileSync(String(args.out), sql, "utf8");
  console.error(`Wrote ${args.out}. Run it with wrangler d1 execute, then delete the file.`);
} else {
  process.stdout.write(sql);
}

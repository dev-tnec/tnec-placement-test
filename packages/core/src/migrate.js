// Applies the SQL files in db/migrations that have not run yet, in name order, inside one
// transaction. A transaction-level advisory lock keeps two servers from migrating at once,
// and it works through Neon's connection pooler because it is released at COMMIT.

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./env.js";

const LOCK_KEY = 7310051;

export async function migrate(db, { dir = resolve(ROOT, "db/migrations"), log = console.log } = {}) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)");
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      try {
        await client.query(readFileSync(resolve(dir, file), "utf8"));
      } catch (error) {
        throw new Error(`Migrasi ${file} gagal: ${error.message}`);
      }
      await client.query("INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)", [file, Math.floor(Date.now() / 1000)]);
      applied.push(file);
    }
    await client.query("COMMIT");
    if (applied.length) log(`Database diperbarui: ${applied.join(", ")}`);
    return applied;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

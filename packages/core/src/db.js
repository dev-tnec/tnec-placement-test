// PostgreSQL (Neon) access with a small prepare/bind/first/all/run/batch API.
// Queries are written with `?` placeholders; they are numbered ($1, $2, ...) before they reach Postgres.
// `batch()` runs its statements in one transaction, so either all of them apply or none do.

import pg from "pg";

// COUNT(*) and SUM() return int8, and Unix seconds are stored as BIGINT. Every value the app
// uses fits safely in a JavaScript number, so int8 and numeric come back as numbers, not strings.
pg.types.setTypeParser(20, (value) => (value === null ? null : Number(value)));
pg.types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));

/** Turns `?` placeholders into `$1..$n`, leaving question marks inside quoted strings alone. */
export function numberPlaceholders(sql) {
  let out = "";
  let n = 0;
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "?") {
      n += 1;
      out += `$${n}`;
      continue;
    }
    out += ch;
  }
  return out;
}

const normalize = (value) => {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
};

const toResult = (r) => ({ success: true, results: r.rows, meta: { changes: r.rowCount ?? 0 } });

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...values) {
    return new Statement(this.db, this.sql, values.map(normalize));
  }

  async first(column) {
    const r = await this.db.query(this.sql, this.params);
    const row = r.rows[0] ?? null;
    if (!column) return row;
    return row ? row[column] ?? null : null;
  }

  async all() {
    return toResult(await this.db.query(this.sql, this.params));
  }

  async run() {
    return toResult(await this.db.query(this.sql, this.params));
  }
}

export class Database {
  constructor(connectionString, { max = 5 } = {}) {
    if (!connectionString) throw new Error("DATABASE_URL belum diisi.");
    const url = new URL(connectionString);
    const channelBinding = url.searchParams.get("channel_binding") === "require";
    url.searchParams.delete("channel_binding");
    // pg already treats these modes as verify-full; saying so explicitly keeps that behavior
    // after pg 9 and silences its warning. Neon certificates verify fine.
    if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode"))) url.searchParams.set("sslmode", "verify-full");
    this.pool = new pg.Pool({
      connectionString: url.toString(),
      max,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      enableChannelBinding: channelBinding,
    });
    // A dropped idle connection must not crash the process; the pool opens a new one on demand.
    this.pool.on("error", (error) => console.error("db pool error", error.message));
  }

  prepare(sql) {
    return new Statement(this, numberPlaceholders(sql));
  }

  query(text, params = []) {
    return this.pool.query(text, params);
  }

  async batch(statements) {
    if (!statements.length) return [];
    // Reads alone need no transaction, so they run side by side to save round trips.
    if (statements.every((s) => /^\s*select\b/i.test(s.sql))) {
      return Promise.all(statements.map(async (s) => toResult(await this.pool.query(s.sql, s.params))));
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const s of statements) results.push(toResult(await client.query(s.sql, s.params)));
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Runs work(tx) inside one transaction, for steps that need the result of an earlier step,
   * such as taking the next certificate number and then saving the certificate. tx has the same
   * prepare(sql).bind(...).first()/all()/run() API. A thrown error rolls everything back.
   */
  async transaction(work) {
    const client = await this.pool.connect();
    const tx = {
      query: (sql, params) => client.query(sql, params),
      prepare: (sql) => new Statement(tx, numberPlaceholders(sql)),
    };
    try {
      await client.query("BEGIN");
      const result = await work(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /** Runs raw SQL that may hold several statements, for migrations only. */
  async exec(sql) {
    return this.pool.query(sql);
  }

  close() {
    return this.pool.end();
  }
}

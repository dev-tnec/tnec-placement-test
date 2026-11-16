// Loads `.env` from the repository root and builds the shared `env` object both apps use.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "./db.js";
import { createMailer } from "./mailer.js";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Loads ENV_FILE when it is set (handy for a second database), otherwise `.env` at the repo root. */
export function loadEnvFile(file = process.env.ENV_FILE || resolve(ROOT, ".env")) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export function buildEnv(source = process.env) {
  const webPort = Number(source.WEB_PORT || 4000);
  const adminPort = Number(source.ADMIN_PORT || 4001);
  const trim = (v) => String(v || "").replace(/\/+$/, "");
  return {
    DB: new Database(source.DATABASE_URL, { max: Number(source.DB_POOL_MAX || 5) }),
    SEND_EMAIL: createMailer(source),
    RESULT_FROM_EMAIL: source.RESULT_FROM_EMAIL || "Titik Nol English Course <placement@index-now.dev>",
    ATTCOS_API_KEY: source.ATTCOS_API_KEY || "",
    ATTCOS_API_BASE: source.ATTCOS_API_BASE || "https://csq-api.onrender.com/api/v1",
    ATTCOS_CHANNEL_ID: source.ATTCOS_CHANNEL_ID || "",
    PUBLIC_WEB_URL: trim(source.PUBLIC_WEB_URL) || `http://localhost:${webPort}`,
    ADMIN_URL: trim(source.ADMIN_URL) || `http://localhost:${adminPort}`,
    TRUST_PROXY: source.TRUST_PROXY === "1" || source.TRUST_PROXY === "true",
    WEB_PORT: webPort,
    ADMIN_PORT: adminPort,
  };
}

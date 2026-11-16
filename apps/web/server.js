// Public test server: the test pages and the public API.
// Start alone with `npm run start -w @tnec/web`, or together with the admin app via `npm start`.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile, buildEnv } from "@tnec/core/env";
import { migrate } from "@tnec/core/migrate";
import { startServer, staticResponse, textResponse, BASE_HEADERS, STRICT_CSP } from "@tnec/core/node-server";
import { handlePublic } from "./src/api.js";

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "public");
const PAGE_HEADERS = { ...BASE_HEADERS, "Content-Security-Policy": STRICT_CSP };

export function createWebHandler() {
  return async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handlePublic(request, env, url);
    if (request.method !== "GET" && request.method !== "HEAD") return textResponse(405, "Metode tidak diizinkan.");
    const cacheControl = url.pathname === "/favicon.svg" ? "public, max-age=86400" : undefined;
    const file = await staticResponse(PUBLIC_DIR, url.pathname, { headers: PAGE_HEADERS, cacheControl });
    return file || textResponse(404, "Halaman tidak ditemukan.");
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  loadEnvFile();
  const env = buildEnv();
  await migrate(env.DB);
  startServer({ name: "Tes (web)", port: env.WEB_PORT, handler: createWebHandler(), env });
}

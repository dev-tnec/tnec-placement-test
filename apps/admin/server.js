// Admin dashboard server: the dashboard pages and the admin API under /api/admin.
// Start alone with `npm run start -w @tnec/admin`, or together with the web app via `npm start`.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile, buildEnv } from "@tnec/core/env";
import { migrate } from "@tnec/core/migrate";
import { startServer } from "@tnec/core/node-server";
import { randomToken } from "@tnec/core/crypto";
import { handleAdmin, serveAdminPage, adminCount, setSetupCode } from "./src/api.js";

export function createAdminHandler() {
  return async (request, env, ctx) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/admin/")) return handleAdmin(request, env, url, ctx);
    return serveAdminPage(request, env, url);
  };
}

/** Prints how to create the first account when the database has no admin yet. */
export async function announceSetup(env) {
  if ((await adminCount(env)) > 0) return;
  const code = randomToken(6).replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
  setSetupCode(code);
  console.log(`Belum ada akun admin. Buka ${env.ADMIN_URL}/admin/login untuk membuat akun pertama.`);
  console.log(`Dari komputer lain, isi kode setup ini di halaman tersebut: ${code}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  loadEnvFile();
  const env = buildEnv();
  await migrate(env.DB);
  startServer({ name: "Dasbor (admin)", port: env.ADMIN_PORT, handler: createAdminHandler(), env });
  await announceSetup(env);
}

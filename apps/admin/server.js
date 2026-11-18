// Admin dashboard server: the dashboard pages and the admin API under /api/admin.
// Start alone with `npm run start -w @tnec/admin`, or together with the web app via `npm start`.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile, buildEnv } from "@tnec/core/env";
import { migrate } from "@tnec/core/migrate";
import { startServer, closeServers } from "@tnec/core/node-server";
import { randomToken } from "@tnec/core/crypto";
import { runInBackground, deliverPending, drainDeliveries } from "@tnec/core/delivery";
import { startSpeakingWorker, stopSpeakingWorker } from "@tnec/core/speaking";
import { handleAdmin, serveAdminPage, adminCount, setSetupCode } from "./src/api.js";
import { startInviteQueueWorker, stopInviteQueueWorker } from "./src/invite-queue.js";

/** The mockup roster import sends a whole CSV in one JSON body. JSON escaping can nearly double
 *  the size (quotes and newlines expand to two characters each), so the transport cap is twice
 *  the 2 MB file cap from the PRD. The certificate PDF upload sends the raw file bytes. */
const IMPORT_ROUTES = /\/api\/admin\/mockup\/sessions\/[\w-]+\/import/;
const PDF_UPLOAD_ROUTES = /\/api\/admin\/certificates\/[\w-]+\/pdf$/;

export function createAdminHandler() {
  const handler = async (request, env, ctx) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/admin/")) return handleAdmin(request, env, url, ctx);
    return serveAdminPage(request, env, url);
  };
  handler.bodyLimit = (method, pathname) => {
    if (method === "POST" && IMPORT_ROUTES.test(pathname)) return 4 * 1024 * 1024;
    if (method === "POST" && PDF_UPLOAD_ROUTES.test(pathname)) return 6 * 1024 * 1024;
    return null;
  };
  return handler;
}

/** Prints how to create the first account when the database has no admin yet. */
export async function announceSetup(env) {
  if ((await adminCount(env)) > 0) return;
  // A host such as Render restarts the app on every deploy. ADMIN_SETUP_CODE keeps the code the
  // same across restarts; without it, every start makes a new random code.
  const fixed = env.ADMIN_SETUP_CODE || "";
  if (fixed && fixed.length < 8) console.warn("ADMIN_SETUP_CODE kurang dari 8 karakter, jadi dipakai kode acak.");
  const code = fixed.length >= 8 ? fixed : randomToken(6).replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
  setSetupCode(code);
  console.log(`Belum ada akun admin. Buka ${env.ADMIN_URL}/admin/login untuk membuat akun pertama.`);
  console.log(`Dari komputer lain, isi kode setup ini di halaman tersebut: ${code}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  loadEnvFile();
  const env = buildEnv();
  await migrate(env.DB);
  // A host such as Render tells a single app its port through PORT.
  const server = startServer({ name: "Dasbor (admin)", port: Number(process.env.PORT) || env.ADMIN_PORT, handler: createAdminHandler(), env, expectedHost: new URL(env.ADMIN_URL).host });
  await announceSetup(env);
  // The dashboard sends results too (after a speaking grade by hand) and can score a recording
  // again, so it finishes what an earlier run left and lets running work end before it stops.
  runInBackground(() => deliverPending(env));
  startSpeakingWorker(env);
  startInviteQueueWorker(env);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    stopSpeakingWorker();
    await stopInviteQueueWorker();
    await closeServers([server]);
    await drainDeliveries();
    await env.DB.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

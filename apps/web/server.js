// Public test server: the test pages and the public API.
// Start alone with `npm run start -w @tnec/web`, or together with the admin app via `npm start`.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile, buildEnv } from "@tnec/core/env";
import { migrate } from "@tnec/core/migrate";
import { startServer, closeServers, staticResponse, textResponse, BASE_HEADERS, STRICT_CSP } from "@tnec/core/node-server";
import { runInBackground, deliverPending, drainDeliveries } from "@tnec/core/delivery";
import { startSpeakingWorker, stopSpeakingWorker } from "@tnec/core/speaking";
import { startMockupSpeakingWorker, stopMockupSpeakingWorker } from "@tnec/core/speaking-mockup-worker";
import { handlePublic, SPEAKING_ROUTE, SPEAKING_BODY_LIMIT } from "./src/api.js";

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "public");
// The speaking section records from this page's own origin. Camera and location stay off.
const PAGE_HEADERS = { ...BASE_HEADERS, "Permissions-Policy": "camera=(), microphone=(self), geolocation=()", "Content-Security-Policy": STRICT_CSP };

export function createWebHandler() {
  const handler = async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handlePublic(request, env, url);
    if (request.method !== "GET" && request.method !== "HEAD") return textResponse(405, "Metode tidak diizinkan.");
    const cacheControl = url.pathname === "/favicon.png" ? "public, max-age=86400" : undefined;
    // The React report is one page: /hasil and /hasil/ serve the same built index.html.
    const pathname = url.pathname === "/hasil" ? "/hasil/" : url.pathname;
    const file = await staticResponse(PUBLIC_DIR, pathname, { headers: PAGE_HEADERS, cacheControl });
    return file || textResponse(404, "Halaman tidak ditemukan.");
  };
  // Only the speaking upload may send more than the usual 256 KB.
  handler.bodyLimit = (method, pathname) => (method === "POST" && SPEAKING_ROUTE.test(pathname) ? SPEAKING_BODY_LIMIT : null);
  return handler;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  loadEnvFile();
  const env = buildEnv();
  await migrate(env.DB);
  // A host such as Render tells a single app its port through PORT.
  const server = startServer({ name: "Tes (web)", port: Number(process.env.PORT) || env.WEB_PORT, handler: createWebHandler(), env });
  // Send any result that an earlier run left waiting, for example after a crash, and pick up
  // speaking recordings that were not scored yet.
  runInBackground(() => deliverPending(env));
  startSpeakingWorker(env);
startMockupSpeakingWorker(env);

  // On a deploy Render sends SIGTERM and waits 30 seconds, so let running requests, scoring
  // calls, and result sends finish first.
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    stopSpeakingWorker();
  stopMockupSpeakingWorker();
    await closeServers([server]);
    await drainDeliveries();
    await env.DB.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

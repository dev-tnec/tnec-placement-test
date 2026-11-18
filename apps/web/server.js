// Public test server: the test pages and the public API.
// Start alone with `npm run start -w @tnec/web`, or together with the admin app via `npm start`.
// The two React apps have no HTML files. Their document shells are built here from the hashed
// file names that the Node esbuild build writes into runner-manifest.json and report-manifest.json.

import { readFileSync } from "node:fs";
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
// Read at request time: scripts/start.mjs imports this module before its build step runs, so a
// manifest read at import time would name the previous build's deleted files.
let runnerManifest = null;
let reportManifest = null;
const runner = () => (runnerManifest ??= JSON.parse(readFileSync(resolve(PUBLIC_DIR, "runner-manifest.json"), "utf8")));
const report = () => (reportManifest ??= JSON.parse(readFileSync(resolve(PUBLIC_DIR, "hasil/report-manifest.json"), "utf8")));

const htmlResponse = (body) => new Response(body, {
  status: 200,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...PAGE_HEADERS },
});
const styleTag = (href) => (href ? `<link rel="stylesheet" crossorigin href="${href}">` : "");
const scriptTag = (src) => `<script type="module" crossorigin src="${src}"></script>`;

function runnerShell() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Tes penempatan online Titik Nol English Course, lengkap dengan level, skor, dan rekomendasi program.">
  <meta name="theme-color" content="#0A1B38">
  <title>Tes Penempatan Online - Titik Nol English Course</title>
  <link rel="icon" href="/favicon.png" type="image/png">
  ${styleTag(runner().css)}
  ${scriptTag(runner().js)}
</head>
<body data-screen="intro">
  <div id="root"></div>
  <noscript><p class="noscript">Aktifkan JavaScript di browser kamu untuk mengerjakan tes ini.</p></noscript>
</body>
</html>`;
}

function reportShell() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <link rel="icon" href="/favicon.png" type="image/png">
  <title>Hasil Tes, Titik Nol English Course</title>
  ${styleTag(report().css)}
  ${scriptTag(report().js)}
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
}

export function createWebHandler() {
  const handler = async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handlePublic(request, env, url);
    if (request.method !== "GET" && request.method !== "HEAD") return textResponse(405, "Metode tidak diizinkan.");
    if (url.pathname === "/" || url.pathname === "/index.html") return htmlResponse(runnerShell());
    if (url.pathname === "/hasil" || url.pathname === "/hasil/" || url.pathname === "/hasil/index.html") return htmlResponse(reportShell());
    const cacheControl = url.pathname === "/favicon.png" ? "public, max-age=86400" : undefined;
    const file = await staticResponse(PUBLIC_DIR, url.pathname, { headers: PAGE_HEADERS, cacheControl });
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

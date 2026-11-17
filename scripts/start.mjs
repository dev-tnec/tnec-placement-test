// One command for everything: `npm start`.
// Loads .env, builds the React dashboard client, brings the database schema up to date, then runs
// the test site and the dashboard. The build step guarantees that what runs locally is always
// built from the current client source.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnvFile, buildEnv } from "@tnec/core/env";
import { migrate } from "@tnec/core/migrate";
import { startServer, closeServers } from "@tnec/core/node-server";
import { runInBackground, deliverPending, drainDeliveries } from "@tnec/core/delivery";
import { startSpeakingWorker, stopSpeakingWorker } from "@tnec/core/speaking";
import { createWebHandler } from "../apps/web/server.js";
import { createAdminHandler, announceSetup } from "../apps/admin/server.js";

const clientBuild = fileURLToPath(new URL("../apps/admin/client/build.mjs", import.meta.url));
const built = spawnSync(process.execPath, [clientBuild], { stdio: "inherit" });
if (built.status) process.exit(built.status);

loadEnvFile();
const env = buildEnv();
await migrate(env.DB);

const servers = [
  startServer({ name: "Tes (web)", port: env.WEB_PORT, handler: createWebHandler(), env }),
  startServer({ name: "Dasbor (admin)", port: env.ADMIN_PORT, handler: createAdminHandler(), env }),
];
await announceSetup(env);
// Send any result that an earlier run left waiting, and score recordings that are still waiting.
runInBackground(() => deliverPending(env));
startSpeakingWorker(env);

// Let running requests, scoring calls, and result sends finish before the window closes.
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  stopSpeakingWorker();
  await closeServers(servers);
  await drainDeliveries();
  await env.DB.close().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// One command for everything: `npm start`.
// Loads .env, brings the database schema up to date, then runs the test site and the dashboard.

import { loadEnvFile, buildEnv } from "@tnec/core/env";
import { migrate } from "@tnec/core/migrate";
import { startServer, closeServers } from "@tnec/core/node-server";
import { runInBackground, deliverPending, drainDeliveries } from "@tnec/core/delivery";
import { startSpeakingWorker, stopSpeakingWorker } from "@tnec/core/speaking";
import { createWebHandler } from "../apps/web/server.js";
import { createAdminHandler, announceSetup } from "../apps/admin/server.js";

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

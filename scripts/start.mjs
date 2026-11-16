// One command for everything: `npm start`.
// Loads .env, brings the database schema up to date, then runs the test site and the dashboard.

import { loadEnvFile, buildEnv } from "@tnec/core/env";
import { migrate } from "@tnec/core/migrate";
import { startServer } from "@tnec/core/node-server";
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

function stop() {
  for (const s of servers) s.close();
  env.DB.close().finally(() => process.exit(0));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// `npm run db:migrate` applies pending files in db/migrations. The servers also do this on start.
import { loadEnvFile, buildEnv } from "@tnec/core/env";
import { migrate } from "@tnec/core/migrate";

loadEnvFile();
const env = buildEnv();
try {
  const applied = await migrate(env.DB);
  if (!applied.length) console.log("Database sudah terbaru.");
} finally {
  await env.DB.close();
}

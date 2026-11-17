// Runs the Vite build directly with node, so it works without npm.cmd on PowerShell.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, "../../../node_modules/vite/bin/vite.js"),
  resolve(here, "../../node_modules/vite/bin/vite.js"),
  resolve(here, "node_modules/vite/bin/vite.js"),
];
const viteBin = candidates.find(existsSync);
if (!viteBin) {
  console.error("Vite belum terpasang. Jalankan npm install dulu.");
  process.exit(1);
}
const result = spawnSync(process.execPath, [viteBin, "build"], { cwd: here, stdio: "inherit" });
process.exit(result.status ?? 1);

// Runs the Vite build directly with node, so it works without npm.cmd on PowerShell.
// The output shares ../public with the logos, videos, favicon, and the result report, so the old
// student bundle is removed by hand instead of letting Vite empty the whole folder.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "../public");
const assetsDir = resolve(publicDir, "assets");
if (existsSync(assetsDir)) {
  for (const name of readdirSync(assetsDir)) {
    if (/^index-.*\.js$/.test(name)) rmSync(resolve(assetsDir, name), { force: true });
  }
}
rmSync(resolve(publicDir, "index.html"), { force: true });

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

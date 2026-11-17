// Builds the React result report with Node and esbuild, then writes the manifest the web server
// reads to build the /hasil shell. No Vite and no HTML entry file.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReact } from "../../../scripts/build-react.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = await buildReact({
  entries: { report: "apps/web/result/src/main.jsx" },
  outdir: "apps/web/public/hasil/assets",
  urlBase: "/hasil/assets/",
});
writeFileSync(resolve(here, "../public/hasil/report-manifest.json"), JSON.stringify(manifest.report, null, 2));

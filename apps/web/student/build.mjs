// Builds the React test runner with Node and esbuild, then writes the manifest the web server
// reads to build the document shell. No Vite and no HTML entry file.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReact } from "../../../scripts/build-react.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = await buildReact({
  entries: { app: "apps/web/student/src/main.jsx" },
  outdir: "apps/web/public/assets",
  urlBase: "/assets/",
});
writeFileSync(resolve(here, "../public/runner-manifest.json"), JSON.stringify(manifest.app, null, 2));

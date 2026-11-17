// Builds the React dashboard with Node and esbuild, then writes the manifest the admin server
// reads to build the /admin and /admin/login shells. No Vite and no HTML entry file.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReact } from "../../../scripts/build-react.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = await buildReact({
  entries: {
    app: "apps/admin/client/src/main.jsx",
    login: "apps/admin/client/src/login-main.jsx",
  },
  outdir: "apps/admin/public/admin/assets",
  urlBase: "/admin/assets/",
});
writeFileSync(resolve(here, "../public/admin/admin-manifest.json"), JSON.stringify(manifest, null, 2));

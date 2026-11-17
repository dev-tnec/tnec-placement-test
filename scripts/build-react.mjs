// Node build helper for the React apps. esbuild bundles the JSX entry and its CSS, and this
// helper returns the hashed file names so the Node server can build the document shell.
// There is no Vite and no HTML entry file.
import { build } from "esbuild";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function buildReact({ entries, outdir, urlBase }) {
  const outAbs = resolve(ROOT, outdir);
  if (existsSync(outAbs)) {
    for (const name of readdirSync(outAbs)) {
      if (/^(index|app|login|report|main)-.*\.(js|css)$/.test(name)) rmSync(resolve(outAbs, name), { force: true });
    }
  }
  const entryPoints = Object.fromEntries(Object.entries(entries).map(([name, file]) => [name, resolve(ROOT, file)]));
  const result = await build({
    entryPoints,
    outdir: outAbs,
    absWorkingDir: ROOT,
    bundle: true,
    format: "esm",
    splitting: false,
    minify: true,
    target: ["es2020"],
    jsx: "automatic",
    loader: { ".js": "jsx", ".jsx": "jsx" },
    entryNames: "[name]-[hash]",
    assetNames: "[name]-[hash]",
    metafile: true,
    logLevel: "info",
  });
  const manifest = {};
  for (const [file, info] of Object.entries(result.metafile.outputs)) {
    if (!info.entryPoint) continue;
    const name = Object.keys(entryPoints).find((key) => entryPoints[key] === resolve(ROOT, info.entryPoint));
    if (!name) continue;
    manifest[name] = {
      js: `${urlBase}${basename(file)}`,
      css: info.cssBundle ? `${urlBase}${basename(info.cssBundle)}` : null,
    };
  }
  return manifest;
}

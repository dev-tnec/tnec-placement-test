// Temporary migration check: finds names that lib.js exports and that a client file uses without
// importing. Run with: node apps/admin/client/check-imports.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "src");

const libSource = readFileSync(join(src, "lib.js"), "utf8");
const exported = [...libSource.matchAll(/^export (?:const|let|function|async function) (\w+)/gm)].map((m) => m[1]);
const storeSource = readFileSync(join(src, "store.js"), "utf8");
const storeExports = [...storeSource.matchAll(/^export (?:const|let|function|async function) (\w+)/gm)].map((m) => m[1]);
const known = [...new Set([...exported, ...storeExports])];

const files = readdirSync(src, { recursive: true }).filter((f) => /\.(js|jsx)$/.test(f) && !f.includes("lib.js") && !f.includes("store.js"));
let bad = 0;
for (const rel of files) {
  const source = readFileSync(join(src, rel), "utf8");
  const imported = new Set([...source.matchAll(/import\s*\{([^}]*)\}/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop().trim())).filter(Boolean));
  for (const name of known) {
    const re = new RegExp(`(?<![.\\w$"'\`])${name}\\b`, "g");
    if (re.test(source) && !imported.has(name)) {
      console.log(`${rel}: uses ${name} without importing it`);
      bad += 1;
    }
  }
}
console.log(bad ? `${bad} problem(s)` : "imports ok");

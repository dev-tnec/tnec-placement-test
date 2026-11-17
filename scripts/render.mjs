// Render API helper for this project.
// It reads the same Render API key that the OpenCode Render MCP uses, so a session can list,
// deploy, and manage environment variables even when the MCP tools are not listed by tool search.
// The key is never printed. Set RENDER_API_KEY to override the key from the OpenCode config.
//
//   npm run render -- status [web|admin|both]
//   npm run render -- deploy [web|admin|both]
//   npm run render -- env list [web|admin|both] [--show-values]
//   npm run render -- env set [web|admin|both] KEY=VALUE ...
//   npm run render -- env delete [web|admin|both] KEY ...

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://api.render.com/v1";
const SERVICES = {
  web: { id: "srv-dbt6h3tg1s2s738toue0", name: "tnec-placement-test" },
  admin: { id: "srv-dbt6h3tg1s2s738touf0", name: "tnec-placement-admin" },
};

function authHeader() {
  const fromEnv = String(process.env.RENDER_API_KEY || "").trim();
  if (fromEnv) return fromEnv.startsWith("Bearer ") ? fromEnv : `Bearer ${fromEnv}`;
  const configPath = join(homedir(), ".config", "opencode", "opencode.json");
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const header = config.mcp?.servers?.render?.headers?.Authorization;
    if (header) return header;
  } catch {
    /* fall through to the error below */
  }
  throw new Error("Render API key not found. Set RENDER_API_KEY, or add mcp.servers.render.headers.Authorization to the OpenCode config.");
}

const headers = { Authorization: authHeader(), Accept: "application/json", "Content-Type": "application/json" };

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers, ...options });
  if (response.status === 204) return null;
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep the raw text for the error */ }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return data;
}

function targets(arg) {
  if (!arg || arg === "both" || arg === "all") return Object.entries(SERVICES);
  if (!SERVICES[arg]) throw new Error(`Unknown service "${arg}". Use web, admin, or both.`);
  return [[arg, SERVICES[arg]]];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function deploy(targetArg) {
  const running = [];
  for (const [, service] of targets(targetArg)) {
    const data = await api(`/services/${service.id}/deploys`, { method: "POST", body: JSON.stringify({ clearCache: "do_not_clear" }) });
    const deployRow = data.deploy || data;
    console.log(`${service.name}: triggered ${deployRow.id} (${deployRow.status})`);
    running.push({ service, deployId: deployRow.id });
  }
  const terminal = new Set(["live", "build_failed", "update_failed", "canceled", "deactivated"]);
  const deadline = Date.now() + 10 * 60 * 1000;
  let pending = running;
  while (pending.length && Date.now() < deadline) {
    await sleep(10000);
    const next = [];
    for (const item of pending) {
      const data = await api(`/services/${item.service.id}/deploys/${item.deployId}`);
      const row = data.deploy || data;
      console.log(`${item.service.name}: ${row.status}${row.commit?.id ? ` (${row.commit.id.slice(0, 7)})` : ""}`);
      if (terminal.has(row.status)) item.final = row.status;
      else next.push(item);
    }
    pending = next;
  }
  console.log("\nFinal:");
  for (const item of running) console.log(`${item.service.name}: ${item.final || "still building"} (${item.deployId})`);
  if (running.some((item) => item.final && item.final !== "live")) process.exitCode = 1;
}

async function status(targetArg) {
  for (const [, service] of targets(targetArg)) {
    const data = await api(`/services/${service.id}/deploys?limit=5`);
    const rows = (Array.isArray(data) ? data : []).map((row) => row.deploy || row);
    console.log(`\n${service.name} (${service.id})`);
    for (const row of rows) {
      console.log(JSON.stringify({
        id: row.id,
        status: row.status,
        commit: row.commit?.id?.slice(0, 7) || null,
        message: row.commit?.message?.split("\n")[0] || null,
        createdAt: row.createdAt,
        finishedAt: row.finishedAt,
      }));
    }
  }
}

async function envList(targetArg, showValues) {
  for (const [, service] of targets(targetArg)) {
    const data = await api(`/services/${service.id}/env-vars?limit=100`);
    const rows = (Array.isArray(data) ? data : []).map((row) => row.envVar || row);
    console.log(`\n${service.name} (${service.id})`);
    for (const row of rows.sort((a, b) => a.key.localeCompare(b.key))) {
      const value = showValues
        ? row.value
        : row.value ? `*** (${row.value.length} chars)` : "";
      console.log(`${row.key}=${value}`);
    }
  }
}

async function envSet(targetArg, pairs) {
  if (!pairs.length) throw new Error("Pass at least one KEY=VALUE pair.");
  for (const [, service] of targets(targetArg)) {
    for (const pair of pairs) {
      const index = pair.indexOf("=");
      if (index < 1) throw new Error(`Invalid pair "${pair}". Use KEY=VALUE.`);
      const key = pair.slice(0, index);
      const value = pair.slice(index + 1);
      await api(`/services/${service.id}/env-vars/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value }) });
      console.log(`${service.name}: set ${key}`);
    }
  }
  console.log("Run `npm run render -- deploy both` to apply the environment changes.");
}

async function envDelete(targetArg, keys) {
  if (!keys.length) throw new Error("Pass at least one key.");
  for (const [, service] of targets(targetArg)) {
    for (const key of keys) {
      await api(`/services/${service.id}/env-vars/${encodeURIComponent(key)}`, { method: "DELETE" });
      console.log(`${service.name}: deleted ${key}`);
    }
  }
  console.log("Run `npm run render -- deploy both` to apply the environment changes.");
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "deploy") await deploy(args[0]);
  else if (command === "status") await status(args[0]);
  else if (command === "env" && args[0] === "list") {
    const rest = args.slice(1).filter((value) => value !== "--show-values");
    await envList(rest[0], args.includes("--show-values"));
  } else if (command === "env" && args[0] === "set") await envSet(args[1], args.slice(2));
  else if (command === "env" && args[0] === "delete") await envDelete(args[1], args.slice(2));
  else {
    console.log("Usage:");
    console.log("  npm run render -- status [web|admin|both]");
    console.log("  npm run render -- deploy [web|admin|both]");
    console.log("  npm run render -- env list [web|admin|both] [--show-values]");
    console.log("  npm run render -- env set [web|admin|both] KEY=VALUE ...");
    console.log("  npm run render -- env delete [web|admin|both] KEY ...");
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

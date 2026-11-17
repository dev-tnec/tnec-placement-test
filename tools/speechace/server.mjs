// Local Speechace test. Serves one page and proxies the scoring call so the key
// stays in .env instead of the browser. Run: node tools/speechace/server.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const envFile = process.env.ENV_FILE || resolve(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const KEY = String(process.env.SPEECHACE_KEY || "").trim();
const PORT = Number(process.env.SPEECHACE_TEST_PORT || 8788);
const MAX_BYTES = 12 * 1024 * 1024;
const API = "https://api2.speechace.com/api/scoring/speech/v9/json";

if (!KEY) {
  console.error("SPEECHACE_KEY belum ada di .env");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    try {
      const page = await readFile(resolve(here, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(page);
    } catch (err) {
      send(res, 500, { error: "index.html tidak terbaca." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/score") {
    await score(req, res, url);
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Tidak ada.");
});

async function score(req, res, url) {
  const type = String(req.headers["content-type"] || "");
  if (!type.startsWith("audio/")) return send(res, 415, { error: "Kirim berkas audio." });

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      req.destroy();
      return send(res, 413, { error: "Audio lebih dari 12 MB." });
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks);
  if (!body.length) return send(res, 400, { error: "Audio kosong." });

  const prompt = url.searchParams.get("prompt") || "";
  const ext = type.includes("webm") ? "webm" : type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "wav";

  const form = new FormData();
  form.append("user_audio_file", new Blob([body], { type }), "answer." + ext);
  form.append("include_ielts_feedback", "1");
  if (prompt) form.append("relevance_context", prompt);

  const target = `${API}?key=${KEY}&dialect=en-us&user_id=local-test`;

  try {
    const upstream = await fetch(target, { method: "POST", body: form, signal: AbortSignal.timeout(90000) });
    const text = await upstream.text();
    res.writeHead(upstream.status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(text);
  } catch (err) {
    send(res, 502, { error: "Tidak bisa menghubungi Speechace.", detail: String(err?.message || err) });
  }
}

function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Speechace test: http://127.0.0.1:${PORT}`);
});

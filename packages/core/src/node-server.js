// Runs a fetch-style handler (request in, Response out) on Node's http server,
// and serves static files from a folder. No framework, no runtime dependency.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const MAX_BODY_BYTES = 256 * 1024;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export const STRICT_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

/** Returns a Response for a file under `root`, or null when there is no such file. */
export async function staticResponse(root, pathname, { headers = {}, cacheControl } = {}) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  if (rel.includes("\0")) return null;
  const base = resolve(root);
  const file = resolve(base, `.${rel.endsWith("/") ? `${rel}index.html` : rel}`);
  if (!file.startsWith(base + sep)) return null;
  let info;
  try { info = await stat(file); } catch { return null; }
  if (!info.isFile()) return null;
  const body = await readFile(file);
  const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": cacheControl ?? (type.startsWith("text/html") ? "no-store" : "public, max-age=300"),
      ...headers,
    },
  });
}

export function textResponse(status, text, headers = {}) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...BASE_HEADERS, ...headers } });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Data terlalu besar.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function toRequest(req, trustProxy) {
  const first = (v) => String(v || "").split(",")[0].trim();
  const proto = (trustProxy && first(req.headers["x-forwarded-proto"])) || (req.socket.encrypted ? "https" : "http");
  const host = (trustProxy && first(req.headers["x-forwarded-host"])) || req.headers.host || "localhost";
  const url = new URL(req.url || "/", `${proto}://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, String(value));
  }
  const body = req.method === "GET" || req.method === "HEAD" ? Buffer.alloc(0) : await readBody(req);
  return {
    method: req.method,
    url: url.href,
    headers,
    async text() { return body.toString("utf8"); },
    async json() { return JSON.parse(body.toString("utf8") || "{}"); },
  };
}

async function sendResponse(res, response, method) {
  const headers = {};
  response.headers.forEach((value, key) => { if (key !== "set-cookie") headers[key] = value; });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies;
  const empty = method === "HEAD" || response.status === 204 || response.status === 304;
  const body = empty ? null : Buffer.from(await response.arrayBuffer());
  if (body) headers["content-length"] = String(body.length);
  res.writeHead(response.status, headers);
  res.end(body ?? undefined);
}

export function startServer({ name, port, host = "0.0.0.0", handler, env }) {
  const server = http.createServer(async (req, res) => {
    try {
      const request = await toRequest(req, env.TRUST_PROXY);
      const response = await handler(request, env, { remoteAddress: req.socket.remoteAddress || "" });
      await sendResponse(res, response, req.method);
    } catch (error) {
      const status = error.status === 413 ? 413 : 500;
      if (status === 500) console.error(`${name}:`, error);
      if (!res.headersSent) res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: status === 413 ? "Data terlalu besar." : "Terjadi kesalahan pada server." }));
    }
  });
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  // A second start.cmd window would hit a busy port; explain that instead of printing a stack trace.
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`${name}: port ${port} sedang dipakai, kemungkinan aplikasi ini sudah berjalan di jendela lain. Pakai jendela itu, atau tutup dulu lalu jalankan lagi.`);
    } else {
      console.error(`${name}:`, error);
    }
    process.exit(1);
  });
  server.listen(port, host, () => console.log(`${name}: http://localhost:${port}`));
  return server;
}

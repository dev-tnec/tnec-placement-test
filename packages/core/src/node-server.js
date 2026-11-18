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

export const STRICT_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://titiknolenglish.com; font-src 'self'; media-src 'self' blob:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

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

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Data terlalu besar.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function toRequest(req, trustProxy, bodyLimit, expectedHost) {
  const first = (v) => String(v || "").split(",")[0].trim();
  let proto = (trustProxy && first(req.headers["x-forwarded-proto"])) || (req.socket.encrypted ? "https" : "http");
  let host = (trustProxy && first(req.headers["x-forwarded-host"])) || req.headers.host || "localhost";
  // A forwarded host the edge did not overwrite (Render overwrites the proto but not the host)
  // must never steer origin decisions: when an expected host is configured, anything else
  // falls back to it, and the proto is pinned https so a spoofed downgrade cannot strip the
  // Secure cookie flag. Local development keeps its own host and http.
  if (expectedHost && host !== expectedHost) {
    host = expectedHost;
    if (!/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(expectedHost)) proto = "https";
  }
  const url = new URL(req.url || "/", `${proto}://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, String(value));
  }
  // A handler can allow a bigger body on one route (the speaking upload) through handler.bodyLimit.
  const limit = Number(bodyLimit?.(req.method, url.pathname)) || MAX_BODY_BYTES;
  const body = req.method === "GET" || req.method === "HEAD" ? Buffer.alloc(0) : await readBody(req, limit);
  return {
    method: req.method,
    url: url.href,
    headers,
    async text() { return body.toString("utf8"); },
    async json() { return JSON.parse(body.toString("utf8") || "{}"); },
    async bytes() { return body; },
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

/** Stops taking new connections and waits up to timeoutMs for running requests to finish. */
export function closeServers(servers, timeoutMs = 5000) {
  const closed = Promise.all(servers.map((server) => new Promise((resolve) => server.close(() => resolve()))));
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  return Promise.race([closed, timeout]).finally(() => clearTimeout(timer));
}

export function startServer({ name, port, host = "0.0.0.0", handler, env, expectedHost }) {
  const server = http.createServer(async (req, res) => {
    try {
      const request = await toRequest(req, env.TRUST_PROXY, handler.bodyLimit, expectedHost);
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

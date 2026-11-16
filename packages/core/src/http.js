// Shared HTTP helpers for the public API and the admin API.

export const MAX_BODY_BYTES = 64 * 1024;

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...extraHeaders,
    },
  });
}

export async function readJson(request, limit = MAX_BODY_BYTES) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) throw new HttpError(413, "Data terlalu besar.");
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, "Data terlalu besar.");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "Format data tidak valid.");
  }
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function normalizeWhatsapp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  let normalized = null;
  if (digits.startsWith("62")) normalized = digits;
  else if (digits.startsWith("0")) normalized = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) normalized = `62${digits}`;
  if (!normalized || normalized.length < 10 || normalized.length > 15) return null;
  return normalized;
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function text(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function multiline(value, max) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

export function int(value, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

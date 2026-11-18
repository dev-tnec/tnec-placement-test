// Password hashing, token generation, and hashing with Web Crypto.
// Uses Web Crypto, which Node provides, so the servers, the admin script, and the tests share it.

const encoder = new TextEncoder();
// OWASP's 2023 guidance for PBKDF2-HMAC-SHA256. Each account stores its own count, so older hashes still verify.
export const PBKDF2_ITERATIONS = 600000;

export function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64Url(buffer) {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(bytes = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(value) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function hashPassword(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const salt = saltHex || toHex(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(salt), iterations },
    key,
    256,
  );
  return { hash: toHex(bits), salt, iterations };
}

// A fixed PBKDF2 hash for the login's unknown-email path: verifyPassword accepts any object
// with the three password columns, so both 401 branches cost one full KDF and response time
// cannot reveal which staff emails have accounts. The hash and salt are public constants; their
// only job is to cost the same 600,000 iterations as a real verify.
export const DUMMY_USER = { password_hash: "b109f3bbbc244eb8244d17d777886f0f1a7158cd9c96357f4f7235566c6e98b7bd6b9f0f0a4c4c1fc7b3a1e2f0a2e0a80e1d6c9b8a7f6e5d4c3b2a19087654321fedcba", password_salt: "d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9", password_iter: 600000 };

export async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, user.password_salt, user.password_iter);
  return timingSafeEqual(hash, user.password_hash);
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

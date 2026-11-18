// Shared helpers for the React test runner. The answer key never reaches this file.

export const PER_MODE_CLIENT_GRACE = 100;
export const FOCUS_TYPES = new Set(["fullscreen_exit", "tab_hidden", "window_blur"]);
export const KEY_LETTERS = new Set(["A", "B", "C", "D", "E", "F"]);
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const REC_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"];
export const CHECK_SECONDS = { min: 3, max: 10 };

export const recordingSupported = () => Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);

export function spanText(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} detik`;
  return s ? `${m} menit ${s} detik` : `${m} menit`;
}

export function formatTime(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

export function normalizeWhatsapp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  let normalized = null;
  if (digits.startsWith("62")) normalized = digits;
  else if (digits.startsWith("0")) normalized = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) normalized = `62${digits}`;
  if (!normalized || normalized.length < 10 || normalized.length > 15) return null;
  return `+${normalized}`;
}

export async function api(path, { method = "GET", body, headers } = {}) {
  const isRaw = body instanceof Blob;
  const response = await fetch(path, {
    method,
    headers: headers ?? (body && !isRaw ? { "Content-Type": "application/json" } : undefined),
    body: isRaw ? body : body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let data = null;
  try { data = await response.json(); } catch { /* non-JSON response */ }
  if (!response.ok) {
    const error = new Error(data?.error || "Permintaan gagal diproses. Silakan coba lagi.");
    error.status = response.status;
    error.code = data?.code || null;
    error.test = data?.test || null;
    throw error;
  }
  return data;
}

export function lockEscape() {
  if (!navigator.keyboard?.lock) return;
  navigator.keyboard.lock(["Escape"]).catch(() => {});
}

export function unlockEscape() {
  if (navigator.keyboard?.unlock) navigator.keyboard.unlock();
}

export async function requestFullscreen() {
  const element = document.documentElement;
  if (!element.requestFullscreen || document.fullscreenElement) return Boolean(document.fullscreenElement);
  lockEscape();
  try {
    await Promise.race([
      element.requestFullscreen({ navigationUI: "hide" }),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    return Boolean(document.fullscreenElement);
  } catch {
    return false;
  }
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* the browser may refuse outside a user gesture, which is fine */
  } finally {
    unlockEscape();
  }
}

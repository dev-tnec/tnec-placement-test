// The dashboard bootstrap cache: a reload paints the last payload immediately instead of the
// loading line, while store.reload() fetches a fresh copy in the background.
// The cache lives in sessionStorage, so it belongs to one tab and disappears when the tab closes.
// Clear it on login, logout, and a 401. Bump the key when the bootstrap shape changes.

export const BOOTSTRAP_CACHE = "tnec-bootstrap-v2";
const TTL = 12 * 60 * 60 * 1000;

export function readBootstrapCache() {
  try {
    const raw = sessionStorage.getItem(BOOTSTRAP_CACHE);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || !saved.data || !saved.at || Date.now() - saved.at > TTL) {
      sessionStorage.removeItem(BOOTSTRAP_CACHE);
      return null;
    }
    return saved.data;
  } catch {
    return null;
  }
}

export function writeBootstrapCache(data) {
  try {
    sessionStorage.setItem(BOOTSTRAP_CACHE, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // A full or blocked storage only costs the instant paint, never the dashboard.
  }
}

export function clearBootstrapCache() {
  try {
    sessionStorage.removeItem(BOOTSTRAP_CACHE);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}

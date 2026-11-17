// The single data store: the bootstrap payload, the ui state, the API wrapper, and one global
// version number that every component subscribes to. A change reloads the data and notifies,
// which re-renders the tree, exactly like the old loadData() followed by render().

import { useSyncExternalStore } from "react";
import { toast } from "./dom.js";

export const HOME = "/admin/";
export const LOGIN = "/admin/login";

export const PAGE_SIZE = 15;
export const KEYS = ["A", "B", "C", "D"];
export const TEST_KEYS = ["placement", "pre", "post"];

export let NOW = Date.now();
export let ME = "";
export let dataReady = false;

export const db = {
  tests: {}, levels: [], programs: [], tutors: [], tutorIds: new Map(), periods: [], classes: [],
  students: [], attempts: [], enrolledAt: [], pendaftaran: [], publicUrl: location.origin,
  whatsapp: { configured: false },
  certs: { templates: [], types: [], issued: [] },
  speaking: { configured: false, waiting: 0, review: 0, failed: 0, manual: 0, graded30: 0, avgSeconds: null, failedLastHour: 0 },
  speakingCefr: [], jenjang: [], tahuDari: [],
};

/* One version number for the whole app: data reloads, route changes, and ui changes all bump it. */
let version = 0;
const listeners = new Set();
export function notify() { version += 1; listeners.forEach((l) => l()); }
function subscribe(l) { listeners.add(l); return () => listeners.delete(l); }
export function useVersion() { useSyncExternalStore(subscribe, () => version); }

/* API calls. A 401 means the session ended, so the browser goes back to the login page. */
export async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (response.status === 401) { window.location.assign(LOGIN); throw new Error("Sesi berakhir."); }
  if (!response.ok) { const err = new Error(data?.error || "Permintaan gagal diproses. Coba lagi."); err.field = data?.field; err.status = response.status; throw err; }
  return data;
}

export const sessionEnded = (error) => error && error.message === "Sesi berakhir.";

/* Runs a change, reloads the data, and lets the tree redraw. Errors become a toast. */
export async function mutate(work, success) {
  try {
    const result = await work();
    await reload();
    if (success) toast(typeof success === "function" ? success(result) : success);
    return result;
  } catch (error) {
    if (!sessionEnded(error)) toast(error.message);
    return null;
  }
}

export async function reload() {
  const data = await api("/api/admin/bootstrap");
  NOW = data.now || Date.now();
  ME = data.me.name;
  db.me = data.me;
  db.publicUrl = data.publicUrl;
  db.whatsapp = data.whatsapp;
  db.levels = data.levels;
  db.tests = Object.fromEntries(TEST_KEYS.map((k) => [k, { key: k, settings: data.tests[k].settings, questions: data.tests[k].questions, stats: data.tests[k].stats }]));
  db.students = data.students;
  db.attempts = data.attempts;
  db.enrolledAt = data.enrolledAt;
  db.programs = data.catalog.programs;
  db.tutors = data.catalog.tutors.map((t) => t.name);
  db.tutorIds = new Map(data.catalog.tutors.map((t) => [t.name, t.id]));
  db.periods = data.catalog.periods;
  db.classes = data.catalog.classes;
  db.certs = data.certificates;
  db.pendaftaran = data.pendaftaran || [];
  db.speaking = data.speaking || db.speaking;
  db.speakingCefr = data.speakingCefr || [];
  db.jenjang = data.jenjang || [];
  db.tahuDari = data.tahuDari || [];
  for (const entry of studentDetails.values()) entry.stale = true;
  for (const entry of attemptDetails.values()) entry.stale = true;
  dataReady = true;
  notify();
}

/* ===================== Hash router ===================== */
export function route() {
  const raw = location.hash.replace(/^#\/?/, "") || "ringkasan";
  const [path, query] = raw.split("?");
  return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(query || "") };
}
export function useRoute() {
  useVersion();
  return route();
}

/* ===================== ui state (survives navigation, like the old app) ===================== */
const attemptFilter = (days) => ({ q: "", status: "all", speaking: "all", level: "", days, period: "", program: "", result: "", page: 1, selected: new Set() });
export const ui = {
  ringkasanPeriode: "",
  test: "placement",
  pendaftaran: { q: "", studentId: null },
  students: { q: "", stage: "all", level: "", program: "", period: "", tutor: "", sort: "activity", dir: "desc", page: 1, selected: new Set() },
  questions: { placement: { q: "", skill: "all" }, pre: { q: "", skill: "all" }, post: { q: "", skill: "all" } },
  attempts: { placement: attemptFilter("30"), pre: attemptFilter("all"), post: attemptFilter("all") },
  classes: { period: "", program: "" },
  certs: { q: "", type: "", status: "all", page: 1 },
  answers: "all",
  notesOpen: false,
  lastPath: null,
};
export const T = () => db.tests[ui.test];

/* ===================== Detail caches ===================== */
// Detail caches keep the last loaded copy while a fresh copy loads, so pages do not flicker after a change.
const studentDetails = new Map();
const attemptDetails = new Map();

function loadDetail(cache, key, url, shape, isCurrent) {
  const entry = cache.get(key);
  if (entry && !entry.stale) return entry.data;
  const slot = entry || { data: null, stale: true, loading: false };
  if (!slot.loading) {
    slot.loading = true;
    cache.set(key, slot);
    api(url).then((raw) => {
      cache.set(key, { data: shape(raw), stale: false, loading: false });
      if (isCurrent()) notify();
    }).catch((error) => {
      slot.loading = false;
      if (!sessionEnded(error)) toast(error.message);
    });
  }
  return slot.data;
}

/* Student activities load when a record page opens. Null means the first load is still running. */
export function studentFeed(id) {
  const d = loadDetail(studentDetails, id, `/api/admin/students/${encodeURIComponent(id)}`, (raw) => raw,
    () => route().parts[0] === "siswa" && route().parts[1] === id);
  return d || null;
}

/* Answers, the speaking recording, and the system log load when a submission page opens. */
export function withDetail(a) {
  if (!a) return a;
  const d = loadDetail(attemptDetails, a.id, `/api/admin/attempts/${a.id}`,
    (raw) => ({ answers: raw.answers, log: raw.log, device: raw.device, country: raw.country, consent: raw.consent, speaking: raw.speaking || null }),
    () => route().parts[3] === a.id);
  return d ? { ...a, ...d, loading: false } : { ...a, answers: null, log: null, consent: "", loading: true, speaking: a.speaking || null };
}

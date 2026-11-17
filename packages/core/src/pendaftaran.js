// Pure rules for pendaftaran and leads (docs/prd-pendaftaran-database-lead.md). No I/O here, so
// tests/smoke.mjs can check them directly and both apps can share the definitions.

import { nowSeconds } from "./http.js";

// The follow-up stages stay on the lead side. A real student is anyone with a registration.
export const LEAD_STAGES = ["baru", "dihubungi", "konsultasi", "lepas"];
export const PENDAFTARAN_STATUS = ["aktif", "selesai", "batal"];
export const JENJANG_PENDIDIKAN = ["SD", "SMP", "SMA/SMK", "D3", "S1", "S2", "S3"];
export const TAHU_DARI = ["Instagram", "TikTok", "Google", "Teman/Alumni", "Datang langsung", "Lainnya"];
export const LEAD_COLD_DAYS = 90;

/**
 * The latest registration of a student, oldest to newest input, ignoring cancelled rows.
 * The columns on the student row mirror this row: they show the program the student is in now.
 */
export function latestPendaftaran(rows) {
  let latest = null;
  for (const row of rows || []) {
    if (row.status === "batal") continue;
    if (!latest || row.registered_at >= latest.registered_at) latest = row;
  }
  return latest;
}

/** How many times the student actually joined a program. Cancelled rows still count. */
export function daftarCount(rows) {
  return (rows || []).filter((row) => row.status !== "batal").length;
}

/**
 * A lead is a placement test contact that never joined a program. A lead goes cold when nothing
 * happened on its profile for 90 days; cold leads leave the follow-up queue but stay searchable.
 */
export function isColdLead(student, lastActivityAt, now = nowSeconds()) {
  if (!student || student.stage === "lepas") return false;
  return lastActivityAt > 0 && lastActivityAt < now - LEAD_COLD_DAYS * 86400;
}

/** Tanggal lahir is stored as an ISO date string; anything else is refused at the boundaries. */
export function normalizeBirthDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return null;
  if (date.getTime() > Date.now()) return null;
  return raw;
}

/** One of the fixed option lists, or free text when the list does not apply. */
export function normalizeOption(value, list) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return list.includes(raw) ? raw : null;
}

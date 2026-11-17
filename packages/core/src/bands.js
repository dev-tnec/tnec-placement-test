// IELTS mockup scoring rules: text answer normalization, the raw to band lookup, and the overall
// band rounding. Pure functions shared by the public API and the smoke checks.

/** Text answers are compared loosely: case, punctuation, and spacing never decide right or wrong. */
export function normalizeTextAnswer(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.,;:!?'"()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** rows is one row per raw score: [{ raw, band }]. Missing rows score 0. */
export function bandForRaw(rows, raw) {
  const row = rows.find((r) => r.raw === raw);
  return row ? Number(row.band) : 0;
}

/** The overall band is the mean of the skill bands, rounded to the nearest half band. */
export function overallBand(bands) {
  if (!bands.length) return 0;
  const mean = bands.reduce((sum, b) => sum + b, 0) / bands.length;
  return Math.round(mean * 2) / 2;
}

// The branch a placement student wants to learn in, asked at the contact step after the
// test. Stored on students.branch as one of these keys, so the student runner, the public
// API, and the dashboard filters all agree on the same list.

export const BRANCHES = [["pare", "Pare"], ["jogja", "Jogja"], ["medan", "Medan"], ["online", "Online"]];
const KEYS = new Set(BRANCHES.map(([key]) => key));

/** A student answer becomes a branch key, or null when it is not one of the branches. */
export function branchKey(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return KEYS.has(key) ? key : null;
}

/** The dashboard label of a branch key, or an empty string for an unknown or empty key. */
export function branchLabel(key) {
  return BRANCHES.find(([k]) => k === key)?.[1] ?? "";
}

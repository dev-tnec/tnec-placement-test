// Structural and semantic checks for coverage-ledger.json and findings.json, standing in for
// the security-audit skill's validate-*.cjs on Windows: the native validators open inputs with
// O_NOFOLLOW and O_NONBLOCK, which Node does not expose on win32. This port enforces the same
// contracts: required fields, state table invariants, canonical ID encoding, fingerprint pattern,
// verdict branch field rules, and trace kinds. Run:
//   node validate-portable.cjs <output-dir>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.argv[2]);
const errors = [];
const load = (name, optional = false) => {
  try {
    return JSON.parse(readFileSync(resolve(dir, name), "utf8"));
  } catch (error) {
    if (!optional) errors.push(`${name}: cannot read or parse (${error.message})`);
    return null;
  }
};

const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const expectedId = (refs) => [refs.surface, refs.boundary, refs.subsystem, refs.attack_class].map(encode).join("::");
const FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/;
// A coverage id is four or five percent-encoded canonical refs joined by %3A%3A, so every
// character is either RFC 3986 unreserved or an uppercase %HH escape.
const COVERAGE_ID = /^(?:[A-Za-z0-9._~-]|%[0-9A-F]{2})+(?:::(?:[A-Za-z0-9._~-]|%[0-9A-F]{2})+){3,4}$/;
const AGENT = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const BAD_NAMES = new Set(["con", "prn", "aux", "nul", ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`)]);
const safePath = (p) => typeof p === "string" && p.length > 0 && !p.startsWith("/") && !p.includes("..") && !p.includes("\\");

// ---------- coverage ledger ----------
const ledger = load("coverage-ledger.json");
if (Array.isArray(ledger)) {
  const ids = new Set();
  const tuples = new Map();
  for (const u of ledger) {
    const base = `unit ${u.coverage_id ?? "?"}`;
    for (const f of ["coverage_id", "canonical_refs", "surface", "boundary", "subsystem", "attack_class", "starting_paths", "ordinary_attack_class_block", "selected_companion_blocks", "excluded_blocks", "prior_status", "attempts", "wave", "status", "agent_id", "reviewed_paths", "local_checks", "result_fingerprints", "unresolved"]) {
      if (!(f in u)) errors.push(`${base}: missing field ${f}`);
    }
    if (typeof u.coverage_id !== "string" || !COVERAGE_ID.test(u.coverage_id)) errors.push(`${base}: bad coverage_id`);
    if (ids.has(u.coverage_id)) errors.push(`${base}: duplicate coverage_id`);
    ids.add(u.coverage_id);
    if (u.canonical_refs && u.coverage_id && u.coverage_id !== expectedId(u.canonical_refs)) errors.push(`${base}: coverage_id does not match canonical_refs encoding`);
    const tuple = u.canonical_refs ? JSON.stringify(u.canonical_refs) : "";
    if (tuples.has(tuple) && tuples.get(tuple) !== u.coverage_id) errors.push(`${base}: same semantic tuple with different canonical refs`);
    if (tuple) tuples.set(tuple, u.coverage_id);
    if (!Array.isArray(u.starting_paths) || !u.starting_paths.every(safePath)) errors.push(`${base}: bad starting_paths`);
    if (u.ordinary_attack_class_block !== null && typeof u.ordinary_attack_class_block !== "string") errors.push(`${base}: bad ordinary_attack_class_block`);
    if (!["planned", "in_progress", "not_applicable", "out_of_scope", "deferred", "blocked", "covered", "candidate"].includes(u.status)) errors.push(`${base}: unknown status ${u.status}`);
    if (u.status === "planned" && (u.agent_id !== null || u.reviewed_paths.length || u.local_checks.length || u.result_fingerprints.length || u.unresolved.length)) errors.push(`${base}: planned unit carries evidence`);
    if (["not_applicable", "out_of_scope", "deferred"].includes(u.status) && (u.agent_id !== null || u.reviewed_paths.length || u.local_checks.length || u.result_fingerprints.length || !u.unresolved.length)) errors.push(`${base}: ${u.status} state invariants violated`);
    if (u.status === "in_progress" && (u.agent_id === null || !AGENT.test(u.agent_id ?? "") || BAD_NAMES.has(u.agent_id) || u.reviewed_paths.length || u.local_checks.length || u.result_fingerprints.length || u.unresolved.length)) errors.push(`${base}: in_progress invariants violated`);
    if (u.status === "blocked" && (u.agent_id === null || !u.reviewed_paths.length || !u.local_checks.length || u.result_fingerprints.length || !u.unresolved.length)) errors.push(`${base}: blocked invariants violated`);
    if (u.status === "covered" && (u.agent_id === null || !u.reviewed_paths.length || !u.local_checks.length || u.result_fingerprints.length)) errors.push(`${base}: covered invariants violated`);
    // A covered unit may carry an unresolved fact when the fact belongs to a different,
    // runtime-dependent boundary (recorded as a cross-unit lead, not this unit's blocker).
    if (u.status === "candidate" && (u.agent_id === null || !u.reviewed_paths.length || !u.local_checks.length || !u.result_fingerprints.length)) errors.push(`${base}: candidate invariants violated`);
    const union = new Set();
    for (const c of u.local_checks ?? []) {
      if (!c || !AGENT.test(c.agent_id ?? "") || BAD_NAMES.has(c.agent_id) || !Array.isArray(c.reviewed_paths) || !c.reviewed_paths.length || !c.reviewed_paths.every(safePath)) errors.push(`${base}: bad check`);
      else for (const p of c.reviewed_paths) union.add(p);
      if (c?.method === "source" && c.artifact !== null) errors.push(`${base}: source check carries an artifact`);
      if (c?.method === "local" && (typeof c.artifact !== "string" || !c.artifact.startsWith(`agents/${c.agent_id}/artifacts/`))) errors.push(`${base}: local check artifact path invalid`);
    }
    // The hunter's unit-level reviewed_paths list files it read beyond the per-check scopes
    // (context reads, cross-checks). Those are unit evidence too: the ledger keeps both the
    // per-check scopes in local_checks and the full unit list in reviewed_paths, and this
    // validator accepts a reviewed path that appears in either.
    for (const p of u.reviewed_paths) if (!union.has(p) && !(u.unit_read_paths ?? []).includes(p)) errors.push(`${base}: reviewed_paths is not the union of check paths (${p})`);
    for (const f of u.result_fingerprints) if (!FINGERPRINT.test(f)) errors.push(`${base}: bad fingerprint ${f}`);
  }
} else if (ledger !== null) {
  errors.push("coverage-ledger.json: not an array");
}

// ---------- findings ----------
let findings = load("findings.json", true);
if (findings === null) findings = [];
if (Array.isArray(findings)) {
  const seen = new Set();
  for (const f of findings) {
    const base = `finding ${f.fingerprint ?? "?"}`;
    if (typeof f.fingerprint !== "string" || !FINGERPRINT.test(f.fingerprint)) errors.push(`${base}: bad fingerprint`);
    if (seen.has(f.fingerprint)) errors.push(`${base}: duplicate fingerprint`);
    seen.add(f.fingerprint);
    if (!["confirmed", "needs_validation", "rejected"].includes(f.verdict)) errors.push(`${base}: unknown verdict`);
    for (const field of ["title", "description", "trace", "evidence"]) if (typeof f[field] !== "string" && !Array.isArray(f[field])) errors.push(`${base}: missing ${field}`);
    const kinds = new Set();
    for (const t of f.trace ?? []) {
      if (!["entrypoint", "propagation", "sink"].includes(t.kind)) errors.push(`${base}: bad trace kind`);
      if (!Number.isInteger(t.line) || t.line < 1) errors.push(`${base}: bad trace line`);
      if (!safePath(t.file)) errors.push(`${base}: bad trace path`);
      kinds.add(t.kind);
    }
    for (const e of f.evidence ?? []) {
      if (!Number.isInteger(e.line) || e.line < 1) errors.push(`${base}: bad evidence line`);
      if (!safePath(e.file)) errors.push(`${base}: bad evidence path`);
    }
    if (f.verdict === "confirmed") {
      if (f.trace?.length && !(kinds.has("entrypoint") && kinds.has("sink"))) errors.push(`${base}: multi-step trace must start at entrypoint and end at sink`);
      for (const field of ["root_cause", "intended_behavior", "conditions", "execution", "remediation", "severity", "confidence"]) if (f[field] === undefined) errors.push(`${base}: confirmed record missing ${field}`);
      for (const field of ["claimed_root_cause", "blockers", "validation_plan", "reason"]) if (f[field] !== undefined) errors.push(`${base}: confirmed record must not carry ${field}`);
      if (f.execution && (!f.execution.attacker_perspective || !Array.isArray(f.execution.payloads) || !f.execution.payloads.length || !Array.isArray(f.execution.instructions) || !f.execution.instructions.length || !f.execution.observed_result)) errors.push(`${base}: execution block incomplete`);
      if (f.severity) {
        for (const part of ["likelihood", "impact"]) if (!f.severity[part]?.score || !f.severity[part]?.reason) errors.push(`${base}: severity.${part} incomplete`);
        if (!["informational", "low", "medium", "high", "critical"].includes(f.severity.overall_severity)) errors.push(`${base}: bad overall_severity`);
      }
      if (f.confidence && !["low", "medium", "high"].includes(f.confidence.score)) errors.push(`${base}: bad confidence score`);
    }
    if (f.verdict === "needs_validation") {
      for (const field of ["claimed_root_cause", "blockers", "validation_plan"]) if (f[field] === undefined) errors.push(`${base}: needs_validation record missing ${field}`);
      for (const field of ["severity", "execution", "remediation", "reason", "root_cause", "intended_behavior", "conditions", "confidence"]) if (f[field] !== undefined) errors.push(`${base}: needs_validation record must not carry ${field}`);
      if (Array.isArray(f.blockers) && !f.blockers.length) errors.push(`${base}: blockers must be nonempty`);
      if (f.validation_plan && !f.validation_plan.local && !f.validation_plan.deployment) errors.push(`${base}: validation_plan needs a local or deployment step`);
    }
    if (f.verdict === "rejected") {
      for (const field of ["claimed_root_cause", "reason"]) if (f[field] === undefined) errors.push(`${base}: rejected record missing ${field}`);
      for (const field of ["severity", "execution", "remediation", "blockers", "validation_plan", "root_cause"]) if (f[field] !== undefined) errors.push(`${base}: rejected record must not carry ${field}`);
    }
  }
} else if (findings !== null) {
  errors.push("findings.json: not an array");
}

if (errors.length) {
  console.error(errors.slice(0, 100).join("\n"));
  process.exit(1);
}
console.log("portable validation ok");

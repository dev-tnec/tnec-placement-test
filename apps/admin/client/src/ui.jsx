// Shared JSX pieces: icons, statuses, cells, the page head, chips, pagers, and selects.
// They render the same class names as the old template strings, so admin.css keeps working.

import { Fragment } from "react";
import { db, NOW, PAGE_SIZE } from "./store.js";
import {
  ATTEMPT_STATUS, SPEAKING_STATUS, attemptTotal, classById, classLabel, durationOf, fmtDate,
  initials, levelByKey, latestGraded, levelLabel, nilaiOf, periodById, periodsSorted, programById,
  siswaChipOf, stageOf,
} from "./lib.js";

export function Icon({ name, cls = "" }) {
  return <svg className={`icon ${cls}`} aria-hidden="true" focusable="false"><use href={`#i-${name}`} /></svg>;
}

export function Dot({ kind }) {
  return kind === "done" ? <Icon name="check-circle" cls="status__icon" /> : <span className={`dot dot--${kind}`} aria-hidden="true" />;
}

export function Status({ label, kind, muted }) {
  return <span className={muted ? "status status--muted" : "status"}><Dot kind={kind} />{label}</span>;
}

export const StageStatus = ({ k }) => { const s = stageOf(k); return <Status label={s.label} kind={s.dot} muted={k === "lepas"} />; };
export const AttemptStatus = ({ a }) => { const s = ATTEMPT_STATUS[a.status]; return <Status label={s.label} kind={s.dot} muted={s.muted} />; };
export const PassStatus = ({ a }) => (a.passed === null ? <span className="muted">Tidak ada</span> : a.passed ? <Status label="Lulus" kind="done" /> : <Status label="Belum lulus" kind="red" />);
export const PendaftaranStatus = ({ p }) => {
  const map = { aktif: ["Aktif", "done"], selesai: ["Selesai", "ring"], batal: ["Batal", "ban"] };
  const [label, dot] = map[p.status] || map.aktif;
  return <Status label={label} kind={dot} muted={p.status === "batal"} />;
};
export const SiswaStatus = ({ s }) => {
  if (s.stage === "lepas") return <StageStatus k="lepas" />;
  const map = { aktif: ["Aktif", "done"], selesai: ["Selesai", "ring"] };
  const [label, dot] = map[siswaChipOf(s)] || map.aktif;
  return <Status label={label} kind={dot} />;
};
export const SpeakingStatus = ({ sp }) => {
  const s = SPEAKING_STATUS[sp.status] || SPEAKING_STATUS.pending;
  return <Status label={s.label} kind={s.dot} muted={s.muted || (sp.status === "graded" && sp.needsReview)} />;
};
/* One line for the submission list. Plain words, so it stays readable next to the email status. */
export const SpeakingRowLabel = ({ a }) => {
  const sp = a.speaking;
  if (sp.status === "failed") return <span className="is-wrong">Speaking perlu dinilai</span>;
  if (sp.status === "pending" || sp.status === "grading") return <span className="muted">Speaking menunggu dinilai</span>;
  if (sp.status === "skipped") return <span className="muted">Speaking dilewati</span>;
  const cefr = sp.cefr ? <>Speaking {sp.cefr}</> : "Speaking selesai";
  if (sp.needsReview) return <>{cefr} <span className="is-wrong">perlu dicek</span></>;
  if (sp.status === "manual") return <>{cefr} (dinilai manual)</>;
  return cefr;
};

export const Person = ({ name, text }) => <span className="person"><span className="avatar avatar--xs" aria-hidden="true">{initials(name)}</span>{text}</span>;
export function ClassCell({ s }) {
  const c = classById(s.classId);
  return c ? <Person name={c.tutor} text={classLabel(c)} /> : <span className="muted nowrap">Belum ada kelas</span>;
}
export function ProgramCell({ s }) {
  const p = programById(s.programId), d = durationOf(s);
  return p ? <>{p.name}<span className="cell-sub">{d ? d.label : "Durasi belum dipilih"}</span></> : <span className="muted">Belum dipilih</span>;
}
export function PeriodCell({ s }) {
  const p = periodById(s.periodId);
  return p ? <span className="nowrap">{fmtDate(p.start)}</span> : <span className="muted nowrap">Belum ditentukan</span>;
}

export function LevelCell({ s }) {
  const a = latestGraded(s.id);
  if (!a) return <span className="muted nowrap">Belum tes</span>;
  const l = levelByKey(a.levelKey);
  return <>{l ? l.label : a.levelKey}<span className="cell-sub tnum">{a.score} dari {attemptTotal(a)}</span></>;
}

export function ResultCell({ a }) {
  if (a.score === null) return <span className="muted">Tidak dinilai</span>;
  if (a.test === "placement") return <><strong className="tnum">{a.score}</strong><span className="muted tnum"> / {attemptTotal(a)}</span></>;
  return <><strong className="tnum">{nilaiOf(a)}</strong><span className="muted"> nilai</span></>;
}
export function OutcomeCell({ a }) {
  if (a.test === "placement") { const l = a.levelKey ? levelByKey(a.levelKey) : null; return l ? l.label : <span className="muted">Tidak ada</span>; }
  if (a.test === "post") return <PassStatus a={a} />;
  return a.score === null ? <span className="muted">Tidak ada</span> : <span className="muted">Nilai awal</span>;
}

export function PageHead({ crumbs = null, title, desc = "", actions = "", lead = "" }) {
  return <>
    {crumbs ? <nav className="crumbs" aria-label="Lokasi halaman">{crumbs.map((c, i) => (i < crumbs.length - 1
      ? <Fragment key={i}><a href={c[1]}>{c[0]}</a><Icon name="chevron-right" cls="icon--sm" /></Fragment>
      : <span key={i} aria-current="page">{c[0]}</span>))}</nav> : null}
    <header className="page-head">
      <div className={lead ? "record" : "page-head__text"}>{lead}<div className="page-head__text"><h1 className="page-title" tabIndex="-1">{title}</h1>{desc}</div></div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  </>;
}

export function Empty({ title, desc, action = null }) {
  return <div className="empty"><p className="empty__title">{title}</p><p className="empty__desc">{desc}</p>{action}</div>;
}

export function Pager({ page, total, noun, onPage }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0, to = Math.min(total, page * PAGE_SIZE);
  return <div className="panel__foot">
    <span>Menampilkan {from} sampai {to} dari {total} {noun}</span>
    <span className="row-actions">
      <span>Halaman {page} dari {pages}</span>
      <button className="btn btn--quiet btn--sm" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</button>
      <button className="btn btn--quiet btn--sm" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Berikutnya</button>
    </span>
  </div>;
}

export function Chip({ value, label, n, pressed, onClick }) {
  return <button className="chip" type="button" aria-pressed={pressed} onClick={() => onClick(value)}>{label}{n == null ? null : ` ${n}`}</button>;
}

export function SortHeader({ k, label, cur, dir, cls = "", onSort }) {
  const active = cur === k;
  return <th scope="col" className={cls} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
    <button className="sort" type="button" onClick={() => onSort(k)}>{label}<Icon name={active ? (dir === "asc" ? "chevron-up" : "chevron-down") : "sort"} /></button>
  </th>;
}

export const OptList = ({ list }) => <>{list.map(([v, label]) => <option key={String(v)} value={v}>{label}</option>)}</>;

export const periodOptions = (first) => [["", first], ...periodsSorted().map((p) => [p.id, `${fmtDate(p.start)}${p.start > NOW ? ", akan datang" : ""}`])];
export const programOptions = (first, onlyActive) => [["", first], ...db.programs.filter((p) => !onlyActive || p.status === "aktif").map((p) => [p.id, p.name])];

export function Notice({ icon = "alert", neutral = false, children }) {
  return <div className={neutral ? "notice notice--neutral" : "notice"} role="note"><Icon name={icon} /><div className="notice__body">{children}</div></div>;
}

export const Stat = ({ label, value, note }) => (
  <div className="stat"><p className="stat__label">{label}</p><p className="stat__value">{value}</p><p className="stat__note">{note}</p></div>
);

/* A whole table row navigates, unless the click landed on a control inside it. */
export const rowClick = (href) => (e) => { if (!e.target.closest("a, button, input, select, textarea, label")) location.hash = href; };
export const rowRun = (fn) => (e) => { if (!e.target.closest("a, button, input, select, textarea, label")) fn(); };

// Shared JSX pieces: icons, statuses, cells, the page head, chips, pagers, and selects.
// They render the same class names as the old template strings, so admin.css keeps working.

import { Fragment, useMemo } from "react";
import { db, NOW, PAGE_SIZE } from "./store.js";
import {
  ATTEMPT_STATUS, SPEAKING_STATUS, attemptTotal, classById, classLabel, durationOf, fmtDate,
  initials, levelByKey, latestGraded, levelLabel, nilaiOf, periodById, periodsSorted, programById,
  siswaChipOf, stageOf,
} from "./lib.js";
import { parseRichText } from "@tnec/core/rich";

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

/* ===================== Rich passage text ===================== */

const runNodes = (runs) => runs.map((run, i) => {
  if (run.image) return <img className="rt__image" src={run.image} alt={run.alt || ""} key={i} />;
  let node = run.text;
  if (run.b) node = <strong>{node}</strong>;
  if (run.i) node = <em>{node}</em>;
  if (run.u) node = <u>{node}</u>;
  return <Fragment key={i}>{node}</Fragment>;
});

function RichBlock({ block }) {
  if (block.type === "p" || block.type === "quote") {
    const body = block.lines.map((runs, j) => <Fragment key={j}>{j > 0 ? <br /> : null}{runNodes(runs)}</Fragment>);
    return block.type === "quote" ? <blockquote>{body}</blockquote> : <p>{body}</p>;
  }
  if (block.type === "table") {
    return (
      <table className="rt__table">
        {block.header ? <thead><tr>{block.header.map((runs, i) => <th key={i}>{runNodes(runs)}</th>)}</tr></thead> : null}
        <tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((runs, j) => <td key={j}>{runNodes(runs)}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  const List = block.type === "ol" ? "ol" : "ul";
  return <List>{block.items.map((runs, j) => <li key={j}>{runNodes(runs)}</li>)}</List>;
}

/* The passage as the student sees it, from the shared parser in @tnec/core/rich. */
export function RichText({ value, className = "" }) {
  const blocks = useMemo(() => parseRichText(value), [value]);
  if (!blocks.length) return null;
  return <div className={`rt${className ? ` ${className}` : ""}`}>{blocks.map((block, i) => <RichBlock key={i} block={block} />)}</div>;
}

/* The formatting bar above a passage textarea. The buttons edit the textarea's selection in
   place, so the form stays uncontrolled and the value is still read at submit time. */
export function RichToolbar({ target }) {
  const area = () => document.getElementById(target);
  const after = (el) => { el.focus(); el.dispatchEvent(new Event("input", { bubbles: true })); };

  function wrap(tag) {
    const el = area();
    if (!el) return;
    const from = el.selectionStart, to = el.selectionEnd;
    el.setRangeText(`</${tag}>`, to, to, "preserve");
    el.setRangeText(`<${tag}>`, from, from, "preserve");
    el.selectionStart = from + tag.length + 2;
    el.selectionEnd = to + tag.length + 2;
    after(el);
  }

  function insert(text) {
    const el = area();
    if (!el) return;
    const at = el.selectionStart;
    const lineStart = el.value.lastIndexOf("\n", at - 1) + 1;
    // A block skeleton needs a blank line before it, so it never merges into the line above.
    const full = (el.value.slice(lineStart, at).trim() ? "\n\n" : "") + text;
    el.setRangeText(full, at, el.selectionEnd, "end");
    el.selectionStart = el.selectionEnd = at + full.length;
    after(el);
  }

  // Prefix or re-prefix every selected line: pressing the same button twice does not stack
  // markers, because the old list, quote, or number marker is stripped first.
  function mark(marker) {
    const el = area();
    if (!el) return;
    const from = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const end = el.value.indexOf("\n", el.selectionEnd);
    const to = end === -1 ? el.value.length : end;
    const lines = el.value.slice(from, to).split("\n");
    const marked = lines.map((line, i) => {
      const bare = line.replace(/^[-•]\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/^>\s?/, "");
      return marker === "- " ? `- ${bare}` : marker === "> " ? `> ${bare}` : `${i + 1}. ${bare}`;
    }).join("\n");
    el.setRangeText(marked, from, to, "preserve");
    el.selectionStart = from;
    el.selectionEnd = from + marked.length;
    after(el);
  }

  const btn = (name, label, onClick) => (
    <button className="icon-btn icon-btn--boxed" type="button" title={label} aria-label={label} onClick={onClick}><Icon name={name} cls="icon--sm" /></button>
  );
  return (
    <div className="rt-toolbar" role="group" aria-label="Format bacaan">
      {btn("bold", "Tebal", () => wrap("b"))}
      {btn("italic", "Miring", () => wrap("i"))}
      {btn("underline", "Garis bawah", () => wrap("u"))}
      <span className="rt-toolbar__sep" aria-hidden="true" />
      {btn("list", "Daftar strip", () => mark("- "))}
      {btn("list-ordered", "Daftar bernomor", () => mark("1. "))}
      {btn("quote", "Kutipan", () => mark("> "))}
      <span className="rt-toolbar__sep" aria-hidden="true" />
      {btn("table", "Sisip tabel", () => insert("| Kolom 1 | Kolom 2 |\n| --- | --- |\n|  |  |"))}
      {btn("image", "Sisip gambar", () => insert("![Keterangan gambar](/images/contoh.png)"))}
    </div>
  );
}

/* A whole table row navigates, unless the click landed on a control inside it. */
// The row navigates only on a clean click. A non-empty text selection means the user was
// selecting to copy, not clicking to open, so that click is ignored. Every table row that
// navigates through here gets a matching "Buka" button in its action column (RowOpen).
export const rowClick = (href) => (e) => {
  if (e.target.closest("a, button, input, select, textarea, label")) return;
  const selection = window.getSelection ? window.getSelection() : null;
  if (selection && String(selection).length) return;
  location.hash = href;
};
export const rowRun = (fn) => (e) => {
  if (e.target.closest("a, button, input, select, textarea, label")) return;
  const selection = window.getSelection ? window.getSelection() : null;
  if (selection && String(selection).length) return;
  fn();
};

/* The explicit open button for a navigating row: always present, one click, keyboard reachable. */
export function RowOpen({ href, label = "Buka" }) {
  return (
    <a className="btn btn--quiet btn--sm row-open" href={href} aria-label={`Buka ${label}`} title={`Buka ${label}`}>
      <Icon name="chevron-right" cls="icon--sm" />Buka
    </a>
  );
}

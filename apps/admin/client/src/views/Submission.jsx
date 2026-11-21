// The all-tests submission list: one page for every attempt across Placement Test, Pre-test,
// Post-test, and IELTS Mockup, so the team does not open each test to find a submission.
// Each row opens the submission detail of its own test.

import { db, notify, ui, useVersion, PAGE_SIZE, TEST_KEYS } from "../store.js";
import { ATTEMPT_STATUS, TEST_META, exportAllAttempts, fmtDateTime, studentById, classById, classLabel } from "../lib.js";
import { AttemptStatus, Chip, Empty, Icon, OptList, PageHead, Pager, ResultCell, OutcomeCell, RowOpen, rowClick } from "../ui.jsx";
import { BRANCHES, branchLabel } from "@tnec/core/branches";

let searchTimer = null;

function matches(a, f) {
  if (f.test && a.test !== f.test) return false;
  if (f.status !== "all") {
    if (f.status === "failed" ? !(a.status === "timeout" || a.status === "violation") : a.status !== f.status) return false;
  }
  if (f.branch) {
    const s = a.studentId ? studentById(a.studentId) : null;
    if (!s || s.branch !== f.branch) return false;
  }
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const s = a.studentId ? studentById(a.studentId) : null;
    const c = s ? classById(s.classId) : null;
    const text = `${s ? `${s.name} ${s.email}` : a.contactName || "tanpa nama"} ${c ? classLabel(c) : ""} ${a.id}`.toLowerCase();
    const waHit = s && digits.length >= 3 && (s.wa.includes(digits) || `0${s.wa.slice(2)}`.includes(digits));
    if (!text.includes(q) && !waHit) return false;
  }
  return true;
}

export function AllSubmissions() {
  useVersion();
  const f = ui.allSubmissions;
  const base = db.attempts.filter((a) => matches(a, { ...f, status: "all" }));
  const rows = base.filter((a) => matches(a, f));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  f.page = Math.min(Math.max(1, f.page), pages);
  const pageRows = rows.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE);
  const allOnPage = pageRows.length > 0 && pageRows.every((a) => f.selected.has(a.id));
  const toggleRow = (id, checked) => { if (checked) f.selected.add(id); else f.selected.delete(id); notify(); };
  const togglePage = (checked) => { pageRows.forEach((a) => { if (checked) f.selected.add(a.id); else f.selected.delete(a.id); }); notify(); };
  const countOf = (k) => (k === "all" ? base.length
    : k === "failed" ? base.filter((a) => a.status === "timeout" || a.status === "violation").length
      : base.filter((a) => a.status === k).length);

  return <>
    <PageHead title="Submission"
      desc={<p className="page-desc"><span>Semua submission dari keempat tes. Klik satu baris untuk membuka jawaban dan detailnya di halaman tesnya.</span></p>}
      actions={<button className="btn btn--quiet" type="button" onClick={() => exportAllAttempts(rows)}><Icon name="download" />Ekspor CSV</button>} />
    <section className="panel">
      <div className="toolbar">
        <div className="chips" role="group" aria-label="Saring status submission">
          {[["all", "Semua"], ["done", "Selesai"], ["nocontact", "Tanpa kontak"], ["failed", "Gagal"], ["progress", "Sedang berjalan"], ["void", "Dibatalkan"]].map(([k, label]) => (
            <Chip key={k} value={k} label={label} n={countOf(k)} pressed={f.status === k} onClick={(v) => { f.status = v; f.page = 1; notify(); }} />
          ))}
        </div>
      </div>
      <div className="toolbar toolbar--last">
        <label className="search"><span className="sr-only">Cari submission</span><Icon name="search" />
          <input className="input" type="search" placeholder="Cari nama, email, WhatsApp, atau ID" value={f.q} autoComplete="off"
            onChange={(e) => { clearTimeout(searchTimer); const v = e.target.value; searchTimer = setTimeout(() => { f.q = v; f.page = 1; notify(); }, 140); }} />
        </label>
        <select className="select select--auto" aria-label="Saring tes" value={f.test} onChange={(e) => { f.test = e.target.value; f.page = 1; notify(); }}>
          <OptList list={[["", "Semua tes"], ...TEST_KEYS.map((k) => [k, TEST_META[k].name])]} />
        </select>
        <select className="select select--auto" aria-label="Saring cabang" value={f.branch} onChange={(e) => { f.branch = e.target.value; f.page = 1; notify(); }}>
          <OptList list={[["", "Semua cabang"], ...BRANCHES]} />
        </select>
      </div>
      {rows.length ? <>
        <div className="table-wrap"><table className="table">
          <caption className="sr-only">Semua submission</caption>
          <thead><tr>
            <th scope="col" className="is-check"><input type="checkbox" checked={allOnPage} aria-label="Pilih semua submission di halaman ini" onChange={(e) => togglePage(e.target.checked)} /></th>
            <th scope="col" className="hide-md">Tes</th><th scope="col">Peserta</th><th scope="col">Hasil</th>
            <th scope="col" className="hide-sm">Level, kelulusan, atau band</th><th scope="col" className="hide-lg">Waktu</th>
            <th scope="col">Status</th><th scope="col" className="is-action hide-xl"><span className="sr-only">Buka</span></th>
          </tr></thead>
          <tbody>{pageRows.map((a) => {
            const s = a.studentId ? studentById(a.studentId) : null;
            const href = `#/tes/${a.test}/submission/${a.id}`;
            return (
              <tr key={a.id} className={f.selected.has(a.id) ? "is-selected" : ""} onClick={rowClick(href)}>
                <td className="is-check"><input type="checkbox" checked={f.selected.has(a.id)} aria-label={`Pilih submission ${s ? s.name : a.contactName || a.short}`} onChange={(e) => toggleRow(a.id, e.target.checked)} /></td>
                <td className="hide-md"><span className="cell-main">{TEST_META[a.test]?.name || a.test}</span>
                  {a.noSession ? <span className="cell-sub cell-sub--warn">Tanpa sesi</span> : null}
                  {s?.branch ? <span className="cell-sub">Cabang {branchLabel(s.branch)}</span> : null}</td>
                <td>{s
                  ? <><a className="cell-main" href={href}>{s.name}</a><span className="cell-sub cell-ellipsis">{s.email}</span></>
                  : <><a className="cell-main" href={href}>{a.contactName || "Tanpa nama"}</a><span className="cell-sub">ID {a.short}</span></>}</td>
                <td className="nowrap">{a.test === "ielts-mockup"
                  ? <><strong className="tnum">{a.bands?.overall || "-"}</strong><span className="cell-sub">band keseluruhan</span></>
                  : <ResultCell a={a} />}</td>
                <td className="hide-sm">{a.test === "ielts-mockup" ? <span className="muted">Perkiraan band</span> : <OutcomeCell a={a} />}</td>
                <td className="hide-lg nowrap">{fmtDateTime(a.startedAt)}</td>
                <td><AttemptStatus a={a} /></td>
                <td className="is-action hide-xl"><RowOpen href={href} label={s ? s.name : a.contactName || a.short} /></td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <Pager page={f.page} total={rows.length} noun="submission" onPage={(n) => { f.page = n; notify(); document.getElementById("main").scrollIntoView({ block: "start" }); }} />
      </> : <Empty title="Tidak ada submission yang cocok dengan filter ini." desc="Coba tes atau cabang lain, atau hapus kata kunci pencarian." />}
    </section>
  </>;
}

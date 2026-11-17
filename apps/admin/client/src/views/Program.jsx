// Program & Kelas: the catalog with its three tabs. Ported from viewPrograms and its renderers.

import { db, notify, ui, useVersion, NOW } from "../store.js";
import {
  enrolledIn, fmtDate, fmtDateLong, fmtRp, periodById, periodState, periodsSorted, programById,
  studentsInClass, pct, classById,
} from "../lib.js";
import { Empty, Icon, OptList, PageHead, Person, Status, periodOptions, programOptions, rowRun } from "../ui.jsx";
import { MenuBtn } from "../menus.jsx";
import { openClassDialog, openPeriodDialog, openProgramDialog, openTutorDialog } from "../dialogs.jsx";

export function ProgramKelas({ tab }) {
  useVersion();
  const tabs = [["program", "Program", db.programs.length], ["periode", "Periode", db.periods.length], ["kelas", "Kelas & Tutor", db.classes.length]];
  if (!tabs.some((t) => t[0] === tab)) tab = "program";
  const actions = tab === "program"
    ? <button className="btn btn--primary" type="button" onClick={() => openProgramDialog(null)}><Icon name="plus" />Tambah program</button>
    : tab === "periode"
      ? <button className="btn btn--primary" type="button" onClick={() => openPeriodDialog(null)}><Icon name="plus" />Tambah periode</button>
      : <><button className="btn btn--quiet" type="button" onClick={() => openTutorDialog()}><Icon name="user" />Tambah tutor</button>
        <button className="btn btn--primary" type="button" onClick={() => openClassDialog(null)}><Icon name="plus" />Tambah kelas</button></>;
  return <>
    <PageHead title="Program & Kelas" actions={actions} />
    <nav className="seg tabs" aria-label="Bagian program dan kelas">
      {tabs.map(([key, label, n]) => (
        <a key={key} className="seg__item" href={`#/program/${key}`} {...(key === tab ? { "aria-current": "page" } : {})}>{label} <span className="seg__n">{n}</span></a>
      ))}
    </nav>
    {tab === "program" ? <ProgramTab /> : tab === "periode" ? <PeriodTab /> : <ClassTab />}
  </>;
}

function ProgramTab() {
  return <section className="panel">
    <header className="panel__head"><div>
      <h2 className="panel__title">Program</h2>
      <p className="panel__desc">Setiap program punya beberapa pilihan durasi dan harga. Program nonaktif tetap tersimpan di data siswa lama, tetapi tidak muncul di formulir.</p>
    </div></header>
    <div className="table-wrap"><table className="table">
      <thead><tr><th scope="col">Program</th><th scope="col">Durasi dan harga</th><th scope="col" className="hide-md">Tutor</th><th scope="col" className="is-num is-wrap hide-sm">Siswa terdaftar</th><th scope="col" className="hide-md">Status</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th></tr></thead>
      <tbody>{db.programs.map((p) => (
        <tr key={p.id} className={p.status === "aktif" ? "" : "is-draft"} onClick={rowRun(() => openProgramDialog(p.id))}>
          <td><span className="cell-main">{p.name}</span><span className="cell-sub">{p.mode}{p.status === "aktif" ? "" : ", nonaktif"}</span></td>
          <td><div className="tags">{p.durations.map((d) => <span key={d.id} className="tag">{d.label}{d.price ? <> <small>{fmtRp(d.price)}</small></> : null}</span>)}</div></td>
          <td className="hide-md">{p.tutors.join(", ") || "Belum ada"}</td>
          <td className="is-num hide-sm">{enrolledIn((s) => s.programId === p.id)}</td>
          <td className="hide-md">{p.status === "aktif" ? <Status label="Aktif" kind="navy" /> : <Status label="Nonaktif" kind="ring" muted />}</td>
          <td className="is-action"><span className="row-actions">
            <button className="btn btn--quiet btn--sm" type="button" onClick={() => openProgramDialog(p.id)}>Ubah</button>
            <MenuBtn kind="program" id={p.id} label={`Aksi lain untuk ${p.name}`} />
          </span></td>
        </tr>
      ))}</tbody>
    </table></div>
  </section>;
}

function PeriodTab() {
  return <section className="panel">
    <header className="panel__head"><div>
      <h2 className="panel__title">Periode</h2>
      <p className="panel__desc">Tanggal mulai kelas. Siswa memilih satu periode saat mendaftar, dan periode dipakai sebagai filter di Database Siswa serta hasil pre-test dan post-test.</p>
    </div></header>
    <div className="table-wrap"><table className="table">
      <thead><tr><th scope="col">Periode</th><th scope="col">Status</th><th scope="col" className="is-num">Kelas</th><th scope="col" className="is-num">Siswa terdaftar</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th></tr></thead>
      <tbody>{[...db.periods].sort((a, b) => a.start - b.start).reverse().map((p) => {
        const st = periodState(p);
        const n = enrolledIn((s) => s.periodId === p.id);
        return (
          <tr key={p.id} onClick={rowRun(() => openPeriodDialog(p.id))}>
            <td><span className="cell-main">Mulai {fmtDateLong(p.start)}</span>{p.note ? <span className="cell-sub">{p.note}</span> : null}</td>
            <td><Status label={st.label} kind={st.dot} muted={st.key === "done"} /></td>
            <td className="is-num">{db.classes.filter((c) => c.periodId === p.id).length}</td>
            <td className="is-num">{n ? <a className="link-btn" href={`#/siswa?periode=${p.id}`}>{n} siswa</a> : <span className="muted">0</span>}</td>
            <td className="is-action"><span className="row-actions">
              <button className="btn btn--quiet btn--sm" type="button" onClick={() => openPeriodDialog(p.id)}>Ubah</button>
              <MenuBtn kind="period" id={p.id} label={`Aksi lain untuk periode ${fmtDate(p.start)}`} />
            </span></td>
          </tr>
        );
      })}</tbody>
    </table></div>
  </section>;
}

function ClassTab() {
  const f = ui.classes;
  const list = db.classes.filter((c) => (!f.period || c.periodId === f.period) && (!f.program || c.programId === f.program))
    .sort((a, b) => periodById(b.periodId).start - periodById(a.periodId).start || a.code.localeCompare(b.code, "id", { numeric: true }));
  return <div className="stack">
    <section className="panel">
      <header className="panel__head"><div>
        <h2 className="panel__title">Kelas</h2>
        <p className="panel__desc">Satu kelas berisi satu program di satu periode dengan satu tutor. Di data siswa, kelas tampil sebagai Tutor / Kelas, misalnya Aldo / C1.</p>
      </div></header>
      <div className="toolbar toolbar--last toolbar--flush">
        <select className="select select--auto" aria-label="Saring periode" value={f.period} onChange={(e) => { f.period = e.target.value; notify(); }}>
          <OptList list={periodOptions("Semua periode")} />
        </select>
        <select className="select select--auto" aria-label="Saring program" value={f.program} onChange={(e) => { f.program = e.target.value; notify(); }}>
          <OptList list={programOptions("Semua program")} />
        </select>
      </div>
      {list.length ? <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">Kelas</th><th scope="col">Program</th><th scope="col" className="hide-tab">Periode</th><th scope="col">Tutor</th><th scope="col">Siswa</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th></tr></thead>
        <tbody>{list.map((c) => {
          const n = studentsInClass(c).length;
          return (
            <tr key={c.id} onClick={rowRun(() => openClassDialog(c.id))}>
              <td><span className="cell-main">{c.code}</span></td>
              <td>{programById(c.programId)?.name || "Program sudah dihapus"}</td>
              <td className="hide-tab nowrap">{fmtDate(periodById(c.periodId).start)}</td>
              <td><Person name={c.tutor} text={c.tutor} /></td>
              <td><div className="acc"><span className="bar" aria-hidden="true"><span className={`bar__fill${n > c.capacity ? " is-low" : ""}`} style={{ width: `${pct(n, c.capacity)}%` }} /></span><span className="acc__val nowrap">{n} / {c.capacity}</span></div></td>
              <td className="is-action"><span className="row-actions">
                <button className="btn btn--quiet btn--sm" type="button" onClick={() => openClassDialog(c.id)}>Ubah</button>
                <MenuBtn kind="class" id={c.id} label={`Aksi lain untuk kelas ${c.code}`} />
              </span></td>
            </tr>
          );
        })}</tbody>
      </table></div>
        : <Empty title="Belum ada kelas untuk filter ini." desc="Tambah kelas baru atau pilih periode lain." />}
    </section>

    <section className="panel">
      <header className="panel__head"><div>
        <h2 className="panel__title">Tutor</h2>
        <p className="panel__desc">Program yang bisa diajar setiap tutor diatur dari formulir program.</p>
      </div></header>
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">Tutor</th><th scope="col">Program yang diajar</th><th scope="col" className="is-num">Kelas</th><th scope="col" className="is-num hide-sm">Siswa</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th></tr></thead>
        <tbody>{db.tutors.map((t) => {
          const classes = db.classes.filter((c) => c.tutor === t);
          return (
            <tr key={t}>
              <td><Person name={t} text={t} /></td>
              <td>{db.programs.filter((p) => p.tutors.includes(t)).map((p) => p.name).join(", ") || "Belum mengajar program apa pun"}</td>
              <td className="is-num">{classes.length}</td>
              <td className="is-num hide-sm">{classes.reduce((sum, c) => sum + studentsInClass(c).length, 0)}</td>
              <td className="is-action"><MenuBtn kind="tutor" id={t} label={`Aksi lain untuk ${t}`} /></td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </section>
  </div>;
}

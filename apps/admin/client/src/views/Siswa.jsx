// Database Siswa: the registered-only student list with its filters, bulk selection, and the
// recent registrations panel, plus the full student record page. Ported from viewStudents,
// renderStudentsResults, and viewStudent.

import { useEffect } from "react";
import { api, db, mutate, notify, ui, useVersion, studentFeed } from "../store.js";
import { PAGE_SIZE } from "../store.js";
import {
  SISWA_CHIPS, attemptTotal, classById, dateToMs, durationOf, endOf, fmtClock, fmtDate, fmtDateTime,
  fmtRelative, fmtTime, fmtWa, lastActivityAt, latestGraded, levelByKey, nilaiOf, periodById, periodLabel,
  programById, siswaChipOf, studentById, studentMatches, exportStudents,
} from "../lib.js";
import {
  AttemptStatus, ClassCell, Chip, Empty, Icon, LevelCell, OptList, PageHead, PendaftaranStatus,
  Pager, PeriodCell, ProgramCell, ResultCell, OutcomeCell, SiswaStatus, SortHeader, SpeakingRowLabel,
  periodOptions, programOptions, rowClick,
} from "../ui.jsx";
import { fieldError } from "../dom.js";
import { MenuBtn } from "../menus.jsx";
import { setClass, setStage } from "../actions.js";
import { openCertDialog, openDaftar, openPendaftaranForm, openStudentForm, openWhatsApp } from "../dialogs.jsx";
import { CertRow } from "./Sertifikat.jsx";
import { BRANCHES, branchLabel } from "@tnec/core/branches";

let searchTimer = null;

export function SiswaList() {
  useVersion();
  const f = ui.students;

  // Deep links: #/siswa?status=aktif and #/siswa?periode=<id> set the filter once.
  useEffect(() => {
    const p = new URLSearchParams((location.hash.split("?")[1] || ""));
    const st = p.get("status");
    const per = p.get("periode");
    let touched = false;
    if (st && (st === "all" || SISWA_CHIPS.some(([k]) => k === st))) { f.stage = st; f.page = 1; touched = true; }
    if (per && db.periods.some((x) => x.id === per)) { Object.assign(f, { period: per, stage: "all", page: 1 }); touched = true; }
    if (touched) { history.replaceState(null, "", "#/siswa"); notify(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base = db.students.filter((s) => s.daftarCount > 0 && studentMatches(s, f, true));
  const counts = { all: base.length };
  SISWA_CHIPS.slice(1).forEach(([k]) => { counts[k] = base.filter((s) => siswaChipOf(s) === k).length; });
  const hasFilter = Boolean(f.q || f.level || f.program || f.period || f.tutor || f.branch || f.stage !== "all");

  const rows = (f.stage === "all" ? base : base.filter((s) => siswaChipOf(s) === f.stage));
  const last = new Map(db.students.map((s) => [s.id, lastActivityAt(s)]));
  const score = new Map(db.students.map((s) => [s.id, latestGraded(s.id)?.score ?? -1]));
  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name, "id"),
    score: (a, b) => score.get(a.id) - score.get(b.id),
    activity: (a, b) => last.get(a.id) - last.get(b.id),
    period: (a, b) => (periodById(a.periodId)?.start || 0) - (periodById(b.periodId)?.start || 0),
  };
  rows.sort((a, b) => sorters[f.sort](a, b) * (f.dir === "asc" ? 1 : -1));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  f.page = Math.min(Math.max(1, f.page), pages);
  const pageRows = rows.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE);
  const allOnPage = pageRows.length > 0 && pageRows.every((s) => f.selected.has(s.id));

  const sort = (key) => {
    if (f.sort === key) f.dir = f.dir === "asc" ? "desc" : "asc";
    else { f.sort = key; f.dir = key === "name" ? "asc" : "desc"; }
    notify();
  };
  const onPage = (n) => { f.page = n; notify(); document.getElementById("main").scrollIntoView({ block: "start" }); };
  const toggleRow = (id, checked) => { if (checked) f.selected.add(id); else f.selected.delete(id); notify(); };
  const togglePage = (checked) => {
    pageRows.forEach((s) => { if (checked) f.selected.add(s.id); else f.selected.delete(s.id); });
    notify();
  };
  const reset = () => { Object.assign(f, { q: "", stage: "all", level: "", program: "", period: "", tutor: "", branch: "", page: 1 }); notify(); };

  const recent = [...db.pendaftaran].sort((a, b) => b.registeredAt - a.registeredAt).slice(0, 8);

  return <>
    <PageHead title="Database Siswa"
      desc={<p className="meta-line"><span>Hanya orang yang sudah didaftarkan ke satu program. Calon siswa dari placement test ada di Placement Test, Lead.</span></p>}
      actions={<>
        <button className="btn btn--quiet" type="button" onClick={() => exportStudents(db.students.filter((s) => studentMatches(s, ui.students, false)))}><Icon name="download" />Ekspor CSV</button>
        <button className="btn btn--primary" type="button" onClick={() => openDaftar()}><Icon name="plus" />Daftarkan siswa</button>
      </>} />
    <div className="stack">
      <section className="panel">
        <div className="toolbar">
          <div className="chips" role="group" aria-label="Saring status">
            {SISWA_CHIPS.map(([k, label]) => (
              <Chip key={k} value={k} label={label} n={counts[k]} pressed={f.stage === k}
                onClick={(v) => { f.stage = v; f.page = 1; notify(); }} />
            ))}
          </div>
        </div>
        <div className="toolbar toolbar--last">
          <label className="search"><span className="sr-only">Cari siswa</span><Icon name="search" />
            <input className="input" type="search" placeholder="Cari nama, email, WhatsApp, atau kelas" value={f.q} autoComplete="off"
              onChange={(e) => { clearTimeout(searchTimer); const v = e.target.value; searchTimer = setTimeout(() => { f.q = v; f.page = 1; notify(); }, 140); }} />
          </label>
          <select className="select select--auto" aria-label="Saring periode" value={f.period} onChange={(e) => { f.period = e.target.value; f.page = 1; notify(); }}>
            <OptList list={[...periodOptions("Semua periode"), ["none", "Belum ditentukan"]]} />
          </select>
          <select className="select select--auto" aria-label="Saring program" value={f.program} onChange={(e) => { f.program = e.target.value; f.page = 1; notify(); }}>
            <OptList list={programOptions("Semua program")} />
          </select>
          <select className="select select--auto hide-sm" aria-label="Saring tutor" value={f.tutor} onChange={(e) => { f.tutor = e.target.value; f.page = 1; notify(); }}>
            <OptList list={[["", "Semua tutor"], ["none", "Belum ada kelas"], ...db.tutors.map((t) => [t, t])]} />
          </select>
          <select className="select select--auto hide-sm" aria-label="Saring level placement" value={f.level} onChange={(e) => { f.level = e.target.value; f.page = 1; notify(); }}>
            <OptList list={[["", "Semua level"], ["none", "Belum tes"], ...db.levels.map((l) => [l.key, l.label])]} />
          </select>
          <select className="select select--auto hide-sm" aria-label="Saring cabang" value={f.branch} onChange={(e) => { f.branch = e.target.value; f.page = 1; notify(); }}>
            <OptList list={[["", "Semua cabang"], ...BRANCHES]} />
          </select>
          <button className="link-btn" type="button" hidden={!hasFilter} onClick={reset}>Hapus filter</button>
        </div>
        {rows.length ? <>
          <div className="table-wrap"><table className="table">
            <caption className="sr-only">Daftar siswa</caption>
            <thead><tr>
              <th scope="col" className="is-check"><input type="checkbox" checked={allOnPage} aria-label="Pilih semua siswa di halaman ini" onChange={(e) => togglePage(e.target.checked)} /></th>
              <SortHeader k="name" label="Siswa" cur={f.sort} dir={f.dir} onSort={sort} />
              <th scope="col" className="hide-xl">WhatsApp</th>
              <th scope="col">Program</th>
              <SortHeader k="period" label="Periode" cur={f.sort} dir={f.dir} cls="hide-md" onSort={sort} />
              <th scope="col" className="hide-tab">Tutor / Kelas</th>
              <SortHeader k="score" label="Level" cur={f.sort} dir={f.dir} cls="hide-lg" onSort={sort} />
              <th scope="col">Status</th>
              <SortHeader k="activity" label="Aktivitas terakhir" cur={f.sort} dir={f.dir} cls="is-wrap hide-tab" onSort={sort} />
              <th scope="col" className="is-action hide-xl"><span className="sr-only">Buka</span></th>
            </tr></thead>
            <tbody>
              {pageRows.map((s) => (
                <tr key={s.id} className={f.selected.has(s.id) ? "is-selected" : ""} onClick={rowClick(`#/siswa/${s.id}`)}>
                  <td className="is-check"><input type="checkbox" checked={f.selected.has(s.id)} aria-label={`Pilih ${s.name}`} onChange={(e) => toggleRow(s.id, e.target.checked)} /></td>
                  <td><a className="cell-main" href={`#/siswa/${s.id}`}>{s.name}</a><span className="cell-sub cell-ellipsis">{s.email}</span></td>
                  <td className="hide-xl tnum nowrap">{fmtWa(s.wa)}</td>
                  <td><ProgramCell s={s} /></td>
                  <td className="hide-md"><PeriodCell s={s} /></td>
                  <td className="hide-tab"><ClassCell s={s} /></td>
                  <td className="hide-lg"><LevelCell s={s} /></td>
                  <td><SiswaStatus s={s} /></td>
                  <td className="hide-tab">{fmtRelative(last.get(s.id))}</td>
                  <td className="is-action chev hide-xl"><Icon name="chevron-right" /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <Pager page={f.page} total={rows.length} noun="siswa" onPage={onPage} />
        </> : <Empty title="Tidak ada siswa yang cocok dengan pencarian ini." desc="Coba kata kunci lain atau hapus filter yang sedang aktif."
          action={<button className="btn btn--quiet btn--sm" type="button" onClick={reset}>Hapus filter</button>} />}
      </section>

      <section className="panel" aria-label="Pendaftaran terbaru">
        <header className="panel__head"><div>
          <h2 className="panel__title">Pendaftaran terbaru</h2>
          <p className="panel__desc">Delapan pendaftaran terakhir. Perjalanan lengkap tiap siswa ada di halaman profilnya.</p>
        </div></header>
        {recent.length ? <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col">Siswa</th><th scope="col">Program</th><th scope="col">Periode</th><th scope="col" className="hide-sm">Status</th><th scope="col" className="hide-md">Didaftarkan</th></tr></thead>
          <tbody>{recent.map((p) => {
            const s = studentById(p.studentId);
            return <tr key={p.id} onClick={rowClick(`#/siswa/${p.studentId}`)}>
              <td><a className="cell-main" href={`#/siswa/${p.studentId}`}>{s ? s.name : "Terhapus"}</a></td>
              <td>{programById(p.programId)?.name || "-"}</td>
              <td className="nowrap">{periodLabel(p.periodId)}</td>
              <td className="hide-sm"><PendaftaranStatus p={p} /></td>
              <td className="hide-md cell-sub">{fmtDate(p.registeredAt)}<span>oleh {p.registeredBy || "-"}</span></td>
            </tr>;
          })}</tbody>
        </table></div>
          : <Empty title="Belum ada pendaftaran." desc="Tekan Daftarkan siswa untuk memasukkan orang pertama ke sebuah program." />}
      </section>
    </div>
  </>;
}

/* ===================== The student record page ===================== */
const FEED_ICON = { system: "user", test: "clipboard", email: "mail", stage: "flag", note: "note", wa: "message", void: "ban", class: "layers", sertifikat: "award" };
const TEST_NAMES = { placement: "Placement Test", pre: "Pre-test", post: "Post-test" };

export function SiswaDetail({ id }) {
  useVersion();
  const s = studentById(id);
  if (!s) {
    return <>
      <PageHead crumbs={[["Database Siswa", "#/siswa"], ["Tidak ditemukan", ""]]} title="Siswa tidak ditemukan" />
      <section className="panel"><Empty title="Data siswa ini sudah dihapus atau tautannya salah." desc="Kembali ke Database Siswa untuk mencari dengan nama atau nomor WhatsApp."
        action={<a className="btn btn--quiet btn--sm" href="#/siswa">Kembali ke Database Siswa</a>} /></section>
    </>;
  }
  const placement = latestGraded(s.id, "placement");
  const level = placement ? levelByKey(placement.levelKey) : null;
  const pre = latestGraded(s.id, "pre"), post = latestGraded(s.id, "post");
  const attempts = db.attempts.filter((a) => a.studentId === s.id).sort((x, y) => y.startedAt - x.startedAt);
  const certs = db.certs.issued.filter((c) => c.studentId === s.id);
  const feedData = studentFeed(s.id);
  const feed = feedData?.activities || [];
  const journey = feedData?.pendaftaran || [];
  const identity = feedData?.identity;
  const registered = s.daftarCount > 0;
  const prog = programById(s.programId), dur = durationOf(s), per = periodById(s.periodId), cls = classById(s.classId);
  const end = endOf(s);
  const choices = prog && per ? db.classes.filter((c) => c.programId === prog.id && c.periodId === per.id) : [];
  const preNilai = pre ? nilaiOf(pre) : null, postNilai = post ? nilaiOf(post) : null;
  const delta = pre && post ? postNilai - preNilai : null;
  const stageList = [
    ["baru", "Baru"], ["dihubungi", "Dihubungi"], ["konsultasi", "Konsultasi"],
    ...(registered ? [["terdaftar", "Terdaftar"]] : []), ["lepas", "Tidak lanjut"],
  ];

  async function saveNote(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const box = form.querySelector("#note-text");
    const text = box.value.trim();
    if (!text) { fieldError(box, "note-err", "Tulis catatan dulu sebelum menyimpan."); box.focus(); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true; button.textContent = "Menyimpan...";
    ui.notesOpen = true;
    const ok = await mutate(() => api(`/api/admin/students/${s.id}/notes`, { method: "POST", body: { text } }), "Catatan tersimpan.");
    button.disabled = false; button.textContent = "Simpan catatan";
    if (ok) document.getElementById("note-text")?.focus();
  }

  const progressCell = (label, a, body) => (
    <div className="stat" key={label}>
      <div className="stat__eyebrow"><p className="stat__label">{label}</p>{a ? <a className="link-btn" href={`#/tes/${a.test}/submission/${a.id}`}>Lihat jawaban</a> : null}</div>
      {body}
    </div>
  );

  return <>
    <PageHead
      crumbs={[["Database Siswa", "#/siswa"], [s.name, ""]]}
      lead={<span className="avatar avatar--lg" aria-hidden="true">{s.name.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("")}</span>}
      title={s.name}
      desc={<p className="meta-line"><span>{s.email}</span><span className="tnum">{fmtWa(s.wa)}</span><span>{s.city}</span></p>}
      actions={<>
        <button className="btn btn--secondary" type="button" onClick={() => openWhatsApp(s)}><Icon name="message" />Chat WhatsApp</button>
        <button className="btn btn--quiet" type="button" onClick={() => openStudentForm(s.id)}><Icon name="pencil" />Ubah data</button>
        <MenuBtn kind="student" id={s.id} label="Aksi lain" boxed />
      </>} />
    <div className="stack">
      <section className="panel" aria-label="Data utama siswa">
        <div className="props">
          <div className="prop"><label className="prop__label" htmlFor="rec-stage">Status</label>
            <select className="select" id="rec-stage" value={s.stage} onChange={(e) => setStage(s, e.target.value).then(() => document.getElementById("rec-stage")?.focus())}>
              <OptList list={stageList} />
            </select>
          </div>
          <div className="prop"><label className="prop__label" htmlFor="rec-class">Tutor / Kelas</label>
            {prog && per
              ? <select className="select" id="rec-class" value={s.classId || ""} onChange={(e) => setClass(s, e.target.value).then(() => document.getElementById("rec-class")?.focus())}>
                <OptList list={[["", choices.length ? "Belum ada kelas" : "Belum ada kelas untuk program ini"], ...choices.map((c) => [c.id, `${c.tutor} / ${c.code}`])]} />
              </select>
              : <select className="select" id="rec-class" disabled><option>Pilih program dan periode dulu</option></select>}
          </div>
          <div className="prop"><span className="prop__label">Program terkini</span>
            {prog ? <><span className="prop__value">{prog.name}</span><span className="prop__sub">{dur ? dur.label : "Durasi belum dipilih"}, {prog.mode}</span></> : <span className="prop__value muted">Belum terdaftar</span>}
          </div>
          <div className="prop"><span className="prop__label">Periode</span>
            {per ? <><span className="prop__value">Mulai {fmtDate(per.start)}</span><span className="prop__sub">{end ? `selesai ${fmtDate(end)}` : "tanggal selesai mengikuti durasi"}</span></> : <span className="prop__value muted">Belum ditentukan</span>}
          </div>
          <div className="prop"><span className="prop__label">Daftar TN</span><span className="prop__value tnum">{s.daftarCount} kali</span><span className="prop__sub">{registered ? "lihat perjalanan belajar di bawah" : "belum pernah daftar program"}</span></div>
          <div className="prop"><span className="prop__label">Level placement</span>
            {level ? <><span className="prop__value">{level.label}</span><span className="prop__sub">{placement.score} dari {attemptTotal(placement)}, tes {fmtDate(placement.startedAt)}</span></> : <span className="prop__value muted">Belum tes</span>}
          </div>
          <div className="prop"><span className="prop__label">Tempat, tanggal lahir</span>
            {identity && (identity.tempatLahir || identity.tanggalLahir)
              ? <><span className="prop__value">{identity.tempatLahir || "-"}</span><span className="prop__sub">{identity.tanggalLahir ? fmtDate(dateToMs(identity.tanggalLahir)) : "tanggal belum diisi"}</span></>
              : <span className="prop__value muted">Belum diisi</span>}
          </div>
          <div className="prop"><span className="prop__label">Kota/Kab, provinsi, kode pos</span>
            {s.city || (identity && (identity.provinsi || identity.kodePos))
              ? <><span className="prop__value">{s.city || "-"}</span><span className="prop__sub">{identity ? [identity.provinsi, identity.kodePos].filter(Boolean).join(", ") || "lengkapi di Ubah data" : ""}</span></>
              : <span className="prop__value muted">Belum diisi</span>}
          </div>
          <div className="prop"><span className="prop__label">Jenjang pendidikan</span>{identity?.jenjang ? <span className="prop__value">{identity.jenjang}</span> : <span className="prop__value muted">Belum diisi</span>}</div>
          <div className="prop"><span className="prop__label">Tahu TN dari</span>{identity?.tahuDari ? <span className="prop__value">{identity.tahuDari}</span> : <span className="prop__value muted">Belum diisi</span>}</div>
          <div className="prop"><span className="prop__label">Cabang belajar</span>{s.branch ? <span className="prop__value">{branchLabel(s.branch)}</span> : <span className="prop__value muted">Belum dipilih</span>}</div>
          <div className="prop"><span className="prop__label">Sumber, masuk database</span><span className="prop__value">{s.source}</span><span className="prop__sub">{fmtDate(s.createdAt)}, pukul {fmtTime(s.createdAt)}</span></div>
        </div>
      </section>

      {journey.length ? <section className="panel" aria-label="Perjalanan belajar">
        <header className="panel__head"><div>
          <h2 className="panel__title">Perjalanan belajar <span className="count-pill">{journey.filter((p) => p.status !== "batal").length}</span></h2>
          <p className="panel__desc">Semua pendaftaran {s.name.split(/\s+/)[0]}, dari yang paling lama ke paling baru. Program terkini di atas mengikuti baris paling bawah yang tidak dibatalkan.</p>
        </div></header>
        <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col">Program</th><th scope="col">Periode</th><th scope="col" className="hide-sm">Tutor / Kelas</th><th scope="col">Status</th><th scope="col" className="hide-md">Didaftarkan</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>{journey.map((p) => (
            <tr key={p.id} className={p.status === "batal" ? "is-draft" : ""}>
              <td><span className="cell-main">{p.programName}</span><span className="cell-sub">{p.durationLabel || "durasi belum dipilih"}{p.note ? `, ${p.note}` : ""}</span></td>
              <td className="nowrap">{fmtDate(dateToMs(p.periodStart))}</td>
              <td className="hide-sm">{p.classCode ? `${p.tutorName} / ${p.classCode}` : <span className="muted">Belum ada</span>}</td>
              <td><PendaftaranStatus p={p} /></td>
              <td className="hide-md cell-sub">{fmtDate(p.registeredAt)}<span>oleh {p.registeredBy || "-"}</span></td>
              <td className="is-action"><button className="btn btn--quiet btn--sm" type="button" onClick={() => openPendaftaranForm(p.id)}>Ubah</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </section> : null}

      <section className="panel">
        <header className="panel__head"><div>
          <h2 className="panel__title">Perkembangan belajar</h2>
          <p className="panel__desc">Placement test menentukan rekomendasi program, pre-test menjadi nilai awal sebelum kelas, dan post-test menentukan kelulusan di akhir program.</p>
        </div></header>
        <div className="stats stats--3">
          {progressCell("Placement Test", placement, level
            ? <><p className="stat__value stat__value--text">{level.label}</p><p className="stat__note">Skor {placement.score} dari {attemptTotal(placement)}, {fmtDate(placement.startedAt)}</p></>
            : <><p className="stat__value stat__value--text muted">Belum tes</p><p className="stat__note">Kirim tautan tes supaya level bisa ditentukan.</p></>)}
          {progressCell("Pre-test", pre, pre
            ? <><p className="stat__value">{preNilai}<small> / 100</small></p><p className="stat__note">{pre.score} dari {attemptTotal(pre)} benar, {fmtDate(pre.startedAt)}</p></>
            : <><p className="stat__value stat__value--text muted">Belum dikerjakan</p><p className="stat__note">{s.stage === "terdaftar" && per ? `Dijadwalkan sebelum kelas mulai ${fmtDate(per.start)}.` : "Pre-test hanya untuk siswa terdaftar."}</p></>)}
          {progressCell("Post-test", post, post
            ? <><p className="stat__value">{postNilai}<small> / 100</small></p><p className="stat__note">{post.passed ? "Lulus, bisa lanjut ke level berikutnya" : "Belum lulus, disarankan mengulang"}{delta === null ? "" : `, ${delta >= 0 ? "naik" : "turun"} ${Math.abs(delta)} dari pre-test`}</p></>
            : <><p className="stat__value stat__value--text muted">Belum dikerjakan</p><p className="stat__note">{end ? `Dijadwalkan di akhir program, sekitar ${fmtDate(end)}.` : "Post-test dikerjakan di akhir program."}</p></>)}
        </div>
      </section>

      <section className="panel">
        <header className="panel__head">
          <div><h2 className="panel__title">Riwayat tes <span className="count-pill">{attempts.length}</span></h2>
            <p className="panel__desc">Semua placement test, pre-test, dan post-test atas nama {s.name.split(/\s+/)[0]}. Placement test yang gagal sebelum mengisi kontak tidak bisa dikaitkan ke siswa.</p></div>
          <MenuBtn kind="send-test" id={s.id} label="Kirim tautan tes" />
        </header>
        {attempts.length ? <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col">Tes</th><th scope="col">Tanggal</th><th scope="col">Hasil</th><th scope="col" className="hide-sm">Level atau kelulusan</th><th scope="col" className="hide-md">Durasi</th><th scope="col" className="hide-md">Pelanggaran</th><th scope="col">Status</th><th scope="col" className="is-action"><span className="sr-only">Buka</span></th></tr></thead>
          <tbody>{attempts.map((a) => (
            <tr key={a.id} onClick={rowClick(`#/tes/${a.test}/submission/${a.id}`)}>
              <td><a className="cell-main" href={`#/tes/${a.test}/submission/${a.id}`}>{TEST_NAMES[a.test]}</a></td>
              <td className="nowrap">{fmtDate(a.startedAt)}<span className="cell-sub">{fmtTime(a.startedAt)}</span></td>
              <td className="nowrap"><ResultCell a={a} />{a.test === "placement" && a.speaking ? <span className="cell-sub"><SpeakingRowLabel a={a} /></span> : null}</td>
              <td className="hide-sm"><OutcomeCell a={a} /></td>
              <td className="hide-md tnum">{fmtClock(a.durationSec)}</td>
              <td className={`hide-md tnum${a.violations >= (a.maxViolations || 3) ? " is-wrong" : ""}`}>{a.violations}</td>
              <td><AttemptStatus a={a} /></td>
              <td className="is-action chev"><Icon name="chevron-right" /></td>
            </tr>
          ))}</tbody>
        </table></div>
          : <Empty title="Belum pernah mengerjakan tes." desc="Kirim tautan placement test lewat WhatsApp supaya level dan program yang cocok bisa ditentukan." />}
      </section>

      <section className="panel">
        <header className="panel__head">
          <div><h2 className="panel__title">Sertifikat <span className="count-pill">{certs.length}</span></h2></div>
          <button className="btn btn--quiet btn--sm" type="button" onClick={() => openCertDialog({ studentId: s.id })}><Icon name="award" cls="icon--sm" />Terbitkan sertifikat</button>
        </header>
        {certs.length ? <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col">Nomor</th><th scope="col">Jenis</th><th scope="col" className="hide-md">Tanggal terbit</th><th scope="col">Status</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>{certs.map((c) => <CertRow key={c.id} c={c} withRecipient={false} />)}</tbody>
        </table></div>
          : <Empty title="Belum ada sertifikat." desc={`Sertifikat yang terbit atas nama ${s.name.split(/\s+/)[0]} muncul di sini.`} />}
      </section>

      <details className="panel fold" open={ui.notesOpen} onToggle={(e) => { ui.notesOpen = e.target.open; }}>
        <summary>
          <div><h2 className="panel__title">Catatan dan aktivitas{feedData ? <> <span className="count-pill">{feed.length}</span></> : null}</h2>
            <p className="panel__desc">Riwayat chat, telepon, perubahan status, dan catatan tim. Disembunyikan supaya data utama siswa tetap di depan.</p></div>
          <span className="fold__action"><span className="fold__closed">Tampilkan</span><span className="fold__opened">Sembunyikan</span><Icon name="chevron-down" cls="icon--sm" /></span>
        </summary>
        <form className="composer" onSubmit={saveNote} noValidate>
          <label className="sr-only" htmlFor="note-text">Catatan baru</label>
          <textarea className="textarea" id="note-text" rows="3" placeholder="Contoh: sudah telepon, minta jadwal kelas malam dan rincian biaya cicilan."></textarea>
          <p className="error" id="note-err" hidden></p>
          <div className="composer__foot"><span className="hint">Catatan tersimpan atas nama {db.me?.name}.</span><button className="btn btn--secondary btn--sm" type="submit">Simpan catatan</button></div>
        </form>
        {feedData ? null : <p className="loading-line" role="status">Memuat aktivitas...</p>}
        <ol className="feed">{feed.map((x, i) => (
          <li key={i} className={`feed__item${x.type === "note" ? " feed__item--note" : ""}`}>
            <span className="feed__icon" aria-hidden="true"><Icon name={FEED_ICON[x.type] || "note"} /></span>
            <div><p className="feed__text">{x.text}</p><p className="feed__meta">{x.by || "Sistem"}, {fmtDateTime(x.at)}</p></div>
          </li>
        ))}</ol>
      </details>
    </div>
  </>;
}

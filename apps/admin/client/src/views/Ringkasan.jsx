// Ringkasan: the periode-scoped overview. Ported from the old viewOverview.

import { db, notify, ui, useVersion, NOW } from "../store.js";
import { DAY, classLabel, fmtDate, fmtDateTime, fmtNum, fmtWa, isColdLead, leads, periodById, periodLabel, programById, studentById, studentsInClass } from "../lib.js";
import { Icon, LevelCell, Notice, OptList, PageHead, PendaftaranStatus, Person, Empty, Stat, periodOptions, rowClick, RowOpen } from "../ui.jsx";
import { markContacted } from "../actions.js";
import { openWhatsApp } from "../dialogs.jsx";

export function Ringkasan() {
  useVersion();
  const pid = ui.ringkasanPeriode;
  const period = pid ? periodById(pid) : null;
  const scopeLabel = period ? `periode ${fmtDate(period.start)}` : "semua periode";

  // The whole page is scoped by the selected intake period: registrations, active students, classes.
  const regs = db.pendaftaran.filter((p) => (!pid || p.periodId === pid) && p.status !== "batal")
    .sort((a, b) => b.registeredAt - a.registeredAt);
  const activeStudents = new Set(regs.filter((p) => p.status === "aktif").map((p) => p.studentId)).size;
  const scopeClasses = db.classes.filter((c) => !pid || c.periodId === pid)
    .sort((a, b) => (periodById(b.periodId)?.start || 0) - (periodById(a.periodId)?.start || 0) || a.code.localeCompare(b.code));
  const seats = scopeClasses.reduce((sum, c) => sum + studentsInClass(c).length, 0);
  const capacity = scopeClasses.reduce((sum, c) => sum + c.capacity, 0);
  const queue = leads().filter((s) => s.stage === "baru" && !isColdLead(s)).sort((a, b) => a.createdAt - b.createdAt);

  const queueRows = queue.slice(0, 6).map((s) => {
    const days = Math.floor((NOW - s.createdAt) / DAY);
    const p = programById(s.programId);
    return <tr key={s.id} onClick={rowClick(`#/siswa/${s.id}`)}>
      <td><a className="cell-main" href={`#/siswa/${s.id}`}>{s.name}</a><span className="cell-sub">Kota asal: {s.city || "-"}, {fmtWa(s.wa)}</span></td>
      <td><LevelCell s={s} /></td>
      <td className="hide-md">{p ? p.name : <span className="muted">Belum dipilih</span>}{p ? <span className="cell-sub">{p.mode}</span> : null}</td>
      <td><span className={days >= 2 ? "is-late" : ""}>{days < 1 ? "Hari ini" : `${days} hari`}</span><span className="cell-sub">sejak {fmtDateTime(s.createdAt)}</span></td>
      <td className="hide-lg">{s.source}</td>
      <td className="is-action"><span className="row-actions">
        <button className="icon-btn" type="button" onClick={() => openWhatsApp(s)} aria-label={`Chat WhatsApp ${s.name}`} title="Chat WhatsApp"><Icon name="message" /></button>
        <button className="btn btn--quiet btn--sm" type="button" onClick={() => markContacted(s)}>Tandai dihubungi</button>
        <RowOpen href={`#/siswa/${s.id}`} label={s.name} />
      </span></td>
    </tr>;
  });

  const regRows = regs.slice(0, 8).map((p) => {
    const s = studentById(p.studentId);
    const c = db.classes.find((x) => x.id === p.classId);
    return <tr key={p.id} onClick={rowClick(`#/siswa/${p.studentId}`)}>
      <td><a className="cell-main" href={`#/siswa/${p.studentId}`}>{s ? s.name : "Terhapus"}</a></td>
      <td>{programById(p.programId)?.name || "-"}</td>
      <td className="hide-sm">{c ? <Person name={c.tutor} text={classLabel(c)} /> : <span className="muted">Belum ada</span>}</td>
      <td><PendaftaranStatus p={p} /></td>
      <td className="hide-md cell-sub">{fmtDate(p.registeredAt)}<span>oleh {p.registeredBy || "-"}</span></td>
      <td className="is-action"><RowOpen href={`#/siswa/${p.studentId}`} label={s ? s.name : "siswa"} /></td>
    </tr>;
  });

  const classRows = scopeClasses.slice(0, 8).map((c) => (
    <tr key={c.id} onClick={rowClick("#/program/kelas")}>
      <td><span className="cell-main">{c.code}</span><span className="cell-sub">{programById(c.programId)?.name || ""}</span></td>
      <td><Person name={c.tutor} text={c.tutor} /></td>
      <td className="hide-sm">{periodLabel(c.periodId)}</td>
      <td className="tnum">{studentsInClass(c).length}<small> / {c.capacity}</small></td>
      <td className="is-action"><RowOpen href="#/program/kelas" label={c.code} /></td>
    </tr>
  ));

  return <>
    <PageHead title="Ringkasan"
      actions={<select className="select select--auto" aria-label="Pilih periode" value={pid}
        onChange={(e) => { ui.ringkasanPeriode = e.target.value; notify(); }}>
        <OptList list={periodOptions("Semua periode")} />
      </select>} />
    <div className="stack">
      {db.speaking.review || db.speaking.failedLastHour >= 5 ? (
        <section className="panel" aria-label="Speaking">
          <Notice icon="mic">
            {db.speaking.review ? `${db.speaking.review} rekaman speaking menunggu dinilai tim.` : ""}
            {db.speaking.failedLastHour >= 5 ? `${db.speaking.review ? " " : ""}${db.speaking.failedLastHour} penilaian speaking gagal dalam satu jam terakhir, jadi periksa kunci atau kuota Speechace.` : ""}
            {" "}
            <button className="link-btn" type="button" onClick={() => { ui.attempts.placement.speaking = "review"; ui.attempts.placement.page = 1; location.hash = "#/tes/placement/submission"; if (location.hash === "#/tes/placement/submission") notify(); }}>Buka antrean penilaian</button>
          </Notice>
        </section>
      ) : null}

      <section className="panel" aria-label="Angka utama">
        <div className="stats">
          <Stat label="Pendaftaran" value={fmtNum(regs.length)} note={scopeLabel} />
          <Stat label="Siswa aktif" value={fmtNum(activeStudents)} note="mengikuti program berjalan" />
          <Stat label="Kursi kelas" value={<>{fmtNum(seats)}<small> / {fmtNum(capacity)}</small></>} note={`${scopeClasses.length} kelas dibuka`} />
          <Stat label="Lead menunggu" value={fmtNum(queue.length)} note="belum dihubungi, lead dingin tidak dihitung" />
        </div>
      </section>

      <section className="panel">
        <header className="panel__head">
          <div>
            <h2 className="panel__title">Perlu dihubungi <span className="count-pill">{queue.length}</span></h2>
            <p className="panel__desc">Lead berstatus Baru, diurutkan dari yang paling lama menunggu. Tandai setelah menghubungi supaya tidak ada yang dihubungi dua kali. Lead yang tidak ditindaklanjuti 90 hari menjadi dingin dan keluar dari antrean.</p>
          </div>
          <a className="btn btn--quiet btn--sm" href="#/tes/placement/lead">Buka tab Lead</a>
        </header>
        {queue.length ? <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th scope="col">Calon siswa</th><th scope="col">Hasil placement</th><th scope="col" className="hide-md">Program diminati</th><th scope="col">Menunggu</th><th scope="col" className="hide-lg">Sumber</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th></tr></thead>
            <tbody>{queueRows}</tbody>
          </table></div>
          {queue.length > 6 ? <div className="panel__foot"><span>{queue.length - 6} lead lain masih menunggu.</span><a className="link-btn" href="#/tes/placement/lead">Lihat semuanya</a></div> : null}
        </> : <Empty title="Semua lead baru sudah dihubungi." desc="Calon siswa yang baru mengisi kontak setelah placement test muncul di tab Lead." />}
      </section>

      <div className="grid-2">
        <section className="panel">
          <header className="panel__head"><div>
            <h2 className="panel__title">Pendaftaran {scopeLabel}</h2>
            <p className="panel__desc">Siswa yang masuk ke program, dari yang paling baru.</p>
          </div></header>
          {regs.length ? <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th scope="col">Siswa</th><th scope="col">Program</th><th scope="col" className="hide-sm">Kelas</th><th scope="col">Status</th><th scope="col" className="hide-md">Didaftarkan</th></tr></thead>
              <tbody>{regRows}</tbody>
            </table></div>
            {regs.length > 8 ? <div className="panel__foot"><span>{regs.length - 8} pendaftaran lain.</span><a className="link-btn" href="#/siswa">Buka Database Siswa</a></div> : null}
          </> : <Empty title={`Belum ada pendaftaran di ${scopeLabel}.`} desc="Daftarkan siswa dari tombol Daftarkan siswa di halaman Database Siswa." />}
        </section>

        <section className="panel">
          <header className="panel__head">
            <div>
              <h2 className="panel__title">Kelas {scopeLabel}</h2>
              <p className="panel__desc">Isi kelas dibanding kapasitasnya, supaya kekurangan siswa terlihat sebelum kelas mulai.</p>
            </div>
            <a className="btn btn--quiet btn--sm" href="#/program/kelas">Atur kelas</a>
          </header>
          {scopeClasses.length ? <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th scope="col">Kelas</th><th scope="col">Tutor</th><th scope="col" className="hide-sm">Periode</th><th scope="col">Terisi</th></tr></thead>
              <tbody>{classRows}</tbody>
            </table></div>
            {scopeClasses.length > 8 ? <div className="panel__foot"><span>{scopeClasses.length - 8} kelas lain.</span><a className="link-btn" href="#/program/kelas">Lihat semuanya</a></div> : null}
          </> : <Empty title={`Belum ada kelas di ${scopeLabel}.`} desc="Kelas dibuat di menu Program & Kelas untuk program dan periode yang dipilih." />}
        </section>
      </div>
    </div>
  </>;
}

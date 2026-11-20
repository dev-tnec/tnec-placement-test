// Sertifikat: the register of issued certificates and the type settings.
// Ported from viewCertificates, certRow, renderCertsResults, and renderCertTypesTab.

import { db, notify, ui, useVersion } from "../store.js";
import {
  certCounter, certMatches, certPageUrl, certTemplateOf, certTypeName, certTypeById, fmtDate, fmtNum,
  nextCertNumber, slashWrap, studentById, todayIso,
} from "../lib.js";
import { CERT_RESET_LABEL, certPeriodLabel as certPeriodLabelOf } from "../cert-number.js";
import { Chip, Empty, Icon, OptList, PageHead, Pager, Status, periodOptions, programOptions, rowClick, rowRun } from "../ui.jsx";
import { MenuBtn } from "../menus.jsx";
import { openCertDialog, openCertTypeDialog } from "../dialogs.jsx";
import { PAGE_SIZE } from "../store.js";

let searchTimer = null;

/* One certificate row, used by the register and by the student page. */
export function CertRow({ c, withRecipient }) {
  const s = c.studentId ? studentById(c.studentId) : null;
  const sameName = s && s.name.toLowerCase() === c.recipient.toLowerCase();
  return (
    <tr className={c.revokedAt ? "is-draft" : ""}>
      <td>
        <span className="cell-main num-code nowrap" dangerouslySetInnerHTML={{ __html: slashWrap(c.number) }} />
        {!withRecipient && !sameName ? <span className="cell-sub">Atas nama {c.recipient}</span> : null}
      </td>
      {withRecipient ? <td>
        {s ? <a className="cell-main" href={`#/siswa/${s.id}`}>{c.recipient}</a> : <span className="cell-main">{c.recipient}</span>}
        {s ? (sameName ? null : <span className="cell-sub">Data siswa: {s.name}</span>) : <span className="cell-sub">Data siswa sudah dihapus</span>}
      </td> : null}
      <td className={withRecipient ? "hide-sm" : ""}>{certTypeName(c)}</td>
      <td className="hide-md nowrap">{fmtDate(c.issuedAt)}<span className="cell-sub">oleh {c.createdBy || "Sistem"}</span>
        {c.attemptId ? <span className="cell-sub cell-sub--ok"><a href={`#/tes/ielts-mockup/submission/${c.attemptId}`}>Otomatis dari mockup</a></span> : null}</td>
      <td className="hide-lg">
        {(c.emailSentAt || c.waSentAt) ? <>
          {c.emailSentAt ? <span className="cell-sub">Email {fmtDate(c.emailSentAt)}</span> : null}
          {c.waSentAt ? <span className="cell-sub">WhatsApp {fmtDate(c.waSentAt)}</span> : null}
        </> : <span className="muted">Belum</span>}
      </td>
      <td>
        {c.revokedAt ? <Status label="Dibatalkan" kind="ring" muted /> : <Status label="Berlaku" kind="navy" />}
        {c.revokedAt && c.revokeReason ? <span className="cell-sub">{c.revokeReason}</span> : null}
      </td>
      <td className="is-action"><span className="row-actions">
        <a className="btn btn--quiet btn--sm" href={certPageUrl(c.id)} target="_blank" rel="noopener"><Icon name="printer" cls="icon--sm" />{c.revokedAt ? "Lihat" : "Cetak"}</a>
        <MenuBtn kind="cert" id={c.id} label={`Aksi lain untuk sertifikat ${c.number}`} />
      </span></td>
    </tr>
  );
}

export function Sertifikat({ tab }) {
  useVersion();
  const tabs = [["daftar", "Sertifikat terbit", db.certs.issued.length], ["pengaturan", "Pengaturan", null]];
  if (!tabs.some((t) => t[0] === tab)) tab = "daftar";
  return <>
    <PageHead title="Sertifikat"
      actions={tab === "daftar"
        ? <button className="btn btn--primary" type="button" onClick={() => openCertDialog({})}><Icon name="plus" />Terbitkan sertifikat</button>
        : <button className="btn btn--primary" type="button" onClick={() => openCertTypeDialog(null)}><Icon name="plus" />Tambah jenis</button>} />
    <nav className="seg tabs" aria-label="Bagian sertifikat">
      {tabs.map(([k, label, n]) => (
        <a key={k} className="seg__item" href={`#/sertifikat/${k}`} {...(k === tab ? { "aria-current": "page" } : {})}>{label}{n === null ? null : <> <span className="seg__n">{n}</span></>}</a>
      ))}
    </nav>
    {tab === "daftar" ? <CertsList /> : <CertTypes />}
  </>;
}

function CertsList() {
  const f = ui.certs;
  if (f.type && !certTypeById(f.type)) f.type = "";
  const base = db.certs.issued.filter((c) => certMatches(c, f, true));
  const counts = {
    all: base.length,
    aktif: base.filter((c) => !c.revokedAt).length,
    batal: base.filter((c) => c.revokedAt).length,
  };
  const rows = base.filter((c) => certMatches(c, f, false));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  f.page = Math.min(Math.max(1, f.page), pages);
  const pageRows = rows.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE);
  const onPage = (n) => { f.page = n; notify(); document.getElementById("main").scrollIntoView({ block: "start" }); };

  return <section className="panel">
    <div className="toolbar">
      <div className="chips" role="group" aria-label="Saring status sertifikat">
        {[["all", "Semua"], ["aktif", "Berlaku"], ["batal", "Dibatalkan"]].map(([k, label]) => (
          <Chip key={k} value={k} label={label} n={counts[k]} pressed={f.status === k}
            onClick={(v) => { f.status = v; f.page = 1; notify(); }} />
        ))}
      </div>
    </div>
    <div className="toolbar toolbar--last">
      <label className="search"><span className="sr-only">Cari sertifikat</span><Icon name="search" />
        <input className="input" type="search" placeholder="Cari nama atau nomor sertifikat" value={f.q} autoComplete="off"
          onChange={(e) => { clearTimeout(searchTimer); const v = e.target.value; searchTimer = setTimeout(() => { f.q = v; f.page = 1; notify(); }, 140); }} />
      </label>
      <select className="select select--auto" aria-label="Saring jenis sertifikat" value={f.type} onChange={(e) => { f.type = e.target.value; f.page = 1; notify(); }}>
        <OptList list={[["", "Semua jenis"], ...db.certs.types.map((t) => [t.id, t.name])]} />
      </select>
    </div>
    {!db.certs.issued.length ? <Empty title="Belum ada sertifikat yang terbit." desc="Sertifikat bisa diterbitkan dari tombol Terbitkan sertifikat atau dari halaman siswa." />
      : rows.length ? <>
        <div className="table-wrap"><table className="table">
          <caption className="sr-only">Daftar sertifikat yang terbit</caption>
          <thead><tr><th scope="col">Nomor</th><th scope="col">Penerima</th><th scope="col" className="hide-sm">Jenis</th><th scope="col" className="hide-md">Tanggal terbit</th><th scope="col" className="hide-lg">Terkirim</th><th scope="col">Status</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>{pageRows.map((c) => <CertRow key={c.id} c={c} withRecipient />)}</tbody>
        </table></div>
        <Pager page={f.page} total={rows.length} noun="sertifikat" onPage={onPage} />
      </> : <Empty title="Tidak ada sertifikat yang cocok dengan filter ini." desc="Coba kata kunci lain atau pilih jenis yang berbeda." />}
  </section>;
}

function CertTypes() {
  const today = todayIso();
  const types = db.certs.types;
  return <section className="panel">
    <header className="panel__head"><div>
      <h2 className="panel__title">Jenis sertifikat</h2>
      <p className="panel__desc">Setiap jenis memakai salah satu desain template yang ada, dengan format nomor dan penanda tangan sendiri. Desain baru perlu template HTML baru dari tim teknis.</p>
    </div></header>
    {types.length ? <div className="table-wrap"><table className="table">
      <thead><tr><th scope="col">Jenis</th><th scope="col">Format nomor</th><th scope="col" className="hide-md">Kembali ke 1</th><th scope="col" className="is-num is-wrap">Nomor terakhir</th><th scope="col" className="hide-lg">Penanda tangan</th><th scope="col" className="hide-sm">Status</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th></tr></thead>
      <tbody>{types.map((t) => {
        const tpl = certTemplateOf(t.template);
        const issued = db.certs.issued.filter((c) => c.typeId === t.id).length;
        const sub = [`Kode ${t.code}`, !tpl ? "template tidak ditemukan" : tpl.name === t.name ? "" : `template ${tpl.name}`, `${issued} terbit`].filter(Boolean).join(", ");
        return (
          <tr key={t.id} className={t.status === "aktif" ? "" : "is-draft"} onClick={rowRun(() => openCertTypeDialog(t.id))}>
            <td><span className="cell-main">{t.name}</span><span className="cell-sub">{sub}</span></td>
            <td>
              <span className="num-code" dangerouslySetInnerHTML={{ __html: slashWrap(t.format) }} />
              <span className="cell-sub">Berikutnya <span className="num-code" dangerouslySetInnerHTML={{ __html: slashWrap(nextCertNumber(t, today)) }} /></span>
            </td>
            <td className="hide-md">{CERT_RESET_LABEL[t.reset] || t.reset}</td>
            <td className="is-num">{fmtNum(certCounter(t, today))}<span className="cell-sub">{certPeriodLabelOf(t.reset, today)}</span></td>
            <td className="hide-lg">{t.signerName}<span className="cell-sub">{t.signerRole}</span></td>
            <td className="hide-sm">{t.status === "aktif" ? <Status label="Aktif" kind="navy" /> : <Status label="Nonaktif" kind="ring" muted />}</td>
            <td className="is-action"><span className="row-actions">
              <button className="btn btn--quiet btn--sm" type="button" onClick={() => openCertTypeDialog(t.id)}>Ubah</button>
              <MenuBtn kind="cert-type" id={t.id} label={`Aksi lain untuk ${t.name}`} />
            </span></td>
          </tr>
        );
      })}</tbody>
    </table></div>
      : <Empty title="Belum ada jenis sertifikat." desc="Tambah jenis pertama supaya sertifikat bisa diterbitkan." />}
  </section>;
}

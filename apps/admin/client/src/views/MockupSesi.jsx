// The mockup session tab and the session roster (docs/prd-ielts-mockup-bulk.md). One session is
// one paid wave: the team imports a CSV of participants, every participant becomes a registered
// student with an invite, and the roster shows the email and WhatsApp status of every invite.

import { useEffect, useState } from "react";
import { api, db, mutate, useVersion } from "../store.js";
import { fmtDate, fmtDateTime, fmtWa, programById, periodById } from "../lib.js";
import { Empty, Icon, PageHead, Status, rowRun } from "../ui.jsx";
import { openSessionEditor, openSessionImport, openMoveInvite, openTestSend } from "../dialogs.jsx";

const KIND = { draft: ["Draf", "ring"], open: ["Terbuka", "navy"], closed: ["Selesai", "ring"], cancelled: ["Dibatalkan", "ring"] };

const QUEUE_LABEL = {
  pending: "Menunggu", sending: "Mengirim", sent: "Terkirim", failed: "Gagal",
  dilewati: "Dilewati", kuota: "Kuota habis",
};

function QueueChip({ status, error }) {
  if (!status) return <span className="muted">-</span>;
  const failed = status === "failed";
  return <span title={error || undefined}>
    <Status label={QUEUE_LABEL[status] || status} kind={status === "sent" ? "navy" : failed ? "done" : "ring"} muted={status !== "sent" && !failed} />
  </span>;
}

function windowText(s) {
  if (s.windowMode === "fleksibel") {
    return `${fmtDate(s.rangeStart)} sampai ${fmtDate(s.rangeEnd)}`;
  }
  return `Terjadwal, tenggang ${Math.round(s.entryGraceSeconds / 60)} menit`;
}

/* ===================== Sesi list ===================== */

export function SessionsTab() {
  useVersion();
  const rows = [...db.sessions].sort((a, b) => b.createdAt - a.createdAt);

  return <div className="stack">
    <section className="panel">
      <div className="toolbar toolbar--last">
        <p className="toolbar__meta">Satu sesi adalah satu gelombang peserta berbayar. Impor CSV membuat siswa, pendaftaran, undangan, dan antrean pesan sekaligus. Pengiriman baru jalan setelah "Kirim semua" ditekan.</p>
      </div>
      {rows.length ? <div className="table-wrap"><table className="table">
        <caption className="sr-only">Sesi IELTS Mockup</caption>
        <thead><tr>
          <th scope="col">Sesi</th><th scope="col">Jendela tes</th><th scope="col">Paket</th>
          <th scope="col" className="hide-sm">Program dan periode</th>
          <th scope="col" className="hide-md">Peserta</th>
          <th scope="col" className="hide-sm">Terkirim</th>
          <th scope="col">Status</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th>
        </tr></thead>
        <tbody>{rows.map((s) => (
          <tr key={s.id} onClick={rowRun(() => { location.hash = `#/tes/ielts-mockup/sesi/${s.id}`; })}>
            <td><p className="q-prompt">{s.name}</p><span className="cell-sub">Dibuat {fmtDateTime(s.createdAt)}</span></td>
            <td className="nowrap">{windowText(s)}</td>
            <td>{db.tests["ielts-mockup"].packages.find((p) => p.id === s.packageId)?.name || "-"}</td>
            <td className="hide-sm">{programById(s.programId)?.name || "-"}<span className="cell-sub">{periodById(s.periodId) ? `Periode ${fmtDate(periodById(s.periodId).start)}` : ""}</span></td>
            <td className="hide-md tnum">{s.counts.roster}{s.quota ? ` dari ${s.quota}` : ""}</td>
            <td className="hide-sm tnum">WA {s.counts.waSent}, email {s.counts.emailSent}</td>
            <td><Status label={KIND[s.status]?.[0] || s.status} kind={KIND[s.status]?.[1] || "ring"} muted={s.status !== "open"} /></td>
            <td className="is-action"><button className="btn btn--quiet" type="button" onClick={(e) => { e.stopPropagation(); openSessionEditor(s.id); }}>Ubah</button></td>
          </tr>
        ))}</tbody>
      </table></div>
        : <Empty title="Belum ada sesi." desc="Tambahkan sesi pertama, lalu impor daftar pesertanya." />}
    </section>
  </div>;
}

/* ===================== Session detail and roster ===================== */

export function SessionDetail({ id }) {
  useVersion();
  const session = db.sessions.find((s) => s.id === id);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await api(`/api/admin/mockup/sessions/${id}/roster`);
      if (r) setData(r);
    } catch { /* the roster keeps the last copy while a refresh fails */ }
  }

  useEffect(() => { setData(null); load(); }, [id]);
  // The roster is live: the worker sends in the background and imports can happen from the dialog,
  // so the page refreshes on a short interval instead of waiting for a manual action.
  useEffect(() => {
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [id]);

  if (!session) return <PageHead title="Sesi tidak ditemukan" />;
  const rows = data?.rows ?? [];
  const emailUsage = data?.emailUsage ?? db.emailUsage;

  async function act(path, body, message) {
    if (busy) return;
    setBusy(true);
    await mutate(() => api(`/api/admin/mockup/${path}`, { method: "POST", body: body || {} }), message);
    setBusy(false);
    await load();
  }

  return <>
    <PageHead title={session.name}
      desc={<p className="page-desc">
        {windowText(session)} &middot; {db.tests["ielts-mockup"].packages.find((p) => p.id === session.packageId)?.name || "-"} &middot; {programById(session.programId)?.name || "-"}
      </p>}
      actions={<>
        <button className="btn btn--quiet" type="button" onClick={() => openSessionEditor(session.id)}><Icon name="pencil" />Ubah sesi</button>
        <button className="btn btn--quiet" type="button" onClick={() => openTestSend(session.id)}><Icon name="send" />Pesan uji</button>
        <button className="btn btn--secondary" type="button" disabled={busy || session.status === "cancelled"} onClick={() => act(`sessions/${session.id}/send`, {}, "Antrean pengiriman dimulai.")}><Icon name="send" />Kirim semua</button>
        <button className="btn btn--primary" type="button" disabled={session.status === "cancelled"} onClick={() => openSessionImport(session.id)}><Icon name="plus" />Impor peserta</button>
      </>} />
    <section className="panel" aria-label="Roster sesi">
      <div className="toolbar toolbar--last">
        <p className="toolbar__meta">
          Peserta {session.counts.roster}{session.quota ? ` dari ${session.quota}` : ""} &middot; WhatsApp terkirim {session.counts.waSent} &middot; email terkirim {session.counts.emailSent} &middot; sudah mengerjakan {session.counts.done}.
          Email 24 jam terakhir {emailUsage.sent} dari {emailUsage.limit}, dipakai bersama email hasil tes.
          {session.queuePaused ? " Antrean sedang dijeda." : ""}
        </p>
        <button className="btn btn--quiet btn--sm" type="button" disabled={busy}
          onClick={() => act(`sessions/${session.id}/pause`, { paused: !session.queuePaused }, session.queuePaused ? "Antrean dilanjutkan." : "Antrean dijeda.")}>
          {session.queuePaused ? "Lanjutkan antrean" : "Jeda antrean"}
        </button>
      </div>
      {rows.length ? <div className="table-wrap"><table className="table">
        <caption className="sr-only">Roster {session.name}</caption>
        <thead><tr>
          <th scope="col">Siswa</th><th scope="col">Kode</th><th scope="col">Jendela tes</th>
          <th scope="col">Email</th><th scope="col">WhatsApp</th>
          <th scope="col" className="hide-md">Tes</th>
          <th scope="col" className="is-action"><span className="sr-only">Aksi</span></th>
        </tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.inviteId}>
            <td><a className="q-prompt" href={`#/siswa/${r.studentId}`}>{r.name}</a>
              <span className="cell-sub">{fmtWa(r.wa)}{r.email ? `, ${r.email}` : ""}</span></td>
            <td className="nowrap tnum"><strong>{r.code}</strong></td>
            <td className="nowrap">{session.windowMode === "fleksibel"
              ? `${fmtDate(r.opensAt)} sampai ${fmtDate(r.expiresAt)}`
              : `${fmtDateTime(r.opensAt)} sampai ${fmtDateTime(r.expiresAt)}`}</td>
            <td><QueueChip status={r.emailStatus} error={r.emailError} /></td>
            <td><QueueChip status={r.waStatus} error={r.waError} /></td>
            <td className="hide-md">{r.attemptStatus
              ? <Status label={r.submittedAt ? "Sudah mengerjakan" : "Sedang mengerjakan"} kind="navy" />
              : <span className="muted">Belum mulai</span>}</td>
            <td className="is-action"><span className="row-actions">
              {r.emailStatus === "failed" || r.waStatus === "failed" ? <>
                {r.emailStatus === "failed" ? <button className="btn btn--quiet btn--sm" type="button" onClick={() => act(`invites/${r.inviteId}/retry`, { channel: "email" }, "Pengiriman email diulang.")}>Ulangi email</button> : null}
                {r.waStatus === "failed" ? <button className="btn btn--quiet btn--sm" type="button" onClick={() => act(`invites/${r.inviteId}/retry`, { channel: "wa" }, "Pengiriman WhatsApp diulang.")}>Ulangi WA</button> : null}
              </> : null}
              {!r.attemptStatus ? <button className="btn btn--quiet btn--sm" type="button" onClick={() => openMoveInvite(r.inviteId, r.name, session.id)}>Pindah sesi</button> : null}
            </span></td>
          </tr>
        ))}</tbody>
      </table></div>
        : <Empty title="Belum ada peserta." desc="Impor CSV peserta untuk mengisi sesi ini." />}
    </section>
  </>;
}

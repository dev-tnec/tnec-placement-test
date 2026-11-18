// The placement speaking bank: the Speaking tab lists the questions the runner picks from,
// and each question opens its own editor page at #/tes/placement/speaking/:id (or baru).
// The order here is the order the students meet: count one always takes the first question.

import { useState } from "react";
import { api, db, mutate, useVersion } from "../store.js";
import { Empty, Icon, OptList, PageHead, Status, rowRun } from "../ui.jsx";
import { $, busy, makeFieldFail, toast } from "../dom.js";

export function SpeakingQuestionsTab() {
  useVersion();
  const rows = [...(db.speakingBank || [])].sort((a, b) => a.position - b.position);
  const active = rows.filter((q) => q.status === "aktif").length;
  const settings = db.tests.placement.settings;

  async function move(q, direction) {
    await mutate(() => api(`/api/admin/speaking-questions/${q.id}/${direction}`, { method: "POST" }));
  }

  return <section className="panel">
    <div className="toolbar toolbar--last">
      <p className="toolbar__meta">
        Setiap peserta mendapat {Math.min(settings.speakingCount ?? 1, active) || active} dari {active} pertanyaan aktif ini,
        {settings.speakingRandomize ? " dipilih secara acak" : " diambil berurutan dari atas"}.
        Soal nomor satu selalu dipakai kalau pengaturannya satu pertanyaan.
      </p>
    </div>
    {rows.length ? <div className="table-wrap"><table className="table">
      <caption className="sr-only">Bank pertanyaan speaking</caption>
      <thead><tr>
        <th scope="col" className="is-no">No</th><th scope="col">Pertanyaan</th>
        <th scope="col" className="hide-sm">Status</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th>
      </tr></thead>
      <tbody>{rows.map((q, i) => (
        <tr key={q.id} className={q.status === "draf" ? "is-draft" : ""} onClick={rowRun(() => { location.hash = `#/tes/placement/speaking/${q.id}`; })}>
          <td className="is-no is-top">{q.position}</td>
          <td><p className="q-prompt">{q.prompt}</p></td>
          <td className="hide-sm">{q.status === "aktif" ? <Status label="Aktif" kind="navy" /> : <Status label="Draf" kind="ring" muted />}</td>
          <td className="is-action"><span className="row-actions">
            <button className="icon-btn icon-btn--boxed" type="button" aria-label="Naik" title="Naik" disabled={i === 0}
              onClick={(e) => { e.stopPropagation(); move(q, "up"); }}><Icon name="chevron-up" cls="icon--sm" /></button>
            <button className="icon-btn icon-btn--boxed" type="button" aria-label="Turun" title="Turun" disabled={i === rows.length - 1}
              onClick={(e) => { e.stopPropagation(); move(q, "down"); }}><Icon name="chevron-down" cls="icon--sm" /></button>
            <button className="btn btn--quiet btn--sm" type="button"
              onClick={(e) => { e.stopPropagation(); location.hash = `#/tes/placement/speaking/${q.id}`; }}>Ubah</button>
          </span></td>
        </tr>
      ))}</tbody>
    </table></div>
      : <Empty title="Bank speaking masih kosong." desc="Tambahkan pertanyaan pertama; peserta merekam satu jawaban untuk setiap pertanyaan yang dipilih." />}
  </section>;
}

export function SpeakingQuestionEditor({ id }) {
  useVersion();
  const isNew = id === "baru";
  const q = isNew ? null : (db.speakingBank || []).find((x) => String(x.id) === id);
  const [promptLen, setPromptLen] = useState(q ? q.prompt.length : 0);
  if (!isNew && !q) {
    return <>
      <PageHead crumbs={[["Speaking", "#/tes/placement/speaking"], ["Tidak ditemukan", ""]]} title="Pertanyaan tidak ditemukan" />
      <section className="panel"><Empty title="Pertanyaan ini sudah dihapus atau tautannya salah."
        action={<a className="btn btn--quiet btn--sm" href="#/tes/placement/speaking">Kembali ke bank speaking</a>} /></section>
    </>;
  }
  const heading = isNew ? "Tambah Pertanyaan Speaking" : `Ubah Pertanyaan Speaking ${q.position}`;

  async function remove() {
    const { confirmDialog } = await import("../dialogs.jsx");
    const c = await confirmDialog({
      title: `Hapus pertanyaan ${q.position}?`,
      message: "Percobaan yang sudah berjalan tetap menyimpan pertanyaannya, jadi hasil yang sudah keluar tidak berubah. Pertanyaan berikutnya menutup nomor ini.",
      confirmLabel: "Hapus pertanyaan",
    });
    if (!c.ok) return;
    await mutate(() => api(`/api/admin/speaking-questions/${q.id}`, { method: "DELETE" }), "Pertanyaan dihapus.");
    location.hash = "#/tes/placement/speaking";
  }

  async function save(e) {
    e.preventDefault();
    const fail = makeFieldFail();
    const text = $("#sq-prompt").value.trim().replace(/\s+/g, " ");
    if (text.length < 5) fail($("#sq-prompt"), "sq-err", "Pertanyaan minimal 5 karakter.");
    else if (text.length > 300) fail($("#sq-prompt"), "sq-err", "Pertanyaan maksimal 300 karakter.");
    const first = fail.first();
    if (first) { first.focus(); return; }
    const body = { prompt: text, status: $("#sq-status").value };
    const done = busy($("#sq-save"), "Menyimpan...");
    const result = await mutate(
      () => api(isNew ? "/api/admin/speaking-questions" : `/api/admin/speaking-questions/${q.id}`, { method: isNew ? "POST" : "PUT", body }),
      isNew ? "Pertanyaan baru masuk di urutan terakhir." : "Pertanyaan tersimpan.",
    );
    done();
    if (result) location.hash = "#/tes/placement/speaking";
  }

  return (
    <form className="stack" onSubmit={save} noValidate>
      <PageHead title={heading}
        crumbs={[["Speaking", "#/tes/placement/speaking"], [heading]]}
        desc={<p className="page-desc">{isNew ? "Pertanyaan baru masuk di urutan terakhir bank." : `Pertanyaan nomor ${q.position} dalam urutan bank.`}</p>}
        actions={<>
          <button className="btn btn--quiet" type="button" onClick={() => { location.hash = "#/tes/placement/speaking"; }}>Batal</button>
          {!isNew ? <button className="link-btn link-btn--danger" type="button" onClick={remove}>Hapus pertanyaan</button> : null}
          <button className="btn btn--primary" type="submit" id="sq-save">Simpan pertanyaan</button>
        </>} />
      <section className="panel" aria-label="Pertanyaan speaking">
        <header className="panel__head"><div>
          <h2 className="panel__title">Pertanyaan</h2>
          <p className="panel__desc">Tulis dalam bahasa Inggris, karena jawabannya dinilai sebagai bahasa Inggris lisan. Pertanyaan ini juga dikirim ke penilai otomatis sebagai konteks relevansi.</p>
        </div></header>
        <div className="panel__body">
          <div className="field">
            <textarea className="textarea" id="sq-prompt" rows="3" maxLength="300" defaultValue={q ? q.prompt : ""}
              placeholder="Contoh: Describe a place you like to visit and explain why you enjoy it."
              onChange={(e) => setPromptLen(e.target.value.length)}></textarea>
            <p className="hint">{promptLen} karakter, maksimal 300</p>
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="sq-status">Status</label>
              <select className="select" id="sq-status" defaultValue={q ? q.status : "aktif"}>
                <OptList list={[["aktif", "Aktif, ikut dipilih untuk peserta"], ["draf", "Draf, belum tampil"]]} />
              </select>
              <p className="error" id="sq-err" hidden></p>
            </div>
          </div>
        </div>
      </section>
    </form>
  );
}

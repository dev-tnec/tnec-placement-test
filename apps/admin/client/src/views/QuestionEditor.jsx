// The question editor page (docs/assets/editor-soal.html is the reference): one full page per
// question instead of the old dialog, with the text, the passage, the answer form, the accepted
// answers as removable blocks, and the metadata at the bottom. Route: #/tes/:key/soal/:id or
// #/tes/:key/soal/baru.

import { useState } from "react";
import { api, db, mutate, useVersion, KEYS } from "../store.js";
import { TEST_META, packageOf, packageSections, questionById, questionNumber, testSeconds } from "../lib.js";
import { Icon, OptList, PageHead } from "../ui.jsx";
import { $, busy, clearErrors, makeFieldFail } from "../dom.js";
import { deleteQuestion } from "../dialogs.jsx";

const IELTS_SKILLS = [["Listening", "Listening"], ["Reading", "Reading"], ["Writing", "Writing"]];
const BASE_SKILLS = [["Grammar", "Grammar"], ["Vocabulary", "Vocabulary"], ["Reading", "Reading"]];

export function QuestionEditor({ testKey, id }) {
  useVersion();
  const t = db.tests[testKey];
  const isIelts = testKey === "ielts-mockup";
  const isEditing = id !== "baru";
  const q = isEditing ? questionById(t, Number(id)) : null;
  const per = t.settings.timeMode === "per";
  const name = TEST_META[testKey].name;
  const num = q ? questionNumber(t, q) : null;
  const sections = isIelts ? packageSections(t) : [];

  const [type, setType] = useState(q ? q.type : "choice");
  const [key, setKey] = useState(q && q.type !== "text" ? q.answer : "");
  const [hasPassage, setHasPassage] = useState(Boolean(q && q.passage));
  const [accepted, setAccepted] = useState(q && q.accepted?.length ? q.accepted : [""]);
  const [sectionId, setSectionId] = useState(q?.sectionId || "");
  const [skill, setSkill] = useState(q ? q.skill : isIelts ? "Listening" : "Grammar");
  const [promptLen, setPromptLen] = useState(q ? q.prompt.length : 0);

  const heading = isEditing ? (num ? `Ubah Soal ${num}` : "Ubah soal draf") : "Tambah Soal";
  const sub = q ? `${name}, ${q.skill}, ${q.status === "aktif" ? "aktif di tes" : "masih draf dan belum tampil di tes"}` : `${name}. Soal baru masuk di urutan terakhir.`;

  // Picking a section sets the skill too, so the question, its passage, and its audio always
  // agree. The part number follows the section; there is exactly one Bagian control.
  function pickSection(value) {
    setSectionId(value);
    const s = sections.find((x) => x.id === value);
    if (s) setSkill(s.skill);
  }

  function updateAccepted(at, value) {
    setAccepted((list) => list.map((a, i) => (i === at ? value : a)));
  }
  function removeAccepted(at) {
    setAccepted((list) => list.filter((_, i) => i !== at));
  }
  function addAccepted() {
    setAccepted((list) => [...list, ""]);
    setTimeout(() => $(`#qe-acc-${accepted.length}`)?.focus(), 0);
  }

  async function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);
    const prompt = $("#qe-prompt").value.trim();
    const passage = !isIelts && hasPassage ? $("#qe-passage").value.trim() : "";
    const fail = makeFieldFail();
    if (!prompt) fail($("#qe-prompt"), "qe-prompt-err", "Teks soal wajib diisi.");
    if (!isIelts && hasPassage && !passage) fail($("#qe-passage"), "qe-passage-err", "Bacaan wajib diisi kalau opsi bacaan dicentang.");

    const section = sections.find((x) => x.id === sectionId);
    const partValue = section ? (section.part ?? null) : (q?.part ?? null);
    const body = {
      prompt, passage, type,
      skill, status: $("#qe-status").value,
      ...(per ? { seconds: Number($("#qe-seconds")?.value) } : {}),
      ...(isIelts ? { sectionId: sectionId || null, part: partValue, packageId: packageOf(t)?.id || null } : {}),
    };

    if (type === "longtext") {
      const minWords = Number($("#qe-minwords").value);
      if (!Number.isInteger(minWords) || minWords < 50 || minWords > 1000) fail($("#qe-minwords"), "qe-options-err", "Jumlah kata minimal harus angka 50 sampai 1.000.");
      else body.minWords = minWords;
    } else if (type === "text") {
      const list = accepted.map((a) => a.trim()).filter(Boolean);
      if (!list.length) fail(null, "qe-options-err", "Tulis minimal satu jawaban yang diterima.");
      else if (new Set(list.map((a) => a.toLowerCase())).size !== list.length) fail(null, "qe-options-err", "Ada jawaban diterima yang ditulis dua kali.");
      else body.accepted = list;
    } else {
      const visible = isIelts ? KEYS : KEYS.slice(0, 4);
      const opts = {};
      visible.forEach((k) => { opts[k] = $(`#qe-opt-${k}`)?.value.trim() || ""; });
      const filled = visible.filter((k) => opts[k]);
      const required = isIelts ? 2 : 4;
      if (filled.length < required) {
        visible.filter((k) => !opts[k]).forEach((k) => $(`#qe-opt-${k}`)?.classList.add("is-invalid"));
        fail($(`#qe-opt-${visible.find((k) => !opts[k]) || "A"}`), "qe-options-err", isIelts ? "Isi minimal dua pilihan jawaban." : "Isi keempat pilihan jawaban.");
      } else if (filled.some((k, i) => filled.slice(0, i).some((j) => opts[j].toLowerCase() === opts[k].toLowerCase()))) {
        fail($("#qe-opt-A"), "qe-options-err", "Ada pilihan jawaban yang sama. Setiap pilihan harus berbeda.");
      } else if (!key || !opts[key]) {
        fail(null, "qe-options-err", "Pilih satu jawaban yang benar dengan mengklik hurufnya.");
      }
      body.options = opts;
      body.answer = key;
    }

    const seconds = Number($("#qe-seconds")?.value);
    if (per && (!Number.isInteger(seconds) || seconds < 5 || seconds > 180)) fail($("#qe-seconds"), "qe-seconds-err", "Waktu soal harus antara 5 dan 180 detik.");
    const first = fail.first();
    if (first) { first.focus(); return; }

    const done = busy(form.querySelector("#qe-save"), "Menyimpan...");
    const result = await mutate(
      () => api(isEditing ? `/api/admin/tests/${testKey}/questions/${q.id}` : `/api/admin/tests/${testKey}/questions`, { method: isEditing ? "PUT" : "POST", body }),
      (r) => (isEditing ? `Soal tersimpan.${r.keyChanged ? " Kunci baru berlaku untuk submission berikutnya." : ""}` : body.status === "aktif" ? "Soal baru tersimpan di urutan terakhir." : "Soal baru tersimpan sebagai draf."),
    );
    done();
    if (result) location.hash = `#/tes/${testKey}/soal`;
  }

  return (
    <form className="stack" onSubmit={save} noValidate>
      <PageHead title={heading}
        crumbs={[["Soal & Jawaban", `#/tes/${testKey}/soal`], [heading]]}
        desc={<p className="page-desc">{sub}</p>}
        actions={<>
          <button className="btn btn--quiet" type="button" onClick={() => { location.hash = `#/tes/${testKey}/soal`; }}>Batal</button>
          {isEditing ? <button className="link-btn link-btn--danger" type="button" onClick={() => deleteQuestion(q)}>Hapus soal</button> : null}
          <button className="btn btn--primary" type="submit" id="qe-save">Simpan soal</button>
        </>} />

      <section className="panel" aria-label="Teks soal">
        <header className="panel__head"><div>
          <h2 className="panel__title">Teks soal</h2>
          <p className="panel__desc">Tuliskan instruksi atau kalimat pertanyaan spesifik yang akan dijawab peserta.</p>
        </div></header>
        <div className="panel__body">
          <textarea className="textarea" id="qe-prompt" rows="3" defaultValue={q ? q.prompt : ""}
            placeholder="Contoh: Which bamboo product is undergoing market expansion?"
            onChange={(e) => setPromptLen(e.target.value.length)}></textarea>
          <div className="qe-toolbar-row">
            <span className="hint">{promptLen} karakter, maksimal 1.000</span>
          </div>
          <p className="error" id="qe-prompt-err" hidden></p>
        </div>
      </section>

      {!isIelts ? <section className="panel" aria-label="Bacaan">
        <header className="panel__head"><div>
          <h2 className="panel__title">Bacaan</h2>
          <p className="panel__desc">Bacaan tampil di atas soal, seperti pada soal tentang kata presence.</p>
        </div></header>
        <div className="panel__body">
          <label className="check"><input type="checkbox" checked={hasPassage} onChange={(e) => { setHasPassage(e.target.checked); if (e.target.checked) setTimeout(() => $("#qe-passage")?.focus(), 0); }} /><span>Soal ini memakai bacaan</span></label>
          <div className="field" hidden={!hasPassage}>
            <textarea className="textarea" id="qe-passage" rows="6" defaultValue={q ? q.passage : ""}></textarea>
            <p className="error" id="qe-passage-err" hidden></p>
          </div>
        </div>
      </section> : null}

      {isIelts ? <section className="panel" aria-label="Bentuk jawaban">
        <header className="panel__head"><div>
          <h2 className="panel__title">Bentuk jawaban</h2>
          <p className="panel__desc">Pilih bagaimana cara peserta menjawab pertanyaan ini.</p>
        </div></header>
        <div className="panel__body">
          <div className="modes" role="radiogroup" aria-label="Bentuk jawaban">
            <label className={`mode${type === "choice" ? " is-on" : ""}`}>
              <input type="radio" name="qe-type" value="choice" checked={type === "choice"} onChange={() => setType("choice")} /><span className="mode__mark" aria-hidden="true"></span>
              <span><span className="mode__title">Pilihan</span><span className="mode__desc">Peserta memilih satu huruf, dua sampai enam pilihan.</span></span>
            </label>
            <label className={`mode${type === "text" ? " is-on" : ""}`}>
              <input type="radio" name="qe-type" value="text" checked={type === "text"} onChange={() => setType("text")} /><span className="mode__mark" aria-hidden="true"></span>
              <span><span className="mode__title">Isian teks</span><span className="mode__desc">Peserta mengetik jawaban, dinilai longgar terhadap daftar jawaban yang diterima.</span></span>
            </label>
            <label className={`mode${type === "longtext" ? " is-on" : ""}`}>
              <input type="radio" name="qe-type" value="longtext" checked={type === "longtext"} onChange={() => setType("longtext")} /><span className="mode__mark" aria-hidden="true"></span>
              <span><span className="mode__title">Esai</span><span className="mode__desc">Peserta menulis esai panjang, dinilai AI dengan empat kriteria IELTS Writing.</span></span>
            </label>
          </div>
        </div>
      </section> : null}

      {type === "longtext" ? <section className="panel" aria-label="Jumlah kata minimal">
        <header className="panel__head"><div>
          <h2 className="panel__title">Jumlah kata minimal</h2>
          <p className="panel__desc">Esai dinilai AI, lalu band Writing masuk ke band keseluruhan bersama Listening dan Reading.</p>
        </div></header>
        <div className="panel__body">
          <div className="unit-row"><span className="unit"><input className="input tnum" id="qe-minwords" type="number" min="50" max="1000" defaultValue={q && q.minWords ? q.minWords : 250} /><span>kata</span></span></div>
          <p className="error" id="qe-options-err" hidden></p>
        </div>
      </section> : type === "text" ? <section className="panel" aria-label="Jawaban yang diterima">
        <header className="panel__head"><div>
          <h2 className="panel__title">Jawaban yang diterima</h2>
          <p className="panel__desc">Sistem mencocokkan jawaban peserta dengan setiap blok di bawah ini secara otomatis. Huruf besar atau kecil, tanda baca, dan spasi ganda tidak dipedulikan saat menilai.</p>
        </div></header>
        <div className="panel__body">
          <div className="ans-edit">
            {accepted.map((answer, at) => (
              <div key={at} className="ans-row">
                <span className="ans-num" aria-hidden="true">{at + 1}</span>
                <input className="input" id={`qe-acc-${at}`} value={answer} autoComplete="off"
                  aria-label={`Jawaban diterima ${at + 1}`} placeholder="Contoh: lake"
                  onChange={(e) => updateAccepted(at, e.target.value)} />
                <button className="icon-btn icon-btn--boxed" type="button" aria-label={`Hapus jawaban ${at + 1}`}
                  onClick={() => removeAccepted(at)} disabled={accepted.length === 1}><Icon name="x" /></button>
              </div>
            ))}
          </div>
          <button className="btn btn--quiet btn--sm" type="button" onClick={addAccepted}><Icon name="plus" />Tambah jawaban lain</button>
          <p className="error" id="qe-options-err" hidden></p>
        </div>
      </section> : <section className="panel" aria-label="Pilihan jawaban">
        <header className="panel__head"><div>
          <h2 className="panel__title">Pilihan jawaban</h2>
          <p className="panel__desc">Klik huruf di sebelah kiri untuk menandai jawaban yang benar. Kosongkan pilihan yang tidak dipakai; {isIelts ? "soal IELTS boleh dua sampai enam pilihan." : "soal Tes Penempatan memakai empat pilihan, A sampai D."}</p>
        </div></header>
        <div className="panel__body">
          <div className="opt-edit">
            {(isIelts ? KEYS : KEYS.slice(0, 4)).map((k) => (
              <div key={k} className={`opt-row${key === k ? " is-key" : ""}`}>
                <label className="key-label"><input className="key-radio" type="radio" name="qe-key" value={k} checked={key === k} onChange={() => setKey(k)} /><span className="key" aria-hidden="true">{k}</span><span className="sr-only">Tandai {k} sebagai jawaban benar</span></label>
                <input className="input" id={`qe-opt-${k}`} defaultValue={q ? q.options[k] : ""} aria-label={`Teks pilihan ${k}`} autoComplete="off" />
                <span className="opt-flag">Kunci</span>
              </div>
            ))}
          </div>
          <p className="error" id="qe-options-err" hidden></p>
        </div>
      </section>}

      <section className="panel" aria-label="Pengaturan soal">
        <header className="panel__head"><div>
          <h2 className="panel__title">Pengaturan soal</h2>
          <p className="panel__desc">Skill dan bagian menentukan tempat soal ini di tes. Bacaan dan audio mengikuti bagiannya, jadi keduanya tetap bersama soal saat urutannya diacak.</p>
        </div></header>
        <div className="panel__body">
          <div className={per ? "form-grid form-grid--3" : "form-grid"} id="qe-meta">
            <div className="field">
              <label className="label" htmlFor="qe-skill">Skill</label>
              <select className="select" id="qe-skill" value={skill} onChange={(e) => setSkill(e.target.value)}>
                <OptList list={isIelts ? IELTS_SKILLS : BASE_SKILLS} />
              </select>
            </div>
            {isIelts ? <div className="field">
              <label className="label" htmlFor="qe-section">Bagian</label>
              <select className="select" id="qe-section" value={sectionId} onChange={(e) => pickSection(e.target.value)}>
                <OptList list={[["", "Tanpa bagian"], ...sections.map((s) => [s.id, s.title])]} />
              </select>
              <p className="hint">Skill dan nomor bagian mengikuti pilihan ini. Atur bagiannya di tab Bagian.</p>
            </div> : null}
            <div className="field" hidden={!per}>
              <label className="label" htmlFor="qe-seconds">Waktu soal</label>
              <div className="unit-row"><span className="unit"><input className="input tnum" id="qe-seconds" type="number" min="5" max="180" step="1" inputMode="numeric" defaultValue={q ? q.seconds : t.settings.perDefault} /><span>detik</span></span></div>
              <p className="error" id="qe-seconds-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="qe-status">Status</label>
              <select className="select" id="qe-status" defaultValue={q ? q.status : "aktif"}><option value="aktif">Aktif, tampil di tes</option><option value="draf">Draf, belum tampil</option></select>
            </div>
          </div>
          <p className="hint">{per
            ? "Mode waktu per soal sedang aktif, jadi waktu di atas hanya berlaku untuk soal ini."
            : `Mode waktu ${name} sekarang total ${testSeconds(t)} detik untuk seluruh tes, jadi soal ini tidak punya waktu sendiri. Ganti mode di bagian Pengaturan kalau ingin memakai waktu per soal.`}</p>
          <p className="note" hidden={!q}>Perubahan kunci jawaban berlaku untuk submission berikutnya. Skor submission yang sudah masuk tidak dihitung ulang.</p>
        </div>
      </section>

      <div className="qe-foot">
        <button className="btn btn--quiet" type="button" onClick={() => { location.hash = `#/tes/${testKey}/soal`; }}>Batalkan</button>
        <button className="btn btn--primary" type="submit">Simpan &amp; perbarui soal</button>
      </div>
    </form>
  );
}

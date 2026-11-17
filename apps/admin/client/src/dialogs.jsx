// Every dialog of the dashboard as React components with native <dialog>, plus the imperative
// openers and promise APIs (confirmDialog, openFormDialog) that the rest of the app calls.
// The forms are uncontrolled: values are read from the DOM at submit time, exactly like the old
// client, so the validation and field error flow is unchanged.

import { useEffect, useRef, useState } from "react";
import { api, db, ui, T, notify, reload, mutate, sessionEnded, useVersion, NOW, KEYS } from "./store.js";
import { $, $$, busy, clearErrors, fieldError, toast } from "./dom.js";
import {
  TEST_META, certPrefill, certCounter, certTypeName, certTemplateOf, certTypeById, certById,
  classesFor, classLabel, currentPeriod, fmtDate, fmtDateLong, fmtNum, fmtRp, fmtSpan, fmtWa,
  firstName, joinWords, mergeCertValues, nextCertNumber, normalizeWa, periodsSorted, programById,
  questionById, questionNumber, studentById, todayIso, topIssuedSeq, greetingFor, openCertPage,
} from "./lib.js";
import { certFormatProblem, certPeriodLabel, formatCertNumber } from "./cert-number.js";
import { Icon, OptList } from "./ui.jsx";

/* ===================== Dialog store ===================== */
let dlg = null;
export function openDialog(next) { dlg = next; notify(); }
export function closeDialog() { dlg = null; notify(); }
export function useDialog() { useVersion(); return dlg; }

/* The base dialog: opens as a modal on mount, focuses a selector, and reports every close. */
function Modal({ id, className = "", focus, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    if (focus) $(focus)?.focus();
    const handler = () => onClose();
    d.addEventListener("close", handler);
    return () => { d.removeEventListener("close", handler); if (d.open) d.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <dialog ref={ref} id={id} className={className}>{children}</dialog>;
}

const CloseButton = () => (
  <button className="icon-btn" type="button" onClick={closeDialog} aria-label="Tutup"><Icon name="x" /></button>
);
const Head = ({ title, sub }) => (
  <header className="dialog__head"><div><h2 className="dialog__title">{title}</h2>{sub ? <p className="dialog__sub">{sub}</p> : null}</div><CloseButton /></header>
);
const FootEnd = ({ children }) => <div className="dialog__foot-end">{children}</div>;

/* ===================== Host: renders whichever dialog is open ===================== */
export function DialogHost() {
  const d = useDialog();
  if (!d) return null;
  switch (d.kind) {
    case "question": return <QuestionDialog key="q" id={d.id} />;
    case "student": return <StudentDialog key="s" id={d.id} />;
    case "daftar": return <DaftarDialog key="d" studentId={d.studentId} />;
    case "pendaftaran": return <PendaftaranDialog key="p" id={d.id} />;
    case "program": return <ProgramDialog key="pg" id={d.id} />;
    case "certtype": return <CertTypeDialog key="ct" id={d.id} />;
    case "cert": return <CertDialog key="cr" studentId={d.studentId} certId={d.certId} />;
    case "wa": return <WaDialog key="wa" studentId={d.studentId} opts={d.opts} />;
    case "form": return <FormDialog key="gf" spec={d.spec} />;
    case "confirm": return <ConfirmDialog key="cf" spec={d.spec} resolve={d.resolve} />;
    default: return null;
  }
}

/* ===================== Questions ===================== */
export function openQuestionEditor(id) { openDialog({ kind: "question", id: id || null }); }

export function questionAction(q, action, success) {
  return mutate(() => api(`/api/admin/tests/${ui.test}/questions/${q.id}/${action}`, { method: "POST" }), success);
}

export async function deleteQuestion(q) {
  const num = questionNumber(T(), q);
  const r = await confirmDialog({
    title: num ? `Hapus soal ${num}?` : "Hapus soal draf ini?",
    message: "Soal ini tidak akan tampil lagi di tes. Submission yang sudah masuk tetap menyimpan jawaban dan nilainya.",
    confirmLabel: "Hapus soal",
  });
  if (!r.ok) return;
  if (dlg?.kind === "question") closeDialog();
  await mutate(() => api(`/api/admin/tests/${ui.test}/questions/${q.id}`, { method: "DELETE" }), "Soal dihapus.");
}

function QuestionDialog({ id }) {
  const t = T();
  const q = id ? questionById(t, id) : null;
  const per = t.settings.timeMode === "per";
  const name = TEST_META[ui.test].name;
  const num = q ? questionNumber(t, q) : null;
  const [key, setKey] = useState(q ? q.answer : "");
  const [hasPassage, setHasPassage] = useState(Boolean(q && q.passage));

  async function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);
    const prompt = $("#qe-prompt").value.trim();
    const passage = hasPassage ? $("#qe-passage").value.trim() : "";
    const opts = {};
    KEYS.forEach((k) => { opts[k] = $(`#qe-opt-${k}`).value.trim(); });
    let first = null;
    const fail = (input, errId, msg) => { fieldError(input, errId, msg); if (!first) first = input; };
    if (!prompt) fail($("#qe-prompt"), "qe-prompt-err", "Teks soal wajib diisi.");
    if (hasPassage && !passage) fail($("#qe-passage"), "qe-passage-err", "Bacaan wajib diisi kalau opsi bacaan dicentang.");
    const empty = KEYS.filter((k) => !opts[k]);
    if (empty.length) {
      empty.forEach((k) => $(`#qe-opt-${k}`).classList.add("is-invalid"));
      fail($(`#qe-opt-${empty[0]}`), "qe-options-err", empty.length === 4 ? "Isi keempat pilihan jawaban." : `Pilihan ${joinWords(empty)} masih kosong.`);
    } else if (new Set(KEYS.map((k) => opts[k].toLowerCase())).size < 4) {
      fail($("#qe-opt-A"), "qe-options-err", "Ada pilihan jawaban yang sama. Setiap pilihan harus berbeda.");
    } else if (!key) {
      fail(null, "qe-options-err", "Pilih satu jawaban yang benar dengan mengklik hurufnya.");
    }
    const seconds = Number($("#qe-seconds")?.value);
    if (per && (!Number.isInteger(seconds) || seconds < 5 || seconds > 180)) fail($("#qe-seconds"), "qe-seconds-err", "Waktu soal harus antara 5 dan 180 detik.");
    if (first) { first.focus(); return; }

    const body = { prompt, passage, options: opts, answer: key, skill: $("#qe-skill").value, status: $("#qe-status").value, ...(per ? { seconds } : {}) };
    const done = busy(form.querySelector('[type="submit"]'), "Menyimpan...");
    const editing = q ? q.id : null;
    const result = await mutate(
      () => api(editing ? `/api/admin/tests/${ui.test}/questions/${editing}` : `/api/admin/tests/${ui.test}/questions`, { method: editing ? "PUT" : "POST", body }),
      (r) => (editing ? `Soal tersimpan.${r.keyChanged ? " Kunci baru berlaku untuk submission berikutnya." : ""}` : body.status === "aktif" ? "Soal baru tersimpan di urutan terakhir." : "Soal baru tersimpan sebagai draf."),
    );
    done();
    if (result) closeDialog();
  }

  return (
    <Modal id="dlg-question" focus="#qe-prompt" onClose={closeDialog} aria-labelledby="qe-title">
      <form className="dialog__form" onSubmit={save} noValidate>
        <Head title={q ? (num ? `Ubah soal ${num}` : "Ubah soal draf") : "Tambah soal"}
          sub={q ? `${name}, ${q.skill}, ${q.status === "aktif" ? "aktif di tes" : "masih draf dan belum tampil di tes"}` : `${name}. Soal baru masuk di urutan terakhir.`} />
        <div className="dialog__body">
          <div className="field">
            <label className="label" htmlFor="qe-prompt">Teks soal</label>
            <textarea className="textarea" id="qe-prompt" rows="3" defaultValue={q ? q.prompt : ""} placeholder="Contoh: Yesterday she ___ to the market."></textarea>
            <p className="error" id="qe-prompt-err" hidden></p>
          </div>
          <label className="check"><input type="checkbox" checked={hasPassage} onChange={(e) => { setHasPassage(e.target.checked); if (e.target.checked) setTimeout(() => $("#qe-passage")?.focus(), 0); }} /><span>Soal ini memakai bacaan</span></label>
          <div className="field" hidden={!hasPassage}>
            <label className="label" htmlFor="qe-passage">Bacaan</label>
            <textarea className="textarea" id="qe-passage" rows="5" defaultValue={q ? q.passage : ""}></textarea>
            <p className="hint">Bacaan tampil di atas soal, seperti pada soal tentang kata presence.</p>
            <p className="error" id="qe-passage-err" hidden></p>
          </div>
          <fieldset className="field">
            <legend className="label">Pilihan jawaban</legend>
            <p className="hint">Klik huruf di sebelah kiri untuk menandai jawaban yang benar. Setiap soal memakai empat pilihan, A sampai D, sesuai tampilan tes.</p>
            <div className="opt-edit">
              {KEYS.map((k) => (
                <div key={k} className={`opt-row${key === k ? " is-key" : ""}`}>
                  <label className="key-label"><input className="key-radio" type="radio" name="qe-key" value={k} checked={key === k} onChange={() => setKey(k)} /><span className="key" aria-hidden="true">{k}</span><span className="sr-only">Tandai {k} sebagai jawaban benar</span></label>
                  <input className="input" id={`qe-opt-${k}`} defaultValue={q ? q.options[k] : ""} aria-label={`Teks pilihan ${k}`} autoComplete="off" />
                  <span className="opt-flag">Kunci</span>
                </div>
              ))}
            </div>
            <p className="error" id="qe-options-err" hidden></p>
          </fieldset>
          <div className={per ? "form-grid form-grid--3" : "form-grid"} id="qe-meta">
            <div className="field">
              <label className="label" htmlFor="qe-skill">Skill</label>
              <select className="select" id="qe-skill" defaultValue={q ? q.skill : "Grammar"}><option>Grammar</option><option>Vocabulary</option><option>Reading</option></select>
            </div>
            <div className="field" hidden={!per}>
              <label className="label" htmlFor="qe-seconds">Waktu soal</label>
              <div className="unit-row"><span className="unit"><input className="input" id="qe-seconds" type="number" min="5" max="180" step="1" inputMode="numeric" defaultValue={q ? q.seconds : t.settings.perDefault} /><span>detik</span></span></div>
              <p className="error" id="qe-seconds-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="qe-status">Status</label>
              <select className="select" id="qe-status" defaultValue={q ? q.status : "aktif"}><option value="aktif">Aktif, tampil di tes</option><option value="draf">Draf, belum tampil</option></select>
            </div>
          </div>
          <p className="hint">{per
            ? "Mode waktu per soal sedang aktif, jadi waktu di atas hanya berlaku untuk soal ini."
            : `Mode waktu ${name} sekarang total ${t.settings.totalSeconds} detik untuk seluruh tes, jadi soal ini tidak punya waktu sendiri. Ganti mode di bagian Pengaturan kalau ingin memakai waktu per soal.`}</p>
          <p className="note" hidden={!q}>Perubahan kunci jawaban berlaku untuk submission berikutnya. Skor submission yang sudah masuk tidak dihitung ulang.</p>
        </div>
        <footer className="dialog__foot">
          {q ? <button className="link-btn link-btn--danger" type="button" onClick={() => deleteQuestion(q)}>Hapus soal</button> : null}
          <FootEnd>
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit">Simpan soal</button>
          </FootEnd>
        </footer>
      </form>
    </Modal>
  );
}

/* ===================== Students ===================== */
export function openStudentForm(id) { openDialog({ kind: "student", id: id || null }); }

function StudentDialog({ id }) {
  const s = id ? studentById(id) : null;

  async function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);
    const name = $("#sf-name").value.trim().replace(/\s+/g, " ");
    const waRaw = $("#sf-wa").value.trim();
    const wa = normalizeWa(waRaw);
    const email = $("#sf-email").value.trim().toLowerCase();
    const stage = $("#sf-stage").value;
    let first = null;
    const fail = (input, errId, msg) => { fieldError(input, errId, msg); if (!first) first = input; };
    if (name.length < 2) fail($("#sf-name"), "sf-name-err", "Nama minimal 2 karakter.");
    if (!waRaw) fail($("#sf-wa"), "sf-wa-err", "Nomor WhatsApp wajib diisi.");
    else if (!/^62\d{8,13}$/.test(wa)) fail($("#sf-wa"), "sf-wa-err", "Nomor WhatsApp terlihat belum lengkap. Periksa lagi jumlah digitnya.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail($("#sf-email"), "sf-email-err", "Format email belum benar.");
    const birthdate = $("#sf-birthdate").value;
    if (birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) fail($("#sf-birthdate"), "sf-birthdate-err", "Tanggal lahir belum benar.");
    if (first) { first.focus(); return; }
    const body = {
      name, wa, email, city: $("#sf-city").value.trim(), source: $("#sf-source").value, stage,
      tempatLahir: $("#sf-birthplace").value.trim(),
      tanggalLahir: birthdate,
      provinsi: $("#sf-provinsi").value.trim(),
      kodePos: $("#sf-postal").value.trim(),
      jenjang: $("#sf-jenjang").value,
      tahuDari: $("#sf-tahudari").value,
    };
    if (!s) body.note = $("#sf-note").value.trim();
    const done = busy($("#sf-save"), "Menyimpan...");
    try {
      const r = await api(s ? `/api/admin/students/${s.id}` : "/api/admin/students", { method: s ? "PATCH" : "POST", body });
      closeDialog();
      await reload();
      if (!s) location.hash = `#/siswa/${r.id}`;
      toast(s ? `Data ${firstName(name)} tersimpan.` : `${name} ditambahkan ke database.`);
    } catch (error) {
      if (error.field === "wa") fieldError($("#sf-wa"), "sf-wa-err", error.message);
      else if (error.field === "email") fieldError($("#sf-email"), "sf-email-err", error.message);
      else toast(error.message);
    } finally {
      done();
    }
  }

  const stageList = [{ key: "baru", label: "Baru" }, { key: "dihubungi", label: "Dihubungi" }, { key: "konsultasi", label: "Konsultasi" }, { key: "lepas", label: "Tidak lanjut" }];
  return (
    <Modal id="dlg-student" focus="#sf-name" onClose={closeDialog}>
      <form className="dialog__form" onSubmit={save} noValidate>
        <Head title={s ? "Ubah data siswa" : "Tambah siswa"}
          sub={s ? "Perubahan langsung terlihat oleh seluruh tim admin dan pendidikan." : "Peserta placement test masuk otomatis. Formulir ini untuk calon siswa yang datang lewat jalur lain."} />
        <div className="dialog__body">
          <div className="form-grid">
            <div className="field span-all">
              <label className="label" htmlFor="sf-name">Nama lengkap</label>
              <input className="input" id="sf-name" defaultValue={s ? s.name : ""} autoComplete="off" placeholder="Contoh: Nadia Fitriani" />
              <p className="error" id="sf-name-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="sf-wa">WhatsApp</label>
              <input className="input" id="sf-wa" type="tel" inputMode="tel" defaultValue={s ? fmtWa(s.wa) : ""} autoComplete="off" placeholder="0812 3456 7890" />
              <p className="hint">Awalan 0 atau 62 sama-sama bisa dipakai.</p>
              <p className="error" id="sf-wa-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="sf-email">Email</label>
              <input className="input" id="sf-email" type="email" defaultValue={s ? s.email : ""} autoComplete="off" placeholder="nama@email.com" />
              <p className="error" id="sf-email-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="sf-city">Kota/Kabupaten</label>
              <input className="input" id="sf-city" defaultValue={s ? s.city : ""} autoComplete="off" placeholder="Contoh: Malang" />
            </div>
            <div className="field">
              <label className="label" htmlFor="sf-source">Sumber</label>
              <select className="select" id="sf-source" defaultValue={s ? s.source : "WhatsApp"}>
                {["Placement test", "WhatsApp", "Instagram", "Datang langsung", "Rekomendasi alumni"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <p className="form-section span-all">Identitas</p>
            <div className="field">
              <label className="label" htmlFor="sf-birthplace">Tempat lahir</label>
              <input className="input" id="sf-birthplace" defaultValue={s ? s.tempatLahir : ""} autoComplete="off" placeholder="Contoh: Kediri" />
            </div>
            <div className="field">
              <label className="label" htmlFor="sf-birthdate">Tanggal lahir</label>
              <input className="input" id="sf-birthdate" type="date" defaultValue={s ? s.tanggalLahir : ""} autoComplete="off" />
              <p className="error" id="sf-birthdate-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="sf-provinsi">Provinsi</label>
              <input className="input" id="sf-provinsi" defaultValue={s ? s.provinsi : ""} autoComplete="off" placeholder="Contoh: Jawa Timur" />
            </div>
            <div className="field">
              <label className="label" htmlFor="sf-postal">Kode pos</label>
              <input className="input" id="sf-postal" inputMode="numeric" defaultValue={s ? s.kodePos : ""} autoComplete="off" placeholder="64111" />
            </div>
            <div className="field">
              <label className="label" htmlFor="sf-jenjang">Jenjang pendidikan</label>
              <select className="select" id="sf-jenjang" defaultValue={s ? s.jenjang : ""}>
                <OptList list={[["", "Pilih"], ...db.jenjang.map((j) => [j, j])]} />
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="sf-tahudari">Tahu Titik Nol dari mana?</label>
              <select className="select" id="sf-tahudari" defaultValue={s ? s.tahuDari : ""}>
                <OptList list={[["", "Pilih"], ...db.tahuDari.map((x) => [x, x])]} />
              </select>
            </div>
            <div className="field span-all">
              <label className="label" htmlFor="sf-stage">Status</label>
              <select className="select" id="sf-stage" defaultValue={s && s.stage !== "terdaftar" ? s.stage : "baru"}>
                <OptList list={stageList.map((x) => [x.key, x.label])} />
              </select>
              <p className="hint">Status Terdaftar diberikan otomatis lewat pendaftaran, jadi tidak ada di daftar ini.</p>
            </div>
            <div className="field span-all" hidden={Boolean(s)}>
              <label className="label" htmlFor="sf-note">Catatan awal</label>
              <textarea className="textarea" id="sf-note" rows="3" placeholder="Contoh: datang ke kantor bersama orang tua, ingin kelas offline mulai Desember."></textarea>
            </div>
          </div>
        </div>
        <footer className="dialog__foot">
          <FootEnd>
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit" id="sf-save">{s ? "Simpan perubahan" : "Simpan siswa"}</button>
          </FootEnd>
        </footer>
      </form>
    </Modal>
  );
}

/* ===================== Daftarkan siswa (the registration dialog) ===================== */
export function openDaftar(studentId = null) { openDialog({ kind: "daftar", studentId: studentId || null }); }

function DaftarDialog({ studentId }) {
  const person = studentId ? studentById(studentId) : null;
  const [pickedId, setPickedId] = useState(person ? person.id : null);
  const [q, setQ] = useState("");
  const [programId, setProgramId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const picked = pickedId ? studentById(pickedId) : null;

  const query = q.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  const hits = query ? db.students.filter((s) => {
    const text = `${s.name} ${s.email}`.toLowerCase();
    const waHit = digits.length >= 3 && (s.wa.includes(digits) || `0${s.wa.slice(2)}`).includes(digits);
    return text.includes(query) || waHit;
  }).slice(0, 6) : [];

  function pick(id) {
    const p = studentById(id);
    setPickedId(id);
    if (p) {
      $("#df-birthplace").value = p.tempatLahir || "";
      $("#df-birthdate").value = p.tanggalLahir || "";
      $("#df-provinsi").value = p.provinsi || "";
      $("#df-postal").value = p.kodePos || "";
      $("#df-jenjang").value = p.jenjang || "";
      $("#df-tahudari").value = p.tahuDari || "";
    }
    setTimeout(() => $("#df-program")?.focus(), 0);
  }

  const prog = programId ? programById(programId) : null;
  const classList = prog && periodId ? classesFor(prog.id, periodId) : [];

  async function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);
    const programId2 = $("#df-program").value || null;
    const periodId2 = $("#df-period").value || null;
    let first = null;
    const fail = (el, errId, msg) => { fieldError(el, errId, msg); if (!first) first = el; };
    if (!programId2) fail($("#df-program"), "df-program-err", "Program wajib dipilih.");
    if (!periodId2) fail($("#df-period"), "df-period-err", "Periode wajib dipilih.");
    const birthdate = $("#df-birthdate").value;
    if (birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) fail($("#df-birthdate"), "df-birthdate-err", "Tanggal lahir belum benar.");
    const body = {
      programId: programId2, periodId: periodId2,
      durationId: $("#df-duration").value || null,
      classId: $("#df-class").value || null,
      note: $("#df-note").value.trim(),
      tempatLahir: $("#df-birthplace").value.trim(),
      tanggalLahir: birthdate,
      provinsi: $("#df-provinsi").value.trim(),
      kodePos: $("#df-postal").value.trim(),
      jenjang: $("#df-jenjang").value,
      tahuDari: $("#df-tahudari").value,
    };
    if (pickedId) {
      body.studentId = pickedId;
    } else {
      const name = $("#df-name").value.trim().replace(/\s+/g, " ");
      const waRaw = $("#df-wa").value.trim();
      const wa = normalizeWa(waRaw);
      if (name.length < 2) fail($("#df-name"), "df-name-err", "Nama minimal 2 karakter, atau pilih orang yang sudah ada.");
      if (!waRaw) fail($("#df-wa"), "df-wa-err", "Nomor WhatsApp wajib diisi untuk orang baru.");
      else if (!/^62\d{8,13}$/.test(wa)) fail($("#df-wa"), "df-wa-err", "Nomor WhatsApp terlihat belum lengkap.");
      body.name = name; body.wa = wa;
      body.email = $("#df-email").value.trim().toLowerCase();
      body.city = $("#df-city").value.trim();
    }
    if (first) { first.focus(); return; }
    const done = busy($("#df-save"), "Menyimpan...");
    try {
      const r = await api("/api/admin/pendaftaran", { method: "POST", body });
      closeDialog();
      await reload();
      toast(`Pendaftaran tersimpan${r.studentId ? ` untuk ${firstName(studentById(r.studentId)?.name || "")}` : ""}.`, { label: "Buka profil", run: () => { location.hash = `#/siswa/${r.studentId}`; } });
    } catch (error) {
      if (error.field === "wa") fieldError($("#df-wa"), "df-wa-err", error.message);
      else if (error.field === "email") fieldError($("#df-email"), "df-email-err", error.message);
      else if (error.field === "tanggalLahir") fieldError($("#df-birthdate"), "df-birthdate-err", error.message);
      else fieldError(null, "df-err", error.message);
    } finally {
      done();
    }
  }

  return (
    <Modal id="dlg-daftar" className="dialog dialog--daftar" focus={person ? "#df-program" : "#df-q"} onClose={closeDialog}>
      <form className="dialog__form" onSubmit={save} noValidate>
        <Head title="Daftarkan siswa" sub="Cari orang yang sudah ada dulu. Orang yang sudah ada datanya tidak ditimpa; orang baru dibuatkan profil sekaligus." />
        <div className="dialog__body">
          <div className="form-grid">
            <p className="form-section span-all">Siapa yang didaftarkan</p>
            <div className="field span-all" hidden={Boolean(picked)}>
              <label className="label" htmlFor="df-q">Cari orang yang sudah ada</label>
              <input className="input" id="df-q" type="search" placeholder="Nama, email, atau nomor WhatsApp" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            </div>
            <div className="span-all pf-hits" hidden={Boolean(picked)}>
              {hits.length ? <>
                {hits.map((s) => (
                  <button key={s.id} className="btn btn--quiet btn--sm" type="button" onClick={() => pick(s.id)}>
                    {s.name}<span className="cell-sub">{s.email || fmtWa(s.wa)}{s.daftarCount ? ", sudah daftar" : ", lead"}</span>
                  </button>
                ))}
                <p className="hint">Atau isi data orang baru di bawah.</p>
              </> : <p className="hint">{query ? "Tidak ada yang cocok. Isi data orang baru di bawah." : "Atau langsung isi data orang baru di bawah."}</p>}
            </div>
            {picked ? <div className="field span-all">
              <p className="hint">{picked.daftarCount > 0 ? "Sudah pernah daftar" : "Belum pernah daftar"}: <strong>{picked.name}</strong>{picked.email ? `, ${picked.email}` : ""}, {fmtWa(picked.wa)}. Data lamanya tidak berubah.</p>
              <button className="btn btn--quiet btn--sm" type="button" onClick={() => { setPickedId(null); setQ(""); setTimeout(() => $("#df-q")?.focus(), 0); }}>Ganti orang</button>
            </div> : null}
            <div id="df-person-fields" className="span-all" hidden={Boolean(picked)}>
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="df-name">Nama lengkap</label>
                  <input className="input" id="df-name" type="text" autoComplete="off" placeholder="Wajib untuk orang baru" />
                  <p className="error" id="df-name-err" hidden></p>
                </div>
                <div className="field">
                  <label className="label" htmlFor="df-wa">WhatsApp</label>
                  <input className="input" id="df-wa" type="tel" inputMode="tel" autoComplete="off" placeholder="0812 3456 7890" />
                  <p className="error" id="df-wa-err" hidden></p>
                </div>
                <div className="field">
                  <label className="label" htmlFor="df-email">Email, opsional</label>
                  <input className="input" id="df-email" type="email" autoComplete="off" placeholder="nama@email.com" />
                  <p className="error" id="df-email-err" hidden></p>
                </div>
                <div className="field">
                  <label className="label" htmlFor="df-city">Kota/Kabupaten</label>
                  <input className="input" id="df-city" type="text" autoComplete="off" placeholder="Contoh: Malang" />
                </div>
              </div>
            </div>

            <p className="form-section span-all">Identitas</p>
            <div className="field">
              <label className="label" htmlFor="df-birthplace">Tempat lahir</label>
              <input className="input" id="df-birthplace" type="text" autoComplete="off" defaultValue={person?.tempatLahir || ""} placeholder="Contoh: Kediri" />
            </div>
            <div className="field">
              <label className="label" htmlFor="df-birthdate">Tanggal lahir</label>
              <input className="input" id="df-birthdate" type="date" autoComplete="off" defaultValue={person?.tanggalLahir || ""} />
              <p className="error" id="df-birthdate-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="df-provinsi">Provinsi</label>
              <input className="input" id="df-provinsi" type="text" autoComplete="off" defaultValue={person?.provinsi || ""} placeholder="Jawa Timur" />
            </div>
            <div className="field">
              <label className="label" htmlFor="df-postal">Kode pos</label>
              <input className="input" id="df-postal" type="text" inputMode="numeric" autoComplete="off" defaultValue={person?.kodePos || ""} placeholder="64111" />
            </div>
            <div className="field">
              <label className="label" htmlFor="df-jenjang">Jenjang pendidikan</label>
              <select className="select" id="df-jenjang" defaultValue={person?.jenjang || ""}>
                <OptList list={[["", "Pilih"], ...db.jenjang.map((j) => [j, j])]} />
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="df-tahudari">Tahu Titik Nol dari mana?</label>
              <select className="select" id="df-tahudari" defaultValue={person?.tahuDari || ""}>
                <OptList list={[["", "Pilih"], ...db.tahuDari.map((x) => [x, x])]} />
              </select>
            </div>

            <p className="form-section span-all">Program dan kelas</p>
            <div className="field">
              <label className="label" htmlFor="df-program">Program</label>
              <select className="select" id="df-program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <OptList list={[["", "Pilih program"], ...db.programs.filter((p) => p.status === "aktif").map((p) => [p.id, `${p.name}, ${p.mode}`])]} />
              </select>
              <p className="error" id="df-program-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="df-duration">Durasi</label>
              <select className="select" id="df-duration" disabled={!prog}>
                <OptList list={prog ? prog.durations.map((d) => [d.id, `${d.label}${d.price ? `, ${fmtRp(d.price)}` : ""}`]) : [["", "Pilih program dulu"]]} />
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="df-period">Periode</label>
              <select className="select" id="df-period" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
                <OptList list={[["", "Pilih periode"], ...periodsSorted().map((p) => [p.id, fmtDate(p.start)])]} />
              </select>
              <p className="error" id="df-period-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="df-class">Tutor / Kelas, opsional</label>
              <select className="select" id="df-class" disabled={!(prog && periodId)}>
                <OptList list={prog && periodId
                  ? [["", classList.length ? "Belum ada kelas" : "Belum ada kelas untuk program dan periode ini"], ...classList.map((c) => [c.id, classLabel(c)])]
                  : [["", "Pilih program dan periode dulu"]]} />
              </select>
            </div>
            <div className="field span-all">
              <label className="label" htmlFor="df-note">Catatan, opsional</label>
              <textarea className="textarea" id="df-note" rows="2" placeholder="Contoh: lanjut dari level sebelumnya, minta jadwal malam."></textarea>
            </div>
          </div>
          <p className="error" id="df-err" hidden></p>
        </div>
        <footer className="dialog__foot">
          <FootEnd>
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit" id="df-save">Simpan pendaftaran</button>
          </FootEnd>
        </footer>
      </form>
    </Modal>
  );
}

/* ===================== Edit one pendaftaran row ===================== */
export function openPendaftaranForm(id) {
  const p = db.pendaftaran.find((x) => x.id === id);
  if (!p) return;
  openDialog({ kind: "pendaftaran", id });
}

function PendaftaranDialog({ id }) {
  const p = db.pendaftaran.find((x) => x.id === id);
  const s = studentById(p.studentId);
  const [programId, setProgramId] = useState(p.programId);
  const [periodId, setPeriodId] = useState(p.periodId);
  const prog = programId ? programById(programId) : null;
  const classList = prog && periodId ? classesFor(prog.id, periodId) : [];

  async function save(e) {
    e.preventDefault();
    clearErrors(e.currentTarget);
    const body = {
      programId: $("#pdf-program").value || "",
      durationId: $("#pdf-duration").value || null,
      periodId: $("#pdf-period").value || "",
      classId: $("#pdf-class").value || null,
      status: $("#pdf-status").value,
      note: $("#pdf-note").value.trim(),
    };
    if (!body.programId || !body.periodId) { toast("Program dan periode wajib dipilih."); return; }
    const done = busy($("#pdf-save"), "Menyimpan...");
    try {
      await api(`/api/admin/pendaftaran/${p.id}`, { method: "PUT", body });
      closeDialog();
      await reload();
      toast("Pendaftaran diperbarui.");
    } catch (error) {
      if (!sessionEnded(error)) toast(error.message);
    } finally {
      done();
    }
  }

  return (
    <Modal id="dlg-pendaftaran" onClose={closeDialog}>
      <form className="dialog__form" onSubmit={save} noValidate>
        <Head title="Ubah pendaftaran" sub={`Pendaftaran ${firstName(s ? s.name : "siswa ini")} di ${programById(p.programId)?.name || "-"}.`} />
        <div className="dialog__body">
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="pdf-program">Program</label>
              <select className="select" id="pdf-program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <OptList list={[["", "Pilih program"], ...db.programs.filter((x) => x.status === "aktif" || x.id === p.programId).map((x) => [x.id, `${x.name}, ${x.mode}`])]} />
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="pdf-duration">Durasi</label>
              <select className="select" id="pdf-duration" disabled={!prog} defaultValue={p.durationId || ""}>
                <OptList list={prog ? prog.durations.map((d) => [d.id, `${d.label}${d.price ? `, ${fmtRp(d.price)}` : ""}`]) : [["", "Pilih program dulu"]]} />
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="pdf-period">Periode</label>
              <select className="select" id="pdf-period" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
                <OptList list={[["", "Pilih periode"], ...periodsSorted().map((x) => [x.id, fmtDate(x.start)])]} />
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="pdf-class">Tutor / Kelas</label>
              <select className="select" id="pdf-class" disabled={!(prog && periodId)} defaultValue={p.classId || ""}>
                <OptList list={prog && periodId
                  ? [["", classList.length ? "Belum ada kelas" : "Belum ada kelas untuk program dan periode ini"], ...classList.map((c) => [c.id, classLabel(c)])]
                  : [["", "Pilih program dan periode dulu"]]} />
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="pdf-status">Status pendaftaran</label>
              <select className="select" id="pdf-status" defaultValue={p.status}>
                <OptList list={[["aktif", "Aktif"], ["selesai", "Selesai"], ["batal", "Batal"]]} />
              </select>
              <p className="hint">Membatalkan pendaftaran mengembalikan orang ini ke daftar Lead kalau tidak ada pendaftaran lain.</p>
            </div>
            <div className="field span-all">
              <label className="label" htmlFor="pdf-note">Catatan</label>
              <textarea className="textarea" id="pdf-note" rows="2" defaultValue={p.note} placeholder="Contoh: lanjut ke level berikutnya, minta jadwal malam."></textarea>
            </div>
          </div>
        </div>
        <footer className="dialog__foot">
          <FootEnd>
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit" id="pdf-save">Simpan pendaftaran</button>
          </FootEnd>
        </footer>
      </form>
    </Modal>
  );
}

/* ===================== Programs ===================== */
export function openProgramDialog(id) { openDialog({ kind: "program", id: id || null }); }

function ProgramDialog({ id }) {
  const p = id ? programById(id) : null;
  const [rows, setRows] = useState(p ? p.durations.map((d) => ({ ...d })) : [{}]);

  function setRow(i, patch) {
    setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);
    const name = $("#pg-name").value.trim().replace(/\s+/g, " ");
    let first = null;
    const fail = (input, errId, msg) => { fieldError(input, errId, msg); if (!first) first = input || $("#pg-name"); };
    if (!name) fail($("#pg-name"), "pg-name-err", "Nama program wajib diisi.");
    else if (db.programs.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== id)) fail($("#pg-name"), "pg-name-err", "Nama program ini sudah ada.");
    if (!rows.length) fail(null, "pg-dur-err", "Tambahkan minimal satu durasi.");
    for (const r of rows) {
      if (!r.label) { fail($(`[aria-label="Nama durasi"][value=""]`), "pg-dur-err", "Setiap durasi perlu nama, misalnya 2 minggu atau 1 bulan."); break; }
      if (!Number.isInteger(r.days) || r.days < 1 || r.days > 365) { fail(null, "pg-dur-err", `Jumlah hari untuk ${r.label || "durasi ini"} harus antara 1 dan 365.`); break; }
      if (r.price !== null && r.price !== "" && r.price !== undefined && (!Number.isInteger(Number(r.price)) || Number(r.price) < 0)) { fail(null, "pg-dur-err", `Harga ${r.label} harus angka bulat dan tidak boleh negatif.`); break; }
    }
    if (!first && rows.length && new Set(rows.map((r) => String(r.label || "").toLowerCase())).size < rows.length) fail(null, "pg-dur-err", "Ada nama durasi yang sama. Setiap durasi harus berbeda.");
    if (!first && p) {
      const kept = new Set(rows.map((r) => r.id).filter(Boolean));
      const inUse = p.durations.filter((d) => !kept.has(d.id)).find((d) => db.students.some((s) => s.durationId === d.id));
      if (inUse) fail(null, "pg-dur-err", `Durasi ${inUse.label} masih dipakai ${db.students.filter((s) => s.durationId === inUse.id).length} siswa, jadi belum bisa dihapus.`);
    }
    if (first) { first.focus(); return; }
    const body = {
      name, mode: $("#pg-mode").value, status: $("#pg-status").value,
      tutors: $$("#pg-tutors input:checked").map((x) => x.value),
      durations: rows.map((r) => ({ id: r.id || null, label: String(r.label || "").trim(), days: Number(r.days), price: r.price === "" || r.price === null || r.price === undefined ? null : Number(r.price) })),
    };
    const done = busy($("#pg-save"), "Menyimpan...");
    try {
      await api(p ? `/api/admin/programs/${p.id}` : "/api/admin/programs", { method: p ? "PUT" : "POST", body });
      closeDialog();
      await reload();
      toast(p ? `${name} tersimpan.` : `${name} ditambahkan dan bisa dipilih di formulir siswa.`);
    } catch (error) {
      if (sessionEnded(error)) return;
      if (/^Nama program/.test(error.message)) { fieldError($("#pg-name"), "pg-name-err", error.message); $("#pg-name").focus(); }
      else fieldError(null, "pg-dur-err", error.message);
    } finally {
      done();
    }
  }

  return (
    <Modal id="dlg-program" focus="#pg-name" onClose={closeDialog}>
      <form className="dialog__form" onSubmit={save} noValidate>
        <Head title={p ? `Ubah ${p.name}` : "Tambah program"}
          sub={p ? `${db.students.filter((s) => s.stage === "terdaftar" && s.programId === p.id).length} siswa terdaftar memakai program ini.` : "Program baru langsung bisa dipilih di formulir siswa."} />
        <div className="dialog__body">
          <div className="form-grid">
            <div className="field span-all">
              <label className="label" htmlFor="pg-name">Nama program</label>
              <input className="input" id="pg-name" defaultValue={p ? p.name : ""} autoComplete="off" placeholder="Contoh: IELTS Online" />
              <p className="error" id="pg-name-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="pg-mode">Mode belajar</label>
              <select className="select" id="pg-mode" defaultValue={p ? p.mode : "Offline di Pare"}>
                {["Offline di Pare", "Online", "Online dan offline"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="pg-status">Status</label>
              <select className="select" id="pg-status" defaultValue={p ? p.status : "aktif"}><option value="aktif">Aktif, bisa dipilih saat mendaftar</option><option value="nonaktif">Nonaktif, tidak muncul di formulir</option></select>
            </div>
          </div>
          <fieldset className="field">
            <legend className="label">Durasi dan harga</legend>
            <p className="hint">Setiap durasi muncul sebagai pilihan saat mendaftarkan siswa. Jumlah hari dipakai untuk menghitung tanggal selesai dan jadwal post-test. Harga boleh dikosongkan.</p>
            <div className="dur-list">
              <div className="dur-row dur-head" aria-hidden="true"><span>Nama durasi</span><span>Hari</span><span className="dur-price">Harga (Rp)</span><span></span></div>
              {rows.map((d, i) => (
                <div key={i} className="dur-row">
                  <input className="input" aria-label="Nama durasi" placeholder="Contoh: 1 bulan" value={d.label || ""} onChange={(e) => setRow(i, { label: e.target.value })} />
                  <input className="input tnum" type="number" min="1" max="365" aria-label="Jumlah hari" placeholder="30" value={d.days ?? ""} onChange={(e) => setRow(i, { days: e.target.value === "" ? "" : Number(e.target.value) })} />
                  <input className="input tnum dur-price" type="number" min="0" step="50000" aria-label="Harga dalam rupiah" placeholder="Boleh kosong" value={d.price ?? ""} onChange={(e) => setRow(i, { price: e.target.value === "" ? "" : Number(e.target.value) })} />
                  <button className="icon-btn" type="button" aria-label="Hapus durasi ini" onClick={() => setRows((list) => list.filter((_, j) => j !== i))}><Icon name="trash" cls="icon--sm" /></button>
                </div>
              ))}
            </div>
            <div><button className="btn btn--quiet btn--sm" type="button" onClick={() => setRows((list) => [...list, {}])}><Icon name="plus" cls="icon--sm" />Tambah durasi</button></div>
            <p className="error" id="pg-dur-err" hidden></p>
          </fieldset>
          <fieldset className="field">
            <legend className="label">Tutor yang mengajar</legend>
            <p className="hint">Hanya tutor yang dicentang yang bisa dipilih saat membuat kelas untuk program ini.</p>
            <div className="check-grid">
              {db.tutors.length
                ? db.tutors.map((t) => <label key={t} className="check"><input type="checkbox" value={t} defaultChecked={Boolean(p && p.tutors.includes(t))} /><span>{t}</span></label>)
                : <p className="hint">Belum ada tutor. Tambahkan tutor di tab Kelas &amp; Tutor, lalu centang namanya di sini.</p>}
            </div>
            <p className="error" id="pg-tutor-err" hidden></p>
          </fieldset>
        </div>
        <footer className="dialog__foot">
          <FootEnd>
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit" id="pg-save">Simpan program</button>
          </FootEnd>
        </footer>
      </form>
    </Modal>
  );
}

/* ===================== Certificate type dialog ===================== */
export function openCertTypeDialog(id) { openDialog({ kind: "certtype", id: id || null }); }

function CertTypeDialog({ id }) {
  const t = id ? certTypeById(id) : null;
  const tplKey0 = t ? t.template : db.certs.templates[0]?.key || "";
  const tpl0 = certTemplateOf(tplKey0);
  const [template, setTemplate] = useState(tplKey0);
  const [name, setName] = useState(t ? t.name : "");
  const [code, setCode] = useState(t ? t.code : "");
  const [format, setFormat] = useState(t ? t.format : "{nomor}/{kode}/TNEC/{bulan_romawi}/{tahun}");
  const [reset, setReset] = useState(t ? t.reset : "tahun");
  const [last, setLast] = useState(String(t ? certCounter(t, todayIso()) : 0));
  const [lastDirty, setLastDirty] = useState(false);
  const [signer, setSigner] = useState(t ? t.signerName : tpl0 ? tpl0.signer.name : "");
  const [role, setRole] = useState(t ? t.signerRole : tpl0 ? tpl0.signer.role : "");
  const formatRef = useRef(null);
  const today = todayIso();
  const lastNum = Number(last);
  const top = t ? topIssuedSeq(t.id, reset, today) : 0;

  function changeTemplate(key) {
    const before = certTemplateOf(template), next = certTemplateOf(key);
    setTemplate(key);
    if (!next) return;
    if (!signer.trim() || (before && signer.trim() === before.signer.name)) setSigner(next.signer.name);
    if (!role.trim() || (before && role.trim() === before.signer.role)) setRole(next.signer.role);
  }

  function insertToken(token) {
    const input = formatRef.current;
    const from = input.selectionStart ?? input.value.length, to = input.selectionEnd ?? input.value.length;
    input.setRangeText(token, from, to, "end");
    setFormat(input.value);
    input.focus();
  }

  const problem = certFormatProblem(format, reset);
  const preview = problem
    ? "Contoh nomor muncul lagi setelah formatnya diperbaiki."
    : last === "" || !Number.isInteger(lastNum) || lastNum < 0 || lastNum > 999999
      ? "Isi nomor terakhir dengan angka bulat untuk melihat nomor berikutnya."
      : <>{`Sertifikat berikutnya bernomor `}<strong className="num-code">{formatCertNumber(format, lastNum + 1, code.trim() || "KODE", today)}</strong>.</>;

  async function save(e) {
    e.preventDefault();
    clearErrors(e.currentTarget);
    const signerName = signer.trim().replace(/\s+/g, " ");
    const signerRole = role.trim().replace(/\s+/g, " ");
    let first = null;
    const fail = (input, errId, msg) => { fieldError(input, errId, msg); if (!first) first = input; };
    if (name.trim().length < 2) fail($("#ct-name"), "ct-name-err", "Nama sertifikat minimal 2 karakter.");
    else if (db.certs.types.some((x) => x.id !== id && x.name.toLowerCase() === name.trim().toLowerCase())) fail($("#ct-name"), "ct-name-err", "Jenis sertifikat dengan nama ini sudah ada.");
    if (!code.trim() || /\s/.test(code)) fail($("#ct-code"), "ct-code-err", "Kode wajib diisi tanpa spasi, misalnya COMP.");
    if (!certTemplateOf(template)) fail($("#ct-template"), "ct-template-err", "Pilih template sertifikat.");
    if (problem) fail($("#ct-format"), "ct-format-err", problem);
    if (last === "" || !Number.isInteger(lastNum) || lastNum < 0 || lastNum > 999999) fail($("#ct-last"), "ct-last-err", "Nomor terakhir harus angka bulat dari 0 sampai 999999.");
    else if (lastNum < top) fail($("#ct-last"), "ct-last-err", `Nomor terakhir tidak bisa di bawah ${top}, karena nomor itu sudah terbit di ${certPeriodLabel(reset, today)}.`);
    if (!signerName) fail($("#ct-signer"), "ct-signer-err", "Nama penanda tangan wajib diisi.");
    if (!signerRole) fail($("#ct-role"), "ct-role-err", "Jabatan penanda tangan wajib diisi.");
    if (first) { first.focus(); return; }
    const body = { name: name.trim().replace(/\s+/g, " "), code: code.trim(), template, format: format.trim(), reset, signerName, signerRole, status: $("#ct-status").value };
    // The counter is only sent when someone typed a new last number, so saving a signer change never
    // fights with a certificate that was issued while the dialog was open.
    if (lastDirty) body.lastNumber = lastNum;
    const done = busy($("#ct-save"), "Menyimpan...");
    try {
      await api(id ? `/api/admin/certificate-types/${id}` : "/api/admin/certificate-types", { method: id ? "PUT" : "POST", body });
      closeDialog();
      await reload();
      toast(id ? `${body.name} tersimpan.` : `${body.name} ditambahkan dan bisa dipilih saat menerbitkan sertifikat.`);
    } catch (error) {
      if (!sessionEnded(error)) showFieldError(error, CT_FIELDS[error.field]);
    } finally {
      done();
    }
  }

  return (
    <Modal id="dlg-certtype" focus="#ct-name" onClose={closeDialog}>
      <form className="dialog__form" onSubmit={save} noValidate>
        <Head title={t ? `Ubah ${t.name}` : "Tambah jenis sertifikat"}
          sub={t
            ? (db.certs.issued.filter((c) => c.typeId === t.id).length ? `${db.certs.issued.filter((c) => c.typeId === t.id).length} sertifikat sudah terbit dengan jenis ini. Perubahan hanya berlaku untuk sertifikat berikutnya.` : "Belum ada sertifikat yang terbit dengan jenis ini.")
            : "Jenis baru langsung bisa dipilih saat menerbitkan sertifikat."} />
        <div className="dialog__body">
          <div className="form-grid">
            <div className="field span-all">
              <label className="label" htmlFor="ct-name">Nama sertifikat</label>
              <input className="input" id="ct-name" maxLength="80" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: TOEFL Prediction" />
              <p className="error" id="ct-name-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="ct-code">Kode</label>
              <input className="input" id="ct-code" maxLength="20" spellCheck="false" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Contoh: TOEFL" />
              <p className="hint">Masuk ke nomor lewat isian {`{kode}`}.</p>
              <p className="error" id="ct-code-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="ct-template">Template</label>
              <select className="select" id="ct-template" value={template} onChange={(e) => changeTemplate(e.target.value)}>
                <OptList list={db.certs.templates.map((x) => [x.key, `${x.name}, ${x.paper}`])} />
              </select>
              <p className="error" id="ct-template-err" hidden></p>
            </div>
            <p className="form-section span-all">Nomor sertifikat</p>
            <div className="field span-all">
              <label className="label" htmlFor="ct-format">Format nomor</label>
              <input className="input" id="ct-format" maxLength="120" spellCheck="false" ref={formatRef} value={format} onChange={(e) => setFormat(e.target.value)} />
              <div className="chips token-chips" role="group" aria-label="Tambahkan isian ke format nomor">
                {["{nomor}", "{nomor:3}", "{kode}", "{bulan}", "{bulan_romawi}", "{tahun}"].map((tok) => (
                  <button key={tok} className="chip" type="button" onClick={() => insertToken(tok)}>{tok}</button>
                ))}
              </div>
              <p className="hint">Klik isian untuk menambahkannya. Teks lain ditulis apa adanya, dan {`{nomor:3}`} menulis nomor tiga digit seperti 007.</p>
              <p className="hint">Contoh: {`{nomor}`}/MoM/MKT/TNEC/{`{bulan_romawi}`}/{`{tahun}`} menjadi 146/MoM/MKT/TNEC/XI/2026.</p>
              <p className="error" id="ct-format-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="ct-reset">Nomor kembali ke 1</label>
              <select className="select" id="ct-reset" value={reset}
                onChange={(e) => {
                  setReset(e.target.value);
                  if (!lastDirty) setLast(String(t ? certCounter(t, todayIso(), e.target.value) : 0));
                }}>
                <option value="tahun">Setiap tahun</option><option value="bulan">Setiap bulan</option><option value="tidak">Tidak pernah</option>
              </select>
              <p className="error" id="ct-reset-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="ct-last">Nomor terakhir</label>
              <input className="input tnum" id="ct-last" type="number" min="0" max="999999" step="1" inputMode="numeric" value={last}
                onChange={(e) => { setLast(e.target.value); setLastDirty(true); }} />
              <p className="hint">Nomor yang sudah terpakai di {certPeriodLabel(reset, today)}.{top ? ` Paling kecil ${top}, karena nomor itu sudah terbit.` : ""}</p>
              <p className="error" id="ct-last-err" hidden></p>
            </div>
            <p className="note span-all" aria-live="polite">{preview}</p>
            <p className="form-section span-all">Penanda tangan</p>
            <div className="field">
              <label className="label" htmlFor="ct-signer">Nama</label>
              <input className="input" id="ct-signer" maxLength="80" value={signer} onChange={(e) => setSigner(e.target.value)} />
              <p className="error" id="ct-signer-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="ct-role">Jabatan</label>
              <input className="input" id="ct-role" maxLength="80" value={role} onChange={(e) => setRole(e.target.value)} />
              <p className="error" id="ct-role-err" hidden></p>
            </div>
            <div className="field span-all">
              <label className="label" htmlFor="ct-status">Status</label>
              <select className="select" id="ct-status" defaultValue={t ? t.status : "aktif"}><option value="aktif">Aktif, bisa dipilih saat menerbitkan</option><option value="nonaktif">Nonaktif, tidak muncul saat menerbitkan</option></select>
            </div>
          </div>
        </div>
        <footer className="dialog__foot">
          <FootEnd>
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit" id="ct-save">{t ? "Simpan perubahan" : "Simpan jenis"}</button>
          </FootEnd>
        </footer>
      </form>
    </Modal>
  );
}

/* ===================== Issue or edit a certificate ===================== */
const CT_FIELDS = { name: "ct-name", code: "ct-code", template: "ct-template", reset: "ct-reset", format: "ct-format", signer: "ct-signer", role: "ct-role", last: "ct-last" };
const CR_FIELDS = { student: "cr-student", type: "cr-type", date: "cr-date", recipient: "cr-name" };
/* Shows a server error on its input when the input is visible, otherwise as a toast. */
function showFieldError(error, inputId) {
  const input = inputId ? $(`#${inputId}`) : null;
  if (!input || input.closest("[hidden]")) { toast(error.message); return; }
  fieldError(input, `${inputId}-err`, error.message);
  input.focus();
}

export function openCertDialog({ studentId = null, certId = null } = {}) {
  const c = certId ? certById(certId) : null;
  if (certId && !c) return;
  if (c && c.revokedAt) { toast("Sertifikat yang dibatalkan tidak bisa diubah. Pulihkan dulu kalau masih dipakai."); return; }
  const active = db.certs.types.filter((t) => t.status === "aktif");
  if (!c && !active.length) {
    toast("Belum ada jenis sertifikat yang aktif.", { label: "Buka Pengaturan", run: () => { location.hash = "#/sertifikat/pengaturan"; } });
    return;
  }
  if (!c && !db.students.length) { toast("Belum ada siswa di Database Siswa."); return; }
  openDialog({ kind: "cert", studentId, certId });
}

function CertDialog({ studentId, certId }) {
  const c = certId ? certById(certId) : null;
  const fixedStudent = c ? (c.studentId ? studentById(c.studentId) : null) : studentId ? studentById(studentId) : null;
  const active = db.certs.types.filter((t) => t.status === "aktif");
  const [typeId, setTypeId] = useState(c ? c.typeId : (active.find((t) => t.id === ui.certs.type) || active[0]).id);
  const [studentId2, setStudentId2] = useState(fixedStudent ? fixedStudent.id : "");
  const [q, setQ] = useState("");
  const [dateIso, setDateIso] = useState(c ? c.issuedOn : todayIso());
  const [recipient, setRecipient] = useState(c ? c.recipient : fixedStudent ? fixedStudent.name : "");
  const nameDirty = useRef(false);
  const [typed, setTyped] = useState(c ? { ...c.details } : {});
  const prefill = useRef(certPrefill(fixedStudent));

  const type = c ? certTypeById(c.typeId) : certTypeById(typeId);
  const tpl = certTemplateOf(c ? c.template : type?.template);

  const query = q.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  const match = (s) => !query || `${s.name} ${s.email}`.toLowerCase().includes(query) || (digits.length >= 3 && (s.wa.includes(digits) || `0${s.wa.slice(2)}`).includes(digits));
  const list = db.students.filter(match).sort((a, b) => a.name.localeCompare(b.name, "id"));
  const enrolled = list.filter((s) => s.stage === "terdaftar"), others = list.filter((s) => s.stage !== "terdaftar");
  const LIMIT = 300;
  const shown = [...enrolled.slice(0, LIMIT), ...others.slice(0, LIMIT)];

  function applyStudent(id) {
    const s = studentById(id);
    setStudentId2(s ? s.id : "");
    if (!nameDirty.current) setRecipient(s ? s.name : "");
    const next = certPrefill(s);
    setTyped((t) => mergeCertValues(t, next, prefill.current));
    prefill.current = next;
  }

  // While searching, the first match is picked when the current choice is filtered out.
  useEffect(() => {
    if (c || fixedStudent) return;
    const keep = shown.some((s) => s.id === studentId2);
    if (!keep && query && shown.length) applyStudent(shown[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const values = mergeCertValues(typed, prefill.current, prefill.current);

  async function save(e) {
    e.preventDefault();
    clearErrors(e.currentTarget);
    const details = {};
    for (const f of tpl ? tpl.fields : []) details[f.key] = String(values[f.key] ?? "").trim();
    let first = null;
    const fail = (input, errId, msg) => { fieldError(input, errId, msg); if (!first) first = input; };
    if (!c && !studentById(studentId2)) fail($("#cr-student").closest("[hidden]") ? null : $("#cr-student"), "cr-student-err", "Pilih siswa penerima sertifikat.");
    if (!c && !type) fail($("#cr-type"), "cr-type-err", "Pilih jenis sertifikat.");
    if (!c && !dateIso) fail($("#cr-date"), "cr-date-err", "Pilih tanggal terbit.");
    const nameOnCert = recipient.trim().replace(/\s+/g, " ");
    if (nameOnCert.length < 2) fail($("#cr-name"), "cr-name-err", "Nama di sertifikat minimal 2 karakter.");
    for (const f of tpl ? tpl.fields : []) if (!details[f.key]) fail($(`#cr-f-${f.key}`), `cr-f-${f.key}-err`, `${f.label} wajib diisi.`);
    if (details.mulai && details.selesai && details.selesai < details.mulai) fail($("#cr-f-selesai"), "cr-f-selesai-err", "Selesai belajar tidak boleh lebih awal dari mulai belajar.");
    if (first) { first.focus(); return; }
    if (!c && !studentById(studentId2)) { toast("Data siswa ini sudah tidak ada. Tutup dialog lalu pilih siswa lain."); return; }
    const done = busy($("#cr-save"), c ? "Menyimpan..." : "Menerbitkan...");
    try {
      const r = c
        ? await api(`/api/admin/certificates/${c.id}`, { method: "PUT", body: { recipient: nameOnCert, details } })
        : await api("/api/admin/certificates", { method: "POST", body: { typeId: type.id, studentId: studentId2, recipient: nameOnCert, issuedOn: dateIso, details } });
      closeDialog();
      await reload();
      const id = c ? c.id : r.id;
      toast(c ? `Data sertifikat ${r.number} tersimpan.` : `Sertifikat ${r.number} terbit.`, { label: "Cetak", run: () => openCertPage(id) });
    } catch (error) {
      if (sessionEnded(error)) return;
      const key = error.field && !CR_FIELDS[error.field] && $(`#cr-f-${error.field}`) ? `cr-f-${error.field}` : CR_FIELDS[error.field];
      showFieldError(error, key);
    } finally {
      done();
    }
  }

  const numberNote = c
    ? <>Nomor <strong className="num-code">{c.number}</strong>, jenis, dan tanggal terbit tidak berubah.</>
    : !type || !dateIso
      ? "Pilih jenis dan tanggal terbit untuk melihat nomornya."
      : <>Perkiraan nomor: <strong className="num-code">{nextCertNumber(type, dateIso)}</strong>. Nomor pastinya diberikan saat sertifikat disimpan.</>;

  return (
    <Modal id="dlg-cert" focus={c || fixedStudent ? "#cr-name" : "#cr-student-q"} onClose={closeDialog}>
      <form className="dialog__form" onSubmit={save} noValidate>
        <Head title={c ? "Ubah data sertifikat" : fixedStudent ? `Terbitkan sertifikat untuk ${firstName(fixedStudent.name)}` : "Terbitkan sertifikat"}
          sub={c ? `${certTypeName(c)}, terbit ${fmtDateLong(c.issuedAt)}` : "Nomor diberikan otomatis saat sertifikat disimpan."} />
        <div className="dialog__body">
          <div className="form-grid">
            <div className="field span-all" hidden={Boolean(c || fixedStudent)}>
              <label className="label" htmlFor="cr-student-q">Siswa</label>
              <input className="input" id="cr-student-q" type="search" autoComplete="off" placeholder="Cari nama, email, atau WhatsApp" value={q} onChange={(e) => setQ(e.target.value)} />
              <label className="sr-only" htmlFor="cr-student">Pilih siswa</label>
              <select className="select" id="cr-student" value={studentId2} onChange={(e) => applyStudent(e.target.value)}>
                <option value="">{list.length ? "Pilih siswa" : "Tidak ada siswa yang cocok"}</option>
                {enrolled.length ? <optgroup label="Terdaftar">{enrolled.slice(0, LIMIT).map((s) => <option key={s.id} value={s.id}>{s.name}{s.wa ? `, ${fmtWa(s.wa)}` : ""}</option>)}</optgroup> : null}
                {others.length ? <optgroup label="Belum terdaftar">{others.slice(0, LIMIT).map((s) => <option key={s.id} value={s.id}>{s.name}{s.wa ? `, ${fmtWa(s.wa)}` : ""}</option>)}</optgroup> : null}
              </select>
              <p className="error" id="cr-student-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="cr-type">Jenis sertifikat</label>
              <select className="select" id="cr-type" disabled={Boolean(c)} value={c ? c.typeId : typeId}
                onChange={(e) => {
                  // Values typed for another template are kept, so switching back and forth loses nothing.
                  setTyped((t) => mergeCertValues(t, prefill.current, prefill.current));
                  setTypeId(e.target.value);
                }}>
                {c
                  ? <option value={c.typeId}>{certTypeName(c)}</option>
                  : active.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <p className="error" id="cr-type-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="cr-date">Tanggal terbit</label>
              <input className="input" id="cr-date" type="date" disabled={Boolean(c)} value={dateIso} onChange={(e) => setDateIso(e.target.value)} />
              <p className="error" id="cr-date-err" hidden></p>
            </div>
            <div className="field span-all">
              <label className="label" htmlFor="cr-name">Nama di sertifikat</label>
              <input className="input" id="cr-name" maxLength="80" value={recipient} onChange={(e) => { setRecipient(e.target.value); nameDirty.current = true; }} autoComplete="off" />
              <p className="hint">Tertulis persis seperti ini di sertifikat.</p>
              <p className="error" id="cr-name-err" hidden></p>
            </div>
            <p className="note span-all" aria-live="polite">{numberNote}</p>
            <p className="form-section span-all" hidden={!tpl || !tpl.fields.length}>Isi sertifikat</p>
            <div className="form-grid span-all">
              {(tpl ? tpl.fields : []).map((f) => (
                <div key={f.key} className={`field${f.wide ? " span-all" : ""}`}>
                  <label className="label" htmlFor={`cr-f-${f.key}`}>{f.label}</label>
                  {f.type === "date"
                    ? <input className="input" id={`cr-f-${f.key}`} type="date" value={values[f.key] ?? ""} onChange={(e) => setTyped((t) => ({ ...t, [f.key]: e.target.value }))} autoComplete="off" />
                    : <input className="input" id={`cr-f-${f.key}`} maxLength={f.max || 80} value={values[f.key] ?? ""} onChange={(e) => setTyped((t) => ({ ...t, [f.key]: e.target.value }))} placeholder={`Contoh: ${f.sample}`} autoComplete="off" />}
                  <p className="error" id={`cr-f-${f.key}-err`} hidden></p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <footer className="dialog__foot">
          <FootEnd>
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit" id="cr-save">{c ? "Simpan perubahan" : "Terbitkan"}</button>
          </FootEnd>
        </footer>
      </form>
    </Modal>
  );
}

/* ===================== WhatsApp ===================== */
export function openWhatsApp(s, opts = {}) {
  if (!s) return;
  if (!s.wa) { toast("Siswa ini belum punya nomor WhatsApp."); return; }
  openDialog({ kind: "wa", studentId: s.id, opts });
}

function WaDialog({ studentId, opts }) {
  const s = studentById(studentId);
  const [text, setText] = useState(opts.text || greetingFor(s));
  const [copied, setCopied] = useState("");
  const on = db.whatsapp.configured;
  const trimmed = text.trim();

  async function send(e) {
    e.preventDefault();
    clearErrors(e.currentTarget);
    if (!s) return;
    if (!trimmed) { fieldError($("#wa-text"), "wa-err", "Tulis pesan dulu sebelum mengirim."); $("#wa-text").focus(); return; }
    if (trimmed.length > 4000) { fieldError($("#wa-text"), "wa-err", "Pesan terlalu panjang. Batasnya 4.000 karakter."); $("#wa-text").focus(); return; }
    const done = busy($("#wa-send"), "Mengirim...");
    let sent = false;
    try {
      await api(`/api/admin/students/${s.id}/whatsapp`, { method: "POST", body: { text: trimmed, label: opts.label } });
      sent = true;
      closeDialog();
      toast(`Pesan WhatsApp terkirim ke ${firstName(s.name)}.`);
    } catch (error) {
      if (sessionEnded(error)) return;
      fieldError($("#wa-text"), "wa-err", error.message);
    } finally {
      done();
    }
    // Failed sends are logged too, so the activity feed is refreshed either way.
    reload().catch(() => {});
    if (!sent) return;
  }

  async function copy() {
    try { await navigator.clipboard.writeText(opts.link || ""); setCopied("Tersalin"); }
    catch { $("#wa-link")?.focus(); $("#wa-link")?.select(); setCopied("Tekan Ctrl+C"); }
    setTimeout(() => setCopied(""), 2400);
  }

  return (
    <Modal id="dlg-wa" focus="#wa-text" onClose={closeDialog}>
      <form className="dialog__form" onSubmit={send} noValidate>
        <Head title={opts.title || `Kirim WhatsApp ke ${firstName(s?.name || "")}`} sub={`${s?.name || ""}, ${fmtWa(s?.wa)}`} />
        <div className="dialog__body">
          <div className="notice notice--neutral" hidden={on} role="note"><Icon name="alert" /><div className="notice__body">Pengiriman lewat AttCos belum aktif karena API key belum diisi di server. Untuk sementara, pakai tombol Buka di WhatsApp dan kirim pesannya dari aplikasi.</div></div>
          <div className="field" hidden={!opts.link}>
            <label className="label" htmlFor="wa-link">Tautan tes</label>
            <div className="copy-row">
              <input className="input" id="wa-link" type="text" readOnly value={opts.link || ""} />
              <button className="btn btn--quiet btn--sm" type="button" onClick={copy}>{copied || "Salin"}</button>
            </div>
            <p className="hint">{opts.linkHint || ""}</p>
          </div>
          <div className="field">
            <div className="wa-meta"><label className="label" htmlFor="wa-text">Pesan</label><span className="hint">{`${fmtNum(text.length)} dari 4.000 karakter`}</span></div>
            <textarea className="textarea" id="wa-text" rows="8" maxLength="4000" value={text} onChange={(e) => setText(e.target.value)}></textarea>
            <p className="error" id="wa-err" hidden></p>
          </div>
          <p className="note">Pesan dikirim dari nomor WhatsApp Titik Nol lewat AttCos dan tercatat di aktivitas siswa. WhatsApp hanya meneruskan pesan biasa kalau siswa mengirim pesan ke nomor Titik Nol dalam 24 jam terakhir. Untuk kontak pertama, pakai tombol Buka di WhatsApp supaya pesannya terkirim dari aplikasi di perangkat ini.</p>
        </div>
        <footer className="dialog__foot">
          <a className="link-btn" href={`https://wa.me/${s?.wa}?text=${encodeURIComponent(trimmed)}`} target="_blank" rel="noopener noreferrer"><Icon name="message" cls="icon--sm" />Buka di WhatsApp</a>
          <div className="dialog__foot-end">
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit" id="wa-send" disabled={!on}>Kirim pesan</button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}

/* ===================== Generic form dialog ===================== */
export function openFormDialog(spec) { openDialog({ kind: "form", spec }); }

function FormDialog({ spec }) {
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);
    const values = {};
    spec.fields.forEach((f) => { values[f.id] = $(`#gf-${f.id}`).value.trim(); });
    let bad = null;
    const fail = (id, msg) => { fieldError($(`#gf-${id}`), `gf-${id}-err`, msg); if (!bad) bad = $(`#gf-${id}`); return false; };
    const done = busy($("#gf-save"), "Menyimpan...");
    let ok = false;
    try { ok = await spec.onSubmit(values, fail); } finally { done(); }
    if (bad) { bad.focus(); return; }
    if (ok !== false) closeDialog();
  }

  return (
    <Modal id="dlg-form" className="dialog dialog--sm" focus={`#gf-${spec.fields[0].id}`} onClose={closeDialog}>
      <form className="dialog__form" onSubmit={submit} noValidate>
        <Head title={spec.title} sub={spec.sub || ""} />
        <div className="dialog__body">
          {spec.fields.map((f) => (
            <div className="field" key={f.id}>
              <label className="label" htmlFor={`gf-${f.id}`}>{f.label}</label>
              {f.type === "select"
                ? <select className="select" id={`gf-${f.id}`} defaultValue={f.value ?? ""}><OptList list={f.options} /></select>
                : f.type === "textarea"
                  ? <textarea className="textarea" id={`gf-${f.id}`} rows="3" defaultValue={f.value ?? ""}></textarea>
                  : <input className="input" id={`gf-${f.id}`} type={f.type || "text"} defaultValue={f.value ?? ""} placeholder={f.placeholder || ""} min={f.min} max={f.max} autoComplete="off" />}
              {f.hint ? <p className="hint">{f.hint}</p> : null}
              <p className="error" id={`gf-${f.id}-err`} hidden></p>
            </div>
          ))}
        </div>
        <footer className="dialog__foot">
          <FootEnd>
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit" id="gf-save">{spec.submitLabel}</button>
          </FootEnd>
        </footer>
      </form>
    </Modal>
  );
}

/* ===================== Confirm dialog (promise based) ===================== */
export function confirmDialog({ title, message, confirmLabel, danger = true, reasonLabel = "", reasonPlaceholder = "" }) {
  return new Promise((resolve) => {
    openDialog({ kind: "confirm", resolve, spec: { title, message, confirmLabel, danger, reasonLabel, reasonPlaceholder } });
  });
}

function ConfirmDialog({ spec, resolve }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    (spec.reasonLabel ? $("#cf-reason") : $("#cf-cancel"))?.focus();
    const handler = () => resolve({ ok: d.returnValue === "ok", reason: $("#cf-reason").value.trim() });
    d.addEventListener("close", handler, { once: true });
    return () => { d.removeEventListener("close", handler); if (d.open) d.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <dialog ref={ref} id="dlg-confirm" className="dialog dialog--sm" aria-labelledby="cf-title" aria-describedby="cf-message">
      <form className="dialog__form" method="dialog">
        <header className="dialog__head"><h2 className="dialog__title" id="cf-title">{spec.title}</h2></header>
        <div className="dialog__body">
          <p className="dialog__text" id="cf-message">{spec.message}</p>
          <div className="field" hidden={!spec.reasonLabel}>
            <label className="label" htmlFor="cf-reason" id="cf-reason-label">{spec.reasonLabel}</label>
            <textarea className="textarea" id="cf-reason" rows="3" placeholder={spec.reasonPlaceholder}></textarea>
          </div>
        </div>
        <footer className="dialog__foot">
          <div className="dialog__foot-end">
            <button className="btn btn--quiet" value="cancel" id="cf-cancel">Batal</button>
            <button className={`btn ${spec.danger ? "btn--danger" : "btn--primary"}`} value="ok" id="cf-ok">{spec.confirmLabel}</button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

export async function confirmThen(title, message, confirmLabel, work, success) {
  const r = await confirmDialog({ title, message, confirmLabel });
  if (r.ok) await mutate(work, success);
}

/* ===================== Period, class, and tutor dialogs (generic form specs) ===================== */
function failFrom(error, fail, fieldId) {
  if (sessionEnded(error)) return false;
  return fail(fieldId, error.message);
}

export function openPeriodDialog(id) {
  const p = id ? db.periods.find((x) => x.id === id) : null;
  openFormDialog({
    title: p ? "Ubah periode" : "Tambah periode", sub: "Periode adalah tanggal mulai kelas. Di Pare biasanya tanggal 10 dan 25 setiap bulan.",
    submitLabel: p ? "Simpan periode" : "Tambah periode",
    fields: [
      { id: "start", label: "Tanggal mulai", type: "date", value: p ? p.startDate : "" },
      { id: "note", label: "Catatan", value: p ? p.note : "", placeholder: "Contoh: periode libur akhir tahun", hint: "Boleh dikosongkan." },
    ],
    async onSubmit(v, fail) {
      if (!v.start) return fail("start", "Pilih tanggal mulai.");
      if (db.periods.some((x) => x !== p && x.startDate === v.start)) return fail("start", "Periode dengan tanggal ini sudah ada.");
      try {
        await api(p ? `/api/admin/periods/${p.id}` : "/api/admin/periods", { method: p ? "PUT" : "POST", body: { startDate: v.start, note: v.note } });
      } catch (error) { return failFrom(error, fail, "start"); }
      await reload();
      toast(p ? "Periode tersimpan." : `Periode ${fmtDate(Date.parse(`${v.start}T08:00:00+07:00`))} ditambahkan.`);
      return true;
    },
  });
}

export function openClassDialog(id) {
  const c = id ? db.classes.find((x) => x.id === id) : null;
  const programs = db.programs.filter((p) => p.status === "aktif" || (c && p.id === c.programId));
  const missing = [!programs.length && "program aktif", !db.periods.length && "periode", !db.tutors.length && "tutor"].filter(Boolean);
  if (!c && missing.length) { toast(`Tambahkan ${joinWords(missing)} dulu sebelum membuat kelas.`); return; }
  const nextPeriod = periodsSorted().find((p) => p.start > NOW) || currentPeriod();
  const defaultPeriod = c ? c.periodId : (db.periods.some((p) => p.id === ui.classes.period) ? ui.classes.period : nextPeriod.id);
  const defaultProgram = c ? c.programId : (programs.some((p) => p.id === ui.classes.program) ? ui.classes.program : programs[0].id);
  const defaultTutor = c ? c.tutor : (programById(defaultProgram)?.tutors[0] || db.tutors[0]);
  openFormDialog({
    title: c ? `Ubah kelas ${c.code}` : "Tambah kelas", sub: "Kelas menggabungkan satu program, satu periode, dan satu tutor.",
    submitLabel: c ? "Simpan kelas" : "Tambah kelas",
    fields: [
      { id: "code", label: "Kode kelas", value: c ? c.code : `C${db.classes.filter((x) => x.periodId === defaultPeriod).length + 1}`, placeholder: "Contoh: C1", hint: "Kode harus unik dalam satu periode." },
      { id: "program", label: "Program", type: "select", value: defaultProgram, options: programs.map((p) => [p.id, p.name]) },
      { id: "period", label: "Periode", type: "select", value: defaultPeriod, options: periodsSorted().map((p) => [p.id, fmtDate(p.start)]) },
      { id: "tutor", label: "Tutor", type: "select", value: defaultTutor, options: db.tutors.map((t) => [t, t]), hint: "Tutor harus tercentang di program yang dipilih." },
      { id: "capacity", label: "Kapasitas", type: "number", value: c ? c.capacity : 20, min: 1, max: 100 },
    ],
    async onSubmit(v, fail) {
      const code = v.code.toUpperCase().replace(/\s+/g, "");
      const capacity = Number(v.capacity);
      const p = programById(v.program);
      if (!code) return fail("code", "Kode kelas wajib diisi.");
      if (code.length > 8) return fail("code", "Kode kelas maksimal 8 karakter.");
      if (db.classes.some((x) => x !== c && x.periodId === v.period && x.code === code)) return fail("code", `Kode ${code} sudah dipakai di periode ini.`);
      if (!p || !p.tutors.includes(v.tutor)) return fail("tutor", `${v.tutor} belum tercatat sebagai tutor ${p ? p.name : "program ini"}. Centang namanya di formulir program dulu.`);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return fail("capacity", "Kapasitas harus antara 1 dan 100 siswa.");
      if (c && (c.programId !== v.program || c.periodId !== v.period) && db.students.filter((s) => s.classId === c.id).length) return fail("program", "Program dan periode kelas yang sudah berisi siswa tidak bisa diganti. Buat kelas baru lalu pindahkan siswanya.");
      let r;
      try {
        r = await api(c ? `/api/admin/classes/${c.id}` : "/api/admin/classes", { method: c ? "PUT" : "POST", body: { code, programId: v.program, periodId: v.period, tutorId: db.tutorIds.get(v.tutor), capacity } });
      } catch (error) { return failFrom(error, fail, error.field === "tutor" ? "tutor" : "code"); }
      await reload();
      toast(c ? `Kelas ${code} tersimpan.` : `Kelas ${r.label} ditambahkan.`);
      return true;
    },
  });
}

export function openTutorDialog() {
  openFormDialog({
    title: "Tambah tutor", sub: "Setelah ditambahkan, centang tutor ini di program yang diajar.", submitLabel: "Tambah tutor",
    fields: [{ id: "name", label: "Nama tutor", placeholder: "Contoh: Sari" }],
    async onSubmit(v, fail) {
      const name = v.name.replace(/\s+/g, " ");
      if (!name) return fail("name", "Nama tutor wajib diisi.");
      if (db.tutors.some((t) => t.toLowerCase() === name.toLowerCase())) return fail("name", "Tutor dengan nama ini sudah ada.");
      try {
        await api("/api/admin/tutors", { method: "POST", body: { name } });
      } catch (error) { return failFrom(error, fail, "name"); }
      await reload();
      toast(`${name} ditambahkan sebagai tutor. Centang namanya di program yang diajar.`);
      return true;
    },
  });
}

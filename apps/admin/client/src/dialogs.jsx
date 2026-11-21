// Every dialog of the dashboard as React components with native <dialog>, plus the imperative
// openers and promise APIs (confirmDialog, openFormDialog) that the rest of the app calls.
// The forms are uncontrolled: values are read from the DOM at submit time, exactly like the old
// client, so the validation and field error flow is unchanged.

import { useEffect, useRef, useState } from "react";
import { api, db, ui, T, notify, reload, mutate, sessionEnded, useVersion, NOW } from "./store.js";
import { $, $$, busy, clearErrors, fieldError, makeFieldFail, toast } from "./dom.js";
import {
  TEST_META, certPrefill, certCounter, certTypeName, certTemplateOf, certTypeById, certById,
  classesFor, classLabel, currentPeriod, fmtDate, fmtDateLong, fmtNum, fmtRp, fmtSpan, fmtWa,
  firstName, joinWords, mergeCertValues, nextCertNumber, normalizeWa, periodsSorted, programById,
  questionNumber, studentById, todayIso, topIssuedSeq, greetingFor, openCertPage,
  packageOf, packageQuestions,
} from "./lib.js";
import { certFormatProblem, certPeriodLabel, formatCertNumber } from "./cert-number.js";
import { Icon, OptList, RichToolbar } from "./ui.jsx";
import { buildInviteWhatsApp, formatWib } from "@tnec/core/mockup-bulk";
import { branchLabel } from "@tnec/core/branches";

/* ===================== Dialog store ===================== */
let dlg = null;
let dlgSeq = 0;
// Each open gets its own sequence number, so reopening a dialog always remounts it: the effect that
// calls showModal runs again, and the form fields reset per open like the old app.
export function openDialog(next) { dlg = { ...next, seq: ++dlgSeq }; notify(); }
// A save handler closes its own dialog after its awaits, so it must name its kind: a slow save
// finishing while someone already opened another dialog must not close that other dialog. The sync
// buttons (Batal, the close icon) get the click event as their argument, which closes as before.
export function closeDialog(kind) { if (typeof kind === "string" && (!dlg || dlg.kind !== kind)) return; dlg = null; notify(); }
export function useDialog() { useVersion(); return dlg; }

/* The base dialog: opens as a modal on mount, focuses a selector, and reports every close. */
export function Modal({ id, className = "", focus, onClose, children }) {
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
    case "section": return <SectionDialog key={d.seq} id={d.id} />;
  case "package": return <PackageDialog key={d.seq} id={d.id} />;
    case "student": return <StudentDialog key={d.seq} id={d.id} />;
    case "daftar": return <DaftarDialog key={d.seq} studentId={d.studentId} />;
    case "pendaftaran": return <PendaftaranDialog key={d.seq} id={d.id} />;
    case "program": return <ProgramDialog key={d.seq} id={d.id} />;
    case "certtype": return <CertTypeDialog key={d.seq} id={d.id} />;
    case "cert": return <CertDialog key={d.seq} studentId={d.studentId} certId={d.certId} />;
    case "wa": return <WaDialog key={d.seq} studentId={d.studentId} opts={d.opts} />;
    case "session": return <SessionDialog key={d.seq} id={d.id} />;
    case "session-import": return <SessionImportDialog key={d.seq} sessionId={d.sessionId} />;
    case "session-participant": return <SessionParticipantDialog key={d.seq} sessionId={d.sessionId} />;
    case "move-invite": return <MoveInviteDialog key={d.seq} inviteId={d.inviteId} name={d.name} fromSessionId={d.fromSessionId} />;
    case "test-send": return <TestSendDialog key={d.seq} sessionId={d.sessionId} />;
    case "form": return <FormDialog key={d.seq} spec={d.spec} />;
    default: return null;
  }
}

/* ===================== Questions ===================== */
/** The question editor is a page of its own now, at #/tes/:key/soal/:id or .../baru. */
export function openQuestionEditor(id) { location.hash = `#/tes/${ui.test}/soal/${id || "baru"}`; }

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
  if (dlg?.kind === "question") closeDialog("question");
  await mutate(() => api(`/api/admin/tests/${ui.test}/questions/${q.id}`, { method: "DELETE" }), "Soal dihapus.");
}

/* ===================== Bagian (question section: range, passage, audio) ===================== */
export function openSectionEditor(id) { openDialog({ kind: "section", id: id || null }); }

function SectionDialog({ id }) {
  const t = T();
  const name = TEST_META[ui.test].name;
  const s = id ? t.sections.find((x) => x.id === id) : null;
  const qs = packageQuestions(t);
  const max = qs.length ? Math.max(...qs.map((q) => q.position)) : 0;
  const own = s ? qs.filter((q) => q.sectionId === s.id).map((q) => q.position) : [];
  const from = own.length ? Math.min(...own) : "";
  const to = own.length ? Math.max(...own) : "";

  async function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);
    const fail = makeFieldFail();
    const title = $("#se-title").value.trim();
    const start = Number($("#se-from").value);
    const end = Number($("#se-to").value);
    const audioUrl = $("#se-audio").value.trim();
    const imageUrl = $("#se-image").value.trim();
    if (!title) fail($("#se-title"), "se-title-err", "Nama bagian wajib diisi.");
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > max || start > end) {
      fail($("#se-from"), "se-range-err", `Rentang soal harus angka 1 sampai ${max}, dan soal awal tidak boleh lebih besar dari soal akhir.`);
    }
    if (audioUrl && !audioUrl.startsWith("/")) fail($("#se-audio"), "se-audio-err", "Alamat audio harus dimulai dengan / dan dihosting di situs tes ini.");
    if (imageUrl && !imageUrl.startsWith("/")) fail($("#se-image"), "se-image-err", "Alamat gambar harus dimulai dengan / dan dihosting di situs tes ini.");
    const first = fail.first();
    if (first) { first.focus(); return; }

    const body = {
      title, skill: $("#se-skill").value, part: $("#se-part").value || null, from: start, to: end,
      passage: $("#se-passage").value.trim(), audioUrl, imageUrl,
      packageId: s ? s.packageId : (packageOf(t)?.id || null),
    };
    const done = busy(form.querySelector('[type="submit"]'), "Menyimpan...");
    const result = await mutate(
      () => api(s ? `/api/admin/tests/${ui.test}/sections/${s.id}` : `/api/admin/tests/${ui.test}/sections`, { method: s ? "PUT" : "POST", body }),
      s ? "Bagian tersimpan." : "Bagian baru tersimpan. Soal di rentang itu masuk ke bagian ini.",
    );
    done();
    if (result) closeDialog("section");
  }

  async function remove() {
    const r = await confirmDialog({
      title: `Hapus ${s.title}?`,
      message: "Soal di bagian ini tetap ada, tetapi kehilangan bacaan dan audionya. Pindahkan soalnya ke bagian lain dulu kalau masih dipakai.",
      confirmLabel: "Hapus bagian",
    });
    if (!r.ok) return;
    if (dlg?.kind === "section") closeDialog("section");
    await mutate(() => api(`/api/admin/tests/${ui.test}/sections/${s.id}`, { method: "DELETE" }), "Bagian dihapus.");
  }

  return (
    <Modal id="dlg-section" focus="#se-title" onClose={closeDialog}>
      <form className="dialog__form" onSubmit={save} noValidate>
        <Head title={s ? `Ubah ${s.title}` : "Tambah bagian"}
          sub={`${name}. Satu bagian memegang satu rentang soal beserta bacaan dan audionya, jadi keduanya tetap bersama soal saat urutannya diacak.`} />
        <div className="dialog__body">
          <div className="field">
            <label className="label" htmlFor="se-title">Nama bagian</label>
            <input className="input" id="se-title" type="text" maxLength="80" defaultValue={s ? s.title : ""} placeholder="Contoh: Listening Part 1" />
            <p className="error" id="se-title-err" hidden></p>
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="se-skill">Skill</label>
              <select className="select" id="se-skill" defaultValue={s ? s.skill : "Listening"}><OptList list={[["Listening", "Listening"], ["Reading", "Reading"], ["Writing", "Writing"]]} /></select>
            </div>
            <div className="field">
              <label className="label" htmlFor="se-part">Bagian ke</label>
              <select className="select" id="se-part" defaultValue={s && s.part ? String(s.part) : ""}><OptList list={[["", "Tanpa nomor"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]]} /></select>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="se-from">Dari soal</label>
              <input className="input tnum" id="se-from" type="number" min="1" max={max} defaultValue={from} />
            </div>
            <div className="field">
              <label className="label" htmlFor="se-to">Sampai soal</label>
              <input className="input tnum" id="se-to" type="number" min="1" max={max} defaultValue={to} />
              <p className="hint">Dari {max} soal di tes ini. Soal di rentang ini pindah ke bagian ini.</p>
              <p className="error" id="se-range-err" hidden></p>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="se-passage">Bacaan atau instruksi</label>
            <RichToolbar target="se-passage" />
            <textarea className="textarea rt-source" id="se-passage" rows="6" defaultValue={s ? s.passage : ""}></textarea>
            <p className="hint">Tampil di atas setiap soal bagian ini. Kosongkan kalau bagian ini hanya berisi audio. Tanda &lt;b&gt; &lt;i&gt; &lt;u&gt;, baris berbutir "-", dan baris bernomor "1." tampil sesuai formatnya di layar peserta.</p>
            <p className="error" id="se-passage-err" hidden></p>
          </div>
          <div className="field">
            <label className="label" htmlFor="se-audio">Alamat audio</label>
            <input className="input" id="se-audio" type="text" defaultValue={s ? s.audio : ""} placeholder="/audio/ielts-dec-1.mp3" />
            <p className="hint">Audio Listening adalah satu berkas untuk Part 1 sampai Part 4. Simpan di bagian Listening pertama dan kosongkan bagian Listening lainnya. Diputar satu kali per percobaan dan tetap berbunyi saat peserta pindah soal. Berkasnya di bawah apps/web/public/audio.</p>
            <p className="error" id="se-audio-err" hidden></p>
          </div>
          <div className="field">
            <label className="label" htmlFor="se-image">Alamat gambar</label>
            <input className="input" id="se-image" type="text" defaultValue={s ? s.image : ""} placeholder="/images/ielts-writing-dalton.png" />
            <p className="hint">Tampil di atas soal bagian ini, misalnya grafik Writing Task 1.</p>
            <p className="error" id="se-image-err" hidden></p>
          </div>
        </div>
        <footer className="dialog__foot">
          {s ? <button className="link-btn link-btn--danger" type="button" onClick={remove}>Hapus bagian</button> : null}
          <FootEnd>
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit">Simpan bagian</button>
          </FootEnd>
        </footer>
      </form>
    </Modal>
  );
}

/* ===================== Paket soal (question package) ===================== */
export function openPackageEditor(id) { openDialog({ kind: "package", id: id || null }); }

function PackageDialog({ id }) {
  const t = T();
  const name = TEST_META[ui.test].name;
  const p = id ? t.packages.find((x) => x.id === id) : null;

  async function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);
    const fail = makeFieldFail();
    const value = $("#pk-name").value.trim();
    if (!value) fail($("#pk-name"), "pk-name-err", "Nama paket wajib diisi.");
    const first = fail.first();
    if (first) { first.focus(); return; }
    const body = { name: value, active: $("#pk-active").checked };
    const done = busy(form.querySelector('[type="submit"]'), "Menyimpan...");
    const result = await mutate(
      () => api(p ? `/api/admin/tests/${ui.test}/packages/${p.id}` : `/api/admin/tests/${ui.test}/packages`, { method: p ? "PUT" : "POST", body }),
      p ? "Paket tersimpan." : "Paket baru tersimpan. Isi soalnya di tab Soal & Jawaban.",
    );
    done();
    if (result) closeDialog("package");
  }

  return (
    <Modal id="dlg-package" focus="#pk-name" onClose={closeDialog}>
      <form className="dialog__form" onSubmit={save} noValidate>
        <Head title={p ? `Ubah ${p.name}` : "Tambah paket"}
          sub={`${name}. Satu paket berisi soal dan bagian sendiri, lalu diberikan ke siswa lewat tautan atau pilihan acak.`} />
        <div className="dialog__body">
          <div className="field">
            <label className="label" htmlFor="pk-name">Nama paket</label>
            <input className="input" id="pk-name" type="text" maxLength="60" defaultValue={p ? p.name : ""} placeholder="Contoh: Paket Demo B" />
            <p className="error" id="pk-name-err" hidden></p>
          </div>
          <label className="switch"><input type="checkbox" id="pk-active" defaultChecked={p ? p.active : true} /><span className="switch__track" aria-hidden="true"></span>Paket aktif dan bisa dipilih acak</label>
          <p className="hint">Paket nonaktif tetap bisa dibuka di dasbor, tetapi tidak dipilih untuk siswa baru.</p>
        </div>
        <footer className="dialog__foot">
          <FootEnd>
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit">Simpan paket</button>
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
    const fail = makeFieldFail();
    if (name.length < 2) fail($("#sf-name"), "sf-name-err", "Nama minimal 2 karakter.");
    if (!waRaw) fail($("#sf-wa"), "sf-wa-err", "Nomor WhatsApp wajib diisi.");
    else if (!/^62\d{8,13}$/.test(wa)) fail($("#sf-wa"), "sf-wa-err", "Nomor WhatsApp terlihat belum lengkap. Periksa lagi jumlah digitnya.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail($("#sf-email"), "sf-email-err", "Format email belum benar.");
    const birthdate = $("#sf-birthdate").value;
    if (birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) fail($("#sf-birthdate"), "sf-birthdate-err", "Tanggal lahir belum benar.");
    const first = fail.first();
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
      closeDialog("student");
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
    const fail = makeFieldFail();
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
    const first = fail.first();
    if (first) { first.focus(); return; }
    const done = busy($("#df-save"), "Menyimpan...");
    try {
      const r = await api("/api/admin/pendaftaran", { method: "POST", body });
      closeDialog("daftar");
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
            <div className="span-all pf-hits" id="df-hits" hidden={Boolean(picked)}>
              {hits.length ? <>
                {hits.map((s) => (
                  <button key={s.id} className="btn btn--quiet btn--sm" type="button" onClick={() => pick(s.id)}>
                    {s.name}<span className="cell-sub">{s.email || fmtWa(s.wa)}{s.daftarCount ? ", sudah daftar" : ", lead"}</span>
                  </button>
                ))}
                <p className="hint">Atau isi data orang baru di bawah.</p>
              </> : <p className="hint">{query ? "Tidak ada yang cocok. Isi data orang baru di bawah." : "Atau langsung isi data orang baru di bawah."}</p>}
            </div>
            {picked ? <div className="field span-all" id="df-person-chip">
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
      closeDialog("pendaftaran");
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
    const fail = makeFieldFail();
    const nameField = () => $("#pg-name");
    if (!name) fail(nameField(), "pg-name-err", "Nama program wajib diisi.");
    else if (db.programs.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== id)) fail(nameField(), "pg-name-err", "Nama program ini sudah ada.");
    if (!rows.length) fail(nameField(), "pg-dur-err", "Tambahkan minimal satu durasi.");
    for (const r of rows) {
      if (!r.label) { fail($(`[aria-label="Nama durasi"][value=""]`), "pg-dur-err", "Setiap durasi perlu nama, misalnya 2 minggu atau 1 bulan."); break; }
      if (!Number.isInteger(r.days) || r.days < 1 || r.days > 365) { fail(nameField(), "pg-dur-err", `Jumlah hari untuk ${r.label || "durasi ini"} harus antara 1 dan 365.`); break; }
      if (r.price !== null && r.price !== "" && r.price !== undefined && (!Number.isInteger(Number(r.price)) || Number(r.price) < 0)) { fail(nameField(), "pg-dur-err", `Harga ${r.label} harus angka bulat dan tidak boleh negatif.`); break; }
    }
    if (!fail.first() && rows.length && new Set(rows.map((r) => String(r.label || "").toLowerCase())).size < rows.length) fail(nameField(), "pg-dur-err", "Ada nama durasi yang sama. Setiap durasi harus berbeda.");
    if (!fail.first() && p) {
      const kept = new Set(rows.map((r) => r.id).filter(Boolean));
      const inUse = p.durations.filter((d) => !kept.has(d.id)).find((d) => db.students.some((s) => s.durationId === d.id));
      if (inUse) fail(nameField(), "pg-dur-err", `Durasi ${inUse.label} masih dipakai ${db.students.filter((s) => s.durationId === inUse.id).length} siswa, jadi belum bisa dihapus.`);
    }
    const first = fail.first();
    if (first) { first.focus(); return; }
    const body = {
      name, mode: $("#pg-mode").value, status: $("#pg-status").value,
      tutors: $$("#pg-tutors input:checked").map((x) => x.value),
      durations: rows.map((r) => ({ id: r.id || null, label: String(r.label || "").trim(), days: Number(r.days), price: r.price === "" || r.price === null || r.price === undefined ? null : Number(r.price) })),
    };
    const done = busy($("#pg-save"), "Menyimpan...");
    try {
      await api(p ? `/api/admin/programs/${p.id}` : "/api/admin/programs", { method: p ? "PUT" : "POST", body });
      closeDialog("program");
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
            <div className="check-grid" id="pg-tutors">
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
    const fail = makeFieldFail();
    if (name.trim().length < 2) fail($("#ct-name"), "ct-name-err", "Nama sertifikat minimal 2 karakter.");
    else if (db.certs.types.some((x) => x.id !== id && x.name.toLowerCase() === name.trim().toLowerCase())) fail($("#ct-name"), "ct-name-err", "Jenis sertifikat dengan nama ini sudah ada.");
    if (!code.trim() || /\s/.test(code)) fail($("#ct-code"), "ct-code-err", "Kode wajib diisi tanpa spasi, misalnya COMP.");
    if (!certTemplateOf(template)) fail($("#ct-template"), "ct-template-err", "Pilih template sertifikat.");
    if (problem) fail($("#ct-format"), "ct-format-err", problem);
    if (last === "" || !Number.isInteger(lastNum) || lastNum < 0 || lastNum > 999999) fail($("#ct-last"), "ct-last-err", "Nomor terakhir harus angka bulat dari 0 sampai 999999.");
    else if (lastNum < top) fail($("#ct-last"), "ct-last-err", `Nomor terakhir tidak bisa di bawah ${top}, karena nomor itu sudah terbit di ${certPeriodLabel(reset, today)}.`);
    if (!signerName) fail($("#ct-signer"), "ct-signer-err", "Nama penanda tangan wajib diisi.");
    if (!signerRole) fail($("#ct-role"), "ct-role-err", "Jabatan penanda tangan wajib diisi.");
    const first = fail.first();
    if (first) { first.focus(); return; }
    const body = { name: name.trim().replace(/\s+/g, " "), code: code.trim(), template, format: format.trim(), reset, signerName, signerRole, status: $("#ct-status").value };
    // The counter is only sent when someone typed a new last number, so saving a signer change never
    // fights with a certificate that was issued while the dialog was open.
    if (lastDirty) body.lastNumber = lastNum;
    const done = busy($("#ct-save"), "Menyimpan...");
    try {
      await api(id ? `/api/admin/certificate-types/${id}` : "/api/admin/certificate-types", { method: id ? "PUT" : "POST", body });
      closeDialog("certtype");
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
    const fail = makeFieldFail();
    if (!c && !studentById(studentId2)) fail($("#cr-student").closest("[hidden]") ? null : $("#cr-student"), "cr-student-err", "Pilih siswa penerima sertifikat.");
    if (!c && !type) fail($("#cr-type"), "cr-type-err", "Pilih jenis sertifikat.");
    if (!c && !dateIso) fail($("#cr-date"), "cr-date-err", "Pilih tanggal terbit.");
    const nameOnCert = recipient.trim().replace(/\s+/g, " ");
    if (nameOnCert.length < 2) fail($("#cr-name"), "cr-name-err", "Nama di sertifikat minimal 2 karakter.");
    for (const f of tpl ? tpl.fields : []) if (!details[f.key]) fail($(`#cr-f-${f.key}`), `cr-f-${f.key}-err`, `${f.label} wajib diisi.`);
    if (details.mulai && details.selesai && details.selesai < details.mulai) fail($("#cr-f-selesai"), "cr-f-selesai-err", "Selesai belajar tidak boleh lebih awal dari mulai belajar.");
    const first = fail.first();
    if (first) { first.focus(); return; }
    if (!c && !studentById(studentId2)) { toast("Data siswa ini sudah tidak ada. Tutup dialog lalu pilih siswa lain."); return; }
    const done = busy($("#cr-save"), c ? "Menyimpan..." : "Menerbitkan...");
    try {
      const r = c
        ? await api(`/api/admin/certificates/${c.id}`, { method: "PUT", body: { recipient: nameOnCert, details } })
        : await api("/api/admin/certificates", { method: "POST", body: { typeId: type.id, studentId: studentId2, recipient: nameOnCert, issuedOn: dateIso, details } });
      closeDialog("cert");
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
      sent = true;      closeDialog("wa");
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
    if (ok !== false) closeDialog("form");
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
/* The confirm is an overlay with its own state, not the one open dialog: it must be able to sit on
   top of another dialog (deleting a question from its editor) without unmounting it, and a pending
   save must never eat its close event. The buttons resolve directly, because some browser builds
   do not deliver the dialog close event reliably; the close event stays as the Esc fallback. */
let confirmState = null;
let confirmSeq = 0;
export function confirmDialog({ title, message, confirmLabel, danger = true, reasonLabel = "", reasonPlaceholder = "" }) {
  return new Promise((resolve) => {
    confirmState = { seq: ++confirmSeq, resolve, spec: { title, message, confirmLabel, danger, reasonLabel, reasonPlaceholder } };
    notify();
  });
}
function closeConfirm() { confirmState = null; notify(); }
export function ConfirmHost() {
  useVersion();
  if (!confirmState) return null;
  return <ConfirmDialog key={confirmState.seq} spec={confirmState.spec} resolve={confirmState.resolve} />;
}

function ConfirmDialog({ spec, resolve }) {
  const ref = useRef(null);
  const settled = useRef(false);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    (spec.reasonLabel ? $("#cf-reason") : $("#cf-cancel"))?.focus();
    // Esc and the backdrop close the dialog natively; without this fallback those paths would
    // leave the awaiting code hanging on engines where the close event does not arrive.
    const onClosed = () => { if (!settled.current) { settled.current = true; resolve({ ok: false, reason: "" }); closeConfirm(); } };
    d.addEventListener("close", onClosed);
    return () => {
      d.removeEventListener("close", onClosed);
      if (d.open) d.close();
      if (!settled.current) { settled.current = true; resolve({ ok: false, reason: "" }); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const finish = (ok) => () => {
    if (settled.current) return;
    settled.current = true;
    const reason = $("#cf-reason")?.value.trim() || "";
    const d = ref.current;
    if (d.open) d.close(ok ? "ok" : "cancel");
    resolve({ ok, reason });
    closeConfirm();
  };
  return (
    <dialog ref={ref} id="dlg-confirm" className="dialog dialog--sm" aria-labelledby="cf-title" aria-describedby="cf-message">
      <form className="dialog__form" onSubmit={(e) => { e.preventDefault(); finish(false)(); }}>
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
            <button className="btn btn--quiet" type="button" id="cf-cancel" onClick={finish(false)}>Batal</button>
            <button className={`btn ${spec.danger ? "btn--danger" : "btn--primary"}`} type="button" id="cf-ok" onClick={finish(true)}>{spec.confirmLabel}</button>
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

/* ===================== Sesi mockup: editor, impor, pindah sesi, pesan uji ===================== */

export function openSessionEditor(id) { openDialog({ kind: "session", id: id || null }); }

function SessionDialog({ id }) {
  const s = id ? db.sessions.find((x) => x.id === id) : null;
  const [mode, setMode] = useState(s?.windowMode || "terjadwal");
  const [programId, setProgramId] = useState(s?.programId || "prg_ielts_mockup");
  const packages = db.tests["ielts-mockup"].packages;
  const durations = db.programs.find((p) => p.id === programId)?.durations || [];
  // One session carries one or more packages. Every imported student gets one of them,
  // so a wave can sit different packages. New sessions start with the first package ticked.
  const [picked, setPicked] = useState(() => new Set(s?.packageIds?.length ? s.packageIds : packages[0] ? [packages[0].id] : []));

  function togglePackage(packageId, on) {
    setPicked((set) => {
      const next = new Set(set);
      if (on) next.add(packageId); else next.delete(packageId);
      return next;
    });
  }

  async function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);
    const fail = makeFieldFail();
    const name = $("#ss-name").value.trim();
    if (name.length < 2) fail($("#ss-name"), "ss-name-err", "Nama sesi minimal 2 karakter.");
    const body = {
      name,
      windowMode: mode,
      programId,
      periodId: $("#ss-period").value || "",
      durationId: $("#ss-duration").value || null,
      packageIds: [...picked],
      quota: $("#ss-quota").value.trim() === "" ? null : Number($("#ss-quota").value),
    };
    if (!body.periodId) fail($("#ss-period"), "ss-period-err", "Periode wajib dipilih.");
    if (!picked.size) fail(null, "ss-package-err", "Centang minimal satu paket soal.");
    if (mode === "fleksibel") {
      body.rangeStart = $("#ss-range-start").value;
      body.rangeEnd = $("#ss-range-end").value;
      if (!body.rangeStart) fail($("#ss-range-start"), "ss-range-err", "Tanggal mulai wajib diisi.");
      if (!body.rangeEnd) fail($("#ss-range-end"), "ss-range-err", "Tanggal akhir wajib diisi.");
      if (body.rangeStart && body.rangeEnd && body.rangeEnd <= body.rangeStart) fail($("#ss-range-end"), "ss-range-err", "Tanggal akhir harus setelah tanggal mulai.");
    } else {
      const minutes = Number($("#ss-grace").value);
      if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) fail($("#ss-grace"), "ss-grace-err", "Tenggang mulai harus antara 5 menit dan 24 jam.");
      else body.entryGraceSeconds = minutes * 60;
    }
    if (s) body.status = $("#ss-status").value;
    const first = fail.first();
    if (first) { first.focus(); return; }
    const done = busy($("#ss-save"), "Menyimpan...");
    try {
      await mutate(() => api(s ? `/api/admin/mockup/sessions/${s.id}` : "/api/admin/mockup/sessions", { method: s ? "PUT" : "POST", body }),
        s ? "Sesi tersimpan." : "Sesi dibuat. Lanjutkan dengan impor peserta.");
      closeDialog("session");
    } catch (error) {
      if (error.field === "name") fieldError($("#ss-name"), "ss-name-err", error.message);
      else if (error.field === "rangeStart" || error.field === "rangeEnd") fieldError($("#ss-range-end"), "ss-range-err", error.message);
      else if (error.field === "entryGraceSeconds") fieldError($("#ss-grace"), "ss-grace-err", error.message);
      else if (error.field === "periodId") fieldError($("#ss-period"), "ss-period-err", error.message);
      else if (error.field === "packageIds") fieldError(null, "ss-package-err", error.message);
      else if (error.field === "quota") fieldError($("#ss-quota"), "ss-quota-err", error.message);
      else fieldError(null, "ss-err", error.message);
    } finally {
      done();
    }
  }

  return (
    <Modal id="dlg-session" className="dialog dialog--session" focus="#ss-name" onClose={closeDialog}>
      <form className="dialog__form" onSubmit={save} noValidate>
        <Head title={s ? "Ubah sesi" : "Tambah sesi"} sub="Satu sesi adalah satu gelombang peserta berbayar IELTS Mockup." />
        <div className="dialog__body">
          <div className="form-grid">
            <div className="field span-all">
              <label className="label" htmlFor="ss-name">Nama sesi</label>
              <input className="input" id="ss-name" type="text" defaultValue={s?.name || ""} placeholder="Contoh: Mockup November 2026 Gelombang 1" />
              <p className="error" id="ss-name-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="ss-mode">Jendela tes</label>
              <select className="select" id="ss-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="terjadwal">Terjadwal, tanggal dan jam per siswa</option>
                <option value="fleksibel">Fleksibel, rentang tanggal untuk semua</option>
              </select>
            </div>
            {mode === "fleksibel" ? <>
              <div className="field">
                <label className="label" htmlFor="ss-range-start">Rentang mulai</label>
                <input className="input" id="ss-range-start" type="date" defaultValue={s?.rangeStart ? new Date(s.rangeStart + 7 * 3600 * 1000).toISOString().slice(0, 10) : ""} />
              </div>
              <div className="field">
                <label className="label" htmlFor="ss-range-end">Rentang akhir</label>
                <input className="input" id="ss-range-end" type="date" defaultValue={s?.rangeEnd ? new Date(s.rangeEnd + 7 * 3600 * 1000).toISOString().slice(0, 10) : ""} />
                <p className="hint">Siswa boleh mulai kapan saja dalam rentang ini.</p>
                <p className="error" id="ss-range-err" hidden></p>
              </div>
            </> : <div className="field">
              <label className="label" htmlFor="ss-grace">Tenggang mulai (menit)</label>
              <input className="input tnum" id="ss-grace" type="number" min="5" max="1440" defaultValue={Math.round((s?.entryGraceSeconds ?? 7200) / 60)} />
              <p className="hint">Tautan siswa terbuka pada jadwalnya dan menutup setelah tenggang ini.</p>
              <p className="error" id="ss-grace-err" hidden></p>
            </div>}
            <div className="field">
              <label className="label" htmlFor="ss-program">Program</label>
              <select className="select" id="ss-program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <OptList list={db.programs.map((p) => [p.id, p.name])} />
              </select>
              <p className="hint">Pendaftaran peserta mockup memakai program ini, jadi peserta masuk Database Siswa.</p>
            </div>
            <div className="field">
              <label className="label" htmlFor="ss-period">Periode</label>
              <select className="select" id="ss-period" defaultValue={s?.periodId || ""}>
                <OptList list={[["", "Pilih periode"], ...periodsSorted().map((p) => [p.id, fmtDate(p.start)])]} />
              </select>
              <p className="error" id="ss-period-err" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="ss-duration">Durasi program</label>
              <select className="select" id="ss-duration" defaultValue={s?.durationId || ""}>
                <OptList list={[["", "Tanpa durasi"], ...durations.map((d) => [d.id, d.label])]} />
              </select>
            </div>
            <fieldset className="field span-all">
              <legend className="label">Paket soal</legend>
              <div className="check-grid" id="ss-packages">
                {packages.map((p) => (
                  <label key={p.id} className="check">
                    <input type="checkbox" value={p.id} checked={picked.has(p.id)} onChange={(e) => togglePackage(p.id, e.target.checked)} />
                    <span>{p.name}{p.active ? "" : <span className="cell-sub"> nonaktif</span>}</span>
                  </label>
                ))}
              </div>
              <p className="hint">Setiap peserta mendapat satu paket dari yang dicentang, dipilih acak saat impor, jadi satu gelombang bisa mengerjakan paket yang berbeda.</p>
              <p className="error" id="ss-package-err" hidden></p>
            </fieldset>
            <div className="field">
              <label className="label" htmlFor="ss-quota">Kuota peserta</label>
              <input className="input tnum" id="ss-quota" type="number" min="1" defaultValue={s?.quota ?? ""} placeholder="Opsional" />
              <p className="error" id="ss-quota-err" hidden></p>
            </div>
            {s ? <div className="field">
              <label className="label" htmlFor="ss-status">Status</label>
              <select className="select" id="ss-status" defaultValue={s.status}>
                <option value="draft">Draf</option>
                <option value="open">Terbuka</option>
                <option value="closed">Selesai</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div> : null}
            <p className="error span-all" id="ss-err" hidden></p>
          </div>
        </div>
        <div className="dialog__foot">
          <FootEnd>
            <button className="link-btn" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit" id="ss-save">{s ? "Simpan sesi" : "Buat sesi"}</button>
          </FootEnd>
        </div>
      </form>
    </Modal>
  );
}

export function openSessionImport(sessionId) { openDialog({ kind: "session-import", sessionId }); }
export function openSessionParticipant(sessionId) { openDialog({ kind: "session-participant", sessionId }); }

function SessionImportDialog({ sessionId }) {
  const s = db.sessions.find((x) => x.id === sessionId);
  const [preview, setPreview] = useState(null);
  const [parseError, setParseError] = useState("");

  const scheduled = s?.windowMode === "terjadwal";
  const header = scheduled ? "nama,whatsapp,email,tanggal_tes,jam_tes" : "nama,whatsapp,email";
  const example = scheduled ? "Budi Santoso,081234567890,budi@contoh.com,2026-11-20,09:00" : "Budi Santoso,081234567890,budi@contoh.com";

  function downloadTemplate() {
    const csv = `${header}\n${example}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = scheduled ? "peserta-mockup-terjadwal.csv" : "peserta-mockup-fleksibel.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function readFile(e) {
    const file = e.target.files?.[0];
    setParseError("");
    setPreview(null);
    if (!file) return;
    const csv = await file.text();
    try {
      const r = await api(`/api/admin/mockup/sessions/${sessionId}/import`, { method: "POST", body: { csv } });
      if (r) setPreview(r);
    } catch (error) {
      setParseError(error.message);
    }
  }

  const bad = preview ? preview.rows.filter((r) => r.errors.length || r.windowError) : [];
  const good = preview ? preview.rows.filter((r) => !r.errors.length && !r.windowError) : [];

  async function confirm() {
    const fileInput = $("#si-file");
    const csv = await fileInput.files?.[0]?.text();
    const done = busy($("#si-confirm"), "Mengimpor...");
    try {
      const r = await api(`/api/admin/mockup/sessions/${sessionId}/import/confirm`, { method: "POST", body: { csv } });
      closeDialog("session-import");
      await reload();
      toast(`Impor selesai: ${r.created} undangan dibuat, ${r.studentsNew} siswa baru, ${r.registrations} pendaftaran. Tekan "Kirim semua" untuk mengirim undangannya.`);
    } catch (error) {
      setParseError(error.message);
    } finally {
      done();
    }
  }

  return (
    <Modal id="dlg-import" className="dialog dialog--import" focus="#si-file" onClose={closeDialog}>
      <Head title="Impor peserta" sub={s ? `${s.name}. ${scheduled ? "Sesi terjadwal: setiap baris membawa tanggal dan jam tesnya." : "Sesi fleksibel: semua peserta memakai rentang sesi."}` : ""} />
      <div className="dialog__body">
        <div className="si-row">
          <button className="btn btn--quiet btn--sm" type="button" onClick={downloadTemplate}><Icon name="download" />Unduh template</button>
          <p className="si-row__meta">Header: <span className="tnum">{header}</span>. Nomor WhatsApp menerima 08, 628, atau +62.</p>
        </div>
        <div className="field">
          <label className="label" htmlFor="si-file">Berkas CSV</label>
          <input className="si-file" id="si-file" type="file" accept=".csv,text/csv" onChange={readFile} />
        </div>
        {parseError ? <p className="error" role="alert">{parseError}</p> : null}
        {preview ? <>
          <p className="si-counts">
            <strong className="tnum">{preview.counts.total}</strong> baris &middot; <strong className="tnum">{preview.counts.newStudents}</strong> siswa baru &middot; <strong className="tnum">{preview.counts.existingStudents}</strong> siswa lama &middot; <strong className="tnum">{preview.counts.skipped}</strong> sudah punya undangan &middot; <strong className="tnum">{preview.counts.invalid}</strong> bermasalah
          </p>
          {preview.rows.length ? <div className="table-wrap si-preview"><table className="table">
            <caption className="sr-only">Pratinjau impor</caption>
            <thead><tr><th scope="col" className="is-no">Baris</th><th scope="col">Nama</th><th scope="col">WhatsApp</th><th scope="col">Siswa</th><th scope="col">Jadwal</th><th scope="col">Catatan</th></tr></thead>
            <tbody>{preview.rows.map((r) => (
              <tr key={r.line} className={r.errors.length || r.windowError ? "is-draft" : ""}>
                <td className="is-no">{r.line}</td>
                <td>{r.name}</td>
                <td className="nowrap tnum">{fmtWa(r.wa) || r.waRaw}</td>
                <td>{r.studentId ? <span>lama: {r.studentName}</span> : r.errors.length ? <span className="muted">-</span> : <span>baru</span>}</td>
                <td className="nowrap">{scheduled && r.scheduledAt ? `${r.date} ${r.time}` : scheduled ? <span className="muted">-</span> : "rentang sesi"}</td>
                <td>{r.errors.length
                  ? r.errors.join(" ")
                  : r.windowError
                    ? r.windowError
                    : r.inviteExisting
                      ? "Sudah punya undangan di sesi ini, dilewati."
                      : `${r.registrationExisting ? "Pendaftaran mockup sudah ada, dipakai ulang." : "Pendaftaran mockup baru dibuat."} Kode tes dibuat otomatis saat konfirmasi.`}</td>
              </tr>
            ))}</tbody>
          </table></div> : null}
        </> : null}
      </div>
      <div className="dialog__foot">
        <FootEnd>
          <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
          <button className="btn btn--primary" type="button" id="si-confirm" disabled={!preview || bad.length || !good.length} onClick={confirm}>
            Impor {good.length ? `${good.length} peserta` : ""}
          </button>
        </FootEnd>
      </div>
    </Modal>
  );
}

/* One participant. The first screen searches Database Siswa: type a name, number, or email and
   pick the person; everything else follows the existing student. A link below opens the manual
   form for someone truly new, which still goes through the same import confirm rules, including
   the name-mismatch confirmation when the number already belongs to another student. */
function SessionParticipantDialog({ sessionId }) {
  const s = db.sessions.find((x) => x.id === sessionId);
  const scheduled = s?.windowMode === "terjadwal";
  const [mode, setMode] = useState("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [picked, setPicked] = useState(null);
  const [acceptMismatch, setAcceptMismatch] = useState(null);

  useEffect(() => {
    if (mode !== "search") return undefined;
    const q = query.trim();
    if (q.length < 2) { setResults(null); return undefined; }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const r = await api(`/api/admin/mockup/students?q=${encodeURIComponent(q)}`);
        if (alive) setResults(r.results);
      } catch { /* the list stays; a retry happens on the next keystroke */ }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, mode]);

  async function addPicked() {
    const date = $("#sp-date");
    const time = $("#sp-time");
    if (scheduled && (!date.value || !time.value)) {
      fieldError(null, "sp-sched-err", "Tanggal dan jam tes wajib diisi untuk sesi terjadwal.");
      date.focus();
      return;
    }
    const field = (v) => { const t = String(v ?? "").trim(); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const cols = scheduled ? "nama,whatsapp,email,tanggal_tes,jam_tes" : "nama,whatsapp,email";
    const line = scheduled
      ? [field(picked.name), field(picked.whatsapp), field(picked.email || ""), date.value, time.value]
      : [field(picked.name), field(picked.whatsapp), field(picked.email || "")];
    const done = busy($("#sp-add-picked"), "Menambahkan...");
    try {
      const r = await api(`/api/admin/mockup/sessions/${sessionId}/import/confirm`, {
        method: "POST",
        body: { csv: `${cols}\n${line.join(",")}\n` },
      });
      closeDialog("session-participant");
      await reload();
      toast(r.created
        ? `${picked.name} ditambahkan. Tekan "Kirim semua" untuk mengirim undangannya.`
        : "Peserta ini sudah punya undangan di sesi ini, jadi tidak ada yang ditambahkan.");
    } catch (error) {
      // The search-picked student carries their registered name, so a mismatch cannot happen here;
      // every other error lands in the dialog as-is.
      fieldError(null, "sp-err", error.message);
    } finally {
      done();
    }
  }

  async function add(e) {
    e.preventDefault();
    clearErrors(e.currentTarget);
    const fail = makeFieldFail();
    const name = $("#sp-name");
    const wa = $("#sp-wa");
    const date = $("#sp-date");
    const time = $("#sp-time");
    if (name.value.trim().length < 2) fail(name, "sp-name-err", "Nama peserta minimal 2 karakter.");
    if (!wa.value.trim()) fail(wa, "sp-wa-err", "Nomor WhatsApp wajib diisi. Format 08, 628, atau +62.");
    if (scheduled && !date.value) fail(date, "sp-sched-err", "Tanggal tes wajib diisi untuk sesi terjadwal.");
    if (scheduled && !time.value) fail(time, "sp-sched-err", "Jam tes wajib diisi untuk sesi terjadwal.");
    if (fail.first()) { fail.first().focus(); return; }
    // The import parser takes quoted CSV, so a name with a comma or a quote survives intact.
    const field = (v) => { const t = String(v ?? "").trim(); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const cols = scheduled ? "nama,whatsapp,email,tanggal_tes,jam_tes" : "nama,whatsapp,email";
    const line = scheduled
      ? [field(name.value), field(wa.value), field($("#sp-email").value), date.value, time.value]
      : [field(name.value), field(wa.value), field($("#sp-email").value)];
    const done = busy($("#sp-add"), "Menambahkan...");
    try {
      const r = await api(`/api/admin/mockup/sessions/${sessionId}/import/confirm`, {
        method: "POST",
        // The single manual row is CSV line 2 (line 1 is the header), so the mismatch acceptance
        // targets that line number.
        body: { csv: `${cols}\n${line.join(",")}\n`, ...(acceptMismatch ? { accept: [2] } : {}) },
      });
      closeDialog("session-participant");
      await reload();
      toast(r.created
        ? `${r.created} peserta ditambahkan${r.studentsNew ? `, ${r.studentsNew} siswa baru` : ""}. Tekan "Kirim semua" untuk mengirim undangannya.`
        : "Peserta ini sudah punya undangan di sesi ini, jadi tidak ada yang ditambahkan.");
    } catch (error) {
      if (error.code === "name_mismatch") {
        setAcceptMismatch(error.message);
      } else {
        fieldError(null, "sp-err", error.message);
      }
    } finally {
      done();
    }
  }

  return (
    <Modal id="dlg-participant" focus="#sp-search" onClose={closeDialog}>
      <Head title="Tambah peserta" sub={s ? `${s.name}. ${scheduled ? "Sesi terjadwal: peserta membawa tanggal dan jam tesnya sendiri." : "Sesi fleksibel: peserta memakai rentang sesi."}` : ""} />
      <div className="dialog__body">
        {mode === "search" ? (
          <>
            <div className="field">
              <label className="label" htmlFor="sp-search">Cari siswa</label>
              <input className="input" id="sp-search" type="search" placeholder="Nama, nomor WhatsApp, atau email" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
              <p className="hint">Ketik minimal 2 karakter. Peserta mockup hampir selalu sudah ada di Database Siswa.</p>
            </div>
            {results && results.length === 0 ? <p className="hint">Tidak ada siswa yang cocok. Pakai form manual di bawah kalau orangnya memang baru.</p> : null}
            {results && results.length ? (
              <ul className="sp-results">
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="sp-result" onClick={() => { setPicked(r); setAcceptMismatch(false); }}>
                      <span className="sp-result__name">{r.name}</span>
                      <span className="sp-result__meta">{r.whatsapp}{r.branch ? ` - ${branchLabel(r.branch)}` : ""}</span>
                      <span className="sp-result__sub">{r.email || "tanpa email"}{r.lastTest ? ` - tes terakhir: ${TEST_META[r.lastTest.split(":")[0]]?.name || r.lastTest}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {picked ? (
              <div className="sp-picked">
                <p className="sp-picked__name">{picked.name}</p>
                <p className="sp-picked__meta">{picked.whatsapp}{picked.email ? ` - ${picked.email}` : ""}</p>
                {scheduled ? <>
                  <div className="field">
                    <label className="label" htmlFor="sp-date">Tanggal tes</label>
                    <input className="input" id="sp-date" type="date" required />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="sp-time">Jam tes</label>
                    <input className="input" id="sp-time" type="time" required />
                    <p className="hint">Waktu WIB. Peserta bisa masuk sampai {Math.round((s?.entryGraceSeconds ?? 7200) / 3600)} jam setelah jam ini.</p>
                  </div>
                </> : null}
                <p className="error" id="sp-sched-err" role="alert" hidden></p>
                <p className="error" id="sp-err" role="alert" hidden></p>
              </div>
            ) : null}
            <p className="hint sp-switch">Tidak menemukannya? <button type="button" className="link-inline" onClick={() => { setMode("manual"); setAcceptMismatch(false); }}>Isi data peserta baru</button></p>
          </>
        ) : (
          <form className="dialog__form" onSubmit={add} noValidate>
            <p className="hint sp-switch"><button type="button" className="link-inline" onClick={() => { setMode("search"); setPicked(null); setAcceptMismatch(false); }}>&larr; Kembali ke pencarian siswa</button></p>
            <div className="field">
              <label className="label" htmlFor="sp-name">Nama</label>
              <input className="input" id="sp-name" type="text" maxLength="80" autoComplete="off" required />
              <p className="error" id="sp-name-err" role="alert" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="sp-wa">Nomor WhatsApp</label>
              <input className="input" id="sp-wa" type="tel" inputMode="tel" maxLength="20" placeholder="08xxxxxxxxxx" autoComplete="off" required />
              <p className="hint">Menerima 08, 628, atau +62. Kalau nomor atau emailnya sudah terdaftar, data siswa itu dipakai ulang.</p>
              <p className="error" id="sp-wa-err" role="alert" hidden></p>
            </div>
            <div className="field">
              <label className="label" htmlFor="sp-email">Email (opsional)</label>
              <input className="input" id="sp-email" type="email" maxLength="120" autoComplete="off" />
            </div>
            {scheduled ? <>
              <div className="field">
                <label className="label" htmlFor="sp-date">Tanggal tes</label>
                <input className="input" id="sp-date" type="date" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="sp-time">Jam tes</label>
                <input className="input" id="sp-time" type="time" required />
                <p className="hint">Waktu WIB. Peserta bisa masuk sampai {Math.round((s?.entryGraceSeconds ?? 7200) / 3600)} jam setelah jam ini.</p>
              </div>
              <p className="error" id="sp-sched-err" role="alert" hidden></p>
            </> : null}
            {acceptMismatch ? <p className="notice notice--neutral" role="alert">{acceptMismatch}</p> : null}            <p className="error" id="sp-err" role="alert" hidden></p>
            <div className="dialog__foot">
              <FootEnd>
                <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
                <button className="btn btn--primary" type="submit" id="sp-add">{acceptMismatch ? "Ya, tetap tambahkan" : "Tambah peserta"}</button>
              </FootEnd>
            </div>
          </form>
        )}
      </div>
      {mode === "search" && picked ? (
        <div className="dialog__foot">
          <FootEnd>
            <button className="btn btn--quiet" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="button" id="sp-add-picked" onClick={addPicked}>Tambahkan ke sesi</button>
          </FootEnd>
        </div>
      ) : null}
    </Modal>
  );
}

export function openMoveInvite(inviteId, name, fromSessionId) { openDialog({ kind: "move-invite", inviteId, name, fromSessionId }); }

function MoveInviteDialog({ inviteId, name, fromSessionId }) {
  const others = db.sessions.filter((s) => s.id !== fromSessionId && s.status !== "cancelled");
  const [targetId, setTargetId] = useState(others[0]?.id || "");
  const target = others.find((s) => s.id === targetId) || null;

  async function save(e) {
    e.preventDefault();
    clearErrors(e.currentTarget);
    const fail = makeFieldFail();
    const body = { sessionId: targetId };
    if (target?.windowMode === "terjadwal") {
      body.date = $("#mv-date").value;
      body.time = $("#mv-time").value;
      if (!body.date || !body.time) fail($("#mv-date"), "mv-err", "Tanggal dan jam baru wajib diisi untuk sesi terjadwal.");
    }
    const first = fail.first();
    if (first) { first.focus(); return; }
    const done = busy(e.currentTarget.querySelector("#mv-save"), "Memindah...");
    try {
      await mutate(() => api(`/api/admin/mockup/invites/${inviteId}/move`, { method: "POST", body }),
        `Undangan ${name} dipindahkan ke ${target?.name || "sesi baru"} dan antrean pesannya berjalan.`);
      closeDialog("move-invite");
    } catch (error) {
      fieldError(null, "mv-err", error.message);
    } finally {
      done();
    }
  }

  return (
    <Modal id="dlg-move" className="dialog dialog--move" focus="#mv-session" onClose={closeDialog}>
      <form className="dialog__form" onSubmit={save} noValidate>
        <Head title="Pindah sesi" sub={`Undangan lama ${name} dihapus dan undangan baru dibuat di sesi tujuan, lalu pesannya masuk antrean.`} />
        <div className="dialog__body">
          <div className="form-grid">
            <div className="field span-all">
              <label className="label" htmlFor="mv-session">Sesi tujuan</label>
              <select className="select" id="mv-session" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <OptList list={others.map((s) => [s.id, s.name])} />
              </select>
              {!others.length ? <p className="error" id="mv-err" hidden></p> : null}
            </div>
            {target?.windowMode === "terjadwal" ? <>
              <div className="field">
                <label className="label" htmlFor="mv-date">Tanggal baru</label>
                <input className="input" id="mv-date" type="date" />
              </div>
              <div className="field">
                <label className="label" htmlFor="mv-time">Jam baru</label>
                <input className="input" id="mv-time" type="time" />
              </div>
            </> : null}
            <p className="error span-all" id="mv-err" hidden></p>
          </div>
        </div>
        <div className="dialog__foot">
          <FootEnd>
            <button className="link-btn" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit" id="mv-save">Pindahkan</button>
          </FootEnd>
        </div>
      </form>
    </Modal>
  );
}

export function openTestSend(sessionId) { openDialog({ kind: "test-send", sessionId }); }

function TestSendDialog({ sessionId }) {
  const s = db.sessions.find((x) => x.id === sessionId);
  // The preview uses the same builder as the real queue, with sample data, so what the team
  // reads here is what the student receives.
  const sampleNow = Math.floor(Date.now() / 1000);
  const sampleSchedule = s?.windowMode === "fleksibel"
    ? `${formatWib((s.rangeStart ?? sampleNow * 1000) / 1000)} sampai ${formatWib((s.rangeEnd ?? (sampleNow + 86400) * 1000) / 1000)}`
    : `${formatWib(sampleNow + 7200)} (contoh jadwal)`;
  const sampleDeadline = `paling telat ${formatWib(sampleNow + 7200 + (s?.entryGraceSeconds ?? 7200))}`;
  const sampleText = buildInviteWhatsApp({
    firstName: "Peserta",
    sessionName: s?.name || "Sesi",
    schedule: sampleSchedule,
    link: `${db.publicUrl}/?undangan=contoh-tautan`,
    code: "ABC234",
    deadline: sampleDeadline,
  });

  async function send(e) {
    e.preventDefault();
    clearErrors(e.currentTarget);
    const done = busy($("#ts-send"), "Mengirim...");
    try {
      await api(`/api/admin/mockup/sessions/${sessionId}/test-send`, {
        method: "POST",
        body: { wa: $("#ts-wa").value.trim(), email: $("#ts-email").value.trim() },
      });
      closeDialog("test-send");
      toast("Pesan uji terkirim. Periksa email atau WhatsApp kamu.");
    } catch (error) {
      fieldError(null, "ts-err", error.message);
    } finally {
      done();
    }
  }

  return (
    <Modal id="dlg-test-send" className="dialog dialog--test-send" focus="#ts-wa" onClose={closeDialog}>
      <form className="dialog__form" onSubmit={send} noValidate>
        <Head title="Pesan uji" sub={s ? `Kirim satu contoh undangan ${s.name} ke nomor atau email kamu sendiri sebelum kirim semua.` : ""} />
        <div className="dialog__body">
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="ts-wa">WhatsApp uji (opsional)</label>
              <input className="input" id="ts-wa" type="tel" inputMode="tel" placeholder="0812 3456 7890" />
            </div>
            <div className="field">
              <label className="label" htmlFor="ts-email">Email uji (opsional)</label>
              <input className="input" id="ts-email" type="email" placeholder="nama@contoh.com" />
            </div>
            <div className="field span-all">
              <span className="label">Pratinjau isi pesan</span>
              <pre className="ts-preview">{sampleText}</pre>
              <p className="hint">Email memakai isi yang sama dengan tautan dan kode yang bisa diklik.</p>
            </div>
            <p className="error span-all" id="ts-err" hidden></p>
          </div>
        </div>
        <div className="dialog__foot">
          <FootEnd>
            <button className="link-btn" type="button" onClick={closeDialog}>Batal</button>
            <button className="btn btn--primary" type="submit" id="ts-send">Kirim pesan uji</button>
          </FootEnd>
        </div>
      </form>
    </Modal>
  );
}
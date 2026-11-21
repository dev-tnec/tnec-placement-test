// The Placement, Pre-test, Post-test, and IELTS Mockup pages: the question bank, the submission
// list, the Lead tab, Pengaturan, and the full submission page with the speaking panel.
// Ported from viewTest, renderQuestionsTab, renderAttemptsTab, renderLeadTab, renderSettingsTab,
// viewAttempt, and speakingPanelHtml.

import { Fragment, useState } from "react";
import { api, db, mutate, notify, reload, ui, useVersion, withDetail, PAGE_SIZE, KEYS } from "../store.js";
import {
  LOG_TEXT, SKILLS, SPEAKING_ASPECTS, accuracyMap, activeQuestions, attemptMatches, attemptTotal,
  classById, classLabel, fmtClock, fmtDate, fmtDateTime, fmtSpan, fmtWa, pad, pct, speakingAudioUrl,
  speakingNeedsAttention, studentById, testOf, testSeconds, nilaiOf, levelByKey, latestAttemptOf,
  latestGraded, leads, isColdLead, lastActivityAt, levelLabel, exportAttempts, exportLeads, periodById,
  programById, fmtTime, TEST_META, packageOf, packageQuestions, packageSections,
} from "../lib.js";
import { BRANCHES } from "@tnec/core/branches";
import {
  AttemptStatus, Chip, ClassCell, Empty, Icon, LevelCell, Notice, OptList, PageHead, Pager, PassStatus,
  Person, ProgramCell, ResultCell, OutcomeCell, RowOpen, SpeakingRowLabel, SpeakingStatus, StageStatus, Status,
  periodOptions, programOptions, rowClick, rowRun,
} from "../ui.jsx";
import { MenuBtn } from "../menus.jsx";
import { resendEmail, speakingRetry, speakingReviewed, speakingSkip } from "../actions.js";
import { openQuestionEditor, openDaftar, openSectionEditor, openPackageEditor, openSessionEditor } from "../dialogs.jsx";
import { SessionsTab } from "./MockupSesi.jsx";
import { SpeakingQuestionsTab } from "./SpeakingBank.jsx";
import { $, busy, clearErrors, fieldError, toast } from "../dom.js";

/* Jumlah soal aktif versus the top level threshold. */
function LevelMismatchNotice() {
  const t = db.tests.placement;
  const n = activeQuestions(t).length;
  const top = db.levels[db.levels.length - 1].max;
  if (n === top) return null;
  return (
    <Notice icon="alert">
      Jumlah soal aktif sekarang <strong>{n}</strong>, tetapi ambang level masih berakhir di skor <strong>{top}</strong>.
      Sesuaikan ambang level supaya peserta dengan skor tertinggi tetap mendapat level yang benar.
      <a className="link-btn" href="#/tes/placement/pengaturan?bagian=level">Buka ambang level</a>
    </Notice>
  );
}

export function TestPage({ testKey, tab }) {
  useVersion();
  ui.test = testKey;
  const t = db.tests[testKey], meta = TEST_META[testKey];
  const own = db.attempts.filter((a) => a.test === testKey);
  const speakingBank = testKey === "ielts-mockup" && t.mockupSpeaking ? t.mockupSpeaking : null;
  const tabs = [["soal", "Soal & Jawaban", packageQuestions(t).length + (speakingBank ? speakingBank.total : 0)], ["submission", "Submission", own.length]];
  if (testKey === "placement") tabs.push(["lead", "Lead", leads().length]);
  if (testKey === "ielts-mockup") {
    tabs.push(["bagian", "Bagian", packageSections(t).length]);
    tabs.push(["paket", "Paket", t.packages.length]);
    tabs.push(["sesi", "Sesi", db.sessions.length]);
  }
  tabs.push(["pengaturan", "Pengaturan", null]);
  if (!tabs.some((x) => x[0] === tab)) tab = "soal";
  // The Speaking bank lives inside Soal & Jawaban as a skill chip, the same way the IELTS
  // mockup shows its interview questions: Grammar, Vocabulary, and so on until Speaking.
  const speakingView = ui.questions[testKey]?.skill === "Speaking"
    && (testKey === "ielts-mockup" ? Boolean(t.mockupSpeaking) : testKey === "placement");
  const actions = tab === "soal" && !speakingView
    ? <button className="btn btn--primary" type="button" onClick={() => openQuestionEditor(null)}><Icon name="plus" />Tambah soal</button>
    : tab === "soal" && speakingView
      ? <button className="btn btn--primary" type="button" onClick={() => { location.hash = "#/tes/placement/speaking/baru"; }}><Icon name="plus" />Tambah soal speaking</button>
    : tab === "submission" ? <button className="btn btn--quiet" type="button" onClick={() => exportAttempts(db.attempts.filter((a) => attemptMatches(a, ui.attempts[testKey], false)))}><Icon name="download" />Ekspor CSV</button>
      : tab === "bagian" ? <button className="btn btn--primary" type="button" onClick={() => openSectionEditor(null)}><Icon name="plus" />Tambah bagian</button>
        : tab === "paket" ? <button className="btn btn--primary" type="button" onClick={() => openPackageEditor(null)}><Icon name="plus" />Tambah paket</button>
  : tab === "sesi" ? <button className="btn btn--primary" type="button" onClick={() => openSessionEditor(null)}><Icon name="plus" />Tambah sesi</button>
          : tab === "lead" ? <button className="btn btn--quiet" type="button" onClick={() => exportLeads()}><Icon name="download" />Ekspor CSV</button> : null;
  return <>
    <PageHead title={meta.name}
      desc={t.settings.open ? null : <p className="page-desc"><Status label="Ditutup" kind="ring" muted /></p>}
      actions={actions} />
    <nav className="seg tabs" aria-label={`Bagian ${meta.name}`}>
      {tabs.map(([k, label, n]) => (
        <a key={k} className="seg__item" href={`#/tes/${testKey}/${k}`} {...(k === tab ? { "aria-current": "page" } : {})}>{label}{n === null ? null : <> <span className="seg__n">{n}</span></>}</a>
      ))}
    </nav>
    {tab === "soal" ? <QuestionsTab /> : tab === "submission" ? <SubmissionsTab /> : tab === "bagian" ? <SectionsTab /> : tab === "paket" ? <PackagesTab /> : tab === "sesi" ? <SessionsTab /> : tab === "lead" ? <LeadTab /> : <SettingsTab testKey={testKey} />}
  </>;
}

/* ===================== Soal & Jawaban ===================== */
let questionTimer = null;

/* The 18 speaking questions come from the fixed interview plan in the server, not from the
   question bank, so this view is read-only and grouped by part. */
function SpeakingBank({ plan }) {
  let n = 0;
  return <>
    <div className="panel__body panel__body--gap">
      <Notice icon="mic" neutral>18 pertanyaan speaking memakai video examiner tetap dan dipakai semua paket, jadi tidak diedit dari bank soal. Rekaman, transkrip, dan nilainya ada di tab Submission.</Notice>
    </div>
    <div className="table-wrap"><table className="table">
      <caption className="sr-only">Pertanyaan speaking IELTS Mockup</caption>
      <thead><tr>
        <th scope="col" className="is-no">No</th><th scope="col">Pertanyaan</th>
        <th scope="col" className="hide-sm">Video examiner</th><th scope="col" className="is-num">Waktu jawab</th>
      </tr></thead>
      <tbody>
        {plan.parts.map((part) => (
          <Fragment key={part.part}>
            <tr><th scope="colgroup" colSpan="4">{part.title}</th></tr>
            {part.questions.map((q) => {
              n += 1;
              return <tr key={`${part.part}-${q.no}`}>
                <td className="is-no is-top">{pad(n)}</td>
                <td>
                  <p className="q-prompt">{q.text}</p>
                  {part.cue && q.no === 1 ? <p className="cell-sub">{part.cue.join(" ")}</p> : null}
                </td>
                <td className="hide-sm"><span className="q-tag"><Icon name="volume" cls="icon--sm" />{q.video.split("/").pop()}</span></td>
                <td className="is-num nowrap">{part.prepSeconds ? `${part.prepSeconds} dtk siap, ${part.speakSeconds} dtk jawab` : `${part.speakSeconds} dtk`}</td>
              </tr>;
            })}
          </Fragment>
        ))}
      </tbody>
    </table></div>
  </>;
}

function QuestionsTab() {
  useVersion();
  const t = db.tests[ui.test], f = ui.questions[ui.test];
  const per = t.settings.timeMode === "per";
  const stats = accuracyMap(ui.test, 30 * 86400000);
  const qs = packageQuestions(t);
  const speakPlan = t.mockupSpeaking;
  // The placement speaking bank lives here as a chip beside Grammar, Vocabulary, and Reading,
  // so the whole bank of the test sits on one tab. The IELTS interview plan is read-only.
  const placementBank = ui.test === "placement" ? (db.speakingBank || []) : [];
  const speakingView = f.skill === "Speaking" && (ui.test === "ielts-mockup" ? Boolean(speakPlan) : ui.test === "placement");
  const q = f.q.trim().toLowerCase();
  const rows = qs.filter((x) => (f.skill === "all" || x.skill === f.skill)
    && (!q || `${x.prompt} ${x.passage} ${Object.values(x.options).join(" ")}`.toLowerCase().includes(q)));
  const counts = { all: qs.length };
  const skills = [...new Set(qs.map((x) => x.skill))];
  skills.forEach((k) => { counts[k] = qs.filter((x) => x.skill === k).length; });
  if (speakPlan) { skills.push("Speaking"); counts.Speaking = speakPlan.total; }
  if (ui.test === "placement") { skills.push("Speaking"); counts.Speaking = placementBank.filter((x) => x.status === "aktif").length || placementBank.length; }

  return <div className="stack">
    {ui.test === "placement" ? <LevelMismatchNotice /> : null}
    <section className="panel">
      <div className="toolbar toolbar--last">
        {ui.test === "ielts-mockup" && !speakingView ? <select className="select select--auto" aria-label="Paket soal" value={packageOf(t)?.id || ""}
          onChange={(e) => { ui.package[ui.test] = e.target.value; notify(); }}>
          <OptList list={t.packages.map((p) => [p.id, p.name])} />
        </select> : null}
        {!speakingView ? <label className="search"><span className="sr-only">Cari soal</span><Icon name="search" />
          <input className="input" type="search" placeholder="Cari teks soal atau pilihan jawaban" value={f.q} autoComplete="off"
            onChange={(e) => { clearTimeout(questionTimer); const v = e.target.value; questionTimer = setTimeout(() => { f.q = v; notify(); }, 140); }} />
        </label> : null}
        <div className="chips" role="group" aria-label="Saring skill">
          {[["all", "Semua"], ...skills.map((k) => [k, k])].map(([k, label]) => (
            <Chip key={k} value={k} label={label} n={counts[k]} pressed={f.skill === k} onClick={(v) => { f.skill = v; notify(); }} />
          ))}
        </div>
        <p className="toolbar__meta">{speakingView
          ? (ui.test === "placement"
            ? `Bank pertanyaan speaking. Peserta mendapat ${Math.min(t.settings.speakingCount ?? 1, (db.speakingBank || []).filter((x) => x.status === "aktif").length) || (db.speakingBank || []).filter((x) => x.status === "aktif").length} dari ${(db.speakingBank || []).filter((x) => x.status === "aktif").length} pertanyaan aktif,${t.settings.speakingRandomize ? " dipilih acak" : " berurutan dari atas"}. Jumlah dan pengacarannya diatur di Pengaturan.`
            : "18 pertanyaan wawancara tetap, dipakai semua paket.")
          : "Urutan di tabel sama dengan urutan soal di tes."}</p>
      </div>
      {speakingView && ui.test === "placement" ? <SpeakingQuestionsTab /> : speakingView ? <SpeakingBank plan={speakPlan} /> : rows.length ? <div className="table-wrap"><table className="table">
        <caption className="sr-only">Bank soal {TEST_META[ui.test].name}</caption>
        <thead><tr>
          <th scope="col" className="is-no">No</th><th scope="col">Soal dan pilihan jawaban</th><th scope="col" className="hide-md">Skill</th>
          <th scope="col" className="hide-sm is-wrap">Dijawab benar, 30 hari</th>{per ? <th scope="col" className="is-num">Waktu</th> : null}
          <th scope="col" className="hide-tab">Status</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th>
        </tr></thead>
        <tbody>{rows.map((x) => {
          const num = activeQuestions(t).indexOf(x) + 1;
          const st = stats.get(x.id);
          const p = st ? pct(st.correct, st.n) : 0;
          const section = x.sectionId ? t.sections.find((s) => s.id === x.sectionId) : null;
          return (
            <tr key={x.id} className={x.status === "draf" ? "is-draft" : ""} onClick={rowRun(() => openQuestionEditor(x.id))}>
              <td className="is-no is-top">{num ? pad(num) : <span className="muted">Draf</span>}</td>
              <td>
                {(section || x.part || x.passage) ? <div className="q-tags">
                  {section ? <span className="q-tag">{section.title}</span> : x.part ? <span className="q-tag">Bagian {x.part}</span> : null}
                  {section?.audio ? <span className="q-tag"><Icon name="volume" cls="icon--sm" />Dengan audio</span> : null}
                  {(section?.passage || (!section && x.passage)) ? <span className="q-tag"><Icon name="book" cls="icon--sm" />{x.skill === "Listening" ? "Dengan instruksi" : "Dengan bacaan"}</span> : null}
                </div> : null}
                <p className="q-prompt">{x.prompt}</p>
                {x.type === "longtext"
                  ? <ul className="opts" aria-label="Esai"><li className="opt is-key"><span className="opt__key opt__key--word">Esai</span><span className="opt__text">Minimal {x.minWords} kata, dinilai AI</span></li></ul>
                  : x.type === "text"
                    ? <ul className="opts" aria-label="Jawaban yang diterima">
                      <li className="opt is-key"><span className="opt__key opt__key--word">Kunci</span><span className="opt__text">{(x.accepted || []).join(", ")}</span></li>
                    </ul>
                    : <ul className="opts" aria-label={`Pilihan jawaban, kunci ${x.answer}`}>
                      {Object.keys(x.options).map((k) => <li key={k} className={`opt${k === x.answer ? " is-key" : ""}`}><span className="opt__key">{k}</span><span className="opt__text">{x.options[k]}</span></li>)}
                    </ul>}
              </td>
              <td className="hide-md">{x.skill}</td>
              <td className="hide-sm">
                {st && st.n >= 5
                  ? <><div className="acc"><span className="bar" aria-hidden="true"><span className={`bar__fill${p < 35 ? " is-low" : ""}`} style={{ width: `${p}%` }} /></span><span className="acc__val">{p}%</span></div><span className="cell-sub">{st.correct} dari {st.n} peserta</span></>
                  : <span className="muted">Belum ada data</span>}
              </td>
              {per ? <td className="is-num">{x.seconds} dtk</td> : null}
              <td className="hide-tab">{x.status === "aktif" ? <Status label="Aktif" kind="navy" /> : <Status label="Draf" kind="ring" muted />}</td>
              <td className="is-action"><span className="row-actions">
                <button className="btn btn--quiet btn--sm" type="button" onClick={() => openQuestionEditor(x.id)}>Ubah</button>
                <MenuBtn kind="question" id={x.id} label={`Aksi lain untuk soal ${num || "draf"}`} />
              </span></td>
            </tr>
          );
        })}</tbody>
      </table></div>
        : <Empty title="Tidak ada soal yang cocok dengan pencarian ini." desc="Coba kata kunci lain atau pilih skill yang berbeda." />}
    </section>
  </div>;
}

/* ===================== Bagian ===================== */

function SectionsTab() {
  useVersion();
  const t = db.tests[ui.test];
  const qs = packageQuestions(t);
  const rows = packageSections(t).map((s) => {
    const own = qs.filter((q) => q.sectionId === s.id).map((q) => q.position).sort((a, b) => a - b);
    const plan = s.skill === "Speaking" ? t.mockupSpeaking?.parts.find((p) => p.part === s.part) || null : null;
    return { ...s, from: own[0] || null, to: own[own.length - 1] || null, n: own.length, plan };
  });

  return <div className="stack">
    <section className="panel">
      <div className="toolbar toolbar--last">
        <select className="select select--auto" aria-label="Paket soal" value={packageOf(t)?.id || ""}
          onChange={(e) => { ui.package[ui.test] = e.target.value; notify(); }}>
          <OptList list={t.packages.map((p) => [p.id, p.name])} />
        </select>
        <p className="toolbar__meta">Setiap bagian memegang satu rentang soal beserta bacaan dan audionya. Saat soal diacak nanti, bagian ini tetap bersama soalnya. Audio Listening adalah satu berkas untuk Part 1 sampai Part 4, disimpan di bagian Listening pertama. Tiga bagian speaking adalah bagian tetap dari Paket Demo A.</p>
      </div>
      {rows.length ? <div className="table-wrap"><table className="table">
        <caption className="sr-only">Bagian {TEST_META[ui.test].name}</caption>
        <thead><tr>
          <th scope="col">Bagian</th><th scope="col">Rentang soal</th><th scope="col">Skill</th>
          <th scope="col" className="hide-sm">Audio</th><th scope="col" className="hide-md">Bacaan</th>
          <th scope="col" className="is-action"><span className="sr-only">Aksi</span></th>
        </tr></thead>
        <tbody>{rows.map((s) => (
          <tr key={s.id} onClick={s.plan ? undefined : rowRun(() => openSectionEditor(s.id))}>
            <td><p className="q-prompt">{s.title}</p></td>
            <td className="nowrap tnum">{s.plan ? `${s.plan.questions.length} pertanyaan tetap` : s.n ? `Soal ${s.from} sampai ${s.to}` : <span className="muted">Belum ada soal</span>}</td>
            <td>{s.skill}</td>
            <td className="hide-sm">{s.plan ? <span className="muted">Tidak ada</span> : s.audio ? <span className="q-tag"><Icon name="volume" cls="icon--sm" />{s.audio.split("/").pop()}</span> : <span className="muted">Tidak ada</span>}</td>
            <td className="hide-md">{s.plan ? <span className="muted">Tidak ada</span> : s.passage ? `${s.passage.length} karakter` : <span className="muted">Tidak ada</span>}</td>
            <td className="is-action">{s.plan ? <span className="muted">Tetap</span> : <button className="btn btn--quiet" type="button" onClick={(e) => { e.stopPropagation(); openSectionEditor(s.id); }}>Ubah</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
        : <Empty title="Belum ada bagian." desc="Tambahkan bagian untuk mengikat bacaan dan audio ke satu rentang soal." />}
    </section>
  </div>;
}

/* ===================== Paket soal ===================== */

function PackagesTab() {
  useVersion();
  const t = db.tests[ui.test];
  const rows = t.packages.map((p) => {
    const qs = t.questions.filter((q) => q.packageId === p.id);
    return { ...p, n: qs.length, activeN: qs.filter((q) => q.status === "aktif").length, sections: t.sections.filter((s) => s.packageId === p.id).length };
  });

  return <div className="stack">
    <section className="panel">
      <div className="toolbar toolbar--last">
        <p className="toolbar__meta">Setiap paket punya soal dan bagian sendiri. Siswa mendapat paket yang dipilih saat tautan dikirim, atau paket aktif yang dipilih acak. Paket Demo A sudah memuat tiga bagian speaking tetap, jadi ikut dihitung di kolom Bagian.</p>
      </div>
      {rows.length ? <div className="table-wrap"><table className="table">
        <caption className="sr-only">Paket soal {TEST_META[ui.test].name}</caption>
        <thead><tr>
          <th scope="col">Paket</th><th scope="col">Soal aktif</th><th scope="col" className="hide-sm">Bagian</th>
          <th scope="col">Status</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th>
        </tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id} onClick={rowRun(() => openPackageEditor(p.id))}>
            <td><p className="q-prompt">{p.name}</p></td>
            <td className="tnum">{p.activeN} dari {p.n}</td>
            <td className="hide-sm">{p.sections}</td>
            <td>{p.active ? <Status label="Aktif" kind="navy" /> : <Status label="Nonaktif" kind="ring" muted />}</td>
            <td className="is-action"><button className="btn btn--quiet" type="button" onClick={(e) => { e.stopPropagation(); openPackageEditor(p.id); }}>Ubah</button></td>
          </tr>
        ))}</tbody>
      </table></div>
        : <Empty title="Belum ada paket." desc="Tambahkan paket pertama, lalu isi soalnya di tab Soal & Jawaban." />}
    </section>
  </div>;
}

/* ===================== Submission ===================== */
let attemptTimer = null;

function SubmissionsTab() {
  useVersion();
  const f = ui.attempts[ui.test];
  const base = db.attempts.filter((a) => attemptMatches(a, f, true));
  const chipsList = ui.test === "placement"
    ? [["all", "Semua"], ["done", "Selesai"], ["nocontact", "Tanpa kontak"], ["failed", "Gagal"], ["void", "Dibatalkan"]]
    : [["all", "Semua"], ["done", "Selesai"], ["failed", "Gagal"], ["void", "Dibatalkan"]];
  const countOf = (k) => (k === "all" ? base.length : k === "failed" ? base.filter((a) => a.status === "timeout" || a.status === "violation").length : base.filter((a) => a.status === k).length);
  const speakChips = [["all", "Semua speaking"], ["review", "Perlu dinilai"], ["waiting", "Menunggu penilaian"]];
  const speakCount = (k) => (k === "all" ? null : k === "review"
    ? base.filter(speakingNeedsAttention).length
    : base.filter((a) => a.speaking && (a.speaking.status === "pending" || a.speaking.status === "grading")).length);

  const rows = base.filter((a) => attemptMatches(a, f, false));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  f.page = Math.min(Math.max(1, f.page), pages);
  const pageRows = rows.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE);
  const allOnPage = pageRows.length > 0 && pageRows.every((a) => f.selected.has(a.id));
  const onPage = (n) => { f.page = n; notify(); document.getElementById("main").scrollIntoView({ block: "start" }); };
  const toggleRow = (id, checked) => { if (checked) f.selected.add(id); else f.selected.delete(id); notify(); };
  const togglePage = (checked) => { pageRows.forEach((a) => { if (checked) f.selected.add(a.id); else f.selected.delete(a.id); }); notify(); };

  const head = ui.test === "placement"
    ? <><th scope="col">Peserta</th><th scope="col">Skor</th><th scope="col" className="hide-sm">Level</th><th scope="col" className="hide-md">Durasi</th><th scope="col" className="hide-md">Pelanggaran</th><th scope="col" className="hide-xl">Email hasil</th></>
    : ui.test === "ielts-mockup"
      ? <><th scope="col">Peserta</th><th scope="col">Listening</th><th scope="col">Reading</th><th scope="col">Writing</th><th scope="col">Speaking</th><th scope="col">Band keseluruhan</th><th scope="col" className="hide-md">Audio</th></>
      : <><th scope="col">Siswa</th><th scope="col" className="hide-md">Program</th><th scope="col" className="hide-tab">Tutor / Kelas</th>{ui.test === "post" ? <><th scope="col" className="hide-xl">Pre-test</th><th scope="col">Nilai</th><th scope="col">Hasil</th></> : <><th scope="col">Nilai</th><th scope="col" className="hide-lg">Durasi</th></>}</>;

  return <section className="panel">
    <div className="toolbar">
      <div className="chips" role="group" aria-label="Saring status submission">
        {chipsList.map(([k, label]) => (
          <Chip key={k} value={k} label={label} n={countOf(k)} pressed={f.status === k} onClick={(v) => { f.status = v; f.page = 1; notify(); }} />
        ))}
      </div>
      {ui.test === "placement" ? <div className="chips" role="group" aria-label="Saring speaking">
        {speakChips.map(([k, label]) => (
          <Chip key={k} value={k} label={label} n={speakCount(k)} pressed={f.speaking === k} onClick={(v) => { f.speaking = v; f.page = 1; notify(); }} />
        ))}
      </div> : null}
    </div>
    <div className="toolbar toolbar--last">
      <label className="search"><span className="sr-only">Cari submission</span><Icon name="search" />
        <input className="input" type="search" placeholder={ui.test === "placement" ? "Cari nama, email, WhatsApp, atau ID" : "Cari nama, email, atau kelas"} value={f.q} autoComplete="off"
          onChange={(e) => { clearTimeout(attemptTimer); const v = e.target.value; attemptTimer = setTimeout(() => { f.q = v; f.page = 1; notify(); }, 140); }} />
      </label>
      <select className="select select--auto" aria-label="Saring cabang" value={f.branch} onChange={(e) => { f.branch = e.target.value; f.page = 1; notify(); }}>
        <OptList list={[["", "Semua cabang"], ...BRANCHES]} />
      </select>
      {ui.test === "placement" ? <>
        <select className="select select--auto" aria-label="Saring level" value={f.level} onChange={(e) => { f.level = e.target.value; f.page = 1; notify(); }}>
          <OptList list={[["", "Semua level"], ...db.levels.map((l) => [l.key, l.label])]} />
        </select>
        <select className="select select--auto" aria-label="Rentang waktu" value={f.days} onChange={(e) => { f.days = e.target.value; f.page = 1; notify(); }}>
          <OptList list={[["7", "7 hari terakhir"], ["30", "30 hari terakhir"], ["all", "Semua waktu"]]} />
        </select>
      </> : <>
        <select className="select select--auto" aria-label="Saring periode" value={f.period} onChange={(e) => { f.period = e.target.value; f.page = 1; notify(); }}>
          <OptList list={periodOptions("Semua periode")} />
        </select>
        <select className="select select--auto" aria-label="Saring program" value={f.program} onChange={(e) => { f.program = e.target.value; f.page = 1; notify(); }}>
          <OptList list={programOptions("Semua program")} />
        </select>
        {ui.test === "post" ? <select className="select select--auto" aria-label="Saring hasil" value={f.result} onChange={(e) => { f.result = e.target.value; f.page = 1; notify(); }}>
          <OptList list={[["", "Semua hasil"], ["true", "Lulus"], ["false", "Belum lulus"]]} />
        </select> : null}
      </>}
    </div>
    {rows.length ? <>
      <div className="table-wrap"><table className="table">
        <caption className="sr-only">Daftar submission {TEST_META[ui.test].name}</caption>
        <thead><tr>
          <th scope="col" className="is-check"><input type="checkbox" checked={allOnPage} aria-label="Pilih semua submission di halaman ini" onChange={(e) => togglePage(e.target.checked)} /></th>
          {head}
          <th scope="col" className="hide-lg">Waktu</th><th scope="col">Status</th><th scope="col" className="is-action hide-xl"><span className="sr-only">Buka</span></th>
        </tr></thead>
        <tbody>{pageRows.map((a) => <AttemptRow key={a.id} a={a} sel={f.selected.has(a.id)} onToggle={toggleRow} />)}</tbody>
      </table></div>
      <Pager page={f.page} total={rows.length} noun="submission" onPage={onPage} />
    </> : <Empty title="Tidak ada submission yang cocok dengan filter ini." desc={ui.test === "placement" ? "Coba rentang waktu yang lebih panjang atau hapus kata kunci pencarian." : "Coba periode atau program lain, atau hapus kata kunci pencarian."} />}
  </section>;
}

function AttemptRow({ a, sel, onToggle }) {
  const s = a.studentId ? studentById(a.studentId) : null;
  const href = `#/tes/${a.test}/submission/${a.id}`;
  const person = s
    ? <><a className="cell-main" href={href}>{s.name}</a><span className="cell-sub cell-ellipsis">{s.email}</span></>
    : <><a className="cell-main" href={href}>{a.contactName || "Tanpa nama"}</a><span className="cell-sub">ID {a.short}</span></>;
  const tail = <><td className="hide-lg nowrap">{fmtDateTime(a.startedAt)}</td><td><AttemptStatus a={a} /></td><td className="is-action hide-xl"><RowOpen href={href} label={s ? s.name : a.contactName || a.short} /></td></>;
  if (a.test === "ielts-mockup") {
    const bands = a.bands || { skills: [], overall: 0 };
    const listen = bands.skills.find((x) => x.skill === "Listening");
    const read = bands.skills.find((x) => x.skill === "Reading");
    const write = bands.skills.find((x) => x.skill === "Writing");
    const speak = bands.skills.find((x) => x.skill === "Speaking");
    const pkg = a.packageId ? db.tests["ielts-mockup"].packages.find((p) => p.id === a.packageId) : null;
    return <tr className={sel ? "is-selected" : ""} onClick={rowClick(href)}>
      <td className="is-check"><input type="checkbox" checked={sel} aria-label={`Pilih submission ${s ? s.name : a.contactName || a.short}`} onChange={(e) => onToggle(a.id, e.target.checked)} /></td>
      <td>{person}{pkg ? <span className="cell-sub">{pkg.name}</span> : null}</td>
      <td className="nowrap tnum">{listen ? `${listen.raw} / 40, band ${listen.band}` : <span className="muted">Tidak ada</span>}</td>
      <td className="nowrap tnum">{read ? `${read.raw} / 40, band ${read.band}` : <span className="muted">Tidak ada</span>}</td>
      <td className="nowrap tnum">{write ? `band ${write.band}` : <span className="muted">Belum dinilai</span>}</td>
      <td className="nowrap tnum">{speak ? `band ${speak.band}` : <span className="muted">{a.speakingStatus === "skipped" ? "Dilewati" : a.speakingStatus === "failed" ? "Gagal" : "Belum"}</span>}</td>
      <td><strong className="tnum">{bands.overall || "-"}</strong></td>
      <td className="hide-md">{a.audioPlayedAt ? <><Icon name="clock" cls="icon--sm" /> {fmtDateTime(a.audioPlayedAt)}</> : <span className="muted">Belum diputar</span>}</td>
      {tail}
    </tr>;
  }
  if (a.test === "placement") {
    const level = a.levelKey ? levelByKey(a.levelKey) : null;
    const email = a.emailStatus === "sent" ? "Terkirim"
      : a.emailStatus === "pending" ? <span className="muted">Sedang dikirim</span>
        : a.emailStatus === "failed" ? <span className="is-wrong">Gagal</span> : <span className="muted">Tidak ada</span>;
    return <tr className={sel ? "is-selected" : ""} onClick={rowClick(href)}>
      <td className="is-check"><input type="checkbox" checked={sel} aria-label={`Pilih submission ${s ? s.name : a.contactName || a.short}`} onChange={(e) => onToggle(a.id, e.target.checked)} /></td>
      <td>{person}</td>
      <td className="nowrap"><ResultCell a={a} /></td>
      <td className="hide-sm">{level ? level.label : <span className="muted">Tidak ada</span>}</td>
      <td className="hide-md tnum">{fmtClock(a.durationSec)}</td>
      <td className={`hide-md tnum${a.violations >= (a.maxViolations || 3) ? " is-wrong" : ""}`}>{a.violations}</td>
      <td className="hide-xl">{email}{a.speaking ? <span className="cell-sub"><SpeakingRowLabel a={a} /></span> : null}</td>
      {tail}
    </tr>;
  }
  const pre = a.test === "post" && s ? latestGraded(s.id, "pre") : null;
  const d = pre && a.score !== null ? nilaiOf(a) - nilaiOf(pre) : null;
  return <tr className={sel ? "is-selected" : ""} onClick={rowClick(href)}>
    <td className="is-check"><input type="checkbox" checked={sel} aria-label={`Pilih submission ${s ? s.name : a.contactName || a.short}`} onChange={(e) => onToggle(a.id, e.target.checked)} /></td>
    <td>{person}</td>
    <td className="hide-md">{s ? <ProgramCell s={s} /> : null}</td>
    <td className="hide-tab">{s ? <ClassCell s={s} /> : null}</td>
    {a.test === "post" ? <td className="hide-xl tnum">{pre ? nilaiOf(pre) : <span className="muted">Tidak ada</span>}</td> : null}
    <td className="nowrap"><ResultCell a={a} />{d === null ? null : <span className="cell-sub"><span className={`delta ${d >= 0 ? "delta--up" : "delta--down"}`}>{d >= 0 ? "naik" : "turun"} {Math.abs(d)}</span> dari pre-test</span>}</td>
    {a.test === "post" ? <td><PassStatus a={a} /></td> : <td className="hide-lg tnum">{fmtClock(a.durationSec)}</td>}
    {tail}
  </tr>;
}

/* ===================== Lead ===================== */
function LeadTab() {
  useVersion();
  const rows = leads().sort((a, b) => lastActivityAt(b) - lastActivityAt(a));
  const cold = rows.filter(isColdLead);
  return <section className="panel">
    <header className="panel__head"><div>
      <h2 className="panel__title">Lead dari placement test</h2>
      <p className="panel__desc">Setiap orang yang mengisi kontak di placement test tetapi belum didaftarkan ke satu program pun. Setelah didaftarkan, profilnya pindah ke Database Siswa. Lead yang tidak ditindaklanjuti 90 hari menjadi dingin dan keluar dari antrean Ringkasan.</p>
    </div></header>
    {rows.length ? <>
      <div className="table-wrap"><table className="table">
        <thead><tr>
          <th scope="col">Lead</th>
          <th scope="col">Hasil placement</th>
          <th scope="col" className="hide-md">Sumber</th>
          <th scope="col">Tindak lanjut</th>
          <th scope="col" className="hide-lg">Tes terakhir</th>
          <th scope="col" className="is-action"><span className="sr-only">Aksi</span></th>
        </tr></thead>
        <tbody>{rows.map((s) => {
          const a = latestGraded(s.id, "placement");
          const coldness = isColdLead(s);
          return (
            <tr key={s.id} onClick={rowClick(`#/siswa/${s.id}`)}>
              <td><a className="cell-main" href={`#/siswa/${s.id}`}>{s.name}</a><span className="cell-sub cell-ellipsis">{s.email || fmtWa(s.wa)}</span>{coldness ? <span className="cell-sub"><span className="is-wrong">Dingin</span></span> : null}</td>
              <td>{a ? <><strong className="tnum">{a.score}</strong><span className="muted tnum"> / {attemptTotal(a)}</span><span className="cell-sub">{levelByKey(a.levelKey)?.label || ""}</span></> : <span className="muted">Belum selesai</span>}</td>
              <td className="hide-md">{s.source}</td>
              <td><StageStatus k={s.stage} /></td>
              <td className="hide-lg">{fmtDate(latestAttemptOf(s.id)?.startedAt || s.createdAt)}</td>
              <td className="is-action"><span className="row-actions">
                <button className="btn btn--primary btn--sm" type="button" onClick={() => openDaftar(s.id)}>Daftarkan</button>
              </span></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {cold.length ? <div className="panel__foot"><span>{cold.length} lead dingin, tidak muncul di antrean Ringkasan tapi tetap bisa dicari dan didaftarkan.</span></div> : null}
    </> : <Empty title="Tidak ada lead." desc="Setiap kontak placement test yang belum didaftarkan muncul di sini." />}
  </section>;
}

/* ===================== Pengaturan ===================== */
const validPer = (v) => Number.isInteger(v) && v >= 5 && v <= 180;

function SettingsTab({ testKey }) {
  useVersion();
  const t = db.tests[testKey], st = t.settings;
  const [mode, setMode] = useState(st.timeMode);
  const [min, setMin] = useState(Math.floor(st.totalSeconds / 60));
  const [sec, setSec] = useState(st.totalSeconds % 60);
  const [perDefault, setPerDefault] = useState(st.perDefault);
  const [sectionTimes, setSectionTimes] = useState({
    listening: Math.round((st.listeningSeconds ?? 1920) / 60),
    reading: Math.round((st.readingSeconds ?? 3600) / 60),
    writing: Math.round((st.writingSeconds ?? 3600) / 60),
    speaking: Math.round((st.speakingBlockSeconds ?? 900) / 60),
    listeningBreak: Math.round((st.listeningBreakSeconds ?? 0) / 60),
    readingBreak: Math.round((st.readingBreakSeconds ?? 0) / 60),
    writingBreak: Math.round((st.writingBreakSeconds ?? 0) / 60),
  });
  const [pass, setPass] = useState(st.passScore);
  const [openTest, setOpenTest] = useState(st.open);
  const [viol, setViol] = useState(st.maxViolations);
  const [speak, setSpeak] = useState({ on: st.speakingEnabled, count: st.speakingCount ?? 1, randomize: Boolean(st.speakingRandomize), max: st.speakingSeconds, min: st.speakingMinSeconds, dialect: st.speakingDialect });
  const [levels, setLevels] = useState(db.levels.map((l) => ({ ...l })));

  const now30 = db.attempts.filter((a) => a.test === testKey && a.startedAt >= Date.now() - 30 * 86400000);
  const graded30 = now30.filter((a) => a.status === "done" || a.status === "nocontact");
  const avgDur = graded30.length ? Math.round(graded30.reduce((s, a) => s + a.durationSec, 0) / graded30.length) : 0;
  const timeoutShare = pct(now30.filter((a) => a.status === "timeout").length, now30.length);

  const n = activeQuestions(t).length;
  const total = mode === "total" ? (Number(min) || 0) * 60 + (Number(sec) || 0) : activeQuestions(t).reduce((s, q) => s + q.seconds, 0);
  const timeDirty = mode !== st.timeMode || (mode === "total" && total !== st.totalSeconds) || (mode === "per" && Number(perDefault) !== st.perDefault);
  const sectionTotalSeconds = (Number(sectionTimes.listening) + Number(sectionTimes.reading) + Number(sectionTimes.writing) + Number(sectionTimes.speaking)) * 60;
  const sectionDirty = Number(sectionTimes.listening) * 60 !== (st.listeningSeconds ?? 1920)
    || Number(sectionTimes.reading) * 60 !== (st.readingSeconds ?? 3600)
    || Number(sectionTimes.writing) * 60 !== (st.writingSeconds ?? 3600)
    || Number(sectionTimes.speaking) * 60 !== (st.speakingBlockSeconds ?? 900)
    || Number(sectionTimes.listeningBreak) * 60 !== (st.listeningBreakSeconds ?? 0)
    || Number(sectionTimes.readingBreak) * 60 !== (st.readingBreakSeconds ?? 0)
    || Number(sectionTimes.writingBreak) * 60 !== (st.writingBreakSeconds ?? 0);
  const recent = db.attempts.filter((a) => a.test === "post" && a.status === "done" && a.startedAt >= Date.now() - 30 * 86400000);
  const passCount = recent.filter((a) => nilaiOf(a) >= Number(pass)).length;

  async function saveTime(e) {
    clearErrors($("#panel-time"));
    const body = { timeMode: mode };
    if (mode === "total") {
      const m = Number(min), s = Number(sec), tot = m * 60 + s;
      const maxMinutes = testKey === "ielts-mockup" ? 180 : 60;
      if (!Number.isInteger(m) || !Number.isInteger(s) || s < 0 || s > 59 || tot < 60 || tot > maxMinutes * 60) { fieldError($("#set-min"), "set-time-err", `Durasi tes harus antara 1 dan ${maxMinutes} menit, dengan detik dari 0 sampai 59.`); $("#set-min").focus(); return; }
      body.totalSeconds = tot;
    } else {
      const v = Number(perDefault);
      if (!validPer(v)) { fieldError($("#set-per"), "set-time-err", "Waktu bawaan per soal harus antara 5 dan 180 detik."); $("#set-per").focus(); return; }
      body.perDefault = v;
    }
    const done = busy(e.currentTarget, "Menyimpan...");
    await mutate(() => api(`/api/admin/tests/${testKey}`, { method: "PUT", body }),
      () => (mode === "total" ? `Waktu total ${fmtSpan(body.totalSeconds)} tersimpan untuk tes berikutnya.` : `Waktu per soal tersimpan. Total tes sekarang ${fmtSpan(testSeconds(t))}.`));
    done();
  }

  async function saveSections(e) {
    clearErrors($("#panel-time"));
    const values = Object.fromEntries(Object.entries(sectionTimes).map(([key, value]) => [key, Number(value)]));
    for (const [key, value] of Object.entries(values)) {
      const isBreak = key.endsWith("Break");
      if (!Number.isInteger(value) || value < (isBreak ? 0 : 1) || value > (isBreak ? 30 : 180)) {
        fieldError(document.getElementById(`set-sec-${key}`), "set-time-err", isBreak
          ? "Menit jeda antar bagian harus antara 0 dan 30."
          : "Isi menit untuk setiap bagian, 1 sampai 180.");
        document.getElementById(`set-sec-${key}`)?.focus();
        return;
      }
    }
    const done = busy(e.currentTarget, "Menyimpan...");
    await mutate(() => api(`/api/admin/tests/${testKey}`, {
      method: "PUT",
      body: {
        timeMode: "sections",
        listeningSeconds: values.listening * 60,
        readingSeconds: values.reading * 60,
        writingSeconds: values.writing * 60,
        speakingBlockSeconds: values.speaking * 60,
        listeningBreakSeconds: values.listeningBreak * 60,
        readingBreakSeconds: values.readingBreak * 60,
        writingBreakSeconds: values.writingBreak * 60,
      },
    }), `Waktu per bagian tersimpan: Listening ${values.listening} menit, Reading ${values.reading} menit, Writing ${values.writing} menit, Speaking ${values.speaking} menit, dengan jeda ${values.listeningBreak}/${values.readingBreak}/${values.writingBreak} menit.`);
    done();
  }

  async function applyPerAll(e) {
    const v = Number(perDefault);
    clearErrors($("#panel-time"));
    if (!validPer(v)) { fieldError($("#set-per"), "set-time-err", "Waktu bawaan per soal harus antara 5 dan 180 detik."); $("#set-per").focus(); return; }
    const done = busy(e.currentTarget, "Menerapkan...");
    await mutate(() => api(`/api/admin/tests/${testKey}/apply-seconds`, { method: "POST", body: { seconds: v } }),
      () => (t.settings.timeMode === "per" ? `Semua soal sekarang punya waktu ${v} detik.` : `Semua soal sekarang punya waktu ${v} detik. Pilih mode waktu per soal lalu simpan supaya waktunya berlaku.`));
    done();
  }

  async function savePass(e) {
    const v = Number(pass);
    clearErrors($("#panel-pass"));
    if (!Number.isInteger(v) || v < 0 || v > 100) { fieldError($("#set-pass"), "set-pass-err", "Nilai kelulusan harus angka bulat dari 0 sampai 100."); $("#set-pass").focus(); return; }
    const done = busy(e.currentTarget, "Menyimpan...");
    await mutate(() => api(`/api/admin/tests/${testKey}`, { method: "PUT", body: { passScore: v } }), `Nilai kelulusan post-test sekarang ${v}. Hasil yang sudah masuk tetap memakai batas lama.`);
    done();
  }

  async function saveRules(e) {
    const done = busy(e.currentTarget, "Menyimpan...");
    await mutate(() => api(`/api/admin/tests/${testKey}`, { method: "PUT", body: { open: openTest, maxViolations: Number(viol) } }),
      openTest ? "Aturan tes tersimpan. Tes dibuka." : "Aturan tes tersimpan. Tes ditutup sementara.");
    done();
  }

  async function saveSpeaking(e) {
    clearErrors($("#panel-speaking"));
    const on = speak.on;
    const activeBank = db.speakingBank.filter((q) => q.status === "aktif").length;
    if (on && !activeBank) { fieldError(null, "speaking-err", "Bank speaking kosong. Tambahkan pertanyaan di tab Speaking dulu."); return; }
    if (!Number.isInteger(Number(speak.count)) || Number(speak.count) < 1 || Number(speak.count) > 50) { fieldError($("#set-speak-count"), "speaking-err", "Jumlah pertanyaan harus angka 1 sampai 50."); $("#set-speak-count").focus(); return; }
    if (!Number.isInteger(Number(speak.min)) || Number(speak.min) < 5 || Number(speak.min) > 30) { fieldError($("#set-speak-min"), "speaking-err", "Durasi minimal harus antara 5 dan 30 detik."); $("#set-speak-min").focus(); return; }
    if (!Number.isInteger(Number(speak.max)) || Number(speak.max) < 15 || Number(speak.max) > 90) { fieldError($("#set-speak-max"), "speaking-err", "Durasi maksimal harus antara 15 dan 90 detik."); $("#set-speak-max").focus(); return; }
    if (Number(speak.min) >= Number(speak.max)) { fieldError($("#set-speak-min"), "speaking-err", "Durasi minimal harus lebih pendek dari durasi maksimal."); $("#set-speak-min").focus(); return; }
    const done = busy(e.currentTarget, "Menyimpan...");
    await mutate(() => api("/api/admin/tests/placement", {
      method: "PUT",
      body: { speakingEnabled: on, speakingCount: Number(speak.count), speakingRandomize: Boolean(speak.randomize), speakingSeconds: Number(speak.max), speakingMinSeconds: Number(speak.min), speakingDialect: speak.dialect },
    }), on ? `Bagian speaking aktif, ${Math.min(Number(speak.count), activeBank)} pertanyaan per peserta.` : "Bagian speaking dimatikan. Peserta yang sedang merekam tetap bisa mengirim.");
    done();
  }

  async function saveLevels(e) {
    const rows = levels.map((l, i) => ({ l, min: Number(l.min), max: Number(l.max), i }));
    const nActive = activeQuestions(db.tests.placement).length;
    clearErrors($("#panel-levels"));
    const fail = (i, field, msg) => { const el = document.getElementById(`lv-${field}-${i}`); fieldError(el, "levels-err", msg); el?.focus(); };
    for (const r of rows) {
      if (!Number.isInteger(r.min) || !Number.isInteger(r.max)) return fail(r.i, "max", `Isi skor minimum dan maksimum untuk level ${r.l.label}.`);
      if (r.min > r.max) return fail(r.i, "min", `Skor minimum ${r.l.label} lebih besar dari skor maksimumnya.`);
      if (r.i > 0 && r.min !== rows[r.i - 1].max + 1) return fail(r.i, "min", `Level ${r.l.label} harus dimulai tepat setelah ${rows[r.i - 1].l.label}, yaitu dari skor ${rows[r.i - 1].max + 1}.`);
    }
    if (rows[rows.length - 1].max !== nActive) return fail(rows.length - 1, "max", `Level terakhir harus berakhir di skor ${nActive}, sesuai jumlah soal aktif.`);
    const done = busy(e.currentTarget, "Menyimpan...");
    await mutate(() => api("/api/admin/levels", { method: "PUT", body: { levels: rows.map((r) => ({ key: r.l.key, min: r.min, max: r.max })) } }), "Ambang level tersimpan. Submission lama tetap memakai level saat dinilai.");
    done();
  }

  const accessHint = testKey === "placement"
    ? "Kalau ditutup, halaman tes menampilkan pesan bahwa tes sedang tidak tersedia. Pakai ini saat tim sedang merombak soal."
    : "Siswa terdaftar membuka tes lewat tautan pribadi dari admin. Kalau ditutup, tautan itu menampilkan pesan bahwa tes belum dibuka.";
  const sum = db.speaking;
  const [mockupAuto, setMockupAuto] = useState(st.autoSubmit);

  async function saveMockupAuto(e) {
    const done = busy(e.currentTarget, "Menyimpan...");
    await mutate(() => api(`/api/admin/tests/ielts-mockup`, { method: "PUT", body: { autoSubmit: mockupAuto } }),
      mockupAuto ? "Tersimpan. Saat waktu habis, jawaban terkirim otomatis." : "Tersimpan. Saat waktu habis, percobaan dianggap gagal.");
    done();
  }

  return <div className="stack">
    {testKey === "ielts-mockup" ? (
      <section className="panel" id="panel-time">
        <header className="panel__head"><div>
          <h2 className="panel__title">Waktu per bagian</h2>
          <p className="panel__desc">Setiap bagian punya hitungan sendiri. Saat waktunya habis, bagian itu terkunci dan tes pindah ke bagian berikutnya. Peserta tidak bisa kembali ke bagian sebelumnya.</p>
        </div></header>
        <div className="panel__body">
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="set-sec-listening">Listening</label>
              <div className="unit-row"><span className="unit"><input className="input tnum" id="set-sec-listening" type="number" min="1" max="180" value={sectionTimes.listening} onChange={(e) => setSectionTimes((s) => ({ ...s, listening: e.target.value }))} /><span>menit</span></span></div>
              <p className="hint">30 menit audio dan 2 menit untuk memeriksa jawaban.</p>
            </div>
            <div className="field">
              <label className="label" htmlFor="set-sec-reading">Reading</label>
              <div className="unit-row"><span className="unit"><input className="input tnum" id="set-sec-reading" type="number" min="1" max="180" value={sectionTimes.reading} onChange={(e) => setSectionTimes((s) => ({ ...s, reading: e.target.value }))} /><span>menit</span></span></div>
              <p className="hint">Tiga bacaan dengan 40 soal.</p>
            </div>
            <div className="field">
              <label className="label" htmlFor="set-sec-writing">Writing</label>
              <div className="unit-row"><span className="unit"><input className="input tnum" id="set-sec-writing" type="number" min="1" max="180" value={sectionTimes.writing} onChange={(e) => setSectionTimes((s) => ({ ...s, writing: e.target.value }))} /><span>menit</span></span></div>
              <p className="hint">Dua task esai.</p>
            </div>
            <div className="field">
              <label className="label" htmlFor="set-sec-speaking">Speaking</label>
              <div className="unit-row"><span className="unit"><input className="input tnum" id="set-sec-speaking" type="number" min="1" max="180" value={sectionTimes.speaking} onChange={(e) => setSectionTimes((s) => ({ ...s, speaking: e.target.value }))} /><span>menit</span></span></div>
              <p className="hint">Wawancara 18 pertanyaan, termasuk persiapan Part 2.</p>
            </div>
          </div>
          <p className="panel__desc">Jeda antar bagian</p>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="set-sec-listeningBreak">Jeda setelah Listening</label>
              <div className="unit-row"><span className="unit"><input className="input tnum" id="set-sec-listeningBreak" type="number" min="0" max="30" value={sectionTimes.listeningBreak} onChange={(e) => setSectionTimes((s) => ({ ...s, listeningBreak: e.target.value }))} /><span>menit</span></span></div>
              <p className="hint">0 berarti langsung lanjut tanpa jeda.</p>
            </div>
            <div className="field">
              <label className="label" htmlFor="set-sec-readingBreak">Jeda setelah Reading</label>
              <div className="unit-row"><span className="unit"><input className="input tnum" id="set-sec-readingBreak" type="number" min="0" max="30" value={sectionTimes.readingBreak} onChange={(e) => setSectionTimes((s) => ({ ...s, readingBreak: e.target.value }))} /><span>menit</span></span></div>
              <p className="hint">Jeda muncul sebelum Writing dimulai.</p>
            </div>
            <div className="field">
              <label className="label" htmlFor="set-sec-writingBreak">Jeda setelah Writing</label>
              <div className="unit-row"><span className="unit"><input className="input tnum" id="set-sec-writingBreak" type="number" min="0" max="30" value={sectionTimes.writingBreak} onChange={(e) => setSectionTimes((s) => ({ ...s, writingBreak: e.target.value }))} /><span>menit</span></span></div>
              <p className="hint">Jeda sebelum wawancara speaking dimulai.</p>
            </div>
          </div>
          <p className="note note--gap">Listening memakai satu audio untuk Part 1 sampai Part 4. Peserta bebas berpindah soal di dalam Listening selama audio diputar.</p>
          <p className="error" id="set-time-err" hidden></p>
        </div>
        <div className="panel__foot panel__foot--end">
          <span className="readout__sub">Total {fmtSpan(sectionTotalSeconds)}</span>
          <button className="btn btn--primary" type="button" disabled={!sectionDirty} onClick={saveSections}>Simpan waktu bagian</button>
        </div>
      </section>
    ) : (
    <section className="panel" id="panel-time">
      <header className="panel__head"><div>
        <h2 className="panel__title">Waktu pengerjaan</h2>
        <p className="panel__desc">Pilih satu cara menghitung waktu. Aturan baru berlaku untuk peserta yang memulai tes setelah disimpan, sedangkan peserta yang sedang mengerjakan tetap memakai aturan lama.</p>
      </div></header>
      <div className="panel__body">
        <div className="modes" role="radiogroup" aria-label="Cara menghitung waktu">
          <label className={`mode${mode === "total" ? " is-on" : ""}`}>
            <input type="radio" name="time-mode" value="total" checked={mode === "total"} onChange={() => setMode("total")} /><span className="mode__mark" aria-hidden="true"></span>
            <span><span className="mode__title">Waktu total</span><span className="mode__desc">Satu hitungan mundur untuk seluruh tes. Peserta bebas berpindah soal dan boleh kembali ke soal sebelumnya selama waktunya masih ada.</span></span>
          </label>
          <label className={`mode${mode === "per" ? " is-on" : ""}`}>
            <input type="radio" name="time-mode" value="per" checked={mode === "per"} onChange={() => setMode("per")} /><span className="mode__mark" aria-hidden="true"></span>
            <span><span className="mode__title">Waktu per soal</span><span className="mode__desc">Setiap soal punya hitungan sendiri. Saat waktunya habis, tes pindah ke soal berikutnya, soal itu dianggap kosong, dan peserta tidak bisa kembali.</span></span>
          </label>
        </div>
        <div className="time-grid">
          <div className="time-fields">
            <div className="field" hidden={mode !== "total"}>
              <span className="label" id="lbl-total">Durasi tes</span>
              <div className="unit-row" role="group" aria-labelledby="lbl-total">
                <label className="unit"><input className="input tnum" type="number" id="set-min" min="0" max={testKey === "ielts-mockup" ? 180 : 60} value={min} onChange={(e) => setMin(e.target.value)} /><span>menit</span></label>
                <label className="unit"><input className="input tnum" type="number" id="set-sec" min="0" max="59" step="5" value={sec} onChange={(e) => setSec(e.target.value)} /><span>detik</span></label>
              </div>
            </div>
            <div className="field" hidden={mode !== "per"}>
              <label className="label" htmlFor="set-per">Waktu bawaan per soal</label>
              <div className="unit-row">
                <span className="unit"><input className="input tnum" type="number" id="set-per" min="5" max="180" value={perDefault} onChange={(e) => setPerDefault(e.target.value)} /><span>detik</span></span>
                <button className="btn btn--quiet btn--sm" type="button" onClick={applyPerAll}>Terapkan ke semua soal</button>
              </div>
              <p className="hint">Waktu tiap soal juga bisa diubah satu per satu lewat tombol Ubah di bagian Soal &amp; Jawaban.</p>
            </div>
            <p className="error" id="set-time-err" hidden></p>
          </div>
          <div className="readout" aria-live="polite">
            <span className="readout__label">Total waktu tes</span>
            <span className="readout__value">{fmtClock(Math.max(0, total))}</span>
            <span className="readout__sub">{mode === "total"
              ? `untuk ${n} soal aktif, sekitar ${n ? Math.round(total / n) : 0} detik per soal`
              : `jumlah waktu ${n} soal aktif, rata-rata ${n ? Math.round(total / n) : 0} detik per soal`}</span>
          </div>
        </div>
        <p className="note note--gap">{graded30.length ? `Dalam 30 hari terakhir, peserta yang menyelesaikan tes ini rata-rata butuh ${fmtSpan(avgDur)}, dan ${timeoutShare}% percobaan berhenti karena waktu habis. Angka ini bisa jadi patokan sebelum mengubah durasi.` : "Belum ada submission dalam 30 hari terakhir, jadi belum ada patokan durasi dari data peserta."}</p>
      </div>
      <div className="panel__foot panel__foot--end">
        <button className="link-btn" type="button" hidden={!timeDirty} onClick={() => { setMode(st.timeMode); setMin(Math.floor(st.totalSeconds / 60)); setSec(st.totalSeconds % 60); setPerDefault(st.perDefault); }}>Batalkan perubahan</button>
        <button className="btn btn--primary" type="button" disabled={!timeDirty} onClick={saveTime}>Simpan pengaturan waktu</button>
      </div>
    </section>
    )}

    {testKey === "post" ? <section className="panel" id="panel-pass">
      <header className="panel__head"><div>
        <h2 className="panel__title">Nilai kelulusan</h2>
        <p className="panel__desc">Siswa dengan nilai post-test di bawah batas ini disarankan mengulang level yang sama. Nilai dihitung dari persentase jawaban benar, dari 0 sampai 100.</p>
      </div></header>
      <div className="panel__body time-grid">
        <div className="field">
          <label className="label" htmlFor="set-pass">Nilai minimum lulus</label>
          <div className="unit-row"><span className="unit"><input className="input tnum" type="number" id="set-pass" min="0" max="100" value={pass} onChange={(e) => setPass(e.target.value)} /><span>dari 100</span></span></div>
          <p className="hint">Hasil post-test yang sudah masuk tetap memakai batas saat dinilai.</p>
          <p className="error" id="set-pass-err" hidden></p>
        </div>
        <div className="readout" aria-live="polite">
          <span className="readout__label">Kalau batas ini dipakai</span>
          <span className="readout__value">{recent.length ? `${pct(passCount, recent.length)}% lulus` : "Belum ada data"}</span>
          <span className="readout__sub">{recent.length ? `${passCount} dari ${recent.length} siswa pada post-test 30 hari terakhir mencapai nilai ${pass}` : "Belum ada post-test dalam 30 hari terakhir"}</span>
        </div>
      </div>
      <div className="panel__foot panel__foot--end"><button className="btn btn--primary" type="button" disabled={Number(pass) === st.passScore} onClick={savePass}>Simpan nilai kelulusan</button></div>
    </section> : null}

    {testKey === "ielts-mockup" ? <section className="panel" id="panel-mockup">
      <header className="panel__head"><div>
        <h2 className="panel__title">Pengiriman jawaban</h2>
        <p className="panel__desc">Aturan mock IELTS: waktu habis mengirim jawaban apa adanya dan tetap menghasilkan band.</p>
      </div></header>
      <div className="panel__body rules">
        <div className="field">
          <label className="switch"><input type="checkbox" checked={mockupAuto} onChange={(e) => setMockupAuto(e.target.checked)} /><span className="switch__track" aria-hidden="true"></span>Kirim jawaban otomatis saat waktu habis</label>
          <p className="hint">Matikan untuk menggagalkan percobaan seperti placement test. Audio dan bacaan sekarang diatur per bagian di tab Bagian, bukan di sini.</p>
        </div>
      </div>
      <div className="panel__foot panel__foot--end">
        <a className="link-btn" href="#/tes/ielts-mockup/bagian">Buka tab Bagian</a>
        <button className="btn btn--primary" type="button" onClick={saveMockupAuto}>Simpan pengiriman</button>
      </div>
    </section> : null}

    <section className="panel" id="panel-rules">
      <header className="panel__head"><div>
        <h2 className="panel__title">Akses dan aturan tes</h2>
        <p className="panel__desc">Atur kapan tes bisa dikerjakan dan seberapa ketat aturan fokusnya.</p>
      </div></header>
      <div className="panel__body rules">
        <div className="field">
          <label className="switch"><input type="checkbox" id="set-open" checked={openTest} onChange={(e) => setOpenTest(e.target.checked)} /><span className="switch__track" aria-hidden="true"></span>Tes dibuka untuk {TEST_META[testKey].who}</label>
          <p className="hint">{accessHint}</p>
        </div>
        <div className="field">
          <label className="label" htmlFor="set-viol">Batas pelanggaran fokus</label>
          <select className="select select--auto" id="set-viol" value={viol} onChange={(e) => setViol(e.target.value)}>
            <OptList list={[1, 2, 3, 4, 5].map((x) => [x, `${x} kali`])} />
          </select>
          <p className="hint">Keluar dari layar penuh, pindah tab, atau berpindah jendela dihitung sebagai pelanggaran. Saat batasnya tercapai, tes berhenti dan peserta diminta mengulang.</p>
        </div>
      </div>
      <div className="panel__foot panel__foot--end"><button className="btn btn--primary" type="button" disabled={openTest === st.open && Number(viol) === st.maxViolations} onClick={saveRules}>Simpan aturan tes</button></div>
    </section>

    {testKey === "placement" ? <section className="panel" id="panel-speaking">
      <header className="panel__head"><div>
        <h2 className="panel__title">Bagian speaking</h2>
        <p className="panel__desc">Kalau dinyalakan, peserta merekam satu jawaban untuk setiap pertanyaan yang dipilih dari bank di tab Speaking. Rekaman dinilai Speechace, dan hasil lengkap baru dikirim setelah semua penilaian selesai. Nilai speaking tampil terpisah dan tidak mengubah level dari soal pilihan ganda.</p>
      </div></header>
      <div className="panel__body rules">
        <div className="field">
          <label className="switch"><input type="checkbox" id="set-speak-on" checked={speak.on} onChange={(e) => setSpeak((s) => ({ ...s, on: e.target.checked }))} /><span className="switch__track" aria-hidden="true"></span>Nyalakan bagian speaking</label>
          <p className="hint">{sum.configured ? "Kunci Speechace sudah terpasang di server, jadi rekaman dinilai otomatis." : "Kunci Speechace belum terpasang di server ini, jadi semua rekaman langsung masuk antrean penilaian manual."}</p>
        </div>
        <div className="field">
          <label className="label" htmlFor="set-speak-count">Jumlah pertanyaan untuk peserta</label>
          <div className="unit-row"><span className="unit"><input className="input tnum" id="set-speak-count" type="number" min="1" max="50" value={speak.count} onChange={(e) => setSpeak((s) => ({ ...s, count: e.target.value }))} /><span>pertanyaan</span></span></div>
          <p className="hint">Diambil dari bank di tab Speaking. Jumlahnya {db.speakingBank.filter((q) => q.status === "aktif").length} pertanyaan aktif sekarang; kalau angka di atas lebih besar dari bank, semua pertanyaan dipakai. Satu pertanyaan berarti selalu pertanyaan pertama.</p>
        </div>
        <div className="field">
          <label className="switch"><input type="checkbox" id="set-speak-random" checked={speak.randomize} onChange={(e) => setSpeak((s) => ({ ...s, randomize: e.target.checked }))} /><span className="switch__track" aria-hidden="true"></span>Pilih pertanyaannya secara acak</label>
          <p className="hint">Aktif: setiap peserta mendapat pertanyaan yang berbeda secara acak. Nonaktif: semua peserta mendapat beberapa pertanyaan pertama dalam urutan bank.</p>
        </div>
        <div className="field">
          <label className="label" htmlFor="set-speak-max">Durasi maksimal, detik</label>
          <input className="input tnum" id="set-speak-max" type="number" min="15" max="90" value={speak.max} onChange={(e) => setSpeak((s) => ({ ...s, max: e.target.value }))} />
          <p className="hint">Rekaman berhenti sendiri saat mencapai batas ini.</p>
        </div>
        <div className="field">
          <label className="label" htmlFor="set-speak-min">Durasi minimal, detik</label>
          <input className="input tnum" id="set-speak-min" type="number" min="5" max="30" value={speak.min} onChange={(e) => setSpeak((s) => ({ ...s, min: e.target.value }))} />
          <p className="hint">Rekaman yang lebih pendek ditolak dan peserta merekam ulang, jadi jawabannya selalu cukup panjang untuk dinilai.</p>
        </div>
        <div className="field">
          <label className="label" htmlFor="set-speak-dialect">Aksen penilaian</label>
          <select className="select select--auto" id="set-speak-dialect" value={speak.dialect} onChange={(e) => setSpeak((s) => ({ ...s, dialect: e.target.value }))}>
            <OptList list={[["en-us", "English (US)"], ["en-gb", "English (UK)"]]} />
          </select>
          <p className="hint">Penilaian otomatis memakai aksen ini. Jawaban dalam bahasa lain ditolak Speechace.</p>
        </div>
        <p className="error" id="speaking-err" hidden></p>
      </div>
      <div className="panel__foot panel__foot--end">
        <span className="hint">{sum.review ? `Ada ${sum.review} rekaman menunggu dinilai tim.` : sum.waiting ? `${sum.waiting} rekaman sedang menunggu penilaian.` : "Belum ada rekaman yang menunggu."}</span>
        <button className="btn btn--primary" type="button" id="speaking-save"
          disabled={speak.on === st.speakingEnabled && Number(speak.count) === st.speakingCount && speak.randomize === st.speakingRandomize && Number(speak.max) === st.speakingSeconds && Number(speak.min) === st.speakingMinSeconds && speak.dialect === st.speakingDialect}
          onClick={saveSpeaking}>Simpan pengaturan speaking</button>
      </div>
    </section> : null}

    {testKey === "placement" ? <section className="panel" id="panel-levels">
      <header className="panel__head"><div>
        <h2 className="panel__title">Ambang level</h2>
        <p className="panel__desc">Skor menentukan level dan program yang direkomendasikan di halaman hasil. Rentang skor harus menyambung tanpa celah dari 0 sampai jumlah soal aktif, yaitu {n}.</p>
      </div></header>
      <LevelMismatchNotice />
      <div className="table-wrap"><table className="table levels-table">
        <thead><tr><th scope="col">Level</th><th scope="col">Skor minimum</th><th scope="col">Skor maksimum</th><th scope="col" className="hide-sm">Program rekomendasi</th></tr></thead>
        <tbody>{levels.map((l, i) => (
          <tr key={l.key}>
            <td><span className="cell-main">{l.label}</span></td>
            <td><label className="sr-only" htmlFor={`lv-min-${i}`}>Skor minimum {l.label}</label><input className="input tnum" id={`lv-min-${i}`} type="number" min="0" max="100" value={l.min} readOnly={i === 0} onChange={(e) => setLevels((list) => list.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} /></td>
            <td><label className="sr-only" htmlFor={`lv-max-${i}`}>Skor maksimum {l.label}</label><input className="input tnum" id={`lv-max-${i}`} type="number" min="0" max="100" value={l.max} onChange={(e) => setLevels((list) => list.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))} /></td>
            <td className="hide-sm">{l.program}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="panel__foot">
        <p className="error" id="levels-err" hidden></p>
        <span className="row-actions push-end"><button className="btn btn--primary" type="button" onClick={saveLevels}>Simpan ambang level</button></span>
      </div>
    </section> : null}
  </div>;
}

/* ===================== Submission detail ===================== */
export function AttemptDetail({ testKey, id }) {
  useVersion();
  ui.test = testKey;
  const meta = TEST_META[testKey];
  const base = db.attempts.find((a) => a.id === id);
  const a = withDetail(base);
  const crumbsBase = [[meta.name, `#/tes/${testKey}/soal`], ["Submission", `#/tes/${testKey}/submission`]];
  if (!a || a.test !== testKey) {
    return <>
      <PageHead crumbs={[...crumbsBase, ["Tidak ditemukan", ""]]} title="Submission tidak ditemukan" />
      <section className="panel"><Empty title="Submission ini sudah dihapus atau tautannya salah." desc="Kembali ke daftar submission untuk mencari dengan nama atau ID."
        action={<a className="btn btn--quiet btn--sm" href={`#/tes/${testKey}/submission`}>Kembali ke daftar submission</a>} /></section>
    </>;
  }
  const t = db.tests[testKey];
  const s = a.studentId ? studentById(a.studentId) : null;
  const level = a.levelKey ? levelByKey(a.levelKey) : null;
  const total = attemptTotal(a);
  const title = s ? s.name : a.contactName || "Submission tanpa nama";
  let notice = null;
  if (a.status === "void") notice = <Notice icon="ban">Hasil ini dibatalkan oleh {a.voidBy} pada {fmtDateTime(a.voidAt)}. Alasan: {a.voidReason || "tidak diisi."} Skornya tidak dihitung di ringkasan dan profil siswa.</Notice>;
  else if (a.status === "timeout") notice = <Notice icon="clock" neutral>Tes berhenti karena waktu habis sebelum jawaban dikirim. Sistem tidak menyimpan jawaban dari percobaan yang gagal, jadi yang tercatat hanya waktu dan pelanggarannya.</Notice>;
  else if (a.status === "violation") notice = <Notice icon="alert" neutral>Tes berhenti setelah {a.violations} kali pelanggaran fokus. Sistem tidak menyimpan jawaban dari percobaan yang gagal, jadi yang tercatat hanya waktu dan pelanggarannya.</Notice>;
  else if (a.status === "nocontact") notice = <Notice icon="user" neutral>Peserta sudah mengirim jawaban, tetapi menutup halaman sebelum mengisi nama, email, dan WhatsApp. Hasilnya tersimpan tanpa kontak dan tidak masuk ke Database Siswa.</Notice>;
  else if (a.status === "progress") notice = <Notice icon="clock" neutral>Tes ini sedang dikerjakan atau ditinggalkan sebelum selesai. Hasilnya muncul di sini setelah jawaban dikirim.</Notice>;

  // Answer rows keep the order the questions were shown in. The key is the one stored at grading time.
  const answerRows = (a.answers || []).map((x, i) => {
    const q = t.questions.find((y) => y.id === Number(x.questionId));
    return { no: i + 1, q, r: { choice: x.choice, ok: x.ok, key: x.key || (q ? q.answer : "") } };
  });
  // The essays get their own panel; the answer table only holds the keyed questions.
  const writingRows = answerRows.filter((x) => x.q && x.q.type === "longtext");
  const objectiveRows = answerRows.filter((x) => !x.q || x.q.type !== "longtext");
  const hasAnswers = objectiveRows.length > 0;
  const answerSkills = [...new Set(objectiveRows.filter((x) => x.q).map((x) => x.q.skill))];
  const skillRows = hasAnswers ? answerSkills.map((k) => {
    const rows = objectiveRows.filter((x) => x.q && x.q.skill === k);
    return { k, ok: rows.filter((x) => x.r.ok).length, n: rows.length };
  }).filter((r) => r.n) : [];
  const wrong = objectiveRows.filter((x) => x.r.choice && !x.r.ok).length;
  const blank = objectiveRows.filter((x) => !x.r.choice).length;
  const filter = ui.answers;
  const shownAnswers = objectiveRows.filter((x) => filter === "all" || (filter === "wrong" ? x.r.choice && !x.r.ok : !x.r.choice));
  let strike = 0;
  const logRows = (a.log || []).map((e, i) => {
    let text = LOG_TEXT[e.type] || e.type;
    if (e.strike) { strike += 1; text += `, pelanggaran ke-${strike}`; }
    if ((e.type === "email_sent" || e.type === "email_failed" || e.type === "email_resent") && s && s.email) text += ` ke ${s.email}`;
    if (e.type === "consent" && a.consent) text += ` versi ${a.consent}`;
    if (e.by) text += ` oleh ${e.by}`;
    return (
      <li key={i} className="feed__item"><span className="feed__icon" aria-hidden="true"><Icon name={e.strike ? "alert" : e.type.startsWith("email") ? "mail" : e.type.startsWith("speaking") ? "mic" : e.type === "audio_played" ? "clock" : e.type === "voided" ? "ban" : "clock"} /></span>
        <div><p className="feed__text">{text}</p><p className="feed__meta"><span className="log__time">{fmtDate(e.at)}, {fmtTime(e.at, true)}</span></p></div></li>
    );
  });
  const cell = (label, value, sub) => (
    <div className="stat" key={label}><p className="stat__label">{label}</p><p className={`stat__value${/^\d/.test(String(value)) ? "" : " stat__value--text"}`}>{value}</p><p className="stat__note">{sub}</p></div>
  );
  const canResend = testKey === "placement" && a.status === "done";
  const pre = testKey === "post" && s ? latestGraded(s.id, "pre") : null;
  const nilai = nilaiOf(a);
  const c = s ? classById(s.classId) : null;
  const detailNote = a.loading ? "rincian sedang dimuat" : hasAnswers ? `${wrong} salah dan ${blank} kosong` : "";
  const cells = [];
  if (testKey === "ielts-mockup") {
    const bands = a.bands || { skills: [], overall: 0 };
    const pkg = a.packageId ? db.tests["ielts-mockup"].packages.find((p) => p.id === a.packageId) : null;
    cells.push(cell("Paket", pkg ? pkg.name : "-", "paket soal yang dikerjakan"));
    cells.push(cell("Band keseluruhan", bands.overall || "-", `perkiraan dari ${bands.skills.map((s) => s.skill).join(", ")}`));
    for (const sk of bands.skills) {
      if (sk.skill === "Writing") {
        cells.push(cell("Writing", <>band {sk.band}</>, "dinilai AI dari dua task"));
      } else if (sk.skill === "Speaking") {
        cells.push(cell("Speaking", <>band {sk.band}</>, "dinilai otomatis dari rekaman"));
      } else {
        cells.push(cell(`${sk.skill} (band ${sk.band})`, <>{sk.raw}<small> / 40</small></>, `benar ${sk.raw} dari 40`));
      }
    }
    if (!bands.skills.some((s) => s.skill === "Speaking")) {
      cells.push(cell("Speaking", a.speakingStatus === "skipped" ? "Dilewati" : a.speakingStatus === "failed" ? "Gagal" : "Belum dinilai", "dinilai otomatis dari rekaman"));
    }
    cells.push(cell("Audio", a.audioPlayedAt ? "Diputar" : "Belum diputar", a.audioPlayedAt ? fmtDateTime(a.audioPlayedAt) : "aturan mock: sekali per attempt"));
  } else if (testKey === "placement") {
    cells.push(cell("Skor", a.score === null ? "Tidak dinilai" : <>{a.score}<small> / {total}</small></>, a.score === null ? "percobaan gagal tidak punya skor" : detailNote || `${a.score} jawaban benar`));
    cells.push(cell("Level", level ? level.label : "Tidak ada", level ? level.program : "level hanya untuk tes yang dinilai"));
  } else {
    cells.push(cell("Nilai", nilai === null ? "Tidak dinilai" : <>{nilai}<small> / 100</small></>, a.score === null ? "percobaan gagal tidak punya nilai" : [`${a.score} dari ${total} benar`, detailNote].filter(Boolean).join(", ")));
    if (testKey === "post") {
      cells.push(cell("Hasil", a.passed === null ? "Tidak ada" : a.passed ? "Lulus" : "Belum lulus", a.passed === null ? "hasil hanya untuk tes yang dinilai" : `batas ${a.passScore}${pre ? `, pre-test ${nilaiOf(pre)}, ${nilai - nilaiOf(pre) >= 0 ? "naik" : "turun"} ${Math.abs(nilai - nilaiOf(pre))}` : ""}`));
    } else {
      cells.push(cell("Tutor / Kelas", c ? `${c.tutor} / ${c.code}` : "Belum ada kelas", s && programById(s.programId) ? `${programById(s.programId).name}, periode ${periodById(s.periodId) ? fmtDate(periodById(s.periodId).start) : "belum ditentukan"}` : "program belum dipilih"));
    }
  }
  cells.push(cell("Durasi", fmtClock(a.durationSec), `dari batas ${fmtClock(a.limitSec)}`));
  cells.push(cell("Pelanggaran fokus", String(a.violations), `batas ${a.maxViolations || t.settings.maxViolations} kali sebelum tes berhenti`));
  // Pick a column count that divides the cells, so no row ends with empty blocks.
  const statsClass = cells.length === 2 ? "stats stats--2"
    : cells.length === 3 ? "stats stats--3"
      : cells.length === 5 ? "stats stats--5"
        : cells.length % 3 === 0 && cells.length <= 9 ? "stats stats--3"
          : "stats stats--4";

  return <>
    <PageHead
      crumbs={[...crumbsBase, [`ID ${a.short}`, ""]]}
      title={title}
      desc={<p className="meta-line"><span>{meta.name}</span><span>Dimulai {fmtDateTime(a.startedAt)}</span>{a.device ? <span>{a.device}</span> : null}{a.country ? <span>{a.country}</span> : null}<span><AttemptStatus a={a} /></span></p>}
      actions={<>
        {s ? <a className="btn btn--quiet" href={`#/siswa/${s.id}`}><Icon name="user" />Buka profil siswa</a> : null}
        {canResend ? <button className="btn btn--secondary" type="button" onClick={(e) => resendEmail(a, e.currentTarget)}><Icon name="send" />Kirim ulang email hasil</button> : null}
        <MenuBtn kind="attempt" id={a.id} label="Aksi lain" boxed />
      </>} />
    <div className="stack">
      {notice}
      <section className="panel" aria-label="Ringkasan submission">
        <div className={statsClass}>{cells}</div>
        {skillRows.length ? <div className="skills">{skillRows.map((r) => (
          <div className="skill" key={r.k}>
            <div className="skill__top"><span className="skill__name">{r.k}</span><span className="skill__val">{r.ok} dari {r.n} benar</span></div>
            <span className="bar" aria-hidden="true"><span className="bar__fill" style={{ width: `${pct(r.ok, r.n)}%` }} /></span>
          </div>
        ))}</div> : null}
      </section>

      <section className="panel">
        <header className="panel__head"><div>
          <h2 className="panel__title">Jawaban</h2>
          <p className="panel__desc">{a.loading ? "Jawaban sedang dimuat dari database." : hasAnswers ? "Kunci yang tampil adalah kunci saat submission ini dinilai, jadi tetap akurat walaupun soalnya sudah diubah." : "Jawaban tidak tersimpan karena tes berhenti sebelum dikirim."}</p>
        </div></header>
        {a.loading ? <p className="loading-line" role="status">Memuat jawaban...</p> : hasAnswers ? <>
          <div className="toolbar toolbar--last toolbar--flush">
            <div className="chips" role="group" aria-label="Saring jawaban">
              {[["all", "Semua", objectiveRows.length], ["wrong", "Salah", wrong], ["blank", "Kosong", blank]].map(([k, label, n]) => (
                <Chip key={k} value={k} label={label} n={n} pressed={filter === k}
                  onClick={(v) => { ui.answers = v; notify(); }} />
              ))}
            </div>
          </div>
          {shownAnswers.length ? <div className="table-wrap"><table className="table">
            <thead><tr><th scope="col" className="is-no">No</th><th scope="col">Soal</th><th scope="col">Jawaban</th><th scope="col" className="hide-sm">Kunci</th><th scope="col">Hasil</th></tr></thead>
            <tbody>{shownAnswers.map(({ no, q, r }) => (
              <tr key={no}>
                <td className="is-no">{pad(no)}</td>
                <td>{q ? <span className="clamp-1">{q.prompt}</span> : <span className="muted">Soal ini sudah dihapus dari bank soal.</span>}</td>
                <td>{r.choice
                  ? <span className={r.ok ? "" : "is-wrong"}>{r.choice}{q && q.options && q.options[r.choice] ? `, ${q.options[r.choice]}` : ""}</span>
                  : <span className="muted">Tidak dijawab</span>}</td>
                <td className="hide-sm">{r.key}{q && q.options && q.options[r.key] ? `, ${q.options[r.key]}` : ""}{q && q.accepted && q.type === "text" ? <span className="cell-sub">Diterima: {(q.accepted || []).join(", ")}</span> : ""}</td>
                <td>{r.ok ? <span className="result result--ok"><Icon name="check" />Benar</span> : r.choice ? <span className="result result--bad"><Icon name="x" />Salah</span> : <span className="result result--none">Kosong</span>}</td>
              </tr>
            ))}</tbody>
          </table></div> : <Empty title="Tidak ada jawaban di kelompok ini." desc="Pilih kelompok lain untuk melihat jawabannya." />}
        </> : null}
      </section>

      {testKey === "ielts-mockup" ? <WritingPanel a={a} rows={writingRows} /> : null}
      {testKey === "ielts-mockup" ? <MockupSpeakingPanel a={a} /> : null}

      {testKey === "placement" ? <PlacementSpeakingPanels a={a} /> : null}

      <section className="panel">
        <header className="panel__head"><div>
          <h2 className="panel__title">Catatan sistem</h2>
          <p className="panel__desc">Urutan kejadian selama tes, termasuk persetujuan, pelanggaran fokus, dan pengiriman email. Alamat IP tidak disimpan.</p>
        </div></header>
        {a.loading ? <p className="loading-line" role="status">Memuat catatan sistem...</p> : <ol className="feed">{logRows}</ol>}
      </section>
    </div>
  </>;
}

/* ===================== The writing panel ===================== */

const WRITING_CRITERIA = [
  ["task_response", "Task Response"],
  ["coherence_cohesion", "Coherence & Cohesion"],
  ["lexical_resource", "Lexical Resource"],
  ["grammatical_range_accuracy", "Grammatical Range & Accuracy"],
];

function WritingPanel({ a, rows }) {
  const writing = a.bands?.skills?.find((s) => s.skill === "Writing") || null;
  const [busy, setBusy] = useState(false);

  async function regrade(e) {
    const b = e.currentTarget;
    b.disabled = true;
    setBusy(true);
    await mutate(() => api(`/api/admin/attempts/${a.id}/writing-grade`, { method: "POST" }), "Writing dinilai ulang.");
    setBusy(false);
  }

  return <section className="panel" aria-label="Writing">
    <header className="panel__head"><div>
      <h2 className="panel__title">Writing</h2>
      <p className="panel__desc">Dinilai AI dengan empat kriteria IELTS. Task 2 berbobot dua kali Task 1, dan band Writing masuk ke band keseluruhan.</p>
    </div>
    <button className="btn btn--quiet btn--sm" type="button" disabled={busy || a.loading} onClick={regrade}>{busy ? "Menilai..." : "Nilai ulang writing"}</button>
    </header>
    {a.loading ? <p className="loading-line" role="status">Memuat esai...</p> : <>
      {a.writingStatus === "failed" ? <Notice icon="alert" neutral>Penilaian AI gagal: {a.writingError || "tidak ada pesan."} Perbaiki kunci AI, lalu tekan Nilai ulang writing.</Notice> : null}
      {writing ? <div className="writing-total"><span>Band Writing</span><strong>{writing.band}</strong></div> : null}
      <div className="writing-tasks">
        {rows.map(({ q, r }) => {
          const task = writing?.tasks?.find((t) => t.taskNumber === (q.part || 1));
          const words = task?.words ?? String(r.choice || "").trim().split(/\s+/).filter(Boolean).length;
          return <article className="writing-task" key={q.id}>
            <header className="writing-task__head">
              <h3 className="writing-task__title">Task {q.part || 1}</h3>
              {task ? <span className="writing-task__band">Band {task.band}</span> : null}
              <span className="hint">{words} kata dari minimal {q.minWords} kata</span>
            </header>
            {task ? <dl className="writing-criteria">
              {WRITING_CRITERIA.map(([key, label]) => task.criteria?.[key] ? <div className="writing-criterion" key={key}>
                <dt>{label} <strong>{task.criteria[key].band}</strong></dt>
                <dd>{task.criteria[key].comment}</dd>
              </div> : null)}
            </dl> : null}
            {task?.strengths?.length ? <p className="hint">Kelebihan: {task.strengths.join("; ")}.</p> : null}
            {task?.improvements?.length ? <p className="hint">Saran: {task.improvements.join("; ")}.</p> : null}
            <p className="writing-essay">{r.choice || "(tidak dijawab)"}</p>
          </article>;
        })}
      </div>
    </>}
  </section>;
}

/* ===================== The mockup speaking panel ===================== */

const SPEAK_STATUS = { pending: "Menunggu", grading: "Sedang dinilai", graded: "Dinilai", manual: "Dinilai manual", failed: "Gagal", skipped: "Dilewati" };
const SPEAK_ASPECTS = [["pronunciation", "Pronunciation"], ["fluency", "Fluency"], ["grammar", "Grammar"], ["vocab", "Vocabulary"], ["coherence", "Coherence"]];

function MockupSpeakingPanel({ a }) {
  const speaking = a.bands?.skills?.find((s) => s.skill === "Speaking") || null;
  const answers = a.speakingAnswers || [];
  const [busy, setBusy] = useState(false);
  const hasFailed = answers.some((x) => x.status === "failed");

  async function retry(e) {
    const b = e.currentTarget;
    b.disabled = true;
    setBusy(true);
    await mutate(() => api(`/api/admin/attempts/${a.id}/speaking-retry`, { method: "POST" }), "Jawaban speaking yang gagal masuk antrean penilaian ulang.");
    setBusy(false);
  }

  if (!answers.length && !speaking && a.speakingStatus !== "skipped") return null;
  return <section className="panel" aria-label="Speaking">
    <header className="panel__head"><div>
      <h2 className="panel__title">Speaking</h2>
      <p className="panel__desc">Dinilai otomatis dengan empat kriteria IELTS. Rekaman dihapus 30 hari setelah tes.</p>
    </div>
    {hasFailed ? <button className="btn btn--quiet btn--sm" type="button" disabled={busy || a.loading} onClick={retry}>{busy ? "Mengantrekan..." : "Nilai ulang yang gagal"}</button> : null}
    </header>
    {a.loading ? <p className="loading-line" role="status">Memuat rekaman...</p> : <>
      {a.speakingStatus === "skipped" ? <Notice icon="user" neutral>Peserta melewati bagian speaking, jadi tidak ada rekaman yang dinilai.</Notice> : null}
      {a.speakingStatus === "failed" ? <Notice icon="alert" neutral>Penilaian speaking gagal: {a.speakingError || "tidak ada pesan."} Perbaiki kuota atau kunci Speechace, lalu tekan Nilai ulang yang gagal.</Notice> : null}
      {speaking ? <div className="writing-total"><span>Band Speaking</span><strong>{speaking.band}</strong></div> : null}
      {speaking ? <dl className="writing-criteria speaking-criteria">
        {[["pronunciation", "Pronunciation"], ["fluency_coherence", "Fluency & Coherence"], ["lexical_resource", "Lexical Resource"], ["grammatical_range_accuracy", "Grammatical Range & Accuracy"]].map(([key, label]) => (
          speaking.criteria?.[key] === null || speaking.criteria?.[key] === undefined ? null
            : <div className="writing-criterion" key={key}><dt>{label} <strong>{speaking.criteria[key]}</strong></dt></div>
        ))}
      </dl> : null}
      <div className="writing-tasks">
        {answers.map((ans) => {
          const aspects = ans.scores?.aspects || {};
          return <article className="writing-task" key={ans.id}>
            <header className="writing-task__head">
              <h3 className="writing-task__title">Part {ans.part} · Pertanyaan {ans.prompt_no}</h3>
              <span className="writing-task__band">{SPEAK_STATUS[ans.status] || ans.status}</span>
              <span className="hint">{ans.duration_seconds ? `${ans.duration_seconds} detik` : ""}{ans.needs_review ? " · perlu dicek" : ""}</span>
            </header>
            <p className="q-prompt">{ans.prompt}</p>
            {ans.transcript ? <p className="hint">Transkrip: {ans.transcript}</p> : null}
            {Object.keys(aspects).length ? <p className="hint">{SPEAK_ASPECTS.map(([key, label]) => `${label} ${aspects[key]?.ielts ?? "-"}`).join(" · ")}</p> : null}
            {ans.error ? <p className="error">{ans.error}</p> : null}
            {ans.has_audio && (ans.status === "graded" || ans.status === "manual") ? <audio className="speaking-answer__audio" controls preload="none" src={`/api/admin/speaking-answers/${ans.id}/audio`}></audio> : null}
          </article>;
        })}
      </div>
    </>}
  </section>;
}

/* ===================== The speaking panel ===================== */
/* One panel per speaking recording. The old single recording still works: the detail carries
   one row, and the skip marker explains itself when there is nothing recorded. */
function PlacementSpeakingPanels({ a }) {
  if (a.loading) {
    return <section className="panel" aria-label="Speaking">
      <header className="panel__head"><div><h2 className="panel__title">Speaking</h2></div></header>
      <p className="loading-line" role="status">Memuat rekaman speaking...</p>
    </section>;
  }
  const rows = a.speakingSubmissions || [];
  if (!rows.length) return null;
  return <>{rows.map((sp) => <SpeakingPanel key={sp.id} sp={sp} />)}</>;
}

function SpeakingPanel({ sp }) {
  if (!sp) return null;
  const scores = sp.scores || {};
  const aspects = scores.aspects || {};
  const hasScores = sp.status === "graded" || sp.status === "manual";
  const canGrade = sp.status === "failed" || (sp.status === "graded" && sp.needsReview);
  const studentSkip = sp.status === "skipped" && scores.source === "student";
  const overall = scores.overall || {};
  const notes = [...(scores.notes || []), ...(scores.note ? [scores.note] : [])].filter(Boolean);
  const issues = scores.issues || [];

  const actions = [];
  if (sp.status === "failed") {
    actions.push(<button key="retry" className="btn btn--secondary" type="button" onClick={() => speakingRetry(sp.id)}>Coba nilai lagi</button>);
    actions.push(<button key="skip" className="btn btn--quiet" type="button" onClick={() => speakingSkip(sp.id)}>Tidak dinilai</button>);
  }
  if (sp.status === "graded" && sp.needsReview) {
    actions.push(<button key="reviewed" className="btn btn--secondary" type="button" onClick={() => speakingReviewed(sp.id)}>Sudah dicek</button>);
  }
  if (sp.nextAttemptAt) {
    actions.push(<span key="next" className="cell-sub">Dicoba lagi otomatis {fmtDateTime(sp.nextAttemptAt)}.</span>);
  }

  async function grade(e) {
    clearErrors(e.currentTarget.closest(".speak-grade"));
    const suffix = `-${sp.id}`;
    const cefr = $(`#sg-cefr${suffix}`).value;
    const ielts = $(`#sg-ielts${suffix}`).value.trim();
    const note = $(`#sg-note${suffix}`).value.trim();
    const aspectValues = Object.fromEntries(SPEAKING_ASPECTS.map(([key]) => [key, document.getElementById(`sg-a-${key}${suffix}`).value]));
    if (!cefr) { fieldError($(`#sg-cefr${suffix}`), `sg-err${suffix}`, "Pilih CEFR keseluruhan dulu."); $(`#sg-cefr${suffix}`).focus(); return; }
    const done = busy(e.currentTarget, "Menyimpan...");
    try {
      const result = await api(`/api/admin/speaking/${sp.id}/grade`, { method: "POST", body: { cefr, ielts: ielts || null, aspects: aspectValues, note } });
      await reload();
      toast(result.sending ? "Nilai speaking disimpan dan hasil dikirim ke peserta." : "Nilai speaking disimpan. Hasilnya sudah terkirim sebelumnya.");
    } catch (error) {
      if (error.field === "cefr") fieldError($(`#sg-cefr${suffix}`), `sg-err${suffix}`, error.message);
      else if (error.field === "ielts") fieldError($(`#sg-ielts${suffix}`), `sg-err${suffix}`, error.message);
      else if (error.field && document.getElementById(`sg-a-${error.field}${suffix}`)) fieldError(document.getElementById(`sg-a-${error.field}${suffix}`), `sg-err${suffix}`, error.message);
      else fieldError($(`#sg-note${suffix}`), `sg-err${suffix}`, error.message);
    }
    done();
  }

  const figure = (label, value, sub) => (
    <div className="prop" key={label}>
      <span className="prop__label">{label}</span>
      <span className="prop__value prop__value--figure">{value}</span>
      <span className="prop__sub">{sub}</span>
    </div>
  );
  const summary = hasScores ? <div className="props" aria-label="Ringkasan nilai speaking">
    {figure("CEFR keseluruhan", sp.cefr || "-", "level speaking")}
    {figure("IELTS", sp.ielts === null || sp.ielts === undefined ? "-" : Number(sp.ielts).toFixed(1), "perkiraan band")}
    {figure("Skor", overall.score === null || overall.score === undefined ? "-" : Math.round(overall.score), "dari 100")}
    {figure("Dinilai", sp.status === "manual" ? "Manual" : "Otomatis", sp.gradedAt ? fmtDateTime(sp.gradedAt) : "belum ada waktu")}
  </div> : null;

  const relevance = scores.source === "speechace" && scores.relevance
    ? <p className="speak-relevance">{scores.relevance === "TRUE" ? <Status label="Sesuai pertanyaan" kind="done" /> : <Status label="Belum sesuai pertanyaan" kind="red" />}</p>
    : null;

  const cefrSelect = (id, label, selected) => (
    <div className="field" key={id}>
      <label className="label" htmlFor={id}>{label}</label>
      <select className="select select--auto" id={id} defaultValue={selected || ""}>
        <OptList list={[["", "Pilih"], ...db.speakingCefr.map((x) => [x, x])]} />
      </select>
    </div>
  );
  const suffix = `-${sp.id}`;

  return <section className="panel" aria-label="Speaking">
    <header className="panel__head">
      <div>
        <h2 className="panel__title">Speaking <SpeakingStatus sp={sp} />{sp.position ? `Pertanyaan ${sp.position}` : ""}</h2>
        <p className="panel__desc">Pertanyaan: {sp.prompt || "-"}</p>
      </div>
      {actions.length ? <span className="row-actions">{actions}</span> : null}
    </header>
    {summary}
    <div className="panel__body speak-body">
      {sp.error ? <Notice icon="alert">{sp.error}</Notice> : null}
      {studentSkip ? <Notice icon="user" neutral>{sp.error || "Peserta melewati bagian speaking."} Hasil dikirim tanpa nilai speaking.</Notice> : null}

      <div className="speak-block">
        <p className="speak-label">Rekaman{sp.durationSeconds ? `, ${sp.durationSeconds} detik` : ""}{sp.audioBytes ? `, ${Math.max(1, Math.round(sp.audioBytes / 1024))} KB` : ""}</p>
        {sp.hasAudio
          ? <>
            <audio className="speak-audio" controls preload="none" src={speakingAudioUrl(sp.id)}></audio>
            <p className="hint">Rekaman disimpan 30 hari setelah tes, lalu dihapus otomatis. Nilai dan transkrip tetap tersimpan.</p>
          </>
          : <p className="hint">Rekaman sudah tidak tersimpan{sp.gradedAt ? ", tetapi nilai dan transkripnya masih ada" : ""}.</p>}
      </div>

      {hasScores ? <div className="speak-columns">
        <div className="speak-block">
          <p className="speak-label">Rincian nilai</p>
          <table className="table speak-table">
            <thead><tr><th scope="col">Aspek</th><th scope="col">CEFR</th><th scope="col">IELTS</th><th scope="col">Skor</th></tr></thead>
            <tbody>{SPEAKING_ASPECTS.map(([key, label]) => {
              const v = aspects[key] || {};
              return <tr key={key}><td>{label}</td><td>{v.cefr || <span className="muted">-</span>}</td><td>{v.ielts ?? <span className="muted">-</span>}</td><td>{v.score === null || v.score === undefined ? <span className="muted">-</span> : Math.round(v.score)}</td></tr>;
            })}</tbody>
          </table>
          {scores.previous ? <p className="hint">Sebelum dikoreksi, nilai otomatisnya {scores.previous.cefr || "tidak ada"}{scores.previous.ielts === null || scores.previous.ielts === undefined ? "" : `, IELTS ${scores.previous.ielts}`}.</p> : null}
          {issues.length ? <p className="hint">{issues.map((i) => i.message || i.code).join(" ")}</p> : null}
        </div>
        <div className="speak-block">
          {sp.transcript ? <><p className="speak-label">Transkrip jawaban</p><p className="transcript-text">{sp.transcript}</p></> : null}
          {relevance}
          {notes.length ? <><p className={`speak-label${sp.transcript ? " speak-label--gap" : ""}`}>Catatan penilai</p><ol className="speak-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ol></> : null}
          {!sp.transcript && !notes.length && !relevance ? <p className="hint">Tidak ada transkrip atau catatan untuk rekaman ini.</p> : null}
        </div>
      </div> : null}

      {canGrade ? <div className="speak-grade">
        <p className="panel__desc">{sp.status === "failed" ? "Nilai rekaman ini secara manual. Hasil dikirim otomatis setelah disimpan." : "Koreksi nilai otomatis kalau hasilnya tidak wajar. Nilai yang kamu isi menggantikan nilai sebelumnya."}</p>
        <div className="speak-grade__grid">
          {cefrSelect(`sg-cefr${suffix}`, "CEFR keseluruhan", "")}
          <div className="field">
            <label className="label" htmlFor={`sg-ielts${suffix}`}>IELTS, opsional</label>
            <input className="input tnum" id={`sg-ielts${suffix}`} type="text" inputMode="decimal" placeholder="Contoh: 6.5" />
          </div>
          {SPEAKING_ASPECTS.map(([key, label]) => cefrSelect(`sg-a-${key}${suffix}`, label, aspects[key]?.cefr || ""))}
        </div>
        <div className="field">
          <label className="label" htmlFor={`sg-note${suffix}`}>Catatan untuk siswa, opsional</label>
          <textarea className="input" id={`sg-note${suffix}`} rows="2" maxLength="500" placeholder="Contoh: jawaban bagus, tapi banyak jeda panjang."></textarea>
        </div>
        <p className="error" id={`sg-err${suffix}`} hidden></p>
        <button className="btn btn--primary" type="button" onClick={grade}>Simpan nilai dan kirim hasil</button>
      </div> : null}
    </div>
  </section>;
}

// The app shell: sidebar, account, hash router, bulk bar, and the page title behavior.
// Ported from the old index.html shell, render(), setNav(), updateBulkBar(), and start().

import { useEffect, useState } from "react";
import { dataReady, db, notify, reload, route, ui, useRoute, useVersion, TEST_KEYS, LOGIN } from "./store.js";
import { isColdLead, leads, exportStudents, exportAttempts, TEST_META } from "./lib.js";
import { Icon, PageHead, Empty } from "./ui.jsx";
import { closeMenu } from "./menus.jsx"; // also registers the menu listeners
import { deleteStudents, deleteAttempts } from "./actions.js";
import { Ringkasan } from "./views/Ringkasan.jsx";
import { SiswaList, SiswaDetail } from "./views/Siswa.jsx";
import { Sertifikat } from "./views/Sertifikat.jsx";
import { TestPage, AttemptDetail } from "./views/Test.jsx";
import { ProgramKelas } from "./views/Program.jsx";
import { DialogHost, ConfirmHost } from "./dialogs.jsx";

/* ===================== Sidebar ===================== */
function Sidebar({ nav }) {
  useVersion();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("tnec-nav-collapsed") === "1"; } catch { return false; } });
  useEffect(() => { document.body.classList.toggle("nav-collapsed", collapsed); }, [collapsed]);
  const fresh = leads().filter((s) => s.stage === "baru" && !isColdLead(s)).length;
  const items = [
    ["ringkasan", "#/ringkasan", "dashboard", "Ringkasan"],
    ["siswa", "#/siswa", "users", "Database Siswa"],
    ["sertifikat", "#/sertifikat", "award", "Sertifikat"],
  ];
  const tests = [
    ["tes-placement", "#/tes/placement/soal", "clipboard", "Placement Test"],
    ["tes-pre", "#/tes/pre/soal", "note", "Pre-test"],
    ["tes-post", "#/tes/post/soal", "cap", "Post-test"],
    ["tes-ielts", "#/tes/ielts-mockup/soal", "layers", "IELTS Mockup"],
  ];
  return (
    <aside className="sidebar" aria-label="Navigasi dasbor">
      <div className="brand">
        <div className="brand__row">
          <img className="brand__logo" src="/assets/logo-titik-nol-white.png" alt="Titik Nol English Course" width="501" height="84" />
          <svg className="brand__mark" viewBox="0 0 36 36" role="img" aria-label="Titik Nol English Course"><rect width="36" height="36" rx="10" fill="#16325C" /><text x="18" y="23" textAnchor="middle" fontFamily="Inter, 'Segoe UI', Arial, sans-serif" fontSize="13" fontWeight="700" fill="#FFFFFF">TN</text></svg>
          <button className="icon-btn icon-btn--dark nav-toggle" type="button" aria-controls="main-nav" aria-expanded={!collapsed}
            aria-label={collapsed ? "Lebarkan menu" : "Ciutkan menu"} title={collapsed ? "Lebarkan menu" : "Ciutkan menu"}
            onClick={() => { const next = !collapsed; setCollapsed(next); try { localStorage.setItem("tnec-nav-collapsed", next ? "1" : "0"); } catch { /* storage can be off */ } }}>
            <Icon name={collapsed ? "panel-open" : "panel-close"} />
          </button>
        </div>
        <span className="brand__name">Dasbor internal</span>
      </div>
      <nav className="nav" id="main-nav" aria-label="Menu utama">
        {items.map(([key, href, icon, label]) => (
          <a key={key} className="nav__link" href={href} data-nav={key} title={label} {...(nav === key ? { "aria-current": "page" } : {})}>
            <Icon name={icon} /><span className="nav__label">{label}</span>
            {key === "siswa" ? <span className="nav__count" title="Calon siswa baru yang belum dihubungi" hidden={!fresh}>{fresh}</span> : null}
          </a>
        ))}
        <p className="nav__group">Tes</p><span className="nav__sep" aria-hidden="true"></span>
        {tests.map(([key, href, icon, label]) => (
          <a key={key} className="nav__link" href={href} data-nav={key} title={label} {...(nav === key ? { "aria-current": "page" } : {})}>
            <Icon name={icon} /><span className="nav__label">{label}</span>
          </a>
        ))}
        <p className="nav__group">Pengaturan</p><span className="nav__sep" aria-hidden="true"></span>
        <a className="nav__link" href="#/program/program" data-nav="program" title="Program & Kelas" {...(nav === "program" ? { "aria-current": "page" } : {})}>
          <Icon name="layers" /><span className="nav__label">Program &amp; Kelas</span>
        </a>
      </nav>
      <div className="sidebar__foot">
        <div className="account">
          <span className="avatar" aria-hidden="true">{db.me ? db.me.name.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("") : ""}</span>
          <span className="account__text"><span className="account__name">{db.me?.name || "Memuat..."}</span><span className="account__role">{db.me?.role === "pendidikan" ? "Tim pendidikan" : "Admin"}</span></span>
          <button className="icon-btn icon-btn--dark account__out" type="button" aria-label="Keluar dari dasbor" title="Keluar"
            onClick={async (e) => {
              const b = e.currentTarget; b.disabled = true;
              try { await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }); } catch { /* the login page still opens */ }
              window.location.assign(LOGIN);
            }}><Icon name="logout" /></button>
        </div>
      </div>
    </aside>
  );
}

/* ===================== Bulk bar ===================== */
function BulkBar() {
  useVersion();
  const { parts } = route();
  let set = null, scope = null;
  if (parts[0] === "siswa" && !parts[1]) { scope = "students"; set = ui.students.selected; }
  if (parts[0] === "tes" && parts[2] === "submission" && !parts[3] && TEST_KEYS.includes(parts[1])) { scope = "attempts"; set = ui.attempts[parts[1]].selected; }
  if (!set || !set.size) return null;
  const n = set.size;
  const clear = () => { set.clear(); notify(); };
  return (
    <div className="bulk" role="region" aria-label="Aksi untuk data terpilih">
      {scope === "students" ? <>
        <span className="bulk__count">{n} siswa dipilih</span>
        <span className="bulk__actions">
          <button className="btn btn--dark btn--sm" type="button" data-menu="bulk-stage" aria-haspopup="menu" aria-expanded="false">Ubah status</button>
          <button className="btn btn--dark btn--sm" type="button" data-menu="bulk-period" aria-haspopup="menu" aria-expanded="false">Atur periode</button>
          <button className="btn btn--dark btn--sm" type="button" onClick={() => exportStudents(db.students.filter((s) => set.has(s.id)))}>Ekspor</button>
          <button className="btn btn--dark btn--sm" type="button" onClick={() => deleteStudents([...set], false)}>Hapus</button>
        </span>
        <button className="icon-btn icon-btn--dark" type="button" aria-label="Batalkan pilihan" onClick={clear}><Icon name="x" /></button>
      </> : <>
        <span className="bulk__count">{n} submission dipilih</span>
        <span className="bulk__actions">
          <button className="btn btn--dark btn--sm" type="button" onClick={() => exportAttempts(db.attempts.filter((a) => set.has(a.id)))}>Ekspor</button>
          <button className="btn btn--dark btn--sm" type="button" onClick={() => deleteAttempts([...set], false)}>Hapus</button>
        </span>
        <button className="icon-btn icon-btn--dark" type="button" aria-label="Batalkan pilihan" onClick={clear}><Icon name="x" /></button>
      </>}
    </div>
  );
}

/* ===================== Router ===================== */
function currentView(parts, params) {
  if (parts[0] === "siswa" && parts[1]) {
    const s = db.students.find((x) => x.id === parts[1]);
    return { view: <SiswaDetail id={parts[1]} />, nav: "siswa", title: s ? s.name : "Siswa tidak ditemukan" };
  }
  if (parts[0] === "siswa") return { view: <SiswaList />, nav: "siswa", title: "Database Siswa" };
  if (parts[0] === "tes" && parts[2] === "submission" && parts[3]) {
    const meta = TEST_META[parts[1]] || TEST_META.placement;
    const a = db.attempts.find((x) => x.id === parts[3]);
    return { view: <AttemptDetail testKey={TEST_KEYS.includes(parts[1]) ? parts[1] : "placement"} id={parts[3]} />, nav: meta.nav, title: `${meta.name} ${a ? a.short : ""}` };
  }
  if (parts[0] === "tes") {
    const key = TEST_KEYS.includes(parts[1]) ? parts[1] : "placement";
    const tab = ["soal", "submission", "lead", "bagian", "paket", "pengaturan"].includes(parts[2]) ? parts[2] : "soal";
    const tabLabel = { soal: "Soal & Jawaban", submission: "Submission", lead: "Lead", bagian: "Bagian", paket: "Paket", pengaturan: "Pengaturan" }[tab];
    return { view: <TestPage testKey={key} tab={tab} />, nav: TEST_META[key].nav, title: `${TEST_META[key].name}, ${tabLabel}` };
  }
  if (parts[0] === "program") {
    const tab = ["program", "periode", "kelas"].includes(parts[1]) ? parts[1] : "program";
    return { view: <ProgramKelas tab={tab} />, nav: "program", title: { program: "Program", periode: "Periode", kelas: "Kelas & Tutor" }[tab] };
  }
  if (parts[0] === "sertifikat") {
    const tab = parts[1] === "pengaturan" ? "pengaturan" : "daftar";
    return { view: <Sertifikat tab={tab} />, nav: "sertifikat", title: tab === "daftar" ? "Sertifikat" : "Sertifikat, Pengaturan" };
  }
  return { view: <Ringkasan />, nav: "ringkasan", title: "Ringkasan" };
}

/* ===================== App ===================== */
export default function App() {
  const [error, setError] = useState("");
  useVersion();
  const { parts, params } = useRoute();

  useEffect(() => {
    window.addEventListener("hashchange", notify);
    if (!dataReady) reload().catch((e) => setError(e.message || "Server tidak merespons."));
    return () => window.removeEventListener("hashchange", notify);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An unknown test key falls back to Placement, like the old render().
  useEffect(() => {
    if (parts[0] === "tes" && !TEST_KEYS.includes(parts[1])) {
      const tab = ["soal", "submission", "pengaturan"].includes(parts[1]) ? parts[1] : "soal";
      history.replaceState(null, "", `#/tes/placement/${tab}`);
      notify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts.join("/")]);

  const path = parts.join("/");
  useEffect(() => {
    closeMenu();
    if (path !== ui.lastPath) {
      window.scrollTo(0, 0);
      ui.answers = "all";
      document.querySelector("#main h1")?.focus({ preventScroll: true });
      ui.lastPath = path;
    }
    if (params.get("bagian") === "level") document.getElementById("panel-levels")?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, params.toString()]);

  // The page title follows the current view, like the old render().
  useEffect(() => {
    if (dataReady) {
      const { title } = currentView(route().parts, route().params);
      document.title = `${title} | Dasbor Titik Nol`;
    }
  });

  if (error) {
    return <>
      <PageHead title="Data belum bisa dimuat" />
      <section className="panel"><Empty title={error} desc="Periksa koneksi internet, lalu coba lagi. Kalau masalahnya berlanjut, hubungi admin teknis."
        action={<button className="btn btn--primary btn--sm" type="button" onClick={() => { setError(""); reload().catch((e) => setError(e.message)); }}>Coba lagi</button>} /></section>
    </>;
  }
  if (!dataReady) return <p className="loading-line loading-line--page" role="status">Memuat data dasbor...</p>;

  const { view, nav, title } = currentView(parts, params);
  return <>
    <a className="skip" href="#main">Langsung ke konten</a>
    <div className="app">
      <Sidebar nav={nav} />
      <main className="main" id="main" tabIndex="-1">{view}</main>
    </div>
    <BulkBar />
    <DialogHost />
    <ConfirmHost />
  </>;
}

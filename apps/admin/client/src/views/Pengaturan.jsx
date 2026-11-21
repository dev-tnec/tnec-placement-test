// Pengaturan: the Saluran WhatsApp panel (one channel id per branch, with a test send) and the
// Staf panel (accounts, roles, activation). Per docs/prd-perbaikan-dasbor-dan-akun-staf.md.

import { useEffect, useState } from "react";
import { api, db, mutate, useVersion } from "../store.js";
import { Icon, Empty, PageHead } from "../ui.jsx";
import { $, busy, clearErrors, fieldError, makeFieldFail, toast } from "../dom.js";
import { BRANCHES, branchLabel } from "@tnec/core/branches";
import { MenuBtn } from "../menus.jsx";

const FALLBACK = "Jatuh ke saluran Pare bila kosong.";

export function Pengaturan({ tab }) {
  useVersion();
  const tabs = [["saluran", "Saluran WhatsApp"], ["staf", "Staf"]];
  if (db.me?.role !== "admin") tabs.length = 1; // the staff tab is owner-only
  if (!tabs.some(([key]) => key === tab)) tab = "saluran";
  return <>
    <PageHead title="Pengaturan" desc="Saluran WhatsApp per cabang dan akun staf." />
    <nav className="seg tabs" aria-label="Bagian pengaturan">
      {tabs.map(([key, label]) => (
        <a key={key} className="seg__item" href={`#/pengaturan/${key}`} {...(key === tab ? { "aria-current": "page" } : {})}>{label}</a>
      ))}
    </nav>
    {tab === "saluran" ? <ChannelPanel /> : null}
    {tab === "staf" && db.me?.role === "admin" ? <StaffPanel /> : null}
  </>;
}

/* ===================== Saluran WhatsApp ===================== */

function ChannelPanel() {
  const [channels, setChannels] = useState(null);

  const load = async () => {
    const r = await api("/api/admin/whatsapp-channels");
    setChannels(r.channels);
  };
  useEffect(() => { load().catch((e) => toast(e.message)); }, []);

  if (channels === null) return <section className="panel"><p className="panel__desc">Memuat saluran...</p></section>;
  const pare = channels.find((c) => c.branch === "pare");
  return <>
    <section className="panel">
      <header className="panel__head"><div>
        <h2 className="panel__title">Saluran WhatsApp per cabang</h2>
        <p className="panel__desc">Hasil placement test dikirim dari saluran cabang yang dipilih siswa. Online memakai saluran Pare. Cabang yang salurannya kosong jatuh ke Pare, jadi pengiriman tidak pernah berhenti.</p>
      </div></header>
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">Cabang</th><th scope="col">ID saluran AttCos</th><th scope="col" className="hide-sm">Terakhir diubah</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th></tr></thead>
        <tbody>
          {BRANCHES.map(([key]) => {
            const c = channels.find((x) => x.branch === key) || { branch: key, channelId: "", updatedBy: "", updatedAt: null };
            return (
              <tr key={key}>
                <td><span className="cell-main">{branchLabel(key)}</span>
                  <span className="cell-sub">{key === "pare" ? "Saluran utama, cadangan semua cabang" : key === "online" ? "Memakai saluran Pare bila kosong" : FALLBACK}</span></td>
                <td className="tnum">{c.channelId ? <code className="channel-code">{c.channelId}</code> : <span className="muted">Belum diisi</span>}</td>
                <td className="hide-sm cell-sub">{c.updatedAt ? <>oleh {c.updatedBy}</> : <span className="muted">Belum pernah</span>}</td>
                <td className="is-action"><span className="row-actions">
                  <button className="btn btn--quiet btn--sm" type="button" onClick={() => editChannel(key, branchLabel(key), c.channelId, load)}>Ubah</button>
                  <button className="btn btn--quiet btn--sm" type="button" onClick={() => testChannel(key, branchLabel(key))}>Uji kirim</button>
                </span></td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      {pare && !pare.channelId ? <p className="error" role="alert">Saluran Pare belum terisi. Semua cabang jatuh ke Pare, jadi isi dulu baris Pare di atas.</p> : null}
    </section>
  </>;
}

function editChannel(branch, label, current, done) {
  const existing = document.getElementById("dlg-channel");
  if (existing) existing.remove();
  const dlg = document.createElement("dialog");
  dlg.id = "dlg-channel";
  dlg.className = "dialog";
  dlg.innerHTML = `
    <form class="dialog__form" novalidate>
      <div class="dialog__body">
        <h3 class="dialog__title">Saluran ${label}</h3>
        <div class="field">
          <label class="label" for="ch-id">ID saluran AttCos</label>
          <input class="input" id="ch-id" type="text" maxlength="100" autocomplete="off" value="${current.replace(/"/g, "&quot;")}" />
          <p class="hint">Salin dari daftar channel di AttCos. Kosong berarti memakai saluran Pare.</p>
          <p class="error" id="ch-err" role="alert" hidden></p>
        </div>
      </div>
      <div class="dialog__foot dialog__foot--end">
        <button class="btn btn--quiet" type="button" id="ch-cancel">Batal</button>
        <button class="btn btn--primary" type="submit" id="ch-save">Simpan saluran</button>
      </div>
    </form>`;
  dlg.addEventListener("close", () => dlg.remove());
  dlg.querySelector("#ch-cancel").onclick = () => dlg.close();
  dlg.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const value = dlg.querySelector("#ch-id").value.trim();
    const b = busy(dlg.querySelector("#ch-save"), "Menyimpan...");
    try {
      await api(`/api/admin/whatsapp-channels/${branch}`, { method: "PUT", body: { channelId: value } });
      dlg.close();
      toast(`Saluran ${label} tersimpan.`);
      await done();
    } catch (error) {
      fieldError(null, "ch-err", error.message);
    } finally { b(); }
  };
  document.body.appendChild(dlg);
  dlg.showModal();
}

function testChannel(branch, label) {
  const existing = document.getElementById("dlg-channel-test");
  if (existing) existing.remove();
  const dlg = document.createElement("dialog");
  dlg.id = "dlg-channel-test";
  dlg.className = "dialog";
  dlg.innerHTML = `
    <form class="dialog__form" novalidate>
      <div class="dialog__body">
        <h3 class="dialog__title">Uji kirim saluran ${label}</h3>
        <p class="dialog__text">Pesan uji dikirim dari saluran ${label} ke nomor yang kamu isi. Isi nomor WhatsApp kamu sendiri supaya hasilnya langsung terlihat.</p>
        <div class="field">
          <label class="label" for="ch-to">Nomor tujuan</label>
          <input class="input" id="ch-to" type="tel" inputmode="tel" maxlength="20" placeholder="08xxxxxxxxxx" autocomplete="off" />
          <p class="error" id="ch-test-err" role="alert" hidden></p>
        </div>
      </div>
      <div class="dialog__foot dialog__foot--end">
        <button class="btn btn--quiet" type="button" id="ch-test-cancel">Batal</button>
        <button class="btn btn--primary" type="submit" id="ch-test-send">Kirim pesan uji</button>
      </div>
    </form>`;
  dlg.addEventListener("close", () => dlg.remove());
  dlg.querySelector("#ch-test-cancel").onclick = () => dlg.close();
  dlg.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const b = busy(dlg.querySelector("#ch-test-send"), "Mengirim...");
    try {
      await api(`/api/admin/whatsapp-channels/${branch}/test`, { method: "POST", body: { to: dlg.querySelector("#ch-to").value } });
      dlg.close();
      toast(`Pesan uji saluran ${label} terkirim. Cek nomor tujuannya.`);
    } catch (error) {
      fieldError(null, "ch-test-err", error.message);
    } finally { b(); }
  };
  document.body.appendChild(dlg);
  dlg.showModal();
}

/* ===================== Staf ===================== */

function StaffPanel() {
  const me = db.me || {};
  const rows = db.staff || [];
  const roleLabel = { admin: "Administrator", staf: "Admin", tutor: "Tutor" };
  return <>
    <section className="panel">
      <header className="panel__head"><div>
        <h2 className="panel__title">Akun staf</h2>
        <p className="panel__desc">Administrator mengelola semua; Admin mengerjakan operasional; Tutor hanya melihat siswa kelasnya. Akun dinonaktifkan, bukan dihapus, supaya riwayat aktivitasnya tetap bermakna.</p>
      </div>
      <button className="btn btn--primary" type="button" onClick={() => addStaff(rows.length + 1)}><Icon name="plus" cls="icon--sm" />Tambah akun</button></header>
      {rows.length ? <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">Nama</th><th scope="col">Email</th><th scope="col">Peran</th><th scope="col" className="hide-md">Masuk terakhir</th><th scope="col">Status</th><th scope="col" className="is-action"><span className="sr-only">Aksi</span></th></tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td><span className="cell-main">{u.name}</span>{u.id === me.id ? <span className="cell-sub">Kamu</span> : null}</td>
              <td className="cell-sub">{u.email}</td>
              <td>{roleLabel[u.role] || u.role}</td>
              <td className="hide-md cell-sub">{u.lastLoginAt ? fmtLastLogin(u.lastLoginAt) : <span className="muted">Belum pernah</span>}</td>
              <td>{u.active ? <span className="cell-main">Aktif</span> : <span className="cell-sub cell-sub--warn">Nonaktif</span>}</td>
              <td className="is-action"><span className="row-actions">
                {u.id === me.id ? <span className="muted">-</span> : <MenuBtn kind="staff" id={u.id} label={`Aksi akun ${u.name}`} />}
              </span></td>
            </tr>
          ))}
        </tbody>
      </table></div>
        : <Empty title="Belum ada akun staf." desc="Tambahkan akun untuk tim, lalu tentukan perannya." />}
    </section>
  </>;
}

function fmtLastLogin(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function addStaff(n) {
  const existing = document.getElementById("dlg-staff");
  if (existing) existing.remove();
  const dlg = document.createElement("dialog");
  dlg.id = "dlg-staff";
  dlg.className = "dialog";
  dlg.innerHTML = `
    <form class="dialog__form" novalidate>
      <div class="dialog__body">
        <h3 class="dialog__title">Tambah akun staf</h3>
        <div class="field">
          <label class="label" for="sf-name">Nama</label>
          <input class="input" id="sf-name" type="text" maxlength="80" autocomplete="off" />
          <p class="error" id="sf-name-err" role="alert" hidden></p>
        </div>
        <div class="field">
          <label class="label" for="sf-email">Email</label>
          <input class="input" id="sf-email" type="email" maxlength="160" autocomplete="off" />
          <p class="error" id="sf-email-err" role="alert" hidden></p>
        </div>
        <div class="field">
          <label class="label" for="sf-role">Peran</label>
          <select class="select" id="sf-role">
            <option value="staf">Admin: semua pekerjaan operasional</option>
            <option value="tutor">Tutor: hanya siswa kelasnya</option>
          </select>
          <p class="hint">Administrator hanya dibuat lewat halaman ini bila dibuat oleh Administrator.</p>
        </div>
        <div class="field">
          <label class="label" for="sf-pass">Kata sandi awal</label>
          <input class="input" id="sf-pass" type="text" maxlength="40" autocomplete="new-password" />
          <p class="hint">Serahkan ke staf untuk masuk pertama kali; staf tidak bisa menggantinya sendiri, jadi buat yang unik.</p>
          <p class="error" id="sf-pass-err" role="alert" hidden></p>
        </div>
      </div>
      <div class="dialog__foot dialog__foot--end">
        <button class="btn btn--quiet" type="button" id="sf-cancel">Batal</button>
        <button class="btn btn--primary" type="submit" id="sf-save">Buat akun</button>
      </div>
    </form>`;
  dlg.addEventListener("close", () => dlg.remove());
  dlg.querySelector("#sf-cancel").onclick = () => dlg.close();
  dlg.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const fail = makeFieldFail();
    const name = dlg.querySelector("#sf-name");
    const email = dlg.querySelector("#sf-email");
    const pass = dlg.querySelector("#sf-pass");
    if (name.value.trim().length < 2) fail(name, "sf-name-err", "Nama minimal 2 karakter.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) fail(email, "sf-email-err", "Format email belum benar.");
    if (pass.value.length < 8) fail(pass, "sf-pass-err", "Kata sandi minimal 8 karakter.");
    if (fail.first()) { fail.first().focus(); return; }
    const b = busy(dlg.querySelector("#sf-save"), "Membuat...");
    try {
      await api("/api/admin/staff", { method: "POST", body: { name: name.value.trim(), email: email.value.trim().toLowerCase(), role: dlg.querySelector("#sf-role").value, password: pass.value } });
      dlg.close();
      await mutate(async () => {}, `Akun ${name.value.trim()} dibuat.`);
    } catch (error) {
      fail(email, "sf-email-err", error.message);
    } finally { b(); }
  };
  document.body.appendChild(dlg);
  dlg.showModal();
}

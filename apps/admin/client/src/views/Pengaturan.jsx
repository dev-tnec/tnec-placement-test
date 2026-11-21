// Pengaturan: the Saluran WhatsApp panel (one channel id per branch, with a test send) and the
// Staf panel (accounts, roles, activation). Per docs/prd-perbaikan-dasbor-dan-akun-staf.md.

import { useEffect, useState } from "react";
import { api, db, mutate, useVersion } from "../store.js";
import { Icon, Empty, PageHead } from "../ui.jsx";
import { toast } from "../dom.js";
import { openFormDialog } from "../dialogs.jsx";
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
    <div className="stack">
      {tab === "saluran" ? <ChannelPanel /> : null}
      {tab === "staf" && db.me?.role === "admin" ? <StaffPanel /> : null}
    </div>
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

  if (channels === null) return <section className="panel"><div className="panel__foot"><p className="panel__desc">Memuat saluran...</p></div></section>;
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
      {pare && !pare.channelId ? <div className="panel__foot"><p className="error" role="alert">Saluran Pare belum terisi. Semua cabang jatuh ke Pare, jadi isi dulu baris Pare di atas.</p></div> : null}
    </section>
  </>;
}

function editChannel(branch, label, current, done) {
  openFormDialog({
    title: `Saluran ${label}`,
    sub: "Salin ID channel dari daftar channel di AttCos.",
    fields: [{ id: "channelId", label: "ID saluran AttCos", type: "text", value: current, hint: "Kosong berarti memakai saluran Pare." }],
    submitLabel: "Simpan saluran",
    onSubmit: async (values, fail) => {
      if (branch === "pare" && !values.channelId.trim()) { fail("channelId", "Saluran Pare wajib terisi karena menjadi cadangan semua cabang."); return false; }
      await api(`/api/admin/whatsapp-channels/${branch}`, { method: "PUT", body: { channelId: values.channelId.trim() } });
      toast(`Saluran ${label} tersimpan.`);
      await done();
      return true;
    },
  });
}

function testChannel(branch, label) {
  openFormDialog({
    title: `Uji kirim saluran ${label}`,
    sub: "Pesan uji dikirim dari saluran ini ke nomor yang kamu isi. Isi nomor WhatsApp kamu sendiri supaya hasilnya langsung terlihat.",
    fields: [{ id: "to", label: "Nomor tujuan", type: "tel", placeholder: "08xxxxxxxxxx" }],
    submitLabel: "Kirim pesan uji",
    onSubmit: async (values, fail) => {
      if (!values.to.trim()) { fail("to", "Isi nomor tujuan pesan uji."); return false; }
      await api(`/api/admin/whatsapp-channels/${branch}/test`, { method: "POST", body: { to: values.to.trim() } });
      toast(`Pesan uji saluran ${label} terkirim. Cek nomor tujuannya.`);
      return true;
    },
  });
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
      <button className="btn btn--primary" type="button" onClick={() => addStaff()}><Icon name="plus" cls="icon--sm" />Tambah akun</button></header>
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

function addStaff() {
  openFormDialog({
    title: "Tambah akun staf",
    sub: "Kata sandi minimal 8 karakter. Serahkan langsung ke staf yang bersangkutan.",
    fields: [
      { id: "name", label: "Nama", type: "text" },
      { id: "email", label: "Email", type: "email" },
      { id: "role", label: "Peran", type: "select", value: "staf", options: [["staf", "Admin: semua pekerjaan operasional"], ["tutor", "Tutor: hanya siswa kelasnya"]] },
      { id: "password", label: "Kata sandi awal", type: "text", hint: "Buat yang unik; staf tidak bisa menggantinya sendiri." },
    ],
    submitLabel: "Buat akun",
    onSubmit: async (values, fail) => {
      if (values.name.trim().length < 2) { fail("name", "Nama minimal 2 karakter."); return false; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())) { fail("email", "Format email belum benar."); return false; }
      if (String(values.password || "").length < 8) { fail("password", "Kata sandi minimal 8 karakter."); return false; }
      await api("/api/admin/staff", { method: "POST", body: { name: values.name.trim(), email: values.email.trim().toLowerCase(), role: values.role, password: values.password } });
      await mutate(async () => {});
      return true;
    },
  });
}

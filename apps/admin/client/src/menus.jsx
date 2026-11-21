// The context menu stays imperative: it is positioned from the anchor's bounding rect, which is
// simpler outside React. The menu host <div id="menu"> lives in the page shell, not in the React
// root, and one document-level listener drives triggers, items, outside clicks, and the keyboard.

import { api, db, mutate, notify, reload, route, ui } from "./store.js";
import { $, $$, iconHtml, toast } from "./dom.js";
import { fmtDate, openCertPage } from "./lib.js";
import { confirmThen, openCertDialog, openFormDialog, openQuestionEditor, questionAction, deleteQuestion } from "./dialogs.jsx";
import { bulkStudents, deleteAttempts, deleteStudents, revokeCert, sendTestLink, toggleCertType, voidAttempt } from "./actions.js";
import { Icon } from "./ui.jsx";

let menuState = null;

/* The staff role and password dialogs, used from the staff row menu. */
function staffRoleDialog(u) {
  const labels = { admin: "Administrator, semua akses termasuk akun staf", staf: "Admin, semua pekerjaan operasional", tutor: "Tutor, hanya siswa kelasnya" };
  openFormDialog({
    title: `Ganti peran ${u.name}`,
    sub: "Peran menentukan menu dan data yang bisa diakses akun ini.",
    fields: [{ id: "role", label: "Peran baru", type: "select", value: u.role, options: [["staf", labels.staf], ["tutor", labels.tutor], ["admin", labels.admin]] }],
    submitLabel: "Simpan peran",
    onSubmit: async (values) => {
      await api(`/api/admin/staff/${u.id}/role`, { method: "PUT", body: { role: values.role } });
      toast(`Peran ${u.name} menjadi ${values.role === "admin" ? "Administrator" : values.role === "tutor" ? "Tutor" : "Admin"}.`);
      await reload();
      return true;
    },
  });
}

function staffPasswordDialog(u) {
  openFormDialog({
    title: `Ganti kata sandi ${u.name}`,
    sub: "Kata sandi minimal 8 karakter. Serahkan langsung ke staf yang bersangkutan.",
    fields: [{ id: "password", label: "Kata sandi baru", type: "text", placeholder: "Minimal 8 karakter" }],
    submitLabel: "Simpan kata sandi",
    onSubmit: async (values, fail) => {
      if (String(values.password || "").length < 8) { fail("password", "Kata sandi minimal 8 karakter."); return false; }
      await api(`/api/admin/staff/${u.id}/password`, { method: "PUT", body: { password: values.password } });
      toast(`Kata sandi ${u.name} diganti.`);
      return true;
    },
  });
}

/* The certificate sends attach the PDF the team saved from the print dialog. Picking it here
   saves the trip to the print page; the upload replaces an earlier file and keeps its link. */
function uploadCertificatePdf(c) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast("PDF-nya lebih dari 5 MB. Cetak ulang dengan ukuran lebih kecil."); return; }
    mutate(async () => {
      const response = await fetch(`/api/admin/certificates/${c.id}/pdf?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: file,
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "PDF gagal diunggah. Coba lagi.");
      return data;
    }, `PDF ${file.name} tersimpan. Sertifikat ${c.number} siap dikirim.`);
  });
  input.click();
}

export function openMenu(anchor, items) {
  if (menuState && menuState.anchor === anchor) { closeMenu(true); return; }
  closeMenu();
  const menu = $("#menu");
  menu.innerHTML = items.map((it, i) => {
    if (it.sep) return `<div class="menu__sep" role="separator"></div>`;
    if (it.heading) return `<p class="menu__label">${it.heading}</p>`;
    return `<button class="menu__item${it.danger ? " menu__item--danger" : ""}" type="button" role="menuitem" data-index="${i}" ${it.disabled ? "disabled" : ""}>${it.icon ? iconHtml(it.icon, "icon--sm") : ""}<span>${it.label}</span></button>`;
  }).join("");
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = r.right - mw;
  if (left < 8) left = Math.min(r.left, window.innerWidth - mw - 8);
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${top}px`;
  anchor.setAttribute("aria-expanded", "true");
  menuState = { anchor, items };
  menu.querySelector(".menu__item:not([disabled])")?.focus();
}

export function closeMenu(returnFocus) {
  if (!menuState) return;
  $("#menu").hidden = true;
  menuState.anchor.setAttribute("aria-expanded", "false");
  if (returnFocus && document.contains(menuState.anchor)) menuState.anchor.focus();
  menuState = null;
}

/* The menu items for each trigger, ported from the old client. */
export function contextMenu(kind, id) {
  if (kind === "question") {
    const t = db.tests[ui.test], q = t.questions.find((x) => x.id === Number(id));
    if (!q) return [];
    const idx = t.questions.indexOf(q);
    return [
      { label: "Ubah soal", icon: "pencil", run: () => openQuestionEditor(q.id) },
      { label: "Duplikat sebagai draf", icon: "copy", run: () => questionAction(q, "duplicate", "Salinan soal tersimpan sebagai draf di bawah soal aslinya.") },
      { sep: true },
      { label: "Pindah ke atas", icon: "arrow-up", disabled: idx === 0, run: () => questionAction(q, "up", "Urutan soal diperbarui.") },
      { label: "Pindah ke bawah", icon: "arrow-down", disabled: idx === t.questions.length - 1, run: () => questionAction(q, "down", "Urutan soal diperbarui.") },
      { label: q.status === "aktif" ? "Jadikan draf" : "Aktifkan di tes", icon: q.status === "aktif" ? "eye-off" : "eye", run: () => questionAction(q, "toggle", q.status === "aktif" ? "Soal sekarang draf dan tidak tampil di tes." : "Soal aktif kembali di tes.") },
      { sep: true },
      { label: "Hapus soal", icon: "trash", danger: true, run: () => deleteQuestion(q) },
    ];
  }
  if (kind === "student") {
    return [{ label: "Hapus siswa", icon: "trash", danger: true, run: () => deleteStudents([id], true) }];
  }
  if (kind === "send-test") {
    const s = db.students.find((x) => x.id === id);
    if (!s) return [];
    return [{ heading: "Kirim tautan lewat WhatsApp" },
      ...[["placement", "Placement Test"], ["pre", "Pre-test"], ["post", "Post-test"]].map(([k, name]) => ({ label: name, run: () => sendTestLink(s, k) }))];
  }
  if (kind === "attempt") {
    const a = db.attempts.find((x) => x.id === id);
    if (!a) return [];
    const items = [];
    if (a.status === "done" || a.status === "nocontact") items.push({ label: "Batalkan hasil", icon: "ban", run: () => voidAttempt(a) });
    if (a.status === "void") items.push({ label: "Pulihkan hasil", icon: "undo", run: () => mutate(() => api(`/api/admin/attempts/${a.id}/restore`, { method: "POST" }), "Hasil dipulihkan dan kembali dihitung.") });
    if (items.length) items.push({ sep: true });
    items.push({ label: "Hapus submission", icon: "trash", danger: true, run: () => deleteAttempts([a.id], true) });
    return items;
  }
  if (kind === "bulk-stage") {
    const stages = [["baru", "Baru"], ["dihubungi", "Dihubungi"], ["konsultasi", "Konsultasi"], ["lepas", "Tidak lanjut"]];
    return [{ heading: "Ubah status menjadi" }, ...stages.map(([key, label]) => ({ label, run: () => bulkStudents("stage", key, `Status siswa terpilih sekarang ${label}.`) }))];
  }
  if (kind === "bulk-period") {
    const now = Date.now();
    return [{ heading: "Atur periode menjadi" },
      ...db.periods.filter((p) => p.start > now - 20 * 86400000).map((p) => ({ label: fmtDate(p.start), run: () => bulkStudents("period", p.id, `Siswa terpilih diatur ke periode ${fmtDate(p.start)}. Atur kelasnya dari halaman siswa.`) })),
      { sep: true },
      { label: "Kosongkan periode", run: () => bulkStudents("period", null, "Periode siswa terpilih dikosongkan.") }];
  }
  if (kind === "program") {
    const p = db.programs.find((x) => x.id === id);
    if (!p) return [];
    const used = db.students.some((s) => s.programId === p.id) || db.classes.some((c) => c.programId === p.id);
    return [
      { label: p.status === "aktif" ? "Nonaktifkan program" : "Aktifkan program", icon: p.status === "aktif" ? "eye-off" : "eye", run: () => mutate(() => api(`/api/admin/programs/${p.id}`, { method: "PUT", body: { ...p, status: p.status === "aktif" ? "nonaktif" : "aktif" } }), p.status === "aktif" ? `${p.name} nonaktif dan tidak muncul di formulir siswa.` : `${p.name} aktif dan muncul lagi di formulir siswa.`) },
      { sep: true },
      { label: used ? "Hapus program, masih dipakai" : "Hapus program", icon: "trash", danger: true, disabled: used, run: () => confirmThen(`Hapus ${p.name}?`, "Program ini belum dipakai siswa atau kelas mana pun, jadi aman dihapus.", "Hapus program", () => api(`/api/admin/programs/${p.id}`, { method: "DELETE" }), `${p.name} dihapus.`) },
    ];
  }
  if (kind === "period") {
    const p = db.periods.find((x) => x.id === id);
    if (!p) return [];
    const used = db.students.some((s) => s.periodId === p.id) || db.classes.some((c) => c.periodId === p.id);
    return [
      { label: "Lihat siswa periode ini", icon: "users", run: () => { location.hash = `#/siswa?periode=${p.id}`; } },
      { sep: true },
      { label: used ? "Hapus periode, masih dipakai" : "Hapus periode", icon: "trash", danger: true, disabled: used, run: () => confirmThen(`Hapus periode ${fmtDate(p.start)}?`, "Periode ini belum punya siswa atau kelas, jadi aman dihapus.", "Hapus periode", () => api(`/api/admin/periods/${p.id}`, { method: "DELETE" }), "Periode dihapus.") },
    ];
  }
  if (kind === "class") {
    const c = db.classes.find((x) => x.id === id);
    if (!c) return [];
    const n = db.students.filter((s) => s.classId === c.id).length;
    return [
      { label: "Lihat siswa kelas ini", icon: "users", run: () => { Object.assign(ui.students, { q: c.code, stage: "all", program: c.programId, period: c.periodId, tutor: c.tutor, level: "", page: 1 }); location.hash = "#/siswa"; notify(); } },
      { sep: true },
      { label: n ? "Hapus kelas, masih ada siswa" : "Hapus kelas", icon: "trash", danger: true, disabled: Boolean(n), run: () => confirmThen(`Hapus kelas ${c.code}?`, "Kelas ini belum berisi siswa, jadi aman dihapus.", "Hapus kelas", () => api(`/api/admin/classes/${c.id}`, { method: "DELETE" }), `Kelas ${c.code} dihapus.`) },
    ];
  }
  if (kind === "staff") {
    const u = (db.staff || []).find((x) => x.id === id);
    if (!u) return [];
    return [
      { label: u.active ? "Nonaktifkan akun" : "Aktifkan kembali", icon: u.active ? "eye-off" : "eye", run: () => confirmThen(u.active ? `Nonaktifkan akun ${u.name}?` : `Aktifkan kembali akun ${u.name}?`, u.active ? "Akun tidak bisa masuk sampai diaktifkan kembali. Riwayat aktivitasnya tetap." : "Akun bisa masuk kembali seperti semula.", u.active ? "Nonaktifkan" : "Aktifkan", () => api(`/api/admin/staff/${u.id}/active`, { method: "PUT", body: { active: !u.active } }), u.active ? `Akun ${u.name} dinonaktifkan.` : `Akun ${u.name} aktif kembali.`) },
      { label: "Ganti peran", icon: "award", run: () => staffRoleDialog(u) },
      { label: "Ganti kata sandi", icon: "lock", run: () => staffPasswordDialog(u) },
    ];
  }
  if (kind === "cert") {
    const c = db.certs.issued.find((x) => x.id === id);
    if (!c) return [];
    const s = c.studentId ? db.students.find((x) => x.id === c.studentId) : null;
    const items = [{ label: c.revokedAt ? "Ubah data, sudah dibatalkan" : "Ubah data", icon: "pencil", disabled: Boolean(c.revokedAt), run: () => openCertDialog({ certId: c.id }) }];
    if (s && route().parts[0] !== "siswa") items.push({ label: "Buka profil siswa", icon: "user", run: () => { location.hash = `#/siswa/${s.id}`; } });
    if (!c.revokedAt && s) {
      items.push({ sep: true });
      // The server renders the PDF automatically on send, so the sends are always offered. The
      // upload is the override for a hand-made file, never a requirement.
      items.push({
        label: s.email ? (c.emailSentAt ? "Kirim ulang email" : "Kirim email") : "Kirim email, siswa belum punya email",
        icon: "mail", disabled: !s.email,
        run: () => { toast("Membuat PDF dan mengirim email..."); mutate(() => api(`/api/admin/certificates/${c.id}/send-email`, { method: "POST" }), `Sertifikat ${c.number} dikirim ke email ${s.email}.`); },
      });
      items.push({
        label: s.wa ? (c.waSentAt ? "Kirim ulang WhatsApp" : "Kirim WhatsApp") : "Kirim WhatsApp, siswa belum punya nomor",
        icon: "message", disabled: !s.wa,
        run: () => { toast("Membuat PDF dan mengirim WhatsApp..."); mutate(() => api(`/api/admin/certificates/${c.id}/send-whatsapp`, { method: "POST" }), `Sertifikat ${c.number} dikirim lewat WhatsApp.`); },
      });
      items.push({ label: c.pdf ? "Ganti PDF sertifikat" : "Unggah PDF sendiri", icon: "upload", run: () => uploadCertificatePdf(c) });
    }
    items.push({ sep: true });
    items.push(c.revokedAt
      ? { label: "Pulihkan sertifikat", icon: "undo", run: () => mutate(() => api(`/api/admin/certificates/${c.id}/restore`, { method: "POST" }), `Sertifikat ${c.number} berlaku lagi.`) }
      : { label: "Batalkan sertifikat", icon: "ban", danger: true, run: () => revokeCert(c) });
    return items;
  }
  if (kind === "cert-type") {
    const t = db.certs.types.find((x) => x.id === id);
    if (!t) return [];
    const used = db.certs.issued.some((c) => c.typeId === t.id);
    return [
      { label: "Lihat contoh", icon: "printer", run: () => openCertPage(t.id) },
      { label: t.status === "aktif" ? "Nonaktifkan" : "Aktifkan", icon: t.status === "aktif" ? "eye-off" : "eye", run: () => toggleCertType(t) },
      { sep: true },
      { label: used ? "Hapus jenis, sudah dipakai" : "Hapus jenis", icon: "trash", danger: true, disabled: used, run: () => confirmThen(`Hapus ${t.name}?`, "Jenis ini belum pernah dipakai untuk menerbitkan sertifikat, jadi aman dihapus. Hitungan nomornya ikut terhapus.", "Hapus jenis", () => api(`/api/admin/certificate-types/${t.id}`, { method: "DELETE" }), `${t.name} dihapus.`) },
    ];
  }
  if (kind === "tutor") {
    const used = db.classes.some((c) => c.tutor === id);
    return [{ label: used ? "Hapus tutor, masih mengajar" : "Hapus tutor", icon: "trash", danger: true, disabled: used, run: () => confirmThen(`Hapus ${id}?`, "Tutor ini belum mengajar kelas mana pun. Namanya juga dihapus dari daftar tutor setiap program.", "Hapus tutor", () => api(`/api/admin/tutors/${db.tutorIds.get(id)}`, { method: "DELETE" }), `${id} dihapus dari daftar tutor.`) }];
  }
  return [];
}

/* One document listener drives the menu: item clicks, trigger clicks, and outside clicks. */
document.addEventListener("click", (e) => {
  const menuItem = e.target.closest("#menu .menu__item");
  if (menuItem) {
    const item = menuState && menuState.items[Number(menuItem.dataset.index)];
    closeMenu();
    if (item && !item.disabled) item.run();
    return;
  }
  const trigger = e.target.closest("[data-menu]");
  if (menuState && !e.target.closest("#menu") && trigger !== menuState.anchor) closeMenu();
  if (trigger && !trigger.disabled) openMenu(trigger, contextMenu(trigger.dataset.menu, trigger.dataset.id));
});
document.addEventListener("keydown", (e) => {
  if (!menuState) return;
  const items = $$("#menu .menu__item:not([disabled])");
  const i = items.indexOf(document.activeElement);
  if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
  else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  else if (e.key === "Tab") closeMenu();
});
window.addEventListener("resize", () => closeMenu());
window.addEventListener("scroll", () => closeMenu(), { passive: true });

/* The trigger button used all over the tables. */
export function MenuBtn({ kind, id, label, boxed = false }) {
  return (
    <button className={boxed ? "icon-btn icon-btn--boxed" : "icon-btn"} type="button" data-menu={kind} data-id={id}
      aria-haspopup="menu" aria-expanded="false" aria-label={label} title={label}>
      <Icon name="more" />
    </button>
  );
}

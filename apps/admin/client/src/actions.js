// Mutations that are not dialog forms: student status and bulk actions, submission voiding and
// deletion, test links, certificates, and the speaking queue. Each one goes through mutate(),
// which reloads the data and lets the tree redraw.

import { api, db, mutate, notify, ui, sessionEnded, route } from "./store.js";
import { busy, toast } from "./dom.js";
import { activeQuestions, firstName, fmtDateLong, testLinkText, testOf, stageOf } from "./lib.js";
import { confirmDialog, openWhatsApp, openFormDialog } from "./dialogs.jsx";

export function patchStudent(s, body, success) {
  return mutate(() => api(`/api/admin/students/${s.id}`, { method: "PATCH", body }), success);
}

export function markContacted(s) {
  const before = s.stage;
  return patchStudent(s, { stage: "dihubungi" }).then((ok) => {
    if (ok) toast(`${firstName(s.name)} ditandai sudah dihubungi.`, { label: "Urungkan", run: () => patchStudent(s, { stage: before }, "Status dikembalikan.") });
  });
}

export function setStage(s, stage) {
  if (!s || s.stage === stage) return Promise.resolve(null);
  return patchStudent(s, { stage }, `Status ${firstName(s.name)} sekarang ${stageOf(stage).label}.`).then((r) => { if (!r) notify(); return r; });
}

export function setClass(s, classId) {
  const c = db.classes.find((x) => x.id === classId);
  if (!s || (s.classId || null) === (c ? c.id : null)) return Promise.resolve(null);
  const success = c ? `${firstName(s.name)} sekarang di kelas ${c.tutor} / ${c.code}.` : `${firstName(s.name)} tidak lagi terdaftar di kelas mana pun.`;
  return patchStudent(s, { classId: c ? c.id : null }, success).then((r) => { if (!r) notify(); return r; });
}

export async function deleteStudents(ids, single) {
  const list = ids.map((id) => db.students.find((s) => s.id === id)).filter(Boolean);
  if (!list.length) return;
  const r = await confirmDialog({
    title: single ? `Hapus data ${list[0].name}?` : `Hapus ${list.length} siswa?`,
    message: "Data kontak, kelas, catatan, dan riwayat aktivitas akan terhapus. Submission placement test tetap tersimpan tanpa nama, sedangkan pre-test dan post-test ikut terhapus. Sertifikat yang sudah terbit tetap tercatat di menu Sertifikat.",
    confirmLabel: single ? "Hapus siswa" : `Hapus ${list.length} siswa`,
  });
  if (!r.ok) return;
  const ok = await mutate(() => (single ? api(`/api/admin/students/${ids[0]}`, { method: "DELETE" }) : api("/api/admin/students/bulk", { method: "POST", body: { action: "delete", ids } })),
    single ? `Data ${list[0].name} dihapus.` : `${list.length} siswa dihapus.`);
  if (ok) {
    ids.forEach((id) => ui.students.selected.delete(id));
    if (single && route().parts[1]) location.hash = "#/siswa";
    notify();
  }
}

export async function bulkStudents(action, value, success) {
  const ids = [...ui.students.selected];
  const ok = await mutate(() => api("/api/admin/students/bulk", { method: "POST", body: { action, value, ids } }), success);
  if (ok) { ui.students.selected.clear(); notify(); }
}

export function resendEmail(a, button) {
  if (!a) return null;
  const done = busy(button, "Mengirim...");
  return mutate(() => api(`/api/admin/attempts/${a.id}/resend-email`, { method: "POST" }), (r) => `Email hasil dikirim ulang ke ${r.email}.`).finally(done);
}

export async function voidAttempt(a) {
  const r = await confirmDialog({
    title: "Batalkan hasil submission ini?",
    message: "Nilainya tidak lagi dihitung di ringkasan dan profil siswa. Jawabannya tetap tersimpan sebagai arsip, dan pembatalan bisa dipulihkan kapan saja.",
    confirmLabel: "Batalkan hasil",
    reasonLabel: "Alasan pembatalan",
    reasonPlaceholder: "Contoh: peserta mengaku dibantu teman saat mengerjakan.",
  });
  if (!r.ok) return;
  const reason = r.reason ? (/[.!?]$/.test(r.reason) ? r.reason : `${r.reason}.`) : "";
  await mutate(() => api(`/api/admin/attempts/${a.id}/void`, { method: "POST", body: { reason } }), "Hasil dibatalkan dan tidak lagi dihitung.");
}

export async function deleteAttempts(ids, single) {
  if (!ids.length) return;
  const r = await confirmDialog({
    title: single ? "Hapus submission ini?" : `Hapus ${ids.length} submission?`,
    message: "Jawaban, nilai, dan catatan sistemnya akan terhapus permanen dan tidak lagi dihitung di ringkasan.",
    confirmLabel: single ? "Hapus submission" : `Hapus ${ids.length} submission`,
  });
  if (!r.ok) return;
  const key = ui.test;
  const ok = await mutate(
    () => (single ? api(`/api/admin/attempts/${ids[0]}`, { method: "DELETE" }) : api("/api/admin/attempts/bulk-delete", { method: "POST", body: { ids } })),
    single ? "Submission dihapus." : `${ids.length} submission dihapus.`,
  );
  if (!ok) return;
  ids.forEach((id) => ui.attempts[key].selected.delete(id));
  if (single && route().parts[3]) location.hash = `#/tes/${key}/submission`;
  notify();
}

export async function sendTestLink(s, key) {
  const t = testOf(key), name = key === "placement" ? "Placement Test" : key === "pre" ? "Pre-test" : key === "post" ? "Post-test" : "IELTS Mockup";
  const hasQuestions = key === "ielts-mockup" ? t.questions.some((q) => q.status === "aktif") : activeQuestions(t).length;
  if (!hasQuestions) {
    toast(`${name} belum punya soal aktif. Aktifkan soal dulu sebelum mengirim tautan.`, { label: "Buka soal", run: () => { location.hash = `#/tes/${key}/soal`; } });
    return;
  }
  if (!t.settings.open) {
    toast(`${name} masih ditutup. Buka tesnya dulu di Pengaturan supaya tautannya bisa dipakai.`, { label: "Buka pengaturan", run: () => { location.hash = `#/tes/${key}/pengaturan`; } });
    return;
  }

  async function createInvite(packageId = null) {
    const r = await api(`/api/admin/students/${s.id}/invite`, { method: "POST", body: { test: key, ...(packageId ? { packageId } : {}) } });
    openWhatsApp(s, {
      title: `Kirim tautan ${name} ke ${firstName(s.name)}`,
      text: testLinkText(s, key, r.link, r.expiresAt, r.code, r.packageName, r.packageTotal),
      label: `Mengirim tautan ${name}`,
      link: r.link,
      linkHint: key === "placement"
        ? "Tautan umum placement test. Hasilnya masuk ke data siswa ini kalau email atau nomor WhatsApp yang diisi sama."
        : key === "ielts-mockup"
          ? `Tautan khusus untuk ${firstName(s.name)}. Paket soal: ${r.packageName}. Kode 6 karakter di bawah ini wajib dimasukkan sebelum tes dimulai, dan tautan berlaku sampai ${r.expiresAt ? new Date(r.expiresAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "kedaluwarsa"}.`
          : `Tautan khusus untuk ${firstName(s.name)}. Hanya bisa dipakai sekali dan berlaku sampai ${r.expiresAt ? new Date(r.expiresAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "kedaluwarsa"}.`,
    });
  }

  if (key === "ielts-mockup") {
    const options = [["", "Acak, pilih untuk saya"], ...t.packages
      .filter((p) => p.active && t.questions.some((q) => q.packageId === p.id && q.status === "aktif"))
      .map((p) => [p.id, p.name])];
    openFormDialog({
      title: `Pilih paket soal untuk ${firstName(s.name)}`,
      sub: "Siswa akan mendapat paket ini. Pilih Acak kalau sistem yang menentukan.",
      fields: [{ id: "package", label: "Paket soal", type: "select", value: "", options }],
      onSubmit: async (values) => {
        try {
          await createInvite(values.package || null);
        } catch (error) {
          if (!sessionEnded(error)) toast(error.message);
          return false;
        }
        return true;
      },
    });
    return;
  }

  try {
    await createInvite();
  } catch (error) {
    if (!sessionEnded(error)) toast(error.message);
  }
}

export function toggleCertType(t) {
  const status = t.status === "aktif" ? "nonaktif" : "aktif";
  const body = { name: t.name, code: t.code, template: t.template, format: t.format, reset: t.reset, signerName: t.signerName, signerRole: t.signerRole, status };
  return mutate(() => api(`/api/admin/certificate-types/${t.id}`, { method: "PUT", body }),
    status === "aktif" ? `${t.name} aktif dan bisa dipilih saat menerbitkan sertifikat.` : `${t.name} nonaktif dan tidak muncul saat menerbitkan sertifikat.`);
}

export async function revokeCert(c) {
  const r = await confirmDialog({
    title: `Batalkan sertifikat ${c.number}?`,
    message: "Nomornya tetap tercatat dan tidak dipakai lagi, dan halaman cetaknya bertanda DIBATALKAN. Pembatalan bisa dipulihkan kapan saja.",
    confirmLabel: "Batalkan sertifikat",
    reasonLabel: "Alasan pembatalan",
    reasonPlaceholder: "Contoh: nama salah tulis, diganti sertifikat baru.",
  });
  if (!r.ok) return;
  await mutate(() => api(`/api/admin/certificates/${c.id}/revoke`, { method: "POST", body: { reason: r.reason } }), `Sertifikat ${c.number} dibatalkan.`);
}

/* One-line queue actions from the submission page. */
export const speakingRetry = (id) => mutate(() => api(`/api/admin/speaking/${id}/retry`, { method: "POST" }), "Rekaman masuk antrean penilaian Speechace lagi.");
export const speakingReviewed = (id) => mutate(() => api(`/api/admin/speaking/${id}/reviewed`, { method: "POST" }), "Nilai speaking ditandai sudah dicek.");
export async function speakingSkip(id) {
  const r = await confirmDialog({
    title: "Lewati penilaian speaking ini?",
    message: "Hasil tes dikirim tanpa nilai speaking. Tindakan ini tidak bisa dibatalkan, jadi pakai ini kalau rekamannya memang tidak bisa dinilai.",
    confirmLabel: "Kirim tanpa nilai speaking",
    reasonLabel: "Alasan, opsional",
    reasonPlaceholder: "Contoh: rekaman rusak, suara tidak terdengar.",
  });
  if (!r.ok) return;
  await mutate(() => api(`/api/admin/speaking/${id}/skip`, { method: "POST", body: { reason: r.reason || "" } }), "Hasil dikirim tanpa nilai speaking.");
}

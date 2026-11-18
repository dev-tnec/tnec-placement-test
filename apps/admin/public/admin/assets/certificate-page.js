// The certificate page's own controls. It lives in its own file because the page sends a strict
// CSP, so no inline script: the print button, the PDF upload, and the two send buttons.
document.getElementById("cert-print")?.addEventListener("click", () => window.print());

(function () {
  const box = document.querySelector(".cert-send");
  if (!box) return;
  const id = box.dataset.certId;
  const state = document.getElementById("cert-pdf-state");
  const input = document.getElementById("cert-pdf-input");
  const uploadLabel = box.querySelector(".cert-send__upload");
  const emailBtn = document.getElementById("cert-send-email");
  const waBtn = document.getElementById("cert-send-wa");

  function flash(text, ok) {
    state.textContent = text;
    state.classList.toggle("is-ok", Boolean(ok));
  }

  function toggleButtons() {
    const hasPdf = box.dataset.pdf === "1";
    emailBtn.hidden = !(hasPdf && box.dataset.email);
    waBtn.hidden = !(hasPdf && box.dataset.whatsapp);
    if (hasPdf) uploadLabel.classList.add("is-done");
  }

  async function post(path, options) {
    const res = await fetch(path, { credentials: "same-origin", ...options });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  input?.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { flash("PDF-nya lebih dari 5 MB. Cetak ulang dengan ukuran lebih kecil."); return; }
    uploadLabel.classList.add("is-busy");
    flash("Mengunggah PDF...");
    try {
      await post(`/api/admin/certificates/${encodeURIComponent(id)}/pdf?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      box.dataset.pdf = "1";
      flash(`PDF tersimpan: ${file.name}. Sekarang bisa dikirim ke siswa.`, true);
    } catch (error) {
      flash(error.message);
    } finally {
      uploadLabel.classList.remove("is-busy");
      input.value = "";
      toggleButtons();
    }
  });

  emailBtn?.addEventListener("click", async () => {
    emailBtn.disabled = true;
    emailBtn.textContent = "Mengirim...";
    try {
      await post(`/api/admin/certificates/${encodeURIComponent(id)}/send-email`, { method: "POST" });
      emailBtn.textContent = "Email terkirim";
      flash("Email sertifikat terkirim.", true);
    } catch (error) {
      emailBtn.disabled = false;
      emailBtn.textContent = "Kirim email";
      flash(error.message);
    }
  });

  waBtn?.addEventListener("click", async () => {
    waBtn.disabled = true;
    waBtn.textContent = "Mengirim...";
    try {
      await post(`/api/admin/certificates/${encodeURIComponent(id)}/send-whatsapp`, { method: "POST" });
      waBtn.textContent = "WhatsApp terkirim";
      flash("Sertifikat terkirim lewat WhatsApp.", true);
    } catch (error) {
      waBtn.disabled = false;
      waBtn.textContent = "Kirim WhatsApp";
      flash(error.message);
    }
  });

  toggleButtons();
})();

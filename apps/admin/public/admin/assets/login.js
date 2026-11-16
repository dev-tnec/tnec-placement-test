// Login form for the internal dashboard. The session cookie is HttpOnly and set by the server.
// While the database has no admin yet, the same form creates the first account instead.
const $ = (id) => document.getElementById(id);
const form = $("login-form");
const name = $("login-name");
const email = $("login-email");
const password = $("login-password");
const confirm = $("login-confirm");
const code = $("login-code");
const errorBox = $("login-error");
const submit = $("login-submit");
let setup = false;
let needsCode = false;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) throw new Error(data?.error || "Belum bisa masuk. Coba lagi sebentar lagi.");
  return data;
}

function enterSetupMode(local) {
  setup = true;
  needsCode = !local;
  $("login-title").textContent = "Buat akun admin pertama";
  $("login-desc").textContent = "Belum ada akun di dasbor ini. Akun yang kamu buat sekarang menjadi admin utama, dan kamu langsung masuk setelahnya.";
  $("field-name").hidden = false;
  $("field-confirm").hidden = false;
  $("password-hint").hidden = false;
  $("field-code").hidden = !needsCode;
  $("login-foot").hidden = true;
  password.autocomplete = "new-password";
  submit.textContent = "Buat akun dan masuk";
  name.focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const label = submit.textContent;
  try {
    if (setup) {
      if (name.value.trim().length < 2) { showError("Nama minimal 2 karakter."); name.focus(); return; }
      if (!email.value.trim()) { showError("Isi email."); email.focus(); return; }
      if (password.value.length < 12) { showError("Kata sandi minimal 12 karakter."); password.focus(); return; }
      if (password.value !== confirm.value) { showError("Kedua kata sandi belum sama."); confirm.focus(); return; }
      if (needsCode && !code.value.trim()) { showError("Isi kode setup dari log server."); code.focus(); return; }
      submit.disabled = true;
      submit.textContent = "Membuat akun...";
      await post("/api/admin/setup", { name: name.value.trim(), email: email.value.trim(), password: password.value, code: code.value.trim() });
    } else {
      if (!email.value.trim() || !password.value) {
        showError("Isi email dan kata sandi.");
        (email.value.trim() ? password : email).focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = "Memeriksa...";
      await post("/api/admin/login", { email: email.value.trim(), password: password.value });
    }
    window.location.assign("/admin/");
  } catch (error) {
    showError(error instanceof TypeError ? "Server tidak bisa dihubungi. Periksa koneksi internet, lalu coba lagi." : error.message);
    password.focus();
    password.select();
  } finally {
    submit.disabled = false;
    submit.textContent = label;
  }
});

fetch("/api/admin/setup", { credentials: "same-origin", cache: "no-store" })
  .then((r) => (r.ok ? r.json() : null))
  .then((status) => { if (status?.needed) enterSetupMode(status.local); else email.focus(); })
  .catch(() => email.focus());

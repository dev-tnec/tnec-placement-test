// Login form for the internal dashboard. The session cookie is HttpOnly and set by the server.
const form = document.getElementById("login-form");
const email = document.getElementById("login-email");
const password = document.getElementById("login-password");
const errorBox = document.getElementById("login-error");
const submit = document.getElementById("login-submit");

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  if (!email.value.trim() || !password.value) {
    showError("Isi email dan kata sandi.");
    (email.value.trim() ? password : email).focus();
    return;
  }
  submit.disabled = true;
  submit.textContent = "Memeriksa...";
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value.trim(), password: password.value }),
      credentials: "same-origin",
      cache: "no-store",
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) throw new Error(data?.error || "Belum bisa masuk. Coba lagi sebentar lagi.");
    window.location.assign("/admin/");
    return;
  } catch (error) {
    showError(error instanceof TypeError ? "Server tidak bisa dihubungi. Periksa koneksi internet, lalu coba lagi." : error.message);
    password.focus();
    password.select();
  }
  submit.disabled = false;
  submit.textContent = "Masuk";
});

email.focus();

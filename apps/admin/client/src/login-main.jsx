// The login page, with the first admin setup mode. Ported from the old login.js.
// The session cookie is HttpOnly and set by the server.

import { useEffect, useState } from "react";
import "./admin.css";
import { createRoot } from "react-dom/client";

const HOME = "/admin/";

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

function Login() {
  const [setup, setSetup] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/setup", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((status) => { if (status?.needed) { setSetup(true); setNeedsCode(!status.local); } })
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    const email = form.email.value.trim();
    const password = form.password.value;
    try {
      setBusy(true);
      if (setup) {
        const name = form.name.value.trim();
        const confirm = form.confirm.value;
        const code = form.code.value.trim();
        if (name.length < 2) { setError("Nama minimal 2 karakter."); form.name.focus(); return; }
        if (!email) { setError("Isi email."); form.email.focus(); return; }
        if (password.length < 12) { setError("Kata sandi minimal 12 karakter."); form.password.focus(); return; }
        if (password !== confirm) { setError("Kedua kata sandi belum sama."); form.confirm.focus(); return; }
        if (needsCode && !code) { setError("Isi kode setup dari log server."); form.code.focus(); return; }
        await post("/api/admin/setup", { name, email, password, code });
      } else {
        if (!email || !password) { setError("Isi email dan kata sandi."); (email ? form.password : form.email).focus(); return; }
        await post("/api/admin/login", { email, password });
      }
      window.location.assign(HOME);
    } catch (err) {
      setError(err instanceof TypeError ? "Server tidak bisa dihubungi. Periksa koneksi internet, lalu coba lagi." : err.message);
      form.password.focus();
      form.password.select();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login__card">
        <img className="login__logo" src="/assets/logo-titik-nol.png" alt="Titik Nol English Course" width="502" height="85" />
        <h1 className="login__title">{setup ? "Buat akun admin pertama" : "Masuk ke dasbor internal"}</h1>
        <p className="login__desc">{setup
          ? "Belum ada akun di dasbor ini. Akun yang kamu buat sekarang menjadi admin utama, dan kamu langsung masuk setelahnya."
          : "Dasbor ini khusus untuk tim admin dan tim pendidikan Titik Nol English Course."}</p>
        <form className="login__form" onSubmit={submit} noValidate>
          <div className="field" hidden={!setup}>
            <label className="label" htmlFor="login-name">Nama</label>
            <input className="input" id="login-name" name="name" type="text" autoComplete="name" />
          </div>
          <div className="field">
            <label className="label" htmlFor="login-email">Email</label>
            <input className="input" id="login-email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="login-password">Kata sandi</label>
            <input className="input" id="login-password" name="password" type="password" autoComplete={setup ? "new-password" : "current-password"} required />
            {setup ? <p className="hint">Minimal 12 karakter.</p> : null}
          </div>
          <div className="field" hidden={!setup}>
            <label className="label" htmlFor="login-confirm">Ulangi kata sandi</label>
            <input className="input" id="login-confirm" name="confirm" type="password" autoComplete="new-password" />
          </div>
          <div className="field" hidden={!(setup && needsCode)}>
            <label className="label" htmlFor="login-code">Kode setup</label>
            <input className="input" id="login-code" name="code" type="text" autoComplete="off" />
            <p className="hint">Kode ini muncul di log server saat aplikasi admin dijalankan.</p>
          </div>
          <p className="error" role="alert" hidden={!error}>{error}</p>
          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            {busy ? (setup ? "Membuat akun..." : "Memeriksa...") : setup ? "Buat akun dan masuk" : "Masuk"}
          </button>
        </form>
      </div>
      <p className="login__foot" hidden={setup}>Lupa kata sandi atau belum punya akun? Minta admin teknis membuatkan akun baru.</p>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Login />);

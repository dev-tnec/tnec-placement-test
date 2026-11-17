// Vite config for the React dashboard client, served at /admin/ behind the same session as before.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  build: {
    outDir: "../public/admin",
    emptyOutDir: true,
    // The dashboard CSP allows no inline scripts, and every target browser supports modulepreload.
    modulePreload: { polyfill: false },
    rollupOptions: { input: { index: "index.html", login: "login.html" } },
  },
  // The certificate print pages link /admin/assets/certificate-page.css and .js absolutely.
  publicDir: "public",
});

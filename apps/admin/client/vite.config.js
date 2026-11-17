// Vite config for the React dashboard client. Base is /admin-ui/ during the migration;
// the final switch moves it to /admin/ and deletes the old static front end.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/admin-ui/",
  plugins: [react()],
  build: {
    outDir: "../public/admin-ui",
    emptyOutDir: true,
    // The dashboard CSP allows no inline scripts, and every target browser supports modulepreload.
    modulePreload: { polyfill: false },
    rollupOptions: { input: { index: "index.html", login: "login.html" } },
  },
});

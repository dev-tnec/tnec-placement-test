// Vite config for the React result report, served at /hasil/ behind the same strict CSP.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/hasil/",
  plugins: [react()],
  build: {
    outDir: "../public/hasil",
    emptyOutDir: true,
    // The CSP allows no inline scripts, and every target browser supports modulepreload.
    modulePreload: { polyfill: false },
  },
});

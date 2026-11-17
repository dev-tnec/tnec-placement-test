// Vite config for the React test runner, served at / behind the strict CSP.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  plugins: [react()],
  build: {
    // The public folder also holds the logos, videos, favicon, and the result report build.
    outDir: "../public",
    emptyOutDir: false,
    modulePreload: { polyfill: false },
  },
});

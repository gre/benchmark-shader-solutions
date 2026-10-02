import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // gl-react's deps (typedarray-pool/raf/...) reference Node's `global`; not defined in browsers/Vite 8.
  define: { global: "globalThis" },
  server: { port: 5171, strictPort: true },
  preview: { port: 5171, strictPort: true },
});

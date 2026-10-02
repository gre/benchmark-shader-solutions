import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The @shader-bench/* packages are `file:` deps = symlinks to ../../<pkg>,
// consumed as TypeScript source (resolved through their package.json
// `exports` "browser" condition). Vite follows the symlinks to the real
// path, so:
//  - dedupe: bare imports from the package sources (react, peer libs such as
//    canvaskit-wasm) resolve from
//    THIS app's node_modules (the packages have no node_modules of their own)
//    -> a single React copy;
//  - fs.allow: the dev server may serve files from components/.
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom", "canvaskit-wasm", "gl-react", "gl-react-dom"] },
  server: {
    port: 5175,
    strictPort: true,
    fs: { allow: [new URL("../..", import.meta.url).pathname] },
  },
  preview: { port: 5175, strictPort: true },
});

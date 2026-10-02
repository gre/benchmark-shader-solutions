// canvaskit.ts — loads CanvasKit (canvaskit-wasm 0.42.0) once per page.
//
// Both files of the canvaskit-wasm package are imported with the bundler's
// `?url` suffix, so the bundler copies them as assets and returns their URLs:
//   - canvaskit.js (the emscripten glue, UMD) is loaded as a classic <script>,
//     which defines the global `CanvasKitInit`;
//   - canvaskit.wasm is fetched by CanvasKitInit through `locateFile`.
// Why not `import CanvasKitInit from "canvaskit-wasm"`: the glue is CommonJS,
// and when this package is installed in node_modules as TS source, Vite's
// dev server does not pre-bundle a CJS dep imported from it — the import
// yields an empty namespace unless the app adds `optimizeDeps.include`.
// The script tag needs no consumer config, behaves the same in dev and
// production, and the glue + wasm are only fetched when an <Effect> mounts.
//
// `?url` is the Vite convention (also Rsbuild/Rspack; webpack 5 needs a
// `resourceQuery: /url/` rule with `type: "asset/resource"`). Both subpaths
// are listed in canvaskit-wasm's package.json "exports".
/// <reference path="./url-imports.d.ts" />
import type { CanvasKit, default as CanvasKitInitFn } from "canvaskit-wasm";
import jsUrl from "canvaskit-wasm/bin/canvaskit.js?url";
import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url";

declare global {
  // defined by canvaskit.js when loaded as a classic script
  var CanvasKitInit: typeof CanvasKitInitFn | undefined;
}

let promise: Promise<CanvasKit> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`cannot load ${src}`));
    document.head.appendChild(s);
  });
}

export function loadCanvasKit(): Promise<CanvasKit> {
  if (!promise) {
    promise = (globalThis.CanvasKitInit ? Promise.resolve() : loadScript(jsUrl)).then(() => {
      const init = globalThis.CanvasKitInit;
      if (!init) throw new Error("canvaskit-wasm: CanvasKitInit not defined by " + jsUrl);
      return init({ locateFile: () => wasmUrl });
    });
    promise.catch(() => {
      promise = null; // allow a retry on the next mount
    });
  }
  return promise;
}

# web-skia

Silk with **canvaskit-wasm**, Skia's WebAssembly build (SkSL). Part of [benchmark-shader-solutions](../../README.md); results are in
[RESULTS.md](../../RESULTS.md).

## Run

```sh
npm ci
npm run dev       # http://localhost:5172
npm run build     # tsc + vite build → dist/
npm run preview   # http://localhost:5172
```

URL params: `?t=<s>` freezes time · `?fps` shows the FPS overlay ·
`?instances=<N>` stacks N effects · `?jsload=<ms>` busy-loops the main thread
every 100 ms (stress tests). `window.__stats()` returns the effect's fps/p95.

## Stack

Same as web-baseline: React 19.2.3, Vite 8.3.2, TypeScript 7.0.2 + `canvaskit-wasm` 0.42.0.
Exact versions are pinned in `package.json`.

## Notes

- The wasm is loaded with `import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url"` + `locateFile` (`src/canvaskit.ts`); no Vite config needed.
- Skia objects must be `.delete()`d (one shader per frame); the surface is recreated on resize.
- SkSL errors come from `RuntimeEffect.Make`'s callback and are shown on the page.
- The wasm is 7.3 MB (2.9 MB gzip).

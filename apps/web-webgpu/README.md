# web-webgpu

Silk with the **raw WebGPU** API (WGSL), no library. Part of [benchmark-shader-solutions](../../README.md); results are in
[RESULTS.md](../../RESULTS.md).

## Run

```sh
npm ci
npm run dev       # http://localhost:5173
npm run build     # tsc + vite build → dist/
npm run preview   # http://localhost:5173
```

URL params: `?t=<s>` freezes time · `?fps` shows the FPS overlay ·
`?instances=<N>` stacks N effects · `?jsload=<ms>` busy-loops the main thread
every 100 ms (stress tests). `window.__stats()` returns the effect's fps/p95.

## Stack

Same as web-baseline: React 19.2.3, Vite 8.3.2, TypeScript 7.0.2 + `@webgpu/types` 0.1.74 (dev, types only).
Exact versions are pinned in `package.json`.

## Notes

- Needs a WebGPU browser: Chrome/Edge 113+, Safari 26+, Firefox 141+ on Windows. Headless Chromium needs `--enable-unsafe-webgpu`.
- One 32-byte uniform buffer `[w, h, 0, 0, p0..p3]`, a fullscreen triangle, and `draw(3)` per frame.
- WGSL errors (`getCompilationInfo`, line:col) and a missing WebGPU are shown on the page; device loss triggers a re-init.

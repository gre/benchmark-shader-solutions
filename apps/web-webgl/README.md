# web-webgl

Silk with the **raw WebGL 1** API (GLSL), no library. Part of [benchmark-shader-solutions](../../README.md); results are in
[RESULTS.md](../../RESULTS.md).

## Run

```sh
npm ci
npm run dev       # http://localhost:5174
npm run build     # tsc + vite build → dist/
npm run preview   # http://localhost:5174
```

URL params: `?t=<s>` freezes time · `?fps` shows the FPS overlay ·
`?instances=<N>` stacks N effects · `?jsload=<ms>` busy-loops the main thread
every 100 ms (stress tests). `window.__stats()` returns the effect's fps/p95.

## Stack

Same as web-baseline: React 19.2.3, Vite 8.3.2, TypeScript 7.0.2. No dependency added.
Exact versions are pinned in `package.json`.

## Notes

- Shader: `src/shaders/silk.glsl.ts`, a verbatim copy of `shaders/silk.glsl`.
- Handles context loss/restore; compile errors (`getShaderInfoLog`) are shown on the page.
- Shader edits hot-reload: the source is in the effect's deps and is the canvas `key`.

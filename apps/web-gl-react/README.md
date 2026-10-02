# web-gl-react

Silk with **gl-react** + **gl-react-dom** (GLSL). Part of [benchmark-shader-solutions](../../README.md); results are in
[RESULTS.md](../../RESULTS.md).

## Run

```sh
npm ci
npm run dev       # http://localhost:5171
npm run build     # tsc + vite build → dist/
npm run preview   # http://localhost:5171
```

URL params: `?t=<s>` freezes time · `?fps` shows the FPS overlay ·
`?instances=<N>` stacks N effects · `?jsload=<ms>` busy-loops the main thread
every 100 ms (stress tests). `window.__stats()` returns the effect's fps/p95.

## Stack

Same as web-baseline: React 19.2.3, Vite 8.3.2, TypeScript 7.0.2 + `gl-react` 6.0.0, `gl-react-dom` 6.0.0.
Exact versions are pinned in `package.json`.

## Notes

- `vite.config.ts` needs `define: { global: "globalThis" }`: gl-react's dependencies expect Node's `global`.
- Animation = a React re-render per frame (uniforms are props), drawn by gl-react's own rAF loop.
- `Surface` needs explicit width/height, so the app listens to `resize`.
- The problems met here are tracked upstream to improve gl-react: [gre/gl-react#540](https://github.com/gre/gl-react/issues/540).

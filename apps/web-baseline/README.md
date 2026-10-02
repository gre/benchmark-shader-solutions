# web-baseline

Reference web app: the shared shell (clock, FPS overlay, stress mode) with a solid `#1b1a33` background and no graphics library. Every web tech app is a copy of it where only `src/Effect.tsx` changes. Part of [benchmark-shader-solutions](../../README.md); results are in
[RESULTS.md](../../RESULTS.md).

## Run

```sh
npm ci
npm run dev       # http://localhost:5170
npm run build     # tsc + vite build → dist/
npm run preview   # http://localhost:5170
```

URL params: `?t=<s>` freezes time · `?fps` shows the FPS overlay ·
`?instances=<N>` stacks N effects · `?jsload=<ms>` busy-loops the main thread
every 100 ms (stress tests). `window.__stats()` returns the effect's fps/p95.

## Stack

React 19.2.3, Vite 8.3.2, TypeScript 7.0.2.
Exact versions are pinned in `package.json`.

## Notes

- `src/Effect.tsx` is the only file tech apps replace; its header documents the contract (full screen, pixel ratio capped at 2, resize, phases from `src/time.ts`, `onFirstFrame` / `onFrame`).

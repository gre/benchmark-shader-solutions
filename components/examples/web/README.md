# examples/web

Vite + React app that uses the 6 `@shader-bench/*` packages (via `file:`
links), with a tech picker, a shader picker and sliders generated from the
shader's params. Part of [components/](../../README.md).

```sh
npm ci
npm run dev       # http://localhost:5175
npm run build
```

URL: `?tech=native|native-compatible-static|native-compatible-dynamic|skia|webgpu|gl-react&shader=silk&amp=2&speed=0&ui=0`
(any numeric key is a param; `ui=0` hides the panel; `speed=0` freezes at
t = 0).

## Notes

- Peers installed for the packages: `canvaskit-wasm` (skia), `gl-react` +
  `gl-react-dom` (gl-react), and `@webgpu/types` (webgpu, dev).
- Because the packages are **symlinked** source, `vite.config.ts` needs
  `resolve.dedupe` (react, react-dom and the peers) and `server.fs.allow`, and
  `tsconfig.json` needs `preserveSymlinks`. A normal install
  (npm/tarball) needs none of this.
- Adding a tech: one entry in `src/techs.ts`, plus the dependency and its
  peers in `package.json`.

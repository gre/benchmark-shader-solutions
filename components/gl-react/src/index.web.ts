// Web entry. A `.ts` (not `.tsx`) entry is deliberate: Vite's dev server only
// pre-bundles a dependency whose entry matches /\.[cm]?[jt]s$/. Pre-bundling
// this package is what converts its CommonJS deps (gl-react, gl-react-dom)
// to ESM in dev; with a `.tsx` entry, an app that installs this package for
// real (registry / tarball) fails in dev with "does not provide an export
// named 'GLSL'" unless it adds optimizeDeps.include. (Not done in
// @shader-bench/skia: pre-bundling breaks its `?url` asset imports.)
export * from "./Effect.web";
export { default } from "./Effect.web";

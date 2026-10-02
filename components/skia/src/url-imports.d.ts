// Types of the bundler `?url` imports used by canvaskit.ts (Vite convention).
declare module "canvaskit-wasm/bin/canvaskit.js?url" {
  const url: string;
  export default url;
}
declare module "canvaskit-wasm/bin/canvaskit.wasm?url" {
  const url: string;
  export default url;
}

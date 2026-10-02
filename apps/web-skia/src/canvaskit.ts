import CanvasKitInit, { type CanvasKit } from "canvaskit-wasm";
// Vite emits the .wasm as a hashed asset (dist/assets/canvaskit-<hash>.wasm)
// and returns its URL; CanvasKit's emscripten loader fetches it via locateFile.
import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url";

// Own module so it is NOT re-executed when HMR updates Effect.tsx / the shader:
// the wasm is instantiated once per page (also shared by StrictMode remounts).
let ckPromise: Promise<CanvasKit> | null = null;
export const loadCanvasKit = () => (ckPromise ??= CanvasKitInit({ locateFile: () => wasmUrl }));

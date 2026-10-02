// The "silk" shader: definition (identical in every @shader-bench/* package
// except `sources`, which lists only what this package loads from JS).
// @shader-bench/native-compatible-dynamic: every source is a JS string,
// compiled at runtime: GLSL for the web (raw WebGL 1) and Android (OpenGL ES
// 2.0), Metal Shading Language for iOS. `sources` is platform-split so each
// bundle carries only its platform's language: Metro iOS picks sources.ios.ts
// (Metal), Metro Android sources.android.ts (GLSL), Vite/web sources.ts (GLSL).
import { defineShader } from "../../registry";
import sources from "./sources";

export default defineShader({
  name: "silk",
  periods: [41, 59, 23, 53],
  params: {
    amp: { default: 1, min: 0, max: 3, step: 0.01 }, // curve undulation (x 0.02)
    glow: { default: 1, min: 0, max: 3, step: 0.01 }, // rim glow breathing (x 0.25)
    hue: { default: 1, min: 0, max: 3, step: 0.01 }, // hue drift (x 0.5)
  },
  speed: { default: 1, min: 0, max: 10, step: 0.01 },
  sources,
});

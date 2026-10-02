// The "silk" shader: definition (identical in every @shader-bench/* package
// except `sources`, which lists only what this package loads from JS).
// @shader-bench/native-compatible-static: GLSL for the web (raw WebGL 1). On
// React Native the shaders ship natively: silk.metal is compiled at build
// time (podspec script phase -> silk.metallib) and silk.glsl.ts is packaged
// by Gradle as the Android asset shader-bench-compat-static/silk.glsl.
// `sources` is platform-split so no shader source reaches a React Native
// bundle: Metro picks sources.native.ts (empty), Vite/web picks sources.ts.
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

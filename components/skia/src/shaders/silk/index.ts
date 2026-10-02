// The "silk" shader: definition (identical in every @shader-bench/* package
// except `sources`, which lists only what this package loads from JS).
// @shader-bench/skia: SkSL, for CanvasKit (web) and RN Skia (native).
import { defineShader } from "../../registry";
import sksl from "./silk.sksl";

export default defineShader({
  name: "silk",
  periods: [41, 59, 23, 53],
  params: {
    amp: { default: 1, min: 0, max: 3, step: 0.01 }, // curve undulation (x 0.02)
    glow: { default: 1, min: 0, max: 3, step: 0.01 }, // rim glow breathing (x 0.25)
    hue: { default: 1, min: 0, max: 3, step: 0.01 }, // hue drift (x 0.5)
  },
  speed: { default: 1, min: 0, max: 10, step: 0.01 },
  sources: { sksl },
});

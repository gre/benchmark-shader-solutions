// The tech packages offered by the picker. Adding a package = one entry:
// its <Effect> (root entry) + its param schema (subpath "/shaders").
import { Effect as NativeEffect } from "@shader-bench/native";
import * as nativeSchema from "@shader-bench/native/shaders";
import { Effect as NativeCompatStaticEffect } from "@shader-bench/native-compatible-static";
import * as nativeCompatStaticSchema from "@shader-bench/native-compatible-static/shaders";
import { Effect as NativeCompatDynamicEffect } from "@shader-bench/native-compatible-dynamic";
import * as nativeCompatDynamicSchema from "@shader-bench/native-compatible-dynamic/shaders";
import { Effect as SkiaEffect } from "@shader-bench/skia";
import * as skiaSchema from "@shader-bench/skia/shaders";
import { Effect as WebgpuEffect } from "@shader-bench/webgpu";
import * as webgpuSchema from "@shader-bench/webgpu/shaders";
import { Effect as GlReactEffect } from "@shader-bench/gl-react";
import * as glReactSchema from "@shader-bench/gl-react/shaders";

export const TECHS = {
  native: { label: "native (WebGL 1 / GLSL)", Effect: NativeEffect, schema: nativeSchema },
  "native-compatible-static": { label: "native-compatible-static (WebGL 1 / GLSL)", Effect: NativeCompatStaticEffect, schema: nativeCompatStaticSchema },
  "native-compatible-dynamic": { label: "native-compatible-dynamic (WebGL 1 / GLSL)", Effect: NativeCompatDynamicEffect, schema: nativeCompatDynamicSchema },
  skia: { label: "skia (CanvasKit / SkSL)", Effect: SkiaEffect, schema: skiaSchema },
  webgpu: { label: "webgpu (WebGPU / WGSL)", Effect: WebgpuEffect, schema: webgpuSchema },
  "gl-react": { label: "gl-react (gl-react-dom / GLSL)", Effect: GlReactEffect, schema: glReactSchema },
} as const;

export type TechName = keyof typeof TECHS;

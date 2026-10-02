# @shader-bench/webgpu

`<Effect>` with **WebGPU**: the raw API on the web, `react-native-webgpu` on React Native. The same WGSL source serves both. Part of [components/](../README.md).

## Install

```sh
npm install @shader-bench/webgpu
```

- **Web:** nothing (add `@webgpu/types` 0.1.74 as a dev dependency if you
  run `tsc`). Needs a WebGPU browser.
- **React Native:** `react-native-webgpu` 0.5.17 (not the
  `react-native-wgpu` shim), `react-native-reanimated` 4.7.1 and
  `react-native-worklets` 0.13.0, plus the worklets Babel plugin. The app
  must also carry these fixes, which this package ships in `consumer/`:
  1. A patch on react-native-webgpu (a Debug crash on RN 0.87, and a
     conflict with RN Skia):
     `"postinstall": "patch-package --patch-dir node_modules/@shader-bench/webgpu/consumer/patches"`
     (with `patch-package` 8.0.1).
  2. In the `ios/Podfile`, `require_relative '../node_modules/@shader-bench/webgpu/consumer/podfile'`
     and `shader_bench_webgpu_post_install(installer)` in `post_install`.
  3. Android: `minSdkVersion = 26`.

## Usage

```tsx
import { Effect } from "@shader-bench/webgpu";

<Effect shader="silk" params={{ speed: 0.2, amp: 1 }} style={{ flex: 1 }} />
```

- `shader`: a registered shader name (`"silk"`).
- `params`: values by name, `speed` included. Missing values take their
  default, and every value is clamped to its range. `speed: 0` freezes the
  animation.
- `style`: `CSSProperties` on the web, `ViewStyle` on React Native.

The root entry exports only `Effect`, `EffectProps` and `ShaderName`. UIs
that need the param schema (sliders) can use `@shader-bench/webgpu/shaders`:
`shaderNames()` and `getShaderSchema(name)`.

## Adding a shader

1. Add `src/shaders/<name>/index.ts` and `<name>.wgsl.ts` (entry points
   `vs_main` / `fs_main`, 96-byte uniform struct).
2. Register it in `src/shaders/index.ts`.

Cost: JS only (hot reload, no native rebuild).

## Notes

- On RN, the render loop runs on the UI thread (worklets). Pixel ratio is capped at 2.
- Android: runs on a real device (Galaxy S21 Ultra, via `apps/rn-webgpu`); Dawn aborts on the emulator's Vulkan driver.

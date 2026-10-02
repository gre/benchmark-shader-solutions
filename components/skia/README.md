# @shader-bench/skia

`<Effect>` with **Skia**: `canvaskit-wasm` on the web, `@shopify/react-native-skia` on React Native. The same SkSL source serves both. Part of [components/](../README.md).

## Install

```sh
npm install @shader-bench/skia
```

- **Web:** `canvaskit-wasm` 0.42.0. No bundler config with Vite: the wasm
  is loaded lazily through `?url`. Other bundlers need an equivalent asset
  rule.
- **React Native:** `@shopify/react-native-skia` 2.14.0,
  `react-native-reanimated` 4.7.1 and `react-native-worklets` 0.13.0. Add
  `react-native-worklets/plugin` (last) to `babel.config.js`, then
  `pod install`.

## Usage

```tsx
import { Effect } from "@shader-bench/skia";

<Effect shader="silk" params={{ speed: 0.2, amp: 1 }} style={{ flex: 1 }} />
```

- `shader`: a registered shader name (`"silk"`).
- `params`: values by name, `speed` included. Missing values take their
  default, and every value is clamped to its range. `speed: 0` freezes the
  animation.
- `style`: `CSSProperties` on the web, `ViewStyle` on React Native.

The root entry exports only `Effect`, `EffectProps` and `ShaderName`. UIs
that need the param schema (sliders) can use `@shader-bench/skia/shaders`:
`shaderNames()` and `getShaderSchema(name)`.

## Adding a shader

1. Add `src/shaders/<name>/index.ts` and `<name>.sksl.ts`.
2. Register it in `src/shaders/index.ts`.

Cost: JS only (hot reload, no native rebuild).

## Notes

- On RN, rendering runs on the UI thread (Reanimated). There is no pixel-ratio cap: it renders at the device scale.
- With `@shader-bench/webgpu` in the same app, react-native-webgpu needs the patch shipped by that package; otherwise Skia breaks.

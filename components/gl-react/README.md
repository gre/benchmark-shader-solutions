# @shader-bench/gl-react

`<Effect>` with **gl-react**: `gl-react-dom` on the web, `gl-react-expo` / `expo-gl` on React Native (GLSL). Part of [components/](../README.md).

## Install

```sh
npm install @shader-bench/gl-react
```

- **Web:** `gl-react` 6.0.0 + `gl-react-dom` 6.0.0. No Vite config: the
  package ships a `global` shim and a `.ts` entry so that Vite pre-bundles
  gl-react's CommonJS.
- **React Native (iOS):** `gl-react` + `gl-react-expo` 6.0.0 + `expo-gl`
  57.0.2, which **requires Expo modules in the app**. No Expo SDK supports
  RN 0.87 yet, so:
  - install Expo with `npx install-expo-modules@0.18.1 -s 57.0.0`;
  - the `expo` patch shipped in `consumer/patches` (via `patch-package --patch-dir`);
  - `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES` for the Expo
    pods;
  - npm `overrides`, plus `@react-native/assets-registry` as a direct dep.

  See `components/examples/rn` for a working setup.
- **Android:** gl-react-expo / expo-gl support it, but it isn't built
  here. Expo SDK 57, the only one usable with RN 0.87, has Gradle plugins
  that fail with RN 0.87's Gradle 9.4. An Expo SDK that matches your RN
  version avoids this.

## Usage

```tsx
import { Effect } from "@shader-bench/gl-react";

<Effect shader="silk" params={{ speed: 0.2, amp: 1 }} style={{ flex: 1 }} />
```

- `shader`: a registered shader name (`"silk"`).
- `params`: values by name, `speed` included. Missing values take their
  default, and every value is clamped to its range. `speed: 0` freezes the
  animation.
- `style`: `CSSProperties` on the web, `ViewStyle` on React Native.

The root entry exports only `Effect`, `EffectProps` and `ShaderName`. UIs
that need the param schema (sliders) can use `@shader-bench/gl-react/shaders`:
`shaderNames()` and `getShaderSchema(name)`.

## Adding a shader

1. Add `src/shaders/<name>/index.ts` and `<name>.glsl.ts`.
2. Register it in `src/shaders/index.ts`.

Cost: JS only (hot reload, no native rebuild).

## Notes

- On the iOS simulator, OpenGL ES is a CPU software renderer: about 1 frame every 30 s. Use a device.
- There is no pixel-ratio cap on RN, and 4x MSAA is always on.
- The problems met here are tracked upstream to improve gl-react: [gre/gl-react#540](https://github.com/gre/gl-react/issues/540).

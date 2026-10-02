# @shader-bench/native

`<Effect>` with raw **WebGL 1** on the web, and on React Native with its own Fabric component: **Metal** on iOS, **AGSL** on Android 13+. The clock and render loop are native. Part of [components/](../README.md).

## Install

```sh
npm install @shader-bench/native
```

Peers: `react` 19.2.3, plus `react-native` 0.87.1 (New Architecture) on RN.

- **Web:** nothing else.
- **React Native:** `pod install` and rebuild. Autolinking registers the
  pod, the Android module and the codegen'd component. **No native file to
  edit in the app.** Building needs the Xcode Metal Toolchain
  (`xcodebuild -downloadComponent MetalToolchain`).

## Usage

```tsx
import { Effect } from "@shader-bench/native";

<Effect shader="silk" params={{ speed: 0.2, amp: 1 }} style={{ flex: 1 }} />
```

- `shader`: a registered shader name (`"silk"`).
- `params`: values by name, `speed` included. Missing values take their
  default, and every value is clamped to its range. `speed: 0` freezes the
  animation.
- `style`: `CSSProperties` on the web, `ViewStyle` on React Native.

The root entry exports only `Effect`, `EffectProps` and `ShaderName`. UIs
that need the param schema (sliders) can use `@shader-bench/native/shaders`:
`shaderNames()` and `getShaderSchema(name)`.

## Adding a shader

1. Create `src/shaders/<name>/` with:
   - `index.ts` (definition);
   - `sources.ts` (web GLSL) and `sources.native.ts` (empty, so RN bundles
     don't carry the GLSL);
   - `<name>.glsl.ts`, `<name>.metal` and `<name>.agsl`.
2. Register it in `src/shaders/index.ts`.

Cost: the shader is written in 3 languages, and it needs a **native
rebuild** (iOS: the podspec compiles the `.metal` into a metallib; Android:
Gradle packages the `.agsl`). No native code changes.

## Notes

- Pixel ratio is capped at 2 on web, iOS and Android.
- Below Android 13, the view draws a solid `#1b1a33`. AGSL errors only show at runtime, in logcat.

# @shader-bench/native-compatible-static

`<Effect>` with raw **WebGL 1** on the web, and on React Native with its own Fabric component: **Metal** on iOS, **OpenGL ES 2.0** on Android. The clock and render loop are native. **Shaders ship natively** on both platforms: the `.metal` is precompiled into a metallib, the GLSL is packaged as an Android asset, and the JS bundle carries no shader source on React Native. Floor: **React Native >= 0.81, iOS >= 15.1, Android >= 7.1 (API 25)**. Part of [components/](../README.md).

Twin package: [`@shader-bench/native-compatible-dynamic`](../native-compatible-dynamic/README.md), same API and renderer, with the shader sources in JS.

## Static vs dynamic: when to pick which

| | static (this package) | dynamic |
|---|---|---|
| shader lives in | the app binary (metallib, APK asset) | the JS bundle (Metal string on iOS, GLSL on Android) |
| Metal errors | at build time (Xcode) | at runtime (`console.error`) |
| startup | no shader compile on iOS (GLSL is always compiled at runtime on Android) | Metal compiled at runtime, once per process |
| edit / add a shader | native rebuild (iOS and Android) | Fast Refresh, OTA update, no rebuild |

Pick **static** for a fixed set of shaders that ship with the app. Pick
**dynamic** to iterate on shaders, or to add or update them from JS (OTA).

## Install

```sh
npm install @shader-bench/native-compatible-static
```

Peers: `react` >= 19.1, plus `react-native` >= 0.81 (New Architecture) on RN.

- **Web:** nothing else.
- **React Native:** `pod install` and rebuild. Autolinking registers the
  pod, the Android module and the codegen'd component. **No native file to
  edit in the app.** Building needs the Xcode Metal Toolchain
  (`xcodebuild -downloadComponent MetalToolchain`). The Android module
  declares `minSdkVersion 25`: an app at 24 (RN template default) must raise
  it to 25.

## Usage

```tsx
import { Effect } from "@shader-bench/native-compatible-static";

<Effect shader="silk" params={{ speed: 0.2, amp: 1 }} style={{ flex: 1 }} />
```

- `shader`: a registered shader name (`"silk"`).
- `params`: values by name, `speed` included. Missing values take their
  default, and every value is clamped to its range. `speed: 0` freezes the
  animation.
- `style`: `CSSProperties` on the web, `ViewStyle` on React Native.

The root entry exports only `Effect`, `EffectProps` and `ShaderName`. UIs
that need the param schema (sliders) can use
`@shader-bench/native-compatible-static/shaders`: `shaderNames()` and
`getShaderSchema(name)`.

## Adding a shader

1. Create `src/shaders/<name>/` with:
   - `index.ts` (definition);
   - `<name>.glsl.ts` (GLSL ES 1.00 as one plain template literal: web +
     Android) and `<name>.metal` (iOS);
   - `sources.ts` (exports `{ glsl }`, web) and `sources.native.ts` (empty).
2. Register it in `src/shaders/index.ts`.

Cost: the shader is written in 2 languages, and both platforms need a
**native rebuild**. The podspec compiles the `.metal` into `<name>.metallib`,
and Gradle extracts the GLSL of `<name>.glsl.ts` into the asset
`shader-bench-compat-static/<name>.glsl`. No native code changes.

## Notes

- One GLSL source for web and Android: `android/build.gradle` copies the text
  of the template literal, and fails the build if it contains `${`, a
  backslash or another backtick (the asset would differ from the JS string).
- Shader errors: Metal fails the iOS build. GLSL errors only show at runtime,
  in logcat (`ShaderBenchCompatStatic`), and the view then draws a solid
  `#1b1a33`. Same for a shader name with no metallib or asset.
- Android renders in a `TextureView` with its own EGL thread (`SBStaticGL`),
  not a `GLSurfaceView`: a SurfaceView is a separate window layer, so it
  ignores RN opacity / transforms / clipping and several stacked instances
  have no defined order.
- Precision: `highp` when the GPU supports it in fragment shaders (optional
  in OpenGL ES 2.0), otherwise the view switches the source to `mediump` and
  logs a warning.
- Android rendering pauses while the window is hidden, and the EGL context
  or surface is recreated if lost.
- Pixel ratio is capped at 2 on web, iOS and Android.
- Native names (`ShaderBenchCompatStaticView`, pod `ShaderBenchCompatStatic`,
  `com.shaderbench.compatstatic`, ObjC prefix `SBCS`) are unique, so this
  package can be installed next to `@shader-bench/native` and
  `@shader-bench/native-compatible-dynamic`.
- Built and tested on RN 0.87.1 and 0.81.6, iOS 27 simulator, Android API 34
  and API 25 emulators.

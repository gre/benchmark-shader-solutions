# @shader-bench/native-compatible-dynamic

`<Effect>` with raw **WebGL 1** on the web, and on React Native with its own Fabric component: **Metal** on iOS, **OpenGL ES 2.0** on Android. The clock and render loop are native. **Shader sources live in JS** and are compiled at runtime on every platform, so a shader edit is a JS change (Fast Refresh, OTA). Floor: **React Native >= 0.81, iOS >= 15.1, Android >= 7.1 (API 25)**. Part of [components/](../README.md).

Twin package: [`@shader-bench/native-compatible-static`](../native-compatible-static/README.md), same API and renderer, with the shaders shipped natively.

## Static vs dynamic: when to pick which

| | static | dynamic (this package) |
|---|---|---|
| shader lives in | the app binary (metallib, APK asset) | the JS bundle (Metal string on iOS, GLSL on Android) |
| Metal errors | at build time (Xcode) | at runtime (`console.error`) |
| startup | no shader compile on iOS (GLSL is always compiled at runtime on Android) | Metal compiled at runtime, once per process |
| edit / add a shader | native rebuild (iOS and Android) | Fast Refresh, OTA update, no rebuild |

Pick **static** for a fixed set of shaders that ship with the app. Pick
**dynamic** to iterate on shaders, or to add or update them from JS (OTA).

## Install

```sh
npm install @shader-bench/native-compatible-dynamic
```

Peers: `react` >= 19.1, plus `react-native` >= 0.81 (New Architecture) on RN.

- **Web:** nothing else.
- **React Native:** `pod install` and rebuild once. Autolinking registers
  the pod, the Android module and the codegen'd component. **No native file
  to edit in the app**, and no Metal Toolchain needed at build time. The
  Android module declares `minSdkVersion 25`: an app at 24 (RN template
  default) must raise it to 25.

## Usage

```tsx
import { Effect } from "@shader-bench/native-compatible-dynamic";

<Effect shader="silk" params={{ speed: 0.2, amp: 1 }} style={{ flex: 1 }} />
```

- `shader`: a registered shader name (`"silk"`).
- `params`: values by name, `speed` included. Missing values take their
  default, and every value is clamped to its range. `speed: 0` freezes the
  animation.
- `style`: `CSSProperties` on the web, `ViewStyle` on React Native.

The root entry exports only `Effect`, `EffectProps` and `ShaderName`. UIs
that need the param schema (sliders) can use
`@shader-bench/native-compatible-dynamic/shaders`: `shaderNames()` and
`getShaderSchema(name)`.

## Adding a shader

1. Create `src/shaders/<name>/` with:
   - `index.ts` (definition);
   - `<name>.glsl.ts` (GLSL ES 1.00: web + Android) and `<name>.metal.ts`
     (Metal Shading Language as a string, entry points `<name>_vertex` and
     `<name>_fragment`: iOS);
   - `sources.ts` and `sources.android.ts` (export `{ glsl }`), and
     `sources.ios.ts` (exports `{ metal }`), so each bundle carries only its
     platform's language.
2. Register it in `src/shaders/index.ts`.

Cost: the shader is written in 2 languages. **No native rebuild** on either
platform: editing it shows up with Fast Refresh, and an OTA update of the JS
bundle can ship it.

## Notes

- **Compile errors reach JS.** The view sends them through an internal
  `onShaderError` event and `<Effect>` logs them with `console.error` (a
  red box in dev, a log line in release). The view then draws a solid
  `#1b1a33`. There is no public error prop: the API stays `shader`,
  `params`, `style`.
- iOS compiles with `newLibraryWithSource:options:completionHandler:`
  (async, off the main thread), then builds the pipeline on Metal's queue.
  Nothing is drawn until it is ready. The pipeline, or the error, is cached
  per process by SHA-256 of (shader, source): other instances and remounts
  reuse it, and an edited source compiles once.
- Android compiles the GLSL on its own EGL thread (`SBDynamicGL`), in a
  `TextureView`, not a `GLSurfaceView`: a SurfaceView is a separate window
  layer, so it ignores RN opacity / transforms / clipping and several
  stacked instances have no defined order.
- Precision: `highp` when the GPU supports it in fragment shaders (optional
  in OpenGL ES 2.0), otherwise the view switches the source to `mediump` and
  logs a warning.
- Android rendering pauses while the window is hidden, and the EGL context
  or surface is recreated if lost.
- Pixel ratio is capped at 2 on web, iOS and Android.
- Native names (`ShaderBenchCompatDynamicView`, pod
  `ShaderBenchCompatDynamic`, `com.shaderbench.compatdynamic`, ObjC prefix
  `SBCD`) are unique, so this package can be installed next to
  `@shader-bench/native` and `@shader-bench/native-compatible-static`.
- Built and tested on RN 0.87.1 and 0.81.6, iOS 27 simulator, Android API 34
  and API 25 emulators.

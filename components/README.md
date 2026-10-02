# components/ — universal effect packages (web + React Native)

What would "real", reusable packages look like for each tech? Each package
exports **one `<Effect>` component** that works in a React web app (Vite)
**and** in a React Native app (iOS + Android), with the **same API**:

```tsx
import { Effect } from "@shader-bench/skia"; // or /native, /native-compatible-static, /native-compatible-dynamic, /gl-react, /webgpu

<Effect shader="silk" params={{ speed: 0.2, amp: 1 }} style={{ flex: 1 }} />;
```

This is also a study of the **real cost of modularization**: what it takes
to make a shader pluggable, to add a second shader later, and to ship one
package to two platforms.

## Packages

Every package is **standalone**: it depends on nothing but external libs
(`react`, `react-native` and its own tech libs, as peers). There is no
shared package. The shader registry, helpers and shader sources are
**duplicated** in each package, like the apps in `apps/`. Any folder can be
moved out of the repo as-is.

| package                  | web implementation                 | React Native implementation                                        |
| ------------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| `@shader-bench/native`   | raw WebGL 1 (GLSL)                 | own Fabric component: Metal (iOS) / AGSL `RuntimeShader` (Android) |
| `@shader-bench/native-compatible-static` | raw WebGL 1 (GLSL) | own Fabric component: Metal (iOS) / OpenGL ES 2.0 + GLSL (Android); RN >= 0.81, Android >= 7.1; shaders shipped natively (metallib, APK asset) |
| `@shader-bench/native-compatible-dynamic` | raw WebGL 1 (GLSL) | same renderer; shader sources in JS (Metal string on iOS, GLSL on Android), compiled at runtime: Fast Refresh / OTA, no native rebuild per shader |
| `@shader-bench/gl-react` | `gl-react` + `gl-react-dom` (GLSL) | `gl-react` + `gl-react-expo` / `expo-gl` (GLSL)                    |
| `@shader-bench/skia`     | `canvaskit-wasm` (SkSL)            | `@shopify/react-native-skia` (SkSL)                                |
| `@shader-bench/webgpu`   | raw WebGPU (WGSL)                  | `react-native-webgpu` (WGSL)                                       |

Platform split: `src/Effect.web.tsx` and `src/Effect.native.tsx`. Resolution
happens through the package.json `exports` conditions (`"react-native"`,
`"browser"`/`"default"`) plus the `"react-native"` field, so Vite and Metro
each pick their file. Heavy libs are **peerDependencies**: the consumer app
installs only what its platform needs.

## Shared API (every tech package)

```ts
type EffectProps = {
  shader: ShaderName;               // 'silk' today; registry is open
  params?: Partial<ParamValues>;    // validated/clamped against the shader's schema (incl. speed)
  style?: …;                        // web: CSSProperties; RN: ViewStyle
};
```

The API is deliberately minimal: no `paused`, `time`, `maxPixelRatio` or
`onFirstFrame` props. Each package caps the pixel ratio at 2 internally
where its tech allows it. `params={{ speed: 0 }}` freezes the animation at
t = 0, which is enough for pixel checks.

## Adding a shader

Shaders are pluggable: each package ships its own copy of the shader
definitions and sources it needs. How to add one, and what it costs per
tech, is in each package's README.

## Verification

- `examples/web` (Vite + React) and `examples/rn` (bare RN 0.87, iOS +
  Android) consume the 6 packages through `file:` dependencies and offer a
  tech picker + param sliders.
- With default params and `speed: 0` (t = 0), every package must render the
  **same pixels** as the apps in `apps/`: `node shaders/compare.mjs`.
- The generic files duplicated in every package (`src/registry.ts`, `src/types.ts`,
  `src/schema.ts`, `src/shaders/index.ts`) must stay byte-identical:
  `node components/scripts/check-shared.mjs`.

## Conclusion

A shared contract (one registry, one uniform layout) is enough to make
shaders pluggable across all 6 packages. The real cost is what each package
pushes onto the app that uses it: from nothing (native) to Expo (gl-react).
The comparison of the 6 packages and the lessons learned are in [RESULTS.md](../RESULTS.md#10-universal-packages-components).

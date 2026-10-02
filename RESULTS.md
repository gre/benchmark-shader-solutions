# Results — benchmark-shader-solutions

The concise summary is in [README.md](README.md). Raw data:
`metrics/results/*.json`; merged tables: `metrics/results/report.md`.

**Devices:**
- **Web:** MacBook Pro M1 Pro (16-core GPU), 16 GB, macOS 27.0, 120 Hz
  display, Chromium 153 headed with hardware GPU (ANGLE on Metal for WebGL;
  WebGPU on Metal 3).
- **iOS:** iPhone 13 (A15), iOS 26.5, 60 Hz display.
- **Android:** Samsung Galaxy S21 Ultra (Exynos 2100, Mali GPU), Android 15,
  48–120 Hz display.

## 0. Methodology and fairness

- **Same stack per platform:** only the graphics lib and the shader language
  differ. `metrics/check-stack.mjs` finds 0 shared-version mismatches, except
  one in rn-gl-react (`zod` pulled by Expo). Every deviation from the baseline
  is documented in the app's README.
- **Baselines:** `web-baseline` and `rn-baseline` have the same shell with no
  GPU lib. Every Δ below is "what the tech adds".
- **Visual parity:** all 12 apps match the GLSL reference (SSIM ≥ 0.99, most
  1.0000).
- **Repetitions:** web 3 runs (medians); iPhone 2 runs per app; Android 2 runs
  per app.
- **CPU and GPU:** CPU is the app process (plus, on Android, the system
  compositor separately). GPU time and frame rate are measured on the iPhone
  (Metal System Trace); on Android, only the frame rate of the views inside
  Android's UI pipeline. Energy use is not measured.
- **Web caveat:** every web app holds 120 fps (vsync cap, p95 ≈ 9.2 ms), so
  frame time does not rank them. CPU % and time to first frame do.

## 1. Performance

### 1.1 Idle animation (one full-screen effect)

**Web**, medians at 1280×800 / 2560×1600. CPU is in % of one core, summed
over Chromium's GPU, renderer and browser processes.

| app | TTFF (localhost) | CPU total | of which GPU process | JS heap |
|---|---|---|---|---|
| web-baseline | 51 / 45 ms | 6.4 / 6.7 % | 2.0 / 2.3 % | 2.5 MB |
| **web-webgl** | 54 / 57 ms | **23.2 / 26.0 %** | 14.6 / 15.7 % | 2.4 MB |
| web-gl-react | 72 / 61 ms | 28.9 / 29.2 % | 16.6 / 17.0 % | 4.8 MB |
| web-skia | 137 / 143 ms | 27.2 / 28.2 % | 15.9 / 16.6 % | 4.5 MB (+ wasm heap, not counted) |
| web-webgpu | 61 / 65 ms | 30.2 / **36.5 %** | 19.6 / **25.6 %** | 2.7 MB |

- Raw WebGL is the cheapest. WebGPU costs the most and is the only one whose
  GPU-process CPU grows with resolution in Chromium.
- web-skia's TTFF is dominated by wasm loading: 137 ms from localhost with a
  warm cache, 336 ms cold. Over a real network, the 2.3–3 MB of compressed
  wasm dominates.

**iOS, real device** (iPhone 13, A15, iOS 26.5, 60 Hz display; Release builds,
2 runs per app, mean; `metrics/perf-ios-device.py`: two Instruments snapshots ~30 s
apart, CPU = delta of the process's CPU time / wall time, % of one core):

| app | render scale | app CPU | memory footprint |
|---|---|---|---|
| rn-baseline | — | 1.1 % | 21 MB |
| **rn-native** (Metal) | 2x | **16.1 %** | 55 MB |
| rn-native-compatible-static (Metal) | 2x | **16.1 %** | 55 MB |
| rn-native-compatible-dynamic (Metal) | 2x | **15.8 %** | 55 MB |
| rn-skia | **3x** | 20.0 % | 86 MB |
| rn-webgpu | 2x | 21.3 % | 61 MB |
| rn-gl-react | **3x** + MSAA 4x | 19.3 % | **195 MB** |

- **The three native variants cost the same** (15.8–16.1 %): same Metal code.
- **Every library costs more than native**, by 3 to 5 points of CPU, while
  rendering more pixels in the case of Skia and gl-react (3x instead of 2x).
- **gl-react** uses the most memory (195 MB, MSAA buffers at 3x).
- The 2 runs agree within 0.4 point. The ranking between native and the
  libraries is clear; the order among Skia / WebGPU / gl-react (19–21 %) is
  close.

**iOS GPU and frame rate** (same iPhone; `metrics/perf-ios-device-gpu.py`:
a 5 s Metal System Trace per run, 2 runs per app, mean). GPU busy = share of
time the GPU runs the app's work, at whatever clock iOS picks, so it ranks
the apps rather than giving an absolute load. The compositor is iOS's
(backboardd), which scales and composites the app's layers.

| app | render scale | fps | app GPU busy | GPU per frame | compositor GPU busy |
|---|---|---|---|---|---|
| rn-baseline | — | static UI | 0 % | — | 1 % |
| **rn-native** (Metal) | 2x | 60 | **23.0 %** | **3.8 ms** | 6.8 % |
| rn-native-compatible-static (Metal) | 2x | 60 | **22.9 %** | **3.8 ms** | 7.0 % |
| rn-native-compatible-dynamic (Metal) | 2x | 60 | **22.9 %** | **3.8 ms** | 6.6 % |
| rn-webgpu | 2x | 60 | **23.4 %** | **3.8 ms** | 5.7 % |
| rn-skia | **3x** | 60 | 63.2 % | 10.5 ms | 21.3 % |
| rn-gl-react | **3x** + MSAA 4x | 60 | **76.3 %** | **12.7 ms** | 16.9 % |

- **Every app holds 60 fps** on this 60 Hz display.
- **At the same 2x scale, the shader costs the same GPU time** whatever the
  stack (native Metal, WebGPU): ~3.8 ms per frame. The shading language and
  the library don't change what the GPU executes.
- **Skia and gl-react cost ~3x the GPU** because they render at 3x (2.25× the
  pixels), plus 4x MSAA and a resolve pass for gl-react (two command buffers
  per frame). Their larger surfaces also cost the compositor ~2.5–3x more.
  At 63–76 % GPU busy, they have the least headroom left for the rest of an
  app.

**Android, real device** (Samsung Galaxy S21 Ultra, Exynos 2100 / Mali GPU,
Android 15; Release APKs; 20 s per run, 2 runs per app in opposite orders;
memory sampled once per run; battery 36.6–40.1 °C). CPU in % of one core,
mean of the 2 runs (runs agree within ~1 point).

| app | app CPU, 60 Hz | app CPU, 120 Hz (adaptive) | SurfaceFlinger, 60 Hz | PSS | first frame (60 Hz) |
|---|---|---|---|---|---|
| rn-baseline | 17.8 % | 16.9 % (display stays at 60 Hz) | 12.1 % | 101 MB | 74 ms |
| **rn-skia** | **26.5 %** | **37.7 %** | 39.7 % | 162 MB | 68 ms |
| **rn-webgpu** | **27.9 %** | **41.6 %** | 39.6 % | 144 MB | 129 ms |
| rn-native (AGSL) | 40.1 % | 59.1 % | 31.5 % | 112 MB | 76 ms |
| rn-native-compatible-static (OpenGL ES) | 49.4 % | 73.3 % | 41.3 % | 120 MB | 86 ms |
| rn-native-compatible-dynamic (OpenGL ES) | 49.7 % | 73.8 % | 41.9 % | 117 MB | 74 ms |
| rn-gl-react (expo-gl) | **69.0 %** | **92.2 %** | 41.0 % | 159 MB | 75 ms |

- **Ranking, same at 60 and 120 Hz:** Skia ≈ WebGPU < native AGSL < native
  OpenGL ES (static = dynamic) < gl-react.
- **Over the baseline, at 60 Hz:** Skia +9, WebGPU +10, native AGSL +22,
  native OpenGL ES +32, gl-react +51 points of app CPU.
- **Why Skia and WebGPU are cheaper here:** they render into their own
  surface, outside Android's UI pipeline, so the app's RenderThread does
  nothing per frame. Our native views use a `TextureView`, which the
  RenderThread composites every frame (~18 % at 60 Hz), plus the Mali driver.
- **SurfaceFlinger** (the system compositor, outside the app) costs about the
  same for every effect (≈31–42 % at 60 Hz, ≈45–56 % at 120 Hz). Counting it,
  Skia/WebGPU (~66–68 %) and native AGSL (~72 %) are close; OpenGL ES (~91 %)
  and gl-react (~110 %) stay behind.
- **120 Hz costs ~25–35 % more CPU than 60 Hz**, not double: part of each
  frame's cost doesn't scale with the frame rate.
- **gl-react** spends its CPU on the RenderThread (~20 %), the JS thread
  (~15–19 %, a React re-render per frame), the Mali driver and expo-gl's GL
  thread.
- **WebGPU runs on Android** (Dawn on Vulkan).
- **GLSL compile on startup:** 27–37 ms on the first launch after install,
  0.7–1.6 ms afterwards (Android caches the compiled program).

**Android frame rate and GPU** (same phone, display held at 60 Hz;
`metrics/perf-android-gpu.py`, 10 s per run; 2 runs for the first five apps,
1 for WebGPU and gl-react). fps = frames SurfaceFlinger actually presented
for the effect's layer (`dumpsys SurfaceFlinger --latency`), which also sees
the SurfaceViews of Skia and WebGPU; for rn-native, its view's own frame
counter. GPU load = Mali utilization
(`/sys/kernel/gpu/gpu_busy`) scaled by the GPU clock to its maximum
(858 MHz): the GPU stayed at its lowest clock (130 MHz) for every app except
gl-react (~200 MHz), so this is a rough ranking, not a precise load.

| app | fps | GPU load at max clock |
|---|---|---|
| rn-baseline | static UI | 0 % |
| rn-native (AGSL) | 60 | 6 % |
| rn-native-compatible-static (OpenGL ES) | 60 | 7 % |
| rn-native-compatible-dynamic (OpenGL ES) | 60 | 7 % |
| rn-webgpu | 60 | 6 % |
| rn-skia | 60 | 11–12 % |
| rn-gl-react | 60 | 18 % |

- **Every app holds 60 fps**, Skia and WebGPU included: their lower CPU is
  not a lower frame rate.
- **The GPU ranking matches the iPhone:** at the same 2x scale, native
  OpenGL ES and WebGPU cost about the same; Skia (3x) and gl-react (3x +
  MSAA) cost the most.

**First frame and startup** (time from JS start to the first frame of the
effect; "cold" = first launch after a fresh install, so shader caches are
empty; "warm" = relaunches). iPhone 13: 2 × (1 cold + 3 warm) launches per app
(`metrics/perf-ios-device-startup.py`). Galaxy S21 Ultra: 2 launches per app
at 60 Hz, warm.

| app | iPhone, cold | iPhone, warm | Android, warm |
|---|---|---|---|
| rn-baseline | 24–27 ms | 19–32 ms | 72–76 ms |
| rn-native | 81–90 ms | 33–48 ms | 70–82 ms |
| rn-native-compatible-static | 83–102 ms | 36–51 ms | 82–89 ms |
| rn-native-compatible-dynamic | 92–101 ms | 36–50 ms | 64–84 ms |
| rn-skia | 143–158 ms | 31–83 ms | 60–76 ms |
| rn-webgpu | 143–270 ms | 85–112 ms | 114–143 ms |
| rn-gl-react | 80–87 ms | 49–59 ms | 73–77 ms |

**Static vs dynamic, shader setup** (library + pipeline on iOS, compile +
link on Android):

| | static (precompiled Metal / packaged GLSL) | dynamic (source passed from JS) |
|---|---|---|
| iPhone, cold | 40–50 ms | 55–59 ms (Metal compiled at runtime) |
| iPhone, warm | 0.3–6 ms | 3–7 ms |
| Android, cold | 37 ms | 27 ms |
| Android, warm | 0.8 ms | 1.6 ms |

- **Compiling Metal at runtime costs ~10–20 ms on the first launch** after an
  install, an update or a shader change, then Metal's on-disk cache serves
  it. On Android, both variants compile GLSL at runtime and the system caches
  the program, so they cost the same.
- **WebGPU has the slowest first frame** on both phones (Dawn device and
  pipeline creation); Skia's cold launch is slow on iOS too.

### 1.2 Lifecycle (checked during development, not systematically tested)
- **web-webgl:** context loss and restore verified (`WEBGL_lose_context`).
- **web-webgpu:** device loss handled (re-init up to 3 times); verified only
  with a simulated `lost` promise.
- **web-skia:** surface recreated on resize; the JS heap stays flat over 40
  resizes.
- **rn-native:** rotation and backgrounding not exercised.
- **rn-baseline:** rotation verified on Android.
- **Other RN apps:** not verified.

## 2. Fairness factors

| | pixel ratio cap | color space | AA |
|---|---|---|---|
| web-* | ✅ min(DPR, 2) | sRGB | shader AA |
| rn-native, rn-native-compatible-* | ✅ 2x (iOS contentScale; Android buffer scaled) | sRGB | shader AA |
| rn-webgpu | ✅ 2x | sRGB | shader AA |
| rn-skia | ❌ device scale (3x), no prop | Display P3 default | shader AA |
| rn-gl-react | ❌ device scale (3x), no prop | sRGB | **4x MSAA forced** |

Being able to choose the render resolution is itself a key criterion for a
full-screen background. At 3x, the shader runs on 2.25× the pixels of 2x
for no visible gain on a soft effect.

## 3. Size and weight

**Web** (production build):

| app | JS gzip | wasm gzip | **Δ total gzip** | node_modules |
|---|---|---|---|---|
| web-baseline | 59.9 kB | — | — | 71.6 MB (24 pkgs) |
| web-webgpu | 63.3 kB | — | **+3.5 kB** | 71.9 MB |
| web-webgl | 64.0 kB | — | **+4.2 kB** | 71.7 MB |
| web-gl-react | 98.2 kB | — | +38.4 kB | 73.5 MB (68 pkgs) |
| web-skia | 98.7 kB | 2.96 MB (7.32 MB raw) | **+3.00 MB** | 98.4 MB |

**iOS** (Release `.app` built for the iPhone, arm64; the deltas land in the
executable because the libs are linked statically):

| app | .app | **Δ** | executable | JS bundle (Hermes) | pods | node_modules |
|---|---|---|---|---|---|---|
| rn-baseline | 25.7 MB | — | 4.8 MB | 2.32 MB | 87 | 272 MB |
| rn-native | 25.8 MB | **+0.07 MB** | 4.8 MB | 2.32 MB | 87 | 272 MB |
| rn-native-compatible-static | 25.8 MB | **+0.08 MB** | 4.8 MB | 2.33 MB | 87 | 272 MB |
| rn-native-compatible-dynamic | 25.8 MB | **+0.09 MB** | 4.9 MB | 2.33 MB + 15 kB of shader | 87 | 272 MB |
| rn-gl-react | 32.5 MB | +6.8 MB | 10.8 MB | 2.63 MB | 100 | 578 MB |
| rn-webgpu | 36.1 MB | +10.4 MB | 15.2 MB | 2.36 MB | 88 | 444 MB |
| rn-skia | 42.8 MB | **+17.1 MB** | 21.3 MB | 2.93 MB | 88 | **1.6 GB** |

**Android** (release APK):
- 4 ABIs: rn-baseline is 65.11 MB, rn-native 65.29 MB (**+182 kB**, AGSL
  included), rn-native-compatible **+202 kB** (static) / **+231 kB** (dynamic).
- arm64 only (what a phone downloads from a split APK / app bundle): baseline
  ~22.7 MB; rn-gl-react **+7.4 MB**, rn-skia **+14.6 MB**, rn-webgpu **+19.6 MB**,
  the native variants +0.05 to +0.09 MB.

**Build times** (fresh DerivedData, iPhone Release build, after `pod install`):
rn-baseline 55 s, rn-native 70 s, rn-native-compatible-static 66 s,
rn-webgpu 76 s, rn-skia 86 s, rn-gl-react 110 s. `pod install`: 31 s (Skia) to
141 s (WebGPU). Android `assembleRelease` (4 ABIs): about 4.5 min. Vite builds
take under 0.3 s for every web app.

## 4. Portability and shader reuse

How much do you write to cover **web + iOS + Android**?

| approach | shader languages | integration codebases | notes |
|---|---|---|---|
| **WebGPU** (web-webgpu + rn-webgpu) | 1 (WGSL) | 1 (the JS is nearly identical web ↔ RN, plus `present()`) | best reuse; the RN lib is young and needs patches on RN 0.87 |
| **Skia** (CanvasKit + RN Skia) | 1 (SkSL; AGSL is the same code) | 2 (CanvasKit imperative vs RN Skia declarative) | heaviest everywhere |
| **GLSL** (WebGL / gl-react + gl-react-expo) | 1 (GLSL ES 1.00) | 1 with gl-react (same `<Node>` API), or 2 with raw WebGL | the RN path is expo-gl (OpenGL ES, deprecated on Apple) |
| **Native** (rn-native + web-webgl) | 3 (Metal + AGSL + GLSL for web) | 3 (ObjC++, Kotlin, web JS) | best runtime and size, worst reuse |
| **Native, compatible** (rn-native-compatible-static / -dynamic + web-webgl) | 2 (Metal + GLSL, the **same GLSL** on web and Android) | 3 (ObjC++, Kotlin, web JS) | same runtime and size as native, one shader language less, Android 7.1+; the dynamic variant also lets JS ship shaders |

The shader itself ports mechanically between all 5 languages. The cost is in
the host code and in the toolchain, not in the math.

## 5. Integration in a real UI

- **Every RN tech is a regular view** you can lay out and overlay: the FPS
  overlay sits on top of all of them.
- **rn-native** is the most "View-like": a Fabric component with props
  (`paused`, `frozenTime`, `speed`) and events (`onFirstFrame`,
  `onFrameStats`), driven from JS with zero per-frame cost.
- **RN Skia and gl-react** compose naturally with other shapes, images and
  effects of the same lib (a scene graph). WebGPU gives full control but
  everything is manual.
- Transparency and composition with images/video were not tested in this
  study.

## 6. Maintenance and debt

Workarounds each app has to carry on RN 0.87 / iOS 27 (from the READMEs):

| app | patches / overrides / native tweaks |
|---|---|
| rn-native | none from libs; you own ~700 lines of native code (ObjC++ + Kotlin) |
| rn-native-compatible-static / -dynamic | none from libs; ~880–940 lines of native code (OpenGL ES / EGL on Android; runtime Metal compile in dynamic) |
| rn-skia | **none**, works out of the box |
| rn-webgpu | 1 backported upstream patch (patch-package), Podfile header-map fix, 2 package names (rename shim) |
| rn-gl-react | Expo SDK forced (none supports RN 0.87), 1 patch on `expo`, Podfile build-setting hack, npm `overrides`, an extra direct dep, iOS min 16.4; 13 Expo pods; on Android 2 more patches (Expo's Kotlin plugin version, AGP 9 APIs) and 2 Gradle settings |
| web-gl-react | `define: { global: "globalThis" }` in the Vite config |
| web-skia / web-webgpu / web-webgl | none |

**Lag behind React Native:**
- Expo has no SDK for RN 0.87.
- `react-native-wgpu` 0.5.17 needed an unreleased fix and has since been
  renamed (latest `react-native-webgpu` 0.10.4).
- RN Skia supported RN 0.87 on day one.

**Activity:**
- **Very active:** RN Skia and react-native-webgpu.
- **Low activity, Node-era dependencies:** gl-react 6.
- **Platform APIs, nothing to track:** WebGL, WebGPU, Metal and AGSL.

**Upstream follow-up:** the gl-react findings (web overhead vs raw WebGL,
React re-render per frame, Expo / expo-gl dependency, blocking JS-thread
round trip, no pixel-ratio / MSAA control) are written up with improvement
directions in [gre/gl-react#540](https://github.com/gre/gl-react/issues/540).

## 7. Developer experience

| | shader edit → see it | compile errors | uniforms |
|---|---|---|---|
| web-webgl | HMR, instant | `getShaderInfoLog` line numbers, shown in page | by location, manual |
| web-gl-react | HMR, instant | red overlay in canvas (stage mislabelled) | props, typed by usage |
| web-skia | HMR, instant | `RuntimeEffect.Make` callback, line + caret | positional float array |
| web-webgpu | HMR, instant | `getCompilationInfo` line:col (very clear) | manual 32-byte buffer layout |
| rn-skia | Fast Refresh, 1–2 s | LogBox with line + caret; reload after an error | by name |
| rn-webgpu | Fast Refresh | line:col in-app; native crashes only in device logs | manual buffer layout |
| rn-gl-react | Metro reload | LogBox toast | props |
| rn-native | **native rebuild**: iOS ~39 s, Android ~5 s + reinstall | Metal: at **build time** with file:line; AGSL: only at runtime (logcat) | Metal struct by hand; AGSL by name |
| rn-native-compatible-static | native rebuild on iOS and Android | Metal: at build time; GLSL: at runtime (logcat) | Metal struct by hand; GLSL by name |
| rn-native-compatible-dynamic | **Fast Refresh** on iOS and Android, no native rebuild; shaders can ship over the air | at runtime, reported to JS (red box in dev) with line numbers | Metal struct by hand; GLSL by name |

## 8. Platform support (theoretical)

These are the minimums declared by each approach and its dependencies, as
installed in this repo (podspecs, Gradle files, peer dependencies). They are
not tested on old OS versions.

### Web

All web apps share a build floor: **Vite 8's default target** (Chrome/Edge
111, Firefox 114, Safari 16.4 / iOS 16.4). It can be lowered with
`build.target`, down to what each API needs:

| approach | needs | browsers |
|---|---|---|
| WebGL (`web-webgl`, `@shader-bench/native` on web) | WebGL 1 | every current browser |
| gl-react (`web-gl-react`, `@shader-bench/gl-react`) | WebGL 1 | every current browser |
| CanvasKit (`web-skia`, `@shader-bench/skia`) | WebAssembly + WebGL | every current browser, at the cost of a ~3 MB wasm download |
| WebGPU (`web-webgpu`, `@shader-bench/webgpu`) | WebGPU | Chrome/Edge 113+ desktop, Chrome Android 121+ (Android 12+, recent GPUs), Safari 26 (macOS / iOS 26), Firefox 141+ on Windows only (other platforms rolling out). **Not universal**: needs a fallback. |

### React Native

The floor of the stack itself is **RN 0.87: iOS 15.1+, Android 7.0 (API
24)+, New Architecture**. The pinned Reanimated 4.7.1 / Worklets 0.13 accept
RN 0.86–0.88. With older Reanimated 4 releases, the libs below go further
back.

| approach | React Native (declared) | iOS | Android |
|---|---|---|---|
| native component (`rn-native`, `@shader-bench/native`) | New Architecture (Fabric + codegen); built and tested on 0.87 only | 15.1 (Metal) | API 24 to install, but the effect needs **API 33 (Android 13)** for AGSL. Below that, it draws a solid fallback. |
| native, compatible: static and dynamic (`rn-native-compatible-*`, `@shader-bench/native-compatible-*`) | **≥ 0.81**, tested on 0.81.6 and 0.87.1 | 15.1 (Metal) | **API 25 (Android 7.1)** with the full effect (OpenGL ES 2.0), tested on Android 7.1 (API 25) and Android 15 |
| RN Skia 2.14 (`rn-skia`, `@shader-bench/skia`) | ≥ 0.78, Reanimated ≥ 4.0, Worklets ≥ 0.7 | 14.0 (pod), so 15.1 with RN 0.87 | API 24 |
| react-native-webgpu 0.5.17 (`rn-webgpu`, `@shader-bench/webgpu`) | ≥ 0.81, Reanimated ≥ 4.2.1, Worklets ≥ 0.7.2 | 15.1 | **API 26** (`AHardwareBuffer`); runs on Android 15 (S21 Ultra) |
| gl-react-expo + expo-gl 57 (`rn-gl-react`, `@shader-bench/gl-react`) | Expo SDK 57 targets **RN 0.86**; 0.87 needed a patch | **16.4** | API 24; runs on Android 15 (S21 Ultra) after 4 Expo / AGP 9 fixes in `apps/rn-gl-react` (2 patches, 2 Gradle settings); not yet in `components/examples/rn` |

**Widest reach:**
- Web: WebGL.
- iOS: the native components and RN Skia (no extra floor beyond RN's).
- Android: RN Skia (API 24) and the native-compatible variants (API 25), both with the
  full effect. The AGSL native component needs Android 13 for the effect
  itself, about 69 % of devices in April 2026 (apilevels.com); API 25+ is
  about 96 %.

## 9. Trade-off maps

Every axis is measured. Hover a point in the SVG for its values.

**Size vs runtime cost.** CPU is idle animation: Chromium (all processes,
1280×800) on the web, the app process on an iPhone 13 for RN (2 runs per
app), on a Galaxy S21 Ultra at 60 Hz for Android (2 runs per app). Down-left
is ideal.

![Size vs CPU](docs/perf-maps.svg)

- **Web:**
  - WebGL is both the lightest and the cheapest to run.
  - WebGPU is as light, but costs the most CPU in Chromium (and grows with
    resolution: 36.5 % at 2560×1600).
  - CanvasKit pays 3 MB for no CPU gain.
- **Android (Galaxy S21 Ultra, 60 Hz):**
  - Skia (26.5 %) and WebGPU (27.9 %) cost the least CPU, but add 15–20 MB.
  - the native variants add almost nothing but cost more CPU (40–50 %),
    mostly compositing their `TextureView`.
  - gl-react costs the most (69 %).
- **React Native (iPhone 13):**
  - the three native variants are the lightest and the cheapest (~16 %).
  - gl-react-expo (19 %), Skia (20 %) and WebGPU (21 %) cost a few points
    more CPU and 7 to 17 MB more size.
  - on the GPU, native and WebGPU are equal (23 % busy); Skia (63 %) and
    gl-react (76 %) render at 3x and cost ~3x more.
- **Caveats:** every web tech holds 120 fps here and every RN app 60 fps on
  the iPhone, so these are CPU differences, not frame drops.

**Packages: who pays the cost?** *Extra steps for the app*: what a developer
must add or change in their app, beyond installing the package
(dependencies, Babel plugin, patches, Podfile edits, SDK floors, Expo).
*Code the package author maintains*: tech-specific lines, excluding the
shared registry and the shaders. Down-left is ideal.

![Packages: who pays the cost](docs/packages-map.svg)

| package | extra steps for the app | code the author maintains (lines) |
|---|---|---|
| native | 0 | ~920 |
| native-compatible-static | 0 | ~1 175 |
| native-compatible-dynamic | 0 | ~1 280 |
| skia | 4 | ~280 |
| webgpu | 7 | ~470 |
| gl-react | 9 | ~240 |

No solution sits in the ideal corner:
- The web comes closest, with WebGL.
- On React Native, native is the lightest and the cheapest to run on iOS but
  costs the most code to write; Skia is the easiest to set up but the
  heaviest. On Android, Skia and WebGPU use less app CPU than native, and
  about the same once the system compositor is counted.
- As packages, the cost moves between the author (native) and the app that
  uses it (gl-react, webgpu).

### Qualitative ratings (1–5, appendix)

The authors' judgment while building each app; the facts behind them are in
§1–§8.

| app | writing the shader | fixing errors | where it animates | getting it running | lib health |
|---|---|---|---|---|---|
| web-webgl | 5 | 4 | 4 | 5 | 5 |
| web-gl-react | 5 | 4 | 3 | 3 | 2 |
| web-skia | 4 | 4 | 4 | 3 | 3 |
| web-webgpu | 4 | 4 | 4 | 4 | 4 |
| rn-native | 4 | 3 | 5 | 2 | 3 |
| rn-skia | 5 | 4 | 5 | 4 | 4 |
| rn-webgpu | 5 | 4 | 5 | 2 | 4 |
| rn-gl-react | 5 | 3 | 2 | 1 | 2 |

Visual fidelity is not rated: every app matches the GLSL reference (§0).

## 10. Universal packages (`components/`)

What it took to turn each tech into a standalone, universal `<Effect>`
package (details: [components/README.md](components/README.md)):

Measured on 2026-10-03 with `components/examples/web` and `components/examples/rn`.

| | native | native-compatible-static | native-compatible-dynamic | skia | webgpu | gl-react |
|---|---| --- | --- |---|---|---|
| **web: consumer installs** | nothing | nothing | nothing | `canvaskit-wasm` | nothing (`@webgpu/types` dev, types only) | `gl-react`, `gl-react-dom` |
| **web: app config** | none | none | none | none (wasm via `?url` + `<script>`, lazy) | none | none (package ships a `global` shim and a `.ts` entry so Vite pre-bundles its CJS deps) |
| **RN: consumer installs** | nothing (own Fabric component, autolinked) | nothing (own Fabric component, autolinked) | nothing (own Fabric component, autolinked) | RN Skia, Reanimated, Worklets + Babel plugin | react-native-webgpu, Reanimated, Worklets + Babel plugin | gl-react, gl-react-expo, expo-gl **+ Expo modules** (SDK 57 forced on RN 0.87) |
| **RN: native setup in the app** | none (`pod install`) | none (`pod install`) | none (`pod install`; no Metal Toolchain needed) | none (`pod install`) | patch via `postinstall` (2 fixes, shipped by the package), Podfile helper call (shipped), Android `minSdk` 26 | `install-expo-modules`, `expo` patch (shipped), Podfile flag, `overrides`, iOS 16.4; Android not set up in `examples/rn` (the app `apps/rn-gl-react` shows the 4 fixes it needs) |
| **adding a shader** | 1 folder (GLSL + Metal + AGSL + def); **native rebuild** on iOS (9 s incremental) and Android | 1 folder (GLSL + Metal + def); native rebuild on iOS and Android | 1 folder (GLSL + Metal + def); JS only (Fast Refresh, OTA) | 1 folder (SkSL + def); JS only | 1 folder (WGSL + def); JS only | 1 folder (GLSL + def); JS only |
| **web pixels** (vs GLSL, t = 0) | SSIM 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |
| **iOS pixels** (simulator) | 1.0000 (2× cap) | 1.0000 (2× cap) | 1.0000 (2× cap) | 0.9975 (3×, no cap; rim AA in points) | 1.0000 (2× cap) | 0.9997 (3× + MSAA, no cap; CPU GLES: ~30 s per frame) |
| **Android pixels** (emulator API 34 / API 25) | 0.9994 | 0.9997 / 0.9996 | 0.9997 / 0.9996 | 0.9981 (no cap) | not checked (the emulator's Vulkan aborts; runs on a device) | not checked |
| **JS bundle carries only its platform's shader source** | yes (`sources.ts` / `sources.native.ts`; Metal/AGSL are native files) | yes (no shader at all in RN bundles) | yes (iOS: Metal only; Android: GLSL only) | yes (one SkSL for both; no canvaskit in RN bundles) | yes (one WGSL for both) | yes (one GLSL for both; no gl-react-dom in RN bundles) |
| **runtime libs leak across platforms** | no | no | no | no | no | no |
| **LOC: shared generic** (byte-identical) | 205 | 205 | 205 | 205 | 205 | 205 |
| **LOC: tech-specific** (Effect files, native code, packaging, consumer fixes) | ≈ 920 (TS 230, ObjC++ 345, Kotlin 252, podspec/gradle 107) | ≈ 1 175 (TS 242, ObjC++ 347, Kotlin 458, podspec/gradle 128) | ≈ 1 280 (TS 267, ObjC++ 459, Kotlin 487, podspec/gradle 66) | ≈ 280 | ≈ 470 (incl. 104 lines of consumer fixes) | ≈ 240 (incl. 59-line `expo` patch) |
| **LOC: shader sources** | GLSL 160 + MSL 150 + AGSL 131 | GLSL 160 + MSL 150 | GLSL 160 + MSL 156 | SkSL 134 | WGSL 134 | GLSL 160 |
| **tarball** (`npm pack`) | 28.6 kB, 23 files | 25.5 kB, 22 files | 24.2 kB, 22 files | 14.4 kB, 12 files | 15.6 kB, 12 files | 10.2 kB, 12 files |

All 6 run side by side in `examples/web` and in one iOS build of
`examples/rn`. In `examples/rn` on Android, native, native-compatible and skia
were checked on the emulator; webgpu needs a real device (its Vulkan backend
aborts on the emulator), and gl-react's Expo setup is iOS-only there.

**Lessons:**

- **A package cannot carry its dependencies' fixes.** Peer patches, Podfile
  build settings, `minSdk`, Expo modules: all of these land in the consumer
  app. The cleanest a package can do is ship the fix and make it a one-line
  hook: a `--patch-dir` postinstall, a `require_relative` Podfile helper.
- **"Own native code" is the cheapest for consumers and the most expensive
  for authors.** `@shader-bench/native` asks nothing of the app beyond
  `pod install`. But it needs 3 shader languages, ObjC++ and Kotlin, and a
  native rebuild for every new shader.
- **Test the tarball, in dev mode.** `file:` symlinks hide packaging bugs,
  because Vite scans linked sources but not installed ones. Both the
  CanvasKit CJS import and gl-react's CJS deps broke only with an installed
  package in Vite dev. A `.tsx` entry also disables Vite's pre-bundling,
  which skia relies on (`?url`) and gl-react cannot live with.
- **Test libraries together.** react-native-webgpu's worklets serializer
  silently captured RN Skia's objects. Each library works alone; only the
  shared example app revealed the conflict (fixed by a patch).
- **Uniform contract = the real abstraction.** One registry (205 lines,
  byte-identical, checked) and one 96-byte layout serve 5 shading languages
  and 4 very different uniform APIs: positional floats, by-name objects,
  buffers and React props.
- **Pixel-ratio and MSAA control** are only available where we own the
  surface (native, webgpu, web everywhere). RN Skia and expo-gl render at
  the screen scale.

## 11. Conclusions and recommendations

- **Web: raw WebGL.** Smallest cost (+4 kB, lowest CPU, fast first frame),
  universal support, zero dependencies. WebGPU is just as light in bytes but
  costs more CPU in Chromium today and has narrower browser support.
  CanvasKit only makes sense if you already use Skia, given its 3 MB of wasm.
- **React Native, one effect, best result: a native component**, in its
  compatible form (Metal on iOS, OpenGL ES 2.0 on Android). It adds almost
  nothing to the binary (+0.08–0.09 MB iOS, +0.20–0.23 MB APK), runs off the
  JS thread, covers RN ≥ 0.81, iOS 15.1+ and Android 7.1+ (~96 % of Android
  devices), reuses the web's GLSL on Android, and has the lowest CPU on iOS.
  On Android it costs more CPU than RN Skia or WebGPU (40–49 % vs ~27 % at
  60 Hz), because our views composite a `TextureView` every frame (a
  `SurfaceView` would likely close that gap); OpenGL ES also costs more than
  AGSL (49 % vs 40 %), the price of supporting Android 7.1–12. You pay in native
  boilerplate (~880–940 lines). Pick:
  - **static** (shaders compiled into the app) for fixed shaders: errors at
    build time, no compile cost at startup;
  - **dynamic** (shaders passed from JS) to iterate with Fast Refresh, drive
    shaders from JS or ship them over the air. It costs ~10–20 ms of Metal
    compilation on the first launch after an install on iOS.

  The AGSL variant is simpler on Android but limited to Android 13+.
- **React Native, best developer experience: RN Skia.** It works out of the
  box on RN 0.87, has great errors and Fast Refresh, and animates on the UI
  thread. You pay +17 MB of app size, 1.6 GB of node_modules, and no
  render-resolution control: it renders at 3x, which costs ~3x the GPU of
  the native component on the iPhone (63 % vs 23 % busy).
- **React Native + web code sharing: WebGPU.** One WGSL shader and nearly
  the same JS on both platforms, UI-thread animation. The RN lib is moving
  fast (renamed, needed a patch on RN 0.87); +10 MB.
- **Avoid gl-react on React Native today.** expo-gl ties you to the Expo SDK
  ↔ RN version lockstep, to OpenGL ES (deprecated on Apple), and to a
  blocking per-frame round trip on the JS thread, and it uses the most GPU
  (3x + MSAA: 76 % busy on the iPhone). Its setup on RN 0.87 needed
  the most hacks. The problems found here are tracked upstream, with
  improvement directions, in [gre/gl-react#540](https://github.com/gre/gl-react/issues/540).

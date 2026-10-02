# Metrics report

## Machine

Apple M1 Pro (10 cores), 16 GB, macOS 27.0, Node v24.7.0, Xcode 27.0

- Model Name: MacBook Pro
- Model Identifier: MacBookPro18,1
- Chip: Apple M1 Pro
- Total Number of Cores: 10 (8 Performance and 2 Efficiency)
- Memory: 16 GB
- Chipset Model: Apple M1 Pro
- Type: GPU
- Total Number of Cores: 16
- Metal Support: Metal 4
- Display Type: Built-in Liquid Retina XDR Display
- Resolution: 3456 x 2234 Retina

## Stack consistency (check-stack)

Shared-package version mismatches vs platform baseline: **1**

| app | mismatches | extra pkg names | extra instances | extra pods | unexpected file diffs |
|---|---|---|---|---|---|
| web-gl-react | 0 | 43 | 43 | - | none |
| web-skia | 0 | 2 | 2 | - | none |
| web-webgpu | 0 | 1 | 1 | - | none |
| web-webgl | 0 | 0 | 0 | - | none |
| rn-gl-react | 1 | 140 | 190 | EXConstants, Expo, ExpoAsset, ExpoDomWebView, ExpoFileSystem, ExpoFont, ExpoGL, ExpoKeepAwake, ExpoLogBox, ExpoModulesCore, ExpoModulesJSI, ExpoModulesWorklets, ExpoModulesWorkletsAdapter | none |
| rn-skia | 0 | 8 | 9 | react-native-skia | none |
| rn-webgpu | 0 | 11 | 15 | react-native-webgpu | none |
| rn-native | 0 | 0 | 0 | 0 | none |
| rn-native-compatible-static | 0 | 0 | 0 | 0 | none |
| rn-native-compatible-dynamic | 0 | 0 | 0 | 0 | none |

## Web bundle size (production build)

| app | JS raw | JS gzip | JS br | WASM raw | WASM gzip | WASM br | total raw | total gzip | total br | Δ raw vs baseline | Δ gzip vs baseline |
|---|---|---|---|---|---|---|---|---|---|---|---|
| web-baseline | 191.9 kB | 59.9 kB | 51.6 kB | - | - | - | 192.3 kB | 60.2 kB | 51.8 kB | - | - |
| web-gl-react | 318.6 kB | 98.2 kB | 84.0 kB | - | - | - | 319.0 kB | 98.5 kB | 84.1 kB | +126.7 kB | +38.4 kB |
| web-skia | 319.1 kB | 98.7 kB | 85.3 kB | 7.32 MB | 2.96 MB | 2.28 MB | 7.64 MB | 3.06 MB | 2.36 MB | +7.44 MB | +3.00 MB |
| web-webgpu | 200.3 kB | 63.3 kB | 54.6 kB | - | - | - | 200.7 kB | 63.6 kB | 54.8 kB | +8.4 kB | +3.5 kB |
| web-webgl | 201.5 kB | 64.0 kB | 55.1 kB | - | - | - | 202.0 kB | 64.3 kB | 55.3 kB | +9.6 kB | +4.2 kB |

### Web node_modules and LOC

| app | node_modules | installed pkgs | lockfile pkgs | integration LOC (src minus shaders) | shader LOC |
|---|---|---|---|---|---|
| web-baseline | 71.56 MB | 24 | 68 | 127 | - |
| web-gl-react | 73.54 MB | 68 | 111 | 151 | 149 |
| web-skia | 98.35 MB | 27 | 70 | 208 | 129 |
| web-webgpu | 71.86 MB | 26 | 69 | 236 | 129 |
| web-webgl | 71.74 MB | 25 | 68 | 214 | 148 |

## Web performance (headed Chromium, hardware GPU)

Chromium 153.0.8010.12, flags `--enable-unsafe-webgpu --enable-gpu --ignore-gpu-blocklist --use-angle=metal`, 10 s per run, 3 repetitions (cells: median (min-max)); WebGL renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)"; WebGPU adapter: {"vendor":"apple","architecture":"metal-3","description":""}. Display refreshes at 120 Hz, so frame times are vsync-capped at 8.33 ms.

| app | viewport | TTFF ms | avg frame ms | p95 ms | max ms | JS heap MB | CPU% GPU proc | CPU% renderer | CPU% browser | CPU% total |
|---|---|---|---|---|---|---|---|---|---|---|
| web-baseline | 1280x800@1 | 51 (37-55) | 8.33 (8.33-8.33) | 9.30 (9.20-9.30) | 11.6 (9.8-12.6) | 2.5 (2.4-2.5) | 2.0 (1.9-2.1) | 3.7 (3.1-3.8) | 0.5 (0.4-1.8) | 6.4 (6.1-6.8) |
| web-baseline | 2560x1600@1 | 45 (45-49) | 8.33 (8.33-8.34) | 9.20 (9.20-9.30) | 13.3 (10.7-16.7) | 2.5 (2.5-2.5) | 2.3 (1.9-2.4) | 4.2 (3.6-4.3) | 0.2 (0.1-0.2) | 6.7 (5.6-6.9) |
| web-gl-react | 1280x800@1 | 72 (56-76) | 8.33 (8.33-8.33) | 9.20 (9.20-9.30) | 10.4 (9.7-14.9) | 4.8 (4.8-4.9) | 16.6 (15.8-17.4) | 11.9 (11.2-12.2) | 0.5 (0.4-0.9) | 28.9 (27.9-30.1) |
| web-gl-react | 2560x1600@1 | 61 (61-69) | 8.33 (8.33-8.33) | 9.20 (9.20-9.30) | 11.5 (9.5-12.6) | 4.8 (4.8-4.9) | 17.0 (16.1-17.2) | 11.9 (11.0-12.1) | 0.1 (0.1-0.2) | 29.2 (27.2-29.3) |
| web-skia | 1280x800@1 | 137 (134-137) | 8.33 (8.33-8.33) | 9.20 (9.20-9.20) | 10.6 (10.2-14.3) | 4.5 (4.5-4.5) | 15.9 (15.6-16.9) | 10.7 (10.3-11.4) | 0.6 (0.4-1.4) | 27.2 (26.3-29.7) |
| web-skia | 2560x1600@1 | 143 (138-176) | 8.33 (8.33-8.33) | 9.20 (9.20-9.20) | 10.9 (9.5-12.4) | 3.8 (3.8-3.9) | 16.6 (15.4-16.9) | 11.2 (10.6-11.4) | 0.2 (0.1-0.2) | 28.2 (26.1-28.3) |
| web-webgpu | 1280x800@1 | 61 (58-64) | 8.33 (8.33-8.33) | 9.20 (9.20-9.20) | 10.5 (10.5-11.3) | 2.7 (2.7-2.7) | 19.6 (18.6-20.5) | 10.1 (9.8-10.3) | 0.5 (0.3-1.3) | 30.2 (28.7-32.1) |
| web-webgpu | 2560x1600@1 | 65 (53-88) | 8.33 (8.33-8.33) | 9.20 (9.20-9.30) | 10.0 (9.7-10.6) | 2.7 (2.7-2.7) | 25.6 (25.5-27.8) | 10.9 (10.8-11.1) | 0.1 | 36.5 (36.5-39.0) |
| web-webgl | 1280x800@1 | 54 (52-62) | 8.33 (8.33-8.33) | 9.50 (9.30-10.00) | 11.0 (10.3-11.3) | 2.4 (2.4-2.5) | 14.6 (14.1-14.7) | 7.5 (7.3-7.7) | 0.8 (0.7-1.2) | 23.2 (22.1-23.3) |
| web-webgl | 2560x1600@1 | 57 (49-59) | 8.33 (8.33-8.35) | 9.30 (9.30-9.30) | 12.2 (10.7-24.0) | 2.4 (2.4-2.5) | 15.7 (15.4-16.6) | 8.6 (8.4-9.2) | 0.8 (0.7-1.7) | 26.0 (24.5-26.6) |

CPU % = share of one core summed over processes of that type (CDP SystemInfo.getProcessInfo cpuTime delta over the 10 s window). TTFF = window.__firstFrame, ms after navigation start (localhost, includes wasm load). Median TTFF of 3 extra fresh loads at 1280x800: web-baseline 48.7, web-gl-react 98.6, web-skia 141.7, web-webgpu 52.1, web-webgl 54.1.

## Android performance (release APKs, Samsung Galaxy S21 Ultra)

Device keys: `@s21-r1/r2` first device pass (PSS polled during the run), `@s21-a1/a2` adaptive refresh (48-120 Hz) and `@s21-60hz-1/2` display locked at 60 Hz (both with `--pss-once`). One run of 20 s per key; refresh = SurfaceFlinger active mode at the end of the run. rn-skia / rn-webgpu draw into their own surface, outside HWUI: `gfxinfo` counts no frame for them.

| app | API | reps x s | app CPU% (of one core) | SurfaceFlinger CPU% | PSS avg MB | first frame ms | shader setup ms | HWUI frames / 20 s | janky % | HWUI p95 ms | refresh Hz | battery °C | top threads CPU% (rep 1) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rn-baseline@s21-60hz-1 | 35 | 1 x 20 | 17.7 | 12.0 | 101 | 72 | - | 60 | 11.7 | 17 | 60 | 39.5 | tstudy.baseline 8.79, mqt_v_js 6.01, RenderThread 1.09 |
| rn-gl-react@s21-60hz-1 | 35 | 1 x 20 | 68.8 | 41.3 | 161 | 73 | - | 1546 | 0.3 | 19 | 60 | 39.8 | RenderThread 19.55, mqt_v_js 15.33, mali-cmar-backe 13.71 |
| rn-skia@s21-60hz-1 | 35 | 1 x 20 | 26.3 | 39.8 | 162 | 76 | - | 0 (not HWUI) | - | - | 60 | 39.7 | ffectstudy.skia 16.87, mali-cmar-backe 6.6, binder:7392_ 2.4 |
| rn-webgpu@s21-60hz-1 | 35 | 1 x 20 | 27.9 | 40.2 | 147 | 114 | - | 0 (not HWUI) | - | - | 60 | 39.8 | ectstudy.webgpu 18.8, mali-cmar-backe 5.75, binder:7715_ 2.77 |
| rn-native@s21-60hz-1 | 35 | 1 x 20 | 40.1 | 30.7 | 111 | 70 | - | 2361 | 0.0 | 10 | 60 | 39.3 | RenderThread 18.19, mali-cmar-backe 9.59, ectstudy.native 6.35 |
| rn-native-compatible-static@s21-60hz-1 | 35 | 1 x 20 | 48.9 | 40.5 | 119 | 82 | 1.6 | 1485 | 0.0 | 12 | 60 | 39.4 | RenderThread 17.54, mali-cmar-backe 11.82, SilkGL 8.94 |
| rn-native-compatible-dynamic@s21-60hz-1 | 35 | 1 x 20 | 49.8 | 41.2 | 118 | 64 | 0.8 | 1499 | 0.2 | 12 | 60 | 39.5 | RenderThread 17.89, mali-cmar-backe 12.08, SilkGL 9.03 |
| rn-baseline@s21-60hz-2 | 35 | 1 x 20 | 17.9 | 12.1 | 101 | 76 | - | 63 | 4.8 | 16 | 60 | 40.0 | tstudy.baseline 8.82, mqt_v_js 5.98, RenderThread 1.06 |
| rn-gl-react@s21-60hz-2 | 35 | 1 x 20 | 69.2 | 40.6 | 158 | 77 | - | 1522 | 0.3 | 19 | 60 | 40.0 | RenderThread 19.52, mqt_v_js 15.19, mali-cmar-backe 13.93 |
| rn-skia@s21-60hz-2 | 35 | 1 x 20 | 26.6 | 39.5 | 162 | 60 | - | 0 (not HWUI) | - | - | 60 | 40.1 | ffectstudy.skia 17.16, mali-cmar-backe 6.51, binder:9125_ 2.37 |
| rn-webgpu@s21-60hz-2 | 35 | 1 x 20 | 27.8 | 39.0 | 142 | 143 | - | 0 (not HWUI) | - | - | 60 | 40.0 | ectstudy.webgpu 18.71, mali-cmar-backe 5.79, binder:8772_ 2.67 |
| rn-native@s21-60hz-2 | 35 | 1 x 20 | 40.1 | 32.3 | 113 | 82 | - | 2338 | 0.0 | 10 | 60 | 40.1 | RenderThread 18.05, mali-cmar-backe 9.7, ectstudy.native 6.38 |
| rn-native-compatible-static@s21-60hz-2 | 35 | 1 x 20 | 49.9 | 42.0 | 121 | 89 | 1.6 | 1517 | 0.1 | 11 | 60 | 40.1 | RenderThread 18.13, mali-cmar-backe 12.06, SilkGL 9 |
| rn-native-compatible-dynamic@s21-60hz-2 | 35 | 1 x 20 | 49.6 | 42.5 | 115 | 84 | 0.7 | 1538 | 0.1 | 12 | 60 | 40.1 | RenderThread 17.99, mali-cmar-backe 12.04, SilkGL 8.89 |
| rn-baseline@s21-a1 | 35 | 1 x 20 | 16.9 | 11.7 | 101 | 80 | - | 56 | 7.1 | 16 | 60 | 36.7 | tstudy.baseline 8.43, mqt_v_js 5.65, RenderThread 0.94 |
| rn-gl-react@s21-a1 | 35 | 1 x 20 | 91.2 | 50.2 | 157 | 72 | - | 3082 | 0.2 | 13 | 120 | 38.3 | RenderThread 23.34, mqt_v_js 19.41, mali-cmar-backe 18.96 |
| rn-skia@s21-a1 | 35 | 1 x 20 | 37.9 | 52.8 | 162 | 49 | - | 0 (not HWUI) | - | - | 120 | 37.9 | ffectstudy.skia 24.13, mali-cmar-backe 9.61, binder:31994_ 3.43 |
| rn-webgpu@s21-a1 | 35 | 1 x 20 | 41.2 | 56.2 | 143 | 105 | - | 0 (not HWUI) | - | - | 120 | 38.2 | ectstudy.webgpu 28.12, mali-cmar-backe 9.18, binder:32468_ 3.58 |
| rn-native@s21-a1 | 35 | 1 x 20 | 58.5 | 44.6 | 109 | 48 | - | 4619 | 24.2 | 9 | 120 | 36.6 | RenderThread 26.46, mali-cmar-backe 14.32, ectstudy.native 9.2 |
| rn-native-compatible-static@s21-a1 | 35 | 1 x 20 | 72.3 | 53.1 | 117 | 53 | 0.7 | 2970 | 5.6 | 12 | 120 | 37.1 | RenderThread 24.56, mali-cmar-backe 17.67, SilkGL 14.61 |
| rn-native-compatible-dynamic@s21-a1 | 35 | 1 x 20 | 73.8 | 54.4 | 122 | 72 | 1.6 | 2975 | 4.4 | 12 | 120 | 37.3 | RenderThread 25.3, mali-cmar-backe 17.71, SilkGL 14.77 |
| rn-baseline@s21-a2 | 35 | 1 x 20 | 16.8 | 12.0 | 101 | 171 | - | 54 | 9.3 | 16 | 60 | 39.7 | tstudy.baseline 8.63, mqt_v_js 5.54, RenderThread 0.89 |
| rn-gl-react@s21-a2 | 35 | 1 x 20 | 93.3 | 49.5 | 162 | 92 | - | 3112 | 0.3 | 12 | 120 | 38.8 | RenderThread 24.12, mqt_v_js 19.8, mali-cmar-backe 18.5 |
| rn-skia@s21-a2 | 35 | 1 x 20 | 37.5 | 56.8 | 160 | 46 | - | 0 (not HWUI) | - | - | 120 | 39.3 | ffectstudy.skia 23.7, mali-cmar-backe 9.54, binder:3480_ 3.89 |
| rn-webgpu@s21-a2 | 35 | 1 x 20 | 42.0 | 55.8 | 143 | 133 | - | 0 (not HWUI) | - | - | 120 | 39.0 | ectstudy.webgpu 28.43, mali-cmar-backe 9.63, binder:2750_ 3.61 |
| rn-native@s21-a2 | 35 | 1 x 20 | 59.6 | 45.8 | 112 | 60 | - | 4777 | 24.2 | 9 | 120 | 39.7 | RenderThread 27.02, mali-cmar-backe 14.73, ectstudy.native 9.36 |
| rn-native-compatible-static@s21-a2 | 35 | 1 x 20 | 74.2 | 57.1 | 121 | 58 | 0.8 | 2986 | 5.1 | 12 | 120 | 39.5 | RenderThread 25.31, mali-cmar-backe 17.92, SilkGL 15.12 |
| rn-native-compatible-dynamic@s21-a2 | 35 | 1 x 20 | 73.7 | 56.4 | 118 | 55 | 0.8 | 2992 | 5.2 | 11 | 120 | 39.4 | RenderThread 25.21, mali-cmar-backe 17.89, SilkGL 14.92 |
| rn-baseline@s21-r1 | 35 | 1 x 20 | 10.8 | 3.5 | 110 | 285 | - | 58 | 6.9 | 11 | - | - | tstudy.baseline 5.58, mqt_v_js 2.37, binder:29053_ 1.88 |
| rn-native@s21-r1 | 35 | 1 x 20 | 59.7 | 41.6 | 126 | 77 | - | 4559 | 22.8 | 9 | - | - | RenderThread 26.46, mali-cmar-backe 14.09, ectstudy.native 8.79 |
| rn-native-compatible-static@s21-r1 | 35 | 1 x 20 | 72.9 | 51.1 | 128 | 98 | 36.8 | 2880 | 4.1 | 11 | - | - | RenderThread 24.33, mali-cmar-backe 17.53, SilkGL 14.43 |
| rn-native-compatible-dynamic@s21-r1 | 35 | 1 x 20 | 73.8 | 52.8 | 133 | 78 | 27.1 | 2884 | 5.0 | 12 | - | - | RenderThread 24.45, mali-cmar-backe 17.74, SilkGL 14.3 |
| rn-baseline@s21-r2 | 35 | 1 x 20 | 18.8 | 8.8 | 103 | 92 | - | 59 | 8.5 | 17 | - | - | tstudy.baseline 8.44, mqt_v_js 5.57, binder:22210_ 2.45 |
| rn-native@s21-r2 | 35 | 1 x 20 | 59.8 | 39.7 | 114 | 47 | - | 4796 | 21.7 | 9 | - | - | RenderThread 25.85, mali-cmar-backe 14.17, ectstudy.native 9.23 |
| rn-native-compatible-static@s21-r2 | 35 | 1 x 20 | 72.5 | 50.4 | 125 | 55 | 0.8 | 2845 | 6.8 | 12 | - | - | RenderThread 23.24, mali-cmar-backe 16.52, SilkGL 13.51 |
| rn-native-compatible-dynamic@s21-r2 | 35 | 1 x 20 | 73.4 | 51.2 | 123 | 92 | 1.6 | 3051 | 4.0 | 11 | - | - | RenderThread 24.34, mali-cmar-backe 17.4, SilkGL 14.04 |

### Android device summary (Galaxy S21 Ultra, mean of 2 runs)

| app | pass | app CPU% (runs) | SurfaceFlinger CPU% | PSS MB | first frame ms | refresh Hz | battery °C |
|---|---|---|---|---|---|---|---|
| rn-baseline | adaptive (48-120 Hz) | 16.9 (16.9 / 16.8) | 11.9 | 101 | 126 | 60/60 | 36.7/39.7 |
| rn-baseline | 60 Hz locked | 17.8 (17.7 / 17.9) | 12.1 | 101 | 74 | 60/60 | 39.5/40.0 |
| rn-baseline | first pass (PSS polled, adaptive) | 14.8 (10.8 / 18.8) | 6.2 | 107 | 189 | -/- | -/- |
| rn-gl-react | adaptive (48-120 Hz) | 92.2 (91.2 / 93.3) | 49.8 | 159 | 82 | 120/120 | 38.3/38.8 |
| rn-gl-react | 60 Hz locked | 69.0 (68.8 / 69.2) | 41.0 | 159 | 75 | 60/60 | 39.8/40.0 |
| rn-skia | adaptive (48-120 Hz) | 37.7 (37.9 / 37.5) | 54.8 | 161 | 48 | 120/120 | 37.9/39.3 |
| rn-skia | 60 Hz locked | 26.5 (26.3 / 26.6) | 39.7 | 162 | 68 | 60/60 | 39.7/40.1 |
| rn-webgpu | adaptive (48-120 Hz) | 41.6 (41.2 / 42.0) | 56.0 | 143 | 119 | 120/120 | 38.2/39.0 |
| rn-webgpu | 60 Hz locked | 27.9 (27.9 / 27.8) | 39.6 | 144 | 129 | 60/60 | 39.8/40.0 |
| rn-native | adaptive (48-120 Hz) | 59.1 (58.5 / 59.6) | 45.2 | 111 | 54 | 120/120 | 36.6/39.7 |
| rn-native | 60 Hz locked | 40.1 (40.1 / 40.1) | 31.5 | 112 | 76 | 60/60 | 39.3/40.1 |
| rn-native | first pass (PSS polled, adaptive) | 59.7 (59.7 / 59.8) | 40.6 | 120 | 62 | -/- | -/- |
| rn-native-compatible-static | adaptive (48-120 Hz) | 73.3 (72.3 / 74.2) | 55.1 | 119 | 56 | 120/120 | 37.1/39.5 |
| rn-native-compatible-static | 60 Hz locked | 49.4 (48.9 / 49.9) | 41.3 | 120 | 86 | 60/60 | 39.4/40.1 |
| rn-native-compatible-static | first pass (PSS polled, adaptive) | 72.7 (72.9 / 72.5) | 50.8 | 127 | 77 | -/- | -/- |
| rn-native-compatible-dynamic | adaptive (48-120 Hz) | 73.8 (73.8 / 73.7) | 55.4 | 120 | 64 | 120/120 | 37.3/39.4 |
| rn-native-compatible-dynamic | 60 Hz locked | 49.7 (49.8 / 49.6) | 41.9 | 117 | 74 | 60/60 | 39.5/40.1 |
| rn-native-compatible-dynamic | first pass (PSS polled, adaptive) | 73.6 (73.8 / 73.4) | 52.0 | 128 | 85 | -/- | -/- |

## iOS performance (iPhone 13, iOS 26.5, Release)

CPU % of one core = delta of the process's CPU time / wall time between two Instruments snapshots ~30 s apart; memory = physical footprint. Mean (runs).

| app | runs | app CPU % (runs) | memory MB |
|---|---|---|---|
| rn-baseline | 2 | 1.1 (1.1 / 1.1) | 21 |
| rn-native | 2 | 16.1 (16.1 / 16.1) | 55 |
| rn-native-compatible-static | 2 | 16.1 (16.3 / 15.9) | 55 |
| rn-native-compatible-dynamic | 2 | 15.8 (15.7 / 16.0) | 55 |
| rn-skia | 2 | 20.0 (20.1 / 19.9) | 86 |
| rn-webgpu | 2 | 21.3 (21.3 / 21.2) | 61 |
| rn-gl-react | 2 | 19.3 (19.3 / 19.2) | 195 |

## iOS startup (iPhone 13): first frame and shader setup

cold = first launch after a fresh install (empty Metal cache); warm = relaunches. ms from JS start.

| app | pass | first frame cold | first frame warm | shader setup cold | shader setup warm |
|---|---|---|---|---|---|
| rn-baseline | 1 | 27 | 19 / 28 / 24 | - | - / - / - |
| rn-baseline | 2 | 24 | 30 / 32 / 31 | - | - / - / - |
| rn-gl-react | 1 | 80 | 56 / 49 / 52 | - | - / - / - |
| rn-gl-react | 2 | 87 | 57 / 59 / 50 | - | - / - / - |
| rn-native | 1 | 90 | 48 / 43 / 41 | - | - / - / - |
| rn-native | 2 | 81 | 33 / 37 / 44 | - | - / - / - |
| rn-native-compatible-dynamic | 1 | 92 | 38 / 37 / 46 | 58.6 | 6.7 / 3.4 / 6.8 |
| rn-native-compatible-dynamic | 2 | 101 | 45 / 50 / 36 | 54.5 | 6.7 / 6.9 / 6.8 |
| rn-native-compatible-static | 1 | 83 | 51 / 36 / 47 | 40.2 | 0.3 / 5.9 / 0.3 |
| rn-native-compatible-static | 2 | 102 | 37 / 49 / 43 | 49.6 | 5.9 / 0.3 / 0.3 |
| rn-skia | 1 | 143 | 40 / 43 / 81 | - | - / - / - |
| rn-skia | 2 | 158 | 44 / 83 / 31 | - | - / - / - |
| rn-webgpu | 1 | 143 | 90 / 112 / 85 | - | - / - / - |
| rn-webgpu | 2 | 270 | 97 / 90 / 86 | - | - / - / - |

## iOS GPU and frame rate (iPhone 13, 60 Hz display)

perf-ios-device-gpu.py: 5 s Metal System Trace. GPU busy = union of the app's GPU intervals / time; fps = images the app presents per second (GPU work bursts for OpenGL ES); compositor = backboardd's GPU busy. Mean (runs).

| app | runs | fps | GPU busy % | GPU ms / frame | compositor GPU busy % | display fps |
|---|---|---|---|---|---|---|
| rn-baseline | 1 | 0.0 | 0.0 | 0.00 | 1.2 | 7.0 |
| rn-native | 2 | 60.2 | 23.0 | 3.82 | 6.8 | 60.1 |
| rn-native-compatible-static | 2 | 60.3 | 22.9 | 3.81 | 7.0 | 60.0 |
| rn-native-compatible-dynamic | 2 | 60.3 | 22.9 | 3.81 | 6.6 | 60.0 |
| rn-skia | 2 | 60.2 | 63.2 | 10.50 | 21.3 | 59.8 |
| rn-webgpu | 2 | 62.4 | 23.4 | 3.75 | 5.7 | 60.0 |
| rn-gl-react | 2 | 60.0 | 76.3 | 12.71 | 16.9 | 60.0 |

## Android frame rate and GPU (Galaxy S21 Ultra, 60 Hz)

perf-android-gpu.py: fps = frames SurfaceFlinger presented for the app's busiest layer; GPU load = gpu_busy x clock / max clock. Mean (runs).

| app | runs | fps | vsyncs per frame | GPU busy % (at clock) | GPU clock MHz | GPU load at max clock % |
|---|---|---|---|---|---|---|
| rn-baseline | 2 | 2.4 | 30.0 | 0.0 | 20 | 0.0 |
| rn-native | 2 | - | - | 39.8 | 130 | 6.0 |
| rn-native-compatible-static | 2 | 59.5 | 1.0 | 47.5 | 130 | 7.2 |
| rn-native-compatible-dynamic | 2 | 59.5 | 1.0 | 47.8 | 130 | 7.3 |
| rn-skia | 2 | 60.0 | 1.0 | 75.0 | 130 | 11.4 |
| rn-webgpu | 1 | 60.0 | 1.0 | 40.1 | 130 | 6.1 |
| rn-gl-react | 1 | 60.0 | 1.0 | 70.3 | 203 | 17.8 |

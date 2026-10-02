# metrics

Measurement scripts for the Silk study. Own npm package (`npm install`, Playwright 1.63.0 / Chromium 1243).
**`apps/` is read-only**: web builds run in a clone under `/private/tmp/es-metrics/`, iOS builds are read from a
derivedData folder (or built in a clone). Results go to `results/*.json`; `report.mjs` turns them into markdown.
Scripts skip apps that are missing or not built, with a note. Never run broad `pkill`s here: other agents share the machine.

| script | what | output |
|---|---|---|
| `check-stack.mjs` | per platform, shared package versions (package-lock.json) and pods (Podfile.lock) vs baseline: mismatches, extra deps (direct + transitive), extra pods, files differing from baseline outside the expected ones | `results/check-stack.json` |
| `size.mjs` | web: build in a clone, JS/WASM/CSS/other raw+gzip(-9)+brotli(q11), delta vs web-baseline. RN: Release `.app`, Frameworks breakdown, main binary, `main.jsbundle`, pods. Android: APK breakdown. All: node_modules bytes + package count, LOC | `size-web.json`, `size-ios.json` |
| `perf-web.mjs` | headed Chromium + hardware GPU, vite preview on ports 5180-5189 | `perf-web.json`, `machine.json` |
| `perf-ios-device.py` | physical iPhone: install + launch, two Instruments "Activity Monitor" snapshots ~30 s apart (xctrace recordings stop after ~1 s on a device), CPU % = delta of the process's CPU time / wall time, memory footprint; matches the launched PID (every app's process is "RnBaseline") | `perf-ios-device.jsonl` |
| `perf-ios-device-startup.py` | physical iPhone: uninstall + install + first launch (cold: empty Metal cache), then relaunches (warm); reads the apps' `[effect] first frame` / `shader setup` lines from `devicectl --console` (the apps mirror them to stderr in Release) | `startup-ios-device.jsonl` |
| `perf-ios.mjs` | iOS simulator variant of the above (not used for the published results: the simulator has no device GPU path) | `perf-ios.json` |
| `perf-ios-device-gpu.py` | physical iPhone: launch, 5 s "Metal System Trace" (all processes): the app's GPU busy % (union of its GPU intervals) and ms per frame, the images it presents per second (CoreAnimation present requests; GPU work bursts for OpenGL ES, which doesn't go through them), the compositor's (backboardd) GPU busy %, the display's swaps per second | `gpu-ios-device.jsonl` |
| `perf-android-gpu.py` | physical Android phone, display held at 60 Hz: frames SurfaceFlinger presented per second for each of the app's layers (`dumpsys SurfaceFlinger --latency`, sees the SurfaceViews of Skia / WebGPU too), device GPU utilization from sysfs | stdout (JSON lines) |
| `perf-android.mjs` | uses the attached device, else boots an arm64 AVD (`-no-snapshot-save -no-window`); installs the release APKs of the 7 RN apps, 20 s x 3 reps: CPU % (/proc/<pid>/stat), CPU % per thread name, PSS (`dumpsys meminfo`), first frame (logcat), SurfaceFlinger CPU, HWUI frame stats (`dumpsys gfxinfo`); kills the emulator at the end | `perf-android.json` |
| `startup.mjs` | first frame + native `[effect] shader setup N ms`, n fresh installs then n relaunches, on the iOS simulator or an Android device | `startup.json` |
| `android-device-summary.mjs` | per app and pass of the Galaxy S21 Ultra runs (`@s21-a*` adaptive refresh, `@s21-60hz-*` locked at 60 Hz, `@s21-r*` first pass): mean of the runs (app CPU, SurfaceFlinger, PSS, first frame) + per-run values (battery °C, refresh Hz, top threads) | `android-device-summary.json` |
| `report.mjs` | merges the JSON files into markdown tables (stdout) | |

## Usage

```sh
cd metrics && npm install
node check-stack.mjs [--app rn-skia]            # exit code 1 if any shared-version mismatch
node size.mjs [--app web-skia,web-webgl] [--reuse-build]
node size.mjs --app rn-baseline --derived-data /private/tmp/rnb-dd-rel     # reuse an existing Release sim build
node size.mjs --app rn-skia --build [--sim es-metrics]                      # SLOW: clone, npm ci / pod install if needed, xcodebuild Release -> /private/tmp/es-metrics/dd/<app>
node size.mjs --app rn-native --apk path/to/app-release.apk                 # Android breakdown (add --derived-data for the iOS side in the same call)
node perf-web.mjs [--app web-skia] [--reuse-build] [--seconds 10] [--ttff-runs 3]
node perf-ios.mjs --app rn-baseline --derived-data /private/tmp/rnb-dd-rel [--sim es-metrics] [--seconds 20]
node perf-android.mjs [--app rn-baseline,rn-native,rn-native-compatible-static,rn-native-compatible-dynamic] [--apk-<app> <path>]   # needs ANDROID_HOME (default ~/Library/Android/sdk)
node perf-android.mjs --avd es-api25 --key-suffix @api25 --app rn-native-compatible-static,rn-native-compatible-dynamic   # another AVD: results under "<app>@api25"
node perf-android.mjs --app rn-skia,rn-webgpu --reps 1 --pss-once --no-install --pause 10 --key-suffix @s21-a1   # real device: one run per app, PSS read once after the CPU window
node android-device-summary.mjs
node perf-ios.mjs ... --key-suffix @pass2                     # extra pass saved under "<app>@pass2"
node startup.mjs --platform ios --app rn-native-compatible-dynamic --app-path <Release .app> [--sim es-metrics] [--n 5]
node startup.mjs --platform android --app rn-native-compatible-static --apk /private/tmp/rnncs-app-release-4abi.apk [--key-suffix @api25]
python3 perf-ios-device.py com.effectstudy.skia --app-path <Release-iphoneos .app> [--seconds 20]
python3 perf-ios-device-startup.py com.effectstudy.skia --app-path <Release-iphoneos .app> [--relaunches 3]
python3 perf-ios-device-gpu.py com.effectstudy.skia [--seconds 5]   # app already installed
python3 perf-android-gpu.py [rn-skia rn-native ...] [--hz 60] >> results/gpu-android-device.jsonl
node report.mjs > results/report.md
```
`--reuse-build` reuses `/private/tmp/es-metrics/web/<app>/dist` from a previous run (otherwise: fresh clone + `npm run build`,
so measurements always correspond to the app's current sources).

## Methodology

**check-stack.** Versions are read from each app's lockfile (every `node_modules/**/name` instance). "Mismatch" = a package
present in both app and baseline whose resolved version set differs; if the baseline version is still there and the app only adds an
extra nested copy it is reported as `info` (e.g. `scheduler` 0.25.0 pulled by `react-reconciler`), not a mismatch. Pods: top-level pods
(subspecs ignored) of `ios/Podfile.lock`. File diff: every file outside `node_modules/dist/Pods/build/vendor` is compared with the
baseline; expected = `src/Effect.tsx`, `src/shaders/*`, `README.md`, lockfiles, `package.json` (checked field by field: only
deps/scripts may differ). Remaining differences are compared after normalising app names, bundle ids, ports and simulator names
(`rename-only`); anything else is listed as `UNEXPECTED DIFF` (e.g. web-gl-react's `vite.config.ts` `define: { global: "globalThis" }`,
which is a real, documented deviation). Added/removed files are listed (RN tech apps have no `android/`: "REMOVED android/ (27 files)").

**size.** Web: sizes of every file of `dist/`; gzip level 9, brotli quality 11 (what a CDN would typically serve; no
transfer overhead). node_modules: sum of file sizes; "installed pkgs" counts package directories actually on disk (platform-optional
packages of other OSes are not installed), "lockfile pkgs" counts lockfile entries. LOC = physical lines of `src/` code files, split
into integration (`src/` minus `src/shaders/`, which **includes the shared shell** — compare with the baseline's number for the
delta) and shader. For rn-native, `ios/**/Silk*` and `android/**/Silk*` native sources are listed separately (`loc.native`).
iOS: size of the `.app` in the Release-iphonesimulator folder (sum of file sizes, thus slightly different from `du`), split into
Frameworks (per framework), main executable, `main.jsbundle` (format checked: Hermes bytecode) and other. **Simulator builds are
x86_64/arm64 simulator slices, not an App Store thin build**; deltas between apps are meaningful, absolute sizes are not
what a user would download. Pods = top-level pods in `Podfile.lock`.

**perf-web.** Chromium 1243 launched **headed** with `--enable-unsafe-webgpu --enable-gpu --ignore-gpu-blocklist --use-angle=metal`
(headless may silently fall back to software). `vite preview` of a production build, on `127.0.0.1:518x`. Viewports: DPR 1 at
1280x800 and at 2560x1600 (4 Mpx = the same pixel count as DPR 2 at 1280x800 and below the apps' DPR cap, no browser scaling).
Per viewport: time to first frame (`window.__firstFrame`, ms since navigation start; also the median of 3 fresh loads at
1280x800), then 10 s of `requestAnimationFrame` deltas measured inside the page (first 5 dropped): avg / p50 / p95 / p99 / max,
`performance.memory.usedJSHeapSize` at the end, and CPU% of the browser's processes by type (CDP `SystemInfo.getProcessInfo`
cumulative `cpuTime` delta over the window: `GPU`, `renderer`, `browser`, as % of one core). The GPU process CPU is the *CPU* time
of the GPU process (command encoding/ANGLE translation), not GPU busy time. Renderer strings: `WEBGL_debug_renderer_info` and
`navigator.gpu.requestAdapter().info` are recorded in the JSON.

**perf-ios.** The Simulator runs the app as a macOS process. Its pid comes from `simctl launch`; after 3 s settling the script reads
`ps -o rss=,time=` once per second for 20 s: CPU % = delta cumulative CPU time / delta wall time (% of one core), RSS from the same
sample. The other simulated processes of the device (children of its `launchd_sim` named backboardd / SpringBoard / MTL* / *Render* / *Graphics*: compositing) are summed as `otherDeviceCpuPercent`,
and host-side `MTLSimDriverHost` processes (shared across simulators; Metal bridge) as `hostGpuBridgeCpuPercent` when present. First frame: the app logs `[effect] first frame N ms after JS start` with
`console.log`; the script captures it with `simctl spawn <dev> log stream`. Device: `es-metrics` (iPhone 18 Pro, iOS 27.0), created by the
script, never one of the app agents' simulators.

Repetitions: `--reps 3` (perf-web, perf-ios, perf-android) with median (min-max) reported; web clones are deleted after each app (`--keep` to retain);
`node_modules` size excludes Gradle outputs (`android/build`, `.cxx`) left by Android builds (`bytesIncludingGradleOutputs` keeps the raw number: rn-baseline reads 16 GB with them).
check-stack classifies per-app documented deviations (see `DOCUMENTED` in the script) apart from "UNEXPECTED DIFF".

## Caveats

- **Simulator is not a device.** CPU/GPU/memory on the iOS simulator run on the host (Apple GPU via the simulator's Metal bridge,
  different thermal/power behaviour, no on-device memory limits). Use iOS numbers to compare techs against each other, not as absolute values.
- **Display refresh**: this machine's built-in display is ProMotion; headed Chromium's rAF runs at **120 Hz** (frame ~8.3 ms) even for the
  baseline. Frame time therefore reads as "does it keep 120 fps"; the load shows in the CPU % and in max/p95. Other apps open on
  the machine or on the 5160 static server, Xcode builds, Metro etc. add noise: run the real campaign on a quiet machine, 3 repetitions if
  numbers are close.
- Headed Chromium needs the window to be visible (not occluded) for rAF not to throttle; do not lock the screen during a run.
- `performance.memory` is Chromium-only and quantized/imprecise (unless `--enable-precise-memory-info`, not used); it only covers the JS heap
  (canvaskit-wasm memory is wasm linear memory, **not** counted: not visible here).
- Time to first frame is on localhost with a warm disk cache; the 7.3 MB wasm of web-skia would dominate on a real network (use the gzip/brotli sizes).
- Build sizes are of the default Vite production build (no minification tweaks, no compression plugins).
- RN CPU % depends on what the simulator does (Reanimated frame callback on UI thread vs JS rAF). The sampled app process includes JS thread + UI thread +
  Hermes; GPU work is in the driver process.
- Timings of builds (`buildMs`, `buildTimings`) are on a busy shared machine: indicative only.
- Android: all 7 RN apps have `android/`: pass release APKs (`--apk-<app>`, defaults
  `/private/tmp/rn{b,n,ncs,ncd}-app-release-4abi.apk` and `/private/tmp/rn-{skia,webgpu,gl-react}-release-arm64.apk`, arm64-only builds); the script does not build them.
- Android real device: `--pss-once` reads PSS once after the CPU window. Polling `dumpsys meminfo` every 2 s runs on the app's binder
  thread and is counted in its CPU (~5 points on the S21 in the `@s21-r*` pass). Battery temperature (`dumpsys battery`) is logged before
  each run and the display refresh rate (SurfaceFlinger `activeMode`) before and after. Installing a new package on a device with Play
  Protect may open a confirmation dialog on the phone; `--no-install` skips packages that are already installed. **Check that the APK animates** (two screenshots
  a few seconds apart): the rn-native APK measured before 2026-10-04 was built with `FROZEN_TIME = 0` (static frame, 4 HWUI frames
  per run), so its earlier Android CPU / first-frame numbers were not of an animating effect; it was rebuilt from current sources.
- Android frame stats: `gfxinfo` counts HWUI frames of the app process. With rn-native (AGSL, `Surface.lockHardwareCanvas`) the
  effect itself is drawn by HWUI, so each effect frame shows up twice (its own canvas + the window compositing the TextureView,
  ~2 x 60 per second); with rn-native-compatible-* (own EGL thread `SilkGL`) only the window frames are counted (~60 per second).
  Compare thread CPU (`RenderThread`, `SilkRender` / `SilkGL`) rather than frame counts. `gfxinfo` counts frames drawn, not frames
  displayed: for the displayed frame rate use `perf-android-gpu.py` (SurfaceFlinger `--latency` per layer). The emulator's GPU is the host's (GLES
  translated to Metal); RenderThread / SilkGL CPU includes the guest-side encoding of that pipe, not device GPU work.
- The arm64 AVDs boot from their quick-boot snapshot with `-no-snapshot-save`: installed APKs do not survive a restart (the script
  reinstalls each time).

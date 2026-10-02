# rn-native-compatible-dynamic

Silk as an **app-local Fabric native component** `<SilkView>`: **Metal** on iOS, **OpenGL ES 2.0** (GLSL ES 1.00) on Android, Android 7.1+ (API 25). Same app as [rn-native-compatible-static](../rn-native-compatible-static/README.md), except that **the shader sources live in JS**: the Metal Shading Language and the GLSL are strings in `src/shaders/`, passed to the view as the `source` prop and compiled at runtime. The clock and render loop are native, so no JS runs per frame. Part of [benchmark-shader-solutions](../../README.md); results are in [RESULTS.md](../../RESULTS.md).

| | |
|---|---|
| Metro port | 8097 |
| bundle id / applicationId | `com.effectstudy.nativecompatdyn` (Xcode project: `RnBaseline`) |
| simulator | `es-rn-native-compatible-dynamic` (iPhone 18 Pro, iOS 27.0) |
| Android | AVDs `Pixel_3a_API_34_extension_level_7_arm64-v8a` and `es-api25` (Pixel 3a, Android 7.1); `minSdkVersion = 25`; Kotlin package `com.effectstudy.nativecompatdyn` |
| added | no npm dependency, no pod (native code in the app) |

## Setup and run

Same toolchain and steps as [rn-baseline](../rn-baseline/README.md), with this
app's port, bundle id and simulator:

```sh
npm ci
bundle install && (cd ios && bundle exec pod install)
xcrun simctl create es-rn-native-compatible-dynamic "iPhone 18 Pro" com.apple.CoreSimulator.SimRuntime.iOS-27-0
npm start                             # Metro on 8097 (Debug)
cd ios && xcodebuild -workspace RnBaseline.xcworkspace -scheme RnBaseline \
  -configuration Debug -destination 'platform=iOS Simulator,name=es-rn-native-compatible-dynamic' \
  -derivedDataPath /private/tmp/rn-native-compatible-dynamic-dd build
xcrun simctl install es-rn-native-compatible-dynamic /private/tmp/rn-native-compatible-dynamic-dd/Build/Products/Debug-iphonesimulator/RnBaseline.app
xcrun simctl launch es-rn-native-compatible-dynamic com.effectstudy.nativecompatdyn    # stress: append -jsload 50 -instances 4 -stats 1
```

Release: `-configuration Release -sdk iphonesimulator`. `src/config.ts`
`FROZEN_TIME` freezes the clock; tap the screen to toggle the FPS overlay.

## Android

```sh
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
(cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a)   # or assembleRelease
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8097 tcp:8097
adb shell am start -n com.effectstudy.nativecompatdyn/.MainActivity
```

## Notes

- Shader sources: `src/shaders/silk.ios.ts` (copy of `shaders/silk.metal`) and `src/shaders/silk.android.ts` (copy of `shaders/silk.glsl`); Metro picks one per platform, so each bundle carries only its language (`silk.d.ts` types the import). Backticks in the shader comments became `'`.
- iOS `ios/RnBaseline/SilkView/RCTSilkView.mm`: `newLibraryWithSource:options:completionHandler:` (async, off the main thread) + pipeline, cached per process by source; nothing is drawn until it is ready; errors go to `NSLog`. No `.metal` file in the Xcode project.
- Android `android/app/src/main/java/com/effectstudy/nativecompatdyn/silk/`: same TextureView + own EGL14 ES 2.0 thread as the static app, compiling the `source` prop (a new source rebuilds the program). No `res/raw` resource.
- Editing a shader is a JS change: Fast Refresh in Debug, an OTA bundle update in Release. No native rebuild.
- Logs `[effect] shader setup N ms` natively (iOS: runtime MSL compile + pipeline; Android: `glCompileShader` + `glLinkProgram`). On an iPhone 13, the first launch after install takes 55–59 ms (vs 40–50 ms for the static metallib); later launches hit Metal's compiler cache (3–7 ms). See `metrics/perf-ios-device-startup.py`.
- Codegen spec: `src/specs/SilkViewNativeComponent.ts` (+ `source`) and `codegenConfig` in `package.json`. Props `source`, `paused`, `frozenTime` (-1 = live), `speed`; events `onFirstFrame`, `onFrameStats`.
- Pixel ratio is capped at 2 on both platforms.

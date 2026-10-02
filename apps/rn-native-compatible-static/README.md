# rn-native-compatible-static

Silk as an **app-local Fabric native component** `<SilkView>`: **Metal** on iOS, **OpenGL ES 2.0** (GLSL ES 1.00) on Android. Same app as [rn-native](../rn-native/README.md) except the Android renderer, for a wider floor: Android 7.1 (API 25) instead of 13 for AGSL. **The shaders ship natively** on both platforms (Metal compiled at build time into `default.metallib`, GLSL as an Android raw resource). Twin app: [rn-native-compatible-dynamic](../rn-native-compatible-dynamic/README.md), where the sources come from JS and are compiled at runtime. The clock and render loop are native, so no JS runs per frame. Part of [benchmark-shader-solutions](../../README.md); results are in [RESULTS.md](../../RESULTS.md).

| | |
|---|---|
| Metro port | 8096 |
| bundle id / applicationId | `com.effectstudy.nativecompat` (kept from before the static / dynamic split; Xcode project: `RnBaseline`) |
| simulator | `es-rn-native-compatible-static` (iPhone 18 Pro, iOS 27.0) |
| Android | AVDs `Pixel_3a_API_34_extension_level_7_arm64-v8a` and `es-api25` (Pixel 3a, Android 7.1); `minSdkVersion = 25`; Kotlin package `com.effectstudy.nativecompat` |
| added | no npm dependency, no pod (native code in the app) |

## Setup and run

Same toolchain and steps as [rn-baseline](../rn-baseline/README.md), with this
app's port, bundle id and simulator:

```sh
npm ci
bundle install && (cd ios && bundle exec pod install)
xcrun simctl create es-rn-native-compatible-static "iPhone 18 Pro" com.apple.CoreSimulator.SimRuntime.iOS-27-0
npm start                             # Metro on 8096 (Debug)
cd ios && xcodebuild -workspace RnBaseline.xcworkspace -scheme RnBaseline \
  -configuration Debug -destination 'platform=iOS Simulator,name=es-rn-native-compatible-static' \
  -derivedDataPath /private/tmp/rn-native-compatible-static-dd build
xcrun simctl install es-rn-native-compatible-static /private/tmp/rn-native-compatible-static-dd/Build/Products/Debug-iphonesimulator/RnBaseline.app
xcrun simctl launch es-rn-native-compatible-static com.effectstudy.nativecompat    # stress: append -jsload 50 -instances 4 -stats 1
```

Release: `-configuration Release -sdk iphonesimulator`. `src/config.ts`
`FROZEN_TIME` freezes the clock; tap the screen to toggle the FPS overlay.

## Android

```sh
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
(cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a)   # or assembleRelease
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8096 tcp:8096
adb shell am start -n com.effectstudy.nativecompat/.MainActivity
```

## Notes

- Codegen spec: `src/specs/SilkViewNativeComponent.ts` + `codegenConfig` in `package.json` (same as rn-native).
- Native code: iOS `ios/RnBaseline/SilkView/` (ObjC++ + `silk.metal`, as rn-native plus the shader-setup log); Android `android/app/src/main/java/com/effectstudy/nativecompat/silk/` (Kotlin: TextureView + own EGL14 ES 2.0 context on a render thread) + `res/raw/silk.glsl` (copy of `shaders/silk.glsl`).
- Props `paused`, `frozenTime` (-1 = live), `speed`; events `onFirstFrame`, `onFrameStats` (the overlay's `NAT` line).
- Android uses a `TextureView`, like rn-native, not a `GLSurfaceView`: a SurfaceView ignores RN opacity / transforms and stacked instances have no defined order.
- `highp` when the GPU supports it in fragment shaders, else the source is switched to `mediump` (logcat warning). Rendering pauses while the window is hidden; a lost EGL context is recreated.
- Pixel ratio is capped at 2 on both platforms.
- Editing the shader needs a native rebuild on both platforms (the GLSL is an Android resource here).
- Logs `[effect] shader setup N ms` natively (iOS: `default.metallib` load + pipeline creation; Android: `glCompileShader` + `glLinkProgram`), next to the JS `[effect] first frame N ms after JS start`, to compare with the dynamic app (`metrics/perf-ios-device-startup.py`).

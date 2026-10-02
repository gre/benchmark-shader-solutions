# rn-native

Silk as an **app-local Fabric native component** `<SilkView>`: **Metal** on iOS, **AGSL** (`RuntimeShader`) on Android. The clock and render loop are native, so no JS runs per frame. Part of [benchmark-shader-solutions](../../README.md); results are in
[RESULTS.md](../../RESULTS.md).

| | |
|---|---|
| Metro port | 8094 |
| bundle id | `com.effectstudy.native` |
| simulator | `es-rn-native` (iPhone 18 Pro, iOS 27.0) |
| Android | AVD `Pixel_3a_API_34_extension_level_7_arm64-v8a`; Kotlin package `com.effectstudy.nativeapp` |
| added | no npm dependency, no pod (native code in the app) |

## Setup and run

Same toolchain and steps as [rn-baseline](../rn-baseline/README.md), with this
app's port, bundle id and simulator:

```sh
npm ci
bundle install && (cd ios && bundle exec pod install)
xcrun simctl create es-rn-native "iPhone 18 Pro" com.apple.CoreSimulator.SimRuntime.iOS-27-0
npm start                             # Metro on 8094 (Debug)
cd ios && xcodebuild -workspace RnBaseline.xcworkspace -scheme RnBaseline \
  -configuration Debug -destination 'platform=iOS Simulator,name=es-rn-native' \
  -derivedDataPath /private/tmp/rn-native-dd build
xcrun simctl install es-rn-native /private/tmp/rn-native-dd/Build/Products/Debug-iphonesimulator/RnBaseline.app
xcrun simctl launch es-rn-native com.effectstudy.native    # stress: append -jsload 50 -instances 4 -stats 1
```

Release: `-configuration Release -sdk iphonesimulator`. `src/config.ts`
`FROZEN_TIME` freezes the clock; tap the screen to toggle the FPS overlay.

## Android

```sh
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
(cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a)   # or assembleRelease
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8094 tcp:8094
adb shell am start -n com.effectstudy.native/com.effectstudy.nativeapp.MainActivity
```

## Notes

- Codegen spec: `src/specs/SilkViewNativeComponent.ts` + `codegenConfig` in `package.json`.
- Native code: iOS `ios/RnBaseline/SilkView/` (ObjC++ + `silk.metal`, compiled into `default.metallib`); Android `android/app/src/main/java/com/effectstudy/nativeapp/silk/` (Kotlin, TextureView on its own render thread) + `res/raw/silk.agsl`.
- Props `paused`, `frozenTime` (-1 = live), `speed`; events `onFirstFrame`, `onFrameStats` (the overlay's `NAT` line).
- Pixel ratio is capped at 2 on both platforms. Below Android 13 (no AGSL), the view draws a solid `#1b1a33`.
- `native` is a Java keyword, so the Android namespace is `com.effectstudy.nativeapp`. The iOS 27 SDK removed `addPresentedHandler`, so the native first frame uses the command buffer's completion.
- Editing a shader needs a native rebuild: about 39 s incremental on iOS, 5 s on Android.
- The Metal Toolchain must be installed: `xcodebuild -downloadComponent MetalToolchain`.

# rn-skia

Silk with **@shopify/react-native-skia** (SkSL). The animation runs on the UI thread with Reanimated. Part of [benchmark-shader-solutions](../../README.md); results are in
[RESULTS.md](../../RESULTS.md).

| | |
|---|---|
| Metro port | 8092 |
| bundle id / applicationId | `com.effectstudy.skia` |
| simulator | `es-rn-skia` (iPhone 18 Pro, iOS 27.0) |
| added | `@shopify/react-native-skia` 2.14.0 (+1 pod) |

## Setup and run

Same toolchain and steps as [rn-baseline](../rn-baseline/README.md), with this
app's port, bundle id and simulator:

```sh
npm ci
bundle install && (cd ios && bundle exec pod install)
xcrun simctl create es-rn-skia "iPhone 18 Pro" com.apple.CoreSimulator.SimRuntime.iOS-27-0
npm start                             # Metro on 8092 (Debug)
cd ios && xcodebuild -workspace RnBaseline.xcworkspace -scheme RnBaseline \
  -configuration Debug -destination 'platform=iOS Simulator,name=es-rn-skia' \
  -derivedDataPath /private/tmp/rn-skia-dd build
xcrun simctl install es-rn-skia /private/tmp/rn-skia-dd/Build/Products/Debug-iphonesimulator/RnBaseline.app
xcrun simctl launch es-rn-skia com.effectstudy.skia    # stress: append -jsload 50 -instances 4 -stats 1
```

Release: `-configuration Release -sdk iphonesimulator`. `src/config.ts`
`FROZEN_TIME` freezes the clock; tap the screen to toggle the FPS overlay.

## Android

Same toolchain as [rn-baseline](../rn-baseline/README.md#android) (JDK 17, SDK 37), minSdk 24:

```sh
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a)   # or assembleDebug + npm start
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.effectstudy.skia/.MainActivity
```

Nothing special: RN Skia, Reanimated and Worklets autolink.

## Notes

- Works out of the box on RN 0.87, with no patch.
- `Skia.RuntimeEffect.Make` + `<Canvas><Fill><Shader/></Fill></Canvas>`. Uniforms come from a Reanimated `useDerivedValue`, so no React re-render per frame.
- There is no pixel-ratio cap: it renders at the device scale (3x on the iPhone 18 Pro).
- SkSL errors throw into LogBox with line and caret. Fast Refresh works, but reload after an error.
- RN Skia installs its binaries for 4 platforms (~1.3 GB of `node_modules`).

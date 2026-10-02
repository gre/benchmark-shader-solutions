# rn-webgpu

Silk with **react-native-webgpu** (WGSL, the same shader as `web-webgpu`). The render loop runs on the UI thread through worklets. Part of [benchmark-shader-solutions](../../README.md); results are in
[RESULTS.md](../../RESULTS.md).

| | |
|---|---|
| Metro port | 8093 |
| bundle id / applicationId | `com.effectstudy.webgpu` |
| simulator | `es-rn-webgpu` (iPhone 18 Pro, iOS 27.0) |
| added | `react-native-webgpu` 0.5.17 + the `react-native-wgpu` shim, `patch-package` (+1 pod) |

## Setup and run

Same toolchain and steps as [rn-baseline](../rn-baseline/README.md), with this
app's port, bundle id and simulator:

```sh
npm ci                               # postinstall applies patches/ (patch-package)
bundle install && (cd ios && bundle exec pod install)
xcrun simctl create es-rn-webgpu "iPhone 18 Pro" com.apple.CoreSimulator.SimRuntime.iOS-27-0
npm start                             # Metro on 8093 (Debug)
cd ios && xcodebuild -workspace RnBaseline.xcworkspace -scheme RnBaseline \
  -configuration Debug -destination 'platform=iOS Simulator,name=es-rn-webgpu' \
  -derivedDataPath /private/tmp/rn-webgpu-dd build
xcrun simctl install es-rn-webgpu /private/tmp/rn-webgpu-dd/Build/Products/Debug-iphonesimulator/RnBaseline.app
xcrun simctl launch es-rn-webgpu com.effectstudy.webgpu    # stress: append -jsload 50 -instances 4 -stats 1
```

Release: `-configuration Release -sdk iphonesimulator`. `src/config.ts`
`FROZEN_TIME` freezes the clock; tap the screen to toggle the FPS overlay.

## Android

Same toolchain as [rn-baseline](../rn-baseline/README.md#android) (JDK 17, SDK 37), minSdk 26:

```sh
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a)   # or assembleDebug + npm start
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.effectstudy.webgpu/.MainActivity
```

`minSdkVersion = 26` (Dawn needs the `AHardwareBuffer` APIs). The patch only touches iOS (`apple/`); the shim + direct-dep setup autolinks as is. Dawn uses Vulkan: it runs on a real device (Galaxy S21 Ultra), while the arm64 emulator aborted inside Dawn.

## Notes

- **Two workarounds on RN 0.87:**
-   - `ios/Podfile` `post_install` disables the header map of the `react-native-webgpu` target. Otherwise its `ArrayBuffer.h` resolves to RN's.
-   - `patches/react-native-webgpu+0.5.17.patch` backports an upstream fix for a Fabric `_props` assert that crashes Debug builds.
- Both `react-native-wgpu` (a deprecated re-export) and `react-native-webgpu` are direct deps: autolinking only sees direct dependencies.
- The 0.5.17 API differs from the current docs: `useCanvasRef`, `useDevice`, `transparent`.
- Pixel ratio is capped at 2. WGSL errors (`getCompilationInfo`) are shown in the app.

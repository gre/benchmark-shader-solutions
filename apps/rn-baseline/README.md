# rn-baseline

Reference React Native app (bare RN 0.87.1, New Architecture, no Expo): the
shared shell (clock, FPS overlay, stress mode) with a solid `#1b1a33`
background and no graphics library. Every RN tech app is a copy of it where
only `src/Effect.tsx` changes. Part of
[benchmark-shader-solutions](../../README.md); results are in
[RESULTS.md](../../RESULTS.md).

| | |
|---|---|
| Metro port | 8090 |
| bundle id / applicationId | `com.effectstudy.baseline` (Xcode project: `RnBaseline`) |
| simulator | `es-rn-baseline` (iPhone 18 Pro, iOS 27.0) |

## Setup

Requires Xcode 27, Node 24.7.0 (`.nvmrc`), rbenv Ruby 3.3.5 + bundler.

```sh
npm ci
bundle install                        # CocoaPods 1.15.2 from Gemfile.lock
(cd ios && bundle exec pod install)
xcrun simctl create es-rn-baseline "iPhone 18 Pro" com.apple.CoreSimulator.SimRuntime.iOS-27-0
xcrun simctl boot es-rn-baseline
```

## iOS

```sh
# Debug (JS from Metro)
npm start                             # Metro on 8090
cd ios && xcodebuild -workspace RnBaseline.xcworkspace -scheme RnBaseline \
  -configuration Debug -destination 'platform=iOS Simulator,name=es-rn-baseline' \
  -derivedDataPath /private/tmp/rnb-dd build
xcrun simctl install es-rn-baseline /private/tmp/rnb-dd/Build/Products/Debug-iphonesimulator/RnBaseline.app
xcrun simctl launch es-rn-baseline com.effectstudy.baseline

# Release (Hermes bundle embedded, no Metro): same with
#   -configuration Release -sdk iphonesimulator, then Release-iphonesimulator/
```

In Xcode 27, the simulator UI is `Xcode.app/Contents/Applications/DeviceHub.app`.

## Android

Requires JDK 17 and Android SDK 37 (`platforms;android-37.0`, `build-tools;37.0.0`).

```sh
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
npm start                                          # Metro on 8090
(cd android && ./gradlew assembleDebug)            # or assembleRelease
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8090 tcp:8090
adb shell am start -n com.effectstudy.baseline/.MainActivity
```

## Options

- `src/config.ts`: `FROZEN_TIME` (seconds, or `null` for live) and
  `FPS_OVERLAY_AT_START`. Tapping the screen toggles the FPS overlay.
- Stress mode (iOS, read at runtime, no rebuild needed):
  `xcrun simctl launch <sim> <bundle id> -jsload 50 -instances 4 -stats 1`
  - `jsload` busy-loops the JS thread every 100 ms.
  - `instances` stacks N effects.
  - `stats 1` logs `[stats] effect_fps=… effect_p95=… js_fps=… ui_fps=…` every 2 s.

## Notes

- **iOS 27 requires the UIScene life cycle**: the RN 0.87 template crashes
  at launch without it. `Info.plist` declares a scene manifest and
  `AppDelegate.swift` holds a `SceneDelegate`.
- **Metro port**: RN 0.87 links a prebuilt core compiled for 8081. The port
  goes through the `RCT_METRO_PORT` build setting → `RCTMetroPort` in
  `Info.plist` → `jsLocation` in `AppDelegate`. On Android:
  `reactNativeDevServerPort` in `gradle.properties` + `adb reverse`.
- **Making a tech app**: copy the folder without `node_modules`, `vendor`,
  `ios/Pods` and build dirs. Then change the package name, the script ports,
  `PRODUCT_BUNDLE_IDENTIFIER` and `RCT_METRO_PORT` (Debug + Release in the
  pbxproj), and on Android `applicationId`/`namespace`, the Kotlin package and
  the dev server port. Finally replace `src/Effect.tsx`.

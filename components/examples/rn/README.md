# examples/rn

Bare React Native 0.87.1 app (iOS + Android) that uses the 6
`@shader-bench/*` packages **in one app** (via `file:` links), with a tech
picker, a shader picker, sliders generated from the shader's params, and
"restart (t = 0)". Part of [components/](../../README.md).

| | |
|---|---|
| base | copy of `apps/rn-baseline` (same iOS 27 / Metro-port fixes, Android) |
| Metro port | 8095 |
| bundle id / applicationId | `com.effectstudy.components` (Xcode project: `RnBaseline`) |
| simulator | `es-components` (iPhone 18 Pro, iOS 27.0) |

## Run

```sh
npm ci                                  # postinstall applies the webgpu + expo patches
bundle install && (cd ios && bundle exec pod install)
npm start                               # Metro on 8095

# iOS
xcrun simctl create es-components "iPhone 18 Pro" com.apple.CoreSimulator.SimRuntime.iOS-27-0
cd ios && xcodebuild -workspace RnBaseline.xcworkspace -scheme RnBaseline -configuration Debug \
  -destination 'platform=iOS Simulator,name=es-components' -derivedDataPath /private/tmp/es-comp-dd build
xcrun simctl install es-components /private/tmp/es-comp-dd/Build/Products/Debug-iphonesimulator/RnBaseline.app
xcrun simctl launch es-components com.effectstudy.components -tech skia -ui 0 -speed 0

# Android (JDK 17, SDK 37)
(cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8095 tcp:8095
adb shell am start -n com.effectstudy.components/.MainActivity
```

iOS launch options: `-tech native|native-compatible-static|native-compatible-dynamic|skia|webgpu|gl-react`, `-shader`, `-ui 0`,
and any param (`-speed`, `-amp`, `-glow`, `-hue`).

## What the packages required here

- **native**, **native-compatible-static**, **native-compatible-dynamic:**
  nothing (autolinking). The three are linked side by side (distinct pod,
  component, ObjC class and Android module names).
- **skia:** RN Skia, Reanimated, Worklets, and the worklets Babel plugin.
- **webgpu:** react-native-webgpu, plus the package's patch (`postinstall`),
  its Podfile helper and Android `minSdkVersion = 26`.
- **gl-react:** gl-react-expo, expo-gl and **Expo modules**, set up as
  described in [gl-react's README](../../gl-react/README.md). Expo is
  iOS-only here: on Android its Gradle plugins fail, so gl-react is hidden
  there.

## Notes

- **Linked packages:**
  - `metro.config.js` sets `watchFolders` (the packages' real directories)
    and `resolver.nodeModulesPaths` (this app's `node_modules`), so there is
    a single copy of React and React Native;
  - `tsconfig.json` sets `preserveSymlinks`.
- **On the iOS simulator**, gl-react's first frame takes about 30 s (OpenGL
  ES runs in software). On the Android emulator, webgpu aborts inside Dawn.
- **After an Android build**, delete the `android/build` and
  `android/.cxx` folders inside `node_modules` (about 3 GB).

# rn-gl-react

Silk with **gl-react** + **gl-react-expo** / **expo-gl** (GLSL). The animation is a React re-render per frame on the JS thread. Part of [benchmark-shader-solutions](../../README.md); results are in
[RESULTS.md](../../RESULTS.md).

| | |
|---|---|
| Metro port | 8091 |
| bundle id / applicationId | `com.effectstudy.glreact` |
| simulator | `es-rn-gl-react` (iPhone 18 Pro, iOS 27.0) |
| added | gl-react 6.0.0, gl-react-expo 6.0.0, Expo SDK 57 modules (`expo-gl` 57.0.2), +13 pods |

## Setup and run

Same toolchain and steps as [rn-baseline](../rn-baseline/README.md), with this
app's port, bundle id and simulator:

```sh
npm ci                               # postinstall applies patches/ (patch-package)
bundle install && (cd ios && bundle exec pod install)
xcrun simctl create es-rn-gl-react "iPhone 18 Pro" com.apple.CoreSimulator.SimRuntime.iOS-27-0
npm start                             # Metro on 8091 (Debug)
cd ios && xcodebuild -workspace RnBaseline.xcworkspace -scheme RnBaseline \
  -configuration Debug -destination 'platform=iOS Simulator,name=es-rn-gl-react' \
  -derivedDataPath /private/tmp/rn-gl-react-dd build
xcrun simctl install es-rn-gl-react /private/tmp/rn-gl-react-dd/Build/Products/Debug-iphonesimulator/RnBaseline.app
xcrun simctl launch es-rn-gl-react com.effectstudy.glreact    # stress: append -jsload 50 -instances 4 -stats 1
```

Release: `-configuration Release -sdk iphonesimulator`. `src/config.ts`
`FROZEN_TIME` freezes the clock; tap the screen to toggle the FPS overlay.

## Android

Same toolchain as [rn-baseline](../rn-baseline/README.md#android) (JDK 17, SDK 37), minSdk 24:

```sh
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a)   # or assembleDebug + npm start
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.effectstudy.glreact/.MainActivity
```

Expo SDK 57 on RN 0.87's Android toolchain (AGP 9.2.1, Gradle 9.4.1 / Kotlin 2.3) needs:

- `settings.gradle`: Expo's settings plugin (`expo-autolinking-settings`, `useExpoModules()`), and `expo-root-project` in `build.gradle`, as in Expo's bare template; `MainApplication` uses `ExpoReactHostFactory` (+ `ApplicationLifecycleDispatcher`), `MainActivity` wraps its delegate in `ReactActivityDelegateWrapper`. Bundling stays on the RN CLI (`index.js`).
- `patches/expo-modules-autolinking+57.0.13.patch` and `patches/expo-modules-core+57.0.20.patch`: Expo's two Gradle plugins are compiled with Kotlin 2.1.20, which can't read Gradle 9.4's Kotlin 2.3 stdlib ("incompatible version of Kotlin"): bumped to 2.2.0. The second also drops `targetSdk` / `lintOptions` from library configs (removed in AGP 9).
- `build.gradle`: `buildFeatures.buildConfig true` for every library (expo-log-box declares BuildConfig fields; off by default in AGP 9).
- `gradle.properties`: `android.sourceset.disallowProvider=false` (Expo autolinking adds its generated sources through a Provider, which AGP 9 refuses by default).

## Notes

- **Expo modules on bare RN 0.87:** no Expo SDK supports 0.87 yet, so SDK 57 was forced. The steps:
-   - install it with `npx install-expo-modules@0.18.1 -s 57.0.0`, then revert its Babel, Metro and bundle-phase changes;
-   - `patches/expo+57.0.26.patch` (back-port of SDK 58's root view factory);
-   - `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES` for the Expo pods in the Podfile;
-   - npm `overrides`, plus `@react-native/assets-registry` as a direct dep.
- **On the iOS simulator, OpenGL ES is a CPU software renderer:** about 1 frame every 33 s. Use a device for anything but frozen screenshots.
- gl-shader blocks the JS thread on the GL thread every frame (`getProgramParameter`).
- There is no pixel-ratio cap, and 4x MSAA is always on.
- The problems met here are tracked upstream to improve gl-react: [gre/gl-react#540](https://github.com/gre/gl-react/issues/540).

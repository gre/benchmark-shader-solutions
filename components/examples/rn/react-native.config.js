// Android: Expo SDK 57's Gradle plugins do not build with this app's Gradle
// 9.4.1 / Kotlin 2.3 toolchain (RN 0.87), so Expo modules are iOS-only here.
// Keep the RN CLI from autolinking the `expo` package on Android; expo-gl is
// an Expo module and is not linked either, so the gl-react tech is hidden on
// Android (src/techs.ts). See README.
module.exports = {
  dependencies: {
    expo: { platforms: { android: null } },
  },
};

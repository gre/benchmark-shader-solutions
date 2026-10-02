module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Reanimated 4 / Worklets (used by @shader-bench/skia): the worklets plugin
  // must be listed LAST.
  plugins: ['react-native-worklets/plugin'],
};

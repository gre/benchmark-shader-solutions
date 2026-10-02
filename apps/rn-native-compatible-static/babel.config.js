module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Reanimated 4 / Worklets: the worklets plugin must be listed LAST.
  plugins: ['react-native-worklets/plugin'],
};

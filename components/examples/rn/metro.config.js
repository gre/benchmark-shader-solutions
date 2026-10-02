const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * The @shader-bench/* packages are `file:` deps = symlinks in node_modules
 * to ../../<pkg>, consumed as TypeScript source (package.json `exports`
 * "react-native" condition -> src/Effect.native.tsx). Metro follows the
 * symlinks to the real path, so:
 *  - watchFolders: each linked package's real directory must be watched;
 *  - nodeModulesPaths: bare imports from the package sources (react,
 *    react-native, peer libs) are resolved from THIS app's node_modules
 *    (the packages have no node_modules of their own) -> a single copy.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const linked = Object.entries(require('./package.json').dependencies)
  .filter(([, v]) => v.startsWith('file:'))
  .map(([, v]) => path.resolve(__dirname, v.slice('file:'.length)));

const config = {
  watchFolders: linked,
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

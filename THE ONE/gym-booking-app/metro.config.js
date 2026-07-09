const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude intermediate android/build and ios/build folders from file watcher to prevent watch crashes (like ENOENT)
config.resolver.blockList = [
  /node_modules\/.*\/android\/build\/.*/,
  /node_modules\/.*\/ios\/build\/.*/,
  /android\/app\/build\/.*/,
  /android\/build\/.*/,
];

module.exports = config;

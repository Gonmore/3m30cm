const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const mobileRoot = path.resolve(projectRoot, "../mobile");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot, mobileRoot])];
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  "@mobile": mobileRoot,
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-dom": path.resolve(projectRoot, "node_modules/react-dom"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
  expo: path.resolve(projectRoot, "node_modules/expo"),
  "expo-router": path.resolve(projectRoot, "node_modules/expo-router"),
  "expo-secure-store": path.resolve(projectRoot, "node_modules/expo-secure-store"),
  "expo-status-bar": path.resolve(projectRoot, "node_modules/expo-status-bar"),
  "expo-linking": path.resolve(projectRoot, "node_modules/expo-linking"),
  "expo-navigation-bar": path.resolve(projectRoot, "node_modules/expo-navigation-bar"),
  "expo-av": path.resolve(projectRoot, "node_modules/expo-av"),
  "expo-camera": path.resolve(projectRoot, "node_modules/expo-camera"),
  "expo-file-system": path.resolve(projectRoot, "node_modules/expo-file-system"),
  "expo-image": path.resolve(projectRoot, "node_modules/expo-image"),
  "expo-notifications": path.resolve(projectRoot, "node_modules/expo-notifications"),
  "react-native-safe-area-context": path.resolve(projectRoot, "node_modules/react-native-safe-area-context"),
  "react-native-screens": path.resolve(projectRoot, "node_modules/react-native-screens"),
  "@react-native-masked-view/masked-view": path.resolve(projectRoot, "node_modules/@react-native-masked-view/masked-view"),
  // Force all @react-native/* to resolve from workspace root to avoid nested-node_modules Metro issues
  "@react-native/virtualized-lists": path.resolve(workspaceRoot, "node_modules/@react-native/virtualized-lists"),
  "@react-native/assets-registry": path.resolve(workspaceRoot, "node_modules/@react-native/assets-registry"),
  "@react-native/normalize-colors": path.resolve(workspaceRoot, "node_modules/@react-native/normalize-colors"),
  "@react-native/js-polyfills": path.resolve(workspaceRoot, "node_modules/@react-native/js-polyfills"),
};

module.exports = config;

const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const mobileRoot = path.resolve(projectRoot, "../mobile");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot, mobileRoot])];
config.resolver.nodeModulesPaths = [
  path.resolve(workspaceRoot, "node_modules"),
  path.resolve(projectRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  "@mobile": mobileRoot,
  react: path.resolve(workspaceRoot, "node_modules/react"),
  "react-dom": path.resolve(workspaceRoot, "node_modules/react-dom"),
  "react-native": path.resolve(workspaceRoot, "node_modules/react-native"),
  // Force all @react-native/* to resolve from workspace root to avoid nested-node_modules Metro issues
  "@react-native/virtualized-lists": path.resolve(workspaceRoot, "node_modules/@react-native/virtualized-lists"),
  "@react-native/assets-registry": path.resolve(workspaceRoot, "node_modules/@react-native/assets-registry"),
  "@react-native/normalize-colors": path.resolve(workspaceRoot, "node_modules/@react-native/normalize-colors"),
  "@react-native/js-polyfills": path.resolve(workspaceRoot, "node_modules/@react-native/js-polyfills"),
};

module.exports = config;

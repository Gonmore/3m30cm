const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
// Share the sibling mobile app's components and app folder
const mobileRoot = path.resolve(projectRoot, "../mobile");

const config = getDefaultConfig(projectRoot);

// CRITICAL FIX: @expo/metro-config uses resolve_from(projectRoot, ...) to find
// pre-modules (InitializeCore, expo/winter, @expo/metro-runtime). Because mobile2
// has its own node_modules/, it finds different module instances than what the
// bundle actually uses (which are remapped via extraNodeModules below).
// This module identity mismatch causes FormData to never be properly initialized.
// We override getModulesRunBeforeMainModule to use the EXACT same paths as mobile.
config.serializer.getModulesRunBeforeMainModule = () => [
  require.resolve(path.join(mobileRoot, "node_modules/react-native/Libraries/Core/InitializeCore")),
  path.resolve(workspaceRoot, "node_modules/expo/src/winter/index.ts"),
  path.resolve(mobileRoot, "node_modules/@expo/metro-runtime/src/index.ts"),
];

config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot, mobileRoot])];
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [
  path.resolve(mobileRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
  // mobile2's own node_modules last — only for build tools (babel), never runtime packages
  path.resolve(projectRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  // expo itself lives only in workspace root (was hoisted by npm workspaces)
  expo: path.resolve(workspaceRoot, "node_modules/expo"),
  "whatwg-fetch": path.resolve(workspaceRoot, "node_modules/whatwg-fetch"),
  // These live in mobile's own node_modules
  react: path.resolve(mobileRoot, "node_modules/react"),
  "react-dom": path.resolve(mobileRoot, "node_modules/react-dom"),
  "react-native": path.resolve(mobileRoot, "node_modules/react-native"),
  "expo-router": path.resolve(mobileRoot, "node_modules/expo-router"),
  "expo-constants": path.resolve(mobileRoot, "node_modules/expo-constants"),
  "expo-linking": path.resolve(mobileRoot, "node_modules/expo-linking"),
  "@expo/metro-runtime": path.resolve(mobileRoot, "node_modules/@expo/metro-runtime"),
  // These were hoisted to workspace root
  "expo-modules-core": path.resolve(workspaceRoot, "node_modules/expo-modules-core"),
  "expo-av": path.resolve(workspaceRoot, "node_modules/expo-av"),
  "expo-status-bar": path.resolve(workspaceRoot, "node_modules/expo-status-bar"),
  "react-native-safe-area-context": path.resolve(workspaceRoot, "node_modules/react-native-safe-area-context"),
  "react-native-screens": path.resolve(workspaceRoot, "node_modules/react-native-screens"),
  "@react-native-masked-view/masked-view": path.resolve(workspaceRoot, "node_modules/@react-native-masked-view/masked-view"),
  // Force ALL @react-native/* scoped packages to mobile's copy to prevent polyfill duplication
  "@react-native/assets-registry": path.resolve(mobileRoot, "node_modules/@react-native/assets-registry"),
  "@react-native/codegen": path.resolve(mobileRoot, "node_modules/@react-native/codegen"),
  "@react-native/community-cli-plugin": path.resolve(mobileRoot, "node_modules/@react-native/community-cli-plugin"),
  "@react-native/debugger-frontend": path.resolve(mobileRoot, "node_modules/@react-native/debugger-frontend"),
  "@react-native/dev-middleware": path.resolve(mobileRoot, "node_modules/@react-native/dev-middleware"),
  "@react-native/gradle-plugin": path.resolve(mobileRoot, "node_modules/@react-native/gradle-plugin"),
  "@react-native/js-polyfills": path.resolve(mobileRoot, "node_modules/@react-native/js-polyfills"),
  "@react-native/normalize-colors": path.resolve(mobileRoot, "node_modules/@react-native/normalize-colors"),
};

// Alias: import from "@mobile/..." resolves to apps/mobile/...
config.resolver.extraNodeModules["@mobile"] = mobileRoot;

module.exports = config;

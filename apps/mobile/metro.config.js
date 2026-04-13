const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
	expo: path.resolve(workspaceRoot, "node_modules/expo"),
	"whatwg-fetch": path.resolve(workspaceRoot, "node_modules/whatwg-fetch"),
	react: path.resolve(projectRoot, "node_modules/react"),
	"react-dom": path.resolve(projectRoot, "node_modules/react-dom"),
	"react-native": path.resolve(projectRoot, "node_modules/react-native"),
	"expo-router": path.resolve(projectRoot, "node_modules/expo-router"),
	"expo-constants": path.resolve(projectRoot, "node_modules/expo-constants"),
	"expo-linking": path.resolve(projectRoot, "node_modules/expo-linking"),
	"@expo/metro-runtime": path.resolve(projectRoot, "node_modules/@expo/metro-runtime"),
	"react-native-safe-area-context": path.resolve(projectRoot, "node_modules/react-native-safe-area-context"),
	"react-native-screens": path.resolve(projectRoot, "node_modules/react-native-screens"),
	"@react-native-masked-view/masked-view": path.resolve(projectRoot, "node_modules/@react-native-masked-view/masked-view"),
};

module.exports = config;
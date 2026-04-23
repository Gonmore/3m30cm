const fs = require("node:fs");
const path = require("node:path");

const appJson = require("./app.json");

function optionalRequire(moduleName) {
  try {
    return require(moduleName);
  } catch {
    return null;
  }
}

function loadEnvFile(filePath, dotenv, dotenvExpand) {
  if (!dotenv?.config || !fs.existsSync(filePath)) {
    return;
  }

  const result = dotenv.config({ path: filePath, override: true });
  dotenvExpand?.expand?.(result);
}

function getEnvValue(publicKey, fallbackKey) {
  return process.env[publicKey] ?? process.env[fallbackKey] ?? "";
}

function getConfiguredValue(publicKey, fallbackKey, fallbackValue) {
  if (Object.prototype.hasOwnProperty.call(process.env, publicKey)) {
    return process.env[publicKey] ?? "";
  }

  if (Object.prototype.hasOwnProperty.call(process.env, fallbackKey)) {
    return process.env[fallbackKey] ?? "";
  }

  return fallbackValue ?? "";
}

const dotenv = optionalRequire("dotenv");
const dotenvExpand = optionalRequire("dotenv-expand");
const workspaceRoot = path.resolve(__dirname, "../..");
const expoConfig = appJson.expo ?? {};
const expoExtra = expoConfig.extra ?? {};

loadEnvFile(path.join(workspaceRoot, ".env"), dotenv, dotenvExpand);
loadEnvFile(path.join(workspaceRoot, ".env.local"), dotenv, dotenvExpand);
loadEnvFile(path.join(__dirname, ".env"), dotenv, dotenvExpand);
loadEnvFile(path.join(__dirname, ".env.local"), dotenv, dotenvExpand);

module.exports = {
  ...expoConfig,
  extra: {
    ...expoExtra,
    apiBaseUrl: getConfiguredValue("EXPO_PUBLIC_API_BASE_URL", "API_BASE_URL", expoExtra.apiBaseUrl),
    googleClientIds: {
      web: getConfiguredValue("EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB", "GOOGLE_CLIENT_ID_WEB", expoExtra.googleClientIds?.web),
      ios: getConfiguredValue("EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS", "GOOGLE_CLIENT_ID_IOS", expoExtra.googleClientIds?.ios),
      android: getConfiguredValue("EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID", "GOOGLE_CLIENT_ID_ANDROID", expoExtra.googleClientIds?.android),
    },
  },
};
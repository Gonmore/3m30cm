import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "../..");
const androidDir = path.join(projectRoot, "android");
const localPropertiesPath = path.join(androidDir, "local.properties");
const expoCliPath = path.resolve(projectRoot, "../../node_modules/expo/bin/cli");
const shortPathEnvKey = "JUMP_ANDROID_SHORTPATH_ACTIVE";
const shortPathAliasDir = path.join(path.parse(workspaceRoot).root, "_j", "jump30cm-build");
const require = createRequire(import.meta.url);

function optionalRequire(moduleName) {
  try {
    return require(moduleName);
  } catch {
    return null;
  }
}

function loadEnvFile(filePath, dotenv, dotenvExpand) {
  if (!dotenv?.config || !existsSync(filePath)) {
    return;
  }

  const result = dotenv.config({ path: filePath, override: true });
  dotenvExpand?.expand?.(result);
}

const dotenv = optionalRequire("dotenv");
const dotenvExpand = optionalRequire("dotenv-expand");

loadEnvFile(path.join(workspaceRoot, ".env"), dotenv, dotenvExpand);
loadEnvFile(path.join(workspaceRoot, ".env.local"), dotenv, dotenvExpand);
loadEnvFile(path.join(projectRoot, ".env"), dotenv, dotenvExpand);
loadEnvFile(path.join(projectRoot, ".env.local"), dotenv, dotenvExpand);

const candidateJavaHomes = [
  process.env.JAVA_HOME,
  "C:/Program Files/Android/Android Studio/jbr",
  "C:/Users/arman/.vscode/extensions/redhat.java-1.54.0-win32-x64/jre/21.0.10-win32-x86_64",
  "C:/Users/arman/OneDrive/OpenBootcamp/Utilitarios/jdk-19.0.2",
].filter(Boolean);

const candidateAndroidSdkPaths = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}/Android/Sdk` : undefined,
  process.env.APPDATA ? `${process.env.APPDATA}/Android/Sdk` : undefined,
  "C:/Users/arman/AppData/Local/Android/Sdk",
  "C:/Android/Sdk",
].filter(Boolean);

function isUsableJavaHome(javaHome) {
  return existsSync(path.join(javaHome, "bin", "java.exe"))
    && existsSync(path.join(javaHome, "bin", "javac.exe"))
    && existsSync(path.join(javaHome, "bin", "jlink.exe"));
}

function isUsableAndroidSdk(sdkPath) {
  return existsSync(path.join(sdkPath, "platform-tools"))
    && (existsSync(path.join(sdkPath, "platforms")) || existsSync(path.join(sdkPath, "build-tools")));
}

const javaHome = candidateJavaHomes.find(isUsableJavaHome);
const androidSdkPath = candidateAndroidSdkPaths.find(isUsableAndroidSdk);
const normalizedAndroidSdkPath = androidSdkPath?.replace(/\\/g, "/") ?? null;

if (!javaHome) {
  console.error("No se encontro un JDK util para Android. Configura JAVA_HOME o instala un JDK con java.exe, javac.exe y jlink.exe.");
  process.exit(1);
}

if (!androidSdkPath) {
  console.error("No se encontro un Android SDK util. Instala Android SDK Platform + Build-Tools + Platform-Tools y vuelve a correr el build.");
  console.error("Ubicaciones probadas:");
  for (const sdkPath of candidateAndroidSdkPaths) {
    console.error(`- ${sdkPath}`);
  }
  process.exit(1);
}

const gradleCommand = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: normalizedAndroidSdkPath,
  ANDROID_SDK_ROOT: normalizedAndroidSdkPath,
  EXPO_NO_METRO_WORKSPACE_ROOT: "1",
  PATH: `${path.join(javaHome, "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
};

function rerunFromShortWorkspacePath() {
  if (process.platform !== "win32" || env[shortPathEnvKey] === "1" || workspaceRoot.length <= 40) {
    return false;
  }

  const shortPathAliasParent = path.dirname(shortPathAliasDir);

  try {
    mkdirSync(shortPathAliasParent, { recursive: true });

    if (existsSync(shortPathAliasDir)) {
      rmSync(shortPathAliasDir, { recursive: true, force: true });
    }

    symlinkSync(workspaceRoot, shortPathAliasDir, "junction");
  } catch (error) {
    console.warn(`No se pudo crear la ruta corta local ${shortPathAliasDir}; sigo con la ruta larga.`);
    if (error instanceof Error) {
      console.warn(error.message);
    }
    return false;
  }

  const relativeProjectPath = path.relative(workspaceRoot, projectRoot);
  const shortProjectRoot = path.join(shortPathAliasDir, relativeProjectPath);
  const shortScriptPath = path.join(shortProjectRoot, "scripts", "build-android-apk.mjs");

  const rerunResult = spawnSync(process.execPath, [shortScriptPath], {
    cwd: shortProjectRoot,
    env: {
      ...env,
      [shortPathEnvKey]: "1",
    },
    stdio: "inherit",
    shell: false,
  });

  rmSync(shortPathAliasDir, { recursive: true, force: true });

  process.exit(typeof rerunResult.status === "number" ? rerunResult.status : 1);
}

rerunFromShortWorkspacePath();

const projectLockFiles = [
  path.join(androidDir, ".gradle", "noVersion", "buildLogic.lock"),
  path.join(androidDir, ".gradle", "buildOutputCleanup", "buildOutputCleanup.lock"),
];

function runGradle(args, options = {}) {
  return spawnSync(gradleCommand, args, {
    cwd: androidDir,
    env,
    stdio: options.stdio ?? "inherit",
    shell: process.platform === "win32",
  });
}

function runNodeProcess(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd ?? projectRoot,
    env,
    stdio: options.stdio ?? "inherit",
    shell: false,
  });
}

function stopProjectGradleJavaProcesses() {
  if (process.platform !== "win32") {
    return;
  }

  const powershellScript = [
    "$projectPattern = [regex]::Escape($args[0])",
    "Get-CimInstance Win32_Process -Filter \"Name = 'java.exe'\" | Where-Object { $_.CommandLine -match 'GradleDaemon|org\\.gradle' -and $_.CommandLine -match $projectPattern } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join("; ");

  spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `${powershellScript};`, projectRoot],
    { stdio: "inherit", env, shell: false },
  );
}

console.log(`Usando JAVA_HOME=${javaHome}`);
console.log(`Usando ANDROID SDK=${androidSdkPath}`);

console.log("Ejecutando Expo prebuild para Android...");
const prebuildResult = runNodeProcess([
  expoCliPath,
  "prebuild",
  "--platform",
  "android",
  "--clean",
  "--no-install",
]);

if (typeof prebuildResult.status === "number" && prebuildResult.status !== 0) {
  process.exit(prebuildResult.status);
}

writeFileSync(localPropertiesPath, `sdk.dir=${normalizedAndroidSdkPath}\n`, "utf8");

console.log("Deteniendo daemons previos de Gradle...");
runGradle(["--stop"], { stdio: "inherit" });
stopProjectGradleJavaProcesses();

for (const lockFile of projectLockFiles) {
  if (existsSync(lockFile)) {
    try {
      rmSync(lockFile, { force: true });
    } catch {
      // If another process still has the lock open, Gradle will surface the next actionable error.
    }
  }
}

const result = runGradle(["assembleRelease", "--no-daemon"]);

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
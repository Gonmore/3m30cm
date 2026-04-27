/**
 * Genera un APK de desarrollo (debug) con expo-dev-client incorporado.
 * Este APK se instala UNA VEZ en el dispositivo y luego se usa con
 * `npm run prod:mobile2` (o dev:mobile2) para tener hot reload con todos
 * los modulos nativos activos (igual que el APK release).
 *
 * Uso:
 *   npm --prefix apps/mobile2 run devbuild:android
 *   (o desde la raiz: npm run devbuild:mobile2)
 *
 * El APK resultante se encuentra en:
 *   apps/mobile2/android/app/build/outputs/apk/debug/app-debug.apk
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  console.error("No se encontro un Android SDK util.");
  process.exit(1);
}

const gradleCommand = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const requiredJvmFlags = "-Xmx3072m -XX:MaxMetaspaceSize=1024m";

function appendJvmFlags(existingValue) {
  const trimmed = existingValue?.trim();
  if (!trimmed) return requiredJvmFlags;
  if (trimmed.includes("-Xmx3072m") && trimmed.includes("-XX:MaxMetaspaceSize=1024m")) return trimmed;
  return `${trimmed} ${requiredJvmFlags}`;
}

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: normalizedAndroidSdkPath,
  ANDROID_SDK_ROOT: normalizedAndroidSdkPath,
  EXPO_NO_METRO_WORKSPACE_ROOT: "1",
  GRADLE_OPTS: appendJvmFlags(process.env.GRADLE_OPTS),
  JAVA_TOOL_OPTIONS: appendJvmFlags(process.env.JAVA_TOOL_OPTIONS),
  PATH: `${path.join(javaHome, "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
};

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

function enforceGradleProperties() {
  const gradlePropertiesPath = path.join(androidDir, "gradle.properties");
  if (!existsSync(gradlePropertiesPath)) return;

  const requiredProperties = new Map([
    ["org.gradle.jvmargs", requiredJvmFlags],
    ["org.gradle.parallel", "false"],
    ["org.gradle.workers.max", "1"],
    ["kotlin.compiler.execution.strategy", "in-process"],
    ["org.gradle.daemon.performance.disable-logging", "true"],
  ]);

  const original = readFileSync(gradlePropertiesPath, "utf8");
  const lines = original.split(/\r?\n/);
  const updatedLines = lines.map((line) => {
    const match = line.match(/^\s*([^#=\s]+)\s*=.*$/);
    if (!match) return line;
    const key = match[1];
    if (!requiredProperties.has(key)) return line;
    const value = requiredProperties.get(key);
    requiredProperties.delete(key);
    return `${key}=${value}`;
  });

  for (const [key, value] of requiredProperties) {
    updatedLines.push(`${key}=${value}`);
  }

  writeFileSync(gradlePropertiesPath, `${updatedLines.join("\n").replace(/\n+$/u, "")}\n`, "utf8");
}

function stopProjectGradleJavaProcesses() {
  if (process.platform !== "win32") return;

  const powershellScript = [
    `$projectPattern = [regex]::Escape(${JSON.stringify(projectRoot)})`,
    "Get-CimInstance Win32_Process -Filter \"Name = 'java.exe'\" | Where-Object { $_.CommandLine -match 'GradleDaemon|org\\.gradle|kotlin\\.daemon|KotlinCompileDaemon' -and $_.CommandLine -match $projectPattern } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join("; ");

  spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `${powershellScript};`],
    { stdio: "inherit", env, shell: false },
  );
}

function removeDirectoryIfPresent(targetDir) {
  if (!existsSync(targetDir)) return;
  rmSync(targetDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

function cleanAndroidLibraryBuildDirs() {
  const candidateDirs = [
    path.join(workspaceRoot, "node_modules", "expo-modules-core", "android", "build"),
    path.join(workspaceRoot, "node_modules", "expo", "android", "build"),
    path.join(workspaceRoot, "node_modules", "expo-constants", "android", "build"),
  ];

  for (const targetDir of candidateDirs) {
    try {
      removeDirectoryIfPresent(targetDir);
    } catch (error) {
      console.warn(`No se pudo limpiar ${targetDir}.`);
      if (error instanceof Error) console.warn(error.message);
    }
  }
}

function runExpoPrebuildWithRetry() {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    console.log(`Deteniendo procesos Java/Gradle previos del proyecto...`);
    stopProjectGradleJavaProcesses();

    console.log(`Ejecutando Expo prebuild para Android... (intento ${attempt}/2)`);
    const prebuildResult = runNodeProcess([
      expoCliPath,
      "prebuild",
      "--platform",
      "android",
      "--clean",
      "--no-install",
    ]);

    if (typeof prebuildResult.status === "number" && prebuildResult.status === 0) return;
    if (attempt === 2) process.exit(typeof prebuildResult.status === "number" ? prebuildResult.status : 1);
    console.warn("Expo prebuild fallo; reintentando...");
  }
}

console.log(`Usando JAVA_HOME=${javaHome}`);
console.log(`Usando ANDROID SDK=${androidSdkPath}`);

runExpoPrebuildWithRetry();

writeFileSync(localPropertiesPath, `sdk.dir=${normalizedAndroidSdkPath}\n`, "utf8");
enforceGradleProperties();
cleanAndroidLibraryBuildDirs();

for (const lockFile of projectLockFiles) {
  if (existsSync(lockFile)) {
    try {
      rmSync(lockFile, { force: true });
    } catch {
      // ignored
    }
  }
}

const result = runGradle(["assembleDebug", "--no-daemon", "--max-workers=1", "--no-parallel"]);

if (result.status === 0) {
  const apkPath = path.join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (existsSync(apkPath)) {
    console.log("\n✓ Dev build APK generado en:");
    console.log(`  ${apkPath}`);
    console.log("\nPasos siguientes:");
    console.log("  1. Instala este APK en tu dispositivo Android.");
    console.log("  2. Corre: npm run prod:mobile2  (o dev:mobile2 para local)");
    console.log("  3. Abre el app en el dispositivo → conecta al servidor Metro.");
    console.log("  4. Ahora tienes hot reload + todos los modulos nativos activos.\n");
  }
}

if (typeof result.status === "number") process.exit(result.status);
process.exit(1);

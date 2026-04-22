import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const androidDir = path.join(projectRoot, "android");
const localPropertiesPath = path.join(androidDir, "local.properties");

const candidateJavaHomes = [
  process.env.JAVA_HOME,
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
    && existsSync(path.join(javaHome, "bin", "javac.exe"));
}

function isUsableAndroidSdk(sdkPath) {
  return existsSync(path.join(sdkPath, "platform-tools"))
    && (existsSync(path.join(sdkPath, "platforms")) || existsSync(path.join(sdkPath, "build-tools")));
}

const javaHome = candidateJavaHomes.find(isUsableJavaHome);
const androidSdkPath = candidateAndroidSdkPaths.find(isUsableAndroidSdk);

if (!javaHome) {
  console.error("No se encontro un JDK util para Android. Configura JAVA_HOME o instala un JDK con java.exe y javac.exe.");
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
  ANDROID_HOME: androidSdkPath,
  ANDROID_SDK_ROOT: androidSdkPath,
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

function stopProjectGradleJavaProcesses() {
  if (process.platform !== "win32") {
    return;
  }

  const powershellScript = [
    "$projectPattern = [regex]::Escape($args[0])",
    "$gradleJavaProcesses = Get-CimInstance Win32_Process -Filter \"Name = 'java.exe'\" | Where-Object {",
    "  $_.CommandLine -match 'GradleDaemon|org\\.gradle' -and $_.CommandLine -match $projectPattern",
    "}",
    "$gradleJavaProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join("; ");

  spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", powershellScript, projectRoot],
    { stdio: "inherit", env, shell: false },
  );
}

console.log(`Usando JAVA_HOME=${javaHome}`);
console.log(`Usando ANDROID SDK=${androidSdkPath}`);

writeFileSync(localPropertiesPath, `sdk.dir=${androidSdkPath.replace(/\//g, "\\\\")}\n`, "utf8");

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
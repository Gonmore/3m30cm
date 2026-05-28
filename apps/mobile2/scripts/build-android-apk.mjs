import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

function resolvePackageDir(packageName) {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [projectRoot, workspaceRoot] });
    return path.dirname(packageJsonPath);
  } catch {
    return null;
  }
}

const reactNativeGradlePluginDir = resolvePackageDir("@react-native/gradle-plugin");
const expoDevLauncherDir = resolvePackageDir("expo-dev-launcher");
const expoModulesCoreDir = resolvePackageDir("expo-modules-core");
const expoDir = resolvePackageDir("expo");
const expoConstantsDir = resolvePackageDir("expo-constants");

function readInstalledPackageVersion(packageName) {
  const packageDir = resolvePackageDir(packageName);
  if (!packageDir) {
    return null;
  }

  try {
    const packageJson = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
    return typeof packageJson.version === "string" ? packageJson.version : null;
  } catch {
    return null;
  }
}

const expoSharingVersion = readInstalledPackageVersion("expo-sharing");
const shouldInjectExpoSharingCompatShims = expoSharingVersion?.startsWith("56.") ?? false;

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

const gradleCommand = process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";
const requiredJvmFlags = "-Xmx3072m -XX:MaxMetaspaceSize=1024m";

function appendJvmFlags(existingValue) {
  const trimmed = existingValue?.trim();

  if (!trimmed) {
    return requiredJvmFlags;
  }

  if (trimmed.includes("-Xmx3072m") && trimmed.includes("-XX:MaxMetaspaceSize=1024m")) {
    return trimmed;
  }

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

function readReactNativeKotlinVersion() {
  if (!reactNativeGradlePluginDir) {
    return null;
  }

  const rnVersionsTomlPath = path.join(reactNativeGradlePluginDir, "gradle", "libs.versions.toml");

  if (!existsSync(rnVersionsTomlPath)) {
    return null;
  }

  const content = readFileSync(rnVersionsTomlPath, "utf8");
  return content.match(/^kotlin\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

function alignExpoDevLauncherKotlinVersion() {
  const kotlinVersion = readReactNativeKotlinVersion();
  if (!kotlinVersion || !expoDevLauncherDir) {
    return;
  }

  const expoDevLauncherGradlePath = path.join(expoDevLauncherDir, "expo-dev-launcher-gradle-plugin", "build.gradle.kts");

  if (!existsSync(expoDevLauncherGradlePath)) {
    return;
  }

  const original = readFileSync(expoDevLauncherGradlePath, "utf8");
  const updated = original.replace(
    /kotlin\("jvm"\) version "[^"]+"/,
    `kotlin("jvm") version "${kotlinVersion}"`,
  );

  if (updated !== original) {
    writeFileSync(expoDevLauncherGradlePath, updated, "utf8");
    console.log(`Alineando expo-dev-launcher con Kotlin ${kotlinVersion} para evitar el choque con React Native Gradle Plugin.`);
  }
}

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
    input: options.input,
    stdio: options.stdio ?? "inherit",
    shell: false,
  });
}

function enforceGradleProperties() {
  const gradlePropertiesPath = path.join(androidDir, "gradle.properties");

  if (!existsSync(gradlePropertiesPath)) {
    return;
  }

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
    if (!match) {
      return line;
    }

    const key = match[1];
    if (!requiredProperties.has(key)) {
      return line;
    }

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
  if (process.platform !== "win32") {
    return;
  }

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

function stopProjectBackgroundProcesses() {
  console.log("Deteniendo procesos Java/Gradle previos del proyecto...");
  stopProjectGradleJavaProcesses();
}

/**
 * Returns a short SHA-256 fingerprint of the files that control which native
 * Android project expo prebuild must regenerate. When nothing has changed we
 * can safely skip the expensive --clean prebuild and reuse the existing
 * android/ folder.
 */
function computePrebuildFingerprint() {
  const paths = [
    path.join(projectRoot, "app.json"),
    path.join(projectRoot, "package.json"),
    // Including the workspace-level node_modules marker avoids stale native
    // code when a dep version changes between builds.
    path.join(workspaceRoot, "package-lock.json"),
  ];
  const hash = createHash("sha256");
  // Include the build variant so switching between 'dev' and 'vjump' always
  // triggers a clean prebuild (different applicationId in each case).
  hash.update(`EXPO_VARIANT=${process.env.EXPO_VARIANT ?? "dev"}\n`);
  for (const filePath of paths) {
    try {
      hash.update(readFileSync(filePath));
    } catch {
      // If a file doesn't exist just skip it; the fingerprint will still differ
      // from the stored one and trigger a full prebuild.
    }
  }
  return hash.digest("hex").slice(0, 16);
}

const prebuildFingerprintPath = path.join(androidDir, ".prebuild-fingerprint");

function loadStoredPrebuildFingerprint() {
  try {
    return readFileSync(prebuildFingerprintPath, "utf8").trim();
  } catch {
    return null;
  }
}

function storePrebuildFingerprint(fingerprint) {
  try {
    writeFileSync(prebuildFingerprintPath, `${fingerprint}\n`, "utf8");
  } catch {
    // Non-fatal — just means next build will also do a full prebuild.
  }
}

function shouldSkipPrebuild() {
  // We can only skip when the android/ folder was previously generated.
  if (!existsSync(androidDir) || !existsSync(path.join(androidDir, "build.gradle"))) {
    return false;
  }
  const current = computePrebuildFingerprint();
  const stored = loadStoredPrebuildFingerprint();
  if (stored === current) {
    console.log(`Saltando expo prebuild: el fingerprint ${current} no cambió desde el último build.`);
    return true;
  }
  console.log(`Fingerprint cambió (${stored ?? "ninguno"} → ${current}); ejecutando prebuild completo.`);
  return false;
}

function cleanupProjectLockFiles() {
  for (const lockFile of projectLockFiles) {
    if (!existsSync(lockFile)) {
      continue;
    }

    try {
      rmSync(lockFile, { force: true, maxRetries: 5, retryDelay: 500 });
    } catch {
      // If another process still has the lock open, the next tool invocation will surface it.
    }
  }
}

function removeDirectoryIfPresent(targetDir) {
  if (!existsSync(targetDir)) {
    return;
  }

  rmSync(targetDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 500,
  });
}

function cleanAndroidLibraryBuildDirs() {
  const candidateDirs = [
    expoModulesCoreDir ? path.join(expoModulesCoreDir, "android", "build") : null,
    expoDir ? path.join(expoDir, "android", "build") : null,
    expoConstantsDir ? path.join(expoConstantsDir, "android", "build") : null,
  ].filter(Boolean);

  for (const targetDir of candidateDirs) {
    try {
      removeDirectoryIfPresent(targetDir);
    } catch (error) {
      console.warn(`No se pudo limpiar ${targetDir} antes de Gradle.`);
      if (error instanceof Error) {
        console.warn(error.message);
      }
    }
  }
}

function runExpoPrebuildWithRetry() {
  if (shouldSkipPrebuild()) {
    return;
  }

  const prebuildFingerprint = computePrebuildFingerprint();

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    stopProjectBackgroundProcesses();
    cleanupProjectLockFiles();

    console.log(`Ejecutando Expo prebuild para Android... (intento ${attempt}/2)`);
    const prebuildResult = runNodeProcess([
      expoCliPath,
      "prebuild",
      "--platform",
      "android",
      "--clean",
      "--no-install",
    ], {
      input: "y\n",
    });

    if (typeof prebuildResult.status === "number" && prebuildResult.status === 0) {
      storePrebuildFingerprint(prebuildFingerprint);
      return;
    }

    if (attempt === 2) {
      process.exit(typeof prebuildResult.status === "number" ? prebuildResult.status : 1);
    }

    console.warn("Expo prebuild fallo; reintentando tras limpiar procesos del proyecto...");
  }
}

function injectAnyTypeCacheShim() {
  const shimDir = path.join(
    androidDir,
    "app", "src", "main", "java",
    "expo", "modules", "kotlin", "types",
  );
  const shimPath = path.join(shimDir, "AnyTypeCache.kt");
  const shimContent = [
    "// AUTO-GENERATED by build-android-apk.mjs — do not edit by hand.",
    "// Compatibility shim: expo-sharing 56.0.14 pre-built AAR was compiled against a newer",
    "// expo-modules-core where AnyTypeProvider was renamed to AnyTypeCache.",
    "// AnyTypeProvider.typesMap is @PublishedApi internal — its JVM getter getTypesMap()",
    "// is public (no name mangling due to @PublishedApi) so we call it via reflection",
    "// to bypass Kotlin's cross-module internal visibility check.",
    "package expo.modules.kotlin.types",
    "",
    "@Suppress(\"UNCHECKED_CAST\")",
    "internal object AnyTypeCache {",
    "    fun getTypesMap(): Map<*, *> = try {",
    "        AnyTypeProvider::class.java.getMethod(\"getTypesMap\").invoke(AnyTypeProvider) as Map<*, *>",
    "    } catch (_: Throwable) {",
    "        emptyMap<Any, Any>()",
    "    }",
    "}",
    "",
  ].join("\n");

  mkdirSync(shimDir, { recursive: true });
  writeFileSync(shimPath, shimContent, "utf8");
  console.log(`✓ Shim AnyTypeCache.kt inyectado en ${path.relative(projectRoot, shimDir)}`);
}

/**
 * Injects compatibility shims for expo-sharing 56.0.14 AAR that was compiled against
 * a newer expo-modules-core with:
 *   - expo.modules.kotlin.types.descriptors.{TypeDescriptor, RawTypeDescriptor, ...}
 *   - io.github.lukmccall.pika.{PTypeDescriptor, PTypeDescriptorRegistry, ...}
 *   - AnyType(TypeDescriptor, TypeConverterProvider) secondary constructor
 *
 * All shims go into node_modules/expo-modules-core/android/src/main/java/ so they
 * are compiled in the SAME Gradle module as AnyType.kt — mandatory because AnyType's
 * new constructor references TypeDescriptor (cross-module references would fail).
 */
function injectExpoSharingCompatShims() {
  if (!expoModulesCoreDir) {
    console.warn("⚠ expo-modules-core no encontrado desde apps/mobile2 — saltando shims de compatibilidad.");
    return;
  }

  const emojiBase = path.join(
    expoModulesCoreDir,
    "android", "src", "main", "java",
  );

  // ── 1. RawTypeDescriptor ────────────────────────────────────────────────────
  const descDir = path.join(emojiBase, "expo", "modules", "kotlin", "types", "descriptors");
  mkdirSync(descDir, { recursive: true });

  writeFileSync(path.join(descDir, "RawTypeDescriptor.kt"), [
    "// AUTO-GENERATED shim by build-android-apk.mjs — do not edit by hand.",
    "// expo-sharing 56.0.14 references expo.modules.kotlin.types.descriptors.RawTypeDescriptor",
    "// which does not exist in expo-modules-core 3.0.30.",
    "package expo.modules.kotlin.types.descriptors",
    "",
    "import kotlin.reflect.KType",
    "import kotlin.reflect.typeOf",
    "",
    "class RawTypeDescriptor(val kType: KType = typeOf<Any?>())",
    "",
  ].join("\n"), "utf8");

  // ── 2. TypeDescriptor + top-level fun toTypeDescriptor (→ TypeDescriptorKt) ─
  writeFileSync(path.join(descDir, "TypeDescriptor.kt"), [
    "// AUTO-GENERATED shim by build-android-apk.mjs — do not edit by hand.",
    "// expo-sharing 56.0.14 references expo.modules.kotlin.types.descriptors.TypeDescriptor",
    "// and TypeDescriptorKt.toTypeDescriptor which do not exist in expo-modules-core 3.0.30.",
    "package expo.modules.kotlin.types.descriptors",
    "",
    "import kotlin.reflect.KType",
    "",
    "class TypeDescriptor(",
    "    val rawDescriptor: RawTypeDescriptor,",
    "    @Suppress(\"UNUSED_PARAMETER\") kTypeProvider: () -> KType,",
    ") {",
    "    val kType: KType get() = rawDescriptor.kType",
    "}",
    "",
    "/** Top-level — generates TypeDescriptorKt.class (from TypeDescriptor.kt file). */",
    "@Suppress(\"UNUSED_PARAMETER\")",
    "fun toTypeDescriptor(kType: KType): TypeDescriptor =",
    "    TypeDescriptor(RawTypeDescriptor(kType)) { kType }",
    "",
  ].join("\n"), "utf8");

  // ── 3. typeDescriptorOf.kt top-level fun (→ TypeDescriptorOfKt.class) ───────
  writeFileSync(path.join(descDir, "typeDescriptorOf.kt"), [
    "// AUTO-GENERATED shim by build-android-apk.mjs — do not edit by hand.",
    "// expo-sharing 56.0.14 references TypeDescriptorOfKt.toRawTypeDescriptor which",
    "// does not exist in expo-modules-core 3.0.30.",
    "package expo.modules.kotlin.types.descriptors",
    "",
    "import io.github.lukmccall.pika.PTypeDescriptor",
    "import kotlin.reflect.typeOf",
    "",
    "/** Top-level — generates TypeDescriptorOfKt.class (file name typeDescriptorOf.kt). */",
    "fun toRawTypeDescriptor(p: PTypeDescriptor): RawTypeDescriptor {",
    "    val klass = (p as? PTypeDescriptor.Concrete)?.kClass",
    "    return when {",
    "        klass == String::class.java  -> RawTypeDescriptor(typeOf<String?>())",
    "        klass == Int::class.java     -> RawTypeDescriptor(typeOf<Int?>())",
    "        klass == Boolean::class.java -> RawTypeDescriptor(typeOf<Boolean?>())",
    "        klass == Double::class.java  -> RawTypeDescriptor(typeOf<Double?>())",
    "        else                         -> RawTypeDescriptor(typeOf<Any?>())",
    "    }",
    "}",
    "",
  ].join("\n"), "utf8");

  console.log(`✓ Shims TypeDescriptor/RawTypeDescriptor/TypeDescriptorOf inyectados en expo-modules-core`);

  // ── 4. io.github.lukmccall.pika stubs ──────────────────────────────────────
  const pikaDir = path.join(emojiBase, "io", "github", "lukmccall", "pika");
  mkdirSync(pikaDir, { recursive: true });

  writeFileSync(path.join(pikaDir, "PTypeDescriptor.kt"), [
    "// AUTO-GENERATED shim — pika library stub for expo-sharing 56.0.14 AAR compatibility.",
    "package io.github.lukmccall.pika",
    "",
    "interface PTypeDescriptor {",
    "    class Concrete(val kClass: Class<*>?) : PTypeDescriptor",
    "}",
    "",
  ].join("\n"), "utf8");

  writeFileSync(path.join(pikaDir, "PIntrospectionData.kt"), [
    "// AUTO-GENERATED shim — pika library stub for expo-sharing 56.0.14 AAR compatibility.",
    "package io.github.lukmccall.pika",
    "",
    "class PIntrospectionData<T : Any>",
    "",
  ].join("\n"), "utf8");

  writeFileSync(path.join(pikaDir, "PIntrospectionProvider.kt"), [
    "// AUTO-GENERATED shim — pika library stub for expo-sharing 56.0.14 AAR compatibility.",
    "package io.github.lukmccall.pika",
    "",
    "interface PIntrospectionProvider {",
    "    fun getIntrospectionData(): PIntrospectionData<*>",
    "}",
    "",
  ].join("\n"), "utf8");

  writeFileSync(path.join(pikaDir, "PTypeDescriptorRegistry.kt"), [
    "// AUTO-GENERATED shim — pika library stub for expo-sharing 56.0.14 AAR compatibility.",
    "package io.github.lukmccall.pika",
    "",
    "object PTypeDescriptorRegistry {",
    "    @JvmField",
    "    val STRING_NULLABLE: PTypeDescriptor.Concrete = PTypeDescriptor.Concrete(String::class.java)",
    "",
    "    @JvmStatic",
    "    fun getOrCreateConcrete(",
    "        kClass: Class<*>,",
    "        isNullable: Boolean,",
    "        data: PIntrospectionData<*>?,",
    "    ): PTypeDescriptor.Concrete = PTypeDescriptor.Concrete(kClass)",
    "}",
    "",
  ].join("\n"), "utf8");

  console.log(`✓ Shims pika (PTypeDescriptor/PIntrospectionData/PTypeDescriptorRegistry) inyectados en expo-modules-core`);
}

/**
 * Patches AnyType.kt in node_modules/expo-modules-core to add a secondary constructor
 * that accepts (TypeDescriptor, TypeConverterProvider) — as called by the expo-sharing
 * 56.0.14 pre-built AAR which was compiled against a newer expo-modules-core.
 *
 * The patch is idempotent: does nothing if already applied.
 * Must run in the same Gradle module as TypeDescriptor.kt (both in expo-modules-core source).
 */
function patchAnyTypeForTypeDescriptor() {
  if (!expoModulesCoreDir) {
    console.warn("⚠ expo-modules-core no encontrado desde apps/mobile2 — saltando patch AnyType.kt.");
    return;
  }

  const anyTypePath = path.join(
    expoModulesCoreDir,
    "android", "src", "main", "java",
    "expo", "modules", "kotlin", "types", "AnyType.kt",
  );

  if (!existsSync(anyTypePath)) {
    console.warn("⚠ AnyType.kt no encontrado en expo-modules-core — saltando patch.");
    return;
  }

  const original = readFileSync(anyTypePath, "utf8");
  const marker = "// COMPAT: secondary constructor for expo-sharing 56.0.14";

  if (original.includes(marker)) {
    console.log("✓ AnyType.kt ya tiene el constructor secundario para TypeDescriptor.");
    return;
  }

  // Insert secondary constructor right after the opening of class AnyType {
  const insertAfter = "class AnyType(\n  val kType: KType,\n  val converterProvider: TypeConverterProvider? = null\n) {";
  if (!original.includes(insertAfter)) {
    console.warn("⚠ AnyType.kt no tiene la firma esperada — saltando patch. Puede que ya sea compatible.");
    return;
  }

  const secondaryConstructor = [
    "",
    "  " + marker,
    "  constructor(",
    "    typeDescriptor: expo.modules.kotlin.types.descriptors.TypeDescriptor,",
    "    converterProvider: TypeConverterProvider,",
    "  ) : this(typeDescriptor.kType, converterProvider)",
  ].join("\n");

  const patched = original.replace(insertAfter, insertAfter + secondaryConstructor);
  writeFileSync(anyTypePath, patched, "utf8");
  console.log("✓ AnyType.kt parcheado con constructor secundario para TypeDescriptor.");
}

console.log(`Usando JAVA_HOME=${javaHome}`);
console.log(`Usando ANDROID SDK=${androidSdkPath}`);
if (expoSharingVersion) {
  console.log(`Usando expo-sharing=${expoSharingVersion}`);
}

runExpoPrebuildWithRetry();
if (shouldInjectExpoSharingCompatShims) {
  injectAnyTypeCacheShim();
  injectExpoSharingCompatShims();
  patchAnyTypeForTypeDescriptor();
} else {
  console.log("✓ No hacen falta shims de compatibilidad para expo-sharing.");
}

writeFileSync(localPropertiesPath, `sdk.dir=${normalizedAndroidSdkPath}\n`, "utf8");
enforceGradleProperties();
alignExpoDevLauncherKotlinVersion();
cleanAndroidLibraryBuildDirs();
cleanupProjectLockFiles();

const result = runGradle(["assembleRelease", "--no-daemon", "--max-workers=1", "--no-parallel", "--build-cache"]);

// ── Copy output APK to a named file at the project root ────────────────────
if (result.status === 0) {
  const outputApk = path.join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
  const variant = process.env.EXPO_VARIANT ?? "dev";
  const destName = variant === "vjump" ? "vjump-release.apk" : "release.apk";
  const destApk = path.join(projectRoot, destName);
  if (existsSync(outputApk)) {
    copyFileSync(outputApk, destApk);
    console.log(`\n✓ APK disponible en: ${destApk}`);
  }
}

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
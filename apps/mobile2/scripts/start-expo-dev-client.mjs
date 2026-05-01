import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const expoCliPath = path.resolve(projectRoot, "../../node_modules/expo/bin/cli");

function isPrivateIpv4(address) {
  return /^10\./.test(address)
    || /^192\.168\./.test(address)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address);
}

function getCandidateScore(candidate) {
  const normalizedName = candidate.name.toLowerCase();
  let score = 0;

  if (/^192\.168\./.test(candidate.address)) {
    score += 100;
  } else if (/^10\./.test(candidate.address)) {
    score += 70;
  } else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(candidate.address)) {
    score += 40;
  }

  if (candidate.private) {
    score += 20;
  }

  if (/wi-?fi|wlan|wireless/.test(normalizedName)) {
    score += 40;
  }

  if (/ethernet/.test(normalizedName)) {
    score += 20;
  }

  if (/wsl|hyper-v|vethernet|virtual|vmware|docker|loopback|bluetooth|tailscale|zerotier/.test(normalizedName)) {
    score -= 200;
  }

  return score;
}

function getPreferredLanAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (!entry || entry.family !== "IPv4" || entry.internal || !entry.address) {
        continue;
      }

      candidates.push({
        name,
        address: entry.address,
        private: isPrivateIpv4(entry.address),
        score: 0,
      });
    }
  }

  for (const candidate of candidates) {
    candidate.score = getCandidateScore(candidate);
  }

  candidates.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  const preferred = candidates[0];
  return preferred?.address ?? null;
}

const explicitHost = process.env.MOBILE2_EXPO_HOSTNAME?.trim() || process.env.REACT_NATIVE_PACKAGER_HOSTNAME?.trim();
const detectedHost = explicitHost || getPreferredLanAddress();

if (!detectedHost) {
  console.error("No se pudo detectar una IPv4 LAN para Expo. Define MOBILE2_EXPO_HOSTNAME con la IP local de esta PC.");
  process.exit(1);
}

console.log(`Usando Metro en http://${detectedHost}:8082`);

const child = spawn(
  process.execPath,
  [
    expoCliPath,
    "start",
      "--host",
    "lan",
    "--port",
    "8082",
    "--clear",
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      REACT_NATIVE_PACKAGER_HOSTNAME: detectedHost,
      EXPO_PUBLIC_API_BASE_URL: "https://3m30cm.supernovatel.com",
      EXPO_PUBLIC_MINIO_PUBLIC_BASE_URL: "http://s3.supernovatel.com",
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
import Constants from "expo-constants";

function normalizeHostCandidate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split(/[/:]/)[0];

  return host || null;
}

function getExpoHostIp() {
  const constantsAny = Constants as typeof Constants & {
    manifest?: { debuggerHost?: string; hostUri?: string };
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } };
    expoGoConfig?: { debuggerHost?: string };
  };

  const candidates = [
    constantsAny.expoConfig?.hostUri,
    constantsAny.expoGoConfig?.debuggerHost,
    constantsAny.manifest2?.extra?.expoGo?.debuggerHost,
    constantsAny.manifest?.debuggerHost,
    constantsAny.manifest?.hostUri,
  ];

  for (const candidate of candidates) {
    const host = normalizeHostCandidate(candidate);

    if (host) {
      return host;
    }
  }

  return null;
}

function buildBaseUrl(port: number, fallback: string) {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    try {
      const url = new URL(configured);
      url.port = String(port);
      return url.origin;
    } catch {
      return configured;
    }
  }

  const expoHost = getExpoHostIp();

  if (expoHost) {
    return `http://${expoHost}:${port}`;
  }

  return fallback;
}

export const apiBaseUrl = buildBaseUrl(4100, "http://localhost:4100");
export const minioBaseUrl = buildBaseUrl(9000, "http://localhost:9000");

export function rewriteLocalAssetUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  return url.replace(/^https?:\/\/localhost:9000/i, minioBaseUrl);
}
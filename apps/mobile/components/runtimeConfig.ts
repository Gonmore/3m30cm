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

function normalizeConfiguredApiUrl(url: URL) {
  const normalizedPath = url.pathname.replace(/\/+$/, "");

  if (normalizedPath === "/api") {
    url.pathname = "";
  }

  return url;
}

function buildBaseUrl(port: number, fallback: string) {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    try {
      const url = normalizeConfiguredApiUrl(new URL(configured));

      // If the env already includes an explicit port, reuse the same host and swap
      // to the service port we need locally (API 4100, MinIO 9000).
      if (url.port) {
        url.port = String(port);
        return url.origin;
      }

      // Production URLs typically terminate on 443/80 behind a reverse proxy and
      // should be used as-is instead of forcing an internal container port.
      return url.origin;
    } catch {
      return configured.replace(/\/api\/?$/, "").replace(/\/$/, "");
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
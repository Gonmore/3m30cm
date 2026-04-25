import Constants from "expo-constants";

interface RuntimeAppConfigExtra {
  apiBaseUrl?: string;
  minioPublicBaseUrl?: string;
  googleClientIds?: {
    web?: string;
    ios?: string;
    android?: string;
  };
}

const knownProductionMediaBaseUrl = "http://s3.supernovatel.com";

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

export function getRuntimeAppConfigExtra(): RuntimeAppConfigExtra {
  const constantsAny = Constants as typeof Constants & {
    manifest?: { extra?: unknown };
    manifest2?: { extra?: unknown };
    expoGoConfig?: { extra?: unknown };
  };

  const candidates = [
    Constants.expoConfig?.extra,
    constantsAny.expoGoConfig?.extra,
    constantsAny.manifest2?.extra,
    constantsAny.manifest?.extra,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      return candidate as RuntimeAppConfigExtra;
    }
  }

  return {};
}

function normalizeConfiguredApiUrl(url: URL) {
  const normalizedPath = url.pathname.replace(/\/+$/, "");

  if (normalizedPath === "/api") {
    url.pathname = "";
  }

  return url;
}

function buildBaseUrl(port: number, fallback: string) {
  const hasEnvOverride = Object.prototype.hasOwnProperty.call(process.env, "EXPO_PUBLIC_API_BASE_URL");
  const configured = (hasEnvOverride ? process.env.EXPO_PUBLIC_API_BASE_URL : getRuntimeAppConfigExtra().apiBaseUrl)?.trim();

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

function buildPublicMediaBaseUrl(fallback: string) {
  const hasExplicitOverride = Object.prototype.hasOwnProperty.call(process.env, "EXPO_PUBLIC_MINIO_PUBLIC_BASE_URL");
  const configured = (hasExplicitOverride ? process.env.EXPO_PUBLIC_MINIO_PUBLIC_BASE_URL : getRuntimeAppConfigExtra().minioPublicBaseUrl)?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const hasApiOverride = Object.prototype.hasOwnProperty.call(process.env, "EXPO_PUBLIC_API_BASE_URL");
  const configuredApiBaseUrl = (hasApiOverride ? process.env.EXPO_PUBLIC_API_BASE_URL : getRuntimeAppConfigExtra().apiBaseUrl)?.trim();

  if (configuredApiBaseUrl) {
    try {
      const url = new URL(configuredApiBaseUrl);
      if (url.hostname === "3m30cm.supernovatel.com") {
        return knownProductionMediaBaseUrl;
      }
    } catch {
      // Ignore malformed overrides and fall through to local defaults.
    }
  }

  const expoHost = getExpoHostIp();
  if (expoHost) {
    return `http://${expoHost}:9000`;
  }

  return fallback;
}

function buildPublicBucketUrl(bucket: string, objectKey: string) {
  const normalizedKey = objectKey
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join("/");

  return `${minioBaseUrl}/${encodeURIComponent(decodeURIComponent(bucket))}/${normalizedKey}`;
}

export const apiBaseUrl = buildBaseUrl(4100, "http://localhost:4100");
export const minioBaseUrl = buildPublicMediaBaseUrl("http://localhost:9000");

export function rewriteLocalAssetUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const assetRouteMatch = url.match(/^(?:https?:\/\/[^/]+)?\/api\/v1\/assets\/([^/]+)\/(.+)$/i);
  if (assetRouteMatch) {
    const [, bucket, objectKey] = assetRouteMatch;
    return buildPublicBucketUrl(bucket, objectKey);
  }

  return url.replace(/^https?:\/\/localhost:(?:9000|9001)/i, minioBaseUrl);
}
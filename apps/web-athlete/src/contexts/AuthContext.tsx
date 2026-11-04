import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

const accessTokenStorageKey = "jump-athlete-access-token";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  platformRole: string | null;
  teamRoles: string[];
  avatarUrl: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
  /** Uploads a new profile photo and updates the current user. Throws on failure. */
  updateAvatar: (file: File) => Promise<string>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

// The JWT only carries id/email/roles; name and avatar come from the profile endpoint.
function buildUserFromToken(token: string): AuthUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.sub !== "string") return null;

  return {
    id: payload.sub,
    email: (payload.email as string | undefined) ?? "",
    firstName: (payload.firstName as string | null | undefined) ?? null,
    lastName: (payload.lastName as string | null | undefined) ?? null,
    platformRole: (payload.platformRole as string | null | undefined) ?? null,
    teamRoles: (payload.teamRoles as string[] | undefined) ?? [],
    avatarUrl: (payload.avatarUrl as string | null | undefined) ?? null,
  };
}

/**
 * Avatar URLs are stored as relative `/api/v1/assets/...` paths (served through the API
 * proxy) or absolute URLs (e.g. Google pictures). Old rows may point at the raw MinIO host.
 */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const assetRoute = url.match(/^(?:https?:\/\/[^/]+)?(\/api\/v1\/assets\/.+)$/i);
  if (assetRoute?.[1]) return assetRoute[1];
  const bucketUrl = url.match(/^https?:\/\/(?:localhost(?::(?:9000|9001))?|s3\.supernovatel\.com)\/([^/]+)\/(.+)$/i);
  if (bucketUrl?.[1] && bucketUrl[2]) return `/api/v1/assets/${bucketUrl[1]}/${bucketUrl[2]}`;
  return url;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(accessTokenStorageKey);
  });
  const [user, setUser] = useState<AuthUser | null>(() => (accessToken ? buildUserFromToken(accessToken) : null));
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Load the token identity, then enrich it with name/avatar from the profile endpoint.
  useEffect(() => {
    if (!accessToken) {
      setUser(null);
      return;
    }

    const decoded = buildUserFromToken(accessToken);
    // Keep already-loaded profile fields when the same user is re-decoded.
    setUser((prev) => (decoded && prev?.id === decoded.id ? { ...decoded, ...stripEmpty(prev) } : decoded));

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/v1/athlete/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok) return; // e.g. coaches without an athlete profile
        const data = (await response.json()) as {
          athleteProfile?: {
            user?: { firstName?: string | null; lastName?: string | null; avatarUrl?: string | null };
          };
        };
        const profileUser = data.athleteProfile?.user;
        if (!profileUser) return;
        setUser((prev) =>
          prev
            ? {
                ...prev,
                firstName: profileUser.firstName ?? prev.firstName,
                lastName: profileUser.lastName ?? prev.lastName,
                avatarUrl: profileUser.avatarUrl ?? prev.avatarUrl,
              }
            : prev,
        );
      } catch {
        // Network/abort errors: keep token identity.
      }
    })();

    return () => controller.abort();
  }, [accessToken]);

  const completeLogin = (data: { accessToken: string; user: AuthUser }) => {
    window.localStorage.setItem(accessTokenStorageKey, data.accessToken);
    setIsLoading(false);
    setUser({ ...data.user, avatarUrl: data.user.avatarUrl ?? null });
    setAccessToken(data.accessToken);
    navigate("/", { replace: true });
  };

  const login = async (email: string, password: string) => {
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ message: "Login failed" }));
      throw new Error(data.message ?? "Login failed");
    }

    completeLogin((await response.json()) as { accessToken: string; user: AuthUser });
  };

  const loginWithGoogle = async (idToken: string) => {
    const response = await fetch("/api/v1/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ message: "Google login failed" }));
      throw new Error(data.message ?? "Google login failed");
    }

    completeLogin((await response.json()) as { accessToken: string; user: AuthUser });
  };

  const logout = useCallback(() => {
    window.localStorage.removeItem(accessTokenStorageKey);
    setAccessToken(null);
    setUser(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  const updateAvatar = useCallback(
    async (file: File) => {
      if (!accessToken) throw new Error("Sesión no iniciada");
      if (!file.type.startsWith("image/")) throw new Error("El archivo debe ser una imagen");
      if (file.size > 5 * 1024 * 1024) throw new Error("La imagen no puede superar 5 MB");

      const formData = new FormData();
      formData.append("avatar", file);

      // No Content-Type header: the browser sets the multipart boundary.
      const response = await fetch("/api/v1/athlete/me/avatar", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      if (response.status === 401) {
        logout();
        throw new Error("Sesión expirada");
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(body.error ?? body.message ?? "Error al subir la foto");
      }

      const { avatarUrl } = (await response.json()) as { avatarUrl: string };
      setUser((prev) => (prev ? { ...prev, avatarUrl } : prev));
      return avatarUrl;
    },
    [accessToken, logout],
  );

  const value = useMemo(
    () => ({ user, accessToken, isLoading, login, loginWithGoogle, logout, updateAvatar }),
    // login/loginWithGoogle only depend on stable setters/navigate
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, accessToken, isLoading, logout, updateAvatar],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function stripEmpty(user: AuthUser): Partial<AuthUser> {
  const out: Partial<AuthUser> = {};
  if (user.firstName) out.firstName = user.firstName;
  if (user.lastName) out.lastName = user.lastName;
  if (user.avatarUrl) out.avatarUrl = user.avatarUrl;
  return out;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";

export type ViewMode = "athlete" | "coach";

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  canCoachMode: boolean;
  isSuperAdmin: boolean;
}

const ViewModeContext = createContext<ViewModeContextType | null>(null);

function storageKey(userId: string | undefined) {
  return `3m30cm:view-mode:${userId ?? "anon"}`;
}

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const canCoachMode = user?.platformRole === "COACH" || user?.platformRole === "SUPERADMIN";
  const isSuperAdmin = user?.platformRole === "SUPERADMIN";

  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "athlete";
    const raw = window.localStorage.getItem(storageKey(user?.id));
    return raw === "coach" ? "coach" : "athlete";
  });

  useEffect(() => {
    if (!canCoachMode) {
      setViewModeState("athlete");
      return;
    }
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(storageKey(user?.id));
    setViewModeState(raw === "coach" ? "coach" : "athlete");
  }, [canCoachMode, user?.id]);

  useEffect(() => {
    if (!user) setViewModeState("athlete");
  }, [user]);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      const next = canCoachMode ? mode : "athlete";
      setViewModeState(next);
      if (typeof window !== "undefined") window.localStorage.setItem(storageKey(user?.id), next);
    },
    [canCoachMode, user?.id],
  );

  const value = useMemo(() => ({ viewMode: canCoachMode ? viewMode : "athlete", setViewMode, canCoachMode, isSuperAdmin }), [viewMode, setViewMode, canCoachMode, isSuperAdmin]);
  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (!context) throw new Error("useViewMode must be used within ViewModeProvider");
  return context;
}

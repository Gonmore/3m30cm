import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "dark" | "light";

// ─── Color palettes ──────────────────────────────────────────────────────────

const dark = {
  bg:           "#0A1628",
  surface:      "#111D35",
  surfaceRaise: "#16243E",
  surfaceActive:"#1C2D50",
  drawerBg:     "#07101E",
  overlay:      "rgba(0,0,0,0.72)",
  amber:        "#F5A623",
  amberDim:     "rgba(245,166,35,0.15)",
  amberBorder:  "rgba(245,166,35,0.32)",
  teal:         "#2CC4B0",
  tealDim:      "rgba(44,196,176,0.14)",
  tealBorder:   "rgba(44,196,176,0.32)",
  tealLight:    "#7DE8DC",
  danger:       "#E05A3A",
  dangerDim:    "rgba(224,90,58,0.14)",
  dangerBorder: "rgba(224,90,58,0.32)",
  focus:        "#F5A623",
  push:         "#2CC4B0",
  protect:      "#E05A3A",
  steady:       "#7A8BA8",
  text:         "#E8EDF5",
  textSub:      "#A8B4C8",
  textMuted:    "#7A8BA8",
  textDisabled: "#4A5A72",
  border:       "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.14)",
} as const;

const light = {
  bg:           "#F5F7FA",
  surface:      "#FFFFFF",
  surfaceRaise: "#EEF1F6",
  surfaceActive:"#E4E8F0",
  drawerBg:     "#EAF0F8",
  overlay:      "rgba(0,0,0,0.60)",
  amber:        "#D4880A",
  amberDim:     "rgba(212,136,10,0.12)",
  amberBorder:  "rgba(212,136,10,0.30)",
  teal:         "#1A9E8C",
  tealDim:      "rgba(26,158,140,0.12)",
  tealBorder:   "rgba(26,158,140,0.30)",
  tealLight:    "#3DCAB6",
  danger:       "#C0452A",
  dangerDim:    "rgba(192,69,42,0.12)",
  dangerBorder: "rgba(192,69,42,0.28)",
  focus:        "#D4880A",
  push:         "#1A9E8C",
  protect:      "#C0452A",
  steady:       "#7A8BA8",
  text:         "#0A1628",
  textSub:      "#2A3A5A",
  textMuted:    "#5A6A84",
  textDisabled: "#9AAABB",
  border:       "rgba(0,0,20,0.09)",
  borderStrong: "rgba(0,0,20,0.16)",
} as const;

export interface ColorPalette {
  bg: string;
  surface: string;
  surfaceRaise: string;
  surfaceActive: string;
  drawerBg: string;
  overlay: string;
  amber: string;
  amberDim: string;
  amberBorder: string;
  teal: string;
  tealDim: string;
  tealBorder: string;
  tealLight: string;
  danger: string;
  dangerDim: string;
  dangerBorder: string;
  focus: string;
  push: string;
  protect: string;
  steady: string;
  text: string;
  textSub: string;
  textMuted: string;
  textDisabled: string;
  border: string;
  borderStrong: string;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "jump-theme";

interface ThemeContextValue {
  mode: ThemeMode;
  C: ColorPalette;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  C: dark,
  toggleTheme: () => undefined,
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  // Load persisted preference on mount
  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark") setMode(stored);
      })
      .catch(() => undefined);
  }, []);

  const toggleTheme = useCallback(() => {
    setMode((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      void SecureStore.setItemAsync(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, C: mode === "dark" ? dark : light, toggleTheme }),
    [mode, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

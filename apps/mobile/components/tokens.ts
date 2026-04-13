// Design tokens – dark "game" theme (navy / amber / teal)
export const C = {
  // ── Backgrounds ──────────────────────────────────────────
  bg:           "#0A1628",
  surface:      "#111D35",
  surfaceRaise: "#16243E",
  surfaceActive:"#1C2D50",
  drawerBg:     "#07101E",
  overlay:      "rgba(0,0,0,0.72)",

  // ── Accents ───────────────────────────────────────────────
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
  focus:        "#F5A623",   // same as amber
  push:         "#2CC4B0",   // same as teal
  protect:      "#E05A3A",   // same as danger
  steady:       "#7A8BA8",

  // ── Text ─────────────────────────────────────────────────
  text:         "#E8EDF5",
  textSub:      "#A8B4C8",
  textMuted:    "#7A8BA8",
  textDisabled: "#4A5A72",

  // ── Borders ──────────────────────────────────────────────
  border:       "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.14)",
} as const;

export const R = {
  xs:   6,
  sm:   10,
  md:   16,
  lg:   22,
  xl:   30,
  full: 999,
} as const;

export const S = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
} as const;

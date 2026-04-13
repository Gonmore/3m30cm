export const appMetadata = {
  name: "3m30cm",
  tagline: "Planificacion de salto vertical personalizada",
  cycleLengthDays: 14,
  targetDurationWeeks: 12,
} as const;

export const platformRoles = [
  "ATHLETE",
  "COACH",
  "TEAM_ADMIN",
  "SUPERADMIN",
] as const;

export const dayTypes = [
  "EXPLOSIVE",
  "STRENGTH",
  "RECOVERY",
  "REST",
  "UPPER_CORE",
  "OTHER",
] as const;

export type PlatformRole = (typeof platformRoles)[number];
export type DayType = (typeof dayTypes)[number];

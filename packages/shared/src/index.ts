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

export type BiomechanicsLandmarkAxis = "X" | "Y";
export type BiomechanicsReferenceMode = "ABSOLUTE" | "DELTA_FROM_START";
export type BiomechanicsMeasuredCheckStatus = "PENDING" | "OK" | "OUT_OF_RANGE" | "MISSING_EVENT" | "MISSING_LANDMARK";

export interface BiomechanicsPoseLandmarkSample {
  name: string;
  x: number;
  y: number;
  z?: number | null;
  visibility?: number | null;
}

export interface BiomechanicsPoseFrameSample {
  frameIndex: number;
  timestampMs: number;
  landmarks: BiomechanicsPoseLandmarkSample[];
}

export interface AthleteBiomechanicsPoseSequence {
  schemaVersion: 1;
  frames: BiomechanicsPoseFrameSample[];
}

export interface AthleteBiomechanicsDetectedEvent {
  id: string;
  label: string;
  eventType: string;
  frameIndex: number | null;
  timestampMs: number | null;
  confidence: number | null;
  source: "AUTO" | "MANUAL" | "HYBRID";
  matchedReferenceEventId: string | null;
}

export interface AthleteBiomechanicsMeasuredAngleCheck {
  checkId: string;
  label: string;
  status: BiomechanicsMeasuredCheckStatus;
  eventId: string | null;
  actualDeg: number | null;
  targetMinDeg: number | null;
  targetMaxDeg: number | null;
}

export interface AthleteBiomechanicsMeasuredPointCheck {
  checkId: string;
  label: string;
  status: BiomechanicsMeasuredCheckStatus;
  eventId: string | null;
  axis: BiomechanicsLandmarkAxis;
  referenceMode: BiomechanicsReferenceMode;
  actualValue: number | null;
  targetMin: number | null;
  targetMax: number | null;
}

export interface AthleteBiomechanicsMeasuredTrajectoryCheck {
  checkId: string;
  label: string;
  status: BiomechanicsMeasuredCheckStatus;
  startEventId: string | null;
  endEventId: string | null;
  actualValue: number | null;
  targetMin: number | null;
  targetMax: number | null;
}

export interface AthleteBiomechanicsMeasuredChecks {
  angleChecks: AthleteBiomechanicsMeasuredAngleCheck[];
  pointChecks: AthleteBiomechanicsMeasuredPointCheck[];
  trajectoryChecks: AthleteBiomechanicsMeasuredTrajectoryCheck[];
}

export interface AthleteBiomechanicsAnalysisContract {
  schemaVersion: 1;
  poseSequence: AthleteBiomechanicsPoseSequence | null;
  detectedEvents: AthleteBiomechanicsDetectedEvent[];
  measuredChecks: AthleteBiomechanicsMeasuredChecks;
}

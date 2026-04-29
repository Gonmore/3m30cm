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

export const biomechanicsEventTypes = [
  "SETUP",
  "DIP",
  "ANTEPENULTIMATE_CONTACT",
  "PRE_PENULTIMATE_FLIGHT",
  "PENULTIMATE_CONTACT",
  "LAST_CONTACT",
  "TAKE_OFF",
  "TOE_OFF",
  "FLIGHT",
  "APEX",
  "LANDING",
  "OTHER",
] as const;

export const biomechanicsDetectedEventSources = ["AUTO", "MANUAL", "HYBRID"] as const;
export const biomechanicsEventDetectors = ["HIP_FOOT_HEURISTIC_V1"] as const;

export type BiomechanicsEventType = (typeof biomechanicsEventTypes)[number];
export type BiomechanicsDetectedEventSource = (typeof biomechanicsDetectedEventSources)[number];
export type BiomechanicsEventDetector = (typeof biomechanicsEventDetectors)[number];

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
  eventType: BiomechanicsEventType;
  frameIndex: number | null;
  timestampMs: number | null;
  confidence: number | null;
  source: BiomechanicsDetectedEventSource;
  detector: BiomechanicsEventDetector | null;
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

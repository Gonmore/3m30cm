import { useEffect, useMemo, useRef, useState } from "react";

import {
  detectTechniqueKeyEventsWithDebug,
  type AutoDetectedTechniqueDebugData,
  type AutoDetectedTechniqueKeyEvent,
  type AutoDetectedTechniqueSupportLabel,
} from "./biomechanicsEventDetection";
import { buildReferenceBiomechanicsMeasurementsPreview } from "./biomechanicsReferenceMeasurements";
import { BiomechanicsVisualEditor } from "./components/BiomechanicsVisualEditor";
import { extractTechniquePoseSequence, type TechniquePoseFrame, type TechniqueProLandmarks } from "./techniquePoseExtraction";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
const apiBaseUrl = configuredApiBaseUrl.replace(/\/$/, "");
const tokenStorageKey = "jump-admin-access-token";
const templateCode = "JUMP-MANUAL-14D";
const weekdayLabels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const seasonPhaseOptions = ["OFF_SEASON", "PRESEASON", "IN_SEASON", "COMPETITION"] as const;
const sessionStatusOptions = ["PLANNED", "COMPLETED", "SKIPPED", "RESCHEDULED"] as const;
const seriesProtocolOptions = ["NONE", "STRENGTH_EXPLOSION", "PLYOMETRIC_SPEED"] as const;
const poseLandmarkOptions = [
  { value: "NOSE", label: "Nariz" },
  { value: "LEFT_EYE_INNER", label: "Ojo izq. interno" },
  { value: "LEFT_EYE", label: "Ojo izquierdo" },
  { value: "LEFT_EYE_OUTER", label: "Ojo izq. externo" },
  { value: "RIGHT_EYE_INNER", label: "Ojo der. interno" },
  { value: "RIGHT_EYE", label: "Ojo derecho" },
  { value: "RIGHT_EYE_OUTER", label: "Ojo der. externo" },
  { value: "LEFT_EAR", label: "Oreja izquierda" },
  { value: "RIGHT_EAR", label: "Oreja derecha" },
  { value: "MOUTH_LEFT", label: "Comisura izq." },
  { value: "MOUTH_RIGHT", label: "Comisura der." },
  { value: "LEFT_SHOULDER", label: "Hombro izquierdo" },
  { value: "RIGHT_SHOULDER", label: "Hombro derecho" },
  { value: "LEFT_ELBOW", label: "Codo izquierdo" },
  { value: "RIGHT_ELBOW", label: "Codo derecho" },
  { value: "LEFT_WRIST", label: "Muñeca izquierda" },
  { value: "RIGHT_WRIST", label: "Muñeca derecha" },
  { value: "LEFT_PINKY", label: "Meñique izq." },
  { value: "RIGHT_PINKY", label: "Meñique der." },
  { value: "LEFT_INDEX", label: "Índice izq." },
  { value: "RIGHT_INDEX", label: "Índice der." },
  { value: "LEFT_THUMB", label: "Pulgar izq." },
  { value: "RIGHT_THUMB", label: "Pulgar der." },
  { value: "LEFT_HIP", label: "Cadera izquierda" },
  { value: "RIGHT_HIP", label: "Cadera derecha" },
  { value: "LEFT_KNEE", label: "Rodilla izquierda" },
  { value: "RIGHT_KNEE", label: "Rodilla derecha" },
  { value: "LEFT_ANKLE", label: "Tobillo izquierdo" },
  { value: "RIGHT_ANKLE", label: "Tobillo derecho" },
  { value: "LEFT_HEEL", label: "Talón izquierdo" },
  { value: "RIGHT_HEEL", label: "Talón derecho" },
  { value: "LEFT_FOOT_INDEX", label: "Punta pie izq." },
  { value: "RIGHT_FOOT_INDEX", label: "Punta pie der." },
] as const;
const biomechanicsEventTypeOptions = ["SETUP", "DIP", "ANTEPENULTIMATE_CONTACT", "PRE_PENULTIMATE_FLIGHT", "PENULTIMATE_CONTACT", "LAST_CONTACT", "TAKE_OFF", "TOE_OFF", "FLIGHT", "APEX", "LANDING", "OTHER"] as const;
const activeBiomechanicsEventTypeOptions = ["SETUP", "DIP", "ANTEPENULTIMATE_CONTACT", "PRE_PENULTIMATE_FLIGHT", "PENULTIMATE_CONTACT", "TOE_OFF", "APEX", "LANDING", "OTHER"] as const;
const biomechanicsEventSourceOptions = ["AUTO", "MANUAL", "HYBRID"] as const;
const biomechanicsEventDetectorOptions = ["HIP_FOOT_HEURISTIC_V1"] as const;
const biomechanicsAngleSampleModeOptions = ["AT_EVENT", "WINDOW_MIN", "WINDOW_MAX", "WINDOW_AVERAGE"] as const;
const biomechanicsTrajectoryMetricOptions = ["DISPLACEMENT", "RANGE", "STABILITY"] as const;
const biomechanicsTrajectoryAxisOptions = ["X", "Y"] as const;
const biomechanicsTrajectoryReferenceModeOptions = ["ABSOLUTE", "DELTA_FROM_START"] as const;
const biomechanicsPreferredDirectionOptions = ["ANY", "LEFT_TO_RIGHT", "RIGHT_TO_LEFT"] as const;
const biomechanicsNormalizationModeOptions = ["AUTO", "MANUAL_ONLY"] as const;
const biomechanicsDerivedLandmarkOptions = ["HIP_CENTER"] as const;
const biomechanicsGroundReferenceModeOptions = ["LOWEST_FOOT"] as const;
const biomechanicsProgressionNormalizationModeOptions = ["PERCENT_OF_TOTAL_DROP"] as const;
const biomechanicsPlaneOptions = ["SAGITTAL_2D", "FRONTAL_2D", "TRANSVERSE_PROXY"] as const;
const referenceMotionProfileOptions = ["REAL_TIME", "SLOW_MOTION"] as const;
const strengthSeriesSummary = "Series 1-3 explosivas · serie 4 lenta y tecnica · serie 5 burnout/piramidal.";
const strengthSeriesLoadHint = "85% del 1RM aprox.; corta cuando baje la velocidad maxima.";
const strengthSeriesReminder = "RECUERDA: la subida siempre debe ser lo mas rapida posible; si la velocidad cae, la serie termina.";
const plyometricSeriesReminder = "RECUERDA: cada repeticion va a maxima intensidad y maxima velocidad; si cae la intensidad, para.";

function buildApiAssetUrl(bucket: string, objectKey: string) {
  const normalizedKey = objectKey
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join("/");

  return `${apiBaseUrl}/api/v1/assets/${encodeURIComponent(decodeURIComponent(bucket))}/${normalizedKey}`;
}

function normalizeMediaUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  const assetRouteMatch = url.match(/^(?:https?:\/\/[^/]+)?\/api\/v1\/assets\/([^/]+)\/(.+)$/i);

  if (assetRouteMatch) {
    const [, bucket, objectKey] = assetRouteMatch;
    if (bucket && objectKey) {
      return buildApiAssetUrl(bucket, objectKey);
    }
  }

  const bucketUrlMatch = url.match(/^https?:\/\/(?:localhost(?::(?:9000|9001))?|s3\.supernovatel\.com)\/([^/]+)\/(.+)$/i);
  if (bucketUrlMatch) {
    const [, bucket, objectKey] = bucketUrlMatch;
    if (bucket && objectKey) {
      return buildApiAssetUrl(bucket, objectKey);
    }
  }

  return url;
}

type MediaKind = "IMAGE" | "GIF" | "VIDEO";
type TeamRole = "TEAM_ADMIN" | "COACH" | "ATHLETE";
type SeasonPhase = (typeof seasonPhaseOptions)[number];
type SessionStatus = (typeof sessionStatusOptions)[number];
type SeriesProtocol = (typeof seriesProtocolOptions)[number];
type AdminView = "home" | "users" | "training" | "templates" | "technique";
type LandmarkName = (typeof poseLandmarkOptions)[number]["value"];
type TechniqueBiomechanicsEventType = (typeof biomechanicsEventTypeOptions)[number];
type TechniqueBiomechanicsEventSource = (typeof biomechanicsEventSourceOptions)[number];
type TechniqueBiomechanicsEventDetector = (typeof biomechanicsEventDetectorOptions)[number];
type TechniqueBiomechanicsAngleSampleMode = (typeof biomechanicsAngleSampleModeOptions)[number];
type TechniqueBiomechanicsTrajectoryMetric = (typeof biomechanicsTrajectoryMetricOptions)[number];
type TechniqueBiomechanicsTrajectoryAxis = (typeof biomechanicsTrajectoryAxisOptions)[number];
type TechniqueBiomechanicsTrajectoryReferenceMode = (typeof biomechanicsTrajectoryReferenceModeOptions)[number];
type TechniqueBiomechanicsPreferredDirection = (typeof biomechanicsPreferredDirectionOptions)[number];
type TechniqueBiomechanicsNormalizationMode = (typeof biomechanicsNormalizationModeOptions)[number];
type TechniqueBiomechanicsDerivedLandmark = (typeof biomechanicsDerivedLandmarkOptions)[number];
type TechniqueBiomechanicsGroundReferenceMode = (typeof biomechanicsGroundReferenceModeOptions)[number];
type TechniqueBiomechanicsProgressionNormalizationMode = (typeof biomechanicsProgressionNormalizationModeOptions)[number];
type TechniqueBiomechanicsAnglePlane = (typeof biomechanicsPlaneOptions)[number];
type TechniqueReferenceMotionProfile = (typeof referenceMotionProfileOptions)[number];
type TechniqueVisualEditorMode = "inspect" | "points" | "angles" | "events";

interface TechniqueVisualLandmarkPoint {
  landmark: LandmarkName;
  x: number;
  y: number;
}

interface TechniqueAngleOverlayModel {
  arcPath: string;
  bandPath: string | null;
  label: string;
  labelX: number;
  labelY: number;
  rangeLabel?: string;
  rangeLabelX?: number;
  rangeLabelY?: number;
}

const poseConnections: Array<[LandmarkName, LandmarkName]> = [
  ["LEFT_SHOULDER", "RIGHT_SHOULDER"],
  ["LEFT_SHOULDER", "LEFT_ELBOW"],
  ["LEFT_ELBOW", "LEFT_WRIST"],
  ["RIGHT_SHOULDER", "RIGHT_ELBOW"],
  ["RIGHT_ELBOW", "RIGHT_WRIST"],
  ["LEFT_SHOULDER", "LEFT_HIP"],
  ["RIGHT_SHOULDER", "RIGHT_HIP"],
  ["LEFT_HIP", "RIGHT_HIP"],
  ["LEFT_HIP", "LEFT_KNEE"],
  ["LEFT_KNEE", "LEFT_ANKLE"],
  ["RIGHT_HIP", "RIGHT_KNEE"],
  ["RIGHT_KNEE", "RIGHT_ANKLE"],
  ["LEFT_ANKLE", "LEFT_HEEL"],
  ["LEFT_HEEL", "LEFT_FOOT_INDEX"],
  ["RIGHT_ANKLE", "RIGHT_HEEL"],
  ["RIGHT_HEEL", "RIGHT_FOOT_INDEX"],
] as const;

const landmarkIndexByName = Object.fromEntries(
  poseLandmarkOptions.map((option, index) => [option.value, index]),
) as Record<LandmarkName, number>;

interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  platformRole: string | null;
  teamRoles?: string[];
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

interface AdminSummary {
  metrics: {
    users: number;
    teams: number;
    athletes: number;
    exercises: number;
    templates: number;
    programs: number;
    sessions: number;
  };
}

interface BasicUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface ExerciseInstruction {
  id: string;
  locale: string;
  summary: string | null;
  steps: string;
  safetyNotes: string | null;
}

interface ExerciseMediaAsset {
  id: string;
  kind: MediaKind;
  url: string | null;
  title: string | null;
  objectKey: string;
  isPrimary: boolean;
}

interface ExerciseRecord {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  equipment: string | null;
  requiresLoad: boolean;
  perLeg: boolean;
  isBlock: boolean;
  defaultSeriesProtocol: SeriesProtocol;
  instructions: ExerciseInstruction[];
  mediaAssets: ExerciseMediaAsset[];
  asBlock: {
    id: string;
    items: Array<{
      id: string;
      order: number;
      setsOverride: number | null;
      repsOverride: string | null;
      notes: string | null;
      exercise: { id: string; name: string; slug: string; category: string };
    }>;
  } | null;
}

interface TeamMembershipRecord {
  id: string;
  role: TeamRole;
  user: BasicUser;
}

interface CoachAssignmentRecord {
  id: string;
  coach: BasicUser;
}

interface AthleteProgramBadge {
  id: string;
  name: string;
  status: string;
  startDate: string;
}

interface AthleteProfileRecord {
  id: string;
  displayName: string;
  sport: string | null;
  trainsSport: boolean;
  seasonPhase: SeasonPhase;
  weeklyAvailability: { availableWeekdays?: number[] } | null;
  sportTrainingDays: { trainingDays?: number[] } | null;
  onboardingCompletedAt: string | null;
  notes: string | null;
  exerciseExclusions: string[] | null;
  user: BasicUser;
  team?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  coachAssignments: CoachAssignmentRecord[];
  personalPrograms: AthleteProgramBadge[];
}

interface ProgramTemplateMeta {
  id: string;
  code: string;
  name: string;
  description: string | null;
  techniqueTitle: string | null;
  techniqueDescription: string | null;
  cycleLengthDays: number;
  isEditable: boolean;
  techniqueMediaAssets: Array<{ id: string }>;
  _count: { days: number; personalPrograms: number };
}

interface TemplateFormState {
  id?: string;
  code: string;
  name: string;
  description: string;
  cycleLengthDays: string;
}

interface TeamRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  memberships: TeamMembershipRecord[];
  athletes: AthleteProfileRecord[];
}

interface ScheduledSessionPreview {
  id: string;
  title: string;
  dayType: string;
  status: string;
  scheduledDate: string;
}

interface PersonalProgramRecord {
  id: string;
  name: string;
  status: string;
  startDate: string;
  phase: string;
  athleteProfile: {
    id: string;
    displayName: string;
    user: BasicUser;
    team: {
      id: string;
      name: string;
      slug: string;
    };
  };
  template: {
    id: string;
    code: string;
    name: string;
  };
  sessions: ScheduledSessionPreview[];
}

interface AdminSessionRecord {
  id: string;
  title: string;
  dayType: string;
  status: SessionStatus;
  scheduledDate: string;
  notes: string | null;
  personalProgram: {
    id: string;
    name: string;
    athleteProfile: {
      id: string;
      displayName: string | null;
      user: BasicUser;
      team: {
        id: string;
        name: string;
        slug: string;
      } | null;
    };
  };
  sessionExercises: Array<{
    id: string;
    orderIndex: number;
    sets: number | null;
    repsText: string | null;
    durationSeconds: number | null;
    restSeconds: number | null;
    loadText: string | null;
    notes: string | null;
    completedAt: string | null;
    exercise: {
      id: string;
      name: string;
      category: string;
    };
  }>;
  logs: Array<{
    id: string;
    notes: string | null;
    perceivedExertion: number | null;
    createdAt: string;
    athleteProfile: {
      id: string;
      user: BasicUser;
    };
  }>;
}

interface SessionEditorState {
  title: string;
  scheduledDate: string;
  status: SessionStatus;
  notes: string;
}

interface CoachDashboardResponse {
  coach: BasicUser & {
    memberships: Array<{
      id: string;
      role: string;
      team: {
        id: string;
        name: string;
        slug: string;
      };
    }>;
  };
  metrics: {
    athletes: number;
    activePrograms: number;
    recentLogs: number;
  };
  athletes: Array<{
    id: string;
    displayName: string | null;
    sport: string | null;
    seasonPhase: string;
    notes: string | null;
    user: BasicUser;
    team: {
      id: string;
      name: string;
      slug: string;
    } | null;
    personalPrograms: Array<{
      id: string;
      name: string;
      status: string;
      startDate: string;
      sessions: ScheduledSessionPreview[];
    }>;
    sessionLogs: Array<{
      id: string;
      notes: string | null;
      perceivedExertion: number | null;
      createdAt: string;
      scheduledSession: ScheduledSessionPreview;
    }>;
  }>;
}

interface ExerciseFormState {
  id?: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  equipment: string;
  requiresLoad: boolean;
  perLeg: boolean;
  isBlock: boolean;
  defaultSeriesProtocol: Extract<SeriesProtocol, "NONE" | "STRENGTH_EXPLOSION">;
  summary: string;
  steps: string;
  safetyNotes: string;
}

interface TeamFormState {
  id?: string;
  name: string;
  slug: string;
  description: string;
}

interface MemberFormState {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Extract<TeamRole, "TEAM_ADMIN" | "COACH">;
}

interface AthleteFormState {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName: string;
  sport: string;
  trainsSport: boolean;
  sportTrainingDays: string;
  seasonPhase: SeasonPhase;
  availableWeekdays: string;
  notes: string;
}

interface ProgramGenerationState {
  athleteProfileId: string;
  templateCode: string;
  startDate: string;
  phase: "" | SeasonPhase;
  includePreparationPhase: boolean;
  notes: string;
}

interface PrescriptionRecord {
  id?: string;
  exerciseId: string;
  orderIndex: number;
  seriesProtocol: Extract<SeriesProtocol, "NONE" | "PLYOMETRIC_SPEED">;
  blockLabel: string;
  sets: string;
  repsText: string;
  durationSeconds: string;
  restSeconds: string;
  loadText: string;
  tempoText: string;
  notes: string;
}

interface ProgramDay {
  id: string;
  dayNumber: number;
  title: string;
  dayType: string;
  prescriptions: Array<{
    id: string;
    orderIndex: number;
    exerciseId: string;
    seriesProtocol: SeriesProtocol;
    blockLabel: string | null;
    sets: number | null;
    repsText: string | null;
    durationSeconds: number | null;
    restSeconds: number | null;
    loadText: string | null;
    tempoText: string | null;
    notes: string | null;
    exercise: ExerciseRecord;
  }>;
}

interface ProgramTechniqueMediaAsset {
  id: string;
  kind: MediaKind;
  url: string | null;
  title: string | null;
  isPrimary: boolean;
}

interface ProgramTechniqueMeasurementDefinition {
  id: string;
  label: string;
  instructions: string | null;
  allowedUnits: unknown;
  orderIndex: number;
}

interface TechniqueBiomechanicsFocusPointRecord {
  id: string;
  label: string;
  landmark: LandmarkName;
  cue: string | null;
  notes: string | null;
}

interface TechniqueBiomechanicsPointCheckRecord {
  id: string;
  label: string;
  landmark: LandmarkName;
  axis: TechniqueBiomechanicsTrajectoryAxis;
  referenceMode: TechniqueBiomechanicsTrajectoryReferenceMode;
  anchorEventId: string | null;
  anchorEventType: TechniqueBiomechanicsEventType | null;
  windowStartEventId: string | null;
  windowEndEventId: string | null;
  sampleMode: TechniqueBiomechanicsAngleSampleMode | null;
  targetMin: number | null;
  targetMax: number | null;
  phase: string | null;
  notes: string | null;
}

interface TechniqueBiomechanicsAngleCheckRecord {
  id: string;
  label: string;
  pointA: LandmarkName;
  vertex: LandmarkName;
  pointC: LandmarkName;
  plane: TechniqueBiomechanicsAnglePlane;
  anchorEventId: string | null;
  anchorEventType: TechniqueBiomechanicsEventType | null;
  windowStartEventId: string | null;
  windowEndEventId: string | null;
  sampleMode: TechniqueBiomechanicsAngleSampleMode | null;
  targetMinDeg: number | null;
  targetMaxDeg: number | null;
  phase: string | null;
  notes: string | null;
}

interface TechniqueBiomechanicsTrajectoryCheckRecord {
  id: string;
  label: string;
  landmark: LandmarkName;
  windowStartEventId: string | null;
  windowEndEventId: string | null;
  metric: TechniqueBiomechanicsTrajectoryMetric;
  axis: TechniqueBiomechanicsTrajectoryAxis;
  referenceMode: TechniqueBiomechanicsTrajectoryReferenceMode;
  targetMin: number | null;
  targetMax: number | null;
  notes: string | null;
}

interface TechniqueBiomechanicsOrientationPolicyRecord {
  allowMirror: boolean;
  preferredTravelDirection: TechniqueBiomechanicsPreferredDirection;
  manualOverrideAllowed: boolean;
  normalizationMode: TechniqueBiomechanicsNormalizationMode;
}

interface TechniqueBiomechanicsHipProgressionStepRecord {
  eventType: TechniqueBiomechanicsEventType;
  targetCumulativeDropMinPercent: number | null;
  targetCumulativeDropMaxPercent: number | null;
}

interface TechniqueBiomechanicsHipProgressionCheckRecord {
  id: string;
  label: string;
  derivedLandmark: TechniqueBiomechanicsDerivedLandmark;
  axis: "Y";
  groundReferenceMode: TechniqueBiomechanicsGroundReferenceMode;
  normalizationMode: TechniqueBiomechanicsProgressionNormalizationMode;
  requireMonotonic: boolean;
  steps: TechniqueBiomechanicsHipProgressionStepRecord[];
  notes: string | null;
}

interface TechniqueBiomechanicsJumpHeightMeasurementRecord {
  enabled: boolean;
  subjectHeightCm: number | null;
  playbackSpeedRatio: number | null;
  flightTimeMethodEnabled: boolean;
  centerOfMassMethodEnabled: boolean;
  consensusToleranceCm: number | null;
  notes: string | null;
}

interface TechniqueBiomechanicsKeyEventRecord {
  id: string;
  label: string;
  eventType: TechniqueBiomechanicsEventType;
  frameIndex: number | null;
  frameHint: string | null;
  source: TechniqueBiomechanicsEventSource;
  confidence: number | null;
  detector: TechniqueBiomechanicsEventDetector | null;
  notes: string | null;
}

interface TechniqueBiomechanicsConfig {
  schemaVersion: 1;
  referenceMediaAssetId: string | null;
  referenceMotionProfile: TechniqueReferenceMotionProfile | null;
  focusPoints: TechniqueBiomechanicsFocusPointRecord[];
  pointChecks: TechniqueBiomechanicsPointCheckRecord[];
  angleChecks: TechniqueBiomechanicsAngleCheckRecord[];
  trajectoryChecks: TechniqueBiomechanicsTrajectoryCheckRecord[];
  hipProgressionChecks: TechniqueBiomechanicsHipProgressionCheckRecord[];
  keyEvents: TechniqueBiomechanicsKeyEventRecord[];
  jumpHeightMeasurement: TechniqueBiomechanicsJumpHeightMeasurementRecord;
  orientationPolicy: TechniqueBiomechanicsOrientationPolicyRecord;
  coachNotes: string | null;
}

interface ProgramTechniqueRecord {
  id: string;
  title: string;
  description: string | null;
  measurementInstructions: string | null;
  proVideoUrl: string | null;
  proLandmarks: TechniqueProLandmarks | null;
  biomechanicsConfig: TechniqueBiomechanicsConfig | null;
  comparisonEnabled: boolean;
  orderIndex: number;
  mediaAssets: ProgramTechniqueMediaAsset[];
  measurementDefinitions: ProgramTechniqueMeasurementDefinition[];
}

interface ProgramTemplateResponse {
  template: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    cycleLengthDays?: number;
    techniqueTitle: string | null;
    techniqueDescription: string | null;
    techniqueMediaAssets: ProgramTechniqueMediaAsset[];
    techniques: ProgramTechniqueRecord[];
    days: ProgramDay[];
  };
}

interface TechniqueMeasurementDraft {
  id?: string;
  label: string;
  instructions: string;
  allowedUnitsText: string;
}

interface TechniqueBiomechanicsFocusPointDraft {
  id: string;
  label: string;
  landmark: LandmarkName;
  cue: string;
  notes: string;
}

interface TechniqueBiomechanicsPointCheckDraft {
  id: string;
  label: string;
  landmark: LandmarkName;
  axis: TechniqueBiomechanicsTrajectoryAxis;
  referenceMode: TechniqueBiomechanicsTrajectoryReferenceMode;
  anchorEventId: string;
  anchorEventType: TechniqueBiomechanicsEventType | "";
  windowStartEventId: string;
  windowEndEventId: string;
  sampleMode: TechniqueBiomechanicsAngleSampleMode | "";
  targetMin: string;
  targetMax: string;
  phase: string;
  notes: string;
}

interface TechniqueBiomechanicsAngleCheckDraft {
  id: string;
  label: string;
  pointA: LandmarkName;
  vertex: LandmarkName;
  pointC: LandmarkName;
  plane: TechniqueBiomechanicsAnglePlane;
  anchorEventId: string;
  anchorEventType: TechniqueBiomechanicsEventType | "";
  windowStartEventId: string;
  windowEndEventId: string;
  sampleMode: TechniqueBiomechanicsAngleSampleMode | "";
  targetMinDeg: string;
  targetMaxDeg: string;
  phase: string;
  notes: string;
}

interface TechniqueBiomechanicsTrajectoryCheckDraft {
  id: string;
  label: string;
  landmark: LandmarkName;
  windowStartEventId: string;
  windowEndEventId: string;
  metric: TechniqueBiomechanicsTrajectoryMetric;
  axis: TechniqueBiomechanicsTrajectoryAxis;
  referenceMode: TechniqueBiomechanicsTrajectoryReferenceMode;
  targetMin: string;
  targetMax: string;
  notes: string;
}

interface TechniqueBiomechanicsOrientationPolicyDraft {
  allowMirror: boolean;
  preferredTravelDirection: TechniqueBiomechanicsPreferredDirection;
  manualOverrideAllowed: boolean;
  normalizationMode: TechniqueBiomechanicsNormalizationMode;
}

interface TechniqueBiomechanicsHipProgressionStepDraft {
  eventType: TechniqueBiomechanicsEventType;
  targetCumulativeDropMinPercent: string;
  targetCumulativeDropMaxPercent: string;
}

interface TechniqueBiomechanicsHipProgressionCheckDraft {
  id: string;
  label: string;
  derivedLandmark: TechniqueBiomechanicsDerivedLandmark;
  axis: "Y";
  groundReferenceMode: TechniqueBiomechanicsGroundReferenceMode;
  normalizationMode: TechniqueBiomechanicsProgressionNormalizationMode;
  requireMonotonic: boolean;
  steps: TechniqueBiomechanicsHipProgressionStepDraft[];
  notes: string;
}

interface TechniqueBiomechanicsJumpHeightMeasurementDraft {
  enabled: boolean;
  subjectHeightCm: string;
  playbackSpeedRatio: string;
  flightTimeMethodEnabled: boolean;
  centerOfMassMethodEnabled: boolean;
  consensusToleranceCm: string;
  notes: string;
}

interface TechniqueBiomechanicsKeyEventDraft {
  id: string;
  label: string;
  eventType: TechniqueBiomechanicsEventType;
  frameIndex: string;
  frameHint: string;
  source: TechniqueBiomechanicsEventSource;
  confidence: string;
  detector: TechniqueBiomechanicsEventDetector | "";
  notes: string;
}

interface TechniqueBiomechanicsFormState {
  referenceMotionProfile: TechniqueReferenceMotionProfile;
  focusPoints: TechniqueBiomechanicsFocusPointDraft[];
  pointChecks: TechniqueBiomechanicsPointCheckDraft[];
  angleChecks: TechniqueBiomechanicsAngleCheckDraft[];
  trajectoryChecks: TechniqueBiomechanicsTrajectoryCheckDraft[];
  hipProgressionChecks: TechniqueBiomechanicsHipProgressionCheckDraft[];
  keyEvents: TechniqueBiomechanicsKeyEventDraft[];
  jumpHeightMeasurement: TechniqueBiomechanicsJumpHeightMeasurementDraft;
  orientationPolicy: TechniqueBiomechanicsOrientationPolicyDraft;
  coachNotes: string;
}

interface TechniqueFormState {
  id?: string;
  title: string;
  description: string;
  measurementInstructions: string;
  comparisonEnabled: boolean;
  measurements: TechniqueMeasurementDraft[];
  biomechanics: TechniqueBiomechanicsFormState;
}

interface TechniquePoseProcessingState {
  status: "idle" | "uploading" | "processing" | "error";
  processedFrames: number;
  totalFrames: number;
  detail: string;
}

interface TechniqueEventDetectionDebugState {
  eventCount: number;
  debug: AutoDetectedTechniqueDebugData;
}

interface TechniqueUploadState {
  kind: MediaKind;
  title: string;
  isPrimary: boolean;
  useAsProReference: boolean;
  referenceMotionProfile: TechniqueReferenceMotionProfile;
  file: File | null;
}

const emptyExerciseForm = (): ExerciseFormState => ({
  name: "",
  slug: "",
  category: "",
  description: "",
  equipment: "",
  requiresLoad: false,
  perLeg: false,
  isBlock: false,
  defaultSeriesProtocol: "NONE",
  summary: "",
  steps: "",
  safetyNotes: "",
});

const emptyTeamForm = (): TeamFormState => ({
  name: "",
  slug: "",
  description: "",
});

const emptyMemberForm = (): MemberFormState => ({
  email: "",
  password: "Temp123!",
  firstName: "",
  lastName: "",
  role: "COACH",
});

const emptyAthleteForm = (): AthleteFormState => ({
  email: "",
  password: "Temp123!",
  firstName: "",
  lastName: "",
  displayName: "",
  sport: "",
  trainsSport: false,
  sportTrainingDays: "2,4",
  seasonPhase: "OFF_SEASON",
  availableWeekdays: "1,3,5",
  notes: "",
});

const emptyProgramGeneration = (): ProgramGenerationState => ({
  athleteProfileId: "",
  templateCode: "JUMP-MANUAL-14D",
  startDate: new Date().toISOString().slice(0, 10),
  phase: "",
  includePreparationPhase: true,
  notes: "",
});

const emptyTemplateForm = (): TemplateFormState => ({
  code: "",
  name: "",
  description: "",
  cycleLengthDays: "14",
});

function createDefaultHipProgressionStepDraft(
  eventType: TechniqueBiomechanicsEventType,
  targetCumulativeDropMinPercent: string,
  targetCumulativeDropMaxPercent: string,
): TechniqueBiomechanicsHipProgressionStepDraft {
  return {
    eventType,
    targetCumulativeDropMinPercent,
    targetCumulativeDropMaxPercent,
  };
}

function createDefaultHipProgressionCheckDraft(): TechniqueBiomechanicsHipProgressionCheckDraft {
  return {
    id: createDraftId(),
    label: "Descenso progresivo de cadera",
    derivedLandmark: "HIP_CENTER",
    axis: "Y",
    groundReferenceMode: "LOWEST_FOOT",
    normalizationMode: "PERCENT_OF_TOTAL_DROP",
    requireMonotonic: true,
    steps: [
      createDefaultHipProgressionStepDraft("SETUP", "0", "5"),
      createDefaultHipProgressionStepDraft("ANTEPENULTIMATE_CONTACT", "15", "45"),
      createDefaultHipProgressionStepDraft("PENULTIMATE_CONTACT", "45", "80"),
      createDefaultHipProgressionStepDraft("TOE_OFF", "90", "100"),
    ],
    notes: "La cadera debe bajar progresivamente antes del último apoyo, sin colapsar todo el descenso en un solo paso.",
  };
}

function createDefaultJumpHeightMeasurementDraft(): TechniqueBiomechanicsJumpHeightMeasurementDraft {
  return {
    enabled: false,
    subjectHeightCm: "",
    playbackSpeedRatio: "",
    flightTimeMethodEnabled: true,
    centerOfMassMethodEnabled: true,
    consensusToleranceCm: "6",
    notes: "Corroborar la altura del salto con tiempo de vuelo y centro de masas relativo al suelo.",
  };
}

const emptyTechniqueForm = (): TechniqueFormState => ({
  title: "",
  description: "",
  measurementInstructions: "",
  comparisonEnabled: false,
  measurements: [],
  biomechanics: {
    referenceMotionProfile: "REAL_TIME",
    focusPoints: [],
    pointChecks: [],
    angleChecks: [],
    trajectoryChecks: [],
    hipProgressionChecks: [],
    keyEvents: [],
    jumpHeightMeasurement: createDefaultJumpHeightMeasurementDraft(),
    orientationPolicy: {
      allowMirror: true,
      preferredTravelDirection: "ANY",
      manualOverrideAllowed: true,
      normalizationMode: "AUTO",
    },
    coachNotes: "",
  },
});

const emptyTechniqueMeasurementDraft = (): TechniqueMeasurementDraft => ({
  label: "",
  instructions: "",
  allowedUnitsText: "cm",
});

const emptyTechniquePoseProcessingState = (): TechniquePoseProcessingState => ({
  status: "idle",
  processedFrames: 0,
  totalFrames: 0,
  detail: "",
});

const emptyTechniqueUploadState = (): TechniqueUploadState => ({
  kind: "VIDEO",
  title: "",
  isPrimary: false,
  useAsProReference: true,
  referenceMotionProfile: "REAL_TIME",
  file: null,
});

const emptySessionEditor = (): SessionEditorState => ({
  title: "",
  scheduledDate: "",
  status: "PLANNED",
  notes: "",
});

const emptyPrescription = (orderIndex: number, exerciseId = ""): PrescriptionRecord => ({
  exerciseId,
  orderIndex,
  seriesProtocol: "NONE",
  blockLabel: "",
  sets: "",
  repsText: "",
  durationSeconds: "",
  restSeconds: "",
  loadText: "",
  tempoText: "",
  notes: "",
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function displayName(user: BasicUser) {
  const value = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return value || user.email;
}

function seriesProtocolLabel(protocol: SeriesProtocol) {
  if (protocol === "STRENGTH_EXPLOSION") {
    return "Serie de fuerza y explosion";
  }

  if (protocol === "PLYOMETRIC_SPEED") {
    return "Serie pliometrica";
  }

  return "Sin serie especial";
}

function strengthSeriesPreview() {
  return {
    sets: "5",
    repsText: strengthSeriesSummary,
    restSeconds: "45",
    loadText: strengthSeriesLoadHint,
    tempoText: "Negativa lenta · positiva explosiva",
  };
}

function formatWeekdaySummary(weekdays: number[]) {
  if (!weekdays.length) {
    return "Sin restriccion";
  }

  return weekdays
    .sort((left, right) => left - right)
    .map((value) => weekdayLabels[value] ?? String(value))
    .join(", ");
}

function parseWeekdaysInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6),
    ),
  ).sort((left, right) => left - right);
}

function athleteWeekdays(athlete: AthleteProfileRecord) {
  const weekdays = athlete.weeklyAvailability?.availableWeekdays;
  return Array.isArray(weekdays) ? weekdays.filter((value) => typeof value === "number") : [];
}

function athleteSportWeekdays(athlete: AthleteProfileRecord) {
  const weekdays = athlete.sportTrainingDays?.trainingDays;
  return Array.isArray(weekdays) ? weekdays.filter((value) => typeof value === "number") : [];
}

function mapExerciseToForm(exercise: ExerciseRecord): ExerciseFormState {
  const instruction = exercise.instructions.find((entry) => entry.locale === "es") ?? exercise.instructions[0];

  return {
    id: exercise.id,
    name: exercise.name,
    slug: exercise.slug,
    category: exercise.category,
    description: exercise.description ?? "",
    equipment: exercise.equipment ?? "",
    requiresLoad: exercise.requiresLoad ?? false,
    perLeg: exercise.perLeg ?? false,
    isBlock: exercise.isBlock ?? false,
    defaultSeriesProtocol: exercise.defaultSeriesProtocol === "STRENGTH_EXPLOSION" ? "STRENGTH_EXPLOSION" : "NONE",
    summary: instruction?.summary ?? exercise.description ?? "",
    steps: instruction?.steps ?? "",
    safetyNotes: instruction?.safetyNotes ?? "",
  };
}

function mapTeamToForm(team: TeamRecord): TeamFormState {
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    description: team.description ?? "",
  };
}

function mapMemberToForm(membership: TeamMembershipRecord): MemberFormState {
  return {
    email: membership.user.email,
    password: "",
    firstName: membership.user.firstName ?? "",
    lastName: membership.user.lastName ?? "",
    role: membership.role === "TEAM_ADMIN" ? "TEAM_ADMIN" : "COACH",
  };
}

function mapAthleteToForm(athlete: AthleteProfileRecord): AthleteFormState {
  return {
    email: athlete.user.email,
    password: "",
    firstName: athlete.user.firstName ?? "",
    lastName: athlete.user.lastName ?? "",
    displayName: athlete.displayName,
    sport: athlete.sport ?? "",
    trainsSport: athlete.trainsSport,
    sportTrainingDays: athleteSportWeekdays(athlete).join(","),
    seasonPhase: athlete.seasonPhase,
    availableWeekdays: athleteWeekdays(athlete).join(","),
    notes: athlete.notes ?? "",
  };
}

function mapDayToDraft(day: ProgramDay): PrescriptionRecord[] {
  return day.prescriptions.map((item) => ({
    id: item.id,
    exerciseId: item.exerciseId,
    orderIndex: item.orderIndex,
    seriesProtocol: item.seriesProtocol === "PLYOMETRIC_SPEED" ? "PLYOMETRIC_SPEED" : "NONE",
    blockLabel: item.blockLabel ?? "",
    sets: item.sets?.toString() ?? "",
    repsText: item.repsText ?? "",
    durationSeconds: item.durationSeconds?.toString() ?? "",
    restSeconds: item.restSeconds?.toString() ?? "",
    loadText: item.loadText ?? "",
    tempoText: item.tempoText ?? "",
    notes: item.notes ?? "",
  }));
}

function mapSessionToEditor(session: AdminSessionRecord): SessionEditorState {
  return {
    title: session.title,
    scheduledDate: session.scheduledDate.slice(0, 10),
    status: session.status,
    notes: session.notes ?? "",
  };
}

async function requestJson<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${apiBaseUrl}${normalizedPath}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    issues?: Array<{ path?: Array<string | number>; message?: string }>;
  } & T;

  if (!response.ok) {
    const issueSummary = Array.isArray(data.issues)
      ? data.issues
        .map((issue) => {
          const issuePath = Array.isArray(issue.path) && issue.path.length ? issue.path.join(".") : "payload";
          return `${issuePath}: ${issue.message ?? "valor inválido"}`;
        })
        .join(" | ")
      : "";

    throw new Error(issueSummary ? `${data.message ?? "Request failed"} - ${issueSummary}` : (data.message ?? "Request failed"));
  }

  return data;
}

function formatTechniquePoseSummary(landmarks: TechniqueProLandmarks | null | undefined) {
  if (!landmarks) {
    return "Sin referencia biomecánica procesada todavía.";
  }

  const fpsLabel = Number.isFinite(landmarks.fps) ? `${landmarks.fps.toFixed(1)} fps` : "fps s/d";
  return `${landmarks.frameCount} frame(s) útiles · ${fpsLabel} · ${landmarks.keypointsModel}`;
}

function createDraftId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

function buildFrameHintFromLandmarks(landmarks: TechniqueProLandmarks | null | undefined, frameIndex: number) {
  const frame = landmarks?.frames[frameIndex] ?? null;
  if (!frame) {
    return `Frame ${frameIndex + 1}`;
  }

  return buildFrameHint(frameIndex, frame.timestampMs);
}

function getManualOverrideSource(source: TechniqueBiomechanicsEventSource): TechniqueBiomechanicsEventSource {
  return source === "AUTO" ? "HYBRID" : "MANUAL";
}

function buildAutoDetectedEventNotes(eventType: TechniqueBiomechanicsEventType) {
  if (eventType === "PRE_PENULTIMATE_FLIGHT") {
    return "Buscar el gesto aéreo previo al penúltimo apoyo: idealmente alrededor de 2 frames antes del contacto a 15 fps, con pierna trasera cerca de 90° en rodilla, brazos atrás estirados con muñecas cerca de la altura del hombro, tronco vertical y pierna delantera larga en un ángulo aproximado de 100° a 130° respecto al tronco.";
  }

  return null;
}

/**
 * Measures an angle in degrees from 3 landmark positions in a frame.
 * Returns null if any landmark is missing or the angle cannot be computed.
 */
function measureAngleDegFromLandmarks(
  frame: { landmarks: Array<{ x: number; y: number; z?: number }> } | undefined,
  pointAIndex: number,
  vertexIndex: number,
  pointCIndex: number,
): number | null {
  const pA = frame?.landmarks[pointAIndex];
  const pV = frame?.landmarks[vertexIndex];
  const pC = frame?.landmarks[pointCIndex];
  if (!pA || !pV || !pC) return null;
  const vAx = pA.x - pV.x, vAy = pA.y - pV.y;
  const vCx = pC.x - pV.x, vCy = pC.y - pV.y;
  const mag = Math.hypot(vAx, vAy) * Math.hypot(vCx, vCy);
  if (!mag) return null;
  const cosine = Math.max(-1, Math.min(1, (vAx * vCx + vAy * vCy) / mag));
  return (Math.acos(cosine) * 180) / Math.PI;
}

/**
 * For each detected key event, measures relevant joint angles from the reference
 * landmarks and creates angle check drafts with ±15° target corridors.
 * The admin can review and discard any that don't apply to their technique.
 */
function buildAutoSuggestedAngleCheckDrafts(
  landmarks: { frames: Array<{ landmarks: Array<{ x: number; y: number; z?: number }> }> },
  keyEventDrafts: TechniqueBiomechanicsKeyEventDraft[],
): TechniqueBiomechanicsAngleCheckDraft[] {
  const MARGIN = 15;

  const getEventId = (eventType: TechniqueBiomechanicsEventType) =>
    keyEventDrafts.find((e) => e.eventType === eventType)?.id ?? "";

  const getFrameIndex = (eventType: TechniqueBiomechanicsEventType): number | null => {
    const fi = Number(keyEventDrafts.find((e) => e.eventType === eventType)?.frameIndex ?? "");
    return Number.isFinite(fi) ? fi : null;
  };

  interface AngleDef {
    label: string;
    pointA: LandmarkName;
    vertex: LandmarkName;
    pointC: LandmarkName;
    anchorEventType: TechniqueBiomechanicsEventType;
    phase?: string;
  }

  const definitions: AngleDef[] = [
    // ── DIP ──────────────────────────────────────────────────────────────────
    { label: "Rodilla izq. en DIP",          pointA: "LEFT_HIP",       vertex: "LEFT_KNEE",   pointC: "LEFT_ANKLE",  anchorEventType: "DIP", phase: "Dip" },
    { label: "Rodilla der. en DIP",          pointA: "RIGHT_HIP",      vertex: "RIGHT_KNEE",  pointC: "RIGHT_ANKLE", anchorEventType: "DIP", phase: "Dip" },
    { label: "Tronco izq. en DIP",           pointA: "LEFT_SHOULDER",  vertex: "LEFT_HIP",    pointC: "LEFT_KNEE",   anchorEventType: "DIP", phase: "Dip" },
    { label: "Tronco der. en DIP",           pointA: "RIGHT_SHOULDER", vertex: "RIGHT_HIP",   pointC: "RIGHT_KNEE",  anchorEventType: "DIP", phase: "Dip" },
    // ── TOE_OFF ──────────────────────────────────────────────────────────────
    { label: "Rodilla izq. en Salida de Punta", pointA: "LEFT_HIP",       vertex: "LEFT_KNEE",   pointC: "LEFT_ANKLE",       anchorEventType: "TOE_OFF", phase: "Despegue" },
    { label: "Rodilla der. en Salida de Punta", pointA: "RIGHT_HIP",      vertex: "RIGHT_KNEE",  pointC: "RIGHT_ANKLE",      anchorEventType: "TOE_OFF", phase: "Despegue" },
    { label: "Tobillo izq. en Salida de Punta", pointA: "LEFT_KNEE",      vertex: "LEFT_ANKLE",  pointC: "LEFT_FOOT_INDEX",  anchorEventType: "TOE_OFF", phase: "Despegue" },
    { label: "Tobillo der. en Salida de Punta", pointA: "RIGHT_KNEE",     vertex: "RIGHT_ANKLE", pointC: "RIGHT_FOOT_INDEX", anchorEventType: "TOE_OFF", phase: "Despegue" },
    // ── APEX ──────────────────────────────────────────────────────────────────
    { label: "Rodilla izq. en APEX",         pointA: "LEFT_HIP",       vertex: "LEFT_KNEE",   pointC: "LEFT_ANKLE",  anchorEventType: "APEX", phase: "Vuelo" },
    { label: "Rodilla der. en APEX",         pointA: "RIGHT_HIP",      vertex: "RIGHT_KNEE",  pointC: "RIGHT_ANKLE", anchorEventType: "APEX", phase: "Vuelo" },
    // ── LANDING ───────────────────────────────────────────────────────────────
    { label: "Rodilla izq. en Aterrizaje",   pointA: "LEFT_HIP",       vertex: "LEFT_KNEE",   pointC: "LEFT_ANKLE",  anchorEventType: "LANDING", phase: "Aterrizaje" },
    { label: "Rodilla der. en Aterrizaje",   pointA: "RIGHT_HIP",      vertex: "RIGHT_KNEE",  pointC: "RIGHT_ANKLE", anchorEventType: "LANDING", phase: "Aterrizaje" },
    { label: "Cadera izq. en Aterrizaje",    pointA: "LEFT_SHOULDER",  vertex: "LEFT_HIP",    pointC: "LEFT_KNEE",   anchorEventType: "LANDING", phase: "Aterrizaje" },
    { label: "Cadera der. en Aterrizaje",    pointA: "RIGHT_SHOULDER", vertex: "RIGHT_HIP",   pointC: "RIGHT_KNEE",  anchorEventType: "LANDING", phase: "Aterrizaje" },
  ];

  const drafts: TechniqueBiomechanicsAngleCheckDraft[] = [];

  for (const def of definitions) {
    const eventId = getEventId(def.anchorEventType);
    if (!eventId) continue;

    const frameIndex = getFrameIndex(def.anchorEventType);
    const frame = frameIndex !== null ? landmarks.frames[frameIndex] : undefined;
    const pAIdx = landmarkIndexByName[def.pointA] ?? -1;
    const pVIdx = landmarkIndexByName[def.vertex] ?? -1;
    const pCIdx = landmarkIndexByName[def.pointC] ?? -1;
    const measuredDeg = measureAngleDegFromLandmarks(frame, pAIdx, pVIdx, pCIdx);

    const targetMinDeg = measuredDeg !== null
      ? String(Math.max(0, Math.round(measuredDeg - MARGIN)))
      : "";
    const targetMaxDeg = measuredDeg !== null
      ? String(Math.min(360, Math.round(measuredDeg + MARGIN)))
      : "";

    drafts.push({
      id: createDraftId(),
      label: def.label,
      pointA: def.pointA,
      vertex: def.vertex,
      pointC: def.pointC,
      plane: "SAGITTAL_2D",
      anchorEventId: eventId,
      anchorEventType: def.anchorEventType,
      windowStartEventId: "",
      windowEndEventId: "",
      sampleMode: "AT_EVENT",
      targetMinDeg,
      targetMaxDeg,
      phase: def.phase ?? "",
      notes: measuredDeg !== null
        ? `Auto-sugerido: valor medido en referencia ≈ ${Math.round(measuredDeg)}° (±15° de margen).`
        : "Auto-sugerido: sin landmarks suficientes en este frame para medir el valor actual.",
    });
  }

  return drafts;
}

function formatSupportLabel(label: AutoDetectedTechniqueSupportLabel) {
  if (label === "LEFT") {
    return "Apoyo izquierdo";
  }

  if (label === "RIGHT") {
    return "Apoyo derecho";
  }

  return "Aéreo";
}

function formatDetectionSelectionSource(source: TechniqueEventDetectionDebugState["debug"]["selections"][number]["source"]) {
  if (source === "support-run") {
    return "corrida de apoyo";
  }

  if (source === "alternating-peak") {
    return "pico alternado";
  }

  if (source === "posture-choice") {
    return "corrida aérea + postura";
  }

  if (source === "airborne-run") {
    return "corrida aérea";
  }

  return "fallback temporal";
}

function mergeAutoDetectedKeyEventRecords(
  currentEvents: TechniqueBiomechanicsKeyEventRecord[],
  detectedEvents: AutoDetectedTechniqueKeyEvent[],
  landmarks: TechniqueProLandmarks,
): TechniqueBiomechanicsKeyEventRecord[] {
  const detectedByType = new Map<TechniqueBiomechanicsEventType, AutoDetectedTechniqueKeyEvent>(
    detectedEvents.map((event) => [event.eventType as TechniqueBiomechanicsEventType, event]),
  );
  const nextEvents: TechniqueBiomechanicsKeyEventRecord[] = currentEvents.map((event) => {
    const detectedEvent = detectedByType.get(event.eventType);
    if (!detectedEvent || event.source !== "AUTO") {
      return event;
    }

    return {
      ...event,
      label: event.label.trim() || formatBiomechanicsEventLabel(detectedEvent.eventType),
      frameIndex: detectedEvent.frameIndex,
      frameHint: buildFrameHintFromLandmarks(landmarks, detectedEvent.frameIndex),
      source: "AUTO" as const,
      confidence: detectedEvent.confidence,
      detector: detectedEvent.detector,
      notes: event.notes ?? buildAutoDetectedEventNotes(detectedEvent.eventType),
    };
  });

  const existingTypes = new Set(nextEvents.map((event) => event.eventType));
  detectedEvents.forEach((event) => {
    if (existingTypes.has(event.eventType)) {
      return;
    }

    nextEvents.push({
      id: createDraftId(),
      label: formatBiomechanicsEventLabel(event.eventType),
      eventType: event.eventType as TechniqueBiomechanicsEventType,
      frameIndex: event.frameIndex,
      frameHint: buildFrameHintFromLandmarks(landmarks, event.frameIndex),
      source: "AUTO" as const,
      confidence: event.confidence,
      detector: event.detector,
      notes: buildAutoDetectedEventNotes(event.eventType),
    });
  });

  return nextEvents;
}

function mergeAutoDetectedKeyEventDrafts(
  currentEvents: TechniqueBiomechanicsKeyEventDraft[],
  detectedEvents: AutoDetectedTechniqueKeyEvent[],
  landmarks: TechniqueProLandmarks,
): TechniqueBiomechanicsKeyEventDraft[] {
  const detectedByType = new Map<TechniqueBiomechanicsEventType, AutoDetectedTechniqueKeyEvent>(
    detectedEvents.map((event) => [event.eventType as TechniqueBiomechanicsEventType, event]),
  );
  const nextEvents: TechniqueBiomechanicsKeyEventDraft[] = currentEvents.map((event) => {
    const detectedEvent = detectedByType.get(event.eventType);
    if (!detectedEvent || event.source !== "AUTO") {
      return event;
    }

    return {
      ...event,
      label: event.label.trim() || formatBiomechanicsEventLabel(detectedEvent.eventType),
      frameIndex: detectedEvent.frameIndex.toString(),
      frameHint: buildFrameHintFromLandmarks(landmarks, detectedEvent.frameIndex),
      source: "AUTO" as const,
      confidence: detectedEvent.confidence.toFixed(2),
      detector: detectedEvent.detector,
      notes: event.notes.trim() || buildAutoDetectedEventNotes(detectedEvent.eventType) || "",
    };
  });

  const existingTypes = new Set(nextEvents.map((event) => event.eventType));
  detectedEvents.forEach((event) => {
    if (existingTypes.has(event.eventType)) {
      return;
    }

    nextEvents.push({
      id: createDraftId(),
      label: formatBiomechanicsEventLabel(event.eventType),
      eventType: event.eventType as TechniqueBiomechanicsEventType,
      frameIndex: event.frameIndex.toString(),
      frameHint: buildFrameHintFromLandmarks(landmarks, event.frameIndex),
      source: "AUTO" as const,
      confidence: event.confidence.toFixed(2),
      detector: event.detector,
      notes: buildAutoDetectedEventNotes(event.eventType) ?? "",
    });
  });

  return nextEvents;
}

function normalizeTechniqueBiomechanicsConfig(
  config: TechniqueBiomechanicsConfig | null | undefined,
): TechniqueBiomechanicsConfig {
  const legacyJumpHeightMeasurement = config?.jumpHeightMeasurement as
    | (TechniqueBiomechanicsJumpHeightMeasurementRecord & {
      heelRiseMethodEnabled?: boolean | null;
      geometricHipRiseMethodEnabled?: boolean | null;
    })
    | undefined;

  return {
    schemaVersion: 1,
    referenceMediaAssetId: config?.referenceMediaAssetId ?? null,
    referenceMotionProfile: config?.referenceMotionProfile ?? "REAL_TIME",
    focusPoints: (config?.focusPoints ?? []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      landmark: entry.landmark,
      cue: entry.cue ?? null,
      notes: entry.notes ?? null,
    })),
    pointChecks: (config?.pointChecks ?? []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      landmark: entry.landmark,
      axis: entry.axis,
      referenceMode: entry.referenceMode,
      anchorEventId: entry.anchorEventId ?? null,
      anchorEventType: entry.anchorEventType ?? null,
      windowStartEventId: entry.windowStartEventId ?? null,
      windowEndEventId: entry.windowEndEventId ?? null,
      sampleMode: entry.sampleMode ?? null,
      targetMin: typeof entry.targetMin === "number" ? entry.targetMin : null,
      targetMax: typeof entry.targetMax === "number" ? entry.targetMax : null,
      phase: entry.phase ?? null,
      notes: entry.notes ?? null,
    })),
    angleChecks: (config?.angleChecks ?? []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      pointA: entry.pointA,
      vertex: entry.vertex,
      pointC: entry.pointC,
      plane: entry.plane,
      anchorEventId: entry.anchorEventId ?? null,
      anchorEventType: entry.anchorEventType ?? null,
      windowStartEventId: entry.windowStartEventId ?? null,
      windowEndEventId: entry.windowEndEventId ?? null,
      sampleMode: entry.sampleMode ?? null,
      targetMinDeg: typeof entry.targetMinDeg === "number" ? entry.targetMinDeg : null,
      targetMaxDeg: typeof entry.targetMaxDeg === "number" ? entry.targetMaxDeg : null,
      phase: entry.phase ?? null,
      notes: entry.notes ?? null,
    })),
    trajectoryChecks: (config?.trajectoryChecks ?? []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      landmark: entry.landmark,
      windowStartEventId: entry.windowStartEventId ?? null,
      windowEndEventId: entry.windowEndEventId ?? null,
      metric: entry.metric,
      axis: entry.axis,
      referenceMode: entry.referenceMode,
      targetMin: typeof entry.targetMin === "number" ? entry.targetMin : null,
      targetMax: typeof entry.targetMax === "number" ? entry.targetMax : null,
      notes: entry.notes ?? null,
    })),
    hipProgressionChecks: (config?.hipProgressionChecks ?? []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      derivedLandmark: entry.derivedLandmark,
      axis: "Y",
      groundReferenceMode: entry.groundReferenceMode,
      normalizationMode: entry.normalizationMode,
      requireMonotonic: entry.requireMonotonic ?? true,
      steps: (entry.steps ?? []).map((step) => ({
        eventType: step.eventType,
        targetCumulativeDropMinPercent: typeof step.targetCumulativeDropMinPercent === "number"
          ? step.targetCumulativeDropMinPercent
          : null,
        targetCumulativeDropMaxPercent: typeof step.targetCumulativeDropMaxPercent === "number"
          ? step.targetCumulativeDropMaxPercent
          : null,
      })),
      notes: entry.notes ?? null,
    })),
    keyEvents: (config?.keyEvents ?? []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      eventType: entry.eventType,
      frameIndex: typeof entry.frameIndex === "number"
        ? Math.max(0, Math.trunc(entry.frameIndex))
        : parseFrameIndexFromHint(entry.frameHint),
      frameHint: entry.frameHint ?? null,
      source: entry.source ?? "MANUAL",
      confidence: typeof entry.confidence === "number" ? entry.confidence : null,
      detector: entry.detector ?? null,
      notes: entry.notes ?? null,
    })),
    jumpHeightMeasurement: {
      enabled: config?.jumpHeightMeasurement?.enabled ?? false,
      subjectHeightCm: typeof config?.jumpHeightMeasurement?.subjectHeightCm === "number"
        ? config.jumpHeightMeasurement.subjectHeightCm
        : null,
      playbackSpeedRatio: typeof config?.jumpHeightMeasurement?.playbackSpeedRatio === "number"
        ? config.jumpHeightMeasurement.playbackSpeedRatio
        : null,
      flightTimeMethodEnabled: config?.jumpHeightMeasurement?.flightTimeMethodEnabled ?? true,
      centerOfMassMethodEnabled: config?.jumpHeightMeasurement?.centerOfMassMethodEnabled
        ?? legacyJumpHeightMeasurement?.heelRiseMethodEnabled
        ?? legacyJumpHeightMeasurement?.geometricHipRiseMethodEnabled
        ?? true,
      consensusToleranceCm: typeof config?.jumpHeightMeasurement?.consensusToleranceCm === "number"
        ? config.jumpHeightMeasurement.consensusToleranceCm
        : 6,
      notes: config?.jumpHeightMeasurement?.notes ?? null,
    },
    orientationPolicy: {
      allowMirror: config?.orientationPolicy?.allowMirror ?? true,
      preferredTravelDirection: config?.orientationPolicy?.preferredTravelDirection ?? "ANY",
      manualOverrideAllowed: config?.orientationPolicy?.manualOverrideAllowed ?? true,
      normalizationMode: config?.orientationPolicy?.normalizationMode ?? "AUTO",
    },
    coachNotes: config?.coachNotes ?? null,
  };
}

function mapTechniqueBiomechanicsConfigToForm(
  config: TechniqueBiomechanicsConfig | null | undefined,
): TechniqueBiomechanicsFormState {
  const normalized = normalizeTechniqueBiomechanicsConfig(config);

  return {
    referenceMotionProfile: normalized.referenceMotionProfile ?? "REAL_TIME",
    focusPoints: normalized.focusPoints.map((entry) => ({
      id: entry.id,
      label: entry.label,
      landmark: entry.landmark,
      cue: entry.cue ?? "",
      notes: entry.notes ?? "",
    })),
    pointChecks: normalized.pointChecks.map((entry) => ({
      id: entry.id,
      label: entry.label,
      landmark: entry.landmark,
      axis: entry.axis,
      referenceMode: entry.referenceMode,
      anchorEventId: entry.anchorEventId ?? "",
      anchorEventType: entry.anchorEventType ?? "",
      windowStartEventId: entry.windowStartEventId ?? "",
      windowEndEventId: entry.windowEndEventId ?? "",
      sampleMode: entry.sampleMode ?? "",
      targetMin: entry.targetMin?.toString() ?? "",
      targetMax: entry.targetMax?.toString() ?? "",
      phase: entry.phase ?? "",
      notes: entry.notes ?? "",
    })),
    angleChecks: normalized.angleChecks.map((entry) => ({
      id: entry.id,
      label: entry.label,
      pointA: entry.pointA,
      vertex: entry.vertex,
      pointC: entry.pointC,
      plane: entry.plane,
      anchorEventId: entry.anchorEventId ?? "",
      anchorEventType: entry.anchorEventType ?? "",
      windowStartEventId: entry.windowStartEventId ?? "",
      windowEndEventId: entry.windowEndEventId ?? "",
      sampleMode: entry.sampleMode ?? "",
      targetMinDeg: entry.targetMinDeg?.toString() ?? "",
      targetMaxDeg: entry.targetMaxDeg?.toString() ?? "",
      phase: entry.phase ?? "",
      notes: entry.notes ?? "",
    })),
    trajectoryChecks: normalized.trajectoryChecks.map((entry) => ({
      id: entry.id,
      label: entry.label,
      landmark: entry.landmark,
      windowStartEventId: entry.windowStartEventId ?? "",
      windowEndEventId: entry.windowEndEventId ?? "",
      metric: entry.metric,
      axis: entry.axis,
      referenceMode: entry.referenceMode,
      targetMin: entry.targetMin?.toString() ?? "",
      targetMax: entry.targetMax?.toString() ?? "",
      notes: entry.notes ?? "",
    })),
    hipProgressionChecks: normalized.hipProgressionChecks.map((entry) => ({
      id: entry.id,
      label: entry.label,
      derivedLandmark: entry.derivedLandmark,
      axis: "Y",
      groundReferenceMode: entry.groundReferenceMode,
      normalizationMode: entry.normalizationMode,
      requireMonotonic: entry.requireMonotonic,
      steps: entry.steps.map((step) => ({
        eventType: step.eventType,
        targetCumulativeDropMinPercent: step.targetCumulativeDropMinPercent?.toString() ?? "",
        targetCumulativeDropMaxPercent: step.targetCumulativeDropMaxPercent?.toString() ?? "",
      })),
      notes: entry.notes ?? "",
    })),
    keyEvents: normalized.keyEvents.map((entry) => ({
      id: entry.id,
      label: entry.label,
      eventType: entry.eventType,
      frameIndex: entry.frameIndex?.toString() ?? "",
      frameHint: entry.frameHint ?? "",
      source: entry.source,
      confidence: typeof entry.confidence === "number" ? entry.confidence.toFixed(2) : "",
      detector: entry.detector ?? "",
      notes: entry.notes ?? "",
    })),
    jumpHeightMeasurement: {
      enabled: normalized.jumpHeightMeasurement.enabled,
      subjectHeightCm: normalized.jumpHeightMeasurement.subjectHeightCm?.toString() ?? "",
      playbackSpeedRatio: normalized.jumpHeightMeasurement.playbackSpeedRatio?.toString() ?? "",
      flightTimeMethodEnabled: normalized.jumpHeightMeasurement.flightTimeMethodEnabled,
      centerOfMassMethodEnabled: normalized.jumpHeightMeasurement.centerOfMassMethodEnabled,
      consensusToleranceCm: normalized.jumpHeightMeasurement.consensusToleranceCm?.toString() ?? "",
      notes: normalized.jumpHeightMeasurement.notes ?? "",
    },
    orientationPolicy: {
      allowMirror: normalized.orientationPolicy.allowMirror,
      preferredTravelDirection: normalized.orientationPolicy.preferredTravelDirection,
      manualOverrideAllowed: normalized.orientationPolicy.manualOverrideAllowed,
      normalizationMode: normalized.orientationPolicy.normalizationMode,
    },
    coachNotes: normalized.coachNotes ?? "",
  };
}

function serializeTechniqueBiomechanicsForm(
  form: TechniqueBiomechanicsFormState,
  referenceMediaAssetId: string | null,
): TechniqueBiomechanicsConfig {
  return {
    schemaVersion: 1,
    referenceMediaAssetId,
    referenceMotionProfile: form.referenceMotionProfile,
    focusPoints: form.focusPoints
      .filter((entry) => entry.label.trim())
      .map((entry) => ({
        id: entry.id,
        label: entry.label.trim(),
        landmark: entry.landmark,
        cue: entry.cue.trim() || null,
        notes: entry.notes.trim() || null,
      })),
    pointChecks: form.pointChecks
      .filter((entry) => entry.label.trim())
      .map((entry) => ({
        id: entry.id,
        label: entry.label.trim(),
        landmark: entry.landmark,
        axis: entry.axis,
        referenceMode: entry.referenceMode,
        anchorEventId: entry.anchorEventId.trim() || null,
        anchorEventType: entry.anchorEventType || null,
        windowStartEventId: entry.windowStartEventId.trim() || null,
        windowEndEventId: entry.windowEndEventId.trim() || null,
        sampleMode: entry.sampleMode || null,
        targetMin: entry.targetMin.trim() ? Number(entry.targetMin) : null,
        targetMax: entry.targetMax.trim() ? Number(entry.targetMax) : null,
        phase: entry.phase.trim() || null,
        notes: entry.notes.trim() || null,
      })),
    angleChecks: form.angleChecks
      .filter((entry) => entry.label.trim())
      .map((entry) => ({
        id: entry.id,
        label: entry.label.trim(),
        pointA: entry.pointA,
        vertex: entry.vertex,
        pointC: entry.pointC,
        plane: entry.plane,
        anchorEventId: entry.anchorEventId.trim() || null,
        anchorEventType: entry.anchorEventType || null,
        windowStartEventId: entry.windowStartEventId.trim() || null,
        windowEndEventId: entry.windowEndEventId.trim() || null,
        sampleMode: entry.sampleMode || null,
        targetMinDeg: entry.targetMinDeg.trim() ? Number(entry.targetMinDeg) : null,
        targetMaxDeg: entry.targetMaxDeg.trim() ? Number(entry.targetMaxDeg) : null,
        phase: entry.phase.trim() || null,
        notes: entry.notes.trim() || null,
      })),
    trajectoryChecks: form.trajectoryChecks
      .filter((entry) => entry.label.trim())
      .map((entry) => ({
        id: entry.id,
        label: entry.label.trim(),
        landmark: entry.landmark,
        windowStartEventId: entry.windowStartEventId.trim() || null,
        windowEndEventId: entry.windowEndEventId.trim() || null,
        metric: entry.metric,
        axis: entry.axis,
        referenceMode: entry.referenceMode,
        targetMin: entry.targetMin.trim() ? Number(entry.targetMin) : null,
        targetMax: entry.targetMax.trim() ? Number(entry.targetMax) : null,
        notes: entry.notes.trim() || null,
      })),
    hipProgressionChecks: form.hipProgressionChecks
      .filter((entry) => entry.label.trim())
      .map((entry) => ({
        id: entry.id,
        label: entry.label.trim(),
        derivedLandmark: entry.derivedLandmark,
        axis: "Y" as const,
        groundReferenceMode: entry.groundReferenceMode,
        normalizationMode: entry.normalizationMode,
        requireMonotonic: entry.requireMonotonic,
        steps: entry.steps.map((step) => ({
          eventType: step.eventType,
          targetCumulativeDropMinPercent: step.targetCumulativeDropMinPercent.trim()
            ? Number(step.targetCumulativeDropMinPercent)
            : null,
          targetCumulativeDropMaxPercent: step.targetCumulativeDropMaxPercent.trim()
            ? Number(step.targetCumulativeDropMaxPercent)
            : null,
        })),
        notes: entry.notes.trim() || null,
      })),
    keyEvents: form.keyEvents
      .filter((entry) => entry.label.trim())
      .map((entry) => {
        const parsedFrameIndex = parseFrameIndexInput(entry.frameIndex) ?? parseFrameIndexFromHint(entry.frameHint);
        return {
          id: entry.id,
          label: entry.label.trim(),
          eventType: entry.eventType,
          frameIndex: parsedFrameIndex,
          frameHint: entry.frameHint.trim() || null,
          source: entry.source,
          confidence: parseOptionalNumberInput(entry.confidence),
          detector: entry.detector || null,
          notes: entry.notes.trim() || null,
        };
      }),
    jumpHeightMeasurement: {
      enabled: form.jumpHeightMeasurement.enabled,
      subjectHeightCm: form.jumpHeightMeasurement.subjectHeightCm.trim()
        ? Number(form.jumpHeightMeasurement.subjectHeightCm)
        : null,
      playbackSpeedRatio: form.jumpHeightMeasurement.playbackSpeedRatio.trim()
        ? Number(form.jumpHeightMeasurement.playbackSpeedRatio)
        : null,
      flightTimeMethodEnabled: form.jumpHeightMeasurement.flightTimeMethodEnabled,
      centerOfMassMethodEnabled: form.jumpHeightMeasurement.centerOfMassMethodEnabled,
      consensusToleranceCm: form.jumpHeightMeasurement.consensusToleranceCm.trim()
        ? Number(form.jumpHeightMeasurement.consensusToleranceCm)
        : null,
      notes: form.jumpHeightMeasurement.notes.trim() || null,
    },
    orientationPolicy: {
      allowMirror: form.orientationPolicy.allowMirror,
      preferredTravelDirection: form.orientationPolicy.preferredTravelDirection,
      manualOverrideAllowed: form.orientationPolicy.manualOverrideAllowed,
      normalizationMode: form.orientationPolicy.normalizationMode,
    },
    coachNotes: form.coachNotes.trim() || null,
  };
}

function mapTechniqueToForm(technique: ProgramTechniqueRecord): TechniqueFormState {
  return {
    id: technique.id,
    title: technique.title,
    description: technique.description ?? "",
    measurementInstructions: technique.measurementInstructions ?? "",
    comparisonEnabled: technique.comparisonEnabled,
    measurements: technique.measurementDefinitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      instructions: definition.instructions ?? "",
      allowedUnitsText: Array.isArray(definition.allowedUnits)
        ? definition.allowedUnits.filter((unit): unit is string => typeof unit === "string").join(", ")
        : "",
    })),
    biomechanics: mapTechniqueBiomechanicsConfigToForm(technique.biomechanicsConfig),
  };
}

function formatBiomechanicsEventLabel(eventType: TechniqueBiomechanicsEventType) {
  switch (eventType) {
    case "SETUP":
      return "Setup";
    case "DIP":
      return "Dip";
    case "ANTEPENULTIMATE_CONTACT":
      return "Antepenúltimo apoyo";
    case "PRE_PENULTIMATE_FLIGHT":
      return "Gesto aéreo pre-penúltimo";
    case "PENULTIMATE_CONTACT":
      return "Penúltimo apoyo";
    case "LAST_CONTACT":
      return "Último apoyo";
    case "TAKE_OFF":
      return "Despegue";
    case "TOE_OFF":
      return "Salida de punta";
    case "FLIGHT":
      return "Vuelo";
    case "APEX":
      return "Altura máxima";
    case "LANDING":
      return "Aterrizaje";
    default:
      return "Otro";
  }
}

function formatBiomechanicsEventSourceLabel(source: TechniqueBiomechanicsEventSource) {
  switch (source) {
    case "AUTO":
      return "Auto";
    case "HYBRID":
      return "Auto + ajuste manual";
    default:
      return "Manual";
  }
}

function formatBiomechanicsPlaneLabel(plane: TechniqueBiomechanicsAnglePlane) {
  switch (plane) {
    case "SAGITTAL_2D":
      return "Sagital 2D";
    case "FRONTAL_2D":
      return "Frontal 2D";
    default:
      return "Proxy transversal";
  }
}

function formatAngleSampleModeLabel(sampleMode: TechniqueBiomechanicsAngleSampleMode) {
  switch (sampleMode) {
    case "AT_EVENT":
      return "En evento";
    case "WINDOW_MIN":
      return "Mínimo en ventana";
    case "WINDOW_MAX":
      return "Máximo en ventana";
    default:
      return "Promedio en ventana";
  }
}

function formatTrajectoryMetricLabel(metric: TechniqueBiomechanicsTrajectoryMetric) {
  switch (metric) {
    case "DISPLACEMENT":
      return "Desplazamiento";
    case "RANGE":
      return "Rango";
    default:
      return "Estabilidad";
  }
}

function formatTrajectoryAxisLabel(axis: TechniqueBiomechanicsTrajectoryAxis) {
  return axis === "X" ? "Horizontal (X)" : "Vertical (Y)";
}

function formatTrajectoryReferenceModeLabel(referenceMode: TechniqueBiomechanicsTrajectoryReferenceMode) {
  return referenceMode === "ABSOLUTE" ? "Valor absoluto" : "Delta desde inicio";
}

function formatPreferredDirectionLabel(direction: TechniqueBiomechanicsPreferredDirection) {
  switch (direction) {
    case "LEFT_TO_RIGHT":
      return "Izquierda a derecha";
    case "RIGHT_TO_LEFT":
      return "Derecha a izquierda";
    default:
      return "Cualquiera";
  }
}

function formatNormalizationModeLabel(mode: TechniqueBiomechanicsNormalizationMode) {
  return mode === "AUTO" ? "Automática" : "Solo manual";
}

function formatMeasurementStatusLabel(status: string) {
  if (status === "OK") {
    return "OK";
  }

  if (status === "OUT_OF_RANGE") {
    return "Fuera de rango";
  }

  if (status === "MISSING_EVENT") {
    return "Faltan eventos";
  }

  if (status === "MISSING_LANDMARK") {
    return "Faltan landmarks";
  }

  if (status === "INVALID_MOTION_PROFILE") {
    return "Perfil temporal inválido";
  }

  if (status === "METHOD_DISAGREEMENT") {
    return "Métodos en desacuerdo";
  }

  if (status === "LOW_CONFIDENCE") {
    return "Baja confianza";
  }

  return "Pendiente";
}

function formatReferenceMotionProfile(profile: TechniqueReferenceMotionProfile | null | undefined) {
  if (profile === "SLOW_MOTION") {
    return "Camara lenta";
  }

  return "Velocidad normal";
}

function landmarkLabel(value: LandmarkName) {
  return poseLandmarkOptions.find((option) => option.value === value)?.label ?? value;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getReferencePoseFrame(landmarks: TechniqueProLandmarks | null | undefined, frameIndex: number): TechniquePoseFrame | null {
  if (!landmarks?.frames.length) {
    return null;
  }

  const safeIndex = clampNumber(frameIndex, 0, landmarks.frames.length - 1);
  return landmarks.frames[safeIndex] ?? null;
}

function getLandmarkPoint(frame: TechniquePoseFrame | null, landmark: LandmarkName): TechniqueVisualLandmarkPoint | null {
  if (!frame) {
    return null;
  }

  const landmarkIndex = landmarkIndexByName[landmark];
  const point = frame.landmarks[landmarkIndex];
  if (!point) {
    return null;
  }

  return {
    landmark,
    x: point.x,
    y: point.y,
  };
}

function formatReferenceFrameLabel(timestampMs: number) {
  const totalSeconds = Math.max(Math.round(timestampMs / 100) / 10, 0);
  return `${totalSeconds.toFixed(1)}s`;
}

function buildFrameHint(frameIndex: number, timestampMs: number) {
  return `Frame ${frameIndex + 1} · ${formatReferenceFrameLabel(timestampMs)}`;
}

function parseFrameIndexFromHint(frameHint: string | null | undefined) {
  if (!frameHint) {
    return null;
  }

  const match = frameHint.match(/frame\s+(\d+)/i);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed - 1;
}

function parseFrameIndexInput(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function measureAngleDegrees(
  pointA: TechniqueVisualLandmarkPoint | null,
  vertex: TechniqueVisualLandmarkPoint | null,
  pointC: TechniqueVisualLandmarkPoint | null,
) {
  if (!pointA || !vertex || !pointC) {
    return null;
  }

  const vectorA = { x: pointA.x - vertex.x, y: pointA.y - vertex.y };
  const vectorC = { x: pointC.x - vertex.x, y: pointC.y - vertex.y };
  const magnitudeA = Math.hypot(vectorA.x, vectorA.y);
  const magnitudeC = Math.hypot(vectorC.x, vectorC.y);

  if (!magnitudeA || !magnitudeC) {
    return null;
  }

  const cosine = clampNumber(
    (vectorA.x * vectorC.x + vectorA.y * vectorC.y) / (magnitudeA * magnitudeC),
    -1,
    1,
  );

  return Math.round((Math.acos(cosine) * 180) / Math.PI);
}

function normalizeAngleDeltaRadians(deltaRadians: number) {
  let normalized = deltaRadians;

  while (normalized <= -Math.PI) {
    normalized += Math.PI * 2;
  }

  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }

  return normalized;
}

function parseOptionalNumberInput(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function buildSvgPathFromPoints(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${(point.x * 1000).toFixed(1)} ${(point.y * 1000).toFixed(1)}`)
    .join(" ");
}

function buildAngleArcPoints(
  vertex: { x: number; y: number },
  startAngle: number,
  deltaAngle: number,
  radius: number,
) {
  const stepCount = Math.max(8, Math.ceil(Math.abs(deltaAngle) / (Math.PI / 18)));

  return Array.from({ length: stepCount + 1 }, (_, index) => {
    const progress = stepCount === 0 ? 0 : index / stepCount;
    const angle = startAngle + (deltaAngle * progress);
    return {
      x: vertex.x + (Math.cos(angle) * radius),
      y: vertex.y + (Math.sin(angle) * radius),
    };
  });
}

function buildAngleOverlay(
  pointA: TechniqueVisualLandmarkPoint,
  vertex: TechniqueVisualLandmarkPoint,
  pointC: TechniqueVisualLandmarkPoint,
  targetMinDeg: number | null,
  targetMaxDeg: number | null,
): TechniqueAngleOverlayModel | null {
  const vectorA = { x: pointA.x - vertex.x, y: pointA.y - vertex.y };
  const vectorC = { x: pointC.x - vertex.x, y: pointC.y - vertex.y };
  const magnitudeA = Math.hypot(vectorA.x, vectorA.y);
  const magnitudeC = Math.hypot(vectorC.x, vectorC.y);

  if (!magnitudeA || !magnitudeC) {
    return null;
  }

  const angleA = Math.atan2(vectorA.y, vectorA.x);
  const angleC = Math.atan2(vectorC.y, vectorC.x);
  const deltaAngle = normalizeAngleDeltaRadians(angleC - angleA);
  const currentAngleDeg = Math.round(Math.abs(deltaAngle) * (180 / Math.PI));
  const radius = clampNumber(Math.min(magnitudeA, magnitudeC) * 0.34, 0.045, 0.11);
  const arcPath = buildSvgPathFromPoints(buildAngleArcPoints(vertex, angleA, deltaAngle, radius));

  if (!arcPath) {
    return null;
  }

  const labelAngle = angleA + (deltaAngle / 2);
  const labelRadius = radius * 1.52;

  let bandPath: string | null = null;
  let rangeLabel: string | null = null;
  let rangeLabelX: number | undefined;
  let rangeLabelY: number | undefined;

  if (typeof targetMinDeg === "number" && typeof targetMaxDeg === "number") {
    const minMagnitude = Math.min(targetMinDeg, targetMaxDeg) * (Math.PI / 180);
    const maxMagnitude = Math.max(targetMinDeg, targetMaxDeg) * (Math.PI / 180);
    const direction = deltaAngle === 0 ? 1 : Math.sign(deltaAngle);
    const bandStartAngle = angleA + (direction * minMagnitude);
    const bandDeltaAngle = direction * (maxMagnitude - minMagnitude);
    const outerRadius = radius * 1.2;
    const innerRadius = radius * 0.82;
    const outerArc = buildAngleArcPoints(vertex, bandStartAngle, bandDeltaAngle, outerRadius);
    const innerArc = buildAngleArcPoints(vertex, bandStartAngle, bandDeltaAngle, innerRadius).reverse();
    const bandOutline = buildSvgPathFromPoints([...outerArc, ...innerArc]);

    if (bandOutline) {
      bandPath = `${bandOutline} Z`;
      rangeLabel = `${Math.round(Math.min(targetMinDeg, targetMaxDeg))}° - ${Math.round(Math.max(targetMinDeg, targetMaxDeg))}°`;
      const rangeAngle = bandStartAngle + (bandDeltaAngle / 2);
      rangeLabelX = (vertex.x + (Math.cos(rangeAngle) * outerRadius * 1.22)) * 1000;
      rangeLabelY = (vertex.y + (Math.sin(rangeAngle) * outerRadius * 1.22)) * 1000;
    }
  }

  const overlay = {
    arcPath,
    bandPath,
    label: `${currentAngleDeg}°`,
    labelX: (vertex.x + (Math.cos(labelAngle) * labelRadius)) * 1000,
    labelY: (vertex.y + (Math.sin(labelAngle) * labelRadius)) * 1000,
  };

  if (rangeLabel && typeof rangeLabelX === "number" && typeof rangeLabelY === "number") {
    return {
      ...overlay,
      rangeLabel,
      rangeLabelX,
      rangeLabelY,
    };
  }

  return overlay;
}

function findNearestReferenceFrameIndex(
  landmarks: TechniqueProLandmarks | null | undefined,
  targetTimestampMs: number,
) {
  const frames = landmarks?.frames ?? [];
  if (!frames.length) {
    return null;
  }

  let nearestIndex = 0;
  let nearestDistance = Infinity;

  frames.forEach((frame, index) => {
    const distance = Math.abs(frame.timestampMs - targetTimestampMs);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(tokenStorageKey));
  const [adminView, setAdminView] = useState<AdminView>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<AdminSummary["metrics"] | null>(null);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [allAthletes, setAllAthletes] = useState<AthleteProfileRecord[]>([]);
  const [programs, setPrograms] = useState<PersonalProgramRecord[]>([]);
  const [programSessions, setProgramSessions] = useState<AdminSessionRecord[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [selectedProgramSessionId, setSelectedProgramSessionId] = useState<string>("");
  const [selectedProgramSession, setSelectedProgramSession] = useState<AdminSessionRecord | null>(null);
  const [sessionEditor, setSessionEditor] = useState<SessionEditorState>(emptySessionEditor);
  const [selectedCoachDashboardId, setSelectedCoachDashboardId] = useState<string>("");
  const [coachDashboard, setCoachDashboard] = useState<CoachDashboardResponse | null>(null);
  const [templateDays, setTemplateDays] = useState<ProgramDay[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(1);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedAthleteProfileId, setSelectedAthleteProfileId] = useState<string>("");
  const [selectedMembershipId, setSelectedMembershipId] = useState<string>("");
  const [selectedCoachUserId, setSelectedCoachUserId] = useState<string>("");
  const [exerciseForm, setExerciseForm] = useState<ExerciseFormState>(emptyExerciseForm);
  const [teamForm, setTeamForm] = useState<TeamFormState>(emptyTeamForm);
  const [memberForm, setMemberForm] = useState<MemberFormState>(emptyMemberForm);
  const [athleteForm, setAthleteForm] = useState<AthleteFormState>(emptyAthleteForm);
  const [programGeneration, setProgramGeneration] = useState<ProgramGenerationState>(emptyProgramGeneration);
  const [prescriptionsDraft, setPrescriptionsDraft] = useState<PrescriptionRecord[]>([]);
  const [selectedPrescriptionIdx, setSelectedPrescriptionIdx] = useState<number>(0);
  const [loginForm, setLoginForm] = useState({ email: "admin@3m30cm.local", password: "Admin123!" });
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [uploadState, setUploadState] = useState({ kind: "IMAGE" as MediaKind, title: "", isPrimary: false, file: null as File | null });
  const [blockDraft, setBlockDraft] = useState<Array<{ _key: string; exerciseId: string; order: number; setsOverride: string; repsKind: "reps" | "time"; repsOverride: string; notes: string }>>([]);
  const [allTemplates, setAllTemplates] = useState<ProgramTemplateMeta[]>([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>(templateCode);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(emptyTemplateForm);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateTechniques, setTemplateTechniques] = useState<ProgramTechniqueRecord[]>([]);
  const [selectedTechniqueId, setSelectedTechniqueId] = useState<string>("");
  const [templateTechniqueForm, setTemplateTechniqueForm] = useState<TechniqueFormState>(emptyTechniqueForm);
  const [selectedTemplateTechniqueMediaAssets, setSelectedTemplateTechniqueMediaAssets] = useState<ProgramTechniqueMediaAsset[]>([]);
  const [techniqueUploadState, setTechniqueUploadState] = useState<TechniqueUploadState>(emptyTechniqueUploadState);
  const [techniquePoseProcessing, setTechniquePoseProcessing] = useState<TechniquePoseProcessingState>(emptyTechniquePoseProcessingState);
  const [visualEditorMode, setVisualEditorMode] = useState<TechniqueVisualEditorMode>("inspect");
  const [selectedReferenceFrameIndex, setSelectedReferenceFrameIndex] = useState(0);
  const [hoveredVisualLandmark, setHoveredVisualLandmark] = useState<LandmarkName | null>(null);
  const [pendingAngleLandmarks, setPendingAngleLandmarks] = useState<LandmarkName[]>([]);
  const [pendingEventType, setPendingEventType] = useState<TechniqueBiomechanicsEventType>("TOE_OFF");
  const [selectedFocusPointId, setSelectedFocusPointId] = useState<string | null>(null);
  const [selectedPointCheckId, setSelectedPointCheckId] = useState<string | null>(null);
  const [selectedAngleCheckId, setSelectedAngleCheckId] = useState<string | null>(null);
  const [selectedTrajectoryCheckId, setSelectedTrajectoryCheckId] = useState<string | null>(null);
  const [selectedKeyEventId, setSelectedKeyEventId] = useState<string | null>(null);
  const [referenceEventDetectionDebug, setReferenceEventDetectionDebug] = useState<TechniqueEventDetectionDebugState | null>(null);
  const referenceVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isReferenceVideoPlaying, setIsReferenceVideoPlaying] = useState(false);
  const [exclusionsAthleteId, setExclusionsAthleteId] = useState<string>("");
  const [exclusionsDraft, setExclusionsDraft] = useState<string[]>([]);

  type AngleWizardState =
    | { open: false }
    | {
        open: true;
        phase: "select-events";
        availableEvents: Array<{ eventType: TechniqueBiomechanicsEventType; label: string }>;
        selectedEventTypes: TechniqueBiomechanicsEventType[];
      }
    | {
        open: true;
        phase: "review-angles";
        groups: Array<{
          eventType: TechniqueBiomechanicsEventType;
          eventLabel: string;
          angles: Array<{ draft: TechniqueBiomechanicsAngleCheckDraft; include: boolean }>;
        }>;
        groupIndex: number;
      };
  const [angleWizard, setAngleWizard] = useState<AngleWizardState>({ open: false });

  const selectedExercise = useMemo(
    () => exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null,
    [exercises, selectedExerciseId],
  );

  const selectedDay = useMemo(
    () => templateDays.find((day) => day.dayNumber === selectedDayNumber) ?? null,
    [selectedDayNumber, templateDays],
  );

  const selectedTemplateMeta = useMemo(
    () => allTemplates.find((template) => template.code === selectedTemplateCode) ?? null,
    [allTemplates, selectedTemplateCode],
  );

  const selectedTechnique = useMemo(
    () => templateTechniques.find((technique) => technique.id === selectedTechniqueId) ?? null,
    [templateTechniques, selectedTechniqueId],
  );

  const selectedTechniqueReferenceAsset = useMemo(() => {
    const referenceMediaAssetId = normalizeTechniqueBiomechanicsConfig(selectedTechnique?.biomechanicsConfig).referenceMediaAssetId;
    if (!referenceMediaAssetId) {
      return null;
    }

    return selectedTemplateTechniqueMediaAssets.find((asset) => asset.id === referenceMediaAssetId) ?? null;
  }, [selectedTechnique?.biomechanicsConfig, selectedTemplateTechniqueMediaAssets]);

  const selectedReferenceFrame = useMemo(
    () => getReferencePoseFrame(selectedTechnique?.proLandmarks, selectedReferenceFrameIndex),
    [selectedTechnique?.proLandmarks, selectedReferenceFrameIndex],
  );

  const selectedReferenceAnglePreview = useMemo(() => {
    if (pendingAngleLandmarks.length !== 3) {
      return null;
    }

    const [pointA, vertex, pointC] = pendingAngleLandmarks;
    if (!pointA || !vertex || !pointC) {
      return null;
    }

    return measureAngleDegrees(
      getLandmarkPoint(selectedReferenceFrame, pointA),
      getLandmarkPoint(selectedReferenceFrame, vertex),
      getLandmarkPoint(selectedReferenceFrame, pointC),
    );
  }, [pendingAngleLandmarks, selectedReferenceFrame]);

  const selectedReferenceVideoUrl = useMemo(
    () => normalizeMediaUrl(selectedTechniqueReferenceAsset?.url ?? selectedTechnique?.proVideoUrl),
    [selectedTechnique?.proVideoUrl, selectedTechniqueReferenceAsset?.url],
  );

  const selectedReferenceFramePoints = useMemo(
    () => poseLandmarkOptions
      .map((option) => getLandmarkPoint(selectedReferenceFrame, option.value))
      .filter((point): point is TechniqueVisualLandmarkPoint => Boolean(point)),
    [selectedReferenceFrame],
  );

  const selectedReferenceFrameCount = selectedTechnique?.proLandmarks?.frames.length ?? 0;

  const referenceEventMarkers = useMemo(
    () => templateTechniqueForm.biomechanics.keyEvents
      .map((event) => ({
        ...event,
        frameIndex: parseFrameIndexInput(event.frameIndex) ?? parseFrameIndexFromHint(event.frameHint),
      }))
      .filter((event): event is TechniqueBiomechanicsKeyEventDraft & { frameIndex: number } => event.frameIndex !== null),
    [templateTechniqueForm.biomechanics.keyEvents],
  );

  const previewBiomechanicsConfig = useMemo(
    () => serializeTechniqueBiomechanicsForm(
      templateTechniqueForm.biomechanics,
      normalizeTechniqueBiomechanicsConfig(selectedTechnique?.biomechanicsConfig).referenceMediaAssetId,
    ),
    [selectedTechnique?.biomechanicsConfig, templateTechniqueForm.biomechanics],
  );

  const referenceBiomechanicsPreview = useMemo(
    () => buildReferenceBiomechanicsMeasurementsPreview(
      selectedTechnique?.proLandmarks,
      referenceEventMarkers.map((event) => ({
        id: event.id,
        label: event.label,
        eventType: event.eventType,
        frameIndex: event.frameIndex,
      })),
      previewBiomechanicsConfig.hipProgressionChecks,
      previewBiomechanicsConfig.jumpHeightMeasurement,
      templateTechniqueForm.biomechanics.referenceMotionProfile,
    ),
    [
      previewBiomechanicsConfig.hipProgressionChecks,
      previewBiomechanicsConfig.jumpHeightMeasurement,
      referenceEventMarkers,
      selectedTechnique?.proLandmarks,
      templateTechniqueForm.biomechanics.referenceMotionProfile,
    ],
  );

  const focusPointLandmarkSet = useMemo(
    () => new Set(templateTechniqueForm.biomechanics.focusPoints.map((point) => point.landmark)),
    [templateTechniqueForm.biomechanics.focusPoints],
  );

  const selectedFocusPoint = useMemo(
    () => templateTechniqueForm.biomechanics.focusPoints.find((point) => point.id === selectedFocusPointId) ?? null,
    [selectedFocusPointId, templateTechniqueForm.biomechanics.focusPoints],
  );

  const selectedPointCheck = useMemo(
    () => templateTechniqueForm.biomechanics.pointChecks.find((pointCheck) => pointCheck.id === selectedPointCheckId) ?? null,
    [selectedPointCheckId, templateTechniqueForm.biomechanics.pointChecks],
  );

  const selectedAngleCheck = useMemo(
    () => templateTechniqueForm.biomechanics.angleChecks.find((angle) => angle.id === selectedAngleCheckId) ?? null,
    [selectedAngleCheckId, templateTechniqueForm.biomechanics.angleChecks],
  );

  const selectedTrajectoryCheck = useMemo(
    () => templateTechniqueForm.biomechanics.trajectoryChecks.find((trajectory) => trajectory.id === selectedTrajectoryCheckId) ?? null,
    [selectedTrajectoryCheckId, templateTechniqueForm.biomechanics.trajectoryChecks],
  );

  const selectedAngleLandmarks = useMemo(
    () => selectedAngleCheck ? [selectedAngleCheck.pointA, selectedAngleCheck.vertex, selectedAngleCheck.pointC] : [],
    [selectedAngleCheck],
  );

  const selectedKeyEvent = useMemo(
    () => templateTechniqueForm.biomechanics.keyEvents.find((event) => event.id === selectedKeyEventId) ?? null,
    [selectedKeyEventId, templateTechniqueForm.biomechanics.keyEvents],
  );

  const selectedAngleOverlayPoints = useMemo(() => {
    if (!selectedAngleCheck) {
      return null;
    }

    const pointA = getLandmarkPoint(selectedReferenceFrame, selectedAngleCheck.pointA);
    const vertex = getLandmarkPoint(selectedReferenceFrame, selectedAngleCheck.vertex);
    const pointC = getLandmarkPoint(selectedReferenceFrame, selectedAngleCheck.pointC);
    if (!pointA || !vertex || !pointC) {
      return null;
    }

    return { pointA, vertex, pointC };
  }, [selectedAngleCheck, selectedReferenceFrame]);

  const activeAngleOverlayPoints = useMemo(() => {
    if (pendingAngleLandmarks.length === 3) {
      const [pointA, vertex, pointC] = pendingAngleLandmarks;
      if (!pointA || !vertex || !pointC) {
        return null;
      }

      const pendingPointA = getLandmarkPoint(selectedReferenceFrame, pointA);
      const pendingVertex = getLandmarkPoint(selectedReferenceFrame, vertex);
      const pendingPointC = getLandmarkPoint(selectedReferenceFrame, pointC);
      if (!pendingPointA || !pendingVertex || !pendingPointC) {
        return null;
      }

      return { pointA: pendingPointA, vertex: pendingVertex, pointC: pendingPointC };
    }

    return selectedAngleOverlayPoints;
  }, [pendingAngleLandmarks, selectedAngleOverlayPoints, selectedReferenceFrame]);

  const selectedAngleOverlay = useMemo(() => {
    if (!activeAngleOverlayPoints) {
      return null;
    }

    let targetMinDeg: number | null = null;
    let targetMaxDeg: number | null = null;

    if (pendingAngleLandmarks.length === 3 && selectedReferenceAnglePreview !== null) {
      targetMinDeg = clampNumber(selectedReferenceAnglePreview - 10, 0, 360);
      targetMaxDeg = clampNumber(selectedReferenceAnglePreview + 10, 0, 360);
    } else if (selectedAngleCheck) {
      targetMinDeg = parseOptionalNumberInput(selectedAngleCheck.targetMinDeg);
      targetMaxDeg = parseOptionalNumberInput(selectedAngleCheck.targetMaxDeg);
    }

    return buildAngleOverlay(
      activeAngleOverlayPoints.pointA,
      activeAngleOverlayPoints.vertex,
      activeAngleOverlayPoints.pointC,
      targetMinDeg,
      targetMaxDeg,
    );
  }, [activeAngleOverlayPoints, pendingAngleLandmarks.length, selectedAngleCheck, selectedReferenceAnglePreview]);

  const selectedTrajectoryOverlay = useMemo(() => {
    if (!selectedTrajectoryCheck || !selectedTechnique?.proLandmarks) {
      return null;
    }

    const startFrame = referenceEventMarkers.find((event) => event.id === selectedTrajectoryCheck.windowStartEventId)?.frameIndex;
    const endFrame = referenceEventMarkers.find((event) => event.id === selectedTrajectoryCheck.windowEndEventId)?.frameIndex;
    if (typeof startFrame !== "number" || typeof endFrame !== "number") {
      return null;
    }

    const fromFrame = Math.min(startFrame, endFrame);
    const toFrame = Math.max(startFrame, endFrame);
    if (selectedReferenceFrameIndex <= fromFrame) {
      return null;
    }

    const visibleToFrame = clampNumber(selectedReferenceFrameIndex, fromFrame, toFrame);
    const trajectoryPoints: TechniqueVisualLandmarkPoint[] = [];

    for (let frameIndex = fromFrame; frameIndex <= visibleToFrame; frameIndex += 1) {
      const point = getLandmarkPoint(selectedTechnique.proLandmarks.frames[frameIndex] ?? null, selectedTrajectoryCheck.landmark);
      if (point) {
        trajectoryPoints.push(point);
      }
    }

    const path = buildSvgPathFromPoints(trajectoryPoints);
    if (!path) {
      return null;
    }

    return { path };
  }, [referenceEventMarkers, selectedReferenceFrameIndex, selectedTechnique?.proLandmarks, selectedTrajectoryCheck]);

  const referenceConnectionSegments = useMemo(() => {
    const baseSegments = poseConnections
      .map(([startLandmark, endLandmark]) => {
        const startPoint = getLandmarkPoint(selectedReferenceFrame, startLandmark);
        const endPoint = getLandmarkPoint(selectedReferenceFrame, endLandmark);
        if (!startPoint || !endPoint) {
          return null;
        }

        return {
          key: `${startLandmark}-${endLandmark}`,
          x1: startPoint.x,
          y1: startPoint.y,
          x2: endPoint.x,
          y2: endPoint.y,
        };
      })
      .filter((segment): segment is { key: string; x1: number; y1: number; x2: number; y2: number } => Boolean(segment));

    if (!selectedAngleOverlayPoints) {
      return baseSegments;
    }

    return [
      ...baseSegments,
      {
        key: "selected-angle-a",
        x1: selectedAngleOverlayPoints.pointA.x,
        y1: selectedAngleOverlayPoints.pointA.y,
        x2: selectedAngleOverlayPoints.vertex.x,
        y2: selectedAngleOverlayPoints.vertex.y,
        highlight: true,
      },
      {
        key: "selected-angle-c",
        x1: selectedAngleOverlayPoints.vertex.x,
        y1: selectedAngleOverlayPoints.vertex.y,
        x2: selectedAngleOverlayPoints.pointC.x,
        y2: selectedAngleOverlayPoints.pointC.y,
        highlight: true,
      },
    ];
  }, [selectedAngleOverlayPoints, selectedReferenceFrame]);

  const referenceLandmarkNodes = useMemo(
    () => selectedReferenceFramePoints.map((point) => ({
      landmark: point.landmark,
      x: point.x,
      y: point.y,
      isFocused: focusPointLandmarkSet.has(point.landmark),
      isPending: pendingAngleLandmarks.includes(point.landmark),
      isSelected: point.landmark === selectedFocusPoint?.landmark
        || point.landmark === selectedPointCheck?.landmark
        || selectedAngleLandmarks.includes(point.landmark)
        || point.landmark === selectedTrajectoryCheck?.landmark,
      isHovered: hoveredVisualLandmark === point.landmark,
    })),
    [
      focusPointLandmarkSet,
      hoveredVisualLandmark,
      pendingAngleLandmarks,
      selectedAngleLandmarks,
      selectedFocusPoint?.landmark,
      selectedPointCheck?.landmark,
      selectedReferenceFramePoints,
      selectedTrajectoryCheck?.landmark,
    ],
  );

  const referenceTimelineMarkers = useMemo(
    () => referenceEventMarkers.map((event) => ({
      id: event.id,
      label: event.label,
      title: `${event.label} · ${event.frameHint ?? `Frame ${event.frameIndex + 1}`}`,
      leftPercent: selectedReferenceFrameCount > 1 ? (event.frameIndex / (selectedReferenceFrameCount - 1)) * 100 : 0,
      isActive: selectedKeyEventId === event.id,
    })),
    [referenceEventMarkers, selectedKeyEventId, selectedReferenceFrameCount],
  );

  const focusPointChips = useMemo(
    () => templateTechniqueForm.biomechanics.focusPoints.map((point) => ({
      id: point.id,
      label: point.label || landmarkLabel(point.landmark),
      landmark: point.landmark,
      isActive: selectedFocusPointId === point.id,
    })),
    [selectedFocusPointId, templateTechniqueForm.biomechanics.focusPoints],
  );

  const angleSelectionLabels = useMemo(() => {
    if (pendingAngleLandmarks.length) {
      return pendingAngleLandmarks.map((landmark) => landmarkLabel(landmark));
    }

    if (selectedAngleCheck) {
      return [selectedAngleCheck.pointA, selectedAngleCheck.vertex, selectedAngleCheck.pointC].map((landmark) => landmarkLabel(landmark));
    }

    return [];
  }, [pendingAngleLandmarks, selectedAngleCheck]);

  const anglePreviewLabel = useMemo(() => {
    if (pendingAngleLandmarks.length === 3 && selectedReferenceAnglePreview !== null) {
      return `Preview: ${selectedReferenceAnglePreview}° · rango ${(clampNumber(selectedReferenceAnglePreview - 10, 0, 360)).toFixed(0)}° - ${(clampNumber(selectedReferenceAnglePreview + 10, 0, 360)).toFixed(0)}°`;
    }

    if (selectedAngleOverlay?.rangeLabel) {
      return `Actual: ${selectedAngleOverlay.label} · objetivo ${selectedAngleOverlay.rangeLabel}`;
    }

    if (selectedAngleOverlay) {
      return `Actual: ${selectedAngleOverlay.label}`;
    }

    return "Preview: pendiente";
  }, [pendingAngleLandmarks.length, selectedAngleOverlay, selectedReferenceAnglePreview]);

  const eventChips = useMemo(
    () => referenceEventMarkers.map((event) => ({
      id: event.id,
      label: event.label,
      isActive: selectedKeyEventId === event.id,
    })),
    [referenceEventMarkers, selectedKeyEventId],
  );

  const biomechanicsEventReferenceOptions = useMemo(
    () => templateTechniqueForm.biomechanics.keyEvents.map((event) => ({
      id: event.id,
      label: event.label.trim() || formatBiomechanicsEventLabel(event.eventType),
    })),
    [templateTechniqueForm.biomechanics.keyEvents],
  );

  const inspectSummaryChips = useMemo(
    () => [
      `Timestamp: ${formatReferenceFrameLabel(selectedReferenceFrame?.timestampMs ?? 0)}`,
      `Landmarks visibles: ${selectedReferenceFramePoints.length}`,
      `Modo referencia: ${formatReferenceMotionProfile(templateTechniqueForm.biomechanics.referenceMotionProfile)}`,
    ],
    [selectedReferenceFrame?.timestampMs, selectedReferenceFramePoints.length, templateTechniqueForm.biomechanics.referenceMotionProfile],
  );

  useEffect(() => {
    setTechniquePoseProcessing(emptyTechniquePoseProcessingState());
  }, [selectedTechniqueId]);

  useEffect(() => {
    setVisualEditorMode("inspect");
    setSelectedReferenceFrameIndex(0);
    setHoveredVisualLandmark(null);
    setPendingAngleLandmarks([]);
    setPendingEventType("TOE_OFF");
    setSelectedFocusPointId(null);
    setSelectedPointCheckId(null);
    setSelectedAngleCheckId(null);
    setSelectedTrajectoryCheckId(null);
    setSelectedKeyEventId(null);
    setReferenceEventDetectionDebug(null);
    setIsReferenceVideoPlaying(false);
  }, [selectedTechniqueId]);

  useEffect(() => {
    const frameCount = selectedTechnique?.proLandmarks?.frames.length ?? 0;
    if (!frameCount) {
      setSelectedReferenceFrameIndex(0);
      return;
    }

    setSelectedReferenceFrameIndex((current) => clampNumber(current, 0, frameCount - 1));
  }, [selectedTechnique?.proLandmarks?.frames.length]);

  useEffect(() => {
    const video = referenceVideoRef.current;
    if (!video || !selectedReferenceFrame || isReferenceVideoPlaying) {
      return;
    }

    const targetTimeSeconds = selectedReferenceFrame.timestampMs / 1000;
    if (Math.abs(video.currentTime - targetTimeSeconds) > 0.05) {
      video.currentTime = targetTimeSeconds;
    }
  }, [isReferenceVideoPlaying, selectedReferenceFrame]);

  function pauseReferenceVideo() {
    const video = referenceVideoRef.current;
    if (video && !video.paused) {
      video.pause();
    }

    setIsReferenceVideoPlaying(false);
  }

  function handlePreviousReferenceFrame() {
    pauseReferenceVideo();
    setSelectedReferenceFrameIndex((current) => clampNumber(current - 1, 0, Math.max(selectedReferenceFrameCount - 1, 0)));
  }

  function handleNextReferenceFrame() {
    pauseReferenceVideo();
    setSelectedReferenceFrameIndex((current) => clampNumber(current + 1, 0, Math.max(selectedReferenceFrameCount - 1, 0)));
  }

  function handleReferenceFrameChange(frameIndex: number) {
    pauseReferenceVideo();
    setSelectedReferenceFrameIndex(frameIndex);
  }

  function handleReferenceVideoPlay() {
    setIsReferenceVideoPlaying(true);
  }

  function handleReferenceVideoPause() {
    setIsReferenceVideoPlaying(false);
  }

  function handleReferenceVideoTimeUpdate(currentTimeSeconds: number) {
    const frameIndex = findNearestReferenceFrameIndex(selectedTechnique?.proLandmarks, currentTimeSeconds * 1000);
    if (frameIndex === null) {
      return;
    }

    setSelectedReferenceFrameIndex((current) => (current === frameIndex ? current : frameIndex));
  }

  function handleVisualLandmarkSelect(landmark: LandmarkName) {
    setHoveredVisualLandmark(landmark);

    if (visualEditorMode === "points") {
      const nextPointId = createDraftId();
      setSelectedFocusPointId(nextPointId);
      setSelectedPointCheckId(null);
      setSelectedAngleCheckId(null);
      setSelectedTrajectoryCheckId(null);
      setSelectedKeyEventId(null);
      setTemplateTechniqueForm((current) => {
        if (current.biomechanics.focusPoints.some((point) => point.landmark === landmark)) {
          return current;
        }

        return {
          ...current,
          biomechanics: {
            ...current.biomechanics,
            focusPoints: [
              ...current.biomechanics.focusPoints,
              {
                id: nextPointId,
                label: landmarkLabel(landmark),
                landmark,
                cue: "",
                notes: "",
              },
            ],
          },
        };
      });

      return;
    }

    if (visualEditorMode === "angles") {
      setSelectedFocusPointId(null);
      setSelectedPointCheckId(null);
      setSelectedAngleCheckId(null);
      setSelectedTrajectoryCheckId(null);
      setSelectedKeyEventId(null);
      setPendingAngleLandmarks((current) => {
        if (current.length >= 3) {
          return [landmark];
        }

        return [...current, landmark];
      });
    }
  }

  function handleCreateAngleFromPendingSelection() {
    if (pendingAngleLandmarks.length !== 3) {
      return;
    }

    const [pointA, vertex, pointC] = pendingAngleLandmarks;
    if (!pointA || !vertex || !pointC) {
      return;
    }

    const nextAngleId = createDraftId();
    const defaultTargetMinDeg = selectedReferenceAnglePreview !== null ? clampNumber(selectedReferenceAnglePreview - 10, 0, 360).toFixed(0) : "";
    const defaultTargetMaxDeg = selectedReferenceAnglePreview !== null ? clampNumber(selectedReferenceAnglePreview + 10, 0, 360).toFixed(0) : "";
    setSelectedFocusPointId(null);
    setSelectedPointCheckId(null);
    setSelectedAngleCheckId(nextAngleId);
    setSelectedTrajectoryCheckId(null);
    setSelectedKeyEventId(null);
    setTemplateTechniqueForm((current) => ({
      ...current,
      biomechanics: {
        ...current.biomechanics,
        angleChecks: [
          ...current.biomechanics.angleChecks,
          {
            id: nextAngleId,
            label: `Ángulo ${landmarkLabel(vertex)}`,
            pointA,
            vertex,
            pointC,
            plane: "SAGITTAL_2D",
            anchorEventId: "",
            anchorEventType: "",
            windowStartEventId: "",
            windowEndEventId: "",
            sampleMode: "AT_EVENT",
            targetMinDeg: defaultTargetMinDeg,
            targetMaxDeg: defaultTargetMaxDeg,
            phase: "",
            notes: selectedReferenceAnglePreview ? `Preview visual: ${selectedReferenceAnglePreview}°` : "",
          },
        ],
      },
    }));
    setPendingAngleLandmarks([]);
  }

  function handleCreateEventFromCurrentFrame() {
    if (!selectedReferenceFrame) {
      return;
    }

    const nextEventId = createDraftId();
    setSelectedFocusPointId(null);
    setSelectedPointCheckId(null);
    setSelectedAngleCheckId(null);
    setSelectedTrajectoryCheckId(null);
    setSelectedKeyEventId(nextEventId);
    const nextFrameHint = buildFrameHint(selectedReferenceFrameIndex, selectedReferenceFrame.timestampMs);
    setTemplateTechniqueForm((current) => ({
      ...current,
      biomechanics: {
        ...current.biomechanics,
        keyEvents: [
          ...current.biomechanics.keyEvents,
          {
            id: nextEventId,
            label: `${formatBiomechanicsEventLabel(pendingEventType)} ${selectedReferenceFrameIndex + 1}`,
            eventType: pendingEventType,
            frameIndex: selectedReferenceFrameIndex.toString(),
            frameHint: nextFrameHint,
            source: "MANUAL",
            confidence: "",
            detector: "",
            notes: "",
          },
        ],
      },
    }));
  }

  function handleAutoDetectReferenceEvents() {
    const referenceLandmarks = selectedTechnique?.proLandmarks;
    if (!referenceLandmarks) {
      setError("Primero sube una referencia profesional con landmarks para sugerir eventos.");
      return;
    }

    const detectionResult = detectTechniqueKeyEventsWithDebug(referenceLandmarks);
    const detectedEvents = detectionResult.events;
    setReferenceEventDetectionDebug({
      eventCount: detectedEvents.length,
      debug: detectionResult.debug,
    });

    if (!detectedEvents.length) {
      setError("No se pudieron sugerir eventos automáticamente con la heurística actual.");
      return;
    }

    setError("");
    setTemplateTechniqueForm((current) => ({
      ...current,
      biomechanics: {
        ...current.biomechanics,
        keyEvents: mergeAutoDetectedKeyEventDrafts(current.biomechanics.keyEvents, detectedEvents, referenceLandmarks),
      },
    }));
    setMessage(`${detectedEvents.length} evento(s) sugeridos automáticamente. Ahora puedes usar "Autodetectar ángulos" para generar los checks articulares por evento.`);
  }

  function handleAutoDetectReferenceAngles() {
    const referenceLandmarks = selectedTechnique?.proLandmarks;
    if (!referenceLandmarks) {
      setError("Primero sube y procesa la referencia profesional con landmarks.");
      return;
    }

    const currentEvents = templateTechniqueForm.biomechanics.keyEvents;
    if (!currentEvents.length) {
      setError("Autodetecta los eventos primero antes de sugerir ángulos.");
      return;
    }

    // Only offer events that have a valid frame index and would produce at least one angle suggestion.
    const eventsWithSuggestions = currentEvents.filter((e) => {
      const fi = Number(e.frameIndex);
      return Number.isFinite(fi) && buildAutoSuggestedAngleCheckDrafts(referenceLandmarks, [e]).length > 0;
    });

    if (!eventsWithSuggestions.length) {
      setError("Ningún evento detectado produce sugerencias de ángulos (verifica que tengan frameIndex).");
      return;
    }

    setError("");
    setAngleWizard({
      open: true,
      phase: "select-events",
      availableEvents: eventsWithSuggestions.map((e) => ({
        eventType: e.eventType as TechniqueBiomechanicsEventType,
        label: e.label.trim() || formatBiomechanicsEventLabel(e.eventType as TechniqueBiomechanicsEventType),
      })),
      selectedEventTypes: eventsWithSuggestions.map((e) => e.eventType as TechniqueBiomechanicsEventType),
    });
  }

  function handleAngleWizardNext() {
    if (!angleWizard.open) return;
    const referenceLandmarks = selectedTechnique?.proLandmarks;
    if (!referenceLandmarks) return;
    const currentEvents = templateTechniqueForm.biomechanics.keyEvents;

    if (angleWizard.phase === "select-events") {
      if (!angleWizard.selectedEventTypes.length) {
        setError("Selecciona al menos un evento.");
        return;
      }
      const selectedEvents = currentEvents.filter((e) =>
        angleWizard.selectedEventTypes.includes(e.eventType as TechniqueBiomechanicsEventType),
      );
      const allSuggested = buildAutoSuggestedAngleCheckDrafts(referenceLandmarks, selectedEvents);
      const groups = angleWizard.selectedEventTypes
        .map((eventType) => {
          const eventDraft = currentEvents.find((e) => e.eventType === eventType);
          return {
            eventType,
            eventLabel: (eventDraft?.label.trim() || formatBiomechanicsEventLabel(eventType)),
            angles: allSuggested
              .filter((d) => d.anchorEventType === eventType)
              .map((draft) => ({ draft, include: true })),
          };
        })
        .filter((g) => g.angles.length > 0);

      if (!groups.length) {
        setError("No se encontraron ángulos para los eventos seleccionados.");
        return;
      }
      setError("");
      setAngleWizard({ open: true, phase: "review-angles", groups, groupIndex: 0 });
    } else if (angleWizard.phase === "review-angles") {
      const nextIndex = angleWizard.groupIndex + 1;
      if (nextIndex < angleWizard.groups.length) {
        setAngleWizard({ ...angleWizard, groupIndex: nextIndex });
      } else {
        // Finish: collect all included angles and add to form
        const accepted = angleWizard.groups.flatMap((g) =>
          g.angles.filter((a) => a.include).map((a) => a.draft),
        );
        setTemplateTechniqueForm((current) => ({
          ...current,
          biomechanics: {
            ...current.biomechanics,
            angleChecks: [
              ...current.biomechanics.angleChecks.filter(
                (a) => !a.notes.startsWith("Auto-sugerido"),
              ),
              ...accepted,
            ],
          },
        }));
        setAngleWizard({ open: false });
        setMessage(`${accepted.length} ángulo(s) agregados. Recuerda guardar la técnica.`);
      }
    }
  }
  }

  function handleFocusPointSelect(pointId: string, landmark: LandmarkName) {
    setVisualEditorMode("points");
    setSelectedFocusPointId(pointId);
    setSelectedPointCheckId(null);
    setSelectedAngleCheckId(null);
    setSelectedTrajectoryCheckId(null);
    setSelectedKeyEventId(null);
    setHoveredVisualLandmark(landmark);
  }

  function handlePointCheckSelect(pointCheckId: string) {
    const pointCheck = templateTechniqueForm.biomechanics.pointChecks.find((entry) => entry.id === pointCheckId) ?? null;
    const anchorFrame = pointCheck?.anchorEventId
      ? referenceEventMarkers.find((event) => event.id === pointCheck.anchorEventId)?.frameIndex ?? null
      : null;

    pauseReferenceVideo();
    setVisualEditorMode("inspect");
    setSelectedFocusPointId(null);
    setSelectedPointCheckId(pointCheckId);
    setSelectedAngleCheckId(null);
    setSelectedTrajectoryCheckId(null);
    setSelectedKeyEventId(null);
    setPendingAngleLandmarks([]);
    setHoveredVisualLandmark(pointCheck?.landmark ?? null);

    if (anchorFrame !== null) {
      setSelectedReferenceFrameIndex(anchorFrame);
    }
  }

  function handleAngleCheckSelect(angleId: string) {
    setVisualEditorMode("angles");
    setSelectedFocusPointId(null);
    setSelectedPointCheckId(null);
    setSelectedAngleCheckId(angleId);
    setSelectedTrajectoryCheckId(null);
    setSelectedKeyEventId(null);
    setPendingAngleLandmarks([]);
    setHoveredVisualLandmark(null);
  }

  function handleTrajectoryCheckSelect(trajectoryId: string) {
    const trajectoryCheck = templateTechniqueForm.biomechanics.trajectoryChecks.find((trajectory) => trajectory.id === trajectoryId) ?? null;
    const startFrame = trajectoryCheck?.windowStartEventId
      ? referenceEventMarkers.find((event) => event.id === trajectoryCheck.windowStartEventId)?.frameIndex ?? null
      : null;

    pauseReferenceVideo();
    setVisualEditorMode("inspect");
    setSelectedFocusPointId(null);
    setSelectedPointCheckId(null);
    setSelectedAngleCheckId(null);
    setSelectedTrajectoryCheckId(trajectoryId);
    setSelectedKeyEventId(null);
    setPendingAngleLandmarks([]);
    setHoveredVisualLandmark(trajectoryCheck?.landmark ?? null);

    if (startFrame !== null) {
      setSelectedReferenceFrameIndex(startFrame);
    }
  }

  function handleKeyEventSelect(eventId: string, eventType: TechniqueBiomechanicsEventType, frameIndex: number | null) {
    setVisualEditorMode("events");
    setSelectedFocusPointId(null);
    setSelectedPointCheckId(null);
    setSelectedAngleCheckId(null);
    setSelectedTrajectoryCheckId(null);
    setSelectedKeyEventId(eventId);
    setPendingEventType(eventType);
    if (frameIndex !== null) {
      pauseReferenceVideo();
      setSelectedReferenceFrameIndex(frameIndex);
    }
  }

  function handleVisualEditorModeChange(mode: TechniqueVisualEditorMode) {
    setVisualEditorMode(mode);
    if (mode !== "angles") {
      setPendingAngleLandmarks([]);
    }
  }

  function handleTimelineMarkerSelect(markerId: string) {
    const marker = referenceEventMarkers.find((event) => event.id === markerId);
    if (!marker) {
      return;
    }

    handleKeyEventSelect(marker.id, marker.eventType, marker.frameIndex);
  }

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [selectedTeamId, teams],
  );

  const selectedAthlete = useMemo(
    () => selectedTeam?.athletes.find((athlete) => athlete.id === selectedAthleteProfileId) ?? null,
    [selectedAthleteProfileId, selectedTeam],
  );

  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  );

  const selectedProgramAthlete = useMemo(
    () => allAthletes.find((athlete) => athlete.id === programGeneration.athleteProfileId) ?? null,
    [allAthletes, programGeneration.athleteProfileId],
  );

  const selectedTeamStaff = useMemo(
    () => selectedTeam?.memberships.filter((membership) => membership.role !== "ATHLETE") ?? [],
    [selectedTeam],
  );

  const selectedMembership = useMemo(
    () => selectedTeamStaff.find((membership) => membership.id === selectedMembershipId) ?? null,
    [selectedMembershipId, selectedTeamStaff],
  );

  const selectedTeamCoaches = useMemo(
    () => selectedTeam?.memberships.filter((membership) => membership.role === "COACH") ?? [],
    [selectedTeam],
  );

  const teamlessAthletes = useMemo(
    () => allAthletes.filter((athlete) => !athlete.team),
    [allAthletes],
  );

  const canCreateAthlete = Boolean(selectedTeamId);
  const selectedTeamAthleteCount = selectedTeam?.athletes.length ?? 0;
  const selectedTeamCoachCount = selectedTeamCoaches.length;
  const selectedTeamStaffCount = selectedTeamStaff.length;

  const exerciseOptions = useMemo(
    () => exercises.map((exercise) => ({ id: exercise.id, name: exercise.name })),
    [exercises],
  );

  const exerciseById = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise] as const)),
    [exercises],
  );

  const coachOptions = useMemo(() => {
    const options = new Map<string, { id: string; label: string; teamName: string }>();

    for (const team of teams) {
      for (const membership of team.memberships) {
        if (membership.role !== "COACH") {
          continue;
        }

        if (!options.has(membership.user.id)) {
          options.set(membership.user.id, {
            id: membership.user.id,
            label: displayName(membership.user),
            teamName: team.name,
          });
        }
      }
    }

    return Array.from(options.values());
  }, [teams]);

  useEffect(() => {
    if (!accessToken) {
      setCurrentUser(null);
      setSummary(null);
      setExercises([]);
      setTeams([]);
      setAllAthletes([]);
      setPrograms([]);
      setProgramSessions([]);
      setSelectedProgramId("");
      setSelectedProgramSessionId("");
      setSelectedProgramSession(null);
      setCoachDashboard(null);
      setTemplateDays([]);
      return;
    }

    void refreshDashboard(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (selectedExercise) {
      setExerciseForm(mapExerciseToForm(selectedExercise));
      setBlockDraft(
        (selectedExercise.asBlock?.items ?? []).map((item) => ({
          _key: item.id,
          exerciseId: item.exercise.id,
          order: item.order,
          setsOverride: item.setsOverride != null ? String(item.setsOverride) : "",
          repsKind: (item.repsOverride?.match(/\d+\s*s(eg)?/i) ? "time" : "reps") as "reps" | "time",
          repsOverride: item.repsOverride ?? "",
          notes: item.notes ?? "",
        })),
      );
    }
  }, [selectedExercise]);

  useEffect(() => {
    if (selectedDay) {
      setPrescriptionsDraft(mapDayToDraft(selectedDay));
      setSelectedPrescriptionIdx(0);
    }
  }, [selectedDay]);

  useEffect(() => {
    if (selectedTeam) {
      setTeamForm(mapTeamToForm(selectedTeam));

      const firstAthlete = selectedTeam.athletes[0];
      const firstStaff = selectedTeamStaff[0];
      setSelectedAthleteProfileId((current) => {
        if (current && selectedTeam.athletes.some((athlete) => athlete.id === current)) {
          return current;
        }

        return firstAthlete?.id ?? "";
      });

      setSelectedMembershipId((current) => {
        if (current && selectedTeamStaff.some((membership) => membership.id === current)) {
          return current;
        }

        return firstStaff?.id ?? "";
      });

      const firstCoach = selectedTeamCoaches[0];
      setSelectedCoachUserId((current) => {
        if (current && selectedTeamCoaches.some((coach) => coach.user.id === current)) {
          return current;
        }

        return firstCoach?.user.id ?? "";
      });
    } else {
      setTeamForm(emptyTeamForm());
      setSelectedAthleteProfileId("");
      setSelectedMembershipId("");
      setSelectedCoachUserId("");
    }
  }, [selectedTeam, selectedTeamCoaches, selectedTeamStaff]);

  useEffect(() => {
    if (selectedMembership) {
      setMemberForm(mapMemberToForm(selectedMembership));
    } else {
      setMemberForm(emptyMemberForm());
    }
  }, [selectedMembership]);

  useEffect(() => {
    if (selectedAthlete) {
      setAthleteForm(mapAthleteToForm(selectedAthlete));
    } else {
      setAthleteForm(emptyAthleteForm());
    }
  }, [selectedAthlete]);

  useEffect(() => {
    if (selectedAthleteProfileId) {
      setProgramGeneration((current) => ({ ...current, athleteProfileId: selectedAthleteProfileId }));
    }
  }, [selectedAthleteProfileId]);

  useEffect(() => {
    if (!accessToken || !selectedProgramId) {
      setProgramSessions([]);
      setSelectedProgramSessionId("");
      setSelectedProgramSession(null);
      setSessionEditor(emptySessionEditor());
      return;
    }

    void loadProgramSessions(selectedProgramId, accessToken);
  }, [selectedProgramId, accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedProgramSessionId) {
      setSelectedProgramSession(null);
      setSessionEditor(emptySessionEditor());
      return;
    }

    void loadProgramSessionDetail(selectedProgramSessionId, accessToken);
  }, [selectedProgramSessionId, accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedCoachDashboardId) {
      setCoachDashboard(null);
      return;
    }

    void loadCoachDashboard(selectedCoachDashboardId, accessToken);
  }, [selectedCoachDashboardId, accessToken]);

  async function refreshDashboard(token = accessToken ?? undefined) {
    if (!token) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [meResponse, summaryResponse, exercisesResponse, templateResponse, allTemplatesResponse, teamsResponse, athletesResponse, programsResponse] = await Promise.all([
        requestJson<{ user: AuthUser }>("/api/v1/auth/me", {}, token),
        requestJson<AdminSummary>("/api/v1/admin/summary", {}, token),
        requestJson<{ exercises: ExerciseRecord[] }>("/api/v1/admin/exercises", {}, token),
        requestJson<ProgramTemplateResponse>(`/api/v1/templates/program-templates/${selectedTemplateCode}`, {}, token),
        requestJson<{ templates: ProgramTemplateMeta[] }>("/api/v1/admin/program-templates", {}, token),
        requestJson<{ teams: TeamRecord[] }>("/api/v1/admin/teams", {}, token),
        requestJson<{ athletes: AthleteProfileRecord[] }>("/api/v1/admin/athletes", {}, token),
        requestJson<{ programs: PersonalProgramRecord[] }>("/api/v1/admin/programs", {}, token),
      ]);

      setCurrentUser(meResponse.user);
      setSummary(summaryResponse.metrics);
      setExercises(exercisesResponse.exercises);
      setTeams(teamsResponse.teams);
      setAllAthletes(athletesResponse.athletes);
      setPrograms(programsResponse.programs);
      setTemplateDays(templateResponse.template.days);
      const initialTechnique = templateResponse.template.techniques[0] ?? null;
      setTemplateTechniques(templateResponse.template.techniques ?? []);
      setSelectedTechniqueId(initialTechnique?.id ?? "");
      setSelectedTemplateTechniqueMediaAssets(initialTechnique?.mediaAssets ?? []);
      setTemplateTechniqueForm(initialTechnique ? mapTechniqueToForm(initialTechnique) : emptyTechniqueForm());
      setTechniqueUploadState(emptyTechniqueUploadState());
      setAllTemplates(allTemplatesResponse.templates);

      const firstExercise = exercisesResponse.exercises[0];
      if (!selectedExerciseId && firstExercise) {
        setSelectedExerciseId(firstExercise.id);
      }

      const firstDay = templateResponse.template.days[0];
      if (firstDay) {
        setSelectedDayNumber((current) => {
          const exists = templateResponse.template.days.some((day) => day.dayNumber === current);
          return exists ? current : firstDay.dayNumber;
        });
      }

      const firstTeam = teamsResponse.teams[0];
      if (firstTeam) {
        setSelectedTeamId((current) => {
          const exists = teamsResponse.teams.some((team) => team.id === current);
          return exists ? current : firstTeam.id;
        });
      } else {
        setSelectedTeamId(null);
      }

      const firstProgram = programsResponse.programs[0];
      if (firstProgram) {
        setSelectedProgramId((current) => {
          const exists = programsResponse.programs.some((program) => program.id === current);
          return exists ? current : firstProgram.id;
        });
      } else {
        setSelectedProgramId("");
      }

      const teamCoachOptions = teamsResponse.teams.flatMap((team) =>
        team.memberships
          .filter((membership) => membership.role === "COACH")
          .map((membership) => ({
            id: membership.user.id,
            label: displayName(membership.user),
          })),
      );

      const firstCoach = teamCoachOptions[0];
      if (firstCoach) {
        setSelectedCoachDashboardId((current) => {
          const exists = teamCoachOptions.some((coach) => coach.id === current);
          return exists ? current : firstCoach.id;
        });
      } else {
        setSelectedCoachDashboardId("");
      }
    } catch (requestError) {
      const nextError = requestError instanceof Error ? requestError.message : "No se pudo cargar el panel";
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }

  async function loadProgramSessions(programId: string, token = accessToken ?? undefined) {
    if (!token) {
      return;
    }

    try {
      const response = await requestJson<{ sessions: AdminSessionRecord[] }>(
        `/api/v1/admin/programs/${programId}/sessions`,
        {},
        token,
      );
      setProgramSessions(response.sessions);

      const firstSession = response.sessions[0];
      if (firstSession) {
        setSelectedProgramSessionId((current) => {
          const exists = response.sessions.some((session) => session.id === current);
          return exists ? current : firstSession.id;
        });
      } else {
        setSelectedProgramSessionId("");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar las sesiones del programa");
    }
  }

  async function loadProgramSessionDetail(sessionId: string, token = accessToken ?? undefined) {
    if (!token) {
      return;
    }

    try {
      const response = await requestJson<{ session: AdminSessionRecord }>(`/api/v1/admin/sessions/${sessionId}`, {}, token);
      setSelectedProgramSession(response.session);
      setSessionEditor(mapSessionToEditor(response.session));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el detalle de sesion");
    }
  }

  async function loadCoachDashboard(coachUserId: string, token = accessToken ?? undefined) {
    if (!token) {
      return;
    }

    try {
      const query = new URLSearchParams({ coachUserId }).toString();
      const response = await requestJson<CoachDashboardResponse>(`/api/v1/coach/dashboard?${query}`, {}, token);
      setCoachDashboard(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el panel coach");
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const response = await requestJson<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });

      localStorage.setItem(tokenStorageKey, response.accessToken);
      setAccessToken(response.accessToken);
      setCurrentUser(response.user);
      setMessage("Sesion iniciada correctamente.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo iniciar sesion");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(tokenStorageKey);
    setAccessToken(null);
    setCurrentUser(null);
    setMessage("Sesion cerrada.");
    setSelectedExerciseId(null);
    setExerciseForm(emptyExerciseForm());
    setSelectedTeamId(null);
    setSelectedMembershipId("");
    setTeamForm(emptyTeamForm());
  }

  async function handleExerciseSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    const payload = {
      name: exerciseForm.name,
      slug: exerciseForm.slug,
      category: exerciseForm.category,
      description: exerciseForm.description || undefined,
      equipment: exerciseForm.equipment || undefined,
      requiresLoad: exerciseForm.requiresLoad,
      perLeg: exerciseForm.perLeg,
      isBlock: exerciseForm.isBlock,
      defaultSeriesProtocol: exerciseForm.defaultSeriesProtocol,
      summary: exerciseForm.summary,
      steps: exerciseForm.steps,
      safetyNotes: exerciseForm.safetyNotes || undefined,
    };

    try {
      setLoading(true);
      setError("");

      if (exerciseForm.id) {
        await requestJson<{ exercise: ExerciseRecord }>(
          `/api/v1/admin/exercises/${exerciseForm.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setMessage("Ejercicio actualizado.");
      } else {
        const response = await requestJson<{ exercise: ExerciseRecord }>(
          "/api/v1/admin/exercises",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setSelectedExerciseId(response.exercise.id);
        setMessage("Ejercicio creado.");
      }

      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el ejercicio");
    } finally {
      setLoading(false);
    }
  }

  async function handleExerciseDelete() {
    if (!accessToken || !exerciseForm.id) {
      return;
    }

    const confirmed = window.confirm("Eliminar este ejercicio puede fallar si ya esta referenciado por la plantilla. Continuar?");
    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(`/api/v1/admin/exercises/${exerciseForm.id}`, { method: "DELETE" }, accessToken);
      setMessage("Ejercicio eliminado.");
      setSelectedExerciseId(null);
      setExerciseForm(emptyExerciseForm());
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar el ejercicio");
    } finally {
      setLoading(false);
    }
  }

  async function handleMediaUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !exerciseForm.id || !uploadState.file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadState.file);
    formData.append("kind", uploadState.kind);
    formData.append("title", uploadState.title);
    formData.append("isPrimary", String(uploadState.isPrimary));

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/exercises/${exerciseForm.id}/media`,
        {
          method: "POST",
          body: formData,
        },
        accessToken,
      );
      setUploadState({ kind: "IMAGE", title: "", isPrimary: false, file: null });
      setMessage("Media subida a MinIO y asociada al ejercicio.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo subir la media");
    } finally {
      setLoading(false);
    }
  }

  async function handleMediaDelete(mediaId: string) {
    if (!accessToken || !exerciseForm.id) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/exercises/${exerciseForm.id}/media/${mediaId}`,
        {
          method: "DELETE",
        },
        accessToken,
      );
      setMessage("Media eliminada.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar la media");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveBlockItems(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !exerciseForm.id) return;
    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/exercises/${exerciseForm.id}/block-items`,
        {
          method: "PUT",
          body: JSON.stringify({
            items: blockDraft.map((item, idx) => ({
              exerciseId: item.exerciseId,
              order: idx,
              setsOverride: item.setsOverride !== "" && !isNaN(parseInt(item.setsOverride, 10)) ? parseInt(item.setsOverride, 10) : null,
              repsOverride: item.repsOverride || null,
              notes: item.notes || null,
            })),
          }),
        },
        accessToken,
      );
      setMessage("Estructura del bloque guardada.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar la estructura");
    } finally {
      setLoading(false);
    }
  }

  async function handlePrescriptionsSave() {
    if (!accessToken || !selectedDay) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const payload = {
        prescriptions: prescriptionsDraft.map((item, index) => {
          const exercise = exerciseById.get(item.exerciseId);
          const usesStrengthPreset = exercise?.defaultSeriesProtocol === "STRENGTH_EXPLOSION";

          return {
            exerciseId: item.exerciseId,
            orderIndex: index + 1,
            seriesProtocol: usesStrengthPreset ? "NONE" : item.seriesProtocol,
            blockLabel: item.blockLabel || undefined,
            sets: usesStrengthPreset ? undefined : item.sets ? Number(item.sets) : undefined,
            repsText: usesStrengthPreset ? undefined : item.repsText || undefined,
            durationSeconds: usesStrengthPreset ? undefined : item.durationSeconds ? Number(item.durationSeconds) : undefined,
            restSeconds: usesStrengthPreset ? undefined : item.restSeconds ? Number(item.restSeconds) : undefined,
            loadText: usesStrengthPreset ? undefined : item.loadText || undefined,
            tempoText: usesStrengthPreset ? undefined : item.tempoText || undefined,
            notes: item.notes || undefined,
          };
        }),
      };

      const response = await requestJson<{ day: ProgramDay }>(
        `/api/v1/admin/program-templates/${selectedTemplateCode}/days/${selectedDay.dayNumber}/prescriptions`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
        accessToken,
      );

      setTemplateDays((currentDays) =>
        currentDays.map((day) => (day.dayNumber === response.day.dayNumber ? response.day : day)),
      );
      setPrescriptionsDraft(mapDayToDraft(response.day));
      setMessage(`Prescripciones del dia ${selectedDay.dayNumber} actualizadas.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron guardar las prescripciones");
    } finally {
      setLoading(false);
    }
  }

  async function handleTemplateDaysLoad(code: string, token = accessToken ?? undefined) {
    if (!token) return;
    try {
      const response = await requestJson<ProgramTemplateResponse>(`/api/v1/templates/program-templates/${code}`, {}, token);
      setTemplateDays(response.template.days);
      const techniques = response.template.techniques ?? [];
      const nextTechnique = techniques[0] ?? null;
      setTemplateTechniques(techniques);
      setSelectedTechniqueId(nextTechnique?.id ?? "");
      setSelectedTemplateTechniqueMediaAssets(nextTechnique?.mediaAssets ?? []);
      setTemplateTechniqueForm(nextTechnique ? mapTechniqueToForm(nextTechnique) : emptyTechniqueForm());
      setTechniqueUploadState(emptyTechniqueUploadState());
      setSelectedDayNumber(response.template.days[0]?.dayNumber ?? 1);
    } catch {
      setTemplateDays([]);
      setTemplateTechniques([]);
      setSelectedTechniqueId("");
      setSelectedTemplateTechniqueMediaAssets([]);
      setTemplateTechniqueForm(emptyTechniqueForm());
      setTechniqueUploadState(emptyTechniqueUploadState());
    }
  }

  async function handleTechniqueSave() {
    if (!accessToken || !selectedTemplateCode) return;
    try {
      setLoading(true);
      setError("");
      const techniquePayload = {
        title: templateTechniqueForm.title,
        description: templateTechniqueForm.description || null,
        measurementInstructions: templateTechniqueForm.measurementInstructions || null,
        biomechanicsConfig: serializeTechniqueBiomechanicsForm(
          templateTechniqueForm.biomechanics,
          normalizeTechniqueBiomechanicsConfig(selectedTechnique?.biomechanicsConfig).referenceMediaAssetId,
        ),
        comparisonEnabled: templateTechniqueForm.comparisonEnabled,
      };

      let techniqueId = templateTechniqueForm.id;
      if (techniqueId) {
        await requestJson(
          `/api/v1/admin/program-templates/${selectedTemplateCode}/techniques/${techniqueId}`,
          {
            method: "PUT",
            body: JSON.stringify(techniquePayload),
          },
          accessToken,
        );
      } else {
        const response = await requestJson<{ technique: ProgramTechniqueRecord }>(
          `/api/v1/admin/program-templates/${selectedTemplateCode}/techniques`,
          {
            method: "POST",
            body: JSON.stringify(techniquePayload),
          },
          accessToken,
        );
        techniqueId = response.technique.id;
      }

      if (!techniqueId) {
        throw new Error("No se pudo determinar la técnica guardada");
      }

      const existingMeasurementIds = new Set(selectedTechnique?.measurementDefinitions.map((definition) => definition.id) ?? []);
      const currentMeasurementIds = new Set(
        templateTechniqueForm.measurements
          .map((measurement) => measurement.id)
          .filter((measurementId): measurementId is string => Boolean(measurementId)),
      );

      for (const measurementId of existingMeasurementIds) {
        if (currentMeasurementIds.has(measurementId)) {
          continue;
        }

        await requestJson(
          `/api/v1/admin/program-templates/${selectedTemplateCode}/techniques/${techniqueId}/measurements/${measurementId}`,
          { method: "DELETE" },
          accessToken,
        );
      }

      for (let index = 0; index < templateTechniqueForm.measurements.length; index += 1) {
        const measurement = templateTechniqueForm.measurements[index];
        if (!measurement) {
          continue;
        }

        if (!measurement.label.trim()) {
          continue;
        }

        const measurementPayload = {
          label: measurement.label.trim(),
          instructions: measurement.instructions.trim() || null,
          allowedUnits: measurement.allowedUnitsText
            .split(",")
            .map((unit) => unit.trim())
            .filter(Boolean),
          orderIndex: index + 1,
        };

        if (measurement.id) {
          await requestJson(
            `/api/v1/admin/program-templates/${selectedTemplateCode}/techniques/${techniqueId}/measurements/${measurement.id}`,
            {
              method: "PUT",
              body: JSON.stringify(measurementPayload),
            },
            accessToken,
          );
        } else {
          await requestJson(
            `/api/v1/admin/program-templates/${selectedTemplateCode}/techniques/${techniqueId}/measurements`,
            {
              method: "POST",
              body: JSON.stringify(measurementPayload),
            },
            accessToken,
          );
        }
      }

      setMessage("Técnica y mediciones guardadas.");
      await refreshDashboard(accessToken);
      await handleTemplateDaysLoad(selectedTemplateCode, accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar la tecnica del programa");
    } finally {
      setLoading(false);
    }
  }

  async function handleTechniqueDelete() {
    if (!accessToken || !selectedTemplateCode || !selectedTechniqueId) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/program-templates/${selectedTemplateCode}/techniques/${selectedTechniqueId}`,
        { method: "DELETE" },
        accessToken,
      );
      setMessage("Técnica eliminada.");
      await refreshDashboard(accessToken);
      await handleTemplateDaysLoad(selectedTemplateCode, accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar la técnica");
    } finally {
      setLoading(false);
    }
  }

  async function handleTechniqueMediaUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !selectedTemplateCode || !selectedTechniqueId || !techniqueUploadState.file) {
      return;
    }

    const uploadFile = techniqueUploadState.file;
    const uploadKind = techniqueUploadState.kind;

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("kind", uploadKind);
    formData.append("title", techniqueUploadState.title);
    formData.append("isPrimary", String(techniqueUploadState.isPrimary));

    try {
      setLoading(true);
      setError("");
      setTechniquePoseProcessing({
        status: "uploading",
        processedFrames: 0,
        totalFrames: 0,
        detail: uploadKind === "VIDEO" && techniqueUploadState.useAsProReference
          ? "Cargando video profesional..."
          : "Cargando recurso de técnica...",
      });
      const uploadResponse = await requestJson<{ mediaAsset: ProgramTechniqueMediaAsset }>(
        `/api/v1/admin/program-templates/${selectedTemplateCode}/techniques/${selectedTechniqueId}/media`,
        { method: "POST", body: formData },
        accessToken,
      );

      let nextMessage = "Recurso de técnica subido.";

      if (uploadKind === "VIDEO" && techniqueUploadState.useAsProReference) {
        setTechniquePoseProcessing({
          status: "processing",
          processedFrames: 0,
          totalFrames: 0,
          detail: "Extrayendo landmarks del video profesional...",
        });

        try {
          const poseSequence = await extractTechniquePoseSequence(uploadFile, {
            onProgress: (processedFrames, totalFrames) => {
              setTechniquePoseProcessing({
                status: "processing",
                processedFrames,
                totalFrames,
                detail: "Extrayendo landmarks del video profesional...",
              });
            },
          });
          const detectionResult = detectTechniqueKeyEventsWithDebug(poseSequence);
          const detectedEvents = detectionResult.events;
          const normalizedConfig = normalizeTechniqueBiomechanicsConfig(selectedTechnique?.biomechanicsConfig);

          setReferenceEventDetectionDebug({
            eventCount: detectedEvents.length,
            debug: detectionResult.debug,
          });

          await requestJson(
            `/api/v1/admin/program-templates/${selectedTemplateCode}/techniques/${selectedTechniqueId}`,
            {
              method: "PUT",
              body: JSON.stringify({
                proVideoUrl: uploadResponse.mediaAsset.url,
                proLandmarks: poseSequence,
                biomechanicsConfig: {
                  ...normalizedConfig,
                  schemaVersion: 1,
                  referenceMediaAssetId: uploadResponse.mediaAsset.id,
                  referenceMotionProfile: techniqueUploadState.referenceMotionProfile,
                  keyEvents: mergeAutoDetectedKeyEventRecords(normalizedConfig.keyEvents, detectedEvents, poseSequence),
                },
              }),
            },
            accessToken,
          );

          setTechniquePoseProcessing(emptyTechniquePoseProcessingState());
          nextMessage = `Recurso subido y referencia biomecánica generada (${poseSequence.frameCount} frame(s), ${detectedEvents.length} evento(s) sugerido(s)).`;
        } catch (processingError) {
          setTechniquePoseProcessing({
            status: "error",
            processedFrames: 0,
            totalFrames: 0,
            detail: processingError instanceof Error
              ? processingError.message
              : "No se pudo extraer la referencia biomecánica del video.",
          });
          nextMessage = "El video se subió, pero no se pudo generar la referencia biomecánica automáticamente.";
        }
      }

      if (!(uploadKind === "VIDEO" && techniqueUploadState.useAsProReference)) {
        setTechniquePoseProcessing(emptyTechniquePoseProcessingState());
      }

      setTechniqueUploadState(emptyTechniqueUploadState());
      setMessage(nextMessage);
      await handleTemplateDaysLoad(selectedTemplateCode, accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo subir el video de tecnica");
    } finally {
      setLoading(false);
    }
  }

  async function handleTechniqueMediaDelete(mediaId: string) {
    if (!accessToken || !selectedTemplateCode || !selectedTechniqueId) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      const currentConfig = normalizeTechniqueBiomechanicsConfig(selectedTechnique?.biomechanicsConfig);
      await requestJson(
        `/api/v1/admin/program-templates/${selectedTemplateCode}/techniques/${selectedTechniqueId}/media/${mediaId}`,
        { method: "DELETE" },
        accessToken,
      );

      if (currentConfig.referenceMediaAssetId === mediaId) {
        await requestJson(
          `/api/v1/admin/program-templates/${selectedTemplateCode}/techniques/${selectedTechniqueId}`,
          {
            method: "PUT",
            body: JSON.stringify({
              proVideoUrl: null,
              proLandmarks: null,
              biomechanicsConfig: {
                ...currentConfig,
                schemaVersion: 1,
                referenceMediaAssetId: null,
                referenceMotionProfile: currentConfig.referenceMotionProfile,
              },
            }),
          },
          accessToken,
        );
      }

      setMessage("Recurso de técnica eliminado.");
      await handleTemplateDaysLoad(selectedTemplateCode, accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar el video de tecnica");
    } finally {
      setLoading(false);
    }
  }

  async function handleTemplateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    try {
      setLoading(true);
      setError("");
      const payload = {
        code: templateForm.code,
        name: templateForm.name,
        description: templateForm.description || undefined,
        cycleLengthDays: Number(templateForm.cycleLengthDays),
      };
      if (templateForm.id) {
        await requestJson(`/api/v1/admin/program-templates/${templateForm.code}`, { method: "PUT", body: JSON.stringify({ name: payload.name, description: payload.description, cycleLengthDays: payload.cycleLengthDays }) }, accessToken);
        setMessage("Programa actualizado.");
      } else {
        await requestJson("/api/v1/admin/program-templates", { method: "POST", body: JSON.stringify(payload) }, accessToken);
        setMessage("Programa creado.");
      }
      setTemplateModalOpen(false);
      setTemplateForm(emptyTemplateForm());
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Error al guardar el programa");
    } finally {
      setLoading(false);
    }
  }

  async function handleTemplateDelete(code: string) {
    if (!accessToken || !confirm(`¿Eliminar el programa "${code}"?`)) return;
    try {
      setLoading(true);
      setError("");
      await requestJson(`/api/v1/admin/program-templates/${code}`, { method: "DELETE" }, accessToken);
      setMessage("Programa eliminado.");
      if (selectedTemplateCode === code) {
        const remaining = allTemplates.filter((t) => t.code !== code);
        setSelectedTemplateCode(remaining[0]?.code ?? "JUMP-MANUAL-14D");
      }
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Error al eliminar el programa");
    } finally {
      setLoading(false);
    }
  }

  async function handleExclusionsUpdate(athleteProfileId: string, exerciseIds: string[]) {
    if (!accessToken) return;
    const athlete = allAthletes.find((a) => a.id === athleteProfileId);
    if (!athlete) return;
    try {
      setLoading(true);
      setError("");
      await requestJson(`/api/v1/admin/teams/${athlete.team?.id}/athletes/${athleteProfileId}/exclusions`, { method: "PUT", body: JSON.stringify({ exerciseIds }) }, accessToken);
      setMessage("Exclusiones actualizadas.");
      setExclusionsAthleteId("");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Error al guardar exclusiones");
    } finally {
      setLoading(false);
    }
  }

  async function handleTeamSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    const payload = {
      name: teamForm.name,
      slug: teamForm.slug,
      description: teamForm.description || undefined,
    };

    try {
      setLoading(true);
      setError("");

      if (teamForm.id) {
        await requestJson(
          `/api/v1/admin/teams/${teamForm.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setMessage("Equipo actualizado.");
      } else {
        const response = await requestJson<{ team: TeamRecord }>(
          "/api/v1/admin/teams",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setSelectedTeamId(response.team.id);
        setMessage("Equipo creado.");
      }

      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el equipo");
    } finally {
      setLoading(false);
    }
  }

  async function handleMemberSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !selectedTeamId) {
      setError("Selecciona o crea primero un equipo en la vista Usuarios antes de cargar staff.");
      return;
    }

    const payload = {
      email: memberForm.email,
      password: memberForm.password || undefined,
      firstName: memberForm.firstName || undefined,
      lastName: memberForm.lastName || undefined,
      role: memberForm.role,
    };

    try {
      setLoading(true);
      setError("");

      if (selectedMembershipId) {
        await requestJson(
          `/api/v1/admin/teams/${selectedTeamId}/members/${selectedMembershipId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setMessage("Staff actualizado.");
      } else {
        await requestJson(
          `/api/v1/admin/teams/${selectedTeamId}/members`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setMessage(`Usuario ${memberForm.role === "COACH" ? "coach" : "team admin"} creado o asociado.`);
      }

      setSelectedMembershipId("");
      setMemberForm(emptyMemberForm());
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el staff");
    } finally {
      setLoading(false);
    }
  }

  async function handleAthleteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !selectedTeamId) {
      setError("Para crear un atleta primero debes crear o seleccionar un equipo en la vista Usuarios.");
      return;
    }

    const payload = {
      email: athleteForm.email,
      password: athleteForm.password || undefined,
      firstName: athleteForm.firstName || undefined,
      lastName: athleteForm.lastName || undefined,
      displayName: athleteForm.displayName || undefined,
      sport: athleteForm.sport || undefined,
      trainsSport: athleteForm.trainsSport,
      sportTrainingDays: athleteForm.trainsSport ? parseWeekdaysInput(athleteForm.sportTrainingDays) : [],
      seasonPhase: athleteForm.seasonPhase,
      availableWeekdays: parseWeekdaysInput(athleteForm.availableWeekdays),
      notes: athleteForm.notes || undefined,
    };

    try {
      setLoading(true);
      setError("");
      const response = await requestJson<{ athleteProfile: AthleteProfileRecord }>(
        selectedAthleteProfileId
          ? `/api/v1/admin/teams/${selectedTeamId}/athletes/${selectedAthleteProfileId}`
          : `/api/v1/admin/teams/${selectedTeamId}/athletes`,
        {
          method: selectedAthleteProfileId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
        accessToken,
      );
      setAthleteForm(emptyAthleteForm());
      setSelectedAthleteProfileId(response.athleteProfile.id);
      setMessage(selectedAthleteProfileId ? "Atleta actualizado." : "Atleta creado o actualizado y asociado al equipo.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el atleta");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignCoach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !selectedTeamId || !selectedAthleteProfileId || !selectedCoachUserId) {
      setError("Selecciona equipo, atleta y coach antes de guardar la asignacion.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/teams/${selectedTeamId}/athletes/${selectedAthleteProfileId}/assign-coach`,
        {
          method: "POST",
          body: JSON.stringify({ coachUserId: selectedCoachUserId }),
        },
        accessToken,
      );
      setMessage("Coach asignado al atleta.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo asignar el coach");
    } finally {
      setLoading(false);
    }
  }

  async function handleMemberDelete(membershipId: string) {
    if (!accessToken || !selectedTeamId) {
      return;
    }

    const confirmed = window.confirm("Se eliminara la membresia del staff seleccionado. Continuar?");
    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/teams/${selectedTeamId}/members/${membershipId}`,
        {
          method: "DELETE",
        },
        accessToken,
      );
      setSelectedMembershipId("");
      setMemberForm(emptyMemberForm());
      setMessage("Staff removido del equipo.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar el staff");
    } finally {
      setLoading(false);
    }
  }

  async function handleAthleteDelete(athleteProfileId = selectedAthleteProfileId) {
    if (!accessToken || !selectedTeamId || !athleteProfileId) {
      return;
    }

    const confirmed = window.confirm("Se dara de baja el atleta del equipo y se quitaran sus asignaciones de coach. Continuar?");
    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/teams/${selectedTeamId}/athletes/${athleteProfileId}`,
        {
          method: "DELETE",
        },
        accessToken,
      );
      if (athleteProfileId === selectedAthleteProfileId) {
        setSelectedAthleteProfileId("");
      }
      setAthleteForm(emptyAthleteForm());
      setMessage("Atleta removido del equipo.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo dar de baja el atleta");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignmentDelete(assignmentId: string) {
    if (!accessToken || !selectedTeamId || !selectedAthleteProfileId) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/teams/${selectedTeamId}/athletes/${selectedAthleteProfileId}/assignments/${assignmentId}`,
        {
          method: "DELETE",
        },
        accessToken,
      );
      setMessage("Asignacion coach-atleta eliminada.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar la asignacion");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateProgram(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !programGeneration.athleteProfileId || !programGeneration.startDate) {
      return;
    }

    const payload = {
      athleteProfileId: programGeneration.athleteProfileId,
      templateCode: programGeneration.templateCode,
      startDate: programGeneration.startDate,
      phase: programGeneration.phase || undefined,
      includePreparationPhase: programGeneration.includePreparationPhase,
      notes: programGeneration.notes || undefined,
    };

    try {
      setLoading(true);
      setError("");
      await requestJson(
        "/api/v1/admin/programs/generate",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        accessToken,
      );
      setMessage("Programa personalizado generado con sesiones programadas.");
      setProgramGeneration((current) => ({ ...current, notes: "" }));
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo generar el programa");
    } finally {
      setLoading(false);
    }
  }

  async function handleSessionUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !selectedProgramSessionId) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/sessions/${selectedProgramSessionId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: sessionEditor.title,
            scheduledDate: sessionEditor.scheduledDate,
            status: sessionEditor.status,
            notes: sessionEditor.notes || null,
          }),
        },
        accessToken,
      );
      setMessage("Sesion actualizada y reprogramada.");
      await loadProgramSessions(selectedProgramId, accessToken);
      await loadProgramSessionDetail(selectedProgramSessionId, accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo actualizar la sesion");
    } finally {
      setLoading(false);
    }
  }

  if (!accessToken) {
    return (
      <main className="page-shell auth-shell">
        <section className="hero-card login-card">
          <div className="hero-copy">
            <p className="eyebrow">3m30cm platform admin</p>
            <h1>Login para operar catalogo, equipos y programas personalizados.</h1>
            <p className="lede">
              El portal ya entra con JWT, administra catalogo y media, y ahora tambien gestiona equipos, atletas y la generacion del calendario personalizado.
            </p>
          </div>

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Email
              <input
                value={loginForm.email}
                onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                type="email"
                required
              />
            </label>
            <label>
              Password
              <input
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                type="password"
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar al portal"}
            </button>
            <p className="helper-text">Seed local: admin@3m30cm.local / Admin123!</p>
            {error ? <p className="feedback error">{error}</p> : null}
            {message ? <p className="feedback success">{message}</p> : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`app-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-logo">⚡</span>
          <span className="brand-name">3m30cm</span>
        </div>
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-item${adminView === "home" ? " active" : ""}`}
            onClick={() => setAdminView("home")}
            title="Inicio"
          >
            <span className="nav-icon">🏠</span>
            <span>Inicio</span>
          </button>
          <button
            type="button"
            className={`nav-item${adminView === "users" ? " active" : ""}`}
            onClick={() => setAdminView("users")}
            title="Usuarios"
          >
            <span className="nav-icon">👥</span>
            <span>Usuarios</span>
          </button>
          <button
            type="button"
            className={`nav-item${adminView === "training" ? " active" : ""}`}
            onClick={() => setAdminView("training")}
            title="Entrenamiento"
          >
            <span className="nav-icon">🏋️</span>
            <span>Entrenamiento</span>
          </button>
          <button
            type="button"
            className={`nav-item${adminView === "templates" ? " active" : ""}`}
            onClick={() => setAdminView("templates")}
            title="Programas"
          >
            <span className="nav-icon">🗂️</span>
            <span>Programas</span>
          </button>
          <button
            type="button"
            className={`nav-item${adminView === "technique" ? " active" : ""}`}
            onClick={() => setAdminView("technique")}
            title="Técnica"
          >
            <span className="nav-icon">🎯</span>
            <span>Técnica</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-user">{currentUser?.email}</span>
          <button
            type="button"
            className="sidebar-logout"
            onClick={handleLogout}
            title="Cerrar sesión"
          >
            <span className="nav-icon">🚪</span>
            <span>Salir</span>
          </button>
        </div>
      </aside>

      <div className={`app-main${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <header className="app-topbar">
          <button
            type="button"
            className="topbar-toggle"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {sidebarCollapsed ? "☰" : "✕"}
          </button>
          <h1 className="topbar-title">
            {adminView === "home"
              ? "Panel de control"
              : adminView === "users"
                ? "Usuarios"
                : adminView === "templates"
                  ? "Programas"
                  : adminView === "technique"
                    ? "Técnica"
                    : "Entrenamiento"}
          </h1>
        </header>

        {error ? <p className="app-banner error">{error}</p> : null}
        {message ? <p className="app-banner success">{message}</p> : null}

        <div className="app-content">

          {adminView === "home" ? (
            <div className="home-view">
              <div className="home-metrics">
                <article className="home-metric-card">
                  <span className="home-metric-emoji">👥</span>
                  <strong className="home-metric-value">{summary?.users ?? 0}</strong>
                  <span className="home-metric-label">Usuarios</span>
                </article>
                <article className="home-metric-card">
                  <span className="home-metric-emoji">🏆</span>
                  <strong className="home-metric-value">{summary?.teams ?? 0}</strong>
                  <span className="home-metric-label">Equipos</span>
                </article>
                <article className="home-metric-card">
                  <span className="home-metric-emoji">🏃</span>
                  <strong className="home-metric-value">{summary?.athletes ?? 0}</strong>
                  <span className="home-metric-label">Atletas</span>
                </article>
                <article className="home-metric-card">
                  <span className="home-metric-emoji">💪</span>
                  <strong className="home-metric-value">{summary?.exercises ?? 0}</strong>
                  <span className="home-metric-label">Ejercicios</span>
                </article>
                <article className="home-metric-card">
                  <span className="home-metric-emoji">📋</span>
                  <strong className="home-metric-value">{summary?.programs ?? 0}</strong>
                  <span className="home-metric-label">Programas</span>
                </article>
                <article className="home-metric-card">
                  <span className="home-metric-emoji">📅</span>
                  <strong className="home-metric-value">{summary?.sessions ?? 0}</strong>
                  <span className="home-metric-label">Sesiones</span>
                </article>
              </div>

              <section className="panel-card">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Resumen de plataforma</p>
                    <h2>Distribución de recursos</h2>
                  </div>
                </div>
                <div className="home-chart">
                  {(
                    [
                      { label: "Usuarios", value: summary?.users ?? 0, emoji: "👥", color: "var(--accent)" },
                      { label: "Atletas", value: summary?.athletes ?? 0, emoji: "🏃", color: "var(--success)" },
                      { label: "Ejercicios", value: summary?.exercises ?? 0, emoji: "💪", color: "#0984e3" },
                      { label: "Programas", value: summary?.programs ?? 0, emoji: "📋", color: "#6c5ce7" },
                      { label: "Sesiones", value: summary?.sessions ?? 0, emoji: "📅", color: "var(--accent-soft)" },
                    ] as Array<{ label: string; value: number; emoji: string; color: string }>
                  ).map((item) => {
                    const max = Math.max(
                      summary?.users ?? 0,
                      summary?.athletes ?? 0,
                      summary?.exercises ?? 0,
                      summary?.programs ?? 0,
                      summary?.sessions ?? 0,
                      1,
                    );
                    const pct = Math.round((item.value / max) * 100);
                    return (
                      <div key={item.label} className="chart-bar-row">
                        <span className="chart-bar-label">{item.emoji} {item.label}</span>
                        <div className="chart-bar-track">
                          <div className="chart-bar-fill" style={{ width: `${pct}%`, background: item.color }} />
                        </div>
                        <span className="chart-bar-value">{item.value}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="helper-text" style={{ marginTop: 14 }}>
                  Totales actuales · recarga la página para actualizar
                </p>
              </section>

              <div className="home-actions">
                <section className="panel-card home-action-card">
                  <p className="eyebrow">Acceso rápido</p>
                  <h2>👥 Usuarios</h2>
                  <p className="helper-text">Gestiona equipos, coaches y atletas del sistema.</p>
                  <button type="button" className="primary-button" onClick={() => setAdminView("users")}>
                    Ir a Usuarios →
                  </button>
                </section>
                <section className="panel-card home-action-card">
                  <p className="eyebrow">Acceso rápido</p>
                  <h2>🏋️ Entrenamiento</h2>
                  <p className="helper-text">Ejercicios, plantilla base, programas y sesiones.</p>
                  <button type="button" className="primary-button" onClick={() => setAdminView("training")}>
                    Ir a Entrenamiento →
                  </button>
                </section>
              </div>
            </div>
          ) : null}

      {adminView === "training" ? (
      <>
      <section className="workspace-grid">
        <aside className="sidebar-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Catalogo</p>
              <h2>Ejercicios</h2>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSelectedExerciseId(null);
                setExerciseForm(emptyExerciseForm());
                setExerciseModalOpen(true);
              }}
            >
              Nuevo
            </button>
          </div>

          <input
            className="exercise-search"
            placeholder="Buscar ejercicio..."
            value={exerciseSearch}
            onChange={(event) => setExerciseSearch(event.target.value)}
          />

          <div className="exercise-list">
            {exercises
              .filter((exercise) =>
                exerciseSearch
                  ? exercise.name.toLowerCase().includes(exerciseSearch.toLowerCase()) ||
                    exercise.category.toLowerCase().includes(exerciseSearch.toLowerCase())
                  : true,
              )
              .map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  className={`list-item ${selectedExerciseId === exercise.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedExerciseId(exercise.id);
                    setExerciseModalOpen(true);
                  }}
                >
                  <strong>{exercise.name}</strong>
                  <div className="exercise-badges">
                    <span className="category-badge">{exercise.category}</span>
                    {exercise.isBlock ? <span className="block-badge">⬣ Bloque</span> : null}
                    {exercise.defaultSeriesProtocol === "STRENGTH_EXPLOSION" ? <span className="series-badge">Fuerza</span> : null}
                    {exercise.perLeg ? <span className="perleg-badge">Por pierna</span> : null}
                    {exercise.requiresLoad ? <span className="load-badge">Con carga</span> : null}
                    {exercise.mediaAssets.some((a) => a.kind === "IMAGE") ? <span className="media-badge">🖼</span> : null}
                    {exercise.mediaAssets.some((a) => a.kind === "GIF") ? <span className="media-badge">GIF</span> : null}
                    {exercise.mediaAssets.some((a) => a.kind === "VIDEO") ? <span className="media-badge">▶</span> : null}
                  </div>
                </button>
              ))}
          </div>
        </aside>

        <section className="editor-column">
          <article className="panel-card">
            <div className="section-header">
              <div>
                <p className="eyebrow">Plantilla base</p>
                <h2>Prescripciones por dia</h2>
              </div>
              <label className="day-picker">
                Dia
                <select value={selectedDayNumber} onChange={(event) => setSelectedDayNumber(Number(event.target.value))}>
                  {templateDays.map((day) => (
                    <option key={day.id} value={day.dayNumber}>
                      Dia {day.dayNumber} - {day.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="prescription-toolbar">
              <div>
                <strong>{selectedDay?.title ?? "Sin dia seleccionado"}</strong>
                <p>{selectedDay?.dayType ?? ""}{prescriptionsDraft.length > 0 ? ` · ${prescriptionsDraft.length} ejercicio${prescriptionsDraft.length !== 1 ? "s" : ""}` : ""}</p>
              </div>
              <div className="action-row compact-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setPrescriptionsDraft((current) => [
                      ...current,
                      emptyPrescription(current.length + 1, exerciseOptions[0]?.id ?? ""),
                    ]);
                    setSelectedPrescriptionIdx(prescriptionsDraft.length);
                  }}
                >
                  Agregar fila
                </button>
                <button className="primary-button" type="button" onClick={handlePrescriptionsSave} disabled={loading || !prescriptionsDraft.length}>
                  Guardar dia
                </button>
              </div>
            </div>

            {/* Dot navigator */}
            {prescriptionsDraft.length > 0 && (
              <div className="presc-nav">
                {prescriptionsDraft.map((row, index) => (
                  <button
                    key={`dot-${row.id ?? "new"}-${index}`}
                    type="button"
                    className={`presc-dot${selectedPrescriptionIdx === index ? " active" : ""}`}
                    onClick={() => setSelectedPrescriptionIdx(index)}
                    title={exerciseOptions.find((e) => e.id === row.exerciseId)?.name ?? `#${index + 1}`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="prescription-table">
              {prescriptionsDraft.map((row, index) => {
                if (index !== selectedPrescriptionIdx) {
                  return null;
                }

                const exercise = exerciseById.get(row.exerciseId);
                const usesStrengthPreset = exercise?.defaultSeriesProtocol === "STRENGTH_EXPLOSION";
                const strengthPreview = strengthSeriesPreview();
                const effectiveSeriesProtocol = usesStrengthPreset ? "STRENGTH_EXPLOSION" : row.seriesProtocol;

                return (
                  <div key={`${row.id ?? "new"}-${index}`} className="prescription-card">
                    <div className="presc-row-top">
                      <label className="presc-field-wide">
                        Ejercicio
                        <select
                          value={row.exerciseId}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? {
                                      ...entry,
                                      exerciseId: event.target.value,
                                      seriesProtocol:
                                        exerciseById.get(event.target.value)?.defaultSeriesProtocol === "STRENGTH_EXPLOSION"
                                          ? "NONE"
                                          : entry.seriesProtocol,
                                    }
                                  : entry,
                              ),
                            )
                          }
                        >
                          <option value="">Selecciona</option>
                          {exerciseOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {usesStrengthPreset ? (
                        <div className="series-hint strength presc-field-sm">
                          <strong>{seriesProtocolLabel("STRENGTH_EXPLOSION")}</strong>
                          <span>Se toma directo del ejercicio. No hace falta editar sets/carga aqui.</span>
                        </div>
                      ) : (
                        <label className="presc-field-sm">
                          Serie
                          <select
                            value={row.seriesProtocol}
                            onChange={(event) =>
                              setPrescriptionsDraft((current) =>
                                current.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, seriesProtocol: event.target.value as PrescriptionRecord["seriesProtocol"] }
                                    : entry,
                                ),
                              )
                            }
                          >
                            <option value="NONE">Sin serie especial</option>
                            <option value="PLYOMETRIC_SPEED">Serie pliometrica</option>
                          </select>
                        </label>
                      )}
                      <label className="presc-field-sm">
                        Bloque
                        <input
                          value={row.blockLabel}
                          placeholder="A, B…"
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, blockLabel: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-xs">
                        #
                        <input
                          type="number"
                          value={row.orderIndex}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, orderIndex: Number(event.target.value) || index + 1 } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>

                    {effectiveSeriesProtocol === "PLYOMETRIC_SPEED" ? (
                      <div className="series-hint plyometric">
                        <strong>Serie pliometrica</strong>
                        <span>{plyometricSeriesReminder}</span>
                        <span>Tip: usa un objetivo externo y subelo progresivamente cuando sea posible.</span>
                      </div>
                    ) : null}

                    {usesStrengthPreset ? (
                      <div className="series-hint strength">
                        <strong>Serie de fuerza y explosion</strong>
                        <span>{strengthSeriesSummary}</span>
                        <span>{strengthSeriesReminder}</span>
                        <span>Tip de carga: {strengthSeriesLoadHint}</span>
                      </div>
                    ) : null}

                    <div className="presc-row-params">
                      <label className="presc-field-xs">
                        Sets
                        <input
                          type="number"
                          value={usesStrengthPreset ? strengthPreview.sets : row.sets}
                          disabled={usesStrengthPreset}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, sets: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-sm">
                        Reps / texto
                        <input
                          value={usesStrengthPreset ? strengthPreview.repsText : row.repsText}
                          disabled={usesStrengthPreset}
                          placeholder="ej. 8 o AMRAP"
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, repsText: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-xs">
                        Dur. s
                        <input
                          type="number"
                          value={row.durationSeconds}
                          disabled={usesStrengthPreset}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, durationSeconds: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-xs">
                        Desc. s
                        <input
                          type="number"
                          value={usesStrengthPreset ? strengthPreview.restSeconds : row.restSeconds}
                          disabled={usesStrengthPreset}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, restSeconds: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-sm">
                        Carga
                        <input
                          value={usesStrengthPreset ? strengthPreview.loadText : row.loadText}
                          disabled={usesStrengthPreset}
                          placeholder="ej. 70% 1RM"
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, loadText: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-sm">
                        Tempo
                        <input
                          value={usesStrengthPreset ? strengthPreview.tempoText : row.tempoText}
                          disabled={usesStrengthPreset}
                          placeholder="ej. 3-1-3"
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, tempoText: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-wide">
                        Notas
                        <input
                          value={row.notes}
                          placeholder={effectiveSeriesProtocol === "PLYOMETRIC_SPEED" ? plyometricSeriesReminder : "Notas extra"}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <span className="helper-text">Activo: {seriesProtocolLabel(effectiveSeriesProtocol)}</span>
                      <button
                        className="ghost-button danger-text"
                        type="button"
                        onClick={() => {
                          setPrescriptionsDraft((current) =>
                            current
                              .filter((_, entryIndex) => entryIndex !== index)
                              .map((entry, entryIndex) => ({ ...entry, orderIndex: entryIndex + 1 })),
                          );
                          setSelectedPrescriptionIdx(Math.max(0, index - 1));
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      </section>

      {exerciseModalOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) setExerciseModalOpen(false);
          }}
        >
          <div className="modal-panel">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Ejercicio</p>
                <h2>{exerciseForm.id ? "Editar ejercicio" : "Nuevo ejercicio"}</h2>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setExerciseModalOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="modal-body">
              <form className="stack-form" onSubmit={handleExerciseSubmit}>
                <div className="form-grid">
                  <label>
                    Nombre
                    <input
                      value={exerciseForm.name}
                      onChange={(event) =>
                        setExerciseForm((current) => ({
                          ...current,
                          name: event.target.value,
                          slug: current.id ? current.slug : slugify(event.target.value),
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Slug
                    <input
                      value={exerciseForm.slug}
                      onChange={(event) => setExerciseForm((current) => ({ ...current, slug: slugify(event.target.value) }))}
                      required
                    />
                  </label>
                  <label>
                    Categoria
                    <input
                      value={exerciseForm.category}
                      onChange={(event) => setExerciseForm((current) => ({ ...current, category: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Equipamiento
                    <input
                      value={exerciseForm.equipment}
                      onChange={(event) => setExerciseForm((current) => ({ ...current, equipment: event.target.value }))}
                    />
                  </label>
                </div>

                <label>
                  Descripcion
                  <textarea
                    value={exerciseForm.description}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, description: event.target.value }))}
                    rows={3}
                  />
                </label>

                <label>
                  Resumen tecnico
                  <textarea
                    value={exerciseForm.summary}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, summary: event.target.value }))}
                    rows={2}
                    required
                  />
                </label>

                <label>
                  Pasos / ejecucion
                  <textarea
                    value={exerciseForm.steps}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, steps: event.target.value }))}
                    rows={5}
                    required
                  />
                </label>

                <label>
                  Notas de seguridad
                  <textarea
                    value={exerciseForm.safetyNotes}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, safetyNotes: event.target.value }))}
                    rows={3}
                  />
                </label>

                <label>
                  Serie base del ejercicio
                  <select
                    value={exerciseForm.defaultSeriesProtocol}
                    onChange={(event) =>
                      setExerciseForm((current) => ({
                        ...current,
                        defaultSeriesProtocol: event.target.value as ExerciseFormState["defaultSeriesProtocol"],
                      }))
                    }
                  >
                    <option value="NONE">Sin serie especial</option>
                    <option value="STRENGTH_EXPLOSION">Serie de fuerza y explosion</option>
                  </select>
                </label>

                {exerciseForm.defaultSeriesProtocol === "STRENGTH_EXPLOSION" ? (
                  <div className="series-hint strength">
                    <strong>Preset activo para este ejercicio</strong>
                    <span>{strengthSeriesSummary}</span>
                    <span>{strengthSeriesReminder}</span>
                    <span>Tip de carga: {strengthSeriesLoadHint}</span>
                  </div>
                ) : null}

                <p className="helper-text">La serie pliometrica no se fija aqui: se marca por prescripcion en cada dia para enfatizar maxima intensidad y velocidad.</p>

                <label className="checkbox-row">
                  <input
                    checked={exerciseForm.requiresLoad}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, requiresLoad: event.target.checked }))}
                    type="checkbox"
                  />
                  Requiere carga externa
                </label>

                <label className="checkbox-row">
                  <input
                    checked={exerciseForm.perLeg}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, perLeg: event.target.checked }))}
                    type="checkbox"
                  />
                  Se ejecuta por pierna
                </label>

                <label className="checkbox-row">
                  <input
                    checked={exerciseForm.isBlock}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, isBlock: event.target.checked }))}
                    type="checkbox"
                  />
                  Es un bloque (contiene mini-ejercicios)
                </label>

                <div className="action-row">
                  <button className="primary-button" type="submit" disabled={loading}>
                    {exerciseForm.id ? "Guardar ejercicio" : "Crear ejercicio"}
                  </button>
                  {exerciseForm.id ? (
                    <button className="danger-button" type="button" onClick={handleExerciseDelete} disabled={loading}>
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </form>

              {exerciseForm.id ? (
                <div className="modal-section">
                  <div className="section-header modal-section-title">
                    <div>
                      <p className="eyebrow">Media</p>
                      <h2>Assets del ejercicio</h2>
                    </div>
                  </div>

                  <form className="stack-form" onSubmit={handleMediaUpload}>
                    <div className="form-grid">
                      <label>
                        Tipo
                        <select
                          value={uploadState.kind}
                          onChange={(event) =>
                            setUploadState((current) => ({ ...current, kind: event.target.value as MediaKind }))
                          }
                        >
                          <option value="IMAGE">Imagen</option>
                          <option value="GIF">GIF</option>
                          <option value="VIDEO">Video</option>
                        </select>
                      </label>
                      <label>
                        Titulo
                        <input
                          value={uploadState.title}
                          onChange={(event) => setUploadState((current) => ({ ...current, title: event.target.value }))}
                        />
                      </label>
                      <label>
                        Archivo
                        <input
                          type="file"
                          onChange={(event) =>
                            setUploadState((current) => ({ ...current, file: event.target.files?.[0] ?? null }))
                          }
                          required
                        />
                      </label>
                    </div>

                    <label className="checkbox-row">
                      <input
                        checked={uploadState.isPrimary}
                        onChange={(event) =>
                          setUploadState((current) => ({ ...current, isPrimary: event.target.checked }))
                        }
                        type="checkbox"
                      />
                      Marcar como asset principal
                    </label>

                    <button className="secondary-button" type="submit" disabled={loading || !uploadState.file}>
                      Subir a MinIO
                    </button>
                  </form>

                  <div className="media-grid">
                    {selectedExercise?.mediaAssets.length ? (
                      selectedExercise.mediaAssets.map((asset) => {
                        const assetUrl = normalizeMediaUrl(asset.url);

                        return (
                          <article key={asset.id} className="media-card">
                            <div>
                              <strong>{asset.title || asset.kind}</strong>
                              <p>{asset.isPrimary ? "Principal" : asset.kind}</p>
                            </div>
                            {assetUrl ? (
                              <a href={assetUrl} target="_blank" rel="noreferrer">
                                Abrir asset
                              </a>
                            ) : null}
                            <button className="ghost-button danger-text" type="button" onClick={() => handleMediaDelete(asset.id)}>
                              Eliminar
                            </button>
                          </article>
                        );
                      })
                    ) : (
                      <p className="helper-text">Todavia no hay media asociada a este ejercicio.</p>
                    )}
                  </div>
                </div>
              ) : null}

              {/* ── Block Items Editor (only for isBlock exercises that are saved) ── */}
              {exerciseForm.id && exerciseForm.isBlock ? (
                <div className="modal-section">
                  <div className="section-header modal-section-title">
                    <div>
                      <p className="eyebrow">Estructura</p>
                      <h2>Mini-ejercicios del bloque</h2>
                    </div>
                  </div>

                  <form className="stack-form" onSubmit={handleSaveBlockItems}>
                    {/* Add item row */}
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <label style={{ flex: 1 }}>
                        Añadir ejercicio
                        <select
                          defaultValue=""
                          onChange={(event) => {
                            const exId = event.target.value;
                            if (!exId) return;
                            event.target.value = "";
                            setBlockDraft((prev) => [
                              ...prev,
                              { _key: `${exId}-${Date.now()}`, exerciseId: exId, order: prev.length, setsOverride: "", repsKind: "reps" as const, repsOverride: "", notes: "" },
                            ]);
                          }}
                        >
                          <option value="">— seleccionar —</option>
                          {exercises
                            .filter((ex) => ex.id !== exerciseForm.id && !blockDraft.some((d) => d.exerciseId === ex.id))
                            .map((ex) => (
                              <option key={ex.id} value={ex.id}>{ex.name}</option>
                            ))}
                        </select>
                      </label>
                    </div>

                    {/* Current items */}
                    {blockDraft.map((item, idx) => {
                      const exName = exercises.find((e) => e.id === item.exerciseId)?.name ?? item.exerciseId;
                      return (
                        <div key={item._key} className="block-item-row">
                          <div className="block-item-info">
                            <span className="block-item-num">{idx + 1}</span>
                            <strong>{exName}</strong>
                          </div>
                          <div className="block-item-fields">
                            <label>
                              Series
                              <input
                                type="number"
                                min={1}
                                value={item.setsOverride}
                                placeholder="—"
                                onChange={(e) => setBlockDraft((prev) => prev.map((d, i) => i === idx ? { ...d, setsOverride: e.target.value } : d))}
                                style={{ width: 60 }}
                              />
                            </label>
                            <label>
                              Tipo
                              <select
                                value={item.repsKind}
                                onChange={(e) => setBlockDraft((prev) => prev.map((d, i) => i === idx ? { ...d, repsKind: e.target.value as "reps" | "time", repsOverride: "" } : d))}
                                style={{ width: 90 }}
                              >
                                <option value="reps">Reps</option>
                                <option value="time">Tiempo</option>
                              </select>
                            </label>
                            <label>
                              {item.repsKind === "reps" ? "N° reps" : "Duración"}
                              <input
                                value={item.repsOverride}
                                placeholder={item.repsKind === "reps" ? "ej. 6" : "ej. 30s"}
                                onChange={(e) => setBlockDraft((prev) => prev.map((d, i) => i === idx ? { ...d, repsOverride: e.target.value } : d))}
                                style={{ width: 90 }}
                              />
                            </label>
                            <label>
                              Notas
                              <input
                                value={item.notes}
                                placeholder="opcional"
                                onChange={(e) => setBlockDraft((prev) => prev.map((d, i) => i === idx ? { ...d, notes: e.target.value } : d))}
                                style={{ width: 130 }}
                              />
                            </label>
                          </div>
                          <div className="block-item-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={idx === 0}
                              onClick={() => setBlockDraft((prev) => {
                                const next = [...prev];
                                const tmp = next[idx - 1]!;
                                next[idx - 1] = next[idx]!;
                                next[idx] = tmp;
                                return next;
                              })}
                            >↑</button>
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={idx === blockDraft.length - 1}
                              onClick={() => setBlockDraft((prev) => {
                                const next = [...prev];
                                const tmp = next[idx]!;
                                next[idx] = next[idx + 1]!;
                                next[idx + 1] = tmp;
                                return next;
                              })}
                            >↓</button>
                            <button
                              type="button"
                              className="ghost-button danger-text"
                              onClick={() => setBlockDraft((prev) => prev.filter((_, i) => i !== idx))}
                            >✕</button>
                          </div>
                        </div>
                      );
                    })}

                    <button className="primary-button" type="submit" disabled={loading}>
                      Guardar estructura del bloque
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      </>
      ) : null}

      {adminView === "users" ? (
      <section className="management-grid">
        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Organizacion</p>
              <h2>Equipos y staff</h2>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSelectedTeamId(null);
                setTeamForm(emptyTeamForm());
              }}
            >
              Nuevo equipo
            </button>
          </div>

          <div className="team-list">
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                className={`list-item ${selectedTeamId === team.id ? "active" : ""}`}
                onClick={() => setSelectedTeamId(team.id)}
              >
                <strong>{team.name}</strong>
                <span>{team.slug}</span>
              </button>
            ))}
          </div>

          <form className="stack-form section-spacer" onSubmit={handleTeamSubmit}>
            <div className="form-grid">
              <label>
                Nombre del equipo
                <input
                  value={teamForm.name}
                  onChange={(event) =>
                    setTeamForm((current) => ({
                      ...current,
                      name: event.target.value,
                      slug: current.id ? current.slug : slugify(event.target.value),
                    }))
                  }
                  required
                />
              </label>
              <label>
                Slug
                <input
                  value={teamForm.slug}
                  onChange={(event) => setTeamForm((current) => ({ ...current, slug: slugify(event.target.value) }))}
                  required
                />
              </label>
            </div>

            <label>
              Descripcion
              <textarea
                value={teamForm.description}
                onChange={(event) => setTeamForm((current) => ({ ...current, description: event.target.value }))}
                rows={3}
              />
            </label>

            <div className="action-row">
              <button className="primary-button" type="submit" disabled={loading}>
                {teamForm.id ? "Guardar equipo" : "Crear equipo"}
              </button>
            </div>
          </form>

          <form className="stack-form section-spacer" onSubmit={handleMemberSubmit}>
            <div className="section-header compact-header">
              <div>
              <p className="eyebrow">Staff</p>
                <h3>{selectedTeam ? `Alta sobre ${selectedTeam.name}` : "Selecciona un equipo"}</h3>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setSelectedMembershipId("");
                  setMemberForm(emptyMemberForm());
                }}
              >
                Nuevo staff
              </button>
            </div>
            <div className="form-grid">
              <label>
                Rol
                <select
                  value={memberForm.role}
                  onChange={(event) =>
                    setMemberForm((current) => ({ ...current, role: event.target.value as MemberFormState["role"] }))
                  }
                >
                  <option value="COACH">Coach</option>
                  <option value="TEAM_ADMIN">Team admin</option>
                </select>
              </label>
              <label>
                Email
                <input
                  value={memberForm.email}
                  onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))}
                  type="email"
                  required
                />
              </label>
              <label>
                Nombre
                <input
                  value={memberForm.firstName}
                  onChange={(event) => setMemberForm((current) => ({ ...current, firstName: event.target.value }))}
                />
              </label>
              <label>
                Apellido
                <input
                  value={memberForm.lastName}
                  onChange={(event) => setMemberForm((current) => ({ ...current, lastName: event.target.value }))}
                />
              </label>
              <label>
                Password inicial
                <input
                  value={memberForm.password}
                  onChange={(event) => setMemberForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
            </div>

            <div className="action-row compact-row">
              <button className="secondary-button" type="submit" disabled={loading || !selectedTeamId}>
                {selectedMembershipId ? "Guardar staff" : "Crear o asociar staff"}
              </button>
              {selectedMembershipId ? (
                <button className="danger-button" type="button" disabled={loading} onClick={() => handleMemberDelete(selectedMembershipId)}>
                  Quitar staff
                </button>
              ) : null}
            </div>
          </form>

          {selectedTeam ? (
            <div className="detail-stack section-spacer">
              <div>
                <p className="eyebrow">Miembros actuales</p>
                <div className="detail-list">
                  {selectedTeamStaff.map((membership) => (
                    <article key={membership.id} className="detail-card">
                      <strong>{displayName(membership.user)}</strong>
                      <span>{membership.user.email}</span>
                      <p>{membership.role}</p>
                      <div className="action-row compact-row left-row">
                        <button className="ghost-button" type="button" onClick={() => setSelectedMembershipId(membership.id)}>
                          Editar
                        </button>
                        <button className="ghost-button danger-text" type="button" onClick={() => handleMemberDelete(membership.id)}>
                          Quitar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="helper-text section-spacer">Crea un equipo para cargar coaches, team admins y atletas.</p>
          )}
        </article>

        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Atletas</p>
              <h2>Atletas y coaches</h2>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSelectedAthleteProfileId("");
                setAthleteForm(emptyAthleteForm());
              }}
            >
              Nuevo atleta
            </button>
          </div>

          <div className={`workflow-note ${canCreateAthlete ? "" : "warning-note"}`}>
            <strong>Orden recomendado</strong>
            <p>
              1. Crea o selecciona un equipo. 2. Crea staff y coaches si aplica. 3. Crea el atleta dentro de ese equipo. 4. Asigna coach opcionalmente. 5. Ve a Entrenamiento para generar programa y sesiones.
            </p>
          </div>

          <div className="detail-list compact-detail-list section-spacer">
            <article className="detail-card">
              <strong>Equipo activo</strong>
              <span>{selectedTeam?.name ?? "Sin seleccionar"}</span>
              <p>{selectedTeam ? `${selectedTeamAthleteCount} atletas · ${selectedTeamCoachCount} coaches` : "Selecciona un equipo para habilitar el alta."}</p>
            </article>
            <article className="detail-card">
              <strong>Alta de atleta</strong>
              <span>{canCreateAthlete ? "Habilitada" : "Bloqueada"}</span>
              <p>{canCreateAthlete ? "El atleta se crea o asocia directamente al equipo activo." : "Sin equipo activo no se puede crear ni asociar atleta."}</p>
            </article>
          </div>

          <form className="stack-form" onSubmit={handleAthleteSubmit}>
            <div className="form-grid">
              <label>
                Email
                <input
                  value={athleteForm.email}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, email: event.target.value }))}
                  type="email"
                  required
                />
              </label>
              <label>
                Password inicial
                <input
                  value={athleteForm.password}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <label>
                Nombre
                <input
                  value={athleteForm.firstName}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, firstName: event.target.value }))}
                />
              </label>
              <label>
                Apellido
                <input
                  value={athleteForm.lastName}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, lastName: event.target.value }))}
                />
              </label>
              <label>
                Display name
                <input
                  value={athleteForm.displayName}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, displayName: event.target.value }))}
                />
              </label>
              <label>
                Deporte
                <input
                  value={athleteForm.sport}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, sport: event.target.value }))}
                />
              </label>
              <label className="checkbox-label">
                <input
                  checked={athleteForm.trainsSport}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, trainsSport: event.target.checked }))}
                  type="checkbox"
                />
                Entrena deporte o pista ademas del programa
              </label>
              <label>
                Fase
                <select
                  value={athleteForm.seasonPhase}
                  onChange={(event) =>
                    setAthleteForm((current) => ({ ...current, seasonPhase: event.target.value as SeasonPhase }))
                  }
                >
                  {seasonPhaseOptions.map((phase) => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Dias disponibles
                <input
                  value={athleteForm.availableWeekdays}
                  onChange={(event) =>
                    setAthleteForm((current) => ({ ...current, availableWeekdays: event.target.value }))
                  }
                  placeholder="1,3,5"
                />
              </label>
              <label>
                Dias de deporte/pista
                <input
                  value={athleteForm.sportTrainingDays}
                  onChange={(event) =>
                    setAthleteForm((current) => ({ ...current, sportTrainingDays: event.target.value }))
                  }
                  placeholder="2,4"
                />
              </label>
            </div>

            <label>
              Notas
              <textarea
                value={athleteForm.notes}
                onChange={(event) => setAthleteForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
              />
            </label>

            <p className="helper-text">
              Si el email ya existe, el sistema asociara ese usuario al equipo como atleta. Si es un alta nueva y quieres que pueda entrar de inmediato, define una password inicial.
            </p>

            <div className="action-row compact-row">
              <button className="secondary-button" type="submit" disabled={loading || !selectedTeamId}>
                {selectedAthleteProfileId ? "Guardar atleta" : "Crear o asociar atleta"}
              </button>
              {selectedAthleteProfileId ? (
                <button className="danger-button" type="button" disabled={loading} onClick={() => void handleAthleteDelete()}>
                  Dar de baja
                </button>
              ) : null}
            </div>
          </form>

          <div className="detail-stack section-spacer">
            <div className="section-header">
              <div>
                <p className="eyebrow">Roster</p>
                <h3>{selectedTeam ? selectedTeam.name : "Selecciona un equipo"}</h3>
              </div>
              <label className="day-picker mini-picker">
                Atleta activo
                <select
                  value={selectedAthleteProfileId}
                  onChange={(event) => setSelectedAthleteProfileId(event.target.value)}
                  disabled={!selectedTeam?.athletes.length}
                >
                  <option value="">Selecciona</option>
                  {selectedTeam?.athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="detail-list">
              {selectedTeam?.athletes.map((athlete) => (
                <article
                  key={athlete.id}
                  className={`detail-card ${selectedAthleteProfileId === athlete.id ? "highlight-card" : ""}`}
                >
                  <strong>{athlete.displayName}</strong>
                  <span>{athlete.user.email}</span>
                  <p>{athlete.sport || "Sin deporte"}</p>
                  <small>{formatWeekdaySummary(athleteWeekdays(athlete))}</small>
                  {athlete.trainsSport ? <small>Deporte/pista: {formatWeekdaySummary(athleteSportWeekdays(athlete))}</small> : null}
                  <div className="action-row compact-row left-row">
                    <button className="ghost-button" type="button" onClick={() => setSelectedAthleteProfileId(athlete.id)}>
                      Editar
                    </button>
                    <button className="ghost-button danger-text" type="button" onClick={() => void handleAthleteDelete(athlete.id)}>
                      Baja
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <form className="stack-form section-spacer" onSubmit={handleAssignCoach}>
            <div>
              <p className="eyebrow">Asignacion</p>
              <h3>Coach principal</h3>
            </div>
            <div className="form-grid">
              <label>
                Atleta
                <select
                  value={selectedAthleteProfileId}
                  onChange={(event) => setSelectedAthleteProfileId(event.target.value)}
                  disabled={!selectedTeam?.athletes.length}
                >
                  <option value="">Selecciona</option>
                  {selectedTeam?.athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Coach
                <select
                  value={selectedCoachUserId}
                  onChange={(event) => setSelectedCoachUserId(event.target.value)}
                  disabled={!selectedTeamCoaches.length}
                >
                  <option value="">Selecciona</option>
                  {selectedTeamCoaches.map((coach) => (
                    <option key={coach.user.id} value={coach.user.id}>
                      {displayName(coach.user)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="secondary-button" type="submit" disabled={loading || !selectedAthleteProfileId || !selectedCoachUserId}>
              Asignar coach
            </button>
          </form>

          {selectedAthlete ? (
            <div className="detail-stack section-spacer">
              <div>
                <p className="eyebrow">Atleta activo</p>
                <div className="detail-card highlight-card">
                  <strong>{selectedAthlete.displayName}</strong>
                  <span>{selectedAthlete.user.email}</span>
                  <p>
                    {selectedAthlete.sport || "Sin deporte"} · {selectedAthlete.seasonPhase}
                  </p>
                  <small>Disponibilidad: {formatWeekdaySummary(athleteWeekdays(selectedAthlete))}</small>
                  <small>
                    Contexto deporte: {selectedAthlete.trainsSport ? formatWeekdaySummary(athleteSportWeekdays(selectedAthlete)) : "No declarado"}
                  </small>
                  <small>
                    Coaches: {selectedAthlete.coachAssignments.length ? selectedAthlete.coachAssignments.map((assignment) => displayName(assignment.coach)).join(", ") : "Sin asignar"}
                  </small>
                  {selectedAthlete.coachAssignments.length ? (
                    <div className="chip-row">
                      {selectedAthlete.coachAssignments.map((assignment) => (
                        <div key={assignment.id} className="session-chip removable-chip">
                          <span>{displayName(assignment.coach)}</span>
                          <button className="chip-action" type="button" onClick={() => handleAssignmentDelete(assignment.id)}>
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {teamlessAthletes.length ? (
            <div className="detail-stack section-spacer">
              <div>
                <p className="eyebrow">Autoregistro</p>
                <h3>Atletas creados desde la app</h3>
              </div>
              <div className="detail-list">
                {teamlessAthletes.map((athlete) => (
                  <article key={athlete.id} className="detail-card">
                    <strong>{athlete.displayName}</strong>
                    <span>{athlete.user.email}</span>
                    <p>{athlete.sport || "Sin deporte"} · {athlete.seasonPhase}</p>
                    <small>Disponibilidad jump: {formatWeekdaySummary(athleteWeekdays(athlete))}</small>
                    <small>Deporte/pista: {athlete.trainsSport ? formatWeekdaySummary(athleteSportWeekdays(athlete)) : "No declarado"}</small>
                    <small>{athlete.onboardingCompletedAt ? `Onboarding ${new Date(athlete.onboardingCompletedAt).toLocaleDateString()}` : "Onboarding pendiente"}</small>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </section>
      ) : null}

      {adminView === "training" ? (
      <section className="management-grid">
        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Programas</p>
              <h2>Generacion y seguimiento</h2>
            </div>
          </div>

          <div className="workflow-note">
            <strong>Como se relacionan con sesiones</strong>
            <p>
              El programa personalizado define el bloque de trabajo de un atleta. Las sesiones son las instancias calendarizadas que se generan automaticamente desde ese programa y luego se editan en esta misma vista.
            </p>
          </div>

          <form className="stack-form section-spacer" onSubmit={handleGenerateProgram}>
            <div>
              <p className="eyebrow">Generador</p>
              <h3>Programa personalizado + sesiones</h3>
            </div>
            <div className="form-grid">
              <label>
                Atleta
                <select
                  value={programGeneration.athleteProfileId}
                  onChange={(event) =>
                    setProgramGeneration((current) => ({ ...current, athleteProfileId: event.target.value }))
                  }
                  required
                >
                  <option value="">Selecciona</option>
                  {allAthletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.displayName} · {athlete.team?.name ?? "Sin equipo"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Inicio
                <input
                  value={programGeneration.startDate}
                  onChange={(event) => setProgramGeneration((current) => ({ ...current, startDate: event.target.value }))}
                  type="date"
                  required
                />
              </label>
              <label>
                Programa
                <select
                  value={programGeneration.templateCode}
                  onChange={(event) => setProgramGeneration((current) => ({ ...current, templateCode: event.target.value }))}
                  required
                >
                  {allTemplates.map((tmpl) => (
                    <option key={tmpl.code} value={tmpl.code}>
                      {tmpl.name}
                    </option>
                  ))}
                  {!allTemplates.length ? <option value="JUMP-MANUAL-14D">Jump Manual 14D</option> : null}
                </select>
              </label>
              <label>
                Fase override
                <select
                  value={programGeneration.phase}
                  onChange={(event) =>
                    setProgramGeneration((current) => ({
                      ...current,
                      phase: event.target.value as ProgramGenerationState["phase"],
                    }))
                  }
                >
                  <option value="">Usar perfil del atleta</option>
                  {seasonPhaseOptions.map((phase) => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  checked={programGeneration.includePreparationPhase}
                  onChange={(event) =>
                    setProgramGeneration((current) => ({ ...current, includePreparationPhase: event.target.checked }))
                  }
                  type="checkbox"
                />
                Incluir 3 semanas de adecuacion y prevencion
              </label>
            </div>

            {selectedProgramAthlete ? (
              <div className="workflow-note">
                <strong>Contexto del atleta</strong>
                <p>
                  {selectedProgramAthlete.sport || "Sin deporte"} · jump {formatWeekdaySummary(athleteWeekdays(selectedProgramAthlete))} · deporte/pista {selectedProgramAthlete.trainsSport ? formatWeekdaySummary(athleteSportWeekdays(selectedProgramAthlete)) : "No declarado"}
                </p>
                <p>
                  {programGeneration.includePreparationPhase
                    ? "Se generara primero un bloque de 3 semanas con isometricos, aterrizajes y bajo impacto para llegar mejor al inicio del programa principal."
                    : "Se omitira la fase previa y se entrara directo al bloque principal. Usalo solo si el atleta ya tolera bien la carga."}
                </p>
              </div>
            ) : null}

            <label>
              Notas del programa
              <textarea
                value={programGeneration.notes}
                onChange={(event) => setProgramGeneration((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
              />
            </label>

            <button className="primary-button" type="submit" disabled={loading || !programGeneration.athleteProfileId}>
              Generar programa
            </button>
          </form>

          <div className="detail-stack section-spacer">
            <div>
              <p className="eyebrow">Programas recientes</p>
              <div className="program-list">
                {programs.length ? (
                  programs.map((program) => (
                    <article key={program.id} className="detail-card program-card">
                      <strong>{program.name}</strong>
                      <span>
                        {program.athleteProfile.displayName} · {program.athleteProfile.team?.name ?? "Sin equipo"}
                      </span>
                      <p>
                        {program.phase} · {program.status} · {new Date(program.startDate).toLocaleDateString()}
                      </p>
                      <small>{program.template.name}</small>
                      <div className="chip-row">
                        {program.sessions.map((session) => (
                          <span key={session.id} className="session-chip">
                            {new Date(session.scheduledDate).toLocaleDateString()} · {session.dayType}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="helper-text">Todavia no hay programas personalizados generados.</p>
                )}
              </div>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Sesiones</p>
              <h2>Que se edita aqui</h2>
            </div>
          </div>

          <div className="workflow-note">
            <strong>Sesion = instancia operativa del programa</strong>
            <p>
              Aqui no creas usuarios ni atletas. Aqui ajustas fecha, estado y notas de las sesiones ya generadas desde un programa personalizado. Por eso esta vista pertenece a Entrenamiento y no a Usuarios.
            </p>
          </div>

          <div className="detail-list compact-detail-list section-spacer">
            <article className="detail-card">
              <strong>Programas cargados</strong>
              <span>{programs.length}</span>
              <p>Selecciona uno abajo para ver y editar sus sesiones.</p>
            </article>
            <article className="detail-card">
              <strong>Sesiones visibles</strong>
              <span>{programSessions.length}</span>
              <p>{selectedProgram ? `Sobre ${selectedProgram.athleteProfile.displayName}` : "Aun sin programa seleccionado"}</p>
            </article>
          </div>
        </article>
      </section>
      ) : null}

      {adminView === "training" ? (
      <section className="management-grid">
        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Sesiones</p>
              <h2>Reprogramacion y estado</h2>
            </div>
            <label className="day-picker mini-picker">
              Programa
              <select value={selectedProgramId} onChange={(event) => setSelectedProgramId(event.target.value)}>
                <option value="">Selecciona</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.athleteProfile.displayName} · {program.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedProgram ? (
            <p className="helper-text">
              {selectedProgram.athleteProfile.displayName} · {selectedProgram.phase} · {selectedProgram.status}
            </p>
          ) : (
            <p className="helper-text">Selecciona un programa personalizado para editar sus sesiones.</p>
          )}

          <div className="detail-list section-spacer">
            {programSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`detail-card detail-button ${selectedProgramSessionId === session.id ? "active" : ""}`}
                onClick={() => setSelectedProgramSessionId(session.id)}
              >
                <strong>{session.title}</strong>
                <span>{new Date(session.scheduledDate).toLocaleDateString()}</span>
                <p>
                  {session.dayType} · {session.status}
                </p>
                <small>
                  {session.sessionExercises.filter((exercise) => Boolean(exercise.completedAt)).length}/{session.sessionExercises.length} ejercicios completados
                </small>
              </button>
            ))}
            {selectedProgramId && !programSessions.length ? <p className="helper-text">Este programa todavia no tiene sesiones visibles.</p> : null}
          </div>

          {selectedProgramSession ? (
            <form className="stack-form section-spacer" onSubmit={handleSessionUpdate}>
              <div className="section-header compact-header">
                <div>
                  <p className="eyebrow">Sesion activa</p>
                  <h3>{selectedProgramSession.personalProgram.athleteProfile.displayName ?? displayName(selectedProgramSession.personalProgram.athleteProfile.user)}</h3>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  Titulo
                  <input
                    value={sessionEditor.title}
                    onChange={(event) => setSessionEditor((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <label>
                  Fecha
                  <input
                    type="date"
                    value={sessionEditor.scheduledDate}
                    onChange={(event) => setSessionEditor((current) => ({ ...current, scheduledDate: event.target.value }))}
                  />
                </label>
                <label>
                  Estado
                  <select
                    value={sessionEditor.status}
                    onChange={(event) => setSessionEditor((current) => ({ ...current, status: event.target.value as SessionStatus }))}
                  >
                    {sessionStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Atleta
                  <input
                    value={selectedProgramSession.personalProgram.athleteProfile.displayName ?? displayName(selectedProgramSession.personalProgram.athleteProfile.user)}
                    disabled
                  />
                </label>
              </div>

              <label>
                Notas
                <textarea
                  value={sessionEditor.notes}
                  onChange={(event) => setSessionEditor((current) => ({ ...current, notes: event.target.value }))}
                  rows={3}
                />
              </label>

              <div className="action-row">
                <button className="primary-button" type="submit" disabled={loading}>
                  Guardar sesion
                </button>
              </div>

              <div className="detail-stack">
                <div>
                  <p className="eyebrow">Ejercicios</p>
                  <div className="detail-list">
                    {selectedProgramSession.sessionExercises.map((exercise) => (
                      <article key={exercise.id} className="detail-card">
                        <strong>{exercise.orderIndex}. {exercise.exercise.name}</strong>
                        <span>{exercise.exercise.category}</span>
                        <p>
                          {exercise.sets ? `${exercise.sets} sets` : "Sin sets"}
                          {exercise.repsText ? ` · ${exercise.repsText}` : ""}
                          {exercise.durationSeconds ? ` · ${exercise.durationSeconds}s` : ""}
                        </p>
                        <small>{exercise.completedAt ? "Marcado como completado" : "Pendiente"}</small>
                      </article>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="eyebrow">Logs</p>
                  <div className="program-list">
                    {selectedProgramSession.logs.length ? (
                      selectedProgramSession.logs.map((log) => (
                        <article key={log.id} className="detail-card program-card">
                          <strong>{displayName(log.athleteProfile.user)}</strong>
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                          <p>RPE {log.perceivedExertion ?? "-"}</p>
                          <small>{log.notes || "Sin notas"}</small>
                        </article>
                      ))
                    ) : (
                      <p className="helper-text">Todavia no hay logs sobre esta sesion.</p>
                    )}
                  </div>
                </div>
              </div>
            </form>
          ) : null}
        </article>

        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Coach</p>
              <h2>Seguimiento multiatleta</h2>
            </div>
            <label className="day-picker mini-picker">
              Coach
              <select value={selectedCoachDashboardId} onChange={(event) => setSelectedCoachDashboardId(event.target.value)}>
                <option value="">Selecciona</option>
                {coachOptions.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.label} · {coach.teamName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {coachDashboard ? (
            <>
              <div className="detail-list">
                <article className="detail-card">
                  <strong>{displayName(coachDashboard.coach)}</strong>
                  <span>{coachDashboard.coach.email}</span>
                  <p>{coachDashboard.metrics.athletes} atletas asignados</p>
                </article>
                <article className="detail-card">
                  <strong>{coachDashboard.metrics.activePrograms}</strong>
                  <span>Programas activos</span>
                  <p>{coachDashboard.metrics.recentLogs} logs recientes</p>
                </article>
              </div>

              <div className="detail-stack section-spacer">
                {coachDashboard.athletes.length ? (
                  coachDashboard.athletes.map((athlete) => (
                    <article key={athlete.id} className="detail-card coach-athlete-card">
                      <strong>{athlete.displayName ?? displayName(athlete.user)}</strong>
                      <span>
                        {(athlete.team?.name ?? "Sin equipo")} · {athlete.sport || "Sin deporte"} · {athlete.seasonPhase}
                      </span>
                      {athlete.personalPrograms[0] ? (
                        <p>
                          {athlete.personalPrograms[0].name} · {athlete.personalPrograms[0].status}
                        </p>
                      ) : (
                        <p>Sin programa personal activo.</p>
                      )}

                      {athlete.personalPrograms[0]?.sessions.length ? (
                        <div className="chip-row">
                          {athlete.personalPrograms[0].sessions.map((session) => (
                            <span key={session.id} className="session-chip">
                              {new Date(session.scheduledDate).toLocaleDateString()} · {session.dayType}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="program-list">
                        {athlete.sessionLogs.length ? (
                          athlete.sessionLogs.map((log) => (
                            <article key={log.id} className="detail-card nested-card">
                              <strong>{log.scheduledSession.title}</strong>
                              <span>{new Date(log.createdAt).toLocaleString()}</span>
                              <p>RPE {log.perceivedExertion ?? "-"}</p>
                              <small>{log.notes || "Sin notas"}</small>
                            </article>
                          ))
                        ) : (
                          <p className="helper-text">Sin logs recientes de este atleta.</p>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="helper-text">Ese coach no tiene atletas asignados todavia.</p>
                )}
              </div>
            </>
          ) : (
            <p className="helper-text">Selecciona un coach para revisar sus atletas y logs recientes.</p>
          )}
        </article>
      </section>
      ) : null}

      {adminView === "templates" ? (
      <section className="management-grid">
        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Programas de entrenamiento</p>
              <h2>Plantillas</h2>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setTemplateForm(emptyTemplateForm());
                setTemplateModalOpen(true);
              }}
            >
              + Nuevo programa
            </button>
          </div>

          <div className="detail-list section-spacer">
            {allTemplates.length ? (
              allTemplates.map((tmpl) => (
                <article key={tmpl.id} className="detail-card">
                  <strong>{tmpl.name}</strong>
                  <span>{tmpl.code}</span>
                  <p>{tmpl.description || "Sin descripcion"}</p>
                  <small>{tmpl.cycleLengthDays} dias · {tmpl._count.days} días definidos · {tmpl._count.personalPrograms} programas activos · {tmpl.techniqueMediaAssets.length} recursos de técnica</small>
                  <div className="chip-row">
                    {tmpl.isEditable ? (
                      <>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            setTemplateForm({ id: tmpl.id, code: tmpl.code, name: tmpl.name, description: tmpl.description ?? "", cycleLengthDays: String(tmpl.cycleLengthDays) });
                            setTemplateModalOpen(true);
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => void handleTemplateDelete(tmpl.code)}
                          disabled={loading}
                        >
                          Eliminar
                        </button>
                        <button
                          type="button"
                          className={`ghost-button${selectedTemplateCode === tmpl.code ? " active" : ""}`}
                          onClick={() => {
                            setSelectedTemplateCode(tmpl.code);
                            void handleTemplateDaysLoad(tmpl.code);
                            setAdminView("technique");
                          }}
                        >
                          Técnica
                        </button>
                      </>
                    ) : (
                      <span className="session-chip">Solo lectura</span>
                    )}
                    <button
                      type="button"
                      className={`ghost-button${selectedTemplateCode === tmpl.code ? " active" : ""}`}
                      onClick={() => {
                        setSelectedTemplateCode(tmpl.code);
                        void handleTemplateDaysLoad(tmpl.code);
                        setAdminView("training");
                      }}
                    >
                      Ver en Entrenamiento
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="helper-text">No hay programas definidos todavia.</p>
            )}
          </div>

          {selectedTemplateMeta ? (
            <div className="detail-stack section-spacer">
              <div className="section-header compact-header">
                <div>
                  <p className="eyebrow">Técnica del programa</p>
                  <h3>{selectedTemplateMeta.name}</h3>
                </div>
              </div>

              <form
                className="stack-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleTechniqueSave();
                }}
              >
                <div className="form-grid">
                  <label>
                    Título de técnica
                    <input
                      value={templateTechniqueForm.title}
                      onChange={(event) => setTemplateTechniqueForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="ej. Técnica de sprint: postura y primer paso"
                    />
                  </label>
                  <label>
                    Texto explicativo
                    <textarea
                      value={templateTechniqueForm.description}
                      onChange={(event) => setTemplateTechniqueForm((current) => ({ ...current, description: event.target.value }))}
                      rows={5}
                      placeholder="Explica la técnica ideal, errores frecuentes y qué debe sentir el atleta."
                    />
                  </label>
                </div>
                <button className="primary-button" type="submit" disabled={loading}>
                  Guardar técnica
                </button>
              </form>

              <form className="stack-form" onSubmit={(event) => void handleTechniqueMediaUpload(event)}>
                <div className="workflow-note">
                  <strong>Referencia profesional visible</strong>
                  <p>
                    Marca el video como referencia biomecánica profesional si este recurso debe generar
                    la base de comparación con landmarks para la técnica.
                  </p>
                </div>
                <div className="form-grid">
                  <label>
                    Tipo de recurso
                    <select
                      value={techniqueUploadState.kind}
                      onChange={(event) =>
                        setTechniqueUploadState((current) => ({
                          ...current,
                          kind: event.target.value as MediaKind,
                          useAsProReference: event.target.value === "VIDEO" ? current.useAsProReference : false,
                        }))
                      }
                    >
                      <option value="VIDEO">Video</option>
                      <option value="GIF">GIF</option>
                      <option value="IMAGE">Imagen</option>
                    </select>
                  </label>
                  <label>
                    Título del recurso
                    <input
                      value={techniqueUploadState.title}
                      onChange={(event) => setTechniqueUploadState((current) => ({ ...current, title: event.target.value }))}
                      placeholder="ej. Técnica frontal"
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={techniqueUploadState.isPrimary}
                      onChange={(event) => setTechniqueUploadState((current) => ({ ...current, isPrimary: event.target.checked }))}
                    />
                    Marcar como principal
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={techniqueUploadState.useAsProReference}
                      disabled={techniqueUploadState.kind !== "VIDEO"}
                      onChange={(event) =>
                        setTechniqueUploadState((current) => ({ ...current, useAsProReference: event.target.checked }))
                      }
                    />
                    Usar este video como referencia biomecánica profesional
                  </label>
                  <label>
                    Velocidad de la referencia
                    <select
                      value={techniqueUploadState.referenceMotionProfile}
                      disabled={techniqueUploadState.kind !== "VIDEO" || !techniqueUploadState.useAsProReference}
                      onChange={(event) =>
                        setTechniqueUploadState((current) => ({
                          ...current,
                          referenceMotionProfile: event.target.value as TechniqueReferenceMotionProfile,
                        }))
                      }
                    >
                      <option value="REAL_TIME">Velocidad normal</option>
                      <option value="SLOW_MOTION">Camara lenta</option>
                    </select>
                  </label>
                  <label>
                    Archivo
                    <input
                      type="file"
                      accept="video/*,image/*"
                      onChange={(event) =>
                        setTechniqueUploadState((current) => ({ ...current, file: event.target.files?.[0] ?? null }))
                      }
                    />
                  </label>
                </div>
                <button className="primary-button" type="submit" disabled={loading || !techniqueUploadState.file}>
                  Subir recurso de técnica
                </button>
              </form>

              <div className="detail-card program-card">
                <strong>Estado de la referencia biomecánica</strong>
                <p>{formatTechniquePoseSummary(selectedTechnique?.proLandmarks)}</p>
                <div className="biomechanics-summary-grid">
                  <span className="biomechanics-badge">
                    {selectedTechniqueReferenceAsset
                      ? `Referencia visible: ${selectedTechniqueReferenceAsset.title || "video profesional"}`
                      : "Referencia visible: todavía no asignada"}
                  </span>
                  <span className="biomechanics-badge">
                    {`Modo: ${formatReferenceMotionProfile(normalizeTechniqueBiomechanicsConfig(selectedTechnique?.biomechanicsConfig).referenceMotionProfile)}`}
                  </span>
                </div>
              </div>

              <div className="program-list">
                {selectedTemplateTechniqueMediaAssets.length ? (
                  selectedTemplateTechniqueMediaAssets.map((asset) => {
                    const assetUrl = normalizeMediaUrl(asset.url);

                    return (
                      <article key={asset.id} className="detail-card program-card">
                        <strong>{asset.title || "Recurso de técnica"}</strong>
                        <span>{asset.kind}{asset.isPrimary ? " · principal" : ""}</span>
                        {assetUrl ? (
                          asset.kind === "VIDEO" ? (
                            <video controls preload="metadata" style={{ width: "100%", borderRadius: 16, marginTop: 12 }} src={assetUrl} />
                          ) : (
                            <img src={assetUrl} alt={asset.title || "Recurso de tecnica"} style={{ width: "100%", borderRadius: 16, marginTop: 12 }} />
                          )
                        ) : null}
                        <div className="chip-row">
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => void handleTechniqueMediaDelete(asset.id)}
                            disabled={loading}
                          >
                            Eliminar
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="helper-text">Todavia no hay recursos de técnica cargados para este programa.</p>
                )}
              </div>
            </div>
          ) : null}

          {angleWizard.open ? (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              onClick={(e) => { if (e.target === e.currentTarget) setAngleWizard({ open: false }); }}
            >
              <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <p className="eyebrow">Autodetectar ángulos</p>
                    {angleWizard.phase === "select-events" ? (
                      <h2>Paso 1 — Selecciona los eventos</h2>
                    ) : (
                      <h2>
                        Paso 2 — Revisar ángulos:{" "}
                        {angleWizard.groups[angleWizard.groupIndex]?.eventLabel}
                        {" "}
                        <span className="eyebrow">
                          ({angleWizard.groupIndex + 1}/{angleWizard.groups.length})
                        </span>
                      </h2>
                    )}
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setAngleWizard({ open: false })}
                  >
                    Cancelar
                  </button>
                </div>

                <div className="modal-body">
                  {angleWizard.phase === "select-events" ? (
                    <div className="stack-form">
                      <p className="helper-text">
                        Elige los eventos para los cuales se sugerirán ángulos articulares.
                        Los valores medidos en el video de referencia ±15° se usarán como rango objetivo.
                      </p>
                      <div className="detail-list">
                        {angleWizard.availableEvents.map((ev) => (
                          <label key={ev.eventType} className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={angleWizard.selectedEventTypes.includes(ev.eventType)}
                              onChange={(e) => {
                                setAngleWizard((prev) => {
                                  if (!prev.open || prev.phase !== "select-events") return prev;
                                  return {
                                    ...prev,
                                    selectedEventTypes: e.target.checked
                                      ? [...prev.selectedEventTypes, ev.eventType]
                                      : prev.selectedEventTypes.filter((t) => t !== ev.eventType),
                                  };
                                });
                              }}
                            />
                            {ev.label}
                          </label>
                        ))}
                      </div>
                      <div className="form-actions">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => handleAngleWizardNext()}
                        >
                          Siguiente →
                        </button>
                      </div>
                    </div>
                  ) : angleWizard.phase === "review-angles" ? (
                    <div className="stack-form">
                      <p className="helper-text">
                        Decide qué ángulos incluir para el evento{" "}
                        <strong>{angleWizard.groups[angleWizard.groupIndex]?.eventLabel}</strong>.
                        Los que marques como "Incluir" se agregarán al formulario al finalizar.
                      </p>
                      <div className="detail-list">
                        {angleWizard.groups[angleWizard.groupIndex]?.angles.map((item, angleIdx) => (
                          <div key={item.draft.id} className="detail-card">
                            <div className="section-header compact-header">
                              <div>
                                <strong>{item.draft.label}</strong>
                                <span className="helper-text">
                                  {item.draft.pointA} → {item.draft.vertex} → {item.draft.pointC}
                                  {item.draft.notes.includes("≈")
                                    ? ` · ${item.draft.notes.match(/≈[^(]+/)?.[0]?.trim()}`
                                    : ""}
                                </span>
                              </div>
                              <button
                                type="button"
                                className={item.include ? "primary-button" : "secondary-button"}
                                onClick={() => {
                                  setAngleWizard((prev) => {
                                    if (!prev.open || prev.phase !== "review-angles") return prev;
                                    const newGroups = prev.groups.map((g, gi) =>
                                      gi === prev.groupIndex
                                        ? {
                                            ...g,
                                            angles: g.angles.map((a, ai) =>
                                              ai === angleIdx ? { ...a, include: !a.include } : a,
                                            ),
                                          }
                                        : g,
                                    );
                                    return { ...prev, groups: newGroups };
                                  });
                                }}
                              >
                                {item.include ? "✓ Incluir" : "Omitir"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="form-actions">
                        {angleWizard.groupIndex > 0 ? (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() =>
                              setAngleWizard((prev) =>
                                prev.open && prev.phase === "review-angles"
                                  ? { ...prev, groupIndex: prev.groupIndex - 1 }
                                  : prev,
                              )
                            }
                          >
                            ← Anterior
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => handleAngleWizardNext()}
                        >
                          {angleWizard.groupIndex + 1 < angleWizard.groups.length
                            ? "Siguiente evento →"
                            : "Finalizar y agregar"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {templateModalOpen ? (
            <div className="modal-overlay" onClick={() => setTemplateModalOpen(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="section-header">
                  <h3>{templateForm.id ? "Editar programa" : "Nuevo programa"}</h3>
                  <button type="button" className="ghost-button" onClick={() => setTemplateModalOpen(false)}>✕</button>
                </div>
                <form className="stack-form" onSubmit={(e) => void handleTemplateSubmit(e)}>
                  <div className="form-grid">
                    <label>
                      Código
                      <input
                        value={templateForm.code}
                        onChange={(e) => setTemplateForm((f) => ({ ...f, code: e.target.value }))}
                        placeholder="ej. SPRINT-8W"
                        required
                        disabled={Boolean(templateForm.id)}
                      />
                    </label>
                    <label>
                      Nombre
                      <input
                        value={templateForm.name}
                        onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="ej. Plan Sprint 8 semanas"
                        required
                      />
                    </label>
                    <label>
                      Duración del ciclo (días)
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={templateForm.cycleLengthDays}
                        onChange={(e) => setTemplateForm((f) => ({ ...f, cycleLengthDays: e.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      Descripción
                      <textarea
                        value={templateForm.description}
                        onChange={(e) => setTemplateForm((f) => ({ ...f, description: e.target.value }))}
                        rows={2}
                      />
                    </label>
                  </div>
                  <button className="primary-button" type="submit" disabled={loading}>
                    {templateForm.id ? "Guardar cambios" : "Crear programa"}
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Exclusiones por atleta</p>
              <h2>Ejercicios excluidos</h2>
            </div>
          </div>
          <p className="helper-text section-spacer">
            Selecciona un atleta para gestionar qué ejercicios se omiten al generar su programa (ej. dolor de espalda → quitar peso muerto).
          </p>

          <div className="detail-list">
            {allAthletes.map((athlete) => (
              <article key={athlete.id} className={`detail-card${exclusionsAthleteId === athlete.id ? " active" : ""}`}>
                <strong>{athlete.displayName}</strong>
                <span>{athlete.team?.name ?? "Sin equipo"} · {athlete.sport || "Sin deporte"}</span>
                {athlete.exerciseExclusions?.length ? (
                  <p>{athlete.exerciseExclusions.length} ejercicio(s) excluido(s)</p>
                ) : (
                  <p>Sin exclusiones</p>
                )}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setExclusionsAthleteId(athlete.id);
                    setExclusionsDraft(athlete.exerciseExclusions ?? []);
                  }}
                >
                  Editar exclusiones
                </button>
              </article>
            ))}
          </div>

          {exclusionsAthleteId ? (
            <div className="modal-overlay" onClick={() => setExclusionsAthleteId("")}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="section-header">
                  <h3>Exclusiones de {allAthletes.find((a) => a.id === exclusionsAthleteId)?.displayName}</h3>
                  <button type="button" className="ghost-button" onClick={() => setExclusionsAthleteId("")}>✕</button>
                </div>
                <p className="helper-text">Marca los ejercicios que NO se incluirán al generar el programa de este atleta.</p>
                <div className="detail-list section-spacer">
                  {exercises.map((ex) => (
                    <label key={ex.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={exclusionsDraft.includes(ex.id)}
                        onChange={(e) => {
                          setExclusionsDraft((d) =>
                            e.target.checked ? [...d, ex.id] : d.filter((id) => id !== ex.id),
                          );
                        }}
                      />
                      {ex.name}
                    </label>
                  ))}
                </div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={loading}
                  onClick={() => void handleExclusionsUpdate(exclusionsAthleteId, exclusionsDraft)}
                >
                  Guardar exclusiones
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </section>
      ) : null}

      {adminView === "technique" ? (
      <section className="management-grid">
        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Carga técnica por programa</p>
              <h2>Texto y videos</h2>
            </div>
          </div>

          <p className="helper-text section-spacer">
            Selecciona un programa para cargar el texto descriptivo y los recursos de técnica que luego verá el atleta en la vista `Técnica` de `mobile2`.
          </p>

          <div className="detail-list">
            {allTemplates.length ? (
              allTemplates.map((tmpl) => (
                <article key={tmpl.id} className={`detail-card${selectedTemplateCode === tmpl.code ? " active" : ""}`}>
                  <strong>{tmpl.name}</strong>
                  <span>{tmpl.code}</span>
                  <p>{tmpl.description || "Sin descripcion"}</p>
                  <small>
                    {tmpl.techniqueMediaAssets.length} recurso(s) de técnica · {tmpl._count.personalPrograms} programa(s) activo(s)
                  </small>
                  <div className="chip-row">
                    <button
                      type="button"
                      className={`ghost-button${selectedTemplateCode === tmpl.code ? " active" : ""}`}
                      onClick={() => {
                        setSelectedTemplateCode(tmpl.code);
                        void handleTemplateDaysLoad(tmpl.code);
                      }}
                    >
                      Abrir técnica
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        setSelectedTemplateCode(tmpl.code);
                        void handleTemplateDaysLoad(tmpl.code);
                        setAdminView("training");
                      }}
                    >
                      Ver entrenamiento
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="helper-text">No hay programas definidos todavia.</p>
            )}
          </div>
        </article>

        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Editor de técnica</p>
              <h2>{selectedTemplateMeta?.name ?? "Selecciona un programa"}</h2>
            </div>
            {selectedTemplateMeta ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setSelectedTechniqueId("");
                  setSelectedTemplateTechniqueMediaAssets([]);
                  setTemplateTechniqueForm(emptyTechniqueForm());
                }}
              >
                + Nueva técnica
              </button>
            ) : null}
          </div>

          {selectedTemplateMeta ? (
            <div className="detail-stack section-spacer">
              <div className="program-list">
                {templateTechniques.length ? (
                  templateTechniques.map((technique) => (
                    <article key={technique.id} className={`detail-card program-card${selectedTechniqueId === technique.id ? " active" : ""}`}>
                      <strong>{technique.title}</strong>
                      <span>{technique.measurementDefinitions.length} medición(es) · {technique.mediaAssets.length} recurso(s)</span>
                      <p>{technique.description || "Sin descripción"}</p>
                      <div className="chip-row">
                        <button
                          type="button"
                          className={`ghost-button${selectedTechniqueId === technique.id ? " active" : ""}`}
                          onClick={() => {
                            setSelectedTechniqueId(technique.id);
                            setSelectedTemplateTechniqueMediaAssets(technique.mediaAssets);
                            setTechniquePoseProcessing(emptyTechniquePoseProcessingState());
                            setTemplateTechniqueForm(mapTechniqueToForm(technique));
                            setTechniqueUploadState(emptyTechniqueUploadState());
                          }}
                        >
                          Editar
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="helper-text">Este programa todavía no tiene técnicas creadas.</p>
                )}
              </div>

              <form
                className="stack-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleTechniqueSave();
                }}
              >
                <div className="form-grid">
                  <label>
                    Título de técnica
                    <input
                      value={templateTechniqueForm.title}
                      onChange={(event) => setTemplateTechniqueForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="ej. Técnica de sprint: postura y primer paso"
                    />
                  </label>
                  <label>
                    Texto explicativo
                    <textarea
                      value={templateTechniqueForm.description}
                      onChange={(event) => setTemplateTechniqueForm((current) => ({ ...current, description: event.target.value }))}
                      rows={5}
                      placeholder="Explica la técnica ideal, errores frecuentes y qué debe sentir el atleta."
                    />
                  </label>
                  <label>
                    Cómo medir esta técnica
                    <textarea
                      value={templateTechniqueForm.measurementInstructions}
                      onChange={(event) => setTemplateTechniqueForm((current) => ({ ...current, measurementInstructions: event.target.value }))}
                      rows={4}
                      placeholder="Describe cómo se toma la medición, qué referencia usar y qué errores evitar."
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={templateTechniqueForm.comparisonEnabled}
                      onChange={(event) => setTemplateTechniqueForm((current) => ({ ...current, comparisonEnabled: event.target.checked }))}
                    />
                    Habilitar comparación en Evolución
                  </label>
                </div>

                <div className="detail-stack">
                  <div className="section-header compact-header">
                    <div>
                      <p className="eyebrow">Mediciones</p>
                      <h3>Configuración de captura</h3>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        setTemplateTechniqueForm((current) => ({
                          ...current,
                          measurements: [...current.measurements, emptyTechniqueMeasurementDraft()],
                        }))
                      }
                    >
                      + Medición
                    </button>
                  </div>

                  {templateTechniqueForm.measurements.length ? (
                    templateTechniqueForm.measurements.map((measurement, index) => (
                      <article key={measurement.id ?? `new-${index}`} className="detail-card program-card">
                        <div className="form-grid">
                          <label>
                            Nombre de la medición
                            <input
                              value={measurement.label}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  measurements: current.measurements.map((entry, entryIndex) =>
                                    entryIndex === index ? { ...entry, label: event.target.value } : entry,
                                  ),
                                }))
                              }
                              placeholder="ej. Altura de salto"
                            />
                          </label>
                          <label>
                            Unidades permitidas
                            <input
                              value={measurement.allowedUnitsText}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  measurements: current.measurements.map((entry, entryIndex) =>
                                    entryIndex === index ? { ...entry, allowedUnitsText: event.target.value } : entry,
                                  ),
                                }))
                              }
                              placeholder="cm, pies"
                            />
                          </label>
                          <label>
                            Instrucciones de esta medición
                            <textarea
                              value={measurement.instructions}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  measurements: current.measurements.map((entry, entryIndex) =>
                                    entryIndex === index ? { ...entry, instructions: event.target.value } : entry,
                                  ),
                                }))
                              }
                              rows={3}
                              placeholder="Ej. medir desde la punta del dedo medio hasta la marca más alta."
                            />
                          </label>
                        </div>
                        <div className="chip-row">
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              setTemplateTechniqueForm((current) => ({
                                ...current,
                                measurements: current.measurements.filter((_, entryIndex) => entryIndex !== index),
                              }))
                            }
                          >
                            Eliminar medición
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="helper-text">Agrega al menos una medición si quieres que la app capture datos específicos para esta técnica.</p>
                  )}
                </div>

                <div className="chip-row">
                  <button className="primary-button" type="submit" disabled={loading || !templateTechniqueForm.title.trim()}>
                    Guardar técnica
                  </button>
                  {selectedTechniqueId ? (
                    <button className="danger-button" type="button" disabled={loading} onClick={() => void handleTechniqueDelete()}>
                      Eliminar técnica
                    </button>
                  ) : null}
                </div>
              </form>

              <form className="stack-form" onSubmit={(event) => void handleTechniqueMediaUpload(event)}>
                <div className="workflow-note">
                  <strong>Subida visible de referencia biomecánica</strong>
                  <p>
                    Si este video debe convertirse en la referencia profesional, marca la casilla inferior.
                    Al subirlo se extraerán los 33 landmarks y quedará enlazado a esta técnica.
                  </p>
                </div>
                <div className="form-grid">
                  <label>
                    Tipo de recurso
                    <select
                      value={techniqueUploadState.kind}
                      onChange={(event) =>
                        setTechniqueUploadState((current) => ({
                          ...current,
                          kind: event.target.value as MediaKind,
                          useAsProReference: event.target.value === "VIDEO" ? current.useAsProReference : false,
                        }))
                      }
                    >
                      <option value="VIDEO">Video</option>
                      <option value="GIF">GIF</option>
                      <option value="IMAGE">Imagen</option>
                    </select>
                  </label>
                  <label>
                    Título del recurso
                    <input
                      value={techniqueUploadState.title}
                      onChange={(event) => setTechniqueUploadState((current) => ({ ...current, title: event.target.value }))}
                      placeholder="ej. Técnica frontal"
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={techniqueUploadState.isPrimary}
                      onChange={(event) => setTechniqueUploadState((current) => ({ ...current, isPrimary: event.target.checked }))}
                    />
                    Marcar como principal
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={techniqueUploadState.useAsProReference}
                      disabled={techniqueUploadState.kind !== "VIDEO"}
                      onChange={(event) =>
                        setTechniqueUploadState((current) => ({ ...current, useAsProReference: event.target.checked }))
                      }
                    />
                    Usar este video como referencia biomecánica profesional
                  </label>
                  <label>
                    Velocidad de la referencia
                    <select
                      value={techniqueUploadState.referenceMotionProfile}
                      disabled={techniqueUploadState.kind !== "VIDEO" || !techniqueUploadState.useAsProReference}
                      onChange={(event) =>
                        setTechniqueUploadState((current) => ({
                          ...current,
                          referenceMotionProfile: event.target.value as TechniqueReferenceMotionProfile,
                        }))
                      }
                    >
                      <option value="REAL_TIME">Velocidad normal</option>
                      <option value="SLOW_MOTION">Camara lenta</option>
                    </select>
                  </label>
                  <label>
                    Archivo
                    <input
                      type="file"
                      accept="video/*,image/*"
                      onChange={(event) =>
                        setTechniqueUploadState((current) => ({ ...current, file: event.target.files?.[0] ?? null }))
                      }
                    />
                  </label>
                </div>
                <button className="primary-button" type="submit" disabled={loading || !selectedTechniqueId || !techniqueUploadState.file}>
                  Subir recurso de técnica
                </button>
              </form>

              <div className="detail-card program-card">
                <strong>Referencia biomecánica profesional</strong>
                <p>{formatTechniquePoseSummary(selectedTechnique?.proLandmarks)}</p>
                {selectedTechnique?.proVideoUrl ? (
                  <small>Video profesional enlazado: {normalizeMediaUrl(selectedTechnique.proVideoUrl) ?? selectedTechnique.proVideoUrl}</small>
                ) : (
                  <small>Sube un video profesional para generar landmarks en cliente y guardarlos en backend.</small>
                )}
                <div className="biomechanics-summary-grid">
                  <span className="biomechanics-badge">
                    {selectedTechniqueReferenceAsset
                      ? `Referencia visible: ${selectedTechniqueReferenceAsset.title || "video profesional"}`
                      : "Referencia visible: todavía no asignada"}
                  </span>
                  <span className="biomechanics-badge">
                    {`Modo: ${formatReferenceMotionProfile(normalizeTechniqueBiomechanicsConfig(selectedTechnique?.biomechanicsConfig).referenceMotionProfile)}`}
                  </span>
                  <span className="biomechanics-badge">
                    {`${templateTechniqueForm.biomechanics.focusPoints.length} punto(s) · ${templateTechniqueForm.biomechanics.pointChecks.length} point-check(s) · ${templateTechniqueForm.biomechanics.angleChecks.length} ángulo(s) · ${templateTechniqueForm.biomechanics.trajectoryChecks.length} trayectoria(s) · ${templateTechniqueForm.biomechanics.hipProgressionChecks.length} progresión(es) · ${templateTechniqueForm.biomechanics.keyEvents.length} evento(s)`}
                  </span>
                </div>
                {techniquePoseProcessing.status === "processing" ? (
                  <p className="helper-text">
                    {techniquePoseProcessing.detail} {techniquePoseProcessing.totalFrames > 0
                      ? `(${techniquePoseProcessing.processedFrames}/${techniquePoseProcessing.totalFrames})`
                      : ""}
                  </p>
                ) : null}
                {techniquePoseProcessing.status === "uploading" ? (
                  <p className="helper-text">{techniquePoseProcessing.detail}</p>
                ) : null}
                {techniquePoseProcessing.status === "error" ? (
                  <p className="helper-text" style={{ color: "#b91c1c" }}>{techniquePoseProcessing.detail}</p>
                ) : null}
              </div>

              {selectedTechnique?.proLandmarks && selectedReferenceFrame && selectedReferenceVideoUrl ? (
                <BiomechanicsVisualEditor
                  mode={visualEditorMode}
                  modeOptions={[
                    { mode: "inspect", label: "Inspección" },
                    { mode: "points", label: "Puntos" },
                    { mode: "angles", label: "Ángulos" },
                    { mode: "events", label: "Eventos" },
                  ]}
                  inspectorTitle={hoveredVisualLandmark ? landmarkLabel(hoveredVisualLandmark) : "Inspector biomecánico"}
                  inspectorDescription={visualEditorMode === "inspect"
                    ? "Usa el scrubber para recorrer la referencia y pasa el cursor sobre los landmarks para inspeccionarlos."
                    : visualEditorMode === "points"
                      ? "Haz click sobre un landmark del cuerpo para crear un punto clave vinculado a esa articulación."
                      : visualEditorMode === "angles"
                        ? "Selecciona tres landmarks en orden A → vértice → C para construir un ángulo visual."
                        : "Elige el frame actual en la timeline y marca el evento biomecánico desde este momento del gesto."}
                  videoRef={referenceVideoRef}
                  videoUrl={selectedReferenceVideoUrl}
                  currentTimestampMs={selectedReferenceFrame.timestampMs}
                  frameIndex={selectedReferenceFrameIndex}
                  frameCount={selectedReferenceFrameCount}
                  frameLabel={`Frame ${selectedReferenceFrameIndex + 1}/${selectedReferenceFrameCount} · ${formatReferenceFrameLabel(selectedReferenceFrame.timestampMs)}`}
                  connectionSegments={referenceConnectionSegments}
                  landmarkNodes={referenceLandmarkNodes}
                  markers={referenceTimelineMarkers}
                  angleOverlay={selectedAngleOverlay}
                  trajectoryOverlay={selectedTrajectoryOverlay}
                  focusPointChips={focusPointChips}
                  angleSelectionLabels={angleSelectionLabels}
                  anglePreviewLabel={anglePreviewLabel}
                  canCreateAngle={pendingAngleLandmarks.length === 3}
                  canClearAngleSelection={pendingAngleLandmarks.length > 0}
                  eventTypeOptions={activeBiomechanicsEventTypeOptions.map((option) => ({ value: option, label: formatBiomechanicsEventLabel(option) }))}
                  pendingEventType={pendingEventType}
                  eventChips={eventChips}
                  inspectSummaryChips={inspectSummaryChips}
                  onModeChange={handleVisualEditorModeChange}
                  onVideoLoadedMetadata={(event) => {
                    event.currentTarget.currentTime = selectedReferenceFrame.timestampMs / 1000;
                    event.currentTarget.pause();
                  }}
                  onVideoPlay={handleReferenceVideoPlay}
                  onVideoPause={handleReferenceVideoPause}
                  onVideoTimeUpdate={handleReferenceVideoTimeUpdate}
                  onLandmarkHover={(landmark) => setHoveredVisualLandmark(landmark as LandmarkName | null)}
                  onLandmarkSelect={(landmark) => handleVisualLandmarkSelect(landmark as LandmarkName)}
                  onPreviousFrame={handlePreviousReferenceFrame}
                  onNextFrame={handleNextReferenceFrame}
                  onFrameChange={handleReferenceFrameChange}
                  onMarkerSelect={handleTimelineMarkerSelect}
                  onFocusPointChipSelect={(pointId, landmark) => handleFocusPointSelect(pointId, landmark as LandmarkName)}
                  onCreateAngle={() => void handleCreateAngleFromPendingSelection()}
                  onClearAngleSelection={() => setPendingAngleLandmarks([])}
                  onPendingEventTypeChange={(eventType) => setPendingEventType(eventType as TechniqueBiomechanicsEventType)}
                  onCreateEvent={() => void handleCreateEventFromCurrentFrame()}
                  onEventChipSelect={(eventId) => {
                    const selectedEvent = referenceEventMarkers.find((event) => event.id === eventId);
                    if (selectedEvent) {
                      handleKeyEventSelect(selectedEvent.id, selectedEvent.eventType, selectedEvent.frameIndex);
                    }
                  }}
                />
              ) : null}

              <div className="detail-stack">
                <div className="section-header compact-header">
                  <div>
                    <p className="eyebrow">Biomecánica</p>
                    <h3>Puntos, posiciones, ángulos, trayectorias y eventos clave</h3>
                  </div>
                </div>

                <div className="technique-save-bar">
                  <div>
                    <strong>Persistencia del editor biomecánico</strong>
                    <p>Los cambios de puntos, point-checks, ángulos y eventos se guardan solo al pulsar este botón.</p>
                  </div>
                  <div className="chip-row technique-save-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={loading || !templateTechniqueForm.title.trim()}
                      onClick={() => void handleTechniqueSave()}
                    >
                      Guardar técnica
                    </button>
                  </div>
                </div>

                <div className="workflow-note">
                  <strong>Qué define esta configuración</strong>
                  <p>
                    Aquí decides qué landmarks mirar, qué posiciones y ángulos comparar, qué trayectorias seguir y
                    en qué momentos o ventanas del gesto debe fijarse el análisis sobre la referencia profesional ya subida.
                  </p>
                </div>

                {referenceEventDetectionDebug ? (
                  <div className="workflow-note biomechanics-debug-panel">
                    <div className="biomechanics-debug-header">
                      <div>
                        <strong>Diagnóstico de autodetección</strong>
                        <p>
                          Muestra el apoyo dominante por frame, las corridas y los picos previos al despegue, y la ruta
                          exacta con la que se eligieron antepenúltimo, penúltimo y último apoyo.
                        </p>
                      </div>
                      <div className="biomechanics-debug-stat-row">
                        <span className="biomechanics-badge">Eventos sugeridos: {referenceEventDetectionDebug.eventCount}</span>
                        <span className="biomechanics-badge">Corridas: {referenceEventDetectionDebug.debug.supportRuns.length}</span>
                        <span className="biomechanics-badge">Picos: {referenceEventDetectionDebug.debug.fallbackSupportPeaks.length}</span>
                      </div>
                    </div>

                    {referenceEventDetectionDebug.debug.supportLabels.length ? (
                      <div className="biomechanics-debug-timeline-shell">
                        <div className="biomechanics-debug-timeline-labels">
                          <span>Frame 1</span>
                          <span>Frame {referenceEventDetectionDebug.debug.supportLabels.length}</span>
                        </div>
                        <div className="biomechanics-debug-timeline" role="list" aria-label="Apoyos detectados frame a frame">
                          {referenceEventDetectionDebug.debug.supportLabels.map((label, index) => {
                            const matchingSelections = referenceEventDetectionDebug.debug.selections.filter((selection) => selection.frameIndex === index);
                            const isKeyFrame = matchingSelections.length > 0
                              || index === referenceEventDetectionDebug.debug.takeOffIndex
                              || index === referenceEventDetectionDebug.debug.toeOffIndex
                              || index === referenceEventDetectionDebug.debug.firstAirborneIndex
                              || index === referenceEventDetectionDebug.debug.apexIndex
                              || index === referenceEventDetectionDebug.debug.landingIndex;

                            return (
                              <button
                                key={`support-frame-${index}`}
                                type="button"
                                role="listitem"
                                className={`biomechanics-debug-frame biomechanics-debug-frame-${label.toLowerCase()}${selectedReferenceFrameIndex === index ? " is-selected" : ""}${isKeyFrame ? " is-key" : ""}`}
                                onClick={() => handleReferenceFrameChange(index)}
                                title={[
                                  `Frame ${index + 1}`,
                                  formatSupportLabel(label),
                                  ...matchingSelections.map((selection) => `${formatBiomechanicsEventLabel(selection.eventType)} · ${formatDetectionSelectionSource(selection.source)}`),
                                ].join(" · ")}
                                aria-label={`Frame ${index + 1}: ${formatSupportLabel(label)}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="biomechanics-debug-grid">
                      <article className="detail-card program-card biomechanics-debug-card">
                        <p className="eyebrow">Eventos elegidos</p>
                        <div className="biomechanics-debug-list">
                          {referenceEventDetectionDebug.debug.selections.map((selection) => (
                            <p key={selection.eventType}>
                              <strong>{formatBiomechanicsEventLabel(selection.eventType)}:</strong>{" "}
                              {selection.frameIndex !== null ? `frame ${selection.frameIndex + 1}` : "sin frame"}
                              {selection.side ? ` · ${formatSupportLabel(selection.side)}` : ""}
                              {` · ${formatDetectionSelectionSource(selection.source)}`}
                            </p>
                          ))}
                        </div>
                      </article>

                      <article className="detail-card program-card biomechanics-debug-card">
                        <p className="eyebrow">Corridas detectadas</p>
                        <div className="biomechanics-debug-list">
                          {referenceEventDetectionDebug.debug.supportRuns.length ? referenceEventDetectionDebug.debug.supportRuns.map((run, index) => (
                            <p key={`${run.side}-${run.start}-${run.end}-${index}`}>
                              <strong>{formatSupportLabel(run.side)}:</strong> frames {run.start + 1}-{run.end + 1} · duración {run.length}
                            </p>
                          )) : <p>Sin corridas de apoyo antes del despegue.</p>}
                        </div>
                      </article>

                      <article className="detail-card program-card biomechanics-debug-card">
                        <p className="eyebrow">Picos alternados</p>
                        <div className="biomechanics-debug-list">
                          {referenceEventDetectionDebug.debug.fallbackSupportPeaks.length ? referenceEventDetectionDebug.debug.fallbackSupportPeaks.map((peak) => {
                            const wasSelected = referenceEventDetectionDebug.debug.selectedSupportPeaks.some(
                              (selectedPeak) => selectedPeak.frameIndex === peak.frameIndex && selectedPeak.side === peak.side,
                            );

                            return (
                              <p key={`${peak.side}-${peak.frameIndex}`} className={wasSelected ? "biomechanics-debug-selected-line" : undefined}>
                                <strong>{formatSupportLabel(peak.side)}:</strong> frame {peak.frameIndex + 1} · score {peak.score.toFixed(2)}
                                {wasSelected ? " · usado" : ""}
                              </p>
                            );
                          }) : <p>Sin picos de fallback antes del despegue.</p>}
                        </div>
                      </article>

                      <article className="detail-card program-card biomechanics-debug-card">
                        <p className="eyebrow">Frames clave</p>
                        <div className="biomechanics-debug-list">
                          <p><strong>Setup:</strong> frame {referenceEventDetectionDebug.debug.setupIndex + 1}</p>
                          <p><strong>Dip:</strong> frame {referenceEventDetectionDebug.debug.dipIndex + 1}</p>
                          <p><strong>Primer aéreo:</strong> frame {referenceEventDetectionDebug.debug.firstAirborneIndex + 1}</p>
                          <p><strong>Take off:</strong> frame {referenceEventDetectionDebug.debug.takeOffIndex + 1}</p>
                          <p><strong>Toe off:</strong> frame {referenceEventDetectionDebug.debug.toeOffIndex + 1}</p>
                          <p><strong>Apex:</strong> frame {referenceEventDetectionDebug.debug.apexIndex + 1}</p>
                          <p><strong>Landing:</strong> frame {referenceEventDetectionDebug.debug.landingIndex + 1}</p>
                        </div>
                      </article>
                    </div>
                  </div>
                ) : null}

                <div className="detail-card program-card biomechanics-card">
                  <div className="section-header compact-header">
                    <div>
                      <p className="eyebrow">Puntos clave</p>
                      <h3>Landmarks a seguir</h3>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={!selectedTechnique?.proLandmarks}
                      onClick={() => handleAutoDetectReferenceEvents()}
                    >
                      Autodetectar eventos
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        setTemplateTechniqueForm((current) => ({
                          ...current,
                          biomechanics: {
                            ...current.biomechanics,
                            focusPoints: [
                              ...current.biomechanics.focusPoints,
                              {
                                id: createDraftId(),
                                label: "",
                                landmark: "RIGHT_HIP",
                                cue: "",
                                notes: "",
                              },
                            ],
                          },
                        }))
                      }
                    >
                      + Punto clave
                    </button>
                  </div>
                  {templateTechniqueForm.biomechanics.focusPoints.length ? (
                    templateTechniqueForm.biomechanics.focusPoints.map((point, index) => (
                      <article
                        key={point.id}
                        className={`detail-card program-card${selectedFocusPointId === point.id ? " highlight-card" : ""}`}
                        onClick={() => handleFocusPointSelect(point.id, point.landmark)}
                        onFocusCapture={() => handleFocusPointSelect(point.id, point.landmark)}
                      >
                        <div className="form-grid">
                          <label>
                            Nombre del punto
                            <input
                              value={point.label}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    focusPoints: current.biomechanics.focusPoints.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, label: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="ej. Cadera de impulso"
                            />
                          </label>
                          <label>
                            Landmark
                            <select
                              value={point.landmark}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    focusPoints: current.biomechanics.focusPoints.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, landmark: event.target.value as LandmarkName } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {poseLandmarkOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Cue técnico
                            <input
                              value={point.cue}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    focusPoints: current.biomechanics.focusPoints.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, cue: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="ej. Mantener la cadera alta"
                            />
                          </label>
                          <label>
                            Notas
                            <textarea
                              value={point.notes}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    focusPoints: current.biomechanics.focusPoints.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              rows={3}
                              placeholder="Qué se compara contra la referencia o por qué importa este punto."
                            />
                          </label>
                        </div>
                        <div className="chip-row">
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              setTemplateTechniqueForm((current) => ({
                                ...current,
                                biomechanics: {
                                  ...current.biomechanics,
                                  focusPoints: current.biomechanics.focusPoints.filter((_, entryIndex) => entryIndex !== index),
                                },
                              }))
                            }
                          >
                            Eliminar punto
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="helper-text">Define los landmarks que deben seguirse de forma explícita sobre el gesto profesional.</p>
                  )}
                </div>

                <div className="detail-card program-card biomechanics-card">
                  <div className="section-header compact-header">
                    <div>
                      <p className="eyebrow">Puntos comparables</p>
                      <h3>Point checks por evento o ventana</h3>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        setTemplateTechniqueForm((current) => ({
                          ...current,
                          biomechanics: {
                            ...current.biomechanics,
                            pointChecks: [
                              ...current.biomechanics.pointChecks,
                              {
                                id: createDraftId(),
                                label: "",
                                landmark: "RIGHT_HIP",
                                axis: "Y",
                                referenceMode: "ABSOLUTE",
                                anchorEventId: "",
                                anchorEventType: "",
                                windowStartEventId: "",
                                windowEndEventId: "",
                                sampleMode: "AT_EVENT",
                                targetMin: "",
                                targetMax: "",
                                phase: "",
                                notes: "",
                              },
                            ],
                          },
                        }))
                      }
                    >
                      + Point check
                    </button>
                  </div>
                  {templateTechniqueForm.biomechanics.pointChecks.length ? (
                    templateTechniqueForm.biomechanics.pointChecks.map((pointCheck, index) => (
                      <article
                        key={pointCheck.id}
                        className={`detail-card program-card${selectedPointCheckId === pointCheck.id ? " highlight-card" : ""}`}
                        onClick={() => handlePointCheckSelect(pointCheck.id)}
                        onFocusCapture={() => handlePointCheckSelect(pointCheck.id)}
                      >
                        <div className="form-grid-3">
                          <label>
                            Nombre del point check
                            <input
                              value={pointCheck.label}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, label: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="ej. Altura de cadera en último apoyo"
                            />
                          </label>
                          <label>
                            Landmark
                            <select
                              value={pointCheck.landmark}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, landmark: event.target.value as LandmarkName } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {poseLandmarkOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Eje
                            <select
                              value={pointCheck.axis}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, axis: event.target.value as TechniqueBiomechanicsTrajectoryAxis } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {biomechanicsTrajectoryAxisOptions.map((option) => (
                                <option key={option} value={option}>{formatTrajectoryAxisLabel(option)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Referencia
                            <select
                              value={pointCheck.referenceMode}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, referenceMode: event.target.value as TechniqueBiomechanicsTrajectoryReferenceMode } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {biomechanicsTrajectoryReferenceModeOptions.map((option) => (
                                <option key={option} value={option}>{formatTrajectoryReferenceModeLabel(option)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Evento ancla
                            <select
                              value={pointCheck.anchorEventId}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, anchorEventId: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Sin evento fijo</option>
                              {biomechanicsEventReferenceOptions.map((event) => (
                                <option key={event.id} value={event.id}>{event.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Tipo de evento ancla
                            <select
                              value={pointCheck.anchorEventType}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, anchorEventType: event.target.value as TechniqueBiomechanicsEventType | "" } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Sin tipo fijo</option>
                              {biomechanicsEventTypeOptions.map((option) => (
                                <option key={option} value={option}>{formatBiomechanicsEventLabel(option)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Inicio de ventana
                            <select
                              value={pointCheck.windowStartEventId}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, windowStartEventId: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Sin ventana</option>
                              {biomechanicsEventReferenceOptions.map((event) => (
                                <option key={event.id} value={event.id}>{event.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Fin de ventana
                            <select
                              value={pointCheck.windowEndEventId}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, windowEndEventId: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Sin ventana</option>
                              {biomechanicsEventReferenceOptions.map((event) => (
                                <option key={event.id} value={event.id}>{event.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Modo de muestreo
                            <select
                              value={pointCheck.sampleMode}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, sampleMode: event.target.value as TechniqueBiomechanicsAngleSampleMode | "" } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Usar valor por defecto</option>
                              {biomechanicsAngleSampleModeOptions.map((option) => (
                                <option key={option} value={option}>{formatAngleSampleModeLabel(option)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Fase
                            <input
                              value={pointCheck.phase}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, phase: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="ej. Descenso penúltimo apoyo"
                            />
                          </label>
                          <label>
                            Mínimo objetivo
                            <input
                              type="number"
                              value={pointCheck.targetMin}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, targetMin: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="0.42"
                            />
                          </label>
                          <label>
                            Máximo objetivo
                            <input
                              type="number"
                              value={pointCheck.targetMax}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, targetMax: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="0.57"
                            />
                          </label>
                          <label style={{ gridColumn: "1 / -1" }}>
                            Notas
                            <textarea
                              value={pointCheck.notes}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    pointChecks: current.biomechanics.pointChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              rows={3}
                              placeholder="ej. Controlar que la cadera del atleta descienda progresivamente en Y frente a la referencia."
                            />
                          </label>
                        </div>
                        <div className="chip-row">
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              setTemplateTechniqueForm((current) => ({
                                ...current,
                                biomechanics: {
                                  ...current.biomechanics,
                                  pointChecks: current.biomechanics.pointChecks.filter((_, entryIndex) => entryIndex !== index),
                                },
                              }))
                            }
                          >
                            Eliminar point check
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="helper-text">Agrega point checks para comparar la posición de landmarks como la cadera en eventos concretos o ventanas del gesto.</p>
                  )}
                </div>

                <div className="detail-card program-card biomechanics-card">
                  <div className="section-header compact-header">
                    <div>
                      <p className="eyebrow">Ángulos clave</p>
                      <h3>Comparaciones articulares</h3>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={!selectedTechnique?.proLandmarks || !templateTechniqueForm.biomechanics.keyEvents.length}
                      title={
                        !selectedTechnique?.proLandmarks
                          ? "Sube la referencia profesional con landmarks primero"
                          : !templateTechniqueForm.biomechanics.keyEvents.length
                            ? "Autodetecta los eventos primero"
                            : "Sugerir ángulos articulares para cada evento detectado (±15°)"
                      }
                      onClick={() => handleAutoDetectReferenceAngles()}
                    >
                      Autodetectar ángulos
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        setTemplateTechniqueForm((current) => ({
                          ...current,
                          biomechanics: {
                            ...current.biomechanics,
                            angleChecks: [
                              ...current.biomechanics.angleChecks,
                              {
                                id: createDraftId(),
                                label: "",
                                pointA: "RIGHT_HIP",
                                vertex: "RIGHT_KNEE",
                                pointC: "RIGHT_ANKLE",
                                plane: "SAGITTAL_2D",
                                anchorEventId: "",
                                anchorEventType: "",
                                windowStartEventId: "",
                                windowEndEventId: "",
                                sampleMode: "AT_EVENT",
                                targetMinDeg: "",
                                targetMaxDeg: "",
                                phase: "",
                                notes: "",
                              },
                            ],
                          },
                        }))
                      }
                    >
                      + Ángulo
                    </button>
                  </div>
                  {templateTechniqueForm.biomechanics.angleChecks.length ? (
                    templateTechniqueForm.biomechanics.angleChecks.map((angleCheck, index) => (
                      <article
                        key={angleCheck.id}
                        className={`detail-card program-card${selectedAngleCheckId === angleCheck.id ? " highlight-card" : ""}`}
                        onClick={() => handleAngleCheckSelect(angleCheck.id)}
                        onFocusCapture={() => handleAngleCheckSelect(angleCheck.id)}
                      >
                        <div className="form-grid-3">
                          <label>
                            Nombre del ángulo
                            <input
                              value={angleCheck.label}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, label: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="ej. Flexión de rodilla derecha"
                            />
                          </label>
                          <label>
                            Punto A
                            <select
                              value={angleCheck.pointA}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, pointA: event.target.value as LandmarkName } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {poseLandmarkOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Vértice
                            <select
                              value={angleCheck.vertex}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, vertex: event.target.value as LandmarkName } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {poseLandmarkOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Punto C
                            <select
                              value={angleCheck.pointC}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, pointC: event.target.value as LandmarkName } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {poseLandmarkOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Plano
                            <select
                              value={angleCheck.plane}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, plane: event.target.value as TechniqueBiomechanicsAnglePlane } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {biomechanicsPlaneOptions.map((option) => (
                                <option key={option} value={option}>{formatBiomechanicsPlaneLabel(option)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Evento ancla
                            <select
                              value={angleCheck.anchorEventId}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, anchorEventId: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Sin evento fijo</option>
                              {biomechanicsEventReferenceOptions.map((event) => (
                                <option key={event.id} value={event.id}>{event.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Tipo de evento ancla
                            <select
                              value={angleCheck.anchorEventType}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, anchorEventType: event.target.value as TechniqueBiomechanicsEventType | "" } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Sin tipo fijo</option>
                              {biomechanicsEventTypeOptions.map((option) => (
                                <option key={option} value={option}>{formatBiomechanicsEventLabel(option)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Inicio de ventana
                            <select
                              value={angleCheck.windowStartEventId}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, windowStartEventId: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Sin ventana</option>
                              {biomechanicsEventReferenceOptions.map((event) => (
                                <option key={event.id} value={event.id}>{event.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Fin de ventana
                            <select
                              value={angleCheck.windowEndEventId}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, windowEndEventId: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Sin ventana</option>
                              {biomechanicsEventReferenceOptions.map((event) => (
                                <option key={event.id} value={event.id}>{event.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Modo de muestreo
                            <select
                              value={angleCheck.sampleMode}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, sampleMode: event.target.value as TechniqueBiomechanicsAngleSampleMode | "" } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Usar valor por defecto</option>
                              {biomechanicsAngleSampleModeOptions.map((option) => (
                                <option key={option} value={option}>{formatAngleSampleModeLabel(option)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Fase
                            <input
                              value={angleCheck.phase}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, phase: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="ej. Dip final"
                            />
                          </label>
                          <label>
                            Mínimo objetivo (°)
                            <input
                              type="number"
                              value={angleCheck.targetMinDeg}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, targetMinDeg: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="70"
                            />
                          </label>
                          <label>
                            Máximo objetivo (°)
                            <input
                              type="number"
                              value={angleCheck.targetMaxDeg}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, targetMaxDeg: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="95"
                            />
                          </label>
                          <label style={{ gridColumn: "1 / -1" }}>
                            Notas
                            <textarea
                              value={angleCheck.notes}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    angleChecks: current.biomechanics.angleChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              rows={3}
                              placeholder="Qué rango quieres comparar contra la referencia."
                            />
                          </label>
                        </div>
                        <div className="chip-row">
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              setTemplateTechniqueForm((current) => ({
                                ...current,
                                biomechanics: {
                                  ...current.biomechanics,
                                  angleChecks: current.biomechanics.angleChecks.filter((_, entryIndex) => entryIndex !== index),
                                },
                              }))
                            }
                          >
                            Eliminar ángulo
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="helper-text">Agrega los ángulos que deben compararse contra la referencia profesional.</p>
                  )}
                </div>

                <div className="detail-card program-card biomechanics-card">
                  <div className="section-header compact-header">
                    <div>
                      <p className="eyebrow">Eventos clave</p>
                      <h3>Momentos del gesto</h3>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        setTemplateTechniqueForm((current) => ({
                          ...current,
                          biomechanics: {
                            ...current.biomechanics,
                            keyEvents: [
                              ...current.biomechanics.keyEvents,
                              {
                                id: createDraftId(),
                                label: "",
                                eventType: "TOE_OFF",
                                frameIndex: "",
                                frameHint: "",
                                source: "MANUAL",
                                confidence: "",
                                detector: "",
                                notes: "",
                              },
                            ],
                          },
                        }))
                      }
                    >
                      + Evento
                    </button>
                  </div>
                  {templateTechniqueForm.biomechanics.keyEvents.length ? (
                    templateTechniqueForm.biomechanics.keyEvents.map((keyEvent, index) => (
                      <article
                        key={keyEvent.id}
                        className={`detail-card program-card${selectedKeyEventId === keyEvent.id ? " highlight-card" : ""}`}
                        onClick={() => handleKeyEventSelect(keyEvent.id, keyEvent.eventType, parseFrameIndexInput(keyEvent.frameIndex) ?? parseFrameIndexFromHint(keyEvent.frameHint))}
                        onFocusCapture={() => handleKeyEventSelect(keyEvent.id, keyEvent.eventType, parseFrameIndexInput(keyEvent.frameIndex) ?? parseFrameIndexFromHint(keyEvent.frameHint))}
                      >
                        <div className="form-grid">
                          <div className="chip-row" style={{ gridColumn: "1 / -1" }}>
                            <span className="soft-chip">Origen: {formatBiomechanicsEventSourceLabel(keyEvent.source)}</span>
                            {keyEvent.confidence ? <span className="soft-chip">Confianza: {(Number(keyEvent.confidence) * 100).toFixed(0)}%</span> : null}
                            {keyEvent.detector ? <span className="soft-chip">Detector: {keyEvent.detector}</span> : null}
                          </div>
                          <label>
                            Nombre del evento
                            <input
                              value={keyEvent.label}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    keyEvents: current.biomechanics.keyEvents.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, label: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="ej. Despegue principal"
                            />
                          </label>
                          <label>
                            Tipo de evento
                            <select
                              value={keyEvent.eventType}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    keyEvents: current.biomechanics.keyEvents.map((entry, entryIndex) =>
                                      entryIndex === index
                                        ? {
                                            ...entry,
                                            eventType: event.target.value as TechniqueBiomechanicsEventType,
                                            source: getManualOverrideSource(entry.source),
                                          }
                                        : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {biomechanicsEventTypeOptions.map((option) => (
                                <option key={option} value={option}>{formatBiomechanicsEventLabel(option)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Frame índice
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={keyEvent.frameIndex}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    keyEvents: current.biomechanics.keyEvents.map((entry, entryIndex) => {
                                      if (entryIndex !== index) {
                                        return entry;
                                      }

                                      const parsedFrameIndex = parseFrameIndexInput(event.target.value);
                                      return {
                                        ...entry,
                                        frameIndex: event.target.value,
                                        frameHint: parsedFrameIndex !== null
                                          ? buildFrameHintFromLandmarks(selectedTechnique?.proLandmarks, parsedFrameIndex)
                                          : entry.frameHint,
                                        source: getManualOverrideSource(entry.source),
                                      };
                                    }),
                                  },
                                }))
                              }
                              placeholder="ej. 12"
                            />
                          </label>
                          <label>
                            Pista temporal
                            <input
                              value={keyEvent.frameHint}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    keyEvents: current.biomechanics.keyEvents.map((entry, entryIndex) =>
                                      entryIndex === index
                                        ? { ...entry, frameHint: event.target.value, source: getManualOverrideSource(entry.source) }
                                        : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="ej. último frame antes de perder contacto"
                            />
                          </label>
                          <label>
                            Notas
                            <textarea
                              value={keyEvent.notes}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    keyEvents: current.biomechanics.keyEvents.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              rows={3}
                              placeholder="Qué debe detectarse o compararse en este momento."
                            />
                          </label>
                        </div>
                        <div className="chip-row">
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              setTemplateTechniqueForm((current) => ({
                                ...current,
                                biomechanics: {
                                  ...current.biomechanics,
                                  keyEvents: current.biomechanics.keyEvents.filter((_, entryIndex) => entryIndex !== index),
                                },
                              }))
                            }
                          >
                            Eliminar evento
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="helper-text">Declara las fases o frames clave que usarás después en la comparación.</p>
                  )}
                </div>

                <div className="detail-card program-card biomechanics-card">
                  <div className="section-header compact-header">
                    <div>
                      <p className="eyebrow">Trayectorias clave</p>
                      <h3>Ventanas entre eventos</h3>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        setTemplateTechniqueForm((current) => ({
                          ...current,
                          biomechanics: {
                            ...current.biomechanics,
                            trajectoryChecks: [
                              ...current.biomechanics.trajectoryChecks,
                              {
                                id: createDraftId(),
                                label: "",
                                landmark: "RIGHT_HIP",
                                windowStartEventId: "",
                                windowEndEventId: "",
                                metric: "STABILITY",
                                axis: "Y",
                                referenceMode: "DELTA_FROM_START",
                                targetMin: "",
                                targetMax: "",
                                notes: "",
                              },
                            ],
                          },
                        }))
                      }
                    >
                      + Trayectoria
                    </button>
                  </div>
                  {templateTechniqueForm.biomechanics.trajectoryChecks.length ? (
                    templateTechniqueForm.biomechanics.trajectoryChecks.map((trajectoryCheck, index) => (
                      <article
                        key={trajectoryCheck.id}
                        className={`detail-card program-card${selectedTrajectoryCheckId === trajectoryCheck.id ? " highlight-card" : ""}`}
                        onClick={() => handleTrajectoryCheckSelect(trajectoryCheck.id)}
                        onFocusCapture={() => handleTrajectoryCheckSelect(trajectoryCheck.id)}
                      >
                        <div className="form-grid-3">
                          <label>
                            Nombre de la trayectoria
                            <input
                              value={trajectoryCheck.label}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    trajectoryChecks: current.biomechanics.trajectoryChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, label: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="ej. Cadera entre penúltimo apoyo y despegue"
                            />
                          </label>
                          <label>
                            Landmark
                            <select
                              value={trajectoryCheck.landmark}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    trajectoryChecks: current.biomechanics.trajectoryChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, landmark: event.target.value as LandmarkName } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {poseLandmarkOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Inicio de ventana
                            <select
                              value={trajectoryCheck.windowStartEventId}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    trajectoryChecks: current.biomechanics.trajectoryChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, windowStartEventId: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Selecciona evento inicial</option>
                              {biomechanicsEventReferenceOptions.map((event) => (
                                <option key={event.id} value={event.id}>{event.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Fin de ventana
                            <select
                              value={trajectoryCheck.windowEndEventId}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    trajectoryChecks: current.biomechanics.trajectoryChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, windowEndEventId: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">Selecciona evento final</option>
                              {biomechanicsEventReferenceOptions.map((event) => (
                                <option key={event.id} value={event.id}>{event.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Métrica
                            <select
                              value={trajectoryCheck.metric}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    trajectoryChecks: current.biomechanics.trajectoryChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, metric: event.target.value as TechniqueBiomechanicsTrajectoryMetric } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {biomechanicsTrajectoryMetricOptions.map((option) => (
                                <option key={option} value={option}>{formatTrajectoryMetricLabel(option)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Eje
                            <select
                              value={trajectoryCheck.axis}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    trajectoryChecks: current.biomechanics.trajectoryChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, axis: event.target.value as TechniqueBiomechanicsTrajectoryAxis } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {biomechanicsTrajectoryAxisOptions.map((option) => (
                                <option key={option} value={option}>{formatTrajectoryAxisLabel(option)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Referencia
                            <select
                              value={trajectoryCheck.referenceMode}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    trajectoryChecks: current.biomechanics.trajectoryChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, referenceMode: event.target.value as TechniqueBiomechanicsTrajectoryReferenceMode } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {biomechanicsTrajectoryReferenceModeOptions.map((option) => (
                                <option key={option} value={option}>{formatTrajectoryReferenceModeLabel(option)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Mínimo objetivo
                            <input
                              type="number"
                              value={trajectoryCheck.targetMin}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    trajectoryChecks: current.biomechanics.trajectoryChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, targetMin: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="0"
                            />
                          </label>
                          <label>
                            Máximo objetivo
                            <input
                              type="number"
                              value={trajectoryCheck.targetMax}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    trajectoryChecks: current.biomechanics.trajectoryChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, targetMax: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="0"
                            />
                          </label>
                          <label className="wide-field">
                            Notas
                            <textarea
                              value={trajectoryCheck.notes}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    trajectoryChecks: current.biomechanics.trajectoryChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              rows={3}
                              placeholder="ej. Mantener línea de cadera estable antes del despegue"
                            />
                          </label>
                        </div>
                        <div className="chip-row">
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              setTemplateTechniqueForm((current) => ({
                                ...current,
                                biomechanics: {
                                  ...current.biomechanics,
                                  trajectoryChecks: current.biomechanics.trajectoryChecks.filter((_, entryIndex) => entryIndex !== index),
                                },
                              }))
                            }
                          >
                            Eliminar trayectoria
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="helper-text">Define trayectorias comparables como la cadera desde penúltimo apoyo hasta despegue.</p>
                  )}
                </div>

                <div className="detail-card program-card biomechanics-card">
                  <div className="section-header compact-header">
                    <div>
                      <p className="eyebrow">Orientación</p>
                      <h3>Normalización futura</h3>
                    </div>
                  </div>
                  <div className="form-grid">
                    <label>
                      Dirección preferida del recorrido
                      <select
                        value={templateTechniqueForm.biomechanics.orientationPolicy.preferredTravelDirection}
                        onChange={(event) =>
                          setTemplateTechniqueForm((current) => ({
                            ...current,
                            biomechanics: {
                              ...current.biomechanics,
                              orientationPolicy: {
                                ...current.biomechanics.orientationPolicy,
                                preferredTravelDirection: event.target.value as TechniqueBiomechanicsPreferredDirection,
                              },
                            },
                          }))
                        }
                      >
                        {biomechanicsPreferredDirectionOptions.map((option) => (
                          <option key={option} value={option}>{formatPreferredDirectionLabel(option)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Modo de normalización
                      <select
                        value={templateTechniqueForm.biomechanics.orientationPolicy.normalizationMode}
                        onChange={(event) =>
                          setTemplateTechniqueForm((current) => ({
                            ...current,
                            biomechanics: {
                              ...current.biomechanics,
                              orientationPolicy: {
                                ...current.biomechanics.orientationPolicy,
                                normalizationMode: event.target.value as TechniqueBiomechanicsNormalizationMode,
                              },
                            },
                          }))
                        }
                      >
                        {biomechanicsNormalizationModeOptions.map((option) => (
                          <option key={option} value={option}>{formatNormalizationModeLabel(option)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={templateTechniqueForm.biomechanics.orientationPolicy.allowMirror}
                        onChange={(event) =>
                          setTemplateTechniqueForm((current) => ({
                            ...current,
                            biomechanics: {
                              ...current.biomechanics,
                              orientationPolicy: {
                                ...current.biomechanics.orientationPolicy,
                                allowMirror: event.target.checked,
                              },
                            },
                          }))
                        }
                      />
                      Permitir espejo izquierda/derecha
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={templateTechniqueForm.biomechanics.orientationPolicy.manualOverrideAllowed}
                        onChange={(event) =>
                          setTemplateTechniqueForm((current) => ({
                            ...current,
                            biomechanics: {
                              ...current.biomechanics,
                              orientationPolicy: {
                                ...current.biomechanics.orientationPolicy,
                                manualOverrideAllowed: event.target.checked,
                              },
                            },
                          }))
                        }
                      />
                      Permitir override manual al atleta
                    </label>
                  </div>
                  <p className="helper-text">Esta política todavía no ejecuta el espejo ni la rotación en APK, pero deja definido el comportamiento esperado en el JSON canónico.</p>
                </div>

                <div className="detail-card program-card biomechanics-card">
                  <div className="section-header compact-header">
                    <div>
                      <p className="eyebrow">Descenso progresivo</p>
                      <h3>Cadera respecto al suelo</h3>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        setTemplateTechniqueForm((current) => ({
                          ...current,
                          biomechanics: {
                            ...current.biomechanics,
                            hipProgressionChecks: [
                              ...current.biomechanics.hipProgressionChecks,
                              createDefaultHipProgressionCheckDraft(),
                            ],
                          },
                        }))
                      }
                    >
                      + Progresión de cadera
                    </button>
                  </div>
                  {templateTechniqueForm.biomechanics.hipProgressionChecks.length ? (
                    templateTechniqueForm.biomechanics.hipProgressionChecks.map((progressionCheck, index) => (
                      <article key={progressionCheck.id} className="detail-card program-card biomechanics-subcard">
                        <div className="form-grid-3">
                          <label>
                            Nombre del check
                            <input
                              value={progressionCheck.label}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    hipProgressionChecks: current.biomechanics.hipProgressionChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, label: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              placeholder="ej. Descenso progresivo setup → último apoyo"
                            />
                          </label>
                          <label>
                            Landmark derivado
                            <select
                              value={progressionCheck.derivedLandmark}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    hipProgressionChecks: current.biomechanics.hipProgressionChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, derivedLandmark: event.target.value as TechniqueBiomechanicsDerivedLandmark } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {biomechanicsDerivedLandmarkOptions.map((option) => (
                                <option key={option} value={option}>{option === "HIP_CENTER" ? "Centro de cadera" : option}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Referencia al suelo
                            <select
                              value={progressionCheck.groundReferenceMode}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    hipProgressionChecks: current.biomechanics.hipProgressionChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, groundReferenceMode: event.target.value as TechniqueBiomechanicsGroundReferenceMode } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {biomechanicsGroundReferenceModeOptions.map((option) => (
                                <option key={option} value={option}>{option === "LOWEST_FOOT" ? "Pie más bajo detectado" : option}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Normalización
                            <select
                              value={progressionCheck.normalizationMode}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    hipProgressionChecks: current.biomechanics.hipProgressionChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, normalizationMode: event.target.value as TechniqueBiomechanicsProgressionNormalizationMode } : entry,
                                    ),
                                  },
                                }))
                              }
                            >
                              {biomechanicsProgressionNormalizationModeOptions.map((option) => (
                                <option key={option} value={option}>{option === "PERCENT_OF_TOTAL_DROP" ? "% del descenso total" : option}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Eje observado
                            <input value={progressionCheck.axis} disabled />
                          </label>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={progressionCheck.requireMonotonic}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    hipProgressionChecks: current.biomechanics.hipProgressionChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, requireMonotonic: event.target.checked } : entry,
                                    ),
                                  },
                                }))
                              }
                            />
                            Exigir descenso monotónico entre eventos
                          </label>
                          <label style={{ gridColumn: "1 / -1" }}>
                            Notas
                            <textarea
                              value={progressionCheck.notes}
                              onChange={(event) =>
                                setTemplateTechniqueForm((current) => ({
                                  ...current,
                                  biomechanics: {
                                    ...current.biomechanics,
                                    hipProgressionChecks: current.biomechanics.hipProgressionChecks.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                                    ),
                                  },
                                }))
                              }
                              rows={3}
                              placeholder="ej. El atleta no puede perder casi todo el descenso en un solo apoyo; debe repartirlo entre antepenúltimo, penúltimo y último apoyo."
                            />
                          </label>
                        </div>

                        <div className="detail-card program-card biomechanics-subcard">
                          <div>
                            <p className="eyebrow">Corredores acumulados</p>
                            <p className="helper-text">Cada evento expresa cuánto del descenso total setup → último apoyo debería haberse consumido hasta ese punto.</p>
                          </div>
                          <div className="biomechanics-progression-grid">
                            {progressionCheck.steps.map((step, stepIndex) => (
                              <div key={`${progressionCheck.id}-${stepIndex}`} className="biomechanics-step-row">
                                <label>
                                  Evento
                                  <select
                                    value={step.eventType}
                                    onChange={(event) =>
                                      setTemplateTechniqueForm((current) => ({
                                        ...current,
                                        biomechanics: {
                                          ...current.biomechanics,
                                          hipProgressionChecks: current.biomechanics.hipProgressionChecks.map((entry, entryIndex) =>
                                            entryIndex === index
                                              ? {
                                                ...entry,
                                                steps: entry.steps.map((currentStep, currentStepIndex) =>
                                                  currentStepIndex === stepIndex
                                                    ? { ...currentStep, eventType: event.target.value as TechniqueBiomechanicsEventType }
                                                    : currentStep,
                                                ),
                                              }
                                              : entry,
                                          ),
                                        },
                                      }))
                                    }
                                  >
                                    {biomechanicsEventTypeOptions.map((option) => (
                                      <option key={option} value={option}>{formatBiomechanicsEventLabel(option)}</option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Mínimo acumulado (%)
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={step.targetCumulativeDropMinPercent}
                                    onChange={(event) =>
                                      setTemplateTechniqueForm((current) => ({
                                        ...current,
                                        biomechanics: {
                                          ...current.biomechanics,
                                          hipProgressionChecks: current.biomechanics.hipProgressionChecks.map((entry, entryIndex) =>
                                            entryIndex === index
                                              ? {
                                                ...entry,
                                                steps: entry.steps.map((currentStep, currentStepIndex) =>
                                                  currentStepIndex === stepIndex
                                                    ? { ...currentStep, targetCumulativeDropMinPercent: event.target.value }
                                                    : currentStep,
                                                ),
                                              }
                                              : entry,
                                          ),
                                        },
                                      }))
                                    }
                                    placeholder="15"
                                  />
                                </label>
                                <label>
                                  Máximo acumulado (%)
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={step.targetCumulativeDropMaxPercent}
                                    onChange={(event) =>
                                      setTemplateTechniqueForm((current) => ({
                                        ...current,
                                        biomechanics: {
                                          ...current.biomechanics,
                                          hipProgressionChecks: current.biomechanics.hipProgressionChecks.map((entry, entryIndex) =>
                                            entryIndex === index
                                              ? {
                                                ...entry,
                                                steps: entry.steps.map((currentStep, currentStepIndex) =>
                                                  currentStepIndex === stepIndex
                                                    ? { ...currentStep, targetCumulativeDropMaxPercent: event.target.value }
                                                    : currentStep,
                                                ),
                                              }
                                              : entry,
                                          ),
                                        },
                                      }))
                                    }
                                    placeholder="45"
                                  />
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="chip-row">
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              setTemplateTechniqueForm((current) => ({
                                ...current,
                                biomechanics: {
                                  ...current.biomechanics,
                                  hipProgressionChecks: current.biomechanics.hipProgressionChecks.filter((_, entryIndex) => entryIndex !== index),
                                },
                              }))
                            }
                          >
                            Eliminar progresión
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="helper-text">Configura un check compuesto para exigir que la cadera descienda de forma progresiva entre setup, antepenúltimo, penúltimo y último apoyo.</p>
                  )}
                </div>

                <div className="detail-card program-card biomechanics-card">
                  <div className="section-header compact-header">
                    <div>
                      <p className="eyebrow">Altura del salto</p>
                      <h3>Medición dual y consenso</h3>
                    </div>
                  </div>
                  <div className="form-grid-3">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={templateTechniqueForm.biomechanics.jumpHeightMeasurement.enabled}
                        onChange={(event) =>
                          setTemplateTechniqueForm((current) => ({
                            ...current,
                            biomechanics: {
                              ...current.biomechanics,
                              jumpHeightMeasurement: {
                                ...current.biomechanics.jumpHeightMeasurement,
                                enabled: event.target.checked,
                              },
                            },
                          }))
                        }
                      />
                      Activar medición automática de la altura del salto
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={templateTechniqueForm.biomechanics.jumpHeightMeasurement.flightTimeMethodEnabled}
                        onChange={(event) =>
                          setTemplateTechniqueForm((current) => ({
                            ...current,
                            biomechanics: {
                              ...current.biomechanics,
                              jumpHeightMeasurement: {
                                ...current.biomechanics.jumpHeightMeasurement,
                                flightTimeMethodEnabled: event.target.checked,
                              },
                            },
                          }))
                        }
                      />
                      Método por tiempo de vuelo
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={templateTechniqueForm.biomechanics.jumpHeightMeasurement.centerOfMassMethodEnabled}
                        onChange={(event) =>
                          setTemplateTechniqueForm((current) => ({
                            ...current,
                            biomechanics: {
                              ...current.biomechanics,
                              jumpHeightMeasurement: {
                                ...current.biomechanics.jumpHeightMeasurement,
                                centerOfMassMethodEnabled: event.target.checked,
                              },
                            },
                          }))
                        }
                      />
                      Método por Centro de Masas
                    </label>
                    <label>
                      Altura del sujeto (cm, para escalar CM)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={templateTechniqueForm.biomechanics.jumpHeightMeasurement.subjectHeightCm}
                        onChange={(event) =>
                          setTemplateTechniqueForm((current) => ({
                            ...current,
                            biomechanics: {
                              ...current.biomechanics,
                              jumpHeightMeasurement: {
                                ...current.biomechanics.jumpHeightMeasurement,
                                subjectHeightCm: event.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="185"
                      />
                    </label>
                    <label>
                      Playback speed ratio
                      <input
                        type="number"
                        min="0.01"
                        max="1"
                        step="0.01"
                        value={templateTechniqueForm.biomechanics.jumpHeightMeasurement.playbackSpeedRatio}
                        onChange={(event) =>
                          setTemplateTechniqueForm((current) => ({
                            ...current,
                            biomechanics: {
                              ...current.biomechanics,
                              jumpHeightMeasurement: {
                                ...current.biomechanics.jumpHeightMeasurement,
                                playbackSpeedRatio: event.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="0.50"
                      />
                    </label>
                    <label>
                      Tolerancia entre métodos (cm)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={templateTechniqueForm.biomechanics.jumpHeightMeasurement.consensusToleranceCm}
                        onChange={(event) =>
                          setTemplateTechniqueForm((current) => ({
                            ...current,
                            biomechanics: {
                              ...current.biomechanics,
                              jumpHeightMeasurement: {
                                ...current.biomechanics.jumpHeightMeasurement,
                                consensusToleranceCm: event.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="6"
                      />
                    </label>
                    <label>
                      Perfil actual del video
                      <input value={formatReferenceMotionProfile(templateTechniqueForm.biomechanics.referenceMotionProfile)} disabled />
                    </label>
                    <label style={{ gridColumn: "1 / -1" }}>
                      Notas
                      <textarea
                        value={templateTechniqueForm.biomechanics.jumpHeightMeasurement.notes}
                        onChange={(event) =>
                          setTemplateTechniqueForm((current) => ({
                            ...current,
                            biomechanics: {
                              ...current.biomechanics,
                              jumpHeightMeasurement: {
                                ...current.biomechanics.jumpHeightMeasurement,
                                notes: event.target.value,
                              },
                            },
                          }))
                        }
                        rows={3}
                        placeholder="ej. Si el video es slow motion, dejar playbackSpeedRatio vacío para que se prueben 0.5 y 0.25 contra la medición de centro de masas."
                      />
                    </label>
                  </div>
                  <p className="helper-text">Cuando el perfil del video sea `SLOW_MOTION`, el método por tiempo de vuelo puede usar `playbackSpeedRatio` explícito o inferirlo probando `0.5` y `0.25` contra el Centro de Masas relativo al suelo. Ese segundo método toma el CM aproximado en `SETUP` y en `APEX`, ambos respecto al suelo, y usa la altura del sujeto solo para escalar el resultado a centímetros.</p>
                </div>

                <div className="detail-card program-card biomechanics-card">
                  <div className="section-header compact-header">
                    <div>
                      <p className="eyebrow">Preview referencia</p>
                      <h3>Resultados sobre la técnica profesional</h3>
                    </div>
                  </div>
                  {!selectedTechnique?.proLandmarks ? (
                    <p className="helper-text">Procesa primero la referencia profesional para calcular el descenso progresivo de cadera y la altura del salto sobre el video base.</p>
                  ) : (
                    <div className="biomechanics-preview-grid">
                      {referenceBiomechanicsPreview.hipProgressionChecks.map((check) => (
                        <article key={check.checkId} className="detail-card program-card biomechanics-preview-card">
                          <div className="biomechanics-preview-badge-row">
                            <strong>{check.label}</strong>
                            <span className="biomechanics-badge biomechanics-preview-status">{formatMeasurementStatusLabel(check.status)}</span>
                            {typeof check.totalDropValue === "number" ? (
                              <span className="biomechanics-badge">Descenso total: {check.totalDropValue.toFixed(3)}</span>
                            ) : null}
                            {typeof check.monotonic === "boolean" ? (
                              <span className="biomechanics-badge">Monótona: {check.monotonic ? "sí" : "no"}</span>
                            ) : null}
                          </div>
                          <div className="biomechanics-debug-list">
                            {check.steps.map((step) => (
                              <p key={`${check.checkId}-${step.eventType}`}>
                                <strong>{formatBiomechanicsEventLabel(step.eventType as TechniqueBiomechanicsEventType)}:</strong>{" "}
                                {step.frameIndex !== null ? `frame ${step.frameIndex + 1}` : "sin frame"}
                                {typeof step.heightFromGround === "number" ? ` · altura relativa ${step.heightFromGround.toFixed(3)}` : ""}
                                {typeof step.cumulativeDropPercent === "number" ? ` · descenso ${step.cumulativeDropPercent.toFixed(1)}%` : ""}
                                {(typeof step.targetCumulativeDropMinPercent === "number" || typeof step.targetCumulativeDropMaxPercent === "number")
                                  ? ` · objetivo ${typeof step.targetCumulativeDropMinPercent === "number" ? step.targetCumulativeDropMinPercent : 0}-${typeof step.targetCumulativeDropMaxPercent === "number" ? step.targetCumulativeDropMaxPercent : 100}%`
                                  : ""}
                                {typeof step.withinTarget === "boolean" ? ` · ${step.withinTarget ? "dentro" : "fuera"}` : ""}
                              </p>
                            ))}
                          </div>
                          {check.notes ? <p className="helper-text">{check.notes}</p> : null}
                        </article>
                      ))}

                      {referenceBiomechanicsPreview.jumpHeight ? (
                        <article className="detail-card program-card biomechanics-preview-card">
                          <div className="biomechanics-preview-badge-row">
                            <strong>Altura del salto</strong>
                            <span className="biomechanics-badge biomechanics-preview-status">{formatMeasurementStatusLabel(referenceBiomechanicsPreview.jumpHeight.status)}</span>
                            {typeof referenceBiomechanicsPreview.jumpHeight.playbackSpeedRatio === "number" ? (
                              <span className="biomechanics-badge">Ratio temporal: {referenceBiomechanicsPreview.jumpHeight.playbackSpeedRatio.toFixed(2)}</span>
                            ) : null}
                            {typeof referenceBiomechanicsPreview.jumpHeight.consensusValueCm === "number" ? (
                              <span className="biomechanics-badge">Consenso: {referenceBiomechanicsPreview.jumpHeight.consensusValueCm.toFixed(1)} cm</span>
                            ) : null}
                            {typeof referenceBiomechanicsPreview.jumpHeight.disagreementCm === "number" ? (
                              <span className="biomechanics-badge">Diferencia: {referenceBiomechanicsPreview.jumpHeight.disagreementCm.toFixed(1)} cm</span>
                            ) : null}
                          </div>
                          <div className="biomechanics-debug-list">
                            {referenceBiomechanicsPreview.jumpHeight.methods.length ? referenceBiomechanicsPreview.jumpHeight.methods.map((method) => (
                              <p key={method.method}>
                                <strong>{method.method === "FLIGHT_TIME" ? "Tiempo de vuelo" : "Centro de Masas"}:</strong>{" "}
                                {formatMeasurementStatusLabel(method.status)}
                                {typeof method.valueCm === "number" ? ` · ${method.valueCm.toFixed(1)} cm` : ""}
                                {typeof method.confidence === "number" ? ` · confianza ${method.confidence.toFixed(2)}` : ""}
                                {typeof method.playbackSpeedRatio === "number" ? ` · ratio ${method.playbackSpeedRatio.toFixed(2)}` : ""}
                              </p>
                            )) : <p>No hay métodos activos para esta medición.</p>}
                          </div>
                          {referenceBiomechanicsPreview.jumpHeight.notes ? <p className="helper-text">{referenceBiomechanicsPreview.jumpHeight.notes}</p> : null}
                          {referenceBiomechanicsPreview.jumpHeight.methods.some((method) => method.notes) ? (
                            <div className="biomechanics-debug-list">
                              {referenceBiomechanicsPreview.jumpHeight.methods.map((method) => (
                                method.notes ? <p key={`${method.method}-note`}>{method.notes}</p> : null
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ) : null}

                      {referenceBiomechanicsPreview.stepDistances ? (
                        <article className="detail-card program-card biomechanics-preview-card">
                          <div className="biomechanics-preview-badge-row">
                            <strong>Distancias de pasos de aproximación</strong>
                            {!referenceBiomechanicsPreview.stepDistances.calibrated ? (
                              <span className="biomechanics-badge biomechanics-preview-status">Sin calibrar</span>
                            ) : null}
                          </div>
                          <div className="biomechanics-debug-list">
                            {referenceBiomechanicsPreview.stepDistances.prePenultimateFlightDistanceCm !== null ? (
                              <p>
                                <strong>Antepenúltimo → Penúltimo:</strong>{" "}
                                {referenceBiomechanicsPreview.stepDistances.prePenultimateFlightDistanceCm.toFixed(1)} cm
                                {referenceBiomechanicsPreview.stepDistances.prePenultimateFlightDistanceCm < 200
                                  ? " ⚠️ (recomendado &gt; 200 cm)"
                                  : " ✓"}
                              </p>
                            ) : (
                              <p>Antepenúltimo → Penúltimo: sin datos (se necesitan ambos eventos)</p>
                            )}
                            {referenceBiomechanicsPreview.stepDistances.lastStepDistanceCm !== null ? (
                              <p>
                                <strong>Penúltimo → Último apoyo:</strong>{" "}
                                {referenceBiomechanicsPreview.stepDistances.lastStepDistanceCm.toFixed(1)} cm
                                {referenceBiomechanicsPreview.stepDistances.lastStepDistanceCm > 50
                                  ? " ⚠️ (recomendado &lt; 50 cm)"
                                  : " ✓"}
                              </p>
                            ) : (
                              <p>Penúltimo → Último apoyo: sin datos (se necesitan ambos eventos)</p>
                            )}
                          </div>
                          {referenceBiomechanicsPreview.stepDistances.notes ? (
                            <p className="helper-text">{referenceBiomechanicsPreview.stepDistances.notes}</p>
                          ) : null}
                        </article>
                      ) : null}
                    </div>
                  )}
                </div>

                <label>
                  Nota global para el análisis
                  <textarea
                    value={templateTechniqueForm.biomechanics.coachNotes}
                    onChange={(event) =>
                      setTemplateTechniqueForm((current) => ({
                        ...current,
                        biomechanics: {
                          ...current.biomechanics,
                          coachNotes: event.target.value,
                        },
                      }))
                    }
                    rows={4}
                    placeholder="Resume qué debe priorizar el análisis biomecánico en esta técnica."
                  />
                </label>

                <div className="technique-save-bar bottom-save-bar">
                  <div>
                    <strong>Guardar antes de salir</strong>
                    <p>Esta acción persiste `biomechanicsConfig` completo, incluyendo point checks, ángulos, eventos y notas.</p>
                  </div>
                  <div className="chip-row technique-save-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={loading || !templateTechniqueForm.title.trim()}
                      onClick={() => void handleTechniqueSave()}
                    >
                      Guardar técnica
                    </button>
                  </div>
                </div>
              </div>

              <div className="program-list">
                {selectedTemplateTechniqueMediaAssets.length ? (
                  selectedTemplateTechniqueMediaAssets.map((asset) => {
                    const assetUrl = normalizeMediaUrl(asset.url);

                    return (
                      <article key={asset.id} className="detail-card program-card">
                        <strong>{asset.title || "Recurso de técnica"}</strong>
                        <span>{asset.kind}{asset.isPrimary ? " · principal" : ""}</span>
                        {assetUrl ? (
                          asset.kind === "VIDEO" ? (
                            <video controls preload="metadata" style={{ width: "100%", borderRadius: 16, marginTop: 12 }} src={assetUrl} />
                          ) : (
                            <img src={assetUrl} alt={asset.title || "Recurso de tecnica"} style={{ width: "100%", borderRadius: 16, marginTop: 12 }} />
                          )
                        ) : null}
                        <div className="chip-row">
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => void handleTechniqueMediaDelete(asset.id)}
                            disabled={loading}
                          >
                            Eliminar
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="helper-text">Todavia no hay recursos de técnica cargados para este programa.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="helper-text section-spacer">Selecciona un programa para empezar a cargar texto y archivos técnicos.</p>
          )}
        </article>
      </section>
      ) : null}

        </div>
      </div>
    </div>
  );
}

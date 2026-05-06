import {
  detectTechniqueKeyEventsWithDebug,
  type AutoDetectedTechniqueDebugData,
  type AutoDetectedTechniqueKeyEvent,
} from "../../../web/src/biomechanicsEventDetection";
import {
  buildReferenceBiomechanicsMeasurementsPreview,
  type ReferenceBiomechanicsMeasurementsPreview,
} from "../../../web/src/biomechanicsReferenceMeasurements";
import type { TechniqueProLandmarks } from "../../../web/src/techniquePoseExtraction";

export type MobileTechniqueReferenceMotionProfile = "REAL_TIME" | "SLOW_MOTION";

type MobileTechniqueBiomechanicsAngleSampleMode = "AT_EVENT" | "WINDOW_MIN" | "WINDOW_MAX" | "WINDOW_AVERAGE";

const poseLandmarkNames = [
  "NOSE",
  "LEFT_EYE_INNER",
  "LEFT_EYE",
  "LEFT_EYE_OUTER",
  "RIGHT_EYE_INNER",
  "RIGHT_EYE",
  "RIGHT_EYE_OUTER",
  "LEFT_EAR",
  "RIGHT_EAR",
  "MOUTH_LEFT",
  "MOUTH_RIGHT",
  "LEFT_SHOULDER",
  "RIGHT_SHOULDER",
  "LEFT_ELBOW",
  "RIGHT_ELBOW",
  "LEFT_WRIST",
  "RIGHT_WRIST",
  "LEFT_PINKY",
  "RIGHT_PINKY",
  "LEFT_INDEX",
  "RIGHT_INDEX",
  "LEFT_THUMB",
  "RIGHT_THUMB",
  "LEFT_HIP",
  "RIGHT_HIP",
  "LEFT_KNEE",
  "RIGHT_KNEE",
  "LEFT_ANKLE",
  "RIGHT_ANKLE",
  "LEFT_HEEL",
  "RIGHT_HEEL",
  "LEFT_FOOT_INDEX",
  "RIGHT_FOOT_INDEX",
] as const;

type MobileTechniqueLandmarkName = (typeof poseLandmarkNames)[number];

const landmarkIndexByName = Object.fromEntries(
  poseLandmarkNames.map((name, index) => [name, index]),
) as Record<MobileTechniqueLandmarkName, number>;

export interface MobileTechniqueBiomechanicsJumpHeightMeasurementConfig {
  enabled: boolean;
  subjectHeightCm: number | null;
  playbackSpeedRatio: number | null;
  flightTimeMethodEnabled: boolean;
  centerOfMassMethodEnabled?: boolean | null;
  consensusToleranceCm: number | null;
  notes?: string | null;
  heelRiseMethodEnabled?: boolean | null;
  geometricHipRiseMethodEnabled?: boolean | null;
}

export interface MobileTechniqueBiomechanicsHipProgressionCheck {
  id: string;
  label: string;
  requireMonotonic: boolean;
  steps: Array<{
    eventType: string;
    targetCumulativeDropMinPercent: number | null;
    targetCumulativeDropMaxPercent: number | null;
  }>;
  notes?: string | null;
}

export interface MobileTechniqueBiomechanicsAngleCheck {
  id: string;
  label: string;
  pointA: string;
  vertex: string;
  pointC: string;
  anchorEventId?: string | null;
  anchorEventType?: string | null;
  sampleMode?: MobileTechniqueBiomechanicsAngleSampleMode | null;
  targetMinDeg?: number | null;
  targetMaxDeg?: number | null;
  phase?: string | null;
  notes?: string | null;
}

export interface MobileTechniqueBiomechanicsOrientationPolicy {
  allowMirror?: boolean | null;
}

/** Manual two-point annotation of the basketball rim by the athlete in their own video. */
export interface AthleteRimAnnotation {
  frameIndex: number;
  xLeft: number;
  yLeft: number;
  xRight: number;
  yRight: number;
  annotatedAt: string;
}

/** Result returned by the server /biomechanics/analyze endpoint. */
export interface ServerBiomechanicsResult {
  masterReference: {
    schemaVersion: 2;
    jumpHeight: {
      consensusValueCm: number | null;
      disagreementCm: number | null;
      status: string;
      notes: string | null;
      methods: Array<{ method: string; status: string; valueCm: number | null }>;
    };
    kinematics: {
      parabola: Array<{ frameIndex: number; timestampMs: number; comHeightCm: number }>;
      jointAngles: {
        dip: { leftKneeDeg: number | null; rightKneeDeg: number | null; leftHipDeg: number | null; rightHipDeg: number | null } | null;
        takeoff: { leftKneeDeg: number | null; rightKneeDeg: number | null; leftHipDeg: number | null; rightHipDeg: number | null } | null;
        apex: { leftKneeDeg: number | null; rightKneeDeg: number | null; leftHipDeg: number | null; rightHipDeg: number | null } | null;
      };
    };
    computedAt: string;
  };
}

export interface MobileTechniqueBiomechanicsConfig {
  referenceMotionProfile?: MobileTechniqueReferenceMotionProfile | null;
  hipProgressionChecks?: MobileTechniqueBiomechanicsHipProgressionCheck[];
  jumpHeightMeasurement?: MobileTechniqueBiomechanicsJumpHeightMeasurementConfig | null;
  keyEvents?: Array<{ id?: string | null; eventType: string; label?: string | null; frameIndex?: number | null }>;
  angleChecks?: MobileTechniqueBiomechanicsAngleCheck[];
  orientationPolicy?: MobileTechniqueBiomechanicsOrientationPolicy | null;
  /** Persisted from admin: reference rim annotation for calibration comparison */
  rimAnnotation?: AthleteRimAnnotation | null;
  /** Persisted from admin: reference masterReference for benchmark values */
  masterReference?: ServerBiomechanicsResult["masterReference"] | null;
}

/**
 * Call the server biomechanics/analyze endpoint with the athlete's landmarks and rim annotation.
 * Returns the masterReference object or throws on error.
 */
export async function callBiomechanicsAnalyze(input: {
  apiBaseUrl: string;
  accessToken: string;
  templateCode: string;
  techniqueId: string;
  landmarks: TechniqueProLandmarks;
  rimAnnotation: AthleteRimAnnotation | null;
  config: MobileTechniqueBiomechanicsConfig | null | undefined;
}): Promise<ServerBiomechanicsResult> {
  const { apiBaseUrl, accessToken, templateCode, techniqueId, landmarks, rimAnnotation, config } = input;
  const jh = config?.jumpHeightMeasurement;
  const resp = await fetch(
    `${apiBaseUrl}/api/v1/athlete/program-templates/${encodeURIComponent(templateCode)}/techniques/${encodeURIComponent(techniqueId)}/biomechanics/analyze`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        landmarks,
        rimAnnotation: rimAnnotation ?? null,
        keyEvents: config?.keyEvents ?? [],
        config: {
          enabled: jh?.enabled ?? true,
          subjectHeightCm: jh?.subjectHeightCm ?? null,
          playbackSpeedRatio: jh?.playbackSpeedRatio ?? null,
          flightTimeMethodEnabled: jh?.flightTimeMethodEnabled ?? true,
          centerOfMassMethodEnabled: jh?.centerOfMassMethodEnabled ?? true,
          consensusToleranceCm: jh?.consensusToleranceCm ?? null,
        },
        persistResult: false,
      }),
    },
  );
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(data.message ?? data.error ?? `Error ${resp.status}`);
  }
  return resp.json() as Promise<ServerBiomechanicsResult>;
}

export interface AthleteTechniqueAngleComparison {
  checkId: string;
  label: string;
  eventType: string;
  athleteFrameIndex: number;
  referenceFrameIndex: number;
  athleteAngleDeg: number;
  referenceAngleDeg: number;
  deltaDeg: number;
  /** Signed percentage deviation: (athlete - reference) / reference * 100 */
  deltaPercent: number;
  targetMinDeg: number | null;
  targetMaxDeg: number | null;
  withinTarget: boolean | null;
}

export interface AthleteTechniqueComparisonSummary {
  appliedOrientation: "NORMAL" | "MIRRORED";
  comparableChecks: number;
  averageDeltaDeg: number | null;
}

/**
 * Data needed to overlay a "ghost skeleton" of the reference technique
 * on top of the athlete's video, synchronised at a chosen key event.
 * The UI should align referenceFrameIndex from referenceLandmarks with
 * athleteFrameIndex from the analysis landmarks at the same event type.
 */
export interface AthleteGhostSkeletonEventFrame {
  eventType: string;
  athleteFrameIndex: number;
  referenceFrameIndex: number;
  referenceLandmarks: Array<{ x: number; y: number; z: number; visibility?: number }>;
}

export interface AthleteGhostSkeletonData {
  /** Primary sync point — typically TAKE_OFF or TOE_OFF. */
  primaryEventType: string | null;
  frames: AthleteGhostSkeletonEventFrame[];
}

export interface AthleteTechniqueAutoAnalysis {
  landmarks: TechniqueProLandmarks;
  detectedEvents: AutoDetectedTechniqueKeyEvent[];
  detectionDebug: AutoDetectedTechniqueDebugData;
  measurements: ReferenceBiomechanicsMeasurementsPreview;
  angleComparisons: AthleteTechniqueAngleComparison[];
  comparisonSummary: AthleteTechniqueComparisonSummary | null;
  ghostSkeleton: AthleteGhostSkeletonData | null;
  findings: string[];
  analysisJson: Record<string, unknown>;
}

function roundTo(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatEventLabel(eventType: string) {
  return eventType.replace(/_/g, " ").toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
}

function buildEventsByType(events: AutoDetectedTechniqueKeyEvent[]) {
  const eventsByType = new Map<string, AutoDetectedTechniqueKeyEvent>();

  for (const event of events) {
    if (!eventsByType.has(event.eventType)) {
      eventsByType.set(event.eventType, event);
    }
  }

  return eventsByType;
}

function buildReferenceEventsByType(
  config: MobileTechniqueBiomechanicsConfig | null | undefined,
  referenceLandmarks: TechniqueProLandmarks,
) {
  const configuredEvents = new Map<string, AutoDetectedTechniqueKeyEvent>();

  for (const event of config?.keyEvents ?? []) {
    if (!event.eventType || typeof event.frameIndex !== "number") {
      continue;
    }

    if (event.frameIndex < 0 || event.frameIndex >= referenceLandmarks.frames.length) {
      continue;
    }

    configuredEvents.set(event.eventType, {
      eventType: event.eventType as AutoDetectedTechniqueKeyEvent["eventType"],
      frameIndex: event.frameIndex,
      confidence: 1,
      detector: "HIP_FOOT_HEURISTIC_V1",
    });
  }

  if (!configuredEvents.size) {
    return buildEventsByType(detectTechniqueKeyEventsWithDebug(referenceLandmarks).events);
  }

  const detectedEvents = buildEventsByType(detectTechniqueKeyEventsWithDebug(referenceLandmarks).events);
  for (const [eventType, event] of detectedEvents.entries()) {
    if (!configuredEvents.has(eventType)) {
      configuredEvents.set(eventType, event);
    }
  }

  return configuredEvents;
}

function trimLandmarksToJumpWindow(
  landmarks: TechniqueProLandmarks,
  detectedEvents: AutoDetectedTechniqueKeyEvent[],
) {
  const setupEvent = detectedEvents.find((event) => event.eventType === "SETUP") ?? null;
  const landingEvent = detectedEvents.find((event) => event.eventType === "LANDING") ?? null;

  if (!landingEvent) {
    return landmarks;
  }

  const startIndex = Math.max((setupEvent?.frameIndex ?? 0) - 2, 0);
  const endIndex = Math.min(landingEvent.frameIndex + 2, landmarks.frames.length - 1);
  if (endIndex <= startIndex) {
    return landmarks;
  }

  const startTimestampMs = landmarks.frames[startIndex]?.timestampMs ?? 0;
  const frames = landmarks.frames.slice(startIndex, endIndex + 1).map((frame) => ({
    ...frame,
    timestampMs: Math.max(frame.timestampMs - startTimestampMs, 0),
  }));

  return {
    ...landmarks,
    frameCount: frames.length,
    durationMs: frames[frames.length - 1]?.timestampMs ?? 0,
    frames,
  };
}

function resolveAngleCheckEventType(
  check: MobileTechniqueBiomechanicsAngleCheck,
  config: MobileTechniqueBiomechanicsConfig | null | undefined,
) {
  const anchorEventType = check.anchorEventType?.trim();
  if (anchorEventType) {
    return anchorEventType;
  }

  const anchorEventId = check.anchorEventId?.trim();
  if (!anchorEventId) {
    return null;
  }

  return config?.keyEvents?.find((event) => event.id === anchorEventId)?.eventType?.trim() ?? null;
}

function mirrorLandmarkName(landmarkName: string) {
  if (landmarkName.startsWith("LEFT_")) {
    return `RIGHT_${landmarkName.slice(5)}`;
  }

  if (landmarkName.startsWith("RIGHT_")) {
    return `LEFT_${landmarkName.slice(6)}`;
  }

  if (landmarkName === "MOUTH_LEFT") {
    return "MOUTH_RIGHT";
  }

  if (landmarkName === "MOUTH_RIGHT") {
    return "MOUTH_LEFT";
  }

  return landmarkName;
}

function getLandmarkPoint(
  landmarks: TechniqueProLandmarks,
  frameIndex: number,
  landmarkName: string,
) {
  const pointIndex = landmarkIndexByName[landmarkName as MobileTechniqueLandmarkName];
  if (typeof pointIndex !== "number") {
    return null;
  }

  const landmark = landmarks.frames[frameIndex]?.landmarks[pointIndex];
  if (!landmark) {
    return null;
  }

  return landmark;
}

function measureAngleDegrees(
  pointA: { x: number; y: number } | null,
  vertex: { x: number; y: number } | null,
  pointC: { x: number; y: number } | null,
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

  return roundTo((Math.acos(cosine) * 180) / Math.PI, 1);
}

function getCheckAngleAtFrame(
  landmarks: TechniqueProLandmarks,
  frameIndex: number,
  check: MobileTechniqueBiomechanicsAngleCheck,
  mirrored: boolean,
) {
  const pointAName = mirrored ? mirrorLandmarkName(check.pointA) : check.pointA;
  const vertexName = mirrored ? mirrorLandmarkName(check.vertex) : check.vertex;
  const pointCName = mirrored ? mirrorLandmarkName(check.pointC) : check.pointC;

  return measureAngleDegrees(
    getLandmarkPoint(landmarks, frameIndex, pointAName),
    getLandmarkPoint(landmarks, frameIndex, vertexName),
    getLandmarkPoint(landmarks, frameIndex, pointCName),
  );
}

function getAverageAbsoluteDelta(comparisons: AthleteTechniqueAngleComparison[]) {
  if (!comparisons.length) {
    return null;
  }

  return roundTo(
    comparisons.reduce((total, comparison) => total + Math.abs(comparison.deltaDeg), 0) / comparisons.length,
    1,
  );
}

function buildAngleComparisonsForOrientation(input: {
  angleChecks: MobileTechniqueBiomechanicsAngleCheck[];
  config: MobileTechniqueBiomechanicsConfig | null | undefined;
  athleteLandmarks: TechniqueProLandmarks;
  athleteEventsByType: Map<string, AutoDetectedTechniqueKeyEvent>;
  referenceLandmarks: TechniqueProLandmarks;
  referenceEventsByType: Map<string, AutoDetectedTechniqueKeyEvent>;
  mirrored: boolean;
}) {
  const comparisons: AthleteTechniqueAngleComparison[] = [];

  for (const check of input.angleChecks) {
    if ((check.sampleMode ?? "AT_EVENT") !== "AT_EVENT") {
      continue;
    }

    const eventType = resolveAngleCheckEventType(check, input.config);
    if (!eventType) {
      continue;
    }

    const athleteEvent = input.athleteEventsByType.get(eventType);
    const referenceEvent = input.referenceEventsByType.get(eventType);
    if (!athleteEvent || !referenceEvent) {
      continue;
    }

    const athleteAngleDeg = getCheckAngleAtFrame(input.athleteLandmarks, athleteEvent.frameIndex, check, input.mirrored);
    const referenceAngleDeg = getCheckAngleAtFrame(input.referenceLandmarks, referenceEvent.frameIndex, check, false);
    if (typeof athleteAngleDeg !== "number" || typeof referenceAngleDeg !== "number") {
      continue;
    }

    const targetMinDeg = typeof check.targetMinDeg === "number"
      ? check.targetMinDeg
      : clampNumber(referenceAngleDeg - 10, 0, 180);
    const targetMaxDeg = typeof check.targetMaxDeg === "number"
      ? check.targetMaxDeg
      : clampNumber(referenceAngleDeg + 10, 0, 180);

    comparisons.push({
      checkId: check.id,
      label: check.label,
      eventType,
      athleteFrameIndex: athleteEvent.frameIndex,
      referenceFrameIndex: referenceEvent.frameIndex,
      athleteAngleDeg,
      referenceAngleDeg,
      deltaDeg: roundTo(athleteAngleDeg - referenceAngleDeg, 1),
      deltaPercent: referenceAngleDeg !== 0
        ? roundTo(((athleteAngleDeg - referenceAngleDeg) / referenceAngleDeg) * 100, 1)
        : 0,
      targetMinDeg,
      targetMaxDeg,
      withinTarget: athleteAngleDeg >= targetMinDeg && athleteAngleDeg <= targetMaxDeg,
    });
  }

  return comparisons;
}

function buildAngleComparisonResult(input: {
  biomechanicsConfig: MobileTechniqueBiomechanicsConfig | null | undefined;
  athleteLandmarks: TechniqueProLandmarks;
  athleteEvents: AutoDetectedTechniqueKeyEvent[];
  referenceLandmarks: TechniqueProLandmarks | null | undefined;
}) {
  const angleChecks = input.biomechanicsConfig?.angleChecks ?? [];
  if (!input.referenceLandmarks || !angleChecks.length) {
    return {
      comparisons: [] as AthleteTechniqueAngleComparison[],
      summary: null as AthleteTechniqueComparisonSummary | null,
    };
  }

  const athleteEventsByType = buildEventsByType(input.athleteEvents);
  const referenceEventsByType = buildReferenceEventsByType(input.biomechanicsConfig, input.referenceLandmarks);

  const normalComparisons = buildAngleComparisonsForOrientation({
    angleChecks,
    config: input.biomechanicsConfig,
    athleteLandmarks: input.athleteLandmarks,
    athleteEventsByType,
    referenceLandmarks: input.referenceLandmarks,
    referenceEventsByType,
    mirrored: false,
  });

  const allowMirror = input.biomechanicsConfig?.orientationPolicy?.allowMirror ?? true;
  const mirroredComparisons = allowMirror
    ? buildAngleComparisonsForOrientation({
      angleChecks,
      config: input.biomechanicsConfig,
      athleteLandmarks: input.athleteLandmarks,
      athleteEventsByType,
      referenceLandmarks: input.referenceLandmarks,
      referenceEventsByType,
      mirrored: true,
    })
    : [];

  const normalAverageDelta = getAverageAbsoluteDelta(normalComparisons);
  const mirroredAverageDelta = getAverageAbsoluteDelta(mirroredComparisons);
  const useMirrored = allowMirror
    && mirroredComparisons.length > 0
    && (
      mirroredComparisons.length > normalComparisons.length
      || (
        mirroredComparisons.length === normalComparisons.length
        && typeof mirroredAverageDelta === "number"
        && (typeof normalAverageDelta !== "number" || mirroredAverageDelta < normalAverageDelta)
      )
    );
  const comparisons = useMirrored ? mirroredComparisons : normalComparisons;

  return {
    comparisons,
    summary: {
      appliedOrientation: useMirrored ? "MIRRORED" : "NORMAL",
      comparableChecks: comparisons.length,
      averageDeltaDeg: getAverageAbsoluteDelta(comparisons),
    } satisfies AthleteTechniqueComparisonSummary,
  };
}

function normalizeJumpHeightConfig(
  config: MobileTechniqueBiomechanicsJumpHeightMeasurementConfig | null | undefined,
  athleteHeightCm: number | null,
) {
  if (!config) {
    return null;
  }

  return {
    enabled: config.enabled,
    subjectHeightCm: athleteHeightCm ?? config.subjectHeightCm ?? null,
    playbackSpeedRatio: 1,
    flightTimeMethodEnabled: config.flightTimeMethodEnabled ?? true,
    centerOfMassMethodEnabled:
      config.centerOfMassMethodEnabled
      ?? config.heelRiseMethodEnabled
      ?? config.geometricHipRiseMethodEnabled
      ?? true,
    consensusToleranceCm: config.consensusToleranceCm ?? 6,
    notes: config.notes ?? null,
  };
}

function buildExpectedEventSet(config: MobileTechniqueBiomechanicsConfig | null | undefined) {
  const expected = new Set<string>();

  for (const event of config?.keyEvents ?? []) {
    if (event.eventType) {
      expected.add(event.eventType);
    }
  }

  for (const check of config?.hipProgressionChecks ?? []) {
    for (const step of check.steps) {
      if (step.eventType) {
        expected.add(step.eventType);
      }
    }
  }

  const jumpHeightConfig = config?.jumpHeightMeasurement;
  if (jumpHeightConfig?.enabled) {
    expected.add("TOE_OFF");
    expected.add("APEX");
  }

  return expected;
}

function buildFindings(
  expectedEvents: Set<string>,
  detectedEvents: AutoDetectedTechniqueKeyEvent[],
  measurements: ReferenceBiomechanicsMeasurementsPreview,
  angleComparisons: AthleteTechniqueAngleComparison[],
  comparisonSummary: AthleteTechniqueComparisonSummary | null,
) {
  const findings: string[] = [];
  const detectedEventTypes = new Set(detectedEvents.map((event) => event.eventType));

  const missingEvents = Array.from(expectedEvents).filter((eventType) => !detectedEventTypes.has(eventType as AutoDetectedTechniqueKeyEvent["eventType"]));
  if (missingEvents.length) {
    findings.push(`Eventos no detectados: ${missingEvents.join(", ")}.`);
  }

  if (comparisonSummary?.comparableChecks) {
    findings.push(
      comparisonSummary.appliedOrientation === "MIRRORED"
        ? `La comparación automática se alineó con la pierna contraria en ${comparisonSummary.comparableChecks} chequeos angulares.`
        : `La comparación automática se alineó con la misma pierna en ${comparisonSummary.comparableChecks} chequeos angulares.`,
    );
  }

  for (const comparison of [...angleComparisons]
    .sort((left, right) => Math.abs(right.deltaDeg) - Math.abs(left.deltaDeg))
    .slice(0, 3)) {
    if (Math.abs(comparison.deltaDeg) < 6) {
      continue;
    }

    findings.push(
      `${comparison.label} en ${formatEventLabel(comparison.eventType)}: ${Math.abs(comparison.deltaDeg).toFixed(1)}° ${comparison.deltaDeg >= 0 ? "más abierto" : "más cerrado"} que la referencia.`,
    );
  }

  for (const check of measurements.hipProgressionChecks) {
    if (check.status === "OUT_OF_RANGE") {
      findings.push(`${check.label}: el descenso progresivo de cadera no cayó dentro de los corredores esperados.`);
    }

    if (check.status === "MISSING_EVENT" || check.status === "MISSING_LANDMARK") {
      findings.push(`${check.label}: faltan eventos o landmarks para validar el patrón de descenso.`);
    }
  }

  const jumpHeight = measurements.jumpHeight;
  if (jumpHeight?.status === "OK" && typeof jumpHeight.consensusValueCm === "number") {
    findings.push(`Altura de salto estimada: ${jumpHeight.consensusValueCm.toFixed(1)} cm.`);
  }

  if (jumpHeight?.status === "METHOD_DISAGREEMENT") {
    findings.push("El Centro de Masas y el tiempo de vuelo no llegaron a consenso; conviene revisar el video y los eventos detectados.");
  }

  if (jumpHeight?.status === "PENDING" || jumpHeight?.status === "INVALID_MOTION_PROFILE") {
    findings.push("La corroboración de altura todavía no es concluyente; revisa velocidad del video, eventos y calidad de pose.");
  }

  return findings;
}

export function analyzeAthleteTechniqueVideo(input: {
  landmarks: TechniqueProLandmarks;
  biomechanicsConfig: MobileTechniqueBiomechanicsConfig | null | undefined;
  athleteHeightCm: number | null;
  referenceLandmarks?: TechniqueProLandmarks | null;
}) : AthleteTechniqueAutoAnalysis {
  const athleteMotionProfile: MobileTechniqueReferenceMotionProfile = "REAL_TIME";
  const initialDetectionResult = detectTechniqueKeyEventsWithDebug(input.landmarks);
  const athleteLandmarks = trimLandmarksToJumpWindow(input.landmarks, initialDetectionResult.events);
  const detectionResult = athleteLandmarks === input.landmarks
    ? initialDetectionResult
    : detectTechniqueKeyEventsWithDebug(athleteLandmarks);
  const normalizedJumpHeightConfig = normalizeJumpHeightConfig(
    input.biomechanicsConfig?.jumpHeightMeasurement,
    input.athleteHeightCm,
  );

  const measurements = buildReferenceBiomechanicsMeasurementsPreview(
    athleteLandmarks,
    detectionResult.events.map((event) => ({
      id: `athlete-${event.eventType}`,
      label: event.eventType,
      eventType: event.eventType,
      frameIndex: event.frameIndex,
    })),
    input.biomechanicsConfig?.hipProgressionChecks ?? [],
    normalizedJumpHeightConfig,
    athleteMotionProfile,
  );
  const angleComparisonResult = buildAngleComparisonResult({
    biomechanicsConfig: input.biomechanicsConfig,
    athleteLandmarks,
    athleteEvents: detectionResult.events,
    referenceLandmarks: input.referenceLandmarks,
  });

  const findings = buildFindings(
    buildExpectedEventSet(input.biomechanicsConfig),
    detectionResult.events,
    measurements,
    angleComparisonResult.comparisons,
    angleComparisonResult.summary,
  );

  // Build ghost-skeleton data: expose reference landmark positions at each key
  // event so the mobile UI can overlay a semi-transparent "ghost" on the athlete
  // video, synchronised at TAKE_OFF / TOE_OFF (or whichever event is found first).
  const ghostSkeleton: AthleteGhostSkeletonData | null = (() => {
    if (!input.referenceLandmarks) {
      return null;
    }
    const referenceEventsByType = buildReferenceEventsByType(input.biomechanicsConfig, input.referenceLandmarks);
    const athleteEventsByType = buildEventsByType(detectionResult.events);
    const ghostEventTypes = ["TOE_OFF", "TAKE_OFF", "APEX", "DIP", "LAST_CONTACT", "LANDING"] as const;
    const frames: AthleteGhostSkeletonEventFrame[] = [];
    for (const eventType of ghostEventTypes) {
      const athleteEvent = athleteEventsByType.get(eventType);
      const referenceEvent = referenceEventsByType.get(eventType);
      if (!athleteEvent || !referenceEvent) {
        continue;
      }
      const refFrame = input.referenceLandmarks.frames[referenceEvent.frameIndex];
      if (!refFrame) {
        continue;
      }
      frames.push({
        eventType,
        athleteFrameIndex: athleteEvent.frameIndex,
        referenceFrameIndex: referenceEvent.frameIndex,
        referenceLandmarks: refFrame.landmarks.map((lm) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
          ...(lm.visibility !== undefined ? { visibility: lm.visibility } : {}),
        })),
      });
    }
    const primaryEventType = frames.find((f) => f.eventType === "TOE_OFF")?.eventType
      ?? frames.find((f) => f.eventType === "TAKE_OFF")?.eventType
      ?? frames[0]?.eventType
      ?? null;
    return frames.length > 0 ? { primaryEventType, frames } : null;
  })();

  const analysisJson = {
    schemaVersion: 1,
    analyzedAt: new Date().toISOString(),
    subjectHeightCm: input.athleteHeightCm,
    poseSequence: athleteLandmarks,
    detectedEvents: detectionResult.events.map((event) => ({
      id: `athlete-${event.eventType}`,
      label: event.eventType,
      eventType: event.eventType,
      frameIndex: event.frameIndex,
      timestampMs: athleteLandmarks.frames[event.frameIndex]?.timestampMs ?? null,
      confidence: event.confidence,
      detector: event.detector,
      source: "AUTO_DETECTED",
    })),
    measuredChecks: {
      hipProgressionChecks: measurements.hipProgressionChecks,
      angleChecks: angleComparisonResult.comparisons,
      pointChecks: [],
      trajectoryChecks: [],
    },
    jumpHeightMeasurement: measurements.jumpHeight,
    referenceComparison: angleComparisonResult.summary,
    findings,
  } satisfies Record<string, unknown>;

  return {
    landmarks: athleteLandmarks,
    detectedEvents: detectionResult.events,
    detectionDebug: detectionResult.debug,
    measurements,
    angleComparisons: angleComparisonResult.comparisons,
    comparisonSummary: angleComparisonResult.summary,
    ghostSkeleton,
    findings,
    analysisJson,
  };
}
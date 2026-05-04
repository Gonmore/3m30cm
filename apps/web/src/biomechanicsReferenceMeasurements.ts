import type { TechniqueProLandmarks } from "./techniquePoseExtraction";

const gravityMetersPerSecondSquared = 9.81;
const slowMotionPlaybackCandidates = [0.5, 0.25] as const;

const landmarkIndex = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

type MeasurementStatus =
  | "PENDING"
  | "OK"
  | "OUT_OF_RANGE"
  | "MISSING_EVENT"
  | "MISSING_LANDMARK"
  | "INVALID_MOTION_PROFILE"
  | "LOW_CONFIDENCE"
  | "METHOD_DISAGREEMENT";

export interface ReferenceMeasurementEventMarker {
  id: string;
  label: string;
  eventType: string;
  frameIndex: number;
}

export interface ReferenceHipProgressionStepConfig {
  eventType: string;
  targetCumulativeDropMinPercent: number | null;
  targetCumulativeDropMaxPercent: number | null;
}

export interface ReferenceHipProgressionCheckConfig {
  id: string;
  label: string;
  requireMonotonic: boolean;
  steps: ReferenceHipProgressionStepConfig[];
}

export interface ReferenceJumpHeightMeasurementConfig {
  enabled: boolean;
  subjectHeightCm: number | null;
  playbackSpeedRatio: number | null;
  flightTimeMethodEnabled: boolean;
  centerOfMassMethodEnabled: boolean;
  consensusToleranceCm: number | null;
}

export interface ReferenceHipProgressionStepPreview {
  eventId: string | null;
  eventType: string;
  frameIndex: number | null;
  heightFromGround: number | null;
  cumulativeDropPercent: number | null;
  targetCumulativeDropMinPercent: number | null;
  targetCumulativeDropMaxPercent: number | null;
  withinTarget: boolean | null;
}

export interface ReferenceHipProgressionCheckPreview {
  checkId: string;
  label: string;
  status: MeasurementStatus;
  totalDropValue: number | null;
  monotonic: boolean | null;
  steps: ReferenceHipProgressionStepPreview[];
  notes: string | null;
}

export interface ReferenceJumpHeightMethodPreview {
  method: "FLIGHT_TIME" | "CENTER_OF_MASS" | "RIM_REFERENCE";
  status: MeasurementStatus;
  valueCm: number | null;
  confidence: number | null;
  playbackSpeedRatio: number | null;
  notes: string | null;
  /** CoM height above the ground at APEX (cm). CENTER_OF_MASS method only. */
  comHeightAboveGroundCm?: number | null;
  /** Drop of CoM from SETUP to DIP (cm). CENTER_OF_MASS method only. */
  dipDepthCm?: number | null;
  /** Jump height divided by dip depth (dimensionless efficiency ratio). CENTER_OF_MASS only. */
  takeoffEfficiency?: number | null;
}

export interface ReferenceJumpHeightPreview {
  motionProfile: "REAL_TIME" | "SLOW_MOTION" | null;
  playbackSpeedRatio: number | null;
  methods: ReferenceJumpHeightMethodPreview[];
  consensusValueCm: number | null;
  disagreementCm: number | null;
  status: MeasurementStatus;
  notes: string | null;
}

export interface ReferenceCameraMotionPreview {
  horizontalDriftPercent: number | null;
  verticalDriftPercent: number | null;
  scaleDriftPercent: number | null;
  stabilityScore: number | null;
  status: MeasurementStatus;
  notes: string | null;
}

export interface ReferenceApproachStepDistancesPreview {
  /** Horizontal hip displacement ANTEPENULTIMATE_CONTACT → PENULTIMATE_CONTACT (cm). */
  prePenultimateFlightDistanceCm: number | null;
  /** Horizontal foot displacement PENULTIMATE_CONTACT → DIP (cm). */
  penultimateToDipDistanceCm: number | null;
  /** Whether the distances are calibrated with the subject's height (false = cm unavailable). */
  calibrated: boolean;
  notes: string | null;
}

export interface ReferenceBiomechanicsMeasurementsPreview {
  hipProgressionChecks: ReferenceHipProgressionCheckPreview[];
  jumpHeight: ReferenceJumpHeightPreview | null;
  stepDistances: ReferenceApproachStepDistancesPreview | null;
  cameraMotion: ReferenceCameraMotionPreview | null;
}

function average(values: Array<number | null | undefined>) {
  const validValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!validValues.length) {
    return null;
  }

  return validValues.reduce((total, value) => total + value, 0) / validValues.length;
}

function roundTo(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getFrame(landmarks: TechniqueProLandmarks, frameIndex: number) {
  return landmarks.frames[frameIndex] ?? null;
}

function getRawLandmarkY(landmarks: TechniqueProLandmarks, frameIndex: number, pointIndex: number) {
  return getFrame(landmarks, frameIndex)?.landmarks[pointIndex]?.y ?? null;
}

function getRawLandmarkX(landmarks: TechniqueProLandmarks, frameIndex: number, pointIndex: number) {
  return getFrame(landmarks, frameIndex)?.landmarks[pointIndex]?.x ?? null;
}

function getRawGroundReferenceY(landmarks: TechniqueProLandmarks, frameIndex: number) {
  return average([
    getRawLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_ANKLE),
    getRawLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_ANKLE),
    getRawLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_HEEL),
    getRawLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_HEEL),
    getRawLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_FOOT_INDEX),
    getRawLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_FOOT_INDEX),
  ].map((value) => value ?? null).sort((left, right) => (right ?? 0) - (left ?? 0)).slice(0, 2));
}

function getRawApproximateBodyCenterX(landmarks: TechniqueProLandmarks, frameIndex: number) {
  return average([
    getRawLandmarkX(landmarks, frameIndex, landmarkIndex.LEFT_HIP),
    getRawLandmarkX(landmarks, frameIndex, landmarkIndex.RIGHT_HIP),
    getRawLandmarkX(landmarks, frameIndex, landmarkIndex.LEFT_SHOULDER),
    getRawLandmarkX(landmarks, frameIndex, landmarkIndex.RIGHT_SHOULDER),
  ]);
}

function getRawApproximateCenterOfMassY(landmarks: TechniqueProLandmarks, frameIndex: number) {
  return average([
    getRawLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_HIP),
    getRawLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_HIP),
    getRawLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_SHOULDER),
    getRawLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_SHOULDER),
  ]);
}

function getRawHeadReferenceY(landmarks: TechniqueProLandmarks, frameIndex: number) {
  const noseY = getRawLandmarkY(landmarks, frameIndex, landmarkIndex.NOSE);
  if (typeof noseY === "number" && Number.isFinite(noseY)) {
    return noseY;
  }

  return getRawTopVisibleBodyPointY(landmarks, frameIndex);
}

function getRawTopVisibleBodyPointY(landmarks: TechniqueProLandmarks, frameIndex: number) {
  const frame = getFrame(landmarks, frameIndex);
  if (!frame) {
    return null;
  }

  const visibleValues = frame.landmarks
    .map((landmark) => landmark.y)
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  if (!visibleValues.length) {
    return null;
  }

  return Math.min(...visibleValues);
}

function getRawVisibleBodyHeight(landmarks: TechniqueProLandmarks, frameIndex: number) {
  const groundReferenceY = getRawGroundReferenceY(landmarks, frameIndex);
  const topVisibleBodyPointY = getRawTopVisibleBodyPointY(landmarks, frameIndex);
  if (groundReferenceY === null || topVisibleBodyPointY === null) {
    return null;
  }

  return groundReferenceY - topVisibleBodyPointY;
}

function getFallbackTrackingTransform(landmarks: TechniqueProLandmarks, frameIndex: number) {
  const referenceFrameIndex = landmarks.cameraTracking?.referenceFrameIndex ?? 0;
  const referenceCenterX = getRawApproximateBodyCenterX(landmarks, referenceFrameIndex);
  const currentCenterX = getRawApproximateBodyCenterX(landmarks, frameIndex);
  const referenceGroundY = getRawGroundReferenceY(landmarks, referenceFrameIndex);
  const currentGroundY = getRawGroundReferenceY(landmarks, frameIndex);
  const referenceHeight = getRawVisibleBodyHeight(landmarks, referenceFrameIndex);
  const currentHeight = getRawVisibleBodyHeight(landmarks, frameIndex);

  if (
    referenceCenterX === null
    || currentCenterX === null
    || referenceGroundY === null
    || currentGroundY === null
  ) {
    return null;
  }

  const scale =
    referenceHeight !== null
    && currentHeight !== null
    && referenceHeight > 0
    && currentHeight > 0
      ? Math.min(Math.max(currentHeight / referenceHeight, 0.92), 1.08)
      : 1;

  return {
    translationX: currentCenterX - referenceCenterX,
    translationY: currentGroundY - referenceGroundY,
    scale,
    trackedPointCount: 0,
  };
}

function getCameraTrackingTransform(landmarks: TechniqueProLandmarks, frameIndex: number) {
  return landmarks.cameraTracking?.frameTransforms[frameIndex] ?? getFallbackTrackingTransform(landmarks, frameIndex);
}

function getCompensatedPoint(
  landmarks: TechniqueProLandmarks,
  frameIndex: number,
  pointIndex: number,
) {
  const point = getFrame(landmarks, frameIndex)?.landmarks[pointIndex] ?? null;
  if (!point) {
    return null;
  }

  const transform = getCameraTrackingTransform(landmarks, frameIndex);
  if (!transform || !Number.isFinite(transform.scale) || transform.scale <= 0) {
    return point;
  }

  const centerX = 0.5;
  const centerY = 0.5;
  return {
    ...point,
    x: ((point.x - centerX) - transform.translationX) / transform.scale + centerX,
    y: ((point.y - centerY) - transform.translationY) / transform.scale + centerY,
  };
}

function getCompensatedFrameLandmarks(landmarks: TechniqueProLandmarks, frameIndex: number) {
  const frame = getFrame(landmarks, frameIndex);
  if (!frame) {
    return [] as NonNullable<ReturnType<typeof getCompensatedPoint>>[];
  }

  return frame.landmarks
    .map((_, pointIndex) => getCompensatedPoint(landmarks, frameIndex, pointIndex))
    .filter((point): point is NonNullable<ReturnType<typeof getCompensatedPoint>> => Boolean(point));
}

function getLandmarkY(landmarks: TechniqueProLandmarks, frameIndex: number, pointIndex: number) {
  return getCompensatedPoint(landmarks, frameIndex, pointIndex)?.y ?? null;
}

function getLandmarkX(landmarks: TechniqueProLandmarks, frameIndex: number, pointIndex: number) {
  return getCompensatedPoint(landmarks, frameIndex, pointIndex)?.x ?? null;
}

function getGroundReferenceY(landmarks: TechniqueProLandmarks, frameIndex: number) {
  return average([
    getLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_ANKLE),
    getLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_ANKLE),
    getLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_HEEL),
    getLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_HEEL),
    getLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_FOOT_INDEX),
    getLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_FOOT_INDEX),
  ].map((value) => value ?? null).sort((left, right) => (right ?? 0) - (left ?? 0)).slice(0, 2));
}

function getGlobalGroundReferenceY(landmarks: TechniqueProLandmarks) {
  const frameGroundValues = landmarks.frames
    .map((_, frameIndex) => getGroundReferenceY(landmarks, frameIndex))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!frameGroundValues.length) {
    return null;
  }

  return Math.max(...frameGroundValues);
}

function getHipCenterY(landmarks: TechniqueProLandmarks, frameIndex: number) {
  return average([
    getLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_HIP),
    getLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_HIP),
  ]);
}

function getApproximateCenterOfMassY(landmarks: TechniqueProLandmarks, frameIndex: number) {
  return average([
    getLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_HIP),
    getLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_HIP),
    getLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_SHOULDER),
    getLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_SHOULDER),
  ]);
}

function getApproximateBodyCenterX(landmarks: TechniqueProLandmarks, frameIndex: number) {
  return average([
    getLandmarkX(landmarks, frameIndex, landmarkIndex.LEFT_HIP),
    getLandmarkX(landmarks, frameIndex, landmarkIndex.RIGHT_HIP),
    getLandmarkX(landmarks, frameIndex, landmarkIndex.LEFT_SHOULDER),
    getLandmarkX(landmarks, frameIndex, landmarkIndex.RIGHT_SHOULDER),
  ]);
}

function getTopVisibleBodyPointY(landmarks: TechniqueProLandmarks, frameIndex: number) {
  const visibleValues = getCompensatedFrameLandmarks(landmarks, frameIndex)
    .map((landmark) => landmark.y)
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  if (!visibleValues.length) {
    return null;
  }

  return Math.min(...visibleValues);
}

function calculateVisibleBodyHeight(landmarks: TechniqueProLandmarks, frameIndex: number) {
  const groundReferenceY = getGroundReferenceY(landmarks, frameIndex);
  const topVisibleBodyPointY = getTopVisibleBodyPointY(landmarks, frameIndex);
  if (groundReferenceY === null || topVisibleBodyPointY === null) {
    return null;
  }

  return groundReferenceY - topVisibleBodyPointY;
}

function getMaxVisibleBodyHeightBeforeFrame(landmarks: TechniqueProLandmarks, lastFrameIndex: number) {
  const upperBound = Math.max(Math.min(lastFrameIndex, landmarks.frames.length - 1), 0);
  const visibleHeights = landmarks.frames
    .slice(0, upperBound + 1)
    .map((_, frameIndex) => calculateVisibleBodyHeight(landmarks, frameIndex))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  if (!visibleHeights.length) {
    return null;
  }

  return Math.max(...visibleHeights);
}

function getTimestampSeconds(landmarks: TechniqueProLandmarks, frameIndex: number) {
  const frame = getFrame(landmarks, frameIndex);
  if (!frame) {
    return null;
  }

  return frame.timestampMs / 1000;
}

function interpolateGroundReferenceY(
  landmarks: TechniqueProLandmarks,
  targetFrameIndex: number,
  startFrameIndex: number | null,
  endFrameIndex: number | null,
) {
  const startGroundReferenceY = typeof startFrameIndex === "number"
    ? getGroundReferenceY(landmarks, startFrameIndex)
    : null;
  const endGroundReferenceY = typeof endFrameIndex === "number"
    ? getGroundReferenceY(landmarks, endFrameIndex)
    : null;

  if (
    typeof startFrameIndex === "number"
    && typeof endFrameIndex === "number"
    && typeof startGroundReferenceY === "number"
    && typeof endGroundReferenceY === "number"
    && endFrameIndex !== startFrameIndex
  ) {
    const ratio = (targetFrameIndex - startFrameIndex) / (endFrameIndex - startFrameIndex);
    return startGroundReferenceY + ((endGroundReferenceY - startGroundReferenceY) * ratio);
  }

  if (typeof startGroundReferenceY === "number") {
    return startGroundReferenceY;
  }

  if (typeof endGroundReferenceY === "number") {
    return endGroundReferenceY;
  }

  return getGlobalGroundReferenceY(landmarks);
}

function calculateCenterOfMassHeightFromGround(
  landmarks: TechniqueProLandmarks,
  frameIndex: number,
  groundReferenceY: number | null,
) {
  const centerOfMassY = getApproximateCenterOfMassY(landmarks, frameIndex);
  if (groundReferenceY === null || centerOfMassY === null) {
    return null;
  }

  return groundReferenceY - centerOfMassY;
}

/**
 * Returns the basketball rim's Y position in world (camera-compensated) coordinates.
 * This is a fixed constant in world space: it doesn't change frame-to-frame.
 *
 * The rim was detected at `rimReference.referenceFrameIndex` with a raw (pixel)
 * Y value. We must decompensate using the camera transform at that frame to
 * obtain the stable world-coord value, then all subsequent calculations can
 * simply use this constant alongside other compensated landmark coords.
 */
function getRimWorldY(landmarks: TechniqueProLandmarks): number | null {
  const rimRef = landmarks.rimReference;
  if (!rimRef?.detected) {
    return null;
  }

  // If we have stored camera tracking, convert from detection-frame raw coords
  // to world coords by applying the inverse transform at the detection frame.
  const refTransform = landmarks.cameraTracking?.frameTransforms[rimRef.referenceFrameIndex] ?? null;
  if (!refTransform || !Number.isFinite(refTransform.scale) || refTransform.scale <= 0) {
    // No transform available: assume detection frame ≈ reference frame (frame 0)
    return rimRef.y;
  }

  // Inverse of forward transform: raw → world
  return ((rimRef.y - 0.5) - refTransform.translationY) / refTransform.scale + 0.5;
}

/**
 * Projects the rim centroid Y from its detection frame into the raw pixel
 * coordinate space of the target frame. Needed when working in raw coords.
 *
 * raw_world = ((raw_det - 0.5) - T_det) / S_det + 0.5
 * raw_target = (raw_world - 0.5) * S_tgt + T_tgt + 0.5
 */
function getRimRawCentroidYAtFrame(landmarks: TechniqueProLandmarks, frameIndex: number): number | null {
  const rimRef = landmarks.rimReference;
  if (!rimRef?.detected) {
    return null;
  }

  const detTransform = landmarks.cameraTracking?.frameTransforms[rimRef.referenceFrameIndex] ?? null;
  const tgtTransform = landmarks.cameraTracking?.frameTransforms[frameIndex] ?? null;

  // raw detection Y → world Y
  let worldY = rimRef.y;
  if (detTransform && Number.isFinite(detTransform.scale) && detTransform.scale > 0) {
    worldY = ((rimRef.y - 0.5) - detTransform.translationY) / detTransform.scale + 0.5;
  }

  // world Y → target frame raw Y
  if (!tgtTransform || !Number.isFinite(tgtTransform.scale) || tgtTransform.scale <= 0) {
    return worldY;
  }

  return (worldY - 0.5) * tgtTransform.scale + tgtTransform.translationY + 0.5;
}

/**
 * Projects the rim's two endpoints (leftmost and rightmost blob pixels) from
 * their detection frame into the raw pixel coordinate space of the target frame.
 * Both endpoints represent the same real-world height (305 cm).
 */
function getRimRawEndpointsAtFrame(
  landmarks: TechniqueProLandmarks,
  frameIndex: number,
): { xLeft: number; yLeft: number; xRight: number; yRight: number } | null {
  const rimRef = landmarks.rimReference;
  if (!rimRef?.detected || typeof rimRef.xLeft !== "number") {
    return null;
  }

  const detTransform = landmarks.cameraTracking?.frameTransforms[rimRef.referenceFrameIndex] ?? null;
  const tgtTransform = landmarks.cameraTracking?.frameTransforms[frameIndex] ?? null;

  function projectPoint(rawX: number, rawY: number): { x: number; y: number } {
    let worldX = rawX;
    let worldY = rawY;
    if (detTransform && Number.isFinite(detTransform.scale) && detTransform.scale > 0) {
      worldX = ((rawX - 0.5) - detTransform.translationX) / detTransform.scale + 0.5;
      worldY = ((rawY - 0.5) - detTransform.translationY) / detTransform.scale + 0.5;
    }
    if (!tgtTransform || !Number.isFinite(tgtTransform.scale) || tgtTransform.scale <= 0) {
      return { x: worldX, y: worldY };
    }
    return {
      x: (worldX - 0.5) * tgtTransform.scale + tgtTransform.translationX + 0.5,
      y: (worldY - 0.5) * tgtTransform.scale + tgtTransform.translationY + 0.5,
    };
  }

  const left = projectPoint(rimRef.xLeft, rimRef.yLeft);
  const right = projectPoint(rimRef.xRight, rimRef.yRight);

  return { xLeft: left.x, yLeft: left.y, xRight: right.x, yRight: right.y };
}

function buildCameraMotionPreview(
  landmarks: TechniqueProLandmarks,
  eventsByType: Map<string, ReferenceMeasurementEventMarker>,
): ReferenceCameraMotionPreview {
  const trackedTransforms = landmarks.cameraTracking?.frameTransforms ?? [];
  if (trackedTransforms.length >= 2) {
    const horizontalDriftPercent = roundTo(
      (Math.max(...trackedTransforms.map((frame) => frame.translationX)) - Math.min(...trackedTransforms.map((frame) => frame.translationX))) * 100,
      1,
    );
    const verticalDriftPercent = roundTo(
      (Math.max(...trackedTransforms.map((frame) => frame.translationY)) - Math.min(...trackedTransforms.map((frame) => frame.translationY))) * 100,
      1,
    );
    const scaleValues = trackedTransforms.map((frame) => frame.scale);
    const scaleDriftPercent = roundTo((Math.max(...scaleValues) - Math.min(...scaleValues)) * 100, 1);
    const averageTrackedPointCount = trackedTransforms.reduce((total, frame) => total + frame.trackedPointCount, 0) / trackedTransforms.length;
    const horizontalPenalty = Math.min(horizontalDriftPercent / 20, 1);
    const verticalPenalty = Math.min(verticalDriftPercent / 12, 1);
    const scalePenalty = Math.min(scaleDriftPercent / 18, 1);
    const trackingPenalty = averageTrackedPointCount >= 10 ? 0 : Math.min((10 - averageTrackedPointCount) / 10, 1);
    const stabilityScore = roundTo(Math.max(0, 1 - (horizontalPenalty * 0.3 + verticalPenalty * 0.35 + scalePenalty * 0.2 + trackingPenalty * 0.15)), 2);
    const status: MeasurementStatus = stabilityScore >= 0.75
      ? "OK"
      : stabilityScore >= 0.55
        ? "LOW_CONFIDENCE"
        : "OUT_OF_RANGE";

    return {
      horizontalDriftPercent,
      verticalDriftPercent,
      scaleDriftPercent,
      stabilityScore,
      status,
      notes: `Seguimiento de fondo por parches del plano trasero. Los porcentajes miden cuánto se movió la cámara respecto al tamaño del fotograma: horizontal=${horizontalDriftPercent}% del ancho, vertical=${verticalDriftPercent}% del alto, zoom=${scaleDriftPercent}%. Promedio de puntos rastreados: ${roundTo(averageTrackedPointCount, 1)}.`,
    };
  }

  const setupEvent = eventsByType.get("SETUP") ?? null;
  const toeOffEvent = eventsByType.get("TOE_OFF") ?? eventsByType.get("TAKE_OFF") ?? null;
  const apexEvent = eventsByType.get("APEX") ?? null;
  const landingEvent = eventsByType.get("LANDING") ?? null;

  const framingXs = [toeOffEvent, apexEvent, landingEvent]
    .map((event) => (event ? getRawApproximateBodyCenterX(landmarks, event.frameIndex) : null))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const horizontalDriftPercent = framingXs.length >= 2
    ? roundTo((Math.max(...framingXs) - Math.min(...framingXs)) * 100, 1)
    : null;

  const startGroundY = toeOffEvent ? getRawGroundReferenceY(landmarks, toeOffEvent.frameIndex) : null;
  const endGroundY = landingEvent ? getRawGroundReferenceY(landmarks, landingEvent.frameIndex) : null;
  const verticalDriftPercent = typeof startGroundY === "number" && typeof endGroundY === "number"
    ? roundTo(Math.abs(endGroundY - startGroundY) * 100, 1)
    : null;

  const setupHeight = setupEvent ? getRawVisibleBodyHeight(landmarks, setupEvent.frameIndex) : null;
  const landingHeight = landingEvent ? getRawVisibleBodyHeight(landmarks, landingEvent.frameIndex) : null;
  const scaleDriftPercent = typeof setupHeight === "number" && typeof landingHeight === "number" && setupHeight > 0
    ? roundTo((Math.abs(landingHeight - setupHeight) / setupHeight) * 100, 1)
    : null;

  const horizontalPenalty = typeof horizontalDriftPercent === "number" ? Math.min(horizontalDriftPercent / 20, 1) : 0.35;
  const verticalPenalty = typeof verticalDriftPercent === "number" ? Math.min(verticalDriftPercent / 12, 1) : 0.35;
  const scalePenalty = typeof scaleDriftPercent === "number" ? Math.min(scaleDriftPercent / 18, 1) : 0.35;
  const stabilityScore = roundTo(Math.max(0, 1 - (horizontalPenalty * 0.35 + verticalPenalty * 0.4 + scalePenalty * 0.25)), 2);
  const status: MeasurementStatus = stabilityScore >= 0.75
    ? "OK"
    : stabilityScore >= 0.55
      ? "LOW_CONFIDENCE"
      : "OUT_OF_RANGE";

  return {
    horizontalDriftPercent,
    verticalDriftPercent,
    scaleDriftPercent,
    stabilityScore,
    status,
    notes: `Estimación de cámara derivada de landmarks (sin seguimiento de fondo). Los porcentajes representan fracciones del fotograma: horizontal=${horizontalDriftPercent !== null ? horizontalDriftPercent + "% del ancho" : "s/d"}, vertical=${verticalDriftPercent !== null ? verticalDriftPercent + "% del alto" : "s/d"}, zoom=${scaleDriftPercent !== null ? scaleDriftPercent + "%" : "s/d"}. Valores >5% en vertical indican movimiento de cámara que puede afectar el CoM.`,
  };
}

function buildEventsByType(eventMarkers: ReferenceMeasurementEventMarker[]) {
  const eventsByType = new Map<string, ReferenceMeasurementEventMarker>();
  eventMarkers.forEach((event) => {
    if (!eventsByType.has(event.eventType)) {
      eventsByType.set(event.eventType, event);
    }
  });
  return eventsByType;
}

/**
 * Measures how far the knees hang below the hips in normalised Y coords.
 * Positive = normal stance (knees lower than hips).
 * Near zero or negative = knees pulled up (tucked landing).
 */
function measureKneeDropRelativeToHip(landmarks: TechniqueProLandmarks, frameIndex: number): number | null {
  const leftHipY = getLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_HIP);
  const rightHipY = getLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_HIP);
  const leftKneeY = getLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_KNEE);
  const rightKneeY = getLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_KNEE);
  return average([
    leftHipY !== null && leftKneeY !== null ? leftKneeY - leftHipY : null,
    rightHipY !== null && rightKneeY !== null ? rightKneeY - rightHipY : null,
  ]);
}

/**
 * Detects the "salto con trampa" pattern: athlete tucks knees before landing,
 * artificially prolonging flight time and inflating the FLIGHT_TIME result.
 * Returns a confidence penalty (0–0.20) and a human-readable note.
 */
function detectLandingTuck(
  landmarks: TechniqueProLandmarks,
  toeOffFrameIndex: number | null,
  landingFrameIndex: number | null,
): { penalty: number; note: string | null } {
  if (toeOffFrameIndex === null || landingFrameIndex === null) {
    return { penalty: 0, note: null };
  }

  const takeOffKneeDrop = measureKneeDropRelativeToHip(landmarks, toeOffFrameIndex);
  const landingKneeDrop = measureKneeDropRelativeToHip(landmarks, landingFrameIndex);

  if (takeOffKneeDrop === null || landingKneeDrop === null) {
    return { penalty: 0, note: null };
  }

  // A drop ≥ 0.06 in normalised Y (≈ 6 % of frame height) means knees were
  // meaningfully pulled up. Scale the penalty linearly between 0.06 and 0.15.
  const tuckAmount = takeOffKneeDrop - landingKneeDrop;
  if (tuckAmount < 0.06) {
    return { penalty: 0, note: null };
  }

  const penalty = Math.min(roundTo(((tuckAmount - 0.06) / 0.09) * 0.20, 2), 0.20);
  return {
    penalty,
    note: `Se detectó recogida de rodillas en el aterrizaje (Δ ${roundTo(tuckAmount, 3)} en coords. normalizadas). El tiempo de vuelo puede estar sobreestimado; se prioriza el método del Centro de Masas.`,
  };
}

function calculateHipHeightFromGround(landmarks: TechniqueProLandmarks, frameIndex: number) {
  const groundReferenceY = getGroundReferenceY(landmarks, frameIndex);
  const hipCenterY = getHipCenterY(landmarks, frameIndex);
  if (groundReferenceY === null || hipCenterY === null) {
    return null;
  }

  return groundReferenceY - hipCenterY;
}

function buildHipProgressionCheckPreview(
  check: ReferenceHipProgressionCheckConfig,
  landmarks: TechniqueProLandmarks,
  eventsByType: Map<string, ReferenceMeasurementEventMarker>,
): ReferenceHipProgressionCheckPreview {
  let missingEvent = false;
  let missingLandmark = false;

  const steps = check.steps.map((step) => {
    const event = eventsByType.get(step.eventType) ?? null;
    if (!event) {
      missingEvent = true;
      return {
        eventId: null,
        eventType: step.eventType,
        frameIndex: null,
        heightFromGround: null,
        cumulativeDropPercent: null,
        targetCumulativeDropMinPercent: step.targetCumulativeDropMinPercent,
        targetCumulativeDropMaxPercent: step.targetCumulativeDropMaxPercent,
        withinTarget: null,
      };
    }

    const heightFromGround = calculateHipHeightFromGround(landmarks, event.frameIndex);
    if (heightFromGround === null) {
      missingLandmark = true;
    }

    return {
      eventId: event.id,
      eventType: step.eventType,
      frameIndex: event.frameIndex,
      heightFromGround,
      cumulativeDropPercent: null,
      targetCumulativeDropMinPercent: step.targetCumulativeDropMinPercent,
      targetCumulativeDropMaxPercent: step.targetCumulativeDropMaxPercent,
      withinTarget: null,
    };
  });

  if (missingEvent) {
    return {
      checkId: check.id,
      label: check.label,
      status: "MISSING_EVENT",
      totalDropValue: null,
      monotonic: null,
      steps,
      notes: "Faltan eventos necesarios para medir la progresión de la cadera.",
    };
  }

  if (missingLandmark) {
    return {
      checkId: check.id,
      label: check.label,
      status: "MISSING_LANDMARK",
      totalDropValue: null,
      monotonic: null,
      steps,
      notes: "No se pudieron reconstruir landmarks suficientes para medir la altura de la cadera respecto al suelo.",
    };
  }

  const firstStep = steps[0];
  const lastStep = steps[steps.length - 1];
  const setupHeight = firstStep?.heightFromGround ?? null;
  const lastHeight = lastStep?.heightFromGround ?? null;
  if (setupHeight === null || lastHeight === null) {
    return {
      checkId: check.id,
      label: check.label,
      status: "MISSING_LANDMARK",
      totalDropValue: null,
      monotonic: null,
      steps,
      notes: "No se pudieron medir las alturas clave para la progresión de la cadera.",
    };
  }

  const totalDropValue = setupHeight - lastHeight;
  const monotonic = steps.every((step, index) => {
    if (index === 0) {
      return true;
    }

    const previousStep = steps[index - 1];
    return (previousStep?.heightFromGround ?? Number.NEGATIVE_INFINITY) >= (step.heightFromGround ?? Number.POSITIVE_INFINITY);
  });

  const nextSteps = steps.map((step, index) => {
    const cumulativeDropPercent = totalDropValue > 0 && step.heightFromGround !== null
      ? ((setupHeight - step.heightFromGround) / totalDropValue) * 100
      : index === 0
        ? 0
        : null;
    const withinTarget = cumulativeDropPercent === null
      ? null
      : (
        (typeof step.targetCumulativeDropMinPercent !== "number" || cumulativeDropPercent >= step.targetCumulativeDropMinPercent)
        && (typeof step.targetCumulativeDropMaxPercent !== "number" || cumulativeDropPercent <= step.targetCumulativeDropMaxPercent)
      );

    return {
      ...step,
      cumulativeDropPercent: cumulativeDropPercent === null ? null : roundTo(cumulativeDropPercent),
      withinTarget,
    };
  });

  const outOfRange = totalDropValue <= 0 || nextSteps.some((step) => step.withinTarget === false) || (check.requireMonotonic && !monotonic);

  return {
    checkId: check.id,
    label: check.label,
    status: outOfRange ? "OUT_OF_RANGE" : "OK",
    totalDropValue: totalDropValue > 0 ? roundTo(totalDropValue, 4) : roundTo(totalDropValue, 4),
    monotonic,
    steps: nextSteps,
    notes: outOfRange
      ? "La progresión no cumple el descenso monotónico o los corredores acumulados configurados."
      : "La cadera desciende de forma progresiva dentro de los corredores configurados.",
  };
}

function buildFlightTimeCandidatePreview(
  landmarks: TechniqueProLandmarks,
  startEvent: ReferenceMeasurementEventMarker,
  apexEvent: ReferenceMeasurementEventMarker | null,
  landingEvent: ReferenceMeasurementEventMarker,
  playbackFactor: number,
): ReferenceJumpHeightMethodPreview & { internalDisagreementCm: number | null } {
  const startTimeSeconds = getTimestampSeconds(landmarks, startEvent.frameIndex);
  const apexTimeSeconds = apexEvent ? getTimestampSeconds(landmarks, apexEvent.frameIndex) : null;
  const landingTimeSeconds = getTimestampSeconds(landmarks, landingEvent.frameIndex);

  const ascentTimeSeconds = typeof apexTimeSeconds === "number" && typeof startTimeSeconds === "number"
    ? Math.max((apexTimeSeconds - startTimeSeconds) * playbackFactor, 0)
    : null;
  const totalFlightTimeSeconds = typeof landingTimeSeconds === "number" && typeof startTimeSeconds === "number"
    ? Math.max((landingTimeSeconds - startTimeSeconds) * playbackFactor, 0)
    : null;

  const ascentHeightCm = typeof ascentTimeSeconds === "number"
    ? 0.5 * gravityMetersPerSecondSquared * ascentTimeSeconds * ascentTimeSeconds * 100
    : null;
  const totalFlightHeightCm = typeof totalFlightTimeSeconds === "number"
    ? (gravityMetersPerSecondSquared * totalFlightTimeSeconds * totalFlightTimeSeconds * 100) / 8
    : null;

  const valueCm = typeof ascentHeightCm === "number"
    ? ascentHeightCm
    : totalFlightHeightCm;

  if (typeof valueCm !== "number" || !Number.isFinite(valueCm) || valueCm <= 0 || valueCm > 200) {
    return {
      method: "FLIGHT_TIME",
      status: "MISSING_EVENT",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: roundTo(playbackFactor, 3),
      internalDisagreementCm: null,
      notes: typeof valueCm === "number" && valueCm > 200
        ? `Tiempo de vuelo da ${roundTo(valueCm)} cm, fuera del rango físico. Verifica que DIP/TOE_OFF y LANDING estén correctamente ubicados.`
        : "No se pudo reconstruir un tiempo de vuelo válido para medir la altura.",
    };
  }

  const internalDisagreementCm = typeof ascentHeightCm === "number" && typeof totalFlightHeightCm === "number"
    ? Math.abs(ascentHeightCm - totalFlightHeightCm)
    : null;

  let confidence = 0.88;
  let notes = `Altura estimada a partir del tiempo entre ${startEvent.eventType} y LANDING.`;
  if (typeof internalDisagreementCm === "number") {
    if (internalDisagreementCm > 8) {
      confidence = 0.7;
      notes = `Tiempo de ascenso y tiempo total difieren ${roundTo(internalDisagreementCm)} cm; revisar postura de aterrizaje o eventos.`;
    } else {
      notes = `Tiempo de ascenso y tiempo total coinciden dentro de ${roundTo(internalDisagreementCm)} cm.`;
    }
  }

  return {
    method: "FLIGHT_TIME",
    status: "OK",
    valueCm: roundTo(valueCm),
    confidence: roundTo(confidence),
    playbackSpeedRatio: roundTo(playbackFactor, 3),
    internalDisagreementCm: typeof internalDisagreementCm === "number" ? roundTo(internalDisagreementCm) : null,
    notes,
  };
}

function buildFlightTimeMethodPreview(
  config: ReferenceJumpHeightMeasurementConfig,
  landmarks: TechniqueProLandmarks,
  eventsByType: Map<string, ReferenceMeasurementEventMarker>,
  motionProfile: "REAL_TIME" | "SLOW_MOTION" | null,
  centerOfMassReferenceCm: number | null,
): ReferenceJumpHeightMethodPreview {
  if (!config.flightTimeMethodEnabled) {
    return {
      method: "FLIGHT_TIME",
      status: "PENDING",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "Método desactivado en la configuración.",
    };
  }

  const dipEvent = eventsByType.get("DIP") ?? null;
  const toeOffEvent = eventsByType.get("TOE_OFF") ?? eventsByType.get("TAKE_OFF") ?? null;
  const startEvent = dipEvent ?? toeOffEvent;
  const apexEvent = eventsByType.get("APEX") ?? null;
  const landingEvent = eventsByType.get("LANDING") ?? null;

  if (!startEvent || !landingEvent) {
    return {
      method: "FLIGHT_TIME",
      status: "MISSING_EVENT",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "Se necesita al menos DIP (o TOE_OFF) y LANDING para estimar la altura por tiempo.",
    };
  }

  if (
    motionProfile === "SLOW_MOTION"
    && typeof config.playbackSpeedRatio !== "number"
    && typeof centerOfMassReferenceCm !== "number"
  ) {
    return {
      method: "FLIGHT_TIME",
      status: "INVALID_MOTION_PROFILE",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "En cámara lenta hace falta un playbackSpeedRatio explícito o una medición por centro de masas válida para inferirlo.",
    };
  }

  const playbackCandidates = motionProfile === "REAL_TIME"
    ? [1]
    : typeof centerOfMassReferenceCm === "number"
      ? Array.from(new Set([
        config.playbackSpeedRatio,
        ...slowMotionPlaybackCandidates,
      ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1)))
      : motionProfile === "SLOW_MOTION"
        ? Array.from(new Set([
          config.playbackSpeedRatio,
          ...slowMotionPlaybackCandidates,
        ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1)))
        : [1];

  const validCandidates = playbackCandidates
    .map((candidate) => buildFlightTimeCandidatePreview(landmarks, startEvent, apexEvent, landingEvent, candidate))
    .filter((candidate) => candidate.status === "OK" && typeof candidate.valueCm === "number");

  if (!validCandidates.length) {
    return {
      method: "FLIGHT_TIME",
      status: "MISSING_EVENT",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "No se pudo reconstruir un tiempo de vuelo válido para medir la altura.",
    };
  }

  const selectedCandidate = validCandidates.slice().sort((left, right) => {
    const leftReferenceGap = typeof centerOfMassReferenceCm === "number"
      ? Math.abs((left.valueCm ?? 0) - centerOfMassReferenceCm)
      : Number.POSITIVE_INFINITY;
    const rightReferenceGap = typeof centerOfMassReferenceCm === "number"
      ? Math.abs((right.valueCm ?? 0) - centerOfMassReferenceCm)
      : Number.POSITIVE_INFINITY;

    if (leftReferenceGap !== rightReferenceGap) {
      return leftReferenceGap - rightReferenceGap;
    }

    const leftInternalGap = left.internalDisagreementCm ?? Number.POSITIVE_INFINITY;
    const rightInternalGap = right.internalDisagreementCm ?? Number.POSITIVE_INFINITY;
    if (leftInternalGap !== rightInternalGap) {
      return leftInternalGap - rightInternalGap;
    }

    if (typeof config.playbackSpeedRatio === "number") {
      const leftMatchesConfigured = Math.abs((left.playbackSpeedRatio ?? 0) - config.playbackSpeedRatio) < 0.0001 ? 0 : 1;
      const rightMatchesConfigured = Math.abs((right.playbackSpeedRatio ?? 0) - config.playbackSpeedRatio) < 0.0001 ? 0 : 1;
      if (leftMatchesConfigured !== rightMatchesConfigured) {
        return leftMatchesConfigured - rightMatchesConfigured;
      }
    }

    return (left.playbackSpeedRatio ?? 0) - (right.playbackSpeedRatio ?? 0);
  })[0] ?? validCandidates[0]!;

  const disagreementFromCenterOfMass = typeof centerOfMassReferenceCm === "number"
    ? Math.abs((selectedCandidate.valueCm ?? 0) - centerOfMassReferenceCm)
    : null;
  const selectedRatioText = selectedCandidate.playbackSpeedRatio?.toString() ?? "desconocido";

  let confidence = selectedCandidate.confidence ?? 0.88;
  let notes = selectedCandidate.notes ?? "Altura estimada a partir del tiempo de vuelo.";
  if (motionProfile === "SLOW_MOTION") {
    if (typeof centerOfMassReferenceCm === "number" && typeof disagreementFromCenterOfMass === "number") {
      if (disagreementFromCenterOfMass <= (config.consensusToleranceCm ?? 6)) {
        confidence = Math.min(confidence + 0.04, 0.94);
      } else {
        confidence = Math.max(confidence - 0.12, 0.55);
      }

      notes = `${notes} Ratio temporal ${selectedRatioText} seleccionado por mejor acuerdo con el centro de masas (${roundTo(disagreementFromCenterOfMass)} cm de diferencia).`;
    } else if (typeof config.playbackSpeedRatio === "number") {
      notes = `${notes} Ratio temporal explícito ${selectedRatioText}.`;
    }
  }

  return {
    method: "FLIGHT_TIME",
    status: selectedCandidate.status,
    valueCm: selectedCandidate.valueCm,
    confidence: roundTo(confidence),
    playbackSpeedRatio: selectedCandidate.playbackSpeedRatio,
    notes,
  };
}

function buildCenterOfMassMethodPreview(
  config: ReferenceJumpHeightMeasurementConfig,
  landmarks: TechniqueProLandmarks,
  eventsByType: Map<string, ReferenceMeasurementEventMarker>,
): ReferenceJumpHeightMethodPreview {
  if (!config.centerOfMassMethodEnabled) {
    return {
      method: "CENTER_OF_MASS",
      status: "PENDING",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "Método desactivado en la configuración.",
    };
  }

  if (typeof config.subjectHeightCm !== "number") {
    return {
      method: "CENTER_OF_MASS",
      status: "PENDING",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "Configura la altura del sujeto para escalar la medición del centro de masas en centímetros.",
    };
  }

  const dipEvent = eventsByType.get("DIP") ?? null;
  const apexEvent = eventsByType.get("APEX") ?? null;
  const setupEvent = eventsByType.get("SETUP") ?? null;

  if (!dipEvent || !apexEvent) {
    return {
      method: "CENTER_OF_MASS",
      status: "MISSING_EVENT",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "Se necesitan DIP y APEX para medir el desplazamiento del centro de masas.",
    };
  }

  // ── Calibración: establecer factor px→cm en el frame DIP ──────────────────
  // Usamos coordenadas RAW (sin compensación de cámara) para el delta del CoM.
  // La compensación por fallback es poco fiable en fase aérea (los pies están
  // en el aire y se usan como referencia de suelo → translationY incorrecto).
  // Con coords. raw y la estatura del atleta como escala, el error por deriva
  // de cámara en ~0.5 s de vuelo es <3 cm, mucho mejor que el artefacto 640 cm.
  const groundY_dip = getRawGroundReferenceY(landmarks, dipEvent.frameIndex);

  let pxPerCm: number | null = null;
  let scaleSource: "rim" | "body-height" = "body-height";
  let scaleConfidence = 0.65;

  // Referencia primaria: aro a 305 cm (proyectado al frame DIP en raw coords)
  if (landmarks.rimReference?.detected) {
    const rimY_at_dip = getRimRawCentroidYAtFrame(landmarks, dipEvent.frameIndex);
    if (rimY_at_dip !== null && groundY_dip !== null) {
      const rimGroundDelta = groundY_dip - rimY_at_dip;
      if (rimGroundDelta > 0.04) {
        pxPerCm = rimGroundDelta / 305;
        scaleSource = "rim";
        scaleConfidence = Math.min(0.93, 0.60 + (landmarks.rimReference.confidence) * 0.40);
      }
    }
  }

  // Referencia secundaria: estatura visible del atleta en DIP (raw)
  if (pxPerCm === null) {
    const bodyHeight = getRawVisibleBodyHeight(landmarks, dipEvent.frameIndex);
    if (bodyHeight !== null && bodyHeight > 0) {
      pxPerCm = bodyHeight / config.subjectHeightCm;
    }
  }

  if (pxPerCm === null || pxPerCm <= 0) {
    return {
      method: "CENTER_OF_MASS",
      status: "MISSING_LANDMARK",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "No se pudo establecer la calibración de escala para medir el centro de masas.",
    };
  }

  // ── Posición del CoM en raw coords ────────────────────────────────────────
  // Usamos raw (sin compensación) para evitar que el fallback de seguimiento
  // use la posición de los pies en el aire como referencia de suelo.
  // El delta comY_dip − comY_apex en raw es estable para ventanas de ~0.5 s.
  const comY_dip = getRawApproximateCenterOfMassY(landmarks, dipEvent.frameIndex);
  const comY_apex = getRawApproximateCenterOfMassY(landmarks, apexEvent.frameIndex);

  if (comY_dip === null || comY_apex === null) {
    return {
      method: "CENTER_OF_MASS",
      status: "MISSING_LANDMARK",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "No se pudieron reconstruir landmarks de torso suficientes para medir el centro de masas.",
    };
  }

  // Y crece hacia abajo en imagen; DIP (abajo) > APEX (arriba) → delta > 0
  const comDelta = comY_dip - comY_apex;
  if (comDelta <= 0) {
    return {
      method: "CENTER_OF_MASS",
      status: "LOW_CONFIDENCE",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "El centro de masas no subió entre DIP y APEX. Verifica que los eventos estén bien ubicados.",
    };
  }

  const valueCm = comDelta / pxPerCm;

  // Sanity-check: un salto vertical humano no puede superar 200 cm (record ~161 cm)
  if (!Number.isFinite(valueCm) || valueCm <= 0 || valueCm > 200) {
    return {
      method: "CENTER_OF_MASS",
      status: "LOW_CONFIDENCE",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: `Valor calculado (${roundTo(valueCm)} cm) fuera del rango físico posible (0–200 cm). La calibración de escala puede ser incorrecta.`,
    };
  }
  // Altura del CoM sobre el suelo en APEX (aprox., raw — cámara puede haber
  // derivado levemente entre DIP y APEX, error típico <2 cm)
  const comHeightAboveGroundCm = groundY_dip !== null
    ? roundTo((groundY_dip - comY_apex) / pxPerCm)
    : null;

  // Profundidad del DIP: cuánto bajó el CoM desde SETUP hasta DIP (raw coords)
  let dipDepthCm: number | null = null;
  if (setupEvent) {
    const comY_setup = getRawApproximateCenterOfMassY(landmarks, setupEvent.frameIndex);
    if (comY_setup !== null) {
      dipDepthCm = roundTo((comY_dip - comY_setup) / pxPerCm);
    }
  }

  // Eficiencia de despegue: altura ganada / profundidad del DIP
  const takeoffEfficiency = typeof dipDepthCm === "number" && dipDepthCm > 2
    ? roundTo(valueCm / dipDepthCm, 2)
    : null;

  const scaleNote = scaleSource === "rim"
    ? `Calibración absoluta: aro a 305 cm (confianza aro: ${roundTo((landmarks.rimReference?.confidence ?? 0) * 100)}%).`
    : `Calibración relativa: estatura visible del atleta (${config.subjectHeightCm} cm).`;

  return {
    method: "CENTER_OF_MASS",
    status: "OK",
    valueCm: roundTo(valueCm),
    confidence: roundTo(scaleConfidence, 2),
    playbackSpeedRatio: null,
    notes: `Elevación del CoM (torso+hombros) desde DIP hasta APEX en coords. raw (sin compensación de cámara). ${scaleNote}`,
    comHeightAboveGroundCm,
    dipDepthCm,
    takeoffEfficiency,
  };
}

function buildRimReferenceMethodPreview(
  config: ReferenceJumpHeightMeasurementConfig,
  landmarks: TechniqueProLandmarks,
  eventsByType: Map<string, ReferenceMeasurementEventMarker>,
): ReferenceJumpHeightMethodPreview {
  if (typeof config.subjectHeightCm !== "number") {
    return {
      method: "RIM_REFERENCE",
      status: "PENDING",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "Configura la estatura del atleta para convertir la referencia del aro en altura de salto.",
    };
  }

  const rimRef = landmarks.rimReference;
  if (!rimRef?.detected) {
    return {
      method: "RIM_REFERENCE",
      status: "PENDING",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "No se detectó un aro con confianza suficiente en la bio-referencia.",
    };
  }

  const apexEvent = eventsByType.get("APEX") ?? null;
  if (!apexEvent) {
    return {
      method: "RIM_REFERENCE",
      status: "MISSING_EVENT",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "Se necesita APEX para estimar altura por referencia de aro.",
    };
  }

  // ── ¿Tiene datos de dos extremos (formato nuevo)? ──────────────────────────
  const rimEndpoints = getRimRawEndpointsAtFrame(landmarks, apexEvent.frameIndex);

  if (rimEndpoints !== null) {
    // ── MÉTODO NUEVO: perspectiva por dos extremos del aro ────────────────
    // Ambos extremos (base ↔ punta del aro) están a 305 cm en el mundo real.
    // Trazando una recta entre ellos obtenemos la "línea de perspectiva a 305 cm".
    // Interpolando en la X del atleta obtenemos la Y de 305 cm en esa columna.
    // Escala: estatura visible del atleta en APEX (cabeza→talón = subjectHeightCm).

    const headY = getRawHeadReferenceY(landmarks, apexEvent.frameIndex);
    const heelY = getRawGroundReferenceY(landmarks, apexEvent.frameIndex);
    const athleteX = getRawApproximateBodyCenterX(landmarks, apexEvent.frameIndex);

    if (headY === null || heelY === null || athleteX === null) {
      return {
        method: "RIM_REFERENCE",
        status: "MISSING_LANDMARK",
        valueCm: null,
        confidence: null,
        playbackSpeedRatio: null,
        notes: "No hay landmarks suficientes en APEX (cabeza, talones, centro de cuerpo).",
      };
    }

    const visibleHeight = heelY - headY; // Y crece hacia abajo; talón > cabeza → positivo
    if (visibleHeight < 0.05) {
      return {
        method: "RIM_REFERENCE",
        status: "LOW_CONFIDENCE",
        valueCm: null,
        confidence: null,
        playbackSpeedRatio: null,
        notes: "El atleta apenas es visible en APEX; no se puede establecer escala fiable.",
      };
    }

    // px por cm según la estatura del propio atleta en APEX
    const pxPerCm = visibleHeight / config.subjectHeightCm;

    // Interpolación lineal de la línea de 305 cm en la X del atleta
    const { xLeft, yLeft, xRight, yRight } = rimEndpoints;
    const rimSpan = xRight - xLeft;
    let yRim305: number;
    if (Math.abs(rimSpan) < 0.01) {
      // Extremos casi en la misma columna: usar media
      yRim305 = (yLeft + yRight) / 2;
    } else {
      const t = (athleteX - xLeft) / rimSpan;
      // Limitar extrapolación excesiva: si el atleta está muy lejos del aro
      const tClamped = Math.min(Math.max(t, -0.5), 1.5);
      yRim305 = yLeft + tClamped * (yRight - yLeft);
    }

    // Borrado de cabeza respecto a la línea de 305 cm
    // Y imagen crece hacia abajo → headY < yRim305 significa cabeza SOBRE el aro
    const rimClearanceCm = (yRim305 - headY) / pxPerCm;

    // Altura del salto: si la cabeza está exactamente a 305 cm (clearance=0)
    // el atleta subió 305 − estatura cm desde el suelo.
    // Cada cm de borrado (clearance) suma/resta directamente.
    const valueCm = (305 - config.subjectHeightCm) + rimClearanceCm;

    if (!Number.isFinite(valueCm) || valueCm <= 0 || valueCm > 200) {
      return {
        method: "RIM_REFERENCE",
        status: "LOW_CONFIDENCE",
        valueCm: null,
        confidence: null,
        playbackSpeedRatio: null,
        notes: `Altura calculada (${roundTo(valueCm)} cm) fuera del rango físico (0–200 cm). Verifica la detección del aro y la ubicación del APEX.`,
      };
    }

    const clearanceStr = rimClearanceCm >= 0
      ? `${roundTo(rimClearanceCm)} cm sobre el aro`
      : `${roundTo(-rimClearanceCm)} cm bajo el aro`;

    return {
      method: "RIM_REFERENCE",
      status: "OK",
      valueCm: roundTo(valueCm),
      confidence: roundTo(Math.max(0.55, Math.min(0.92, 0.55 + rimRef.confidence * 0.37)), 2),
      playbackSpeedRatio: null,
      notes: `Perspectiva por dos extremos del aro. Cabeza en APEX: ${clearanceStr} (línea de 305 cm). Altura = 305 − estatura + borrado = ${roundTo(valueCm)} cm.`,
    };
  }

  // ── MÉTODO FALLBACK (datos sin extremos, análisis antiguo) ─────────────────
  // Se usa la posición centroide del aro como referencia única de 305 cm.
  const dipEvent = eventsByType.get("DIP") ?? null;
  const rimWorldY = getRimWorldY(landmarks);
  if (rimWorldY === null) {
    return {
      method: "RIM_REFERENCE",
      status: "PENDING",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "No se detectó un aro con confianza suficiente en la bio-referencia.",
    };
  }

  const groundRefFrameIndex = dipEvent?.frameIndex ?? 0;
  const groundY_ref = getGroundReferenceY(landmarks, groundRefFrameIndex);
  if (groundY_ref === null) {
    return {
      method: "RIM_REFERENCE",
      status: "MISSING_LANDMARK",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "No se pudo establecer la referencia del suelo para escalar la medición del aro.",
    };
  }

  const rimGroundDelta = groundY_ref - rimWorldY;
  if (rimGroundDelta <= 0.08) {
    return {
      method: "RIM_REFERENCE",
      status: "LOW_CONFIDENCE",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "El aro y el suelo están demasiado próximos en world-coords. Verifica que el aro esté bien detectado.",
    };
  }

  const pxPerCm = rimGroundDelta / 305;

  const headY_apex = getLandmarkY(landmarks, apexEvent.frameIndex, landmarkIndex.NOSE)
    ?? getTopVisibleBodyPointY(landmarks, apexEvent.frameIndex);
  if (headY_apex === null) {
    return {
      method: "RIM_REFERENCE",
      status: "MISSING_LANDMARK",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "No hay datos de posición de cabeza (nariz) en APEX para esta medición.",
    };
  }

  const headHeightCm = (groundY_ref - headY_apex) / pxPerCm;
  const valueCm = headHeightCm - config.subjectHeightCm;

  if (!Number.isFinite(valueCm) || valueCm <= 0 || valueCm > 200) {
    return {
      method: "RIM_REFERENCE",
      status: "LOW_CONFIDENCE",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: `Altura calculada (cabeza=${roundTo(headHeightCm)} cm, sujeto=${config.subjectHeightCm} cm) fuera de rango físico (0-200 cm). Revisa la detección del aro y la ubicación del APEX.`,
    };
  }

  const rimConfidence = rimRef.confidence;
  return {
    method: "RIM_REFERENCE",
    status: "OK",
    valueCm: roundTo(valueCm),
    confidence: roundTo(Math.max(0.50, Math.min(0.95, 0.55 + rimConfidence * 0.40))),
    playbackSpeedRatio: null,
    notes: `[Fallback sin extremos] Cabeza en APEX a ${roundTo(headHeightCm)} cm sobre el suelo. Calibrado con aro a 305 cm (confianza aro: ${roundTo(rimConfidence * 100)}%). Re-analiza el video para activar el método de perspectiva.`,
  };
}

function buildJumpHeightPreview(
  config: ReferenceJumpHeightMeasurementConfig,
  landmarks: TechniqueProLandmarks,
  eventMarkers: ReferenceMeasurementEventMarker[],
  motionProfile: "REAL_TIME" | "SLOW_MOTION" | null,
): ReferenceJumpHeightPreview | null {
  if (!config.enabled) {
    return null;
  }

  const eventsByType = buildEventsByType(eventMarkers);
  const centerOfMassMethod = buildCenterOfMassMethodPreview(config, landmarks, eventsByType);

  // Detect the "salto con trampa" pattern before finalising the flight-time method.
  const toeOffFrameIndex = eventsByType.get("TOE_OFF")?.frameIndex ?? eventsByType.get("TAKE_OFF")?.frameIndex ?? null;
  const landingFrameIndex = eventsByType.get("LANDING")?.frameIndex ?? null;
  const landingTuck = detectLandingTuck(landmarks, toeOffFrameIndex ?? null, landingFrameIndex ?? null);

  const rawFlightTimeMethod = buildFlightTimeMethodPreview(
    config,
    landmarks,
    eventsByType,
    motionProfile,
    centerOfMassMethod.status === "OK" ? centerOfMassMethod.valueCm : null,
  );
  const flightTimeMethod: ReferenceJumpHeightMethodPreview = rawFlightTimeMethod.status === "OK" && landingTuck.penalty > 0
    ? {
      ...rawFlightTimeMethod,
      confidence: rawFlightTimeMethod.confidence !== null
        ? roundTo(Math.max(rawFlightTimeMethod.confidence - landingTuck.penalty, 0.40), 2)
        : null,
      notes: landingTuck.note ?? rawFlightTimeMethod.notes,
    }
    : rawFlightTimeMethod;
  const rimReferenceMethod = buildRimReferenceMethodPreview(config, landmarks, eventsByType);
  const methods = [flightTimeMethod, centerOfMassMethod, rimReferenceMethod];

  const okMethods = methods.filter((method) => method.status === "OK" && typeof method.valueCm === "number");
  const resolvedPlaybackSpeedRatio = flightTimeMethod.playbackSpeedRatio
    ?? (motionProfile === "REAL_TIME" && config.flightTimeMethodEnabled ? 1 : config.playbackSpeedRatio);

  if (!okMethods.length) {
    return {
      motionProfile,
      playbackSpeedRatio: resolvedPlaybackSpeedRatio ?? null,
      methods,
      consensusValueCm: null,
      disagreementCm: null,
      status: methods.some((method) => method.status === "INVALID_MOTION_PROFILE") ? "INVALID_MOTION_PROFILE" : "PENDING",
      notes: "Todavía no hay dos mediciones válidas para consolidar la altura del salto.",
    };
  }

  if (okMethods.length < 2) {
    return {
      motionProfile,
      playbackSpeedRatio: resolvedPlaybackSpeedRatio ?? null,
      methods,
      consensusValueCm: roundTo(okMethods[0]?.valueCm ?? 0),
      disagreementCm: null,
      status: "PENDING",
      notes: "Solo hay una medición válida; falta la corroboración cruzada para consolidar la altura del salto.",
    };
  }

  const consensusValueCm = okMethods.reduce((total, method) => total + (method.valueCm ?? 0), 0) / okMethods.length;
  const disagreementCm = okMethods.length >= 2
    ? Math.abs((okMethods[0]?.valueCm ?? 0) - (okMethods[1]?.valueCm ?? 0))
    : 0;
  const toleranceCm = config.consensusToleranceCm ?? 6;
  const flightTimeOk = okMethods.find((method) => method.method === "FLIGHT_TIME") ?? null;
  const centerOfMassOk = okMethods.find((method) => method.method === "CENTER_OF_MASS") ?? null;
  const adjustedConsensusValueCm = motionProfile === "SLOW_MOTION"
    && flightTimeOk
    && centerOfMassOk
    && typeof flightTimeOk.valueCm === "number"
    && typeof centerOfMassOk.valueCm === "number"
    && disagreementCm > toleranceCm
    && centerOfMassOk.valueCm < flightTimeOk.valueCm
    ? (flightTimeOk.valueCm * 0.7) + (centerOfMassOk.valueCm * 0.3)
    : consensusValueCm;
  const status = okMethods.length >= 2 && disagreementCm > toleranceCm ? "METHOD_DISAGREEMENT" : "OK";

  return {
    motionProfile,
    playbackSpeedRatio: resolvedPlaybackSpeedRatio ?? null,
    methods,
    consensusValueCm: roundTo(adjustedConsensusValueCm),
    disagreementCm: okMethods.length >= 2 ? roundTo(disagreementCm) : null,
    status,
    notes: status === "METHOD_DISAGREEMENT"
      ? (motionProfile === "SLOW_MOTION"
        ? `La diferencia entre métodos supera la tolerancia de ${roundTo(toleranceCm)} cm. Se prioriza parcialmente tiempo de vuelo para compensar posible desplazamiento vertical de cámara.`
        : `La diferencia entre métodos supera la tolerancia de ${roundTo(toleranceCm)} cm.`)
      : "Las mediciones disponibles permiten consolidar una altura de salto de referencia.",
  };
}

function buildApproachStepDistancesPreview(
  landmarks: TechniqueProLandmarks,
  eventsByType: Map<string, ReferenceMeasurementEventMarker>,
  subjectHeightCm: number | null,
): ReferenceApproachStepDistancesPreview | null {
  const antepenultimateEvent = eventsByType.get("ANTEPENULTIMATE_CONTACT") ?? null;
  const penultimateEvent = eventsByType.get("PENULTIMATE_CONTACT") ?? null;
  const dipEvent = eventsByType.get("DIP") ?? null;

  if (!antepenultimateEvent && !penultimateEvent) {
    return null;
  }

  const getSupportSide = (frameIndex: number): "LEFT" | "RIGHT" | null => {
    const leftAnkleY = getLandmarkY(landmarks, frameIndex, landmarkIndex.LEFT_ANKLE);
    const rightAnkleY = getLandmarkY(landmarks, frameIndex, landmarkIndex.RIGHT_ANKLE);
    if (leftAnkleY === null || rightAnkleY === null) return null;
    return leftAnkleY >= rightAnkleY ? "LEFT" : "RIGHT";
  };

  const getFootXBySide = (frameIndex: number, side: "LEFT" | "RIGHT"): number | null => {
    return side === "LEFT"
      ? getLandmarkX(landmarks, frameIndex, landmarkIndex.LEFT_ANKLE)
      : getLandmarkX(landmarks, frameIndex, landmarkIndex.RIGHT_ANKLE);
  };

  const penultimateSupportSide = penultimateEvent ? getSupportSide(penultimateEvent.frameIndex) : null;
  const oppositeOfPenultimate = penultimateSupportSide === "LEFT"
    ? "RIGHT"
    : penultimateSupportSide === "RIGHT"
      ? "LEFT"
      : null;

  const footX_ante = antepenultimateEvent && oppositeOfPenultimate
    ? getFootXBySide(antepenultimateEvent.frameIndex, oppositeOfPenultimate)
    : null;
  const footX_penu = penultimateEvent && penultimateSupportSide
    ? getFootXBySide(penultimateEvent.frameIndex, penultimateSupportSide)
    : null;
  const footX_dip = dipEvent && oppositeOfPenultimate
    ? getFootXBySide(dipEvent.frameIndex, oppositeOfPenultimate)
    : null;

  // Calibrate: visible body height (normalised 0–1 in Y) corresponds to subjectHeightCm.
  // The camera is assumed to be far enough that X and Y scales are approximately equal.
  const setupEvent = eventsByType.get("SETUP") ?? null;
  const calibFrameIndex = setupEvent?.frameIndex ?? 0;
  const visibleBodyHeight = getMaxVisibleBodyHeightBeforeFrame(
    landmarks,
    Math.min(calibFrameIndex + 30, landmarks.frames.length - 1),
  );
  const calibrated = visibleBodyHeight !== null && visibleBodyHeight > 0 && subjectHeightCm !== null && subjectHeightCm > 0;
  const normalizedUnitsPerCm = calibrated ? (visibleBodyHeight! / subjectHeightCm!) : null;

  const prePenultimateFlightDistanceCm = footX_ante !== null && footX_penu !== null && normalizedUnitsPerCm !== null
    ? roundTo(Math.abs(footX_penu - footX_ante) / normalizedUnitsPerCm)
    : null;
  const penultimateToDipDistanceCm = footX_penu !== null && footX_dip !== null && normalizedUnitsPerCm !== null
    ? roundTo(Math.abs(footX_dip - footX_penu) / normalizedUnitsPerCm)
    : null;

  return {
    prePenultimateFlightDistanceCm,
    penultimateToDipDistanceCm,
    calibrated,
    notes: !calibrated
      ? "Configura la altura del sujeto en 'Medición de altura del salto' para obtener distancias en cm."
      : null,
  };
}

export function buildReferenceBiomechanicsMeasurementsPreview(
  landmarks: TechniqueProLandmarks | null | undefined,
  eventMarkers: ReferenceMeasurementEventMarker[],
  hipProgressionChecks: ReferenceHipProgressionCheckConfig[],
  jumpHeightMeasurement: ReferenceJumpHeightMeasurementConfig | null | undefined,
  motionProfile: "REAL_TIME" | "SLOW_MOTION" | null,
): ReferenceBiomechanicsMeasurementsPreview {
  if (!landmarks) {
    return {
      hipProgressionChecks: hipProgressionChecks.map((check) => ({
        checkId: check.id,
        label: check.label,
        status: "PENDING",
        totalDropValue: null,
        monotonic: null,
        steps: check.steps.map((step) => ({
          eventId: null,
          eventType: step.eventType,
          frameIndex: null,
          heightFromGround: null,
          cumulativeDropPercent: null,
          targetCumulativeDropMinPercent: step.targetCumulativeDropMinPercent,
          targetCumulativeDropMaxPercent: step.targetCumulativeDropMaxPercent,
          withinTarget: null,
        })),
        notes: "Todavía no hay landmarks de referencia suficientes para calcular este check.",
      })),
      jumpHeight: jumpHeightMeasurement?.enabled
        ? {
          motionProfile,
          playbackSpeedRatio: jumpHeightMeasurement.playbackSpeedRatio ?? null,
          methods: [],
          consensusValueCm: null,
          disagreementCm: null,
          status: "PENDING",
          notes: "Sube o procesa la referencia profesional para medir la altura del salto.",
        }
        : null,
      stepDistances: null,
      cameraMotion: null,
    };
  }

  const eventsByType = buildEventsByType(eventMarkers);
  return {
    hipProgressionChecks: hipProgressionChecks.map((check) => buildHipProgressionCheckPreview(check, landmarks, eventsByType)),
    jumpHeight: jumpHeightMeasurement
      ? buildJumpHeightPreview(jumpHeightMeasurement, landmarks, eventMarkers, motionProfile)
      : null,
    stepDistances: buildApproachStepDistancesPreview(landmarks, eventsByType, jumpHeightMeasurement?.subjectHeightCm ?? null),
    cameraMotion: buildCameraMotionPreview(landmarks, eventsByType),
  };
}

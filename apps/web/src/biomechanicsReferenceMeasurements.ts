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
  method: "FLIGHT_TIME" | "CENTER_OF_MASS";
  status: MeasurementStatus;
  valueCm: number | null;
  confidence: number | null;
  playbackSpeedRatio: number | null;
  notes: string | null;
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

export interface ReferenceBiomechanicsMeasurementsPreview {
  hipProgressionChecks: ReferenceHipProgressionCheckPreview[];
  jumpHeight: ReferenceJumpHeightPreview | null;
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

function getLandmarkY(landmarks: TechniqueProLandmarks, frameIndex: number, pointIndex: number) {
  return getFrame(landmarks, frameIndex)?.landmarks[pointIndex]?.y ?? null;
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

function getTopVisibleBodyPointY(landmarks: TechniqueProLandmarks, frameIndex: number) {
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
  toeOffEvent: ReferenceMeasurementEventMarker,
  apexEvent: ReferenceMeasurementEventMarker | null,
  landingEvent: ReferenceMeasurementEventMarker | null,
  playbackFactor: number,
): ReferenceJumpHeightMethodPreview & { internalDisagreementCm: number | null } {
  const toeOffTimeSeconds = getTimestampSeconds(landmarks, toeOffEvent.frameIndex);
  const apexTimeSeconds = apexEvent ? getTimestampSeconds(landmarks, apexEvent.frameIndex) : null;
  const landingTimeSeconds = landingEvent ? getTimestampSeconds(landmarks, landingEvent.frameIndex) : null;

  const ascentTimeSeconds = typeof apexTimeSeconds === "number" && typeof toeOffTimeSeconds === "number"
    ? Math.max((apexTimeSeconds - toeOffTimeSeconds) * playbackFactor, 0)
    : null;
  const totalFlightTimeSeconds = typeof landingTimeSeconds === "number" && typeof toeOffTimeSeconds === "number"
    ? Math.max((landingTimeSeconds - toeOffTimeSeconds) * playbackFactor, 0)
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

  if (typeof valueCm !== "number" || !Number.isFinite(valueCm) || valueCm <= 0) {
    return {
      method: "FLIGHT_TIME",
      status: "MISSING_EVENT",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: roundTo(playbackFactor, 3),
      internalDisagreementCm: null,
      notes: "No se pudo reconstruir un tiempo de vuelo válido para medir la altura.",
    };
  }

  const internalDisagreementCm = typeof ascentHeightCm === "number" && typeof totalFlightHeightCm === "number"
    ? Math.abs(ascentHeightCm - totalFlightHeightCm)
    : null;

  let confidence = 0.88;
  let notes = "Altura estimada a partir del tiempo entre TOE_OFF y APEX.";
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

  const toeOffEvent = eventsByType.get("TOE_OFF") ?? eventsByType.get("TAKE_OFF") ?? null;
  const apexEvent = eventsByType.get("APEX") ?? null;
  const landingEvent = eventsByType.get("LANDING") ?? null;

  if (!toeOffEvent || (!apexEvent && !landingEvent)) {
    return {
      method: "FLIGHT_TIME",
      status: "MISSING_EVENT",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "Se necesita al menos TOE_OFF y APEX o LANDING para estimar la altura por tiempo.",
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
        1,
        config.playbackSpeedRatio,
        ...slowMotionPlaybackCandidates,
      ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1)))
      : motionProfile === "SLOW_MOTION"
        ? Array.from(new Set([
          config.playbackSpeedRatio,
          ...slowMotionPlaybackCandidates,
        ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1)))
        : [1];

  const validCandidates = playbackCandidates
    .map((candidate) => buildFlightTimeCandidatePreview(landmarks, toeOffEvent, apexEvent, landingEvent, candidate))
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

  const setupEvent = eventsByType.get("SETUP") ?? null;
  const apexEvent = eventsByType.get("APEX") ?? null;
  const toeOffEvent = eventsByType.get("TOE_OFF") ?? eventsByType.get("TAKE_OFF") ?? null;
  const landingEvent = eventsByType.get("LANDING") ?? null;

  if (!setupEvent || !apexEvent) {
    return {
      method: "CENTER_OF_MASS",
      status: "MISSING_EVENT",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "Se necesitan SETUP y APEX para medir el desplazamiento del centro de masas.",
    };
  }

  const setupGroundReferenceY = getGroundReferenceY(landmarks, setupEvent.frameIndex);
  const apexGroundReferenceY = interpolateGroundReferenceY(
    landmarks,
    apexEvent.frameIndex,
    toeOffEvent?.frameIndex ?? null,
    landingEvent?.frameIndex ?? null,
  );
  // Prefer the SETUP frame body height as the calibration ruler because the
  // athlete is standing upright there, making it the most reliable reference.
  // Fall back to the maximum visible height before take-off if SETUP is partial.
  const setupFrameBodyHeight = calculateVisibleBodyHeight(landmarks, setupEvent.frameIndex);
  const calibrationBodyHeight = (setupFrameBodyHeight !== null && setupFrameBodyHeight > 0)
    ? setupFrameBodyHeight
    : getMaxVisibleBodyHeightBeforeFrame(landmarks, toeOffEvent?.frameIndex ?? setupEvent.frameIndex);
  const setupCenterOfMassHeight = calculateCenterOfMassHeightFromGround(
    landmarks,
    setupEvent.frameIndex,
    setupGroundReferenceY,
  );
  const apexCenterOfMassHeight = calculateCenterOfMassHeightFromGround(
    landmarks,
    apexEvent.frameIndex,
    apexGroundReferenceY,
  );

  if (
    calibrationBodyHeight === null
    || setupCenterOfMassHeight === null
    || apexCenterOfMassHeight === null
  ) {
    return {
      method: "CENTER_OF_MASS",
      status: "MISSING_LANDMARK",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "No se pudieron reconstruir landmarks suficientes para medir el centro de masas respecto al suelo.",
    };
  }

  const centerOfMassDeltaNormalized = apexCenterOfMassHeight - setupCenterOfMassHeight;
  if (calibrationBodyHeight <= 0 || centerOfMassDeltaNormalized <= 0) {
    return {
      method: "CENTER_OF_MASS",
      status: "LOW_CONFIDENCE",
      valueCm: null,
      confidence: null,
      playbackSpeedRatio: null,
      notes: "La medición del centro de masas no es fiable con los landmarks actuales del video.",
    };
  }

  const valueCm = (centerOfMassDeltaNormalized / calibrationBodyHeight) * config.subjectHeightCm;
  const interpolationNote = toeOffEvent && landingEvent
    ? "El suelo durante el vuelo se interpoló entre despegue y aterrizaje para reducir el impacto de traslaciones verticales de cámara."
    : "Se usó una referencia de suelo aproximada; si la cámara se desplaza durante el vuelo, la confianza baja.";

  return {
    method: "CENTER_OF_MASS",
    status: "OK",
    valueCm: roundTo(valueCm),
    confidence: toeOffEvent && landingEvent ? 0.72 : 0.6,
    playbackSpeedRatio: null,
    notes: `Estimación basada en el CM aproximado ((caderas + hombros) / 4) medido respecto al suelo en SETUP y APEX. ${interpolationNote}`,
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
  const methods = [flightTimeMethod, centerOfMassMethod];

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
  const status = okMethods.length >= 2 && disagreementCm > toleranceCm ? "METHOD_DISAGREEMENT" : "OK";

  return {
    motionProfile,
    playbackSpeedRatio: resolvedPlaybackSpeedRatio ?? null,
    methods,
    consensusValueCm: roundTo(consensusValueCm),
    disagreementCm: okMethods.length >= 2 ? roundTo(disagreementCm) : null,
    status,
    notes: status === "METHOD_DISAGREEMENT"
      ? `La diferencia entre métodos supera la tolerancia de ${roundTo(toleranceCm)} cm.`
      : "Las mediciones disponibles permiten consolidar una altura de salto de referencia.",
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
    };
  }

  const eventsByType = buildEventsByType(eventMarkers);
  return {
    hipProgressionChecks: hipProgressionChecks.map((check) => buildHipProgressionCheckPreview(check, landmarks, eventsByType)),
    jumpHeight: jumpHeightMeasurement
      ? buildJumpHeightPreview(jumpHeightMeasurement, landmarks, eventMarkers, motionProfile)
      : null,
  };
}

import type { TechniqueProLandmarks } from "./techniquePoseExtraction";

const gravityMetersPerSecondSquared = 9.81;

const landmarkIndex = {
  NOSE: 0,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
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
  geometricHipRiseMethodEnabled: boolean;
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
  method: "FLIGHT_TIME" | "GEOMETRIC_HIP_RISE";
  status: MeasurementStatus;
  valueCm: number | null;
  confidence: number | null;
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

function getTimestampSeconds(landmarks: TechniqueProLandmarks, frameIndex: number) {
  const frame = getFrame(landmarks, frameIndex);
  if (!frame) {
    return null;
  }

  return frame.timestampMs / 1000;
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

function buildFlightTimeMethodPreview(
  config: ReferenceJumpHeightMeasurementConfig,
  landmarks: TechniqueProLandmarks,
  eventsByType: Map<string, ReferenceMeasurementEventMarker>,
  motionProfile: "REAL_TIME" | "SLOW_MOTION" | null,
): ReferenceJumpHeightMethodPreview {
  if (!config.flightTimeMethodEnabled) {
    return {
      method: "FLIGHT_TIME",
      status: "PENDING",
      valueCm: null,
      confidence: null,
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
      notes: "Se necesita al menos TOE_OFF y APEX o LANDING para estimar la altura por tiempo.",
    };
  }

  if (motionProfile === "SLOW_MOTION" && typeof config.playbackSpeedRatio !== "number") {
    return {
      method: "FLIGHT_TIME",
      status: "INVALID_MOTION_PROFILE",
      valueCm: null,
      confidence: null,
      notes: "En cámara lenta hace falta playbackSpeedRatio para corregir el tiempo de vuelo.",
    };
  }

  const playbackFactor = motionProfile === "SLOW_MOTION" ? (config.playbackSpeedRatio ?? null) : 1;
  if (playbackFactor === null) {
    return {
      method: "FLIGHT_TIME",
      status: "INVALID_MOTION_PROFILE",
      valueCm: null,
      confidence: null,
      notes: "No se pudo reconstruir el factor temporal del video analizado.",
    };
  }

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
      notes: "No se pudo reconstruir un tiempo de vuelo válido para medir la altura.",
    };
  }

  let confidence = 0.88;
  let notes = "Altura estimada a partir del tiempo entre TOE_OFF y APEX.";
  if (typeof ascentHeightCm === "number" && typeof totalFlightHeightCm === "number") {
    const disagreementCm = Math.abs(ascentHeightCm - totalFlightHeightCm);
    if (disagreementCm > 8) {
      confidence = 0.7;
      notes = `Tiempo de ascenso y tiempo total difieren ${roundTo(disagreementCm)} cm; revisar postura de aterrizaje o eventos.`;
    } else {
      notes = `Tiempo de ascenso y tiempo total coinciden dentro de ${roundTo(disagreementCm)} cm.`;
    }
  }

  return {
    method: "FLIGHT_TIME",
    status: "OK",
    valueCm: roundTo(valueCm),
    confidence: roundTo(confidence),
    notes,
  };
}

function buildGeometricHipRiseMethodPreview(
  config: ReferenceJumpHeightMeasurementConfig,
  landmarks: TechniqueProLandmarks,
  eventsByType: Map<string, ReferenceMeasurementEventMarker>,
): ReferenceJumpHeightMethodPreview {
  if (!config.geometricHipRiseMethodEnabled) {
    return {
      method: "GEOMETRIC_HIP_RISE",
      status: "PENDING",
      valueCm: null,
      confidence: null,
      notes: "Método desactivado en la configuración.",
    };
  }

  if (typeof config.subjectHeightCm !== "number") {
    return {
      method: "GEOMETRIC_HIP_RISE",
      status: "PENDING",
      valueCm: null,
      confidence: null,
      notes: "Configura la altura del sujeto para calibrar la estimación geométrica en centímetros.",
    };
  }

  const toeOffEvent = eventsByType.get("TOE_OFF") ?? eventsByType.get("TAKE_OFF") ?? null;
  const apexEvent = eventsByType.get("APEX") ?? null;
  const setupEvent = eventsByType.get("SETUP") ?? toeOffEvent;
  if (!toeOffEvent || !apexEvent || !setupEvent) {
    return {
      method: "GEOMETRIC_HIP_RISE",
      status: "MISSING_EVENT",
      valueCm: null,
      confidence: null,
      notes: "Se necesitan SETUP, TOE_OFF y APEX para la estimación geométrica de cadera.",
    };
  }

  const globalGroundReferenceY = getGlobalGroundReferenceY(landmarks);
  const calibrationTopY = getTopVisibleBodyPointY(landmarks, setupEvent.frameIndex);
  const toeOffHipY = getHipCenterY(landmarks, toeOffEvent.frameIndex);
  const apexHipY = getHipCenterY(landmarks, apexEvent.frameIndex);

  if (
    globalGroundReferenceY === null
    || calibrationTopY === null
    || toeOffHipY === null
    || apexHipY === null
  ) {
    return {
      method: "GEOMETRIC_HIP_RISE",
      status: "MISSING_LANDMARK",
      valueCm: null,
      confidence: null,
      notes: "No se pudieron reconstruir landmarks suficientes para calibrar la elevación geométrica de la cadera.",
    };
  }

  const visibleBodyHeight = globalGroundReferenceY - calibrationTopY;
  const hipRiseNormalized = toeOffHipY - apexHipY;
  if (visibleBodyHeight <= 0 || hipRiseNormalized <= 0) {
    return {
      method: "GEOMETRIC_HIP_RISE",
      status: "LOW_CONFIDENCE",
      valueCm: null,
      confidence: null,
      notes: "La escala geométrica no es fiable con los landmarks actuales del video.",
    };
  }

  const valueCm = (hipRiseNormalized / visibleBodyHeight) * config.subjectHeightCm;
  return {
    method: "GEOMETRIC_HIP_RISE",
    status: "OK",
    valueCm: roundTo(valueCm),
    confidence: 0.58,
    notes: "Estimación geométrica basada en la elevación del centro de cadera y la altura visible del sujeto en setup.",
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
  const methods = [
    buildFlightTimeMethodPreview(config, landmarks, eventsByType, motionProfile),
    buildGeometricHipRiseMethodPreview(config, landmarks, eventsByType),
  ];

  const okMethods = methods.filter((method) => method.status === "OK" && typeof method.valueCm === "number");
  if (!okMethods.length) {
    return {
      motionProfile,
      playbackSpeedRatio: config.playbackSpeedRatio,
      methods,
      consensusValueCm: null,
      disagreementCm: null,
      status: methods.some((method) => method.status === "INVALID_MOTION_PROFILE") ? "INVALID_MOTION_PROFILE" : "PENDING",
      notes: "Todavía no hay dos mediciones válidas para consolidar la altura del salto.",
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
    playbackSpeedRatio: config.playbackSpeedRatio,
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

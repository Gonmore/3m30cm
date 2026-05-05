/**
 * jumpHeightAnalyzer.ts
 *
 * Authoritative server-side jump height analysis.
 * Uses BiometricSpaceConverter (manual 2-point rim annotation) to produce
 * metric measurements instead of heuristic orange-pixel rim detection.
 *
 * Returns a BiomechanicsMasterReference-shaped object stored in
 * biomechanicsConfig.masterReference on the ProgramTemplateTechnique.
 */

import {
  BiometricSpaceConverter,
  CalibrationError,
  type CameraTracking,
  type Lm2d,
  type RimAnnotation,
  LANDMARK_INDEX,
} from "./biometricSpaceConverter.js";

const GRAVITY_CM_PER_S2 = 981; // cm/s²
const SLOW_MOTION_CANDIDATES = [0.5, 0.25] as const;

// ── Local types (mirroring web types, no cross-package import) ────────────────

interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

interface PoseFrame {
  timestampMs: number;
  landmarks: PoseLandmark[];
}

interface CameraTrackingFrame {
  timestampMs: number;
  translationX: number;
  translationY: number;
  scale: number;
  trackedPointCount: number;
}

interface RawCameraTracking {
  method: string;
  analysisWidth: number;
  analysisHeight: number;
  referenceFrameIndex: number;
  frameTransforms: CameraTrackingFrame[];
}

export interface ProLandmarks {
  schemaVersion: 1;
  fps: number;
  frameCount: number;
  frames: PoseFrame[];
  cameraTracking?: RawCameraTracking | null;
}

export interface EventMarker {
  id: string;
  label: string;
  eventType: string;
  frameIndex: number | null;
}

export interface JumpHeightConfig {
  enabled: boolean;
  subjectHeightCm: number | null;
  playbackSpeedRatio: number | null;
  flightTimeMethodEnabled: boolean;
  centerOfMassMethodEnabled: boolean;
  consensusToleranceCm: number | null;
}

export interface AnalysisInput {
  landmarks: ProLandmarks;
  rimAnnotation: RimAnnotation;
  keyEvents: EventMarker[];
  config: JumpHeightConfig;
}

// ── Result types (matching BiomechanicsMasterReference from shared) ───────────

interface MethodResult {
  method: "FLIGHT_TIME" | "CENTER_OF_MASS" | "RIM_REFERENCE";
  status: string;
  valueCm: number | null;
  confidence: number | null;
  playbackSpeedRatio: number | null;
  notes: string | null;
  comHeightAboveGroundCm?: number | null;
  dipDepthCm?: number | null;
  takeoffEfficiency?: number | null;
}

interface JointAngles {
  leftKneeDeg: number | null;
  rightKneeDeg: number | null;
  leftHipDeg: number | null;
  rightHipDeg: number | null;
}

interface ParabolaFrame {
  frameIndex: number;
  timestampMs: number;
  comHeightCm: number;
}

interface Kinematics {
  parabola: ParabolaFrame[];
  jointAngles: {
    dip: JointAngles | null;
    takeoff: JointAngles | null;
    apex: JointAngles | null;
  };
}

export interface CalibrationResult {
  normPerCmV: number;
  normPerCmH: number;
  groundY_norm: number;
  rimCenterY_norm: number;
  scaleSource: "rim-manual-2pt";
}

export interface MasterReference {
  schemaVersion: 2;
  calibration: CalibrationResult;
  jumpHeight: {
    motionProfile: "REAL_TIME" | "SLOW_MOTION" | null;
    playbackSpeedRatio: number | null;
    methods: MethodResult[];
    consensusValueCm: number | null;
    disagreementCm: number | null;
    status: string;
    notes: string | null;
  };
  kinematics: Kinematics;
  computedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function average(values: Array<number | null>): number | null {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return valid.length === 0 ? null : valid.reduce((s, v) => s + v, 0) / valid.length;
}

function roundTo(v: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function getLm(landmarks: ProLandmarks, frameIndex: number, idx: number): Lm2d | null {
  const lm = landmarks.frames[frameIndex]?.landmarks[idx];
  return lm ? { x: lm.x, y: lm.y } : null;
}

function getRawY(landmarks: ProLandmarks, frameIndex: number, idx: number): number | null {
  return getLm(landmarks, frameIndex, idx)?.y ?? null;
}

function getRawX(landmarks: ProLandmarks, frameIndex: number, idx: number): number | null {
  return getLm(landmarks, frameIndex, idx)?.x ?? null;
}

function getTimestampSec(landmarks: ProLandmarks, frameIndex: number): number | null {
  const f = landmarks.frames[frameIndex];
  return f ? f.timestampMs / 1000 : null;
}

/** Average of top-2 highest foot Y values (raw, y-down). */
function getRawGroundY(landmarks: ProLandmarks, frameIndex: number): number | null {
  const footIndices = [27, 28, 29, 30, 31, 32];
  const ys = footIndices
    .map((i) => getRawY(landmarks, frameIndex, i))
    .filter((y): y is number => typeof y === "number" && Number.isFinite(y))
    .sort((a, b) => b - a)
    .slice(0, 2);
  return ys.length > 0 ? ys.reduce((s, v) => s + v, 0) / ys.length : null;
}

function getRawCoM(landmarks: ProLandmarks, frameIndex: number): number | null {
  return average([
    getRawY(landmarks, frameIndex, LANDMARK_INDEX.LEFT_HIP),
    getRawY(landmarks, frameIndex, LANDMARK_INDEX.RIGHT_HIP),
    getRawY(landmarks, frameIndex, LANDMARK_INDEX.LEFT_SHOULDER),
    getRawY(landmarks, frameIndex, LANDMARK_INDEX.RIGHT_SHOULDER),
  ]);
}

function getRawBodyCenterX(landmarks: ProLandmarks, frameIndex: number): number | null {
  return average([
    getRawX(landmarks, frameIndex, LANDMARK_INDEX.LEFT_HIP),
    getRawX(landmarks, frameIndex, LANDMARK_INDEX.RIGHT_HIP),
    getRawX(landmarks, frameIndex, LANDMARK_INDEX.LEFT_SHOULDER),
    getRawX(landmarks, frameIndex, LANDMARK_INDEX.RIGHT_SHOULDER),
  ]);
}

function getRawHeadY(landmarks: ProLandmarks, frameIndex: number): number | null {
  return getRawY(landmarks, frameIndex, LANDMARK_INDEX.NOSE);
}

function buildEventMap(events: EventMarker[]): Map<string, EventMarker> {
  const map = new Map<string, EventMarker>();
  for (const e of events) {
    if (e.frameIndex !== null && !map.has(e.eventType)) {
      map.set(e.eventType, e);
    }
  }
  return map;
}

function buildCameraTrackingArg(raw: RawCameraTracking | null | undefined): CameraTracking | null {
  if (!raw) return null;
  return {
    referenceFrameIndex: raw.referenceFrameIndex,
    frameTransforms: raw.frameTransforms.map((t) => ({
      translationX: t.translationX,
      translationY: t.translationY,
      scale: t.scale,
    })),
  };
}

function computeJointAngles(landmarks: ProLandmarks, frameIndex: number): JointAngles {
  const lm = (idx: number) => getLm(landmarks, frameIndex, idx);

  // Knee angle: HIP → KNEE → ANKLE
  const leftKneeDeg = BiometricSpaceConverter.computeAngle(
    lm(LANDMARK_INDEX.LEFT_HIP),
    lm(LANDMARK_INDEX.LEFT_KNEE),
    lm(LANDMARK_INDEX.LEFT_ANKLE),
  );
  const rightKneeDeg = BiometricSpaceConverter.computeAngle(
    lm(LANDMARK_INDEX.RIGHT_HIP),
    lm(LANDMARK_INDEX.RIGHT_KNEE),
    lm(LANDMARK_INDEX.RIGHT_ANKLE),
  );

  // Hip angle: SHOULDER → HIP → KNEE
  const leftHipDeg = BiometricSpaceConverter.computeAngle(
    lm(LANDMARK_INDEX.LEFT_SHOULDER),
    lm(LANDMARK_INDEX.LEFT_HIP),
    lm(LANDMARK_INDEX.LEFT_KNEE),
  );
  const rightHipDeg = BiometricSpaceConverter.computeAngle(
    lm(LANDMARK_INDEX.RIGHT_SHOULDER),
    lm(LANDMARK_INDEX.RIGHT_HIP),
    lm(LANDMARK_INDEX.RIGHT_KNEE),
  );

  return {
    leftKneeDeg: leftKneeDeg !== null ? roundTo(leftKneeDeg, 1) : null,
    rightKneeDeg: rightKneeDeg !== null ? roundTo(rightKneeDeg, 1) : null,
    leftHipDeg: leftHipDeg !== null ? roundTo(leftHipDeg, 1) : null,
    rightHipDeg: rightHipDeg !== null ? roundTo(rightHipDeg, 1) : null,
  };
}

// ── Method builders ───────────────────────────────────────────────────────────

function buildFlightTimeMethod(
  landmarks: ProLandmarks,
  eventMap: Map<string, EventMarker>,
  config: JumpHeightConfig,
  motionProfile: "REAL_TIME" | "SLOW_MOTION" | null,
  comReferenceCm: number | null,
): MethodResult {
  if (!config.flightTimeMethodEnabled) {
    return {
      method: "FLIGHT_TIME", status: "PENDING",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: "Método desactivado en la configuración.",
    };
  }

  const dipEvent = eventMap.get("DIP") ?? null;
  const toeOffEvent = eventMap.get("TOE_OFF") ?? eventMap.get("TAKE_OFF") ?? null;
  const startEvent = dipEvent ?? toeOffEvent;
  const apexEvent = eventMap.get("APEX") ?? null;
  const landingEvent = eventMap.get("LANDING") ?? null;

  if (!startEvent || !landingEvent || startEvent.frameIndex === null || landingEvent.frameIndex === null) {
    return {
      method: "FLIGHT_TIME", status: "MISSING_EVENT",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: "Se necesita DIP (o TOE_OFF) y LANDING para estimar la altura por tiempo.",
    };
  }

  const playbackCandidates: number[] =
    motionProfile === "REAL_TIME" ? [1] :
    comReferenceCm !== null
      ? Array.from(new Set([config.playbackSpeedRatio, ...SLOW_MOTION_CANDIDATES].filter(
          (v): v is number => typeof v === "number" && v > 0 && v < 1 && Number.isFinite(v),
        )))
      : typeof config.playbackSpeedRatio === "number"
        ? [config.playbackSpeedRatio]
        : [0.5];

  const candidates = playbackCandidates.map((factor) => {
    const t0 = getTimestampSec(landmarks, startEvent.frameIndex!) ?? 0;
    const tL = getTimestampSec(landmarks, landingEvent.frameIndex!) ?? 0;
    const tA = apexEvent?.frameIndex !== null && apexEvent?.frameIndex !== undefined
      ? getTimestampSec(landmarks, apexEvent.frameIndex)
      : null;

    const ascentSec = tA !== null ? Math.max((tA - t0) * factor, 0) : null;
    const totalSec = Math.max((tL - t0) * factor, 0);

    const ascentCm = ascentSec !== null
      ? 0.5 * (GRAVITY_CM_PER_S2 / 100) * ascentSec * ascentSec * 100
      : null;
    const totalCm = (GRAVITY_CM_PER_S2 / 100) * totalSec * totalSec * 100 / 8;

    const valueCm = ascentCm ?? totalCm;
    if (!Number.isFinite(valueCm) || valueCm <= 0 || valueCm > 200) return null;

    return { valueCm: roundTo(valueCm), factor, ascentCm, totalCm };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  if (candidates.length === 0) {
    return {
      method: "FLIGHT_TIME", status: "MISSING_EVENT",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: "No se pudo reconstruir un tiempo de vuelo válido para medir la altura.",
    };
  }

  const selected = candidates.sort((a, b) => {
    if (comReferenceCm !== null) {
      return Math.abs(a.valueCm - comReferenceCm) - Math.abs(b.valueCm - comReferenceCm);
    }
    const gapA = a.ascentCm !== null && a.totalCm ? Math.abs(a.ascentCm - a.totalCm) : 999;
    const gapB = b.ascentCm !== null && b.totalCm ? Math.abs(b.ascentCm - b.totalCm) : 999;
    return gapA - gapB;
  })[0]!;

  let confidence = 0.88;
  let notes = `Altura estimada a partir del tiempo de vuelo (factor ${selected.factor}).`;
  if (comReferenceCm !== null) {
    const diff = Math.abs(selected.valueCm - comReferenceCm);
    if (diff <= (config.consensusToleranceCm ?? 6)) {
      confidence = Math.min(confidence + 0.04, 0.94);
    } else {
      confidence = Math.max(confidence - 0.12, 0.55);
    }
    notes += ` Diferencia vs CoM: ${roundTo(diff)} cm.`;
  }

  return {
    method: "FLIGHT_TIME",
    status: "OK",
    valueCm: selected.valueCm,
    confidence: roundTo(confidence),
    playbackSpeedRatio: roundTo(selected.factor, 3),
    notes,
  };
}

function buildCenterOfMassMethod(
  landmarks: ProLandmarks,
  eventMap: Map<string, EventMarker>,
  config: JumpHeightConfig,
  converter: BiometricSpaceConverter,
): MethodResult {
  if (!config.centerOfMassMethodEnabled) {
    return {
      method: "CENTER_OF_MASS", status: "PENDING",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: "Método desactivado en la configuración.",
    };
  }

  const dipEvent = eventMap.get("DIP") ?? null;
  const apexEvent = eventMap.get("APEX") ?? null;
  const setupEvent = eventMap.get("SETUP") ?? null;

  if (!dipEvent || dipEvent.frameIndex === null || !apexEvent || apexEvent.frameIndex === null) {
    return {
      method: "CENTER_OF_MASS", status: "MISSING_EVENT",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: "Se necesitan DIP y APEX para medir el desplazamiento del CoM.",
    };
  }

  const comY_dip = getRawCoM(landmarks, dipEvent.frameIndex);
  const comY_apex = getRawCoM(landmarks, apexEvent.frameIndex);

  if (comY_dip === null || comY_apex === null) {
    return {
      method: "CENTER_OF_MASS", status: "MISSING_LANDMARK",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: "No se pudieron reconstruir landmarks del torso suficientes.",
    };
  }

  const comDelta = comY_dip - comY_apex; // positive = CoM moved up
  if (comDelta <= 0) {
    return {
      method: "CENTER_OF_MASS", status: "LOW_CONFIDENCE",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: "El CoM no subió entre DIP y APEX. Verifica la ubicación de los eventos.",
    };
  }

  const valueCm = comDelta / converter.normPerCmV;

  if (!Number.isFinite(valueCm) || valueCm <= 0 || valueCm > 200) {
    return {
      method: "CENTER_OF_MASS", status: "LOW_CONFIDENCE",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: `Valor calculado (${roundTo(valueCm)} cm) fuera del rango físico posible. Verifica la anotación del aro.`,
    };
  }

  const comHeightAboveGroundCm = roundTo(converter.toMetricY(comY_apex));

  let dipDepthCm: number | null = null;
  if (setupEvent && setupEvent.frameIndex !== null) {
    const comY_setup = getRawCoM(landmarks, setupEvent.frameIndex);
    if (comY_setup !== null) {
      dipDepthCm = roundTo((comY_dip - comY_setup) / converter.normPerCmV);
    }
  }

  const takeoffEfficiency = typeof dipDepthCm === "number" && dipDepthCm > 2
    ? roundTo(valueCm / dipDepthCm, 2) : null;

  return {
    method: "CENTER_OF_MASS",
    status: "OK",
    valueCm: roundTo(valueCm),
    confidence: 0.93, // manual calibration, high confidence
    playbackSpeedRatio: null,
    notes: "Elevación del CoM desde DIP hasta APEX, calibrado por anotación manual del aro (305 cm / 45.72 cm).",
    comHeightAboveGroundCm,
    dipDepthCm,
    takeoffEfficiency,
  };
}

function buildRimReferenceMethod(
  landmarks: ProLandmarks,
  eventMap: Map<string, EventMarker>,
  config: JumpHeightConfig,
  converter: BiometricSpaceConverter,
): MethodResult {
  if (typeof config.subjectHeightCm !== "number") {
    return {
      method: "RIM_REFERENCE", status: "PENDING",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: "Configura la estatura del atleta para calcular la referencia de aro.",
    };
  }

  const apexEvent = eventMap.get("APEX") ?? null;
  if (!apexEvent || apexEvent.frameIndex === null) {
    return {
      method: "RIM_REFERENCE", status: "MISSING_EVENT",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: "Se necesita el evento APEX para medir la referencia de aro.",
    };
  }

  const rim = converter.getProjectedRimAtFrame(apexEvent.frameIndex);
  const headY = getRawHeadY(landmarks, apexEvent.frameIndex);
  const athleteX = getRawBodyCenterX(landmarks, apexEvent.frameIndex);

  if (headY === null || athleteX === null) {
    return {
      method: "RIM_REFERENCE", status: "MISSING_LANDMARK",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: "No se pudo determinar la posición de la cabeza o el atleta en el frame APEX.",
    };
  }

  // Interpolate rim Y at the athlete's X position (perspective correction)
  let yRim305: number;
  if (Math.abs(rim.xRight - rim.xLeft) > 0.001) {
    const t = (athleteX - rim.xLeft) / (rim.xRight - rim.xLeft);
    yRim305 = rim.yLeft + t * (rim.yRight - rim.yLeft);
  } else {
    yRim305 = rim.yCenter;
  }

  // rimClearanceCm > 0 means head is above the rim
  const rimClearanceCm = (yRim305 - headY) / converter.normPerCmV;

  // jumpHeightCm = how much the athlete's CoM rose = how much the head rose
  // Standing: head at subjectHeightCm above ground
  // Apex: head at (305 + rimClearanceCm) above ground
  const valueCm = (305 - config.subjectHeightCm) + rimClearanceCm;

  if (!Number.isFinite(valueCm) || valueCm <= 0 || valueCm > 200) {
    return {
      method: "RIM_REFERENCE", status: "LOW_CONFIDENCE",
      valueCm: null, confidence: null, playbackSpeedRatio: null,
      notes: `Valor calculado (${roundTo(valueCm)} cm) fuera del rango físico. Verifica la anotación del aro y la estatura del atleta.`,
    };
  }

  return {
    method: "RIM_REFERENCE",
    status: "OK",
    valueCm: roundTo(valueCm),
    confidence: 0.90,
    playbackSpeedRatio: null,
    notes: `Cabeza a ${roundTo(rimClearanceCm)} cm del aro en APEX. Fórmula: (305 - ${config.subjectHeightCm}) + ${roundTo(rimClearanceCm)} = ${roundTo(valueCm)} cm.`,
  };
}

function buildConsensus(
  methods: MethodResult[],
  toleranceCm: number,
): { consensusValueCm: number | null; disagreementCm: number | null; status: string; notes: string | null } {
  const okValues = methods
    .filter((m) => m.status === "OK" && typeof m.valueCm === "number")
    .map((m) => m.valueCm as number);

  if (okValues.length === 0) {
    return { consensusValueCm: null, disagreementCm: null, status: "MISSING_EVENT", notes: "Ningún método produjo un valor válido." };
  }

  if (okValues.length === 1) {
    return { consensusValueCm: roundTo(okValues[0]!), disagreementCm: null, status: "OK", notes: null };
  }

  const maxDisagreement = Math.max(...okValues) - Math.min(...okValues);
  // Prefer CoM method when available (manual calibration is most accurate)
  const comMethod = methods.find((m) => m.method === "CENTER_OF_MASS" && m.status === "OK");
  const consensusValueCm = comMethod?.valueCm ?? roundTo(okValues.reduce((s, v) => s + v, 0) / okValues.length);

  if (maxDisagreement > toleranceCm) {
    return {
      consensusValueCm,
      disagreementCm: roundTo(maxDisagreement),
      status: "METHOD_DISAGREEMENT",
      notes: `Los métodos difieren ${roundTo(maxDisagreement)} cm (tolerancia: ${toleranceCm} cm).`,
    };
  }

  return {
    consensusValueCm,
    disagreementCm: roundTo(maxDisagreement),
    status: "OK",
    notes: null,
  };
}

function buildKinematics(
  landmarks: ProLandmarks,
  eventMap: Map<string, EventMarker>,
  converter: BiometricSpaceConverter,
): Kinematics {
  const toeOffEvent = eventMap.get("TOE_OFF") ?? eventMap.get("TAKE_OFF") ?? eventMap.get("DIP") ?? null;
  const landingEvent = eventMap.get("LANDING") ?? null;
  const apexEvent = eventMap.get("APEX") ?? null;
  const dipEvent = eventMap.get("DIP") ?? null;

  // Parabola: one sample per frame from take-off to landing
  const parabola: ParabolaFrame[] = [];
  if (
    toeOffEvent && toeOffEvent.frameIndex !== null &&
    landingEvent && landingEvent.frameIndex !== null
  ) {
    for (let fi = toeOffEvent.frameIndex; fi <= landingEvent.frameIndex; fi++) {
      const comY = getRawCoM(landmarks, fi);
      const frame = landmarks.frames[fi];
      if (comY !== null && frame) {
        parabola.push({
          frameIndex: fi,
          timestampMs: frame.timestampMs,
          comHeightCm: roundTo(converter.toMetricY(comY), 1),
        });
      }
    }
  }

  // Joint angles at key milestones
  const dipAngles = dipEvent && dipEvent.frameIndex !== null
    ? computeJointAngles(landmarks, dipEvent.frameIndex) : null;
  const takeoffAngles = (eventMap.get("TOE_OFF") ?? eventMap.get("TAKE_OFF")) !== undefined
    && (eventMap.get("TOE_OFF") ?? eventMap.get("TAKE_OFF"))!.frameIndex !== null
    ? computeJointAngles(landmarks, (eventMap.get("TOE_OFF") ?? eventMap.get("TAKE_OFF"))!.frameIndex!)
    : null;
  const apexAngles = apexEvent && apexEvent.frameIndex !== null
    ? computeJointAngles(landmarks, apexEvent.frameIndex) : null;

  return {
    parabola,
    jointAngles: {
      dip: dipAngles,
      takeoff: takeoffAngles,
      apex: apexAngles,
    },
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Analyze a jump from landmarks + manual rim annotation.
 * Throws CalibrationError if the rim annotation is geometrically invalid.
 */
export function analyze(input: AnalysisInput): MasterReference {
  const { landmarks, rimAnnotation, keyEvents, config } = input;

  const eventMap = buildEventMap(keyEvents);
  const dipEvent = eventMap.get("DIP") ?? null;

  if (!dipEvent || dipEvent.frameIndex === null) {
    throw new CalibrationError("DIP event is required for spatial calibration.");
  }

  const dipLandmarks: Array<Lm2d | null> = (landmarks.frames[dipEvent.frameIndex]?.landmarks ?? []).map(
    (lm) => ({ x: lm.x, y: lm.y }),
  );

  const cameraTracking = buildCameraTrackingArg(landmarks.cameraTracking ?? null);

  // Build the converter — may throw CalibrationError
  const converter = new BiometricSpaceConverter(
    rimAnnotation,
    dipEvent.frameIndex,
    dipLandmarks,
    cameraTracking,
  );

  const motionProfile: "REAL_TIME" | "SLOW_MOTION" | null =
    typeof config.playbackSpeedRatio === "number" && config.playbackSpeedRatio < 1
      ? "SLOW_MOTION"
      : "REAL_TIME";

  // Run methods (CoM first to supply reference for flight-time candidate selection)
  const comResult = buildCenterOfMassMethod(landmarks, eventMap, config, converter);
  const ftResult = buildFlightTimeMethod(
    landmarks, eventMap, config, motionProfile,
    comResult.status === "OK" ? comResult.valueCm : null,
  );
  const rimResult = buildRimReferenceMethod(landmarks, eventMap, config, converter);

  const methods = [ftResult, comResult, rimResult];
  const toleranceCm = config.consensusToleranceCm ?? 6;
  const consensus = buildConsensus(methods, toleranceCm);

  const kinematics = buildKinematics(landmarks, eventMap, converter);

  return {
    schemaVersion: 2,
    calibration: {
      ...converter.getCalibration(),
    },
    jumpHeight: {
      motionProfile,
      playbackSpeedRatio: config.playbackSpeedRatio ?? null,
      methods,
      ...consensus,
    },
    kinematics,
    computedAt: new Date().toISOString(),
  };
}

export { CalibrationError };

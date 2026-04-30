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

export interface MobileTechniqueBiomechanicsConfig {
  referenceMotionProfile?: MobileTechniqueReferenceMotionProfile | null;
  hipProgressionChecks?: MobileTechniqueBiomechanicsHipProgressionCheck[];
  jumpHeightMeasurement?: MobileTechniqueBiomechanicsJumpHeightMeasurementConfig | null;
  keyEvents?: Array<{ eventType: string; label?: string | null }>;
}

export interface AthleteTechniqueAutoAnalysis {
  landmarks: TechniqueProLandmarks;
  detectedEvents: AutoDetectedTechniqueKeyEvent[];
  detectionDebug: AutoDetectedTechniqueDebugData;
  measurements: ReferenceBiomechanicsMeasurementsPreview;
  findings: string[];
  analysisJson: Record<string, unknown>;
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
    playbackSpeedRatio: config.playbackSpeedRatio ?? null,
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
) {
  const findings: string[] = [];
  const detectedEventTypes = new Set(detectedEvents.map((event) => event.eventType));

  const missingEvents = Array.from(expectedEvents).filter((eventType) => !detectedEventTypes.has(eventType as AutoDetectedTechniqueKeyEvent["eventType"]));
  if (missingEvents.length) {
    findings.push(`Eventos no detectados: ${missingEvents.join(", ")}.`);
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
}) : AthleteTechniqueAutoAnalysis {
  const detectionResult = detectTechniqueKeyEventsWithDebug(input.landmarks);
  const normalizedJumpHeightConfig = normalizeJumpHeightConfig(
    input.biomechanicsConfig?.jumpHeightMeasurement,
    input.athleteHeightCm,
  );

  const measurements = buildReferenceBiomechanicsMeasurementsPreview(
    input.landmarks,
    detectionResult.events.map((event) => ({
      id: `athlete-${event.eventType}`,
      label: event.eventType,
      eventType: event.eventType,
      frameIndex: event.frameIndex,
    })),
    input.biomechanicsConfig?.hipProgressionChecks ?? [],
    normalizedJumpHeightConfig,
    input.biomechanicsConfig?.referenceMotionProfile ?? null,
  );

  const findings = buildFindings(
    buildExpectedEventSet(input.biomechanicsConfig),
    detectionResult.events,
    measurements,
  );

  const analysisJson = {
    schemaVersion: 1,
    analyzedAt: new Date().toISOString(),
    subjectHeightCm: input.athleteHeightCm,
    poseSequence: input.landmarks,
    detectedEvents: detectionResult.events.map((event) => ({
      id: `athlete-${event.eventType}`,
      label: event.eventType,
      eventType: event.eventType,
      frameIndex: event.frameIndex,
      timestampMs: input.landmarks.frames[event.frameIndex]?.timestampMs ?? null,
      confidence: event.confidence,
      detector: event.detector,
      source: "AUTO_DETECTED",
    })),
    measuredChecks: {
      hipProgressionChecks: measurements.hipProgressionChecks,
      angleChecks: [],
      pointChecks: [],
      trajectoryChecks: [],
    },
    jumpHeightMeasurement: measurements.jumpHeight,
    findings,
  } satisfies Record<string, unknown>;

  return {
    landmarks: input.landmarks,
    detectedEvents: detectionResult.events,
    detectionDebug: detectionResult.debug,
    measurements,
    findings,
    analysisJson,
  };
}
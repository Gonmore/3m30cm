import { DayType, MediaKind, Prisma, Role, SeriesProtocol } from "@prisma/client";
import { type Request, type Response, Router } from "express";
import multer from "multer";
import { z } from "zod";

import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { parseExerciseTaskBlock } from "../lib/exercise-task-import.js";
import { analyze as analyzeBiomechanics, CalibrationError } from "../lib/jumpHeightAnalyzer.js";
import { deleteProgramTechniqueMedia, uploadProgramTechniqueMedia } from "../lib/minio.js";
import { ensureTemplateTechniqueStructure } from "../lib/program-template-techniques.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const prescriptionSchema = z.object({
  id: z.string().optional(),
  exerciseId: z.string().min(1),
  orderIndex: z.number().int().positive(),
  seriesProtocol: z.nativeEnum(SeriesProtocol).default(SeriesProtocol.NONE),
  blockLabel: z.string().trim().nullable().optional(),
  sets: z.number().int().positive().nullable().optional(),
  repsText: z.string().trim().nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  restSeconds: z.number().int().nonnegative().nullable().optional(),
  loadText: z.string().trim().nullable().optional(),
  tempoText: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const replacePrescriptionsSchema = z.object({
  prescriptions: z.array(prescriptionSchema).min(1),
});

const createTemplateSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(2).regex(/^[A-Z0-9-]+$/, "Code must be uppercase letters, digits and hyphens"),
  description: z.string().trim().optional(),
  cycleLengthDays: z.number().int().min(1).max(365).default(14),
});

const updateTemplateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  description: z.string().trim().nullable().optional(),
  techniqueTitle: z.string().trim().nullable().optional(),
  techniqueDescription: z.string().trim().nullable().optional(),
  cycleLengthDays: z.number().int().min(1).max(365).optional(),
});

const techniquePoseLandmarkSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  visibility: z.number().finite().min(0).max(1).optional(),
  presence: z.number().finite().min(0).max(1).optional(),
});

const techniquePoseFrameSchema = z.object({
  timestampMs: z.number().finite().nonnegative(),
  landmarks: z.array(techniquePoseLandmarkSchema).length(33),
});

const techniqueCameraTrackingFrameSchema = z.object({
  timestampMs: z.number().finite().nonnegative(),
  translationX: z.number().finite(),
  translationY: z.number().finite(),
  scale: z.number().finite().positive(),
  trackedPointCount: z.number().int().nonnegative(),
});

const techniqueCameraTrackingSchema = z.object({
  method: z.literal("background-patch-tracking"),
  analysisWidth: z.number().int().positive(),
  analysisHeight: z.number().int().positive(),
  referenceFrameIndex: z.number().int().nonnegative(),
  frameTransforms: z.array(techniqueCameraTrackingFrameSchema).max(10000),
});

const techniqueRimReferenceSchema = z.object({
  detected: z.boolean(),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  xLeft: z.number().finite().min(0).max(1).optional(),
  yLeft: z.number().finite().min(0).max(1).optional(),
  xRight: z.number().finite().min(0).max(1).optional(),
  yRight: z.number().finite().min(0).max(1).optional(),
  confidence: z.number().finite().min(0).max(1),
  referenceFrameIndex: z.number().int().nonnegative(),
  method: z.literal("orange-rim-heuristic"),
});

const rimAnnotationSchema = z.object({
  frameIndex: z.number().int().nonnegative(),
  xLeft: z.number().finite().min(0).max(1),
  yLeft: z.number().finite().min(0).max(1),
  xRight: z.number().finite().min(0).max(1),
  yRight: z.number().finite().min(0).max(1),
  annotatedAt: z.string().datetime(),
});

const techniqueProLandmarksSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.string().trim().min(1).max(64),
  keypointsModel: z.string().trim().min(1).max(64),
  normalization: z.string().trim().min(1).max(128),
  fps: z.number().finite().positive().max(240),
  frameCount: z.number().int().nonnegative().max(10000),
  durationMs: z.number().finite().nonnegative().optional(),
  frames: z.array(techniquePoseFrameSchema).max(10000),
  cameraTracking: techniqueCameraTrackingSchema.nullable().optional(),
  rimReference: techniqueRimReferenceSchema.nullable().optional(),
  rimAnnotation: rimAnnotationSchema.nullable().optional(),
}).superRefine((value, context) => {
  if (value.frameCount !== value.frames.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "frameCount must match frames.length",
      path: ["frameCount"],
    });
  }

  for (let index = 1; index < value.frames.length; index += 1) {
    const currentFrame = value.frames[index];
    const previousFrame = value.frames[index - 1];

    if (!currentFrame || !previousFrame) {
      continue;
    }

    if (currentFrame.timestampMs < previousFrame.timestampMs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "frames timestamps must be monotonic",
        path: ["frames", index, "timestampMs"],
      });
      break;
    }
  }
});

const techniqueAssetUrlSchema = z.string().trim().min(1).refine(
  (value) => {
    if (value.startsWith("/api/v1/assets/")) {
      return true;
    }

    return z.string().url().safeParse(value).success;
  },
  { message: "proVideoUrl must be an absolute URL or an internal asset path" },
);

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
const techniqueBiomechanicsEventTypes = [
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
const techniqueBiomechanicsAngleSampleModes = ["AT_EVENT", "WINDOW_MIN", "WINDOW_MAX", "WINDOW_AVERAGE"] as const;
const techniqueBiomechanicsTrajectoryMetrics = ["DISPLACEMENT", "RANGE", "STABILITY"] as const;
const techniqueBiomechanicsTrajectoryAxes = ["X", "Y"] as const;
const techniqueBiomechanicsTrajectoryReferenceModes = ["ABSOLUTE", "DELTA_FROM_START"] as const;
const techniqueBiomechanicsPreferredDirections = ["ANY", "LEFT_TO_RIGHT", "RIGHT_TO_LEFT"] as const;
const techniqueBiomechanicsNormalizationModes = ["AUTO", "MANUAL_ONLY"] as const;
const techniqueBiomechanicsEventSources = ["AUTO", "MANUAL", "HYBRID"] as const;
const techniqueBiomechanicsEventDetectors = ["HIP_FOOT_HEURISTIC_V1"] as const;
const techniqueBiomechanicsDerivedLandmarks = ["HIP_CENTER"] as const;
const techniqueBiomechanicsGroundReferenceModes = ["LOWEST_FOOT"] as const;
const techniqueBiomechanicsProgressionNormalizationModes = ["PERCENT_OF_TOTAL_DROP"] as const;
const techniqueBiomechanicsEventTypeOrder = Object.fromEntries(
  techniqueBiomechanicsEventTypes.map((eventType, index) => [eventType, index]),
) as Record<(typeof techniqueBiomechanicsEventTypes)[number], number>;

const techniqueBiomechanicsFocusPointSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  landmark: z.enum(poseLandmarkNames),
  cue: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const techniqueBiomechanicsPointCheckSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  landmark: z.enum(poseLandmarkNames),
  axis: z.enum(techniqueBiomechanicsTrajectoryAxes),
  referenceMode: z.enum(techniqueBiomechanicsTrajectoryReferenceModes),
  anchorEventId: z.string().trim().min(1).max(80).nullable().optional(),
  anchorEventType: z.enum(techniqueBiomechanicsEventTypes).nullable().optional(),
  windowStartEventId: z.string().trim().min(1).max(80).nullable().optional(),
  windowEndEventId: z.string().trim().min(1).max(80).nullable().optional(),
  sampleMode: z.enum(techniqueBiomechanicsAngleSampleModes).nullable().optional(),
  targetMin: z.number().finite().nullable().optional(),
  targetMax: z.number().finite().nullable().optional(),
  phase: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
}).superRefine((value, context) => {
  if (
    typeof value.targetMin === "number"
    && typeof value.targetMax === "number"
    && value.targetMin > value.targetMax
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "targetMin must be lower than targetMax",
      path: ["targetMin"],
    });
  }

  if ((value.windowStartEventId && !value.windowEndEventId) || (!value.windowStartEventId && value.windowEndEventId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "windowStartEventId and windowEndEventId must be provided together",
      path: ["windowStartEventId"],
    });
  }
});

const techniqueBiomechanicsAngleCheckSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  pointA: z.enum(poseLandmarkNames),
  vertex: z.enum(poseLandmarkNames),
  pointC: z.enum(poseLandmarkNames),
  plane: z.enum(["SAGITTAL_2D", "FRONTAL_2D", "TRANSVERSE_PROXY"]),
  anchorEventId: z.string().trim().min(1).max(80).nullable().optional(),
  anchorEventType: z.enum(techniqueBiomechanicsEventTypes).nullable().optional(),
  windowStartEventId: z.string().trim().min(1).max(80).nullable().optional(),
  windowEndEventId: z.string().trim().min(1).max(80).nullable().optional(),
  sampleMode: z.enum(techniqueBiomechanicsAngleSampleModes).nullable().optional(),
  targetMinDeg: z.number().finite().min(0).max(360).nullable().optional(),
  targetMaxDeg: z.number().finite().min(0).max(360).nullable().optional(),
  phase: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
}).superRefine((value, context) => {
  if (value.pointA === value.vertex || value.pointC === value.vertex || value.pointA === value.pointC) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Angle points must be different",
      path: ["vertex"],
    });
  }

  if (
    typeof value.targetMinDeg === "number"
    && typeof value.targetMaxDeg === "number"
    && value.targetMinDeg > value.targetMaxDeg
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "targetMinDeg must be lower than targetMaxDeg",
      path: ["targetMinDeg"],
    });
  }

  if ((value.windowStartEventId && !value.windowEndEventId) || (!value.windowStartEventId && value.windowEndEventId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "windowStartEventId and windowEndEventId must be provided together",
      path: ["windowStartEventId"],
    });
  }
});

const techniqueBiomechanicsTrajectoryCheckSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  landmark: z.enum(poseLandmarkNames),
  windowStartEventId: z.string().trim().min(1).max(80).nullable().optional(),
  windowEndEventId: z.string().trim().min(1).max(80).nullable().optional(),
  metric: z.enum(techniqueBiomechanicsTrajectoryMetrics),
  axis: z.enum(techniqueBiomechanicsTrajectoryAxes),
  referenceMode: z.enum(techniqueBiomechanicsTrajectoryReferenceModes),
  targetMin: z.number().finite().nullable().optional(),
  targetMax: z.number().finite().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
}).superRefine((value, context) => {
  if (!value.windowStartEventId || !value.windowEndEventId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Trajectory checks require a start and end event",
      path: ["windowStartEventId"],
    });
  }

  if (
    typeof value.targetMin === "number"
    && typeof value.targetMax === "number"
    && value.targetMin > value.targetMax
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "targetMin must be lower than targetMax",
      path: ["targetMin"],
    });
  }
});

const techniqueBiomechanicsHipProgressionStepSchema = z.object({
  eventType: z.enum(techniqueBiomechanicsEventTypes),
  targetCumulativeDropMinPercent: z.number().finite().min(0).max(100).nullable().optional(),
  targetCumulativeDropMaxPercent: z.number().finite().min(0).max(100).nullable().optional(),
}).superRefine((value, context) => {
  if (
    typeof value.targetCumulativeDropMinPercent === "number"
    && typeof value.targetCumulativeDropMaxPercent === "number"
    && value.targetCumulativeDropMinPercent > value.targetCumulativeDropMaxPercent
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "targetCumulativeDropMinPercent must be lower than targetCumulativeDropMaxPercent",
      path: ["targetCumulativeDropMinPercent"],
    });
  }
});

const techniqueBiomechanicsHipProgressionCheckSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  derivedLandmark: z.enum(techniqueBiomechanicsDerivedLandmarks),
  axis: z.literal("Y"),
  groundReferenceMode: z.enum(techniqueBiomechanicsGroundReferenceModes),
  normalizationMode: z.enum(techniqueBiomechanicsProgressionNormalizationModes),
  requireMonotonic: z.boolean().default(true),
  steps: z.array(techniqueBiomechanicsHipProgressionStepSchema).min(2).max(6),
  notes: z.string().trim().nullable().optional(),
}).superRefine((value, context) => {
  const seenEvents = new Set<string>();

  value.steps.forEach((step, index) => {
    if (seenEvents.has(step.eventType)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Hip progression events must be unique",
        path: ["steps", index, "eventType"],
      });
    }
    seenEvents.add(step.eventType);

    if (index === 0) {
      return;
    }

    const previousStep = value.steps[index - 1];
    if (!previousStep) {
      return;
    }

    if (techniqueBiomechanicsEventTypeOrder[step.eventType] < techniqueBiomechanicsEventTypeOrder[previousStep.eventType]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Hip progression events must follow gesture order",
        path: ["steps", index, "eventType"],
      });
    }

    if (
      typeof step.targetCumulativeDropMinPercent === "number"
      && typeof previousStep.targetCumulativeDropMinPercent === "number"
      && step.targetCumulativeDropMinPercent < previousStep.targetCumulativeDropMinPercent
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Step minimum cumulative drop must be monotonic",
        path: ["steps", index, "targetCumulativeDropMinPercent"],
      });
    }

    if (
      typeof step.targetCumulativeDropMaxPercent === "number"
      && typeof previousStep.targetCumulativeDropMaxPercent === "number"
      && step.targetCumulativeDropMaxPercent < previousStep.targetCumulativeDropMaxPercent
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Step maximum cumulative drop must be monotonic",
        path: ["steps", index, "targetCumulativeDropMaxPercent"],
      });
    }
  });
});

const techniqueBiomechanicsJumpHeightMeasurementSchema = z.object({
  enabled: z.boolean().default(false),
  subjectHeightCm: z.number().finite().positive().max(300).nullable().optional(),
  playbackSpeedRatio: z.number().finite().positive().max(1).nullable().optional(),
  flightTimeMethodEnabled: z.boolean().default(true),
  centerOfMassMethodEnabled: z.boolean().optional(),
  heelRiseMethodEnabled: z.boolean().optional(),
  geometricHipRiseMethodEnabled: z.boolean().optional(),
  consensusToleranceCm: z.number().finite().positive().max(200).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
}).superRefine((value, context) => {
  if (!value.enabled) {
    return;
  }

  const centerOfMassMethodEnabled = value.centerOfMassMethodEnabled
    ?? value.heelRiseMethodEnabled
    ?? value.geometricHipRiseMethodEnabled
    ?? true;

  if (!value.flightTimeMethodEnabled && !centerOfMassMethodEnabled) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one jump height method must be enabled",
      path: ["centerOfMassMethodEnabled"],
    });
  }
});

const techniqueBiomechanicsKeyEventSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  eventType: z.enum(techniqueBiomechanicsEventTypes),
  frameIndex: z.number().int().min(0).nullable().optional(),
  frameHint: z.string().trim().nullable().optional(),
  source: z.enum(techniqueBiomechanicsEventSources).default("MANUAL"),
  confidence: z.number().finite().min(0).max(1).nullable().optional(),
  detector: z.enum(techniqueBiomechanicsEventDetectors).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const techniqueBiomechanicsOrientationPolicySchema = z.object({
  allowMirror: z.boolean().default(true),
  preferredTravelDirection: z.enum(techniqueBiomechanicsPreferredDirections).default("ANY"),
  manualOverrideAllowed: z.boolean().default(true),
  normalizationMode: z.enum(techniqueBiomechanicsNormalizationModes).default("AUTO"),
});

const techniqueBiomechanicsConfigSchema = z.object({
  schemaVersion: z.literal(1),
  referenceMediaAssetId: z.string().trim().min(1).nullable().optional(),
  referenceMotionProfile: z.enum(["REAL_TIME", "SLOW_MOTION"]).nullable().optional(),
  focusPoints: z.array(techniqueBiomechanicsFocusPointSchema).max(12).default([]),
  pointChecks: z.array(techniqueBiomechanicsPointCheckSchema).max(12).default([]),
  angleChecks: z.array(techniqueBiomechanicsAngleCheckSchema).max(12).default([]),
  trajectoryChecks: z.array(techniqueBiomechanicsTrajectoryCheckSchema).max(12).default([]),
  hipProgressionChecks: z.array(techniqueBiomechanicsHipProgressionCheckSchema).max(6).default([]),
  keyEvents: z.array(techniqueBiomechanicsKeyEventSchema).max(12).default([]),
  jumpHeightMeasurement: techniqueBiomechanicsJumpHeightMeasurementSchema.default({
    enabled: false,
    subjectHeightCm: null,
    playbackSpeedRatio: null,
    flightTimeMethodEnabled: true,
    centerOfMassMethodEnabled: true,
    consensusToleranceCm: 6,
    notes: null,
  }),
  orientationPolicy: techniqueBiomechanicsOrientationPolicySchema.default({
    allowMirror: true,
    preferredTravelDirection: "ANY",
    manualOverrideAllowed: true,
    normalizationMode: "AUTO",
  }),
  rimAnnotation: rimAnnotationSchema.nullable().optional(),
  masterReference: z.unknown().nullable().optional(), // BiomechanicsMasterReference from analyze endpoint
  coachNotes: z.string().trim().nullable().optional(),
}).superRefine((value, context) => {
  const centerOfMassMethodEnabled = value.jumpHeightMeasurement.centerOfMassMethodEnabled
    ?? value.jumpHeightMeasurement.heelRiseMethodEnabled
    ?? value.jumpHeightMeasurement.geometricHipRiseMethodEnabled
    ?? true;

  if (
    value.referenceMotionProfile === "SLOW_MOTION"
    && value.jumpHeightMeasurement.enabled
    && value.jumpHeightMeasurement.flightTimeMethodEnabled
    && typeof value.jumpHeightMeasurement.playbackSpeedRatio !== "number"
    && (!centerOfMassMethodEnabled || typeof value.jumpHeightMeasurement.subjectHeightCm !== "number")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Slow motion jump height measurement requires playbackSpeedRatio unless center-of-mass corroboration can infer it",
      path: ["jumpHeightMeasurement", "playbackSpeedRatio"],
    });
  }
});

const createTechniqueSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().nullable().optional(),
  measurementInstructions: z.string().trim().nullable().optional(),
  proVideoUrl: techniqueAssetUrlSchema.nullable().optional(),
  proLandmarks: techniqueProLandmarksSchema.nullable().optional(),
  biomechanicsConfig: techniqueBiomechanicsConfigSchema.nullable().optional(),
  comparisonEnabled: z.coerce.boolean().default(false),
});

const updateTechniqueSchema = z.object({
  title: z.string().trim().min(2).optional(),
  description: z.string().trim().nullable().optional(),
  measurementInstructions: z.string().trim().nullable().optional(),
  proVideoUrl: techniqueAssetUrlSchema.nullable().optional(),
  proLandmarks: techniqueProLandmarksSchema.nullable().optional(),
  biomechanicsConfig: techniqueBiomechanicsConfigSchema.nullable().optional(),
  comparisonEnabled: z.coerce.boolean().optional(),
  orderIndex: z.number().int().positive().optional(),
});

const techniqueMeasurementDefinitionSchema = z.object({
  label: z.string().trim().min(1),
  instructions: z.string().trim().nullable().optional(),
  allowedUnits: z.array(z.string().trim().min(1)).default([]),
  orderIndex: z.number().int().positive().optional(),
});

const upsertDaySchema = z.object({
  title: z.string().trim().min(1),
  dayType: z.nativeEnum(DayType),
  notes: z.string().trim().nullable().optional(),
});

const techniqueMediaSchema = z.object({
  kind: z.nativeEnum(MediaKind).default(MediaKind.VIDEO),
  title: z.string().trim().nullable().optional(),
  isPrimary: z.preprocess((value) => {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "on", "yes"].includes(normalized)) {
        return true;
      }

      if (["false", "0", "off", "no", ""].includes(normalized)) {
        return false;
      }
    }

    return Boolean(value);
  }, z.boolean()).default(false),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });

const parseExerciseTaskImportSchema = z.object({
  content: z.string().min(1),
  strict: z.boolean().default(false),
});

const persistExerciseTaskImportSchema = z.object({
  content: z.string().min(1),
  strict: z.boolean().default(true),
  replaceExisting: z.boolean().default(true),
  phaseId: z.string().min(1).optional(),
  phaseName: z.string().trim().min(2).optional(),
  orderIndex: z.number().int().positive().optional(),
  durationDays: z.number().int().positive().max(365),
  masterBlockDays: z.union([z.literal(7), z.literal(14)]),
  notes: z.string().trim().nullable().optional(),
}).superRefine((value, ctx) => {
  if (!value.phaseId && !value.phaseName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "phaseId or phaseName is required",
      path: ["phaseName"],
    });
  }
});

const createWizardPhaseSchema = z.object({
  name: z.string().trim().min(2),
  orderIndex: z.number().int().positive().optional(),
  durationDays: z.number().int().positive().max(365),
  masterBlockDays: z.union([z.literal(7), z.literal(14)]),
  notes: z.string().trim().nullable().optional(),
});

const updateWizardPhaseSchema = z.object({
  name: z.string().trim().min(2).optional(),
  orderIndex: z.number().int().positive().optional(),
  durationDays: z.number().int().positive().max(365).optional(),
  masterBlockDays: z.union([z.literal(7), z.literal(14)]).optional(),
  notes: z.string().trim().nullable().optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one field must be provided" },
);

function getStringParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function normalizeExerciseLookup(value: string) {
  return value.trim().toLowerCase();
}

function slugifyExerciseLookup(value: string) {
  return normalizeExerciseLookup(value).replace(/\s+/g, "-");
}

type PhaseDbClient = typeof prisma | Prisma.TransactionClient;

async function loadWizardPhases(db: PhaseDbClient, programTemplateId: string) {
  return db.programPhaseTemplate.findMany({
    where: { programTemplateId },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    include: {
      days: {
        orderBy: { dayNumber: "asc" },
        include: {
          tasks: {
            orderBy: { orderIndex: "asc" },
            include: {
              exercise: {
                select: { id: true, name: true, slug: true },
              },
              variants: {
                orderBy: { weekNumber: "asc" },
                include: {
                  exercise: {
                    select: { id: true, name: true, slug: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

async function syncTemplateCycleLengthFromPhases(db: PhaseDbClient, programTemplateId: string) {
  const phases = await db.programPhaseTemplate.findMany({
    where: { programTemplateId },
    select: { durationDays: true },
  });
  if (phases.length === 0) return;
  const totalDays = phases.reduce((sum, phase) => sum + phase.durationDays, 0);
  await db.programTemplate.update({
    where: { id: programTemplateId },
    data: { cycleLengthDays: totalDays },
  });
}

async function normalizeWizardPhaseOrder(
  tx: Prisma.TransactionClient,
  orderedPhaseIds: string[],
) {
  for (let index = 0; index < orderedPhaseIds.length; index += 1) {
    const phaseId = orderedPhaseIds[index];
    if (!phaseId) {
      continue;
    }

    await tx.programPhaseTemplate.update({
      where: { id: phaseId },
      data: { orderIndex: 1000 + index },
    });
  }

  for (let index = 0; index < orderedPhaseIds.length; index += 1) {
    const phaseId = orderedPhaseIds[index];
    if (!phaseId) {
      continue;
    }

    await tx.programPhaseTemplate.update({
      where: { id: phaseId },
      data: { orderIndex: index + 1 },
    });
  }
}

async function buildExerciseLookupMap(candidateNames: string[]) {
  if (!candidateNames.length) {
    return new Map<string, { id: string; name: string; slug: string }>();
  }

  const exerciseCatalog = await prisma.exercise.findMany({
    select: { id: true, name: true, slug: true },
  });

  const map = new Map<string, { id: string; name: string; slug: string }>();
  for (const exercise of exerciseCatalog) {
    map.set(normalizeExerciseLookup(exercise.name), exercise);
    map.set(normalizeExerciseLookup(exercise.slug), exercise);
  }

  return map;
}

function resolveExerciseMatch(
  lookupMap: Map<string, { id: string; name: string; slug: string }>,
  exerciseName: string,
) {
  return lookupMap.get(normalizeExerciseLookup(exerciseName))
    ?? lookupMap.get(slugifyExerciseLookup(exerciseName))
    ?? null;
}

export const adminTemplatesRouter = Router();

adminTemplatesRouter.use(requireAuth, requireRole([Role.SUPERADMIN]));

adminTemplatesRouter.get(
  "/program-templates/:code/wizard/phases",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      if (!code) {
        res.status(400).json({ message: "Program template code is required" });
        return;
      }

      const template = await prisma.programTemplate.findUnique({
        where: { code },
        select: { id: true, code: true },
      });

      if (!template) {
        res.status(404).json({ message: "Program template not found" });
        return;
      }

      const phases = await loadWizardPhases(prisma, template.id);
      res.json({ templateCode: template.code, phases });
    } catch (error) {
      console.error("Failed to list wizard phases", error);
      res.status(500).json({ message: "Failed to list wizard phases" });
    }
  },
);

adminTemplatesRouter.post(
  "/program-templates/:code/wizard/phases",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      if (!code) {
        res.status(400).json({ message: "Program template code is required" });
        return;
      }

      const payload = createWizardPhaseSchema.parse(req.body);
      const template = await prisma.programTemplate.findUnique({
        where: { code },
        select: { id: true, code: true },
      });

      if (!template) {
        res.status(404).json({ message: "Program template not found" });
        return;
      }

      const phases = await prisma.$transaction(async (tx) => {
        const existingPhases = await tx.programPhaseTemplate.findMany({
          where: { programTemplateId: template.id },
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        });

        const createdPhase = await tx.programPhaseTemplate.create({
          data: {
            programTemplateId: template.id,
            name: payload.name,
            orderIndex: existingPhases.length + 1,
            durationDays: payload.durationDays,
            masterBlockDays: payload.masterBlockDays,
            notes: payload.notes ?? null,
          },
          select: { id: true },
        });

        const desiredIndex = payload.orderIndex
          ? Math.min(Math.max(payload.orderIndex - 1, 0), existingPhases.length)
          : existingPhases.length;

        const orderedIds = existingPhases.map((phase) => phase.id);
        orderedIds.splice(desiredIndex, 0, createdPhase.id);
        await normalizeWizardPhaseOrder(tx, orderedIds);
        await syncTemplateCycleLengthFromPhases(tx, template.id);

        return loadWizardPhases(tx, template.id);
      });

      res.status(201).json({ templateCode: template.code, phases });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid phase payload", issues: error.issues });
        return;
      }

      console.error("Failed to create wizard phase", error);
      res.status(500).json({ message: "Failed to create wizard phase" });
    }
  },
);

adminTemplatesRouter.put(
  "/program-templates/:code/wizard/phases/:phaseId",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const phaseId = getStringParam(req.params.phaseId);
      if (!code || !phaseId) {
        res.status(400).json({ message: "Program template code and phase id are required" });
        return;
      }

      const payload = updateWizardPhaseSchema.parse(req.body);
      const template = await prisma.programTemplate.findUnique({
        where: { code },
        select: { id: true, code: true },
      });

      if (!template) {
        res.status(404).json({ message: "Program template not found" });
        return;
      }

      const phases = await prisma.$transaction(async (tx) => {
        const existingPhases = await tx.programPhaseTemplate.findMany({
          where: { programTemplateId: template.id },
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        });

        if (!existingPhases.some((phase) => phase.id === phaseId)) {
          throw new Error("PHASE_NOT_FOUND");
        }

        await tx.programPhaseTemplate.update({
          where: { id: phaseId },
          data: {
            ...(payload.name !== undefined ? { name: payload.name } : {}),
            ...(payload.durationDays !== undefined ? { durationDays: payload.durationDays } : {}),
            ...(payload.masterBlockDays !== undefined ? { masterBlockDays: payload.masterBlockDays } : {}),
            ...(payload.notes !== undefined ? { notes: payload.notes ?? null } : {}),
          },
        });

        if (payload.orderIndex !== undefined) {
          const orderedIds = existingPhases.map((phase) => phase.id).filter((id) => id !== phaseId);
          const desiredIndex = Math.min(Math.max(payload.orderIndex - 1, 0), orderedIds.length);
          orderedIds.splice(desiredIndex, 0, phaseId);
          await normalizeWizardPhaseOrder(tx, orderedIds);
        }
        await syncTemplateCycleLengthFromPhases(tx, template.id);

        return loadWizardPhases(tx, template.id);
      });

      res.json({ templateCode: template.code, phases });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid phase payload", issues: error.issues });
        return;
      }

      if (error instanceof Error && error.message === "PHASE_NOT_FOUND") {
        res.status(404).json({ message: "Phase not found for this template" });
        return;
      }

      console.error("Failed to update wizard phase", error);
      res.status(500).json({ message: "Failed to update wizard phase" });
    }
  },
);

adminTemplatesRouter.delete(
  "/program-templates/:code/wizard/phases/:phaseId",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const phaseId = getStringParam(req.params.phaseId);
      if (!code || !phaseId) {
        res.status(400).json({ message: "Program template code and phase id are required" });
        return;
      }

      const template = await prisma.programTemplate.findUnique({
        where: { code },
        select: { id: true, code: true },
      });

      if (!template) {
        res.status(404).json({ message: "Program template not found" });
        return;
      }

      const phases = await prisma.$transaction(async (tx) => {
        const existingPhase = await tx.programPhaseTemplate.findUnique({
          where: { id: phaseId },
          select: { id: true, programTemplateId: true },
        });

        if (!existingPhase || existingPhase.programTemplateId !== template.id) {
          throw new Error("PHASE_NOT_FOUND");
        }

        await tx.programPhaseTemplate.delete({ where: { id: phaseId } });

        const remainingPhases = await tx.programPhaseTemplate.findMany({
          where: { programTemplateId: template.id },
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        });

        await normalizeWizardPhaseOrder(tx, remainingPhases.map((phase) => phase.id));
        await syncTemplateCycleLengthFromPhases(tx, template.id);
        return loadWizardPhases(tx, template.id);
      });

      res.json({ templateCode: template.code, phases });
    } catch (error) {
      if (error instanceof Error && error.message === "PHASE_NOT_FOUND") {
        res.status(404).json({ message: "Phase not found for this template" });
        return;
      }

      console.error("Failed to delete wizard phase", error);
      res.status(500).json({ message: "Failed to delete wizard phase" });
    }
  },
);

adminTemplatesRouter.post(
  "/program-templates/:code/wizard/exercise-tasks/parse",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      if (!code) {
        res.status(400).json({ message: "Program template code is required" });
        return;
      }

      const payload = parseExerciseTaskImportSchema.parse(req.body);
      const template = await prisma.programTemplate.findUnique({
        where: { code },
        select: { id: true, code: true },
      });

      if (!template) {
        res.status(404).json({ message: "Program template not found" });
        return;
      }

      const parseResult = parseExerciseTaskBlock(payload.content);

      const candidateNames = Array.from(
        new Set(parseResult.tasks.map((task) => task.name.trim()).filter((name) => name.length > 0)),
      );

      const exerciseByName = await buildExerciseLookupMap(candidateNames);

      const mapped = parseResult.tasks.map((task) => {
        const matchedExercise = resolveExerciseMatch(exerciseByName, task.name);

        return {
          rowNumber: task.rowNumber,
          day: task.day,
          exerciseId: matchedExercise?.id ?? null,
          name: task.name,
          sets: task.sets,
          repsOrTimeText: task.repsOrTimeText,
          description: task.description,
          requiresWeight: task.requiresWeight,
          isUnilateral: task.isUnilateral,
          evolution: task.evolution,
          zone: task.zone,
          videoUrl: task.videoUrl,
        };
      });

      const unresolved = mapped.filter((item) => !item.exerciseId).map((item) => ({
        rowNumber: item.rowNumber,
        name: item.name,
      }));

      if (payload.strict && unresolved.length) {
        res.status(400).json({
          message: "Some exercise names did not match the exercise catalog.",
          unresolved,
          issues: parseResult.issues,
          warnings: parseResult.warnings,
        });
        return;
      }

      res.json({
        templateCode: template.code,
        delimiter: parseResult.delimiter,
        issues: parseResult.issues,
        warnings: parseResult.warnings,
        unresolved,
        mapped,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid import payload", issues: error.issues });
        return;
      }

      console.error("Failed to parse wizard exercise-task import", error);
      res.status(500).json({ message: "Failed to parse exercise-task import" });
    }
  },
);

adminTemplatesRouter.post(
  "/program-templates/:code/wizard/phases/import",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      if (!code) {
        res.status(400).json({ message: "Program template code is required" });
        return;
      }

      const payload = persistExerciseTaskImportSchema.parse(req.body);
      const template = await prisma.programTemplate.findUnique({
        where: { code },
        select: { id: true, code: true },
      });

      if (!template) {
        res.status(404).json({ message: "Program template not found" });
        return;
      }

      const parseResult = parseExerciseTaskBlock(payload.content);
      if (parseResult.issues.length) {
        res.status(400).json({
          message: "Invalid import content",
          issues: parseResult.issues,
          warnings: parseResult.warnings,
        });
        return;
      }

      const candidateNames = Array.from(
        new Set(parseResult.tasks.map((task) => task.name.trim()).filter((name) => name.length > 0)),
      );
      const exerciseByName = await buildExerciseLookupMap(candidateNames);

      // Auto-create exercises that don't exist yet using data from the CSV row.
      // We create them outside the transaction first to avoid unique-slug races
      // within a batch, then rebuild the lookup map so the transaction can find them.
      const namesToCreate = parseResult.tasks
        .filter((task) => !resolveExerciseMatch(exerciseByName, task.name))
        .map((task) => task.name.trim())
        .filter((name, idx, arr) => arr.indexOf(name) === idx); // deduplicate

      const autoCreated: string[] = [];
      for (const name of namesToCreate) {
        const baseSlug = slugifyExerciseLookup(name);
        // Ensure slug uniqueness by appending a suffix if needed
        let slug = baseSlug;
        let attempt = 0;
        while (await prisma.exercise.findUnique({ where: { slug }, select: { id: true } })) {
          attempt += 1;
          slug = `${baseSlug}-${attempt}`;
        }
        // Find the matching task to pick evolution/zone defaults
        const srcTask = parseResult.tasks.find((t) => t.name.trim() === name);
        await prisma.exercise.create({
          data: {
            slug,
            name,
            category: srcTask?.zone === "LOWER" || srcTask?.zone === "UPPER" ? "strength" : "mobility",
            requiresLoad: srcTask?.requiresWeight ?? false,
            perLeg: srcTask?.isUnilateral ?? false,
            description: srcTask?.description ?? null,
            evolution: srcTask?.evolution ?? null,
            zone: srcTask?.zone ?? null,
          },
        });
        autoCreated.push(name);
      }

      // Rebuild lookup map so newly created exercises are found
      const exerciseByNameFinal = autoCreated.length > 0
        ? await buildExerciseLookupMap(candidateNames)
        : exerciseByName;

      const mapped = parseResult.tasks.map((task) => {
        const matchedExercise = resolveExerciseMatch(exerciseByNameFinal, task.name);
        return {
          ...task,
          exerciseId: matchedExercise?.id ?? null,
        };
      });

      const groupedByDay = new Map<number, typeof mapped>();
      for (const item of mapped) {
        const bucket = groupedByDay.get(item.day) ?? [];
        bucket.push(item);
        groupedByDay.set(item.day, bucket);
      }

      const dayNumbers = Array.from(groupedByDay.keys()).sort((a, b) => a - b);

      const persisted = await prisma.$transaction(async (tx) => {
        let phase = null as null | { id: string; orderIndex: number };

        if (payload.phaseId) {
          const existing = await tx.programPhaseTemplate.findUnique({
            where: { id: payload.phaseId },
            select: { id: true, orderIndex: true, programTemplateId: true },
          });

          if (!existing || existing.programTemplateId !== template.id) {
            throw new Error("PHASE_NOT_FOUND");
          }

          phase = { id: existing.id, orderIndex: existing.orderIndex };

          await tx.programPhaseTemplate.update({
            where: { id: existing.id },
            data: {
              ...(payload.phaseName !== undefined ? { name: payload.phaseName } : {}),
              durationDays: payload.durationDays,
              masterBlockDays: payload.masterBlockDays,
              notes: payload.notes ?? null,
            },
          });
        } else {
          const maxPhase = await tx.programPhaseTemplate.findFirst({
            where: { programTemplateId: template.id },
            orderBy: { orderIndex: "desc" },
            select: { orderIndex: true },
          });

          const created = await tx.programPhaseTemplate.create({
            data: {
              programTemplateId: template.id,
              name: payload.phaseName ?? `Phase ${(maxPhase?.orderIndex ?? 0) + 1}`,
              orderIndex: payload.orderIndex ?? (maxPhase?.orderIndex ?? 0) + 1,
              durationDays: payload.durationDays,
              masterBlockDays: payload.masterBlockDays,
              notes: payload.notes ?? null,
            },
            select: { id: true, orderIndex: true },
          });
          phase = created;
        }

        if (!phase) {
          throw new Error("PHASE_NOT_FOUND");
        }

        if (payload.replaceExisting) {
          await tx.programPhaseDayTemplate.deleteMany({
            where: { phaseTemplateId: phase.id },
          });
        }

        for (const dayNumber of dayNumbers) {
          const dayItems = groupedByDay.get(dayNumber) ?? [];

          const phaseDay = await tx.programPhaseDayTemplate.upsert({
            where: {
              phaseTemplateId_dayNumber: {
                phaseTemplateId: phase.id,
                dayNumber,
              },
            },
            create: {
              phaseTemplateId: phase.id,
              dayNumber,
              title: `Day ${dayNumber}`,
              dayType: DayType.OTHER,
              notes: null,
            },
            update: {
              title: `Day ${dayNumber}`,
            },
            select: { id: true },
          });

          if (!payload.replaceExisting) {
            await tx.exerciseTaskTemplate.deleteMany({
              where: { phaseDayTemplateId: phaseDay.id },
            });
          }

          for (let index = 0; index < dayItems.length; index += 1) {
            const task = dayItems[index];
            if (!task) {
              continue;
            }

            await tx.exerciseTaskTemplate.create({
              data: {
                phaseDayTemplateId: phaseDay.id,
                exerciseId: task.exerciseId,
                orderIndex: index + 1,
                name: task.name,
                sets: task.sets,
                repsOrTimeText: task.repsOrTimeText,
                description: task.description,
                requiresWeight: task.requiresWeight,
                isUnilateral: task.isUnilateral,
                evolution: task.evolution,
                zone: task.zone,
                videoUrl: task.videoUrl,
                notes: null,
              },
            });
          }
        }

        return tx.programPhaseTemplate.findUnique({
          where: { id: phase.id },
          include: {
            days: {
              orderBy: { dayNumber: "asc" },
              include: {
                tasks: {
                  orderBy: { orderIndex: "asc" },
                  include: {
                    exercise: {
                      select: { id: true, name: true, slug: true },
                    },
                  },
                },
              },
            },
          },
        });
      });

      res.status(201).json({
        templateCode: template.code,
        warnings: parseResult.warnings,
        autoCreated,
        phase: persisted,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid import payload", issues: error.issues });
        return;
      }

      if (error instanceof Error && error.message === "PHASE_NOT_FOUND") {
        res.status(404).json({ message: "Phase not found for this template" });
        return;
      }

      console.error("Failed to persist wizard phase import", error);
      res.status(500).json({ message: "Failed to persist wizard phase import" });
    }
  },
);

// ---------------------------------------------------------------------------
// Variant CRUD
// ---------------------------------------------------------------------------

const createVariantSchema = z.object({
  weekNumber: z.number().int().min(1).max(52),
  exerciseId: z.string().nullable().optional(),
  name: z.string().trim().nullable().optional(),
  sets: z.number().int().positive().nullable().optional(),
  repsOrTimeText: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const updateVariantSchema = z.object({
  exerciseId: z.string().nullable().optional(),
  name: z.string().trim().nullable().optional(),
  sets: z.number().int().positive().nullable().optional(),
  repsOrTimeText: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one field must be provided" },
);

async function resolveTaskOwnership(code: string, taskId: string) {
  const template = await prisma.programTemplate.findUnique({
    where: { code },
    select: { id: true, code: true },
  });
  if (!template) return null;

  const task = await prisma.exerciseTaskTemplate.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      phaseDayTemplate: {
        select: {
          phaseTemplate: {
            select: { programTemplateId: true },
          },
        },
      },
    },
  });

  if (!task || task.phaseDayTemplate.phaseTemplate.programTemplateId !== template.id) return null;

  return { template, task };
}

adminTemplatesRouter.post(
  "/program-templates/:code/wizard/tasks/:taskId/variants",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const taskId = getStringParam(req.params.taskId);
      if (!code || !taskId) {
        res.status(400).json({ message: "Template code and task id are required" });
        return;
      }

      const payload = createVariantSchema.parse(req.body);
      const ownership = await resolveTaskOwnership(code, taskId);
      if (!ownership) {
        res.status(404).json({ message: "Task not found for this template" });
        return;
      }

      await prisma.exerciseTaskVariant.upsert({
        where: { exerciseTaskId_weekNumber: { exerciseTaskId: taskId, weekNumber: payload.weekNumber } },
        create: {
          exerciseTaskId: taskId,
          weekNumber: payload.weekNumber,
          exerciseId: payload.exerciseId ?? null,
          name: payload.name ?? null,
          sets: payload.sets ?? null,
          repsOrTimeText: payload.repsOrTimeText ?? null,
          notes: payload.notes ?? null,
        },
        update: {
          exerciseId: payload.exerciseId ?? null,
          name: payload.name ?? null,
          sets: payload.sets ?? null,
          repsOrTimeText: payload.repsOrTimeText ?? null,
          notes: payload.notes ?? null,
        },
      });

      const phases = await loadWizardPhases(prisma, ownership.template.id);
      res.status(201).json({ templateCode: ownership.template.code, phases });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid variant payload", issues: error.issues });
        return;
      }
      console.error("Failed to create variant", error);
      res.status(500).json({ message: "Failed to create variant" });
    }
  },
);

adminTemplatesRouter.put(
  "/program-templates/:code/wizard/tasks/:taskId/variants/:variantId",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const taskId = getStringParam(req.params.taskId);
      const variantId = getStringParam(req.params.variantId);
      if (!code || !taskId || !variantId) {
        res.status(400).json({ message: "Template code, task id, and variant id are required" });
        return;
      }

      const payload = updateVariantSchema.parse(req.body);
      const ownership = await resolveTaskOwnership(code, taskId);
      if (!ownership) {
        res.status(404).json({ message: "Task not found for this template" });
        return;
      }

      const variant = await prisma.exerciseTaskVariant.findUnique({
        where: { id: variantId },
        select: { exerciseTaskId: true },
      });
      if (!variant || variant.exerciseTaskId !== taskId) {
        res.status(404).json({ message: "Variant not found for this task" });
        return;
      }

      await prisma.exerciseTaskVariant.update({
        where: { id: variantId },
        data: {
          ...(Object.prototype.hasOwnProperty.call(payload, "exerciseId") ? { exerciseId: payload.exerciseId ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, "name") ? { name: payload.name ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, "sets") ? { sets: payload.sets ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, "repsOrTimeText") ? { repsOrTimeText: payload.repsOrTimeText ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(payload, "notes") ? { notes: payload.notes ?? null } : {}),
        },
      });

      const phases = await loadWizardPhases(prisma, ownership.template.id);
      res.json({ templateCode: ownership.template.code, phases });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid variant payload", issues: error.issues });
        return;
      }
      console.error("Failed to update variant", error);
      res.status(500).json({ message: "Failed to update variant" });
    }
  },
);

adminTemplatesRouter.delete(
  "/program-templates/:code/wizard/tasks/:taskId/variants/:variantId",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const taskId = getStringParam(req.params.taskId);
      const variantId = getStringParam(req.params.variantId);
      if (!code || !taskId || !variantId) {
        res.status(400).json({ message: "Template code, task id, and variant id are required" });
        return;
      }

      const ownership = await resolveTaskOwnership(code, taskId);
      if (!ownership) {
        res.status(404).json({ message: "Task not found for this template" });
        return;
      }

      const variant = await prisma.exerciseTaskVariant.findUnique({
        where: { id: variantId },
        select: { exerciseTaskId: true },
      });
      if (!variant || variant.exerciseTaskId !== taskId) {
        res.status(404).json({ message: "Variant not found for this task" });
        return;
      }

      await prisma.exerciseTaskVariant.delete({ where: { id: variantId } });

      const phases = await loadWizardPhases(prisma, ownership.template.id);
      res.json({ templateCode: ownership.template.code, phases });
    } catch (error) {
      console.error("Failed to delete variant", error);
      res.status(500).json({ message: "Failed to delete variant" });
    }
  },
);

adminTemplatesRouter.put(
  "/program-templates/:code/days/:dayNumber/prescriptions",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const dayNumber = Number(req.params.dayNumber);

      if (!code) {
        res.status(400).json({ message: "Program template code is required" });
        return;
      }

      if (!Number.isInteger(dayNumber) || dayNumber <= 0) {
        res.status(400).json({ message: "Invalid day number" });
        return;
      }

      const payload = replacePrescriptionsSchema.parse(req.body);
      const template = await prisma.programTemplate.findUnique({
        where: { code },
        select: { id: true },
      });

      if (!template) {
        res.status(404).json({ message: "Program template not found" });
        return;
      }

      const day = await prisma.programDayTemplate.findUnique({
        where: {
          programTemplateId_dayNumber: {
            programTemplateId: template.id,
            dayNumber,
          },
        },
        select: { id: true },
      });

      if (!day) {
        res.status(404).json({ message: "Program day not found" });
        return;
      }

      await prisma.$transaction(async (transaction) => {
        await transaction.exercisePrescriptionTemplate.deleteMany({
          where: {
            programDayTemplateId: day.id,
          },
        });

        for (const prescription of payload.prescriptions) {
          await transaction.exercisePrescriptionTemplate.create({
            data: {
              programDayTemplateId: day.id,
              exerciseId: prescription.exerciseId,
              orderIndex: prescription.orderIndex,
              seriesProtocol: prescription.seriesProtocol ?? SeriesProtocol.NONE,
              blockLabel: prescription.blockLabel ?? null,
              sets: prescription.sets ?? null,
              repsText: prescription.repsText ?? null,
              durationSeconds: prescription.durationSeconds ?? null,
              restSeconds: prescription.restSeconds ?? null,
              loadText: prescription.loadText ?? null,
              tempoText: prescription.tempoText ?? null,
              notes: prescription.notes ?? null,
            },
          });
        }
      });

      const refreshedDay = await prisma.programDayTemplate.findUnique({
        where: { id: day.id },
        include: {
          prescriptions: {
            orderBy: { orderIndex: "asc" },
            include: {
              exercise: {
                include: {
                  instructions: {
                    orderBy: { locale: "asc" },
                  },
                  mediaAssets: {
                    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                  },
                },
              },
            },
          },
        },
      });

      res.json({ day: refreshedDay });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid prescription payload", issues: error.issues });
        return;
      }

      console.error("Failed to replace prescriptions", error);
      res.status(500).json({ message: "Failed to replace prescriptions" });
    }
  },
);

// ── Template CRUD ───────────────────────────────────────────────────────────

adminTemplatesRouter.get("/program-templates", async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.programTemplate.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { days: true, phases: true, personalPrograms: true } },
        techniqueMediaAssets: {
          orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        },
        techniques: {
          select: { id: true },
        },
      },
    });
    res.json({ templates });
  } catch (error) {
    console.error("Failed to list templates", error);
    res.status(500).json({ message: "Failed to list templates" });
  }
});

adminTemplatesRouter.post("/program-templates", async (req: Request, res: Response) => {
  try {
    const payload = createTemplateSchema.parse(req.body);
    const existing = await prisma.programTemplate.findUnique({ where: { code: payload.code }, select: { id: true } });
    if (existing) {
      res.status(409).json({ message: `Ya existe un template con el código ${payload.code}` });
      return;
    }
    const template = await prisma.programTemplate.create({
      data: {
        name: payload.name,
        code: payload.code,
        description: payload.description ?? null,
        techniqueTitle: null,
        techniqueDescription: null,
        cycleLengthDays: payload.cycleLengthDays,
        isEditable: true,
        techniques: {
          create: {
            title: `${payload.name} · Técnica 1`,
            description: null,
            measurementInstructions: null,
            comparisonEnabled: false,
            orderIndex: 1,
          },
        },
      },
      include: {
        _count: { select: { days: true, personalPrograms: true } },
        techniqueMediaAssets: { select: { id: true } },
        techniques: { select: { id: true } },
      },
    });
    res.status(201).json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid template payload", issues: error.issues });
      return;
    }
    console.error("Failed to create template", error);
    res.status(500).json({ message: "Failed to create template" });
  }
});

adminTemplatesRouter.put("/program-templates/:code", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    if (!code) { res.status(400).json({ message: "Code required" }); return; }
    const payload = updateTemplateSchema.parse(req.body);
    const template = await prisma.programTemplate.update({
      where: { code },
      data: {
        ...(payload.name !== undefined && { name: payload.name }),
        ...(payload.description !== undefined && { description: payload.description }),
        ...(payload.techniqueTitle !== undefined && { techniqueTitle: payload.techniqueTitle }),
        ...(payload.techniqueDescription !== undefined && { techniqueDescription: payload.techniqueDescription }),
        ...(payload.cycleLengthDays !== undefined && { cycleLengthDays: payload.cycleLengthDays }),
      },
      include: {
        _count: { select: { days: true, personalPrograms: true } },
        techniqueMediaAssets: { select: { id: true } },
        techniques: { select: { id: true } },
      },
    });
    res.json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid payload", issues: error.issues });
      return;
    }
    console.error("Failed to update template", error);
    res.status(500).json({ message: "Failed to update template" });
  }
});

adminTemplatesRouter.get("/program-templates/:code/techniques", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    if (!code) {
      res.status(400).json({ message: "Program template code is required" });
      return;
    }

    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const hydratedTemplate = await ensureTemplateTechniqueStructure(prisma, template.id);
    res.json({ techniques: hydratedTemplate?.techniques ?? [] });
  } catch (error) {
    console.error("Failed to list techniques", error);
    res.status(500).json({ message: "Failed to list techniques" });
  }
});

adminTemplatesRouter.post("/program-templates/:code/techniques", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    if (!code) {
      res.status(400).json({ message: "Program template code is required" });
      return;
    }

    const payload = createTechniqueSchema.parse(req.body);
    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const existing = await ensureTemplateTechniqueStructure(prisma, template.id);
    const technique = await prisma.programTemplateTechnique.create({
      data: {
        programTemplateId: template.id,
        title: payload.title,
        description: payload.description ?? null,
        measurementInstructions: payload.measurementInstructions ?? null,
        proVideoUrl: payload.proVideoUrl ?? null,
        proLandmarks: payload.proLandmarks ? (payload.proLandmarks as Prisma.InputJsonValue) : Prisma.JsonNull,
        biomechanicsConfig: payload.biomechanicsConfig ? (payload.biomechanicsConfig as Prisma.InputJsonValue) : Prisma.JsonNull,
        comparisonEnabled: payload.comparisonEnabled,
        orderIndex: (existing?.techniques.length ?? 0) + 1,
      },
      include: {
        mediaAssets: { orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }] },
        measurementDefinitions: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
      },
    });

    res.status(201).json({ technique });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid technique payload", issues: error.issues });
      return;
    }

    console.error("Failed to create technique", error);
    res.status(500).json({ message: "Failed to create technique" });
  }
});

adminTemplatesRouter.put("/program-templates/:code/techniques/:techniqueId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    if (!code || !techniqueId) {
      res.status(400).json({ message: "Program template code and technique id are required" });
      return;
    }

    const payload = updateTechniqueSchema.parse(req.body);
    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({ where: { id: techniqueId } });
    if (!technique || technique.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    const updatedTechnique = await prisma.programTemplateTechnique.update({
      where: { id: techniqueId },
      data: {
        ...(payload.title !== undefined && { title: payload.title }),
        ...(payload.description !== undefined && { description: payload.description }),
        ...(payload.measurementInstructions !== undefined && { measurementInstructions: payload.measurementInstructions }),
        ...(payload.proVideoUrl !== undefined && { proVideoUrl: payload.proVideoUrl }),
        ...(payload.proLandmarks !== undefined && {
          proLandmarks: payload.proLandmarks ? (payload.proLandmarks as Prisma.InputJsonValue) : Prisma.JsonNull,
        }),
        ...(payload.biomechanicsConfig !== undefined && {
          biomechanicsConfig: payload.biomechanicsConfig
            ? (payload.biomechanicsConfig as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        }),
        ...(payload.comparisonEnabled !== undefined && { comparisonEnabled: payload.comparisonEnabled }),
        ...(payload.orderIndex !== undefined && { orderIndex: payload.orderIndex }),
      },
      include: {
        mediaAssets: { orderBy: [{ isPrimary: "desc" }, { orderIndex: "asc" }, { createdAt: "asc" }] },
        measurementDefinitions: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
      },
    });

    res.json({ technique: updatedTechnique });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid technique payload", issues: error.issues });
      return;
    }

    console.error("Failed to update technique", error);
    res.status(500).json({ message: "Failed to update technique" });
  }
});

adminTemplatesRouter.delete("/program-templates/:code/techniques/:techniqueId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    if (!code || !techniqueId) {
      res.status(400).json({ message: "Program template code and technique id are required" });
      return;
    }

    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({ where: { id: techniqueId } });
    if (!technique || technique.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    await prisma.programTemplateTechnique.delete({ where: { id: techniqueId } });
    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete technique", error);
    res.status(500).json({ message: "Failed to delete technique" });
  }
});

// ── Biomechanics: authoritative analysis with manual rim annotation ────────────

const biomechanicsAnalyzeBodySchema = z.object({
  landmarks: techniqueProLandmarksSchema,
  rimAnnotation: rimAnnotationSchema,
  keyEvents: z.array(z.object({
    id: z.string(),
    label: z.string(),
    eventType: z.string(),
    frameIndex: z.number().int().nullable(),
  })).max(20),
  config: z.object({
    enabled: z.boolean().default(true),
    subjectHeightCm: z.number().finite().positive().nullable(),
    playbackSpeedRatio: z.number().finite().positive().max(1).nullable(),
    flightTimeMethodEnabled: z.boolean().default(true),
    centerOfMassMethodEnabled: z.boolean().default(true),
    consensusToleranceCm: z.number().finite().positive().nullable(),
  }),
  persistResult: z.boolean().default(true),
});

adminTemplatesRouter.post(
  "/program-templates/:code/techniques/:techniqueId/biomechanics/analyze",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const techniqueId = getStringParam(req.params.techniqueId);
      if (!code || !techniqueId) {
        res.status(400).json({ message: "Program template code and technique id are required" });
        return;
      }

      const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
      if (!template) {
        res.status(404).json({ message: "Program template not found" });
        return;
      }

      const technique = await prisma.programTemplateTechnique.findUnique({ where: { id: techniqueId } });
      if (!technique || technique.programTemplateId !== template.id) {
        res.status(404).json({ message: "Technique not found" });
        return;
      }

      const payload = biomechanicsAnalyzeBodySchema.parse(req.body);

      const masterReference = analyzeBiomechanics({
        landmarks: payload.landmarks as Parameters<typeof analyzeBiomechanics>[0]["landmarks"],
        rimAnnotation: payload.rimAnnotation,
        keyEvents: payload.keyEvents,
        config: {
          enabled: payload.config.enabled,
          subjectHeightCm: payload.config.subjectHeightCm,
          playbackSpeedRatio: payload.config.playbackSpeedRatio,
          flightTimeMethodEnabled: payload.config.flightTimeMethodEnabled,
          centerOfMassMethodEnabled: payload.config.centerOfMassMethodEnabled,
          consensusToleranceCm: payload.config.consensusToleranceCm,
        },
      });

      // Persist the result inside biomechanicsConfig.masterReference if requested
      if (payload.persistResult) {
        const existingConfig = (technique.biomechanicsConfig ?? {}) as Record<string, unknown>;
        const updatedConfig: Record<string, unknown> = {
          ...existingConfig,
          rimAnnotation: payload.rimAnnotation,
          masterReference,
        };
        await prisma.programTemplateTechnique.update({
          where: { id: techniqueId },
          data: { biomechanicsConfig: updatedConfig as Prisma.InputJsonValue },
        });
      }

      res.json({ masterReference });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid request payload", issues: error.issues });
        return;
      }
      if (error instanceof CalibrationError) {
        res.status(422).json({ error: "INVALID_CALIBRATION", message: error.message });
        return;
      }
      console.error("Failed to analyze biomechanics", error);
      res.status(500).json({ message: "Failed to run biomechanics analysis" });
    }
  },
);

adminTemplatesRouter.post("/program-templates/:code/techniques/:techniqueId/measurements", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    if (!code || !techniqueId) {
      res.status(400).json({ message: "Program template code and technique id are required" });
      return;
    }

    const payload = techniqueMeasurementDefinitionSchema.parse(req.body);
    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({
      where: { id: techniqueId },
      include: { measurementDefinitions: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] } },
    });
    if (!technique || technique.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    const measurement = await prisma.programTemplateTechniqueMeasurementDefinition.create({
      data: {
        techniqueId,
        label: payload.label,
        instructions: payload.instructions ?? null,
        allowedUnits: payload.allowedUnits.length ? payload.allowedUnits : Prisma.JsonNull,
        orderIndex: payload.orderIndex ?? technique.measurementDefinitions.length + 1,
      },
    });

    res.status(201).json({ measurement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid measurement definition payload", issues: error.issues });
      return;
    }

    console.error("Failed to create measurement definition", error);
    res.status(500).json({ message: "Failed to create measurement definition" });
  }
});

adminTemplatesRouter.put("/program-templates/:code/techniques/:techniqueId/measurements/:measurementId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    const measurementId = getStringParam(req.params.measurementId);
    if (!code || !techniqueId || !measurementId) {
      res.status(400).json({ message: "Program template code, technique id and measurement id are required" });
      return;
    }

    const payload = techniqueMeasurementDefinitionSchema.partial().parse(req.body);
    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({ where: { id: techniqueId } });
    if (!technique || technique.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    const measurement = await prisma.programTemplateTechniqueMeasurementDefinition.findUnique({ where: { id: measurementId } });
    if (!measurement || measurement.techniqueId !== techniqueId) {
      res.status(404).json({ message: "Measurement definition not found" });
      return;
    }

    const updatedMeasurement = await prisma.programTemplateTechniqueMeasurementDefinition.update({
      where: { id: measurementId },
      data: {
        ...(payload.label !== undefined && { label: payload.label }),
        ...(payload.instructions !== undefined && { instructions: payload.instructions }),
        ...(payload.allowedUnits !== undefined && { allowedUnits: payload.allowedUnits.length ? payload.allowedUnits : Prisma.JsonNull }),
        ...(payload.orderIndex !== undefined && { orderIndex: payload.orderIndex }),
      },
    });

    res.json({ measurement: updatedMeasurement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid measurement definition payload", issues: error.issues });
      return;
    }

    console.error("Failed to update measurement definition", error);
    res.status(500).json({ message: "Failed to update measurement definition" });
  }
});

adminTemplatesRouter.delete("/program-templates/:code/techniques/:techniqueId/measurements/:measurementId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    const measurementId = getStringParam(req.params.measurementId);
    if (!code || !techniqueId || !measurementId) {
      res.status(400).json({ message: "Program template code, technique id and measurement id are required" });
      return;
    }

    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({ where: { id: techniqueId } });
    if (!technique || technique.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    const measurement = await prisma.programTemplateTechniqueMeasurementDefinition.findUnique({ where: { id: measurementId } });
    if (!measurement || measurement.techniqueId !== techniqueId) {
      res.status(404).json({ message: "Measurement definition not found" });
      return;
    }

    await prisma.programTemplateTechniqueMeasurementDefinition.delete({ where: { id: measurementId } });
    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete measurement definition", error);
    res.status(500).json({ message: "Failed to delete measurement definition" });
  }
});

adminTemplatesRouter.post(
  "/program-templates/:code/technique/media",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const file = req.file;

      if (!code) {
        res.status(400).json({ message: "Program template code is required" });
        return;
      }

      if (!file) {
        res.status(400).json({ message: "File is required" });
        return;
      }

      const metadata = techniqueMediaSchema.parse(req.body);
      const template = await prisma.programTemplate.findUnique({
        where: { code },
        select: { id: true },
      });

      if (!template) {
        res.status(404).json({ message: "Program template not found" });
        return;
      }

      const uploadResult = await uploadProgramTechniqueMedia({
        programTemplateId: template.id,
        fileName: file.originalname,
        contentType: file.mimetype || "application/octet-stream",
        data: file.buffer,
      });

      const orderIndex = await prisma.programTemplateTechniqueAsset.count({
        where: { programTemplateId: template.id },
      });

      if (metadata.isPrimary) {
        await prisma.programTemplateTechniqueAsset.updateMany({
          where: { programTemplateId: template.id },
          data: { isPrimary: false },
        });
      }

      const mediaAsset = await prisma.programTemplateTechniqueAsset.create({
        data: {
          programTemplateId: template.id,
          kind: metadata.kind,
          bucket: env.MINIO_BUCKET,
          objectKey: uploadResult.objectKey,
          url: uploadResult.url,
          title: metadata.title ?? null,
          isPrimary: metadata.isPrimary,
          orderIndex,
        },
      });

      res.status(201).json({ mediaAsset });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid technique media payload", issues: error.issues });
        return;
      }

      console.error("Failed to upload technique media", error);
      res.status(500).json({ message: "Failed to upload technique media" });
    }
  },
);

adminTemplatesRouter.post(
  "/program-templates/:code/techniques/:techniqueId/media",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const techniqueId = getStringParam(req.params.techniqueId);
      const file = req.file;

      if (!code || !techniqueId) {
        res.status(400).json({ message: "Program template code and technique id are required" });
        return;
      }

      if (!file) {
        res.status(400).json({ message: "File is required" });
        return;
      }

      const metadata = techniqueMediaSchema.parse(req.body);
      const technique = await prisma.programTemplateTechnique.findUnique({
        where: { id: techniqueId },
        include: { programTemplate: { select: { code: true } } },
      });

      if (!technique || technique.programTemplate.code !== code) {
        res.status(404).json({ message: "Technique not found" });
        return;
      }

      const uploadResult = await uploadProgramTechniqueMedia({
        programTemplateId: technique.programTemplateId,
        fileName: file.originalname,
        contentType: file.mimetype || "application/octet-stream",
        data: file.buffer,
      });

      const orderIndex = await prisma.programTemplateTechniqueAsset.count({
        where: { techniqueId },
      });

      if (metadata.isPrimary) {
        await prisma.programTemplateTechniqueAsset.updateMany({
          where: { techniqueId },
          data: { isPrimary: false },
        });
      }

      const mediaAsset = await prisma.programTemplateTechniqueAsset.create({
        data: {
          programTemplateId: technique.programTemplateId,
          techniqueId,
          kind: metadata.kind,
          bucket: env.MINIO_BUCKET,
          objectKey: uploadResult.objectKey,
          url: uploadResult.url,
          title: metadata.title ?? null,
          isPrimary: metadata.isPrimary,
          orderIndex,
        },
      });

      res.status(201).json({ mediaAsset });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid technique media payload", issues: error.issues });
        return;
      }

      console.error("Failed to upload technique media", error);
      res.status(500).json({ message: "Failed to upload technique media" });
    }
  },
);

adminTemplatesRouter.delete("/program-templates/:code/techniques/:techniqueId/media/:mediaId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const techniqueId = getStringParam(req.params.techniqueId);
    const mediaId = getStringParam(req.params.mediaId);

    if (!code || !techniqueId || !mediaId) {
      res.status(400).json({ message: "Program template code, technique id and media id are required" });
      return;
    }

    const technique = await prisma.programTemplateTechnique.findUnique({
      where: { id: techniqueId },
      include: { programTemplate: { select: { code: true } } },
    });

    if (!technique || technique.programTemplate.code !== code) {
      res.status(404).json({ message: "Technique not found" });
      return;
    }

    const media = await prisma.programTemplateTechniqueAsset.findUnique({ where: { id: mediaId } });
    if (!media || media.techniqueId !== techniqueId) {
      res.status(404).json({ message: "Technique media asset not found" });
      return;
    }

    await prisma.programTemplateTechniqueAsset.delete({ where: { id: mediaId } });
    await deleteProgramTechniqueMedia(media.objectKey).catch(() => undefined);

    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete technique media", error);
    res.status(500).json({ message: "Failed to delete technique media" });
  }
});

adminTemplatesRouter.delete("/program-templates/:code/technique/media/:mediaId", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    const mediaId = getStringParam(req.params.mediaId);

    if (!code || !mediaId) {
      res.status(400).json({ message: "Program template code and media id are required" });
      return;
    }

    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
    if (!template) {
      res.status(404).json({ message: "Program template not found" });
      return;
    }

    const media = await prisma.programTemplateTechniqueAsset.findUnique({ where: { id: mediaId } });

    if (!media || media.programTemplateId !== template.id) {
      res.status(404).json({ message: "Technique media asset not found" });
      return;
    }

    await prisma.programTemplateTechniqueAsset.delete({ where: { id: mediaId } });
    await deleteProgramTechniqueMedia(media.objectKey).catch(() => undefined);

    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete technique media", error);
    res.status(500).json({ message: "Failed to delete technique media" });
  }
});

adminTemplatesRouter.delete("/program-templates/:code", async (req: Request, res: Response) => {
  try {
    const code = getStringParam(req.params.code);
    if (!code) { res.status(400).json({ message: "Code required" }); return; }
    const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true, isEditable: true } });
    if (!template) { res.status(404).json({ message: "Template not found" }); return; }
    if (!template.isEditable) { res.status(403).json({ message: "This template is read-only" }); return; }
    await prisma.programTemplate.delete({ where: { code } });
    res.status(204).end();
  } catch (error) {
    console.error("Failed to delete template", error);
    res.status(500).json({ message: "Failed to delete template" });
  }
});

// ── Day CRUD ────────────────────────────────────────────────────────────────

adminTemplatesRouter.put(
  "/program-templates/:code/days/:dayNumber",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const dayNumber = Number(req.params.dayNumber);
      if (!code) { res.status(400).json({ message: "Code required" }); return; }
      if (!Number.isInteger(dayNumber) || dayNumber <= 0) { res.status(400).json({ message: "Invalid day number" }); return; }

      const payload = upsertDaySchema.parse(req.body);
      const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
      if (!template) { res.status(404).json({ message: "Template not found" }); return; }

      const day = await prisma.programDayTemplate.upsert({
        where: { programTemplateId_dayNumber: { programTemplateId: template.id, dayNumber } },
        update: { title: payload.title, dayType: payload.dayType, notes: payload.notes ?? null },
        create: {
          programTemplateId: template.id,
          dayNumber,
          title: payload.title,
          dayType: payload.dayType,
          notes: payload.notes ?? null,
        },
      });
      res.json({ day });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid day payload", issues: error.issues });
        return;
      }
      console.error("Failed to upsert day", error);
      res.status(500).json({ message: "Failed to upsert day" });
    }
  },
);

adminTemplatesRouter.delete(
  "/program-templates/:code/days/:dayNumber",
  async (req: Request, res: Response) => {
    try {
      const code = getStringParam(req.params.code);
      const dayNumber = Number(req.params.dayNumber);
      if (!code) { res.status(400).json({ message: "Code required" }); return; }
      if (!Number.isInteger(dayNumber) || dayNumber <= 0) { res.status(400).json({ message: "Invalid day number" }); return; }

      const template = await prisma.programTemplate.findUnique({ where: { code }, select: { id: true } });
      if (!template) { res.status(404).json({ message: "Template not found" }); return; }

      await prisma.programDayTemplate.deleteMany({
        where: { programTemplateId: template.id, dayNumber },
      });
      res.status(204).end();
    } catch (error) {
      console.error("Failed to delete day", error);
      res.status(500).json({ message: "Failed to delete day" });
    }
  },
);

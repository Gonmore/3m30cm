/**
 * BiometricSpaceConverter
 *
 * Converts MediaPipe normalized landmark coordinates (0-1, y grows downward)
 * to real-world centimetres using a two-point manual rim annotation.
 *
 * Calibration constants:
 *   - Rim height from floor: 305 cm  (NBA regulation)
 *   - Rim inner diameter:    45.72 cm (NBA regulation)
 *
 * The admin annotates the left edge (backboard side) and right edge (tip) of
 * the rim on a single video frame.  Camera-tracking transforms are used to
 * project those two points to any other frame.
 */

/** NBA regulation values (constant) */
const RIM_HEIGHT_CM = 305;
const RIM_INNER_DIAMETER_CM = 45.72;

/** Landmark indices mirroring MediaPipe Pose */
export const LANDMARK_INDEX = {
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

// ── Local types ───────────────────────────────────────────────────────────────

export interface Lm2d {
  x: number;
  y: number;
}

interface CameraTransform {
  translationX: number;
  translationY: number;
  scale: number;
}

export interface CameraTracking {
  referenceFrameIndex: number;
  frameTransforms: CameraTransform[];
}

export interface RimAnnotation {
  frameIndex: number;
  xLeft: number;
  yLeft: number;
  xRight: number;
  yRight: number;
}

export interface CalibrationResult {
  normPerCmV: number;
  normPerCmH: number;
  groundY_norm: number;
  rimCenterY_norm: number;
  scaleSource: "rim-manual-2pt";
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class CalibrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationError";
  }
}

// ── Projection helpers ────────────────────────────────────────────────────────

/**
 * Projects a raw normalized point from its source frame (detTransform) to
 * the raw coordinate space of a target frame (tgtTransform).
 *
 * raw → world:   worldX = ((rawX - 0.5) - T_det.tx) / T_det.scale + 0.5
 * world → raw:   rawX   = (worldX - 0.5) * T_tgt.scale + T_tgt.tx + 0.5
 */
function projectPoint(
  rawX: number,
  rawY: number,
  detTransform: CameraTransform | null | undefined,
  tgtTransform: CameraTransform | null | undefined,
): Lm2d {
  let wx = rawX;
  let wy = rawY;

  if (detTransform && Number.isFinite(detTransform.scale) && detTransform.scale > 0) {
    wx = ((rawX - 0.5) - detTransform.translationX) / detTransform.scale + 0.5;
    wy = ((rawY - 0.5) - detTransform.translationY) / detTransform.scale + 0.5;
  }

  if (tgtTransform && Number.isFinite(tgtTransform.scale) && tgtTransform.scale > 0) {
    return {
      x: (wx - 0.5) * tgtTransform.scale + tgtTransform.translationX + 0.5,
      y: (wy - 0.5) * tgtTransform.scale + tgtTransform.translationY + 0.5,
    };
  }

  return { x: wx, y: wy };
}

// ── Converter class ───────────────────────────────────────────────────────────

export class BiometricSpaceConverter {
  private readonly rimAnnotation: RimAnnotation | null;
  private readonly dipFrameIndex: number;
  private readonly cameraTracking: CameraTracking | null;

  readonly groundY_norm: number;
  readonly rimCenterY_at_dip: number;
  readonly normPerCmV: number;
  readonly normPerCmH: number;

  constructor(
    rimAnnotation: RimAnnotation | null,
    dipFrameIndex: number,
    /** All 33 MediaPipe landmarks at the DIP frame (raw, not compensated). */
    dipFrameLandmarks: Array<Lm2d | null>,
    cameraTracking?: CameraTracking | null,
  ) {
    this.rimAnnotation = rimAnnotation;
    this.dipFrameIndex = dipFrameIndex;
    this.cameraTracking = cameraTracking ?? null;

    // ── Ground Y: average of top-2 lowest foot landmarks at DIP frame ──────
    const footIndices = [
      LANDMARK_INDEX.LEFT_ANKLE, LANDMARK_INDEX.RIGHT_ANKLE,
      LANDMARK_INDEX.LEFT_HEEL, LANDMARK_INDEX.RIGHT_HEEL,
      LANDMARK_INDEX.LEFT_FOOT_INDEX, LANDMARK_INDEX.RIGHT_FOOT_INDEX,
    ];
    const footYs = footIndices
      .map((i) => dipFrameLandmarks[i]?.y ?? null)
      .filter((y): y is number => typeof y === "number" && Number.isFinite(y))
      .sort((a, b) => b - a) // descending: largest Y = lowest on screen
      .slice(0, 2);

    if (footYs.length === 0) {
      throw new CalibrationError(
        "No foot landmarks available at DIP frame to establish ground reference.",
      );
    }
    this.groundY_norm = footYs.reduce((s, v) => s + v, 0) / footYs.length;

    if (rimAnnotation === null) {
      // No rim annotation: calibration-dependent methods (CoM, RIM_REFERENCE) will be unavailable.
      this.rimCenterY_at_dip = 0;
      this.normPerCmV = 0;
      this.normPerCmH = 0;
      return;
    }

    // ── Project rim annotation to DIP frame ─────────────────────────────────
    const detT = this.cameraTracking?.frameTransforms[rimAnnotation.frameIndex] ?? null;
    const dipT = this.cameraTracking?.frameTransforms[dipFrameIndex] ?? null;

    const leftAtDip = projectPoint(rimAnnotation.xLeft, rimAnnotation.yLeft, detT, dipT);
    const rightAtDip = projectPoint(rimAnnotation.xRight, rimAnnotation.yRight, detT, dipT);

    this.rimCenterY_at_dip = (leftAtDip.y + rightAtDip.y) / 2;

    // ── Vertical scale ───────────────────────────────────────────────────────
    const rimGroundDelta = this.groundY_norm - this.rimCenterY_at_dip;
    if (rimGroundDelta <= 0.005) {
      throw new CalibrationError(
        `Rim is at or below ground level after projection ` +
        `(rimCenterY=${this.rimCenterY_at_dip.toFixed(4)}, groundY=${this.groundY_norm.toFixed(4)}). ` +
        "Verify the rim annotation points are above the feet in the frame.",
      );
    }
    this.normPerCmV = rimGroundDelta / RIM_HEIGHT_CM;

    // ── Horizontal scale ─────────────────────────────────────────────────────
    const dx = rightAtDip.x - leftAtDip.x;
    const dy = rightAtDip.y - leftAtDip.y;
    const rimWidthNorm = Math.sqrt(dx * dx + dy * dy);
    if (rimWidthNorm < 0.001) {
      throw new CalibrationError(
        "Rim left and right annotation points are too close together (< 0.001 normalized units).",
      );
    }
    this.normPerCmH = rimWidthNorm / RIM_INNER_DIAMETER_CM;
  }

  /**
   * Convert a raw normalized Y coordinate to cm above the DIP-frame ground.
   * Positive = above ground, 0 = at ground level, negative = below ground (skip).
   */
  toMetricY(y_norm: number): number {
    return (this.groundY_norm - y_norm) / this.normPerCmV;
  }

  /**
   * Convert a raw normalized X offset (relative to body center) to cm.
   * Positive = to the right, negative = to the left.
   */
  toMetricDeltaX(dx_norm: number): number {
    return dx_norm / this.normPerCmH;
  }

  /**
   * Project the rim annotation endpoints to the raw coordinate space of any
   * target frame.  Used by the RIM_REFERENCE method at the APEX frame.
   */
  getProjectedRimAtFrame(targetFrameIndex: number): {
    xLeft: number; yLeft: number;
    xRight: number; yRight: number;
    xCenter: number; yCenter: number;
  } {
    if (!this.rimAnnotation) {
      return { xLeft: 0, yLeft: 0, xRight: 0, yRight: 0, xCenter: 0, yCenter: 0 };
    }
    const detT = this.cameraTracking?.frameTransforms[this.rimAnnotation.frameIndex] ?? null;
    const tgtT = this.cameraTracking?.frameTransforms[targetFrameIndex] ?? null;

    const left = projectPoint(this.rimAnnotation.xLeft, this.rimAnnotation.yLeft, detT, tgtT);
    const right = projectPoint(this.rimAnnotation.xRight, this.rimAnnotation.yRight, detT, tgtT);

    return {
      xLeft: left.x, yLeft: left.y,
      xRight: right.x, yRight: right.y,
      xCenter: (left.x + right.x) / 2,
      yCenter: (left.y + right.y) / 2,
    };
  }

  /** Export calibration constants for storage alongside the analysis result. */
  getCalibration(): CalibrationResult {
    return {
      normPerCmV: this.normPerCmV,
      normPerCmH: this.normPerCmH,
      groundY_norm: this.groundY_norm,
      rimCenterY_norm: this.rimCenterY_at_dip,
      scaleSource: "rim-manual-2pt",
    };
  }

  /**
   * Compute the angle in degrees at vertex B given three 2-D points A, B, C.
   * Returns null if any point is missing or the vectors have zero length.
   */
  static computeAngle(
    A: Lm2d | null | undefined,
    B: Lm2d | null | undefined,
    C: Lm2d | null | undefined,
  ): number | null {
    if (!A || !B || !C) return null;
    const ax = A.x - B.x, ay = A.y - B.y;
    const cx = C.x - B.x, cy = C.y - B.y;
    const dot = ax * cx + ay * cy;
    const magA = Math.sqrt(ax * ax + ay * ay);
    const magC = Math.sqrt(cx * cx + cy * cy);
    if (magA < 1e-9 || magC < 1e-9) return null;
    const cosTheta = Math.max(-1, Math.min(1, dot / (magA * magC)));
    return (Math.acos(cosTheta) * 180) / Math.PI;
  }

  get dipFrame(): number {
    return this.dipFrameIndex;
  }
}

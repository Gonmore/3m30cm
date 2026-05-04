import type { TechniqueProLandmarks } from "./techniquePoseExtraction";

export const autoDetectedTechniqueEventDetector = "HIP_FOOT_HEURISTIC_V1" as const;

export type AutoDetectedTechniqueEventType =
  | "SETUP"
  | "DIP"
  | "ANTEPENULTIMATE_CONTACT"
  | "PRE_PENULTIMATE_FLIGHT"
  | "PENULTIMATE_CONTACT"
  | "TOE_OFF"
  | "APEX"
  | "LANDING";

export interface AutoDetectedTechniqueKeyEvent {
  eventType: AutoDetectedTechniqueEventType;
  frameIndex: number;
  confidence: number;
  detector: typeof autoDetectedTechniqueEventDetector;
}

export type AutoDetectedTechniqueSupportSide = "LEFT" | "RIGHT";
export type AutoDetectedTechniqueSupportLabel = AutoDetectedTechniqueSupportSide | "AIRBORNE";

export interface AutoDetectedTechniqueDebugRun {
  start: number;
  end: number;
  length: number;
  side: AutoDetectedTechniqueSupportLabel;
}

export interface AutoDetectedTechniqueDebugPeak {
  frameIndex: number;
  side: AutoDetectedTechniqueSupportSide;
  score: number;
}

export interface AutoDetectedTechniqueDebugSelection {
  eventType: AutoDetectedTechniqueEventType | "LAST_CONTACT";
  frameIndex: number | null;
  side: AutoDetectedTechniqueSupportSide | null;
  source: "support-run" | "alternating-peak" | "timing-fallback" | "airborne-run" | "posture-choice";
}

export interface AutoDetectedTechniqueDebugData {
  setupIndex: number;
  dipIndex: number;
  firstAirborneIndex: number;
  takeOffIndex: number;
  toeOffIndex: number;
  apexIndex: number;
  landingIndex: number;
  supportLabels: AutoDetectedTechniqueSupportLabel[];
  supportRuns: AutoDetectedTechniqueDebugRun[];
  airborneRuns: AutoDetectedTechniqueDebugRun[];
  fallbackSupportPeaks: AutoDetectedTechniqueDebugPeak[];
  selectedSupportPeaks: AutoDetectedTechniqueDebugPeak[];
  selections: AutoDetectedTechniqueDebugSelection[];
}

export interface AutoDetectedTechniqueDetectionResult {
  events: AutoDetectedTechniqueKeyEvent[];
  debug: AutoDetectedTechniqueDebugData;
}

const landmarkIndex = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
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

interface Point2D {
  x: number;
  y: number;
}

type SupportSide = AutoDetectedTechniqueSupportSide;

interface IndexedRun {
  start: number;
  end: number;
  length: number;
}

interface SupportRun extends IndexedRun {
  side: SupportSide;
}

interface SupportPeak {
  frameIndex: number;
  side: SupportSide;
  score: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function average(values: Array<number | null | undefined>) {
  const validValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!validValues.length) {
    return 0;
  }

  return validValues.reduce((total, value) => total + value, 0) / validValues.length;
}

function averageLargestValues(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => right - left);
  const sampleSize = Math.max(3, Math.floor(sortedValues.length * 0.12));
  return average(sortedValues.slice(0, sampleSize));
}

function smoothSeries(values: number[], radius = 2) {
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    return average(values.slice(start, end + 1));
  });
}

function buildRollingMaximumSeries(values: number[], radius = 4) {
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    return Math.max(...values.slice(start, end + 1));
  });
}

function normalizeSeries(values: number[]) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 0.0001);
  return values.map((value) => clamp((value - minimum) / range, 0, 1));
}

function getSeriesValue(values: number[], index: number) {
  return values[index] ?? 0;
}

function findIndexOfMinimum(values: number[], startIndex: number, endIndex: number) {
  let selectedIndex = startIndex;

  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    if (getSeriesValue(values, index) < getSeriesValue(values, selectedIndex)) {
      selectedIndex = index;
    }
  }

  return selectedIndex;
}

function findIndexOfMaximum(values: number[], startIndex: number, endIndex: number) {
  let selectedIndex = startIndex;

  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    if (getSeriesValue(values, index) > getSeriesValue(values, selectedIndex)) {
      selectedIndex = index;
    }
  }

  return selectedIndex;
}

function findFirstRun(flags: boolean[], startIndex: number, runLength: number) {
  let currentRun = 0;

  for (let index = startIndex; index < flags.length; index += 1) {
    currentRun = (flags[index] ?? false) ? currentRun + 1 : 0;
    if (currentRun >= runLength) {
      return index - runLength + 1;
    }
  }

  return null;
}

function collectRuns(flags: boolean[], expectedValue: boolean, startIndex: number, endIndex: number, minLength = 1) {
  const runs: IndexedRun[] = [];
  let runStart: number | null = null;

  for (let index = startIndex; index <= endIndex; index += 1) {
    const matches = (flags[index] ?? false) === expectedValue;
    if (matches) {
      if (runStart === null) {
        runStart = index;
      }
      continue;
    }

    if (runStart !== null) {
      const end = index - 1;
      const length = end - runStart + 1;
      if (length >= minLength) {
        runs.push({ start: runStart, end, length });
      }
      runStart = null;
    }
  }

  if (runStart !== null) {
    const length = endIndex - runStart + 1;
    if (length >= minLength) {
      runs.push({ start: runStart, end: endIndex, length });
    }
  }

  return runs;
}

function collectSupportRuns(labels: Array<SupportSide | null>, startIndex: number, endIndex: number, minLength = 1) {
  const runs: SupportRun[] = [];
  let runStart: number | null = null;
  let runSide: SupportSide | null = null;

  for (let index = startIndex; index <= endIndex; index += 1) {
    const label = labels[index] ?? null;
    if (label && label === runSide) {
      if (runStart === null) {
        runStart = index;
      }
      continue;
    }

    if (runStart !== null && runSide) {
      const end = index - 1;
      const length = end - runStart + 1;
      if (length >= minLength) {
        runs.push({ side: runSide, start: runStart, end, length });
      }
    }

    runStart = label ? index : null;
    runSide = label;
  }

  if (runStart !== null && runSide) {
    const length = endIndex - runStart + 1;
    if (length >= minLength) {
      runs.push({ side: runSide, start: runStart, end: endIndex, length });
    }
  }

  return runs;
}

function findLocalMaxima(values: number[], startIndex: number, endIndex: number, minGap: number, prominence: number) {
  const peaks: number[] = [];

  for (let index = Math.max(startIndex + 1, 1); index < Math.min(endIndex, values.length - 1); index += 1) {
    const previousValue = getSeriesValue(values, index - 1);
    const currentValue = getSeriesValue(values, index);
    const nextValue = getSeriesValue(values, index + 1);

    if (currentValue < previousValue || currentValue < nextValue) {
      continue;
    }

    if ((currentValue - Math.max(previousValue, nextValue)) < prominence) {
      continue;
    }

    const lastPeakIndex = peaks[peaks.length - 1];
    if (typeof lastPeakIndex === "number" && index - lastPeakIndex <= minGap) {
      if (currentValue > getSeriesValue(values, lastPeakIndex)) {
        peaks[peaks.length - 1] = index;
      }
      continue;
    }

    peaks.push(index);
  }

  return peaks;
}

function normalizeConfidence(value: number) {
  return Math.round(clamp(value, 0.35, 0.98) * 100) / 100;
}

function getFramePoint(frame: TechniqueProLandmarks["frames"][number] | undefined, index: number): Point2D | null {
  const point = frame?.landmarks[index];
  if (!point) {
    return null;
  }

  return { x: point.x, y: point.y };
}

function averageFramePoints(points: Array<Point2D | null>) {
  const validPoints = points.filter((point): point is Point2D => Boolean(point));
  if (!validPoints.length) {
    return null;
  }

  return {
    x: average(validPoints.map((point) => point.x)),
    y: average(validPoints.map((point) => point.y)),
  };
}

function getFootReferencePoint(
  frame: TechniqueProLandmarks["frames"][number] | undefined,
  ankleIndex: number,
  heelIndex: number,
  footIndex: number,
) {
  return averageFramePoints([
    getFramePoint(frame, ankleIndex),
    getFramePoint(frame, heelIndex),
    getFramePoint(frame, footIndex),
  ]);
}

function buildPointMotionSeries(points: Array<Point2D | null>) {
  const motionSeries = points.map((point, index) => {
    if (index === 0 || !point) {
      return 0;
    }

    const previousPoint = points[index - 1];
    if (!previousPoint) {
      return 0;
    }

    return Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
  });

  return smoothSeries(motionSeries, 1);
}

function buildContactScoreSeries(
  contactSeries: number[],
  motionSeries: number[],
  hipToFootSeries: number[],
  groundInfo: ReturnType<typeof buildGroundedFlags>,
) {
  const motionNormalized = normalizeSeries(motionSeries);
  const legLoadNormalized = normalizeSeries(hipToFootSeries);
  const localMaxima = buildRollingMaximumSeries(contactSeries, 5);
  const localTolerance = Math.max((Math.max(...contactSeries) - Math.min(...contactSeries)) * 0.06, 0.008);

  return contactSeries.map((value, index) => {
    const groundedness = clamp(
      (value - (groundInfo.groundBaseline - groundInfo.tolerance)) / Math.max(groundInfo.tolerance * 1.5, 0.0001),
      0,
      1,
    );
    const localGroundedness = clamp(
      (value - (getSeriesValue(localMaxima, index) - localTolerance)) / Math.max(localTolerance, 0.0001),
      0,
      1,
    );
    const stability = clamp(1 - getSeriesValue(motionNormalized, index), 0, 1);
    const legLoad = getSeriesValue(legLoadNormalized, index);

    return (groundedness * 0.28) + (localGroundedness * 0.28) + (stability * 0.24) + (legLoad * 0.20);
  });
}

function measureAngleDegrees(pointA: Point2D | null, vertex: Point2D | null, pointC: Point2D | null) {
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

  const cosine = clamp(
    (vectorA.x * vectorC.x + vectorA.y * vectorC.y) / (magnitudeA * magnitudeC),
    -1,
    1,
  );

  return (Math.acos(cosine) * 180) / Math.PI;
}

function scoreWithinRange(value: number | null, min: number, max: number, softness: number) {
  if (value === null || !Number.isFinite(value)) {
    return 0.35;
  }

  if (value >= min && value <= max) {
    return 1;
  }

  const distance = value < min ? min - value : value - max;
  if (distance >= softness) {
    return 0;
  }

  return 1 - (distance / softness);
}

function scoreDistance(value: number | null, target: number, tolerance: number, softness: number) {
  if (value === null || !Number.isFinite(value)) {
    return 0.35;
  }

  const distance = Math.abs(value - target);
  if (distance <= tolerance) {
    return 1;
  }

  if (distance >= softness) {
    return 0;
  }

  return 1 - ((distance - tolerance) / Math.max(softness - tolerance, 0.0001));
}

function inferTravelDirection(hipXSeries: number[], setupIndex: number, takeOffIndex: number) {
  return getSeriesValue(hipXSeries, takeOffIndex) >= getSeriesValue(hipXSeries, setupIndex) ? 1 : -1;
}

function scoreArmBackExtension(
  frame: TechniqueProLandmarks["frames"][number] | undefined,
  shoulderIndex: number,
  elbowIndex: number,
  wristIndex: number,
  travelDirection: 1 | -1,
) {
  const shoulder = getFramePoint(frame, shoulderIndex);
  const elbow = getFramePoint(frame, elbowIndex);
  const wrist = getFramePoint(frame, wristIndex);
  if (!shoulder || !elbow || !wrist) {
    return 0.35;
  }

  const elbowAngle = measureAngleDegrees(shoulder, elbow, wrist);
  const wristHeightDelta = Math.abs(wrist.y - shoulder.y);
  const wristBehindShoulder = travelDirection * (wrist.x - shoulder.x);

  return average([
    scoreWithinRange(elbowAngle, 145, 185, 35),
    scoreDistance(wristHeightDelta, 0, 0.05, 0.16),
    scoreDistance(wristBehindShoulder, -0.08, 0.06, 0.22),
  ]);
}

function scorePrePenultimateFlightPosture(
  landmarks: TechniqueProLandmarks,
  frameIndex: number,
  travelDirection: 1 | -1,
  targetFrameIndex: number,
) {
  const frame = landmarks.frames[frameIndex];
  const leftShoulder = getFramePoint(frame, landmarkIndex.LEFT_SHOULDER);
  const rightShoulder = getFramePoint(frame, landmarkIndex.RIGHT_SHOULDER);
  const leftHip = getFramePoint(frame, landmarkIndex.LEFT_HIP);
  const rightHip = getFramePoint(frame, landmarkIndex.RIGHT_HIP);
  const leftKnee = getFramePoint(frame, landmarkIndex.LEFT_KNEE);
  const rightKnee = getFramePoint(frame, landmarkIndex.RIGHT_KNEE);
  const leftAnkle = getFramePoint(frame, landmarkIndex.LEFT_ANKLE);
  const rightAnkle = getFramePoint(frame, landmarkIndex.RIGHT_ANKLE);

  if (!leftHip || !rightHip || !leftShoulder || !rightShoulder || !leftAnkle || !rightAnkle || !leftKnee || !rightKnee) {
    return 0.35;
  }

  const leftForward = travelDirection * leftAnkle.x;
  const rightForward = travelDirection * rightAnkle.x;
  const frontSide = rightForward > leftForward ? "RIGHT" : "LEFT";
  const frontHip = frontSide === "RIGHT" ? rightHip : leftHip;
  const frontShoulder = frontSide === "RIGHT" ? rightShoulder : leftShoulder;
  const frontAnkle = frontSide === "RIGHT" ? rightAnkle : leftAnkle;
  const backHip = frontSide === "RIGHT" ? leftHip : rightHip;
  const backKnee = frontSide === "RIGHT" ? leftKnee : rightKnee;
  const backAnkle = frontSide === "RIGHT" ? leftAnkle : rightAnkle;
  const hipCenter = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
  const shoulderCenter = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
  const trunkHorizontalOffset = Math.abs(shoulderCenter.x - hipCenter.x);
  const backLegKneeAngle = measureAngleDegrees(backHip, backKnee, backAnkle);
  const frontLegHipAngle = measureAngleDegrees(frontShoulder, frontHip, frontAnkle);
  const armScore = average([
    scoreArmBackExtension(frame, landmarkIndex.LEFT_SHOULDER, landmarkIndex.LEFT_ELBOW, landmarkIndex.LEFT_WRIST, travelDirection),
    scoreArmBackExtension(frame, landmarkIndex.RIGHT_SHOULDER, landmarkIndex.RIGHT_ELBOW, landmarkIndex.RIGHT_WRIST, travelDirection),
  ]);
  const trunkScore = scoreDistance(trunkHorizontalOffset, 0, 0.025, 0.12);
  const backLegScore = scoreWithinRange(backLegKneeAngle, 75, 105, 30);
  const frontLegScore = scoreWithinRange(frontLegHipAngle, 100, 130, 35);
  const frameDistance = Math.abs(frameIndex - targetFrameIndex);
  const frameTimingScore = scoreDistance(frameDistance, 0, 1.1, 4.5);

  return average([
    frameTimingScore * 1.2,
    backLegScore * 1.1,
    armScore * 1.1,
    trunkScore,
    frontLegScore,
  ]);
}

function buildGroundedFlags(series: number[]) {
  const groundBaseline = averageLargestValues(series);
  const range = Math.max(...series) - Math.min(...series);
  const tolerance = Math.max(range * 0.08, 0.01);
  const localMaxima = buildRollingMaximumSeries(series, 5);
  const localTolerance = Math.max(range * 0.06, 0.008);

  return {
    groundBaseline,
    tolerance,
    flags: series.map((value, index) => {
      const nearGlobalBaseline = value >= groundBaseline - tolerance;
      const nearLocalBaseline = value >= getSeriesValue(localMaxima, index) - localTolerance;
      return nearGlobalBaseline || nearLocalBaseline;
    }),
  };
}

function buildSupportLabels(
  leftGround: ReturnType<typeof buildGroundedFlags>,
  rightGround: ReturnType<typeof buildGroundedFlags>,
  leftSeries: number[],
  rightSeries: number[],
) {
  const labels: Array<SupportSide | null> = [];
  let previousSide: SupportSide | null = null;

  for (let index = 0; index < Math.max(leftSeries.length, rightSeries.length); index += 1) {
    const leftActive = Boolean(leftGround.flags[index]);
    const rightActive = Boolean(rightGround.flags[index]);

    if (leftActive && !rightActive) {
      labels.push("LEFT");
      previousSide = "LEFT";
      continue;
    }

    if (rightActive && !leftActive) {
      labels.push("RIGHT");
      previousSide = "RIGHT";
      continue;
    }

    if (!leftActive && !rightActive) {
      labels.push(null);
      previousSide = null;
      continue;
    }

    const leftSupportStrength = getSeriesValue(leftSeries, index);
    const rightSupportStrength = getSeriesValue(rightSeries, index);
    const supportDifference = leftSupportStrength - rightSupportStrength;

    if (Math.abs(supportDifference) < 0.08 && previousSide) {
      labels.push(previousSide);
      continue;
    }

    if (supportDifference >= 0) {
      labels.push("LEFT");
      previousSide = "LEFT";
      continue;
    }

    labels.push("RIGHT");
    previousSide = "RIGHT";
  }

  return labels;
}

function detectSetupIndex(hipX: number[], hipY: number[], dipIndex: number) {
  const lastCandidateIndex = Math.max(dipIndex - 1, 0);
  if (lastCandidateIndex === 0) {
    return 0;
  }

  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index <= lastCandidateIndex; index += 1) {
    const previousHipX = hipX[Math.max(index - 1, 0)] ?? hipX[index] ?? 0;
    const nextHipX = hipX[Math.min(index + 1, lastCandidateIndex)] ?? hipX[index] ?? 0;
    const previousHipY = hipY[Math.max(index - 1, 0)] ?? hipY[index] ?? 0;
    const nextHipY = hipY[Math.min(index + 1, lastCandidateIndex)] ?? hipY[index] ?? 0;
    const motionScore = Math.abs(nextHipX - previousHipX) + Math.abs(nextHipY - previousHipY);

    if (motionScore < bestScore) {
      bestScore = motionScore;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function buildContactConfidence(index: number, leftSeries: number[], rightSeries: number[], leftGround: ReturnType<typeof buildGroundedFlags>, rightGround: ReturnType<typeof buildGroundedFlags>) {
  const leftScore = getSeriesValue(leftSeries, index);
  const rightScore = getSeriesValue(rightSeries, index);
  const groundedBonus = Math.max(
    leftGround.flags[index] ? 0.06 : 0,
    rightGround.flags[index] ? 0.06 : 0,
  );
  return normalizeConfidence(0.45 + (Math.max(leftScore, rightScore) * 0.4) + groundedBonus);
}

function collectSupportPeaks(
  leftSeries: number[],
  rightSeries: number[],
  leftGround: ReturnType<typeof buildGroundedFlags>,
  rightGround: ReturnType<typeof buildGroundedFlags>,
  endIndex: number,
  minGap: number,
) {
  const prominence = Math.max(Math.max(...leftSeries, ...rightSeries) - Math.min(...leftSeries, ...rightSeries), 0.01) * 0.015;
  const rawPeaks: SupportPeak[] = [
    ...findLocalMaxima(leftSeries, 0, endIndex, minGap, prominence)
      .filter((frameIndex) => Boolean(leftGround.flags[frameIndex]))
      .map((frameIndex) => ({ frameIndex, side: "LEFT" as const, score: getSeriesValue(leftSeries, frameIndex) })),
    ...findLocalMaxima(rightSeries, 0, endIndex, minGap, prominence)
      .filter((frameIndex) => Boolean(rightGround.flags[frameIndex]))
      .map((frameIndex) => ({ frameIndex, side: "RIGHT" as const, score: getSeriesValue(rightSeries, frameIndex) })),
  ].sort((left, right) => left.frameIndex - right.frameIndex);

  const collapsedPeaks: SupportPeak[] = [];
  rawPeaks.forEach((peak) => {
    const previousPeak = collapsedPeaks[collapsedPeaks.length - 1];
    if (!previousPeak) {
      collapsedPeaks.push(peak);
      return;
    }

    if (previousPeak.side === peak.side && peak.frameIndex - previousPeak.frameIndex <= Math.max(2, minGap + 1)) {
      collapsedPeaks[collapsedPeaks.length - 1] = peak;
      return;
    }

    collapsedPeaks.push(peak);
  });

  return collapsedPeaks;
}

function selectAlternatingSupportPeaks(peaks: SupportPeak[]) {
  const selectedPeaks: SupportPeak[] = [];

  for (let index = peaks.length - 1; index >= 0; index -= 1) {
    const peak = peaks[index];
    if (!peak) {
      continue;
    }

    const previousSelectedPeak = selectedPeaks[selectedPeaks.length - 1];
    if (!previousSelectedPeak || previousSelectedPeak.side !== peak.side) {
      selectedPeaks.push(peak);
    }

    if (selectedPeaks.length >= 3) {
      break;
    }
  }

  return {
    last: selectedPeaks[0] ?? null,
    penultimate: selectedPeaks[1] ?? null,
    antepenultimate: selectedPeaks[2] ?? null,
  };
}

function selectAlternatingSupportRuns(runs: SupportRun[]) {
  const selectedRuns: SupportRun[] = [];

  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (!run) {
      continue;
    }

    const previousSelectedRun = selectedRuns[selectedRuns.length - 1];
    if (!previousSelectedRun || previousSelectedRun.side !== run.side) {
      selectedRuns.push(run);
    }

    if (selectedRuns.length >= 3) {
      break;
    }
  }

  return {
    last: selectedRuns[0] ?? null,
    penultimate: selectedRuns[1] ?? null,
    antepenultimate: selectedRuns[2] ?? null,
  };
}

export function detectTechniqueKeyEventsWithDebug(
  landmarks: TechniqueProLandmarks | null | undefined,
): AutoDetectedTechniqueDetectionResult {
  const referenceLandmarks = landmarks;
  const frames = referenceLandmarks?.frames ?? [];
  if (!referenceLandmarks || frames.length < 8) {
    return {
      events: [],
      debug: {
        setupIndex: 0,
        dipIndex: 0,
        firstAirborneIndex: 0,
        takeOffIndex: 0,
        toeOffIndex: 0,
        apexIndex: 0,
        landingIndex: 0,
        supportLabels: [],
        supportRuns: [],
        airborneRuns: [],
        fallbackSupportPeaks: [],
        selectedSupportPeaks: [],
        selections: [],
      },
    };
  }

  const hipYSeries = smoothSeries(frames.map((frame) => average([
    frame.landmarks[landmarkIndex.LEFT_HIP]?.y,
    frame.landmarks[landmarkIndex.RIGHT_HIP]?.y,
  ])));
  const comYSeries = smoothSeries(frames.map((frame) => average([
    frame.landmarks[landmarkIndex.LEFT_HIP]?.y,
    frame.landmarks[landmarkIndex.RIGHT_HIP]?.y,
    frame.landmarks[landmarkIndex.LEFT_SHOULDER]?.y,
    frame.landmarks[landmarkIndex.RIGHT_SHOULDER]?.y,
  ])));
  const leftHipYSeries = smoothSeries(frames.map((frame) => frame.landmarks[landmarkIndex.LEFT_HIP]?.y ?? 0));
  const rightHipYSeries = smoothSeries(frames.map((frame) => frame.landmarks[landmarkIndex.RIGHT_HIP]?.y ?? 0));
  const hipXSeries = smoothSeries(frames.map((frame) => average([
    frame.landmarks[landmarkIndex.LEFT_HIP]?.x,
    frame.landmarks[landmarkIndex.RIGHT_HIP]?.x,
  ])));
  const leftFootPointSeries = frames.map((frame) => getFootReferencePoint(frame, landmarkIndex.LEFT_ANKLE, landmarkIndex.LEFT_HEEL, landmarkIndex.LEFT_FOOT_INDEX));
  const rightFootPointSeries = frames.map((frame) => getFootReferencePoint(frame, landmarkIndex.RIGHT_ANKLE, landmarkIndex.RIGHT_HEEL, landmarkIndex.RIGHT_FOOT_INDEX));
  const leftContactSeries = smoothSeries(frames.map((frame) => Math.max(
    frame.landmarks[landmarkIndex.LEFT_ANKLE]?.y ?? 0,
    frame.landmarks[landmarkIndex.LEFT_HEEL]?.y ?? 0,
    frame.landmarks[landmarkIndex.LEFT_FOOT_INDEX]?.y ?? 0,
  )));
  const rightContactSeries = smoothSeries(frames.map((frame) => Math.max(
    frame.landmarks[landmarkIndex.RIGHT_ANKLE]?.y ?? 0,
    frame.landmarks[landmarkIndex.RIGHT_HEEL]?.y ?? 0,
    frame.landmarks[landmarkIndex.RIGHT_FOOT_INDEX]?.y ?? 0,
  )));
  const leftToeSeries = smoothSeries(frames.map((frame) => frame.landmarks[landmarkIndex.LEFT_FOOT_INDEX]?.y ?? 0));
  const rightToeSeries = smoothSeries(frames.map((frame) => frame.landmarks[landmarkIndex.RIGHT_FOOT_INDEX]?.y ?? 0));

  const hipMinimum = Math.min(...hipYSeries);
  const hipMaximum = Math.max(...hipYSeries);
  const hipRange = Math.max(hipMaximum - hipMinimum, 0.01);
  const leftGround = buildGroundedFlags(leftContactSeries);
  const rightGround = buildGroundedFlags(rightContactSeries);
  const leftToeGround = buildGroundedFlags(leftToeSeries);
  const rightToeGround = buildGroundedFlags(rightToeSeries);
  const leftFootMotionSeries = buildPointMotionSeries(leftFootPointSeries);
  const rightFootMotionSeries = buildPointMotionSeries(rightFootPointSeries);
  const leftHipToFootSeries = smoothSeries(leftContactSeries.map((value, index) => value - getSeriesValue(leftHipYSeries, index)), 1);
  const rightHipToFootSeries = smoothSeries(rightContactSeries.map((value, index) => value - getSeriesValue(rightHipYSeries, index)), 1);
  const leftContactScoreSeries = buildContactScoreSeries(leftContactSeries, leftFootMotionSeries, leftHipToFootSeries, leftGround);
  const rightContactScoreSeries = buildContactScoreSeries(rightContactSeries, rightFootMotionSeries, rightHipToFootSeries, rightGround);
  const supportEvidenceThreshold = 0.52;
  const anyGroundedFlags = frames.map((_, index) => (
    getSeriesValue(leftContactScoreSeries, index) >= supportEvidenceThreshold
    || getSeriesValue(rightContactScoreSeries, index) >= supportEvidenceThreshold
  ));
  const supportLabels = buildSupportLabels(leftGround, rightGround, leftContactScoreSeries, rightContactScoreSeries);

  const allAirborneRuns = collectRuns(anyGroundedFlags, false, 0, frames.length - 1, 1);

  // ── Anchor detection on LANDING ────────────────────────────────────────────
  // Strategy: identify the jump's main airborne run (last qualifying run with
  // sufficient duration), derive LANDING from its end, then work backwards to
  // locate APEX → TOE_OFF/TAKE_OFF → contact steps in chronological order.
  // This is more robust than seeding from a global hip-Y minimum because
  // the airborne→grounded transition at landing is a hard, detectable signal.
  const minJumpFrames = Math.max(2, Math.round((referenceLandmarks.fps ?? 15) / 8));
  const jumpAirborneRun = (
    allAirborneRuns.filter((run) => run.length >= minJumpFrames).at(-1)
    ?? allAirborneRuns.at(-1)
    ?? null
  );

  // LANDING = first grounded frame immediately after the jump airborne run ends
  const landingIndex = jumpAirborneRun != null
    ? (findFirstRun(anyGroundedFlags, Math.min(jumpAirborneRun.end + 1, frames.length - 1), 1)
       ?? Math.min(frames.length - 1, jumpAirborneRun.end + 1))
    : Math.floor(frames.length * 0.85);

  // APEX = comYSeries (4-point CoM) minimum strictly within the airborne window
  const apexWindowStart = jumpAirborneRun?.start ?? Math.max(2, Math.floor(frames.length * 0.15));
  const apexWindowEnd   = jumpAirborneRun != null
    ? Math.min(jumpAirborneRun.end, landingIndex - 1)
    : Math.max(landingIndex - 1, apexWindowStart);
  const apexIndex = findIndexOfMinimum(comYSeries, apexWindowStart, apexWindowEnd);

  const firstAirborneIndex = jumpAirborneRun?.start
    ?? findFirstRun(anyGroundedFlags.map((isGrounded) => !isGrounded), 0, 2)
    ?? Math.max(Math.min(apexIndex - 1, frames.length - 2), 1);
  const preAirborneIndex = Math.max(0, firstAirborneIndex - 1);
  const dipIndex = findIndexOfMaximum(hipYSeries, 0, Math.max(preAirborneIndex - 1, 0));
  const setupIndex = detectSetupIndex(hipXSeries, hipYSeries, dipIndex);
  const bilateralToeOffIndex = (() => {
    const searchStart = Math.max(0, dipIndex + 1);
    const searchEnd = Math.max(searchStart, firstAirborneIndex - 1);
    const nearAirborneThreshold = Math.max(searchStart, firstAirborneIndex - 3);

    for (let index = searchEnd; index >= searchStart; index -= 1) {
      const bilateralToeGrounded = Boolean(leftToeGround.flags[index]) && Boolean(rightToeGround.flags[index]);
      if (!bilateralToeGrounded || !Boolean(anyGroundedFlags[index])) {
        continue;
      }

      const nextFrameAirborne = index + 1 >= frames.length || !Boolean(anyGroundedFlags[index + 1]);
      if (index >= nearAirborneThreshold || nextFrameAirborne) {
        return index;
      }
    }

    for (let index = searchEnd; index >= searchStart; index -= 1) {
      if (Boolean(leftToeGround.flags[index]) && Boolean(rightToeGround.flags[index])) {
        return index;
      }
    }

    return preAirborneIndex;
  })();

  const toeOffIndex = bilateralToeOffIndex;
  const takeOffIndex = Math.max(dipIndex + 1, preAirborneIndex - 1);
  const travelDirection = inferTravelDirection(hipXSeries, setupIndex, takeOffIndex) as 1 | -1;
  const approachUpperBound = toeOffIndex; // last grounded frame before jump, used as approach analysis bound
  const contactRunMinLength = (referenceLandmarks.fps ?? 15) <= 20 ? 1 : 2;
  const supportRuns = collectSupportRuns(supportLabels, 0, approachUpperBound, contactRunMinLength);
  const airborneRuns = collectRuns(anyGroundedFlags, false, 0, approachUpperBound, 1);
  const fallbackSupportPeaks = collectSupportPeaks(leftContactScoreSeries, rightContactScoreSeries, leftGround, rightGround, approachUpperBound, contactRunMinLength);
  const alternatingSupportRuns = selectAlternatingSupportRuns(supportRuns);
  const alternatingFallbackPeaks = selectAlternatingSupportPeaks(fallbackSupportPeaks);
  const lastSupportRun = alternatingSupportRuns.last;
  const penultimateSupportRun = alternatingSupportRuns.penultimate;
  const antepenultimateSupportRun = alternatingSupportRuns.antepenultimate;
  const fallbackLastPeak = alternatingFallbackPeaks.last;
  const fallbackPenultimatePeak = alternatingFallbackPeaks.penultimate;
  const fallbackAntepenultimatePeak = alternatingFallbackPeaks.antepenultimate;

  // LAST_CONTACT: anchor to the first grounded frame right after the last approach-step
  // airborne run (the brief step flight between penultimate and bilateral plant). This is
  // more robust than lastSupportRun?.start, which can mis-fire when the bilateral-plant
  // side label matches the penultimate step (the alternating selector skips one run).
  const lastApproachFlightRun = airborneRuns.at(-1) ?? null;
  const lastContactIndex = lastApproachFlightRun != null
    ? Math.min(lastApproachFlightRun.end + 1, toeOffIndex)
    : (lastSupportRun?.start ?? fallbackLastPeak?.frameIndex ?? takeOffIndex);
  const approachTravel = Math.abs(getSeriesValue(hipXSeries, toeOffIndex) - getSeriesValue(hipXSeries, setupIndex));
  const allowApproachContacts = approachTravel >= 0.06 || supportRuns.length >= 3 || fallbackSupportPeaks.length >= 3;
  const penultimateContactIndex = allowApproachContacts ? (penultimateSupportRun?.start ?? fallbackPenultimatePeak?.frameIndex ?? null) : null;
  const antepenultimateContactIndex = allowApproachContacts ? (antepenultimateSupportRun?.start ?? fallbackAntepenultimatePeak?.frameIndex ?? null) : null;
  const prePenultimateFlightRun = allowApproachContacts && (antepenultimateSupportRun && penultimateSupportRun
    ? airborneRuns.find((run) => run.start > antepenultimateSupportRun.end && run.end < penultimateSupportRun.start) ?? null
    : airborneRuns.find((run) => run.start > (antepenultimateContactIndex ?? -1) && run.end < (penultimateContactIndex ?? -1)) ?? null);
  const targetFramesBeforePenultimate = Math.max(1, Math.round((referenceLandmarks.fps ?? 15) / 7.5));
  const targetPrePenultimateFrameIndex = penultimateContactIndex !== null
    ? Math.max(0, penultimateContactIndex - targetFramesBeforePenultimate)
    : null;
  const prePenultimateFlightIndex = prePenultimateFlightRun && targetPrePenultimateFrameIndex !== null
    ? Array.from({ length: prePenultimateFlightRun.end - prePenultimateFlightRun.start + 1 }, (_, offset) => prePenultimateFlightRun.start + offset)
      .sort((left, right) => {
        const leftScore = scorePrePenultimateFlightPosture(referenceLandmarks, left, travelDirection, targetPrePenultimateFrameIndex);
        const rightScore = scorePrePenultimateFlightPosture(referenceLandmarks, right, travelDirection, targetPrePenultimateFrameIndex);
        return rightScore - leftScore;
      })[0] ?? Math.round((prePenultimateFlightRun.start + prePenultimateFlightRun.end) / 2)
    : null;

  const dipConfidence = normalizeConfidence((getSeriesValue(hipYSeries, dipIndex) - hipMinimum) / hipRange);
  const apexConfidence = normalizeConfidence((hipMaximum - getSeriesValue(hipYSeries, apexIndex)) / hipRange);
  const setupConfidence = normalizeConfidence(0.55 + ((getSeriesValue(hipYSeries, dipIndex) - getSeriesValue(hipYSeries, setupIndex)) / hipRange) * 0.12);
  const airborneSpan = Math.max(landingIndex - firstAirborneIndex, 1);
  const prePenultimateFlightConfidence = prePenultimateFlightRun
    ? normalizeConfidence(
        0.48
        + (prePenultimateFlightRun.length / Math.max(frames.length, 1)) * 1.2
        + (prePenultimateFlightIndex !== null && targetPrePenultimateFrameIndex !== null
          ? scorePrePenultimateFlightPosture(referenceLandmarks, prePenultimateFlightIndex, travelDirection, targetPrePenultimateFrameIndex) * 0.45
          : 0),
      )
    : null;
  const toeOffConfidence = normalizeConfidence(0.62 + (airborneSpan / Math.max(frames.length, 1)) * 0.55);
  const landingConfidence = normalizeConfidence(0.6 + ((getSeriesValue(hipYSeries, landingIndex) - hipMinimum) / hipRange) * 0.25);

  const events: Array<AutoDetectedTechniqueKeyEvent | null> = [
    {
      eventType: "SETUP",
      frameIndex: setupIndex,
      confidence: setupConfidence,
      detector: autoDetectedTechniqueEventDetector,
    },
    {
      eventType: "DIP",
      frameIndex: dipIndex,
      confidence: dipConfidence,
      detector: autoDetectedTechniqueEventDetector,
    },
    antepenultimateContactIndex !== null ? {
      eventType: "ANTEPENULTIMATE_CONTACT",
      frameIndex: antepenultimateContactIndex,
      confidence: buildContactConfidence(antepenultimateContactIndex, leftContactScoreSeries, rightContactScoreSeries, leftGround, rightGround),
      detector: autoDetectedTechniqueEventDetector,
    } : null,
    prePenultimateFlightIndex !== null && prePenultimateFlightConfidence !== null ? {
      eventType: "PRE_PENULTIMATE_FLIGHT",
      frameIndex: prePenultimateFlightIndex,
      confidence: prePenultimateFlightConfidence,
      detector: autoDetectedTechniqueEventDetector,
    } : null,
    penultimateContactIndex !== null ? {
      eventType: "PENULTIMATE_CONTACT",
      frameIndex: penultimateContactIndex,
      confidence: buildContactConfidence(penultimateContactIndex, leftContactScoreSeries, rightContactScoreSeries, leftGround, rightGround),
      detector: autoDetectedTechniqueEventDetector,
    } : null,
    {
      eventType: "TOE_OFF",
      frameIndex: toeOffIndex,
      confidence: toeOffConfidence,
      detector: autoDetectedTechniqueEventDetector,
    },
    {
      eventType: "APEX",
      frameIndex: apexIndex,
      confidence: apexConfidence,
      detector: autoDetectedTechniqueEventDetector,
    },
    {
      eventType: "LANDING",
      frameIndex: landingIndex,
      confidence: landingConfidence,
      detector: autoDetectedTechniqueEventDetector,
    },
  ];

  const filteredEvents = events
    .filter((event): event is AutoDetectedTechniqueKeyEvent => Boolean(event))
    .filter((event, index, list) => list.findIndex((entry) => entry.eventType === event.eventType) === index)
    .filter((event) => event.frameIndex >= 0 && event.frameIndex < frames.length);

  return {
    events: filteredEvents,
    debug: {
      setupIndex,
      dipIndex,
      firstAirborneIndex,
      takeOffIndex,
      toeOffIndex,
      apexIndex,
      landingIndex,
      supportLabels: supportLabels.map((label) => label ?? "AIRBORNE"),
      supportRuns: supportRuns.map((run) => ({
        start: run.start,
        end: run.end,
        length: run.length,
        side: run.side,
      })),
      airborneRuns: airborneRuns.map((run) => ({
        start: run.start,
        end: run.end,
        length: run.length,
        side: "AIRBORNE",
      })),
      fallbackSupportPeaks: fallbackSupportPeaks.map((peak) => ({
        frameIndex: peak.frameIndex,
        side: peak.side,
        score: Math.round(peak.score * 100) / 100,
      })),
      selectedSupportPeaks: [fallbackLastPeak, fallbackPenultimatePeak, fallbackAntepenultimatePeak]
        .filter((peak): peak is SupportPeak => Boolean(peak))
        .map((peak) => ({
          frameIndex: peak.frameIndex,
          side: peak.side,
          score: Math.round(peak.score * 100) / 100,
        })),
      selections: [
        {
          eventType: "ANTEPENULTIMATE_CONTACT",
          frameIndex: antepenultimateContactIndex,
          side: antepenultimateSupportRun?.side ?? fallbackAntepenultimatePeak?.side ?? null,
          source: antepenultimateSupportRun ? "support-run" : fallbackAntepenultimatePeak ? "alternating-peak" : "timing-fallback",
        },
        {
          eventType: "PRE_PENULTIMATE_FLIGHT",
          frameIndex: prePenultimateFlightIndex,
          side: null,
          source: prePenultimateFlightRun && prePenultimateFlightIndex !== null ? "posture-choice" : "airborne-run",
        },
        {
          eventType: "PENULTIMATE_CONTACT",
          frameIndex: penultimateContactIndex,
          side: penultimateSupportRun?.side ?? fallbackPenultimatePeak?.side ?? null,
          source: penultimateSupportRun ? "support-run" : fallbackPenultimatePeak ? "alternating-peak" : "timing-fallback",
        },
        {
          eventType: "LAST_CONTACT",
          frameIndex: lastContactIndex,
          side: lastSupportRun?.side ?? fallbackLastPeak?.side ?? null,
          source: lastSupportRun ? "support-run" : fallbackLastPeak ? "alternating-peak" : "timing-fallback",
        },
      ],
    },
  };
}

export function detectTechniqueKeyEvents(landmarks: TechniqueProLandmarks | null | undefined): AutoDetectedTechniqueKeyEvent[] {
  return detectTechniqueKeyEventsWithDebug(landmarks).events;
}
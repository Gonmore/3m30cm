import type { TechniqueProLandmarks } from "./techniquePoseExtraction";

export const autoDetectedTechniqueEventDetector = "HIP_FOOT_HEURISTIC_V1" as const;

export type AutoDetectedTechniqueEventType =
  | "SETUP"
  | "DIP"
  | "ANTEPENULTIMATE_CONTACT"
  | "PRE_PENULTIMATE_FLIGHT"
  | "PENULTIMATE_CONTACT"
  | "LAST_CONTACT"
  | "TAKE_OFF"
  | "TOE_OFF"
  | "FLIGHT"
  | "APEX"
  | "LANDING";

export interface AutoDetectedTechniqueKeyEvent {
  eventType: AutoDetectedTechniqueEventType;
  frameIndex: number;
  confidence: number;
  detector: typeof autoDetectedTechniqueEventDetector;
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

type SupportSide = "LEFT" | "RIGHT";

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

  return {
    groundBaseline,
    tolerance,
    flags: series.map((value) => value >= groundBaseline - tolerance),
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

    const leftSupportStrength = getSeriesValue(leftSeries, index) - (leftGround.groundBaseline - leftGround.tolerance);
    const rightSupportStrength = getSeriesValue(rightSeries, index) - (rightGround.groundBaseline - rightGround.tolerance);
    const supportDifference = leftSupportStrength - rightSupportStrength;

    if (Math.abs(supportDifference) < Math.max(leftGround.tolerance, rightGround.tolerance) * 0.35 && previousSide) {
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
  const leftScore = (getSeriesValue(leftSeries, index) - (leftGround.groundBaseline - leftGround.tolerance)) / Math.max(leftGround.tolerance, 0.001);
  const rightScore = (getSeriesValue(rightSeries, index) - (rightGround.groundBaseline - rightGround.tolerance)) / Math.max(rightGround.tolerance, 0.001);
  return normalizeConfidence(0.5 + (Math.max(leftScore, rightScore) * 0.18));
}

function collectSupportPeaks(
  leftSeries: number[],
  rightSeries: number[],
  leftGround: ReturnType<typeof buildGroundedFlags>,
  rightGround: ReturnType<typeof buildGroundedFlags>,
  endIndex: number,
  minGap: number,
) {
  const prominence = Math.max(Math.max(...leftSeries, ...rightSeries) - Math.min(...leftSeries, ...rightSeries), 0.01) * 0.03;
  const rawPeaks: SupportPeak[] = [
    ...findLocalMaxima(leftSeries, 0, endIndex, minGap, prominence)
      .filter((frameIndex) => Boolean(leftGround.flags[frameIndex]))
      .map((frameIndex) => ({ frameIndex, side: "LEFT" as const })),
    ...findLocalMaxima(rightSeries, 0, endIndex, minGap, prominence)
      .filter((frameIndex) => Boolean(rightGround.flags[frameIndex]))
      .map((frameIndex) => ({ frameIndex, side: "RIGHT" as const })),
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

export function detectTechniqueKeyEvents(landmarks: TechniqueProLandmarks | null | undefined): AutoDetectedTechniqueKeyEvent[] {
  const referenceLandmarks = landmarks;
  const frames = referenceLandmarks?.frames ?? [];
  if (!referenceLandmarks || frames.length < 8) {
    return [];
  }

  const hipYSeries = smoothSeries(frames.map((frame) => average([
    frame.landmarks[landmarkIndex.LEFT_HIP]?.y,
    frame.landmarks[landmarkIndex.RIGHT_HIP]?.y,
  ])));
  const hipXSeries = smoothSeries(frames.map((frame) => average([
    frame.landmarks[landmarkIndex.LEFT_HIP]?.x,
    frame.landmarks[landmarkIndex.RIGHT_HIP]?.x,
  ])));
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

  const hipMinimum = Math.min(...hipYSeries);
  const hipMaximum = Math.max(...hipYSeries);
  const hipRange = Math.max(hipMaximum - hipMinimum, 0.01);
  const apexSearchStart = Math.max(2, Math.floor(frames.length * 0.15));
  const apexIndex = findIndexOfMinimum(hipYSeries, apexSearchStart, frames.length - 1);
  const dipIndex = findIndexOfMaximum(hipYSeries, 0, Math.max(apexIndex - 1, 0));
  const setupIndex = detectSetupIndex(hipXSeries, hipYSeries, dipIndex);
  const leftGround = buildGroundedFlags(leftContactSeries);
  const rightGround = buildGroundedFlags(rightContactSeries);
  const anyGroundedFlags = frames.map((_, index) => Boolean(leftGround.flags[index] || rightGround.flags[index]));
  const supportLabels = buildSupportLabels(leftGround, rightGround, leftContactSeries, rightContactSeries);

  const firstAirborneIndex = findFirstRun(anyGroundedFlags.map((isGrounded) => !isGrounded), Math.min(dipIndex + 1, frames.length - 1), 2)
    ?? Math.max(Math.min(apexIndex - 1, frames.length - 2), dipIndex + 1);
  const toeOffIndex = Math.max(0, firstAirborneIndex - 1);
  const takeOffIndex = Math.max(dipIndex + 1, toeOffIndex - 1);
  const travelDirection = inferTravelDirection(hipXSeries, setupIndex, takeOffIndex) as 1 | -1;
  const landingIndex = findFirstRun(anyGroundedFlags, Math.min(apexIndex + 1, frames.length - 1), 2)
    ?? Math.min(frames.length - 1, apexIndex + 2);
  const flightIndex = Math.min(Math.max(firstAirborneIndex, takeOffIndex + 1), apexIndex);
  const contactRunMinLength = (referenceLandmarks.fps ?? 15) <= 20 ? 1 : 2;
  const supportRuns = collectSupportRuns(supportLabels, 0, toeOffIndex, contactRunMinLength);
  const airborneRuns = collectRuns(anyGroundedFlags, false, 0, toeOffIndex, 1);
  const fallbackSupportPeaks = collectSupportPeaks(leftContactSeries, rightContactSeries, leftGround, rightGround, toeOffIndex, contactRunMinLength);
  const lastSupportRun = supportRuns[supportRuns.length - 1] ?? null;
  const penultimateSupportRun = supportRuns[supportRuns.length - 2] ?? null;
  const antepenultimateSupportRun = supportRuns[supportRuns.length - 3] ?? null;
  const fallbackLastPeak = fallbackSupportPeaks[fallbackSupportPeaks.length - 1] ?? null;
  const fallbackPenultimatePeak = fallbackSupportPeaks[fallbackSupportPeaks.length - 2] ?? null;
  const fallbackAntepenultimatePeak = fallbackSupportPeaks[fallbackSupportPeaks.length - 3] ?? null;
  const lastContactIndex = lastSupportRun?.start ?? fallbackLastPeak?.frameIndex ?? takeOffIndex;
  const penultimateContactIndex = penultimateSupportRun?.start ?? fallbackPenultimatePeak?.frameIndex ?? null;
  const antepenultimateContactIndex = antepenultimateSupportRun?.start ?? fallbackAntepenultimatePeak?.frameIndex ?? null;
  const prePenultimateFlightRun = antepenultimateSupportRun && penultimateSupportRun
    ? airborneRuns.find((run) => run.start > antepenultimateSupportRun.end && run.end < penultimateSupportRun.start) ?? null
    : airborneRuns.find((run) => run.start > (antepenultimateContactIndex ?? -1) && run.end < (penultimateContactIndex ?? -1)) ?? null;
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
  const flightConfidence = normalizeConfidence(0.56 + (airborneSpan / Math.max(frames.length, 1)) * 0.6);
  const takeOffConfidence = normalizeConfidence(0.58 + ((getSeriesValue(hipYSeries, dipIndex) - getSeriesValue(hipYSeries, takeOffIndex)) / hipRange) * 0.4);
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
      confidence: buildContactConfidence(antepenultimateContactIndex, leftContactSeries, rightContactSeries, leftGround, rightGround),
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
      confidence: buildContactConfidence(penultimateContactIndex, leftContactSeries, rightContactSeries, leftGround, rightGround),
      detector: autoDetectedTechniqueEventDetector,
    } : null,
    {
      eventType: "LAST_CONTACT",
      frameIndex: lastContactIndex,
      confidence: buildContactConfidence(lastContactIndex, leftContactSeries, rightContactSeries, leftGround, rightGround),
      detector: autoDetectedTechniqueEventDetector,
    },
    {
      eventType: "TAKE_OFF",
      frameIndex: takeOffIndex,
      confidence: takeOffConfidence,
      detector: autoDetectedTechniqueEventDetector,
    },
    {
      eventType: "TOE_OFF",
      frameIndex: toeOffIndex,
      confidence: toeOffConfidence,
      detector: autoDetectedTechniqueEventDetector,
    },
    {
      eventType: "FLIGHT",
      frameIndex: flightIndex,
      confidence: flightConfidence,
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

  return events
    .filter((event): event is AutoDetectedTechniqueKeyEvent => Boolean(event))
    .filter((event, index, list) => list.findIndex((entry) => entry.eventType === event.eventType) === index)
    .filter((event) => event.frameIndex >= 0 && event.frameIndex < frames.length);
}
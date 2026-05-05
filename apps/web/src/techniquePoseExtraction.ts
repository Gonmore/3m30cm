export interface TechniquePoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

export interface TechniquePoseFrame {
  timestampMs: number;
  landmarks: TechniquePoseLandmark[];
}

export interface TechniqueCameraTrackingFrame {
  timestampMs: number;
  translationX: number;
  translationY: number;
  scale: number;
  trackedPointCount: number;
}

export interface TechniqueCameraTracking {
  method: "background-patch-tracking";
  analysisWidth: number;
  analysisHeight: number;
  referenceFrameIndex: number;
  frameTransforms: TechniqueCameraTrackingFrame[];
}

export interface TechniqueRimReference {
  detected: boolean;
  x: number;
  y: number;
  /** Leftmost point of the detected rim blob (normalized). Perspective base point (backboard end). */
  xLeft: number;
  yLeft: number;
  /** Rightmost point of the detected rim blob (normalized). Perspective tip point (front of rim). */
  xRight: number;
  yRight: number;
  confidence: number;
  referenceFrameIndex: number;
  method: "orange-rim-heuristic";
}

/** Manual two-point annotation of the basketball rim by the admin. */
export interface RimAnnotation {
  /** Frame index where the admin annotated the rim endpoints. */
  frameIndex: number;
  /** Left (backboard-end) rim edge, normalized 0–1. */
  xLeft: number;
  yLeft: number;
  /** Right (front/tip) rim edge, normalized 0–1. */
  xRight: number;
  yRight: number;
  /** ISO 8601 timestamp when the annotation was saved. */
  annotatedAt: string;
}

export interface TechniqueProLandmarks {
  schemaVersion: 1;
  source: string;
  keypointsModel: string;
  normalization: string;
  fps: number;
  frameCount: number;
  durationMs: number;
  frames: TechniquePoseFrame[];
  cameraTracking?: TechniqueCameraTracking | null;
  /** @deprecated Use rimAnnotation (manual two-point annotation) instead. */
  rimReference?: TechniqueRimReference | null;
  /** Manual two-point annotation of the basketball rim by the admin. */
  rimAnnotation?: RimAnnotation | null;
}

interface TechniquePoseExtractionOptions {
  targetFps?: number;
  maxFrames?: number;
  onProgress?: (processedFrames: number, totalFrames: number) => void;
}

interface PoseResultsLike {
  poseLandmarks?: Array<{
    x: number;
    y: number;
    z: number;
    visibility?: number;
    presence?: number;
  }>;
}

interface FrameAnalysisBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface FrameAnalysis {
  gray: Uint8ClampedArray;
  width: number;
  height: number;
  exclusionBox: FrameAnalysisBox | null;
}

interface TrackingPoint {
  x: number;
  y: number;
  score: number;
}

interface TrackingMatch {
  previous: TrackingPoint;
  current: TrackingPoint;
}

const mediaPipePoseCdnBaseUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/pose";
const defaultTargetFps = 15;
const defaultMaxFrames = 240;
const analysisWidth = 160;
const maxTrackingPoints = 24;
const trackingSearchRadius = 6;
const trackingPatchRadius = 2;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function median(values: number[]) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const left = sorted[middle - 1];
    const right = sorted[middle];
    return typeof left === "number" && typeof right === "number" ? (left + right) / 2 : null;
  }

  return sorted[middle] ?? null;
}

function buildExclusionBox(
  poseLandmarks: NonNullable<PoseResultsLike["poseLandmarks"]>,
  width: number,
  height: number,
): FrameAnalysisBox | null {
  const visiblePoints = poseLandmarks.filter((landmark) => {
    const visibility = landmark.visibility ?? landmark.presence ?? 1;
    return Number.isFinite(landmark.x) && Number.isFinite(landmark.y) && visibility >= 0.25;
  });

  if (!visiblePoints.length) {
    return null;
  }

  const xs = visiblePoints.map((landmark) => landmark.x * width);
  const ys = visiblePoints.map((landmark) => landmark.y * height);
  const paddingX = width * 0.08;
  const paddingY = height * 0.08;
  return {
    left: clampNumber(Math.min(...xs) - paddingX, 0, width - 1),
    top: clampNumber(Math.min(...ys) - paddingY, 0, height - 1),
    right: clampNumber(Math.max(...xs) + paddingX, 0, width - 1),
    bottom: clampNumber(Math.max(...ys) + paddingY, 0, height - 1),
  };
}

function captureFrameAnalysis(
  video: HTMLVideoElement,
  poseLandmarks: NonNullable<PoseResultsLike["poseLandmarks"]>,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): FrameAnalysis {
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8ClampedArray(canvas.width * canvas.height);

  for (let index = 0; index < gray.length; index += 1) {
    const pixelIndex = index * 4;
    const red = imageData.data[pixelIndex] ?? 0;
    const green = imageData.data[pixelIndex + 1] ?? 0;
    const blue = imageData.data[pixelIndex + 2] ?? 0;
    gray[index] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
  }

  const exclusionBox = buildExclusionBox(poseLandmarks, canvas.width, canvas.height);

  return {
    gray,
    width: canvas.width,
    height: canvas.height,
    exclusionBox,

  };
}

function isInsideExclusionBox(x: number, y: number, box: FrameAnalysisBox | null, margin = 0) {
  if (!box) {
    return false;
  }

  return x >= box.left - margin && x <= box.right + margin && y >= box.top - margin && y <= box.bottom + margin;
}

function getPatchDifference(
  previousGray: Uint8ClampedArray,
  currentGray: Uint8ClampedArray,
  width: number,
  height: number,
  previousX: number,
  previousY: number,
  currentX: number,
  currentY: number,
) {
  if (
    previousX < trackingPatchRadius
    || previousY < trackingPatchRadius
    || currentX < trackingPatchRadius
    || currentY < trackingPatchRadius
    || previousX >= width - trackingPatchRadius
    || previousY >= height - trackingPatchRadius
    || currentX >= width - trackingPatchRadius
    || currentY >= height - trackingPatchRadius
  ) {
    return Number.POSITIVE_INFINITY;
  }

  let difference = 0;
  for (let offsetY = -trackingPatchRadius; offsetY <= trackingPatchRadius; offsetY += 1) {
    for (let offsetX = -trackingPatchRadius; offsetX <= trackingPatchRadius; offsetX += 1) {
      const previousIndex = (previousY + offsetY) * width + (previousX + offsetX);
      const currentIndex = (currentY + offsetY) * width + (currentX + offsetX);
      difference += Math.abs((previousGray[previousIndex] ?? 0) - (currentGray[currentIndex] ?? 0));
    }
  }

  return difference;
}

function getCornerScore(gray: Uint8ClampedArray, width: number, x: number, y: number) {
  const center = gray[y * width + x] ?? 0;
  const left = gray[y * width + (x - 1)] ?? center;
  const right = gray[y * width + (x + 1)] ?? center;
  const top = gray[(y - 1) * width + x] ?? center;
  const bottom = gray[(y + 1) * width + x] ?? center;
  const topLeft = gray[(y - 1) * width + (x - 1)] ?? center;
  const topRight = gray[(y - 1) * width + (x + 1)] ?? center;
  const bottomLeft = gray[(y + 1) * width + (x - 1)] ?? center;
  const bottomRight = gray[(y + 1) * width + (x + 1)] ?? center;

  const gradientX = Math.abs(right - left);
  const gradientY = Math.abs(bottom - top);
  const diagonalA = Math.abs(bottomRight - topLeft);
  const diagonalB = Math.abs(bottomLeft - topRight);
  return gradientX + gradientY + diagonalA + diagonalB;
}

function detectBackgroundTrackingPoints(analysis: FrameAnalysis, limit = maxTrackingPoints) {
  const candidates: TrackingPoint[] = [];

  for (let y = trackingPatchRadius + 1; y < analysis.height - trackingPatchRadius - 1; y += 3) {
    for (let x = trackingPatchRadius + 1; x < analysis.width - trackingPatchRadius - 1; x += 3) {
      if (isInsideExclusionBox(x, y, analysis.exclusionBox, 6)) {
        continue;
      }

      const score = getCornerScore(analysis.gray, analysis.width, x, y);
      if (score < 40) {
        continue;
      }

      candidates.push({ x, y, score });
    }
  }

  candidates.sort((left, right) => right.score - left.score);

  const selected: TrackingPoint[] = [];
  for (const candidate of candidates) {
    if (selected.length >= limit) {
      break;
    }

    const tooClose = selected.some((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) < 10);
    if (!tooClose) {
      selected.push(candidate);
    }
  }

  return selected;
}

function trackBackgroundPoints(previous: FrameAnalysis, current: FrameAnalysis, previousPoints: TrackingPoint[]) {
  const matches: TrackingMatch[] = [];

  for (const point of previousPoints) {
    let bestX = point.x;
    let bestY = point.y;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let deltaY = -trackingSearchRadius; deltaY <= trackingSearchRadius; deltaY += 1) {
      for (let deltaX = -trackingSearchRadius; deltaX <= trackingSearchRadius; deltaX += 1) {
        const candidateX = point.x + deltaX;
        const candidateY = point.y + deltaY;
        if (
          candidateX < trackingPatchRadius
          || candidateY < trackingPatchRadius
          || candidateX >= current.width - trackingPatchRadius
          || candidateY >= current.height - trackingPatchRadius
          || isInsideExclusionBox(candidateX, candidateY, current.exclusionBox, 6)
        ) {
          continue;
        }

        const score = getPatchDifference(
          previous.gray,
          current.gray,
          previous.width,
          previous.height,
          point.x,
          point.y,
          candidateX,
          candidateY,
        );
        if (score < bestScore) {
          bestScore = score;
          bestX = candidateX;
          bestY = candidateY;
        }
      }
    }

    if (bestScore < 650) {
      matches.push({
        previous: point,
        current: { x: bestX, y: bestY, score: point.score },
      });
    }
  }

  return matches;
}

function estimateTrackingTransform(matches: TrackingMatch[]) {
  if (matches.length < 4) {
    return { translationX: 0, translationY: 0, scale: 1 };
  }

  const translationX = median(matches.map((match) => match.current.x - match.previous.x)) ?? 0;
  const translationY = median(matches.map((match) => match.current.y - match.previous.y)) ?? 0;
  const centerX = matches.reduce((total, match) => total + match.previous.x, 0) / matches.length;
  const centerY = matches.reduce((total, match) => total + match.previous.y, 0) / matches.length;
  const scaleSamples = matches
    .map((match) => {
      const previousDistance = Math.hypot(match.previous.x - centerX, match.previous.y - centerY);
      const currentDistance = Math.hypot(
        match.current.x - translationX - centerX,
        match.current.y - translationY - centerY,
      );
      if (previousDistance < 6 || !Number.isFinite(currentDistance)) {
        return null;
      }
      return currentDistance / previousDistance;
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    translationX,
    translationY,
    scale: clampNumber(median(scaleSamples) ?? 1, 0.97, 1.03),
  };
}

function mergeTrackingPoints(primary: TrackingPoint[], fallback: TrackingPoint[]) {
  const merged = [...primary];
  for (const candidate of fallback) {
    if (merged.length >= maxTrackingPoints) {
      break;
    }

    const tooClose = merged.some((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) < 10);
    if (!tooClose) {
      merged.push(candidate);
    }
  }
  return merged;
}

function buildCameraTracking(
  frames: TechniquePoseFrame[],
  analyses: FrameAnalysis[],
): TechniqueCameraTracking | null {
  if (frames.length < 2 || analyses.length !== frames.length) {
    return null;
  }

  let previousAnalysis = analyses[0] ?? null;
  if (!previousAnalysis) {
    return null;
  }

  let previousPoints = detectBackgroundTrackingPoints(previousAnalysis);
  let cumulativeTranslationX = 0;
  let cumulativeTranslationY = 0;
  let cumulativeScale = 1;
  const frameTransforms: TechniqueCameraTrackingFrame[] = [
    {
      timestampMs: frames[0]?.timestampMs ?? 0,
      translationX: 0,
      translationY: 0,
      scale: 1,
      trackedPointCount: previousPoints.length,
    },
  ];

  for (let index = 1; index < frames.length; index += 1) {
    const currentAnalysis = analyses[index];
    if (!currentAnalysis) {
      continue;
    }

    let matches = trackBackgroundPoints(previousAnalysis, currentAnalysis, previousPoints);
    if (matches.length < 6) {
      previousPoints = detectBackgroundTrackingPoints(previousAnalysis);
      matches = trackBackgroundPoints(previousAnalysis, currentAnalysis, previousPoints);
    }

    const transform = estimateTrackingTransform(matches);
    cumulativeTranslationX += transform.translationX / currentAnalysis.width;
    cumulativeTranslationY += transform.translationY / currentAnalysis.height;
    cumulativeScale *= transform.scale;
    frameTransforms.push({
      timestampMs: frames[index]?.timestampMs ?? frameTransforms[frameTransforms.length - 1]?.timestampMs ?? 0,
      translationX: Number(cumulativeTranslationX.toFixed(6)),
      translationY: Number(cumulativeTranslationY.toFixed(6)),
      scale: Number(cumulativeScale.toFixed(6)),
      trackedPointCount: matches.length,
    });

    previousPoints = mergeTrackingPoints(
      matches.map((match) => match.current),
      detectBackgroundTrackingPoints(currentAnalysis),
    );
    previousAnalysis = currentAnalysis;
  }

  return {
    method: "background-patch-tracking",
    analysisWidth: previousAnalysis.width,
    analysisHeight: previousAnalysis.height,
    referenceFrameIndex: 0,
    frameTransforms,
  };
}

function loadVideoFile(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  const ready = new Promise<HTMLVideoElement>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
    };

    const handleLoadedMetadata = () => {
      cleanup();
      resolve(video);
    };

    const handleError = () => {
      cleanup();
      reject(new Error("No se pudo leer el video profesional."));
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
  });

  video.src = objectUrl;

  return {
    objectUrl,
    video,
    ready,
  };
}

function seekVideo(video: HTMLVideoElement, targetTimeSeconds: number) {
  if (Math.abs(video.currentTime - targetTimeSeconds) < 0.001) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    const handleSeeked = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("No se pudo posicionar el video profesional para analizarlo."));
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = targetTimeSeconds;
  });
}

export async function extractTechniquePoseSequence(
  file: File,
  options: TechniquePoseExtractionOptions = {},
): Promise<TechniqueProLandmarks> {
  const { Pose } = await import("@mediapipe/pose");
  const targetFps = options.targetFps ?? defaultTargetFps;
  const maxFrames = options.maxFrames ?? defaultMaxFrames;
  const { objectUrl, video, ready } = loadVideoFile(file);

  const pose = new Pose({
    locateFile: (fileName: string) => `${mediaPipePoseCdnBaseUrl}/${fileName}`,
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    selfieMode: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  try {
    await ready;

    const durationMs = Math.round((video.duration || 0) * 1000);
    if (!durationMs || Number.isNaN(durationMs)) {
      throw new Error("El video profesional no tiene una duración válida.");
    }

    const sampleIntervalMs = Math.max(1000 / targetFps, 1);
    const estimatedFrameCount = Math.min(Math.max(Math.ceil(durationMs / sampleIntervalMs), 1), maxFrames);
    const frames: TechniquePoseFrame[] = [];
    const frameAnalyses: FrameAnalysis[] = [];
    const analysisCanvas = document.createElement("canvas");
    const analysisHeight = Math.max(Math.round((video.videoHeight / Math.max(video.videoWidth, 1)) * analysisWidth), 90);
    analysisCanvas.width = analysisWidth;
    analysisCanvas.height = analysisHeight;
    const analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true });
    if (!analysisContext) {
      throw new Error("No se pudo inicializar el analisis de estabilidad de camara.");
    }

    for (let index = 0; index < estimatedFrameCount; index += 1) {
      const rawTimestampMs = Math.min(Math.round(index * sampleIntervalMs), durationMs);
      const timestampMs = Math.min(rawTimestampMs, Math.max(durationMs - 1, 0));
      await seekVideo(video, timestampMs / 1000);

      const results = await new Promise<PoseResultsLike>((resolve, reject) => {
        pose.onResults((value: PoseResultsLike) => resolve(value));
        Promise.resolve(pose.send({ image: video })).catch(() => reject(new Error("MediaPipe no pudo procesar el frame del video.")));
      });

      const poseLandmarks = results.poseLandmarks;
      if (Array.isArray(poseLandmarks) && poseLandmarks.length === 33) {
        frames.push({
          timestampMs,
          landmarks: poseLandmarks.map((landmark) => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z,
            ...(landmark.visibility !== undefined ? { visibility: landmark.visibility } : {}),
            ...(landmark.presence !== undefined ? { presence: landmark.presence } : {}),
          })),
        });
        frameAnalyses.push(captureFrameAnalysis(video, poseLandmarks, analysisCanvas, analysisContext));
      }

      options.onProgress?.(index + 1, estimatedFrameCount);
    }

    if (!frames.length) {
      throw new Error("No se detectó una pose completa en el video profesional.");
    }

    const cameraTracking = buildCameraTracking(frames, frameAnalyses);

    return {
      schemaVersion: 1,
      source: "@mediapipe/pose",
      keypointsModel: "pose_landmarks_33",
      normalization: "image-normalized-coordinates",
      fps: Number((frames.length / (durationMs / 1000)).toFixed(2)),
      frameCount: frames.length,
      durationMs,
      frames,
      cameraTracking,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.src = "";
    if (typeof pose.close === "function") {
      await pose.close();
    }
  }
}
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

export interface TechniqueProLandmarks {
  schemaVersion: 1;
  source: string;
  keypointsModel: string;
  normalization: string;
  fps: number;
  frameCount: number;
  durationMs: number;
  frames: TechniquePoseFrame[];
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

const mediaPipePoseCdnBaseUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/pose";
const defaultTargetFps = 15;
const defaultMaxFrames = 240;

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
      }

      options.onProgress?.(index + 1, estimatedFrameCount);
    }

    if (!frames.length) {
      throw new Error("No se detectó una pose completa en el video profesional.");
    }

    return {
      schemaVersion: 1,
      source: "@mediapipe/pose",
      keypointsModel: "pose_landmarks_33",
      normalization: "image-normalized-coordinates",
      fps: Number((frames.length / (durationMs / 1000)).toFixed(2)),
      frameCount: frames.length,
      durationMs,
      frames,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.src = "";
    if (typeof pose.close === "function") {
      await pose.close();
    }
  }
}
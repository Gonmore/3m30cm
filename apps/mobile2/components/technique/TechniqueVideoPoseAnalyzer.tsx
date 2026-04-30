import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { TechniqueProLandmarks } from "../../../web/src/techniquePoseExtraction";

interface TechniqueVideoPoseAnalyzerProps {
  requestId: number;
  videoUri: string | null;
  targetFps?: number;
  maxFrames?: number;
  onProgress: (processedFrames: number, totalFrames: number) => void;
  onResult: (landmarks: TechniqueProLandmarks) => void;
  onError: (message: string) => void;
}

type AnalyzerMessage =
  | { type: "ready" }
  | { type: "progress"; requestId: number; processedFrames: number; totalFrames: number }
  | { type: "result"; requestId: number; landmarks: TechniqueProLandmarks }
  | { type: "error"; requestId: number; message: string };

const analyzerHtml = String.raw`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; }
    </style>
  </head>
  <body>
    <script>
      const mediaPipePoseCdnBaseUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/pose";
      let poseConstructorPromise = null;
      let busy = false;

      function postMessage(payload) {
        if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== "function") {
          return;
        }

        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }

      function ensurePoseConstructor() {
        if (typeof window.Pose === "function") {
          return Promise.resolve(window.Pose);
        }

        if (!poseConstructorPromise) {
          poseConstructorPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = mediaPipePoseCdnBaseUrl + "/pose.js";
            script.async = true;
            script.onload = () => {
              if (typeof window.Pose === "function") {
                resolve(window.Pose);
              } else {
                reject(new Error("MediaPipe Pose no quedó disponible en el WebView."));
              }
            };
            script.onerror = () => reject(new Error("No se pudo cargar MediaPipe Pose en el WebView."));
            document.head.appendChild(script);
          });
        }

        return poseConstructorPromise;
      }

      function loadVideoUri(videoUri) {
        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("webkit-playsinline", "true");
        video.crossOrigin = "anonymous";

        const describeVideoError = () => {
          const errorCode = video.error && typeof video.error.code === "number" ? video.error.code : "unknown";
          const sourceValue = video.currentSrc || video.src || videoUri || "unknown";
          const schemeMatch = /^([a-z0-9.+-]+):/i.exec(sourceValue);
          const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : "unknown";

          return "No se pudo leer el video del atleta. "
            + "code=" + errorCode
            + ", networkState=" + video.networkState
            + ", readyState=" + video.readyState
            + ", scheme=" + scheme;
        };

        const ready = new Promise((resolve, reject) => {
          const cleanup = () => {
            video.removeEventListener("loadedmetadata", handleLoadedMetadata);
            video.removeEventListener("loadeddata", handleLoadedMetadata);
            video.removeEventListener("error", handleError);
          };

          const handleLoadedMetadata = () => {
            cleanup();
            resolve(video);
          };

          const handleError = () => {
            cleanup();
            reject(new Error(describeVideoError()));
          };

          video.addEventListener("loadedmetadata", handleLoadedMetadata);
          video.addEventListener("loadeddata", handleLoadedMetadata);
          video.addEventListener("error", handleError);
        });

        video.src = videoUri;
        video.load();

        return { video, ready };
      }

      function seekVideo(video, targetTimeSeconds) {
        if (Math.abs(video.currentTime - targetTimeSeconds) < 0.001) {
          return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
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
            reject(new Error("No se pudo posicionar el video del atleta para analizarlo."));
          };

          video.addEventListener("seeked", handleSeeked, { once: true });
          video.addEventListener("error", handleError, { once: true });
          video.currentTime = targetTimeSeconds;
        });
      }

      async function extractPoseSequence(request) {
        const Pose = await ensurePoseConstructor();
        const targetFps = request.targetFps || 15;
        const maxFrames = request.maxFrames || 240;
        const source = loadVideoUri(request.videoUri);
        const pose = new Pose({
          locateFile: (fileName) => mediaPipePoseCdnBaseUrl + "/" + fileName,
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
          const video = await source.ready;
          const durationMs = Math.round((video.duration || 0) * 1000);
          if (!durationMs || Number.isNaN(durationMs)) {
            throw new Error("El video del atleta no tiene una duración válida.");
          }

          const sampleIntervalMs = Math.max(1000 / targetFps, 1);
          const estimatedFrameCount = Math.min(Math.max(Math.ceil(durationMs / sampleIntervalMs), 1), maxFrames);
          const frames = [];

          for (let index = 0; index < estimatedFrameCount; index += 1) {
            const rawTimestampMs = Math.min(Math.round(index * sampleIntervalMs), durationMs);
            const timestampMs = Math.min(rawTimestampMs, Math.max(durationMs - 1, 0));
            await seekVideo(video, timestampMs / 1000);

            const results = await new Promise((resolve, reject) => {
              pose.onResults((value) => resolve(value));
              Promise.resolve(pose.send({ image: video })).catch(() => reject(new Error("MediaPipe no pudo procesar el frame del video del atleta.")));
            });

            const poseLandmarks = results && results.poseLandmarks;
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

            postMessage({
              type: "progress",
              requestId: request.requestId,
              processedFrames: index + 1,
              totalFrames: estimatedFrameCount,
            });
          }

          if (!frames.length) {
            throw new Error("No se detectó una pose completa en el video del atleta.");
          }

          postMessage({
            type: "result",
            requestId: request.requestId,
            landmarks: {
              schemaVersion: 1,
              source: "@mediapipe/pose",
              keypointsModel: "pose_landmarks_33",
              normalization: "image-normalized-coordinates",
              fps: Number((frames.length / (durationMs / 1000)).toFixed(2)),
              frameCount: frames.length,
              durationMs,
              frames,
            },
          });
        } finally {
          source.video.pause();
          source.video.src = "";
          if (typeof pose.close === "function") {
            await pose.close();
          }
        }
      }

      window.__jumpAnalyzeVideo = async function(request) {
        if (!request || !request.videoUri) {
          return;
        }

        if (busy) {
          postMessage({ type: "error", requestId: request.requestId, message: "El analizador todavía está procesando otro video." });
          return;
        }

        busy = true;
        try {
          await extractPoseSequence(request);
        } catch (error) {
          postMessage({
            type: "error",
            requestId: request.requestId,
            message: error instanceof Error ? error.message : "No se pudo analizar el video del atleta.",
          });
        } finally {
          busy = false;
        }
      };

      postMessage({ type: "ready" });
    </script>
  </body>
</html>`;

export default function TechniqueVideoPoseAnalyzer({
  requestId,
  videoUri,
  targetFps = 15,
  maxFrames = 240,
  onProgress,
  onResult,
  onError,
}: TechniqueVideoPoseAnalyzerProps) {
  const webViewRef = useRef<WebView | null>(null);
  const [ready, setReady] = useState(false);
  const latestRequestRef = useRef<number>(requestId);

  latestRequestRef.current = requestId;

  const command = useMemo(() => {
    if (!videoUri) {
      return null;
    }

    return `window.__jumpAnalyzeVideo(${JSON.stringify({ requestId, videoUri, targetFps, maxFrames })}); true;`;
  }, [maxFrames, requestId, targetFps, videoUri]);

  useEffect(() => {
    if (!ready || !command || !webViewRef.current) {
      return;
    }

    webViewRef.current.injectJavaScript(command);
  }, [command, ready]);

  function handleMessage(event: WebViewMessageEvent) {
    let payload: AnalyzerMessage | null = null;

    try {
      payload = JSON.parse(event.nativeEvent.data) as AnalyzerMessage;
    } catch {
      return;
    }

    if (!payload) {
      return;
    }

    if (payload.type === "ready") {
      setReady(true);
      return;
    }

    if (payload.requestId !== latestRequestRef.current) {
      return;
    }

    if (payload.type === "progress") {
      onProgress(payload.processedFrames, payload.totalFrames);
      return;
    }

    if (payload.type === "result") {
      onResult(payload.landmarks);
      return;
    }

    if (payload.type === "error") {
      onError(payload.message);
    }
  }

  return (
    <View style={styles.hiddenWrap} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ html: analyzerHtml }}
        originWhitelist={["*"]}
        javaScriptEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        onMessage={handleMessage}
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenWrap: {
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
});
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
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
    <canvas id="pose-canvas" style="display:none;"></canvas>
    <script>
      const mediaPipePoseCdnBaseUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/pose";
      let poseConstructorPromise = null;
      // Instancia de Pose reutilizada entre videos para que el WASM quede en memoria.
      let poseInstancePromise = null;
      let busy = false;
      let currentGeneration = 0;
      let currentRequestId = null;

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

      // Crea (o devuelve) la instancia de Pose ya primed con un frame 1x1.
      // Esto carga el WASM internamente sin usar initialize() ni requestAnimationFrame,
      // ambos problemáticos en WebViews ocultos.
      function ensurePoseInstance() {
        if (!poseInstancePromise) {
          poseInstancePromise = ensurePoseConstructor().then(function(Pose) {
            var pose = new Pose({
              locateFile: function(fileName) { return mediaPipePoseCdnBaseUrl + "/" + fileName; },
            });
            pose.setOptions({
              modelComplexity: 1,
              smoothLandmarks: true,
              enableSegmentation: false,
              selfieMode: false,
              minDetectionConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
            // Enviar un frame 1x1 negro para disparar la carga del WASM y el modelo
            // sin depender de initialize() (que puede colgar en WebViews ocultos).
            return new Promise(function(resolve, reject) {
              var primeCanvas = document.createElement("canvas");
              primeCanvas.width = 1;
              primeCanvas.height = 1;
              var timer = setTimeout(function() {
                poseInstancePromise = null;
                reject(new Error("MediaPipe no respondió al frame de inicialización (timeout 45s)."));
              }, 45000);
              pose.onResults(function() {
                clearTimeout(timer);
                resolve(pose);
              });
              Promise.resolve(pose.send({ image: primeCanvas })).catch(function(err) {
                clearTimeout(timer);
                poseInstancePromise = null;
                reject(err instanceof Error ? err : new Error(String(err)));
              });
            });
          }).catch(function(err) {
            poseInstancePromise = null;
            return Promise.reject(err);
          });
        }
        return poseInstancePromise;
      }

      function loadVideoUri(videoUri) {
        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("webkit-playsinline", "true");
        video.crossOrigin = "anonymous";

        const canvas = document.getElementById("pose-canvas");
        const ctx = canvas?.getContext("2d");

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

        return { video, canvas, ctx, ready };
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

      function waitForVideoFrame(video) {
        // readyState >= 2 (HAVE_CURRENT_DATA) significa que el frame actual está
        // decodificado — garantizado por spec tras el evento seeked.
        // No usar requestAnimationFrame: en WebViews ocultos (opacity:0 / 1x1) puede
        // quedar throttleado indefinidamente.
        if (video.readyState >= 2) {
          return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
          const cleanup = () => {
            video.removeEventListener("loadeddata", handleReady);
            video.removeEventListener("canplay", handleReady);
            video.removeEventListener("error", handleError);
          };

          const handleReady = () => { cleanup(); resolve(); };
          const handleError = () => {
            cleanup();
            reject(new Error("El frame del video del atleta no quedó listo para MediaPipe."));
          };

          video.addEventListener("loadeddata", handleReady, { once: true });
          video.addEventListener("canplay", handleReady, { once: true });
          video.addEventListener("error", handleError, { once: true });
        });
      }

      async function extractPoseSequence(request) {
        // Reutilizar la instancia cacheada (ya tiene el WASM cargado y primed).
        const pose = await ensurePoseInstance();
        const targetFps = request.targetFps || 15;
        const maxFrames = request.maxFrames || 240;
        const source = loadVideoUri(request.videoUri);

        // Limpiar estado de suavizado del video anterior.
        if (typeof pose.reset === "function") {
          pose.reset();
        }

        try {
          const video = await source.ready;
          const durationMs = Math.round((video.duration || 0) * 1000);
          if (!durationMs || Number.isNaN(durationMs)) {
            throw new Error("El video del atleta no tiene una duración válida.");
          }

          // En clips de velocidad normal muy cortos, 15 fps puede perder fases clave
          // del salto (contactos/apex). Subimos temporalmente la densidad de muestreo.
          const isShortClip = durationMs <= 2600;
          const effectiveTargetFps = isShortClip ? Math.max(targetFps, 30) : targetFps;
          const effectiveMaxFrames = isShortClip ? Math.max(maxFrames, 480) : maxFrames;
          const sampleIntervalMs = Math.max(1000 / effectiveTargetFps, 1);
          const estimatedFrameCount = Math.min(Math.max(Math.ceil(durationMs / sampleIntervalMs), 1), effectiveMaxFrames);
          const frames = [];

          for (let index = 0; index < estimatedFrameCount; index += 1) {
            const rawTimestampMs = Math.min(Math.round(index * sampleIntervalMs), durationMs);
            const timestampMs = Math.min(rawTimestampMs, Math.max(durationMs - 1, 0));
            await seekVideo(video, timestampMs / 1000);
            await waitForVideoFrame(video);

            const results = await new Promise((resolve, reject) => {
              if (!source.canvas || !source.ctx) {
                reject(new Error("Canvas no disponible para procesar frames."));
                return;
              }

              source.canvas.width = video.videoWidth || video.width || 640;
              source.canvas.height = video.videoHeight || video.height || 480;

              try {
                source.ctx.drawImage(video, 0, 0, source.canvas.width, source.canvas.height);
              } catch (error) {
                reject(new Error(
                  "No se pudo dibujar el frame del video del atleta en el canvas. "
                  + "readyState=" + video.readyState
                  + ", video=" + (video.videoWidth || 0) + "x" + (video.videoHeight || 0)
                  + ", canvas=" + source.canvas.width + "x" + source.canvas.height
                  + ", detalle=" + (error instanceof Error ? error.message : String(error))
                ));
                return;
              }

              pose.onResults((value) => resolve(value));
              Promise.resolve(pose.send({ image: source.canvas })).catch((error) => reject(new Error(
                "MediaPipe no pudo procesar el frame del video del atleta. "
                + "readyState=" + video.readyState
                + ", video=" + (video.videoWidth || 0) + "x" + (video.videoHeight || 0)
                + ", canvas=" + source.canvas.width + "x" + source.canvas.height
                + ", detalle=" + (error instanceof Error ? error.message : String(error))
              )));
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
          // No cerrar la instancia de pose: se reutiliza entre videos (está cacheada).
        }
      }

      window.__jumpAnalyzeVideo = async function(request) {
        if (!request || !request.videoUri) {
          return;
        }

        // Ignorar si es exactamente la misma solicitud que ya está corriendo (doble inyección).
        if (busy && currentRequestId === request.requestId) {
          return;
        }

        // Nueva solicitud (o tras Fast Refresh donde React reinicia su estado pero la
        // WebView persiste con busy=true). Incrementar generación descarta los resultados
        // de cualquier tarea anterior sin que ésta pueda resetear busy al terminar.
        currentGeneration += 1;
        const myGeneration = currentGeneration;
        currentRequestId = request.requestId;
        busy = true;
        try {
          await extractPoseSequence(request);
        } catch (error) {
          if (myGeneration === currentGeneration) {
            postMessage({
              type: "error",
              requestId: request.requestId,
              message: error instanceof Error ? error.message : "No se pudo analizar el video del atleta.",
            });
          }
        } finally {
          if (myGeneration === currentGeneration) {
            busy = false;
          }
        }
      };

      // Pre-cargar MediaPipe: crear la instancia cacheada y primearla con el frame
      // 1x1. Cuando resuelva, el WASM está en memoria y el primer video arranca rápido.
      ensurePoseInstance()
        .catch(function() {})
        .finally(function() { postMessage({ type: "ready" }); });
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
  const htmlSource = useMemo(
    () => ({
      html: analyzerHtml,
      ...(Platform.OS === "android" ? { baseUrl: "file:///android_asset/" } : {}),
    }),
    [],
  );

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
        source={htmlSource}
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
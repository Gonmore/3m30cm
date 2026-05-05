import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RimAnnotation, TechniquePoseFrame, TechniqueProLandmarks } from "../techniquePoseExtraction";

// NBA regulation rim inner diameter
const RIM_INNER_DIAMETER_CM = 45.72;
// Basketball hoop height
const RIM_HEIGHT_CM = 305;

interface Props {
  landmarks: TechniqueProLandmarks;
  /** URL of the reference video. When provided, actual video frames are shown as background. */
  videoUrl?: string | null;
  existingAnnotation?: RimAnnotation | null;
  onAnnotationChange: (annotation: RimAnnotation | null) => void;
}

type ClickTarget = "left" | "right";

const VW = 560;
const VH = 315;

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [23, 25], [25, 27], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 30], [30, 32],
];

function fmt4(v: number): string {
  return v.toFixed(4);
}

/** Returns the frame index with the lowest average hip Y (= highest point in frame = apex). */
function findApexFrameIndex(frames: TechniquePoseFrame[]): number {
  let bestIdx = 0;
  let minHipY = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const lms = frames[i]?.landmarks as Array<{ x: number; y: number }> | undefined;
    if (!lms) continue;
    const lh = lms[23]?.y;
    const rh = lms[24]?.y;
    const avg =
      typeof lh === "number" && typeof rh === "number"
        ? (lh + rh) / 2
        : typeof lh === "number"
          ? lh
          : typeof rh === "number"
            ? rh
            : null;
    if (avg !== null && avg < minHipY) {
      minHipY = avg;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function RimAnnotationTool({ landmarks, videoUrl, existingAnnotation, onAnnotationChange }: Props) {
  const apexFrameIndex = useMemo(() => findApexFrameIndex(landmarks.frames), [landmarks.frames]);

  const [frameIndex, setFrameIndex] = useState(() =>
    existingAnnotation != null ? existingAnnotation.frameIndex : apexFrameIndex,
  );
  const [annotation, setAnnotation] = useState<RimAnnotation | null>(existingAnnotation ?? null);
  const [mode, setMode] = useState<ClickTarget>("left");
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const totalFrames = landmarks.frames.length;

  // When landmarks change (new technique), reset to apex
  useEffect(() => {
    setFrameIndex(existingAnnotation != null ? existingAnnotation.frameIndex : apexFrameIndex);
  }, [landmarks, apexFrameIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync annotation with external prop
  useEffect(() => {
    setAnnotation(existingAnnotation ?? null);
  }, [existingAnnotation]);

  // Seek hidden video to the current frame's timestamp whenever frameIndex or videoUrl changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) { setFrameDataUrl(null); return; }
    const ts = landmarks.frames[frameIndex]?.timestampMs;
    if (typeof ts !== "number") return;
    video.currentTime = ts / 1000;
  }, [videoUrl, frameIndex, landmarks.frames]);

  /** Called by the hidden <video> when it finishes seeking — draws the frame to an offscreen canvas. */
  const handleVideoSeeked = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    try {
      setFrameDataUrl(canvas.toDataURL("image/jpeg", 0.9));
    } catch {
      // CORS restriction — fall back to skeleton-only
      setFrameDataUrl(null);
    }
  }, []);

  const lms = (landmarks.frames[frameIndex]?.landmarks as Array<{ x: number; y: number }> | undefined) ?? [];
  const px = (x: number) => x * VW;
  const py = (y: number) => y * VH;

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) / rect.width;
      const clickY = (e.clientY - rect.top) / rect.height;

      setAnnotation((prev) => {
        const next = prev
          ? { ...prev }
          : {
              frameIndex,
              xLeft: 0,
              yLeft: 0,
              xRight: 0,
              yRight: 0,
              annotatedAt: new Date().toISOString(),
            };

        next.frameIndex = frameIndex;
        next.annotatedAt = new Date().toISOString();

        if (mode === "left") {
          next.xLeft = clickX;
          next.yLeft = clickY;
          setMode("right"); // auto-advance to right
        } else {
          next.xRight = clickX;
          next.yRight = clickY;
        }
        onAnnotationChange(next);
        return next;
      });
    },
    [frameIndex, mode, onAnnotationChange],
  );

  // ── Preview metrics ────────────────────────────────────────────────────────
  let pxPerCmV: number | null = null;
  let pxPerCmH: number | null = null;
  if (
    annotation &&
    annotation.xLeft !== annotation.xRight &&
    lms.length > 32
  ) {
    const footYs = [27, 28, 29, 30, 31, 32]
      .map((i) => lms[i]?.y ?? null)
      .filter((y): y is number => typeof y === "number" && Number.isFinite(y))
      .sort((a, b) => b - a)
      .slice(0, 2);
    if (footYs.length > 0) {
      const groundY = footYs.reduce((s, v) => s + v, 0) / footYs.length;
      const rimCenterY = (annotation.yLeft + annotation.yRight) / 2;
      const delta = groundY - rimCenterY;
      if (delta > 0.005) {
        pxPerCmV = delta / RIM_HEIGHT_CM;
      }
    }
    const dx = annotation.xRight - annotation.xLeft;
    const dy = annotation.yRight - annotation.yLeft;
    const rimW = Math.sqrt(dx * dx + dy * dy);
    if (rimW > 0.001) {
      pxPerCmH = rimW / RIM_INNER_DIAMETER_CM;
    }
  }

  const calibrationValid = pxPerCmV !== null && pxPerCmH !== null;

  return (
    <div className="rim-annotation-tool">
      {/* Hidden video for frame extraction */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          crossOrigin="anonymous"
          preload="auto"
          muted
          playsInline
          style={{ display: "none" }}
          onSeeked={handleVideoSeeked}
        />
      )}

      {/* Frame navigator */}
      <div className="rat-frame-nav">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setFrameIndex((f) => Math.max(0, f - 1))}
          disabled={frameIndex === 0}
        >
          ‹
        </button>
        <span className="rat-frame-label">
          Frame {frameIndex + 1} / {totalFrames}
          {frameIndex === apexFrameIndex && (
            <span style={{ marginLeft: 6, fontSize: "0.78rem", color: "#f59e0b", fontWeight: 700 }}>⬆ Apex</span>
          )}
        </span>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setFrameIndex((f) => Math.min(totalFrames - 1, f + 1))}
          disabled={frameIndex === totalFrames - 1}
        >
          ›
        </button>
        <button
          type="button"
          className="secondary-button"
          style={{ marginLeft: 8 }}
          onClick={() => setFrameIndex(apexFrameIndex)}
          title="Ir al apex (punto más alto del salto)"
        >
          ⬆ Apex
        </button>
        <button
          type="button"
          className="secondary-button"
          style={{ marginLeft: "auto" }}
          onClick={() => {
            setAnnotation(null);
            onAnnotationChange(null);
            setMode("left");
          }}
        >
          Limpiar anotación
        </button>
      </div>

      {/* Mode toggle */}
      <div className="rat-mode-row">
        <button
          type="button"
          className={`rat-mode-btn ${mode === "left" ? "active" : ""}`}
          onClick={() => setMode("left")}
        >
          <span className="rat-dot rat-dot-left" />
          Borde izquierdo (base)
        </button>
        <button
          type="button"
          className={`rat-mode-btn ${mode === "right" ? "active" : ""}`}
          onClick={() => setMode("right")}
        >
          <span className="rat-dot rat-dot-right" />
          Borde derecho (punta)
        </button>
        <span className="rat-mode-hint">
          {mode === "left" ? "Haz clic en el borde izquierdo del aro (lado tablero)" : "Haz clic en el borde derecho del aro (punta delantera)"}
        </span>
      </div>

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        style={{ cursor: "crosshair", border: "1px solid var(--line)", borderRadius: 10, background: "#111", display: "block" }}
        onClick={handleSvgClick}
      >
        {/* Video frame background */}
        {frameDataUrl && (
          <image
            href={frameDataUrl}
            x={0}
            y={0}
            width={VW}
            height={VH}
            preserveAspectRatio="xMidYMid meet"
          />
        )}

        {/* Skeleton — brighter when video frame present, dimmer without */}
        <g opacity={frameDataUrl ? 0.75 : 0.45}>
          {POSE_CONNECTIONS.map(([a, b]) => {
            const A = lms[a]; const B = lms[b];
            if (!A || !B) return null;
            return (
              <line key={`${a}-${b}`}
                x1={px(A.x)} y1={py(A.y)}
                x2={px(B.x)} y2={py(B.y)}
                stroke={frameDataUrl ? "#ffffff" : "#94a3b8"}
                strokeWidth={frameDataUrl ? 1.5 : 2}
              />
            );
          })}
          {lms.map((lm, i) => lm
            ? <circle key={i} cx={px(lm.x)} cy={py(lm.y)} r={2.5}
                fill={frameDataUrl ? "#facc15" : "#60a5fa"} />
            : null)}
        </g>

        {/* Annotated rim */}
        {annotation && (
          <>
            {/* Line between the two rim points */}
            <line
              x1={px(annotation.xLeft)} y1={py(annotation.yLeft)}
              x2={px(annotation.xRight)} y2={py(annotation.yRight)}
              stroke="#f59e0b" strokeWidth={3} strokeDasharray="6 3"
            />
            {/* Left point */}
            <circle cx={px(annotation.xLeft)} cy={py(annotation.yLeft)} r={7} fill="#f59e0b" fillOpacity={0.85} />
            <text x={px(annotation.xLeft) + 10} y={py(annotation.yLeft) - 8}
              fontSize={11} fill="#f59e0b" fontWeight="700">L</text>
            {/* Right point */}
            <circle cx={px(annotation.xRight)} cy={py(annotation.yRight)} r={7} fill="#fb923c" fillOpacity={0.85} />
            <text x={px(annotation.xRight) + 10} y={py(annotation.yRight) - 8}
              fontSize={11} fill="#fb923c" fontWeight="700">R</text>
            {/* Rim label */}
            <text
              x={(px(annotation.xLeft) + px(annotation.xRight)) / 2}
              y={py((annotation.yLeft + annotation.yRight) / 2) - 14}
              fontSize={11} fill="#f59e0b" fontWeight="700" textAnchor="middle"
            >
              45.72 cm
            </text>
          </>
        )}

        {/* Crosshair hint */}
        {!annotation && (
          <text x={VW / 2} y={VH / 2} fontSize={13} fill={frameDataUrl ? "#facc15" : "#94a3b8"} textAnchor="middle" dominantBaseline="middle">
            Haz clic en el aro para anotarlo
          </text>
        )}
      </svg>

      {/* Calibration preview */}
      {annotation && (
        <div className={`rat-calib-preview ${calibrationValid ? "rat-calib-ok" : "rat-calib-warn"}`}>
          {calibrationValid ? (
            <>
              <span className="rat-calib-badge rat-calib-badge-ok">✓ Calibración válida</span>
              <span>Vertical: <strong>{fmt4(pxPerCmV!)} norm/cm</strong></span>
              <span>Horizontal: <strong>{fmt4(pxPerCmH!)} norm/cm</strong></span>
              {pxPerCmV! > 0 && pxPerCmH! > 0 && (
                <span>
                  Relación H/V: <strong>{(pxPerCmH! / pxPerCmV!).toFixed(2)}</strong>
                  {Math.abs(pxPerCmH! / pxPerCmV! - 1) > 0.3
                    ? " ⚠ perspectiva alta"
                    : ""}
                </span>
              )}
            </>
          ) : (
            <span className="rat-calib-badge rat-calib-badge-warn">
              ⚠ Marca ambos bordes del aro en el mismo frame que tenga landmarks del atleta
            </span>
          )}
        </div>
      )}

      {/* Info */}
      <p className="rat-info">
        {!videoUrl && (
          <span style={{ color: "#f59e0b", fontWeight: 600 }}>⚠ Sin video: solo se muestra el skeleton. Para ver el fotograma real asegúrate de que el video esté enlazado. </span>
        )}
        El aro debe marcarse sobre un frame donde el atleta esté visible.
        El borde <strong>izquierdo</strong> es el extremo del lado del tablero;
        el <strong>derecho</strong> es la punta delantera del aro (de cara a la cámara).
        La anotación se proyectará automáticamente a todos los demás frames usando el seguimiento de cámara.
      </p>
    </div>
  );
}

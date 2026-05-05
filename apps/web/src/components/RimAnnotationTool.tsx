import { useCallback, useEffect, useRef, useState } from "react";
import type { RimAnnotation, TechniqueProLandmarks } from "../techniquePoseExtraction";

// NBA regulation rim inner diameter
const RIM_INNER_DIAMETER_CM = 45.72;
// Basketball hoop height
const RIM_HEIGHT_CM = 305;

interface Props {
  landmarks: TechniqueProLandmarks;
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

export function RimAnnotationTool({ landmarks, existingAnnotation, onAnnotationChange }: Props) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [annotation, setAnnotation] = useState<RimAnnotation | null>(existingAnnotation ?? null);
  const [mode, setMode] = useState<ClickTarget>("left");
  const svgRef = useRef<SVGSVGElement>(null);

  const totalFrames = landmarks.frames.length;

  // Sync with external prop
  useEffect(() => {
    setAnnotation(existingAnnotation ?? null);
  }, [existingAnnotation]);

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
        <span className="rat-frame-label">Frame {frameIndex + 1} / {totalFrames}</span>
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
        style={{ cursor: "crosshair", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(0,0,0,0.04)", display: "block" }}
        onClick={handleSvgClick}
      >
        {/* Skeleton */}
        <g opacity={0.35}>
          {POSE_CONNECTIONS.map(([a, b]) => {
            const A = lms[a]; const B = lms[b];
            if (!A || !B) return null;
            return (
              <line key={`${a}-${b}`}
                x1={px(A.x)} y1={py(A.y)}
                x2={px(B.x)} y2={py(B.y)}
                stroke="#94a3b8" strokeWidth={2}
              />
            );
          })}
          {lms.map((lm, i) => lm
            ? <circle key={i} cx={px(lm.x)} cy={py(lm.y)} r={2.5} fill="#60a5fa" />
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
          <text x={VW / 2} y={VH / 2} fontSize={13} fill="#94a3b8" textAnchor="middle" dominantBaseline="middle">
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
        El aro debe marcarse sobre un frame donde el atleta esté visible.
        El borde <strong>izquierdo</strong> es el extremo del lado del tablero;
        el <strong>derecho</strong> es la punta delantera del aro (de cara a la cámara).
        La anotación se proyectará automáticamente a todos los demás frames usando el seguimiento de cámara.
      </p>
    </div>
  );
}

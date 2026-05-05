import { useState } from "react";
import type {
  ReferenceJumpHeightMethodPreview,
  ReferenceJumpHeightPreview,
} from "../biomechanicsReferenceMeasurements";
import type { RimAnnotation, TechniqueProLandmarks } from "../techniquePoseExtraction";

// ── Local types mirroring API MasterReference ──────────────────────────────────

interface JointAngles {
  leftKneeDeg: number | null;
  rightKneeDeg: number | null;
  leftHipDeg: number | null;
  rightHipDeg: number | null;
}

interface ParabolaFrame {
  frameIndex: number;
  timestampMs: number;
  comHeightCm: number;
}

interface Kinematics {
  parabola: ParabolaFrame[];
  jointAngles: {
    dip: JointAngles | null;
    takeoff: JointAngles | null;
    apex: JointAngles | null;
  };
}

interface Calibration {
  normPerCmV: number;
  normPerCmH: number;
  groundY_norm: number;
  rimCenterY_norm: number;
  scaleSource: string;
}

interface MasterReference {
  schemaVersion: 2;
  calibration: Calibration;
  jumpHeight: {
    consensusValueCm: number | null;
    disagreementCm: number | null;
    status: string;
    motionProfile: string | null;
    playbackSpeedRatio: number | null;
    notes: string | null;
    methods: Array<{
      method: string;
      status: string;
      valueCm: number | null;
    }>;
  };
  kinematics: Kinematics;
  computedAt: string;
}

interface Props {
  jumpHeight: ReferenceJumpHeightPreview;
  landmarks: TechniqueProLandmarks;
  masterReference?: unknown;
  rimAnnotation?: RimAnnotation | null;
  onClose: () => void;
}

type Tab = "FLIGHT_TIME" | "CENTER_OF_MASS" | "RIM_REFERENCE" | "KINEMATICS";

const TAB_LABELS: Record<Tab, string> = {
  FLIGHT_TIME: "Tiempo de vuelo",
  CENTER_OF_MASS: "Centro de Masas",
  RIM_REFERENCE: "Referencia de aro",
  KINEMATICS: "Cinemática",
};

function fmt(v: number | null | undefined, decimals = 2): string {
  return typeof v === "number" ? v.toFixed(decimals) : "—";
}

// MediaPipe Pose skeleton connections (landmark indices)
const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [23, 25], [25, 27], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 30], [30, 32],
];

function getFrameLandmarks(
  landmarks: TechniqueProLandmarks,
  frameIndex: number,
): Array<{ x: number; y: number } | null> {
  return (landmarks.frames[frameIndex]?.landmarks as Array<{ x: number; y: number } | null> | undefined) ?? [];
}

function Skeleton({
  lms, vw, vh,
}: {
  lms: Array<{ x: number; y: number } | null>;
  vw: number; vh: number;
}) {
  const px = (x: number) => x * vw;
  const py = (y: number) => y * vh;
  return (
    <g opacity={0.45}>
      {POSE_CONNECTIONS.map(([a, b]) => {
        const A = lms[a]; const B = lms[b];
        if (!A || !B) return null;
        return <line key={`${a}-${b}`} x1={px(A.x)} y1={py(A.y)} x2={px(B.x)} y2={py(B.y)} stroke="#94a3b8" strokeWidth={2} />;
      })}
      {lms.map((lm, i) => lm ? <circle key={i} cx={px(lm.x)} cy={py(lm.y)} r={2.5} fill="#60a5fa" /> : null)}
    </g>
  );
}

/** Yellow rim annotation overlay reusable in any tab SVG. */
function RimOverlay({
  rimAnnotation, vw, vh,
}: {
  rimAnnotation: RimAnnotation;
  vw: number; vh: number;
}) {
  const px = (x: number) => x * vw;
  const py = (y: number) => y * vh;
  const xL = px(rimAnnotation.xLeft);
  const yL = py(rimAnnotation.yLeft);
  const xR = px(rimAnnotation.xRight);
  const yR = py(rimAnnotation.yRight);
  const xMid = (xL + xR) / 2;
  const yMid = (yL + yR) / 2;
  return (
    <g>
      <line x1={xL} y1={yL} x2={xR} y2={yR} stroke="#f59e0b" strokeWidth={3} strokeDasharray="6 3" />
      <circle cx={xL} cy={yL} r={7} fill="#f59e0b" stroke="#fff" strokeWidth={2} />
      <circle cx={xR} cy={yR} r={7} fill="#fb923c" stroke="#fff" strokeWidth={2} />
      <text x={xMid} y={yMid - 10} fontSize={10} fill="#f59e0b" fontWeight="700" textAnchor="middle">
        Aro manual (45.72 cm)
      </text>
    </g>
  );
}

// ── Tab 1: Flight Time ─────────────────────────────────────────────────────────
function FlightTimeTab({ method }: { method: ReferenceJumpHeightMethodPreview }) {
  const d = method.debug?.flightTime;
  return (
    <div className="jhdm-tab-body">
      <div className="jhdm-section-title">
        Eventos medidos
        <span className="jhdm-status-chip" data-status={method.status}>
          {method.status === "OK" ? `✓ ${fmt(method.valueCm, 1)} cm` : method.status}
        </span>
      </div>
      {method.notes && <p className="jhdm-notes">{method.notes}</p>}
      {d ? (
        <>
          <div className="jhdm-flight-timeline">
            <div className="jhdm-timeline-event">
              <div className="jhdm-timeline-dot jhdm-dot-start" />
              <span className="jhdm-timeline-label">{d.startEventType}</span>
              <span className="jhdm-timeline-frame">frame {d.startFrameIndex + 1}</span>
              <span className="jhdm-timeline-time">{typeof d.startTimeMs === "number" ? `${(d.startTimeMs / 1000).toFixed(3)} s` : "—"}</span>
            </div>
            {d.apexFrameIndex !== null && (
              <div className="jhdm-timeline-event">
                <div className="jhdm-timeline-dot jhdm-dot-apex" />
                <span className="jhdm-timeline-label">APEX</span>
                <span className="jhdm-timeline-frame">frame {d.apexFrameIndex + 1}</span>
                <span className="jhdm-timeline-time">{typeof d.apexTimeMs === "number" ? `${(d.apexTimeMs / 1000).toFixed(3)} s` : "—"}</span>
              </div>
            )}
            <div className="jhdm-timeline-event">
              <div className="jhdm-timeline-dot jhdm-dot-land" />
              <span className="jhdm-timeline-label">LANDING</span>
              <span className="jhdm-timeline-frame">frame {d.landingFrameIndex + 1}</span>
              <span className="jhdm-timeline-time">{typeof d.landingTimeMs === "number" ? `${(d.landingTimeMs / 1000).toFixed(3)} s` : "—"}</span>
            </div>
          </div>
          <table className="jhdm-table">
            <tbody>
              <tr><th>Rate / playback factor</th><td><strong>{d.playbackFactor}</strong></td></tr>
              <tr><th>Tiempo de ascenso (corregido)</th><td>{typeof d.ascentTimeSec === "number" ? `${d.ascentTimeSec.toFixed(4)} s` : "—"}</td></tr>
              <tr><th>Tiempo de vuelo total (corregido)</th><td>{typeof d.totalFlightTimeSec === "number" ? `${d.totalFlightTimeSec.toFixed(4)} s` : "—"}</td></tr>
              <tr><th>Altura por ascenso</th><td>{fmt(d.ascentHeightCm, 1)} cm<span className="jhdm-formula"> = ½ · 9.81 · t² · 100</span></td></tr>
              <tr><th>Altura por vuelo total</th><td>{fmt(d.totalFlightHeightCm, 1)} cm<span className="jhdm-formula"> = 9.81 · t² / 8 · 100</span></td></tr>
              <tr className="jhdm-row-result"><th>Resultado final</th><td><strong>{fmt(method.valueCm, 1)} cm</strong></td></tr>
            </tbody>
          </table>
        </>
      ) : (
        <p className="jhdm-no-debug-hint">Sin debug de tiempo de vuelo — no se encontraron eventos DIP/TOE_OFF y LANDING.</p>
      )}
    </div>
  );
}

// ── Tab 2: Center of Mass ─────────────────────────────────────────────────────
function CenterOfMassTab({
  method, landmarks, rimAnnotation,
}: {
  method: ReferenceJumpHeightMethodPreview;
  landmarks: TechniqueProLandmarks;
  rimAnnotation?: RimAnnotation | null;
}) {
  const d = method.debug?.centerOfMass;
  const VW = 420; const VH = 290;
  const px = (x: number) => x * VW;
  const py = (y: number) => y * VH;

  const apexLms = d ? getFrameLandmarks(landmarks, d.apexFrameIndex) : [];
  const comXSamples = d
    ? [d.apexLandmarks.lhipX, d.apexLandmarks.rhipX, d.apexLandmarks.lshX, d.apexLandmarks.rshX]
        .filter((v): v is number => v !== null)
    : [];
  const comX = comXSamples.length ? comXSamples.reduce((a, b) => a + b, 0) / comXSamples.length : 0.5;
  const hasComData = d && d.dipRawComY !== null && d.apexRawComY !== null;

  return (
    <div className="jhdm-tab-body">
      <div className="jhdm-section-title">
        Frame APEX — punto azul = CoM inicial (DIP), punto rojo = CoM en APEX
        <span className="jhdm-status-chip" data-status={method.status}>
          {method.status === "OK" ? `✓ ${fmt(method.valueCm, 1)} cm` : method.status}
        </span>
      </div>
      {method.notes && <p className="jhdm-notes">{method.notes}</p>}

      <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" className="jhdm-frame-svg">
        <Skeleton lms={apexLms} vw={VW} vh={VH} />
        {d && (
          <>
            {d.groundY !== null && (
              <>
                <line x1={0} y1={py(d.groundY)} x2={VW} y2={py(d.groundY)} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="6 4" />
                <text x={4} y={py(d.groundY) - 4} fill="#22c55e" fontSize={10}>suelo (DIP)</text>
              </>
            )}
            {hasComData && (
              <>
                <defs>
                  <marker id="jhdm-arrow-up" markerWidth="8" markerHeight="8" refX="4" refY="8" orient="auto">
                    <path d="M0,8 L4,0 L8,8 Z" fill="#3b82f6" />
                  </marker>
                </defs>
                <line x1={px(comX)} y1={0} x2={px(comX)} y2={VH} stroke="#475569" strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
                <line
                  x1={px(comX)} y1={py(d.dipRawComY!)}
                  x2={px(comX)} y2={py(d.apexRawComY!) + 12}
                  stroke="#3b82f6" strokeWidth={3} markerEnd="url(#jhdm-arrow-up)"
                />
                <text x={px(comX) + 10} y={(py(d.dipRawComY!) + py(d.apexRawComY!)) / 2} fill="#3b82f6" fontSize={12} fontWeight="bold" dominantBaseline="middle">
                  {fmt(method.valueCm, 1)} cm
                </text>
                <circle cx={px(comX)} cy={py(d.dipRawComY!)} r={10} fill="#3b82f6" stroke="#fff" strokeWidth={2} />
                <text x={px(comX) + 15} y={py(d.dipRawComY!) + 4} fill="#3b82f6" fontSize={10} fontWeight="bold">CoM DIP (inicial)</text>
                <text x={px(comX) + 15} y={py(d.dipRawComY!) + 15} fill="#3b82f6" fontSize={9}>y={fmt(d.dipRawComY, 5)}</text>
                <circle cx={px(comX)} cy={py(d.apexRawComY!)} r={10} fill="#ef4444" stroke="#fff" strokeWidth={2} />
                <text x={px(comX) + 15} y={py(d.apexRawComY!) + 4} fill="#ef4444" fontSize={10} fontWeight="bold">CoM APEX</text>
                <text x={px(comX) + 15} y={py(d.apexRawComY!) + 15} fill="#ef4444" fontSize={9}>y={fmt(d.apexRawComY, 5)}</text>
              </>
            )}
            {!hasComData && (
              <text x={VW / 2} y={VH / 2} textAnchor="middle" fill="#f59e0b" fontSize={12}>
                Sin landmarks de cadera/hombro en frame {(d.apexFrameIndex) + 1}
              </text>
            )}
          </>
        )}
        {!d && <text x={VW / 2} y={VH / 2} textAnchor="middle" fill="#94a3b8" fontSize={13}>Sin evento DIP o APEX</text>}
        {rimAnnotation && <RimOverlay rimAnnotation={rimAnnotation} vw={VW} vh={VH} />}
        <g transform={`translate(6,${VH - 18})`}>
          <circle cx={5} cy={5} r={4} fill="#3b82f6" /><text x={14} y={9} fill="#3b82f6" fontSize={9}>CoM inicial (DIP)</text>
          <circle cx={110} cy={5} r={4} fill="#ef4444" /><text x={119} y={9} fill="#ef4444" fontSize={9}>CoM en APEX</text>
          <rect x={210} y={2} width={14} height={3} fill="#22c55e" /><text x={228} y={9} fill="#22c55e" fontSize={9}>Suelo ref.</text>
        </g>
      </svg>

      {d && (
        <table className="jhdm-table">
          <tbody>
            <tr><th>Frame DIP / APEX</th><td>{d.dipFrameIndex + 1} / {d.apexFrameIndex + 1}</td></tr>
            <tr><th>CoM Y en DIP (inicial, azul)</th><td>{fmt(d.dipRawComY, 5)}</td></tr>
            <tr><th>CoM Y en APEX (rojo)</th><td>{fmt(d.apexRawComY, 5)}</td></tr>
            <tr><th>Suelo Y (ref. DIP)</th><td>{fmt(d.groundY, 5)}</td></tr>
            <tr><th>Δ CoM raw (↓ crece)</th><td>{fmt(d.comDelta, 6)} norm.</td></tr>
            <tr><th>Fuente escala</th><td>{d.scaleSource === "rim" ? "Aro 305 cm" : "Estatura atleta"}</td></tr>
            <tr><th>Factor px/cm</th><td>{fmt(d.pxPerCm, 7)}</td></tr>
            <tr className="jhdm-row-result">
              <th>Resultado</th>
              <td>
                <strong>{fmt(method.valueCm, 1)} cm</strong>
                {d.comDelta !== null && d.pxPerCm !== null
                  ? <span className="jhdm-formula"> = {fmt(d.comDelta, 5)} ÷ {fmt(d.pxPerCm, 7)}</span>
                  : null}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Tab 3: Rim Reference ───────────────────────────────────────────────────────
function RimReferenceTab({
  method, landmarks, rimAnnotation,
}: {
  method: ReferenceJumpHeightMethodPreview;
  landmarks: TechniqueProLandmarks;
  rimAnnotation?: RimAnnotation | null;
}) {
  const d = method.debug?.rimReference;
  const VW = 440; const VH = 300;
  const px = (x: number | null) => (x ?? 0) * VW;
  const py = (y: number | null) => (y ?? 0) * VH;

  const skelLms: Array<{ x: number; y: number } | null> = d
    ? ((d.apexLandmarks as Array<{ x: number; y: number } | null>).length > 5
        ? (d.apexLandmarks as Array<{ x: number; y: number } | null>)
        : getFrameLandmarks(landmarks, d.apexFrameIndex))
    : [];

  const rimLine = (() => {
    if (!d || d.rimXLeft === null || d.rimXRight === null) return null;
    const xL = d.rimXLeft, yL = d.rimYLeft ?? 0;
    const xR = d.rimXRight, yR = d.rimYRight ?? 0;
    const span = xR - xL;
    if (Math.abs(span) < 0.001) return { x1: 0, y1: yL * VH, x2: VW, y2: yL * VH };
    return {
      x1: 0, y1: (yL + ((0 - xL) / span) * (yR - yL)) * VH,
      x2: VW, y2: (yL + ((1 - xL) / span) * (yR - yL)) * VH,
    };
  })();

  const clearanceColor = typeof d?.rimClearanceCm === "number" && d.rimClearanceCm >= 0 ? "#4ade80" : "#f87171";

  return (
    <div className="jhdm-tab-body">
      <div className="jhdm-section-title">
        Frame APEX — líneas verticales: atleta (azul) · base aro (naranja) · punta aro (naranja) + línea 305cm
        <span className="jhdm-status-chip" data-status={method.status}>
          {method.status === "OK" ? `✓ ${fmt(method.valueCm, 1)} cm` : method.status}
        </span>
      </div>
      {method.notes && <p className="jhdm-notes">{method.notes}</p>}

      <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" className="jhdm-frame-svg">
        <Skeleton lms={skelLms} vw={VW} vh={VH} />

        {d ? (
          <>
            {/* Rim base vertical */}
            {d.rimXLeft !== null && (
              <>
                <line x1={px(d.rimXLeft)} y1={0} x2={px(d.rimXLeft)} y2={VH} stroke="#fb923c" strokeWidth={1.5} strokeDasharray="7 4" />
                <circle cx={px(d.rimXLeft)} cy={py(d.rimYLeft)} r={7} fill="#fb923c" stroke="#fff" strokeWidth={2} />
                <text x={px(d.rimXLeft) + 4} y={py(d.rimYLeft) - 10} fill="#fb923c" fontSize={9} fontWeight="bold">base</text>
              </>
            )}
            {/* Rim tip vertical */}
            {d.rimXRight !== null && (
              <>
                <line x1={px(d.rimXRight)} y1={0} x2={px(d.rimXRight)} y2={VH} stroke="#f97316" strokeWidth={1.5} strokeDasharray="7 4" />
                <circle cx={px(d.rimXRight)} cy={py(d.rimYRight)} r={7} fill="#f97316" stroke="#fff" strokeWidth={2} />
                <text x={px(d.rimXRight) + 4} y={py(d.rimYRight) - 10} fill="#f97316" fontSize={9} fontWeight="bold">punta</text>
              </>
            )}
            {/* Extended perspective line */}
            {rimLine && (
              <>
                <line x1={rimLine.x1} y1={rimLine.y1} x2={rimLine.x2} y2={rimLine.y2} stroke="#fb923c" strokeWidth={1.5} opacity={0.55} />
                {d.rimXLeft !== null && d.rimXRight !== null && (
                  <line x1={px(d.rimXLeft)} y1={py(d.rimYLeft)} x2={px(d.rimXRight)} y2={py(d.rimYRight)} stroke="#fbbf24" strokeWidth={4} />
                )}
                <text
                  x={(px(d.rimXLeft) + px(d.rimXRight)) / 2}
                  y={((py(d.rimYLeft) + py(d.rimYRight)) / 2) - 8}
                  fill="#fb923c" fontSize={10} textAnchor="middle" fontWeight="bold"
                >
                  línea 305 cm
                </text>
              </>
            )}
            {/* Athlete vertical */}
            {d.athleteX !== null && (
              <line x1={px(d.athleteX)} y1={0} x2={px(d.athleteX)} y2={VH} stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="7 4" />
            )}
            {/* Athlete height bracket heel→head */}
            {d.athleteX !== null && d.headY !== null && d.heelY !== null && (
              <>
                <line x1={px(d.athleteX) - 7} y1={py(d.heelY)} x2={px(d.athleteX) + 7} y2={py(d.heelY)} stroke="#22c55e" strokeWidth={2} />
                <line x1={px(d.athleteX) - 7} y1={py(d.headY)} x2={px(d.athleteX) + 7} y2={py(d.headY)} stroke="#22c55e" strokeWidth={2} />
                <line x1={px(d.athleteX) - 4} y1={py(d.heelY)} x2={px(d.athleteX) - 4} y2={py(d.headY)} stroke="#22c55e" strokeWidth={1.5} />
                <text x={px(d.athleteX) - 10} y={(py(d.headY) + py(d.heelY)) / 2} fill="#22c55e" fontSize={9} textAnchor="end" dominantBaseline="middle">estatura</text>
              </>
            )}
            {d.headY !== null && d.athleteX !== null && <circle cx={px(d.athleteX)} cy={py(d.headY)} r={7} fill="#60a5fa" stroke="#fff" strokeWidth={2} />}
            {d.heelY !== null && d.athleteX !== null && <circle cx={px(d.athleteX)} cy={py(d.heelY)} r={5} fill="#22c55e" stroke="#fff" strokeWidth={1} />}
            {/* 305cm intersection dot */}
            {d.yRim305AtAthlete !== null && d.athleteX !== null && (
              <circle cx={px(d.athleteX)} cy={py(d.yRim305AtAthlete)} r={8} fill="#fb923c" stroke="#fff" strokeWidth={2} />
            )}
            {/* Clearance bracket */}
            {d.headY !== null && d.yRim305AtAthlete !== null && d.athleteX !== null && (
              <>
                <line x1={px(d.athleteX) + 22} y1={py(d.headY)} x2={px(d.athleteX) + 22} y2={py(d.yRim305AtAthlete)} stroke={clearanceColor} strokeWidth={3} />
                <line x1={px(d.athleteX) + 18} y1={py(d.headY)} x2={px(d.athleteX) + 26} y2={py(d.headY)} stroke={clearanceColor} strokeWidth={2} />
                <line x1={px(d.athleteX) + 18} y1={py(d.yRim305AtAthlete)} x2={px(d.athleteX) + 26} y2={py(d.yRim305AtAthlete)} stroke={clearanceColor} strokeWidth={2} />
                <text x={px(d.athleteX) + 30} y={(py(d.headY) + py(d.yRim305AtAthlete)) / 2} fill={clearanceColor} fontSize={11} fontWeight="bold" dominantBaseline="middle">
                  {fmt(d.rimClearanceCm, 1)} cm
                </text>
              </>
            )}
          </>
        ) : (
          <text x={VW / 2} y={VH / 2} textAnchor="middle" fill="#94a3b8" fontSize={13}>Sin evento APEX o sin extremos del aro</text>
        )}

        {rimAnnotation && <RimOverlay rimAnnotation={rimAnnotation} vw={VW} vh={VH} />}
        <g transform={`translate(6,${VH - 18})`}>
          <rect x={0} y={1} width={12} height={3} fill="#fbbf24" /><text x={16} y={8} fill="#fb923c" fontSize={9}>Segmento 305cm</text>
          <rect x={115} y={1} width={12} height={3} fill="#60a5fa" /><text x={131} y={8} fill="#60a5fa" fontSize={9}>Atleta vertical</text>
          <rect x={220} y={1} width={12} height={3} fill="#22c55e" /><text x={236} y={8} fill="#22c55e" fontSize={9}>Estatura</text>
        </g>
      </svg>

      {d && (
        <table className="jhdm-table">
          <tbody>
            <tr><th>Frame APEX</th><td>{d.apexFrameIndex + 1}</td></tr>
            <tr><th>Base aro (xLeft, yLeft)</th><td>({fmt(d.rimXLeft, 4)}, {fmt(d.rimYLeft, 4)})</td></tr>
            <tr><th>Punta aro (xRight, yRight)</th><td>({fmt(d.rimXRight, 4)}, {fmt(d.rimYRight, 4)})</td></tr>
            <tr><th>X atleta (centro cuerpo)</th><td>{fmt(d.athleteX, 4)}</td></tr>
            <tr><th>Y cabeza en APEX</th><td>{fmt(d.headY, 4)}</td></tr>
            <tr><th>Y talón en APEX</th><td>{fmt(d.heelY, 4)}</td></tr>
            <tr><th>Y línea 305cm @ X atleta</th><td>{fmt(d.yRim305AtAthlete, 4)}</td></tr>
            <tr><th>px/cm (altura visible)</th><td>{fmt(d.pxPerCm, 7)}</td></tr>
            <tr><th>Borrado cabeza / aro</th>
              <td>
                <strong style={{ color: typeof d.rimClearanceCm === "number" && d.rimClearanceCm >= 0 ? "#16a34a" : "#dc2626" }}>
                  {fmt(d.rimClearanceCm, 2)} cm
                </strong>
                {typeof d.rimClearanceCm === "number" ? (d.rimClearanceCm >= 0 ? " (sobre el aro)" : " (bajo el aro)") : ""}
              </td>
            </tr>
            <tr className="jhdm-row-result">
              <th>Resultado</th>
              <td><strong>{fmt(method.valueCm, 1)} cm</strong><span className="jhdm-formula"> = (305 − estatura) + borrado</span></td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Tab 4: Kinematics ─────────────────────────────────────────────────────────
function fmtDeg(v: number | null | undefined): string {
  return typeof v === "number" ? `${v.toFixed(1)}°` : "—";
}

function KinematicsTab({ kinematics }: { kinematics: Kinematics }) {
  const { parabola, jointAngles } = kinematics;

  // ── SVG line chart ──────────────────────────────────────────────────────────
  const CW = 520; const CH = 200;
  const ML = 52; const MR = 16; const MT = 16; const MB = 36; // margins
  const plotW = CW - ML - MR;
  const plotH = CH - MT - MB;

  const hasParabola = parabola.length >= 2;

  const minFrame = hasParabola ? parabola[0]!.frameIndex : 0;
  const maxFrame = hasParabola ? parabola[parabola.length - 1]!.frameIndex : 1;
  const frameRange = Math.max(1, maxFrame - minFrame);

  const allCm = parabola.map((p) => p.comHeightCm);
  const minCm = hasParabola ? Math.max(0, Math.min(...allCm) - 5) : 0;
  const maxCm = hasParabola ? Math.max(...allCm) + 8 : 120;
  const cmRange = Math.max(1, maxCm - minCm);

  const sx = (fi: number) => ML + ((fi - minFrame) / frameRange) * plotW;
  const sy = (cm: number) => MT + plotH - ((cm - minCm) / cmRange) * plotH;

  // Build SVG path
  const pathD = parabola
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.frameIndex).toFixed(1)} ${sy(p.comHeightCm).toFixed(1)}`)
    .join(" ");

  // Apex frame = max comHeightCm
  const apexPoint = hasParabola ? parabola.reduce((best, p) => p.comHeightCm > best.comHeightCm ? p : best, parabola[0]!) : null;

  // Y-axis tick values
  const yTickStep = cmRange > 80 ? 20 : cmRange > 40 ? 10 : cmRange > 20 ? 5 : 2;
  const firstTick = Math.ceil(minCm / yTickStep) * yTickStep;
  const yTicks: number[] = [];
  for (let v = firstTick; v <= maxCm; v += yTickStep) yTicks.push(v);

  // ── Table columns ───────────────────────────────────────────────────────────
  const angleRows: Array<{ label: string; getValue: (a: JointAngles) => string }> = [
    { label: "Rodilla derecha", getValue: (a) => fmtDeg(a.rightKneeDeg) },
    { label: "Rodilla izquierda", getValue: (a) => fmtDeg(a.leftKneeDeg) },
    { label: "Cadera derecha", getValue: (a) => fmtDeg(a.rightHipDeg) },
    { label: "Cadera izquierda", getValue: (a) => fmtDeg(a.leftHipDeg) },
  ];

  const hasAngles = jointAngles.dip || jointAngles.takeoff || jointAngles.apex;

  return (
    <div className="jhdm-tab-body">
      <div className="jhdm-section-title">Parábola del Centro de Masa (CoM)</div>

      {hasParabola ? (
        <div style={{ overflowX: "auto" }}>
          <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" style={{ display: "block" }}>
            {/* Plot background */}
            <rect x={ML} y={MT} width={plotW} height={plotH} fill="rgba(0,0,0,0.02)" stroke="#e2e8f0" strokeWidth={1} rx={4} />

            {/* Y-axis grid + labels */}
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={ML} y1={sy(v)} x2={ML + plotW} y2={sy(v)} stroke="#e2e8f0" strokeWidth={1} />
                <text x={ML - 4} y={sy(v) + 4} textAnchor="end" fontSize={9} fill="#94a3b8">{v}</text>
              </g>
            ))}
            {/* Y-axis label */}
            <text
              transform={`translate(${ML - 40},${MT + plotH / 2}) rotate(-90)`}
              textAnchor="middle" fontSize={10} fill="#64748b"
            >
              CoM (cm sobre suelo)
            </text>

            {/* X-axis labels */}
            <text x={ML} y={CH - 4} fontSize={9} fill="#94a3b8">f{minFrame + 1}</text>
            <text x={ML + plotW} y={CH - 4} textAnchor="end" fontSize={9} fill="#94a3b8">f{maxFrame + 1}</text>
            <text x={ML + plotW / 2} y={CH - 4} textAnchor="middle" fontSize={10} fill="#64748b">Frame</text>

            {/* Apex vertical */}
            {apexPoint && (
              <g>
                <line
                  x1={sx(apexPoint.frameIndex)} y1={MT}
                  x2={sx(apexPoint.frameIndex)} y2={MT + plotH}
                  stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3"
                />
                <text x={sx(apexPoint.frameIndex) + 3} y={MT + 12} fontSize={9} fill="#f59e0b" fontWeight="700">
                  APEX f{apexPoint.frameIndex + 1}
                </text>
              </g>
            )}
            {/* TOE-OFF line (first parabola frame) */}
            {hasParabola && (
              <g>
                <line
                  x1={sx(minFrame)} y1={MT}
                  x2={sx(minFrame)} y2={MT + plotH}
                  stroke="#22c55e" strokeWidth={1.5} strokeDasharray="5 3"
                />
                <text x={sx(minFrame) + 3} y={MT + 22} fontSize={9} fill="#22c55e" fontWeight="700">TOE-OFF</text>
              </g>
            )}
            {/* LANDING line (last parabola frame) */}
            {hasParabola && (
              <g>
                <line
                  x1={sx(maxFrame)} y1={MT}
                  x2={sx(maxFrame)} y2={MT + plotH}
                  stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 3"
                />
                <text x={sx(maxFrame) - 3} y={MT + 22} textAnchor="end" fontSize={9} fill="#ef4444" fontWeight="700">LAND.</text>
              </g>
            )}

            {/* Parabola line */}
            <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2.5} strokeLinejoin="round" />

            {/* Apex dot */}
            {apexPoint && (
              <>
                <circle cx={sx(apexPoint.frameIndex)} cy={sy(apexPoint.comHeightCm)} r={5} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />
                <text
                  x={sx(apexPoint.frameIndex) + 8}
                  y={sy(apexPoint.comHeightCm) - 4}
                  fontSize={10} fill="#f59e0b" fontWeight="700"
                >
                  {apexPoint.comHeightCm.toFixed(1)} cm
                </text>
              </>
            )}

            {/* Takeoff dot */}
            {hasParabola && (
              <circle cx={sx(minFrame)} cy={sy(parabola[0]!.comHeightCm)} r={5} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
            )}
            {/* Landing dot */}
            {hasParabola && (
              <circle cx={sx(maxFrame)} cy={sy(parabola[parabola.length - 1]!.comHeightCm)} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
            )}
          </svg>
        </div>
      ) : (
        <p className="jhdm-no-debug-hint">
          Sin datos de parábola — se necesita un evento TOE_OFF y LANDING con frameIndex para calcular la curva.
        </p>
      )}

      {/* Joint angles table */}
      <div className="jhdm-section-title" style={{ marginTop: 20 }}>Ángulos articulares en eventos clave</div>
      {hasAngles ? (
        <table className="jhdm-table">
          <thead>
            <tr>
              <th>Articulación</th>
              <th>DIP</th>
              <th>Despegue</th>
              <th>Apex</th>
            </tr>
          </thead>
          <tbody>
            {angleRows.map(({ label, getValue }) => (
              <tr key={label}>
                <th>{label}</th>
                <td>{jointAngles.dip ? getValue(jointAngles.dip) : "—"}</td>
                <td>{jointAngles.takeoff ? getValue(jointAngles.takeoff) : "—"}</td>
                <td>{jointAngles.apex ? getValue(jointAngles.apex) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="jhdm-no-debug-hint">
          Sin ángulos articulares — se necesitan los eventos DIP, TOE_OFF y APEX con frameIndex.
        </p>
      )}

      {/* Calibration info */}
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export function JumpHeightDebugModal({ jumpHeight, landmarks, masterReference, rimAnnotation, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("FLIGHT_TIME");

  const mr = (masterReference as MasterReference | null | undefined) ?? null;
  const kinematics = mr?.kinematics ?? null;

  const methodByTab: Record<Tab, ReferenceJumpHeightMethodPreview | null> = {
    FLIGHT_TIME: jumpHeight.methods.find((m) => m.method === "FLIGHT_TIME") ?? null,
    CENTER_OF_MASS: jumpHeight.methods.find((m) => m.method === "CENTER_OF_MASS") ?? null,
    RIM_REFERENCE: jumpHeight.methods.find((m) => m.method === "RIM_REFERENCE") ?? null,
    KINEMATICS: null,
  };

  const activeMethod = methodByTab[activeTab];

  // Consensus bar: prefer masterReference data when available (server-authoritative)
  const consensusCm = mr?.jumpHeight.consensusValueCm ?? jumpHeight.consensusValueCm;
  const disagreementCm = mr?.jumpHeight.disagreementCm ?? jumpHeight.disagreementCm;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel jhdm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Diagnóstico de cálculo</p>
            <h2 style={{ margin: 0 }}>Altura del salto — métodos</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="jhdm-consensus-bar">
          {typeof consensusCm === "number" ? (
            <span className="biomechanics-badge" style={{ fontWeight: 700 }}>
              Consenso: {consensusCm.toFixed(1)} cm
              {mr ? <span style={{ fontSize: "0.75em", opacity: 0.7, marginLeft: 4 }}>(servidor)</span> : null}
            </span>
          ) : (
            <span className="biomechanics-badge" style={{ color: "#dc2626" }}>Sin consenso</span>
          )}
          {typeof disagreementCm === "number" && (
            <span className="biomechanics-badge">Diferencia: {disagreementCm.toFixed(1)} cm</span>
          )}
          {typeof jumpHeight.playbackSpeedRatio === "number" && (
            <span className="biomechanics-badge">Ratio temporal: {jumpHeight.playbackSpeedRatio.toFixed(2)}</span>
          )}
          {mr && (
            <span className="biomechanics-badge" style={{ marginLeft: "auto", fontSize: "0.78rem" }}>
              ✓ Biorreferencia calculada · {new Date(mr.computedAt).toLocaleDateString("es")}
            </span>
          )}
        </div>

        <div className="jhdm-tabs">
          {(["FLIGHT_TIME", "CENTER_OF_MASS", "RIM_REFERENCE", "KINEMATICS"] as Tab[]).map((tab) => {
            const m = methodByTab[tab];
            const isKin = tab === "KINEMATICS";
            const isOk = m?.status === "OK";
            const hasKin = kinematics !== null && kinematics.parabola.length > 0;
            return (
              <button key={tab} type="button"
                className={`jhdm-tab-btn${activeTab === tab ? " active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                <span className="jhdm-tab-name">{TAB_LABELS[tab]}</span>
                {!isKin && <span className="jhdm-tab-status-dot" data-status={m?.status ?? "PENDING"} />}
                {isKin && <span className="jhdm-tab-status-dot" data-status={hasKin ? "OK" : "PENDING"} />}
                <span className={`jhdm-tab-value${isOk ? "" : " jhdm-tab-value-fail"}`}>
                  {isKin
                    ? (hasKin ? `${kinematics.parabola.length} frames` : "—")
                    : (isOk && typeof m?.valueCm === "number" ? `${m.valueCm.toFixed(1)} cm` : (m?.status ?? "—"))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="jhdm-tab-content">
          {activeTab === "KINEMATICS" ? (
            kinematics ? (
              <KinematicsTab kinematics={kinematics} />
            ) : (
              <p className="jhdm-no-debug-hint">
                Sin datos de cinemática — primero calcula la Biorreferencia usando el botón "⚡ Calcular Biorreferencia".
              </p>
            )
          ) : activeMethod ? (
            <>
              {activeTab === "FLIGHT_TIME" && <FlightTimeTab method={activeMethod} />}
              {activeTab === "CENTER_OF_MASS" && <CenterOfMassTab method={activeMethod} landmarks={landmarks} rimAnnotation={rimAnnotation ?? null} />}
              {activeTab === "RIM_REFERENCE" && <RimReferenceTab method={activeMethod} landmarks={landmarks} rimAnnotation={rimAnnotation ?? null} />}
            </>
          ) : (
            <p style={{ color: "var(--ink-soft)", fontStyle: "italic" }}>Este método no está presente.</p>
          )}
        </div>
      </div>
    </div>
  );
}

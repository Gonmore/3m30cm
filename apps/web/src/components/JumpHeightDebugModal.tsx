import { useState } from "react";
import type {
  ReferenceJumpHeightMethodPreview,
  ReferenceJumpHeightPreview,
} from "../biomechanicsReferenceMeasurements";
import type { TechniqueProLandmarks } from "../techniquePoseExtraction";

interface Props {
  jumpHeight: ReferenceJumpHeightPreview;
  landmarks: TechniqueProLandmarks;
  onClose: () => void;
}

type Tab = "FLIGHT_TIME" | "CENTER_OF_MASS" | "RIM_REFERENCE";

const TAB_LABELS: Record<Tab, string> = {
  FLIGHT_TIME: "Tiempo de vuelo",
  CENTER_OF_MASS: "Centro de Masas",
  RIM_REFERENCE: "Referencia de aro",
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
  method, landmarks,
}: {
  method: ReferenceJumpHeightMethodPreview;
  landmarks: TechniqueProLandmarks;
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
  method, landmarks,
}: {
  method: ReferenceJumpHeightMethodPreview;
  landmarks: TechniqueProLandmarks;
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

// ── Main Modal ─────────────────────────────────────────────────────────────────
export function JumpHeightDebugModal({ jumpHeight, landmarks, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("FLIGHT_TIME");

  const methodByTab: Record<Tab, ReferenceJumpHeightMethodPreview | null> = {
    FLIGHT_TIME: jumpHeight.methods.find((m) => m.method === "FLIGHT_TIME") ?? null,
    CENTER_OF_MASS: jumpHeight.methods.find((m) => m.method === "CENTER_OF_MASS") ?? null,
    RIM_REFERENCE: jumpHeight.methods.find((m) => m.method === "RIM_REFERENCE") ?? null,
  };

  const activeMethod = methodByTab[activeTab];

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
          {typeof jumpHeight.consensusValueCm === "number" ? (
            <span className="biomechanics-badge" style={{ fontWeight: 700 }}>Consenso: {jumpHeight.consensusValueCm.toFixed(1)} cm</span>
          ) : (
            <span className="biomechanics-badge" style={{ color: "#dc2626" }}>Sin consenso</span>
          )}
          {typeof jumpHeight.disagreementCm === "number" && (
            <span className="biomechanics-badge">Diferencia: {jumpHeight.disagreementCm.toFixed(1)} cm</span>
          )}
          {typeof jumpHeight.playbackSpeedRatio === "number" && (
            <span className="biomechanics-badge">Ratio temporal: {jumpHeight.playbackSpeedRatio.toFixed(2)}</span>
          )}
        </div>

        <div className="jhdm-tabs">
          {(["FLIGHT_TIME", "CENTER_OF_MASS", "RIM_REFERENCE"] as Tab[]).map((tab) => {
            const m = methodByTab[tab];
            const isOk = m?.status === "OK";
            return (
              <button key={tab} type="button"
                className={`jhdm-tab-btn${activeTab === tab ? " active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                <span className="jhdm-tab-name">{TAB_LABELS[tab]}</span>
                <span className="jhdm-tab-status-dot" data-status={m?.status ?? "PENDING"} />
                <span className={`jhdm-tab-value${isOk ? "" : " jhdm-tab-value-fail"}`}>
                  {isOk && typeof m?.valueCm === "number" ? `${m.valueCm.toFixed(1)} cm` : (m?.status ?? "—")}
                </span>
              </button>
            );
          })}
        </div>

        <div className="jhdm-tab-content">
          {activeMethod ? (
            <>
              {activeTab === "FLIGHT_TIME" && <FlightTimeTab method={activeMethod} />}
              {activeTab === "CENTER_OF_MASS" && <CenterOfMassTab method={activeMethod} landmarks={landmarks} />}
              {activeTab === "RIM_REFERENCE" && <RimReferenceTab method={activeMethod} landmarks={landmarks} />}
            </>
          ) : (
            <p style={{ color: "var(--ink-soft)", fontStyle: "italic" }}>Este método no está presente.</p>
          )}
        </div>
      </div>
    </div>
  );
}

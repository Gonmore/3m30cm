import { useState } from "react";
import type {
  ReferenceJumpHeightMethodDebug,
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

function fmtMs(ms: number | null | undefined): string {
  if (typeof ms !== "number") return "—";
  return `${(ms / 1000).toFixed(3)} s`;
}

// ── Flight Time Tab ────────────────────────────────────────────────────────────
function FlightTimeTab({ method }: { method: ReferenceJumpHeightMethodPreview }) {
  const d = method.debug?.flightTime;
  return (
    <div className="jhdm-tab-body">
      <div className="jhdm-result-row">
        <span className="biomechanics-badge jhdm-status-badge" data-status={method.status}>
          {method.status === "OK" ? `✓ ${fmt(method.valueCm, 1)} cm` : method.status}
        </span>
        {method.notes ? <p className="jhdm-notes">{method.notes}</p> : null}
      </div>
      {d ? (
        <>
          <table className="jhdm-table">
            <tbody>
              <tr><th>Evento inicio</th><td>{d.startEventType} (frame {d.startFrameIndex + 1})</td></tr>
              <tr><th>APEX</th><td>{d.apexFrameIndex !== null ? `frame ${d.apexFrameIndex + 1}` : "—"}</td></tr>
              <tr><th>LANDING</th><td>frame {d.landingFrameIndex + 1}</td></tr>
              <tr><th>t inicio</th><td>{fmtMs(d.startTimeMs)}</td></tr>
              <tr><th>t APEX</th><td>{fmtMs(d.apexTimeMs)}</td></tr>
              <tr><th>t LANDING</th><td>{fmtMs(d.landingTimeMs)}</td></tr>
              <tr><th>Playback factor</th><td>{d.playbackFactor}</td></tr>
              <tr><th>t ascenso (real)</th><td>{typeof d.ascentTimeSec === "number" ? `${d.ascentTimeSec.toFixed(4)} s` : "—"}</td></tr>
              <tr><th>t vuelo total (real)</th><td>{typeof d.totalFlightTimeSec === "number" ? `${d.totalFlightTimeSec.toFixed(4)} s` : "—"}</td></tr>
              <tr><th>Altura por ascenso</th><td>{fmt(d.ascentHeightCm, 1)} cm &nbsp;(h = ½ g t²)</td></tr>
              <tr><th>Altura por vuelo total</th><td>{fmt(d.totalFlightHeightCm, 1)} cm &nbsp;(h = g t² / 8)</td></tr>
              <tr><th><strong>Resultado</strong></th><td><strong>{fmt(method.valueCm, 1)} cm</strong></td></tr>
            </tbody>
          </table>
          <p className="jhdm-formula-hint">
            Fórmulas: h_ascenso = ½ · 9.81 · t_ascenso² · 100 &nbsp;|&nbsp; h_total = 9.81 · t_total² / 8 · 100
          </p>
        </>
      ) : (
        <p className="jhdm-no-debug">No hay datos de debug disponibles para este método (probablemente sin estado OK).</p>
      )}
    </div>
  );
}

// ── CoM Dot Overlay ───────────────────────────────────────────────────────────
function CoMFrameViz({
  label,
  lhipX, lhipY, rhipX, rhipY, lshX, lshY, rshX, rshY,
  comY,
  groundY,
}: {
  label: string;
  lhipX: number | null; lhipY: number | null;
  rhipX: number | null; rhipY: number | null;
  lshX: number | null; lshY: number | null;
  rshX: number | null; rshY: number | null;
  comY: number | null;
  groundY: number | null;
}) {
  const W = 200;
  const H = 260;
  const px = (x: number | null) => (x ?? 0.5) * W;
  const py = (y: number | null) => (y ?? 0.5) * H;
  const avgX = [lhipX, rhipX, lshX, rshX].filter((v): v is number => v !== null);
  const comX = avgX.length ? avgX.reduce((a, b) => a + b, 0) / avgX.length : 0.5;

  return (
    <div className="jhdm-frame-viz">
      <p className="jhdm-frame-label">{label}</p>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="jhdm-frame-svg">
        {/* Ground line */}
        {groundY !== null && (
          <line x1={0} y1={py(groundY)} x2={W} y2={py(groundY)} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 3" />
        )}
        {/* CoM horizontal line */}
        {comY !== null && (
          <line x1={0} y1={py(comY)} x2={W} y2={py(comY)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" />
        )}
        {/* Torso connections */}
        {lhipX !== null && lshX !== null && (
          <line x1={px(lhipX)} y1={py(lhipY)} x2={px(lshX)} y2={py(lshY)} stroke="#94a3b8" strokeWidth={2} />
        )}
        {rhipX !== null && rshX !== null && (
          <line x1={px(rhipX)} y1={py(rhipY)} x2={px(rshX)} y2={py(rshY)} stroke="#94a3b8" strokeWidth={2} />
        )}
        {lhipX !== null && rhipX !== null && (
          <line x1={px(lhipX)} y1={py(lhipY)} x2={px(rhipX)} y2={py(rhipY)} stroke="#94a3b8" strokeWidth={2} />
        )}
        {lshX !== null && rshX !== null && (
          <line x1={px(lshX)} y1={py(lshY)} x2={px(rshX)} y2={py(rshY)} stroke="#94a3b8" strokeWidth={2} />
        )}
        {/* Landmark dots */}
        {([[ lhipX, lhipY ], [ rhipX, rhipY ], [ lshX, lshY ], [ rshX, rshY ]] as [number | null, number | null][]).map(([x, y], i) =>
          x !== null ? <circle key={i} cx={px(x)} cy={py(y)} r={5} fill="#60a5fa" /> : null,
        )}
        {/* CoM dot */}
        {comY !== null && (
          <circle cx={px(comX)} cy={py(comY)} r={7} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />
        )}
        {/* Delta arrow if both ground and CoM visible */}
        {comY !== null && groundY !== null && (
          <line
            x1={px(comX)} y1={py(groundY)}
            x2={px(comX)} y2={py(comY)}
            stroke="#f59e0b" strokeWidth={2}
            markerEnd="url(#arrowUp)"
          />
        )}
        <defs>
          <marker id="arrowUp" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,8 L4,0 L8,8 Z" fill="#f59e0b" />
          </marker>
        </defs>
      </svg>
      <div className="jhdm-frame-legend">
        <span className="jhdm-legend-dot" style={{ background: "#60a5fa" }} /> Landmarks
        <span className="jhdm-legend-dot" style={{ background: "#f59e0b" }} /> CoM
        <span className="jhdm-legend-dot" style={{ background: "#22c55e" }} /> Suelo
      </div>
    </div>
  );
}

// ── Center of Mass Tab ─────────────────────────────────────────────────────────
function CenterOfMassTab({ method }: { method: ReferenceJumpHeightMethodPreview }) {
  const d = method.debug?.centerOfMass;
  return (
    <div className="jhdm-tab-body">
      <div className="jhdm-result-row">
        <span className="biomechanics-badge jhdm-status-badge" data-status={method.status}>
          {method.status === "OK" ? `✓ ${fmt(method.valueCm, 1)} cm` : method.status}
        </span>
        {method.notes ? <p className="jhdm-notes">{method.notes}</p> : null}
      </div>
      {d ? (
        <>
          <div className="jhdm-com-viz-row">
            <CoMFrameViz
              label={`DIP (frame ${d.dipFrameIndex + 1})`}
              lhipX={d.dipLandmarks.lhipX} lhipY={d.dipLandmarks.lhipY}
              rhipX={d.dipLandmarks.rhipX} rhipY={d.dipLandmarks.rhipY}
              lshX={d.dipLandmarks.lshX} lshY={d.dipLandmarks.lshY}
              rshX={d.dipLandmarks.rshX} rshY={d.dipLandmarks.rshY}
              comY={d.dipRawComY}
              groundY={d.groundY}
            />
            <div className="jhdm-delta-arrow-col">
              <span className="jhdm-delta-label">
                Δ CoM<br />
                {d.comDelta !== null ? (d.comDelta * (d.pxPerCm ? 1 / d.pxPerCm : 1) * (d.pxPerCm ? d.pxPerCm * (1 / (d.pxPerCm)) : 1)).toFixed(4) : ""}
                <br />
                <strong>{fmt(method.valueCm, 1)} cm</strong>
              </span>
              <div className="jhdm-up-arrow">↑</div>
            </div>
            <CoMFrameViz
              label={`APEX (frame ${d.apexFrameIndex + 1})`}
              lhipX={d.apexLandmarks.lhipX} lhipY={d.apexLandmarks.lhipY}
              rhipX={d.apexLandmarks.rhipX} rhipY={d.apexLandmarks.rhipY}
              lshX={d.apexLandmarks.lshX} lshY={d.apexLandmarks.lshY}
              rshX={d.apexLandmarks.rshX} rshY={d.apexLandmarks.rshY}
              comY={d.apexRawComY}
              groundY={d.groundY}
            />
          </div>
          <table className="jhdm-table">
            <tbody>
              <tr><th>Frame DIP</th><td>{d.dipFrameIndex + 1}</td></tr>
              <tr><th>Frame APEX</th><td>{d.apexFrameIndex + 1}</td></tr>
              <tr><th>CoM Y (raw) en DIP</th><td>{fmt(d.dipRawComY, 4)}</td></tr>
              <tr><th>CoM Y (raw) en APEX</th><td>{fmt(d.apexRawComY, 4)}</td></tr>
              <tr><th>Suelo Y en DIP</th><td>{fmt(d.groundY, 4)}</td></tr>
              <tr><th>Δ CoM (raw)</th><td>{fmt(d.comDelta, 4)} unidades normalizadas</td></tr>
              <tr><th>Fuente de escala</th><td>{d.scaleSource === "rim" ? "Aro (305 cm)" : "Estatura del atleta"}</td></tr>
              <tr><th>px/cm</th><td>{fmt(d.pxPerCm, 6)}</td></tr>
              <tr><th><strong>Resultado</strong></th><td><strong>{fmt(method.valueCm, 1)} cm</strong> = {fmt(d.comDelta, 4)} / {fmt(d.pxPerCm, 6)}</td></tr>
              {typeof method.comHeightAboveGroundCm === "number" ? (
                <tr><th>CoM sobre suelo en APEX</th><td>{fmt(method.comHeightAboveGroundCm, 1)} cm</td></tr>
              ) : null}
              {typeof method.dipDepthCm === "number" ? (
                <tr><th>Profundidad DIP</th><td>{fmt(method.dipDepthCm, 1)} cm</td></tr>
              ) : null}
              {typeof method.takeoffEfficiency === "number" ? (
                <tr><th>Eficiencia despegue</th><td>{fmt(method.takeoffEfficiency, 2)}</td></tr>
              ) : null}
            </tbody>
          </table>
        </>
      ) : (
        <p className="jhdm-no-debug">No hay datos de debug disponibles — el método no llegó a calcular.</p>
      )}
    </div>
  );
}

// ── Rim Reference Tab ──────────────────────────────────────────────────────────
function RimReferenceTab({ method }: { method: ReferenceJumpHeightMethodPreview }) {
  const d = method.debug?.rimReference;
  return (
    <div className="jhdm-tab-body">
      <div className="jhdm-result-row">
        <span className="biomechanics-badge jhdm-status-badge" data-status={method.status}>
          {method.status === "OK" ? `✓ ${fmt(method.valueCm, 1)} cm` : method.status}
        </span>
        {method.notes ? <p className="jhdm-notes">{method.notes}</p> : null}
      </div>
      {d ? (
        <>
          <RimPerspectiveViz debug={d} valueCm={method.valueCm} />
          <table className="jhdm-table">
            <tbody>
              <tr><th>Frame APEX</th><td>{d.apexFrameIndex + 1}</td></tr>
              <tr><th>X atleta (center body)</th><td>{fmt(d.athleteX, 4)}</td></tr>
              <tr><th>Y cabeza en APEX</th><td>{fmt(d.headY, 4)}</td></tr>
              <tr><th>Y talón en APEX</th><td>{fmt(d.heelY, 4)}</td></tr>
              <tr><th>Extremo izq. aro (xLeft, yLeft)</th><td>({fmt(d.rimXLeft, 4)}, {fmt(d.rimYLeft, 4)})</td></tr>
              <tr><th>Extremo der. aro (xRight, yRight)</th><td>({fmt(d.rimXRight, 4)}, {fmt(d.rimYRight, 4)})</td></tr>
              <tr><th>Y línea 305cm @ X atleta</th><td>{fmt(d.yRim305AtAthlete, 4)}</td></tr>
              <tr><th>px/cm (estatura atleta)</th><td>{fmt(d.pxPerCm, 6)}</td></tr>
              <tr><th>Borrado cabeza/aro</th><td>{fmt(d.rimClearanceCm, 2)} cm {typeof d.rimClearanceCm === "number" ? (d.rimClearanceCm >= 0 ? "(sobre el aro)" : "(bajo el aro)") : ""}</td></tr>
              <tr><th><strong>Resultado</strong></th><td><strong>{fmt(method.valueCm, 1)} cm</strong> = (305 − estatura) + borrado</td></tr>
            </tbody>
          </table>
        </>
      ) : (
        <p className="jhdm-no-debug">No hay datos de debug disponibles — el método no tiene dos extremos del aro (análisis antiguo) o no llegó a calcular.</p>
      )}
    </div>
  );
}

function RimPerspectiveViz({
  debug: d,
  valueCm,
}: {
  debug: NonNullable<ReferenceJumpHeightMethodDebug["rimReference"]>;
  valueCm: number | null;
}) {
  const W = 560;
  const H = 320;
  const px = (x: number | null) => (x ?? 0) * W;
  const py = (y: number | null) => (y ?? 0) * H;

  const hasRim = d.rimXLeft !== null && d.rimXRight !== null;
  const hasAthlete = d.athleteX !== null && d.headY !== null && d.heelY !== null;
  const has305 = d.yRim305AtAthlete !== null && d.athleteX !== null;

  return (
    <div className="jhdm-rim-viz">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="jhdm-rim-svg">
        {/* Body skeleton at APEX */}
        {d.apexLandmarks.map((lm, i) =>
          lm ? <circle key={i} cx={px(lm.x)} cy={py(lm.y)} r={2.5} fill="#60a5fa" opacity={0.5} /> : null,
        )}

        {/* Athlete heel-to-head vertical */}
        {hasAthlete && (
          <>
            <line
              x1={px(d.athleteX)} y1={py(d.heelY)}
              x2={px(d.athleteX)} y2={py(d.headY)}
              stroke="#60a5fa" strokeWidth={2.5}
            />
            {/* Height bracket */}
            <text x={px(d.athleteX) + 6} y={(py(d.heelY) + py(d.headY)) / 2} fill="#60a5fa" fontSize={11} dominantBaseline="middle">
              estatura
            </text>
            {/* Head dot */}
            <circle cx={px(d.athleteX)} cy={py(d.headY)} r={6} fill="#60a5fa" />
            {/* Heel dot */}
            <circle cx={px(d.athleteX)} cy={py(d.heelY)} r={5} fill="#22c55e" />
          </>
        )}

        {/* Rim left vertical */}
        {hasRim && (
          <>
            <line
              x1={px(d.rimXLeft)} y1={py(d.rimYLeft)}
              x2={px(d.rimXLeft)} y2={H}
              stroke="#fb923c" strokeWidth={2} strokeDasharray="5 4"
            />
            <circle cx={px(d.rimXLeft)} cy={py(d.rimYLeft)} r={6} fill="#fb923c" />
            <text x={px(d.rimXLeft)} y={py(d.rimYLeft) - 8} fill="#fb923c" fontSize={10} textAnchor="middle">base</text>

            {/* Rim right vertical */}
            <line
              x1={px(d.rimXRight)} y1={py(d.rimYRight)}
              x2={px(d.rimXRight)} y2={H}
              stroke="#fb923c" strokeWidth={2} strokeDasharray="5 4"
            />
            <circle cx={px(d.rimXRight)} cy={py(d.rimYRight)} r={6} fill="#fb923c" />
            <text x={px(d.rimXRight)} y={py(d.rimYRight) - 8} fill="#fb923c" fontSize={10} textAnchor="middle">punta</text>

            {/* 305cm perspective line extended */}
            {(() => {
              const xL = d.rimXLeft ?? 0;
              const yL = d.rimYLeft ?? 0;
              const xR = d.rimXRight ?? 0;
              const yR = d.rimYRight ?? 0;
              const span = xR - xL;
              if (Math.abs(span) < 0.001) return null;
              const tLeft = (0 - xL) / span;
              const tRight = (1 - xL) / span;
              const extY1 = yL + tLeft * (yR - yL);
              const extY2 = yL + tRight * (yR - yL);
              return (
                <line
                  x1={0} y1={py(extY1)}
                  x2={W} y2={py(extY2)}
                  stroke="#fb923c" strokeWidth={1.5} opacity={0.5}
                />
              );
            })()}

            {/* 305cm label on the line */}
            <text
              x={px((d.rimXLeft ?? 0) + ((d.rimXRight ?? 1) - (d.rimXLeft ?? 0)) / 2)}
              y={py(((d.rimYLeft ?? 0) + (d.rimYRight ?? 0)) / 2) - 10}
              fill="#fb923c" fontSize={11} textAnchor="middle"
            >
              305 cm
            </text>
          </>
        )}

        {/* Intersection: 305cm line at athlete X */}
        {has305 && hasAthlete && (
          <>
            <circle cx={px(d.athleteX)} cy={py(d.yRim305AtAthlete)} r={7} fill="#fb923c" stroke="#fff" strokeWidth={1.5} />
            {/* Clearance segment: head → 305 line */}
            <line
              x1={px(d.athleteX)} y1={py(d.headY)}
              x2={px(d.athleteX)} y2={py(d.yRim305AtAthlete)}
              stroke={typeof d.rimClearanceCm === "number" && d.rimClearanceCm >= 0 ? "#4ade80" : "#f87171"}
              strokeWidth={3}
              strokeDasharray="4 2"
            />
            <text
              x={px(d.athleteX) + 8}
              y={(py(d.headY) + py(d.yRim305AtAthlete)) / 2}
              fill={typeof d.rimClearanceCm === "number" && d.rimClearanceCm >= 0 ? "#4ade80" : "#f87171"}
              fontSize={11}
              dominantBaseline="middle"
            >
              {fmt(d.rimClearanceCm, 1)} cm
            </text>
          </>
        )}

        {/* Legend */}
        <g transform={`translate(8, ${H - 36})`}>
          <circle cx={5} cy={5} r={4} fill="#60a5fa" />
          <text x={14} y={9} fill="#60a5fa" fontSize={10}>Atleta (APEX)</text>
          <circle cx={5} cy={18} r={4} fill="#fb923c" />
          <text x={14} y={22} fill="#fb923c" fontSize={10}>Aro 305 cm</text>
          <circle cx={100} cy={5} r={4} fill="#22c55e" />
          <text x={109} y={9} fill="#22c55e" fontSize={10}>Talón</text>
        </g>
      </svg>
      {valueCm !== null ? (
        <p className="jhdm-rim-result">
          Resultado: <strong>{fmt(valueCm, 1)} cm</strong> = (305 − estatura) + {fmt(d.rimClearanceCm, 1)} cm borrado
        </p>
      ) : null}
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export function JumpHeightDebugModal({ jumpHeight, onClose }: Props) {
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
            <p className="eyebrow">Diagnóstico</p>
            <h2>Métodos de altura del salto</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* Consensus summary */}
        <div className="jhdm-consensus-bar">
          <span className="biomechanics-badge biomechanics-preview-status">
            {jumpHeight.consensusValueCm !== null
              ? `Consenso: ${fmt(jumpHeight.consensusValueCm, 1)} cm`
              : "Sin consenso"}
          </span>
          {typeof jumpHeight.disagreementCm === "number" && (
            <span className="biomechanics-badge">Diferencia: {fmt(jumpHeight.disagreementCm, 1)} cm</span>
          )}
          {typeof jumpHeight.playbackSpeedRatio === "number" && (
            <span className="biomechanics-badge">Ratio: {jumpHeight.playbackSpeedRatio.toFixed(2)}</span>
          )}
          {jumpHeight.notes ? <p className="jhdm-notes">{jumpHeight.notes}</p> : null}
        </div>

        {/* Tabs */}
        <div className="jhdm-tabs">
          {(["FLIGHT_TIME", "CENTER_OF_MASS", "RIM_REFERENCE"] as Tab[]).map((tab) => {
            const m = methodByTab[tab];
            return (
              <button
                key={tab}
                type="button"
                className={`jhdm-tab-btn${activeTab === tab ? " active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
                <span className={`jhdm-tab-status-dot`} data-status={m?.status ?? "PENDING"} />
                {m?.status === "OK" && typeof m.valueCm === "number" ? (
                  <span className="jhdm-tab-value">{fmt(m.valueCm, 1)} cm</span>
                ) : (
                  <span className="jhdm-tab-value jhdm-tab-value-fail">{m?.status ?? "—"}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="jhdm-tab-content">
          {activeMethod ? (
            <>
              {activeTab === "FLIGHT_TIME" && <FlightTimeTab method={activeMethod} />}
              {activeTab === "CENTER_OF_MASS" && <CenterOfMassTab method={activeMethod} />}
              {activeTab === "RIM_REFERENCE" && <RimReferenceTab method={activeMethod} />}
            </>
          ) : (
            <p className="jhdm-no-debug">Este método no está presente.</p>
          )}
        </div>
      </div>
    </div>
  );
}

import type { RefObject, SyntheticEvent } from "react";

import {
  BiomechanicsStage,
  type BiomechanicsConnectionSegment,
  type BiomechanicsLandmarkNode,
  type BiomechanicsTimelineMarker,
} from "./BiomechanicsStage";

type VisualMode = "inspect" | "points" | "angles" | "events";

interface ModeOption {
  mode: VisualMode;
  label: string;
}

interface FocusPointChip {
  id: string;
  label: string;
  landmark: string;
  isActive: boolean;
}

interface EventTypeOption {
  value: string;
  label: string;
}

interface EventChip {
  id: string;
  label: string;
  isActive: boolean;
}

interface BiomechanicsVisualEditorProps {
  mode: VisualMode;
  modeOptions: ModeOption[];
  inspectorTitle: string;
  inspectorDescription: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  currentTimestampMs: number;
  frameIndex: number;
  frameCount: number;
  frameLabel: string;
  connectionSegments: BiomechanicsConnectionSegment[];
  landmarkNodes: BiomechanicsLandmarkNode[];
  markers: BiomechanicsTimelineMarker[];
  focusPointChips: FocusPointChip[];
  angleSelectionLabels: string[];
  anglePreviewLabel: string;
  canCreateAngle: boolean;
  canClearAngleSelection: boolean;
  eventTypeOptions: EventTypeOption[];
  pendingEventType: string;
  eventChips: EventChip[];
  inspectSummaryChips: string[];
  onModeChange: (mode: VisualMode) => void;
  onVideoLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => void;
  onLandmarkHover: (landmark: string | null) => void;
  onLandmarkSelect: (landmark: string) => void;
  onPreviousFrame: () => void;
  onNextFrame: () => void;
  onFrameChange: (frameIndex: number) => void;
  onMarkerSelect: (markerId: string) => void;
  onFocusPointChipSelect: (pointId: string, landmark: string) => void;
  onCreateAngle: () => void;
  onClearAngleSelection: () => void;
  onPendingEventTypeChange: (eventType: string) => void;
  onCreateEvent: () => void;
  onEventChipSelect: (eventId: string) => void;
}

export function BiomechanicsVisualEditor({
  mode,
  modeOptions,
  inspectorTitle,
  inspectorDescription,
  videoRef,
  videoUrl,
  currentTimestampMs,
  frameIndex,
  frameCount,
  frameLabel,
  connectionSegments,
  landmarkNodes,
  markers,
  focusPointChips,
  angleSelectionLabels,
  anglePreviewLabel,
  canCreateAngle,
  canClearAngleSelection,
  eventTypeOptions,
  pendingEventType,
  eventChips,
  inspectSummaryChips,
  onModeChange,
  onVideoLoadedMetadata,
  onLandmarkHover,
  onLandmarkSelect,
  onPreviousFrame,
  onNextFrame,
  onFrameChange,
  onMarkerSelect,
  onFocusPointChipSelect,
  onCreateAngle,
  onClearAngleSelection,
  onPendingEventTypeChange,
  onCreateEvent,
  onEventChipSelect,
}: BiomechanicsVisualEditorProps) {
  return (
    <div className="detail-card program-card biomechanics-visual-shell">
      <div className="section-header compact-header">
        <div>
          <p className="eyebrow">Editor visual</p>
          <h3>Referencia profesional interactiva</h3>
        </div>
        <div className="biomechanics-mode-row">
          {modeOptions.map((option) => (
            <button
              key={option.mode}
              type="button"
              className={`ghost-button${mode === option.mode ? " active" : ""}`}
              onClick={() => onModeChange(option.mode)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="biomechanics-visual-layout">
        <BiomechanicsStage
          videoRef={videoRef}
          videoUrl={videoUrl}
          currentTimestampMs={currentTimestampMs}
          frameIndex={frameIndex}
          frameCount={frameCount}
          frameLabel={frameLabel}
          connectionSegments={connectionSegments}
          landmarkNodes={landmarkNodes}
          markers={markers}
          onVideoLoadedMetadata={onVideoLoadedMetadata}
          onLandmarkHover={onLandmarkHover}
          onLandmarkSelect={onLandmarkSelect}
          onPreviousFrame={onPreviousFrame}
          onNextFrame={onNextFrame}
          onFrameChange={onFrameChange}
          onMarkerSelect={onMarkerSelect}
        />

        <div className="biomechanics-inspector detail-card program-card">
          <strong>{inspectorTitle}</strong>
          <p>{inspectorDescription}</p>

          {mode === "points" ? (
            <>
              <span className="biomechanics-helper-copy">Landmarks destacados actualmente como puntos clave</span>
              <div className="biomechanics-chip-grid">
                {focusPointChips.length ? (
                  focusPointChips.map((point) => (
                    <button
                      key={point.id}
                      type="button"
                      className={`session-chip${point.isActive ? " active" : ""}`}
                      onClick={() => onFocusPointChipSelect(point.id, point.landmark)}
                    >
                      {point.label}
                    </button>
                  ))
                ) : (
                  <span className="helper-text">Todavía no has marcado puntos desde el overlay.</span>
                )}
              </div>
            </>
          ) : null}

          {mode === "angles" ? (
            <>
              <span className="biomechanics-helper-copy">Secuencia seleccionada</span>
              <div className="biomechanics-chip-grid">
                {angleSelectionLabels.length ? (
                  angleSelectionLabels.map((label) => (
                    <span key={label} className="session-chip active">{label}</span>
                  ))
                ) : (
                  <span className="helper-text">Selecciona tres landmarks para generar un ángulo.</span>
                )}
              </div>
              <span className="session-chip">{anglePreviewLabel}</span>
              <div className="chip-row">
                <button type="button" className="primary-button" onClick={onCreateAngle} disabled={!canCreateAngle}>
                  Crear ángulo desde selección
                </button>
                <button type="button" className="ghost-button" onClick={onClearAngleSelection} disabled={!canClearAngleSelection}>
                  Limpiar selección
                </button>
              </div>
            </>
          ) : null}

          {mode === "events" ? (
            <>
              <label>
                Tipo de evento a marcar
                <select value={pendingEventType} onChange={(event) => onPendingEventTypeChange(event.target.value)}>
                  {eventTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="primary-button" onClick={onCreateEvent}>
                Marcar evento en este frame
              </button>
              <div className="biomechanics-chip-grid">
                {eventChips.length ? (
                  eventChips.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={`session-chip${event.isActive ? " active" : ""}`}
                      onClick={() => onEventChipSelect(event.id)}
                    >
                      {event.label}
                    </button>
                  ))
                ) : (
                  <span className="helper-text">Todavía no hay eventos marcados en la timeline.</span>
                )}
              </div>
            </>
          ) : null}

          {mode === "inspect" ? (
            <>
              <span className="biomechanics-helper-copy">Resumen del frame actual</span>
              <div className="biomechanics-chip-grid">
                {inspectSummaryChips.map((chip) => (
                  <span key={chip} className="session-chip">{chip}</span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
import type { RefObject, SyntheticEvent } from "react";

export interface BiomechanicsConnectionSegment {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  highlight?: boolean;
}

export interface BiomechanicsLandmarkNode {
  landmark: string;
  x: number;
  y: number;
  isFocused: boolean;
  isPending: boolean;
  isSelected: boolean;
  isHovered: boolean;
}

export interface BiomechanicsTimelineMarker {
  id: string;
  label: string;
  title: string;
  leftPercent: number;
  isActive: boolean;
}

export interface BiomechanicsAngleOverlay {
  arcPath: string;
  bandPath?: string | null;
  labelX: number;
  labelY: number;
  label: string;
  rangeLabel?: string | null;
  rangeLabelX?: number;
  rangeLabelY?: number;
}

export interface BiomechanicsTrajectoryOverlay {
  path: string;
}

interface BiomechanicsStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  currentTimestampMs: number;
  frameIndex: number;
  frameCount: number;
  frameLabel: string;
  connectionSegments: BiomechanicsConnectionSegment[];
  landmarkNodes: BiomechanicsLandmarkNode[];
  markers: BiomechanicsTimelineMarker[];
  angleOverlay: BiomechanicsAngleOverlay | null;
  trajectoryOverlay: BiomechanicsTrajectoryOverlay | null;
  onVideoLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => void;
  onVideoPlay: () => void;
  onVideoPause: () => void;
  onVideoTimeUpdate: (currentTimeSeconds: number) => void;
  onLandmarkHover: (landmark: string | null) => void;
  onLandmarkSelect: (landmark: string) => void;
  onPreviousFrame: () => void;
  onNextFrame: () => void;
  onFrameChange: (frameIndex: number) => void;
  onMarkerSelect: (markerId: string) => void;
}

export function BiomechanicsStage({
  videoRef,
  videoUrl,
  currentTimestampMs,
  frameIndex,
  frameCount,
  frameLabel,
  connectionSegments,
  landmarkNodes,
  markers,
  angleOverlay,
  trajectoryOverlay,
  onVideoLoadedMetadata,
  onVideoPlay,
  onVideoPause,
  onVideoTimeUpdate,
  onLandmarkHover,
  onLandmarkSelect,
  onPreviousFrame,
  onNextFrame,
  onFrameChange,
  onMarkerSelect,
}: BiomechanicsStageProps) {
  return (
    <div className="biomechanics-stage-column">
      <div className="biomechanics-stage-shell">
        <div className="biomechanics-stage">
          <video
            ref={videoRef}
            className="biomechanics-reference-video"
            src={videoUrl}
            preload="metadata"
            controls
            onLoadedMetadata={onVideoLoadedMetadata}
            onPlay={onVideoPlay}
            onPause={onVideoPause}
            onTimeUpdate={(event) => onVideoTimeUpdate(event.currentTarget.currentTime)}
          />
          <svg className="biomechanics-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {trajectoryOverlay ? (
              <>
                <path d={trajectoryOverlay.path} className="biomechanics-trajectory-shadow" />
                <path d={trajectoryOverlay.path} className="biomechanics-trajectory-line" />
              </>
            ) : null}
            {angleOverlay?.bandPath ? <path d={angleOverlay.bandPath} className="biomechanics-angle-range" /> : null}
            {connectionSegments.map((segment) => (
              <line
                key={segment.key}
                x1={segment.x1 * 1000}
                y1={segment.y1 * 1000}
                x2={segment.x2 * 1000}
                y2={segment.y2 * 1000}
                className={`biomechanics-connection${segment.highlight ? " highlight" : ""}`}
              />
            ))}
            {landmarkNodes.map((point) => (
              <circle
                key={point.landmark}
                cx={point.x * 1000}
                cy={point.y * 1000}
                r={point.isHovered ? 18 : 12}
                className={`biomechanics-landmark${point.isFocused ? " focus" : ""}${point.isPending ? " pending" : ""}${point.isSelected ? " selected" : ""}${point.isHovered ? " hovered" : ""}`}
                onMouseEnter={() => onLandmarkHover(point.landmark)}
                onMouseLeave={() => onLandmarkHover(null)}
                onClick={() => onLandmarkSelect(point.landmark)}
              />
            ))}
            {angleOverlay ? (
              <>
                <path d={angleOverlay.arcPath} className="biomechanics-angle-arc" />
                <text
                  x={angleOverlay.labelX}
                  y={angleOverlay.labelY}
                  className="biomechanics-angle-label"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {angleOverlay.label}
                </text>
                {angleOverlay.rangeLabel && typeof angleOverlay.rangeLabelX === "number" && typeof angleOverlay.rangeLabelY === "number" ? (
                  <text
                    x={angleOverlay.rangeLabelX}
                    y={angleOverlay.rangeLabelY}
                    className="biomechanics-angle-range-label"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {angleOverlay.rangeLabel}
                  </text>
                ) : null}
              </>
            ) : null}
          </svg>
        </div>
      </div>

      <div className="biomechanics-frame-toolbar">
        <button type="button" className="ghost-button" onClick={onPreviousFrame} disabled={frameIndex <= 0}>
          ← Frame previo
        </button>
        <span className="session-chip">{frameLabel}</span>
        <button type="button" className="ghost-button" onClick={onNextFrame} disabled={frameIndex >= Math.max(frameCount - 1, 0)}>
          Frame siguiente →
        </button>
      </div>

      <div className="biomechanics-timeline-shell">
        <input
          className="biomechanics-frame-slider"
          type="range"
          min={0}
          max={Math.max(frameCount - 1, 0)}
          value={frameIndex}
          onChange={(event) => onFrameChange(Number(event.target.value))}
        />
        <div className="biomechanics-timeline-track">
          {markers.map((marker) => (
            <button
              key={marker.id}
              type="button"
              className={`biomechanics-timeline-marker${marker.isActive ? " active" : ""}`}
              style={{ left: `${marker.leftPercent}%` }}
              onClick={() => onMarkerSelect(marker.id)}
              title={marker.title}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
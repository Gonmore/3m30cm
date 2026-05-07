import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Image as ExpoImage } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ResizeMode, Video } from "expo-av";

import { useTheme } from "@mobile/components/ThemeContext";
import { rewriteLocalAssetUrl } from "@mobile/components/runtimeConfig";
import { R, S } from "@mobile/components/tokens";
import TechniqueVideoPoseAnalyzer from "../technique/TechniqueVideoPoseAnalyzer";
import {
  analyzeAthleteTechniqueVideo,
  callBiomechanicsAnalyze,
  type AthleteRimAnnotation,
  type AthleteTechniqueAutoAnalysis,
  type MobileTechniqueBiomechanicsConfig,
  type ServerBiomechanicsResult,
} from "../technique/athleteTechniqueAnalysis";
import type { TechniqueProLandmarks } from "../../../web/src/techniquePoseExtraction";

interface TechniqueMediaAsset {
  id: string;
  kind: "IMAGE" | "GIF" | "VIDEO";
  url: string | null;
  title: string | null;
  isPrimary: boolean;
}

interface TechniqueMetric {
  id: string;
  label: string;
  value: number;
  unit: string | null;
  notes: string | null;
  recordedAt: string;
  isBaseline: boolean;
  completedSessionsAtMeasurement?: number | null;
  measurementDefinitionId?: string | null;
}

interface TechniqueMeasurementDefinition {
  id: string;
  label: string;
  instructions: string | null;
  allowedUnits: unknown;
  orderIndex: number;
}

interface TechniqueEntry {
  id: string;
  title: string;
  description: string | null;
  measurementInstructions: string | null;
  proVideoUrl?: string | null;
  proLandmarks?: TechniqueProLandmarks | null;
  biomechanicsConfig?: MobileTechniqueBiomechanicsConfig | null;
  comparisonEnabled: boolean;
  mediaAssets: TechniqueMediaAsset[];
  measurementDefinitions: TechniqueMeasurementDefinition[];
  metrics: TechniqueMetric[];
}

interface TechniqueData {
  programId: string;
  programName: string;
  template: {
    id: string;
    code: string;
    name: string;
    techniqueTitle: string | null;
    techniqueDescription: string | null;
    mediaAssets: TechniqueMediaAsset[];
    techniques?: TechniqueEntry[];
  };
  metrics: TechniqueMetric[];
}

type TechniqueAngleComparison = AthleteTechniqueAutoAnalysis["angleComparisons"][number];

interface TecnicaScreenProps {
  technique: TechniqueData | null;
  techniques: TechniqueEntry[];
  athleteHeightCm: number | null;
  selectedTechniqueId: string | null;
  loading: boolean;
  submitting: boolean;
  accessToken?: string | null;
  apiBaseUrl?: string | null;
  onSelectTechnique: (techniqueId: string) => void;
  onRefresh: () => void;
  onSubmitMetric: (payload: {
    techniqueId: string;
    measurementDefinitionId?: string;
    label?: string;
    value: number;
    unit?: string;
    notes?: string;
    isBaseline: boolean;
  }) => void;
}

function parseAllowedUnits(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function formatMetricValue(metric: TechniqueMetric) {
  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function formatMetricMeta(metric: TechniqueMetric) {
  const date = new Date(metric.recordedAt).toLocaleDateString();
  const completedSessions = metric.completedSessionsAtMeasurement ?? 0;
  return `${date} · ${completedSessions} sesiones`;
}

function buildMetricComparisons(metrics: TechniqueMetric[]) {
  const groups = new Map<string, TechniqueMetric[]>();

  for (const metric of metrics) {
    const key = `${metric.label.trim().toLowerCase()}::${metric.unit ?? ""}`;
    const group = groups.get(key) ?? [];
    group.push(metric);
    groups.set(key, group);
  }

  return Array.from(groups.entries())
    .map(([key, entries]) => {
      const sortedEntries = [...entries].sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime());
      const baseline = sortedEntries.find((entry) => entry.isBaseline) ?? sortedEntries[0] ?? null;
      const latest = sortedEntries[sortedEntries.length - 1] ?? null;
      const delta = baseline && latest ? Math.round((latest.value - baseline.value) * 10) / 10 : null;

      return {
        key,
        label: latest?.label ?? baseline?.label ?? "Métrica",
        unit: latest?.unit ?? baseline?.unit ?? null,
        baseline,
        latest,
        delta,
      };
    })
    .filter((entry) => entry.latest)
    .sort((left, right) => left.label.localeCompare(right.label, "es", { sensitivity: "base" }));
}

function formatAutoEventLabel(eventType: string) {
  return eventType.replace(/_/g, " ").toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
}

function formatMeasurementStatus(status: string) {
  switch (status) {
    case "OK":
      return "OK";
    case "METHOD_DISAGREEMENT":
      return "Sin consenso";
    case "INVALID_MOTION_PROFILE":
      return "Velocidad inválida";
    case "MISSING_EVENT":
      return "Faltan eventos";
    case "MISSING_LANDMARK":
      return "Faltan landmarks";
    case "LOW_CONFIDENCE":
      return "Baja confianza";
    case "OUT_OF_RANGE":
      return "Fuera de rango";
    default:
      return "Pendiente";
  }
}

function formatJumpMethodLabel(method: string) {
  return method === "CENTER_OF_MASS" ? "Centro de masas" : "Tiempo de vuelo";
}

function formatComparisonOrientationLabel(orientation: "NORMAL" | "MIRRORED") {
  return orientation === "MIRRORED" ? "Pierna contraria" : "Misma pierna";
}

function formatSignedDegrees(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}°`;
}

function formatSignedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(0)}%`;
}

function clampPercent(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

function clampNormalized(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function angleToPercent(angleDeg: number | null) {
  if (typeof angleDeg !== "number" || Number.isNaN(angleDeg)) {
    return 0;
  }

  return clampPercent((angleDeg / 180) * 100);
}

function formatExpectedAngleRange(minDeg: number | null, maxDeg: number | null) {
  if (typeof minDeg === "number" && typeof maxDeg === "number") {
    return `${minDeg.toFixed(0)}° - ${maxDeg.toFixed(0)}°`;
  }

  if (typeof minDeg === "number") {
    return `>= ${minDeg.toFixed(0)}°`;
  }

  if (typeof maxDeg === "number") {
    return `<= ${maxDeg.toFixed(0)}°`;
  }

  return "Sin rango objetivo";
}

function buildUserAngleHighlights(autoAnalysis: AthleteTechniqueAutoAnalysis | null) {
  if (!autoAnalysis?.angleComparisons.length) {
    return [] as string[];
  }

  const majorDifferences = [...autoAnalysis.angleComparisons]
    .sort((left, right) => Math.abs(right.deltaDeg) - Math.abs(left.deltaDeg))
    .filter((comparison) => Math.abs(comparison.deltaDeg) >= 6)
    .slice(0, 3)
    .map((comparison) => {
      const direction = comparison.deltaDeg >= 0 ? "más abierto" : "más cerrado";
      const pct = typeof comparison.deltaPercent === "number" ? ` (${formatSignedPercent(comparison.deltaPercent)})` : "";
      return `${formatAutoEventLabel(comparison.eventType)}: ${comparison.label} ${direction} de la referencia por ${Math.abs(comparison.deltaDeg).toFixed(1)}°${pct}.`;
    });

  if (majorDifferences.length) {
    return majorDifferences;
  }

  return ["Los ángulos principales quedaron cerca de la referencia técnica."];
}

function formatTimestampMs(timestampMs: number | null | undefined) {
  if (typeof timestampMs !== "number" || Number.isNaN(timestampMs)) {
    return "--";
  }

  return `${(timestampMs / 1000).toFixed(2)} s`;
}

function buildAnalysisJsonPreview(autoAnalysis: AthleteTechniqueAutoAnalysis | null) {
  if (!autoAnalysis) {
    return "";
  }

  return JSON.stringify({
    ...autoAnalysis.analysisJson,
    poseSequence: {
      frameCount: autoAnalysis.landmarks.frameCount,
      fps: autoAnalysis.landmarks.fps,
      durationMs: autoAnalysis.landmarks.durationMs,
    },
  }, null, 2);
}

function pickFileExtension(fileName: string | null | undefined, uri: string) {
  const source = fileName || uri;
  const match = source.match(/\.([a-z0-9]{2,5})(?:[?#].*)?$/i);
  return match?.[1]?.toLowerCase() ?? "mp4";
}

interface PickedVideoAsset {
  uri: string;
  fileName?: string | null;
}

function buildAnalysisVideoPath(fileName: string | null | undefined, uri: string) {
  if (!FileSystem.cacheDirectory) {
    throw new Error("No se pudo acceder al cache del dispositivo para analizar el video.");
  }

  return `${FileSystem.cacheDirectory}jump-technique-analysis-${Date.now()}.${pickFileExtension(fileName, uri)}`;
}

function findJumpMeasurementDefinition(definitions: TechniqueMeasurementDefinition[]) {
  return definitions.find((definition) => {
    const label = definition.label.toLowerCase();
    const units = parseAllowedUnits(definition.allowedUnits);
    return label.includes("salto") || label.includes("jump") || units.includes("cm");
  }) ?? definitions[0] ?? null;
}

export default function TecnicaScreen({
  technique,
  techniques,
  athleteHeightCm,
  selectedTechniqueId,
  loading,
  submitting,
  accessToken,
  apiBaseUrl,
  onSelectTechnique,
  onRefresh,
  onSubmitMetric,
}: TecnicaScreenProps) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const selectedTechnique = useMemo(
    () => techniques.find((entry) => entry.id === selectedTechniqueId) ?? techniques[0] ?? null,
    [selectedTechniqueId, techniques],
  );
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [isBaseline, setIsBaseline] = useState(false);
  const [athleteVideoUri, setAthleteVideoUri] = useState<string | null>(null);
  const [athleteVideoName, setAthleteVideoName] = useState<string | null>(null);
  const [analysisRequestId, setAnalysisRequestId] = useState(0);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ processed: 0, total: 0 });
  const [analysisError, setAnalysisError] = useState("");
  const [autoAnalysis, setAutoAnalysis] = useState<AthleteTechniqueAutoAnalysis | null>(null);
  const [selectedVisualEventType, setSelectedVisualEventType] = useState<string | null>(null);
  const [showAnalysisJson, setShowAnalysisJson] = useState(false);
  const [showCorrectionsViewer, setShowCorrectionsViewer] = useState(false);
  const athleteVideoRef = useRef<Video | null>(null);
  // Rim annotation state
  const [pendingLandmarks, setPendingLandmarks] = useState<TechniqueProLandmarks | null>(null);
  const [showRimAnnotation, setShowRimAnnotation] = useState(false);
  const [rimAnnotation, setRimAnnotation] = useState<AthleteRimAnnotation | null>(null);
  const [rimPoint1, setRimPoint1] = useState<{ x: number; y: number } | null>(null);
  const [rimPoint2, setRimPoint2] = useState<{ x: number; y: number } | null>(null);
  const rimPreviewVideoRef = useRef<Video | null>(null);
  const [rimTapAreaSize, setRimTapAreaSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [serverAnalyzing, setServerAnalyzing] = useState(false);
  const [serverResult, setServerResult] = useState<ServerBiomechanicsResult | null>(null);
  const [serverError, setServerError] = useState("");

  const selectedMeasurement = useMemo(
    () => selectedTechnique?.measurementDefinitions.find((entry) => entry.id === selectedMeasurementId)
      ?? selectedTechnique?.measurementDefinitions[0]
      ?? null,
    [selectedMeasurementId, selectedTechnique],
  );

  const availableUnits = selectedMeasurement ? parseAllowedUnits(selectedMeasurement.allowedUnits) : [];
  const comparisons = selectedTechnique ? buildMetricComparisons(selectedTechnique.metrics) : [];
  const hasAutomaticAnalysisContract = Boolean(selectedTechnique?.biomechanicsConfig);
  const automaticJumpDefinition = useMemo(
    () => selectedTechnique ? findJumpMeasurementDefinition(selectedTechnique.measurementDefinitions) : null,
    [selectedTechnique],
  );
  const sortedJumpMethods = useMemo(() => {
    const methods = autoAnalysis?.measurements.jumpHeight?.methods ?? [];
    return [...methods].sort((left, right) => {
      if (left.method === right.method) {
        return 0;
      }

      return left.method === "CENTER_OF_MASS" ? -1 : 1;
    });
  }, [autoAnalysis?.measurements.jumpHeight?.methods]);
  const angleComparisonGroups = useMemo(() => {
    const groups = new Map<string, TechniqueAngleComparison[]>();

    for (const comparison of autoAnalysis?.angleComparisons ?? []) {
      const group = groups.get(comparison.eventType) ?? [];
      group.push(comparison);
      groups.set(comparison.eventType, group);
    }

    return Array.from(groups.entries()).map(([eventType, comparisons]) => ({
      eventType,
      comparisons: comparisons.sort((left, right) => Math.abs(right.deltaDeg) - Math.abs(left.deltaDeg)),
      averageDeltaDeg: comparisons.length
        ? comparisons.reduce((total, comparison) => total + Math.abs(comparison.deltaDeg), 0) / comparisons.length
        : 0,
    }));
  }, [autoAnalysis?.angleComparisons]);
  const userAngleHighlights = useMemo(() => buildUserAngleHighlights(autoAnalysis), [autoAnalysis]);
  const analysisJsonPreview = useMemo(() => buildAnalysisJsonPreview(autoAnalysis), [autoAnalysis]);
  const eventOverlayItems = useMemo(() => {
    if (!autoAnalysis) {
      return [] as Array<{
        eventType: string;
        label: string;
        frameIndex: number;
        timestampMs: number | null;
        positionPct: number;
        comparisons: TechniqueAngleComparison[];
      }>;
    }

    const durationMs = autoAnalysis.landmarks.durationMs || 1;

    return autoAnalysis.detectedEvents
      .map((event) => {
        const timestampMs = autoAnalysis.landmarks.frames[event.frameIndex]?.timestampMs ?? null;
        return {
          eventType: event.eventType,
          label: formatAutoEventLabel(event.eventType),
          frameIndex: event.frameIndex,
          timestampMs,
          positionPct: clampPercent(typeof timestampMs === "number" ? (timestampMs / durationMs) * 100 : 0),
          comparisons: autoAnalysis.angleComparisons.filter((comparison) => comparison.eventType === event.eventType),
        };
      })
      .sort((left, right) => left.frameIndex - right.frameIndex);
  }, [autoAnalysis]);
  const selectedEventOverlay = useMemo(() => {
    if (!eventOverlayItems.length) {
      return null;
    }

    return eventOverlayItems.find((item) => item.eventType === selectedVisualEventType) ?? eventOverlayItems[0] ?? null;
  }, [eventOverlayItems, selectedVisualEventType]);
  const rimPreviewEvent = useMemo(
    () => autoAnalysis?.detectedEvents.find((event) => event.eventType === "APEX") ?? autoAnalysis?.detectedEvents[0] ?? null,
    [autoAnalysis],
  );
  const rimPreviewFrameIndex = rimPreviewEvent?.frameIndex ?? 0;
  const rimPreviewTimestampMs = useMemo(() => {
    if (!autoAnalysis || !rimPreviewEvent) {
      return 0;
    }

    return autoAnalysis.landmarks.frames[rimPreviewEvent.frameIndex]?.timestampMs ?? 0;
  }, [autoAnalysis, rimPreviewEvent]);
  const rimPoint1Display = useMemo(() => {
    if (!rimPoint1) {
      return null;
    }

    return {
      left: rimPoint1.x * rimTapAreaSize.width,
      top: rimPoint1.y * rimTapAreaSize.height,
    };
  }, [rimPoint1, rimTapAreaSize.height, rimTapAreaSize.width]);
  const rimPoint2Display = useMemo(() => {
    if (!rimPoint2) {
      return null;
    }

    return {
      left: rimPoint2.x * rimTapAreaSize.width,
      top: rimPoint2.y * rimTapAreaSize.height,
    };
  }, [rimPoint2, rimTapAreaSize.height, rimTapAreaSize.width]);

  function normalizeRimTapPoint(locationX: number, locationY: number) {
    const areaWidth = rimTapAreaSize.width;
    const areaHeight = rimTapAreaSize.height;
    if (areaWidth <= 0 || areaHeight <= 0) {
      return null;
    }

    const x = clampNormalized(locationX / areaWidth);
    const y = clampNormalized(locationY / areaHeight);
    return { x, y };
  }

  useEffect(() => {
    setSelectedMeasurementId((current) => {
      if (!selectedTechnique) {
        return null;
      }

      if (current && selectedTechnique.measurementDefinitions.some((entry) => entry.id === current)) {
        return current;
      }

      return selectedTechnique.measurementDefinitions[0]?.id ?? null;
    });
  }, [selectedTechnique]);

  useEffect(() => {
    if (!selectedTechnique) {
      setUnit("");
      return;
    }

    const measurement = selectedTechnique.measurementDefinitions.find((entry) => entry.id === selectedMeasurementId)
      ?? selectedTechnique.measurementDefinitions[0]
      ?? null;

    setUnit((current) => current || (parseAllowedUnits(measurement?.allowedUnits)[0] ?? ""));
  }, [selectedMeasurementId, selectedTechnique]);

  useEffect(() => {
    setAthleteVideoUri(null);
    setAthleteVideoName(null);
    setAnalysisRequestId(0);
    setAnalysisBusy(false);
    setAnalysisProgress({ processed: 0, total: 0 });
    setAnalysisError("");
    setAutoAnalysis(null);
    setSelectedVisualEventType(null);
    setShowAnalysisJson(false);
    setShowCorrectionsViewer(false);
    setPendingLandmarks(null);
    setShowRimAnnotation(false);
    setRimAnnotation(null);
    setRimPoint1(null);
    setRimPoint2(null);
    setRimTapAreaSize({ width: 0, height: 0 });
    setServerAnalyzing(false);
    setServerResult(null);
    setServerError("");
  }, [selectedTechnique?.id]);

  useEffect(() => {
    if (!eventOverlayItems.length) {
      setSelectedVisualEventType(null);
      return;
    }

    setSelectedVisualEventType((current) => {
      if (current && eventOverlayItems.some((item) => item.eventType === current)) {
        return current;
      }

      const firstComparable = eventOverlayItems.find((item) => item.comparisons.length > 0);
      return firstComparable?.eventType ?? eventOverlayItems[0]?.eventType ?? null;
    });
  }, [eventOverlayItems]);

  useEffect(() => {
    if (!showRimAnnotation || !athleteVideoUri) {
      return;
    }

    void rimPreviewVideoRef.current?.setStatusAsync({
      shouldPlay: false,
      positionMillis: Math.max(rimPreviewTimestampMs - 120, 0),
    }).catch(() => {});
  }, [athleteVideoUri, rimPreviewTimestampMs, showRimAnnotation]);

  // Mantener la pantalla encendida durante la extracción de pose para que el
  // WebView no se pause cuando el dispositivo entra en modo de ahorro.
  useEffect(() => {
    if (analysisBusy) {
      void activateKeepAwakeAsync("pose-analysis");
    } else {
      void deactivateKeepAwake("pose-analysis");
    }
    return () => {
      void deactivateKeepAwake("pose-analysis");
    };
  }, [analysisBusy]);

  function handleSubmit() {
    if (!selectedTechnique) {
      return;
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      return;
    }

    onSubmitMetric({
      techniqueId: selectedTechnique.id,
      measurementDefinitionId: selectedMeasurement?.id,
      label: selectedMeasurement?.label,
      value: parsedValue,
      unit: unit.trim() || undefined,
      notes: notes.trim() || undefined,
      isBaseline,
    });

    setValue("");
    setNotes("");
    setIsBaseline(false);
  }

  async function prepareAthleteVideoAsset(asset: PickedVideoAsset) {
    if (!asset.uri) {
      throw new Error("No se recibió un video válido para analizar.");
    }

    const targetPath = buildAnalysisVideoPath(asset.fileName, asset.uri);
    await FileSystem.copyAsync({ from: asset.uri, to: targetPath });

    setAthleteVideoUri(targetPath);
    setAthleteVideoName(asset.fileName ?? `video-${Date.now()}.mp4`);
    setAnalysisProgress({ processed: 0, total: 0 });
    setAutoAnalysis(null);
    setAnalysisBusy(true);
    setAnalysisRequestId((current) => current + 1);
  }

  async function handlePickAthleteVideo() {
    if (!selectedTechnique) {
      return;
    }

    try {
      setAnalysisError("");

      const result = await DocumentPicker.getDocumentAsync({
        type: "video/*",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }

      await prepareAthleteVideoAsset({
        uri: result.assets[0].uri,
        fileName: result.assets[0].name,
      });
    } catch (error) {
      setAnalysisBusy(false);
      setAnalysisError(error instanceof Error ? error.message : "No se pudo preparar el video del atleta.");
    }
  }

  async function handleCaptureAthleteVideo() {
    if (!selectedTechnique) {
      return;
    }

    try {
      setAnalysisError("");

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Hace falta permiso de cámara para grabar el video del atleta.");
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }

      await prepareAthleteVideoAsset(result.assets[0]);
    } catch (error) {
      setAnalysisBusy(false);
      setAnalysisError(error instanceof Error ? error.message : "No se pudo grabar el video del atleta.");
    }
  }

  function handlePoseAnalysisResult(landmarks: TechniqueProLandmarks) {
    if (!selectedTechnique) {
      setAnalysisBusy(false);
      setAnalysisError("No hay técnica seleccionada para comparar el video del atleta.");
      return;
    }

    try {
      const analysis = analyzeAthleteTechniqueVideo({
        landmarks,
        biomechanicsConfig: selectedTechnique.biomechanicsConfig,
        athleteHeightCm,
        referenceLandmarks: selectedTechnique.proLandmarks ?? null,
      });

      setAutoAnalysis(analysis);
      setAnalysisError("");

      // Ofrecer anotación del aro siempre que haya un contrato biomécanico,
      // independientemente de si el admin configuró una referencia de aro.
      if (selectedTechnique.biomechanicsConfig) {
        setPendingLandmarks(landmarks);
        setRimPoint1(null);
        setRimPoint2(null);
        setShowRimAnnotation(true);
      }
    } catch (error) {
      setAutoAnalysis(null);
      setAnalysisError(error instanceof Error ? error.message : "No se pudo analizar la biomecánica del atleta.");
    } finally {
      setAnalysisBusy(false);
    }
  }

  async function runServerAnalysis(landmarks: TechniqueProLandmarks, annotation: AthleteRimAnnotation | null) {
    if (!selectedTechnique || !accessToken || !apiBaseUrl) {
      return;
    }
    const templateCode = technique?.template.code;
    if (!templateCode) {
      return;
    }
    setServerAnalyzing(true);
    setServerError("");
    try {
      const result = await callBiomechanicsAnalyze({
        apiBaseUrl,
        accessToken,
        templateCode,
        techniqueId: selectedTechnique.id,
        landmarks,
        rimAnnotation: annotation,
        config: selectedTechnique.biomechanicsConfig,
      });
      setServerResult(result);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Error del servidor al analizar biomecánica.");
    } finally {
      setServerAnalyzing(false);
    }
  }

  function handleConfirmRimAnnotation() {
    const lm = pendingLandmarks;
    if (!lm) {
      return;
    }
    const ann: AthleteRimAnnotation | null = rimPoint1 && rimPoint2
      ? {
          frameIndex: rimPreviewFrameIndex,
          xLeft: Math.min(rimPoint1.x, rimPoint2.x),
          yLeft: rimPoint1.x <= rimPoint2.x ? rimPoint1.y : rimPoint2.y,
          xRight: Math.max(rimPoint1.x, rimPoint2.x),
          yRight: rimPoint1.x <= rimPoint2.x ? rimPoint2.y : rimPoint1.y,
          annotatedAt: new Date().toISOString(),
        }
      : null;
    setRimAnnotation(ann);
    setShowRimAnnotation(false);
    void runServerAnalysis(lm, ann);
  }

  function handleSkipRimAnnotation() {
    const lm = pendingLandmarks;
    if (!lm) {
      return;
    }
    setShowRimAnnotation(false);
    void runServerAnalysis(lm, null);
  }

  function handleSaveAutomaticJumpMetric() {
    if (!selectedTechnique) {
      return;
    }

    const analysis = autoAnalysis;
    if (!analysis) {
      return;
    }

    const jumpHeightCm = analysis?.measurements.jumpHeight?.consensusValueCm;
    if (typeof jumpHeightCm !== "number") {
      return;
    }

    onSubmitMetric({
      techniqueId: selectedTechnique.id,
      measurementDefinitionId: automaticJumpDefinition?.id,
      label: automaticJumpDefinition?.label ?? "Altura de salto automática",
      value: jumpHeightCm,
      unit: "cm",
      notes: analysis.findings.join(" ") || undefined,
      isBaseline: false,
    });
  }

  function handleSelectVisualEvent(eventType: string) {
    setSelectedVisualEventType(eventType);

    const event = eventOverlayItems.find((item) => item.eventType === eventType);
    const targetMs = event?.timestampMs;
    if (typeof targetMs !== "number") {
      return;
    }

    void athleteVideoRef.current?.setPositionAsync(Math.max(targetMs - 120, 0)).catch(() => {});
  }

  if (!technique || !techniques.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyEmoji}>🎯</Text>
        <Text style={styles.emptyTitle}>Todavía no hay técnicas cargadas</Text>
        <Text style={styles.emptyBody}>Cuando tu programa tenga técnicas, videos y reglas de medición, los vas a ver acá.</Text>
        <Pressable style={styles.primaryButton} onPress={onRefresh}>
          <Text style={styles.primaryButtonText}>{loading ? "Actualizando..." : "Actualizar"}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Técnicas del programa</Text>
        <Text style={styles.heroTitle}>{technique.programName}</Text>
        <Text style={styles.heroBody}>Elegí una técnica para ver su referencia, subir tu video y revisar el histórico de progreso.</Text>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionEyebrow}>Listado</Text>
            <Text style={styles.sectionTitle}>Tus técnicas</Text>
          </View>
          <Pressable style={styles.ghostButton} onPress={onRefresh}>
            <Text style={styles.ghostButtonText}>{loading ? "Actualizando..." : "Refrescar"}</Text>
          </Pressable>
        </View>
        <View style={styles.techniqueList}>
          {techniques.map((entry) => (
            <Pressable
              key={entry.id}
              style={[styles.techniqueCard, selectedTechnique?.id === entry.id ? styles.techniqueCardActive : null]}
              onPress={() => {
                onSelectTechnique(entry.id);
                setSelectedMeasurementId(entry.measurementDefinitions[0]?.id ?? null);
                setUnit(parseAllowedUnits(entry.measurementDefinitions[0]?.allowedUnits)[0] ?? "");
              }}
            >
              <Text style={styles.techniqueCardTitle}>{entry.title}</Text>
              <Text style={styles.techniqueCardMeta}>{entry.measurementDefinitions.length} medición(es) · {entry.metrics.length} registro(s)</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {selectedTechnique ? (
        <>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>Técnica seleccionada</Text>
            <Text style={styles.sectionTitle}>{selectedTechnique.title}</Text>
            <Text style={styles.helperText}>{selectedTechnique.description || "Todavía no hay texto cargado para esta técnica."}</Text>
            {selectedTechnique.measurementInstructions ? (
              <View style={styles.tipBox}>
                <Text style={styles.tipTitle}>Cómo medir</Text>
                <Text style={styles.tipBody}>{selectedTechnique.measurementInstructions}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>Recursos</Text>
            <Text style={styles.sectionTitle}>Video y referencias</Text>
            {selectedTechnique.mediaAssets.length ? (
              selectedTechnique.mediaAssets.map((asset) => {
                const uri = rewriteLocalAssetUrl(asset.url);
                return (
                  <View key={asset.id} style={styles.mediaCard}>
                    <Text style={styles.mediaTitle}>{asset.title || "Referencia técnica"}</Text>
                    {uri ? (
                      asset.kind === "VIDEO" ? (
                        <Video source={{ uri }} style={styles.video} useNativeControls resizeMode={ResizeMode.CONTAIN} />
                      ) : (
                        <ExpoImage source={{ uri }} style={styles.image} contentFit="contain" />
                      )
                    ) : (
                      <View style={styles.mediaPlaceholder}><Text style={styles.mediaPlaceholderText}>Recurso no disponible</Text></View>
                    )}
                  </View>
                );
              })
            ) : (
              <Text style={styles.helperText}>Todavía no hay recursos asociados a esta técnica.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>Biomecánica automática</Text>
            <Text style={styles.sectionTitle}>Video del atleta y comparación</Text>
            {hasAutomaticAnalysisContract ? (
              <>
                <Text style={styles.helperText}>
                  El contrato biomecánico de esta técnica ya está cargado. El video del atleta se analiza siempre en velocidad normal. El Centro de Masas usa tu altura de perfil para escalar el salto en centímetros y el tiempo de vuelo queda como corroboración secundaria.
                </Text>
                {!autoAnalysis ? <Text style={styles.helperText}>Sube o graba un video en “Seguimiento técnico” para ejecutar la corrección automática.</Text> : null}

                {autoAnalysis ? (
                  <>
                    <View style={styles.metricCard}>
                      <View style={styles.sectionHeaderRow}>
                        <View>
                          <Text style={styles.metricLabel}>JSON de análisis</Text>
                          <Text style={styles.metricMeta}>Visible para revisión técnica y futuro historial.</Text>
                        </View>
                        <Pressable style={styles.ghostButton} onPress={() => setShowAnalysisJson((current) => !current)}>
                          <Text style={styles.ghostButtonText}>{showAnalysisJson ? "Ocultar" : "Mostrar"}</Text>
                        </Pressable>
                      </View>
                      {showAnalysisJson ? <Text style={styles.analysisJsonText}>{analysisJsonPreview}</Text> : null}
                    </View>

                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Resumen automático</Text>
                      {autoAnalysis.comparisonSummary?.comparableChecks ? (
                        <>
                          <Text style={styles.metricNotes}>
                            Orientación usada: {formatComparisonOrientationLabel(autoAnalysis.comparisonSummary.appliedOrientation)}.
                          </Text>
                          {typeof autoAnalysis.comparisonSummary.averageDeltaDeg === "number" ? (
                            <Text style={styles.metricNotes}>
                              Desviación angular media: {autoAnalysis.comparisonSummary.averageDeltaDeg.toFixed(1)}°.
                            </Text>
                          ) : null}
                          {userAngleHighlights.map((highlight) => (
                            <Text key={highlight} style={styles.metricNotes}>• {highlight}</Text>
                          ))}
                        </>
                      ) : (
                        <Text style={styles.metricNotes}>
                          Todavía no hubo suficientes eventos coincidentes entre tu video y la referencia para comparar ángulos automáticamente.
                        </Text>
                      )}
                    </View>

                    <View style={styles.analysisResultGrid}>
                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Eventos detectados</Text>
                        {autoAnalysis.detectedEvents.map((event) => (
                          <Text key={`${event.eventType}-${event.frameIndex}`} style={styles.metricNotes}>
                            {formatAutoEventLabel(event.eventType)} · frame {event.frameIndex + 1} · confianza {event.confidence.toFixed(2)}
                          </Text>
                        ))}
                      </View>

                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Altura del salto</Text>
                        <Text style={styles.metricMeta}>
                          Estado: {formatMeasurementStatus(autoAnalysis.measurements.jumpHeight?.status ?? "PENDING")}
                        </Text>
                        {typeof autoAnalysis.measurements.jumpHeight?.consensusValueCm === "number" ? (
                          <Text style={styles.metricValue}>{autoAnalysis.measurements.jumpHeight.consensusValueCm.toFixed(1)} cm</Text>
                        ) : (
                          <Text style={styles.metricValue}>-</Text>
                        )}
                        {typeof autoAnalysis.measurements.jumpHeight?.playbackSpeedRatio === "number" ? (
                          <Text style={styles.metricNotes}>Ratio temporal elegido: {autoAnalysis.measurements.jumpHeight.playbackSpeedRatio.toFixed(2)}</Text>
                        ) : null}
                        {sortedJumpMethods.map((method) => (
                          <Text key={method.method} style={styles.metricNotes}>
                            {formatJumpMethodLabel(method.method)} · {formatMeasurementStatus(method.status)}
                            {typeof method.valueCm === "number" ? ` · ${method.valueCm.toFixed(1)} cm` : ""}
                            {typeof method.confidence === "number" ? ` · confianza ${method.confidence.toFixed(2)}` : ""}
                          </Text>
                        ))}
                        <Pressable
                          style={[styles.primaryButton, styles.secondaryActionButton]}
                          onPress={handleSaveAutomaticJumpMetric}
                          disabled={submitting || typeof autoAnalysis.measurements.jumpHeight?.consensusValueCm !== "number"}
                        >
                          <Text style={styles.primaryButtonText}>{submitting ? "Guardando..." : "Guardar salto automático"}</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* ── Server analysis: RIM_REFERENCE + consensus ── */}
                    {serverAnalyzing ? (
                      <View style={styles.analysisStatusCard}>
                        <ActivityIndicator color={C.amber} />
                        <Text style={styles.metricLabel}>Calculando con servidor...</Text>
                        <Text style={styles.helperText}>Enviando pose y anotación del aro para obtener RIM_REFERENCE y consenso.</Text>
                      </View>
                    ) : null}
                    {serverError ? <Text style={styles.analysisErrorText}>{serverError}</Text> : null}
                    {serverResult ? (
                      <View style={styles.serverResultCard}>
                        <Text style={styles.serverResultTitle}>Resultado del servidor</Text>
                        <View style={styles.jumpMethodRow}>
                          {serverResult.masterReference.jumpHeight.methods.map((m) => (
                            <View key={m.method} style={[styles.jumpMethodBadge, m.status === "OK" ? styles.jumpMethodBadgeOk : styles.jumpMethodBadgePending]}>
                              <Text style={styles.jumpMethodBadgeLabel}>{m.method === "CENTER_OF_MASS" ? "CoM" : m.method === "FLIGHT_TIME" ? "FT" : "Rim"}</Text>
                              <Text style={styles.jumpMethodBadgeValue}>{typeof m.valueCm === "number" ? `${m.valueCm.toFixed(1)} cm` : "-"}</Text>
                            </View>
                          ))}
                        </View>
                        {typeof serverResult.masterReference.jumpHeight.consensusValueCm === "number" ? (
                          <View style={styles.consensusRow}>
                            <Text style={styles.consensusLabel}>Consenso</Text>
                            <Text style={styles.consensusValue}>{serverResult.masterReference.jumpHeight.consensusValueCm.toFixed(1)} cm</Text>
                          </View>
                        ) : null}
                        {(() => {
                          const refConsensus = selectedTechnique.biomechanicsConfig?.masterReference?.jumpHeight.consensusValueCm;
                          const myConsensus = serverResult.masterReference.jumpHeight.consensusValueCm;
                          if (typeof refConsensus === "number" && typeof myConsensus === "number") {
                            const delta = myConsensus - refConsensus;
                            const pct = (myConsensus / refConsensus) * 100;
                            return (
                              <View style={styles.vsReferenceRow}>
                                <Text style={styles.vsReferenceLabel}>vs referencia ({refConsensus.toFixed(1)} cm)</Text>
                                <Text style={[styles.vsReferenceDelta, delta >= 0 ? styles.vsReferencePositive : styles.vsReferenceNegative]}>
                                  {delta >= 0 ? "+" : ""}{delta.toFixed(1)} cm ({pct.toFixed(0)}%)
                                </Text>
                              </View>
                            );
                          }
                          return null;
                        })()}
                        <Text style={styles.metricMeta}>Estado: {formatMeasurementStatus(serverResult.masterReference.jumpHeight.status)}</Text>
                      </View>
                    ) : null}

                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Comparación por eventos</Text>
                      {angleComparisonGroups.length ? angleComparisonGroups.map((group) => (
                        <View key={group.eventType} style={styles.eventComparisonGroup}>
                          <Text style={styles.eventComparisonTitle}>
                            {formatAutoEventLabel(group.eventType)} · delta medio {group.averageDeltaDeg.toFixed(1)}°
                          </Text>
                          {group.comparisons.map((comparison) => {
                            const rangeStart = angleToPercent(comparison.targetMinDeg ?? comparison.referenceAngleDeg);
                            const rangeEnd = angleToPercent(comparison.targetMaxDeg ?? comparison.referenceAngleDeg);
                            const rangeWidth = Math.max(rangeEnd - rangeStart, 2);
                            const referenceMarker = angleToPercent(comparison.referenceAngleDeg);
                            const athleteMarker = angleToPercent(comparison.athleteAngleDeg);

                            return (
                              <View key={comparison.checkId} style={styles.angleComparisonRow}>
                                <View style={styles.angleComparisonHeader}>
                                  <Text style={styles.angleComparisonLabel}>{comparison.label}</Text>
                                  <Text
                                    style={[
                                      styles.angleComparisonDelta,
                                      Math.abs(comparison.deltaDeg) <= 6 ? styles.angleComparisonDeltaOk : styles.angleComparisonDeltaWarn,
                                    ]}
                                  >
                                    {formatSignedDegrees(comparison.deltaDeg)}{typeof comparison.deltaPercent === "number" ? ` (${formatSignedPercent(comparison.deltaPercent)})` : ""}
                                  </Text>
                                </View>
                                <View style={styles.angleTrack}>
                                  <View style={[styles.angleRangeBand, { left: `${rangeStart}%`, width: `${rangeWidth}%` }]} />
                                  <View style={[styles.angleReferenceMarker, { left: `${referenceMarker}%` }]} />
                                  <View
                                    style={[
                                      styles.angleAthleteMarker,
                                      comparison.withinTarget === false ? styles.angleAthleteMarkerWarn : styles.angleAthleteMarkerOk,
                                      { left: `${athleteMarker}%` },
                                    ]}
                                  />
                                </View>
                                <Text style={styles.angleComparisonMeta}>
                                  Atleta {comparison.athleteAngleDeg.toFixed(1)}° · referencia {comparison.referenceAngleDeg.toFixed(1)}° · esperado {formatExpectedAngleRange(comparison.targetMinDeg, comparison.targetMaxDeg)}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      )) : <Text style={styles.metricNotes}>No hay ángulos configurados o no coinciden todavía los eventos con la referencia.</Text>}
                    </View>

                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Hallazgos técnicos</Text>
                      {autoAnalysis.findings.length ? autoAnalysis.findings.map((finding, index) => (
                        <Text key={`${index}-${finding}`} style={styles.metricNotes}>• {finding}</Text>
                      )) : <Text style={styles.metricNotes}>No hay hallazgos relevantes adicionales.</Text>}
                    </View>

                    <View style={styles.metricCard}>
                      <Text style={styles.metricLabel}>Checks de referencia</Text>
                      {autoAnalysis.measurements.hipProgressionChecks.length ? autoAnalysis.measurements.hipProgressionChecks.map((check) => (
                        <Text key={check.checkId} style={styles.metricNotes}>
                          {check.label} · {formatMeasurementStatus(check.status)}
                          {typeof check.totalDropValue === "number" ? ` · descenso total ${check.totalDropValue.toFixed(3)}` : ""}
                        </Text>
                      )) : <Text style={styles.metricNotes}>La técnica no tiene checks compuestos de descenso progresivo configurados.</Text>}
                    </View>
                  </>
                ) : null}
              </>
            ) : (
              <Text style={styles.helperText}>Esta técnica todavía no tiene un contrato biomecánico listo para comparación automática desde la app.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>Seguimiento técnico</Text>
            <Text style={styles.sectionTitle}>Sube tu video para corregir la técnica</Text>
            {hasAutomaticAnalysisContract ? (
              <>
                <Text style={styles.helperText}>
                  Sube un video tuyo usando esta técnica, similar a los videos de referencia. A partir de ese video la app detecta eventos, estima la altura del salto, revisa los checks de referencia y genera correcciones automáticas.
                </Text>
                <View style={styles.tipBox}>
                  <Text style={styles.tipTitle}>Cómo grabarlo</Text>
                  <Text style={styles.tipBody}>Sube siempre el video en velocidad normal. Para conservar la mejor calidad, la app abre un selector de archivo para elegir el video original sin edición.</Text>
                </View>
                <View style={styles.analysisButtonRow}>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => void handlePickAthleteVideo()}
                    disabled={analysisBusy}
                  >
                    <Text style={styles.primaryButtonText}>{athleteVideoUri ? "Cambiar video original" : "Elegir video original"}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryUploadButton}
                    onPress={() => void handleCaptureAthleteVideo()}
                    disabled={analysisBusy}
                  >
                    <Text style={styles.secondaryUploadButtonText}>Grabar ahora con cámara</Text>
                  </Pressable>
                </View>
                {typeof athleteHeightCm === "number" ? (
                  <View style={styles.analysisInfoPill}>
                    <Text style={styles.analysisInfoPillText}>Altura perfil: {athleteHeightCm} cm</Text>
                  </View>
                ) : (
                  <View style={styles.analysisInfoPill}>
                    <Text style={styles.analysisInfoPillText}>Falta altura en el perfil para escalar el salto en cm</Text>
                  </View>
                )}

                {athleteVideoUri ? (
                  <View style={styles.mediaCard}>
                    <Text style={styles.mediaTitle}>{athleteVideoName || "Video del atleta"}</Text>
                    <Pressable
                      style={styles.openCorrectionsButton}
                      onPress={() => setShowCorrectionsViewer(true)}
                      disabled={!autoAnalysis}
                    >
                      <Text style={styles.openCorrectionsButtonText}>Ver correcciones</Text>
                      <Text style={styles.openCorrectionsButtonMeta}>
                        Abrir visor grande con eventos, barra temporal y sombras de ángulo.
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {analysisBusy ? (
                  <View style={styles.analysisStatusCard}>
                    <ActivityIndicator color={C.amber} />
                    <Text style={styles.metricLabel}>Analizando video del atleta...</Text>
                    <Text style={styles.helperText}>
                      {analysisProgress.total > 0
                        ? `Procesando frame ${analysisProgress.processed} de ${analysisProgress.total}...`
                        : "Descargando modelo de pose (solo la primera vez)..."}
                    </Text>
                  </View>
                ) : null}

                {analysisError ? <Text style={styles.analysisErrorText}>{analysisError}</Text> : null}

                {autoAnalysis ? (
                  <View style={styles.tipBox}>
                    <Text style={styles.tipTitle}>Análisis listo</Text>
                    <Text style={styles.tipBody}>La corrección biomecánica ya se ejecutó. Revisa los hallazgos en el bloque superior y guarda la altura automática si el resultado es consistente.</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.helperText}>Esta técnica todavía no tiene un contrato biomecánico listo para comparar tu video automáticamente.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>Comparativas</Text>
            <Text style={styles.sectionTitle}>Base vs última medición</Text>
            {comparisons.length ? (
              <View style={styles.metricList}>
                {comparisons.map((comparison) => (
                  <View key={comparison.key} style={styles.metricCard}>
                    <Text style={styles.metricLabel}>{comparison.label}</Text>
                    <Text style={styles.metricMeta}>
                      Base: {comparison.baseline ? formatMetricValue(comparison.baseline) : "-"} · Última: {comparison.latest ? formatMetricValue(comparison.latest) : "-"}
                    </Text>
                    <Text style={styles.metricNotes}>
                      Delta: {comparison.delta === null ? "Sin referencia" : `${comparison.delta > 0 ? "+" : ""}${comparison.delta}${comparison.unit ? ` ${comparison.unit}` : ""}`}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>Aún no hay métricas suficientes para mostrar comparativas por técnica.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>Historial</Text>
            <Text style={styles.sectionTitle}>Registros de {selectedTechnique.title}</Text>
            {selectedTechnique.metrics.length ? (
              <View style={styles.metricList}>
                {selectedTechnique.metrics.map((metric) => (
                  <View key={metric.id} style={styles.metricCard}>
                    <View style={styles.metricHeaderRow}>
                      <Text style={styles.metricLabel}>{metric.label}</Text>
                      {metric.isBaseline ? <Text style={styles.metricBadge}>Base</Text> : null}
                    </View>
                    <Text style={styles.metricValue}>{formatMetricValue(metric)}</Text>
                    <Text style={styles.metricMeta}>{formatMetricMeta(metric)}</Text>
                    {metric.notes ? <Text style={styles.metricNotes}>{metric.notes}</Text> : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>Aún no registraste mediciones para esta técnica.</Text>
            )}
          </View>

          {/* Montar el WebView siempre que haya un contrato biomécanico para
               pre-cargar MediaPipe en segundo plano. videoUri=null significa
               que no hay video para procesar aún. */}
          {hasAutomaticAnalysisContract ? (
            <TechniqueVideoPoseAnalyzer
              requestId={analysisRequestId}
              videoUri={athleteVideoUri}
              onProgress={(processedFrames, totalFrames) => setAnalysisProgress({ processed: processedFrames, total: totalFrames })}
              onResult={handlePoseAnalysisResult}
              onError={(message) => {
                setAnalysisBusy(false);
                setAnalysisError(message);
              }}
            />
          ) : null}

          {/* ── Rim Annotation Modal ── */}
          <Modal visible={showRimAnnotation} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleSkipRimAnnotation}>
            <View style={styles.rimModalScreen}>
              <View style={styles.rimModalHeader}>
                <Text style={styles.rimModalTitle}>Anotar el aro</Text>
                <Pressable style={styles.rimModalSkip} onPress={handleSkipRimAnnotation}>
                  <Text style={styles.rimModalSkipText}>Saltear</Text>
                </Pressable>
              </View>
              <View style={styles.rimModalBody}>
                <Text style={styles.rimModalHint}>
                  Tocá dos veces para marcar los bordes del aro: primero el borde izquierdo y luego el borde derecho.
                  Con el aro anotado el servidor puede calcular la altura de salto usando la referencia visual (RIM_REFERENCE).
                </Text>
                <View
                  style={styles.rimTapArea}
                  onLayout={(event) => {
                    const { width, height } = event.nativeEvent.layout;
                    setRimTapAreaSize({ width, height });
                  }}
                  onTouchEnd={(e) => {
                    const { locationX, locationY } = e.nativeEvent;
                    const normalized = normalizeRimTapPoint(locationX, locationY);
                    if (!normalized) {
                      return;
                    }
                    if (!rimPoint1) {
                      setRimPoint1(normalized);
                    } else if (!rimPoint2) {
                      setRimPoint2(normalized);
                    } else {
                      // third tap resets
                      setRimPoint1(normalized);
                      setRimPoint2(null);
                    }
                  }}
                >
                  {athleteVideoUri ? (
                    <Video
                      ref={rimPreviewVideoRef}
                      source={{ uri: athleteVideoUri }}
                      style={styles.rimTapVideo}
                      resizeMode={ResizeMode.STRETCH}
                      shouldPlay={false}
                      useNativeControls={false}
                      isLooping={false}
                      pointerEvents="none"
                      onLoad={() => {
                        void rimPreviewVideoRef.current?.setStatusAsync({
                          shouldPlay: false,
                          positionMillis: Math.max(rimPreviewTimestampMs - 120, 0),
                        }).catch(() => {});
                      }}
                    />
                  ) : null}
                  {rimPoint1Display ? (
                    <View style={[styles.rimDot, { left: rimPoint1Display.left - 10, top: rimPoint1Display.top - 10, backgroundColor: "#f5b324" }]} />
                  ) : null}
                  {rimPoint2Display ? (
                    <View style={[styles.rimDot, { left: rimPoint2Display.left - 10, top: rimPoint2Display.top - 10, backgroundColor: "#e76f51" }]} />
                  ) : null}
                  {!rimPoint1 ? (
                    <Text style={styles.rimTapPrompt}>Toca para marcar el borde IZQUIERDO del aro</Text>
                  ) : !rimPoint2 ? (
                    <Text style={styles.rimTapPrompt}>Ahora toca el borde DERECHO del aro</Text>
                  ) : (
                    <Text style={styles.rimTapPrompt}>Ambos bordes marcados. Toca para resetear si querés ajustar.</Text>
                  )}
                </View>
                <View style={styles.rimModalActions}>
                  <Pressable
                    style={[styles.primaryButton, { flex: 1 }]}
                    onPress={handleConfirmRimAnnotation}
                  >
                    <Text style={styles.primaryButtonText}>
                      {rimPoint1 && rimPoint2 ? "Confirmar aro" : "Continuar sin aro"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <Modal visible={showCorrectionsViewer} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowCorrectionsViewer(false)}>
            <View style={styles.viewerModalScreen}>
              <View style={styles.viewerModalHeader}>
                <View style={styles.viewerModalHeaderTextWrap}>
                  <Text style={styles.viewerModalEyebrow}>Corrección visual</Text>
                  <Text style={styles.viewerModalTitle}>{selectedTechnique.title}</Text>
                </View>
                <Pressable style={styles.viewerModalCloseButton} onPress={() => setShowCorrectionsViewer(false)}>
                  <Text style={styles.viewerModalCloseText}>Cerrar</Text>
                </Pressable>
              </View>

              <View style={styles.viewerModalBody}>
                <View style={styles.viewerVideoStage}>
                  {athleteVideoUri ? (
                    <Video ref={athleteVideoRef} source={{ uri: athleteVideoUri }} style={styles.viewerVideo} useNativeControls resizeMode={ResizeMode.CONTAIN} />
                  ) : null}

                  {selectedEventOverlay ? (
                    <>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.videoEventChipRow}
                        style={styles.videoEventChipScroller}
                      >
                        {eventOverlayItems.map((item) => (
                          <Pressable
                            key={item.eventType}
                            style={[
                              styles.videoEventChip,
                              selectedEventOverlay.eventType === item.eventType ? styles.videoEventChipActive : null,
                            ]}
                            onPress={() => handleSelectVisualEvent(item.eventType)}
                          >
                            <Text style={[
                              styles.videoEventChipText,
                              selectedEventOverlay.eventType === item.eventType ? styles.videoEventChipTextActive : null,
                            ]}>
                              {item.label}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>

                      <View style={styles.videoOverlayCard}>
                        <View style={styles.videoOverlayHeader}>
                          <Text style={styles.videoOverlayTitle}>{selectedEventOverlay.label}</Text>
                          <Text style={styles.videoOverlayMeta}>{formatTimestampMs(selectedEventOverlay.timestampMs)}</Text>
                        </View>
                        {selectedEventOverlay.comparisons.length ? selectedEventOverlay.comparisons.slice(0, 2).map((comparison) => {
                          const rangeStart = angleToPercent(comparison.targetMinDeg ?? comparison.referenceAngleDeg);
                          const rangeEnd = angleToPercent(comparison.targetMaxDeg ?? comparison.referenceAngleDeg);
                          const rangeWidth = Math.max(rangeEnd - rangeStart, 2);
                          const referenceMarker = angleToPercent(comparison.referenceAngleDeg);
                          const athleteMarker = angleToPercent(comparison.athleteAngleDeg);

                          return (
                            <View key={comparison.checkId} style={styles.videoAngleGhostRow}>
                              <View style={styles.videoAngleGhostHeader}>
                                <Text style={styles.videoAngleGhostLabel}>{comparison.label}</Text>
                                <Text style={styles.videoAngleGhostDelta}>{formatSignedDegrees(comparison.deltaDeg)}{typeof comparison.deltaPercent === "number" ? ` (${formatSignedPercent(comparison.deltaPercent)})` : ""}</Text>
                              </View>
                              <View style={styles.videoAngleGhostTrack}>
                                <View style={[styles.videoAngleGhostRange, { left: `${rangeStart}%`, width: `${rangeWidth}%` }]} />
                                <View style={[styles.videoAngleGhostReference, { left: `${referenceMarker}%` }]} />
                                <View style={[styles.videoAngleGhostAthlete, { left: `${athleteMarker}%` }]} />
                              </View>
                              <Text style={styles.videoAngleGhostMeta}>
                                Esperado {formatExpectedAngleRange(comparison.targetMinDeg, comparison.targetMaxDeg)} · atleta {comparison.athleteAngleDeg.toFixed(1)}°
                              </Text>
                            </View>
                          );
                        }) : (
                          <Text style={styles.videoOverlayBody}>No hay ángulos comparables para este evento todavía.</Text>
                        )}
                      </View>
                    </>
                  ) : null}
                </View>

                <View style={styles.viewerTimelineSection}>
                  <Text style={styles.viewerTimelineLabel}>Eventos sobre la reproducción</Text>
                  <View style={styles.eventTimelineTrack}>
                    {eventOverlayItems.map((item) => (
                      <Pressable
                        key={item.eventType}
                        style={[
                          styles.eventTimelineMarker,
                          { left: `${item.positionPct}%` },
                          selectedEventOverlay?.eventType === item.eventType ? styles.eventTimelineMarkerActive : null,
                        ]}
                        onPress={() => handleSelectVisualEvent(item.eventType)}
                      >
                        <View style={styles.eventTimelineDot} />
                        <Text style={styles.eventTimelineLabel}>{item.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          </Modal>
        </>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>["C"]) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: C.bg },
    content: { padding: S.md, gap: S.md, paddingBottom: S.xl },
    emptyWrap: { flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center", gap: S.sm, padding: S.xl },
    emptyEmoji: { fontSize: 52 },
    emptyTitle: { color: C.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
    emptyBody: { color: C.textSub, fontSize: 14, lineHeight: 20, textAlign: "center" },
    heroCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.lg, gap: S.sm, borderWidth: 1, borderColor: C.border },
    heroEyebrow: { color: C.amber, fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
    heroTitle: { color: C.text, fontSize: 24, fontWeight: "800" },
    heroBody: { color: C.textSub, fontSize: 14, lineHeight: 21 },
    sectionCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.md, gap: S.sm, borderWidth: 1, borderColor: C.border },
    sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
    sectionEyebrow: { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
    sectionTitle: { color: C.text, fontSize: 18, fontWeight: "800" },
    techniqueList: { gap: S.sm },
    techniqueCard: { backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.md, borderWidth: 1, borderColor: C.border, gap: 4 },
    techniqueCardActive: { borderColor: C.amberBorder, backgroundColor: C.amberDim },
    techniqueCardTitle: { color: C.text, fontWeight: "800", fontSize: 15 },
    techniqueCardMeta: { color: C.textMuted, fontSize: 12 },
    helperText: { color: C.textSub, fontSize: 13, lineHeight: 19 },
    tipBox: { backgroundColor: C.surfaceRaise, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.border },
    tipTitle: { color: C.text, fontWeight: "700", marginBottom: 4 },
    tipBody: { color: C.textSub, fontSize: 13, lineHeight: 19 },
    mediaCard: { gap: S.xs, paddingTop: S.xs },
    mediaTitle: { color: C.text, fontSize: 14, fontWeight: "700" },
    video: { width: "100%", height: 220, borderRadius: R.lg, backgroundColor: C.surfaceRaise },
    image: { width: "100%", height: 220, borderRadius: R.lg, backgroundColor: C.surfaceRaise },
    mediaPlaceholder: { height: 160, borderRadius: R.lg, backgroundColor: C.surfaceRaise, justifyContent: "center", alignItems: "center" },
    mediaPlaceholderText: { color: C.textMuted, fontSize: 13 },
    selectorWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    selectorChip: { paddingHorizontal: S.md, paddingVertical: 10, borderRadius: R.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceRaise },
    selectorChipActive: { borderColor: C.amberBorder, backgroundColor: C.amberDim },
    selectorChipText: { color: C.textSub, fontSize: 13, fontWeight: "700" },
    selectorChipTextActive: { color: C.amber },
    formGrid: { gap: S.sm },
    input: { backgroundColor: C.surfaceRaise, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, color: C.text, fontSize: 14 },
    notesInput: { minHeight: 84, textAlignVertical: "top" },
    toggleRow: { backgroundColor: C.surfaceRaise, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: 12 },
    toggleRowActive: { borderColor: C.amberBorder, backgroundColor: C.amberDim },
    toggleText: { color: C.textSub, fontSize: 13, fontWeight: "700" },
    primaryButton: { backgroundColor: C.amber, borderRadius: R.full, paddingVertical: 14, alignItems: "center" },
    primaryButtonText: { color: C.bg, fontWeight: "800", fontSize: 15 },
    secondaryActionButton: { marginTop: S.sm },
    secondaryUploadButton: { borderRadius: R.full, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surfaceRaise },
    secondaryUploadButtonText: { color: C.text, fontWeight: "800", fontSize: 15 },
    ghostButton: { paddingHorizontal: S.md, paddingVertical: 10, borderRadius: R.full, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surfaceRaise },
    ghostButtonText: { color: C.textSub, fontWeight: "700", fontSize: 13 },
    analysisButtonRow: { gap: S.sm },
    analysisInfoPill: { alignSelf: "flex-start", backgroundColor: C.surfaceRaise, borderRadius: R.full, paddingHorizontal: S.md, paddingVertical: 10, borderWidth: 1, borderColor: C.border },
    analysisInfoPillText: { color: C.textSub, fontWeight: "700", fontSize: 12 },
    analysisStatusCard: { backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.md, gap: S.xs, borderWidth: 1, borderColor: C.border, alignItems: "flex-start" },
    analysisErrorText: { color: C.danger, fontSize: 13, lineHeight: 19, fontWeight: "700" },
    analysisResultGrid: { gap: S.sm },
    analysisJsonText: { color: C.textSub, fontSize: 11, lineHeight: 16, fontFamily: "monospace" },
    metricList: { gap: S.sm },
    metricCard: { backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.md, gap: 4, borderWidth: 1, borderColor: C.border },
    metricHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
    metricLabel: { color: C.text, fontSize: 14, fontWeight: "700" },
    metricValue: { color: C.amber, fontSize: 22, fontWeight: "800" },
    metricMeta: { color: C.textMuted, fontSize: 12 },
    metricNotes: { color: C.textSub, fontSize: 13, lineHeight: 18 },
    metricBadge: { color: C.teal, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
    eventComparisonGroup: { gap: S.sm, paddingTop: S.sm },
    eventComparisonTitle: { color: C.text, fontSize: 13, fontWeight: "800" },
    angleComparisonRow: { gap: 6 },
    angleComparisonHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
    angleComparisonLabel: { color: C.textSub, fontSize: 13, fontWeight: "700", flex: 1 },
    angleComparisonDelta: { fontSize: 13, fontWeight: "800" },
    angleComparisonDeltaOk: { color: C.teal },
    angleComparisonDeltaWarn: { color: C.danger },
    angleTrack: { position: "relative", height: 18, borderRadius: R.full, overflow: "hidden", borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
    angleRangeBand: { position: "absolute", top: 3, bottom: 3, borderRadius: R.full, backgroundColor: C.amberDim },
    angleReferenceMarker: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: C.textMuted, transform: [{ translateX: -1 }] },
    angleAthleteMarker: { position: "absolute", top: 0, bottom: 0, width: 4, borderRadius: R.full, transform: [{ translateX: -2 }] },
    angleAthleteMarkerOk: { backgroundColor: C.teal },
    angleAthleteMarkerWarn: { backgroundColor: C.danger },
    angleComparisonMeta: { color: C.textMuted, fontSize: 12, lineHeight: 17 },
    // Server result card
    serverResultCard: { backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.md, gap: S.sm, borderWidth: 2, borderColor: C.amberBorder },
    serverResultTitle: { color: C.text, fontSize: 15, fontWeight: "800" },
    jumpMethodRow: { flexDirection: "row", gap: S.sm, flexWrap: "wrap" },
    jumpMethodBadge: { borderRadius: R.lg, padding: S.sm, alignItems: "center", minWidth: 70, gap: 2 },
    jumpMethodBadgeOk: { backgroundColor: C.amberDim, borderWidth: 1, borderColor: C.amberBorder },
    jumpMethodBadgePending: { backgroundColor: C.surfaceRaise, borderWidth: 1, borderColor: C.border },
    jumpMethodBadgeLabel: { color: C.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
    jumpMethodBadgeValue: { color: C.amber, fontSize: 16, fontWeight: "900" },
    consensusRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
    consensusLabel: { color: C.textSub, fontSize: 13, fontWeight: "700" },
    consensusValue: { color: C.amber, fontSize: 24, fontWeight: "900" },
    vsReferenceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
    vsReferenceLabel: { color: C.textMuted, fontSize: 12 },
    vsReferenceDelta: { fontSize: 15, fontWeight: "800" },
    vsReferencePositive: { color: C.teal },
    vsReferenceNegative: { color: C.danger },
    // Rim annotation modal
    rimModalScreen: { flex: 1, backgroundColor: C.bg },
    rimModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: S.md, borderBottomWidth: 1, borderBottomColor: C.border },
    rimModalTitle: { color: C.text, fontSize: 18, fontWeight: "800" },
    rimModalSkip: { paddingHorizontal: S.md, paddingVertical: 10 },
    rimModalSkipText: { color: C.textSub, fontSize: 14, fontWeight: "700" },
    rimModalBody: { flex: 1, gap: S.md, padding: S.md },
    rimModalHint: { color: C.textSub, fontSize: 13, lineHeight: 20 },
    rimTapArea: { flex: 1, borderRadius: R.lg, borderWidth: 2, borderColor: C.border, backgroundColor: C.surfaceRaise, position: "relative", justifyContent: "center", alignItems: "center" },
    rimTapVideo: { ...StyleSheet.absoluteFillObject, borderRadius: R.lg, backgroundColor: "#1c1c1c" },
    rimTapPrompt: {
      color: "rgba(255,255,255,0.95)",
      fontSize: 14,
      textAlign: "center",
      paddingHorizontal: S.lg,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: R.md,
      paddingVertical: 8,
    },
    rimDot: { position: "absolute", width: 20, height: 20, borderRadius: R.full, opacity: 0.9 },
    rimModalActions: { flexDirection: "row", gap: S.sm },
    openCorrectionsButton: { backgroundColor: C.amber, borderRadius: R.xl, paddingVertical: 16, paddingHorizontal: S.md, gap: 4 },
    openCorrectionsButtonText: { color: C.bg, fontSize: 18, fontWeight: "900", textAlign: "center" },
    openCorrectionsButtonMeta: { color: C.bg, fontSize: 12, lineHeight: 17, textAlign: "center", opacity: 0.86 },
    videoStage: { position: "relative" },
    videoEventChipScroller: { position: "absolute", top: 10, left: 10, right: 10, maxHeight: 42 },
    videoEventChipRow: { gap: 8, paddingRight: 12 },
    videoEventChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: R.full, backgroundColor: "rgba(10, 16, 25, 0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
    videoEventChipActive: { backgroundColor: "rgba(245, 179, 36, 0.9)", borderColor: C.amberBorder },
    videoEventChipText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "800" },
    videoEventChipTextActive: { color: C.bg },
    videoOverlayCard: { position: "absolute", left: 10, right: 10, bottom: 10, borderRadius: R.lg, padding: S.sm, gap: 6, backgroundColor: "rgba(10, 16, 25, 0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
    videoOverlayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
    videoOverlayTitle: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
    videoOverlayMeta: { color: "rgba(255,255,255,0.76)", fontSize: 11, fontWeight: "700" },
    videoOverlayBody: { color: "rgba(255,255,255,0.82)", fontSize: 12, lineHeight: 17 },
    videoAngleGhostRow: { gap: 4 },
    videoAngleGhostHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
    videoAngleGhostLabel: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "700", flex: 1 },
    videoAngleGhostDelta: { color: C.amber, fontSize: 12, fontWeight: "800" },
    videoAngleGhostTrack: { position: "relative", height: 14, borderRadius: R.full, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
    videoAngleGhostRange: { position: "absolute", top: 2, bottom: 2, borderRadius: R.full, backgroundColor: "rgba(245, 179, 36, 0.32)" },
    videoAngleGhostReference: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "rgba(255,255,255,0.55)", transform: [{ translateX: -1 }] },
    videoAngleGhostAthlete: { position: "absolute", top: 0, bottom: 0, width: 4, borderRadius: R.full, backgroundColor: C.teal, transform: [{ translateX: -2 }] },
    videoAngleGhostMeta: { color: "rgba(255,255,255,0.72)", fontSize: 11, lineHeight: 15 },
    eventTimelineCard: { gap: 6, paddingTop: 6 },
    eventTimelineTrack: { position: "relative", height: 44, borderRadius: R.full, backgroundColor: C.surfaceRaise, borderWidth: 1, borderColor: C.border, overflow: "visible" },
    eventTimelineMarker: { position: "absolute", top: 4, bottom: 4, width: 2, alignItems: "center" },
    eventTimelineMarkerActive: { zIndex: 2 },
    eventTimelineDot: { width: 10, height: 10, borderRadius: R.full, backgroundColor: C.amber, borderWidth: 2, borderColor: C.bg, marginLeft: -4 },
    eventTimelineLabel: { position: "absolute", top: 14, minWidth: 70, marginLeft: -32, color: C.textMuted, fontSize: 10, textAlign: "center" },
    viewerModalScreen: { flex: 1, backgroundColor: C.bg },
    viewerModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.md, paddingHorizontal: S.md, paddingTop: S.lg, paddingBottom: S.sm, borderBottomWidth: 1, borderBottomColor: C.border },
    viewerModalHeaderTextWrap: { flex: 1, gap: 2 },
    viewerModalEyebrow: { color: C.textMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
    viewerModalTitle: { color: C.text, fontSize: 18, fontWeight: "900" },
    viewerModalCloseButton: { borderRadius: R.full, borderWidth: 1, borderColor: C.borderStrong, paddingHorizontal: S.md, paddingVertical: 10, backgroundColor: C.surfaceRaise },
    viewerModalCloseText: { color: C.text, fontSize: 13, fontWeight: "800" },
    viewerModalBody: { flex: 1, padding: S.md, gap: S.md },
    viewerVideoStage: { position: "relative", flex: 1, minHeight: 420, borderRadius: R.xl, overflow: "hidden", backgroundColor: "#000" },
    viewerVideo: { width: "100%", height: "100%", backgroundColor: "#000" },
    viewerTimelineSection: { gap: S.sm },
    viewerTimelineLabel: { color: C.textSub, fontSize: 13, fontWeight: "700" },
  });
}

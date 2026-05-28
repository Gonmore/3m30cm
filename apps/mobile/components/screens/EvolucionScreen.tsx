import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path as SvgPath, Text as SvgText } from "react-native-svg";
import { useState } from "react";

import { useTheme } from "../ThemeContext";
import { R, S } from "../tokens";
import type { AthleteProgress, TrendWindow } from "../types";

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
  comparisonEnabled: boolean;
  mediaAssets: Array<{ id: string; kind: "IMAGE" | "GIF" | "VIDEO"; url: string | null; title: string | null; isPrimary: boolean }>;
  measurementDefinitions: TechniqueMeasurementDefinition[];
  metrics: TechniqueMetric[];
}

interface EvolucionScreenProps {
  progress: AthleteProgress | null;
  techniques: TechniqueEntry[];
  comparisonTechniqueIds: [string | null, string | null];
  trendWindow: TrendWindow;
  selectedCycleId: string | null;
  loading: boolean;
  onSetTrendWindow: (w: TrendWindow) => void;
  onSetSelectedCycleId: (id: string | null) => void;
  onSetComparisonTechniqueIds: (ids: [string | null, string | null]) => void;
  onShowJumpGuide: () => void;
}

const WINDOWS: { label: string; value: TrendWindow }[] = [
  { label: "7 días", value: "7D" },
  { label: "28 días", value: "28D" },
  { label: "Todo", value: "ALL" },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatMetric(metric: TechniqueMetric | null) {
  if (!metric) {
    return "-";
  }

  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function getLatestMetricByLabel(metrics: TechniqueMetric[]) {
  const grouped = new Map<string, TechniqueMetric[]>();

  for (const metric of metrics) {
    const key = metric.measurementDefinitionId ?? `${metric.label.toLowerCase()}::${metric.unit ?? ""}`;
    const group = grouped.get(key) ?? [];
    group.push(metric);
    grouped.set(key, group);
  }

  return Array.from(grouped.values()).map((group) => {
    const ordered = [...group].sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime());
    const baseline = ordered.find((entry) => entry.isBaseline) ?? ordered[0] ?? null;
    const latest = ordered[ordered.length - 1] ?? null;
    return {
      key: latest?.measurementDefinitionId ?? `${latest?.label ?? baseline?.label ?? "m"}::${latest?.unit ?? baseline?.unit ?? ""}`,
      label: latest?.label ?? baseline?.label ?? "Métrica",
      unit: latest?.unit ?? baseline?.unit ?? null,
      baseline,
      latest,
      delta: baseline && latest ? Math.round((latest.value - baseline.value) * 10) / 10 : null,
    };
  });
}

function getMetricGroupKey(metric: TechniqueMetric) {
  return metric.measurementDefinitionId ?? `${metric.label.toLowerCase()}::${metric.unit ?? ""}`;
}

function getTechniqueMetricGroups(metrics: TechniqueMetric[]) {
  const grouped = new Map<string, TechniqueMetric[]>();

  for (const metric of metrics) {
    const key = getMetricGroupKey(metric);
    const group = grouped.get(key) ?? [];
    group.push(metric);
    grouped.set(key, group);
  }

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const ordered = [...group].sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime());
      const latest = ordered[ordered.length - 1] ?? null;
      const baseline = ordered.find((entry) => entry.isBaseline) ?? ordered[0] ?? null;
      const label = latest?.label ?? baseline?.label ?? "Métrica";
      const unit = latest?.unit ?? baseline?.unit ?? null;
      const lowerLabel = label.toLowerCase();
      const isJumpSeries = unit === "cm" && (lowerLabel.includes("salto") || lowerLabel.includes("altura"));

      return {
        key,
        label,
        unit,
        isJumpSeries,
        metrics: ordered,
        latest,
        baseline,
        delta: baseline && latest ? Math.round((latest.value - baseline.value) * 10) / 10 : null,
      };
    })
    .sort((left, right) => {
      if (left.isJumpSeries !== right.isJumpSeries) {
        return left.isJumpSeries ? -1 : 1;
      }
      if (left.metrics.length !== right.metrics.length) {
        return right.metrics.length - left.metrics.length;
      }
      return left.label.localeCompare(right.label, "es", { sensitivity: "base" });
    });
}

function getPreferredSeriesKey(groups: ReturnType<typeof getTechniqueMetricGroups>) {
  return groups[0]?.key ?? null;
}

const TREND_CHART_W = 320;
const TREND_CHART_H = 184;
const TREND_PAD_L = 42;
const TREND_PAD_R = 16;
const TREND_PAD_T = 18;
const TREND_PAD_B = 30;

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x} ${point.y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;

    const controlPoint1X = current.x + (next.x - previous.x) / 6;
    const controlPoint1Y = current.y + (next.y - previous.y) / 6;
    const controlPoint2X = next.x - (afterNext.x - current.x) / 6;
    const controlPoint2Y = next.y - (afterNext.y - current.y) / 6;

    path += ` C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${next.x} ${next.y}`;
  }

  return path;
}

function TechniqueTrendChart({
  metrics,
  metrics2,
  accentColor,
  accent2Color,
  mutedColor,
}: {
  metrics: TechniqueMetric[];
  metrics2?: TechniqueMetric[];
  accentColor: string;
  accent2Color?: string;
  mutedColor: string;
}) {
  if (metrics.length < 2) {
    return null;
  }

  const ordered = [...metrics].sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime());
  const ordered2 = metrics2 && metrics2.length >= 2
    ? [...metrics2].sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime())
    : null;

  // Use a shared Y scale that accommodates both series so they're comparable
  const allValues = [
    ...ordered.map((m) => m.value),
    ...(ordered2 ?? []).map((m) => m.value),
  ];
  const minY = Math.min(...allValues);
  const maxY = Math.max(...allValues);
  const paddedMinY = minY - (maxY === minY ? 1 : (maxY - minY) * 0.12);
  const paddedMaxY = maxY + (maxY === minY ? 1 : (maxY - minY) * 0.12);
  const rangeY = paddedMaxY - paddedMinY || 1;
  const plotW = TREND_CHART_W - TREND_PAD_L - TREND_PAD_R;
  const plotH = TREND_CHART_H - TREND_PAD_T - TREND_PAD_B;

  const toX = (index: number, total: number) => TREND_PAD_L + (index / Math.max(total - 1, 1)) * plotW;
  const toY = (value: number) => TREND_PAD_T + plotH - ((value - paddedMinY) / rangeY) * plotH;
  const plottedPoints = ordered.map((metric, index) => ({ x: toX(index, ordered.length), y: toY(metric.value), metric }));
  const plottedPoints2 = ordered2
    ? ordered2.map((metric, index) => ({ x: toX(index, ordered2.length), y: toY(metric.value), metric }))
    : null;
  const primaryPath = buildSmoothPath(plottedPoints.map(({ x, y }) => ({ x, y })));
  const secondaryPath = plottedPoints2 ? buildSmoothPath(plottedPoints2.map(({ x, y }) => ({ x, y }))) : null;
  const baselineMetric = ordered.find((metric) => metric.isBaseline) ?? ordered[0] ?? null;
  const baselineY = baselineMetric ? toY(baselineMetric.value) : null;
  const firstDate = formatDate(ordered[0].recordedAt);
  const lastDate = formatDate(ordered[ordered.length - 1].recordedAt);
  const lastPoint = ordered[ordered.length - 1] ?? null;
  const lastPoint2 = ordered2 ? ordered2[ordered2.length - 1] ?? null : null;

  return (
    <Svg width={TREND_CHART_W} height={TREND_CHART_H} style={{ alignSelf: "center" }}>
      <Line x1={TREND_PAD_L} y1={TREND_PAD_T} x2={TREND_PAD_L} y2={TREND_PAD_T + plotH} stroke={mutedColor} strokeWidth={1} />
      <Line x1={TREND_PAD_L} y1={TREND_PAD_T + plotH} x2={TREND_PAD_L + plotW} y2={TREND_PAD_T + plotH} stroke={mutedColor} strokeWidth={1} />
      {baselineY !== null ? (
        <Line
          x1={TREND_PAD_L}
          y1={baselineY}
          x2={TREND_PAD_L + plotW}
          y2={baselineY}
          stroke="#f5b324"
          strokeWidth={1}
          strokeDasharray="5,4"
          opacity={0.8}
        />
      ) : null}
      {/* Primary series */}
      <SvgPath d={primaryPath} fill="none" stroke={accentColor} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {plottedPoints.map(({ x, y, metric }) => {
        const isLatest = metric.id === lastPoint?.id;
        return (
          <Circle
            key={metric.id}
            cx={x}
            cy={y}
            r={isLatest ? 4.5 : 3.5}
            fill={isLatest ? "#f5b324" : accentColor}
          />
        );
      })}
      {/* Overlay second series */}
      {secondaryPath && plottedPoints2 ? (
        <>
          <SvgPath d={secondaryPath} fill="none" stroke={accent2Color ?? "#e76f51"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6,3" />
          {plottedPoints2.map(({ x, y, metric }) => {
            const isLatest = metric.id === lastPoint2?.id;
            return (
              <Circle
                key={`b-${metric.id}`}
                cx={x}
                cy={y}
                r={isLatest ? 4 : 3}
                fill={accent2Color ?? "#e76f51"}
                opacity={0.85}
              />
            );
          })}
        </>
      ) : null}
      <SvgText x={TREND_PAD_L - 6} y={TREND_PAD_T + 4} fontSize={10} fill={mutedColor} textAnchor="end">
        {paddedMaxY % 1 === 0 ? paddedMaxY.toFixed(0) : paddedMaxY.toFixed(1)}
      </SvgText>
      <SvgText x={TREND_PAD_L - 6} y={TREND_PAD_T + plotH} fontSize={10} fill={mutedColor} textAnchor="end">
        {paddedMinY % 1 === 0 ? paddedMinY.toFixed(0) : paddedMinY.toFixed(1)}
      </SvgText>
      <SvgText x={TREND_PAD_L} y={TREND_CHART_H - 8} fontSize={10} fill={mutedColor}>
        {firstDate}
      </SvgText>
      <SvgText x={TREND_PAD_L + plotW} y={TREND_CHART_H - 8} fontSize={10} fill={mutedColor} textAnchor="end">
        {lastDate}
      </SvgText>
    </Svg>
  );
}

function buildTechniqueHistory(techniques: TechniqueEntry[]) {
  return techniques
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      comparisonEnabled: entry.comparisonEnabled,
      measurementInstructions: entry.measurementInstructions,
      proVideoUrl: entry.proVideoUrl ?? null,
      latestRecordedAt: entry.metrics[0]?.recordedAt ?? null,
      totalMetrics: entry.metrics.length,
      snapshots: getLatestMetricByLabel(entry.metrics),
      recentMetrics: [...entry.metrics]
        .sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime())
        .slice(0, 4),
    }))
    .sort((left, right) => (right.latestRecordedAt ?? "").localeCompare(left.latestRecordedAt ?? ""));
}

export default function EvolucionScreen({
  progress,
  techniques = [],
  comparisonTechniqueIds = [null, null],
  trendWindow,
  selectedCycleId,
  loading,
  onSetTrendWindow,
  onSetSelectedCycleId,
  onSetComparisonTechniqueIds,
  onShowJumpGuide,
}: EvolucionScreenProps) {
  const { C } = useTheme();
  const styles = makeStyles(C);

  // Local selectors for the trend chart — independent from the A/B comparator
  const [trendTechId, setTrendTechId] = useState<string | null>(null);
  const [trendTechId2, setTrendTechId2] = useState<string | null>(null);

  if (!progress) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyIcon}>↑</Text>
        <Text style={styles.emptyTitle}>Sin datos de evolución</Text>
        <Text style={styles.emptySub}>Completá sesiones para ver tus tendencias y progreso.</Text>
      </View>
    );
  }

  const pb = progress.personalBests;
  const summary = progress.summary;
  const jumpTrendPoints = progress.trends.jumpHeightCm ?? [];
  const cycleEvolution = progress.cycleEvolution ?? [];
  const recentLogs = progress.recentLogs ?? [];
  const enabledTechniques = techniques.filter((entry) => entry.comparisonEnabled);
  const firstTechnique = enabledTechniques.find((entry) => entry.id === comparisonTechniqueIds[0]) ?? enabledTechniques[0] ?? null;
  const secondTechnique = enabledTechniques.find((entry) => entry.id === comparisonTechniqueIds[1])
    ?? enabledTechniques.find((entry) => entry.id !== firstTechnique?.id)
    ?? null;

  // Trend chart uses its own selectors, defaulting to first technique
  const trendTechnique = techniques.find((entry) => entry.id === trendTechId) ?? techniques[0] ?? null;
  const trendTechnique2 = techniques.find((entry) => entry.id === trendTechId2 && entry.id !== trendTechnique?.id) ?? null;
  const trendGroups = trendTechnique ? getTechniqueMetricGroups(trendTechnique.metrics) : [];
  const trendGroups2 = trendTechnique2 ? getTechniqueMetricGroups(trendTechnique2.metrics) : [];
  const selectedTrendGroup = trendGroups.find((group) => group.key === getPreferredSeriesKey(trendGroups)) ?? trendGroups[0] ?? null;
  // Best-effort match: find same label in second technique
  const selectedTrendGroup2 = trendTechnique2
    ? (trendGroups2.find((g) => g.label.toLowerCase() === selectedTrendGroup?.label.toLowerCase()) ?? trendGroups2[0] ?? null)
    : null;
  const comparisonRows = firstTechnique && secondTechnique
    ? getLatestMetricByLabel(firstTechnique.metrics)
        .map((left) => {
          const right = getLatestMetricByLabel(secondTechnique.metrics).find((candidate) => candidate.label.toLowerCase() === left.label.toLowerCase());
          return right ? { label: left.label, left, right } : null;
        })
        .filter((entry): entry is { label: string; left: ReturnType<typeof getLatestMetricByLabel>[number]; right: ReturnType<typeof getLatestMetricByLabel>[number] } => entry !== null)
    : [];
  const techniqueHistory = buildTechniqueHistory(techniques);
  const windowTrends = jumpTrendPoints.slice(trendWindow === "7D" ? -7 : trendWindow === "28D" ? -28 : 0);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>↑ RÉCORDS PERSONALES</Text>
      <View style={styles.pbRow}>
        <View style={[styles.pbCard, { borderColor: C.amberBorder }]}>
          <Text style={styles.pbEyebrow}>SALTO</Text>
          <Text style={[styles.pbValue, { color: C.amber }]}>{typeof pb.jumpHeightCm === "number" ? `${pb.jumpHeightCm} cm` : "-"}</Text>
        </View>
        <View style={[styles.pbCard, { borderColor: C.tealBorder }]}>
          <Text style={styles.pbEyebrow}>CARGA</Text>
          <Text style={[styles.pbValue, { color: C.teal }]}>{typeof pb.avgLoadKg === "number" ? `${pb.avgLoadKg} kg` : "-"}</Text>
        </View>
        <View style={[styles.pbCard, { borderColor: `${C.textSub}44` }]}>
          <Text style={styles.pbEyebrow}>VEL.</Text>
          <Text style={[styles.pbValue, { color: C.textSub }]}>{typeof pb.peakVelocityMps === "number" ? `${pb.peakVelocityMps} m/s` : "-"}</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryVal}>{summary.completedSessions}/{summary.totalSessions}</Text>
          <Text style={styles.summaryLabel}>sesiones</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryVal}>{summary.currentStreak}</Text>
          <Text style={styles.summaryLabel}>racha</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryVal}>{Math.round(summary.completionRate)}%</Text>
          <Text style={styles.summaryLabel}>completadas</Text>
        </View>
      </View>

      {trendTechnique ? (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.chartHeadingWrap}>
              <Text style={styles.chartTitle}>Evolución por técnica</Text>
              <Text style={styles.chartSubtitle}>Izquierda: mediciones anteriores. Derecha: estado actual.</Text>
            </View>
            <View style={styles.trendTechPickerWrap}>
              <Text style={styles.trendPickerLabel}>Técnica principal</Text>
              <View style={styles.trendTechPicker}>
                {techniques.map((technique) => (
                  <Pressable
                    key={technique.id}
                    style={[styles.windowBtn, trendTechnique?.id === technique.id && styles.windowBtnActive]}
                    onPress={() => {
                      setTrendTechId(technique.id);
                      if (trendTechId2 === technique.id) setTrendTechId2(null);
                    }}
                  >
                    <Text style={[styles.windowBtnText, trendTechnique?.id === technique.id && styles.windowBtnTextActive]}>{technique.title}</Text>
                  </Pressable>
                ))}
              </View>
              {techniques.length >= 2 ? (
                <>
                  <Text style={styles.trendPickerLabel}>Superponer</Text>
                  <View style={styles.trendTechPicker}>
                    <Pressable
                      style={[styles.windowBtn, trendTechId2 === null && styles.windowBtnOverlayNone]}
                      onPress={() => setTrendTechId2(null)}
                    >
                      <Text style={[styles.windowBtnText, trendTechId2 === null && styles.windowBtnTextNone]}>Ninguna</Text>
                    </Pressable>
                    {techniques
                      .filter((technique) => technique.id !== trendTechnique?.id)
                      .map((technique) => (
                        <Pressable
                          key={technique.id}
                          style={[styles.windowBtn, trendTechId2 === technique.id && styles.windowBtnOverlayActive]}
                          onPress={() => setTrendTechId2(technique.id)}
                        >
                          <Text style={[styles.windowBtnText, trendTechId2 === technique.id && styles.windowBtnTextOverlay]}>{technique.title}</Text>
                        </Pressable>
                      ))}
                  </View>
                </>
              ) : null}
            </View>
          </View>
          {trendGroups.length ? (
            <>
              <View style={styles.metricSeriesWrap}>
                {trendGroups.map((group) => {
                  const isActive = selectedTrendGroup?.key === group.key;
                  return (
                    <View key={group.key} style={[styles.metricSeriesChip, isActive && styles.metricSeriesChipActive]}>
                      <Text style={[styles.metricSeriesText, isActive && styles.metricSeriesTextActive]}>{group.label}</Text>
                    </View>
                  );
                })}
              </View>
              {selectedTrendGroup ? (
                <>
                  <View style={styles.trendHeroRow}>
                    <View style={styles.trendHeroMain}>
                      <Text style={styles.trendHeroLabel}>Técnica observada</Text>
                      <Text style={styles.trendHeroTitle}>{trendTechnique.title}</Text>
                      <Text style={styles.trendHeroMeta}>{selectedTrendGroup.label}{selectedTrendGroup.unit ? ` · ${selectedTrendGroup.unit}` : ""}</Text>
                    </View>
                    <View style={styles.trendDeltaCard}>
                      <Text style={styles.trendDeltaLabel}>Mejora</Text>
                      <Text style={[styles.trendDeltaValue, { color: (selectedTrendGroup.delta ?? 0) >= 0 ? C.teal : C.amber }]}>
                        {selectedTrendGroup.delta === null ? "-" : `${selectedTrendGroup.delta > 0 ? "+" : ""}${selectedTrendGroup.delta}${selectedTrendGroup.unit ? ` ${selectedTrendGroup.unit}` : ""}`}
                      </Text>
                    </View>
                  </View>
                  {selectedTrendGroup.metrics.length >= 2 ? (
                    <>
                      {selectedTrendGroup2 && trendTechnique2 ? (
                        <View style={styles.overlayLegend}>
                          <View style={styles.overlayLegendDot} />
                          <Text style={styles.overlayLegendText}>{trendTechnique?.title}</Text>
                          <View style={[styles.overlayLegendDot, { backgroundColor: "#e76f51" }]} />
                          <Text style={styles.overlayLegendText}>{trendTechnique2.title} (punteado)</Text>
                        </View>
                      ) : null}
                      <TechniqueTrendChart
                        metrics={selectedTrendGroup.metrics}
                        metrics2={selectedTrendGroup2?.metrics}
                        accentColor={C.teal}
                        accent2Color="#e76f51"
                        mutedColor={C.textMuted}
                      />
                    </>
                  ) : (
                    <View style={styles.infoCard}><Text style={styles.helperText}>Hace falta al menos una segunda medición para dibujar la curva de esta técnica.</Text></View>
                  )}
                  <View style={styles.trendSummaryRow}>
                    <View style={styles.trendSummaryCard}>
                      <Text style={styles.trendSummaryLabel}>Base</Text>
                      <Text style={styles.trendSummaryValue}>{formatMetric(selectedTrendGroup.baseline)}</Text>
                      <Text style={styles.trendSummaryMeta}>{selectedTrendGroup.baseline ? formatDate(selectedTrendGroup.baseline.recordedAt) : "-"}</Text>
                    </View>
                    <View style={styles.trendSummaryCard}>
                      <Text style={styles.trendSummaryLabel}>Actual</Text>
                      <Text style={styles.trendSummaryValue}>{formatMetric(selectedTrendGroup.latest)}</Text>
                      <Text style={styles.trendSummaryMeta}>{selectedTrendGroup.latest ? formatDate(selectedTrendGroup.latest.recordedAt) : "-"}</Text>
                    </View>
                    <View style={styles.trendSummaryCard}>
                      <Text style={styles.trendSummaryLabel}>Registros</Text>
                      <Text style={styles.trendSummaryValue}>{selectedTrendGroup.metrics.length}</Text>
                      <Text style={styles.trendSummaryMeta}>mediciones</Text>
                    </View>
                  </View>
                  {selectedTrendGroup2 ? (
                    <View style={[styles.trendSummaryRow, { marginTop: 4 }]}>
                      <View style={[styles.trendSummaryCard, { borderColor: "#e76f5155" }]}>
                        <Text style={styles.trendSummaryLabel}>{trendTechnique2?.title}: base</Text>
                        <Text style={[styles.trendSummaryValue, { color: "#e76f51" }]}>{formatMetric(selectedTrendGroup2.baseline)}</Text>
                      </View>
                      <View style={[styles.trendSummaryCard, { borderColor: "#e76f5155" }]}>
                        <Text style={styles.trendSummaryLabel}>{trendTechnique2?.title}: actual</Text>
                        <Text style={[styles.trendSummaryValue, { color: "#e76f51" }]}>{formatMetric(selectedTrendGroup2.latest)}</Text>
                      </View>
                      <View style={[styles.trendSummaryCard, { borderColor: "#e76f5155" }]}>
                        <Text style={styles.trendSummaryLabel}>Mejora</Text>
                        <Text style={[styles.trendSummaryValue, { color: (selectedTrendGroup2.delta ?? 0) >= 0 ? C.teal : C.amber }]}>
                          {selectedTrendGroup2.delta === null ? "-" : `${selectedTrendGroup2.delta > 0 ? "+" : ""}${selectedTrendGroup2.delta}${selectedTrendGroup2.unit ? ` ${selectedTrendGroup2.unit}` : ""}`}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <View style={styles.infoCard}><Text style={styles.helperText}>Todavía no hay métricas cargadas para esta técnica.</Text></View>
          )}
        </View>
      ) : windowTrends.length > 0 ? (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Tendencia general</Text>
            <View style={styles.windowPicker}>
              {WINDOWS.map((window) => (
                <Pressable
                  key={window.value}
                  style={[styles.windowBtn, trendWindow === window.value && styles.windowBtnActive]}
                  onPress={() => onSetTrendWindow(window.value)}
                >
                  <Text style={[styles.windowBtnText, trendWindow === window.value && styles.windowBtnTextActive]}>{window.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Text style={styles.helperText}>Aún no hay técnicas configuradas para el desglose, pero el histórico general sí está disponible.</Text>
        </View>
      ) : null}

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>Técnicas</Text>
        <Text style={styles.sectionLead}>Histórico por técnica y comparación entre técnicas habilitadas desde admin.</Text>
        {enabledTechniques.length >= 2 ? (
          <View style={styles.techniqueCompareCard}>
            <Text style={styles.subsectionTitle}>Comparar técnicas</Text>
            <Text style={styles.helperText}>Elegí dos técnicas del programa activo. Solo aparecen las marcadas para comparación.</Text>
            <Text style={styles.selectorLabel}>Técnica A</Text>
            <View style={styles.selectorWrap}>
              {enabledTechniques.map((entry) => (
                <Pressable
                  key={`left-${entry.id}`}
                  style={[styles.selectorChip, firstTechnique?.id === entry.id && styles.selectorChipActive]}
                  onPress={() => onSetComparisonTechniqueIds([entry.id, comparisonTechniqueIds[1]])}
                >
                  <Text style={[styles.selectorChipText, firstTechnique?.id === entry.id && styles.selectorChipTextActive]}>{entry.title}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.selectorLabel}>Técnica B</Text>
            <View style={styles.selectorWrap}>
              {enabledTechniques.map((entry) => (
                <Pressable
                  key={`right-${entry.id}`}
                  style={[styles.selectorChip, secondTechnique?.id === entry.id && styles.selectorChipActive]}
                  onPress={() => onSetComparisonTechniqueIds([comparisonTechniqueIds[0], entry.id])}
                >
                  <Text style={[styles.selectorChipText, secondTechnique?.id === entry.id && styles.selectorChipTextActive]}>{entry.title}</Text>
                </Pressable>
              ))}
            </View>
            {comparisonRows.length ? (
              <View style={styles.compareRows}>
                {comparisonRows.map((row) => (
                  <View key={row.label} style={styles.compareRow}>
                    <Text style={styles.compareMetric}>{row.label}</Text>
                    <Text style={styles.compareValue}>{firstTechnique?.title}: {formatMetric(row.left.latest)}</Text>
                    <Text style={styles.compareValue}>{secondTechnique?.title}: {formatMetric(row.right.latest)}</Text>
                    <Text style={styles.compareMeta}>
                      Delta {firstTechnique?.title}: {row.left.delta === null ? "-" : `${row.left.delta > 0 ? "+" : ""}${row.left.delta}${row.left.unit ? ` ${row.left.unit}` : ""}`}
                    </Text>
                    <Text style={styles.compareMeta}>
                      Delta {secondTechnique?.title}: {row.right.delta === null ? "-" : `${row.right.delta > 0 ? "+" : ""}${row.right.delta}${row.right.unit ? ` ${row.right.unit}` : ""}`}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>Aún no hay métricas compatibles entre las dos técnicas seleccionadas.</Text>
            )}
          </View>
        ) : (
          <View style={styles.infoCard}><Text style={styles.helperText}>Se necesitan al menos dos técnicas con comparación habilitada para mostrar esta vista.</Text></View>
        )}

        <View style={styles.historyList}>
          {techniqueHistory.length ? (
            techniqueHistory.map((entry) => (
              <View key={entry.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View>
                    <Text style={styles.historyTitle}>{entry.title}</Text>
                    <Text style={styles.historyMeta}>{entry.totalMetrics} medición(es){entry.comparisonEnabled ? " · comparable" : ""}</Text>
                  </View>
                  {entry.latestRecordedAt ? <Text style={styles.historyDate}>{formatDate(entry.latestRecordedAt)}</Text> : null}
                </View>
                {entry.snapshots.length ? (
                  entry.snapshots.map((snapshot) => (
                    <View key={snapshot.key} style={styles.snapshotRow}>
                      <Text style={styles.snapshotLabel}>{snapshot.label}</Text>
                      <Text style={styles.snapshotValue}>Base {formatMetric(snapshot.baseline)}</Text>
                      <Text style={styles.snapshotValue}>Última {formatMetric(snapshot.latest)}</Text>
                      <Text style={styles.snapshotMeta}>
                        {snapshot.delta === null ? "Sin delta" : `Delta ${snapshot.delta > 0 ? "+" : ""}${snapshot.delta}${snapshot.unit ? ` ${snapshot.unit}` : ""}`}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.helperText}>Todavía no hay mediciones registradas para esta técnica.</Text>
                )}
                {entry.recentMetrics.length ? (
                  <View style={styles.recentMetricsWrap}>
                    {entry.recentMetrics.map((metric) => (
                      <Text key={metric.id} style={styles.recentMetricLine}>
                        {metric.label}: {formatMetric(metric)} · {formatDate(metric.recordedAt)} · {metric.completedSessionsAtMeasurement ?? 0} sesiones
                      </Text>
                    ))}
                  </View>
                ) : null}
                {(entry.measurementInstructions || entry.proVideoUrl) ? (
                  <View style={styles.howToBlock}>
                    <Text style={styles.howToLabel}>Cómo medir</Text>
                    {entry.measurementInstructions ? (
                      <Text style={styles.howToText}>{entry.measurementInstructions}</Text>
                    ) : null}
                    {entry.proVideoUrl ? (
                      <Pressable onPress={() => {
                        const raw = entry.proVideoUrl!;
                        const url = raw.startsWith("http") ? raw : `https://${raw}`;
                        Linking.openURL(url).catch(() => {});
                      }}>
                        <Text style={styles.howToVideoBtn}>▶ Ver video de referencia</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <View style={styles.infoCard}><Text style={styles.helperText}>Aún no hay datos de técnica para mostrar en evolución.</Text></View>
          )}
        </View>
      </View>

      <View style={styles.jumpSection}>
        <View style={styles.jumpHeader}>
          <Text style={styles.sectionTitle}>Historial de test de salto</Text>
          <Pressable style={styles.howToBtn} onPress={onShowJumpGuide}>
            <Text style={styles.howToBtnText}>? Cómo medir</Text>
          </Pressable>
        </View>
        {recentLogs.filter((entry) => typeof entry.metrics?.jumpTestBestCm === "number").length === 0 ? (
          <View style={styles.noJump}>
            <Text style={styles.noJumpText}>Aún no hay test de salto registrados.</Text>
            <Pressable style={styles.howToBtnLarge} onPress={onShowJumpGuide}>
              <Text style={styles.howToBtnLargeText}>? Aprendé a medirlo</Text>
            </Pressable>
          </View>
        ) : (
          recentLogs
            .filter((entry) => typeof entry.metrics?.jumpTestBestCm === "number")
            .slice(0, 10)
            .map((entry, index) => (
              <View key={entry.id ?? `log-${index}`} style={styles.jumpRow}>
                <View style={[styles.jumpDot, { backgroundColor: index === 0 ? C.amber : C.teal }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.jumpVal}>{entry.metrics!.jumpTestBestCm} cm</Text>
                  <Text style={styles.jumpDate}>{entry.createdAt ? formatDate(entry.createdAt) : ""}</Text>
                </View>
                {index === 0 ? (
                  <View style={styles.latestBadge}>
                    <Text style={styles.latestBadgeText}>Último</Text>
                  </View>
                ) : null}
              </View>
            ))
        )}
      </View>

      {cycleEvolution.length > 0 ? (
        <View style={styles.cycleSection}>
          <Text style={styles.sectionTitle}>Ciclos completados</Text>
          {cycleEvolution.map((cycle) => {
            const isSelected = cycle.id === selectedCycleId;
            return (
              <Pressable
                key={cycle.id}
                style={[styles.cycleRow, isSelected && styles.cycleRowActive]}
                onPress={() => onSetSelectedCycleId(isSelected ? null : cycle.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cycleName}>{cycle.name}</Text>
                  <Text style={styles.cycleMeta}>{cycle.completedSessions}/{cycle.totalSessions} sesiones · {Math.round(cycle.completionRate)}%</Text>
                </View>
                {typeof cycle.bestJumpCm === "number" ? <Text style={[styles.cycleJump, { color: C.amber }]}>{cycle.bestJumpCm} cm</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {loading ? <Text style={styles.loadingText}>Actualizando datos...</Text> : null}
    </ScrollView>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>["C"]) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: C.bg },
    container: { padding: S.md, gap: S.md, paddingBottom: S.xl },
    emptyWrap: { flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center", gap: S.sm, padding: S.xl },
    emptyIcon: { fontSize: 56, color: C.amber },
    emptyTitle: { color: C.text, fontWeight: "800", fontSize: 22 },
    emptySub: { color: C.textSub, fontSize: 14, textAlign: "center" },
    sectionTitle: { color: C.textMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.4 },
    sectionLead: { color: C.textSub, fontSize: 13, lineHeight: 19 },
    subsectionTitle: { color: C.text, fontSize: 18, fontWeight: "800" },
    helperText: { color: C.textSub, fontSize: 13, lineHeight: 19 },
    pbRow: { flexDirection: "row", gap: S.sm },
    pbCard: { flex: 1, backgroundColor: C.surface, borderRadius: R.xl, padding: S.sm, gap: 2, borderWidth: 1, alignItems: "center" },
    pbEyebrow: { color: C.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
    pbValue: { fontSize: 22, fontWeight: "800" },
    summaryRow: { flexDirection: "row", gap: S.sm },
    summaryCell: { flex: 1, backgroundColor: C.surface, borderRadius: R.lg, padding: S.sm, alignItems: "center", gap: 2, borderWidth: 1, borderColor: C.border },
    summaryVal: { color: C.text, fontSize: 20, fontWeight: "800" },
    summaryLabel: { color: C.textMuted, fontSize: 11 },
    chartCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.md, gap: S.sm, borderWidth: 1, borderColor: C.border },
    chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm },
    chartHeadingWrap: { flex: 1, gap: 2 },
    chartTitle: { color: C.text, fontWeight: "700", fontSize: 14 },
    chartSubtitle: { color: C.textSub, fontSize: 12, lineHeight: 17 },
    windowPicker: { flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" },
    windowBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: R.full, backgroundColor: C.surfaceRaise },
    windowBtnActive: { backgroundColor: C.amberDim, borderWidth: 1, borderColor: C.amberBorder },
    windowBtnText: { color: C.textMuted, fontSize: 12, fontWeight: "600" },
    windowBtnTextActive: { color: C.amber, fontWeight: "700" },
    windowBtnOverlayActive: { backgroundColor: `#e76f5122`, borderWidth: 1, borderColor: `#e76f5166` },
    windowBtnTextOverlay: { color: "#e76f51", fontWeight: "700" },
    windowBtnOverlayNone: { backgroundColor: C.surfaceRaise },
    windowBtnTextNone: { color: C.textMuted, fontWeight: "600" },
    trendTechPickerWrap: { gap: 6 },
    trendPickerLabel: { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
    trendTechPicker: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
    overlayLegend: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 },
    overlayLegendDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.teal },
    overlayLegendText: { color: C.textSub, fontSize: 12 },
    metricSeriesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    metricSeriesChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.full, backgroundColor: C.surfaceRaise, borderWidth: 1, borderColor: C.border },
    metricSeriesChipActive: { borderColor: C.tealBorder, backgroundColor: `${C.teal}18` },
    metricSeriesText: { color: C.textMuted, fontSize: 12, fontWeight: "700" },
    metricSeriesTextActive: { color: C.teal },
    trendHeroRow: { flexDirection: "row", gap: S.sm, alignItems: "stretch" },
    trendHeroMain: { flex: 1, gap: 2 },
    trendHeroLabel: { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
    trendHeroTitle: { color: C.text, fontSize: 20, fontWeight: "800" },
    trendHeroMeta: { color: C.textSub, fontSize: 13 },
    trendDeltaCard: { minWidth: 112, backgroundColor: C.surfaceRaise, borderRadius: R.lg, paddingVertical: S.sm, paddingHorizontal: S.md, borderWidth: 1, borderColor: C.border, justifyContent: "center" },
    trendDeltaLabel: { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
    trendDeltaValue: { fontSize: 24, fontWeight: "800", marginTop: 4 },
    trendSummaryRow: { flexDirection: "row", gap: S.sm },
    trendSummaryCard: { flex: 1, backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.sm, gap: 2, borderWidth: 1, borderColor: C.border },
    trendSummaryLabel: { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
    trendSummaryValue: { color: C.text, fontSize: 16, fontWeight: "800" },
    trendSummaryMeta: { color: C.textSub, fontSize: 11 },
    bars: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 100 },
    barWrap: { flex: 1, alignItems: "center", gap: 4, justifyContent: "flex-end" },
    bar: { width: "100%", borderRadius: R.sm, minHeight: 4 },
    barLabel: { color: C.textMuted, fontSize: 8 },
    sectionBlock: { gap: S.sm },
    techniqueCompareCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.md, gap: S.sm, borderWidth: 1, borderColor: C.border },
    selectorLabel: { color: C.textMuted, fontSize: 12, fontWeight: "700" },
    selectorWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    selectorChip: { paddingHorizontal: S.md, paddingVertical: 10, borderRadius: R.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceRaise },
    selectorChipActive: { borderColor: C.amberBorder, backgroundColor: C.amberDim },
    selectorChipText: { color: C.textSub, fontSize: 13, fontWeight: "700" },
    selectorChipTextActive: { color: C.amber },
    compareRows: { gap: S.sm },
    compareRow: { backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.md, gap: 4, borderWidth: 1, borderColor: C.border },
    compareMetric: { color: C.text, fontSize: 14, fontWeight: "800" },
    compareValue: { color: C.textSub, fontSize: 13 },
    compareMeta: { color: C.textMuted, fontSize: 12 },
    infoCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.md, borderWidth: 1, borderColor: C.border },
    historyList: { gap: S.sm },
    historyCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.md, gap: S.sm, borderWidth: 1, borderColor: C.border },
    historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: S.sm },
    historyTitle: { color: C.text, fontSize: 16, fontWeight: "800" },
    historyMeta: { color: C.textMuted, fontSize: 12 },
    historyDate: { color: C.textMuted, fontSize: 12 },
    snapshotRow: { backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.sm, gap: 2, borderWidth: 1, borderColor: C.border },
    snapshotLabel: { color: C.text, fontWeight: "700", fontSize: 13 },
    snapshotValue: { color: C.textSub, fontSize: 12 },
    snapshotMeta: { color: C.amber, fontSize: 12, fontWeight: "700" },
    recentMetricsWrap: { gap: 4 },
    recentMetricLine: { color: C.textMuted, fontSize: 12 },
    howToBlock: { backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.sm, gap: 4, borderWidth: 1, borderColor: C.tealBorder },
    howToLabel: { color: C.teal, fontWeight: "700", fontSize: 12 },
    howToText: { color: C.textSub, fontSize: 13, lineHeight: 19 },
    howToVideoBtn: { color: C.teal, fontWeight: "700", fontSize: 13 },
    jumpSection: { gap: S.sm },
    jumpHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    howToBtn: { backgroundColor: C.amberDim, borderRadius: R.full, paddingVertical: 6, paddingHorizontal: S.sm, borderWidth: 1, borderColor: C.amberBorder },
    howToBtnText: { color: C.amber, fontWeight: "700", fontSize: 12 },
    noJump: { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, gap: S.sm, alignItems: "center", borderWidth: 1, borderColor: C.border },
    noJumpText: { color: C.textMuted, fontSize: 13 },
    howToBtnLarge: { backgroundColor: C.amberDim, borderRadius: R.full, paddingVertical: 10, paddingHorizontal: S.lg, borderWidth: 1, borderColor: C.amberBorder },
    howToBtnLargeText: { color: C.amber, fontWeight: "700", fontSize: 14 },
    jumpRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, paddingVertical: S.sm, paddingHorizontal: S.md, gap: S.sm, borderWidth: 1, borderColor: C.border },
    jumpDot: { width: 8, height: 8, borderRadius: R.full, flexShrink: 0 },
    jumpVal: { color: C.text, fontWeight: "700", fontSize: 16 },
    jumpDate: { color: C.textMuted, fontSize: 12, marginTop: 2 },
    latestBadge: { backgroundColor: C.amberDim, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.amberBorder },
    latestBadgeText: { color: C.amber, fontWeight: "700", fontSize: 11 },
    cycleSection: { gap: S.xs },
    cycleRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, paddingVertical: S.sm, paddingHorizontal: S.md, gap: S.sm, borderWidth: 1, borderColor: C.border },
    cycleRowActive: { borderColor: C.amberBorder, backgroundColor: C.amberDim },
    cycleName: { color: C.text, fontWeight: "700", fontSize: 14 },
    cycleMeta: { color: C.textMuted, fontSize: 12 },
    cycleJump: { fontSize: 16, fontWeight: "800" },
    loadingText: { color: C.textMuted, fontSize: 12, textAlign: "center" },
  });
}

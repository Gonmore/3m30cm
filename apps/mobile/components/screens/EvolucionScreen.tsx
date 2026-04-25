import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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

function buildTechniqueHistory(techniques: TechniqueEntry[]) {
  return techniques
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      comparisonEnabled: entry.comparisonEnabled,
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
  techniques,
  comparisonTechniqueIds,
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
  const maxJump = windowTrends.length ? Math.max(...windowTrends.map((entry) => entry.value ?? 0), 0) : 0;

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
          <Text style={styles.summaryVal}>{summary.totalSessions}</Text>
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

      {windowTrends.length > 0 ? (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Tendencia de salto</Text>
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
          <View style={styles.bars}>
            {windowTrends.slice(-20).map((entry, index) => {
              const value = entry.value ?? 0;
              const percent = maxJump > 0 ? value / maxJump : 0;
              return (
                <View key={`${entry.date}-${index}`} style={styles.barWrap}>
                  <View style={[styles.bar, { height: Math.max(percent * 80, 4), backgroundColor: value === maxJump ? C.amber : C.teal }]} />
                  <Text style={styles.barLabel}>{new Date(entry.date).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" })}</Text>
                </View>
              );
            })}
          </View>
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
    chartTitle: { color: C.text, fontWeight: "700", fontSize: 14 },
    windowPicker: { flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" },
    windowBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: R.full, backgroundColor: C.surfaceRaise },
    windowBtnActive: { backgroundColor: C.amberDim, borderWidth: 1, borderColor: C.amberBorder },
    windowBtnText: { color: C.textMuted, fontSize: 12, fontWeight: "600" },
    windowBtnTextActive: { color: C.amber, fontWeight: "700" },
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

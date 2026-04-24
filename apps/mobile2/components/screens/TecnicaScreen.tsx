import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { ResizeMode, Video } from "expo-av";

import { useTheme } from "@mobile/components/ThemeContext";
import { rewriteLocalAssetUrl } from "@mobile/components/runtimeConfig";
import { R, S } from "@mobile/components/tokens";

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
  };
  metrics: TechniqueMetric[];
}

interface TecnicaScreenProps {
  technique: TechniqueData | null;
  loading: boolean;
  submitting: boolean;
  onRefresh: () => void;
  onSubmitMetric: (payload: {
    programTemplateId: string;
    label: string;
    value: number;
    unit?: string;
    notes?: string;
    isBaseline: boolean;
  }) => void;
}

interface MetricComparison {
  key: string;
  label: string;
  unit: string | null;
  baseline: TechniqueMetric | null;
  latest: TechniqueMetric;
  delta: number | null;
  entries: TechniqueMetric[];
}

function formatMetricValue(metric: TechniqueMetric) {
  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function formatComparisonValue(value: number, unit: string | null) {
  return `${value}${unit ? ` ${unit}` : ""}`;
}

function formatDelta(delta: number | null, unit: string | null) {
  if (delta === null) {
    return "Sin referencia";
  }

  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta}${unit ? ` ${unit}` : ""}`;
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
    .map(([key, entries]): MetricComparison => {
      const sortedEntries = [...entries].sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime());
      const baseline = sortedEntries.find((entry) => entry.isBaseline) ?? sortedEntries[0] ?? null;
      const latest = sortedEntries[sortedEntries.length - 1]!;
      const delta = baseline ? Math.round((latest.value - baseline.value) * 10) / 10 : null;

      return {
        key,
        label: latest.label,
        unit: latest.unit,
        baseline,
        latest,
        delta,
        entries: sortedEntries,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, "es", { sensitivity: "base" }));
}

export default function TecnicaScreen({ technique, loading, submitting, onRefresh, onSubmitMetric }: TecnicaScreenProps) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [isBaseline, setIsBaseline] = useState(false);

  function handleSubmit() {
    if (!technique) {
      return;
    }

    const parsedValue = Number(value);
    if (!label.trim() || !Number.isFinite(parsedValue)) {
      return;
    }

    onSubmitMetric({
      programTemplateId: technique.template.id,
      label: label.trim(),
      value: parsedValue,
      unit: unit.trim() || undefined,
      notes: notes.trim() || undefined,
      isBaseline,
    });

    setLabel("");
    setValue("");
    setUnit("");
    setNotes("");
    setIsBaseline(false);
  }

  if (!technique) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyEmoji}>🎯</Text>
        <Text style={styles.emptyTitle}>Todavía no hay técnica cargada</Text>
        <Text style={styles.emptyBody}>
          Cuando tu programa tenga videos y guía técnica, los vas a ver acá junto con tus métricas de inicio y evolución.
        </Text>
        <Pressable style={styles.primaryButton} onPress={onRefresh}>
          <Text style={styles.primaryButtonText}>{loading ? "Actualizando..." : "Actualizar"}</Text>
        </Pressable>
      </View>
    );
  }

  const baselineMetrics = technique.metrics.filter((metric) => metric.isBaseline);
  const comparisons = buildMetricComparisons(technique.metrics);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Técnica específica</Text>
        <Text style={styles.heroTitle}>{technique.template.techniqueTitle || technique.template.name}</Text>
        <Text style={styles.heroBody}>
          {technique.template.techniqueDescription || "Todavía no hay texto cargado para esta técnica."}
        </Text>
        <View style={styles.heroChips}>
          <View style={styles.heroChip}><Text style={styles.heroChipText}>{technique.programName}</Text></View>
          <View style={styles.heroChip}><Text style={styles.heroChipText}>{technique.metrics.length} métricas</Text></View>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionEyebrow}>Recursos</Text>
            <Text style={styles.sectionTitle}>Videos y referencias</Text>
          </View>
          <Pressable style={styles.ghostButton} onPress={onRefresh}>
            <Text style={styles.ghostButtonText}>{loading ? "Actualizando..." : "Refrescar"}</Text>
          </Pressable>
        </View>

        {technique.template.mediaAssets.length ? (
          technique.template.mediaAssets.map((asset) => {
            const uri = asset.url ? rewriteLocalAssetUrl(asset.url) : null;
            return (
              <View key={asset.id} style={styles.mediaCard}>
                <Text style={styles.mediaTitle}>{asset.title || "Referencia técnica"}</Text>
                {uri ? (
                  asset.kind === "VIDEO" ? (
                    <Video
                      source={{ uri }}
                      style={styles.video}
                      useNativeControls
                      resizeMode={ResizeMode.CONTAIN}
                    />
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
          <Text style={styles.helperText}>Todavía no hay videos o imágenes asociados a esta técnica.</Text>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>Línea base</Text>
        <Text style={styles.sectionTitle}>Cómo estás arrancando</Text>
        {baselineMetrics.length ? (
          <View style={styles.metricList}>
            {baselineMetrics.map((metric) => (
              <View key={metric.id} style={styles.metricCard}>
                <Text style={styles.metricLabel}>{metric.label}</Text>
                <Text style={styles.metricValue}>{formatMetricValue(metric)}</Text>
                <Text style={styles.metricMeta}>{new Date(metric.recordedAt).toLocaleDateString()}</Text>
                {metric.notes ? <Text style={styles.metricNotes}>{metric.notes}</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.helperText}>Aún no registraste métricas de inicio para este programa.</Text>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>Comparativas</Text>
        <Text style={styles.sectionTitle}>Base vs última medición</Text>
        {comparisons.length ? (
          <View style={styles.metricList}>
            {comparisons.map((comparison) => (
              <View key={comparison.key} style={styles.metricCard}>
                <View style={styles.metricHeaderRow}>
                  <Text style={styles.metricLabel}>{comparison.label}</Text>
                  <Text
                    style={[
                      styles.comparisonDelta,
                      comparison.delta === null
                        ? styles.comparisonDeltaNeutral
                        : comparison.delta >= 0
                          ? styles.comparisonDeltaUp
                          : styles.comparisonDeltaDown,
                    ]}
                  >
                    {formatDelta(comparison.delta, comparison.unit)}
                  </Text>
                </View>
                <View style={styles.comparisonRow}>
                  <View style={styles.comparisonCell}>
                    <Text style={styles.comparisonLabel}>Base</Text>
                    <Text style={styles.comparisonValue}>
                      {comparison.baseline ? formatComparisonValue(comparison.baseline.value, comparison.unit) : "-"}
                    </Text>
                  </View>
                  <View style={styles.comparisonCell}>
                    <Text style={styles.comparisonLabel}>Última</Text>
                    <Text style={styles.comparisonValue}>{formatComparisonValue(comparison.latest.value, comparison.unit)}</Text>
                  </View>
                  <View style={styles.comparisonCell}>
                    <Text style={styles.comparisonLabel}>Registros</Text>
                    <Text style={styles.comparisonValue}>{comparison.entries.length}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.helperText}>Aún no hay métricas suficientes para mostrar comparativas por etiqueta.</Text>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>Nueva métrica</Text>
        <Text style={styles.sectionTitle}>Seguimiento técnico</Text>
        <View style={styles.formGrid}>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="ej. altura de alcance"
            placeholderTextColor={C.textDisabled}
          />
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder="valor"
            placeholderTextColor={C.textDisabled}
          />
          <TextInput
            style={styles.input}
            value={unit}
            onChangeText={setUnit}
            placeholder="unidad (cm, s, rep...)"
            placeholderTextColor={C.textDisabled}
          />
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="nota opcional"
            placeholderTextColor={C.textDisabled}
          />
        </View>

        <Pressable style={[styles.toggleRow, isBaseline && styles.toggleRowActive]} onPress={() => setIsBaseline((current) => !current)}>
          <Text style={styles.toggleText}>{isBaseline ? "Se guardará como línea base" : "Marcar como línea base inicial"}</Text>
        </Pressable>

        <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={submitting || !label.trim() || !value.trim()}>
          <Text style={styles.primaryButtonText}>{submitting ? "Guardando..." : "Guardar métrica"}</Text>
        </Pressable>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>Historial</Text>
        <Text style={styles.sectionTitle}>Cómo vas evolucionando</Text>
        {technique.metrics.length ? (
          <View style={styles.metricList}>
            {technique.metrics.map((metric) => (
              <View key={metric.id} style={styles.metricCard}>
                <View style={styles.metricHeaderRow}>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                  {metric.isBaseline ? <Text style={styles.metricBadge}>Base</Text> : null}
                </View>
                <Text style={styles.metricValue}>{formatMetricValue(metric)}</Text>
                <Text style={styles.metricMeta}>{new Date(metric.recordedAt).toLocaleDateString()}</Text>
                {metric.notes ? <Text style={styles.metricNotes}>{metric.notes}</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.helperText}>Aún no registraste evolución técnica en este programa.</Text>
        )}
      </View>
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
    heroChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    heroChip: { backgroundColor: C.amberDim, borderWidth: 1, borderColor: C.amberBorder, borderRadius: R.full, paddingHorizontal: S.sm, paddingVertical: 6 },
    heroChipText: { color: C.amber, fontSize: 12, fontWeight: "700" },
    sectionCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.md, gap: S.sm, borderWidth: 1, borderColor: C.border },
    sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
    sectionEyebrow: { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
    sectionTitle: { color: C.text, fontSize: 18, fontWeight: "800" },
    mediaCard: { gap: S.xs, paddingTop: S.xs },
    mediaTitle: { color: C.text, fontSize: 14, fontWeight: "700" },
    video: { width: "100%", height: 220, borderRadius: R.lg, backgroundColor: C.surfaceRaise },
    image: { width: "100%", height: 220, borderRadius: R.lg, backgroundColor: C.surfaceRaise },
    mediaPlaceholder: { height: 160, borderRadius: R.lg, backgroundColor: C.surfaceRaise, justifyContent: "center", alignItems: "center" },
    mediaPlaceholderText: { color: C.textMuted, fontSize: 13 },
    helperText: { color: C.textSub, fontSize: 13, lineHeight: 19 },
    formGrid: { gap: S.sm },
    input: { backgroundColor: C.surfaceRaise, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, color: C.text, fontSize: 14 },
    notesInput: { minHeight: 84, textAlignVertical: "top" },
    toggleRow: { backgroundColor: C.surfaceRaise, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: 12 },
    toggleRowActive: { borderColor: C.amberBorder, backgroundColor: C.amberDim },
    toggleText: { color: C.textSub, fontSize: 13, fontWeight: "700" },
    primaryButton: { backgroundColor: C.amber, borderRadius: R.full, paddingVertical: 14, alignItems: "center" },
    primaryButtonText: { color: C.bg, fontWeight: "800", fontSize: 15 },
    ghostButton: { paddingHorizontal: S.md, paddingVertical: 10, borderRadius: R.full, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surfaceRaise },
    ghostButtonText: { color: C.textSub, fontWeight: "700", fontSize: 13 },
    metricList: { gap: S.sm },
    metricCard: { backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.md, gap: 4, borderWidth: 1, borderColor: C.border },
    metricHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
    metricLabel: { color: C.text, fontSize: 14, fontWeight: "700" },
    metricValue: { color: C.amber, fontSize: 22, fontWeight: "800" },
    metricMeta: { color: C.textMuted, fontSize: 12 },
    metricNotes: { color: C.textSub, fontSize: 13, lineHeight: 18 },
    metricBadge: { color: C.teal, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
    comparisonRow: { flexDirection: "row", gap: S.sm, marginTop: 4 },
    comparisonCell: { flex: 1, backgroundColor: C.surface, borderRadius: R.md, padding: S.sm, borderWidth: 1, borderColor: C.border },
    comparisonLabel: { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
    comparisonValue: { color: C.text, fontSize: 15, fontWeight: "800", marginTop: 4 },
    comparisonDelta: { fontSize: 12, fontWeight: "800" },
    comparisonDeltaNeutral: { color: C.textMuted },
    comparisonDeltaUp: { color: C.teal },
    comparisonDeltaDown: { color: C.danger },
  });
}
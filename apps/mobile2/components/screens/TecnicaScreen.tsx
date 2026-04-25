import { useMemo, useState } from "react";
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

interface TecnicaScreenProps {
  technique: TechniqueData | null;
  techniques: TechniqueEntry[];
  selectedTechniqueId: string | null;
  loading: boolean;
  submitting: boolean;
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

export default function TecnicaScreen({
  technique,
  techniques,
  selectedTechniqueId,
  loading,
  submitting,
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

  const selectedMeasurement = useMemo(
    () => selectedTechnique?.measurementDefinitions.find((entry) => entry.id === selectedMeasurementId)
      ?? selectedTechnique?.measurementDefinitions[0]
      ?? null,
    [selectedMeasurementId, selectedTechnique],
  );

  const availableUnits = selectedMeasurement ? parseAllowedUnits(selectedMeasurement.allowedUnits) : [];
  const comparisons = selectedTechnique ? buildMetricComparisons(selectedTechnique.metrics) : [];

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
        <Text style={styles.heroBody}>Elegí una técnica para ver su video, cómo medirla y el histórico de progreso.</Text>
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
            <Text style={styles.sectionEyebrow}>Seguimiento técnico</Text>
            <Text style={styles.sectionTitle}>Nueva medición</Text>
            {selectedTechnique.measurementDefinitions.length ? (
              <>
                <View style={styles.selectorWrap}>
                  {selectedTechnique.measurementDefinitions.map((definition) => (
                    <Pressable
                      key={definition.id}
                      style={[styles.selectorChip, selectedMeasurement?.id === definition.id ? styles.selectorChipActive : null]}
                      onPress={() => {
                        setSelectedMeasurementId(definition.id);
                        setUnit(parseAllowedUnits(definition.allowedUnits)[0] ?? "");
                      }}
                    >
                      <Text style={[styles.selectorChipText, selectedMeasurement?.id === definition.id ? styles.selectorChipTextActive : null]}>{definition.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {selectedMeasurement?.instructions ? <Text style={styles.helperText}>{selectedMeasurement.instructions}</Text> : null}
              </>
            ) : (
              <Text style={styles.helperText}>Esta técnica todavía no tiene mediciones configuradas desde admin.</Text>
            )}

            <View style={styles.formGrid}>
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={setValue}
                keyboardType="decimal-pad"
                placeholder="valor"
                placeholderTextColor={C.textDisabled}
              />
              {availableUnits.length ? (
                <View style={styles.selectorWrap}>
                  {availableUnits.map((candidate) => (
                    <Pressable
                      key={candidate}
                      style={[styles.selectorChip, unit === candidate ? styles.selectorChipActive : null]}
                      onPress={() => setUnit(candidate)}
                    >
                      <Text style={[styles.selectorChipText, unit === candidate ? styles.selectorChipTextActive : null]}>{candidate}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="unidad"
                  placeholderTextColor={C.textDisabled}
                />
              )}
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

            <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={submitting || !value.trim()}>
              <Text style={styles.primaryButtonText}>{submitting ? "Guardando..." : "Guardar medición"}</Text>
            </Pressable>
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
  });
}

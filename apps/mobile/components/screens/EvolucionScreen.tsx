import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { R, S } from "../tokens";
import { useTheme } from "../ThemeContext";
import type { AthleteProgress, TrendWindow } from "../types";

function formatDate(v: string) { return new Date(v).toLocaleDateString(); }

interface EvolucionScreenProps {
  progress: AthleteProgress | null;
  trendWindow: TrendWindow;
  selectedCycleId: string | null;
  loading: boolean;
  onSetTrendWindow: (w: TrendWindow) => void;
  onSetSelectedCycleId: (id: string | null) => void;
  onShowJumpGuide: () => void;
}

const WINDOWS: { label: string; value: TrendWindow }[] = [
  { label: "7 días",  value: "7D"  },
  { label: "28 días", value: "28D" },
  { label: "Todo",    value: "ALL" },
];

export default function EvolucionScreen({
  progress,
  trendWindow,
  selectedCycleId,
  loading,
  onSetTrendWindow,
  onSetSelectedCycleId,
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

  // Filter trends for selected window
  const windowTrends = jumpTrendPoints.slice(
    trendWindow === "7D" ? -7 : trendWindow === "28D" ? -28 : 0
  );

  const maxJump = windowTrends.length
    ? Math.max(...windowTrends.map((t) => t.value ?? 0), 0)
    : 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ── PB Cards ──────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>↑ RÉCORDS PERSONALES</Text>
      <View style={styles.pbRow}>
        <View style={[styles.pbCard, { borderColor: C.amberBorder }]}>
          <Text style={styles.pbEyebrow}>SALTO</Text>
          <Text style={[styles.pbValue, { color: C.amber }]}>
            {typeof pb.jumpHeightCm === "number" ? `${pb.jumpHeightCm} cm` : "–"}
          </Text>
        </View>
        <View style={[styles.pbCard, { borderColor: C.tealBorder }]}>
          <Text style={styles.pbEyebrow}>CARGA</Text>
          <Text style={[styles.pbValue, { color: C.teal }]}>
            {typeof pb.avgLoadKg === "number" ? `${pb.avgLoadKg} kg` : "–"}
          </Text>
        </View>
        <View style={[styles.pbCard, { borderColor: `${C.textSub}44` }]}>
          <Text style={styles.pbEyebrow}>VEL.</Text>
          <Text style={[styles.pbValue, { color: C.textSub }]}>
            {typeof pb.peakVelocityMps === "number" ? `${pb.peakVelocityMps} m/s` : "–"}
          </Text>
        </View>
      </View>

      {/* ── Summary stats ─────────────────────────────────── */}
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

      {/* ── Trend chart (bar viz) ──────────────────────────── */}
      {windowTrends.length > 0 ? (
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Tendencia de salto</Text>
            <View style={styles.windowPicker}>
              {WINDOWS.map((w) => (
                <Pressable
                  key={w.value}
                  style={[styles.windowBtn, trendWindow === w.value && styles.windowBtnActive]}
                  onPress={() => onSetTrendWindow(w.value)}
                >
                  <Text style={[styles.windowBtnText, trendWindow === w.value && styles.windowBtnTextActive]}>
                    {w.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.bars}>
            {windowTrends.slice(-20).map((t, i) => {
              const val = t.value ?? 0;
              const pct = maxJump > 0 ? val / maxJump : 0;
              return (
                <View key={`t-${i}`} style={styles.barWrap}>
                  <View
                    style={[
                      styles.bar,
                      { height: Math.max(pct * 80, 4), backgroundColor: val === maxJump ? C.amber : C.teal },
                    ]}
                  />
                  <Text style={styles.barLabel}>
                    {t.date ? new Date(t.date).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" }) : ""}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* ── Jump tests history ────────────────────────────── */}
      <View style={styles.jumpSection}>
        <View style={styles.jumpHeader}>
          <Text style={styles.sectionTitle}>Historial de test de salto</Text>
          <Pressable style={styles.howToBtn} onPress={onShowJumpGuide}>
            <Text style={styles.howToBtnText}>? Cómo medir</Text>
          </Pressable>
        </View>

        {recentLogs.filter((l) => typeof l.metrics?.jumpTestBestCm === "number").length === 0 ? (
          <View style={styles.noJump}>
            <Text style={styles.noJumpText}>Aún no hay test de salto registrados.</Text>
            <Pressable style={styles.howToBtnLarge} onPress={onShowJumpGuide}>
              <Text style={styles.howToBtnLargeText}>? Aprendé a medirlo</Text>
            </Pressable>
          </View>
        ) : (
          recentLogs
            .filter((l) => typeof l.metrics?.jumpTestBestCm === "number")
            .slice(0, 10)
            .map((l, i) => (
              <View key={l.id ?? `log-${i}`} style={styles.jumpRow}>
                <View style={[styles.jumpDot, { backgroundColor: i === 0 ? C.amber : C.teal }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.jumpVal}>{l.metrics!.jumpTestBestCm} cm</Text>
                  <Text style={styles.jumpDate}>{l.createdAt ? formatDate(l.createdAt) : ""}</Text>
                </View>
                {i === 0 ? (
                  <View style={styles.latestBadge}>
                    <Text style={styles.latestBadgeText}>Último</Text>
                  </View>
                ) : null}
              </View>
            ))
        )}
      </View>

      {/* ── Cycle summaries ───────────────────────────────── */}
      {cycleEvolution.length > 0 ? (
        <View style={styles.cycleSection}>
          <Text style={styles.sectionTitle}>Ciclos completados</Text>
          {cycleEvolution.map((c) => {
            const isSelected = c.id === selectedCycleId;
            return (
              <Pressable
                key={c.id}
                style={[styles.cycleRow, isSelected && styles.cycleRowActive]}
                onPress={() => onSetSelectedCycleId(isSelected ? null : c.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cycleName}>{c.name}</Text>
                  <Text style={styles.cycleMeta}>
                    {c.completedSessions}/{c.totalSessions} sesiones  ·  {Math.round(c.completionRate)}%
                  </Text>
                </View>
                {typeof c.bestJumpCm === "number" ? (
                  <Text style={[styles.cycleJump, { color: C.amber }]}>{c.bestJumpCm} cm</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
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

  // PB cards
  pbRow: { flexDirection: "row", gap: S.sm },
  pbCard: { flex: 1, backgroundColor: C.surface, borderRadius: R.xl, padding: S.sm, gap: 2, borderWidth: 1, alignItems: "center" },
  pbEyebrow: { color: C.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  pbValue: { fontSize: 22, fontWeight: "800" },
  pbDate: { color: C.textMuted, fontSize: 10 },

  // Summary
  summaryRow: { flexDirection: "row", gap: S.sm },
  summaryCell: { flex: 1, backgroundColor: C.surface, borderRadius: R.lg, padding: S.sm, alignItems: "center", gap: 2, borderWidth: 1, borderColor: C.border },
  summaryVal: { color: C.text, fontSize: 20, fontWeight: "800" },
  summaryLabel: { color: C.textMuted, fontSize: 11 },

  // Chart
  chartCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.md, gap: S.sm, borderWidth: 1, borderColor: C.border },
  chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chartTitle: { color: C.text, fontWeight: "700", fontSize: 14 },
  windowPicker: { flexDirection: "row", gap: 4 },
  windowBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: R.full, backgroundColor: C.surfaceRaise },
  windowBtnActive: { backgroundColor: C.amberDim, borderWidth: 1, borderColor: C.amberBorder },
  windowBtnText: { color: C.textMuted, fontSize: 12, fontWeight: "600" },
  windowBtnTextActive: { color: C.amber, fontWeight: "700" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 100 },
  barWrap: { flex: 1, alignItems: "center", gap: 4, justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: R.sm, minHeight: 4 },
  barLabel: { color: C.textMuted, fontSize: 8 },

  // Jump tests
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

  // Cycle summaries
  cycleSection: { gap: S.xs },
  cycleRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, paddingVertical: S.sm, paddingHorizontal: S.md, gap: S.sm, borderWidth: 1, borderColor: C.border },
  cycleRowActive: { borderColor: C.amberBorder, backgroundColor: C.amberDim },
  cycleName: { color: C.text, fontWeight: "700", fontSize: 14 },
  cycleMeta: { color: C.textMuted, fontSize: 12 },
  cycleJump: { fontSize: 16, fontWeight: "800" },
});
}

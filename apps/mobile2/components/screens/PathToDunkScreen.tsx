/**
 * PathToDunkScreen — "Dashboard Path to the Dunk"
 *
 * Line chart (SVG) showing:
 *   X axis = week number in the program
 *   Y axis = Potencia Teórica (sum of LOWER zone volume × phase factor)
 *   Secondary overlay = Bouncy Score (dashed teal line)
 *
 * Data comes from GET /api/v1/athlete/progress/power-path
 */

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { C, R, S } from "@mobile/components/tokens";
import { useTheme } from "@mobile/components/ThemeContext";

interface PowerPathPoint {
  week: number;
  weekStartDate: string;
  powerScore: number;
  bouncyScore: number | null;
  phaseLabel: string;
}

interface LoadTrendEntry {
  exerciseId: string;
  exerciseName: string;
  firstLoadKg: number | null;
  lastLoadKg: number | null;
  deltaPct: number;
  records: { date: string; loadKg: number; repsPerformed: number | null }[];
}

interface Props {
  accessToken: string | null;
  apiBaseUrl: string;
  onBack: () => void;
}

const CHART_W = 320;
const CHART_H = 180;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 32;

function scaleX(week: number, minW: number, maxW: number): number {
  if (maxW === minW) return PAD_L;
  return PAD_L + ((week - minW) / (maxW - minW)) * (CHART_W - PAD_L - PAD_R);
}

function scaleY(value: number, minV: number, maxV: number): number {
  if (maxV === minV) return PAD_T + (CHART_H - PAD_T - PAD_B) / 2;
  return (
    CHART_H - PAD_B - ((value - minV) / (maxV - minV)) * (CHART_H - PAD_T - PAD_B)
  );
}

function buildPolylinePoints(
  points: PowerPathPoint[],
  getValue: (p: PowerPathPoint) => number | null,
  minW: number,
  maxW: number,
  minV: number,
  maxV: number,
): string {
  return points
    .filter((p) => getValue(p) !== null)
    .map((p) => `${scaleX(p.week, minW, maxW)},${scaleY(getValue(p) as number, minV, maxV)}`)
    .join(" ");
}

function phaseColor(phase: string): string {
  if (phase.toUpperCase().includes("POWER")) return "#a78bfa"; // purple
  if (phase.toUpperCase().includes("BASE")) return "#38bdf8"; // sky
  return "#fb923c"; // orange / prep
}

export default function PathToDunkScreen({ accessToken, apiBaseUrl, onBack }: Props) {
  const { C } = useTheme();
  const styles = makeStyles(C);

  const [data, setData] = useState<PowerPathPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadTrend, setLoadTrend] = useState<LoadTrendEntry[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${apiBaseUrl}/api/v1/athlete/progress/power-path`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PowerPathPoint[]>;
      }),
      fetch(`${apiBaseUrl}/api/v1/athlete/progress/load-trend`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(async (res) => (res.ok ? res.json() as Promise<LoadTrendEntry[]> : [])),
    ])
      .then(([powerData, trendData]) => {
        setData(powerData);
        setLoadTrend(trendData);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Error desconocido");
      })
      .finally(() => setLoading(false));
  }, [accessToken, apiBaseUrl]);

  const hasData = data.length >= 1;
  const minW = hasData ? Math.min(...data.map((d) => d.week)) : 1;
  const maxW = hasData ? Math.max(...data.map((d) => d.week)) : 1;
  const maxPower = hasData ? Math.max(...data.map((d) => d.powerScore), 1) : 100;
  const minPower = 0;
  const bouncyPoints = data.filter((d) => d.bouncyScore !== null);
  const maxBouncy = bouncyPoints.length > 0 ? Math.max(...bouncyPoints.map((d) => d.bouncyScore as number), 1) : 10;
  const minBouncy = 0;

  const powerPolyline = hasData
    ? buildPolylinePoints(data, (p) => p.powerScore, minW, maxW, minPower, maxPower)
    : "";
  const bouncyPolyline = bouncyPoints.length > 1
    ? buildPolylinePoints(bouncyPoints, (p) => p.bouncyScore, minW, maxW, minBouncy, maxBouncy)
    : "";

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </Pressable>
        <Text style={styles.title}>⬆ Path to the Dunk</Text>
      </View>

      <Text style={styles.subtitle}>
        Potencia teórica semanal · Zona Lower × factor de fase
      </Text>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: C.amber }]} />
          <Text style={styles.legendLabel}>Potencia (Lower)</Text>
        </View>
        {bouncyPolyline ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: C.teal }]} />
            <Text style={styles.legendLabel}>Elasticidad semanal</Text>
          </View>
        ) : null}
      </View>

      {/* Chart area */}
      <View style={styles.chartWrap}>
        {loading ? (
          <ActivityIndicator color={C.amber} size="large" />
        ) : error ? (
          <Text style={styles.errorText}>Error: {error}</Text>
        ) : !hasData ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>Sin datos aún</Text>
            <Text style={styles.emptySub}>
              Completá sesiones con ejercicios de zona Lower para ver tu progresión de potencia.
            </Text>
          </View>
        ) : (
          <Svg width={CHART_W} height={CHART_H}>
            {/* Y-axis label lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
              const yVal = Math.round(frac * maxPower);
              const y = scaleY(yVal, minPower, maxPower);
              return (
                <Line key={i} x1={PAD_L} y1={y} x2={CHART_W - PAD_R} y2={y} stroke={C.border} strokeWidth={1} strokeDasharray="3,3" />
              );
            })}

            {/* X-axis labels (week numbers) */}
            {data.map((pt) => {
              const x = scaleX(pt.week, minW, maxW);
              return (
                <SvgText key={pt.week} x={x} y={CHART_H - 8} fontSize={9} fill={C.textMuted} textAnchor="middle">
                  {`S${pt.week}`}
                </SvgText>
              );
            })}

            {/* Y-axis labels */}
            {[0, 0.5, 1].map((frac, i) => {
              const yVal = Math.round(frac * maxPower);
              const y = scaleY(yVal, minPower, maxPower);
              return (
                <SvgText key={i} x={PAD_L - 4} y={y + 4} fontSize={8} fill={C.textMuted} textAnchor="end">
                  {yVal}
                </SvgText>
              );
            })}

            {/* Power line */}
            {powerPolyline ? (
              <Polyline
                points={powerPolyline}
                fill="none"
                stroke={C.amber}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}

            {/* Power dots */}
            {data.map((pt) => (
              <Circle
                key={pt.week}
                cx={scaleX(pt.week, minW, maxW)}
                cy={scaleY(pt.powerScore, minPower, maxPower)}
                r={4}
                fill={phaseColor(pt.phaseLabel)}
                stroke={C.bg}
                strokeWidth={1}
              />
            ))}

            {/* Bouncy line (dashed, teal, scaled 1-10 on same chart) */}
            {bouncyPolyline ? (
              <Polyline
                points={bouncyPolyline}
                fill="none"
                stroke={C.teal}
                strokeWidth={1.5}
                strokeDasharray="4,3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}

            {/* Bouncy dots */}
            {bouncyPoints.map((pt) => (
              <Circle
                key={`b${pt.week}`}
                cx={scaleX(pt.week, minW, maxW)}
                cy={scaleY(pt.bouncyScore as number, minBouncy, maxBouncy)}
                r={3}
                fill={C.teal}
                stroke={C.bg}
                strokeWidth={1}
              />
            ))}
          </Svg>
        )}
      </View>

      {/* Weekly breakdown table */}
      {hasData && !loading ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, styles.tableCellHead, { flex: 1 }]}>Semana</Text>
            <Text style={[styles.tableCell, styles.tableCellHead, { flex: 2 }]}>Fecha inicio</Text>
            <Text style={[styles.tableCell, styles.tableCellHead, { flex: 2 }]}>Potencia</Text>
            <Text style={[styles.tableCell, styles.tableCellHead, { flex: 1.5 }]}>Elasticidad</Text>
          </View>
          {data.map((pt) => (
            <View key={pt.week} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 1 }]}>S{pt.week}</Text>
              <Text style={[styles.tableCell, { flex: 2 }]}>{pt.weekStartDate}</Text>
              <Text style={[styles.tableCell, styles.tableCellPower, { flex: 2 }]}>{pt.powerScore}</Text>
              <Text style={[styles.tableCell, styles.tableCellBouncy, { flex: 1.5 }]}>
                {pt.bouncyScore !== null ? `${pt.bouncyScore}/10` : "—"}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* ── Load progression section ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>🏋️ Progresión de cargas</Text>
        <Text style={styles.subtitle}>Evolución del peso usado en ejercicios con carga</Text>
      </View>

      {!loading && loadTrend.length === 0 ? (
        <View style={[styles.chartWrap, { minHeight: 80 }]}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Sin datos de carga aún</Text>
            <Text style={styles.emptySub}>
              Registrá el peso usado en los ejercicios con carga durante tus sesiones para ver tu progresión aquí.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, styles.tableCellHead, { flex: 3 }]}>Ejercicio</Text>
            <Text style={[styles.tableCell, styles.tableCellHead, { flex: 1.5 }]}>Inicio</Text>
            <Text style={[styles.tableCell, styles.tableCellHead, { flex: 1.5 }]}>Actual</Text>
            <Text style={[styles.tableCell, styles.tableCellHead, { flex: 1.5 }]}>Δ%</Text>
          </View>
          {loadTrend.map((entry) => (
            <View key={entry.exerciseId} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 3 }]} numberOfLines={2}>{entry.exerciseName}</Text>
              <Text style={[styles.tableCell, styles.tableCellPower, { flex: 1.5 }]}>
                {entry.firstLoadKg != null ? `${entry.firstLoadKg}kg` : "—"}
              </Text>
              <Text style={[styles.tableCell, styles.tableCellPower, { flex: 1.5 }]}>
                {entry.lastLoadKg != null ? `${entry.lastLoadKg}kg` : "—"}
              </Text>
              <Text style={[
                styles.tableCell,
                { flex: 1.5, fontWeight: "700" },
                entry.deltaPct > 0 ? { color: C.teal } : entry.deltaPct < 0 ? { color: "#e07070" } : { color: C.textMuted },
              ]}>
                {entry.deltaPct > 0 ? `+${entry.deltaPct}%` : entry.deltaPct < 0 ? `${entry.deltaPct}%` : "—"}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>["C"]) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: C.bg },
    container: { padding: S.md, gap: S.md, paddingBottom: S.xl },
    header: { flexDirection: "row", alignItems: "center", gap: S.sm },
    backBtn: { paddingVertical: 8, paddingHorizontal: S.sm, backgroundColor: C.surfaceRaise, borderRadius: R.full },
    backBtnText: { color: C.text, fontWeight: "700", fontSize: 16 },
    title: { color: C.text, fontSize: 20, fontWeight: "800", flex: 1 },
    subtitle: { color: C.textSub, fontSize: 13, lineHeight: 19 },
    legend: { flexDirection: "row", gap: S.md, flexWrap: "wrap" },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendLabel: { color: C.textSub, fontSize: 12 },
    chartWrap: {
      backgroundColor: C.surface,
      borderRadius: R.xl,
      padding: S.md,
      borderWidth: 1,
      borderColor: C.border,
      minHeight: CHART_H + S.md * 2,
      alignItems: "center",
      justifyContent: "center",
    },
    errorText: { color: C.danger, fontSize: 13 },
    emptyState: { alignItems: "center", gap: S.sm, padding: S.lg },
    emptyIcon: { fontSize: 42 },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
    emptySub: { color: C.textSub, fontSize: 13, lineHeight: 18, textAlign: "center" },
    table: { backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
    tableHeader: { flexDirection: "row", backgroundColor: C.surfaceRaise, padding: S.sm },
    tableRow: { flexDirection: "row", padding: S.sm, borderTopWidth: 1, borderColor: C.border },
    tableCell: { color: C.textSub, fontSize: 12 },
    tableCellHead: { color: C.textMuted, fontWeight: "700", textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 },
    tableCellPower: { color: C.amber, fontWeight: "700" },
    tableCellBouncy: { color: C.teal, fontWeight: "700" },
    sectionHeader: { gap: 2, marginTop: S.sm },
    sectionTitle: { color: C.text, fontSize: 17, fontWeight: "800" },
  });
}

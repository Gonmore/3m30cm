/**
 * EvolucionCombinedScreen
 *
 * Wraps "Mejora" (EvolucionScreen) and "Camino al Dunk" (PathToDunkScreen)
 * under a single "Evolución" entry in the drawer, with two sub-tabs.
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@mobile/components/ThemeContext";
import { R, S } from "@mobile/components/tokens";
import EvolucionScreen from "@mobile/components/screens/EvolucionScreen";
import PathToDunkScreen from "./PathToDunkScreen";
import type { AthleteProgress, TrendWindow } from "@mobile/components/types";

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

interface EvolucionCombinedScreenProps {
  // ─── Mejora tab (EvolucionScreen) ────────────────────
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
  // ─── Camino al Dunk tab (PathToDunkScreen) ───────────
  accessToken: string | null;
  apiBaseUrl: string;
}

type Tab = "mejora" | "camino";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "mejora", label: "Mejora", emoji: "📈" },
  { id: "camino", label: "Camino al Dunk", emoji: "⬆️" },
];

export default function EvolucionCombinedScreen({
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
  accessToken,
  apiBaseUrl,
}: EvolucionCombinedScreenProps) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const [activeTab, setActiveTab] = useState<Tab>("mejora");

  return (
    <View style={styles.root}>
      {/* ── Sub-tab bar ───────────────────────────────── */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={styles.tabEmoji}>{tab.emoji}</Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              {isActive ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>

      {/* ── Tab content ───────────────────────────────── */}
      <View style={styles.content}>
        {activeTab === "mejora" ? (
          <EvolucionScreen
            progress={progress}
            techniques={techniques}
            comparisonTechniqueIds={comparisonTechniqueIds}
            trendWindow={trendWindow}
            selectedCycleId={selectedCycleId}
            loading={loading}
            onSetTrendWindow={onSetTrendWindow}
            onSetSelectedCycleId={onSetSelectedCycleId}
            onSetComparisonTechniqueIds={onSetComparisonTechniqueIds}
            onShowJumpGuide={onShowJumpGuide}
          />
        ) : (
          <PathToDunkScreen
            accessToken={accessToken}
            apiBaseUrl={apiBaseUrl}
            // No onBack needed — back is handled by the drawer navigation
            onBack={() => setActiveTab("mejora")}
          />
        )}
      </View>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>["C"]) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    tabBar: {
      flexDirection: "row",
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      paddingHorizontal: S.md,
    },
    tab: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 12,
      gap: 4,
      position: "relative",
    },
    tabActive: {},
    tabEmoji: { fontSize: 20 },
    tabLabel: {
      color: C.textMuted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    tabLabelActive: { color: C.amber },
    tabIndicator: {
      position: "absolute",
      bottom: 0,
      left: "20%",
      right: "20%",
      height: 3,
      backgroundColor: C.amber,
      borderTopLeftRadius: 2,
      borderTopRightRadius: 2,
    },
    content: { flex: 1 },
  });
}

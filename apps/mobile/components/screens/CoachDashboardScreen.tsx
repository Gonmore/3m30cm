import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMemo } from "react";
import { useTheme } from "../ThemeContext";
import { R, S } from "../tokens";
import type { ColorPalette } from "../ThemeContext";

// ─── API Types ────────────────────────────────────────────────────────────────

interface CoachUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface AthleteCard {
  id: string;
  displayName: string | null;
  sport: string | null;
  user: CoachUser;
  team: { id: string; name: string } | null;
  personalPrograms: Array<{
    id: string;
    name: string;
    phase: string;
    status: string;
    startDate: string;
    sessions: Array<{
      id: string;
      title: string;
      status: string;
      scheduledDate: string;
    }>;
  }>;
  sessionLogs: Array<{
    id: string;
    createdAt: string;
    scheduledSession: {
      id: string;
      title: string;
      status: string;
    } | null;
  }>;
}

interface DashboardMetrics {
  athletes: number;
  activePrograms: number;
  recentLogs: number;
}

interface CoachDashboardData {
  coach: CoachUser;
  metrics: DashboardMetrics;
  athletes: AthleteCard[];
}

interface CoachDashboardScreenProps {
  accessToken: string;
  apiBase: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDisplayName(athlete: AthleteCard): string {
  if (athlete.displayName) return athlete.displayName;
  const { firstName, lastName } = athlete.user;
  if (firstName || lastName) return `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return athlete.user.email;
}

function getInitials(athlete: AthleteCard): string {
  const name = getDisplayName(athlete);
  return name.slice(0, 2).toUpperCase();
}

function getStatusColor(status: string, C: ColorPalette): string {
  switch (status.toUpperCase()) {
    case "COMPLETED": return C.teal;
    case "IN_PROGRESS": return C.amber;
    case "SKIPPED": return C.danger;
    default: return C.textMuted;
  }
}

// ─── Styles ────────────────────────────────────────────────────────────────

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: C.bg,
    },
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: S.md,
    },
    loadingText: {
      color: C.textMuted,
      fontSize: 14,
    },
    errorContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: S.lg,
      gap: S.md,
    },
    errorText: {
      color: C.danger,
      fontSize: 15,
      textAlign: "center",
    },
    retryBtn: {
      backgroundColor: C.amber,
      borderRadius: R.full,
      paddingVertical: 10,
      paddingHorizontal: S.lg,
    },
    retryBtnText: {
      color: C.bg,
      fontWeight: "700",
      fontSize: 14,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: S.lg,
      paddingTop: S.md,
      paddingBottom: S.xl,
      gap: S.lg,
    },
    // ── Hero ──
    heroCard: {
      backgroundColor: C.surface,
      borderRadius: R.xl,
      padding: S.lg,
      borderWidth: 1,
      borderColor: C.amberBorder,
    },
    heroEyebrow: {
      color: C.amber,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    heroTitle: {
      color: C.text,
      fontSize: 22,
      fontWeight: "800",
      marginBottom: S.md,
    },
    metricsRow: {
      flexDirection: "row",
      gap: S.sm,
    },
    metricPill: {
      flex: 1,
      backgroundColor: C.surfaceRaise,
      borderRadius: R.lg,
      padding: S.sm,
      alignItems: "center",
      gap: 2,
    },
    metricValue: {
      color: C.amber,
      fontSize: 24,
      fontWeight: "800",
    },
    metricLabel: {
      color: C.textMuted,
      fontSize: 11,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    // ── Section ──
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: "700",
    },
    sectionCount: {
      color: C.textMuted,
      fontSize: 13,
    },
    // ── Athlete card ──
    athleteCard: {
      backgroundColor: C.surface,
      borderRadius: R.xl,
      padding: S.md,
      borderWidth: 1,
      borderColor: C.border,
    },
    athleteCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
      marginBottom: S.sm,
    },
    athleteAvatar: {
      width: 40,
      height: 40,
      borderRadius: R.full,
      backgroundColor: C.amberDim,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.amberBorder,
    },
    athleteAvatarText: {
      color: C.amber,
      fontWeight: "800",
      fontSize: 14,
    },
    athleteInfo: {
      flex: 1,
    },
    athleteName: {
      color: C.text,
      fontWeight: "700",
      fontSize: 15,
    },
    athleteMeta: {
      color: C.textMuted,
      fontSize: 12,
      marginTop: 1,
    },
    teamBadge: {
      backgroundColor: C.tealDim,
      borderRadius: R.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: C.tealBorder,
    },
    teamBadgeText: {
      color: C.teal,
      fontSize: 11,
      fontWeight: "600",
    },
    programRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
    },
    programLabel: {
      color: C.textSub,
      fontSize: 13,
      flex: 1,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    sessionsRow: {
      flexDirection: "row",
      gap: 6,
      flexWrap: "wrap",
    },
    sessionChip: {
      borderRadius: R.sm,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
    },
    sessionChipText: {
      fontSize: 11,
      fontWeight: "600",
    },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      padding: S.xl,
      gap: S.sm,
    },
    emptyStateText: {
      color: C.textMuted,
      fontSize: 14,
      textAlign: "center",
    },
    recentActivityCard: {
      backgroundColor: C.surface,
      borderRadius: R.xl,
      padding: S.md,
      borderWidth: 1,
      borderColor: C.border,
      gap: S.sm,
    },
    activityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
    },
    activityIcon: {
      width: 32,
      height: 32,
      borderRadius: R.full,
      backgroundColor: C.tealDim,
      alignItems: "center",
      justifyContent: "center",
    },
    activityText: {
      flex: 1,
      color: C.textSub,
      fontSize: 13,
    },
    activityTime: {
      color: C.textMuted,
      fontSize: 11,
    },
    divider: {
      height: 1,
      backgroundColor: C.border,
    },
  });

// ─── Main Component ────────────────────────────────────────────────────────

export default function CoachDashboardScreen({ accessToken, apiBase }: CoachDashboardScreenProps) {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [data, setData] = useState<CoachDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await fetch(`${apiBase}/api/v1/coach/dashboard`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? `Error ${res.status}`);
      }

      const json = (await res.json()) as CoachDashboardData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el panel");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, apiBase]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={C.amber} size="large" />
        <Text style={styles.loadingText}>Cargando panel...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning-outline" size={40} color={C.danger} />
        <Text style={styles.errorText}>{error ?? "Sin datos disponibles"}</Text>
        <Pressable style={styles.retryBtn} onPress={() => void fetchDashboard()}>
          <Text style={styles.retryBtnText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  const coachName = data.coach.firstName
    ? `${data.coach.firstName}${data.coach.lastName ? ` ${data.coach.lastName}` : ""}`
    : data.coach.email;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void fetchDashboard(true)}
          tintColor={C.amber}
          colors={[C.amber]}
        />
      }
    >
      {/* ── Hero metrics ── */}
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Panel de entrenador</Text>
        <Text style={styles.heroTitle}>Hola, {coachName} 👋</Text>
        <View style={styles.metricsRow}>
          <View style={styles.metricPill}>
            <Text style={styles.metricValue}>{data.metrics.athletes}</Text>
            <Text style={styles.metricLabel}>Atletas</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricValue}>{data.metrics.activePrograms}</Text>
            <Text style={styles.metricLabel}>Programas</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricValue}>{data.metrics.recentLogs}</Text>
            <Text style={styles.metricLabel}>Logs recientes</Text>
          </View>
        </View>
      </View>

      {/* ── Athlete list ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Mis atletas</Text>
        <Text style={styles.sectionCount}>{data.athletes.length} total</Text>
      </View>

      {data.athletes.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={40} color={C.textMuted} />
          <Text style={styles.emptyStateText}>No tienes atletas asignados todavía</Text>
        </View>
      ) : (
        data.athletes.map((athlete) => {
          const latestProgram = athlete.personalPrograms[0];
          const upcomingSessions = latestProgram?.sessions ?? [];

          return (
            <View key={athlete.id} style={styles.athleteCard}>
              <View style={styles.athleteCardHeader}>
                <View style={styles.athleteAvatar}>
                  <Text style={styles.athleteAvatarText}>{getInitials(athlete)}</Text>
                </View>
                <View style={styles.athleteInfo}>
                  <Text style={styles.athleteName}>{getDisplayName(athlete)}</Text>
                  <Text style={styles.athleteMeta}>
                    {athlete.sport ?? "Sin deporte"} · {athlete.user.email}
                  </Text>
                </View>
                {athlete.team && (
                  <View style={styles.teamBadge}>
                    <Text style={styles.teamBadgeText}>{athlete.team.name}</Text>
                  </View>
                )}
              </View>

              {latestProgram ? (
                <>
                  <View style={styles.programRow}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: getStatusColor(latestProgram.status, C) },
                      ]}
                    />
                    <Text style={styles.programLabel} numberOfLines={1}>
                      {latestProgram.name} · {latestProgram.phase}
                    </Text>
                  </View>

                  {upcomingSessions.length > 0 && (
                    <View style={styles.sessionsRow}>
                      {upcomingSessions.map((session) => {
                        const color = getStatusColor(session.status, C);
                        return (
                          <View
                            key={session.id}
                            style={[
                              styles.sessionChip,
                              { borderColor: `${color}44`, backgroundColor: `${color}14` },
                            ]}
                          >
                            <Text style={[styles.sessionChipText, { color }]}>
                              {session.title}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              ) : (
                <Text style={{ color: C.textDisabled, fontSize: 12 }}>Sin programa activo</Text>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

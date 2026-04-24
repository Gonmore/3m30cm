/**
 * HoyScreenV2 – Gamified Home Screen
 *
 * Features:
 *  • Animated progress ring (streak hero widget)
 *  • Today's Training CTA card with dynamic intensity glow
 *  • Interactive weekly timeline strip
 *  • Subtle micro-interactions via Animated API
 *
 * Same props interface as the original HoyScreen so it can be
 * swapped in as a drop-in replacement.
 */
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { R, S } from "@mobile/components/tokens";
import { useTheme } from "@mobile/components/ThemeContext";
import type {
  ActiveProgram,
  AthleteProfile,
  AthleteProgress,
  AthleteSetupState,
  PreSessionCheckInState,
  SessionSummary,
} from "@mobile/components/types";

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function formatDate(v: string) {
  return new Date(v).toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const DAY_TYPE_MAP: Record<string, string> = {
  STRENGTH: "Fuerza",
  POWER: "Potencia",
  RECOVERY: "Recuperación",
  CONDITIONING: "Acondicionamiento",
  TECHNIQUE: "Técnica",
  SPEED: "Velocidad",
  ENDURANCE: "Resistencia",
  FLEXIBILITY: "Flexibilidad",
  REST: "Descanso",
  SPORT: "Deporte",
  DELOAD: "Descarga",
};

const DAY_TYPE_INTENSITY: Record<string, "push" | "steady" | "protect"> = {
  STRENGTH: "push",
  POWER: "push",
  SPEED: "push",
  CONDITIONING: "steady",
  TECHNIQUE: "steady",
  ENDURANCE: "steady",
  RECOVERY: "protect",
  FLEXIBILITY: "protect",
  DELOAD: "protect",
  REST: "protect",
  SPORT: "steady",
};

const INTENSITY_LABEL: Record<"push" | "steady" | "protect", string> = {
  push:    "Alta intensidad",
  steady:  "Intensidad media",
  protect: "Recuperación",
};

function translateDayType(v: string): string {
  return DAY_TYPE_MAP[v] ?? v;
}

function sessionIntensity(dayType: string): "push" | "steady" | "protect" {
  return DAY_TYPE_INTENSITY[dayType] ?? "steady";
}

function buildMotivationText(dayType: string, streak: number) {
  const streakLine = streak > 0 ? `Vas con ${streak} dias de racha.` : "Hoy puede empezar tu primera racha fuerte.";

  if (dayType === "STRENGTH") {
    return `${streakLine} Los pesos para evolucionar ya estan programados.`;
  }

  if (dayType === "EXPLOSIVE" || dayType === "POWER" || dayType === "SPEED") {
    return `${streakLine} Hoy manda la velocidad, las alturas y la calidad de cada salto.`;
  }

  return `${streakLine} Tu sesion de hoy ya esta lista para avanzar sin improvisar.`;
}

/** Week strip: Mon→Sun surrounding today. Each item has date + status. */
function buildWeekDays(sessions: Array<{ scheduledDate: string; status: string }>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find Monday of current week
  const dow = today.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const isToday = date.getTime() === today.getTime();
    const isPast = date < today;
    const isFuture = date > today;

    // Find a session on this date
    const match = sessions.find((s) => s.scheduledDate.slice(0, 10) === iso);
    const status = match?.status ?? null;

    return { date, iso, label: ["L", "M", "X", "J", "V", "S", "D"][i], isToday, isPast, isFuture, status };
  });
}

// ─────────────────────────────────────────────────────────────
//  Props  (identical to original HoyScreen for drop-in swap)
// ─────────────────────────────────────────────────────────────

interface HoyScreenV2Props {
  profile: AthleteProfile | null;
  activeProgram: ActiveProgram | null;
  sessions: SessionSummary[];
  progress: AthleteProgress | null;
  todayPrimarySession: { id: string; title: string; dayType: string; status: string; scheduledDate: string } | null;
  todaySessionSummary: SessionSummary | null;
  todayCompletion: number;
  favoriteSessionId: string | null;
  todayCheckIn: PreSessionCheckInState | null;
  athleteSetup: AthleteSetupState;
  loading: boolean;
  refreshing: boolean;
  planningRecommendation: { summary: string; focusAreas: string[] } | null;
  onUpdateCheckIn: (field: keyof Omit<PreSessionCheckInState, "savedAt">, value: string) => void;
  onSaveCheckIn: () => void;
  onClearCheckIn: () => void;
  onStartSession: () => void;
  onPreloadSession: () => void;
  todaySessionCached: boolean;
  preloadBusy: boolean;
  onToggleFavorite: () => void;
  onRefresh: () => void;
  onSetAthleteSetup: (updater: (prev: AthleteSetupState) => AthleteSetupState) => void;
  onSaveOnboarding: () => void;
  onGenerateProgram: () => void;
}

// ─────────────────────────────────────────────────────────────
//  Animated progress ring (pure RN, no SVG deps)
// ─────────────────────────────────────────────────────────────

const RING_SIZE = 140;
const RING_STROKE = 10;

function ProgressRing({ pct, streak, label }: { pct: number; streak: number; label: string }) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const animPct = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animPct, {
      toValue: pct,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);

  // We simulate the ring with two half-circle clips.
  // Left half covers 0-180°, right half covers 180-360°.
  const leftRotation = animPct.interpolate({
    inputRange:  [0, 50,  50,  100],
    outputRange: ["0deg", "0deg", "180deg", "180deg"],
  });
  const rightRotation = animPct.interpolate({
    inputRange:  [0,     50, 100],
    outputRange: ["0deg", "180deg", "360deg"],
  });
  const leftOpacity = animPct.interpolate({
    inputRange:  [0, 0.001, 50, 100],
    outputRange: [0, 1,     1,  1],
  });
  const rightOpacity = animPct.interpolate({
    inputRange:  [0, 50, 50.001, 100],
    outputRange: [0, 0,  1,      1],
  });

  // Pulse on streak > 0
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (streak <= 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [streak > 0]);

  return (
    <Animated.View style={[styles.ringContainer, { transform: [{ scale: pulseAnim }] }]}>
      {/* Track (background ring) */}
      <View style={styles.ringTrack} />

      {/* Right half fill */}
      <View style={styles.ringHalfClip}>
        <Animated.View
          style={[
            styles.ringHalf,
            styles.ringHalfRight,
            { transform: [{ rotate: rightRotation }], opacity: rightOpacity },
          ]}
        />
      </View>

      {/* Left half fill */}
      <View style={[styles.ringHalfClip, { left: 0 }]}>
        <Animated.View
          style={[
            styles.ringHalf,
            styles.ringHalfLeft,
            { transform: [{ rotate: leftRotation }], opacity: leftOpacity },
          ]}
        />
      </View>

      {/* Centre content */}
      <View style={styles.ringCenter}>
        <Text style={styles.ringStreakEmoji}>🔥</Text>
        <Text style={styles.ringStreakValue}>{streak}</Text>
        <Text style={styles.ringStreakLabel}>{label}</Text>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
//  Weekly timeline strip
// ─────────────────────────────────────────────────────────────

function WeekTimeline({ sessions, colors, styles }: { sessions: Array<{ scheduledDate: string; status: string }>; colors: ReturnType<typeof useTheme>["C"]; styles: ReturnType<typeof makeStyles> }) {
  const days = buildWeekDays(sessions);

  return (
    <View style={styles.weekRow}>
      {days.map((day) => {
        const isTrainingDay = day.status !== null;
        const isCompleted = day.status === "COMPLETED";
        const isSkipped   = day.status === "SKIPPED";
        const dotColor = day.status ? ({
          COMPLETED: colors.teal,
          PLANNED: colors.amberDim,
          SKIPPED: colors.danger,
          RESCHEDULED: colors.amber,
          IN_PROGRESS: colors.teal,
          CANCELLED: colors.textDisabled,
        }[day.status] ?? colors.textMuted) : "transparent";

        return (
          <View key={day.iso} style={[styles.weekDayCol, day.isFuture && styles.weekDayFuture]}>
            <Text style={[styles.weekDayLabel, day.isToday && styles.weekDayLabelToday]}>
              {day.label}
            </Text>

            <View style={[
              styles.weekDayCircle,
              day.isToday  && styles.weekDayCircleToday,
              isCompleted  && styles.weekDayCircleCompleted,
              isSkipped    && styles.weekDayCircleSkipped,
              isTrainingDay && !day.isToday && !isCompleted && !isSkipped && styles.weekDayCircleTraining,
            ]}>
              {isCompleted ? (
                <Text style={styles.weekDayCheck}>✓</Text>
              ) : isSkipped ? (
                <Text style={styles.weekDayCheck}>✗</Text>
              ) : day.isToday ? (
                <View style={styles.weekDayTodayDot} />
              ) : isTrainingDay ? (
                <View style={[styles.weekDayDot, { backgroundColor: dotColor }]} />
              ) : null}
            </View>

            <Text style={[styles.weekDayNum, day.isToday && styles.weekDayNumToday]}>
              {day.date.getDate()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
//  Skeleton loader (micro-interaction while refreshing)
// ─────────────────────────────────────────────────────────────

function SkeletonBar({ width = "100%", height = 14, marginTop = 0 }: {
  width?: number | `${number}%`;
  height?: number;
  marginTop?: number;
}) {
  const { C } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const bg = shimmer.interpolate({
    inputRange:  [0,  1],
    outputRange: [C.surfaceRaise, C.surfaceActive],
  });

  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: R.sm,
        backgroundColor: bg,
        marginTop,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
//  Intensity glow wrapper
// ─────────────────────────────────────────────────────────────

function GlowCard({
  children,
  intensity,
  style,
}: {
  children: React.ReactNode;
  intensity: "push" | "steady" | "protect";
  style?: object;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const intensityColor: Record<"push" | "steady" | "protect", string> = {
    push: C.teal,
    steady: C.amber,
    protect: C.textMuted,
  };

  useEffect(() => {
    if (intensity !== "push") { glowAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [intensity]);

  const borderColor = intensity === "push"
    ? glowAnim.interpolate({ inputRange: [0, 1], outputRange: [C.tealBorder, C.teal] })
    : intensity === "steady"
      ? C.amberBorder
      : C.border;

  const shadowOpacity = intensity === "push"
    ? glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.5] })
    : 0;

  return (
    <Animated.View
      style={[
        styles.glowCard,
        {
          borderColor,
          shadowColor: intensityColor[intensity],
          shadowOpacity,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 16,
          elevation: intensity === "push" ? 6 : 0,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
//  No-program hero (onboarding CTA)
// ─────────────────────────────────────────────────────────────

function NoProgram({
  onGenerateProgram,
  loading,
}: {
  onGenerateProgram: () => void;
  loading: boolean;
}) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const [confirmVisible, setConfirmVisible] = useState(false);
  const { C } = useTheme();
  const styles = makeStyles(C);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -6, duration: 600, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0,  duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <>
      <View style={styles.noProgramCard}>
        <Animated.Text style={[styles.noProgramEmoji, { transform: [{ translateY: bounceAnim }] }]}>
          ⚡
        </Animated.Text>
        <Text style={styles.noProgramTitle}>¡Tu aventura empieza aquí!</Text>
        <Text style={styles.noProgramSub}>
          Genera tu programa personalizado y únete al{" "}
          <Text style={{ color: C.amber, fontWeight: "800" }}>5%</Text>
          {" "}que realmente se entrena.
        </Text>

        <View style={styles.noProgramBadgeRow}>
          {["🏆 Plan adaptativo", "📈 Progreso real", "🔥 Racha diaria"].map((b) => (
            <View key={b} style={styles.noProgramBadge}>
              <Text style={styles.noProgramBadgeText}>{b}</Text>
            </View>
          ))}
        </View>

        <Pressable style={({ pressed }) => [styles.noProgramCta, pressed && { opacity: 0.82 }]} onPress={() => setConfirmVisible(true)} disabled={loading}>
          <Text style={styles.noProgramCtaText}>🚀 Quiero mis 30 cm →</Text>
        </Pressable>
      </View>

      {/* Motivational confirm modal */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🔥</Text>
            <Text style={styles.modalTitle}>Tu aventura empieza aqui</Text>
            <Text style={styles.modalBody}>
              Genera tu programa personalizado y unite al{" "}
              <Text style={{ color: C.amber, fontWeight: "800" }}>5%</Text>
              {" "}que realmente se entrena.{"\n\n"}
              Seran 3 meses de constancia y sacrificio que cambiaran tu vida.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtnNo} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.modalBtnNoText}>Mas tarde</Text>
              </Pressable>
              <Pressable
                style={styles.modalBtnYes}
                onPress={() => { setConfirmVisible(false); onGenerateProgram(); }}
              >
                <Text style={styles.modalBtnYesText}>Quiero esos 30 cm →</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Main screen
// ─────────────────────────────────────────────────────────────

export default function HoyScreenV2({
  profile,
  activeProgram,
  sessions,
  progress,
  todayPrimarySession,
  todayCompletion,
  favoriteSessionId,
  todayCheckIn,
  loading,
  refreshing,
  onSaveCheckIn,
  onClearCheckIn,
  onStartSession,
  onPreloadSession,
  todaySessionCached,
  preloadBusy,
  onToggleFavorite,
  onRefresh,
  onUpdateCheckIn,
  onGenerateProgram,
}: HoyScreenV2Props) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const hasProgram   = !!activeProgram;
  const streak       = progress?.summary.currentStreak ?? 0;
  const weeklyPct    = Math.min(progress?.weeklyGoal.completionRate ?? 0, 100);
  const pbJump       = progress?.personalBests.jumpHeightCm ?? null;
  const intensity    = todayPrimarySession
    ? sessionIntensity(todayPrimarySession.dayType)
    : "protect";
  const intensityColor: Record<"push" | "steady" | "protect", string> = {
    push: C.teal,
    steady: C.amber,
    protect: C.textMuted,
  };
  const motivationText = todayPrimarySession
    ? buildMotivationText(todayPrimarySession.dayType, streak)
    : "";

  // ── Stagger-in entrance animation ───────────────────────────
  const entranceAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entranceAnim, {
      toValue: 1,
      duration: 500,
      delay: 80,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);

  const entranceStyle = {
    opacity: entranceAnim,
    transform: [{ translateY: entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  };

  // ── CTA press scale ─────────────────────────────────────────
  const ctaScale = useRef(new Animated.Value(1)).current;
  function animPressIn()  { Animated.spring(ctaScale, { toValue: 0.96, useNativeDriver: true }).start(); }
  function animPressOut() { Animated.spring(ctaScale, { toValue: 1,    useNativeDriver: true }).start(); }

  // ── Check-in expanded state ──────────────────────────────────
  const [checkInOpen, setCheckInOpen] = useState(false);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ╔══════════════════════════════════════════════╗
          ║  HERO: Streak ring + jump delta              ║
          ╚══════════════════════════════════════════════╝ */}
      <Animated.View style={[styles.heroSection, entranceStyle]}>
        <View style={styles.heroLeft}>
          <ProgressRing
            pct={weeklyPct}
            streak={streak}
            label="racha"
          />
        </View>

        <View style={styles.heroRight}>
          {/* Jump delta bar */}
          <View style={styles.heroMetaCard}>
            <Text style={styles.heroMetaEyebrow}>Salto máximo</Text>
            <Text style={styles.heroMetaValue}>
              {pbJump !== null ? `${pbJump} cm` : "–"}
            </Text>
            {typeof progress?.phaseComparison.deltaVsReferencePhaseCm === "number" ? (
              <Text style={[
                styles.heroMetaDelta,
                { color: (progress.phaseComparison.deltaVsReferencePhaseCm ?? 0) >= 0 ? C.teal : C.danger },
              ]}>
                {(progress.phaseComparison.deltaVsReferencePhaseCm ?? 0) >= 0 ? "▲ " : "▼ "}
                {Math.abs(progress.phaseComparison.deltaVsReferencePhaseCm ?? 0).toFixed(1)} cm vs fase anterior
              </Text>
            ) : null}
          </View>

          {/* Weekly target micro-bar */}
          <View style={styles.heroWeeklyCard}>
            <Text style={styles.heroWeeklyLabel}>
              Semana: {progress?.weeklyGoal.completedSessions ?? 0}/{progress?.weeklyGoal.targetSessions ?? 0}
            </Text>
            <View style={styles.heroWeeklyTrack}>
              <Animated.View
                style={[
                  styles.heroWeeklyFill,
                  { width: `${weeklyPct}%` as `${number}%` },
                ]}
              />
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ╔══════════════════════════════════════════════╗
          ║  WEEKLY TIMELINE                             ║
          ╚══════════════════════════════════════════════╝ */}
      <Animated.View style={[entranceStyle, { marginTop: -S.xs }]}>
        <View style={styles.timelineCard}>
          <Text style={styles.timelineEyebrow}>Esta semana</Text>
          <WeekTimeline sessions={sessions} colors={C} styles={styles} />
        </View>
      </Animated.View>

      {/* ╔══════════════════════════════════════════════╗
          ║  TODAY'S TRAINING CTA                        ║
          ╚══════════════════════════════════════════════╝ */}
      {refreshing ? (
        <View style={styles.skeletonCard}>
          <SkeletonBar width="60%" height={13} />
          <SkeletonBar width="90%" height={24} marginTop={10} />
          <SkeletonBar width="45%" height={13} marginTop={8} />
          <SkeletonBar width="100%" height={48} marginTop={16} />
        </View>
      ) : todayPrimarySession ? (
        <GlowCard intensity={intensity}>
          {/* Intensity badge */}
          <View style={styles.ctaIntensityRow}>
            <View style={[styles.ctaIntensityBadge, { backgroundColor: intensityColor[intensity] + "22", borderColor: intensityColor[intensity] + "55" }]}>
              <Text style={[styles.ctaIntensityText, { color: intensityColor[intensity] }]}>
                {INTENSITY_LABEL[intensity].toUpperCase()}
              </Text>
            </View>
            {favoriteSessionId === todayPrimarySession.id ? (
              <Text style={styles.ctaFavStar}>★ Favorita</Text>
            ) : null}
          </View>

          {/* Session title */}
          <Text style={styles.ctaTitle} numberOfLines={2}>
            {todayPrimarySession.title}
          </Text>

          {/* Meta row */}
          <Text style={styles.ctaMeta}>
            {formatDate(todayPrimarySession.scheduledDate)}
            {"  ·  "}{translateDayType(todayPrimarySession.dayType)}
          </Text>
          <Text style={styles.ctaMotivation}>{motivationText}</Text>

          {/* Completion mini-bar */}
          {todayCompletion > 0 ? (
            <View style={styles.ctaCompletionRow}>
              <View style={styles.ctaCompletionTrack}>
                <View style={[styles.ctaCompletionFill, { width: `${todayCompletion}%` as `${number}%` }]} />
              </View>
              <Text style={styles.ctaCompletionLabel}>{todayCompletion}% completado</Text>
            </View>
          ) : null}

          {/* Primary CTA */}
          <View style={styles.ctaActionStack}>
            <Animated.View style={{ transform: [{ scale: ctaScale }], marginTop: S.md }}>
              <Pressable
                style={[styles.ctaStartBtn, { backgroundColor: intensityColor[intensity] }]}
                onPressIn={animPressIn}
                onPressOut={animPressOut}
                onPress={onStartSession}
                disabled={loading}
              >
                <Text style={styles.ctaStartBtnText}>
                  {loading ? "Cargando..." : "⚡ Iniciar ahora"}
                </Text>
              </Pressable>
            </Animated.View>

            <Pressable style={styles.ctaPreloadBtn} onPress={onPreloadSession} disabled={preloadBusy}>
              <Text style={styles.ctaPreloadBtnText}>
                {preloadBusy ? "Preparando sesion..." : todaySessionCached ? "📥 Sesion offline lista" : "📥 Precargar para entrenar offline"}
              </Text>
            </Pressable>
          </View>

          {/* Secondary actions row */}
          <View style={styles.ctaSecondaryRow}>
            <Pressable
              style={[styles.ctaSecBtn, { flex: 1 }]}
              onPress={() => setCheckInOpen((o) => !o)}
            >
              <Text style={styles.ctaSecBtnText}>
                {todayCheckIn?.savedAt ? "✓ Check-in" : "Check-in"}
              </Text>
            </Pressable>
            <Pressable style={styles.ctaSecBtn} onPress={onToggleFavorite}>
              <Text style={styles.ctaSecBtnText}>
                {favoriteSessionId === todayPrimarySession.id ? "★" : "☆"}
              </Text>
            </Pressable>
            <View style={styles.ctaSecBtnGhost}>
              <Text style={styles.ctaSecBtnGhostText}>{todaySessionCached ? "Offline listo" : "Offline pendiente"}</Text>
            </View>
          </View>

          {/* Inline check-in quick fields */}
          {checkInOpen ? (
            <View style={styles.checkInInline}>
              <Text style={styles.checkInInlineTitle}>Check-in rápido</Text>
              <View style={styles.checkInGrid}>
                {[
                  { emoji: "⚡", label: "Energía (1-10)", field: "readinessScore" as const },
                  { emoji: "😴", label: "Sueño (hs)",     field: "sleepHours"     as const },
                  { emoji: "🧠", label: "Ánimo (1-10)",   field: "moodScore"      as const },
                  { emoji: "🚨", label: "Dolor (0-10)",   field: "painScore"      as const },
                ].map(({ emoji, label, field }) => (
                  <View key={field} style={styles.checkInCell}>
                    <Text style={styles.checkInCellLabel}>{emoji} {label}</Text>
                    <TextInput
                      style={styles.checkInInput}
                      value={todayCheckIn?.[field] ?? ""}
                      onChangeText={(v) => onUpdateCheckIn(field, v)}
                      keyboardType="decimal-pad"
                      placeholderTextColor={C.textDisabled}
                      placeholder="–"
                    />
                  </View>
                ))}
              </View>
              <View style={styles.checkInActions}>
                <Pressable style={styles.checkInSaveBtn} onPress={onSaveCheckIn}>
                  <Text style={styles.checkInSaveBtnText}>Guardar</Text>
                </Pressable>
                <Pressable style={styles.checkInClearBtn} onPress={onClearCheckIn}>
                  <Text style={styles.checkInClearBtnText}>Limpiar</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </GlowCard>
      ) : hasProgram ? (
        <View style={styles.restDayCard}>
          <Text style={styles.restDayEmoji}>😴</Text>
          <Text style={styles.restDayTitle}>Día de descanso</Text>
          <Text style={styles.restDaySub}>El descanso también es entrenamiento. Mañana va a haber sesión.</Text>
        </View>
      ) : (
        <NoProgram onGenerateProgram={onGenerateProgram} loading={loading} />
      )}

      {/* ╔══════════════════════════════════════════════╗
          ║  MOTIVATION: phase feedback chip             ║
          ╚══════════════════════════════════════════════╝ */}
      {progress?.feedback ? (
        <Animated.View style={[styles.feedbackChip, entranceStyle]}>
          <Text style={styles.feedbackChipTitle}>{progress.feedback.title}</Text>
          <Text style={styles.feedbackChipBody}>{progress.feedback.summary}</Text>
        </Animated.View>
      ) : null}

      {/* Refresh hint */}
      <Pressable style={styles.refreshHint} onPress={onRefresh} disabled={refreshing}>
        <Text style={styles.refreshHintText}>{refreshing ? "Actualizando..." : "↻ Actualizar"}</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
//  Styles
// ─────────────────────────────────────────────────────────────

function makeStyles(C: ReturnType<typeof useTheme>["C"]) {
return StyleSheet.create({
  screen:   { flex: 1, backgroundColor: C.bg },
  content:  { padding: S.md, gap: S.md, paddingBottom: S.xl + 16 },

  // ── Hero ────────────────────────────────────────────────────
  heroSection: {
    flexDirection: "row",
    gap: S.md,
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: R.xl,
    padding: S.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  heroLeft:  { alignItems: "center", justifyContent: "center" },
  heroRight: { flex: 1, gap: S.sm },

  heroMetaCard: {
    backgroundColor: C.surfaceRaise,
    borderRadius: R.lg,
    padding: S.sm,
    gap: 2,
  },
  heroMetaEyebrow: { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  heroMetaValue:   { color: C.text, fontSize: 26, fontWeight: "800" },
  heroMetaDelta:   { fontSize: 12, fontWeight: "700" },

  heroWeeklyCard:  { backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.sm, gap: 6 },
  heroWeeklyLabel: { color: C.textSub, fontSize: 12, fontWeight: "700" },
  heroWeeklyTrack: { height: 6, backgroundColor: C.surfaceActive, borderRadius: R.full, overflow: "hidden" },
  heroWeeklyFill:  { height: "100%", backgroundColor: C.teal, borderRadius: R.full },

  // ── Progress ring ────────────────────────────────────────────
  ringContainer: {
    width:  RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ringTrack: {
    position: "absolute",
    width:  RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
    borderColor: C.surfaceActive,
  },
  ringHalfClip: {
    position:   "absolute",
    width:  RING_SIZE / 2,
    height: RING_SIZE,
    right: 0,
    overflow: "hidden",
  },
  ringHalf: {
    position: "absolute",
    width:  RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
    borderColor: C.teal,
    top: 0,
    left: 0,
  },
  ringHalfRight: { transformOrigin: "0% 50%" },
  ringHalfLeft:  {
    right: 0,
    left: "auto" as never,
  },
  ringCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  ringStreakEmoji:  { fontSize: 20 },
  ringStreakValue:  { color: C.text, fontSize: 30, fontWeight: "800", lineHeight: 34 },
  ringStreakLabel:  { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },

  // ── Timeline ─────────────────────────────────────────────────
  timelineCard: {
    backgroundColor: C.surface,
    borderRadius: R.xl,
    padding: S.md,
    borderWidth: 1,
    borderColor: C.border,
    gap: S.sm,
  },
  timelineEyebrow: { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },

  weekRow: { flexDirection: "row", justifyContent: "space-between" },
  weekDayCol:    { alignItems: "center", gap: 4, flex: 1 },
  weekDayFuture: { opacity: 0.45 },

  weekDayLabel:      { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  weekDayLabelToday: { color: C.amber, fontWeight: "800" },

  weekDayCircle: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.surfaceRaise,
  },
  weekDayCircleToday:     { borderColor: C.amber, borderWidth: 2 },
  weekDayCircleCompleted: { backgroundColor: C.tealDim, borderColor: C.teal },
  weekDayCircleSkipped:   { backgroundColor: C.dangerDim, borderColor: C.danger },
  weekDayCircleTraining:  { borderColor: C.amberBorder },
  weekDayCheck: { fontSize: 13, fontWeight: "800", color: C.text },
  weekDayTodayDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber },
  weekDayDot:      { width: 7, height: 7, borderRadius: 3.5 },
  weekDayNum:      { color: C.textMuted, fontSize: 11 },
  weekDayNumToday: { color: C.amber, fontWeight: "700" },

  // ── Skeleton ─────────────────────────────────────────────────
  skeletonCard: {
    backgroundColor: C.surface,
    borderRadius: R.xl,
    padding: S.lg,
    borderWidth: 1,
    borderColor: C.border,
  },

  // ── Glow card ────────────────────────────────────────────────
  glowCard: {
    backgroundColor: C.surface,
    borderRadius: R.xl,
    padding: S.lg,
    borderWidth: 1.5,
    gap: S.xs,
  },

  // ── CTA card internals ───────────────────────────────────────
  ctaIntensityRow:   { flexDirection: "row", alignItems: "center", gap: S.sm },
  ctaIntensityBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.full, borderWidth: 1 },
  ctaIntensityText:  { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  ctaFavStar: { color: C.amber, fontSize: 13, fontWeight: "700" },

  ctaTitle:  { color: C.text, fontSize: 24, fontWeight: "800", lineHeight: 30, marginTop: 4 },
  ctaMeta:   { color: C.textMuted, fontSize: 13, marginTop: 2 },
  ctaMotivation: { color: C.textSub, fontSize: 14, lineHeight: 21, marginTop: 8 },

  ctaCompletionRow:   { flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: 8 },
  ctaCompletionTrack: { flex: 1, height: 4, backgroundColor: C.surfaceActive, borderRadius: R.full, overflow: "hidden" },
  ctaCompletionFill:  { height: "100%", backgroundColor: C.teal, borderRadius: R.full },
  ctaCompletionLabel: { color: C.teal, fontSize: 12, fontWeight: "700" },

  ctaActionStack: { gap: S.sm },
  ctaStartBtn:     { borderRadius: R.full, paddingVertical: 16, alignItems: "center" },
  ctaStartBtnText: { color: C.bg, fontWeight: "800", fontSize: 17, letterSpacing: 0.3 },
  ctaPreloadBtn: {
    borderRadius: R.full,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.borderStrong,
    backgroundColor: C.surfaceRaise,
  },
  ctaPreloadBtnText: { color: C.text, fontWeight: "800", fontSize: 14 },

  ctaSecondaryRow: { flexDirection: "row", gap: S.sm, marginTop: S.xs },
  ctaSecBtn: {
    paddingVertical: 10, paddingHorizontal: S.sm,
    borderRadius: R.full, borderWidth: 1,
    borderColor: C.borderStrong, alignItems: "center",
    backgroundColor: C.surfaceRaise,
  },
  ctaSecBtnText: { color: C.textSub, fontWeight: "700", fontSize: 13 },
  ctaSecBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: S.sm,
    borderRadius: R.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceRaise,
  },
  ctaSecBtnGhostText: { color: C.textMuted, fontWeight: "700", fontSize: 12 },

  // ── Check-in inline ──────────────────────────────────────────
  checkInInline: {
    marginTop: S.sm,
    backgroundColor: C.surfaceRaise,
    borderRadius: R.lg,
    padding: S.md,
    gap: S.sm,
    borderWidth: 1,
    borderColor: C.amberBorder,
  },
  checkInInlineTitle: { color: C.amber, fontWeight: "800", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.8 },
  checkInGrid: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  checkInCell: { minWidth: "46%", flex: 1, gap: 3 },
  checkInCellLabel: { color: C.textSub, fontSize: 12, fontWeight: "700" },
  checkInInput: {
    backgroundColor: C.surface,
    borderRadius: R.sm,
    padding: S.sm,
    color: C.text,
    borderWidth: 1,
    borderColor: C.border,
    fontSize: 15,
    fontWeight: "700",
  },
  checkInActions:   { flexDirection: "row", gap: S.sm, marginTop: 2 },
  checkInSaveBtn:   { flex: 1, backgroundColor: C.amber, borderRadius: R.full, paddingVertical: 10, alignItems: "center" },
  checkInSaveBtnText: { color: C.bg, fontWeight: "800", fontSize: 13 },
  checkInClearBtn:  { paddingVertical: 10, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.borderStrong, alignItems: "center" },
  checkInClearBtnText: { color: C.textSub, fontWeight: "700", fontSize: 13 },

  // ── Rest day ─────────────────────────────────────────────────
  restDayCard: {
    backgroundColor: C.surface, borderRadius: R.xl,
    padding: S.lg, alignItems: "center", gap: S.sm,
    borderWidth: 1, borderColor: C.border,
  },
  restDayEmoji: { fontSize: 42 },
  restDayTitle: { color: C.text, fontWeight: "800", fontSize: 20 },
  restDaySub:   { color: C.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },

  // ── No program / onboarding ──────────────────────────────────
  noProgramCard: {
    backgroundColor: C.surface,
    borderRadius: R.xl,
    padding: S.lg,
    gap: S.md,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: C.tealBorder,
  },
  noProgramEmoji:     { fontSize: 52 },
  noProgramTitle:     { color: C.teal, fontSize: 22, fontWeight: "800", textAlign: "center" },
  noProgramSub:       { color: C.textSub, fontSize: 14, textAlign: "center", lineHeight: 21 },
  noProgramBadgeRow:  { flexDirection: "row", flexWrap: "wrap", gap: S.sm, justifyContent: "center" },
  noProgramBadge:     { backgroundColor: C.tealDim, borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.tealBorder },
  noProgramBadgeText: { color: C.teal, fontSize: 12, fontWeight: "700" },
  noProgramCta: {
    width: "100%",
    backgroundColor: C.teal,
    borderRadius: R.full,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: S.xs,
  },
  noProgramCtaText: { color: C.bg, fontWeight: "800", fontSize: 17 },

  // ── Feedback chip ────────────────────────────────────────────
  feedbackChip: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: S.md,
    gap: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  feedbackChipTitle: { color: C.amber, fontWeight: "800", fontSize: 14 },
  feedbackChipBody:  { color: C.textSub, fontSize: 13, lineHeight: 19 },

  // ── Refresh ──────────────────────────────────────────────────
  refreshHint:     { alignSelf: "center", paddingVertical: 10 },
  refreshHintText: { color: C.textMuted, fontSize: 13 },

  // ── Modal (motivational confirm) ─────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: C.overlay,
    justifyContent: "center", alignItems: "center", padding: S.lg,
  },
  modalCard: {
    backgroundColor: C.surface, borderRadius: R.xl,
    padding: S.lg, gap: S.md, borderWidth: 1.5,
    borderColor: C.amberBorder, width: "100%",
  },
  modalEmoji:     { fontSize: 44, textAlign: "center" },
  modalTitle:     { color: C.amber, fontWeight: "800", fontSize: 24, textAlign: "center" },
  modalBody:      { color: C.text, fontSize: 15, lineHeight: 23, textAlign: "center" },
  modalActions:   { flexDirection: "row", gap: S.sm },
  modalBtnNo:     { flex: 1, borderWidth: 1, borderColor: C.borderStrong, borderRadius: R.full, paddingVertical: 14, alignItems: "center" },
  modalBtnNoText: { color: C.textSub, fontWeight: "700", fontSize: 14 },
  modalBtnYes:    { flex: 1.6, backgroundColor: C.teal, borderRadius: R.full, paddingVertical: 14, alignItems: "center" },
  modalBtnYesText:{ color: C.bg, fontWeight: "800", fontSize: 15 },
});
}

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
import Svg, { Circle } from "react-native-svg";

import { R, S } from "@mobile/components/tokens";
import { useTheme } from "@mobile/components/ThemeContext";
import { rewriteLocalAssetUrl } from "@mobile/components/runtimeConfig";
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
  needsPhysicalOnboarding: boolean;
  loading: boolean;
  refreshing: boolean;
  planningRecommendation: { summary: string; focusAreas: string[] } | null;
  bestJumpTechniqueTitles: string[];
  onUpdateCheckIn: (field: keyof Omit<PreSessionCheckInState, "savedAt">, value: string) => void;
  onSaveCheckIn: () => void;
  onClearCheckIn: () => void;
  /** Show weekly bouncy score input (gated to once per 7 days by parent) */
  showBouncyInput?: boolean;
  onStartSession: () => void;
  onPreloadSession: () => void;
  todaySessionCached: boolean;
  preloadBusy: boolean;
  onToggleFavorite: () => void;
  onRefresh: () => void;
  onSetAthleteSetup: (updater: (prev: AthleteSetupState) => AthleteSetupState) => void;
  onSaveOnboarding: () => void;
  onGenerateProgram: () => void;
  availableTemplates?: { code: string; name: string }[];
  startDateMode?: "hoy" | "manana" | "otra";
  onSetStartDateMode?: (mode: "hoy" | "manana" | "otra") => void;
  onRequestNotifications?: () => Promise<void>;
  onNavigateToEvolucion?: () => void;
}

// ─────────────────────────────────────────────────────────────
//  Animated progress ring (SVG stroke-dashoffset technique)
// ─────────────────────────────────────────────────────────────

const RING_SIZE   = 140;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUM = 2 * Math.PI * RING_RADIUS;

// We need an AnimatedCircle that accepts animated strokeDashoffset.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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

  // strokeDashoffset = circumference * (1 - pct/100)
  // 0% → full offset (invisible arc), 100% → 0 offset (full arc)
  const strokeDashoffset = animPct.interpolate({
    inputRange:  [0, 100],
    outputRange: [RING_CIRCUM, 0],
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

  const cx = RING_SIZE / 2;
  const cy = RING_SIZE / 2;

  return (
    <Animated.View style={[styles.ringContainer, { transform: [{ scale: pulseAnim }] }]}>
      <Svg width={RING_SIZE} height={RING_SIZE}
        style={{ position: "absolute", top: 0, left: 0 }}
        // Rotate -90° so arc starts at 12 o'clock
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      >
        {/* Track circle (background shadow ring) */}
        <Circle
          cx={cx} cy={cy}
          r={RING_RADIUS}
          stroke={C.surfaceActive}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {/* Colored arc — rotated -90° via transform */}
        <AnimatedCircle
          cx={cx} cy={cy}
          r={RING_RADIUS}
          stroke={C.teal}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${RING_CIRCUM} ${RING_CIRCUM}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          // rotate -90 around center so arc starts at top
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>

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

// ─────────────────────────────────────────────────────────────
//  Weekday multiselect chip row
// ─────────────────────────────────────────────────────────────
const WEEKDAYS = [
  { label: "D", full: "Dom", value: 0 },
  { label: "L", full: "Lun", value: 1 },
  { label: "M", full: "Mar", value: 2 },
  { label: "X", full: "Mié", value: 3 },
  { label: "J", full: "Jue", value: 4 },
  { label: "V", full: "Vie", value: 5 },
  { label: "S", full: "Sáb", value: 6 },
];

function parseWeekdayList(str: string): number[] {
  return Array.from(
    new Set(
      str.split(/[,\s]+/)
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6),
    ),
  ).sort((a, b) => a - b);
}

function serializeWeekdays(days: number[]): string {
  return Array.from(new Set(days)).sort((a, b) => a - b).join(",");
}

function WeekdayPicker({
  value,
  onChange,
  accent,
}: {
  value: string;
  onChange: (v: string) => void;
  accent?: string;
}) {
  const { C } = useTheme();
  const selected = parseWeekdayList(value);
  return (
    <View style={{ flexDirection: "row", gap: 6, justifyContent: "center" }}>
      {WEEKDAYS.map((day) => {
        const active = selected.includes(day.value);
        return (
          <Pressable
            key={day.value}
            style={{
              width: 38, height: 38, borderRadius: 19,
              alignItems: "center", justifyContent: "center",
              backgroundColor: active ? (accent ?? C.amber) : C.surfaceRaise,
              borderWidth: 1.5,
              borderColor: active ? (accent ?? C.amber) : C.borderStrong,
            }}
            onPress={() => {
              const next = active
                ? selected.filter((v) => v !== day.value)
                : [...selected, day.value];
              onChange(serializeWeekdays(next));
            }}
          >
            <Text style={{
              color: active ? C.bg : C.textSub,
              fontWeight: "800",
              fontSize: 12,
            }}>
              {day.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
//  Toggle checkbox row
// ─────────────────────────────────────────────────────────────
function CheckRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { C } = useTheme();
  return (
    <Pressable
      style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
      onPress={() => onChange(!value)}
    >
      <View style={{
        width: 24, height: 24, borderRadius: 6,
        borderWidth: 2,
        borderColor: value ? C.teal : C.borderStrong,
        backgroundColor: value ? C.teal : "transparent",
        alignItems: "center", justifyContent: "center",
      }}>
        {value ? <Text style={{ color: C.bg, fontWeight: "900", fontSize: 14 }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontWeight: "700", fontSize: 14 }}>{label}</Text>
        {hint ? <Text style={{ color: C.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 }}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────
//  No-program hero (onboarding CTA)
// ─────────────────────────────────────────────────────────────

function NoProgram({
  onGenerateProgram,
  athleteSetup,
  loading,
  onSetAthleteSetup,
  availableTemplates = [],
  startDateMode = "hoy",
  onSetStartDateMode,
  onRequestNotifications,
}: {
  onGenerateProgram: () => void;
  athleteSetup: AthleteSetupState;
  loading: boolean;
  onSetAthleteSetup: (updater: (prev: AthleteSetupState) => AthleteSetupState) => void;
  availableTemplates?: { code: string; name: string }[];
  startDateMode?: "hoy" | "manana" | "otra";
  onSetStartDateMode?: (mode: "hoy" | "manana" | "otra") => void;
  onRequestNotifications?: () => Promise<void>;
}) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [notifRequested, setNotifRequested] = useState(false);
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

  // reset step when modal closes
  useEffect(() => {
    if (!confirmVisible) { setStep(1); }
  }, [confirmVisible]);

  function handleConfirm() {
    setConfirmVisible(false);
    onGenerateProgram();
  }

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

      {/* ── Multi-step setup modal ─────────────────────────── */}
      <Modal visible={confirmVisible} transparent animationType="slide" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={{ padding: S.lg, paddingTop: S.sm }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalCard}>
              {/* Step indicator */}
              <View style={{ flexDirection: "row", gap: 6, alignSelf: "center" }}>
                {([1, 2, 3] as const).map((s) => (
                  <View key={s} style={{
                    width: s === step ? 22 : 8, height: 8,
                    borderRadius: 4,
                    backgroundColor: s === step ? C.amber : s < step ? C.teal : C.surfaceRaise,
                  }} />
                ))}
              </View>

              {/* ── STEP 1: Deporte ────────────────────────────── */}
              {step === 1 ? (
                <>
                  <Text style={styles.modalEmoji}>🏀</Text>
                  <Text style={styles.modalTitle}>Tu contexto deportivo</Text>

                  <Text style={styles.obLabel}>¿Entrenas algún deporte en la semana?</Text>
                  <View style={{ flexDirection: "row", gap: S.sm }}>
                    <Pressable
                      style={[styles.obOptionBtn, athleteSetup.trainsSport && styles.obOptionBtnActive]}
                      onPress={() => onSetAthleteSetup((c) => ({ ...c, trainsSport: true }))}
                    >
                      <Text style={[styles.obOptionText, athleteSetup.trainsSport && styles.obOptionTextActive]}>Sí</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.obOptionBtn, !athleteSetup.trainsSport && styles.obOptionBtnActive]}
                      onPress={() => onSetAthleteSetup((c) => ({
                        ...c,
                        trainsSport: false,
                        sportTrainingDays: "",
                        teamTrainingDays: "",
                      }))}
                    >
                      <Text style={[styles.obOptionText, !athleteSetup.trainsSport && styles.obOptionTextActive]}>No</Text>
                    </Pressable>
                  </View>

                  {athleteSetup.trainsSport ? (
                    <>
                      <Text style={styles.obLabel}>¿Qué días entrenas tu deporte? (incluye competencias)</Text>
                      <Text style={styles.obHint}>Selecciona los días en que tienes práctica, partido o competencia</Text>
                      <WeekdayPicker
                        value={athleteSetup.sportTrainingDays}
                        onChange={(v) => onSetAthleteSetup((c) => ({ ...c, sportTrainingDays: v, teamTrainingDays: v }))}
                        accent={C.teal}
                      />
                    </>
                  ) : null}

                  <Pressable style={styles.obNextBtn} onPress={() => setStep(2)}>
                    <Text style={styles.obNextBtnText}>Siguiente →</Text>
                  </Pressable>
                </>
              ) : null}

              {/* ── STEP 2: Programa ───────────────────────────── */}
              {step === 2 ? (
                <>
                  <Text style={styles.modalEmoji}>🔥</Text>
                  <Text style={styles.modalTitle}>Tu aventura empieza aquí</Text>
                  <Text style={[styles.modalBody, { marginBottom: 4 }]}>
                    Serán 3 meses de constancia y sacrificio que cambiarán tu vida.
                  </Text>

                  {availableTemplates.length > 0 ? (
                    <>
                      <Text style={styles.obLabel}>Programa de entrenamiento</Text>
                      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                        {availableTemplates.map((tmpl) => {
                          const active = athleteSetup.templateCode === tmpl.code;
                          return (
                            <Pressable
                              key={tmpl.code}
                              style={[styles.obOptionBtn, { flex: 1 }, active && styles.obOptionBtnActive]}
                              onPress={() => onSetAthleteSetup((c) => ({ ...c, templateCode: tmpl.code }))}
                            >
                              <Text style={[styles.obOptionText, active && styles.obOptionTextActive]}>{tmpl.name}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : null}

                  <Text style={styles.obLabel}>¿Cuándo empezamos?</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["hoy", "manana"] as const).map((mode) => {
                      const active = startDateMode === mode;
                      const label = mode === "hoy" ? "Hoy" : "Mañana";
                      return (
                        <Pressable
                          key={mode}
                          style={[styles.obOptionBtn, { flex: 1 }, active && styles.obOptionBtnActive]}
                          onPress={() => {
                            if (mode === "hoy") {
                              onSetAthleteSetup((c) => ({ ...c, startDate: new Date().toISOString().slice(0, 10) }));
                            } else {
                              const d = new Date();
                              d.setDate(d.getDate() + 1);
                              onSetAthleteSetup((c) => ({ ...c, startDate: d.toISOString().slice(0, 10) }));
                            }
                            onSetStartDateMode?.(mode);
                          }}
                        >
                          <Text style={[styles.obOptionText, active && styles.obOptionTextActive]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={[styles.programSetupCard, { marginTop: 4 }]}>
                    <Text style={styles.programSetupLabel}>Entrada al programa</Text>
                    <CheckRow
                      label="Incluir fase de adecuación"
                      hint="Recomendado si vienes de una pausa, molestias o todavía no toleras bien los contactos. Empieza con isométricos y aterrizajes controlados."
                      value={!athleteSetup.skipPhase1}
                      onChange={(v) => onSetAthleteSetup((c) => ({ ...c, skipPhase1: !v }))}
                    />
                  </View>

                  <View style={{ flexDirection: "row", gap: S.sm }}>
                    <Pressable style={[styles.obNextBtn, { flex: 1, backgroundColor: C.surfaceRaise }]} onPress={() => setStep(1)}>
                      <Text style={[styles.obNextBtnText, { color: C.textSub }]}>← Volver</Text>
                    </Pressable>
                    <Pressable style={[styles.obNextBtn, { flex: 2 }]} onPress={() => setStep(3)}>
                      <Text style={styles.obNextBtnText}>Siguiente →</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}

              {/* ── STEP 3: Notificaciones ─────────────────────── */}
              {step === 3 ? (
                <>
                  <Text style={styles.modalEmoji}>🔔</Text>
                  <Text style={styles.modalTitle}>Activa los recordatorios</Text>
                  <Text style={styles.modalBody}>
                    La app programará tus sesiones en el calendario y te enviará recordatorios y mensajes motivacionales antes de cada entrenamiento.
                  </Text>

                  {!notifRequested ? (
                    <Pressable
                      style={styles.obNextBtn}
                      onPress={async () => {
                        await onRequestNotifications?.();
                        setNotifRequested(true);
                      }}
                    >
                      <Text style={styles.obNextBtnText}>🔔 Activar notificaciones</Text>
                    </Pressable>
                  ) : (
                    <View style={{ backgroundColor: C.tealDim, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.tealBorder }}>
                      <Text style={{ color: C.teal, fontWeight: "800", fontSize: 14, textAlign: "center" }}>✓ Notificaciones configuradas</Text>
                    </View>
                  )}

                  <Pressable
                    style={[styles.obNextBtn, { backgroundColor: notifRequested ? C.teal : C.amber }]}
                    onPress={handleConfirm}
                    disabled={loading}
                  >
                    <Text style={styles.obNextBtnText}>{loading ? "Generando..." : "Quiero esos 30 cm 🚀"}</Text>
                  </Pressable>

                  <Pressable style={{ alignSelf: "center" }} onPress={() => setStep(2)}>
                    <Text style={{ color: C.textMuted, fontSize: 13 }}>← Volver</Text>
                  </Pressable>
                </>
              ) : null}

              {/* Cancel */}
              <Pressable style={{ alignSelf: "center", marginTop: -4 }} onPress={() => setConfirmVisible(false)}>
                <Text style={{ color: C.textMuted, fontSize: 13 }}>Cancelar</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function PhysicalProfileGate({
  athleteSetup,
  loading,
  onSetAthleteSetup,
  onSaveOnboarding,
}: {
  athleteSetup: AthleteSetupState;
  loading: boolean;
  onSetAthleteSetup: (updater: (prev: AthleteSetupState) => AthleteSetupState) => void;
  onSaveOnboarding: () => void;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);

  return (
    <View style={styles.noProgramCard}>
      <Text style={styles.noProgramEmoji}>📏</Text>
      <Text style={styles.noProgramTitle}>Completa tu perfil físico</Text>
      <Text style={styles.noProgramSub}>
        Antes de entrar a tus sesiones necesitamos tu altura y tu peso para personalizar la planificación y el análisis biomecánico.
      </Text>
      <TextInput
        style={styles.profileGateInput}
        value={athleteSetup.heightCm}
        onChangeText={(value) => onSetAthleteSetup((current) => ({ ...current, heightCm: value }))}
        keyboardType="decimal-pad"
        placeholder="Altura (cm)"
        placeholderTextColor={C.textDisabled}
      />
      <TextInput
        style={styles.profileGateInput}
        value={athleteSetup.weightKg}
        onChangeText={(value) => onSetAthleteSetup((current) => ({ ...current, weightKg: value }))}
        keyboardType="decimal-pad"
        placeholder="Peso (kg)"
        placeholderTextColor={C.textDisabled}
      />
      <Pressable style={({ pressed }) => [styles.noProgramCta, pressed && { opacity: 0.82 }]} onPress={onSaveOnboarding} disabled={loading}>
        <Text style={styles.noProgramCtaText}>{loading ? "Guardando..." : "Guardar y continuar →"}</Text>
      </Pressable>
    </View>
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
  athleteSetup,
  needsPhysicalOnboarding,
  loading,
  refreshing,
  bestJumpTechniqueTitles,
  onSetAthleteSetup,
  onSaveOnboarding,
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
  showBouncyInput = false,
  availableTemplates,
  startDateMode,
  onSetStartDateMode,
  onRequestNotifications,
  onNavigateToEvolucion,
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
  const [jumpMaxInfoVisible, setJumpMaxInfoVisible] = useState(false);

  // ── Jump pulse animation (call-to-action when no PB) ────────
  const jumpPulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (pbJump !== null) {
      jumpPulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(jumpPulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(jumpPulseAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pbJump]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {needsPhysicalOnboarding ? (
        <PhysicalProfileGate
          athleteSetup={athleteSetup}
          loading={loading}
          onSetAthleteSetup={onSetAthleteSetup}
          onSaveOnboarding={onSaveOnboarding}
        />
      ) : (
        <>
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
          <Animated.View style={pbJump === null ? { borderWidth: 2, borderColor: C.teal, borderRadius: 16, opacity: jumpPulseAnim } : undefined}>
          <Pressable style={styles.heroMetaCard} onPress={() => setJumpMaxInfoVisible(true)}>
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
            <Text style={styles.heroMetaHint}>{pbJump === null ? "Toca para agregar tu primer salto" : "Toca para ver con qué técnica fue"}</Text>
          </Pressable>
          </Animated.View>

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

              {/* ── Weekly Bouncy score (max once per 7 days) ────── */}
              {showBouncyInput ? (
                <View style={styles.checkInCell}>
                  <Text style={styles.checkInCellLabel}>🦘 Elasticidad semanal (1-10)</Text>
                  <Text style={styles.checkInBouncyHint}>¿Qué tan elástico/a te sentiste esta semana?</Text>
                  <TextInput
                    style={styles.checkInInput}
                    value={todayCheckIn?.bouncyScore ?? ""}
                    onChangeText={(v) => onUpdateCheckIn("bouncyScore", v)}
                    keyboardType="decimal-pad"
                    placeholderTextColor={C.textDisabled}
                    placeholder="–"
                  />
                </View>
              ) : null}
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
        <NoProgram
          onGenerateProgram={onGenerateProgram}
          athleteSetup={athleteSetup}
          loading={loading}
          onSetAthleteSetup={onSetAthleteSetup}
          availableTemplates={availableTemplates}
          startDateMode={startDateMode}
          onSetStartDateMode={onSetStartDateMode}
          onRequestNotifications={onRequestNotifications}
        />
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

      <Modal visible={jumpMaxInfoVisible} transparent animationType="fade" onRequestClose={() => setJumpMaxInfoVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Salto máximo</Text>
            <Text style={styles.modalBody}>
              {pbJump !== null ? `${pbJump} cm` : "Sin registros todavía."}
            </Text>
            {pbJump !== null ? (
              bestJumpTechniqueTitles.length > 0 ? (
                <View style={styles.jumpMaxTechniqueList}>
                  <Text style={styles.jumpMaxTechniqueTitle}>Técnicas asociadas</Text>
                  {bestJumpTechniqueTitles.map((title) => (
                    <Text key={title} style={styles.jumpMaxTechniqueItem}>• {title}</Text>
                  ))}
                </View>
              ) : (
                <Text style={styles.jumpMaxTechniqueEmpty}>
                  Aún no hay una técnica identificada para este máximo.
                </Text>
              )
            ) : null}
            {pbJump === null ? (
              <Pressable
                style={styles.modalBtnYes}
                onPress={() => { setJumpMaxInfoVisible(false); onNavigateToEvolucion?.(); }}
              >
                <Text style={styles.modalBtnYesText}>Agregar medición →</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={pbJump === null ? styles.modalBtnNo : styles.modalBtnYes}
              onPress={() => setJumpMaxInfoVisible(false)}
            >
              <Text style={pbJump === null ? styles.modalBtnNoText : styles.modalBtnYesText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Refresh hint */}
      <Pressable style={styles.refreshHint} onPress={onRefresh} disabled={refreshing}>
        <Text style={styles.refreshHintText}>{refreshing ? "Actualizando..." : "↻ Actualizar"}</Text>
      </Pressable>
        </>
      )}
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
  heroMetaHint:    { color: C.textMuted, fontSize: 11, marginTop: 2 },

  heroWeeklyCard:  { backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.sm, gap: 6 },
  heroWeeklyLabel: { color: C.textSub, fontSize: 12, fontWeight: "700" },
  heroWeeklyTrack: { height: 6, backgroundColor: C.surfaceActive, borderRadius: R.full, overflow: "hidden" },
  heroWeeklyFill:  { height: "100%", backgroundColor: C.teal, borderRadius: R.full },

  // ── Progress ring (SVG) ──────────────────────────────────────
  ringContainer: {
    width:  RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
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
  checkInBouncyHint: { color: C.textMuted, fontSize: 11, lineHeight: 15 },
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
  profileGateInput: {
    width: "100%",
    borderRadius: R.lg,
    paddingHorizontal: S.md,
    paddingVertical: 14,
    backgroundColor: C.surfaceRaise,
    borderWidth: 1,
    borderColor: C.borderStrong,
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
  },
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
  programSetupCard: {
    backgroundColor: C.surfaceRaise,
    borderRadius: R.lg,
    padding: S.md,
    gap: S.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  programSetupLabel: { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  programSetupToggle: {
    borderRadius: R.full,
    paddingVertical: 12,
    paddingHorizontal: S.md,
    borderWidth: 1,
    borderColor: C.borderStrong,
    backgroundColor: C.surface,
  },
  programSetupToggleActive: {
    borderColor: C.amberBorder,
    backgroundColor: C.amberDim,
  },
  programSetupToggleText: { color: C.text, fontWeight: "800", fontSize: 14, textAlign: "center" },
  programSetupHint: { color: C.textSub, fontSize: 13, lineHeight: 19 },

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

  // ── Onboarding step styles ────────────────────────────────────
  obLabel: { color: C.text, fontWeight: "700", fontSize: 14, marginTop: 4 },
  obHint: { color: C.textMuted, fontSize: 12, lineHeight: 17, marginTop: -2 },
  obOptionBtn: {
    flex: 1, borderWidth: 1.5, borderColor: C.borderStrong,
    borderRadius: R.full, paddingVertical: 10,
    alignItems: "center", backgroundColor: C.surfaceRaise,
  },
  obOptionBtnActive: {
    borderColor: C.amber, backgroundColor: C.amberDim,
  },
  obOptionText: { color: C.textSub, fontWeight: "700", fontSize: 14 },
  obOptionTextActive: { color: C.amber },
  obNextBtn: {
    backgroundColor: C.amber, borderRadius: R.full,
    paddingVertical: 14, alignItems: "center", marginTop: 4,
  },
  obNextBtnText: { color: C.bg, fontWeight: "800", fontSize: 15 },

  // ── Modal (motivational confirm) ─────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: C.overlay,
    justifyContent: "flex-end", alignItems: "center",
  },
  modalCard: {
    backgroundColor: C.surface, borderRadius: R.xl,
    padding: S.lg, gap: S.md, borderWidth: 1.5,
    borderColor: C.amberBorder, width: "100%",
    maxHeight: "90%",
  },
  modalEmoji:     { fontSize: 44, textAlign: "center" },
  modalTitle:     { color: C.amber, fontWeight: "800", fontSize: 24, textAlign: "center" },
  modalBody:      { color: C.text, fontSize: 15, lineHeight: 23, textAlign: "center" },
  jumpMaxTechniqueList: { backgroundColor: C.surfaceRaise, borderRadius: R.md, padding: S.sm, gap: 4, borderWidth: 1, borderColor: C.border },
  jumpMaxTechniqueTitle: { color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  jumpMaxTechniqueItem: { color: C.textSub, fontSize: 14, lineHeight: 20 },
  jumpMaxTechniqueEmpty: { color: C.textMuted, fontSize: 13, textAlign: "center" },
  modalActions:   { flexDirection: "row", gap: S.sm },
  modalBtnNo:     { flex: 1, borderWidth: 1, borderColor: C.borderStrong, borderRadius: R.full, paddingVertical: 14, alignItems: "center" },
  modalBtnNoText: { color: C.textSub, fontWeight: "700", fontSize: 14 },
  modalBtnYes:    { flex: 1.6, backgroundColor: C.teal, borderRadius: R.full, paddingVertical: 14, alignItems: "center" },
  modalBtnYesText:{ color: C.bg, fontWeight: "800", fontSize: 15 },
});
}

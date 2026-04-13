import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { C, R, S } from "../tokens";
import type { ActiveProgram, AthleteProfile, AthleteProgress, AthleteSetupState, PreSessionCheckInState, SessionSummary } from "../types";

function formatDate(v: string) { return new Date(v).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }); }
function formatDateTime(v: string) { return new Date(v).toLocaleString("es"); }

const DAY_TYPE_MAP: Record<string, string> = {
  STRENGTH: "Fuerza", POWER: "Potencia", RECOVERY: "Recuperación",
  CONDITIONING: "Acondicionamiento", TECHNIQUE: "Técnica",
  SPEED: "Velocidad", ENDURANCE: "Resistencia", FLEXIBILITY: "Flexibilidad",
  REST: "Descanso", SPORT: "Deporte", DELOAD: "Descarga",
};
const STATUS_MAP: Record<string, string> = {
  PLANNED: "Planificado", COMPLETED: "Completado", SKIPPED: "Omitido",
  RESCHEDULED: "Reprogramado", IN_PROGRESS: "En curso", CANCELLED: "Cancelado",
};
function translateDayType(v: string): string { return DAY_TYPE_MAP[v] ?? v; }
function translateStatus(v: string): string { return STATUS_MAP[v] ?? v; }

// ── Sport list ────────────────────────────────────────────
const SPORTS = [
  { label: "⚽ Fútbol",       value: "Fútbol" },
  { label: "🏐 Voleibol",     value: "Voleibol" },
  { label: "🏀 Básquetbol",   value: "Básquetbol" },
  { label: "🏉 Rugby",        value: "Rugby" },
  { label: "🤾 Handball",     value: "Handball" },
  { label: "🏃 Atletismo",    value: "Atletismo" },
  { label: "🎾 Tenis",        value: "Tenis" },
  { label: "⚾ Béisbol",      value: "Béisbol" },
  { label: "🥋 Artes Marciales", value: "Artes Marciales" },
  { label: "🏋️ CrossFit",    value: "CrossFit" },
  { label: "🏊 Natación",     value: "Natación" },
  { label: "🏃 Individual",   value: "Individual" },
  { label: "◻ Otro",          value: "Otro" },
];

// ── Weekday chips ─────────────────────────────────────────
const DAYS = [
  { label: "L", value: 1 },
  { label: "M", value: 2 },
  { label: "X", value: 3 },
  { label: "J", value: 4 },
  { label: "V", value: 5 },
  { label: "S", value: 6 },
  { label: "D", value: 0 },
];

function parseDays(s: string): Set<number> {
  return new Set(
    s.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  );
}

function serializeDays(set: Set<number>): string {
  return Array.from(set).sort((a, b) => a - b).join(",");
}

// ── Custom slider (no external deps) ────────────────────────
const THUMB_D = 20;

function numOrDefault(raw: string, def: number): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : def;
}

function sliderFillColor(pct: number, colorMode: "good-high" | "good-low"): string {
  const e = colorMode === "good-low" ? 1 - pct : pct;
  if (e >= 0.6) return C.teal;
  if (e >= 0.35) return C.amber;
  return C.danger;
}

function fmtSliderVal(v: number, step: number): string {
  return step < 1 ? v.toFixed(1) : String(Math.round(v));
}

function CheckInSlider({
  emoji, label, hint, rawValue, defaultVal, min, max, step = 1,
  colorMode = "good-high", onChangeRaw,
}: {
  emoji: string; label: string; hint: string;
  rawValue: string; defaultVal: number;
  min: number; max: number; step?: number;
  colorMode?: "good-high" | "good-low";
  onChangeRaw: (v: string) => void;
}) {
  const numVal = numOrDefault(rawValue, defaultVal);
  const clamped = Math.max(min, Math.min(max, numVal));
  const pct = max > min ? (clamped - min) / (max - min) : 0;
  const fillColor = sliderFillColor(pct, colorMode);

  const trackWidthRef = useRef(280);
  const startXRef = useRef(0);
  // use a ref for the handler so PanResponder (created once) always has the latest closure
  const handleRef = useRef<(x: number) => void>(() => {});
  handleRef.current = (x: number) => {
    const p = Math.max(0, Math.min(1, x / trackWidthRef.current));
    const raw = min + p * (max - min);
    const stepped = Math.round(raw / step) * step;
    const v = parseFloat(Math.max(min, Math.min(max, stepped)).toFixed(2));
    onChangeRaw(String(v));
  };
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderGrant: (e) => {
        startXRef.current = e.nativeEvent.locationX;
        handleRef.current(startXRef.current);
      },
      onPanResponderMove: (_, gs) => {
        handleRef.current(startXRef.current + gs.dx);
      },
    })
  ).current;

  const thumbPct = Math.round(pct * 100);

  return (
    <View style={slStyles.field}>
      <View style={slStyles.labelRow}>
        <Text style={slStyles.slLabel}>{emoji} {label}</Text>
        <Text style={[slStyles.slValue, { color: fillColor }]}>
          {fmtSliderVal(clamped, step)}{step < 1 ? " h" : ""}
        </Text>
      </View>
      <Text style={slStyles.slHint}>{hint}</Text>
      <View
        style={slStyles.track}
        onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
        hitSlop={{ top: 14, bottom: 14 }}
        {...panResponder.panHandlers}
      >
        <View style={[slStyles.fill, { width: `${thumbPct}%` as `${number}%`, backgroundColor: `${fillColor}55` }]} />
        <View style={[
          slStyles.thumb,
          { left: `${thumbPct}%` as `${number}%`, backgroundColor: fillColor },
        ]} />
      </View>
      <View style={slStyles.minMaxRow}>
        <Text style={slStyles.minMax}>{fmtSliderVal(min, step)}</Text>
        <Text style={slStyles.minMax}>{fmtSliderVal(max, step)}</Text>
      </View>
    </View>
  );
}

const slStyles = StyleSheet.create({
  field: { gap: 1, marginTop: 2 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  slLabel: { color: C.textSub, fontWeight: "700", fontSize: 11, flexShrink: 1 },
  slValue: { fontWeight: "800", fontSize: 16, minWidth: 32, textAlign: "right", marginLeft: 4 },
  slHint: { color: C.textMuted, fontSize: 10, lineHeight: 13 },
  track: {
    height: 8, borderRadius: 4, backgroundColor: C.surfaceRaise,
    overflow: "visible", marginTop: 8, marginBottom: 1,
  },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 5 },
  thumb: {
    position: "absolute",
    width: THUMB_D, height: THUMB_D, borderRadius: THUMB_D / 2,
    top: -(THUMB_D / 2 - 5),
    transform: [{ translateX: -(THUMB_D / 2) }],
    borderWidth: 2.5, borderColor: "rgba(255,255,255,0.18)",
    elevation: 4,
  },
  minMaxRow: { flexDirection: "row", justifyContent: "space-between" },
  minMax: { color: C.textDisabled, fontSize: 10 },
});

function toOptionalNumber(v: string) {
  const p = Number(v.trim());
  return v.trim() && Number.isFinite(p) ? p : undefined;
}
function checkInFeedback(c?: PreSessionCheckInState | null) {
  const r = toOptionalNumber(c?.readinessScore ?? "");
  const s = toOptionalNumber(c?.sorenessScore ?? "");
  const p = toOptionalNumber(c?.painScore ?? "");
  const sl = toOptionalNumber(c?.sleepHours ?? "");
  if ([r, s, p, sl].every((v) => v === undefined)) {
    return { status: "steady" as const, title: "Check-in pendiente", summary: "Registra cómo llegas hoy antes de entrenar." };
  }
  if ((p ?? 0) >= 7 || (r ?? 10) <= 4 || (sl ?? 24) < 5.5) {
    return { status: "protect" as const, title: "Entra en modo protección ⚠️", summary: "Reduce la agresividad. Calienta bien y decide sobre la marcha si puedes sostener el bloque." };
  }
  if ((r ?? 0) >= 8 && (s ?? 10) <= 4 && (p ?? 10) <= 3 && (sl ?? 0) >= 7) {
    return { status: "push" as const, title: "Ventana de alto rendimiento 🔥", summary: "Tienes margen para una sesión limpia y agresiva. Busca la técnica rápida desde las primeras reps." };
  }
  return { status: "focus" as const, title: "Entra con foco ✔", summary: "No hay que proteger ni forzar. Empieza fino y deja que el rendimiento decida si aprietas después." };
}

const feedbackColors: Record<string, string> = {
  push:    C.teal,
  protect: C.danger,
  focus:   C.amber,
  steady:  C.textMuted,
};

interface HoyScreenProps {
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

export default function HoyScreen({
  todayPrimarySession,
  todaySessionSummary,
  todayCompletion,
  favoriteSessionId,
  todayCheckIn,
  progress,
  activeProgram,
  athleteSetup,
  loading,
  refreshing,
  planningRecommendation,
  onUpdateCheckIn,
  onSaveCheckIn,
  onClearCheckIn,
  onStartSession,
  onPreloadSession,
  todaySessionCached,
  preloadBusy,
  onToggleFavorite,
  onRefresh,
  onSetAthleteSetup,
  onSaveOnboarding,
  onGenerateProgram,
}: HoyScreenProps) {
  const feedback = checkInFeedback(todayCheckIn);
  const feedbackColor = feedbackColors[feedback.status] ?? C.textMuted;
  const weeklyPct = Math.min(progress?.weeklyGoal.completionRate ?? 0, 100);
  const hasProgram = !!activeProgram;

  // ── Pulsating border animation ──────────────────────────
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (hasProgram) { pulseAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1400, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasProgram]);

  const pulseBorderColor = pulseAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [C.tealBorder, C.teal],
  });
  const pulseShadowOpacity = pulseAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 0.45],
  });

  // ── Sport days helpers ──────────────────────────────────
  const selectedSportDays = parseDays(athleteSetup.sportTrainingDays);
  function toggleSportDay(day: number) {
    const next = new Set(selectedSportDays);
    next.has(day) ? next.delete(day) : next.add(day);
    onSetAthleteSetup((p) => ({
      ...p,
      sportTrainingDays: serializeDays(next),
      trainsSport: next.size > 0,
    }));
  }

  // ── Confirm-generate modal ──────────────────────────────
  const [confirmGenerateVisible, setConfirmGenerateVisible] = useState(false);
  // ── PB tooltip ─────────────────────────────────────────
  const [pbTooltipVisible, setPbTooltipVisible] = useState(false);
  // ── Check-in collapsed state ───────────────────────────
  const [checkInCollapsed, setCheckInCollapsed] = useState<boolean | null>(null); // null = auto

  // ── Check-in pulse animation ────────────────────────────
  const checkInPulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!todayPrimarySession || todayCheckIn?.savedAt) {
      checkInPulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(checkInPulseAnim, { toValue: 1, duration: 1600, useNativeDriver: false }),
        Animated.timing(checkInPulseAnim, { toValue: 0, duration: 1600, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [!!todayPrimarySession, !!todayCheckIn?.savedAt]);

  const checkInPulseBorderColor = checkInPulseAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [C.amberBorder, C.amber],
  });
  const checkInPulseShadow = checkInPulseAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 0.35],
  });

  return (
    <>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Pre-check-in card ────────────────────────────── */}
      {todayPrimarySession ? (() => {
        // Auto-collapse once saved; user can still toggle manually
        const isCollapsed = checkInCollapsed !== null
          ? checkInCollapsed
          : !!todayCheckIn?.savedAt;
        return (
          <Animated.View style={[
            styles.checkInCard,
            { borderColor: isCollapsed ? C.amberBorder : checkInPulseBorderColor },
            !isCollapsed && { shadowColor: C.amber, shadowOffset: { width: 0, height: 0 }, shadowRadius: 14, shadowOpacity: checkInPulseShadow, elevation: 4 },
          ]}>

            {/* ── Collapsible header (always visible) */}
            <Pressable
              style={styles.checkInHeaderTap}
              onPress={() => setCheckInCollapsed(!isCollapsed)}
            >
              <View style={styles.checkInHeader}>
                <View style={[styles.feedbackDot, { backgroundColor: feedbackColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkInMainTitle}>¿Cómo estás hoy?</Text>
                  <Text style={styles.checkInSubResult}>{feedback.title}</Text>
                </View>
                <Text style={styles.checkInChevron}>{isCollapsed ? "▾" : "▴"}</Text>
              </View>
              {/* Fixed subtitle always visible */}
              <Text style={styles.checkInFixedHint}>
                Tus respuestas ajustan automáticamente la intensidad de la sesión de hoy.
              </Text>
            </Pressable>

            {/* ── Expandable body */}
            {!isCollapsed ? (
              <>
                <Text style={styles.checkInFeedbackSummary}>{feedback.summary}</Text>

                {/* 2-column grid of sliders */}
                <View style={styles.sliderGrid}>
                  <View style={styles.sliderCol}>
                    <CheckInSlider
                      emoji="⚡" label="Energía física" hint="1 agotado · 10 a tope"
                      rawValue={todayCheckIn?.readinessScore ?? ""} defaultVal={10}
                      min={1} max={10} step={1} colorMode="good-high"
                      onChangeRaw={(v) => onUpdateCheckIn("readinessScore", v)}
                    />
                    <CheckInSlider
                      emoji="💪" label="Fatiga muscular" hint="1 fresco · 10 cargado"
                      rawValue={todayCheckIn?.sorenessScore ?? ""} defaultVal={1}
                      min={1} max={10} step={1} colorMode="good-low"
                      onChangeRaw={(v) => onUpdateCheckIn("sorenessScore", v)}
                    />
                    <CheckInSlider
                      emoji="😴" label="Horas de sueño" hint="0 = nada · 12 = completo"
                      rawValue={todayCheckIn?.sleepHours ?? ""} defaultVal={7.5}
                      min={0} max={12} step={0.5} colorMode="good-high"
                      onChangeRaw={(v) => onUpdateCheckIn("sleepHours", v)}
                    />
                  </View>
                  <View style={styles.sliderCol}>
                    <CheckInSlider
                      emoji="🧠" label="Estado de ánimo" hint="1 bajo · 10 motivado"
                      rawValue={todayCheckIn?.moodScore ?? ""} defaultVal={10}
                      min={1} max={10} step={1} colorMode="good-high"
                      onChangeRaw={(v) => onUpdateCheckIn("moodScore", v)}
                    />
                    <CheckInSlider
                      emoji="🚨" label="Dolor / molestia" hint="0 sin dolor · 10 intenso"
                      rawValue={todayCheckIn?.painScore ?? ""} defaultVal={0}
                      min={0} max={10} step={1} colorMode="good-low"
                      onChangeRaw={(v) => onUpdateCheckIn("painScore", v)}
                    />
                  </View>
                </View>

                <View style={styles.checkInField}>
                  <Text style={styles.checkInFieldLabel}>📝 Nota rápida (opcional)</Text>
                  <Text style={styles.checkInFieldHint}>Lesiones, sensaciones, lo que quieres recordar de hoy</Text>
                  <TextInput multiline placeholder="Ej: rodilla derecha molesta un poco..." placeholderTextColor={C.textDisabled}
                    style={[styles.metricInput, styles.notesInput]} value={todayCheckIn?.notes ?? ""}
                    onChangeText={(v) => onUpdateCheckIn("notes", v)} />
                </View>

                {todayCheckIn?.savedAt ? (
                  <Text style={styles.savedAt}>✓ Guardado {formatDateTime(todayCheckIn.savedAt)}</Text>
                ) : null}

                <View style={styles.checkInActions}>
                  <Pressable style={styles.btnPrimary} onPress={onSaveCheckIn}>
                    <Text style={styles.btnPrimaryText}>Guardar check-in</Text>
                  </Pressable>
                  <Pressable style={styles.btnGhost} onPress={onClearCheckIn}>
                    <Text style={styles.btnGhostText}>Limpiar</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              todayCheckIn?.savedAt ? (
                <Text style={styles.checkInCollapsedSaved}>✓ Guardado · {feedback.summary}</Text>
              ) : (
                <Text style={styles.checkInCollapsedHint}>Toca para completar el check-in</Text>
              )
            )}
          </Animated.View>
        );
      })() : null}

      {/* ── Mission banner ─────────────────────────────────── */}
      <View style={styles.missionCard}>
        <Text style={styles.missionEyebrow}>
          {favoriteSessionId === todayPrimarySession?.id ? "SESIÓN ANCLA  ◎" : "MISIÓN DE HOY"}
        </Text>
        <Text style={styles.missionTitle} numberOfLines={2}>
          {todayPrimarySession?.title ?? "Sin sesión programada"}
        </Text>
        {todayPrimarySession ? (
          <Text style={styles.missionMeta}>
            {formatDate(todayPrimarySession.scheduledDate)}
            {"  \u00b7  "}{translateDayType(todayPrimarySession.dayType)}
            {"  \u00b7  "}{translateStatus(todayPrimarySession.status)}
          </Text>
        ) : (
          <Text style={styles.missionMeta}>
            {hasProgram
              ? "No hay próxima sesión planificada en el programa activo."
              : "Genera tu programa para ver las sesiones aquí."}
          </Text>
        )}

        {/* Weekly progress ring (simple bar) */}
        <View style={styles.weeklyRow}>
          <View style={styles.weeklyLabels}>
            <Text style={styles.weeklyValue}>
              {progress?.weeklyGoal.completedSessions ?? 0}
              <Text style={styles.weeklyOf}>/{progress?.weeklyGoal.targetSessions ?? 0}</Text>
            </Text>
            <Text style={styles.weeklyLabel}>sesiones esta semana</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${weeklyPct}%` as `${number}%` }]} />
          </View>
        </View>

        {/* Quick stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Text style={styles.statVal}>{todayCompletion}%</Text>
            <Text style={styles.statLabel}>hoy</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statVal}>{progress?.summary.currentStreak ?? 0}</Text>
            <Text style={styles.statLabel}>racha</Text>
          </View>
          <Pressable
            style={styles.statChip}
            onPress={() => setPbTooltipVisible((v) => !v)}
            hitSlop={8}
          >
            <Text style={[styles.statVal, { color: C.amber }]}>
              {typeof progress?.personalBests.jumpHeightCm === "number"
                ? `${progress.personalBests.jumpHeightCm} cm`
                : "–"}
            </Text>
            <Text style={[styles.statLabel, { textDecorationLine: "underline", textDecorationStyle: "dotted" }]}>salto PB ⓘ</Text>
          </Pressable>
        </View>

        {pbTooltipVisible ? (
          <Pressable
            style={styles.pbTooltip}
            onPress={() => setPbTooltipVisible(false)}
          >
            <Text style={styles.pbTooltipText}>
              <Text style={{ fontWeight: "800" }}>PB</Text> = Personal Best (mejor marca personal){"\n"}Tu mejor altura de salto registrada en los logs de sesión. Se actualiza automáticamente cuando ingresas un nuevo récord.{"\n"}
              <Text style={{ color: C.textMuted, fontSize: 11 }}>Toca para cerrar</Text>
            </Text>
          </Pressable>
        ) : null}

        {todayPrimarySession ? (
          <View style={styles.ctaStack}>
            <View style={styles.ctaRow}>
              <Pressable style={styles.ctaPrimary} onPress={onStartSession} disabled={loading}>
                <Text style={styles.ctaPrimaryText}>⚡ Iniciar sesión</Text>
              </Pressable>
              <Pressable style={styles.ctaGhost} onPress={onToggleFavorite}>
                <Text style={styles.ctaGhostText}>
                  {favoriteSessionId === todayPrimarySession.id ? "✕ Quitar favorita" : "★ Favorita"}
                </Text>
              </Pressable>
            </View>
            <Pressable style={styles.ctaSecondary} onPress={onPreloadSession} disabled={preloadBusy}>
              <Text style={styles.ctaSecondaryText}>
                {preloadBusy
                  ? "Precargando sesión..."
                  : todaySessionCached
                    ? "Sesión lista offline"
                    : "Pre cargar sesión"}
              </Text>
            </Pressable>
            <Text style={styles.ctaHint}>
              {todaySessionCached
                ? "Todo el contenido principal ya está guardado en el teléfono para entrenar sin señal."
                : "Descarga ejercicios, indicaciones y media ahora para poder abrir la sesión aunque falle la conectividad."}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Program setup ──────────────────────────────────── */}
      {!hasProgram ? (
        <Animated.View style={[
          styles.setupCard,
          { borderColor: pulseBorderColor },
          { shadowColor: C.teal, shadowOffset: { width: 0, height: 0 }, shadowRadius: 18, shadowOpacity: pulseShadowOpacity, elevation: 6 },
        ]}>
          {/* Header */}
          <View style={styles.setupHeaderRow}>
            <Text style={styles.setupTitle}>▤ Configurá tu programa</Text>
            <View style={styles.setupBadge}><Text style={styles.setupBadgeText}>NUEVO</Text></View>
          </View>
          <Text style={styles.setupSub}>
            Completa estos datos una sola vez y la app diseña tu plan de entrenamiento personalizado.
          </Text>
          {planningRecommendation?.summary ? (
            <View style={styles.hintBox}>
              <Text style={styles.setupHint}>💡 {planningRecommendation.summary}</Text>
            </View>
          ) : null}

          {/* ① Nombre visible */}
          <Text style={styles.fieldLabel}>Tu nombre o apodo</Text>
          <TextInput
            placeholder="Ej: Gonza"
            placeholderTextColor={C.textDisabled}
            style={styles.input}
            value={athleteSetup.displayName}
            onChangeText={(v) => onSetAthleteSetup((p) => ({ ...p, displayName: v }))}
          />

          {/* ② Deporte principal */}
          <Text style={styles.fieldLabel}>Deporte principal</Text>
          <View style={styles.chipGrid}>
            {SPORTS.map((s) => {
              const active = athleteSetup.sport === s.value;
              return (
                <Pressable
                  key={s.value}
                  style={[styles.sportChip, active && styles.sportChipActive]}
                  onPress={() => onSetAthleteSetup((p) => ({ ...p, sport: s.value }))}
                >
                  <Text style={[styles.sportChipText, active && styles.sportChipTextActive]}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ③ Días de entrenamiento del deporte */}
          <Text style={styles.fieldLabel}>¿Qué días entrenas tu deporte?</Text>
          <Text style={styles.fieldHint}>
            Los días de pista o gimnasio se integran al plan: los ejercicios de core/upper se adaptan si haces los movimientos indicados ese día.
          </Text>
          <View style={styles.dayRow}>
            {DAYS.map((d) => {
              const active = selectedSportDays.has(d.value);
              return (
                <Pressable
                  key={d.value}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                  onPress={() => toggleSportDay(d.value)}
                >
                  <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                    {d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {selectedSportDays.size > 0 ? (
            <Text style={styles.daySummary}>
              Días de deporte seleccionados: {Array.from(selectedSportDays).map((n) => DAYS.find((d) => d.value === n)?.label ?? n).join("  ·  ")}
            </Text>
          ) : null}

          {/* ④ Fase de temporada */}
          <Text style={styles.fieldLabel}>Fase de temporada</Text>
          <View style={styles.chipGrid}>
            {(["OFF_SEASON", "PRESEASON", "IN_SEASON", "COMPETITION"] as const).map((f) => {
              const active = athleteSetup.seasonPhase === f;
              const labels: Record<string, string> = {
                OFF_SEASON: "⬢ Fuera de temp.",
                PRESEASON:  "▶ Pre-temporada",
                IN_SEASON:  "◉ En temporada",
                COMPETITION:"★ Competencia",
              };
              return (
                <Pressable
                  key={f}
                  style={[styles.sportChip, active && styles.phaseChipActive]}
                  onPress={() => onSetAthleteSetup((p) => ({ ...p, seasonPhase: f }))}
                >
                  <Text style={[styles.sportChipText, active && styles.phaseChipTextActive]}>
                    {labels[f]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ⑤ FECHA DE INICIO – campo destacado */}
          <View style={styles.startDateWrapper}>
            <View style={styles.startDateHeader}>
              <Text style={styles.startDateLabel}>📅 Fecha de inicio del programa</Text>
              <View style={styles.importantBadge}><Text style={styles.importantBadgeText}>MÁS IMPORTANTE</Text></View>
            </View>
            <Text style={styles.startDateHint}>
              Define desde qué día empiezas. El plan se estructura a partir de esta fecha.
            </Text>
            <TextInput
              placeholder="YYYY-MM-DD"
              placeholderTextColor={C.textDisabled}
              style={styles.startDateInput}
              value={athleteSetup.startDate}
              onChangeText={(v) => onSetAthleteSetup((p) => ({ ...p, startDate: v }))}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          {/* ⑥ Fase de adecuación previa (opcional) */}
          <Pressable
            style={[styles.prepToggle, athleteSetup.includePreparationPhase && styles.prepToggleActive]}
            onPress={() => onSetAthleteSetup((p) => ({ ...p, includePreparationPhase: !p.includePreparationPhase }))}
          >
            <View style={[styles.prepToggleDot, athleteSetup.includePreparationPhase && styles.prepToggleDotActive]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.prepToggleTitle, athleteSetup.includePreparationPhase && { color: C.teal }]}>
                Incluir fase de adecuación previa (recomendada)
              </Text>
              <Text style={styles.prepToggleDesc}>
                {athleteSetup.includePreparationPhase
                  ? "3 semanas de isométricos, aterrizajes y carga básica antes del bloque principal. Ideal si vienes de un descanso o molestias."
                  : "Entras directo al programa principal. Solo si ya toleras bien fuerza y contactos."}
              </Text>
            </View>
          </Pressable>

          {/* Actions */}
          <View style={styles.setupActions}>
            <Pressable style={styles.btnSecondary} onPress={onSaveOnboarding} disabled={loading}>
              <Text style={styles.btnSecondaryText}>Guardar datos</Text>
            </Pressable>
            <Pressable style={styles.btnGenerarPrograma} onPress={() => setConfirmGenerateVisible(true)} disabled={loading || !athleteSetup.startDate}>
              <Text style={styles.btnGenerarProgramaText}>
                {loading ? "Generando…" : "⚡ Generar mi programa"}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {/* ── Refresh hint ─────────────────────────────────── */}
      <Pressable style={styles.refreshBtn} onPress={onRefresh} disabled={refreshing}>
        <Text style={styles.refreshBtnText}>{refreshing ? "Actualizando…" : "↻ Actualizar datos"}</Text>
      </Pressable>
    </ScrollView>

    {/* ── Modal motivacional: confirmar generación ─────────── */}
    <Modal
      visible={confirmGenerateVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setConfirmGenerateVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalEmoji}>🔥</Text>
          <Text style={styles.modalTitle}>¡No lo hagas!</Text>
          <Text style={styles.modalBody}>
            Si das este paso, aceptás priorizarte a vos mismo y a tus metas.{" "}{"\n\n"}Solo el{" "}
            <Text style={{ color: C.amber, fontWeight: "800" }}>5%</Text>
            {" "}está dispuesto a aceptar el desafío.
          </Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.modalBtnNo} onPress={() => setConfirmGenerateVisible(false)}>
              <Text style={styles.modalBtnNoText}>Todavía no</Text>
            </Pressable>
            <Pressable
              style={styles.modalBtnYes}
              onPress={() => { setConfirmGenerateVisible(false); onGenerateProgram(); }}
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

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  container: { padding: S.md, gap: S.md, paddingBottom: S.xl },

  // Mission banner
  missionCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.lg, gap: S.sm, borderWidth: 1, borderColor: C.amberBorder },
  missionEyebrow: { color: C.amber, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.4 },
  missionTitle: { color: C.text, fontSize: 28, fontWeight: "800", lineHeight: 34 },
  missionMeta: { color: C.textMuted, fontSize: 13 },
  weeklyRow: { gap: 6, marginTop: S.xs },
  weeklyLabels: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  weeklyValue: { color: C.text, fontSize: 22, fontWeight: "800" },
  weeklyOf: { color: C.textMuted, fontSize: 14 },
  weeklyLabel: { color: C.textMuted, fontSize: 12, marginLeft: 4 },
  progressTrack: { height: 6, borderRadius: R.full, backgroundColor: C.surfaceRaise, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: R.full, backgroundColor: C.amber },
  statsRow: { flexDirection: "row", gap: S.sm, marginTop: S.xs },
  statChip: { flex: 1, backgroundColor: C.surfaceRaise, borderRadius: R.md, padding: S.sm, alignItems: "center", gap: 2 },
  statVal: { color: C.text, fontSize: 20, fontWeight: "800" },
  statLabel: { color: C.textMuted, fontSize: 11 },
  pbTooltip: { backgroundColor: C.surfaceActive, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.amberBorder, marginTop: S.xs },
  pbTooltipText: { color: C.textSub, fontSize: 13, lineHeight: 19 },
  ctaStack: { gap: S.xs, marginTop: S.xs },
  ctaRow: { flexDirection: "row", gap: S.sm },
  ctaPrimary: { flex: 1, backgroundColor: C.amber, borderRadius: R.full, paddingVertical: 14, alignItems: "center" },
  ctaPrimaryText: { color: C.bg, fontWeight: "800", fontSize: 15 },
  ctaGhost: { paddingVertical: 14, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.borderStrong, alignItems: "center" },
  ctaGhostText: { color: C.textSub, fontWeight: "700", fontSize: 14 },
  ctaSecondary: { borderRadius: R.full, paddingVertical: 13, alignItems: "center", backgroundColor: C.surfaceRaise, borderWidth: 1, borderColor: C.tealBorder },
  ctaSecondaryText: { color: C.text, fontWeight: "800", fontSize: 14 },
  ctaHint: { color: C.textMuted, fontSize: 12, lineHeight: 18 },

  // Check-in card
  checkInCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.md, gap: S.sm, borderWidth: 1 },
  checkInHeader: { flexDirection: "row", gap: S.sm, alignItems: "flex-start" },
  feedbackDot: { width: 10, height: 10, borderRadius: R.full, marginTop: 4, flexShrink: 0 },
  checkInTitle: { color: C.text, fontWeight: "700", fontSize: 15, marginBottom: 2 },
  checkInSummary: { color: C.textSub, fontSize: 13, lineHeight: 19 },
  inputGrid: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  metricInput: { flex: 1, minWidth: 110, backgroundColor: C.surfaceRaise, borderRadius: R.md, paddingHorizontal: S.sm, paddingVertical: 10, color: C.text, borderWidth: 1, borderColor: C.border, fontSize: 14 },
  notesInput: { minHeight: 72, textAlignVertical: "top", flex: undefined, width: "100%" },
  savedAt: { color: C.textMuted, fontSize: 12 },
  checkInActions: { flexDirection: "row", gap: S.sm, flexWrap: "wrap" },

  // Buttons
  btnPrimary: { backgroundColor: C.amber, borderRadius: R.full, paddingVertical: 12, paddingHorizontal: S.md, alignItems: "center" },
  btnPrimaryText: { color: C.bg, fontWeight: "800", fontSize: 14 },
  btnSecondary: { backgroundColor: C.surfaceRaise, borderRadius: R.full, paddingVertical: 12, paddingHorizontal: S.md, alignItems: "center" },
  btnSecondaryText: { color: C.text, fontWeight: "700", fontSize: 14 },
  btnGhost: { paddingVertical: 12, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.borderStrong, alignItems: "center" },
  btnGhostText: { color: C.textSub, fontWeight: "700", fontSize: 14 },

  // Setup card
  setupCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.md, gap: S.sm, borderWidth: 1.5 },
  setupHeaderRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  setupTitle: { color: C.teal, fontWeight: "800", fontSize: 17, textTransform: "uppercase", letterSpacing: 0.8, flex: 1 },
  setupBadge: { backgroundColor: C.tealDim, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.tealBorder },
  setupBadgeText: { color: C.teal, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
          setupSub: { color: C.textSub, fontSize: 13, lineHeight: 19 },
  setupHint: { color: C.textMuted, fontSize: 12, lineHeight: 17 },
  hintBox: { backgroundColor: C.amberDim, borderRadius: R.md, padding: S.sm, borderWidth: 1, borderColor: C.amberBorder },
  fieldLabel: { color: C.textSub, fontSize: 13, fontWeight: "700", marginTop: 4 },
  fieldHint: { color: C.textMuted, fontSize: 12, lineHeight: 17, marginTop: -4 },
  input: { backgroundColor: C.surfaceRaise, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, color: C.text, borderWidth: 1, borderColor: C.border, fontSize: 14 },

  // Sport chips
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  sportChip: { paddingVertical: 7, paddingHorizontal: S.sm, borderRadius: R.full, backgroundColor: C.surfaceRaise, borderWidth: 1, borderColor: C.border },
  sportChipActive: { backgroundColor: C.tealDim, borderColor: C.teal },
  sportChipText: { color: C.textMuted, fontSize: 13, fontWeight: "600" },
  sportChipTextActive: { color: C.teal, fontWeight: "800" },
  phaseChipActive: { backgroundColor: C.amberDim, borderColor: C.amber },
  phaseChipTextActive: { color: C.amber, fontWeight: "800" },

  // Day chips
  dayRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  dayChip: { width: 38, height: 38, borderRadius: R.full, backgroundColor: C.surfaceRaise, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  dayChipActive: { backgroundColor: C.tealDim, borderColor: C.teal },
  dayChipText: { color: C.textMuted, fontSize: 13, fontWeight: "700" },
  dayChipTextActive: { color: C.teal, fontWeight: "800" },
  daySummary: { color: C.textMuted, fontSize: 12, marginTop: -2 },

  // Start date – highlighted
  startDateWrapper: { backgroundColor: C.surfaceRaise, borderRadius: R.lg, padding: S.md, gap: 6, borderWidth: 1.5, borderColor: C.amberBorder },
  startDateHeader: { flexDirection: "row", alignItems: "center", gap: S.sm },
  startDateLabel: { color: C.amber, fontWeight: "800", fontSize: 14, flex: 1 },
  importantBadge: { backgroundColor: C.amberDim, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 3 },
  importantBadgeText: { color: C.amber, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  startDateHint: { color: C.textMuted, fontSize: 12 },
  startDateInput: { backgroundColor: C.surface, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 14, color: C.amber, borderWidth: 1.5, borderColor: C.amberBorder, fontSize: 16, fontWeight: "700", letterSpacing: 1 },

  // Prep toggle
  prepToggle: { flexDirection: "row", gap: S.sm, alignItems: "flex-start", padding: S.sm, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceRaise },
  prepToggleActive: { borderColor: C.tealBorder, backgroundColor: C.tealDim },
  prepToggleDot: { width: 20, height: 20, borderRadius: R.full, borderWidth: 2, borderColor: C.textMuted, marginTop: 1, flexShrink: 0 },
  prepToggleDotActive: { backgroundColor: C.teal, borderColor: C.teal },
  prepToggleTitle: { color: C.textSub, fontWeight: "700", fontSize: 13 },
  prepToggleDesc: { color: C.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },

  // Setup actions
  setupActions: { flexDirection: "row", gap: S.sm, flexWrap: "wrap", marginTop: S.xs },
  btnGenerarPrograma: { flex: 1, backgroundColor: C.teal, borderRadius: R.full, paddingVertical: 14, alignItems: "center" },
  btnGenerarProgramaText: { color: C.bg, fontWeight: "800", fontSize: 15 },

  refreshBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: S.md },
  refreshBtnText: { color: C.textMuted, fontSize: 13 },

  //  Check-in collapse & 2-col grid
  checkInHeaderTap: { gap: 4 },
  checkInMainTitle: { color: C.text, fontWeight: "800", fontSize: 16 },
  checkInSubResult: { color: C.amber, fontWeight: "700", fontSize: 13, marginTop: 1 },
  checkInChevron: { color: C.textMuted, fontSize: 20, paddingLeft: 8 },
  checkInFixedHint: { color: C.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  checkInFeedbackSummary: { color: C.textSub, fontSize: 12, lineHeight: 17, borderLeftWidth: 2, borderLeftColor: C.amberBorder, paddingLeft: 8 },
  sliderGrid: { flexDirection: "row", gap: S.lg },
  sliderCol: { flex: 1, gap: S.md },
  checkInCollapsedSaved: { color: C.teal, fontSize: 12, marginTop: 2 },
  checkInCollapsedHint: { color: C.textMuted, fontSize: 12, marginTop: 2 },

  // Check-in labeled fields
  checkInIntroBadge: { backgroundColor: C.amberDim, borderRadius: R.md, padding: S.sm, borderWidth: 1, borderColor: C.amberBorder },
  checkInIntroText: { color: C.amber, fontSize: 12, lineHeight: 18 },
  checkInRow: { flexDirection: "row", gap: S.sm },
  checkInField: { flex: 1, gap: 3 },
  checkInFieldLabel: { color: C.textSub, fontWeight: "700", fontSize: 13 },
  checkInFieldHint: { color: C.textMuted, fontSize: 11, lineHeight: 15 },

  // Motivational confirm modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "center", alignItems: "center", padding: S.lg },
  modalContent: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.lg, gap: S.md, borderWidth: 1.5, borderColor: C.amberBorder, width: "100%" },
  modalEmoji: { fontSize: 42, textAlign: "center" },
  modalTitle: { color: C.amber, fontWeight: "800", fontSize: 24, textAlign: "center" },
  modalBody: { color: C.text, fontSize: 15, lineHeight: 23, textAlign: "center" },
  modalActions: { flexDirection: "row", gap: S.sm, marginTop: S.xs },
  modalBtnNo: { flex: 1, borderWidth: 1, borderColor: C.borderStrong, borderRadius: R.full, paddingVertical: 14, alignItems: "center" },
  modalBtnNoText: { color: C.textSub, fontWeight: "700", fontSize: 14 },
  modalBtnYes: { flex: 1.6, backgroundColor: C.teal, borderRadius: R.full, paddingVertical: 14, alignItems: "center" },
  modalBtnYesText: { color: C.bg, fontWeight: "800", fontSize: 15 },
});

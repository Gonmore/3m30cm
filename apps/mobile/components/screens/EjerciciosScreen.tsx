import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import * as Speech from "expo-speech";
import * as WebBrowser from "expo-web-browser";
import { Audio, ResizeMode, Video } from "expo-av";
import { Image as ExpoImage } from "expo-image";
import type { ViewStyle } from "react-native";
import { rewriteLocalAssetUrl } from "../runtimeConfig";
import { R, S } from "../tokens";
import { useTheme } from "../ThemeContext";
import type { LogDraftState, SessionDetail, SessionGuidance } from "../types";

const DAY_TYPE_EMOJI: Record<string, string> = {
  JUMP: "↑",
  STRENGTH: "⬣",
  PLYOMETRIC: "⟁",
  RECOVERY: "〜",
  REST: "□",
};

// ── Traducción de types ─────────────────────────────────
const DAY_TYPE_LABEL: Record<string, string> = {
  JUMP: "Salto", STRENGTH: "Fuerza", PLYOMETRIC: "Pliometría",
  RECOVERY: "Recuperación", REST: "Descanso",
};

function fmtSecsLabel(s: number): string {
  if (s >= 60) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60}s` : ""}`;
  return `${s}s`;
}

function rewriteAssetUrl(url: string | null | undefined): string | null {
  return rewriteLocalAssetUrl(url);
}

function isLocalFileUri(url: string | null | undefined) {
  return typeof url === "string" && /^file:/i.test(url);
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] ?? null;
}

type ExerciseMediaAsset = SessionDetail["sessionExercises"][number]["exercise"]["mediaAssets"][number];

function sortMediaAssets(assets: ExerciseMediaAsset[]) {
  return [...assets]
    .filter((asset) => Boolean(asset.url))
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }

      const rank = (kind: string) => {
        if (kind === "IMAGE") return 0;
        if (kind === "GIF") return 1;
        if (kind === "VIDEO") return 2;
        return 3;
      };

      return rank(left.kind) - rank(right.kind);
    });
}

function ExerciseMediaView({
  asset,
  width,
  height,
  isActive = true,
}: {
  asset: ExerciseMediaAsset;
  width?: number;
  height: number;
  isActive?: boolean;
}) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  const remoteUri = rewriteAssetUrl(asset.url);
  const offlineUri = asset.offlineUrl ?? null;
  const [uri, setUri] = useState<string | null>(offlineUri ?? remoteUri);
  const [mediaLoading, setMediaLoading] = useState(true);

  useEffect(() => {
    setUri(offlineUri ?? remoteUri);
    setMediaLoading(true);
  }, [asset.id, offlineUri, remoteUri]);

  if (!uri) {
    return null;
  }

  const canFallbackToRemote = Boolean(offlineUri && remoteUri && offlineUri !== remoteUri);

  const handleMediaError = () => {
    if (canFallbackToRemote && uri === offlineUri) {
      setUri(remoteUri);
    }
  };

  const frameStyle: ViewStyle = {
    height,
    width: width ?? "100%",
  };

  if (asset.kind === "VIDEO") {
    const ytId = uri ? extractYouTubeId(uri) : null;
    if (ytId) {
      const thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      const youtubeUrl = `https://www.youtube.com/watch?v=${ytId}`;
      return (
        <Pressable
          style={[styles.mediaFrame, frameStyle]}
          onPress={() => void WebBrowser.openBrowserAsync(youtubeUrl, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN })}
        >
          <ExpoImage
            source={{ uri: thumbnailUrl }}
            style={[styles.exerciseImage, { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }]}
            contentFit="cover"
          />
          <View style={styles.ytPlayButton}>
            <Text style={styles.ytPlayIcon}>▶</Text>
          </View>
          <View style={styles.mediaKindChip}>
            <Text style={styles.mediaKindChipText}>▶ YouTube</Text>
          </View>
        </Pressable>
      );
    }
    return (
      <View style={[styles.mediaFrame, frameStyle]}>
        <Video
          source={{ uri }}
          style={styles.exerciseVideo}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={false}
          isLooping={false}
          onLoadStart={() => setMediaLoading(true)}
          onReadyForDisplay={() => setMediaLoading(false)}
          onError={handleMediaError}
        />
        {mediaLoading && (
          <View style={styles.mediaLoadingOverlay}>
            <ActivityIndicator size="large" color="#2CC4B0" />
          </View>
        )}
        <View style={styles.mediaKindChip}>
          <Text style={styles.mediaKindChipText}>VIDEO</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.mediaFrame, frameStyle]}>
      <ExpoImage
        source={{ uri }}
        style={styles.exerciseImage}
        contentFit="contain"
        transition={150}
        autoplay={asset.kind === "GIF" || isLocalFileUri(uri)}
        cachePolicy="none"
        onLoadStart={() => setMediaLoading(true)}
        onLoadEnd={() => setMediaLoading(false)}
        onError={handleMediaError}
      />
      {mediaLoading && (
        <View style={styles.mediaLoadingOverlay}>
          <ActivityIndicator size="large" color="#2CC4B0" />
        </View>
      )}
      <View style={styles.mediaKindChip}>
        <Text style={styles.mediaKindChipText}>{asset.kind === "GIF" ? "GIF" : "IMG"}</Text>
      </View>
    </View>
  );
}

// ── Countdown timer component ───────────────────────────
type TimerPhase = "idle" | "countdown" | "work" | "leg2-countdown" | "leg2-work" | "rest" | "done";

function ExerciseTimer({ workSeconds, restSeconds, totalSets, perLeg, isMuted = false, onMuteChange }: {
  workSeconds: number; restSeconds: number; totalSets: number; perLeg?: boolean;
  isMuted?: boolean; onMuteChange?: (muted: boolean) => void;
}) {
  const { C } = useTheme();
  const timerStyles = makeTimerStyles(C);
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [tick, setTick] = useState(3);                 // countdown 3,2,1
  const [remaining, setRemaining] = useState(workSeconds);
  const [currentSet, setCurrentSet] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const tickSoundRef = useRef<import("expo-av").Audio.Sound | null>(null);
  const tackSoundRef = useRef<import("expo-av").Audio.Sound | null>(null);
  const tackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechReadyRef = useRef(false);
  // Ref keeps mute state fresh inside setInterval closures (avoids stale closure)
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
    // Stop tick/tack immediately when the user mutes mid-run
    if (isMuted && tackTimerRef.current) {
      clearTimeout(tackTimerRef.current);
      tackTimerRef.current = null;
    }
  }, [isMuted]);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    Audio.Sound.createAsync(require("../../assets/sounds/tick.wav"), { shouldPlay: false, volume: 1.0 })
      .then(({ sound }) => { tickSoundRef.current = sound; }).catch(() => {});
    Audio.Sound.createAsync(require("../../assets/sounds/tack.wav"), { shouldPlay: false, volume: 1.0 })
      .then(({ sound }) => { tackSoundRef.current = sound; }).catch(() => {});

    // Warm up TTS engine immediately so "3, 2, 1" fires without cold-start delay
    Speech.speak(" ", { language: "es-ES" });
    const warmupTimeout = setTimeout(() => { speechReadyRef.current = true; }, 900);

    return () => {
      clearTimeout(warmupTimeout);
      tickSoundRef.current?.unloadAsync().catch(() => {});
      tackSoundRef.current?.unloadAsync().catch(() => {});
      Speech.stop();
    };
  }, []);

  function playTick() {
    const s = tickSoundRef.current;
    if (!s) return;
    s.setPositionAsync(0).then(() => s.playAsync()).catch(() => {});
  }

  function playTack() {
    const s = tackSoundRef.current;
    if (!s) return;
    s.setPositionAsync(0).then(() => s.playAsync()).catch(() => {});
  }

  function startTicTac() {
    if (isMutedRef.current) return;   // read from ref — always current value
    playTick();
    tackTimerRef.current = setTimeout(() => playTack(), 500);
  }

  function stopTicTac() {
    if (tackTimerRef.current) { clearTimeout(tackTimerRef.current); tackTimerRef.current = null; }
  }

  function pulse() {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.3, duration: 120, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,   duration: 120, useNativeDriver: true }),
    ]).start();
  }

  function clearTimer() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    stopTicTac();
  }

  function speak(text: string) {
    if (!speechReadyRef.current) {
      return;
    }
    Speech.speak(text, { language: "es-ES", rate: 1.1 });
  }

  function start() {
    clearTimer();
    setPhase("countdown");
    setTick(3);
    setCurrentSet(1);
    setRemaining(workSeconds);
  }

  function stop() {
    clearTimer();
    setPhase("idle");
    setTick(3);
    setRemaining(workSeconds);
    setCurrentSet(1);
  }

  useEffect(() => {
    clearTimer();
    setPhase("idle");
    setTick(3);
    setRemaining(workSeconds);
    setCurrentSet(1);
  }, [workSeconds, restSeconds, totalSets, perLeg]);

  useEffect(() => {
    if (phase === "idle" || phase === "done") return;
    clearTimer();

    if (phase === "countdown" || phase === "leg2-countdown") {
      const isLeg2 = phase === "leg2-countdown";
      setTick(3);
      if (isLeg2) {
        speak("¡Cambia de pierna!");
        // Brief pause before starting leg2 countdown
        const pauseTimer = setTimeout(() => {
          speak("3");
          intervalRef.current = setInterval(() => {
            setTick((prev) => {
              pulse();
              if (prev <= 1) {
                clearTimer();
                speak("¡Empieza!");
                setPhase("leg2-work");
                setRemaining(workSeconds);
                return 0;
              }
              const next = prev - 1;
              speak(String(next));
              return next;
            });
          }, 1000);
        }, 1200);
        return () => { clearTimeout(pauseTimer); clearTimer(); };
      } else {
        speak("3");
        intervalRef.current = setInterval(() => {
          setTick((prev) => {
            pulse();
            if (prev <= 1) {
              clearTimer();
              speak("¡Empieza!");
              setPhase("work");
              setRemaining(workSeconds);
              return 0;
            }
            const next = prev - 1;
            speak(String(next));
            return next;
          });
        }, 1000);
      }
    } else if (phase === "work" || phase === "leg2-work") {
      const isLeg2 = phase === "leg2-work";
      startTicTac();
      intervalRef.current = setInterval(() => {
        startTicTac();
        setRemaining((prev) => {
          if (prev <= 1) {
            clearTimer();
            pulse();
            if (isLeg2 || !perLeg) {
              // leg2 done (or non-perLeg work done) → rest or done
              if (currentSet >= totalSets) {
                speak("¡Listo!");
                setPhase("done");
              } else {
                speak("Descansa");
                setPhase("rest");
                setRemaining(restSeconds);
              }
            } else {
              // leg1 done and perLeg → go to leg2
              setPhase("leg2-countdown");
              setTick(3);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (phase === "rest") {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearTimer();
            pulse();
            setCurrentSet((s) => s + 1);
            setPhase("countdown");
            setTick(3);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return clearTimer;
  }, [phase, currentSet]);

  const phaseLabel: Record<TimerPhase, string> = {
    idle: "Listo para comenzar",
    countdown: "¡Prepárate!",
    work: perLeg ? `Serie ${currentSet}/${totalSets} — Pierna 1` : `Serie ${currentSet} de ${totalSets}`,
    "leg2-countdown": "¡Cambia de pierna!",
    "leg2-work": `Serie ${currentSet}/${totalSets} — Pierna 2`,
    rest: `Descanso — serie ${currentSet + 1} en breve`,
    done: "¡Completado! 🔥",
  };
  const phaseColor: Record<TimerPhase, string> = {
    idle: C.textMuted, countdown: C.amber, work: C.teal,
    "leg2-countdown": C.amber, "leg2-work": "#2a9d8f",
    rest: C.textSub, done: C.amber,
  };
  const bigNum = (phase === "countdown" || phase === "leg2-countdown") ? tick
    : (phase === "work" || phase === "leg2-work" || phase === "rest") ? remaining
    : workSeconds;

  function fmtSecs(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : String(s);
  }

  return (
    <View style={timerStyles.wrap}>
      {/* Info row */}
      <View style={timerStyles.infoRow}>
        <View style={timerStyles.infoPill}>
          <Text style={timerStyles.infoVal}>{totalSets}</Text>
          <Text style={timerStyles.infoLabel}>series</Text>
        </View>
        <View style={timerStyles.infoPill}>
          <Text style={timerStyles.infoVal}>{fmtSecs(workSeconds)}</Text>
          <Text style={timerStyles.infoLabel}>{perLeg ? "por pierna" : "trabajo"}</Text>
        </View>
        <View style={timerStyles.infoPill}>
          <Text style={timerStyles.infoVal}>{fmtSecs(restSeconds)}</Text>
          <Text style={timerStyles.infoLabel}>descanso</Text>
        </View>
      </View>

      {/* Big timer display */}
      {phase !== "idle" ? (
        <View style={timerStyles.dialWrap}>
          <View style={[timerStyles.dial, { borderColor: phaseColor[phase] }]}>
            <Animated.Text style={[timerStyles.dialNum, { color: phaseColor[phase], transform: [{ scale: pulseAnim }] }]}>
              {(phase === "countdown" || phase === "leg2-countdown")
                ? (tick > 0 ? String(tick) : "¡Ya!")
                : fmtSecs(phase === "done" ? 0 : remaining)}
            </Animated.Text>
            <Text style={[timerStyles.dialPhase, { color: phaseColor[phase] }]}>
              {phaseLabel[phase]}
            </Text>
          </View>
        </View>
      ) : (
        <View style={timerStyles.dialWrap}>
          <Text style={timerStyles.dialIdle}>{fmtSecs(workSeconds)}</Text>
          <Text style={timerStyles.dialSubIdle}>{perLeg ? "seg por pierna / serie" : "duración por serie"}</Text>
        </View>
      )}

      {/* Controls */}
      <View style={timerStyles.controls}>
        {phase === "idle" || phase === "done" ? (
          <Pressable style={timerStyles.btnStart} onPress={start}
            android_ripple={{ color: "rgba(0,0,0,0.15)", borderless: false }}>
            <Text style={timerStyles.btnStartText}>
              {phase === "done" ? "⟳ Repetir" : "▶ Iniciar ejercicio"}
            </Text>
          </Pressable>
        ) : (
          <Pressable style={timerStyles.btnStop} onPress={stop}
            android_ripple={{ color: "rgba(255,80,80,0.15)", borderless: false }}>
            <Text style={timerStyles.btnStopText}>■ Detener</Text>
          </Pressable>
        )}
        {/* Mute toggle — only visible once running */}
        {phase !== "idle" && phase !== "done" ? (
          <Pressable
            style={timerStyles.btnMute}
            onPress={() => onMuteChange?.(!isMuted)}
            android_ripple={{ color: "rgba(255,255,255,0.12)", borderless: true }}
          >
            <Text style={timerStyles.btnMuteText}>{isMuted ? "🔇" : "🔊"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function makeTimerStyles(C: ReturnType<typeof useTheme>["C"]) {
return StyleSheet.create({
  wrap: { backgroundColor: C.surfaceRaise, borderRadius: R.xl, padding: S.md, gap: S.md, borderWidth: 1, borderColor: C.border },
  infoRow: { flexDirection: "row", justifyContent: "space-around" },
  infoPill: { alignItems: "center", gap: 2 },
  infoVal: { color: C.text, fontWeight: "800", fontSize: 18 },
  infoLabel: { color: C.textMuted, fontSize: 11 },
  dialWrap: { alignItems: "center", paddingVertical: S.sm },
  dial: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, justifyContent: "center", alignItems: "center", gap: 4 },
  dialNum: { fontSize: 44, fontWeight: "800", lineHeight: 50 },
  dialPhase: { fontSize: 12, fontWeight: "700", textAlign: "center", paddingHorizontal: 8 },
  dialIdle: { color: C.textMuted, fontSize: 44, fontWeight: "800" },
  dialSubIdle: { color: C.textMuted, fontSize: 12, marginTop: 4 },
  controls: { alignItems: "center", gap: 10 },
  btnStart: { backgroundColor: C.teal, borderRadius: R.full, paddingVertical: 13, paddingHorizontal: S.xl, alignItems: "center" },
  btnStartText: { color: C.bg, fontWeight: "800", fontSize: 15 },
  btnStop: { borderWidth: 1, borderColor: C.danger, borderRadius: R.full, paddingVertical: 13, paddingHorizontal: S.xl, alignItems: "center" },
  btnStopText: { color: C.danger, fontWeight: "700", fontSize: 15 },
  btnMute: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: R.full, borderWidth: 1, borderColor: C.border },
  btnMuteText: { fontSize: 18 },
});
}

interface JumpTechniqueOption {
  id: string;
  title: string;
}

interface EjerciciosScreenProps {
  selectedSession: SessionDetail | null;
  selectedSessionGuidance: SessionGuidance | null;
  logDraft: LogDraftState | null;
  exerciseStep: number;
  loading: boolean;
  jumpTechniques?: JumpTechniqueOption[];
  selectedJumpTechniqueId?: string | null;
  onSetExerciseStep: (step: number) => void;
  onSetLogDraft: (updater: (prev: LogDraftState | null) => LogDraftState | null) => void;
  onToggleExercise: (exId: string) => void;
  onApplyJumpTest: (cm: number) => void;
  onSelectJumpTechnique?: (techniqueId: string | null) => void;
  onSubmitLog: () => void;
  onShowJumpGuide: () => void;
  onBack: () => void;
  exerciseLoadHints?: Record<string, {
    lastLoadKg: number | null;
    suggestedLoadKg: number | null;
    lastExecTimeSeconds: number | null;
    suggestedExecTimeSeconds: number | null;
    evolutionType: string | null;
  }>;
  exerciseLoadDraft?: Record<string, string>;
  onChangeLoad?: (exerciseId: string, value: string) => void;
  exerciseTimeDraft?: Record<string, string>;
  onChangeTime?: (exerciseId: string, value: string) => void;
  overreachAdjustment?: {
    isOverreach: boolean;
    reason?: "fatigue" | "pain" | "teamDay" | null;
    adjustedSets: Record<string, number>;
    skippedIds: Set<string>;
  };
  onToggleTeamDayAdjustment?: () => void;
  isTeamDayAdjustmentOverridden?: boolean;
  energyScore?: number | null;
  evolutionSuggestions?: Array<{ exerciseId: string; message: string }>;
}

export default function EjerciciosScreen({
  selectedSession,
  selectedSessionGuidance,
  logDraft,
  exerciseStep,
  loading,
  jumpTechniques = [],
  selectedJumpTechniqueId = null,
  onSetExerciseStep,
  onSetLogDraft,
  onToggleExercise,
  onApplyJumpTest,
  onSelectJumpTechnique = () => undefined,
  onSubmitLog,
  onShowJumpGuide,
  onBack,
  exerciseLoadHints = {},
  exerciseLoadDraft = {},
  onChangeLoad,
  exerciseTimeDraft = {},
  onChangeTime,
  overreachAdjustment,
  onToggleTeamDayAdjustment,
  isTeamDayAdjustmentOverridden = false,
  energyScore = null,
  evolutionSuggestions = [],
}: EjerciciosScreenProps) {
  const { C } = useTheme();
  const styles = makeStyles(C);
  if (!selectedSession) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyIcon}>⚡</Text>
        <Text style={styles.emptyTitle}>Sin sesión activa</Text>
        <Text style={styles.emptySub}>Volvé a Hoy y tocá "Iniciar sesión".</Text>
        <Pressable style={styles.btnBack} onPress={onBack}>
          <Text style={styles.btnBackText}>← Volver</Text>
        </Pressable>
      </View>
    );
  }

  const exercises = selectedSession.sessionExercises ?? [];
  const total = exercises.length;
  const done = (logDraft?.completedExerciseIds ?? []).length;
  const isLastStep = exerciseStep >= total;
  const currentExercise = !isLastStep ? exercises[exerciseStep] : null;
  const isCurrentCompleted = currentExercise ? (logDraft?.completedExerciseIds ?? []).includes(currentExercise.id) : false;
  const progressPct = total > 0 ? Math.round((exerciseStep / total) * 100) : 0;
  const dayEmoji = DAY_TYPE_EMOJI[selectedSession.dayType ?? ""] ?? "◉";

  // We need useState for a local step-expand. Easiest: compute it from exerciseStep key.
  const [stepsExpanded, setStepsExpanded] = useState(true);   // open by default
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryWidth, setGalleryWidth] = useState(0);
  const [blockExpandedItem, setBlockExpandedItem] = useState<string | null>(null);
  const [timerMuted, setTimerMuted] = useState(false); // persists across exercises in the session
  const lastCompletePress = useRef(0);
  // Reset to open when exercise changes
  useEffect(() => { setStepsExpanded(true); setGalleryIndex(0); }, [exerciseStep]);

  // ── helpers inside render ────────────────────────────
  function handleComplete() {
    if (!currentExercise) return;
    // Debounce: ignore rapid multi-taps within 600ms
    const now = Date.now();
    if (now - lastCompletePress.current < 600) return;
    lastCompletePress.current = now;
    if ((logDraft?.completedExerciseIds ?? []).includes(currentExercise.id)) return;
    const evo = currentExercise.exercise.evolution ?? null;
    if (currentExercise.exercise.requiresLoad || evo === "WEIGHT" || evo === "HYBRID") {
      const loadVal = exerciseLoadDraft[currentExercise.exercise.id];
      const parsed = parseFloat(loadVal ?? "");
      if (!loadVal || isNaN(parsed) || parsed <= 0) {
        Alert.alert("Carga requerida", "Ingresa el peso usado antes de completar el ejercicio.");
        return;
      }
    }
    if (evo === "TIME") {
      const timeVal = exerciseTimeDraft[currentExercise.exercise.id];
      const parsed = parseFloat(timeVal ?? "");
      if (!timeVal || isNaN(parsed) || parsed <= 0) {
        Alert.alert("Tiempo requerido", "Ingresa el tiempo de ejecución antes de completar el ejercicio.");
        return;
      }
    }
    onToggleExercise(currentExercise.id);
    onSetExerciseStep(exerciseStep + 1);
  }

  function handleSkip() {
    onSetExerciseStep(exerciseStep + 1);
  }

  function handlePrevious() {
    if (exerciseStep <= 0) {
      return;
    }

    onSetExerciseStep(exerciseStep - 1);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Progress bar ─────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}>
          <Text style={styles.backBtnText}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.sessionTitle}>
            {dayEmoji} {selectedSession.title}
          </Text>
          <Text style={styles.stepCounter}>
            {isLastStep ? "Resumen" : `Ejercicio ${exerciseStep + 1} de ${total}`}
          </Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${progressPct}%` as `${number}%`, backgroundColor: isLastStep ? C.teal : C.amber },
          ]}
        />
      </View>
      <Text style={styles.progressPct}>{progressPct}% completado</Text>

      {/* ── Guidance strip ───────────────────────────────── */}
      {selectedSessionGuidance?.emphasis && exerciseStep === 0 ? (
        <View style={styles.guidanceCard}>
          <Text style={styles.guidanceText}>{selectedSessionGuidance.emphasis}</Text>
        </View>
      ) : null}

      {/* ── Overreach banner ─────────────────────────────── */}
      {overreachAdjustment?.isOverreach ? (
        <View style={styles.overreachBanner}>
          <Text style={styles.overreachBannerTitle}>⚡ Sesión ajustada por sobreentrenamiento</Text>
          <Text style={styles.overreachBannerText}>
            {overreachAdjustment.reason === "fatigue"
              ? "Fatiga elevada detectada."
              : overreachAdjustment.reason === "pain"
                ? "Nivel de dolor elevado detectado."
                : "Día de entrenamiento de equipo detectado."}{" "}
            Volumen reducido al 50%. Los ejercicios de Velocidad fueron omitidos.
          </Text>
          {overreachAdjustment.reason === "teamDay" && onToggleTeamDayAdjustment ? (
            <Pressable style={styles.teamDayToggleBtn} onPress={onToggleTeamDayAdjustment}>
              <Text style={styles.teamDayToggleBtnText}>Sesion normal</Text>
              <Text style={styles.teamDayToggleBtnSub}>Ver sin ajuste de equipo</Text>
            </Pressable>
          ) : null}
        </View>
      ) : isTeamDayAdjustmentOverridden && onToggleTeamDayAdjustment ? (
        <View style={styles.teamDayNormalBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.teamDayNormalTitle}>◉ Sesion en modo normal</Text>
            <Text style={styles.teamDayNormalSub}>Dia de equipo activo · ajuste disponible</Text>
          </View>
          <Pressable style={styles.teamDayToggleBtn} onPress={onToggleTeamDayAdjustment}>
            <Text style={styles.teamDayToggleBtnText}>Sesion ajustada</Text>
            <Text style={styles.teamDayToggleBtnSub}>Activar ajuste de equipo</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Current exercise card ────────────────────────── */}
      {currentExercise && !isLastStep ? (() => {
        const ex = currentExercise.exercise;

        // ── Overreach: VELOCITY exercise skipped ─────────────────────
        if (overreachAdjustment?.skippedIds.has(currentExercise.id)) {
          return (
            <View style={styles.skippedExerciseCard}>
              <View style={styles.exerciseBadge}>
                <Text style={styles.exerciseBadgeText}>{exerciseStep + 1}/{total}</Text>
              </View>
              <Text style={styles.skippedBadgeText}>⚡ OMITIDO · Sesión aliviada</Text>
              <Text style={styles.skippedExerciseName}>{ex.name}</Text>
              <Text style={styles.skippedExerciseSub}>Este ejercicio de velocidad fue eliminado para proteger tu recuperación.</Text>
              <View style={styles.exerciseActions}>
                <Pressable
                  style={({ pressed }) => [styles.btnComplete, pressed && { opacity: 0.78 }]}
                  onPress={() => { onSetExerciseStep(exerciseStep + 1); }}
                  android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: false }}>
                  <Text style={styles.btnCompleteText}>Continuar →</Text>
                </Pressable>
                {exerciseStep > 0 ? (
                  <View style={styles.exerciseActionsSub}>
                    <Pressable
                      style={({ pressed }) => [styles.btnPrev, pressed && { opacity: 0.7 }]}
                      onPress={handlePrevious}
                      android_ripple={{ color: 'rgba(44,196,176,0.25)', borderless: false }}>
                      <Text style={styles.btnPrevText}>← Anterior</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }

        const allMedia = sortMediaAssets(ex.mediaAssets ?? []);
        const instructions = ex.instructions?.find((i) => i.locale === "es") ?? ex.instructions?.[0];
        // Parse steps: stored as JSON array or newline-separated string
        let stepsList: string[] = [];
        try {
          const parsed = JSON.parse(instructions?.steps ?? "[]");
          stepsList = Array.isArray(parsed) ? parsed : [String(parsed)];
        } catch {
          stepsList = (instructions?.steps ?? "").split(/\n+/).filter(Boolean);
        }
        const summary = instructions?.summary ?? null;

        // Timer params — only show if durationSeconds is set (restSeconds=0 is allowed)
        const workSec = currentExercise.durationSeconds ?? 0;
        const restSec = currentExercise.restSeconds ?? 0;
        // Use adjusted sets if overreach is active
        const originalSets = currentExercise.sets ?? 3;
        const sets = overreachAdjustment?.isOverreach
          ? (overreachAdjustment.adjustedSets[currentExercise.id] ?? originalSets)
          : originalSets;
        const hasTimer = !!(currentExercise.durationSeconds);

        // Build prescription label
        const parts: string[] = [];
        if (sets) parts.push(overreachAdjustment?.isOverreach && sets !== originalSets ? `${sets} series (↓ ajustado)` : `${sets} series`);
        if (currentExercise.durationSeconds)
          parts.push(fmtSecsLabel(currentExercise.durationSeconds));
        else if (currentExercise.repsText)
          parts.push(currentExercise.repsText);
        if (currentExercise.loadText) parts.push(currentExercise.loadText);
        if (currentExercise.restSeconds) parts.push(`desc. ${currentExercise.restSeconds}s`);

        // ── BLOCK card (contains multiple mini-exercises) ────────────
        if (ex.isBlock && ex.asBlock) {
          return (
            <View style={styles.exerciseCard}>
              {/* Badge / counter */}
              <View style={styles.exerciseBadge}>
                <Text style={styles.exerciseBadgeText}>{exerciseStep + 1}/{total}</Text>
              </View>

              {/* Block header */}
              <View style={styles.blockHeader}>
                <Text style={styles.blockBadgeText}>⬣ BLOQUE</Text>
              </View>
              <Text style={styles.exerciseName}>{ex.name}</Text>
              {summary ? <Text style={styles.exerciseSummary}>{summary}</Text> : null}

              {/* Mini-exercise items */}
              {ex.asBlock.items.map((item) => {
                const itemInstr = item.exercise.instructions?.find((i) => i.locale === "es") ?? item.exercise.instructions?.[0];
                let itemSteps: string[] = [];
                try {
                  const parsed = JSON.parse(itemInstr?.steps ?? "[]");
                  itemSteps = Array.isArray(parsed) ? parsed : [String(parsed)];
                } catch {
                  itemSteps = (itemInstr?.steps ?? "").split(/\n+/).filter(Boolean);
                }
                const primaryItemMedia = sortMediaAssets(item.exercise.mediaAssets ?? [])[0] ?? null;
                const isExpanded = blockExpandedItem === item.id;
                const prescParts: string[] = [];
                if (item.setsOverride) prescParts.push(`${item.setsOverride} series`);
                if (item.repsOverride) prescParts.push(item.repsOverride);

                return (
                  <View key={item.id} style={styles.blockItem}>
                    <Pressable
                      style={styles.blockItemHeader}
                      onPress={() => setBlockExpandedItem(isExpanded ? null : item.id)}
                    >
                      <View style={styles.blockItemNum}>
                        <Text style={styles.blockItemNumText}>{item.order + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.blockItemName}>{item.exercise.name}</Text>
                        {prescParts.length > 0 && (
                          <Text style={styles.blockItemPresc}>{prescParts.join("  ·  ")}</Text>
                        )}
                      </View>
                      <Text style={styles.stepsChevron}>{isExpanded ? "▴" : "▾"}</Text>
                    </Pressable>

                    {isExpanded && (
                      <View style={styles.blockItemBody}>
                        {primaryItemMedia ? (
                          <ExerciseMediaView asset={primaryItemMedia} height={160} isActive />
                        ) : null}
                        {itemInstr?.summary ? (
                          <Text style={styles.exerciseSummary}>{itemInstr.summary}</Text>
                        ) : null}
                        {itemSteps.length > 0 && (
                          <View style={{ gap: 4 }}>
                            {itemSteps.map((step, i) => (
                              <View key={i} style={styles.stepRow}>
                                <Text style={styles.stepNum}>{i + 1}</Text>
                                <Text style={styles.stepText}>{step}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {item.notes ? (
                          <Text style={styles.exerciseNotes}>{item.notes}</Text>
                        ) : null}
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Notes from program */}
              {currentExercise.notes ? (
                <Text style={styles.exerciseNotes}>{currentExercise.notes}</Text>
              ) : null}

              <View style={styles.exerciseActions}>
                <Pressable
                  style={({ pressed }) => [styles.btnComplete, pressed && { opacity: 0.78 }]}
                  onPress={handleComplete}
                  disabled={loading}
                  android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: false }}>
                  <Text style={styles.btnCompleteText}>Completar ✓</Text>
                </Pressable>
                <View style={styles.exerciseActionsSub}>
                  {exerciseStep > 0 ? (
                    <Pressable
                      style={({ pressed }) => [styles.btnPrev, pressed && { opacity: 0.7 }]}
                      onPress={handlePrevious}
                      android_ripple={{ color: 'rgba(44,196,176,0.25)', borderless: false }}>
                      <Text style={styles.btnPrevText}>← Anterior</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={({ pressed }) => [styles.btnSkip, pressed && { opacity: 0.7 }]}
                    onPress={handleSkip}
                    android_ripple={{ color: 'rgba(44,196,176,0.25)', borderless: false }}>
                    <Text style={styles.btnSkipText}>Saltar esta vez</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }

        return (
          <View style={styles.exerciseCard}>
            {/* Badge / counter */}
            <View style={styles.exerciseBadge}>
              <Text style={styles.exerciseBadgeText}>{exerciseStep + 1}/{total}</Text>
            </View>

            {/* Image gallery */}
            {allMedia.length > 0 ? (
              <View onLayout={(e) => setGalleryWidth(e.nativeEvent.layout.width)}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.galleryScroll}
                  onScroll={(e) => {
                    if (!galleryWidth) return;
                    const idx = Math.round(e.nativeEvent.contentOffset.x / galleryWidth);
                    setGalleryIndex(idx);
                  }}
                  scrollEventThrottle={16}
                >
                  {allMedia.map((asset, i) => (
                    <ExerciseMediaView
                      key={asset.id ?? i}
                      asset={asset}
                      width={galleryWidth || undefined}
                      height={220}
                      isActive={i === galleryIndex}
                    />
                  ))}
                </ScrollView>
                {allMedia.length > 1 && (
                  <View style={styles.galleryDots}>
                    {allMedia.map((_, i) => (
                      <View key={i} style={[styles.galleryDot, i === galleryIndex && styles.galleryDotActive]} />
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.exerciseImagePlaceholder}>
                <Text style={styles.exerciseImagePlaceholderText}>Sin imagen</Text>
              </View>
            )}

            {/* Name */}
            <Text style={styles.exerciseName}>{ex.name}</Text>

            {/* Prescription pill */}
            {parts.length > 0 ? (
              <View style={styles.prescriptionRow}>
                <Text style={styles.prescriptionText}>{parts.join("  ·  ")}</Text>
              </View>
            ) : null}

            {/* Steps / ejecución */}
            {stepsList.length > 0 ? (
              <View style={styles.stepsWrap}>
                <Pressable
                  style={styles.stepsHeader}
                  onPress={() => setStepsExpanded((v) => !v)}
                >
                  <Text style={styles.stepsTitle}>↓ Pasos / ejecución</Text>
                  <Text style={styles.stepsChevron}>{stepsExpanded ? "▴" : "▾"}</Text>
                </Pressable>
                {stepsExpanded ? (
                  <View style={styles.stepsList}>
                    {stepsList.map((step, i) => (
                      <View key={i} style={styles.stepRow}>
                        <Text style={styles.stepNum}>{i + 1}</Text>
                        <Text style={styles.stepText}>{step}</Text>
                      </View>
                    ))}
                    {instructions?.safetyNotes ? (
                      <View style={styles.safetyBox}>
                        <Text style={styles.safetyTitle}>⚠ Seguridad</Text>
                        <Text style={styles.safetyText}>{instructions.safetyNotes}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* ── Evolution-aware input block ────────────────────── */}
            {(() => {
              const evo = ex.evolution ?? null;
              const hint = exerciseLoadHints[ex.id];
              const showWeight = ex.requiresLoad || evo === "WEIGHT" || evo === "HYBRID";
              const showTime = evo === "TIME" || evo === "VELOCITY" || evo === "HYBRID";
              if (!showWeight && !showTime) return null;

              const weightVal = exerciseLoadDraft[ex.id] ?? "";
              const timeVal = exerciseTimeDraft[ex.id] ?? "";

              const timeLabel = evo === "VELOCITY" ? "⚡ Tiempo de ejecución (s)" : evo === "HYBRID" ? "⏱ Tiempo / velocidad (s)" : "⏱ Tiempo de trabajo (requerido)";
              const isTimeRequired = evo === "TIME";
              const isWeightRequired = ex.requiresLoad || evo === "WEIGHT" || evo === "HYBRID";

              return (
                <View style={{ gap: 10, marginTop: 10 }}>
                  {showWeight ? (
                    <View style={styles.loadInputWrap}>
                      <Text style={styles.loadInputTitle}>🏋️ Carga usada{isWeightRequired ? " (requerida)" : ""}</Text>
                      {hint?.lastLoadKg != null ? (
                        <Text style={styles.loadHintText}>
                          💪 Última vez: {hint.lastLoadKg} kg{hint.suggestedLoadKg != null ? `  ·  Sugerido: ${hint.suggestedLoadKg} kg` : ""}
                        </Text>
                      ) : (
                        <View style={{ gap: 2 }}>
                          <Text style={styles.loadHintMuted}>Primera vez con este ejercicio</Text>
                          <Text style={[styles.loadHintMuted, { fontSize: 12 }]}>Ingresa el peso extra total (barra + discos + implemento)</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <TextInput
                          keyboardType="decimal-pad"
                          placeholder={hint?.suggestedLoadKg != null ? `${hint.suggestedLoadKg}` : "Ej: 40"}
                          placeholderTextColor={C.textMuted}
                          value={weightVal}
                          onChangeText={(v) => onChangeLoad?.(ex.id, v)}
                          style={[styles.input, { flex: 1 }]}
                        />
                        <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }}>kg</Text>
                      </View>
                    </View>
                  ) : null}

                  {showTime ? (
                    <View style={styles.loadInputWrap}>
                      <Text style={styles.loadInputTitle}>{timeLabel}</Text>
                      {hint?.lastExecTimeSeconds != null ? (
                        <Text style={styles.loadHintText}>
                          ⏱ Última vez: {hint.lastExecTimeSeconds}s
                          {hint.suggestedExecTimeSeconds != null ? `  ·  Sugerido: ${hint.suggestedExecTimeSeconds}s` : ""}
                        </Text>
                      ) : evo === "VELOCITY" ? (
                        <Text style={styles.loadHintMuted}>⚡ Máxima intención explosiva — registrá el tiempo de ejecución</Text>
                      ) : (
                        <Text style={styles.loadHintMuted}>Primera vez — registrá el tiempo de trabajo</Text>
                      )}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <TextInput
                          keyboardType="number-pad"
                          placeholder={hint?.suggestedExecTimeSeconds != null ? `${hint.suggestedExecTimeSeconds}` : "Ej: 30"}
                          placeholderTextColor={C.textMuted}
                          value={timeVal}
                          onChangeText={(v) => onChangeTime?.(ex.id, v)}
                          style={[styles.input, { flex: 1 }]}
                        />
                        <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }}>s</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })()}

            {/* Timer block (only for timed exercises) */}
            {hasTimer ? (
              <ExerciseTimer
                key={`${currentExercise.id}:${workSec}:${restSec}:${sets}:${currentExercise.exercise.perLeg ? "leg" : "both"}`}
                workSeconds={workSec}
                restSeconds={restSec}
                totalSets={sets}
                perLeg={currentExercise.exercise.perLeg}
                isMuted={timerMuted}
                onMuteChange={setTimerMuted}
              />
            ) : null}

            {/* Notes from program */}
            {currentExercise.notes ? (
              <Text style={styles.exerciseNotes}>{currentExercise.notes}</Text>
            ) : null}

            {isCurrentCompleted ? (
              <View style={styles.reviewChip}>
                <Text style={styles.reviewChipText}>Ya completaste este ejercicio. Puedes revisarlo, pero no volver a marcarlo.</Text>
              </View>
            ) : null}

            <View style={styles.exerciseActions}>
              <Pressable
                style={({ pressed }) => [styles.btnComplete, isCurrentCompleted ? styles.btnCompleteDisabled : null, pressed && !isCurrentCompleted && { opacity: 0.78 }]}
                onPress={handleComplete}
                disabled={loading || isCurrentCompleted}
                android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: false }}>
                <Text style={[styles.btnCompleteText, isCurrentCompleted ? styles.btnCompleteTextDisabled : null]}>{isCurrentCompleted ? "✓ Listo" : "✓ Completar"}</Text>
              </Pressable>
              <View style={styles.exerciseActionsSub}>
                {exerciseStep > 0 ? (
                  <Pressable
                    style={({ pressed }) => [styles.btnPrev, pressed && { opacity: 0.7 }]}
                    onPress={handlePrevious}
                    android_ripple={{ color: 'rgba(44,196,176,0.25)', borderless: false }}>
                    <Text style={styles.btnPrevText}>← Atrás</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={({ pressed }) => [styles.btnSkip, pressed && { opacity: 0.7 }]}
                  onPress={handleSkip}
                  android_ripple={{ color: 'rgba(44,196,176,0.25)', borderless: false }}>
                  <Text style={styles.btnSkipText}>Saltar esta vez</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      })() : null}

      {/* ── Completed exercises chips ────────────────────── */}
      {done > 0 && !isLastStep ? (
        <View style={styles.doneChips}>
          <Text style={styles.doneChipsLabel}>Completados ({done})</Text>
          <View style={styles.doneChipsList}>
            {exercises
              .filter((ex) => (logDraft?.completedExerciseIds ?? []).includes(ex.id))
              .map((ex) => (
                <View key={ex.id} style={styles.doneChip}>
                  <Text style={styles.doneChipText}>✓ {ex.exercise.name}</Text>
                </View>
              ))}
          </View>
        </View>
      ) : null}

      {/* ── Evolution suggestions (energy >= 9, all sets done) ──── */}
      {evolutionSuggestions.length > 0 && !isLastStep ? (
        <View style={styles.evolutionWrap}>
          <Text style={styles.evolutionWrapTitle}>📈 Sugerencias de progresión</Text>
          {evolutionSuggestions.map((sug) => {
            const matchExercise = exercises.find((ex) => ex.exercise.id === sug.exerciseId);
            return (
              <View key={sug.exerciseId} style={styles.evolutionCard}>
                {matchExercise ? (
                  <Text style={styles.evolutionCardName}>{matchExercise.exercise.name}</Text>
                ) : null}
                <Text style={styles.evolutionCardMessage}>{sug.message}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* ── Close-out form ───────────────────────────────── */}
      {isLastStep ? (
        <View style={styles.closeOut}>
          <Text style={styles.closeOutTitle}>⬣ Cerrar sesión</Text>
          <Text style={styles.closeOutSub}>
            {done}/{total} ejercicios completados
          </Text>
          <View style={{ flexDirection: "row" }}>
            <Pressable
              style={({ pressed }) => [styles.btnPrev, pressed && { opacity: 0.7 }]}
              onPress={handlePrevious}
              android_ripple={{ color: 'rgba(44,196,176,0.25)', borderless: false }}>
              <Text style={styles.btnPrevText}>← Volver al último ejercicio</Text>
            </Pressable>
          </View>

          {/* RPE */}
          <Text style={styles.fieldLabel}>Esfuerzo percibido (RPE 1-10)</Text>
          <TextInput
            keyboardType="number-pad"
            placeholder="7"
            placeholderTextColor={C.textDisabled}
            style={styles.input}
            value={logDraft?.perceivedExertion ?? ""}
            onChangeText={(v) =>
              onSetLogDraft((prev) => prev ? { ...prev, perceivedExertion: v } : null)
            }
          />

          {/* Jump height + técnica inline */}
          <Text style={styles.fieldLabel}>Altura máx del salto (cm) + Técnica</Text>
          <View style={styles.jumpRow}>
            <TextInput
              keyboardType="decimal-pad"
              placeholder="45.0"
              placeholderTextColor={C.textDisabled}
              style={[styles.input, { flex: 1 }]}
              value={logDraft?.jumpHeightCm ?? ""}
              onChangeText={(v) =>
                onSetLogDraft((prev) => prev ? { ...prev, jumpHeightCm: v } : null)
              }
            />
            <Pressable style={styles.jumpGuideBtn} onPress={onShowJumpGuide}>
              <Text style={styles.jumpGuideBtnText}>?</Text>
            </Pressable>
          </View>

          {jumpTechniques.length > 0 ? (
            <View style={styles.jumpTechniqueRow}>
              {jumpTechniques.map((technique) => {
                const selected = selectedJumpTechniqueId === technique.id;
                return (
                  <Pressable
                    key={technique.id}
                    style={[styles.jumpTechniqueChip, selected ? styles.jumpTechniqueChipActive : null]}
                    onPress={() => onSelectJumpTechnique(selected ? null : technique.id)}
                  >
                    <Text style={[styles.jumpTechniqueChipText, selected ? styles.jumpTechniqueChipTextActive : null]}>
                      {selected ? "✓ " : ""}{technique.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {!!(logDraft?.jumpHeightCm) && !selectedJumpTechniqueId ? (
            <Text style={styles.jumpTechniqueWarn}>⚠ Seleccioná la técnica antes de guardar</Text>
          ) : null}

          {/* Velocity */}
          <Text style={styles.fieldLabel}>Velocidad promedio (m/s)</Text>
          <TextInput
            keyboardType="decimal-pad"
            placeholder="0.65"
            placeholderTextColor={C.textDisabled}
            style={styles.input}
            value={logDraft?.peakVelocityMps ?? ""}
            onChangeText={(v) =>
              onSetLogDraft((prev) => prev ? { ...prev, peakVelocityMps: v } : null)
            }
          />
          <View style={styles.measureHintCard}>
            <Text style={styles.measureHintTitle}>Cómo registrar la velocidad</Text>
            <Text style={styles.measureHintText}>Si tienes encoder, radar o una app validada, usa la <Text style={styles.measureHintStrong}>velocidad promedio que te entregue el dispositivo</Text> en la repetición más limpia y explosiva.</Text>
            <Text style={styles.measureHintText}>Mantén el mismo ejercicio, recorrido, carga y posición inicial cada vez. Si no tienes forma confiable de medirla, déjalo vacío antes que inventar un número.</Text>
          </View>

          {/* Overall notes */}
          <Text style={styles.fieldLabel}>Notas de la sesión</Text>
          <TextInput
            multiline
            placeholder="¿Cómo fue la sesión? ¿qué destacarías?"
            placeholderTextColor={C.textDisabled}
            style={[styles.input, styles.notesInput]}
            value={logDraft?.notes ?? ""}
            onChangeText={(v) =>
              onSetLogDraft((prev) => prev ? { ...prev, notes: v } : null)
            }
          />

          <Pressable style={styles.btnSave} onPress={onSubmitLog} disabled={loading}>
            <Text style={styles.btnSaveText}>
              {loading ? "Guardando…" : "★ Guardar sesión"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>["C"]) {
return StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  container: { padding: S.md, gap: S.md, paddingBottom: S.xl },

  // Empty state
  emptyWrap: { flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center", gap: S.sm, padding: S.xl },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { color: C.text, fontSize: 22, fontWeight: "800" },
  emptySub: { color: C.textSub, fontSize: 14, textAlign: "center" },
  btnBack: { marginTop: S.sm, paddingVertical: 12, paddingHorizontal: S.lg, backgroundColor: C.surfaceRaise, borderRadius: R.full },
  btnBackText: { color: C.text, fontWeight: "700", fontSize: 15 },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: S.sm },
  backBtn: { padding: 8 },
  backBtnText: { color: C.textSub, fontSize: 22 },
  headerCenter: { flex: 1 },
  sessionTitle: { color: C.text, fontWeight: "800", fontSize: 17 },
  stepCounter: { color: C.textMuted, fontSize: 12, marginTop: 2 },

  // Progress
  progressTrack: { height: 8, borderRadius: R.full, backgroundColor: C.surfaceRaise, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: R.full },
  progressPct: { color: C.textMuted, fontSize: 12, textAlign: "right" },

  // Guidance
  guidanceCard: { backgroundColor: C.tealDim, borderRadius: R.lg, padding: S.md, borderWidth: 1, borderColor: C.tealBorder },
  guidanceText: { color: C.tealLight, fontSize: 13, lineHeight: 19 },

  // Exercise card
  exerciseCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.lg, gap: S.sm, borderWidth: 1, borderColor: C.amberBorder },
  exerciseBadge: { alignSelf: "flex-start", backgroundColor: C.amberDim, borderRadius: R.full, paddingHorizontal: S.sm, paddingVertical: 4 },
  exerciseBadgeText: { color: C.amber, fontWeight: "800", fontSize: 12 },

  // Block card
  blockHeader: { backgroundColor: C.tealDim, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 6, alignSelf: "flex-start", borderWidth: 1, borderColor: C.tealBorder },
  blockBadgeText: { color: C.teal, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  blockItem: { borderWidth: 1, borderColor: C.border, borderRadius: R.md, overflow: "hidden" },
  blockItemHeader: { flexDirection: "row", gap: S.sm, alignItems: "center", padding: S.sm, backgroundColor: C.surfaceRaise },
  blockItemNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.tealDim, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: C.tealBorder },
  blockItemNumText: { color: C.teal, fontWeight: "800", fontSize: 12 },
  blockItemName: { color: C.text, fontWeight: "700", fontSize: 14 },
  blockItemPresc: { color: C.teal, fontSize: 11, marginTop: 1 },
  blockItemBody: { padding: S.sm, gap: S.xs, backgroundColor: C.bg },
  blockItemImage: { width: "100%", height: 140, borderRadius: R.md, backgroundColor: C.surfaceRaise },
  galleryScroll: { borderRadius: R.lg, overflow: "hidden" },
  galleryDots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 },
  galleryDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  galleryDotActive: { backgroundColor: C.amber },
  mediaFrame: { borderRadius: R.lg, backgroundColor: C.surfaceRaise, borderWidth: 1, borderColor: C.border, overflow: "hidden", justifyContent: "center", alignItems: "center", position: "relative" },
  exerciseImage: { width: "100%", height: "100%", backgroundColor: C.surfaceRaise },
  exerciseVideo: { width: "100%", height: "100%", backgroundColor: C.surfaceRaise },
  mediaKindChip: { position: "absolute", right: 10, bottom: 10, backgroundColor: C.surface + "dd", borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: C.borderStrong },
  mediaLoadingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.18)" },
  mediaKindChipText: { color: C.text, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  exerciseImagePlaceholder: { width: "100%", height: 120, borderRadius: R.lg, backgroundColor: C.surfaceRaise, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: C.border },
  exerciseImagePlaceholderText: { color: C.textDisabled, fontSize: 13 },
  exerciseName: { color: C.text, fontWeight: "800", fontSize: 24, lineHeight: 30 },
  exerciseSummary: { color: C.textSub, fontSize: 13, lineHeight: 19 },
  prescriptionRow: { backgroundColor: C.amberDim, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 8, borderWidth: 1, borderColor: C.amberBorder },
  prescriptionText: { color: C.amber, fontWeight: "700", fontSize: 13 },
  stepsWrap: { borderWidth: 1, borderColor: C.border, borderRadius: R.md, overflow: "hidden" },
  stepsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: S.sm, backgroundColor: C.surfaceRaise },
  stepsTitle: { color: C.textSub, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 },
  stepsChevron: { color: C.textMuted, fontSize: 14 },
  stepsList: { padding: S.sm, gap: 6 },
  stepRow: { flexDirection: "row", gap: S.sm, alignItems: "flex-start" },
  stepNum: { color: C.amber, fontWeight: "800", fontSize: 12, minWidth: 18, marginTop: 1 },
  stepText: { color: C.textSub, fontSize: 13, lineHeight: 19, flex: 1 },
  safetyBox: { backgroundColor: C.danger + "22", borderRadius: R.sm, padding: S.sm, marginTop: 4, borderWidth: 1, borderColor: C.danger + "55", gap: 3 },
  safetyTitle: { color: C.danger, fontWeight: "700", fontSize: 11, textTransform: "uppercase" },
  safetyText: { color: C.textSub, fontSize: 12, lineHeight: 17 },
  exerciseNotes: { color: C.textMuted, fontSize: 13 },
  focusCard: { backgroundColor: C.amberDim, borderRadius: R.md, padding: S.sm, gap: 4, borderWidth: 1, borderColor: C.amberBorder },
  focusTitle: { color: C.amber, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 },
  focusText: { color: C.amber, fontSize: 13, lineHeight: 18 },
  ytPlayButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(220,0,0,0.88)", alignItems: "center", justifyContent: "center" },
  ytPlayIcon: { color: "#fff", fontSize: 24, paddingLeft: 4 },
  loadInputWrap: { backgroundColor: C.tealDim, borderRadius: R.md, padding: S.sm, gap: 4, borderWidth: 1, borderColor: C.tealBorder },
  loadInputTitle: { color: C.teal, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 },
  loadHintText: { color: C.tealLight, fontSize: 13, lineHeight: 18 },
  loadHintMuted: { color: C.textMuted, fontSize: 13 },
  reviewChip: { backgroundColor: C.tealDim, borderRadius: R.md, padding: S.sm, borderWidth: 1, borderColor: C.tealBorder },
  reviewChipText: { color: C.tealLight, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  exerciseActions: { flexDirection: "column", gap: S.xs, marginTop: S.md },
  exerciseActionsSub: { flexDirection: "row", gap: S.sm },
  btnComplete: { width: "100%", height: 58, backgroundColor: C.amber, borderRadius: R.full, alignItems: "center", justifyContent: "center", shadowColor: C.amber, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  btnCompleteText: { color: C.bg, fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  btnCompleteDisabled: { backgroundColor: C.surfaceRaise, shadowOpacity: 0, elevation: 0, borderWidth: 1, borderColor: C.tealBorder },
  btnCompleteTextDisabled: { color: C.teal },
  btnPrev: { flex: 1, height: 46, borderRadius: R.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceRaise, alignItems: "center", justifyContent: "center" },
  btnPrevText: { color: C.textSub, fontWeight: "700", fontSize: 14 },
  btnSkip: { flex: 1, height: 46, borderRadius: R.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceRaise, alignItems: "center", justifyContent: "center" },
  btnSkipText: { color: C.textSub, fontWeight: "700", fontSize: 13 },

  // Done chips
  doneChips: { gap: S.xs },
  doneChipsLabel: { color: C.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  doneChipsList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  doneChip: { backgroundColor: C.tealDim, borderRadius: R.full, paddingHorizontal: S.sm, paddingVertical: 5, borderWidth: 1, borderColor: C.tealBorder },
  doneChipText: { color: C.teal, fontSize: 12, fontWeight: "600" },

  // Close-out form
  closeOut: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.lg, gap: S.sm, borderWidth: 1, borderColor: C.tealBorder },
  closeOutTitle: { color: C.teal, fontWeight: "800", fontSize: 18 },
  closeOutSub: { color: C.textMuted, fontSize: 13 },
  fieldLabel: { color: C.textSub, fontSize: 13, fontWeight: "600" },
  input: { backgroundColor: C.surfaceRaise, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, color: C.text, borderWidth: 1, borderColor: C.border, fontSize: 14 },
  notesInput: { minHeight: 80, textAlignVertical: "top" },
  jumpRow: { flexDirection: "row", gap: S.sm, alignItems: "center" },
  jumpTechniqueRow: { flexDirection: "row", flexWrap: "wrap", gap: S.xs, marginBottom: 2 },
  jumpTechniqueChip: { paddingVertical: 8, paddingHorizontal: S.sm, borderRadius: R.full, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surfaceRaise },
  jumpTechniqueChipActive: { backgroundColor: C.tealDim, borderColor: C.tealBorder },
  jumpTechniqueChipText: { color: C.textSub, fontSize: 12, fontWeight: "700" },
  jumpTechniqueChipTextActive: { color: C.teal },
  jumpTechniqueWarn: { color: C.danger, fontSize: 12 },
  jumpGuideBtn: { backgroundColor: C.amberDim, borderRadius: R.md, paddingVertical: 12, paddingHorizontal: S.sm, borderWidth: 1, borderColor: C.amberBorder },
  jumpGuideBtnText: { color: C.amber, fontWeight: "700", fontSize: 13 },
  measureHintCard: { backgroundColor: C.surfaceRaise, borderRadius: R.md, padding: S.sm, gap: 4, borderWidth: 1, borderColor: C.border },
  measureHintTitle: { color: C.text, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  measureHintText: { color: C.textSub, fontSize: 13, lineHeight: 19 },
  measureHintStrong: { color: C.amber, fontWeight: "800" },
  btnSave: { backgroundColor: C.amber, borderRadius: R.full, paddingVertical: 15, alignItems: "center", marginTop: S.xs },
  btnSaveText: { color: C.bg, fontWeight: "800", fontSize: 16 },

  // Overreach banner
  overreachBanner: { backgroundColor: "#7c3a0022", borderRadius: R.md, padding: S.sm, gap: 4, borderWidth: 1, borderColor: "#c0621044" },
  overreachBannerTitle: { color: C.amber, fontWeight: "800", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 },
  overreachBannerText: { color: C.amber, fontSize: 12, lineHeight: 18 },
  teamDayToggleBtn: { backgroundColor: C.bg, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 7, alignItems: "center" as const, alignSelf: "flex-start" as const, borderWidth: 1, borderColor: C.border, marginTop: 4 },
  teamDayToggleBtnText: { color: C.text, fontWeight: "700" as const, fontSize: 12 },
  teamDayToggleBtnSub: { color: C.textMuted, fontSize: 10, marginTop: 1 },
  teamDayNormalBanner: { backgroundColor: C.surfaceRaise, borderRadius: R.md, padding: S.sm, borderWidth: 1, borderColor: C.border, flexDirection: "row" as const, alignItems: "center" as const, gap: S.sm },
  teamDayNormalTitle: { color: C.textSub, fontWeight: "700" as const, fontSize: 12 },
  teamDayNormalSub: { color: C.textMuted, fontSize: 11, marginTop: 1 },

  // Skipped (VELOCITY) exercise card
  skippedExerciseCard: { backgroundColor: C.surfaceRaise, borderRadius: R.xl, padding: S.lg, gap: S.sm, borderWidth: 1, borderColor: C.border, opacity: 0.7 },
  skippedBadgeText: { color: C.amber, fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 },
  skippedExerciseName: { color: C.textSub, fontSize: 18, fontWeight: "700", textDecorationLine: "line-through" },
  skippedExerciseSub: { color: C.textMuted, fontSize: 13, lineHeight: 18 },

  // Evolution suggestion cards
  evolutionWrap: { gap: S.xs },
  evolutionWrapTitle: { color: C.teal, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  evolutionCard: { backgroundColor: C.tealDim, borderRadius: R.md, padding: S.sm, gap: 2, borderWidth: 1, borderColor: C.tealBorder },
  evolutionCardName: { color: C.tealLight, fontSize: 12, fontWeight: "700" },
  evolutionCardMessage: { color: C.teal, fontSize: 13, lineHeight: 18 },
});
}

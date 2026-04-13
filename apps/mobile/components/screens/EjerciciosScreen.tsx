import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import * as Speech from "expo-speech";
import { Audio, ResizeMode, Video } from "expo-av";
import { Image as ExpoImage } from "expo-image";
import type { ViewStyle } from "react-native";
import { rewriteLocalAssetUrl } from "../runtimeConfig";
import { C, R, S } from "../tokens";
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
  const remoteUri = rewriteAssetUrl(asset.url);
  const offlineUri = asset.offlineUrl ?? null;
  const [uri, setUri] = useState<string | null>(offlineUri ?? remoteUri);

  useEffect(() => {
    setUri(offlineUri ?? remoteUri);
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
    return (
      <View style={[styles.mediaFrame, frameStyle]}>
        <Video
          source={{ uri }}
          style={styles.exerciseVideo}
          useNativeControls={false}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={isActive}
          isLooping
          isMuted
          onError={handleMediaError}
        />
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
        onError={handleMediaError}
      />
      <View style={styles.mediaKindChip}>
        <Text style={styles.mediaKindChipText}>{asset.kind === "GIF" ? "GIF" : "IMG"}</Text>
      </View>
    </View>
  );
}

// ── Countdown timer component ───────────────────────────
type TimerPhase = "idle" | "countdown" | "work" | "leg2-countdown" | "leg2-work" | "rest" | "done";

function ExerciseTimer({ workSeconds, restSeconds, totalSets, perLeg }: {
  workSeconds: number; restSeconds: number; totalSets: number; perLeg?: boolean;
}) {
  const [phase, setPhase] = useState<TimerPhase>("idle");
  const [tick, setTick] = useState(3);                 // countdown 3,2,1
  const [remaining, setRemaining] = useState(workSeconds);
  const [currentSet, setCurrentSet] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const tickSoundRef = useRef<import("expo-av").Audio.Sound | null>(null);
  const tackSoundRef = useRef<import("expo-av").Audio.Sound | null>(null);
  const tackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    Audio.Sound.createAsync(require("../../assets/sounds/tick.wav"), { shouldPlay: false, volume: 1.0 })
      .then(({ sound }) => { tickSoundRef.current = sound; }).catch(() => {});
    Audio.Sound.createAsync(require("../../assets/sounds/tack.wav"), { shouldPlay: false, volume: 1.0 })
      .then(({ sound }) => { tackSoundRef.current = sound; }).catch(() => {});
    return () => {
      tickSoundRef.current?.unloadAsync().catch(() => {});
      tackSoundRef.current?.unloadAsync().catch(() => {});
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
    Speech.stop();
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
          <Pressable style={timerStyles.btnStart} onPress={start}>
            <Text style={timerStyles.btnStartText}>
              {phase === "done" ? "⟳ Repetir" : "▶ Iniciar ejercicio"}
            </Text>
          </Pressable>
        ) : (
          <Pressable style={timerStyles.btnStop} onPress={stop}>
            <Text style={timerStyles.btnStopText}>■ Detener</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const timerStyles = StyleSheet.create({
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
  controls: { alignItems: "center" },
  btnStart: { backgroundColor: C.teal, borderRadius: R.full, paddingVertical: 13, paddingHorizontal: S.xl, alignItems: "center" },
  btnStartText: { color: C.bg, fontWeight: "800", fontSize: 15 },
  btnStop: { borderWidth: 1, borderColor: C.danger, borderRadius: R.full, paddingVertical: 13, paddingHorizontal: S.xl, alignItems: "center" },
  btnStopText: { color: C.danger, fontWeight: "700", fontSize: 15 },
});

interface EjerciciosScreenProps {
  selectedSession: SessionDetail | null;
  selectedSessionGuidance: SessionGuidance | null;
  logDraft: LogDraftState | null;
  exerciseStep: number;
  loading: boolean;
  onSetExerciseStep: (step: number) => void;
  onSetLogDraft: (updater: (prev: LogDraftState | null) => LogDraftState | null) => void;
  onToggleExercise: (exId: string) => void;
  onApplyJumpTest: (cm: number) => void;
  onSubmitLog: () => void;
  onShowJumpGuide: () => void;
  onBack: () => void;
}

export default function EjerciciosScreen({
  selectedSession,
  selectedSessionGuidance,
  logDraft,
  exerciseStep,
  loading,
  onSetExerciseStep,
  onSetLogDraft,
  onToggleExercise,
  onApplyJumpTest,
  onSubmitLog,
  onShowJumpGuide,
  onBack,
}: EjerciciosScreenProps) {
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
  // Reset to open when exercise changes
  useEffect(() => { setStepsExpanded(true); setGalleryIndex(0); }, [exerciseStep]);

  // ── helpers inside render ────────────────────────────
  function handleComplete() {
    if (!currentExercise) return;
    if ((logDraft?.completedExerciseIds ?? []).includes(currentExercise.id)) {
      return;
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
        <Pressable onPress={onBack} style={styles.backBtn}>
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

      {/* ── Current exercise card ────────────────────────── */}
      {currentExercise && !isLastStep ? (() => {
        const ex = currentExercise.exercise;
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

        // Timer params — only show if BOTH durationSeconds and restSeconds are set
        const workSec = currentExercise.durationSeconds ?? 0;
        const restSec = currentExercise.restSeconds ?? 0;
        const sets = currentExercise.sets ?? 3;
        const hasTimer = !!(currentExercise.durationSeconds && currentExercise.restSeconds);

        // Build prescription label
        const parts: string[] = [];
        if (sets) parts.push(`${sets} series`);
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
                <Pressable style={styles.btnComplete} onPress={handleComplete} disabled={loading}>
                  <Text style={styles.btnCompleteText}>✓ Completar</Text>
                </Pressable>
                <Pressable style={styles.btnSkip} onPress={handleSkip}>
                  <Text style={styles.btnSkipText}>Saltar →</Text>
                </Pressable>
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

            {/* Summary */}
            {summary ? <Text style={styles.exerciseSummary}>{summary}</Text> : null}

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

            {/* Focus cue */}
            {currentExercise.guidance?.focus ? (
              <View style={styles.focusCard}>
                <Text style={styles.focusTitle}>◎ Foco técnico</Text>
                <Text style={styles.focusText}>{currentExercise.guidance.focus}</Text>
              </View>
            ) : null}

            {/* Timer block (only for timed exercises) */}
            {hasTimer ? (
              <ExerciseTimer
                workSeconds={workSec}
                restSeconds={restSec}
                totalSets={sets}
                perLeg={currentExercise.exercise.perLeg}
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
              {exerciseStep > 0 ? (
                <Pressable style={styles.btnPrev} onPress={handlePrevious}>
                  <Text style={styles.btnPrevText}>← Anterior</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.btnComplete, isCurrentCompleted ? styles.btnCompleteDisabled : null]} onPress={handleComplete} disabled={loading || isCurrentCompleted}>
                <Text style={[styles.btnCompleteText, isCurrentCompleted ? styles.btnCompleteTextDisabled : null]}>{isCurrentCompleted ? "✓ Completado" : "✓ Completar"}</Text>
              </Pressable>
              <Pressable style={styles.btnSkip} onPress={handleSkip}>
                <Text style={styles.btnSkipText}>Saltar →</Text>
              </Pressable>
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

      {/* ── Close-out form ───────────────────────────────── */}
      {isLastStep ? (
        <View style={styles.closeOut}>
          <Text style={styles.closeOutTitle}>⬣ Cerrar sesión</Text>
          <Text style={styles.closeOutSub}>
            {done}/{total} ejercicios completados
          </Text>

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

          {/* Jump height */}
          <Text style={styles.fieldLabel}>Altura máx del salto (cm)</Text>
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
              <Text style={styles.jumpGuideBtnText}>? Cómo medir</Text>
            </Pressable>
          </View>
          <View style={styles.measureHintCard}>
            <Text style={styles.measureHintTitle}>Cómo registrar la altura</Text>
            <Text style={styles.measureHintText}>Usa siempre el mismo método: marca tu alcance parado (A), luego tu alcance en el salto (B), y registra <Text style={styles.measureHintStrong}>B - A</Text> en centímetros.</Text>
            <Text style={styles.measureHintText}>Haz 3 intentos con descanso completo y anota el mejor. Si cambias calentamiento, pared o técnica de medición, el dato deja de ser comparable.</Text>
          </View>

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

const styles = StyleSheet.create({
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
  reviewChip: { backgroundColor: C.tealDim, borderRadius: R.md, padding: S.sm, borderWidth: 1, borderColor: C.tealBorder },
  reviewChipText: { color: C.tealLight, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  exerciseActions: { flexDirection: "row", gap: S.sm, marginTop: S.xs },
  btnComplete: { flex: 1, backgroundColor: C.amber, borderRadius: R.full, paddingVertical: 15, alignItems: "center" },
  btnCompleteText: { color: C.bg, fontWeight: "800", fontSize: 16 },
  btnCompleteDisabled: { backgroundColor: C.surfaceRaise, borderWidth: 1, borderColor: C.tealBorder },
  btnCompleteTextDisabled: { color: C.teal },
  btnPrev: { paddingVertical: 15, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surfaceRaise },
  btnPrevText: { color: C.textSub, fontWeight: "700", fontSize: 15 },
  btnSkip: { paddingVertical: 15, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.borderStrong },
  btnSkipText: { color: C.textSub, fontWeight: "700", fontSize: 15 },

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
  jumpGuideBtn: { backgroundColor: C.amberDim, borderRadius: R.md, paddingVertical: 12, paddingHorizontal: S.sm, borderWidth: 1, borderColor: C.amberBorder },
  jumpGuideBtnText: { color: C.amber, fontWeight: "700", fontSize: 13 },
  measureHintCard: { backgroundColor: C.surfaceRaise, borderRadius: R.md, padding: S.sm, gap: 4, borderWidth: 1, borderColor: C.border },
  measureHintTitle: { color: C.text, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  measureHintText: { color: C.textSub, fontSize: 13, lineHeight: 19 },
  measureHintStrong: { color: C.amber, fontWeight: "800" },
  btnSave: { backgroundColor: C.amber, borderRadius: R.full, paddingVertical: 15, alignItems: "center", marginTop: S.xs },
  btnSaveText: { color: C.bg, fontWeight: "800", fontSize: 16 },
});

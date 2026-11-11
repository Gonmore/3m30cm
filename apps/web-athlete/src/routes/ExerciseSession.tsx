import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useApi, handleApiResponse } from "../api/client";
import { useTheme } from "../contexts/ThemeContext";
import {
  DAY_TYPE_CONFIG,
  type ExerciseMediaAsset,
  type SessionDetail,
  type SessionExercise,
} from "../types/api";

export default function ExerciseSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const exerciseIdParam = searchParams.get("exercise");
  const api = useApi();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [exercisesDone, setExercisesDone] = useState<Set<string>>(new Set());
  const [showRepsModal, setShowRepsModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<SessionExercise | null>(null);
  const [repsInput, setRepsInput] = useState("");
  const [rpeInput, setRpeInput] = useState("");
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showMedia, setShowMedia] = useState(true);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerMuted, setTimerMuted] = useState(false);
  const timerRef = useRef<number | null>(null);
  const timerInitializedRef = useRef(false);
  const timerMutedRef = useRef(false);

  const exercises = session?.session.sessionExercises ?? [];

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimerRunning(false);
  };

  useEffect(() => {
    timerMutedRef.current = timerMuted;
  }, [timerMuted]);

  const playBeep = (freq = 660, duration = 0.08) => {
    if (timerMutedRef.current) return;
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = 0.1;
      osc.start();
      osc.stop(ctx.currentTime + duration);
      osc.onended = () => {
        try {
          ctx.close();
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }
  };

  const startTimer = (seconds: number) => {
    clearTimer();
    setTimerSeconds(seconds);
    setTimerRunning(true);
    timerRef.current = window.setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          clearTimer();
          playBeep(1200, 0.3);
          return 0;
        }
        playBeep(prev <= 3 ? 1000 : 660, 0.08);
        return prev - 1;
      });
    }, 1000);
  };

  const handleStartSession = () => {
    setSessionStarted(true);
    clearTimer();
    void api(`/athlete/sessions/${sessionId}/logs`, {
      method: "POST",
      body: JSON.stringify({
        startedAt: new Date().toISOString(),
        notes: "Sesión iniciada",
      }),
    });
  };

  const handleCompleteExercise = (exercise: SessionExercise) => {
    setSelectedExercise(exercise);
    setShowRepsModal(true);
    setRepsInput("");
    setRpeInput("");
    clearTimer();
  };

  const handleLogExercise = async () => {
    if (!selectedExercise || !session) return;
    setIsLoading(true);
    try {
      const completedIds = new Set(exercisesDone);
      completedIds.add(selectedExercise.id);

      await api(`/athlete/sessions/${sessionId}/logs`, {
        method: "POST",
        body: JSON.stringify({
          completedExerciseIds: Array.from(completedIds),
          metrics: (selectedExercise.exercise?.requiresLoad ?? selectedExercise.requiresWeight)
            ? { sets: selectedExercise.sets, reps: repsInput, rpe: rpeInput ? parseInt(rpeInput) : undefined }
            : { sets: selectedExercise.sets, reps: repsInput },
          notes: `Completado: ${repsInput} rep`,
        }),
      });

      setExercisesDone(completedIds);
      setShowRepsModal(false);
      setSelectedExercise(null);

      if (session) {
        const updatedExercises = session.session.sessionExercises.map((e) => ({
          ...e,
          completed: completedIds.has(e.id),
          completedAt: completedIds.has(e.id) ? new Date().toISOString() : e.completedAt,
        }));
        setSession({
          ...session,
          session: {
            ...session.session,
            sessionExercises: updatedExercises,
          },
        });
      }

      navigate(`/programa/sessions/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar ejercicio");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipExercise = () => {
    clearTimer();
    navigate(`/programa/sessions/${sessionId}`);
  };

  const handleCompleteSession = async () => {
    if (!session) return;
    const allIds = session.session.sessionExercises
      ?.filter((e) => e.exercise)
      .map((e) => e.id) ?? [];
    const allDone = new Set(allIds);

    setIsLoading(true);
    try {
      await api(`/athlete/sessions/${sessionId}/logs`, {
        method: "POST",
        body: JSON.stringify({
          completedExerciseIds: Array.from(allDone),
          completedAt: new Date().toISOString(),
          perceivedExertion: rpeInput ? parseInt(rpeInput) : 7,
          notes: "Sesión completada",
        }),
      });

      setExercisesDone(allDone);
      setSessionStarted(false);
      navigate("/programa", { state: { sessionCompleted: true } });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipSession = async () => {
    clearTimer();
    setIsLoading(true);
    try {
      await api(`/athlete/sessions/${sessionId}/logs`, {
        method: "POST",
        body: JSON.stringify({
          completedExerciseIds: [],
          notes: "Sesión saltada",
        }),
      });
      navigate("/programa");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) return;

    const fetchSession = async () => {
      try {
        const response = await api(`/athlete/sessions/${sessionId}`);
        const sessionData = await handleApiResponse<SessionDetail>(response);
        setSession(sessionData);

        const hasCompleted = !!sessionData.session.logs?.some((l) => l.completedAt);
        if (hasCompleted) {
          setSessionStarted(false);
          const doneIds = new Set(
            sessionData.session.logs
              .filter((l) => l.completedExerciseIds && l.completedExerciseIds.length > 0)
              .flatMap((l) => l.completedExerciseIds),
          );
          setExercisesDone(doneIds);
        } else {
          setSessionStarted(true);
        }
      } catch (err: any) {
        const locked = err?.data?.locked || err?.data?.lockReason === "PENDING_COACH_APPROVAL";
        if (locked) {
          const coachName = err?.data?.coachName || "tu coach";
          setError(`Esta sesión está bloqueada hasta que ${coachName} apruebe tu programa premium. Solo puedes realizar la sesión del primer día.`);
        } else {
          setError(err instanceof Error ? err.message : "Error al cargar sesión");
        }
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSession();
  }, [api, sessionId]);

  useEffect(() => {
    if (exerciseIdParam) {
      const idx = exercises.findIndex((e) => e.id === exerciseIdParam);
      if (idx >= 0) setCurrentExerciseIndex(idx);
    }
  }, [exerciseIdParam, exercises]);

  useEffect(() => {
    const ex = session?.session.sessionExercises?.[currentExerciseIndex];
    clearTimer();
    if (ex?.durationSeconds && ex.durationSeconds > 0) {
      setTimerSeconds(ex.durationSeconds);
      timerInitializedRef.current = true;
    } else {
      setTimerSeconds(0);
      timerInitializedRef.current = false;
    }
  }, [currentExerciseIndex, session]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="{textSecondaryColor}">Cargando…</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">
        {error ?? "Sesión no encontrada"}
      </div>
    );
  }

  const dayConfig = DAY_TYPE_CONFIG[session.session.dayType] || DAY_TYPE_CONFIG.OTHER;
  const currentExercise = exercises[currentExerciseIndex] ?? exercises[0];
  const allExercisesDone = exercises.every((e) => exercisesDone.has(e.id));
  const bgImage = theme === "dark" ? "/Hombre.jpeg?v=3" : "/Mujer.jpeg?v=3";
  const overlayClass = theme === "dark" ? "bg-black/40" : "bg-white/30";
  const textColor = theme === "dark" ? "text-white" : "text-surface-100";
  const textSecondaryColor = theme === "dark" ? "text-surface-400" : "text-surface-500";
  const cardBg = theme === "dark" ? "bg-surface-900" : "bg-surface-900";
  const cardBorder = theme === "dark" ? "border-surface-700" : "border-surface-300";

  const goToIndex = (idx: number) => {
    if (idx < 0 || idx >= exercises.length) return;
    setCurrentExerciseIndex(idx);
    const next = exercises[idx];
    if (next) {
      navigate(`/programa/sessions/${sessionId}?exercise=${next.id}`, { replace: true });
    }
    timerInitializedRef.current = false;
    clearTimer();
  };

  const handlePrev = () => goToIndex(currentExerciseIndex - 1);
  const handleNext = () => goToIndex(currentExerciseIndex + 1);

  const handleCheck = async () => {
    if (!currentExercise) return;
    let completedIds = new Set(exercisesDone);
    if (!exercisesDone.has(currentExercise.id)) {
      completedIds.add(currentExercise.id);
      try {
        await api(`/athlete/sessions/${sessionId}/logs`, {
          method: "POST",
          body: JSON.stringify({
            completedExerciseIds: Array.from(completedIds),
            metrics: (currentExercise.exercise?.requiresLoad ?? currentExercise.requiresWeight)
              ? { sets: currentExercise.sets, reps: repsInput || "", rpe: rpeInput ? parseInt(rpeInput) : undefined }
              : { sets: currentExercise.sets, reps: repsInput || "" },
            notes: `Completado: ${currentExercise.exercise?.name ?? currentExercise.name ?? "Ejercicio"}`,
          }),
        });
        setExercisesDone(completedIds);
        if (session) {
          const updated = session.session.sessionExercises.map((e) => ({
            ...e,
            completed: completedIds.has(e.id),
            completedAt: completedIds.has(e.id) ? new Date().toISOString() : e.completedAt,
          }));
          setSession({ ...session, session: { ...session.session, sessionExercises: updated } });
        }
      } catch {
        // ignore
      }
    }
    if (completedIds.size === exercises.length) {
      try {
        await api(`/athlete/sessions/${sessionId}/logs`, {
          method: "POST",
          body: JSON.stringify({
            completedExerciseIds: Array.from(completedIds),
            completedAt: new Date().toISOString(),
            perceivedExertion: 7,
            notes: "Sesión completada",
          }),
        });
      } catch {
        // ignore
      }
      setShowCompletionModal(true);
    } else if (currentExerciseIndex < exercises.length - 1) {
      goToIndex(currentExerciseIndex + 1);
    }
  };

  if (!sessionStarted) {
    return (
      <div className="relative min-h-screen flex flex-col">
        <div className="absolute inset-0 z-0">
          <img
            src={bgImage}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
          <div className="fixed inset-0 {overlayClass}" />
        </div>
        <div className="relative z-10 flex flex-col px-4 py-4">
          <div className="mx-auto max-w-md">
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-bold {textColor}">
                    <span className={dayConfig.color}>{dayConfig.emoji}</span>
                    {session.session.title}
                  </h2>
                  <p className="mt-1 text-sm {textSecondaryColor}">
                    {new Date(session.session.scheduledDate).toLocaleDateString("es-ES", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs ${
                    session.session.status === "COMPLETED"
                      ? "bg-green-900/20 text-green-400"
                      : "bg-blue-900/20 text-blue-400"
                  }`}
                >
                  {session.session.status === "COMPLETED" ? "Completada" : "Programada"}
                </span>
              </div>

              {session.session.coachNotes && (
                <div className="rounded-lg border border-surface-700 bg-amber-900/10 p-3">
                  <p className="text-sm font-medium text-amber-400">Notas del coach:</p>
                  <p className="mt-1 text-sm text-surface-300">{session.session.coachNotes}</p>
                </div>
              )}

              <div className="space-y-2">
                <button
                  onClick={handleStartSession}
                  className="w-full rounded-md bg-amber-500 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                >
                  Comenzar sesión
                </button>

                <button
                  onClick={handleSkipSession}
                  className="w-full rounded-md border border-surface-700 py-2 text-sm font-medium text-surface-300 hover:bg-surface-800"
                >
                  Saltar sesión
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentExercise) {
    return (
      <div className="relative min-h-screen flex flex-col">
        <div className="absolute inset-0 z-0">
          <img
            src={bgImage}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
          <div className="fixed inset-0 {overlayClass}" />
        </div>
        <div className="relative z-10 flex flex-col px-4 py-4">
          <div className="mx-auto max-w-md">
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-bold {textColor}">
                    <span className={dayConfig.color}>{dayConfig.emoji}</span>
                    Ejercicio no encontrado
                  </h2>
                  <p className="mt-1 text-sm {textSecondaryColor}">
                    {new Date(session.session.scheduledDate).toLocaleDateString("es-ES", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate(`/programa/sessions/${sessionId}`)}
                className="w-full rounded-md border border-surface-700 py-2.5 text-sm font-medium text-surface-300 hover:bg-surface-800"
              >
                Volver a la sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const primaryAsset = (currentExercise.exercise?.mediaAssets ?? []).find((a) => a.isPrimary) ?? (currentExercise.exercise?.mediaAssets ?? [])[0];
  const isTimedExercise = !!currentExercise.durationSeconds && currentExercise.durationSeconds > 0;
  const remainingTime = isTimedExercise ? Math.max(0, timerSeconds) : 0;
  const timerTotal = currentExercise.durationSeconds ?? 0;
  const timerProgress = timerTotal > 0 ? (timerTotal - remainingTime) / timerTotal : 0;
  const timerRadius = 58;
  const timerCircumference = 2 * Math.PI * timerRadius;
  const timerStrokeOffset = timerCircumference * (1 - timerProgress);

  const isYouTube = (url?: string | null) => !!url && /youtube\.com|youtu\.be/.test(url);
  const toYouTubeEmbed = (url: string) => {
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    const id = m ? m[1] : null;
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0` : url;
  };

  const mediaUrl = primaryAsset?.url ?? (currentExercise.exercise?.mediaAssets ?? [])[0]?.url ?? null;

  return (
    <div className="relative min-h-screen flex flex-col">
      <div className="absolute inset-0 z-0">
        <img src={bgImage} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <div className="fixed inset-0 {overlayClass}" />
      </div>
      <div className="relative z-10 flex flex-col px-4 py-4">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className={textColor}>Realizados {exercisesDone.size} de {exercises.length}</span>
              <span className={textSecondaryColor}>{exercises.length ? Math.round((exercisesDone.size / exercises.length) * 100) : 0}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-800">
              <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${exercises.length ? (exercisesDone.size / exercises.length) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-4">
           <div className="flex items-center justify-between">
             <span className={`text-xs ${textSecondaryColor}`}>Media</span>
             <button
               onClick={() => setShowMedia((v) => !v)}
               className={`rounded-md border ${cardBorder} px-2 py-1 text-xs ${textSecondaryColor} hover:bg-surface-800`}
             >
               {showMedia ? "Ocultar video" : "Mostrar video"}
             </button>
           </div>
           {showMedia && (
             <div className="overflow-hidden rounded-xl bg-surface-800 md:min-h-[60vh] landscape:min-h-[60vh] flex items-center justify-center">
               {mediaUrl ? (
                 isYouTube(mediaUrl) ? (
                   <iframe
                     src={toYouTubeEmbed(mediaUrl)}
                     title={primaryAsset?.title ?? (currentExercise.exercise?.name ?? currentExercise.name ?? "Ejercicio")}
                     className="w-full h-full min-h-[300px]"
                     allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                     allowFullScreen
                   />
                 ) : primaryAsset?.kind === "VIDEO" ? (
                   <video
                     src={mediaUrl}
                     className="w-full h-full object-cover"
                     title={primaryAsset?.title ?? (currentExercise.exercise?.name ?? currentExercise.name ?? "Ejercicio")}
                     autoPlay
                     muted
                     loop
                     playsInline
                     controls
                   />
                 ) : (
                   <img
                     src={mediaUrl}
                     alt={primaryAsset?.title ?? (currentExercise.exercise?.name ?? currentExercise.name ?? "Ejercicio")}
                     className="w-full h-full object-cover"
                     onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                   />
                 )
               ) : (
                 <div className={`text-sm ${textSecondaryColor}`}>Sin media</div>
               )}
             </div>
           )}

            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <h3 className={`text-lg font-bold ${textColor}`}>{(currentExercise.exercise?.name ?? currentExercise.name ?? "Ejercicio")}</h3>
                <span className={`rounded-full px-2 py-1 text-xs ${currentExercise.completed ? "bg-green-900/20 text-green-400" : "bg-blue-900/20 text-blue-400"}`}>
                  {currentExercise.completed ? "Completado" : "Pendiente"}
                </span>
              </div>

              {isTimedExercise && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="relative h-36 w-36">
                    <svg className="h-full w-full -rotate-90" viewBox="0 0 140 140" aria-hidden="true">
                      <circle
                        cx="70"
                        cy="70"
                        r={timerRadius}
                        fill="none"
                        stroke="currentColor"
                        className="text-surface-700"
                        strokeWidth="8"
                      />
                      <circle
                        cx="70"
                        cy="70"
                        r={timerRadius}
                        fill="none"
                        stroke="currentColor"
                        className="text-amber-400 transition-[stroke-dashoffset] duration-300 ease-linear"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={timerCircumference}
                        strokeDashoffset={timerStrokeOffset}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-mono text-3xl font-bold text-amber-400">
                        {Math.floor(remainingTime / 60)}:{String(remainingTime % 60).padStart(2, "0")}
                      </span>
                      <button
                        type="button"
                        onClick={() => (timerRunning ? clearTimer() : startTimer(remainingTime))}
                        className={`mt-1 rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors ${timerRunning ? "text-red-400 hover:bg-red-900/30" : "text-amber-400 hover:bg-amber-900/30"}`}
                      >
                        {timerRunning ? "Pausar" : remainingTime === 0 ? "Reiniciar" : "Iniciar"}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTimerMuted((v) => !v)}
                    className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${cardBorder} ${textSecondaryColor} hover:bg-surface-800`}
                    aria-pressed={timerMuted}
                  >
                    {timerMuted ? "🔇 Sonido silenciado" : "🔊 Silenciar sonido"}
                  </button>
                </div>
              )}

               <div className={`mx-auto max-w-sm rounded-lg border ${cardBorder} bg-surface-900/60 p-3`}>
                 <div className="grid grid-cols-2 gap-3 text-sm">
                   <div className={`flex items-center gap-2 ${textSecondaryColor}`}>
                     <span>🔹</span><span>{currentExercise.sets ?? 0} series</span>
                   </div>
                   <div className={`flex items-center gap-2 ${textSecondaryColor}`}>
                     <span>🔸</span><span>{currentExercise.repsText ?? "—"}</span>
                   </div>
                   {currentExercise.restSeconds && (
                     <div className={`flex items-center gap-2 ${textSecondaryColor}`}>
                       <span>☕</span><span>{currentExercise.restSeconds}s descanso</span>
                     </div>
                   )}
                   {currentExercise.loadText && (
                     <div className={`flex items-center gap-2 ${textSecondaryColor}`}>
                       <span>⚖️</span><span>Carga: {currentExercise.loadText}</span>
                     </div>
                   )}
                   {currentExercise.tempoText && (
                     <div className={`flex items-center gap-2 ${textSecondaryColor}`}>
                       <span>⏱</span><span>Tempo: {currentExercise.tempoText}</span>
                     </div>
                   )}
                 </div>
               </div>

              {(currentExercise.exercise?.description ?? currentExercise.description ?? null) && (
                <div className="rounded-lg border border-surface-700 bg-surface-900/50 p-3">
                  <p className="text-sm text-surface-300">{(currentExercise.exercise?.description ?? currentExercise.description ?? null)}</p>
                </div>
              )}

              {currentExercise.guidance?.executionNotes && (
                <div className="rounded-lg border border-surface-700 bg-surface-900/50 p-3">
                  <p className="text-sm text-surface-300">{currentExercise.guidance.executionNotes}</p>
                </div>
              )}

               <div className={`flex items-center justify-between gap-2 rounded-lg border ${cardBorder} bg-surface-900/60 p-2`}>
                 <button
                   onClick={handlePrev}
                   disabled={currentExerciseIndex === 0}
                   className={`rounded-md px-4 py-2 text-lg font-bold transition-colors ${currentExerciseIndex === 0 ? "opacity-30 cursor-not-allowed text-surface-500" : "text-amber-400 hover:bg-surface-800"}`}
                 >
                   ◀
                 </button>
                 <button
                   onClick={handleCheck}
                   className="rounded-full bg-green-600 px-6 py-2 text-lg font-bold text-white shadow-lg transition-colors hover:bg-green-500"
                 >
                   ✔
                 </button>
                 <button
                   onClick={handleNext}
                   disabled={currentExerciseIndex === exercises.length - 1}
                   className={`rounded-md px-4 py-2 text-lg font-bold transition-colors ${currentExerciseIndex === exercises.length - 1 ? "opacity-30 cursor-not-allowed text-surface-500" : "text-amber-400 hover:bg-surface-800"}`}
                 >
                   ▶
                 </button>
               </div>
            </div>
          </div>
        </div>
      </div>
      {showCompletionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-surface-700 bg-surface-900 p-6 text-center">
            <div className="mb-3 text-5xl">🥤🥗</div>
            <p className="mb-4 text-sm text-surface-200">
              Felicidades completaste la sesion de hoy, es hora de recargar tu cuerpo con proteina en los proximos 30 minutos
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate("/evolucion")}
                className="rounded-md bg-amber-500/20 border-2 border-amber-500 px-4 py-2 text-sm font-bold text-amber-400 hover:bg-amber-500/40"
              >
                batido de proteina
              </button>
              <button
                onClick={() => navigate("/evolucion")}
                className="rounded-md bg-amber-500/20 border-2 border-amber-500 px-4 py-2 text-sm font-bold text-amber-400 hover:bg-amber-500/40"
              >
                comida alta en proteinas
              </button>
              <button
                onClick={() => navigate("/evolucion")}
                className="text-xs text-surface-400 hover:text-surface-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

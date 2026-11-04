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
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<number | null>(null);
  const timerInitializedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimerRunning(false);
  };

  const startTimer = (seconds: number) => {
    clearTimer();
    setTimerSeconds(seconds);
    setTimerRunning(true);
    timerRef.current = window.setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
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
          metrics: selectedExercise.exercise.requiresLoad
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar sesión");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSession();
  }, [api, sessionId]);

  useEffect(() => {
    const currentEx = session?.session.sessionExercises?.find((e) => e.id === exerciseIdParam);
    if (!timerInitializedRef.current && sessionStarted && currentEx?.durationSeconds && !timerRunning) {
      startTimer(currentEx.durationSeconds);
      timerInitializedRef.current = true;
    }
    if (!currentEx || currentEx.durationSeconds === undefined) {
      timerInitializedRef.current = false;
    }
  }, [exerciseIdParam, session, sessionStarted, timerRunning]);

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
  const exercises = session.session.sessionExercises ?? [];
  const currentExercise = exerciseIdParam ? exercises.find((e) => e.id === exerciseIdParam) : undefined;
  const allExercisesDone = exercises.every((e) => exercisesDone.has(e.id));
  const { theme } = useTheme();
  const bgImage = theme === "dark" ? "/Hombre.jpeg" : "/Mujer.jpeg";
  const overlayClass = theme === "dark" ? "bg-black/40" : "bg-white/30";
  const textColor = theme === "dark" ? "{textColor}" : "text-surface-900";
  const textSecondaryColor = theme === "dark" ? "{textSecondaryColor}" : "text-surface-600";
  const cardBg = theme === "dark" ? "{cardBg}" : "bg-surface-100";
  const cardBorder = theme === "dark" ? "{cardBorder}" : "border-surface-300";

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

  const primaryAsset = currentExercise.exercise.mediaAssets.find((a) => a.isPrimary) ?? currentExercise.exercise.mediaAssets[0];
  const isTimedExercise = currentExercise.durationSeconds && currentExercise.durationSeconds > 0;
  const remainingTime = isTimedExercise ? Math.max(0, timerSeconds) : 0;

  const timerButtonClass = `rounded-md px-3 py-1 text-xs font-medium text-white transition-colors ${
    timerRunning ? "bg-red-900/30 text-red-400 hover:bg-red-800/50" : "bg-amber-900/30 text-amber-400 hover:bg-amber-800/50"
  }`;

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
                  Ejercicio de la sesión
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
                  currentExercise.completed
                    ? "bg-green-900/20 text-green-400"
                    : "bg-blue-900/20 text-blue-400"
                }`}
              >
                {currentExercise.completed ? "Completado" : "Pendiente"}
              </span>
            </div>

            {(primaryAsset?.url ?? currentExercise.exercise.mediaAssets[0]?.url) && (
              <div className="aspect-video overflow-hidden rounded-xl bg-surface-800">
                {primaryAsset?.kind === "VIDEO" ? (
                    <video
                      src={primaryAsset?.url ?? ""}
                      className="h-full w-full object-cover"
                      title={primaryAsset?.title ?? currentExercise.exercise.name}
                      playsInline
                      muted
                      loop
                      poster={primaryAsset?.url ?? ""}
                    />
                ) : (
                    <img
                      src={primaryAsset?.url ?? ""}
                      alt={primaryAsset?.title ?? currentExercise.exercise.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                      }}
                    />
                )}
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-lg font-bold {textColor}">{currentExercise.exercise.name}</h3>

              {isTimedExercise && remainingTime > 0 && (
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-mono font-bold text-amber-400">
                    {Math.floor(remainingTime / 60)}{":"}{String(remainingTime % 60).padStart(2, "0")}
                  </span>
                  <button
                    onClick={() => (timerRunning ? clearTimer() : startTimer(remainingTime))}
                    className={timerButtonClass}
                  >
                    {timerRunning ? "Pausar" : "Reanudar"}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 {textSecondaryColor}">
                  <span className="text-lg">🔹</span>
                  <span>{currentExercise.sets ?? 0} series</span>
                </div>
                <div className="flex items-center gap-2 {textSecondaryColor}">
                  <span className="text-lg">🔸</span>
                  <span>{currentExercise.repsText ?? "—"}</span>
                </div>
                {currentExercise.restSeconds && (
                  <div className="flex items-center gap-2 {textSecondaryColor}">
                    <span className="text-lg">☕</span>
                    <span>{currentExercise.restSeconds}s descanso</span>
                  </div>
                )}
                {currentExercise.loadText && (
                  <div className="flex items-center gap-2 {textSecondaryColor}">
                    <span className="text-lg">⚖️</span>
                    <span>Carga: {currentExercise.loadText}</span>
                  </div>
                )}
                {currentExercise.tempoText && (
                  <div className="flex items-center gap-2 {textSecondaryColor}">
                    <span className="text-lg">⏱</span>
                    <span>Tempo: {currentExercise.tempoText}</span>
                  </div>
                )}
              </div>

              {currentExercise.exercise.description && (
                <div className="rounded-lg border border-surface-700 bg-surface-900/50 p-3">
                  <p className="text-sm text-surface-300">{currentExercise.exercise.description}</p>
                </div>
              )}

              {currentExercise.guidance?.executionNotes && (
                <div className="rounded-lg border border-surface-700 bg-surface-900/50 p-3">
                  <p className="text-sm text-surface-300">{currentExercise.guidance.executionNotes}</p>
                </div>
              )}

              {currentExercise.completed ? (
                <button
                  onClick={handleSkipExercise}
                  className="w-full rounded-md border border-surface-700 py-2.5 text-sm font-medium text-surface-300 hover:bg-surface-800"
                >
                  Siguiente ejercicio
                </button>
              ) : (
                <button
                  onClick={() => handleCompleteExercise(currentExercise)}
                  className="w-full rounded-md bg-amber-500 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                >
                  Completar ejercicio
                </button>
              )}

              {currentExercise.completed && (
                <button
                  onClick={handleSkipExercise}
                  className="w-full rounded-md border border-surface-700 py-2.5 text-sm font-medium text-surface-300 hover:bg-surface-800"
                >
                  Volver al resumen
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

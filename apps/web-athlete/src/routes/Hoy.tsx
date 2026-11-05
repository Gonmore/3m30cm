import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useApi, handleApiResponse } from "../api/client";
import { type AvailableTemplate, type SessionsListResponse } from "../types/api";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";

const weekdayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface MeResponse {
  athleteProfile: { onboardingCompletedAt: string | null; displayName: string | null } | null;
  activeProgram: { name: string } | null;
}

interface ProgressResponse {
  nextSession: {
    id: string;
    title: string;
    scheduledDate: string;
    status: string;
    dayType: string;
    exerciseCount?: number;
    sessionExercises: Array<{
      id: string;
      exercise: { name: string } | null;
      sets: number | null;
      repsText: string | null;
      durationSeconds: number | null;
    }>;
  } | null;
  summary: {
    completedSessions: number;
    totalSessions: number;
    completionRate: number;
  } | null;
}

interface AvailableResponse {
  templates: AvailableTemplate[];
  hasActiveProgram: boolean;
}

const DAY_TYPE_CONFIG: Record<string, { emoji: string; color: string }> = {
  STRENGTH: { emoji: "💪", color: "text-blue-400" },
  EXPLOSIVE: { emoji: "⚡", color: "text-purple-400" },
  POWER: { emoji: "🔥", color: "text-orange-400" },
  SPEED: { emoji: "🏃", color: "text-red-400" },
  TECHNIQUE: { emoji: "🎯", color: "text-cyan-400" },
  MOBILITY: { emoji: "🤸", color: "text-green-400" },
  RECOVERY: { emoji: "🧘", color: "text-indigo-400" },
  TEST: { emoji: "📏", color: "text-pink-400" },
  OTHER: { emoji: "◉", color: "text-surface-400" },
};

export default function HoyScreen() {
  const api = useApi();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();

  const [meData, setMeData] = useState<MeResponse | null>(null);
  const [progressData, setProgressData] = useState<ProgressResponse | null>(null);
  const [templates, setTemplates] = useState<AvailableTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Onboarding form state
  const [heightCm, setHeightCm] = useState(170);
  const [weightKg, setWeightKg] = useState(70);
  const [trainsSport, setTrainsSport] = useState(false);
  const [sportTrainingDays, setSportTrainingDays] = useState<number[]>([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>("");
  const [planDropdownOpen, setPlanDropdownOpen] = useState(false);
  const [adaptationModalOpen, setAdaptationModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSessionExercises, setShowSessionExercises] = useState(false);
  const [sessionExerciseCount, setSessionExerciseCount] = useState<number>(0);
  const [todaySession, setTodaySession] = useState<ProgressResponse["nextSession"] | null>(null);
  const [todaySessionExercises, setTodaySessionExercises] = useState<Array<{
    id: string;
    exercise: { name: string } | null;
    sets: number | null;
    repsText: string | null;
    durationSeconds: number | null;
  }>>([]);

  const backgroundImage = theme === "dark" ? "/Hombre.jpeg" : "/Mujer.jpeg";

  // Theme-aware colors - completely independent dark and light themes
  const isDark = theme === "dark";
  const textColor = isDark ? "text-white" : "text-surface-900";
  const textSecondaryColor = isDark ? "text-surface-400" : "text-surface-600";
  const cardBg = isDark ? "bg-surface-900" : "bg-surface-100";
  const cardBorder = isDark ? "border-surface-700" : "border-surface-300";
  const exerciseBoxBg = isDark ? "bg-surface-800/50 border-surface-700" : "bg-white border-surface-300";
  const headerBg = theme === "dark" ? "bg-surface-900" : "bg-surface-50";

  const toggleDay = (day: number) => {
    setSportTrainingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  const weeklyGameCount = trainsSport
    ? sportTrainingDays.length <= 1
      ? "ZERO_TO_ONE"
      : sportTrainingDays.length <= 3
        ? "TWO_TO_THREE"
        : "FOUR_PLUS"
    : "ZERO_TO_ONE";

  const buildOnboardingPayload = useCallback(() => {
    const payload: Record<string, unknown> = {
      heightCm,
      weightKg,
      sport: "otro",
      trainsSport,
      sportTrainingDays: trainsSport ? sportTrainingDays : [],
      weeklyGameCount,
      teamTrainingIntensity: trainsSport ? "LIGHT" : "NONE",
      availableWeekdays: [1, 2, 3, 4, 5],
      programPreferences: {
        skipPhase1: false,
        teamTrainingDays: trainsSport ? sportTrainingDays : [],
        deloadEnabled: false,
      },
    };

    const name = user?.firstName || user?.lastName;
    if (name) payload.displayName = name;

    return payload as never;
  }, [user, heightCm, weightKg, trainsSport, sportTrainingDays, weeklyGameCount]);

  const handleSaveAndGenerate = async () => {
    if (!selectedTemplateCode) {
      setError("Seleccioná un programa");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const onboardingRes = await api("/athlete/onboarding", {
        method: "PUT",
        body: JSON.stringify(buildOnboardingPayload()),
      });
      await handleApiResponse<unknown>(onboardingRes);

      setIsSaving(false);
      setAdaptationModalOpen(true);
    } catch (err) {
      if (err instanceof Error && (err as any).data) {
        const data = (err as any).data;
        console.error("Onboarding validation issues:", JSON.stringify(data?.issues ?? data, null, 2));
      }
      setIsSaving(false);
      setError(err instanceof Error ? err.message : "Error al guardar y generar programa");
    }
  };

  const handleGenerateProgram = async (includePreparationPhase: boolean) => {
    setAdaptationModalOpen(false);
    setIsGenerating(true);
    setError(null);
    try {
      const today = new Date();
      const startDate = today.toISOString().split("T")[0];

      const generateRes = await api("/athlete/programs/generate", {
        method: "POST",
        body: JSON.stringify({
          templateCode: selectedTemplateCode,
          startDate,
          trainsSport,
          sportTrainingDays: trainsSport ? sportTrainingDays : [],
          availableWeekdays: [1, 2, 3, 4, 5],
          weeklyGameCount,
          teamTrainingIntensity: trainsSport ? "LIGHT" : "NONE",
          heightCm,
          weightKg,
          includePreparationPhase,
          programPreferences: {
            skipPhase1: !includePreparationPhase,
            teamTrainingDays: trainsSport ? sportTrainingDays : [],
            deloadEnabled: false,
          },
        }),
      });
      await handleApiResponse<unknown>(generateRes);

      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof Error && (err as any).data) {
        const data = (err as any).data;
        console.error("Generate validation issues:", JSON.stringify(data?.issues ?? data, null, 2));
      }
      setError(err instanceof Error ? err.message : "Error al generar programa");
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [meRes, progressRes, availableRes, sessionsRes] = await Promise.all([
          api("/athlete/me"),
          api("/athlete/progress"),
          api("/athlete/programs/available"),
          api("/athlete/sessions"),
        ]);
        const me = await handleApiResponse<MeResponse>(meRes);
        const progress = await handleApiResponse<ProgressResponse>(progressRes);
        const available = await handleApiResponse<AvailableResponse>(availableRes);
        const sessionsData = await handleApiResponse<SessionsListResponse>(sessionsRes);
        setMeData(me);
        setProgressData(progress);
        setTemplates(available.templates ?? []);

        // Find today's session exercise count from /athlete/sessions
        const today = new Date().toISOString().slice(0, 10);
        const todaySession = sessionsData.sessions?.find((s) => s.scheduledDate.slice(0, 10) === today);
        setTodaySession(todaySession ?? null);
        setSessionExerciseCount(todaySession?.exerciseCount ?? 0);

        // Fetch detailed session exercises for today's session
        if (todaySession) {
          try {
            const sessionDetailRes = await api(`/athlete/sessions/${todaySession.id}`);
            const sessionDetail = await handleApiResponse<{
              session: ProgressResponse["nextSession"];
              guidance?: any;
            }>(sessionDetailRes);
            if (sessionDetail.session?.sessionExercises) {
              setTodaySessionExercises(sessionDetail.session.sessionExercises);
            }
          } catch (err) {
            console.error("Error fetching session details:", err);
          }
        }

        if (me.athleteProfile?.onboardingCompletedAt) {
          return;
        }

        const freeTemplates = (available.templates ?? []).filter((t) => !t.isPremium);
        if (freeTemplates.length > 0 && !selectedTemplateCode) {
          setSelectedTemplateCode(freeTemplates[0]?.code ?? "");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [api]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (planDropdownOpen) setPlanDropdownOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [planDropdownOpen]);

  // Onboarding not yet completed: show graphical onboarding form
  if (!meData?.athleteProfile?.onboardingCompletedAt) {
    if (isLoading) {
      return (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="{textSecondaryColor}">Cargando…</div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="rounded-md bg-red-900/30 p-4 text-sm text-red-400 text-center">{error}</div>
        </div>
      );
    }

    const displayName = user?.firstName || user?.email?.split("@")[0] || "Atleta";

    return (
      <div className="relative flex flex-col">
        {/* Background image */}
        <div className="absolute inset-0 z-0">
          <img
            src={backgroundImage}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-black/10" />
        </div>

        {/* Content overlay */}
        <div className="relative z-10 flex flex-col min-h-screen px-4 py-6">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <h2 className={`text-2xl font-bold ${textColor}`}>Hola, {displayName}</h2>
          </div>

          {/* Main content: two columns on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            {/* Left column: sliders */}
            <div className="flex flex-col gap-8 items-start w-full">
              <div className="flex flex-col items-start gap-2 w-full">
                <label className="mb-0 block text-xs font-medium text-white uppercase tracking-wider">
                  Altura (cm)
                </label>
                <div className="text-xl font-bold text-amber-400">
                  {heightCm} cm
                </div>
                <div className="relative h-48 w-full mt-1 flex items-end justify-start pl-2">
                  <input
                    type="range"
                    min="100"
                    max="260"
                    value={heightCm}
                    onChange={(e) => setHeightCm(parseInt(e.target.value, 10))}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    style={{
                      transform: "rotate(-90deg)",
                      transformOrigin: "left bottom",
                      width: "200px",
                    }}
                    className="accent-amber-500"
                  />
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 w-full">
                <label className="mb-0 block text-xs font-medium text-white uppercase tracking-wider">
                  Peso (kg)
                </label>
                <div className="text-xl font-bold text-amber-400">
                  {weightKg} kg
                </div>
                <div className="relative mt-1 w-full">
                  <input
                    type="range"
                    min="40"
                    max="120"
                    value={weightKg}
                    onChange={(e) => setWeightKg(parseInt(e.target.value, 10))}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    className="w-full h-2 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
                <div className="flex w-full justify-between mt-0.5 text-xs text-white/90">
                  <span>40 kg</span>
                  <span>80 kg</span>
                  <span>120 kg</span>
                </div>
              </div>
            </div>

            {/* Right column: sport selector */}
            <div className="flex flex-col gap-6">
              <div className="relative">
                <label className="mb-3 block text-xs font-medium text-white uppercase tracking-wider">
                  ¿Entrenás algún deporte regularmente?
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTrainsSport(true)}
                    className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all ${
                      trainsSport
                        ? "bg-amber-500 text-black"
                        : "bg-white/10 border border-white/30 text-white hover:bg-white/20"
                    }`}
                  >
                    Sí
                  </button>
                  <button
                    onClick={() => {
                      setTrainsSport(false);
                      setSportTrainingDays([]);
                    }}
                    className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all ${
                      !trainsSport
                        ? "bg-amber-500 text-black"
                        : "bg-white/10 border border-white/30 text-white hover:bg-white/20"
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {trainsSport && (
                <div className="relative flex-1 flex flex-col">
                  <label className="mb-3 block text-xs font-medium text-white uppercase tracking-wider">
                    Días de entrenamiento deportivo
                  </label>
                  <div className="grid grid-cols-7 gap-1.5 flex-1">
                    {weekdayNames.map((name, i) => {
                      const isSelected = sportTrainingDays.includes(i);
                      return (
                        <button
                          key={name}
                          onClick={() => toggleDay(i)}
                          className={`h-10 rounded-lg flex items-center justify-center text-xs font-medium transition-all ${
                            isSelected
                              ? "bg-amber-500 text-black"
                              : "bg-white/10 border border-white/30 text-white hover:bg-white/20"
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom: plan dropdown + generate button */}
          <div className="relative pt-6 border-t border-white/20 flex flex-col gap-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-white uppercase tracking-wider">
                Plan de entrenamiento
              </label>
              <div className="relative">
                <button
                  onClick={() => setPlanDropdownOpen((prev) => !prev)}
                  className="w-full rounded-lg bg-white/20 border border-white/40 px-3 py-3 text-sm text-white text-left flex items-center justify-between hover:bg-white/30 focus:outline-none focus:border-amber-500"
                >
                  <span className="flex items-center gap-2">
                    {selectedTemplateCode &&
                      templates.find((t) => t.code === selectedTemplateCode)?.name}
                    {selectedTemplateCode &&
                      templates.find((t) => t.code === selectedTemplateCode)?.isPremium &&
                        " · Premium"}
                  </span>
                  <span className="{textColor}">{planDropdownOpen ? "▲" : "▼"}</span>
                </button>

                {planDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/40 bg-black/70 shadow-xl overflow-hidden backdrop-blur-sm divide-y divide-white/30">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          setSelectedTemplateCode(template.code);
                          setPlanDropdownOpen(false);
                        }}
                        className="w-full px-3 py-3 text-sm text-left text-white hover:bg-white/20 transition-colors"
                      >
                        {template.name} {template.isPremium ? " · Premium" : ""}
                      </button>
                    ))}
                  </div>
                )}
                {templates.length === 0 && (
                  <p className="mt-1 text-xs text-red-400">No hay programas disponibles</p>
                )}
              </div>

              <button
                onClick={handleSaveAndGenerate}
                disabled={isSaving || !selectedTemplateCode}
                className="w-full rounded-lg bg-amber-500 py-4 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "Guardando…" : "Generar hoy"}
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-md bg-red-900/30 p-3 text-sm text-red-400 text-center">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Onboarding complete: show regular Hoy dashboard with real data
  if (!progressData) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="{textSecondaryColor}">Cargando…</div>
      </div>
    );
  }

  const displayName =
    meData?.athleteProfile?.displayName ||
    user?.firstName ||
    user?.lastName ||
    user?.email?.split("@")[0] ||
    "Atleta";

  const nextSession = progressData.nextSession;
  const summary = progressData.summary;
  const dayConfig =
    nextSession?.dayType && DAY_TYPE_CONFIG[nextSession.dayType as keyof typeof DAY_TYPE_CONFIG]
      ? DAY_TYPE_CONFIG[nextSession.dayType as keyof typeof DAY_TYPE_CONFIG]
      : DAY_TYPE_CONFIG.OTHER;

  const exerciseCount = sessionExerciseCount;
  const estimatedMinutes = exerciseCount > 0 ? 5 + 5 + exerciseCount * 10 + (exerciseCount - 1) * 3 : 0;

  return (
    <div className="relative flex flex-col">
      {/* Background image */}
      <div className="fixed inset-0 z-0">
        <img
          src={backgroundImage}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
          }}
        />
        <div className={`fixed inset-0 ${theme === "dark" ? "bg-black/40" : "bg-white/30"}`} />
      </div>

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col px-4 py-4">
        <div className="mx-auto max-w-5xl">
          <div className="space-y-6">
            <div>
              <h2 className={`text-2xl font-bold ${textColor}`}>¡Hola, {displayName}!</h2>
              {meData.activeProgram && (
                <div className="mt-2 flex items-center gap-1 px-3 py-1.5 rounded bg-green-900/30 border border-green-500/30">
                  <span className="text-green-400 font-mono text-sm">&gt;</span>
                  <span className="text-green-900 font-mono text-sm">PROGRAMA</span>
                  <span className="text-green-900 font-mono text-xs">:</span>
                  <span className="text-surface-900 font-mono text-sm">{meData.activeProgram.name.replace(/^[a-zA-Z]+\s*-\s*/, '')}</span>
                </div>
              )}
            </div>

            {nextSession ? (
              <div className={`rounded-xl border p-5 ${theme === "dark" ? "border-surface-700 bg-surface-900/80" : "border-surface-300 bg-surface-100/80"}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className={`text-lg font-bold ${textColor}`}>
                      {nextSession.title.split("/").length > 1 ? (
                        <>
                          {nextSession.title.split("/").slice(0, -1).join("/")}{" "}
                          <span className={dayConfig?.color ?? `${textSecondaryColor}`}>{nextSession.title.split("/").pop()}</span>
                        </>
                      ) : (
                        nextSession.title
                      )}
                    </h3>
                    <p className="mt-1 text-sm {textSecondaryColor}">
                      {new Date(nextSession.scheduledDate).toLocaleDateString("es-ES", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    <div className={`mt-2 rounded-lg border p-4 cursor-pointer transition-colors ${showSessionExercises
                      ? theme === "dark"
                        ? "bg-surface-800/30 border-surface-600"
                        : "bg-surface-200 border-surface-400"
                      : theme === "dark"
                        ? "bg-surface-800/50 border-surface-700 hover:bg-surface-800/30"
                        : "bg-surface-100 border-surface-300 hover:bg-surface-200"
                    }`} onClick={() => setShowSessionExercises(!showSessionExercises)}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                            Ejercicios
                          </p>
                          <span className="text-white">
                            {exerciseCount} ejercicio{exerciseCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <span className={`text-xs ${showSessionExercises ? "text-amber-400" : `${textSecondaryColor}`}`}>
                          ⏱ {estimatedMinutes} min
                        </span>
                      </div>

                      {showSessionExercises && todaySessionExercises.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {todaySessionExercises.map((exercise) => (
                            <div key={exercise.id} className="text-xs text-surface-300">
                              • {exercise.exercise?.name}
                              {exercise.sets && ` · ${exercise.sets} series`}
                              {exercise.repsText && ` · ${exercise.repsText}`}
                              {exercise.durationSeconds && ` · ${exercise.durationSeconds}s`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`text-2xl ${dayConfig?.color ?? `${textSecondaryColor}`}`}>{dayConfig?.emoji ?? "◉"}</span>
                </div>

                <button
                  onClick={() => navigate(`/programa/sessions/${nextSession.id}`)}
                  className="mt-4 w-full rounded-md bg-amber-500 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                >
                  {nextSession.status === "COMPLETED" ? "Ver detalle" : "Comenzar sesión"}
                </button>
              </div>
            ) : (
              <div className={`rounded-xl border p-5 text-center ${theme === "dark" ? "border-surface-700 bg-surface-900/80" : "border-surface-300 bg-surface-100/80"}`}>
                <p className="{textSecondaryColor}">No hay próximas sesiones programadas.</p>
              </div>
            )}

            <div className={`rounded-lg bg-surface-900/80 p-4 mb-12 text-center ${theme === "dark" ? "border-surface-700" : "border-surface-300"}`}>
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">
                Sesiones
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-bold {textColor}">{summary?.completedSessions ?? 0}</div>
                  <div className="mt-1 text-xs {textSecondaryColor}">Completadas</div>
                </div>
                <div>
                  <div className="text-2xl font-bold {textColor}">{summary?.totalSessions ?? 0}</div>
                  <div className="mt-1 text-xs {textSecondaryColor}">Total</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-400">
                    {Math.round(summary?.completionRate ?? 0)}%
                  </div>
                  <div className="mt-1 text-xs {textSecondaryColor}">Progreso</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

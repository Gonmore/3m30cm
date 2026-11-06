import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useApi, handleApiResponse } from "../api/client";
import { useTheme } from "../contexts/ThemeContext";
import {
  DAY_TYPE_CONFIG,
  type AvailableTemplate,
  type DayType,
  type ScheduledSession,
  type SessionsListResponse,
  type ProgressResponse,
} from "../types/api";

type AthleteProfileWithFields = {
  id: string;
  userId: string;
  displayName: string | null;
  heightCm: number | null;
  weightKg: number | null;
  sport: string | null;
  trainsSport: boolean | null;
  sportTrainingDays: number[] | null;
  weeklyGameCount: string | null;
  teamTrainingIntensity: string | null;
  availableWeekdays: string | null;
  programPreferences: any;
};

export default function ProgramaScreen() {
  const api = useApi();
  const location = useLocation();
  const { theme } = useTheme();
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [progressData, setProgressData] = useState<ProgressResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [availableTemplates, setAvailableTemplates] = useState<AvailableTemplate[]>([]);
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfileWithFields | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  const textColor = theme === "dark" ? "text-white" : "text-surface-100";
  const textSecondaryColor = theme === "dark" ? "text-surface-400" : "text-surface-500";
  const cardBg = theme === "dark" ? "bg-surface-900" : "bg-surface-900";
  const cardBorder = theme === "dark" ? "border-surface-700" : "border-surface-300";

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [sessionsRes, progressRes, availableRes] = await Promise.all([
          api("/athlete/sessions"),
          api("/athlete/progress"),
          api("/athlete/programs/available"),
        ]);
        const sessionsData = await handleApiResponse<SessionsListResponse>(sessionsRes);
        const progress = await handleApiResponse<ProgressResponse>(progressRes);
        const available = await handleApiResponse<{ templates: AvailableTemplate[] }>(availableRes);
        setSessions(sessionsData.sessions ?? []);
        setProgressData(progress);
        setAvailableTemplates(available.templates ?? []);
        if (!startDate) {
          setStartDate(new Date().toISOString().slice(0, 10));
        }
        if (!selectedTemplateCode && available.templates?.length > 0) {
          setSelectedTemplateCode(available.templates[0]?.code ?? "");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [api, location.state, startDate, selectedTemplateCode]);

  const handleRegenerateProgram = async () => {
    // Obtener perfil del atleta desde /athlete/me si no lo tenemos en caché
    let profile = athleteProfile;
    if (!profile) {
      try {
        const meRes = await api("/athlete/me");
        const meData = await handleApiResponse<any>(meRes);
        profile = meData.athleteProfile as AthleteProfileWithFields;
        setAthleteProfile(profile);
      } catch (err) {
        setError("No se pudo obtener el perfil del atleta");
        return;
      }
    }

    if (!profile) {
      setError("No se pudo obtener el perfil del atleta");
      return;
    }

    if (!selectedTemplateCode || !startDate) {
      setError("Selecciona un programa y una fecha de inicio");
      return;
    }

    setRegenerating(true);
    setError("");

    try {
      await api("/athlete/programs/generate", {
        method: "POST",
        body: JSON.stringify({
          displayName: profile.displayName || undefined,
          heightCm: Number(profile.heightCm) || 170,
          weightKg: Number(profile.weightKg) || 70,
          sport: profile.sport || "otro",
          trainsSport: profile.trainsSport === true,
          sportTrainingDays: Array.isArray(profile.sportTrainingDays) ? profile.sportTrainingDays : [],
          weeklyGameCount: profile.weeklyGameCount || "ZERO_TO_ONE",
          teamTrainingIntensity: profile.teamTrainingIntensity || "NONE",
          availableWeekdays: parseWeekdays(profile.availableWeekdays),
          programPreferences: profile.programPreferences || {
            skipPhase1: false,
            teamTrainingDays: [],
            deloadEnabled: false,
          },
          templateCode: selectedTemplateCode,
          startDate,
          includePreparationPhase: false,
        }),
      });

      setShowRegenerateModal(false);
      setRegenerating(false);
      setSelectedTemplateCode("");
      setStartDate("");

      // Refrescar datos
      const [sessionsRes, progressRes, availableRes] = await Promise.all([
        api("/athlete/sessions"),
        api("/athlete/progress"),
        api("/athlete/programs/available"),
      ]);
      const sessionsData = await handleApiResponse<SessionsListResponse>(sessionsRes);
      const progress = await handleApiResponse<ProgressResponse>(progressRes);
      const available = await handleApiResponse<{ templates: AvailableTemplate[] }>(availableRes);
      setSessions(sessionsData.sessions ?? []);
      setProgressData(progress);
      setAvailableTemplates(available.templates ?? []);
      if (available.templates?.length > 0) {
        setSelectedTemplateCode(available.templates[0]?.code ?? "");
      }
    } catch (err) {
      setRegenerating(false);
      setError(err instanceof Error ? err.message : "Error al generar programa");
    }
  };

  const parseWeekdays = (weeklyAvailability: string | null | undefined): number[] => {
    if (!weeklyAvailability) return [1, 2, 3, 4, 5];
    try {
      const parsed = JSON.parse(weeklyAvailability);
      return Array.isArray(parsed) ? parsed : [1, 2, 3, 4, 5];
    } catch {
      return [1, 2, 3, 4, 5];
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className={textSecondaryColor}>Cargando…</div>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;
  }

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
  );

  const today = new Date().toISOString().slice(0, 10);
  const bgImage = theme === "dark" ? "/Hombre.jpeg" : "/Mujer.jpeg";
  const overlayClass = theme === "dark" ? "bg-black/40" : "bg-white/30";

  const totalSessionsCount = progressData?.summary?.totalSessions ?? 0;
  const completedSessionsCount = progressData?.summary?.completedSessions ?? 0;
  const generalRate = totalSessionsCount > 0 ? (completedSessionsCount / totalSessionsCount) * 100 : 0;

  const weekStart = new Date();
  const weekDay = weekStart.getDay();
  const weekDiff = (weekDay === 0 ? -6 : 1) - weekDay;
  weekStart.setDate(weekStart.getDate() + weekDiff);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekSessions = sortedSessions.filter((s) => {
    const d = new Date(s.scheduledDate);
    return d >= weekStart && d < weekEnd;
  });
  const weekTotal = weekSessions.length;
  const weekCompleted = weekSessions.filter((s) => s.status === "COMPLETED").length;
  const weekRate = weekTotal > 0 ? (weekCompleted / weekTotal) * 100 : 0;

  const phaseMap = new Map<string, ScheduledSession[]>();
  sortedSessions.forEach((s) => {
    const phase = s.title.split("/Día")[0] || s.title.split("/")[0] || "Fase";
    if (!phaseMap.has(phase)) phaseMap.set(phase, []);
    phaseMap.get(phase)!.push(s);
  });
  const phaseGroups = Array.from(phaseMap.entries());

  return (
    <div className="relative flex flex-col">
      {/* Background image */}
      <div className="fixed inset-0 z-0">
        <img
          src={bgImage}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
          }}
        />
        <div className={`fixed inset-0 ${overlayClass}`} />
      </div>

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col min-h-screen px-4 py-2">
        <div className="mx-auto max-w-5xl">
          <div className="space-y-6">
            {/* Program header */}
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-2xl font-bold ${textColor}`}>Mi Programa</h2>
                      {progressData?.summary && (
                    <p className={`mt-1 text-sm ${textSecondaryColor}`}>
                      {progressData.summary.completedSessions}/{progressData.summary.totalSessions} sesiones
                      completadas · {progressData.summary.totalSessions > 0 ? Math.round((progressData.summary.completedSessions / progressData.summary.totalSessions) * 100) : 0}% de avance
                    </p>
                  )}
                </div>
                {progressData?.summary && progressData.summary.totalSessions > 0 && (
                  <button
                    onClick={() => setShowRegenerateModal(true)}
                    className="rounded-md border border-amber-500/60 bg-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/60 transition-colors"
                  >
                    ⚠️ Regenerar programa
                  </button>
                )}
              </div>
            </div>

            {/* Progress chart */}
            {progressData?.summary && (
              <div className="rounded-xl border border-surface-700 bg-surface-900/80 p-5 space-y-4">
                <h3 className="text-sm font-medium text-surface-300">Progreso general</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={textSecondaryColor}>General</span>
                    <span className={textSecondaryColor}>{Math.round(generalRate)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-800">
                    <div className="h-2 rounded-full bg-amber-500 transition-all" style={{ width: `${Math.min(generalRate, 100)}%` }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={textSecondaryColor}>Esta semana</span>
                    <span className={textSecondaryColor}>{Math.round(weekRate)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-800">
                    <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${Math.min(weekRate, 100)}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={textSecondaryColor}>Racha de sesiones seguidas</span>
                  <span className="font-bold text-orange-400">
                    {progressData.summary.currentStreak} 🔥
                  </span>
                </div>
              </div>
            )}

            {/* Sessions list */}
            <div>
              <h3 className="mb-3 text-sm font-medium text-surface-300">Todas las sesiones</h3>
              {sortedSessions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-surface-700 bg-surface-900/80 p-6 text-center">
                  <p className={textSecondaryColor}>No hay sesiones programadas.</p>
                  <Link
                    to="/onboarding"
                    className="mt-2 inline-block rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-amber-400"
                  >
                    Configurar programa
                  </Link>
                </div>
               ) : (
                 <div className="space-y-3">
                   {phaseGroups.map(([phaseName, phaseSessions]) => {
                     const allDone = phaseSessions.every((s) => s.status === "COMPLETED");
                     const doneCount = phaseSessions.filter((s) => s.status === "COMPLETED").length;
                     const isCurrent = phaseSessions.some((s) => s.scheduledDate.slice(0, 10) === today) || phaseSessions.some((s) => s.status !== "COMPLETED");
                     const expanded = expandedPhases.has(phaseName);
                     return (
                       <div
                         key={phaseName}
                         className={`rounded-xl border ${isCurrent ? "border-amber-500/60" : cardBorder} ${cardBg} overflow-hidden`}
                       >
                         <button
                           type="button"
                           onClick={() =>
                             setExpandedPhases((prev) => {
                               const next = new Set(prev);
                               if (next.has(phaseName)) next.delete(phaseName);
                               else next.add(phaseName);
                               return next;
                             })
                           }
                           className="flex w-full items-center justify-between px-4 py-3 text-left"
                         >
                           <div className="flex items-center gap-2">
                             <span className="text-sm">{expanded ? "▼" : "▶"}</span>
                             <span className={`font-medium ${textColor}`}>{phaseName}</span>
                             {allDone && <span className="text-green-400">✔ Completada</span>}
                           </div>
                           <span className={`text-xs ${textSecondaryColor}`}>
                             {doneCount}/{phaseSessions.length}
                           </span>
                         </button>
                         {expanded && (
                           <div className="space-y-2 border-t border-surface-700/50 p-3">
                             {phaseSessions.map((session) => {
                               const config =
                                 DAY_TYPE_CONFIG[(session.dayType as DayType) ?? "OTHER"] || DAY_TYPE_CONFIG.OTHER;
                               const isToday = session.scheduledDate.slice(0, 10) === today;
                               const isCompleted = session.status === "COMPLETED";
                               return (
                                 <Link
                                   key={session.id}
                                   to={`/programa/sessions/${session.id}`}
                                   className={`flex items-center gap-3 rounded-lg bg-surface-900/60 p-3 transition-colors hover:bg-surface-800 ${
                                     isToday ? "ring-1 ring-amber-500/30" : ""
                                   }`}
                                 >
                                   <span className={`text-xl ${config.color}`}>{config.emoji}</span>
                                   <div className="flex-1">
                                     <div className="flex items-center justify-between">
                                       <p className={`font-medium ${isCompleted ? textSecondaryColor : textColor}`}>
                                         {session.title}
                                       </p>
                                       {isToday && (
                                         <span className="rounded-full bg-amber-900/20 px-2 py-0.5 text-xs text-amber-400">
                                           Hoy
                                         </span>
                                       )}
                                     </div>
                                     <p className={`text-xs ${textSecondaryColor}`}>
                                       {new Date(session.scheduledDate).toLocaleDateString("es-ES", {
                                         weekday: "short",
                                         month: "short",
                                         day: "numeric",
                                       })}
                                     </p>
                                     {session.exerciseCount !== undefined && (
                                       <p className={`text-xs ${textSecondaryColor}`}>
                                         {session.exerciseCount} ejercicios
                                       </p>
                                     )}
                                   </div>
                                   {isCompleted && <span className="text-lg text-green-400">✓</span>}
                                 </Link>
                               );
                             })}
                           </div>
                         )}
                       </div>
                     );
                   })}
                 </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Regenerate modal */}
      {showRegenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-900 rounded-xl border border-surface-700 p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">Regenerar programa</h3>
                <p className="text-sm text-surface-400 mt-1">
                  Esto reemplazará tu programa actual con uno nuevo basado en la plantilla seleccionada.
                </p>
              </div>
              <button
                onClick={() => setShowRegenerateModal(false)}
                className="rounded-md p-2 text-surface-400 hover:text-white hover:bg-surface-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                  Plantilla de programa
                </label>
                <div className="relative">
                  <select
                    value={selectedTemplateCode}
                    onChange={(e) => setSelectedTemplateCode(e.target.value)}
                    className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                  >
                    {availableTemplates.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.name} {t.isPremium ? " · Premium" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">
                  Fecha de inicio
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowRegenerateModal(false)}
                className="flex-1 rounded-lg border border-surface-700 py-2.5 text-sm font-medium text-surface-300 hover:bg-surface-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegenerateProgram}
                disabled={regenerating}
                className="flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
              >
                {regenerating ? "Generando…" : "Generar programa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

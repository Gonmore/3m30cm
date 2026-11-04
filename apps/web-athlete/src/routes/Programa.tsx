import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useApi, handleApiResponse } from "../api/client";
import { useTheme } from "../contexts/ThemeContext";
import {
  DAY_TYPE_CONFIG,
  type DayType,
  type ScheduledSession,
  type SessionsListResponse,
  type ProgressResponse,
  type ExerciseMediaAsset,
} from "../types/api";

export default function ProgramaScreen() {
  const api = useApi();
  const location = useLocation();
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [progressData, setProgressData] = useState<ProgressResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [sessionsRes, progressRes] = await Promise.all([
          api("/athlete/sessions"),
          api("/athlete/progress"),
        ]);
        const sessionsData = await handleApiResponse<SessionsListResponse>(sessionsRes);
        const progress = await handleApiResponse<ProgressResponse>(progressRes);
        setSessions(sessionsData.sessions ?? []);
        setProgressData(progress);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [api, location.state]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="{textSecondaryColor}">Cargando…</div>
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
  const { theme } = useTheme();
  const bgImage = theme === "dark" ? "/Hombre.jpeg" : "/Mujer.jpeg";
  const overlayClass = theme === "dark" ? "bg-black/40" : "bg-white/30";
  const textColor = theme === "dark" ? "{textColor}" : "text-surface-900";
  const textSecondaryColor = theme === "dark" ? "{textSecondaryColor}" : "text-surface-600";
  const cardBg = theme === "dark" ? "{cardBg}" : "bg-surface-100";
  const cardBorder = theme === "dark" ? "{cardBorder}" : "border-surface-300";

  return (
    <div className="relative min-h-screen flex flex-col">
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
      <div className="relative z-10 flex flex-col min-h-screen px-4 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="space-y-6">
            {/* Program header */}
            <div>
              <h2 className="text-2xl font-bold {textColor}">Mi Programa</h2>
              {progressData?.summary && (
                <p className="mt-1 text-sm {textSecondaryColor}">
                  {progressData.summary.completedSessions}/{progressData.summary.totalSessions} sesiones
                  completadas · {Math.round(progressData.summary.completionRate)}% de avance
                </p>
              )}
            </div>

            {/* Completion rate */}
            {progressData?.summary && (
              <div className="rounded-xl border border-surface-700 bg-surface-900/80 p-5">
                <h3 className="mb-3 text-sm font-medium text-surface-300">Progreso general</h3>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-3xl font-bold text-amber-400">
                    {Math.round(progressData.summary.completionRate)}%
                  </span>
                  <span className="text-xs {textSecondaryColor}">
                    Racha actual: {progressData.summary.currentStreak} día(s)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-800">
                  <div
                    className="h-2 rounded-full bg-amber-500 transition-all"
                    style={{ width: `${Math.min(progressData.summary.completionRate, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Sessions list */}
            <div>
              <h3 className="mb-3 text-sm font-medium text-surface-300">Todas las sesiones</h3>
              {sortedSessions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-surface-700 bg-surface-900/80 p-6 text-center">
                  <p className="{textSecondaryColor}">No hay sesiones programadas.</p>
                  <Link
                    to="/onboarding"
                    className="mt-2 inline-block rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-black transition-colors hover:bg-amber-400"
                  >
                    Configurar programa
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedSessions.map((session) => {
                    const config =
                      DAY_TYPE_CONFIG[(session.dayType as DayType) ?? "OTHER"] || DAY_TYPE_CONFIG.OTHER;
                    const isToday = session.scheduledDate.slice(0, 10) === today;
                    const isCompleted = session.logs?.some((l) => l.completedAt) ?? false;

                    return (
                      <Link
                        key={session.id}
                        to={`/programa/sessions/${session.id}`}
                        className={`flex items-center gap-3 rounded-lg bg-surface-900/80 p-3 transition-colors hover:bg-surface-800 ${
                          isToday ? "ring-1 ring-amber-500/30" : ""
                        }`}
                      >
                        <span className={`text-xl ${config.color}`}>{config.emoji}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className={`font-medium ${isCompleted ? "{textSecondaryColor}" : "{textColor}"}`}>
                              {session.title}
                            </p>
                            {isToday && (
                              <span className="rounded-full bg-amber-900/20 px-2 py-0.5 text-xs text-amber-400">
                                Hoy
                              </span>
                            )}
                          </div>
                          <p className="text-xs {textSecondaryColor}">
                            {new Date(session.scheduledDate).toLocaleDateString("es-ES", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                          {session.exerciseCount !== undefined && (
                            <p className="text-xs {textSecondaryColor}">{session.exerciseCount} ejercicios</p>
                          )}
                        </div>
                        {isCompleted && <span className="text-lg text-green-400">✓</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

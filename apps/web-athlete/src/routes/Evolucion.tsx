import { useEffect, useState } from "react";

import { useApi, handleApiResponse } from "../api/client";
import { type ProgressResponse } from "../types/api";

export default function EvolucionScreen() {
  const api = useApi();
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const response = await api("/athlete/progress");
        const progressData = await handleApiResponse<ProgressResponse>(response);
        setData(progressData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [api]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-surface-400">Cargando…</div>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;
  }

  if (!data) return null;

  const summary = data.summary;
  const jumpBest = data.personalBests?.jumpHeightCm;
  const avgLoad = data.personalBests?.avgLoadKg;
  const peakVelocity = data.personalBests?.peakVelocityMps;

  const getCompletionColor = (rate: number) => {
    if (rate >= 75) return "text-green-400";
    if (rate >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-surface-100">Evolución</h2>
        <p className="mt-1 text-sm text-surface-400">Tu progreso a lo largo del tiempo</p>
      </div>

      {/* Jump metrics */}
      {jumpBest !== null && jumpBest !== undefined && (
        <div className="rounded-xl border border-surface-700 bg-surface-900 p-5">
          <h3 className="mb-3 text-sm font-medium text-surface-300">Rendimiento de salto</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-surface-500">Salto máximo</p>
              <p className="text-2xl font-bold text-primary-400">{jumpBest} cm</p>
            </div>
            {peakVelocity !== null && peakVelocity !== undefined && (
              <div>
                <p className="text-xs text-surface-500">Velocidad pico</p>
                <p className="text-2xl font-bold text-surface-100">{peakVelocity} m/s</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Load metrics */}
      {avgLoad !== null && avgLoad !== undefined && (
        <div className="rounded-xl border border-surface-700 bg-surface-900 p-5">
          <h3 className="mb-3 text-sm font-medium text-surface-300">Carga de entrenamiento</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-surface-500">Carga promedio</p>
              <p className="text-2xl font-bold text-surface-100">{avgLoad} kg</p>
            </div>
          </div>
        </div>
      )}

      {/* Completion rate */}
      <div className="rounded-xl border border-surface-700 bg-surface-900 p-5">
        <h3 className="mb-3 text-sm font-medium text-surface-300">Completación de sesiones</h3>
        <div className="mb-2 flex items-center justify-between">
          <span className={`text-3xl font-bold ${getCompletionColor(summary.completionRate)}`}>
            {Math.round(summary.completionRate)}%
          </span>
          <span className="text-xs text-surface-500">
            {summary.completedSessions}/{summary.totalSessions} sesiones
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-surface-800">
          <div
            className="h-2 rounded-full bg-primary-500 transition-all"
            style={{ width: `${Math.min(summary.completionRate, 100)}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <span className="font-medium text-red-400">{summary.skippedSessions}</span>
            <p className="text-surface-500">Saltadas</p>
          </div>
          <div>
            <span className="font-medium text-yellow-400">{summary.rescheduledSessions}</span>
            <p className="text-surface-500">Reprogramadas</p>
          </div>
          <div>
            <span className="font-medium text-green-400">{summary.currentStreak}</span>
            <p className="text-surface-500">Racha (días)</p>
          </div>
        </div>
      </div>

      {/* Weekly goal */}
      {data.weeklyGoal && (
        <div className="rounded-xl border border-surface-700 bg-surface-900 p-4">
          <h3 className="mb-2 text-sm font-medium text-surface-300">Meta semanal</h3>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-surface-300">
              {data.weeklyGoal.completedSessions}/{data.weeklyGoal.targetSessions} sesiones
            </span>
            <span className="text-xs text-surface-500">
              Faltan {data.weeklyGoal.remainingSessions}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-800">
            <div
              className="h-2 rounded-full bg-primary-500 transition-all"
              style={{ width: `${Math.min(data.weeklyGoal.completionRate, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Feedback */}
      {data.feedback && data.feedback.status && (
        <div className="rounded-xl border border-blue-900/30 bg-blue-900/10 p-4">
          <h3 className="mb-2 text-sm font-medium text-blue-400">Feedback</h3>
          <p className="font-medium text-surface-100">{data.feedback.title}</p>
          <p className="mt-1 text-sm text-surface-300">{data.feedback.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {data.feedback.actions?.map((action, i) => (
              <span key={i} className="text-xs text-surface-500">• {action}</span>
            ))}
          </div>
        </div>
      )}

      {/* Recent logs */}
      {data.recentLogs && data.recentLogs.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-surface-300">Registros recientes</h3>
          <div className="space-y-2">
            {data.recentLogs.map((log) => (
              <div key={log.id} className="rounded-lg bg-surface-900 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-surface-100">
                    {new Date(log.createdAt).toLocaleDateString("es-ES")}
                  </p>
                  {log.perceivedExertion !== null && (
                    <span className="text-xs text-surface-400">
                      Esfuerzo: {log.perceivedExertion}/10
                    </span>
                  )}
                </div>
                {log.notes && <p className="mt-1 text-xs text-surface-500">{log.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

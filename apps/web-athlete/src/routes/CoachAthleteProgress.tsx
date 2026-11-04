import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { useApi, handleApiResponse } from "../api/client";

interface AthleteProgressResponse {
  athlete: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    athleteProfile: {
      id: string;
      displayName: string | null;
      sport: string | null;
      seasonPhase: string;
      onboardingCompletedAt: string | null;
      heightCm: number | null;
      weightKg: number | null;
    };
  };
  activeProgram: {
    id: string;
    name: string;
    status: string;
    startDate: string;
    phase: string;
    template: { id: string; code: string; name: string };
  } | null;
  sessions: Array<{
    id: string;
    title: string;
    dayType: string;
    status: string;
    scheduledDate: string;
  }>;
  progress: {
    totalSessions: number;
    completedSessions: number;
    completionRate: number;
  };
  techniqueMetrics: Array<{
    id: string;
    label: string;
    value: number;
    unit: string | null;
    recordedAt: string;
  }>;
  jumpMetrics: {
    bestJumpCm: number | null;
    avgJumpCm: number | null;
  };
}

export default function CoachAthleteProgress() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const api = useApi();
  const [data, setData] = useState<AthleteProgressResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athleteId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Use coachUserId query param for SUPERADMIN override pattern
        const response = await api(`/athlete/progress?coachUserId=${athleteId}`);
        const athleteData = await handleApiResponse<AthleteProgressResponse>(response);
        setData(athleteData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [api, athleteId]);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-surface-100">
          {data.athlete.athleteProfile.displayName ||
            `${data.athlete.firstName ?? ""} ${data.athlete.lastName ?? ""}`.trim() ||
            data.athlete.email}
        </h2>
        <p className="mt-1 text-sm text-surface-400">
          {data.athlete.athleteProfile.sport || "Sin deporte especificado"} ·{" "}
          {data.athlete.athleteProfile.seasonPhase}
        </p>
      </div>

      {/* Progress stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-surface-900 p-3">
          <div className="text-2xl font-bold text-surface-100">{data.progress.completedSessions}</div>
          <div className="text-xs text-surface-500">Sesiones completadas</div>
        </div>
        <div className="rounded-lg bg-surface-900 p-3">
          <div className="text-2xl font-bold text-surface-100">{data.progress.totalSessions}</div>
          <div className="text-xs text-surface-500">Total sesiones</div>
        </div>
        <div className="rounded-lg bg-surface-900 p-3">
          <div className="text-2xl font-bold text-primary-400">{Math.round(data.progress.completionRate)}%</div>
          <div className="text-xs text-surface-500">Completado</div>
        </div>
      </div>

      {/* Jump metrics */}
      {data.jumpMetrics.avgJumpCm !== null && (
        <div className="rounded-lg bg-surface-900 p-4">
          <h3 className="mb-2 text-sm font-medium text-surface-300">Salto promedio</h3>
          <p className="text-xl font-bold text-primary-400">{data.jumpMetrics.avgJumpCm} cm</p>
          {data.jumpMetrics.bestJumpCm && (
            <p className="mt-1 text-xs text-surface-500">
              Máximo: {data.jumpMetrics.bestJumpCm} cm
            </p>
          )}
        </div>
      )}

      {/* Active program */}
      {data.activeProgram && (
        <div className="rounded-lg border border-surface-700 bg-surface-900 p-4">
          <h3 className="mb-2 text-sm font-medium text-surface-300">Programa activo</h3>
          <p className="font-medium text-surface-100">{data.activeProgram.name}</p>
          <p className="text-sm text-surface-400">Fase: {data.activeProgram.phase}</p>
        </div>
      )}

      {/* Technique metrics */}
      {data.techniqueMetrics.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-surface-300">Métricas técnicas</h3>
          <div className="space-y-2">
            {data.techniqueMetrics.slice(0, 5).map((metric) => (
              <div key={metric.id} className="rounded-lg bg-surface-900 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-300">{metric.label}</span>
                  <span className="font-medium text-surface-100">
                    {metric.value} {metric.unit}
                  </span>
                </div>
                <p className="mt-1 text-xs text-surface-500">
                  {new Date(metric.recordedAt).toLocaleDateString("es-ES")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";

import { useApi, handleApiResponse } from "../api/client";
import { type ProgressResponse } from "../types/api";

export default function TecnicaScreen() {
  const api = useApi();
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
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

  const jumpBest = data.personalBests?.jumpHeightCm;
  const peakVelocity = data.personalBests?.peakVelocityMps;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-surface-100">Técnica</h2>
        <p className="mt-1 text-sm text-surface-400">
          Seguimiento de métricas técnicas y biomecánicas
        </p>
      </div>

      {/* Technique metrics */}
      <div className="space-y-3">
        {jumpBest !== null && jumpBest !== undefined && (
          <div className="rounded-lg bg-surface-900 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-surface-300">Salto máximo</span>
              <span className="text-sm font-bold text-primary-400">{jumpBest} cm</span>
            </div>
          </div>
        )}

        {peakVelocity !== null && peakVelocity !== undefined && (
          <div className="rounded-lg bg-surface-900 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-surface-300">Velocidad pico</span>
              <span className="text-sm font-bold text-surface-100">{peakVelocity} m/s</span>
            </div>
          </div>
        )}

        {data.recentLogs &&
          data.recentLogs.some((l) => l.metrics && Object.keys(l.metrics).length > 0) && (
            <div className="rounded-lg bg-surface-900 p-4">
              <h3 className="mb-2 text-sm font-medium text-surface-300">Métricas recientes</h3>
              <div className="space-y-2">
                {data.recentLogs
                  .filter((l) => l.metrics && Object.keys(l.metrics).length > 0)
                  .slice(0, 3)
                  .map((log) => (
                    <div key={log.id} className="text-xs">
                      <span className="text-surface-500">
                        {new Date(log.createdAt).toLocaleDateString("es-ES")}
                      </span>
                      <span className="ml-2 text-surface-300">
                        {(log.metrics as Record<string, unknown>)?.readinessScore as string ?? "—"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
      </div>

      {/* Info message */}
      <div className="rounded-lg border border-dashed border-surface-700 bg-surface-900/30 p-6 text-center">
        <h3 className="mb-2 text-lg font-medium text-surface-100">Análisis técnico</h3>
        <p className="text-sm text-surface-400">
          Para análisis de video y medición avanzada de técnica, usá la app móvil.
          Esta web muestra tus métricas registradas durante las sesiones.
        </p>
      </div>
    </div>
  );
}

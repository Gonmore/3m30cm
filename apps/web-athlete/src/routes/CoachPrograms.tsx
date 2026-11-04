import { useEffect, useState } from "react";

import { useApi, handleApiResponse } from "../api/client";
import { type AvailableTemplate } from "../types/api";

interface CoachProgramsResponse {
  templates: AvailableTemplate[];
}

export default function CoachPrograms() {
  const api = useApi();
  const [templates, setTemplates] = useState<AvailableTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const response = await api("/coach/programs");
        const data = await handleApiResponse<CoachProgramsResponse>(response);
        setTemplates(data.templates ?? []);
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

  if (templates.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-surface-400">No hay programas creados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-surface-100">Mis programas</h2>

      <div className="space-y-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className="rounded-lg border border-surface-700 bg-surface-900 p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-surface-100">{template.name}</h3>
                <p className="mt-1 text-sm text-surface-400">
                  {template.description || "Sin descripción"}
                </p>
                <p className="mt-2 text-xs text-surface-500">
                  Código: {template.code} · {template.cycleLengthDays ?? 0} días
                  {template.isPremium && " · Premium"}
                </p>
              </div>
              <span
                className={`text-xs ${
                  template.isPremium
                    ? "rounded-full bg-amber-900/20 px-2 py-0.5 text-amber-400"
                    : "rounded-full bg-blue-900/20 px-2 py-0.5 text-blue-400"
                }`}
              >
                {template.isPremium ? "Premium" : "Base"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

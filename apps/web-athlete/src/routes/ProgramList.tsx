import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useApi, handleApiResponse } from "../api/client";

interface Coach {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface ProgramTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  cycleLengthDays: number;
  isPremium: boolean;
  coachId: string | null;
  coach: Coach | null;
  hasActiveProgram: boolean;
  assignmentStatus: string | null;
}

export default function ProgramList() {
  const api = useApi();
  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await api("/athlete/programs/available");
        const data = await handleApiResponse<{
          templates: ProgramTemplate[];
          hasActiveProgram: boolean;
        }>(response);
        setTemplates(data.templates ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load programs");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchTemplates();
  }, [api]);

  const getCoachName = (coach: Coach | null) => {
    if (!coach) return "Sin coach";
    const name = [coach.firstName, coach.lastName].filter(Boolean).join(" ");
    return name || coach.email;
  };

  const handleRequest = async (templateCode: string) => {
    try {
      const response = await api("/athlete/programs/request", {
        method: "POST",
        body: JSON.stringify({ templateCode }),
      });
      await handleApiResponse(response);
      // Reload templates to show updated assignment status
      const reloadResponse = await api("/athlete/programs/available");
      const data = await handleApiResponse<{
        templates: ProgramTemplate[];
        hasActiveProgram: boolean;
      }>(reloadResponse);
      setTemplates(data.templates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request program");
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-surface-400">Cargando programas…</div>;
  }

  if (error) {
    return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Programas Disponibles</h1>
        <p className="mt-1 text-sm text-surface-400">
          Explora y solicita programas de entrenamiento personalizado.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className="rounded-xl bg-surface-900 p-6 transition-transform hover:scale-[1.02]"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-surface-100">{template.name}</h3>
                <code className="mt-1 text-xs text-surface-500">{template.code}</code>
              </div>
              {template.isPremium && (
                <span className="rounded-full bg-primary-900/30 px-2 py-1 text-xs font-medium text-primary-400">
                  Premium
                </span>
              )}
            </div>

            {template.description && (
              <p className="mt-3 text-sm text-surface-300">{template.description}</p>
            )}

            <div className="mt-4 flex items-center gap-2 text-sm text-surface-400">
              <span>Duración: {template.cycleLengthDays} días</span>
              {template.coach && <span>· Coach: {getCoachName(template.coach)}</span>}
            </div>

            {template.hasActiveProgram ? (
              <span className="mt-4 block text-sm text-surface-500">Has completado este programa</span>
            ) : template.assignmentStatus === "PENDING" ? (
              <span className="mt-4 block text-sm text-amber-400">Solicitud pendiente de aprobación</span>
            ) : template.assignmentStatus === "APPROVED" ? (
              <span className="mt-4 block text-sm text-green-400">Solicitud aprobada</span>
            ) : (
              <button
                onClick={() => void handleRequest(template.code)}
                className="mt-4 w-full rounded-md bg-primary-600 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {template.isPremium ? "Solicitar programa" : "Ver detalle"}
              </button>
            )}

            <Link
              to={`/programs/${template.code}`}
              className="mt-2 block text-center text-sm text-primary-400 hover:text-primary-300"
            >
              Ver detalle
            </Link>
          </div>
        ))}
      </div>

      {templates.length === 0 && (
        <p className="text-surface-400">No hay programas disponibles.</p>
      )}
    </div>
  );
}

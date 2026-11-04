import { useEffect, useState } from "react";

import { useApi, handleApiResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import {
  type AvailableTemplate,
  type ProgramAssignment,
  type AvailableProgramsResponse,
  type AssignmentsListResponse,
} from "../types/api";

export default function SettingsScreen() {
  const api = useApi();
  const { user } = useAuth();
  const [availableTemplates, setAvailableTemplates] = useState<AvailableTemplate[]>([]);
  const [assignments, setAssignments] = useState<ProgramAssignment[]>([]);
  const [hasActiveProgram, setHasActiveProgram] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestingTemplateId, setRequestingTemplateId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [availableRes, assignmentsRes] = await Promise.all([
          api("/athlete/programs/available"),
          api("/athlete/assignments"),
        ]);
        const availableData = await handleApiResponse<AvailableProgramsResponse>(availableRes);
        const assignmentsData = await handleApiResponse<AssignmentsListResponse>(assignmentsRes);
        setAvailableTemplates(availableData.templates ?? []);
        setHasActiveProgram(availableData.hasActiveProgram ?? false);
        setAssignments(assignmentsData.assignments ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [api]);

  const handleRequestProgram = async (template: AvailableTemplate) => {
    setRequestingTemplateId(template.id);
    setError(null);
    try {
      await api("/athlete/programs/request", {
        method: "POST",
        body: JSON.stringify({ templateCode: template.code }),
      });
      const assignmentsRes = await api("/athlete/assignments");
      const assignmentsData = await handleApiResponse<AssignmentsListResponse>(assignmentsRes);
      setAssignments(assignmentsData.assignments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al solicitar programa");
    } finally {
      setRequestingTemplateId(null);
    }
  };

  const getAssignmentStatus = (templateCode: string) => {
    return assignments.find((a) => a.template?.code === templateCode);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-surface-400">Cargando…</div>
      </div>
    );
  }

  const displayName =
    user?.firstName || user?.lastName
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : user?.email?.split("@")[0] || "Usuario";

  const premiumTemplates = availableTemplates.filter((t) => t.isPremium);
  const freeTemplates = availableTemplates.filter((t) => !t.isPremium);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-surface-100">Ajustes</h2>
        <p className="mt-1 text-sm text-surface-400">{displayName}</p>
        <p className="mt-1 text-sm text-surface-500">{user?.email}</p>
      </div>

      {error && (
        <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>
      )}

      {/* Active program indicator */}
      {hasActiveProgram && (
        <div className="rounded-lg bg-green-900/20 p-3 text-sm text-green-400">
          ✓ Tenés un programa activo
        </div>
      )}

      {/* Premium programs */}
      {premiumTemplates.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-surface-300">Programas premium</h3>
          <div className="space-y-3">
            {premiumTemplates.map((template) => {
              const assignment = getAssignmentStatus(template.code);
              return (
                <div
                  key={template.id}
                  className="rounded-lg border border-surface-700 bg-surface-900 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-surface-100">{template.name}</h4>
                      <p className="mt-1 text-sm text-surface-400">
                        {template.description || "Programa premium de alto rendimiento"}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-900/20 px-2 py-0.5 text-xs text-amber-400">
                      Premium
                    </span>
                  </div>

                  {assignment ? (
                    <div className="mt-3 rounded-md bg-surface-800 px-3 py-2">
                      <span
                        className={`text-xs font-medium ${
                          assignment.status === "APPROVED"
                            ? "text-green-400"
                            : assignment.status === "REJECTED"
                              ? "text-red-400"
                              : "text-yellow-400"
                        }`}
                      >
                        {assignment.status === "APPROVED"
                          ? "Aprobado"
                          : assignment.status === "REJECTED"
                            ? "Rechazado"
                            : "Pendiente de aprobación"}
                      </span>
                    </div>
                  ) : hasActiveProgram ? (
                    <div className="mt-3 rounded-md bg-surface-800 px-3 py-2">
                      <span className="text-xs text-surface-400">
                        Tenés un programa activo. Completá o archivá tu programa actual antes
                        de solicitar uno nuevo.
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRequestProgram(template)}
                      disabled={requestingTemplateId === template.id}
                      className="mt-3 w-full rounded-md bg-primary-600 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                    >
                      {requestingTemplateId === template.id ? "Solicitando…" : "Solicitar programa"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Free programs */}
      {freeTemplates.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-surface-300">Programas base</h3>
          <div className="space-y-3">
            {freeTemplates.map((template) => (
              <div
                key={template.id}
                className="rounded-lg border border-surface-700 bg-surface-900 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-surface-100">{template.name}</h4>
                    <p className="mt-1 text-sm text-surface-400">
                      {template.description || "Sin descripción"}
                    </p>
                    <p className="mt-1 text-xs text-surface-500">
                      {template.cycleLengthDays} días
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-900/20 px-2 py-0.5 text-xs text-blue-400">
                    Base
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

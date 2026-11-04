import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useApi, handleApiResponse } from "../api/client";
import { type ProgramAssignment, type AvailableTemplate } from "../types/api";

interface CoachDashboardResponse {
  athletes: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    athleteProfile: {
      id: string;
      displayName: string | null;
      sport: string | null;
      seasonPhase: string;
    };
  }>;
  pendingAssignments: ProgramAssignment[];
  approvedTemplates: AvailableTemplate[];
}

interface AssignmentsResponse {
  assignments: ProgramAssignment[];
}

export default function CoachDashboard() {
  const api = useApi();
  const [data, setData] = useState<CoachDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [athletesRes, assignmentsRes] = await Promise.all([
          api("/coach/athletes"),
          api("/athlete/assignments"),
        ]);
        const athletesData = await handleApiResponse<CoachDashboardResponse["athletes"]>(athletesRes);
        const assignmentsData = await handleApiResponse<AssignmentsResponse>(assignmentsRes);

        setData({
          athletes: athletesData,
          pendingAssignments: (assignmentsData.assignments ?? []).filter(
            (a) => a.status === "PENDING",
          ),
          approvedTemplates: [],
        });
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-surface-100">Dashboard de Coach</h2>
        <p className="mt-1 text-sm text-surface-400">
          Gestioná programas y seguimiento de atletas
        </p>
      </div>

      {/* Pending approvals */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-surface-300">
          Solicitudes pendientes ({data.pendingAssignments.length})
        </h3>
        {data.pendingAssignments.length === 0 ? (
          <p className="text-sm text-surface-500">No hay solicitudes pendientes.</p>
        ) : (
          <div className="space-y-2">
            {data.pendingAssignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between rounded-lg bg-surface-900 p-3"
              >
                <div>
                  <p className="font-medium text-surface-100">{assignment.template.name}</p>
                  <p className="text-xs text-surface-500">
                    Código: {assignment.template.code} · Solicitado:{" "}
                    {new Date(assignment.assignedAt).toLocaleDateString("es-ES")}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await api(`/coach/assignments/${assignment.id}/approve`, { method: "POST" });
                      window.location.reload();
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700"
                >
                  Aprobar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Athletes */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-surface-300">Tus atletas</h3>
        {data.athletes.length === 0 ? (
          <p className="text-sm text-surface-500">Aún no tenés atletas asignados.</p>
        ) : (
          <div className="space-y-2">
            {data.athletes.map((athlete) => (
              <Link
                key={athlete.id}
                to={`/coach/athletes/${athlete.athleteProfile.id}`}
                className="flex items-center gap-3 rounded-lg bg-surface-900 p-3 transition-colors hover:bg-surface-800/50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-800 text-sm font-medium text-surface-300">
                  {athlete.athleteProfile.displayName
                    ? athlete.athleteProfile.displayName.charAt(0).toUpperCase()
                    : (athlete.firstName?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-surface-100">
                    {athlete.athleteProfile.displayName ||
                      `${athlete.firstName ?? ""} ${athlete.lastName ?? ""}`.trim() ||
                      athlete.email}
                  </p>
                  <p className="text-xs text-surface-500">
                    {athlete.athleteProfile.sport || "Sin deporte especificado"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="flex gap-3">
        <Link
          to="/coach/programs"
          className="flex-1 rounded-lg bg-surface-900 p-3 text-center text-sm font-medium text-surface-200 transition-colors hover:bg-surface-800/50"
        >
          Programas
        </Link>
        <Link
          to="/programa"
          className="flex-1 rounded-lg bg-surface-900 p-3 text-center text-sm font-medium text-surface-200 transition-colors hover:bg-surface-800/50"
        >
          Mis sesiones
        </Link>
      </div>
    </div>
  );
}

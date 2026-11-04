import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useApi, handleApiResponse } from "../api/client";

interface Coach {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface Template {
  id: string;
  code: string;
  name: string;
  isPremium: boolean;
  cycleLengthDays: number;
}

interface Assignment {
  id: string;
  status: string;
  assignedAt: string;
  requestNotes: string | null;
  approvedAt: string | null;
  template: Template;
  coach: Coach | null;
}

export default function MyAssignments() {
  const api = useApi();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        const response = await api("/athlete/assignments");
        const data = await handleApiResponse<{ assignments: Assignment[] }>(response);
        setAssignments(data.assignments ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load assignments");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchAssignments();
  }, [api]);

  const statusLabels: Record<string, string> = {
    PENDING: "Pendiente",
    APPROVED: "Aprobada",
    REJECTED: "Rechazada",
  };

  const statusColors: Record<string, string> = {
    PENDING: "text-amber-400 bg-amber-900/30",
    APPROVED: "text-green-400 bg-green-900/30",
    REJECTED: "text-red-400 bg-red-900/30",
  };

  const getCoachName = (coach: Coach | null) => {
    if (!coach) return "Sin coach";
    const name = [coach.firstName, coach.lastName].filter(Boolean).join(" ");
    return name || coach.email;
  };

  if (isLoading) {
    return <div className="py-8 text-center text-surface-400">Cargando solicitudes…</div>;
  }

  if (error) {
    return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">Mis Solicitudes de Programa</h1>
        <p className="mt-1 text-sm text-surface-400">
          Estado de tus solicitudes de programas premium.
        </p>
      </div>

      {assignments.length === 0 ? (
        <p className="text-surface-400">No tienes solicitudes de programa.</p>
      ) : (
        <div className="space-y-3">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="flex items-center justify-between rounded-xl bg-surface-900 p-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Link
                    to={`/assignments/${assignment.template.id}`}
                    className="font-semibold text-surface-100 hover:text-primary-400"
                  >
                    {assignment.template.name}
                  </Link>
                  {assignment.template.isPremium && (
                    <span className="text-xs text-primary-400">Premium</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-sm text-surface-400">
                  <span>Coach: {getCoachName(assignment.coach)}</span>
                  <span>Solicitado: {new Date(assignment.assignedAt).toLocaleDateString("es-ES")}</span>
                </div>
                {assignment.requestNotes && (
                  <p className="mt-2 text-sm text-surface-300">{assignment.requestNotes}</p>
                )}
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  statusColors[assignment.status] ?? "text-surface-400 bg-surface-800"
                }`}
              >
                {statusLabels[assignment.status] ?? assignment.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

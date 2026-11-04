import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";

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
  welcomeVideoUrl: string | null;
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

interface PersonalProgram {
  id: string;
  name: string;
  status: string;
  startDate: string;
}

export default function AssignmentDetail() {
  const { templateId } = useParams<{ templateId: string }>();
  const api = useApi();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [personalProgram, setPersonalProgram] = useState<PersonalProgram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) return;

    const fetchData = async () => {
      try {
        const response = await api(`/athlete/assignments/${templateId}`);
        const data = await handleApiResponse<{ assignment: Assignment; personalProgram: PersonalProgram | null }>(response);
        setAssignment(data.assignment);
        setPersonalProgram(data.personalProgram);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load assignment");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [templateId, api]);

  const statusLabels: Record<string, string> = {
    PENDING: "Pendiente",
    APPROVED: "Aprobada",
    REJECTED: "Rechazada",
  };

  const getCoachName = (coach: Coach | null) => {
    if (!coach) return "Sin coach";
    const name = [coach.firstName, coach.lastName].filter(Boolean).join(" ");
    return name || coach.email;
  };

  if (isLoading) {
    return <div className="py-8 text-center text-surface-400">Cargando…</div>;
  }

  if (error) {
    return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;
  }

  if (!assignment) {
    return <div className="py-8 text-center text-surface-400">Solicitud no encontrada</div>;
  }

  const statusLabel = statusLabels[assignment.status] ?? assignment.status;
  const statusColor =
    assignment.status === "APPROVED"
      ? "text-green-400 bg-green-900/30"
      : assignment.status === "PENDING"
        ? "text-amber-400 bg-amber-900/30"
        : "text-red-400 bg-red-900/30";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">{assignment.template.name}</h1>
        <div className="mt-2 flex items-center gap-3">
          <code className="text-sm text-surface-500">{assignment.template.code}</code>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor}`}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-surface-500">Coach</span>
          <span className="ml-2 text-surface-300">{getCoachName(assignment.coach)}</span>
        </div>
        <div>
          <span className="text-surface-500">Duración</span>
          <span className="ml-2 text-surface-300">{assignment.template.cycleLengthDays} días</span>
        </div>
        <div>
          <span className="text-surface-500">Solicitado</span>
          <span className="ml-2 text-surface-300">
            {new Date(assignment.assignedAt).toLocaleDateString("es-ES")}
          </span>
        </div>
        {assignment.approvedAt && (
          <div>
            <span className="text-surface-500">Aprobado</span>
            <span className="ml-2 text-surface-300">
              {new Date(assignment.approvedAt).toLocaleDateString("es-ES")}
            </span>
          </div>
        )}
      </div>

      {assignment.requestNotes && (
        <div>
          <h2 className="text-sm font-medium text-surface-400">Nota de solicitud</h2>
          <p className="mt-1 text-surface-300">{assignment.requestNotes}</p>
        </div>
      )}

      {personalProgram && (
        <div className="rounded-xl bg-surface-900 p-4">
          <h2 className="text-sm font-medium text-surface-400">Programa generado</h2>
          <p className="mt-1 font-semibold text-surface-100">{personalProgram.name}</p>
          <p className="mt-1 text-sm text-surface-400">
            Estado: {personalProgram.status} · Inicio:{" "}
            {new Date(personalProgram.startDate).toLocaleDateString("es-ES")}
          </p>
        </div>
      )}

      {assignment.status === "PENDING" && (
        <div className="rounded-md bg-amber-900/30 p-3 text-sm text-amber-400">
          Tu solicitud está pendiente de aprobación por parte del coach. Te notificaremos cuando sea revisada.
        </div>
      )}
    </div>
  );
}

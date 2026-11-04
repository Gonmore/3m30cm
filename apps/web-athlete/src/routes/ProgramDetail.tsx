import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { useApi, handleApiResponse } from "../api/client";

interface Coach {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface MediaAsset {
  id: string;
  kind: string;
  url: string | null;
  title: string | null;
  isPrimary: boolean;
}

interface Technique {
  id: string;
  title: string;
  description: string | null;
}

interface ProgramTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  welcomeVideoUrl: string | null;
  cycleLengthDays: number;
  isPremium: boolean;
  coachId: string | null;
  coach: Coach | null;
  techniqueMediaAssets: MediaAsset[];
  techniques: Technique[];
}

interface TemplateResponse {
  template: ProgramTemplate;
}

interface Assignment {
  id: string;
  status: string;
  assignedAt: string;
  requestNotes: string | null;
  approvedAt: string | null;
  template: ProgramTemplate;
  coach: Coach | null;
}

interface PersonalProgram {
  id: string;
  name: string;
  status: string;
  startDate: string;
}

interface AssignmentResponse {
  assignment: Assignment;
  personalProgram: PersonalProgram | null;
}

export default function ProgramDetail() {
  const { templateId } = useParams<{ templateId: string }>();
  const api = useApi();
  const [template, setTemplate] = useState<ProgramTemplate | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [personalProgram, setPersonalProgram] = useState<PersonalProgram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) return;

    const fetchData = async () => {
      try {
        const [templateRes, assignmentRes] = await Promise.all([
          api(`/templates/program-templates/${templateId}`),
          api(`/athlete/assignments/${templateId}`),
        ]);

        const templateData = await handleApiResponse<TemplateResponse>(templateRes);
        setTemplate(templateData.template);

        const assignmentData = await handleApiResponse<AssignmentResponse>(assignmentRes);
        setAssignment(assignmentData.assignment);
        setPersonalProgram(assignmentData.personalProgram);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load program");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [templateId, api]);

  const handleRequest = async () => {
    if (!template) return;
    try {
      const response = await api("/athlete/programs/request", {
        method: "POST",
        body: JSON.stringify({ templateCode: template.code }),
      });
      const data = await handleApiResponse<{ assignment: Assignment }>(response);
      setAssignment(data.assignment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request program");
    }
  };

  const getCoachName = (coach: Coach | null) => {
    if (!coach) return "Sin coach";
    const name = [coach.firstName, coach.lastName].filter(Boolean).join(" ");
    return name || coach.email;
  };

  if (isLoading) {
    return <div className="py-8 text-center text-surface-400">Cargando programa…</div>;
  }

  if (error) {
    return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;
  }

  if (!template) {
    return <div className="py-8 text-center text-surface-400">Programa no encontrado</div>;
  }

  const primaryAsset = template.techniqueMediaAssets.find((a) => a.isPrimary) ?? template.techniqueMediaAssets[0];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold text-surface-100">{template.name}</h1>
          {template.isPremium && (
            <span className="rounded-full bg-primary-900/30 px-3 py-1 text-xs font-medium text-primary-400">
              Programa Premium
            </span>
          )}
        </div>
        <code className="mt-1 block text-sm text-surface-500">{template.code}</code>
        {template.description && (
          <p className="mt-3 text-surface-300">{template.description}</p>
        )}
      </div>

      {primaryAsset?.url && (
        <div className="aspect-video overflow-hidden rounded-xl bg-surface-800">
          <iframe
            src={primaryAsset.url}
            className="h-full w-full border-0"
            title={primaryAsset.title ?? template.name}
            allowFullScreen
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-surface-500">Duración</span>
          <span className="ml-2 text-surface-300">{template.cycleLengthDays} días</span>
        </div>
        {template.coach && (
          <div>
            <span className="text-surface-500">Coach</span>
            <span className="ml-2 text-surface-300">{getCoachName(template.coach)}</span>
          </div>
        )}
      </div>

      {template.techniques.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-surface-100">Técnicas incluidas</h2>
          <ul className="mt-3 space-y-2">
            {template.techniques.map((technique) => (
              <li key={technique.id} className="rounded-md bg-surface-900 p-3">
                <h3 className="font-medium text-surface-200">{technique.title}</h3>
                {technique.description && (
                  <p className="mt-1 text-sm text-surface-400">{technique.description}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-surface-800 pt-6">
        {assignment?.status === "APPROVED" && personalProgram ? (
          <div className="text-center">
            <span className="text-sm text-green-400">Tu programa fue aprobado</span>
            <p className="mt-1 text-surface-300">{personalProgram.name}</p>
          </div>
        ) : assignment?.status === "PENDING" ? (
          <div className="text-center">
            <span className="text-sm text-amber-400">Solicitud pendiente de aprobación del coach</span>
          </div>
        ) : assignment?.status === "REJECTED" ? (
          <div className="text-center">
            <span className="text-sm text-red-400">Solicitud rechazada</span>
          </div>
        ) : (
          <button
            onClick={() => void handleRequest()}
            className="w-full rounded-md bg-primary-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            {template.isPremium ? "Solicitar este programa premium" : "Ver detalle del programa"}
          </button>
        )}
      </div>
    </div>
  );
}

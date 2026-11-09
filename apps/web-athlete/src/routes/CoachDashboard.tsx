import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi, handleApiResponse } from "../api/client";
import { useViewMode } from "../contexts/ViewModeContext";
import type { CoachAthleteSummary, CoachProgramAssignment, CoachTemplateSummary } from "../types/api";

export default function CoachDashboard() {
  const api = useApi();
  const { isSuperAdmin } = useViewMode();
  const [templates, setTemplates] = useState<CoachTemplateSummary[]>([]);
  const [requests, setRequests] = useState<CoachProgramAssignment[]>([]);
  const [athletes, setAthletes] = useState<CoachAthleteSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const [tRes, rRes, aRes] = await Promise.all([api("/coach/program-templates"), api("/coach/requests"), api("/coach/athletes")]);
        const t = await handleApiResponse<{ templates: CoachTemplateSummary[] }>(tRes);
        const r = await handleApiResponse<{ assignments: CoachProgramAssignment[] }>(rRes);
        const a = await handleApiResponse<{ athletes: CoachAthleteSummary[] }>(aRes);
        setTemplates(t.templates ?? []);
        setRequests((r.assignments ?? []).filter((x) => x.status === "PENDING"));
        setAthletes(a.athletes ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [api]);

  const act = async (assignmentId: string, action: "approve" | "reject") => {
    try {
      const body = action === "reject" ? JSON.stringify({ notes: "Rechazado por el coach" }) : JSON.stringify({});
      const res = await api(`/coach/assignments/${assignmentId}/${action}`, { method: "POST", body });
      await handleApiResponse(res);
      setRequests((prev) => prev.filter((r) => r.id !== assignmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  if (isLoading) return <div className="py-10 text-center text-surface-400">Cargando…</div>;
  if (error) return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-surface-100">{isSuperAdmin ? "Panel coach (global)" : "Panel de coach"}</h2>
        <p className="mt-1 text-sm text-surface-400">Programas, solicitudes y atletas.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/coach/programas" className="rounded-lg bg-surface-900 p-4"><div className="text-2xl font-bold text-surface-100">{templates.length}</div><div className="text-sm text-surface-400">Programas</div></Link>
        <Link to="/coach/solicitudes" className="rounded-lg bg-surface-900 p-4"><div className="text-2xl font-bold text-amber-400">{requests.length}</div><div className="text-sm text-surface-400">Solicitudes pendientes</div></Link>
        <Link to="/coach/atletas" className="rounded-lg bg-surface-900 p-4"><div className="text-2xl font-bold text-surface-100">{athletes.length}</div><div className="text-sm text-surface-400">Atletas</div></Link>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-medium text-surface-300">Solicitudes pendientes</h3>
        {requests.length === 0 ? <p className="text-sm text-surface-500">No hay solicitudes pendientes.</p> : (
          <div className="space-y-2">
            {requests.slice(0, 8).map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-lg bg-surface-900 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-surface-100">{r.template?.name ?? "Programa"}</p>
                  <p className="text-xs text-surface-500">{r.athleteProfile?.displayName || r.athleteProfile?.user?.email || "Atleta"} · {new Date(r.assignedAt).toLocaleDateString("es-ES")}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void act(r.id, "approve")} className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white">Aprobar</button>
                  <button onClick={() => void act(r.id, "reject")} className="rounded-md bg-surface-800 px-3 py-1.5 text-xs text-surface-200">Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

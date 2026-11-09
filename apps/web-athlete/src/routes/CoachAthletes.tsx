import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi, handleApiResponse } from "../api/client";
import type { CoachAthleteSummary } from "../types/api";

function athleteName(a: CoachAthleteSummary) {
  return a.displayName || `${a.user?.firstName ?? ""} ${a.user?.lastName ?? ""}`.trim() || a.user?.email || "Atleta";
}

export default function CoachAthletes() {
  const api = useApi();
  const [athletes, setAthletes] = useState<CoachAthleteSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const res = await api("/coach/athletes");
        const data = await handleApiResponse<{ athletes: CoachAthleteSummary[] }>(res);
        setAthletes(data.athletes ?? []);
      } catch (err) { setError(err instanceof Error ? err.message : "Error al cargar"); }
      finally { setIsLoading(false); }
    })();
  }, [api]);

  if (isLoading) return <div className="py-10 text-center text-surface-400">Cargando…</div>;
  if (error) return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-surface-100">Atletas</h2>
      {athletes.length === 0 ? <p className="text-surface-400">No hay atletas visibles para tu alcance.</p> : (
        <div className="space-y-2">
          {athletes.map((a) => (
            <Link key={a.id} to={`/coach/atletas/${a.id}`} className="flex items-center justify-between rounded-lg bg-surface-900 p-3 hover:bg-surface-800/40">
              <div>
                <p className="font-medium text-surface-100">{athleteName(a)}</p>
                <p className="text-xs text-surface-500">{a.user?.email}{a.team ? ` · ${a.team.name}` : ""}</p>
              </div>
              <div className="text-right text-xs text-surface-500">
                <div>{a.personalPrograms?.[0]?.name || "Sin programa activo"}</div>
                <div>{a.programAssignments?.[0]?.status ? `Última solicitud: ${a.programAssignments[0].status}` : ""}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

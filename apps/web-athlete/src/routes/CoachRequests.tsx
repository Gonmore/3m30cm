import { useEffect, useState } from "react";
import { useApi, handleApiResponse } from "../api/client";
import { useViewMode } from "../contexts/ViewModeContext";
import type { CoachProgramAssignment } from "../types/api";

function money(cents: number | null | undefined, currency: string | null | undefined) {
  if (cents == null) return "";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: currency || "ARS", maximumFractionDigits: 0 }).format(cents / 100);
}

export default function CoachRequests() {
  const api = useApi();
  const { isSuperAdmin } = useViewMode();
  const [items, setItems] = useState<CoachProgramAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await api("/coach/requests?status=PENDING");
      const data = await handleApiResponse<{ assignments: CoachProgramAssignment[] }>(res);
      setItems(data.assignments ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "Error al cargar"); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (id: string, action: "approve" | "reject") => {
    try {
      const body = action === "reject" ? JSON.stringify({ notes: "Rechazado por el coach" }) : JSON.stringify({});
      const res = await api(`/coach/assignments/${id}/${action}`, { method: "POST", body });
      await handleApiResponse(res);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };

  if (isLoading) return <div className="py-10 text-center text-surface-400">Cargando…</div>;
  if (error) return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-surface-100">Solicitudes {isSuperAdmin ? "(globales)" : ""}</h2>
      {items.length === 0 ? <p className="text-surface-400">No hay solicitudes pendientes.</p> : (
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.id} className="rounded-lg bg-surface-900 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-surface-100">{r.template?.name}</p>
                  <p className="text-xs text-surface-500">{r.athleteProfile?.displayName || r.athleteProfile?.user?.email} · {r.template?.code}</p>
                  <p className="text-xs text-surface-500">{r.template?.isPremium ? "Premium" : "Base"} {money(r.template?.displayPriceCents, r.template?.currency)}{isSuperAdmin && r.coach ? ` · coach: ${r.coach.email}` : ""}</p>
                  {r.requestNotes ? <p className="mt-1 text-xs text-surface-400">Nota: {r.requestNotes}</p> : null}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void decide(r.id, "approve")} className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white">Aprobar</button>
                  <button onClick={() => void decide(r.id, "reject")} className="rounded-md bg-surface-800 px-3 py-1.5 text-xs text-surface-200">Rechazar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

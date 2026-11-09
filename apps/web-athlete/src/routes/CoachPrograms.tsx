import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi, handleApiResponse } from "../api/client";
import { useViewMode } from "../contexts/ViewModeContext";
import type { CoachTemplateSummary } from "../types/api";

function formatMoney(cents: number | null | undefined, currency: string | null | undefined) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: currency || "ARS", maximumFractionDigits: 0 }).format(cents / 100);
}

export default function CoachPrograms() {
  const api = useApi();
  const { isSuperAdmin } = useViewMode();
  const [templates, setTemplates] = useState<CoachTemplateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const res = await api("/coach/program-templates");
        const data = await handleApiResponse<{ templates: CoachTemplateSummary[] }>(res);
        setTemplates(data.templates ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally { setIsLoading(false); }
    })();
  }, [api]);

  if (isLoading) return <div className="py-10 text-center text-surface-400">Cargando…</div>;
  if (error) return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-surface-100">Programas</h2>
          <p className="text-sm text-surface-400">Ingreso esperado es display-only: aprobados × precio publicado.</p>
        </div>
        <Link to="/coach/programas/nuevo" className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white">Nuevo programa</Link>
      </div>
      {templates.length === 0 ? <p className="text-surface-400">No hay programas.</p> : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Link key={t.id} to={`/coach/programas/${t.id}`} className="block rounded-lg border border-surface-700 bg-surface-900 p-4 hover:bg-surface-800/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium text-surface-100">{t.name}</h3>
                  <p className="mt-1 text-sm text-surface-400">{t.objective || t.description || "Sin objetivo/descr."}</p>
                  <p className="mt-2 text-xs text-surface-500">{t.code} · {t.usesPhases ? "Fases" : "Días"} · {t.cycleLengthDays} días{isSuperAdmin && t.coach ? ` · ${t.coach.firstName || ""} ${t.coach.lastName || t.coach.email}` : ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-xs ${t.isPremium ? "text-amber-400" : "text-blue-400"}`}>{t.isPremium ? "Premium" : "Base"}</div>
                  <div className="text-sm font-medium text-surface-100">{formatMoney(t.displayPriceCents, t.currency)}</div>
                  <div className="text-xs text-surface-500">{t.approvedAssignmentCount ?? 0} aprobados</div>
                  <div className="text-xs text-surface-500">Esp.: {formatMoney(t.expectedRevenueCents, t.currency)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

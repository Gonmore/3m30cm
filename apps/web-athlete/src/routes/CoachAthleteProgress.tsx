import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useApi, handleApiResponse } from "../api/client";

type Progress = {
  athlete: { id: string; displayName?: string | null; user?: { email: string; firstName: string | null; lastName: string | null } };
  activeProgram: { id: string; name: string; phase: string; startDate: string; status: string } | null;
  progress: { completedSessions: number; skippedSessions: number; rescheduledSessions: number; totalSessions: number; upcomingSessions: Array<{ id: string; title: string; scheduledDate: string; status: string }> };
  recentLogs: Array<{ id: string; createdAt: string; notes: string | null; perceivedExertion: number | null; scheduledSession?: { title: string } }>;
};

export default function CoachAthleteProgress() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const api = useApi();
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!athleteId) return;
    (async () => {
      setIsLoading(true);
      try {
        const res = await api(`/coach/athletes/${athleteId}/progress`);
        setData(await handleApiResponse<Progress>(res));
      } catch (err) { setError(err instanceof Error ? err.message : "Error al cargar"); }
      finally { setIsLoading(false); }
    })();
  }, [api, athleteId]);

  if (isLoading) return <div className="py-10 text-center text-surface-400">Cargando…</div>;
  if (error) return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;
  if (!data) return null;

  const name = data.athlete.displayName || `${data.athlete.user?.firstName ?? ""} ${data.athlete.user?.lastName ?? ""}`.trim() || data.athlete.user?.email || "Atleta";
  const pct = data.progress.totalSessions ? Math.round((data.progress.completedSessions / data.progress.totalSessions) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-surface-100">{name}</h2>
        <p className="text-sm text-surface-400">{data.athlete.user?.email}</p>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-surface-900 p-3"><div className="text-2xl font-bold text-surface-100">{data.progress.completedSessions}</div><div className="text-xs text-surface-500">Completadas</div></div>
        <div className="rounded-lg bg-surface-900 p-3"><div className="text-2xl font-bold text-surface-100">{data.progress.totalSessions}</div><div className="text-xs text-surface-500">Total</div></div>
        <div className="rounded-lg bg-surface-900 p-3"><div className="text-2xl font-bold text-primary-400">{pct}%</div><div className="text-xs text-surface-500">Cumplimiento</div></div>
      </div>
      {data.activeProgram ? <div className="rounded-lg border border-surface-700 bg-surface-900 p-4"><h3 className="text-sm font-medium text-surface-300">Programa activo</h3><p className="font-medium text-surface-100">{data.activeProgram.name}</p><p className="text-sm text-surface-400">Fase: {data.activeProgram.phase}</p></div> : <p className="text-surface-400">Sin programa activo.</p>}
      <section>
        <h3 className="mb-2 text-sm font-medium text-surface-300">Próximas sesiones</h3>
        <div className="space-y-2">{data.progress.upcomingSessions.slice(0, 6).map((s) => <div key={s.id} className="rounded-lg bg-surface-900 p-3 text-sm"><div className="font-medium text-surface-100">{s.title}</div><div className="text-xs text-surface-500">{new Date(s.scheduledDate).toLocaleDateString("es-ES")} · {s.status}</div></div>)}</div>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-medium text-surface-300">Actividad reciente</h3>
        <div className="space-y-2">{data.recentLogs.slice(0, 8).map((l) => <div key={l.id} className="rounded-lg bg-surface-900 p-3 text-sm"><div className="font-medium text-surface-100">{l.scheduledSession?.title || "Sesión"}</div><div className="text-xs text-surface-500">{new Date(l.createdAt).toLocaleString("es-ES")}{l.perceivedExertion ? ` · RPE ${l.perceivedExertion}` : ""}</div>{l.notes ? <p className="mt-1 text-xs text-surface-400">{l.notes}</p> : null}</div>)}</div>
      </section>
    </div>
  );
}

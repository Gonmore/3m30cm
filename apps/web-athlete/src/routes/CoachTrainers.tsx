import { useEffect, useState } from "react";
import { useApi, handleApiResponse } from "../api/client";
import type { AdminUserSummary } from "../types/api";

export default function CoachTrainers() {
  const api = useApi();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = async (query = q) => {
    setIsLoading(true);
    try {
      const res = await api(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      const data = await handleApiResponse<{ users: AdminUserSummary[] }>(res);
      setUsers(data.users ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "Error al cargar"); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { void load(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setRole = async (userId: string, platformRole: "COACH" | "ATHLETE" | null) => {
    try {
      const res = await api(`/admin/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ platformRole }) });
      const data = await handleApiResponse<{ requiresReauth?: boolean }>(res);
      if (data.requiresReauth) setError("Rol actualizado; el usuario afectado debe volver a iniciar sesión para ver el cambio.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Error al actualizar rol"); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-surface-100">Entrenadores (SUPERADMIN)</h2>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar email o nombre" className="w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-surface-100" />
        <button onClick={() => void load()} className="rounded-md bg-surface-800 px-4 py-2 text-sm text-surface-100">Buscar</button>
      </div>
      {error ? <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div> : null}
      {isLoading ? <div className="text-surface-400">Cargando…</div> : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex flex-col gap-2 rounded-lg bg-surface-900 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-surface-100">{`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email}</p>
                <p className="text-xs text-surface-500">{u.email} · rol plataforma: {u.platformRole ?? "—"} · templates: {u._count?.coachTemplates ?? 0}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void setRole(u.id, "COACH")} className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white">Hacer coach</button>
                <button onClick={() => void setRole(u.id, "ATHLETE")} className="rounded-md bg-surface-800 px-3 py-1.5 text-xs text-surface-200">Quitar coach</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

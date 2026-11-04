import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useApi, handleApiResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

interface PersonalProgram {
  id: string;
  name: string;
  status: string;
  startDate: string;
  phase: string;
  sessions: Array<{ id: string; title: string; dayType: string; status: string; scheduledDate: string }>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const api = useApi();
  const [programs, setPrograms] = useState<PersonalProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        const response = await api("/athlete/programs");
        const data = await handleApiResponse<{ programs: PersonalProgram[] }>(response);
        setPrograms(data.programs ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load programs");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchPrograms();
  }, [api]);

  const activeProgram = programs.find((p) => p.status === "ACTIVE");
  const now = new Date();
  const upcomingSessions = activeProgram?.sessions.filter(
    (s) => s.status === "PLANNED" && new Date(s.scheduledDate) >= now
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-surface-100">
          ¡Hola, {user?.firstName ?? user?.email ?? "atleta"}!
        </h1>
        <p className="mt-1 text-sm text-surface-400">Bienvenido al panel de tu programa 3m30cm.</p>
      </div>

      {activeProgram ? (
        <div className="rounded-xl bg-surface-900 p-6">
          <h2 className="text-lg font-semibold text-surface-100">Programa Activo</h2>
          <p className="mt-1 text-2xl font-bold text-primary-400">{activeProgram.name}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-surface-500">Fase</span>
              <span className="ml-2 text-surface-300">{activeProgram.phase}</span>
            </div>
            <div>
              <span className="text-surface-500">Inicio</span>
              <span className="ml-2 text-surface-300">
                {new Date(activeProgram.startDate).toLocaleDateString("es-ES")}
              </span>
            </div>
          </div>

          {upcomingSessions && upcomingSessions.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-surface-300">Próximas sesiones</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {upcomingSessions.slice(0, 3).map((session) => (
                  <li key={session.id} className="rounded-md bg-surface-800/50 p-2">
                    <span className="font-medium text-surface-200">{session.title}</span>
                    <span className="ml-2 text-surface-500">
                      {new Date(session.scheduledDate).toLocaleDateString("es-ES")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-surface-900 p-6 text-center">
          <p className="text-surface-400">No tienes un programa activo.</p>
          <Link
            to="/programs"
            className="mt-3 inline-block rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Ver programas disponibles
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>
      )}

      {!activeProgram && !isLoading && (
        <div className="pt-4">
          <Link
            to="/programs"
            className="inline-block rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Explorar programas
          </Link>
        </div>
      )}
    </div>
  );
}

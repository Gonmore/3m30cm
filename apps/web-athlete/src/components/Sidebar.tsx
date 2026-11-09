import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useViewMode } from "../contexts/ViewModeContext";
import Avatar from "./Avatar";

const athleteItems = [
  { id: "hoy", icon: "◉", label: "Hoy", path: "/" },
  { id: "programa", icon: "▤", label: "Programa", path: "/programa" },
  { id: "tecnica", icon: "🎯", label: "Técnica", path: "/tecnica" },
  { id: "evolucion", icon: "↑", label: "Evolución", path: "/evolucion" },
  { id: "settings", icon: "⚙️", label: "Ajustes", path: "/settings" },
];

const coachItems = [
  { id: "coach-home", icon: "🏠", label: "Inicio", path: "/coach" },
  { id: "coach-programas", icon: "▤", label: "Programas", path: "/coach/programas" },
  { id: "coach-atletas", icon: "👥", label: "Atletas", path: "/coach/atletas" },
  { id: "coach-solicitudes", icon: "📩", label: "Solicitudes", path: "/coach/solicitudes" },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { viewMode, setViewMode, canCoachMode, isSuperAdmin } = useViewMode();
  const location = useLocation();
  const navigate = useNavigate();

  const displayName =
    user?.firstName || user?.lastName
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : user?.email?.split("@")[0] || "Usuario";

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  const items = viewMode === "coach" ? coachItems : athleteItems;

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />}
      <nav
        className={`fixed left-0 top-0 bottom-0 z-50 flex flex-col border-r border-surface-800 bg-surface-900 transform transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 280 }}
      >
        <div className="flex-1 overflow-y-auto py-6">
          <div className="mb-6 flex items-center gap-3 px-6">
            <Avatar user={user} sizeClass="h-11 w-11" textClass="text-lg" />
            <div>
              <p className="font-medium text-surface-100">{displayName}</p>
              <p className="text-xs text-surface-500">{user?.email}</p>
            </div>
          </div>

          {canCoachMode && (
            <div className="mb-4 px-4">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-800 p-1 text-xs">
                <button onClick={() => { setViewMode("athlete"); handleNavigate("/"); }} className={`rounded-md px-2 py-2 ${viewMode === "athlete" ? "bg-surface-700 text-surface-100" : "text-surface-400"}`}>Atleta</button>
                <button onClick={() => { setViewMode("coach"); handleNavigate("/coach"); }} className={`rounded-md px-2 py-2 ${viewMode === "coach" ? "bg-surface-700 text-surface-100" : "text-surface-400"}`}>Coach</button>
              </div>
            </div>
          )}

          <div className="mb-4 border-b border-surface-800" />
          <div className="space-y-1 px-3">
            {items.map((item) => {
              const isActive = item.path === "/" ? location.pathname === "/" : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
              return (
                <button key={item.id} onClick={() => handleNavigate(item.path)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-amber-900/20 text-amber-400" : "text-surface-300 hover:bg-surface-800 hover:text-surface-100"}`}>
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
            {viewMode === "coach" && isSuperAdmin && (
              <button onClick={() => handleNavigate("/coach/entrenadores")} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${location.pathname.startsWith("/coach/entrenadores") ? "bg-amber-900/20 text-amber-400" : "text-surface-300 hover:bg-surface-800 hover:text-surface-100"}`}>
                <span>🧑‍🏫</span>
                <span>Entrenadores</span>
              </button>
            )}
            {viewMode === "coach" && (
              <button onClick={() => handleNavigate("/settings")} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-surface-300 hover:bg-surface-800 hover:text-surface-100">
                <span>⚙️</span>
                <span>Ajustes</span>
              </button>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

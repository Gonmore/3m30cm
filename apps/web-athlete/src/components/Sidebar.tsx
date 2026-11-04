import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import Avatar from "./Avatar";

const menuItems: Array<{ id: string; icon: string; label: string; path: string }> = [
  { id: "hoy", icon: "◉", label: "Hoy", path: "/" },
  { id: "programa", icon: "▤", label: "Programa", path: "/programa" },
  { id: "tecnica", icon: "🎯", label: "Técnica", path: "/tecnica" },
  { id: "evolucion", icon: "↑", label: "Evolución", path: "/evolucion" },
  { id: "settings", icon: "⚙️", label: "Ajustes", path: "/settings" },
];

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isCoach = user?.platformRole === "COACH" || user?.platformRole === "SUPERADMIN";
  const displayName =
    user?.firstName || user?.lastName
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : user?.email?.split("@")[0] || "Usuario";

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <>
      {/* Overlay - only visible when open */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <nav
        className={`fixed left-0 top-0 bottom-0 z-50 flex flex-col border-r border-surface-800 bg-surface-900 transform transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: 280 }}
      >
        <div className="flex-1 overflow-y-auto py-6">
          {/* Profile header */}
          <div className="mb-6 flex items-center gap-3 px-6">
            <Avatar user={user} sizeClass="h-11 w-11" textClass="text-lg" />
            <div>
              <p className="font-medium text-surface-100">{displayName}</p>
              <p className="text-xs text-surface-500">{user?.email}</p>
            </div>
          </div>

          <div className="mb-4 border-b border-surface-800" />

          {/* Menu items */}
          <div className="space-y-1 px-3">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.path)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-amber-900/20 text-amber-400"
                      : "text-surface-300 hover:bg-surface-800 hover:text-surface-100"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                  {isActive && <div className="ml-auto w-1.5 rounded-r-full bg-amber-400" />}
                </button>
              );
            })}

            {isCoach && (
              <button
                onClick={() => handleNavigate("/coach")}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  location.pathname.startsWith("/coach")
                    ? "bg-amber-900/20 text-amber-400"
                    : "text-surface-300 hover:bg-surface-800 hover:text-surface-100"
                }`}
              >
                <span>🏋️</span>
                <span>Dashboard Coach</span>
              </button>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

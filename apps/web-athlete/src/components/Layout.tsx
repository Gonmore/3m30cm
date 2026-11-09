import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useViewMode } from "../contexts/ViewModeContext";
import { useSessionReminders } from "../lib/useSessionReminders";
import Avatar from "./Avatar";
import Footer from "./Footer";
import Sidebar from "./Sidebar";

const athleteMenuItems = [
  { id: "hoy", label: "Hoy", icon: "◉", path: "/" },
  { id: "programa", label: "Programa", icon: "▤", path: "/programa" },
  { id: "tecnica", label: "Técnica", icon: "🎯", path: "/tecnica" },
  { id: "evolucion", label: "Evolución", icon: "↑", path: "/evolucion" },
  { id: "settings", label: "Ajustes", icon: "⚙️", path: "/settings" },
];
const coachMenuItems = [
  { id: "coach-home", label: "Inicio", icon: "🏠", path: "/coach" },
  { id: "coach-programas", label: "Programas", icon: "▤", path: "/coach/programas" },
  { id: "coach-atletas", label: "Atletas", icon: "👥", path: "/coach/atletas" },
  { id: "coach-solicitudes", label: "Solicitudes", icon: "📩", path: "/coach/solicitudes" },
];

export default function Layout() {
  const { user, logout, updateAvatar } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { viewMode, setViewMode, canCoachMode, isSuperAdmin } = useViewMode();
  useSessionReminders();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  const menuItems = viewMode === "coach" ? [...coachMenuItems, ...(isSuperAdmin ? [{ id: "coach-entrenadores", label: "Entrenadores", icon: "🧑‍🏫", path: "/coach/entrenadores" }] : [])] : athleteMenuItems;
  const isActive = (path: string) => (path === "/" ? location.pathname === "/" : location.pathname === path || location.pathname.startsWith(`${path}/`));

  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("mousedown", onMouseDown); document.removeEventListener("keydown", onKeyDown); };
  }, [menuOpen]);

  useEffect(() => {
    if (!photoMessage) return;
    const t = window.setTimeout(() => setPhotoMessage(null), 4000);
    return () => window.clearTimeout(t);
  }, [photoMessage]);

  const handlePhotoSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      setUploading(true);
      setPhotoMessage(null);
      try {
        await updateAvatar(file);
        setPhotoMessage({ kind: "ok", text: "Foto actualizada" });
      } catch (err) {
        setPhotoMessage({ kind: "error", text: err instanceof Error ? err.message : "Error al subir la foto" });
      } finally {
        setUploading(false);
      }
    },
    [updateAvatar],
  );

  const displayName = user?.firstName || user?.lastName ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : user?.email?.split("@")[0] || "Usuario";
  const isDark = theme === "dark";

  return (
    <div className="flex min-h-screen flex-col bg-surface-950 text-surface-100">
      <header className="sticky top-0 z-30 border-b border-surface-800 bg-surface-900/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} aria-label="Abrir menú" className="rounded-md p-2 text-surface-400 hover:bg-surface-800 hover:text-surface-100"><span className="text-xl">☰</span></button>
            <nav className="hidden items-center gap-1 md:flex">
              {menuItems.map((item) => (
                <Link key={item.id} to={item.path} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${isActive(item.path) ? "bg-amber-500/15 text-amber-500" : "text-surface-400 hover:bg-surface-800 hover:text-surface-100"}`}>
                  <span className="text-base">{item.icon}</span>{item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            {canCoachMode && (
              <div className="hidden rounded-md bg-surface-800 p-0.5 text-xs sm:flex">
                <button onClick={() => setViewMode("athlete")} className={`rounded px-2 py-1 ${viewMode === "athlete" ? "bg-surface-700 text-surface-100" : "text-surface-400"}`}>Atleta</button>
                <button onClick={() => setViewMode("coach")} className={`rounded px-2 py-1 ${viewMode === "coach" ? "bg-surface-700 text-surface-100" : "text-surface-400"}`}>Coach</button>
              </div>
            )}
            <button onClick={toggleTheme} aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} title={isDark ? "Modo claro" : "Modo oscuro"} className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-surface-300 hover:bg-surface-800">{isDark ? "☀️" : "🌙"}</button>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label="Cambiar foto" title="Cambiar foto" className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-surface-300 hover:bg-surface-800 disabled:opacity-50">
              {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-500 border-t-transparent" /> : "📷"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handlePhotoSelected(e)} />
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} className="flex items-center gap-2 rounded-full bg-surface-800 py-1 pl-1 pr-1 hover:bg-surface-700 md:pr-3">
                <Avatar user={user} sizeClass="h-8 w-8" />
                <span className="hidden max-w-[10rem] truncate text-sm font-medium text-surface-200 md:inline-block">{displayName}</span>
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-lg border border-surface-700 bg-surface-900 shadow-xl">
                  <div className="flex items-center gap-3 border-b border-surface-800 px-3 py-3">
                    <Avatar user={user} sizeClass="h-10 w-10" textClass="text-base" />
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-surface-100">{displayName}</p><p className="truncate text-xs text-surface-500">{user?.email}</p></div>
                  </div>
                  <div className="py-1">
                    {canCoachMode && <button role="menuitem" onClick={() => { setViewMode(viewMode === "coach" ? "athlete" : "coach"); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:bg-surface-800 hover:text-surface-100"><span>{viewMode === "coach" ? "🏃" : "🧑‍🏫"}</span><span>{viewMode === "coach" ? "Modo atleta" : "Modo coach"}</span></button>}
                    <button role="menuitem" disabled={uploading} onClick={() => { setMenuOpen(false); fileInputRef.current?.click(); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:bg-surface-800 hover:text-surface-100 disabled:opacity-50"><span>📷</span><span>Cambiar foto</span></button>
                    <button role="menuitem" onClick={toggleTheme} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-surface-300 hover:bg-surface-800 hover:text-surface-100"><span className="flex items-center gap-2"><span>{isDark ? "🌙" : "☀️"}</span><span>Apariencia</span></span><span className="text-xs text-surface-500">{isDark ? "Oscuro" : "Claro"}</span></button>
                    <div className="my-1 border-t border-surface-800" />
                    <button role="menuitem" onClick={() => { setMenuOpen(false); logout(); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10"><span>🚪</span><span>Cerrar sesión</span></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {photoMessage && <div role="status" className={`border-t px-4 py-2 text-center text-sm ${photoMessage.kind === "ok" ? "border-green-500/30 bg-green-500/10 text-green-600" : "border-red-500/30 bg-red-500/10 text-red-500"}`}>{photoMessage.text}</div>}
      </header>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="pb-4 md:pb-0"><div className="mx-auto max-w-5xl px-4 py-4"><Outlet /></div></main>
      <Footer />
    </div>
  );
}

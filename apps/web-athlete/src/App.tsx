import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./contexts/AuthContext";
import { useViewMode } from "./contexts/ViewModeContext";
import Layout from "./components/Layout";
import Login from "./routes/Login";
import HoyScreen from "./routes/Hoy";
import ProgramaScreen from "./routes/Programa";
import ExerciseSession from "./routes/ExerciseSession";
import EvolucionScreen from "./routes/Evolucion";
import TecnicaScreen from "./routes/Tecnica";
import SettingsScreen from "./routes/Settings";
import OnboardingFlow from "./routes/Onboarding";
import CoachDashboard from "./routes/CoachDashboard";
import CoachPrograms from "./routes/CoachPrograms";
import CoachProgramEditor from "./routes/CoachProgramEditor";
import CoachAthletes from "./routes/CoachAthletes";
import CoachAthleteProgress from "./routes/CoachAthleteProgress";
import CoachRequests from "./routes/CoachRequests";
import CoachTrainers from "./routes/CoachTrainers";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireCoach({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { setViewMode } = useViewMode();
  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.platformRole !== "COACH" && user.platformRole !== "SUPERADMIN") return <Navigate to="/" replace />;
  useEffect(() => { setViewMode("coach"); }, [setViewMode]);
  return <>{children}</>;
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.platformRole !== "SUPERADMIN") return <Navigate to="/coach" replace />;
  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  const prevPathRef = useRef(pathname);
  useEffect(() => { if (prevPathRef.current !== pathname) { window.scrollTo(0, 0); prevPathRef.current = pathname; } }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<HoyScreen />} />
          <Route path="programa" element={<ProgramaScreen />} />
          <Route path="programa/sessions/:sessionId" element={<ExerciseSession />} />
          <Route path="evolucion" element={<EvolucionScreen />} />
          <Route path="tecnica" element={<TecnicaScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="onboarding" element={<OnboardingFlow />} />
        </Route>
        <Route path="coach" element={<RequireCoach><Layout /></RequireCoach>}>
          <Route index element={<CoachDashboard />} />
          <Route path="programas" element={<CoachPrograms />} />
          <Route path="programas/nuevo" element={<CoachProgramEditor />} />
          <Route path="programas/:id" element={<CoachProgramEditor />} />
          <Route path="atletas" element={<CoachAthletes />} />
          <Route path="atletas/:athleteId" element={<CoachAthleteProgress />} />
          <Route path="solicitudes" element={<CoachRequests />} />
          <Route path="entrenadores" element={<RequireSuperAdmin><CoachTrainers /></RequireSuperAdmin>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

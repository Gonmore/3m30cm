import { useEffect, useState } from "react";

import { useApi, handleApiResponse } from "../api/client";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { type ProgressResponse, type ScheduledSession, type SessionsListResponse } from "../types/api";

export default function EvolucionScreen() {
  const api = useApi();
  const { theme } = useTheme();
  const { user } = useAuth();

  const [data, setData] = useState<ProgressResponse | null>(null);
  const [meData, setMeData] = useState<{ activeProgram?: { name?: string } | null } | null>(null);
  const [sessions, setSessions] = useState<ScheduledSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const bgImage = theme === "dark" ? "/Hombre.jpeg?v=3" : "/Mujer.jpeg?v=3";
  const overlayClass = theme === "dark" ? "bg-black/40" : "bg-white/30";
  const textColor = theme === "dark" ? "text-white" : "text-surface-100";
  const textSecondaryColor = theme === "dark" ? "text-surface-400" : "text-surface-500";
  const cardBg = theme === "dark" ? "bg-surface-900" : "bg-surface-900";
  const cardBorder = theme === "dark" ? "border-surface-700" : "border-surface-300";

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [progressRes, meRes, sessionsRes] = await Promise.all([
          api("/athlete/progress"),
          api("/athlete/me"),
          api("/athlete/sessions"),
        ]);
        setData(await handleApiResponse<ProgressResponse>(progressRes));
        setMeData(await handleApiResponse(meRes));
        const sessionsData = await handleApiResponse<SessionsListResponse>(sessionsRes);
        setSessions(sessionsData.sessions ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [api]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className={textSecondaryColor}>Cargando…</div>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>;
  }

  if (!data) return null;

  const summary = data.summary;
  const jumpBest = data.personalBests?.jumpHeightCm;
  const avgLoad = data.personalBests?.avgLoadKg;
  const peakVelocity = data.personalBests?.peakVelocityMps;

  const getCompletionColor = (rate: number) => {
    if (rate >= 75) return "text-green-400";
    if (rate >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  // Weekly completed time
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  startOfWeek.setDate(startOfWeek.getDate() + diff);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const weeklyCompletedSessions = sessions.filter((s) => {
    const d = new Date(s.scheduledDate);
    return s.status === "COMPLETED" && d >= startOfWeek && d < endOfWeek;
  });

  const estimateSessionMinutes = (count: number) =>
    count > 0 ? 5 + 5 + count * 10 + (count - 1) * 3 : 0;

  const weeklyEstimatedMinutes = weeklyCompletedSessions.reduce((acc, s) => {
    const count = s.sessionExercises?.length ?? s.exerciseCount ?? 0;
    return acc + estimateSessionMinutes(count);
  }, 0);

  const programName = meData?.activeProgram?.name ?? "Programa";
  const totalRate = summary.totalSessions > 0 ? (summary.completedSessions / summary.totalSessions) * 100 : 0;

  const handleShare = async () => {
    setIsSharing(true);
    const loadImage = (src: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const isDark = theme === "dark";
      ctx.fillStyle = isDark ? "#0a0a0b" : "#ffffff";
      ctx.fillRect(0, 0, 1080, 1920);

      const loadImageSafe = async (src: string | null | undefined) => {
        if (!src) return null;
        return loadImage(src);
      };

      const avatarImg = await loadImageSafe(user?.avatarUrl ?? null);
      const logoSrc = isDark ? "/Logo_Blanco.png" : "/Logo_Azul.png";
      const logoImg = await loadImage(logoSrc);

      // Avatar top center
      const avatarSize = 180;
      const avatarX = 540 - avatarSize / 2;
      const avatarY = 120;
      ctx.save();
      ctx.beginPath();
      ctx.arc(540, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (avatarImg) {
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
      } else {
        ctx.fillStyle = isDark ? "#1f2937" : "#e5e7eb";
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
        ctx.fillStyle = isDark ? "#ffffff" : "#111827";
        ctx.font = "bold 72px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((user?.firstName?.[0] ?? "A").toUpperCase(), 540, avatarY + avatarSize / 2);
      }
      ctx.restore();
      ctx.strokeStyle = isDark ? "#ffffff" : "#111827";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(540, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.stroke();

      // Program name (wrapped)
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = isDark ? "#ffffff" : "#111827";
      ctx.font = "bold 56px sans-serif";
      const wrapText = (text: string, maxWidth: number) => {
        const words = text.split(" ");
        const lines: string[] = [];
        let line = "";
        for (const w of words) {
          const test = line ? line + " " + w : w;
          if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = w;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);
        return lines;
      };
      const lines = wrapText(programName, 900);
      let y = 360;
      for (const ln of lines) {
        ctx.fillText(ln, 540, y);
        y += 70;
      }

      // Time trained
      ctx.font = "48px sans-serif";
      ctx.fillText(`Tiempo entrenado esta semana: ${Math.round(weeklyEstimatedMinutes)} min`, 540, y + 60);

      // Progress bar
      const barX = 140;
      const barY = y + 140;
      const barW = 800;
      const barH = 40;
      ctx.fillStyle = isDark ? "#1f2937" : "#e5e7eb";
      ctx.fillRect(barX, barY, barW, barH);
      const rate = summary.totalSessions > 0 ? summary.completedSessions / summary.totalSessions : 0;
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(barX, barY, barW * Math.min(rate, 1), barH);
      ctx.strokeStyle = isDark ? "#374151" : "#d1d5db";
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, barY, barW, barH);

      // Completed check
      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 96px sans-serif";
      ctx.fillText("✔ Completado", 540, barY + 140);

      // Footer logo
      if (logoImg) {
        const logoH = 80;
        const logoW = (logoImg.width / logoImg.height) * logoH;
        ctx.drawImage(logoImg, 540 - logoW / 2, 1920 - 160, logoW, logoH);
      }
      ctx.fillStyle = isDark ? "#9ca3af" : "#6b7280";
      ctx.font = "24px sans-serif";
      ctx.fillText("3m30cm", 540, 1920 - 60);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsSharing(false);
          return;
        }
        const file = new File([blob], "progreso.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Mi progreso" });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "progreso.png";
          a.click();
          URL.revokeObjectURL(url);
        }
        setIsSharing(false);
      });
    } catch {
      setIsSharing(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      <div className="fixed inset-0 z-0">
        <img src={bgImage} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <div className={`fixed inset-0 ${overlayClass}`} />
      </div>
      <div className="relative z-10 flex flex-col px-4 py-4">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <h2 className={`text-2xl font-bold ${textColor}`}>Evolución</h2>
            <p className={`mt-1 text-sm ${textSecondaryColor}`}>Tu progreso a lo largo del tiempo</p>
          </div>

          {jumpBest !== null && jumpBest !== undefined && (
            <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5`}>
              <h3 className={`mb-3 text-sm font-medium ${textSecondaryColor}`}>Rendimiento de salto</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={`text-xs ${textSecondaryColor}`}>Salto máximo</p>
                  <p className="text-2xl font-bold text-primary-400">{jumpBest} cm</p>
                </div>
                {peakVelocity !== null && peakVelocity !== undefined && (
                  <div>
                    <p className={`text-xs ${textSecondaryColor}`}>Velocidad pico</p>
                    <p className={`text-2xl font-bold ${textColor}`}>{peakVelocity} m/s</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {avgLoad !== null && avgLoad !== undefined && (
            <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5`}>
              <h3 className={`mb-3 text-sm font-medium ${textSecondaryColor}`}>Carga de entrenamiento</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={`text-xs ${textSecondaryColor}`}>Carga promedio</p>
                  <p className={`text-2xl font-bold ${textColor}`}>{avgLoad} kg</p>
                </div>
              </div>
            </div>
          )}

          <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5`}>
            <h3 className={`mb-3 text-sm font-medium ${textSecondaryColor}`}>Sesiones totales</h3>
            <div className="mb-2 flex items-center justify-between">
              <span className={`text-3xl font-bold ${getCompletionColor(totalRate)}`}>
                {Math.round(totalRate)}%
              </span>
              <span className={`text-xs ${textSecondaryColor}`}>
                {summary.completedSessions}/{summary.totalSessions} sesiones
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-800">
              <div
                className="h-2 rounded-full bg-primary-500 transition-all"
                style={{ width: `${Math.min(totalRate, 100)}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="font-medium text-red-400">{summary.skippedSessions}</span>
                <p className={textSecondaryColor}>Saltadas</p>
              </div>
              <div>
                <span className="font-medium text-yellow-400">{summary.rescheduledSessions}</span>
                <p className={textSecondaryColor}>Reprogramadas</p>
              </div>
              <div>
                <span className="font-medium text-green-400">{summary.currentStreak}</span>
                <p className={textSecondaryColor}>Racha (días)</p>
              </div>
            </div>
          </div>

          {data.weeklyGoal && (
            <div className={`rounded-xl border ${cardBorder} ${cardBg} p-4`}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className={`text-sm font-medium ${textSecondaryColor}`}>Meta semanal</h3>
                <button
                  onClick={handleShare}
                  disabled={isSharing}
                  className="rounded-md border border-green-500/50 bg-green-500/10 px-3 py-1 text-xs font-bold text-green-400 hover:bg-green-500/20 disabled:opacity-50"
                >
                  {isSharing ? "Generando…" : "Compartir"}
                </button>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <span className={`text-sm ${textSecondaryColor}`}>
                  {data.weeklyGoal.completedSessions}/{data.weeklyGoal.targetSessions} sesiones
                </span>
                <span className={`text-xs ${textSecondaryColor}`}>
                  Faltan {data.weeklyGoal.remainingSessions}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-800">
                <div
                  className="h-2 rounded-full bg-primary-500 transition-all"
                  style={{ width: `${Math.min(data.weeklyGoal.completionRate, 100)}%` }}
                />
              </div>
            </div>
          )}

          {data.feedback && data.feedback.status && (
            <div className="rounded-xl border border-blue-900/30 bg-blue-900/10 p-4">
              <h3 className="mb-2 text-sm font-medium text-blue-400">Feedback</h3>
              <p className={`font-medium ${textColor}`}>{data.feedback.title}</p>
              <p className={`mt-1 text-sm ${textSecondaryColor}`}>{data.feedback.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {data.feedback.actions?.map((action, i) => (
                  <span key={i} className={`text-xs ${textSecondaryColor}`}>• {action}</span>
                ))}
              </div>
            </div>
          )}

          {data.recentLogs && data.recentLogs.length > 0 && (
            <div>
              <h3 className={`mb-3 text-sm font-medium ${textSecondaryColor}`}>Registros recientes</h3>
              <div className="space-y-2">
                {data.recentLogs.map((log) => (
                  <div key={log.id} className={`rounded-lg ${cardBg} p-3`}>
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium ${textColor}`}>
                        {new Date(log.createdAt).toLocaleDateString("es-ES")}
                      </p>
                      {log.perceivedExertion !== null && (
                        <span className={`text-xs ${textSecondaryColor}`}>
                          Esfuerzo: {log.perceivedExertion}/10
                        </span>
                      )}
                    </div>
                    {log.notes && <p className={`mt-1 text-xs ${textSecondaryColor}`}>{log.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

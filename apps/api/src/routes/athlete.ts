import { DayType, Prisma, ProgramStatus, SeasonPhase, SeriesProtocol, SessionStatus } from "@prisma/client";
import { type Response, Router } from "express";
import multer from "multer";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { atLocalMidday, buildTrainingDaysJson, buildWeekdaysJson, generatePersonalProgram, parseWeekdaysJson } from "../lib/athlete-programs.js";
import { buildSeriesProtocolGuidance } from "../lib/exercise-series.js";
import { uploadAvatarMedia } from "../lib/minio.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

const athleteProfileInclude = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      oauthProvider: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  coachAssignments: {
    include: {
      coach: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.AthleteProfileInclude;

const sessionDetailInclude = {
  personalProgram: {
    select: {
      id: true,
      name: true,
      phase: true,
      status: true,
      startDate: true,
      template: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  },
  sessionExercises: {
    orderBy: { orderIndex: "asc" },
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          category: true,
          description: true,
          equipment: true,
          requiresLoad: true,
          perLeg: true,
          isBlock: true,
          defaultSeriesProtocol: true,
          instructions: {
            orderBy: { locale: "asc" },
          },
          mediaAssets: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
          asBlock: {
            include: {
              items: {
                orderBy: { order: "asc" },
                include: {
                  exercise: {
                    select: {
                      id: true,
                      name: true,
                      category: true,
                      instructions: { orderBy: { locale: "asc" } },
                      mediaAssets: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ScheduledSessionInclude;

const logMetricsSchema = z.object({
  completedExercises: z.number().int().min(0).optional(),
  totalExercises: z.number().int().min(0).optional(),
  readinessScore: z.number().int().min(1).max(10).optional(),
  sorenessScore: z.number().int().min(1).max(10).optional(),
  painScore: z.number().int().min(0).max(10).optional(),
  moodScore: z.number().int().min(1).max(10).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  jumpHeightCm: z.number().min(0).optional(),
  bodyWeightKg: z.number().min(0).optional(),
  avgLoadKg: z.number().min(0).optional(),
  peakVelocityMps: z.number().min(0).optional(),
  sessionDurationMin: z.number().int().min(0).optional(),
  jumpTestAttempt1Cm: z.number().min(0).optional(),
  jumpTestAttempt2Cm: z.number().min(0).optional(),
  jumpTestAttempt3Cm: z.number().min(0).optional(),
  jumpTestAverageCm: z.number().min(0).optional(),
  jumpTestBestCm: z.number().min(0).optional(),
});

const sessionLogSchema = z.object({
  notes: z.string().trim().optional(),
  perceivedExertion: z.number().int().min(1).max(10).optional(),
  status: z.enum(
    [SessionStatus.PLANNED, SessionStatus.COMPLETED, SessionStatus.SKIPPED, SessionStatus.RESCHEDULED] satisfies [SessionStatus, ...SessionStatus[]],
  ).optional(),
  completedExerciseIds: z.array(z.string().min(1)).optional(),
  metrics: logMetricsSchema.optional(),
});

const deviceTokenSchema = z.object({
  token: z.string().min(8),
  platform: z.string().min(2),
});

const athletePlanningSchema = z.object({
  displayName: z.string().trim().optional(),
  sport: z.string().trim().optional(),
  trainsSport: z.boolean().default(false),
  sportTrainingDays: z.array(z.number().int().min(0).max(6)).optional(),
  seasonPhase: z.nativeEnum(SeasonPhase).default(SeasonPhase.OFF_SEASON),
  availableWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
  notes: z.string().trim().optional(),
});

const athleteProgramSetupSchema = athletePlanningSchema.extend({
  templateCode: z.string().min(1).default("JUMP-MANUAL-14D"),
  startDate: z.string().date(),
  phase: z.nativeEnum(SeasonPhase).optional(),
  includePreparationPhase: z.boolean().default(true),
});

type AthleteLogMetrics = z.infer<typeof logMetricsSchema>;

function parseLogMetrics(metrics: Prisma.JsonValue | null): AthleteLogMetrics | null {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return null;
  }

  const parsed = logMetricsSchema.safeParse(metrics);
  return parsed.success ? parsed.data : null;
}

function roundMetric(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function averageMetric(values: number[]) {
  if (!values.length) {
    return null;
  }

  return roundMetric(values.reduce((total, entry) => total + entry, 0) / values.length);
}

function getWeekBounds(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const normalizedDiff = day === 0 ? -6 : 1 - day;

  start.setDate(start.getDate() + normalizedDiff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function extractWeekdays(availability: Prisma.JsonValue | null) {
  return parseWeekdaysJson(availability);
}

function buildAthleteSetupRecommendation(input: {
  sport: string | null;
  trainsSport: boolean;
  sportTrainingDays: Prisma.JsonValue | null;
  weeklyAvailability: Prisma.JsonValue | null;
  hasActiveProgram: boolean;
}) {
  const sportTrainingDays = parseWeekdaysJson(input.sportTrainingDays);
  const jumpTrainingDays = parseWeekdaysJson(input.weeklyAvailability);
  const sportLabel = input.sport?.trim() || "otro deporte";

  return {
    needsProgramSetup: !input.hasActiveProgram,
    recommendedPreparationPhase: true,
    recommendedPreparationWeeks: 3,
    sportTrainingDays,
    jumpTrainingDays,
    summary: input.trainsSport && sportTrainingDays.length
      ? `Como tambien entrenas ${sportLabel}, conviene arrancar con 3 semanas de adecuacion y dejar los dias que coincidan con pista/cancha a medio volumen si llegas cargado.`
      : "Antes del bloque principal conviene una fase breve de adecuacion con isometricos, aterrizajes y bajo impacto para entrar al programa sin saltar etapas.",
    focusAreas: [
      "Tendon rotuliano y soleo con isometricos.",
      "Control de aterrizaje y rigidez de tobillo.",
      "Core basico y tolerancia de tejidos antes del bloque fuerte.",
    ],
  };
}

function normalizeLogMetrics(metrics: AthleteLogMetrics | undefined) {
  if (!metrics) {
    return undefined;
  }

  const attempts = [metrics.jumpTestAttempt1Cm, metrics.jumpTestAttempt2Cm, metrics.jumpTestAttempt3Cm].filter(
    (entry): entry is number => typeof entry === "number" && entry > 0,
  );

  const jumpTestBestCm = metrics.jumpTestBestCm ?? (attempts.length ? Math.max(...attempts) : undefined);
  const jumpTestAverageCm = metrics.jumpTestAverageCm ?? (attempts.length ? roundMetric(attempts.reduce((total, entry) => total + entry, 0) / attempts.length) : undefined);
  const jumpHeightCm = metrics.jumpHeightCm ?? jumpTestBestCm;

  return {
    ...metrics,
    ...(jumpHeightCm !== undefined ? { jumpHeightCm } : {}),
    ...(jumpTestBestCm !== undefined ? { jumpTestBestCm } : {}),
    ...(jumpTestAverageCm !== undefined ? { jumpTestAverageCm } : {}),
  } satisfies AthleteLogMetrics;
}

function buildAthleteFeedback(input: {
  completionRate: number;
  readinessScore: number | null;
  painScore: number | null;
  sorenessScore: number | null;
  upcomingSessions: number;
}) {
  const { completionRate, readinessScore, painScore, sorenessScore, upcomingSessions } = input;

  if ((painScore ?? 0) >= 7 || (readinessScore ?? 10) <= 4) {
    return {
      status: "protect",
      title: "Baja la carga hoy",
      summary: "Tu disposicion reciente y el dolor reportado indican que conviene proteger la recuperacion.",
      actions: [
        "Reduce intensidad y volumen en la siguiente sesion.",
        "Prioriza movilidad, descanso y feedback al coach.",
      ],
    };
  }

  if (completionRate < 70 && upcomingSessions > 0) {
    return {
      status: "focus",
      title: "Recupera consistencia",
      summary: "Tu cumplimiento esta por debajo del objetivo semanal y el foco debe ser volver a la regularidad.",
      actions: [
        "Protege la proxima sesion como prioridad del dia.",
        "Mantente en rangos tecnicos y evita carga extra fuera del plan.",
      ],
    };
  }

  if ((readinessScore ?? 0) >= 8 && (painScore ?? 10) <= 3 && (sorenessScore ?? 10) <= 4 && completionRate >= 85) {
    return {
      status: "push",
      title: "Ventana favorable",
      summary: "Tus marcadores recientes permiten exigir calidad en potencia y ejecucion si la sesion lo pide.",
      actions: [
        "Busca intentos explosivos limpios y registra tu mejor salto.",
        "Sostén la tecnica antes de aumentar volumen.",
      ],
    };
  }

  return {
    status: "steady",
    title: "Mantener ritmo",
    summary: "La señal general es estable. Conviene sostener el plan y seguir midiendo sin sobrecorregir.",
    actions: [
      "Cumple el bloque previsto y registra sensaciones con precision.",
      "Observa cambios en readiness y dolor durante la semana.",
    ],
  };
}

function isGoalSessionDay(dayType: DayType) {
  return dayType !== DayType.REST;
}

function getAdaptivePhaseTarget(phase: SeasonPhase) {
  switch (phase) {
    case SeasonPhase.PRESEASON:
      return 4;
    case SeasonPhase.IN_SEASON:
      return 3;
    case SeasonPhase.COMPETITION:
      return 2;
    case SeasonPhase.OFF_SEASON:
    default:
      return 3;
  }
}

function buildWindowComparison(logs: Array<{ createdAt: Date; metrics: AthleteLogMetrics | null }>, now: Date, days: number) {
  const currentWindowStart = new Date(now);
  currentWindowStart.setDate(currentWindowStart.getDate() - days);

  const previousWindowStart = new Date(currentWindowStart);
  previousWindowStart.setDate(previousWindowStart.getDate() - days);

  const currentWindowLogs = logs.filter((log) => log.createdAt >= currentWindowStart && log.createdAt <= now);
  const previousWindowLogs = logs.filter((log) => log.createdAt >= previousWindowStart && log.createdAt < currentWindowStart);

  const currentJumpValues = currentWindowLogs.flatMap((log) => (typeof log.metrics?.jumpHeightCm === "number" ? [log.metrics.jumpHeightCm] : []));
  const previousJumpValues = previousWindowLogs.flatMap((log) => (typeof log.metrics?.jumpHeightCm === "number" ? [log.metrics.jumpHeightCm] : []));
  const currentReadinessValues = currentWindowLogs.flatMap((log) => (typeof log.metrics?.readinessScore === "number" ? [log.metrics.readinessScore] : []));
  const previousReadinessValues = previousWindowLogs.flatMap((log) => (typeof log.metrics?.readinessScore === "number" ? [log.metrics.readinessScore] : []));
  const currentLoadValues = currentWindowLogs.flatMap((log) => (typeof log.metrics?.avgLoadKg === "number" ? [log.metrics.avgLoadKg] : []));
  const previousLoadValues = previousWindowLogs.flatMap((log) => (typeof log.metrics?.avgLoadKg === "number" ? [log.metrics.avgLoadKg] : []));

  const currentJumpAvg = averageMetric(currentJumpValues);
  const previousJumpAvg = averageMetric(previousJumpValues);
  const currentReadinessAvg = averageMetric(currentReadinessValues);
  const previousReadinessAvg = averageMetric(previousReadinessValues);
  const currentLoadAvg = averageMetric(currentLoadValues);
  const previousLoadAvg = averageMetric(previousLoadValues);

  return {
    days,
    currentLogs: currentWindowLogs.length,
    previousLogs: previousWindowLogs.length,
    jumpHeightAvg: currentJumpAvg,
    jumpHeightDelta: currentJumpAvg !== null && previousJumpAvg !== null ? roundMetric(currentJumpAvg - previousJumpAvg) : null,
    readinessAvg: currentReadinessAvg,
    readinessDelta: currentReadinessAvg !== null && previousReadinessAvg !== null ? roundMetric(currentReadinessAvg - previousReadinessAvg) : null,
    avgLoadKg: currentLoadAvg,
    avgLoadDelta: currentLoadAvg !== null && previousLoadAvg !== null ? roundMetric(currentLoadAvg - previousLoadAvg) : null,
  };
}

function buildSessionGuidance(input: {
  session: {
    title: string;
    dayType: DayType;
    status: SessionStatus;
    scheduledDate: Date;
    personalProgram: {
      phase: SeasonPhase;
    } | null;
  };
  readinessScore: number | null;
  painScore: number | null;
  sorenessScore: number | null;
}) {
  const { session, readinessScore, painScore, sorenessScore } = input;

  const baseGuidanceByDayType: Record<DayType, { title: string; emphasis: string; cues: string[] }> = {
    EXPLOSIVE: {
      title: "Calidad de salto y velocidad",
      emphasis: "Busca pocas repeticiones muy limpias, con recuperacion completa entre esfuerzos explosivos.",
      cues: ["Prioriza altura y tecnica antes que volumen.", "Corta la serie si pierdes rigidez o velocidad."],
    },
    STRENGTH: {
      title: "Fuerza con control",
      emphasis: "El objetivo es producir fuerza sin degradar posiciones ni ritmo tecnico.",
      cues: ["Manten una primera repeticion limpia como referencia.", "Usa la carga planificada, no la persigas por ego."],
    },
    RECOVERY: {
      title: "Recuperacion activa",
      emphasis: "Hoy la sesion deberia devolverte frescura, no cansarte mas.",
      cues: ["Respira, moviliza y termina mejor de lo que empiezas.", "Evita convertir la recuperacion en trabajo extra."],
    },
    REST: {
      title: "Descanso estrategico",
      emphasis: "La mejor decision hoy es absorber carga y llegar fresco al siguiente bloque.",
      cues: ["Prioriza sueno, hidratacion y movilidad suave.", "No reemplaces el descanso por volumen improvisado."],
    },
    UPPER_CORE: {
      title: "Tronco y estabilidad",
      emphasis: "El foco es estabilidad, transferencia y control postural para proteger la expresion de salto.",
      cues: ["Siente tension de tronco en cada repeticion.", "Manten calidad antes que fatiga acumulada."],
    },
    OTHER: {
      title: "Bloque tecnico",
      emphasis: "Mantente dentro del objetivo de la sesion y registra cualquier sensacion atipica.",
      cues: ["Sigue el orden de ejercicios planificado.", "Evita sumar trabajo fuera del plan."],
    },
  };

  const baseline = baseGuidanceByDayType[session.dayType] ?? baseGuidanceByDayType.OTHER;
  let intensity: "protect" | "steady" | "push" = "steady";
  let adjustment = "Sigue el plan tal como esta prescrito y usa el calentamiento para confirmar sensaciones.";

  if ((painScore ?? 0) >= 7 || (readinessScore ?? 10) <= 4) {
    intensity = "protect";
    adjustment = "Reduce 10-20% la exigencia del bloque y avisa al coach si el dolor o la pesadez no bajan durante la entrada en calor.";
  } else if (session.dayType === DayType.EXPLOSIVE && (readinessScore ?? 0) >= 8 && (sorenessScore ?? 10) <= 4) {
    intensity = "push";
    adjustment = "Si las primeras repeticiones salen rapidas, usa esta ventana para buscar tu mejor intento del dia con tecnica limpia.";
  } else if (session.dayType === DayType.RECOVERY || session.dayType === DayType.REST) {
    adjustment = "Mantente por debajo del umbral de fatiga y termina la sesion sintiendote mas suelto que al empezar.";
  }

  return {
    phase: session.personalProgram?.phase ?? SeasonPhase.OFF_SEASON,
    intensity,
    title: baseline.title,
    emphasis: baseline.emphasis,
    adjustment,
    cues: baseline.cues,
  };
}

function buildExerciseGuidance(input: {
  sessionDayType: DayType;
  sessionStatus: SessionStatus;
  exercise: {
    name: string;
    category: string;
    description: string | null;
    equipment: string | null;
    requiresLoad: boolean;
    perLeg: boolean;
    defaultSeriesProtocol: SeriesProtocol;
  };
  seriesProtocol: SeriesProtocol;
  sets: number | null;
  repsText: string | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  loadText: string | null;
}) {
  const { sessionDayType, exercise, seriesProtocol, sets, repsText, durationSeconds, restSeconds, loadText } = input;

  let intent = "precision";
  let focus = "Ejecuta cada repeticion con control tecnico y registra sensaciones utiles al final del bloque.";

  if (sessionDayType === DayType.EXPLOSIVE) {
    intent = "speed";
    focus = "La prioridad es salir rapido del suelo o del apoyo, manteniendo rigidez y transferencia de fuerza.";
  } else if (sessionDayType === DayType.STRENGTH) {
    intent = "force";
    focus = "Construye fuerza sin perder linea tecnica ni velocidad innecesariamente pronto dentro de la serie.";
  } else if (sessionDayType === DayType.RECOVERY || sessionDayType === DayType.REST) {
    intent = "recovery";
    focus = "Usa el ejercicio para recuperar rango, coordinar y salir del bloque con menos tension, no con mas fatiga.";
  }

  const protocolGuidance = buildSeriesProtocolGuidance({
    seriesProtocol,
    loadText,
  });

  if (protocolGuidance) {
    return protocolGuidance;
  }

  const cues = [
    exercise.requiresLoad || loadText
      ? `Carga: ${loadText ?? "usa la carga prevista y evita subirla si cae la calidad."}`
      : `Volumen: ${sets ? `${sets} sets` : "prioriza calidad"}${repsText ? ` · ${repsText}` : ""}`,
    durationSeconds
      ? `Tiempo de trabajo: mantente tecnico durante ${durationSeconds}s sin romper postura.`
      : `Descanso: ${restSeconds ? `${restSeconds}s entre series` : "usa pausas suficientes para repetir calidad."}`,
    exercise.equipment
      ? `Material: ${exercise.equipment}. Dejalo listo antes de empezar para no enfriar el bloque.`
      : `Senal tecnica: ${exercise.description ?? "manten una ejecucion limpia y repetible."}`,
  ];

  return {
    intent,
    focus,
    cues,
  };
}

function pickBestLogByMetric(
  logs: Array<{
    id: string;
    createdAt: Date;
    perceivedExertion: number | null;
    notes: string | null;
    metrics: AthleteLogMetrics | null;
    scheduledSession: {
      id: string;
      title: string;
      dayType: DayType;
      status: SessionStatus;
      scheduledDate: Date;
      personalProgram: {
        id: string;
        name: string;
        phase: SeasonPhase;
        startDate: Date;
      } | null;
    };
  }>,
  getter: (metrics: AthleteLogMetrics) => number | undefined,
) {
  const candidates = logs.filter((log) => typeof getter(log.metrics ?? {}) === "number");

  if (!candidates.length) {
    return null;
  }

  const bestLog = candidates.reduce((best, current) => {
    const currentValue = getter(current.metrics ?? {}) ?? Number.NEGATIVE_INFINITY;
    const bestValue = getter(best.metrics ?? {}) ?? Number.NEGATIVE_INFINITY;
    return currentValue > bestValue ? current : best;
  });

  return bestLog;
}

function serializeSessionDetail<T extends Awaited<ReturnType<typeof getOwnedSession>>>(session: NonNullable<T>) {
  return {
    ...serializeSessionLogs(session),
    sessionExercises: session.sessionExercises.map((sessionExercise) => ({
      ...sessionExercise,
      guidance: buildExerciseGuidance({
        sessionDayType: session.dayType,
        sessionStatus: session.status,
        exercise: {
          name: sessionExercise.exercise.name,
          category: sessionExercise.exercise.category,
          description: sessionExercise.exercise.description ?? null,
          equipment: sessionExercise.exercise.equipment ?? null,
          requiresLoad: sessionExercise.exercise.requiresLoad,
          perLeg: sessionExercise.exercise.perLeg,
          defaultSeriesProtocol: sessionExercise.exercise.defaultSeriesProtocol,
        },
        seriesProtocol: sessionExercise.seriesProtocol,
        sets: sessionExercise.sets,
        repsText: sessionExercise.repsText,
        durationSeconds: sessionExercise.durationSeconds,
        restSeconds: sessionExercise.restSeconds,
        loadText: sessionExercise.loadText,
      }),
    })),
  };
}

function computeCurrentStreak(sessions: Array<{ scheduledDate: Date; status: SessionStatus }>) {
  const pastSessions = sessions
    .filter((session) => session.scheduledDate <= new Date())
    .sort((left, right) => right.scheduledDate.getTime() - left.scheduledDate.getTime());

  let streak = 0;

  for (const session of pastSessions) {
    if (session.status === SessionStatus.COMPLETED) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

function serializeSessionLogs<T extends { logs: Array<{ metrics: Prisma.JsonValue | null }> }>(session: T) {
  return {
    ...session,
    logs: session.logs.map((log) => ({
      ...log,
      metrics: parseLogMetrics(log.metrics),
    })),
  };
}

async function getCurrentAthleteProfile(userId: string) {
  return prisma.athleteProfile.findUnique({
    where: { userId },
    include: athleteProfileInclude,
  });
}

async function getOwnedSession(sessionId: string, athleteProfileId: string) {
  return prisma.scheduledSession.findFirst({
    where: {
      id: sessionId,
      personalProgram: {
        athleteProfileId,
      },
    },
    include: {
      ...sessionDetailInclude,
      logs: {
        where: { athleteProfileId },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

async function getCurrentAthleteProfileId(userId: string) {
  return prisma.athleteProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
}

async function getCurrentAthleteProfileSummary(userId: string) {
  return prisma.athleteProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      seasonPhase: true,
      weeklyAvailability: true,
    },
  });
}

function getUserId(req: AuthenticatedRequest) {
  return req.auth?.sub;
}

export const athleteRouter = Router();

athleteRouter.use(requireAuth);

athleteRouter.get("/me", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const athleteProfile = await getCurrentAthleteProfile(userId);

    if (!athleteProfile) {
      res.status(403).json({ message: "Current user is not an athlete" });
      return;
    }

    const activeProgram = await prisma.personalProgram.findFirst({
      where: { athleteProfileId: athleteProfile.id },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      include: {
        template: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        sessions: {
          where: {
            scheduledDate: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
          orderBy: { scheduledDate: "asc" },
          take: 3,
          select: {
            id: true,
            title: true,
            dayType: true,
            status: true,
            scheduledDate: true,
          },
        },
      },
    });

    res.json({
      athleteProfile,
      activeProgram,
      planningRecommendation: buildAthleteSetupRecommendation({
        sport: athleteProfile.sport,
        trainsSport: athleteProfile.trainsSport,
        sportTrainingDays: athleteProfile.sportTrainingDays,
        weeklyAvailability: athleteProfile.weeklyAvailability,
        hasActiveProgram: Boolean(activeProgram),
      }),
    });
  } catch (error) {
    console.error("Failed to fetch athlete profile", error);
    res.status(500).json({ message: "Failed to fetch athlete profile" });
  }
});

athleteRouter.put("/onboarding", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const payload = athletePlanningSchema.parse(req.body);
    const athleteProfile = await prisma.athleteProfile.update({
      where: { userId },
      data: {
        ...(payload.displayName !== undefined ? { displayName: payload.displayName } : {}),
        sport: payload.sport ?? null,
        trainsSport: payload.trainsSport,
        seasonPhase: payload.seasonPhase,
        weeklyAvailability: buildWeekdaysJson(payload.availableWeekdays),
        sportTrainingDays: buildTrainingDaysJson(payload.trainsSport ? payload.sportTrainingDays : undefined),
        notes: payload.notes ?? null,
        onboardingCompletedAt: new Date(),
      },
      include: athleteProfileInclude,
    });

    res.json({
      athleteProfile,
      planningRecommendation: buildAthleteSetupRecommendation({
        sport: athleteProfile.sport,
        trainsSport: athleteProfile.trainsSport,
        sportTrainingDays: athleteProfile.sportTrainingDays,
        weeklyAvailability: athleteProfile.weeklyAvailability,
        hasActiveProgram: false,
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid onboarding payload", issues: error.issues });
      return;
    }

    console.error("Failed to save athlete onboarding", error);
    res.status(500).json({ message: "Failed to save athlete onboarding" });
  }
});

athleteRouter.post("/programs/generate", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const payload = athleteProgramSetupSchema.parse(req.body);
    const startDate = atLocalMidday(payload.startDate);

    const currentAthleteProfile = await prisma.athleteProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!currentAthleteProfile) {
      res.status(403).json({ message: "Current user is not an athlete" });
      return;
    }

    const template = await prisma.programTemplate.findUnique({
      where: { code: payload.templateCode },
      include: {
        days: {
          orderBy: { dayNumber: "asc" },
          include: {
            prescriptions: {
              orderBy: { orderIndex: "asc" },
              include: {
                exercise: {
                  select: {
                    id: true,
                    defaultSeriesProtocol: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!template || template.days.length === 0) {
      res.status(404).json({ message: "Program template not found or empty" });
      return;
    }

    const phase = payload.phase ?? payload.seasonPhase ?? currentAthleteProfile.seasonPhase;

    const program = await prisma.$transaction(async (transaction) => {
      const updatedAthleteProfile = await transaction.athleteProfile.update({
        where: { id: currentAthleteProfile.id },
        data: {
          displayName: payload.displayName ?? currentAthleteProfile.displayName,
          sport: payload.sport ?? null,
          trainsSport: payload.trainsSport,
          seasonPhase: payload.seasonPhase,
          weeklyAvailability: buildWeekdaysJson(payload.availableWeekdays),
          sportTrainingDays: buildTrainingDaysJson(payload.trainsSport ? payload.sportTrainingDays : undefined),
          notes: payload.notes ?? null,
          onboardingCompletedAt: new Date(),
        },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return generatePersonalProgram({
        transaction,
        athleteProfile: updatedAthleteProfile,
        template,
        startDate,
        phase,
        notes: payload.notes,
        includePreparationPhase: payload.includePreparationPhase,
      });
    });

    res.status(201).json({
      program,
      planningRecommendation: buildAthleteSetupRecommendation({
        sport: payload.sport ?? currentAthleteProfile.sport,
        trainsSport: payload.trainsSport,
        sportTrainingDays: payload.trainsSport ? { trainingDays: payload.sportTrainingDays ?? [] } : null,
        weeklyAvailability: { availableWeekdays: payload.availableWeekdays ?? [] },
        hasActiveProgram: true,
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid athlete program payload", issues: error.issues });
      return;
    }

    if (error instanceof Error && error.message === "Invalid start date") {
      res.status(400).json({ message: error.message });
      return;
    }

    console.error("Failed to generate athlete program", error);
    res.status(500).json({ message: "Failed to generate athlete program" });
  }
});

athleteRouter.get("/programs", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const athleteProfile = await prisma.athleteProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!athleteProfile) {
      res.status(403).json({ message: "Current user is not an athlete" });
      return;
    }

    const programs = await prisma.personalProgram.findMany({
      where: {
        athleteProfileId: athleteProfile.id,
        status: { not: ProgramStatus.ARCHIVED },
      },
      orderBy: { startDate: "desc" },
      include: {
        template: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        sessions: {
          orderBy: { scheduledDate: "asc" },
          take: 5,
          select: {
            id: true,
            title: true,
            dayType: true,
            status: true,
            scheduledDate: true,
          },
        },
      },
    });

    res.json({ programs });
  } catch (error) {
    console.error("Failed to fetch athlete programs", error);
    res.status(500).json({ message: "Failed to fetch athlete programs" });
  }
});

athleteRouter.get("/progress", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const athleteProfile = await getCurrentAthleteProfileSummary(userId);

    if (!athleteProfile) {
      res.status(403).json({ message: "Current user is not an athlete" });
      return;
    }

    const now = new Date();
    const { start: weekStart, end: weekEnd } = getWeekBounds(now);
    const [activeProgram, sessions, insightLogs] = await Promise.all([
      prisma.personalProgram.findFirst({
        where: { athleteProfileId: athleteProfile.id },
        orderBy: [{ status: "asc" }, { startDate: "desc" }],
        select: {
          id: true,
          name: true,
          phase: true,
          startDate: true,
          status: true,
        },
      }),
      prisma.scheduledSession.findMany({
        where: {
          personalProgram: {
            athleteProfileId: athleteProfile.id,
          },
        },
        orderBy: { scheduledDate: "asc" },
        select: {
          id: true,
          title: true,
          dayType: true,
          status: true,
          scheduledDate: true,
          personalProgram: {
            select: {
              id: true,
              name: true,
              phase: true,
              startDate: true,
            },
          },
        },
      }),
      prisma.sessionLog.findMany({
        where: { athleteProfileId: athleteProfile.id },
        orderBy: { createdAt: "desc" },
        take: 48,
        include: {
          scheduledSession: {
            select: {
              id: true,
              title: true,
              dayType: true,
              status: true,
              scheduledDate: true,
              personalProgram: {
                select: {
                  id: true,
                  name: true,
                  phase: true,
                  startDate: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const completedSessions = sessions.filter((session) => session.status === SessionStatus.COMPLETED).length;
    const skippedSessions = sessions.filter((session) => session.status === SessionStatus.SKIPPED).length;
    const rescheduledSessions = sessions.filter((session) => session.status === SessionStatus.RESCHEDULED).length;
    const dueSessions = sessions.filter((session) => session.scheduledDate <= now);
    const upcomingSessions = sessions.filter(
      (session) => session.scheduledDate >= now && (session.status === SessionStatus.PLANNED || session.status === SessionStatus.RESCHEDULED),
    );

    const serializedLogs = insightLogs.map((log) => ({
      ...log,
      metrics: normalizeLogMetrics(parseLogMetrics(log.metrics) ?? undefined) ?? null,
    }));

    const recentLogs = serializedLogs.slice(0, 8);
    const trendLogs = [...serializedLogs.slice(0, 12)].reverse();

    const jumpHeightSeries = trendLogs
      .filter((log) => typeof log.metrics?.jumpHeightCm === "number")
      .map((log) => ({ date: log.createdAt, value: log.metrics?.jumpHeightCm ?? 0 }));
    const readinessSeries = trendLogs
      .filter((log) => typeof log.metrics?.readinessScore === "number")
      .map((log) => ({ date: log.createdAt, value: log.metrics?.readinessScore ?? 0 }));
    const loadSeries = trendLogs
      .filter((log) => typeof log.metrics?.avgLoadKg === "number")
      .map((log) => ({ date: log.createdAt, value: log.metrics?.avgLoadKg ?? 0 }));

    const rpeValues = recentLogs.flatMap((log) => (typeof log.perceivedExertion === "number" ? [log.perceivedExertion] : []));
    const readinessValues = recentLogs.flatMap((log) => (typeof log.metrics?.readinessScore === "number" ? [log.metrics.readinessScore] : []));
    const sleepValues = recentLogs.flatMap((log) => (typeof log.metrics?.sleepHours === "number" ? [log.metrics.sleepHours] : []));
    const painValues = recentLogs.flatMap((log) => (typeof log.metrics?.painScore === "number" ? [log.metrics.painScore] : []));
    const sorenessValues = recentLogs.flatMap((log) => (typeof log.metrics?.sorenessScore === "number" ? [log.metrics.sorenessScore] : []));

    const weeklySessions = sessions.filter((session) => session.scheduledDate >= weekStart && session.scheduledDate <= weekEnd);
    const currentPhase = activeProgram?.phase ?? athleteProfile.seasonPhase;
    const availableWeekdays = extractWeekdays(athleteProfile.weeklyAvailability);
    const phaseSuggestedSessions = availableWeekdays.length
      ? Math.min(getAdaptivePhaseTarget(currentPhase), availableWeekdays.length)
      : getAdaptivePhaseTarget(currentPhase);
    const scheduledTrainingSessions = weeklySessions.filter((session) => isGoalSessionDay(session.dayType)).length;
    const weeklyTarget = scheduledTrainingSessions || phaseSuggestedSessions;
    const completedThisWeek = weeklySessions.filter((session) => session.status === SessionStatus.COMPLETED).length;
    const remainingThisWeek = Math.max(weeklyTarget - completedThisWeek, 0);
    const weekCompliance = weeklyTarget ? roundMetric((completedThisWeek / weeklyTarget) * 100) : 0;
    const jumpTestsThisWeek = recentLogs.filter(
      (log) => log.createdAt >= weekStart && log.createdAt <= weekEnd && typeof log.metrics?.jumpHeightCm === "number",
    ).length;

    const currentProgramId = activeProgram?.id ?? null;
    const currentProgramJumpValues = serializedLogs.flatMap((log) =>
      typeof log.metrics?.jumpHeightCm === "number" && log.scheduledSession.personalProgram?.id === currentProgramId
        ? [log.metrics.jumpHeightCm]
        : [],
    );
    const previousProgramJumpValues = serializedLogs.flatMap((log) =>
      typeof log.metrics?.jumpHeightCm === "number" && currentProgramId && log.scheduledSession.personalProgram?.id !== currentProgramId
        ? [log.metrics.jumpHeightCm]
        : [],
    );
    const currentPhaseJumpValues = serializedLogs.flatMap((log) =>
      typeof log.metrics?.jumpHeightCm === "number" && log.scheduledSession.personalProgram?.phase === currentPhase
        ? [log.metrics.jumpHeightCm]
        : [],
    );
    const otherPhaseJumpValues = serializedLogs.flatMap((log) =>
      typeof log.metrics?.jumpHeightCm === "number" && log.scheduledSession.personalProgram?.phase !== currentPhase
        ? [log.metrics.jumpHeightCm]
        : [],
    );

    const currentProgramBestJumpCm = currentProgramJumpValues.length ? Math.max(...currentProgramJumpValues) : null;
    const previousProgramBestJumpCm = previousProgramJumpValues.length ? Math.max(...previousProgramJumpValues) : null;
    const currentPhaseBestJumpCm = currentPhaseJumpValues.length ? Math.max(...currentPhaseJumpValues) : null;
    const referencePhaseBestJumpCm = otherPhaseJumpValues.length ? Math.max(...otherPhaseJumpValues) : null;

    const recentAverages = {
      perceivedExertion: averageMetric(rpeValues),
      readinessScore: averageMetric(readinessValues),
      sleepHours: averageMetric(sleepValues),
      painScore: averageMetric(painValues),
    };

    const feedback = buildAthleteFeedback({
      completionRate: weekCompliance,
      readinessScore: recentAverages.readinessScore,
      painScore: recentAverages.painScore,
      sorenessScore: averageMetric(sorenessValues),
      upcomingSessions: upcomingSessions.length,
    });

    const cycleMap = new Map<string, {
      id: string;
      name: string;
      phase: SeasonPhase;
      startDate: Date;
      totalSessions: number;
      completedSessions: number;
      jumpValues: number[];
      readinessValues: number[];
      loadValues: number[];
    }>();

    for (const session of sessions) {
      const programId = session.personalProgram?.id;
      if (!programId) {
        continue;
      }

      const existing = cycleMap.get(programId) ?? {
        id: programId,
        name: session.personalProgram?.name ?? session.title,
        phase: session.personalProgram?.phase ?? currentPhase,
        startDate: session.personalProgram?.startDate ?? session.scheduledDate,
        totalSessions: 0,
        completedSessions: 0,
        jumpValues: [],
        readinessValues: [],
        loadValues: [],
      };

      existing.totalSessions += 1;
      if (session.status === SessionStatus.COMPLETED) {
        existing.completedSessions += 1;
      }

      cycleMap.set(programId, existing);
    }

    for (const log of serializedLogs) {
      const programId = log.scheduledSession.personalProgram?.id;
      if (!programId) {
        continue;
      }

      const existing = cycleMap.get(programId);
      if (!existing) {
        continue;
      }

      if (typeof log.metrics?.jumpHeightCm === "number") {
        existing.jumpValues.push(log.metrics.jumpHeightCm);
      }

      if (typeof log.metrics?.readinessScore === "number") {
        existing.readinessValues.push(log.metrics.readinessScore);
      }

      if (typeof log.metrics?.avgLoadKg === "number") {
        existing.loadValues.push(log.metrics.avgLoadKg);
      }
    }

    const cycleEvolution = Array.from(cycleMap.values())
      .sort((left, right) => left.startDate.getTime() - right.startDate.getTime())
      .map((cycle, index, array) => {
        const previousCycle = index > 0 ? array[index - 1] : null;
        const bestJumpCm = cycle.jumpValues.length ? Math.max(...cycle.jumpValues) : null;
        const previousBestJumpCm = previousCycle && previousCycle.jumpValues.length ? Math.max(...previousCycle.jumpValues) : null;

        return {
          id: cycle.id,
          name: cycle.name,
          phase: cycle.phase,
          startDate: cycle.startDate,
          totalSessions: cycle.totalSessions,
          completedSessions: cycle.completedSessions,
          completionRate: cycle.totalSessions ? roundMetric((cycle.completedSessions / cycle.totalSessions) * 100) : 0,
          bestJumpCm,
          averageReadiness: averageMetric(cycle.readinessValues),
          averageLoadKg: averageMetric(cycle.loadValues),
          deltaVsPreviousCycleCm: bestJumpCm !== null && previousBestJumpCm !== null ? roundMetric(bestJumpCm - previousBestJumpCm) : null,
        };
      })
      .reverse();

    res.json({
      summary: {
        totalSessions: sessions.length,
        completedSessions,
        skippedSessions,
        rescheduledSessions,
        upcomingSessions: upcomingSessions.length,
        completionRate: dueSessions.length ? roundMetric((completedSessions / dueSessions.length) * 100) : 0,
        currentStreak: computeCurrentStreak(sessions),
      },
      nextSession: upcomingSessions[0] ?? null,
      recentAverages,
      weeklyGoal: {
        targetSessions: weeklyTarget,
        phaseSuggestedSessions,
        phase: currentPhase,
        source: scheduledTrainingSessions ? "program" : "phase",
        scheduledSessions: weeklySessions.length,
        completedSessions: completedThisWeek,
        remainingSessions: remainingThisWeek,
        completionRate: weekCompliance,
        jumpTestsLogged: jumpTestsThisWeek,
      },
      feedback,
      personalBests: {
        jumpHeightCm: jumpHeightSeries.length ? Math.max(...jumpHeightSeries.map((entry) => entry.value)) : null,
        avgLoadKg: loadSeries.length ? Math.max(...loadSeries.map((entry) => entry.value)) : null,
        peakVelocityMps: serializedLogs
          .flatMap((log) => (typeof log.metrics?.peakVelocityMps === "number" ? [log.metrics.peakVelocityMps] : []))
          .reduce<number | null>((best, current) => (best === null || current > best ? current : best), null),
      },
      trends: {
        jumpHeightCm: jumpHeightSeries.reverse(),
        readinessScore: readinessSeries.reverse(),
        avgLoadKg: loadSeries.reverse(),
      },
      windowComparisons: {
        last7Days: buildWindowComparison(serializedLogs, now, 7),
        last28Days: buildWindowComparison(serializedLogs, now, 28),
      },
      blockComparison: {
        currentProgramId,
        currentProgramName: activeProgram?.name ?? null,
        currentProgramBestJumpCm,
        previousProgramBestJumpCm,
        deltaVsPreviousProgramCm:
          currentProgramBestJumpCm !== null && previousProgramBestJumpCm !== null
            ? roundMetric(currentProgramBestJumpCm - previousProgramBestJumpCm)
            : null,
      },
      phaseComparison: {
        currentPhase,
        currentPhaseBestJumpCm,
        referencePhaseBestJumpCm,
        deltaVsReferencePhaseCm:
          currentPhaseBestJumpCm !== null && referencePhaseBestJumpCm !== null
            ? roundMetric(currentPhaseBestJumpCm - referencePhaseBestJumpCm)
            : null,
      },
      cycleEvolution,
      historicalBestSessions: {
        jumpHeight: pickBestLogByMetric(serializedLogs, (metrics) => metrics.jumpHeightCm),
        readiness: pickBestLogByMetric(serializedLogs, (metrics) => metrics.readinessScore),
        avgLoad: pickBestLogByMetric(serializedLogs, (metrics) => metrics.avgLoadKg),
      },
      recentLogs,
    });
  } catch (error) {
    console.error("Failed to fetch athlete progress", error);
    res.status(500).json({ message: "Failed to fetch athlete progress" });
  }
});

athleteRouter.get("/sessions", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const athleteProfile = await getCurrentAthleteProfileId(userId);

    if (!athleteProfile) {
      res.status(403).json({ message: "Current user is not an athlete" });
      return;
    }

    const sessions = await prisma.scheduledSession.findMany({
      where: {
        personalProgram: {
          athleteProfileId: athleteProfile.id,
          status: { not: ProgramStatus.ARCHIVED },
        },
      },
      orderBy: { scheduledDate: "asc" },
      include: {
        personalProgram: {
          select: {
            id: true,
            name: true,
            phase: true,
            status: true,
          },
        },
        sessionExercises: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            orderIndex: true,
            completedAt: true,
          },
        },
        logs: {
          where: { athleteProfileId: athleteProfile.id },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            perceivedExertion: true,
            createdAt: true,
            metrics: true,
          },
        },
      },
    });

    res.json({
      sessions: sessions.map((session) => serializeSessionLogs(session)),
    });
  } catch (error) {
    console.error("Failed to fetch athlete sessions", error);
    res.status(500).json({ message: "Failed to fetch athlete sessions" });
  }
});

athleteRouter.get("/sessions/:sessionId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!sessionId) {
      res.status(400).json({ message: "Session id is required" });
      return;
    }

    const athleteProfile = await getCurrentAthleteProfileId(userId);

    if (!athleteProfile) {
      res.status(403).json({ message: "Current user is not an athlete" });
      return;
    }

    const session = await getOwnedSession(sessionId, athleteProfile.id);

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    const recentAthleteLogs = await prisma.sessionLog.findMany({
      where: { athleteProfileId: athleteProfile.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        createdAt: true,
        metrics: true,
      },
    });

    const normalizedRecentLogs = recentAthleteLogs.map((log) => normalizeLogMetrics(parseLogMetrics(log.metrics) ?? undefined));
    const readinessValues = normalizedRecentLogs.flatMap((log) => (typeof log?.readinessScore === "number" ? [log.readinessScore] : []));
    const painValues = normalizedRecentLogs.flatMap((log) => (typeof log?.painScore === "number" ? [log.painScore] : []));
    const sorenessValues = normalizedRecentLogs.flatMap((log) => (typeof log?.sorenessScore === "number" ? [log.sorenessScore] : []));

    res.json({
      session: serializeSessionDetail(session),
      guidance: buildSessionGuidance({
        session: {
          title: session.title,
          dayType: session.dayType,
          status: session.status,
          scheduledDate: session.scheduledDate,
          personalProgram: {
            phase: session.personalProgram.phase,
          },
        },
        readinessScore: averageMetric(readinessValues),
        painScore: averageMetric(painValues),
        sorenessScore: averageMetric(sorenessValues),
      }),
    });
  } catch (error) {
    console.error("Failed to fetch session detail", error);
    res.status(500).json({ message: "Failed to fetch session detail" });
  }
});

athleteRouter.post("/sessions/:sessionId/logs", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!sessionId) {
      res.status(400).json({ message: "Session id is required" });
      return;
    }

    const payload = sessionLogSchema.parse(req.body);
    const athleteProfile = await getCurrentAthleteProfileId(userId);

    if (!athleteProfile) {
      res.status(403).json({ message: "Current user is not an athlete" });
      return;
    }

    const session = await prisma.scheduledSession.findFirst({
      where: {
        id: sessionId,
        personalProgram: {
          athleteProfileId: athleteProfile.id,
        },
      },
      include: {
        sessionExercises: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
          },
        },
      },
    });

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    const completedExerciseIds = new Set(payload.completedExerciseIds ?? []);
    const now = new Date();
    const fallbackStatus = completedExerciseIds.size > 0 && completedExerciseIds.size === session.sessionExercises.length
      ? SessionStatus.COMPLETED
      : session.status;
    const nextStatus = payload.status ?? fallbackStatus;

    await prisma.$transaction(async (transaction) => {
      for (const exercise of session.sessionExercises) {
        await transaction.sessionExercise.update({
          where: { id: exercise.id },
          data: {
            completedAt: nextStatus === SessionStatus.SKIPPED
              ? null
              : completedExerciseIds.has(exercise.id)
                ? now
                : null,
          },
        });
      }

      await transaction.sessionLog.create({
        data: {
          scheduledSessionId: session.id,
          athleteProfileId: athleteProfile.id,
          notes: payload.notes ?? null,
          perceivedExertion: payload.perceivedExertion ?? null,
          metrics: payload.metrics ? (normalizeLogMetrics(payload.metrics) as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });

      await transaction.scheduledSession.update({
        where: { id: session.id },
        data: {
          status: nextStatus,
        },
      });
    });

    const refreshedSession = await getOwnedSession(session.id, athleteProfile.id);
    res.status(201).json({ session: refreshedSession ? serializeSessionDetail(refreshedSession) : null });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid session log payload", issues: error.issues });
      return;
    }

    console.error("Failed to save session log", error);
    res.status(500).json({ message: "Failed to save session log" });
  }
});

athleteRouter.post("/device-tokens", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const payload = deviceTokenSchema.parse(req.body);
    const athleteProfile = await prisma.athleteProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!athleteProfile) {
      res.status(403).json({ message: "Current user is not an athlete" });
      return;
    }

    const deviceToken = await prisma.deviceToken.upsert({
      where: { token: payload.token },
      update: {
        platform: payload.platform,
        userId,
      },
      create: {
        token: payload.token,
        platform: payload.platform,
        userId,
      },
    });

    res.status(201).json({ deviceToken });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Invalid device token payload", issues: error.issues });
      return;
    }

    console.error("Failed to register device token", error);
    res.status(500).json({ message: "Failed to register device token" });
  }
});

// ── Avatar upload ──────────────────────────────────────────────────────────
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

athleteRouter.patch("/me/avatar", avatarUpload.single("avatar"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    const { url } = await uploadAvatarMedia({
      userId,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      data: req.file.buffer,
    });

    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    });

    res.json({ avatarUrl: url });
  } catch (error) {
    console.error("Failed to upload avatar", error);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});
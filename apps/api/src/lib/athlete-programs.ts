import { DayType, Prisma, ProgramStatus, SeasonPhase, SeriesProtocol, SessionStatus } from "@prisma/client";

import { resolveSeriesProtocol } from "./exercise-series.js";

export interface AthleteGenerationProfile {
  id: string;
  displayName: string | null;
  sport: string | null;
  trainsSport: boolean;
  seasonPhase: SeasonPhase;
  weeklyAvailability: Prisma.JsonValue | null;
  sportTrainingDays: Prisma.JsonValue | null;
  exerciseExclusions: Prisma.JsonValue | null;
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface ProgramTemplateWithDays {
  id: string;
  name: string;
  code: string;
  days: Array<{
    dayNumber: number;
    title: string;
    dayType: DayType;
    notes: string | null;
    prescriptions: Array<{
      exerciseId: string;
      orderIndex: number;
      seriesProtocol: SeriesProtocol;
      sets: number | null;
      repsText: string | null;
      durationSeconds: number | null;
      restSeconds: number | null;
      loadText: string | null;
      notes: string | null;
      exercise: {
        id: string;
        defaultSeriesProtocol: SeriesProtocol;
      };
    }>;
  }>;
}

interface PreparationExerciseBlueprint {
  exerciseName: string;
  sets?: number;
  repsText?: string;
  durationSeconds?: number;
  restSeconds?: number;
  loadText?: string;
  notes?: string;
}

interface PreparationSessionBlueprint {
  title: string;
  dayType: DayType;
  notes: string;
  exercises: PreparationExerciseBlueprint[];
}

interface GeneratePersonalProgramInput {
  transaction: Prisma.TransactionClient;
  athleteProfile: AthleteGenerationProfile;
  template: ProgramTemplateWithDays;
  startDate: Date;
  phase: SeasonPhase;
  notes?: string | undefined;
  includePreparationPhase?: boolean;
}

const preparationPhaseBlueprints: PreparationSessionBlueprint[] = [
  {
    title: "Adecuacion 1 · Base isometrica",
    dayType: DayType.STRENGTH,
    notes: "Semana de entrada: rigidez de tendon, control de rodilla y tolerancia basica antes del bloque principal.",
    exercises: [
      { exerciseName: "Spanish Squat Isometric", sets: 4, durationSeconds: 35, restSeconds: 45, notes: "Mantener tibia estable y tronco alto." },
      { exerciseName: "Split Squat Isometric", sets: 3, durationSeconds: 25, restSeconds: 40, notes: "Sostener por lado con cadera cuadrada." },
      { exerciseName: "Soleus Wall Sit Hold", sets: 4, durationSeconds: 30, restSeconds: 30, notes: "Enfocar el trabajo en soleo y tobillo." },
      { exerciseName: "Glute Bridge Isometric", sets: 3, durationSeconds: 30, restSeconds: 30 },
      { exerciseName: "Ankle Mobility Flow", sets: 1, durationSeconds: 480, notes: "Rutina suave para dorsiflexion y pies." },
    ],
  },
  {
    title: "Adecuacion 2 · Core y movilidad",
    dayType: DayType.UPPER_CORE,
    notes: "Bloque de bajo impacto para consolidar estabilidad lumbopelvica y recuperacion.",
    exercises: [
      { exerciseName: "Dead Bug Breathing", sets: 3, repsText: "6 por lado", restSeconds: 30 },
      { exerciseName: "Side Plank Hold", sets: 3, durationSeconds: 25, restSeconds: 30, notes: "Sostener por lado sin perder linea corporal." },
      { exerciseName: "Ankle Mobility Flow", sets: 1, durationSeconds: 420 },
      { exerciseName: "Stretch and Recover", sets: 1, durationSeconds: 600 },
      { exerciseName: "PWS", sets: 1, notes: "Recovery post sesion y chequeo de hidratacion." },
    ],
  },
  {
    title: "Adecuacion 3 · Aterrizaje y rebote bajo",
    dayType: DayType.OTHER,
    notes: "Introduce contactos ligeros y mecanica de aterrizaje sin volumen alto.",
    exercises: [
      { exerciseName: "Snap Down Landing", sets: 4, repsText: "5 aterrizajes", restSeconds: 35, notes: "Caer silencioso y con rodilla alineada." },
      { exerciseName: "Low Pogo Series", sets: 4, repsText: "12 contactos", restSeconds: 40, notes: "Rebote bajo, corto y reactivo." },
      { exerciseName: "Split Squat Isometric", sets: 3, durationSeconds: 20, restSeconds: 35 },
      { exerciseName: "Core Series", sets: 2, repsText: "1 vuelta controlada", restSeconds: 45 },
      { exerciseName: "Stretch and Recover", sets: 1, durationSeconds: 480 },
    ],
  },
  {
    title: "Adecuacion 4 · Descanso activo",
    dayType: DayType.REST,
    notes: "Descarga ligera para absorber el trabajo y llegar fresco al siguiente microciclo.",
    exercises: [
      { exerciseName: "Off Day Exercises Only", sets: 1, notes: "Mantener solo actividad ligera y pasos suaves." },
      { exerciseName: "Ankle Mobility Flow", sets: 1, durationSeconds: 360 },
      { exerciseName: "PWS", sets: 1 },
    ],
  },
  {
    title: "Adecuacion 5 · Base isometrica unilateral",
    dayType: DayType.STRENGTH,
    notes: "Segundo apoyo de fuerza basica para mejorar tolerancia unilateral sin impacto alto.",
    exercises: [
      { exerciseName: "Spanish Squat Isometric", sets: 3, durationSeconds: 40, restSeconds: 45 },
      { exerciseName: "Soleus Wall Sit Hold", sets: 4, durationSeconds: 35, restSeconds: 30 },
      { exerciseName: "Glute Bridge Isometric", sets: 3, durationSeconds: 35, restSeconds: 30 },
      { exerciseName: "Dead Bug Breathing", sets: 3, repsText: "5 por lado", restSeconds: 30 },
      { exerciseName: "Side Plank Hold", sets: 2, durationSeconds: 30, restSeconds: 30 },
    ],
  },
  {
    title: "Adecuacion 6 · Coordinar sin fatigar",
    dayType: DayType.RECOVERY,
    notes: "Mantener elasticidad y coordinacion, pero terminando fresco.",
    exercises: [
      { exerciseName: "Snap Down Landing", sets: 3, repsText: "4 aterrizajes", restSeconds: 35 },
      { exerciseName: "Low Pogo Series", sets: 3, repsText: "10 contactos", restSeconds: 35 },
      { exerciseName: "Ankle Mobility Flow", sets: 1, durationSeconds: 360 },
      { exerciseName: "Stretch and Recover", sets: 1, durationSeconds: 600 },
      { exerciseName: "PWS", sets: 1 },
    ],
  },
  {
    title: "Adecuacion 7 · Off",
    dayType: DayType.REST,
    notes: "Dia libre para que el cuerpo absorba la carga de la semana de preparacion.",
    exercises: [
      { exerciseName: "Off Day Exercises Only", sets: 1 },
      { exerciseName: "Stretch and Recover", sets: 1, durationSeconds: 480 },
    ],
  },
];

export function parseExcludedExerciseIds(value: Prisma.JsonValue | null): Set<string> {
  if (!value || !Array.isArray(value)) {
    return new Set();
  }
  return new Set(value.filter((entry): entry is string => typeof entry === "string"));
}

export function parseWeekdaysJson(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [] as number[];
  }

  const maybeWeekdays = (value as { availableWeekdays?: unknown; trainingDays?: unknown }).availableWeekdays
    ?? (value as { trainingDays?: unknown }).trainingDays;

  if (!Array.isArray(maybeWeekdays)) {
    return [] as number[];
  }

  return maybeWeekdays.filter((entry): entry is number => typeof entry === "number" && entry >= 0 && entry <= 6);
}

export function buildWeekdaysJson(weekdays?: number[]) {
  if (!weekdays?.length) {
    return Prisma.JsonNull;
  }

  return {
    availableWeekdays: Array.from(new Set(weekdays)).sort((left, right) => left - right),
  } satisfies Prisma.InputJsonValue;
}

export function buildTrainingDaysJson(weekdays?: number[]) {
  if (!weekdays?.length) {
    return Prisma.JsonNull;
  }

  return {
    trainingDays: Array.from(new Set(weekdays)).sort((left, right) => left - right),
  } satisfies Prisma.InputJsonValue;
}

export function atLocalMidday(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid start date");
  }

  return date;
}

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function isTrainingDay(dayType: DayType) {
  return dayType !== DayType.REST && dayType !== DayType.RECOVERY;
}

export function findNextScheduledDate(startDate: Date, dayType: DayType, availableWeekdays: number[]) {
  if (!availableWeekdays.length || !isTrainingDay(dayType)) {
    return startDate;
  }

  let candidate = new Date(startDate);
  let safetyCounter = 0;

  while (!availableWeekdays.includes(candidate.getDay()) && safetyCounter < 14) {
    candidate = addDays(candidate, 1);
    safetyCounter += 1;
  }

  return candidate;
}

function buildSharedDayNote(input: {
  scheduledDate: Date;
  dayType: DayType;
  sport: string | null;
  sportTrainingDays: number[];
}) {
  const { scheduledDate, dayType, sport, sportTrainingDays } = input;

  if (!sportTrainingDays.includes(scheduledDate.getDay()) || dayType === DayType.REST) {
    return null;
  }

  const sportLabel = sport?.trim() || "deporte principal";
  return `Coincide con ${sportLabel}. Si llegas con carga alta de pista o cancha, deja este bloque en 50-60% del volumen y conserva solo la calidad tecnica.`;
}

function composeProgramNotes(input: {
  athleteProfile: AthleteGenerationProfile;
  includePreparationPhase: boolean;
  notes?: string | undefined;
  sportTrainingDays: number[];
}) {
  const segments: string[] = [];

  if (input.includePreparationPhase) {
    segments.push("Inicia con 3 semanas de adecuacion y prevencion de lesiones basada en isometricos, aterrizajes controlados y bajo impacto.");
  }

  if (input.athleteProfile.trainsSport && input.sportTrainingDays.length) {
    segments.push(`Dias de deporte/pista declarados: ${input.sportTrainingDays.join(", ")}. Ajustar volumen del plan cuando haya choque de cargas.`);
  }

  if (input.notes?.trim()) {
    segments.push(input.notes.trim());
  }

  return segments.join(" ") || null;
}

export async function generatePersonalProgram(input: GeneratePersonalProgramInput) {
  const { athleteProfile, includePreparationPhase = false, notes, phase, startDate, template, transaction } = input;
  const availableWeekdays = parseWeekdaysJson(athleteProfile.weeklyAvailability);
  const sportTrainingDays = parseWeekdaysJson(athleteProfile.sportTrainingDays);
  const excludedExerciseIds = parseExcludedExerciseIds(athleteProfile.exerciseExclusions);
  const athleteName = athleteProfile.displayName ?? athleteProfile.user.firstName ?? athleteProfile.user.email;

  await transaction.personalProgram.updateMany({
    where: {
      athleteProfileId: athleteProfile.id,
      status: {
        in: [ProgramStatus.DRAFT, ProgramStatus.ACTIVE, ProgramStatus.PAUSED],
      },
    },
    data: {
      status: ProgramStatus.ARCHIVED,
    },
  });

  await transaction.scheduledSession.updateMany({
    where: {
      personalProgram: {
        athleteProfileId: athleteProfile.id,
        status: ProgramStatus.ARCHIVED,
      },
      status: {
        in: [SessionStatus.PLANNED, SessionStatus.RESCHEDULED],
      },
    },
    data: {
      status: SessionStatus.SKIPPED,
    },
  });

  const personalProgram = await transaction.personalProgram.create({
    data: {
      athleteProfileId: athleteProfile.id,
      templateId: template.id,
      name: includePreparationPhase ? `${athleteName} - Adecuacion + ${template.name}` : `${athleteName} - ${template.name}`,
      startDate,
      phase,
      status: ProgramStatus.ACTIVE,
      notes: composeProgramNotes({
        athleteProfile,
        includePreparationPhase,
        notes,
        sportTrainingDays,
      }),
    },
  });

  let currentDate = new Date(startDate);

  if (includePreparationPhase) {
    const exerciseNames = Array.from(
      new Set(preparationPhaseBlueprints.flatMap((session) => session.exercises.map((exercise) => exercise.exerciseName))),
    );

    const preparationExercises = await transaction.exercise.findMany({
      where: {
        name: {
          in: exerciseNames,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const exerciseIdByName = new Map(preparationExercises.map((exercise) => [exercise.name, exercise.id]));

    for (let index = 0; index < 21; index += 1) {
      const sessionBlueprint = preparationPhaseBlueprints[index % preparationPhaseBlueprints.length];

      if (!sessionBlueprint) {
        continue;
      }

      const scheduledDate = findNextScheduledDate(currentDate, sessionBlueprint.dayType, availableWeekdays);
      const sharedDayNote = buildSharedDayNote({
        scheduledDate,
        dayType: sessionBlueprint.dayType,
        sport: athleteProfile.sport,
        sportTrainingDays,
      });

      await transaction.scheduledSession.create({
        data: {
          personalProgramId: personalProgram.id,
          scheduledDate,
          title: sessionBlueprint.title,
          dayType: sessionBlueprint.dayType,
          notes: [sessionBlueprint.notes, sharedDayNote].filter(Boolean).join(" ") || null,
          sessionExercises: {
            create: sessionBlueprint.exercises.map((exercise, exerciseIndex) => {
              const exerciseId = exerciseIdByName.get(exercise.exerciseName);

              if (!exerciseId) {
                throw new Error(`Missing preparation exercise: ${exercise.exerciseName}`);
              }

              return {
                exerciseId,
                orderIndex: exerciseIndex + 1,
                sets: exercise.sets ?? null,
                repsText: exercise.repsText ?? null,
                durationSeconds: exercise.durationSeconds ?? null,
                restSeconds: exercise.restSeconds ?? null,
                loadText: exercise.loadText ?? null,
                notes: exercise.notes ?? null,
              };
            }),
          },
        },
      });

      currentDate = addDays(scheduledDate, 1);
    }
  }

  for (let index = 0; index < 84; index += 1) {
    const dayTemplate = template.days[index % template.days.length];

    if (!dayTemplate) {
      throw new Error("Program template day is missing");
    }

    const scheduledDate = findNextScheduledDate(currentDate, dayTemplate.dayType, availableWeekdays);
    const sharedDayNote = buildSharedDayNote({
      scheduledDate,
      dayType: dayTemplate.dayType,
      sport: athleteProfile.sport,
      sportTrainingDays,
    });

    await transaction.scheduledSession.create({
      data: {
        personalProgramId: personalProgram.id,
        scheduledDate,
        title: `Day ${dayTemplate.dayNumber}: ${dayTemplate.title}`,
        dayType: dayTemplate.dayType,
        notes: [dayTemplate.notes, sharedDayNote].filter(Boolean).join(" ") || null,
        sessionExercises: {
          create: dayTemplate.prescriptions
            .filter((prescription) => !excludedExerciseIds.has(prescription.exerciseId))
            .map((prescription, filteredIndex) => {
            const resolved = resolveSeriesProtocol({
              exercise: {
                defaultSeriesProtocol: prescription.exercise.defaultSeriesProtocol,
              },
              prescription: {
                seriesProtocol: prescription.seriesProtocol,
                sets: prescription.sets,
                repsText: prescription.repsText,
                durationSeconds: prescription.durationSeconds,
                restSeconds: prescription.restSeconds,
                loadText: prescription.loadText,
                notes: prescription.notes,
              },
            });

            return {
              exerciseId: prescription.exerciseId,
              orderIndex: filteredIndex + 1,
              seriesProtocol: resolved.effectiveSeriesProtocol,
              sets: resolved.sets,
              repsText: resolved.repsText,
              durationSeconds: resolved.durationSeconds,
              restSeconds: resolved.restSeconds,
              loadText: resolved.loadText,
              notes: resolved.notes,
            };
          }),
        },
      },
    });

    currentDate = addDays(scheduledDate, 1);
  }

  return transaction.personalProgram.findUnique({
    where: { id: personalProgram.id },
    include: {
      athleteProfile: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      template: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      sessions: {
        orderBy: { scheduledDate: "asc" },
        take: 10,
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
}
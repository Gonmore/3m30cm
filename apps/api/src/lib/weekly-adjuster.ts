import { DayType, SeasonPhase, SessionStatus, WeeklyGameCount, type Prisma } from "@prisma/client";
import type { CheckInFatigue } from "@prisma/client";

/**
 * Returns the start (Monday 00:00) and end (Sunday 23:59:59.999) of the ISO week
 * containing the provided weekStart date.
 */
function getWeekBounds(weekStart: Date): { start: Date; end: Date } {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6); // Sunday
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * applyFatigueAdjustment — Adjusts the week's planned sessions based on fatigue.
 *
 * HIGH:
 *   · Insert a RECOVERY session on the Monday of the week (if no session already there).
 *   · Shift all PLANNED sessions in the week forward by +1 day.
 *
 * LOW:
 *   · Find the next EXPLOSIVE or STRENGTH PLANNED session this week.
 *   · Move it to today (the Monday / first available day of the week).
 *
 * MEDIUM: no changes, returns empty array.
 *
 * Returns the list of ScheduledSession IDs that were affected (for API response).
 */
export async function applyFatigueAdjustment(
  tx: Prisma.TransactionClient,
  personalProgramId: string,
  weekStart: Date,
  fatigue: CheckInFatigue,
): Promise<{ id: string; scheduledDate: Date; dayType: DayType; title: string }[]> {
  if (fatigue === "MEDIUM") {
    return [];
  }

  const { start, end } = getWeekBounds(weekStart);

  const plannedSessions = await tx.scheduledSession.findMany({
    where: {
      personalProgramId,
      scheduledDate: { gte: start, lte: end },
      status: { in: [SessionStatus.PLANNED, SessionStatus.RESCHEDULED] },
    },
    orderBy: { scheduledDate: "asc" },
    select: { id: true, scheduledDate: true, dayType: true, title: true, sequenceOrder: true },
  });

  if (fatigue === "HIGH") {
    // Shift all planned sessions forward by 1 day
    const shiftPromises = plannedSessions.map((session) =>
      tx.scheduledSession.update({
        where: { id: session.id },
        data: {
          scheduledDate: addDays(session.scheduledDate, 1),
          rescheduleCount: { increment: 1 },
          notes: "Reprogramado automáticamente: fatiga alta declarada el lunes.",
        },
        select: { id: true, scheduledDate: true, dayType: true, title: true },
      }),
    );

    const shifted = await Promise.all(shiftPromises);

    // Check if Monday already has a session after the shift
    const mondayAlreadyOccupied = shifted.some((s) => new Date(s.scheduledDate).getDay() === 1);

    if (!mondayAlreadyOccupied) {
      // Insert RECOVERY session on Monday
      const recovery = await tx.scheduledSession.create({
        data: {
          personalProgramId,
          scheduledDate: start, // Monday 00:00
          title: "Recuperación activa",
          dayType: DayType.RECOVERY,
          status: SessionStatus.PLANNED,
          sequenceOrder: null,
          notes: "Sesión de recuperación insertada automáticamente por check-in de fatiga alta.",
        },
        select: { id: true, scheduledDate: true, dayType: true, title: true },
      });

      return [recovery, ...shifted];
    }

    return shifted;
  }

  // LOW — advance next heavy session to Monday
  const nextHeavy = plannedSessions.find(
    (s) => s.dayType === DayType.EXPLOSIVE || s.dayType === DayType.STRENGTH,
  );

  if (nextHeavy) {
    const advanced = await tx.scheduledSession.update({
      where: { id: nextHeavy.id },
      data: {
        scheduledDate: start, // move to Monday
        rescheduleCount: { increment: 1 },
        notes: "Adelantado automáticamente: fatiga baja declarada el lunes — cuerpo listo antes de tiempo.",
      },
      select: { id: true, scheduledDate: true, dayType: true, title: true },
    });

    return [advanced];
  }

  return [];
}

/**
 * applyWeekendGamePrediction — Adjusts Friday–Sunday sessions based on game prediction.
 *
 * hasWeekendGames = true (games this weekend):
 *   · Ensure Friday (5) EXPLOSIVE or STRENGTH sessions are converted to RECOVERY
 *     when the athlete's game load is >= TWO_TO_THREE or they're in IN_SEASON/COMPETITION.
 *
 * hasWeekendGames = false (no games this weekend):
 *   · Restore any RECOVERY sessions on Fri/Sat/Sun that were auto-converted back to EXPLOSIVE.
 *     (Only if they have the auto-conversion note, to avoid touching manually set recovery days.)
 *
 * Returns affected sessions.
 */
export async function applyWeekendGamePrediction(
  tx: Prisma.TransactionClient,
  personalProgramId: string,
  weekStart: Date,
  hasWeekendGames: boolean,
  weeklyGameCount: WeeklyGameCount | null,
  seasonPhase: SeasonPhase,
): Promise<{ id: string; scheduledDate: Date; dayType: DayType; title: string }[]> {
  const { start, end } = getWeekBounds(weekStart);

  const isCompetitiveSeason =
    seasonPhase === SeasonPhase.IN_SEASON || seasonPhase === SeasonPhase.COMPETITION;
  const hasSignificantGameLoad =
    weeklyGameCount === WeeklyGameCount.TWO_TO_THREE || weeklyGameCount === WeeklyGameCount.FOUR_PLUS;

  if (hasWeekendGames) {
    if (!isCompetitiveSeason && !hasSignificantGameLoad) {
      return [];
    }

    // Convert Fri EXPLOSIVE/STRENGTH to RECOVERY
    const fridaySessions = await tx.scheduledSession.findMany({
      where: {
        personalProgramId,
        scheduledDate: { gte: start, lte: end },
        dayType: { in: [DayType.EXPLOSIVE, DayType.STRENGTH] },
        status: { in: [SessionStatus.PLANNED, SessionStatus.RESCHEDULED] },
      },
      select: { id: true, scheduledDate: true, dayType: true, title: true },
    });

    const toProtect = fridaySessions.filter((s) => {
      const dow = new Date(s.scheduledDate).getDay();
      return dow === 5; // Friday
    });

    if (toProtect.length === 0) {
      return [];
    }

    const updates = await Promise.all(
      toProtect.map((s) =>
        tx.scheduledSession.update({
          where: { id: s.id },
          data: {
            dayType: DayType.RECOVERY,
            notes: "Convertido a recuperación activa: partido declarado este fin de semana. [auto:weekend-game]",
          },
          select: { id: true, scheduledDate: true, dayType: true, title: true },
        }),
      ),
    );

    return updates;
  }

  // hasWeekendGames = false — restore auto-converted sessions on Fri/Sat/Sun
  const weekendSessions = await tx.scheduledSession.findMany({
    where: {
      personalProgramId,
      scheduledDate: { gte: start, lte: end },
      dayType: DayType.RECOVERY,
      status: { in: [SessionStatus.PLANNED, SessionStatus.RESCHEDULED] },
      notes: { contains: "[auto:weekend-game]" },
    },
    select: { id: true, scheduledDate: true, dayType: true, title: true },
  });

  const toRestore = weekendSessions.filter((s) => {
    const dow = new Date(s.scheduledDate).getDay();
    return dow === 5 || dow === 6 || dow === 0; // Fri, Sat, Sun
  });

  if (toRestore.length === 0) {
    return [];
  }

  const restored = await Promise.all(
    toRestore.map((s) =>
      tx.scheduledSession.update({
        where: { id: s.id },
        data: {
          dayType: DayType.EXPLOSIVE,
          notes: "Restaurado a sesión explosiva: sin partido este fin de semana.",
        },
        select: { id: true, scheduledDate: true, dayType: true, title: true },
      }),
    ),
  );

  return restored;
}

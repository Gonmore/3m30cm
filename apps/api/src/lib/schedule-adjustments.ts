import { DayType, SeasonPhase, WeeklyGameCount, TeamTrainingIntensity, type Prisma } from "@prisma/client";

/**
 * Applies competition-aware adjustments to the sessions of a freshly generated personal program.
 *
 * Rules:
 *   · IN_SEASON or COMPETITION + gameCount >= TWO_TO_THREE:
 *       Sessions with DayType=EXPLOSIVE scheduled on Mon (1) or Fri (5)
 *       are converted to RECOVERY to protect high-impact output around games.
 *
 *   · teamTrainingIntensity=LIGHT:
 *       STRENGTH sessions are moved to the declared teamTrainingDays (stored in
 *       programPreferences.teamTrainingDays) to provide a pre-training stimulus
 *       without adding new fatigue days.  Only applied when at least one team
 *       training day is declared and the session is already nearby.
 *       (In practice this avoids scheduling STRENGTH on opponent-game days.)
 *
 * This is a pure post-processing step: the base template is never modified.
 * Already COMPLETED or SKIPPED sessions are left untouched.
 */
export async function applyCompetitionAdjustments(
  tx: Prisma.TransactionClient,
  personalProgramId: string,
  gameCount: WeeklyGameCount | null | undefined,
  intensity: TeamTrainingIntensity | null | undefined,
  seasonPhase: SeasonPhase,
): Promise<void> {
  const isCompetitionSeason =
    seasonPhase === SeasonPhase.IN_SEASON || seasonPhase === SeasonPhase.COMPETITION;

  const hasHighGameLoad =
    gameCount === WeeklyGameCount.TWO_TO_THREE || gameCount === WeeklyGameCount.FOUR_PLUS;

  // Rule 1 — Block high-impact plyometrics on Mon/Fri during competitive weeks
  if (isCompetitionSeason && hasHighGameLoad) {
    const sessions = await tx.scheduledSession.findMany({
      where: {
        personalProgramId,
        dayType: DayType.EXPLOSIVE,
        status: { notIn: ["COMPLETED", "SKIPPED"] },
      },
      select: { id: true, scheduledDate: true },
    });

    const mondayFridaySessions = sessions.filter((session) => {
      const dow = new Date(session.scheduledDate).getDay(); // 0=Sun … 6=Sat
      return dow === 1 || dow === 5; // Mon or Fri
    });

    if (mondayFridaySessions.length > 0) {
      await tx.scheduledSession.updateMany({
        where: { id: { in: mondayFridaySessions.map((session) => session.id) } },
        data: {
          dayType: DayType.RECOVERY,
          notes: "Ajuste automático: sesión convertida a recuperación activa por partido de fin de semana.",
        },
      });
    }
  }

  // Rule 2 — Light training intensity: append a note on STRENGTH sessions
  // that happen to land on a team training day so the athlete knows to reduce volume
  if (intensity === TeamTrainingIntensity.LIGHT) {
    await tx.scheduledSession.updateMany({
      where: {
        personalProgramId,
        dayType: DayType.STRENGTH,
        status: { notIn: ["COMPLETED", "SKIPPED"] },
      },
      data: {
        notes:
          "Entrenamiento de equipo este día. Si llegas con carga alta de pista, reduce el volumen al 60% y prioriza calidad técnica.",
      },
    });
  }
}

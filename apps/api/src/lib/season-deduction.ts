import { SeasonPhase, WeeklyGameCount, TeamTrainingIntensity } from "@prisma/client";

/**
 * Deduces the athlete's season phase from competition context.
 *
 * Rules:
 *   FOUR_PLUS games/wk                              → COMPETITION
 *   TWO_TO_THREE games/wk                           → IN_SEASON
 *   ZERO_TO_ONE games/wk + INTENSE team training    → IN_SEASON
 *   ZERO_TO_ONE games/wk + LIGHT team training      → PRESEASON
 *   ZERO_TO_ONE games/wk + NONE / no data           → OFF_SEASON
 */
export function deduceSeasonPhase(
  gameCount: WeeklyGameCount | null | undefined,
  intensity: TeamTrainingIntensity | null | undefined,
): SeasonPhase {
  if (!gameCount) {
    return SeasonPhase.OFF_SEASON;
  }

  if (gameCount === WeeklyGameCount.FOUR_PLUS) {
    return SeasonPhase.COMPETITION;
  }

  if (gameCount === WeeklyGameCount.TWO_TO_THREE) {
    return SeasonPhase.IN_SEASON;
  }

  // ZERO_TO_ONE branch
  if (intensity === TeamTrainingIntensity.INTENSE) {
    return SeasonPhase.IN_SEASON;
  }

  if (intensity === TeamTrainingIntensity.LIGHT) {
    return SeasonPhase.PRESEASON;
  }

  return SeasonPhase.OFF_SEASON;
}

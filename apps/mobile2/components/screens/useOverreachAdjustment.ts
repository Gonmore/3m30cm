/**
 * useOverreachAdjustment
 *
 * Detects overreach conditions before a session and returns adjusted session data.
 *
 * Triggers when ANY of:
 *   - fatiga (readinessScore) > 7  → interpreted as HIGH fatigue (low readiness inverted: score <= 3)
 *   - dolor (painScore) > 4
 *   - today is a team training day (isTeamTrainingDay = true)
 *
 * When triggered:
 *   - sets for each exercise × 0.5 (rounded down, min 1)
 *   - skip all VELOCITY zone exercises (mark as skipped)
 *   - notify user via alert
 */

import { useMemo } from "react";
import type { SessionDetail } from "@mobile/components/types";

export interface OverreachAdjustment {
  /** Whether overreach was detected for this session */
  isOverreach: boolean;
  /** Which condition triggered the overreach */
  reason: "fatigue" | "pain" | "teamDay" | null;
  /** Map of sessionExercise.id → adjusted set count */
  adjustedSets: Record<string, number>;
  /** Set of sessionExercise.id values for exercises skipped (VELOCITY zone) */
  skippedIds: Set<string>;
}

interface Options {
  /** Readiness score 1-10 (low = high fatigue). Score <= 3 means fatiga > 7 on inverted scale. */
  readinessScore: number | null;
  /** Pain score 0-10 */
  painScore: number | null;
  /** Whether today's weekday is a team training day */
  isTeamTrainingDay: boolean;
  /** Current session detail (exercises with zone info) */
  session: SessionDetail | null;
}

export function useOverreachAdjustment(options: Options): OverreachAdjustment {
  const { readinessScore, painScore, isTeamTrainingDay, session } = options;

  return useMemo(() => {
    // Determine trigger conditions
    // readinessScore <= 3 corresponds to "fatiga > 7" on a 1-10 inverted scale
    const highFatigue = readinessScore !== null && readinessScore <= 3;
    const highPain = painScore !== null && painScore > 4;
    const teamDay = isTeamTrainingDay;

    const isOverreach = highFatigue || highPain || teamDay;

    if (!isOverreach || !session) {
      return {
        isOverreach: false,
        reason: null,
        adjustedSets: {},
        skippedIds: new Set<string>(),
      };
    }

    const reason: OverreachAdjustment["reason"] = highFatigue
      ? "fatigue"
      : highPain
        ? "pain"
        : "teamDay";

    const adjustedSets: Record<string, number> = {};
    const skippedIds = new Set<string>();

    for (const se of session.sessionExercises) {
      // Skip VELOCITY evolution exercises entirely (max-speed intent, no load to halve)
      if (se.exercise.evolution === "VELOCITY") {
        skippedIds.add(se.id);
        continue;
      }

      // Halve the set count (min 1)
      const originalSets = se.sets ?? 3;
      adjustedSets[se.id] = Math.max(1, Math.floor(originalSets * 0.5));
    }

    return { isOverreach, reason, adjustedSets, skippedIds };
  }, [readinessScore, painScore, isTeamTrainingDay, session]);
}

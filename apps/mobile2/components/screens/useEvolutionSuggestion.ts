/**
 * useEvolutionSuggestion
 *
 * After ALL series for an exercise are completed with energyScore >= 9,
 * returns a suggestion to increment the load/time/velocity based on evolution_metric.
 *
 * Evolution rules:
 *   WEIGHT:   +2.5% or +2 kg (whichever is practical — we suggest +2 kg)
 *   TIME:     +5s work duration  OR  -2s eccentric (we suggest both)
 *   VELOCITY: mantener peso + ejecutar con máxima intención (no numeric increment)
 *   HYBRID:   suggest both weight and time increments
 */

import { useMemo } from "react";

export interface EvolutionSuggestion {
  exerciseId: string;
  evolutionType: string;
  message: string;
}

interface CompletedSet {
  exerciseId: string;
  evolutionType: string | null | undefined;
  totalSets: number;
  completedSets: number;
}

interface Options {
  /**
   * Energy/readiness score for this session (1-10).
   * Suggestion is only shown when energyScore >= 9.
   */
  energyScore: number | null;
  /**
   * Per-exercise completion data with evolution type.
   */
  exercises: CompletedSet[];
}

function buildSuggestionMessage(evolutionType: string): string {
  switch (evolutionType) {
    case "WEIGHT":
      return "💪 ¡Subí el peso! +2 kg en tu próxima sesión";
    case "TIME":
      return "⏱ ¡Aumentá el tiempo! +5s de trabajo o −2s excéntrico";
    case "VELOCITY":
      return "⚡ Mantené el peso y ejecutá con máxima intención explosiva";
    case "HYBRID":
      return "🔥 ¡Progresá! +2 kg de carga Y +5s de trabajo en tu próxima sesión";
    default:
      return "✅ ¡Series completas! Considerá aumentar la dificultad.";
  }
}

export function useEvolutionSuggestion(options: Options): EvolutionSuggestion[] {
  const { energyScore, exercises } = options;

  return useMemo(() => {
    // Only trigger suggestions when energy is high enough
    if (energyScore === null || energyScore < 9) {
      return [];
    }

    const suggestions: EvolutionSuggestion[] = [];

    for (const ex of exercises) {
      // All sets must be completed
      if (ex.completedSets < ex.totalSets || ex.totalSets === 0) {
        continue;
      }

      const evolutionType = ex.evolutionType ?? "WEIGHT";
      suggestions.push({
        exerciseId: ex.exerciseId,
        evolutionType,
        message: buildSuggestionMessage(evolutionType),
      });
    }

    return suggestions;
  }, [energyScore, exercises]);
}

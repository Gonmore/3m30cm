import { SeriesProtocol } from "@prisma/client";

type PrescriptionLike = {
  sets: number | null;
  repsText: string | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  loadText: string | null;
  notes: string | null;
  seriesProtocol: SeriesProtocol | null | undefined;
};

type ExerciseLike = {
  defaultSeriesProtocol: SeriesProtocol | null | undefined;
};

export const strengthSeriesSummary =
  "Series 1-3 explosivas · serie 4 lenta y tecnica · serie 5 burnout/piramidal en 3 mini-sets.";

export const strengthSeriesLoadHint =
  "85% del 1RM aprox.; corta la serie cuando la fase positiva pierda velocidad maxima.";

export const strengthSeriesNote =
  "Serie de fuerza y explosion: 1-3 explosivas, 4 lenta con forma estricta, 5 burnout/piramidal. Entre series: solo 2 depth jumps tras 20-60s de recuperacion. Repite 1RM cuando logres 8 reps a velocidad maxima.";

export const plyometricSeriesNote =
  "Serie pliometrica: cada repeticion debe salir a maxima intensidad y maxima velocidad. Nunca mantengas un ritmo fijo; si baja la intensidad, para y espera la siguiente serie. Usa un objetivo externo siempre que puedas.";

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mergeNotes(...values: Array<string | null | undefined>) {
  const parts = values
    .map((value) => normalizeText(value))
    .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);

  return parts.length ? parts.join(" ") : null;
}

export function resolveSeriesProtocol(input: {
  exercise: ExerciseLike;
  prescription: PrescriptionLike;
}) {
  const effectiveSeriesProtocol =
    input.prescription.seriesProtocol && input.prescription.seriesProtocol !== SeriesProtocol.NONE
      ? input.prescription.seriesProtocol
      : input.exercise.defaultSeriesProtocol ?? SeriesProtocol.NONE;

  if (effectiveSeriesProtocol === SeriesProtocol.STRENGTH_EXPLOSION) {
    return {
      effectiveSeriesProtocol,
      sets: input.prescription.sets ?? 5,
      repsText: normalizeText(input.prescription.repsText) ?? strengthSeriesSummary,
      durationSeconds: input.prescription.durationSeconds ?? null,
      restSeconds: input.prescription.restSeconds ?? 45,
      loadText: normalizeText(input.prescription.loadText) ?? strengthSeriesLoadHint,
      notes: mergeNotes(input.prescription.notes, strengthSeriesNote),
    };
  }

  if (effectiveSeriesProtocol === SeriesProtocol.PLYOMETRIC_SPEED) {
    return {
      effectiveSeriesProtocol,
      sets: input.prescription.sets ?? null,
      repsText: normalizeText(input.prescription.repsText),
      durationSeconds: input.prescription.durationSeconds ?? null,
      restSeconds: input.prescription.restSeconds ?? null,
      loadText: normalizeText(input.prescription.loadText),
      notes: mergeNotes(input.prescription.notes, plyometricSeriesNote),
    };
  }

  return {
    effectiveSeriesProtocol,
    sets: input.prescription.sets ?? null,
    repsText: normalizeText(input.prescription.repsText),
    durationSeconds: input.prescription.durationSeconds ?? null,
    restSeconds: input.prescription.restSeconds ?? null,
    loadText: normalizeText(input.prescription.loadText),
    notes: normalizeText(input.prescription.notes),
  };
}

export function buildSeriesProtocolGuidance(input: { seriesProtocol: SeriesProtocol; loadText: string | null }) {
  if (input.seriesProtocol === SeriesProtocol.STRENGTH_EXPLOSION) {
    return {
      intent: "force-speed",
      focus:
        "Mueve la carga mas pesada que puedas sin comprometer la velocidad maxima de la subida; en cuanto esa velocidad cae, la serie termina.",
      cues: [
        `Peso: ${input.loadText ?? strengthSeriesLoadHint}`,
        "Recuerda: las series 1-3 son explosivas, la 4 prioriza forma estricta y la 5 termina en burnout/piramidal con ayuda si hace falta.",
        "Tip clave: entre series haz solo 2 depth jumps tras 20-60s; el progreso se mide por levantar mas pesado a mayor velocidad, no por alargar la serie.",
      ],
    };
  }

  if (input.seriesProtocol === SeriesProtocol.PLYOMETRIC_SPEED) {
    return {
      intent: "max-speed",
      focus:
        "Cada repeticion debe hacerse a maxima intensidad y maxima velocidad; no entrenes movimiento lento dentro de este bloque.",
      cues: [
        "Recuerda: si la intensidad o la velocidad bajan, para y espera la siguiente serie; nunca sostengas un ritmo fijo.",
        "Tip: usa un objetivo externo siempre que puedas y ve subiendolo para mantener atencion explosiva.",
        "La calidad de cada contacto o repeticion manda sobre el volumen total.",
      ],
    };
  }

  return null;
}
export type BootstrapDayType =
  | "EXPLOSIVE"
  | "STRENGTH"
  | "RECOVERY"
  | "REST"
  | "UPPER_CORE"
  | "OTHER";

export interface BootstrapDay {
  dayNumber: number;
  title: string;
  dayType: BootstrapDayType;
  exercises: string[];
  notes?: string;
}

export const bootstrapProgramTemplate = {
  name: "Jump Manual Base",
  code: "JUMP-MANUAL-14D",
  cycleLengthDays: 14,
  targetWeeks: 12,
  prescriptionMode: "ADMIN_EDITABLE",
  safetyHighlights: [
    "Mantener 24-48 horas de recuperacion por grupo muscular.",
    "No entrenar hasta la fatiga en ejercicios explosivos.",
    "Aplicar hielo y vigilar molestias articulares cuando corresponda.",
  ],
  coachingRules: [
    "La calidad de cada repeticion tiene prioridad sobre el volumen.",
    "Usar el portal admin para ajustar series, repeticiones, descansos y cargas por ejercicio.",
    "El backend no debe hardcodear dosificaciones inciertas; deben salir del catalogo editable.",
  ],
  days: [
    {
      dayNumber: 1,
      title: "Explosividad pliometrica",
      dayType: "EXPLOSIVE",
      exercises: [
        "Depth Jumps",
        "Side to Side Box Jumps",
        "Weighted Explosions",
        "Medicine Ball Approach",
        "Zig Zags",
        "Medicine Throws",
        "Rim Jumps",
        "Speed Rope",
        "PWS",
      ],
    },
    {
      dayNumber: 2,
      title: "Recuperacion, core y tren superior",
      dayType: "UPPER_CORE",
      exercises: ["Stretch and Recover", "Core Series", "Upper Series", "PWS"],
    },
    {
      dayNumber: 3,
      title: "Descanso activo",
      dayType: "REST",
      exercises: ["Off Day Exercises Only", "PWS"],
    },
    {
      dayNumber: 4,
      title: "Fuerza explosiva",
      dayType: "STRENGTH",
      exercises: [
        "Explosion Squats",
        "Explosion Calf Raises",
        "Dead Lifts",
        "Ham Curls",
        "In Place Lunges",
        "Hang Cleans",
        "Knee Drives",
        "PWS",
      ],
    },
    {
      dayNumber: 5,
      title: "Recuperacion",
      dayType: "RECOVERY",
      exercises: ["Stretch and Recover", "PWS"],
    },
    {
      dayNumber: 6,
      title: "Recuperacion, core y tren superior",
      dayType: "UPPER_CORE",
      exercises: ["Stretch and Recover", "Core Series", "Upper Series", "PWS"],
    },
    {
      dayNumber: 7,
      title: "Descanso activo",
      dayType: "REST",
      exercises: ["Off Day Exercises Only", "PWS"],
    },
    {
      dayNumber: 8,
      title: "Explosividad y velocidad",
      dayType: "EXPLOSIVE",
      exercises: [
        "Sprints",
        "Lunge Jumps",
        "1 Leg Chair Rockets",
        "Medicine Throws",
        "Zig Zags",
        "Rim Jumps",
        "Weighted Explosions",
        "Sprints",
        "PWS",
      ],
    },
    {
      dayNumber: 9,
      title: "Recuperacion, core y tren superior",
      dayType: "UPPER_CORE",
      exercises: ["Stretch and Recover", "Core Series", "Upper Series", "PWS"],
    },
    {
      dayNumber: 10,
      title: "Descanso activo",
      dayType: "REST",
      exercises: ["Off Day Exercises Only", "PWS"],
    },
    {
      dayNumber: 11,
      title: "Fuerza explosiva",
      dayType: "STRENGTH",
      exercises: [
        "Explosion Squats",
        "Hang Cleans",
        "Ham Curls",
        "Explosion Calf Raises",
        "In Place Lunges",
        "Dead Lifts",
        "Knee Drives",
        "PWS",
      ],
    },
    {
      dayNumber: 12,
      title: "Recuperacion",
      dayType: "RECOVERY",
      exercises: ["Stretch and Recover", "PWS"],
    },
    {
      dayNumber: 13,
      title: "Recuperacion, core y tren superior",
      dayType: "UPPER_CORE",
      exercises: ["Stretch and Recover", "Core Series", "Upper Series", "PWS"],
    },
    {
      dayNumber: 14,
      title: "Descanso activo",
      dayType: "REST",
      exercises: ["Off Day Exercises Only", "PWS"],
    },
  ] satisfies BootstrapDay[],
} as const;

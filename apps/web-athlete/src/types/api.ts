export type SessionStatus = "PLANNED" | "COMPLETED" | "SKIPPED" | "RESCHEDULED";
export type DayType = "EXPLOSIVE" | "STRENGTH" | "RECOVERY" | "REST" | "UPPER_CORE" | "OTHER";
export type SeasonPhase = "PRESEASON" | "IN_SEASON" | "COMPETITION" | "OFF_SEASON";
export type AssignmentStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ProgramStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

export interface DayTypeConfig {
  label: string;
  emoji: string;
  color: string;
}

export const DAY_TYPE_CONFIG: Record<DayType, DayTypeConfig> = {
  EXPLOSIVE: { label: "Explosivo", emoji: "⚡", color: "text-blue-400" },
  STRENGTH: { label: "Fuerza", emoji: "💪", color: "text-orange-400" },
  RECOVERY: { label: "Recuperación", emoji: "🧘", color: "text-green-400" },
  REST: { label: "Descanso", emoji: "😴", color: "text-purple-400" },
  UPPER_CORE: { label: "Tren Superior/Core", emoji: "🏋️", color: "text-yellow-400" },
  OTHER: { label: "Otro", emoji: "📅", color: "text-surface-400" },
};

export interface ExerciseMediaAsset {
  id: string;
  kind: "IMAGE" | "GIF" | "VIDEO";
  url: string | null;
  title: string | null;
  isPrimary: boolean;
}

export interface ExerciseInstruction {
  id: string;
  locale: string;
  summary: string | null;
  steps: string;
  safetyNotes: string | null;
}

export interface Exercise {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  equipment: string | null;
  requiresLoad: boolean;
  perLeg: boolean;
  isBlock: boolean;
  defaultSeriesProtocol: string;
  evolution: string | null;
  zone: string | null;
  instructions: ExerciseInstruction[];
  mediaAssets: ExerciseMediaAsset[];
  asBlock: {
    id: string;
    items: Array<{
      id: string;
      order: number;
      setsOverride: number | null;
      repsOverride: string | null;
      notes: string | null;
      exercise: { id: string; name: string; slug: string; category: string };
    }>;
  } | null;
}

export interface SessionExercise {
  id: string;
  orderIndex: number;
  sets: number | null;
  repsText: string | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  loadText: string | null;
  tempoText: string | null;
  notes: string | null;
  seriesProtocol: string;
  completedAt: string | null;
  completed: boolean;
  guidance: {
    warmupRecommendation: string | null;
    executionNotes: string | null;
    loadNotes: string | null;
  } | null;
  exercise: Exercise;
}

export interface ExerciseLog {
  id: string;
  notes: string | null;
  perceivedExertion: number | null;
  metrics: Record<string, unknown> | null;
  createdAt: string;
  completedExerciseIds: string[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface ScheduledSession {
  id: string;
  title: string;
  dayType: DayType;
  status: SessionStatus;
  scheduledDate: string;
  originalScheduledDate: string | null;
  sequenceOrder: number | null;
  notes: string | null;
  coachNotes: string | null;
  exerciseCount?: number;
  personalProgram: {
    id: string;
    name: string;
    phase: string;
    status: ProgramStatus;
    template?: {
      id: string;
      code: string;
      name: string;
    };
  };
  sessionExercises: SessionExercise[];
  logs: ExerciseLog[];
}

export interface SessionGuidance {
  dayType: string;
  isRecoveryDay: boolean;
  isRestDay: boolean;
  notes: string | null;
  warmupRecommendation: string | null;
  cooldownRecommendation: string | null;
  loadAdjustment: string | null;
}

export interface SessionDetail {
  session: ScheduledSession;
  guidance: SessionGuidance;
  loadHints: Record<string, { avgKg: number | null; bestKg: number | null; bestSetReps: string | null }>;
}

export interface PersonalProgram {
  id: string;
  name: string;
  status: ProgramStatus;
  startDate: string;
  phase: string;
  notes: string | null;
  template: {
    id: string;
    code: string;
    name: string;
    techniqueTitle: string | null;
    techniqueDescription: string | null;
    phases: Array<{ name: string; orderIndex: number }>;
    overviewTitle: string | null;
    overviewDescription: string | null;
    overviewMediaAsset: ExerciseMediaAsset | null;
  };
  sessions: Array<{
    id: string;
    title: string;
    dayType: DayType;
    status: SessionStatus;
    scheduledDate: string;
  }>;
  techniqueMetrics: Array<{
    id: string;
    label: string;
    value: number;
    unit: string | null;
    notes: string | null;
    recordedAt: string;
  }>;
}

export interface TechniqueMetric {
  id: string;
  label: string;
  value: number;
  unit: string | null;
  notes: string | null;
  recordedAt: string;
}

export interface AthleteProfile {
  id: string;
  userId: string;
  displayName: string | null;
  sport: string | null;
  trainsSport: boolean;
  seasonPhase: string;
  weeklyAvailability: unknown | null;
  sportTrainingDays: unknown | null;
  jumpTrainingDays: unknown | null;
  programPreferences: unknown | null;
  onboardingCompletedAt: string | null;
  heightCm: number | null;
  weightKg: number | null;
  notes: string | null;
  weeklyGameCount: string | null;
  teamTrainingIntensity: string | null;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    oauthProvider: string | null;
  };
  team: {
    id: string;
    name: string;
    slug: string;
  } | null;
  coachAssignments: Array<{
    id: string;
    coach: { id: string; email: string; firstName: string | null; lastName: string | null };
  }>;
}

export interface AvailableTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  welcomeVideoUrl: string | null;
  cycleLengthDays: number;
  isPremium: boolean;
  isEditable?: boolean;
  coachId: string | null;
  coach: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  techniqueMediaAssets: ExerciseMediaAsset[];
  techniques: Array<{ id: string; title: string; description: string | null }>;
  hasActiveProgram: boolean;
  assignmentStatus: AssignmentStatus | null;
}

export interface ProgramAssignment {
  id: string;
  athleteProfileId: string;
  templateId: string;
  status: AssignmentStatus;
  assignedAt: string;
  coach: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  template: {
    id: string;
    code: string;
    name: string;
    isPremium: boolean;
    cycleLengthDays: number;
    welcomeVideoUrl: string | null;
  };
}

export interface PlanningRecommendation {
  needsProgramSetup: boolean;
  recommendedPreparationPhase: boolean;
  recommendedPreparationWeeks: number;
  sportTrainingDays: number[];
  jumpTrainingDays: number[];
  summary: string;
  focusAreas: string[];
}

export interface MeResponse {
  athleteProfile: AthleteProfile | null;
  activeProgram: PersonalProgram | null;
  planningRecommendation: PlanningRecommendation | null;
}

export interface ProgressResponse {
  summary: {
    totalSessions: number;
    completedSessions: number;
    skippedSessions: number;
    rescheduledSessions: number;
    upcomingSessions: number;
    completionRate: number;
    currentStreak: number;
  };
  nextSession: ScheduledSession | null;
  recentAverages: {
    perceivedExertion: number | null;
    readinessScore: number | null;
    sleepHours: number | null;
    painScore: number | null;
  };
  weeklyGoal: {
    targetSessions: number;
    phaseSuggestedSessions: number;
    phase: string;
    source: string;
    scheduledSessions: number;
    completedSessions: number;
    remainingSessions: number;
    completionRate: number;
    jumpTestsLogged: number;
  };
  feedback: {
    status: string;
    title: string;
    summary: string;
    actions: string[];
  };
  personalBests: {
    jumpHeightCm: number | null;
    avgLoadKg: number | null;
    peakVelocityMps: number | null;
  };
  trends: Record<string, unknown>;
  windowComparisons: Record<string, unknown>;
  blockComparison: Record<string, unknown>;
  phaseComparison: Record<string, unknown>;
  cycleEvolution: unknown[];
  historicalBestSessions: {
    jumpHeight: number | null;
    readiness: number | null;
    avgLoad: number | null;
  };
  recentLogs: Array<ExerciseLog>;
}

export interface SessionsListResponse {
  sessions: ScheduledSession[];
}

export interface AssignmentsListResponse {
  assignments: ProgramAssignment[];
}

export interface AvailableProgramsResponse {
  templates: AvailableTemplate[];
  hasActiveProgram: boolean;
}

export interface AthleteTechniqueMetric {
  id: string;
  label: string;
  value: number;
  unit: string | null;
  notes: string | null;
  recordedAt: string;
}

export interface ProgramsListResponse {
  programs: Array<Partial<PersonalProgram>>;
}

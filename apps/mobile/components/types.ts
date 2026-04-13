// Shared types used by all screen components.
// Keep in sync with index.tsx.

export type SessionStatus = "PLANNED" | "COMPLETED" | "SKIPPED";
export type PermissionState = "unknown" | "granted" | "denied";
export type TrendWindow = "7D" | "28D" | "ALL";

export interface AthleteLogMetrics {
  completedExercises?: number;
  totalExercises?: number;
  readinessScore?: number;
  sorenessScore?: number;
  painScore?: number;
  moodScore?: number;
  sleepHours?: number;
  jumpHeightCm?: number;
  bodyWeightKg?: number;
  avgLoadKg?: number;
  peakVelocityMps?: number;
  sessionDurationMin?: number;
  jumpTestAttempt1Cm?: number;
  jumpTestAttempt2Cm?: number;
  jumpTestAttempt3Cm?: number;
  jumpTestAverageCm?: number;
  jumpTestBestCm?: number;
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

export interface AthleteProfile {
  id: string;
  displayName: string | null;
  sport: string | null;
  trainsSport: boolean;
  seasonPhase: string;
  weeklyAvailability: { availableWeekdays?: number[] } | null;
  sportTrainingDays: { trainingDays?: number[] } | null;
  onboardingCompletedAt: string | null;
  notes: string | null;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  team: { id: string; name: string; slug: string } | null;
  coachAssignments: Array<{
    id: string;
    coach: { id: string; email: string; firstName: string | null; lastName: string | null };
  }>;
}

export interface ActiveProgram {
  id: string;
  name: string;
  phase: string;
  status: string;
  startDate: string;
  template: { id: string; code: string; name: string } | null;
  sessions: Array<{ id: string; title: string; dayType: string; status: string; scheduledDate: string }>;
}

export interface ProgramSummary {
  id: string;
  name: string;
  phase: string;
  status: string;
  startDate: string;
  template: { id: string; code: string; name: string } | null;
}

export interface SessionSummary {
  id: string;
  title: string;
  dayType: string;
  status: SessionStatus | "RESCHEDULED";
  scheduledDate: string;
  personalProgram: { id: string; name: string; phase: string; status: string };
  sessionExercises: Array<{ id: string; orderIndex: number; completedAt: string | null }>;
  logs: Array<{ id: string; perceivedExertion: number | null; createdAt: string; metrics: AthleteLogMetrics | null }>;
}

export interface SessionDetail {
  id: string;
  title: string;
  dayType: string;
  status: SessionStatus | "RESCHEDULED";
  scheduledDate: string;
  notes: string | null;
  sessionExercises: Array<{
    id: string;
    orderIndex: number;
    sets: number | null;
    repsText: string | null;
    durationSeconds: number | null;
    restSeconds: number | null;
    loadText: string | null;
    notes: string | null;
    completedAt: string | null;
    guidance?: { intent: string; focus: string; cues: string[] };
    exercise: {
      id: string;
      name: string;
      category: string;
      perLeg: boolean;
      isBlock: boolean;
      instructions: Array<{ id: string; locale: string; summary: string | null; steps: string; safetyNotes: string | null }>;
      mediaAssets: Array<{ id: string; url: string | null; offlineUrl?: string | null; title: string | null; kind: string; isPrimary: boolean }>;
      asBlock: {
        id: string;
        items: Array<{
          id: string;
          order: number;
          setsOverride: number | null;
          repsOverride: string | null;
          notes: string | null;
          exercise: {
            id: string;
            name: string;
            category: string;
            instructions: Array<{ id: string; locale: string; summary: string | null; steps: string; safetyNotes: string | null }>;
            mediaAssets: Array<{ id: string; url: string | null; offlineUrl?: string | null; title: string | null; kind: string; isPrimary: boolean }>;
          };
        }>;
      } | null;
    };
  }>;
  logs: Array<{ id: string; notes: string | null; perceivedExertion: number | null; createdAt: string; metrics: AthleteLogMetrics | null }>;
}

export interface SessionGuidance {
  phase: string;
  intensity: "protect" | "steady" | "push";
  title: string;
  emphasis: string;
  adjustment: string;
  cues: string[];
}

export interface AthleteProgress {
  summary: {
    totalSessions: number;
    completedSessions: number;
    skippedSessions: number;
    rescheduledSessions: number;
    upcomingSessions: number;
    completionRate: number;
    currentStreak: number;
  };
  nextSession: { id: string; title: string; dayType: string; status: string; scheduledDate: string } | null;
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
    source: "program" | "phase";
    scheduledSessions: number;
    completedSessions: number;
    remainingSessions: number;
    completionRate: number;
    jumpTestsLogged: number;
  };
  feedback: { status: "protect" | "focus" | "push" | "steady"; title: string; summary: string; actions: string[] };
  personalBests: { jumpHeightCm: number | null; avgLoadKg: number | null; peakVelocityMps: number | null };
  trends: {
    jumpHeightCm: Array<{ date: string; value: number }>;
    readinessScore: Array<{ date: string; value: number }>;
    avgLoadKg: Array<{ date: string; value: number }>;
  };
  windowComparisons: {
    last7Days: { days: number; currentLogs: number; previousLogs: number; jumpHeightAvg: number | null; jumpHeightDelta: number | null; readinessAvg: number | null; readinessDelta: number | null; avgLoadKg: number | null; avgLoadDelta: number | null };
    last28Days: { days: number; currentLogs: number; previousLogs: number; jumpHeightAvg: number | null; jumpHeightDelta: number | null; readinessAvg: number | null; readinessDelta: number | null; avgLoadKg: number | null; avgLoadDelta: number | null };
  };
  blockComparison: { currentProgramId: string | null; currentProgramName: string | null; currentProgramBestJumpCm: number | null; previousProgramBestJumpCm: number | null; deltaVsPreviousProgramCm: number | null };
  phaseComparison: { currentPhase: string; currentPhaseBestJumpCm: number | null; referencePhaseBestJumpCm: number | null; deltaVsReferencePhaseCm: number | null };
  cycleEvolution: Array<{ id: string; name: string; phase: string; startDate: string; totalSessions: number; completedSessions: number; completionRate: number; bestJumpCm: number | null; averageReadiness: number | null; averageLoadKg: number | null; deltaVsPreviousCycleCm: number | null }>;
  historicalBestSessions: {
    jumpHeight: { id: string; createdAt: string; perceivedExertion: number | null; notes: string | null; metrics: AthleteLogMetrics | null; scheduledSession: { id: string; title: string; dayType: string; status: string; scheduledDate: string } } | null;
    readiness: { id: string; createdAt: string; perceivedExertion: number | null; notes: string | null; metrics: AthleteLogMetrics | null; scheduledSession: { id: string; title: string; dayType: string; status: string; scheduledDate: string } } | null;
    avgLoad: { id: string; createdAt: string; perceivedExertion: number | null; notes: string | null; metrics: AthleteLogMetrics | null; scheduledSession: { id: string; title: string; dayType: string; status: string; scheduledDate: string } } | null;
  };
  recentLogs: Array<{ id: string; notes: string | null; perceivedExertion: number | null; createdAt: string; metrics: AthleteLogMetrics | null; scheduledSession: { id: string; title: string; dayType: string; status: string; scheduledDate: string } }>;
}

export interface LogDraftState {
  notes: string;
  perceivedExertion: string;
  status: SessionStatus;
  completedExerciseIds: string[];
  readinessScore: string;
  sorenessScore: string;
  painScore: string;
  moodScore: string;
  sleepHours: string;
  jumpHeightCm: string;
  bodyWeightKg: string;
  avgLoadKg: string;
  peakVelocityMps: string;
  sessionDurationMin: string;
  jumpTestAttempt1Cm: string;
  jumpTestAttempt2Cm: string;
  jumpTestAttempt3Cm: string;
}

export interface PreSessionCheckInState {
  readinessScore: string;
  sorenessScore: string;
  painScore: string;
  moodScore: string;
  sleepHours: string;
  notes: string;
  savedAt: string | null;
}

export interface AthleteSetupState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  displayName: string;
  sport: string;
  trainsSport: boolean;
  sportTrainingDays: string;
  seasonPhase: string;
  availableWeekdays: string;
  startDate: string;
  includePreparationPhase: boolean;
  notes: string;
  templateCode: string;
}

export interface JumpTestPreview {
  attempts: number[];
  best: number | null;
  average: number | null;
  deltaVsPersonalBest: number | null;
  deltaVsBlockBest: number | null;
  deltaVsPhaseReference: number | null;
}

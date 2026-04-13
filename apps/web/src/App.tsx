import { useEffect, useMemo, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const tokenStorageKey = "jump-admin-access-token";
const templateCode = "JUMP-MANUAL-14D";
const weekdayLabels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const seasonPhaseOptions = ["OFF_SEASON", "PRESEASON", "IN_SEASON", "COMPETITION"] as const;
const sessionStatusOptions = ["PLANNED", "COMPLETED", "SKIPPED", "RESCHEDULED"] as const;
const seriesProtocolOptions = ["NONE", "STRENGTH_EXPLOSION", "PLYOMETRIC_SPEED"] as const;
const strengthSeriesSummary = "Series 1-3 explosivas · serie 4 lenta y tecnica · serie 5 burnout/piramidal.";
const strengthSeriesLoadHint = "85% del 1RM aprox.; corta cuando baje la velocidad maxima.";
const strengthSeriesReminder = "RECUERDA: la subida siempre debe ser lo mas rapida posible; si la velocidad cae, la serie termina.";
const plyometricSeriesReminder = "RECUERDA: cada repeticion va a maxima intensidad y maxima velocidad; si cae la intensidad, para.";

type MediaKind = "IMAGE" | "GIF" | "VIDEO";
type TeamRole = "TEAM_ADMIN" | "COACH" | "ATHLETE";
type SeasonPhase = (typeof seasonPhaseOptions)[number];
type SessionStatus = (typeof sessionStatusOptions)[number];
type SeriesProtocol = (typeof seriesProtocolOptions)[number];
type AdminView = "home" | "users" | "training" | "templates";

interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  platformRole: string | null;
  teamRoles?: string[];
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

interface AdminSummary {
  metrics: {
    users: number;
    teams: number;
    athletes: number;
    exercises: number;
    templates: number;
    programs: number;
    sessions: number;
  };
}

interface BasicUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface ExerciseInstruction {
  id: string;
  locale: string;
  summary: string | null;
  steps: string;
  safetyNotes: string | null;
}

interface ExerciseMediaAsset {
  id: string;
  kind: MediaKind;
  url: string | null;
  title: string | null;
  objectKey: string;
  isPrimary: boolean;
}

interface ExerciseRecord {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  equipment: string | null;
  requiresLoad: boolean;
  perLeg: boolean;
  isBlock: boolean;
  defaultSeriesProtocol: SeriesProtocol;
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

interface TeamMembershipRecord {
  id: string;
  role: TeamRole;
  user: BasicUser;
}

interface CoachAssignmentRecord {
  id: string;
  coach: BasicUser;
}

interface AthleteProgramBadge {
  id: string;
  name: string;
  status: string;
  startDate: string;
}

interface AthleteProfileRecord {
  id: string;
  displayName: string;
  sport: string | null;
  trainsSport: boolean;
  seasonPhase: SeasonPhase;
  weeklyAvailability: { availableWeekdays?: number[] } | null;
  sportTrainingDays: { trainingDays?: number[] } | null;
  onboardingCompletedAt: string | null;
  notes: string | null;
  exerciseExclusions: string[] | null;
  user: BasicUser;
  team?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  coachAssignments: CoachAssignmentRecord[];
  personalPrograms: AthleteProgramBadge[];
}

interface ProgramTemplateMeta {
  id: string;
  code: string;
  name: string;
  description: string | null;
  cycleLengthDays: number;
  isEditable: boolean;
  _count: { days: number; personalPrograms: number };
}

interface TemplateFormState {
  id?: string;
  code: string;
  name: string;
  description: string;
  cycleLengthDays: string;
}

interface TeamRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  memberships: TeamMembershipRecord[];
  athletes: AthleteProfileRecord[];
}

interface ScheduledSessionPreview {
  id: string;
  title: string;
  dayType: string;
  status: string;
  scheduledDate: string;
}

interface PersonalProgramRecord {
  id: string;
  name: string;
  status: string;
  startDate: string;
  phase: string;
  athleteProfile: {
    id: string;
    displayName: string;
    user: BasicUser;
    team: {
      id: string;
      name: string;
      slug: string;
    };
  };
  template: {
    id: string;
    code: string;
    name: string;
  };
  sessions: ScheduledSessionPreview[];
}

interface AdminSessionRecord {
  id: string;
  title: string;
  dayType: string;
  status: SessionStatus;
  scheduledDate: string;
  notes: string | null;
  personalProgram: {
    id: string;
    name: string;
    athleteProfile: {
      id: string;
      displayName: string | null;
      user: BasicUser;
      team: {
        id: string;
        name: string;
        slug: string;
      } | null;
    };
  };
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
    exercise: {
      id: string;
      name: string;
      category: string;
    };
  }>;
  logs: Array<{
    id: string;
    notes: string | null;
    perceivedExertion: number | null;
    createdAt: string;
    athleteProfile: {
      id: string;
      user: BasicUser;
    };
  }>;
}

interface SessionEditorState {
  title: string;
  scheduledDate: string;
  status: SessionStatus;
  notes: string;
}

interface CoachDashboardResponse {
  coach: BasicUser & {
    memberships: Array<{
      id: string;
      role: string;
      team: {
        id: string;
        name: string;
        slug: string;
      };
    }>;
  };
  metrics: {
    athletes: number;
    activePrograms: number;
    recentLogs: number;
  };
  athletes: Array<{
    id: string;
    displayName: string | null;
    sport: string | null;
    seasonPhase: string;
    notes: string | null;
    user: BasicUser;
    team: {
      id: string;
      name: string;
      slug: string;
    } | null;
    personalPrograms: Array<{
      id: string;
      name: string;
      status: string;
      startDate: string;
      sessions: ScheduledSessionPreview[];
    }>;
    sessionLogs: Array<{
      id: string;
      notes: string | null;
      perceivedExertion: number | null;
      createdAt: string;
      scheduledSession: ScheduledSessionPreview;
    }>;
  }>;
}

interface ExerciseFormState {
  id?: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  equipment: string;
  requiresLoad: boolean;
  perLeg: boolean;
  isBlock: boolean;
  defaultSeriesProtocol: Extract<SeriesProtocol, "NONE" | "STRENGTH_EXPLOSION">;
  summary: string;
  steps: string;
  safetyNotes: string;
}

interface TeamFormState {
  id?: string;
  name: string;
  slug: string;
  description: string;
}

interface MemberFormState {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Extract<TeamRole, "TEAM_ADMIN" | "COACH">;
}

interface AthleteFormState {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName: string;
  sport: string;
  trainsSport: boolean;
  sportTrainingDays: string;
  seasonPhase: SeasonPhase;
  availableWeekdays: string;
  notes: string;
}

interface ProgramGenerationState {
  athleteProfileId: string;
  templateCode: string;
  startDate: string;
  phase: "" | SeasonPhase;
  includePreparationPhase: boolean;
  notes: string;
}

interface PrescriptionRecord {
  id?: string;
  exerciseId: string;
  orderIndex: number;
  seriesProtocol: Extract<SeriesProtocol, "NONE" | "PLYOMETRIC_SPEED">;
  blockLabel: string;
  sets: string;
  repsText: string;
  durationSeconds: string;
  restSeconds: string;
  loadText: string;
  tempoText: string;
  notes: string;
}

interface ProgramDay {
  id: string;
  dayNumber: number;
  title: string;
  dayType: string;
  prescriptions: Array<{
    id: string;
    orderIndex: number;
    exerciseId: string;
    seriesProtocol: SeriesProtocol;
    blockLabel: string | null;
    sets: number | null;
    repsText: string | null;
    durationSeconds: number | null;
    restSeconds: number | null;
    loadText: string | null;
    tempoText: string | null;
    notes: string | null;
    exercise: ExerciseRecord;
  }>;
}

interface ProgramTemplateResponse {
  template: {
    id: string;
    code: string;
    name: string;
    days: ProgramDay[];
  };
}

const emptyExerciseForm = (): ExerciseFormState => ({
  name: "",
  slug: "",
  category: "",
  description: "",
  equipment: "",
  requiresLoad: false,
  perLeg: false,
  isBlock: false,
  defaultSeriesProtocol: "NONE",
  summary: "",
  steps: "",
  safetyNotes: "",
});

const emptyTeamForm = (): TeamFormState => ({
  name: "",
  slug: "",
  description: "",
});

const emptyMemberForm = (): MemberFormState => ({
  email: "",
  password: "Temp123!",
  firstName: "",
  lastName: "",
  role: "COACH",
});

const emptyAthleteForm = (): AthleteFormState => ({
  email: "",
  password: "Temp123!",
  firstName: "",
  lastName: "",
  displayName: "",
  sport: "",
  trainsSport: false,
  sportTrainingDays: "2,4",
  seasonPhase: "OFF_SEASON",
  availableWeekdays: "1,3,5",
  notes: "",
});

const emptyProgramGeneration = (): ProgramGenerationState => ({
  athleteProfileId: "",
  templateCode: "JUMP-MANUAL-14D",
  startDate: new Date().toISOString().slice(0, 10),
  phase: "",
  includePreparationPhase: true,
  notes: "",
});

const emptyTemplateForm = (): TemplateFormState => ({
  code: "",
  name: "",
  description: "",
  cycleLengthDays: "14",
});

const emptySessionEditor = (): SessionEditorState => ({
  title: "",
  scheduledDate: "",
  status: "PLANNED",
  notes: "",
});

const emptyPrescription = (orderIndex: number, exerciseId = ""): PrescriptionRecord => ({
  exerciseId,
  orderIndex,
  seriesProtocol: "NONE",
  blockLabel: "",
  sets: "",
  repsText: "",
  durationSeconds: "",
  restSeconds: "",
  loadText: "",
  tempoText: "",
  notes: "",
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function displayName(user: BasicUser) {
  const value = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return value || user.email;
}

function seriesProtocolLabel(protocol: SeriesProtocol) {
  if (protocol === "STRENGTH_EXPLOSION") {
    return "Serie de fuerza y explosion";
  }

  if (protocol === "PLYOMETRIC_SPEED") {
    return "Serie pliometrica";
  }

  return "Sin serie especial";
}

function strengthSeriesPreview() {
  return {
    sets: "5",
    repsText: strengthSeriesSummary,
    restSeconds: "45",
    loadText: strengthSeriesLoadHint,
    tempoText: "Negativa lenta · positiva explosiva",
  };
}

function formatWeekdaySummary(weekdays: number[]) {
  if (!weekdays.length) {
    return "Sin restriccion";
  }

  return weekdays
    .sort((left, right) => left - right)
    .map((value) => weekdayLabels[value] ?? String(value))
    .join(", ");
}

function parseWeekdaysInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6),
    ),
  ).sort((left, right) => left - right);
}

function athleteWeekdays(athlete: AthleteProfileRecord) {
  const weekdays = athlete.weeklyAvailability?.availableWeekdays;
  return Array.isArray(weekdays) ? weekdays.filter((value) => typeof value === "number") : [];
}

function athleteSportWeekdays(athlete: AthleteProfileRecord) {
  const weekdays = athlete.sportTrainingDays?.trainingDays;
  return Array.isArray(weekdays) ? weekdays.filter((value) => typeof value === "number") : [];
}

function mapExerciseToForm(exercise: ExerciseRecord): ExerciseFormState {
  const instruction = exercise.instructions.find((entry) => entry.locale === "es") ?? exercise.instructions[0];

  return {
    id: exercise.id,
    name: exercise.name,
    slug: exercise.slug,
    category: exercise.category,
    description: exercise.description ?? "",
    equipment: exercise.equipment ?? "",
    requiresLoad: exercise.requiresLoad ?? false,
    perLeg: exercise.perLeg ?? false,
    isBlock: exercise.isBlock ?? false,
    defaultSeriesProtocol: exercise.defaultSeriesProtocol === "STRENGTH_EXPLOSION" ? "STRENGTH_EXPLOSION" : "NONE",
    summary: instruction?.summary ?? exercise.description ?? "",
    steps: instruction?.steps ?? "",
    safetyNotes: instruction?.safetyNotes ?? "",
  };
}

function mapTeamToForm(team: TeamRecord): TeamFormState {
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    description: team.description ?? "",
  };
}

function mapMemberToForm(membership: TeamMembershipRecord): MemberFormState {
  return {
    email: membership.user.email,
    password: "",
    firstName: membership.user.firstName ?? "",
    lastName: membership.user.lastName ?? "",
    role: membership.role === "TEAM_ADMIN" ? "TEAM_ADMIN" : "COACH",
  };
}

function mapAthleteToForm(athlete: AthleteProfileRecord): AthleteFormState {
  return {
    email: athlete.user.email,
    password: "",
    firstName: athlete.user.firstName ?? "",
    lastName: athlete.user.lastName ?? "",
    displayName: athlete.displayName,
    sport: athlete.sport ?? "",
    trainsSport: athlete.trainsSport,
    sportTrainingDays: athleteSportWeekdays(athlete).join(","),
    seasonPhase: athlete.seasonPhase,
    availableWeekdays: athleteWeekdays(athlete).join(","),
    notes: athlete.notes ?? "",
  };
}

function mapDayToDraft(day: ProgramDay): PrescriptionRecord[] {
  return day.prescriptions.map((item) => ({
    id: item.id,
    exerciseId: item.exerciseId,
    orderIndex: item.orderIndex,
    seriesProtocol: item.seriesProtocol === "PLYOMETRIC_SPEED" ? "PLYOMETRIC_SPEED" : "NONE",
    blockLabel: item.blockLabel ?? "",
    sets: item.sets?.toString() ?? "",
    repsText: item.repsText ?? "",
    durationSeconds: item.durationSeconds?.toString() ?? "",
    restSeconds: item.restSeconds?.toString() ?? "",
    loadText: item.loadText ?? "",
    tempoText: item.tempoText ?? "",
    notes: item.notes ?? "",
  }));
}

function mapSessionToEditor(session: AdminSessionRecord): SessionEditorState {
  return {
    title: session.title,
    scheduledDate: session.scheduledDate.slice(0, 10),
    status: session.status,
    notes: session.notes ?? "",
  };
}

async function requestJson<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => ({}))) as { message?: string } & T;

  if (!response.ok) {
    throw new Error(data.message ?? "Request failed");
  }

  return data;
}

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(tokenStorageKey));
  const [adminView, setAdminView] = useState<AdminView>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<AdminSummary["metrics"] | null>(null);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [allAthletes, setAllAthletes] = useState<AthleteProfileRecord[]>([]);
  const [programs, setPrograms] = useState<PersonalProgramRecord[]>([]);
  const [programSessions, setProgramSessions] = useState<AdminSessionRecord[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [selectedProgramSessionId, setSelectedProgramSessionId] = useState<string>("");
  const [selectedProgramSession, setSelectedProgramSession] = useState<AdminSessionRecord | null>(null);
  const [sessionEditor, setSessionEditor] = useState<SessionEditorState>(emptySessionEditor);
  const [selectedCoachDashboardId, setSelectedCoachDashboardId] = useState<string>("");
  const [coachDashboard, setCoachDashboard] = useState<CoachDashboardResponse | null>(null);
  const [templateDays, setTemplateDays] = useState<ProgramDay[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(1);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedAthleteProfileId, setSelectedAthleteProfileId] = useState<string>("");
  const [selectedMembershipId, setSelectedMembershipId] = useState<string>("");
  const [selectedCoachUserId, setSelectedCoachUserId] = useState<string>("");
  const [exerciseForm, setExerciseForm] = useState<ExerciseFormState>(emptyExerciseForm);
  const [teamForm, setTeamForm] = useState<TeamFormState>(emptyTeamForm);
  const [memberForm, setMemberForm] = useState<MemberFormState>(emptyMemberForm);
  const [athleteForm, setAthleteForm] = useState<AthleteFormState>(emptyAthleteForm);
  const [programGeneration, setProgramGeneration] = useState<ProgramGenerationState>(emptyProgramGeneration);
  const [prescriptionsDraft, setPrescriptionsDraft] = useState<PrescriptionRecord[]>([]);
  const [selectedPrescriptionIdx, setSelectedPrescriptionIdx] = useState<number>(0);
  const [loginForm, setLoginForm] = useState({ email: "admin@3m30cm.local", password: "Admin123!" });
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [uploadState, setUploadState] = useState({ kind: "IMAGE" as MediaKind, title: "", isPrimary: false, file: null as File | null });
  const [blockDraft, setBlockDraft] = useState<Array<{ _key: string; exerciseId: string; order: number; setsOverride: string; repsKind: "reps" | "time"; repsOverride: string; notes: string }>>([]);
  const [allTemplates, setAllTemplates] = useState<ProgramTemplateMeta[]>([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>(templateCode);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(emptyTemplateForm);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [exclusionsAthleteId, setExclusionsAthleteId] = useState<string>("");
  const [exclusionsDraft, setExclusionsDraft] = useState<string[]>([]);

  const selectedExercise = useMemo(
    () => exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null,
    [exercises, selectedExerciseId],
  );

  const selectedDay = useMemo(
    () => templateDays.find((day) => day.dayNumber === selectedDayNumber) ?? null,
    [selectedDayNumber, templateDays],
  );

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [selectedTeamId, teams],
  );

  const selectedAthlete = useMemo(
    () => selectedTeam?.athletes.find((athlete) => athlete.id === selectedAthleteProfileId) ?? null,
    [selectedAthleteProfileId, selectedTeam],
  );

  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  );

  const selectedProgramAthlete = useMemo(
    () => allAthletes.find((athlete) => athlete.id === programGeneration.athleteProfileId) ?? null,
    [allAthletes, programGeneration.athleteProfileId],
  );

  const selectedTeamStaff = useMemo(
    () => selectedTeam?.memberships.filter((membership) => membership.role !== "ATHLETE") ?? [],
    [selectedTeam],
  );

  const selectedMembership = useMemo(
    () => selectedTeamStaff.find((membership) => membership.id === selectedMembershipId) ?? null,
    [selectedMembershipId, selectedTeamStaff],
  );

  const selectedTeamCoaches = useMemo(
    () => selectedTeam?.memberships.filter((membership) => membership.role === "COACH") ?? [],
    [selectedTeam],
  );

  const teamlessAthletes = useMemo(
    () => allAthletes.filter((athlete) => !athlete.team),
    [allAthletes],
  );

  const canCreateAthlete = Boolean(selectedTeamId);
  const selectedTeamAthleteCount = selectedTeam?.athletes.length ?? 0;
  const selectedTeamCoachCount = selectedTeamCoaches.length;
  const selectedTeamStaffCount = selectedTeamStaff.length;

  const exerciseOptions = useMemo(
    () => exercises.map((exercise) => ({ id: exercise.id, name: exercise.name })),
    [exercises],
  );

  const exerciseById = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise] as const)),
    [exercises],
  );

  const coachOptions = useMemo(() => {
    const options = new Map<string, { id: string; label: string; teamName: string }>();

    for (const team of teams) {
      for (const membership of team.memberships) {
        if (membership.role !== "COACH") {
          continue;
        }

        if (!options.has(membership.user.id)) {
          options.set(membership.user.id, {
            id: membership.user.id,
            label: displayName(membership.user),
            teamName: team.name,
          });
        }
      }
    }

    return Array.from(options.values());
  }, [teams]);

  useEffect(() => {
    if (!accessToken) {
      setCurrentUser(null);
      setSummary(null);
      setExercises([]);
      setTeams([]);
      setAllAthletes([]);
      setPrograms([]);
      setProgramSessions([]);
      setSelectedProgramId("");
      setSelectedProgramSessionId("");
      setSelectedProgramSession(null);
      setCoachDashboard(null);
      setTemplateDays([]);
      return;
    }

    void refreshDashboard(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (selectedExercise) {
      setExerciseForm(mapExerciseToForm(selectedExercise));
      setBlockDraft(
        (selectedExercise.asBlock?.items ?? []).map((item) => ({
          _key: item.id,
          exerciseId: item.exercise.id,
          order: item.order,
          setsOverride: item.setsOverride != null ? String(item.setsOverride) : "",
          repsKind: (item.repsOverride?.match(/\d+\s*s(eg)?/i) ? "time" : "reps") as "reps" | "time",
          repsOverride: item.repsOverride ?? "",
          notes: item.notes ?? "",
        })),
      );
    }
  }, [selectedExercise]);

  useEffect(() => {
    if (selectedDay) {
      setPrescriptionsDraft(mapDayToDraft(selectedDay));
      setSelectedPrescriptionIdx(0);
    }
  }, [selectedDay]);

  useEffect(() => {
    if (selectedTeam) {
      setTeamForm(mapTeamToForm(selectedTeam));

      const firstAthlete = selectedTeam.athletes[0];
      const firstStaff = selectedTeamStaff[0];
      setSelectedAthleteProfileId((current) => {
        if (current && selectedTeam.athletes.some((athlete) => athlete.id === current)) {
          return current;
        }

        return firstAthlete?.id ?? "";
      });

      setSelectedMembershipId((current) => {
        if (current && selectedTeamStaff.some((membership) => membership.id === current)) {
          return current;
        }

        return firstStaff?.id ?? "";
      });

      const firstCoach = selectedTeamCoaches[0];
      setSelectedCoachUserId((current) => {
        if (current && selectedTeamCoaches.some((coach) => coach.user.id === current)) {
          return current;
        }

        return firstCoach?.user.id ?? "";
      });
    } else {
      setTeamForm(emptyTeamForm());
      setSelectedAthleteProfileId("");
      setSelectedMembershipId("");
      setSelectedCoachUserId("");
    }
  }, [selectedTeam, selectedTeamCoaches, selectedTeamStaff]);

  useEffect(() => {
    if (selectedMembership) {
      setMemberForm(mapMemberToForm(selectedMembership));
    } else {
      setMemberForm(emptyMemberForm());
    }
  }, [selectedMembership]);

  useEffect(() => {
    if (selectedAthlete) {
      setAthleteForm(mapAthleteToForm(selectedAthlete));
    } else {
      setAthleteForm(emptyAthleteForm());
    }
  }, [selectedAthlete]);

  useEffect(() => {
    if (selectedAthleteProfileId) {
      setProgramGeneration((current) => ({ ...current, athleteProfileId: selectedAthleteProfileId }));
    }
  }, [selectedAthleteProfileId]);

  useEffect(() => {
    if (!accessToken || !selectedProgramId) {
      setProgramSessions([]);
      setSelectedProgramSessionId("");
      setSelectedProgramSession(null);
      setSessionEditor(emptySessionEditor());
      return;
    }

    void loadProgramSessions(selectedProgramId, accessToken);
  }, [selectedProgramId, accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedProgramSessionId) {
      setSelectedProgramSession(null);
      setSessionEditor(emptySessionEditor());
      return;
    }

    void loadProgramSessionDetail(selectedProgramSessionId, accessToken);
  }, [selectedProgramSessionId, accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedCoachDashboardId) {
      setCoachDashboard(null);
      return;
    }

    void loadCoachDashboard(selectedCoachDashboardId, accessToken);
  }, [selectedCoachDashboardId, accessToken]);

  async function refreshDashboard(token = accessToken ?? undefined) {
    if (!token) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [meResponse, summaryResponse, exercisesResponse, templateResponse, allTemplatesResponse, teamsResponse, athletesResponse, programsResponse] = await Promise.all([
        requestJson<{ user: AuthUser }>("/api/v1/auth/me", {}, token),
        requestJson<AdminSummary>("/api/v1/admin/summary", {}, token),
        requestJson<{ exercises: ExerciseRecord[] }>("/api/v1/admin/exercises", {}, token),
        requestJson<ProgramTemplateResponse>(`/api/v1/templates/program-templates/${selectedTemplateCode}`, {}, token),
        requestJson<{ templates: ProgramTemplateMeta[] }>("/api/v1/admin/program-templates", {}, token),
        requestJson<{ teams: TeamRecord[] }>("/api/v1/admin/teams", {}, token),
        requestJson<{ athletes: AthleteProfileRecord[] }>("/api/v1/admin/athletes", {}, token),
        requestJson<{ programs: PersonalProgramRecord[] }>("/api/v1/admin/programs", {}, token),
      ]);

      setCurrentUser(meResponse.user);
      setSummary(summaryResponse.metrics);
      setExercises(exercisesResponse.exercises);
      setTeams(teamsResponse.teams);
      setAllAthletes(athletesResponse.athletes);
      setPrograms(programsResponse.programs);
      setTemplateDays(templateResponse.template.days);
      setAllTemplates(allTemplatesResponse.templates);

      const firstExercise = exercisesResponse.exercises[0];
      if (!selectedExerciseId && firstExercise) {
        setSelectedExerciseId(firstExercise.id);
      }

      const firstDay = templateResponse.template.days[0];
      if (firstDay) {
        setSelectedDayNumber((current) => {
          const exists = templateResponse.template.days.some((day) => day.dayNumber === current);
          return exists ? current : firstDay.dayNumber;
        });
      }

      const firstTeam = teamsResponse.teams[0];
      if (firstTeam) {
        setSelectedTeamId((current) => {
          const exists = teamsResponse.teams.some((team) => team.id === current);
          return exists ? current : firstTeam.id;
        });
      } else {
        setSelectedTeamId(null);
      }

      const firstProgram = programsResponse.programs[0];
      if (firstProgram) {
        setSelectedProgramId((current) => {
          const exists = programsResponse.programs.some((program) => program.id === current);
          return exists ? current : firstProgram.id;
        });
      } else {
        setSelectedProgramId("");
      }

      const teamCoachOptions = teamsResponse.teams.flatMap((team) =>
        team.memberships
          .filter((membership) => membership.role === "COACH")
          .map((membership) => ({
            id: membership.user.id,
            label: displayName(membership.user),
          })),
      );

      const firstCoach = teamCoachOptions[0];
      if (firstCoach) {
        setSelectedCoachDashboardId((current) => {
          const exists = teamCoachOptions.some((coach) => coach.id === current);
          return exists ? current : firstCoach.id;
        });
      } else {
        setSelectedCoachDashboardId("");
      }
    } catch (requestError) {
      const nextError = requestError instanceof Error ? requestError.message : "No se pudo cargar el panel";
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }

  async function loadProgramSessions(programId: string, token = accessToken ?? undefined) {
    if (!token) {
      return;
    }

    try {
      const response = await requestJson<{ sessions: AdminSessionRecord[] }>(
        `/api/v1/admin/programs/${programId}/sessions`,
        {},
        token,
      );
      setProgramSessions(response.sessions);

      const firstSession = response.sessions[0];
      if (firstSession) {
        setSelectedProgramSessionId((current) => {
          const exists = response.sessions.some((session) => session.id === current);
          return exists ? current : firstSession.id;
        });
      } else {
        setSelectedProgramSessionId("");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar las sesiones del programa");
    }
  }

  async function loadProgramSessionDetail(sessionId: string, token = accessToken ?? undefined) {
    if (!token) {
      return;
    }

    try {
      const response = await requestJson<{ session: AdminSessionRecord }>(`/api/v1/admin/sessions/${sessionId}`, {}, token);
      setSelectedProgramSession(response.session);
      setSessionEditor(mapSessionToEditor(response.session));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el detalle de sesion");
    }
  }

  async function loadCoachDashboard(coachUserId: string, token = accessToken ?? undefined) {
    if (!token) {
      return;
    }

    try {
      const query = new URLSearchParams({ coachUserId }).toString();
      const response = await requestJson<CoachDashboardResponse>(`/api/v1/coach/dashboard?${query}`, {}, token);
      setCoachDashboard(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el panel coach");
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const response = await requestJson<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });

      localStorage.setItem(tokenStorageKey, response.accessToken);
      setAccessToken(response.accessToken);
      setCurrentUser(response.user);
      setMessage("Sesion iniciada correctamente.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo iniciar sesion");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(tokenStorageKey);
    setAccessToken(null);
    setCurrentUser(null);
    setMessage("Sesion cerrada.");
    setSelectedExerciseId(null);
    setExerciseForm(emptyExerciseForm());
    setSelectedTeamId(null);
    setSelectedMembershipId("");
    setTeamForm(emptyTeamForm());
  }

  async function handleExerciseSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    const payload = {
      name: exerciseForm.name,
      slug: exerciseForm.slug,
      category: exerciseForm.category,
      description: exerciseForm.description || undefined,
      equipment: exerciseForm.equipment || undefined,
      requiresLoad: exerciseForm.requiresLoad,
      perLeg: exerciseForm.perLeg,
      isBlock: exerciseForm.isBlock,
      defaultSeriesProtocol: exerciseForm.defaultSeriesProtocol,
      summary: exerciseForm.summary,
      steps: exerciseForm.steps,
      safetyNotes: exerciseForm.safetyNotes || undefined,
    };

    try {
      setLoading(true);
      setError("");

      if (exerciseForm.id) {
        await requestJson<{ exercise: ExerciseRecord }>(
          `/api/v1/admin/exercises/${exerciseForm.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setMessage("Ejercicio actualizado.");
      } else {
        const response = await requestJson<{ exercise: ExerciseRecord }>(
          "/api/v1/admin/exercises",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setSelectedExerciseId(response.exercise.id);
        setMessage("Ejercicio creado.");
      }

      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el ejercicio");
    } finally {
      setLoading(false);
    }
  }

  async function handleExerciseDelete() {
    if (!accessToken || !exerciseForm.id) {
      return;
    }

    const confirmed = window.confirm("Eliminar este ejercicio puede fallar si ya esta referenciado por la plantilla. Continuar?");
    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(`/api/v1/admin/exercises/${exerciseForm.id}`, { method: "DELETE" }, accessToken);
      setMessage("Ejercicio eliminado.");
      setSelectedExerciseId(null);
      setExerciseForm(emptyExerciseForm());
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar el ejercicio");
    } finally {
      setLoading(false);
    }
  }

  async function handleMediaUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !exerciseForm.id || !uploadState.file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadState.file);
    formData.append("kind", uploadState.kind);
    formData.append("title", uploadState.title);
    formData.append("isPrimary", String(uploadState.isPrimary));

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/exercises/${exerciseForm.id}/media`,
        {
          method: "POST",
          body: formData,
        },
        accessToken,
      );
      setUploadState({ kind: "IMAGE", title: "", isPrimary: false, file: null });
      setMessage("Media subida a MinIO y asociada al ejercicio.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo subir la media");
    } finally {
      setLoading(false);
    }
  }

  async function handleMediaDelete(mediaId: string) {
    if (!accessToken || !exerciseForm.id) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/exercises/${exerciseForm.id}/media/${mediaId}`,
        {
          method: "DELETE",
        },
        accessToken,
      );
      setMessage("Media eliminada.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar la media");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveBlockItems(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !exerciseForm.id) return;
    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/exercises/${exerciseForm.id}/block-items`,
        {
          method: "PUT",
          body: JSON.stringify({
            items: blockDraft.map((item, idx) => ({
              exerciseId: item.exerciseId,
              order: idx,
              setsOverride: item.setsOverride !== "" && !isNaN(parseInt(item.setsOverride, 10)) ? parseInt(item.setsOverride, 10) : null,
              repsOverride: item.repsOverride || null,
              notes: item.notes || null,
            })),
          }),
        },
        accessToken,
      );
      setMessage("Estructura del bloque guardada.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar la estructura");
    } finally {
      setLoading(false);
    }
  }

  async function handlePrescriptionsSave() {
    if (!accessToken || !selectedDay) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const payload = {
        prescriptions: prescriptionsDraft.map((item, index) => {
          const exercise = exerciseById.get(item.exerciseId);
          const usesStrengthPreset = exercise?.defaultSeriesProtocol === "STRENGTH_EXPLOSION";

          return {
            exerciseId: item.exerciseId,
            orderIndex: index + 1,
            seriesProtocol: usesStrengthPreset ? "NONE" : item.seriesProtocol,
            blockLabel: item.blockLabel || undefined,
            sets: usesStrengthPreset ? undefined : item.sets ? Number(item.sets) : undefined,
            repsText: usesStrengthPreset ? undefined : item.repsText || undefined,
            durationSeconds: usesStrengthPreset ? undefined : item.durationSeconds ? Number(item.durationSeconds) : undefined,
            restSeconds: usesStrengthPreset ? undefined : item.restSeconds ? Number(item.restSeconds) : undefined,
            loadText: usesStrengthPreset ? undefined : item.loadText || undefined,
            tempoText: usesStrengthPreset ? undefined : item.tempoText || undefined,
            notes: item.notes || undefined,
          };
        }),
      };

      const response = await requestJson<{ day: ProgramDay }>(
        `/api/v1/admin/program-templates/${selectedTemplateCode}/days/${selectedDay.dayNumber}/prescriptions`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
        accessToken,
      );

      setTemplateDays((currentDays) =>
        currentDays.map((day) => (day.dayNumber === response.day.dayNumber ? response.day : day)),
      );
      setPrescriptionsDraft(mapDayToDraft(response.day));
      setMessage(`Prescripciones del dia ${selectedDay.dayNumber} actualizadas.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron guardar las prescripciones");
    } finally {
      setLoading(false);
    }
  }

  async function handleTemplateDaysLoad(code: string, token = accessToken ?? undefined) {
    if (!token) return;
    try {
      const response = await requestJson<ProgramTemplateResponse>(`/api/v1/templates/program-templates/${code}`, {}, token);
      setTemplateDays(response.template.days);
      setSelectedDayNumber(response.template.days[0]?.dayNumber ?? 1);
    } catch {
      setTemplateDays([]);
    }
  }

  async function handleTemplateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    try {
      setLoading(true);
      setError("");
      const payload = {
        code: templateForm.code,
        name: templateForm.name,
        description: templateForm.description || undefined,
        cycleLengthDays: Number(templateForm.cycleLengthDays),
      };
      if (templateForm.id) {
        await requestJson(`/api/v1/admin/program-templates/${templateForm.code}`, { method: "PUT", body: JSON.stringify({ name: payload.name, description: payload.description, cycleLengthDays: payload.cycleLengthDays }) }, accessToken);
        setMessage("Programa actualizado.");
      } else {
        await requestJson("/api/v1/admin/program-templates", { method: "POST", body: JSON.stringify(payload) }, accessToken);
        setMessage("Programa creado.");
      }
      setTemplateModalOpen(false);
      setTemplateForm(emptyTemplateForm());
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Error al guardar el programa");
    } finally {
      setLoading(false);
    }
  }

  async function handleTemplateDelete(code: string) {
    if (!accessToken || !confirm(`¿Eliminar el programa "${code}"?`)) return;
    try {
      setLoading(true);
      setError("");
      await requestJson(`/api/v1/admin/program-templates/${code}`, { method: "DELETE" }, accessToken);
      setMessage("Programa eliminado.");
      if (selectedTemplateCode === code) {
        const remaining = allTemplates.filter((t) => t.code !== code);
        setSelectedTemplateCode(remaining[0]?.code ?? "JUMP-MANUAL-14D");
      }
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Error al eliminar el programa");
    } finally {
      setLoading(false);
    }
  }

  async function handleExclusionsUpdate(athleteProfileId: string, exerciseIds: string[]) {
    if (!accessToken) return;
    const athlete = allAthletes.find((a) => a.id === athleteProfileId);
    if (!athlete) return;
    try {
      setLoading(true);
      setError("");
      await requestJson(`/api/v1/admin/teams/${athlete.team?.id}/athletes/${athleteProfileId}/exclusions`, { method: "PUT", body: JSON.stringify({ exerciseIds }) }, accessToken);
      setMessage("Exclusiones actualizadas.");
      setExclusionsAthleteId("");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Error al guardar exclusiones");
    } finally {
      setLoading(false);
    }
  }

  async function handleTeamSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    const payload = {
      name: teamForm.name,
      slug: teamForm.slug,
      description: teamForm.description || undefined,
    };

    try {
      setLoading(true);
      setError("");

      if (teamForm.id) {
        await requestJson(
          `/api/v1/admin/teams/${teamForm.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setMessage("Equipo actualizado.");
      } else {
        const response = await requestJson<{ team: TeamRecord }>(
          "/api/v1/admin/teams",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setSelectedTeamId(response.team.id);
        setMessage("Equipo creado.");
      }

      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el equipo");
    } finally {
      setLoading(false);
    }
  }

  async function handleMemberSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !selectedTeamId) {
      setError("Selecciona o crea primero un equipo en la vista Usuarios antes de cargar staff.");
      return;
    }

    const payload = {
      email: memberForm.email,
      password: memberForm.password || undefined,
      firstName: memberForm.firstName || undefined,
      lastName: memberForm.lastName || undefined,
      role: memberForm.role,
    };

    try {
      setLoading(true);
      setError("");

      if (selectedMembershipId) {
        await requestJson(
          `/api/v1/admin/teams/${selectedTeamId}/members/${selectedMembershipId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setMessage("Staff actualizado.");
      } else {
        await requestJson(
          `/api/v1/admin/teams/${selectedTeamId}/members`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        setMessage(`Usuario ${memberForm.role === "COACH" ? "coach" : "team admin"} creado o asociado.`);
      }

      setSelectedMembershipId("");
      setMemberForm(emptyMemberForm());
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el staff");
    } finally {
      setLoading(false);
    }
  }

  async function handleAthleteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !selectedTeamId) {
      setError("Para crear un atleta primero debes crear o seleccionar un equipo en la vista Usuarios.");
      return;
    }

    const payload = {
      email: athleteForm.email,
      password: athleteForm.password || undefined,
      firstName: athleteForm.firstName || undefined,
      lastName: athleteForm.lastName || undefined,
      displayName: athleteForm.displayName || undefined,
      sport: athleteForm.sport || undefined,
      trainsSport: athleteForm.trainsSport,
      sportTrainingDays: athleteForm.trainsSport ? parseWeekdaysInput(athleteForm.sportTrainingDays) : [],
      seasonPhase: athleteForm.seasonPhase,
      availableWeekdays: parseWeekdaysInput(athleteForm.availableWeekdays),
      notes: athleteForm.notes || undefined,
    };

    try {
      setLoading(true);
      setError("");
      const response = await requestJson<{ athleteProfile: AthleteProfileRecord }>(
        selectedAthleteProfileId
          ? `/api/v1/admin/teams/${selectedTeamId}/athletes/${selectedAthleteProfileId}`
          : `/api/v1/admin/teams/${selectedTeamId}/athletes`,
        {
          method: selectedAthleteProfileId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
        accessToken,
      );
      setAthleteForm(emptyAthleteForm());
      setSelectedAthleteProfileId(response.athleteProfile.id);
      setMessage(selectedAthleteProfileId ? "Atleta actualizado." : "Atleta creado o actualizado y asociado al equipo.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el atleta");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignCoach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !selectedTeamId || !selectedAthleteProfileId || !selectedCoachUserId) {
      setError("Selecciona equipo, atleta y coach antes de guardar la asignacion.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/teams/${selectedTeamId}/athletes/${selectedAthleteProfileId}/assign-coach`,
        {
          method: "POST",
          body: JSON.stringify({ coachUserId: selectedCoachUserId }),
        },
        accessToken,
      );
      setMessage("Coach asignado al atleta.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo asignar el coach");
    } finally {
      setLoading(false);
    }
  }

  async function handleMemberDelete(membershipId: string) {
    if (!accessToken || !selectedTeamId) {
      return;
    }

    const confirmed = window.confirm("Se eliminara la membresia del staff seleccionado. Continuar?");
    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/teams/${selectedTeamId}/members/${membershipId}`,
        {
          method: "DELETE",
        },
        accessToken,
      );
      setSelectedMembershipId("");
      setMemberForm(emptyMemberForm());
      setMessage("Staff removido del equipo.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar el staff");
    } finally {
      setLoading(false);
    }
  }

  async function handleAthleteDelete(athleteProfileId = selectedAthleteProfileId) {
    if (!accessToken || !selectedTeamId || !athleteProfileId) {
      return;
    }

    const confirmed = window.confirm("Se dara de baja el atleta del equipo y se quitaran sus asignaciones de coach. Continuar?");
    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/teams/${selectedTeamId}/athletes/${athleteProfileId}`,
        {
          method: "DELETE",
        },
        accessToken,
      );
      if (athleteProfileId === selectedAthleteProfileId) {
        setSelectedAthleteProfileId("");
      }
      setAthleteForm(emptyAthleteForm());
      setMessage("Atleta removido del equipo.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo dar de baja el atleta");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignmentDelete(assignmentId: string) {
    if (!accessToken || !selectedTeamId || !selectedAthleteProfileId) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/teams/${selectedTeamId}/athletes/${selectedAthleteProfileId}/assignments/${assignmentId}`,
        {
          method: "DELETE",
        },
        accessToken,
      );
      setMessage("Asignacion coach-atleta eliminada.");
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar la asignacion");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateProgram(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !programGeneration.athleteProfileId || !programGeneration.startDate) {
      return;
    }

    const payload = {
      athleteProfileId: programGeneration.athleteProfileId,
      templateCode: programGeneration.templateCode,
      startDate: programGeneration.startDate,
      phase: programGeneration.phase || undefined,
      includePreparationPhase: programGeneration.includePreparationPhase,
      notes: programGeneration.notes || undefined,
    };

    try {
      setLoading(true);
      setError("");
      await requestJson(
        "/api/v1/admin/programs/generate",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        accessToken,
      );
      setMessage("Programa personalizado generado con sesiones programadas.");
      setProgramGeneration((current) => ({ ...current, notes: "" }));
      await refreshDashboard(accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo generar el programa");
    } finally {
      setLoading(false);
    }
  }

  async function handleSessionUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !selectedProgramSessionId) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await requestJson(
        `/api/v1/admin/sessions/${selectedProgramSessionId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: sessionEditor.title,
            scheduledDate: sessionEditor.scheduledDate,
            status: sessionEditor.status,
            notes: sessionEditor.notes || null,
          }),
        },
        accessToken,
      );
      setMessage("Sesion actualizada y reprogramada.");
      await loadProgramSessions(selectedProgramId, accessToken);
      await loadProgramSessionDetail(selectedProgramSessionId, accessToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo actualizar la sesion");
    } finally {
      setLoading(false);
    }
  }

  if (!accessToken) {
    return (
      <main className="page-shell auth-shell">
        <section className="hero-card login-card">
          <div className="hero-copy">
            <p className="eyebrow">3m30cm platform admin</p>
            <h1>Login para operar catalogo, equipos y programas personalizados.</h1>
            <p className="lede">
              El portal ya entra con JWT, administra catalogo y media, y ahora tambien gestiona equipos, atletas y la generacion del calendario personalizado.
            </p>
          </div>

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Email
              <input
                value={loginForm.email}
                onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                type="email"
                required
              />
            </label>
            <label>
              Password
              <input
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                type="password"
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar al portal"}
            </button>
            <p className="helper-text">Seed local: admin@3m30cm.local / Admin123!</p>
            {error ? <p className="feedback error">{error}</p> : null}
            {message ? <p className="feedback success">{message}</p> : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`app-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-logo">⚡</span>
          <span className="brand-name">3m30cm</span>
        </div>
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-item${adminView === "home" ? " active" : ""}`}
            onClick={() => setAdminView("home")}
            title="Inicio"
          >
            <span className="nav-icon">🏠</span>
            <span>Inicio</span>
          </button>
          <button
            type="button"
            className={`nav-item${adminView === "users" ? " active" : ""}`}
            onClick={() => setAdminView("users")}
            title="Usuarios"
          >
            <span className="nav-icon">👥</span>
            <span>Usuarios</span>
          </button>
          <button
            type="button"
            className={`nav-item${adminView === "training" ? " active" : ""}`}
            onClick={() => setAdminView("training")}
            title="Entrenamiento"
          >
            <span className="nav-icon">🏋️</span>
            <span>Entrenamiento</span>
          </button>
          <button
            type="button"
            className={`nav-item${adminView === "templates" ? " active" : ""}`}
            onClick={() => setAdminView("templates")}
            title="Programas"
          >
            <span className="nav-icon">🗂️</span>
            <span>Programas</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-user">{currentUser?.email}</span>
          <button
            type="button"
            className="sidebar-logout"
            onClick={handleLogout}
            title="Cerrar sesión"
          >
            <span className="nav-icon">🚪</span>
            <span>Salir</span>
          </button>
        </div>
      </aside>

      <div className={`app-main${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <header className="app-topbar">
          <button
            type="button"
            className="topbar-toggle"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {sidebarCollapsed ? "☰" : "✕"}
          </button>
          <h1 className="topbar-title">
            {adminView === "home" ? "Panel de control" : adminView === "users" ? "Usuarios" : adminView === "templates" ? "Programas" : "Entrenamiento"}
          </h1>
        </header>

        {error ? <p className="app-banner error">{error}</p> : null}
        {message ? <p className="app-banner success">{message}</p> : null}

        <div className="app-content">

          {adminView === "home" ? (
            <div className="home-view">
              <div className="home-metrics">
                <article className="home-metric-card">
                  <span className="home-metric-emoji">👥</span>
                  <strong className="home-metric-value">{summary?.users ?? 0}</strong>
                  <span className="home-metric-label">Usuarios</span>
                </article>
                <article className="home-metric-card">
                  <span className="home-metric-emoji">🏆</span>
                  <strong className="home-metric-value">{summary?.teams ?? 0}</strong>
                  <span className="home-metric-label">Equipos</span>
                </article>
                <article className="home-metric-card">
                  <span className="home-metric-emoji">🏃</span>
                  <strong className="home-metric-value">{summary?.athletes ?? 0}</strong>
                  <span className="home-metric-label">Atletas</span>
                </article>
                <article className="home-metric-card">
                  <span className="home-metric-emoji">💪</span>
                  <strong className="home-metric-value">{summary?.exercises ?? 0}</strong>
                  <span className="home-metric-label">Ejercicios</span>
                </article>
                <article className="home-metric-card">
                  <span className="home-metric-emoji">📋</span>
                  <strong className="home-metric-value">{summary?.programs ?? 0}</strong>
                  <span className="home-metric-label">Programas</span>
                </article>
                <article className="home-metric-card">
                  <span className="home-metric-emoji">📅</span>
                  <strong className="home-metric-value">{summary?.sessions ?? 0}</strong>
                  <span className="home-metric-label">Sesiones</span>
                </article>
              </div>

              <section className="panel-card">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Resumen de plataforma</p>
                    <h2>Distribución de recursos</h2>
                  </div>
                </div>
                <div className="home-chart">
                  {(
                    [
                      { label: "Usuarios", value: summary?.users ?? 0, emoji: "👥", color: "var(--accent)" },
                      { label: "Atletas", value: summary?.athletes ?? 0, emoji: "🏃", color: "var(--success)" },
                      { label: "Ejercicios", value: summary?.exercises ?? 0, emoji: "💪", color: "#0984e3" },
                      { label: "Programas", value: summary?.programs ?? 0, emoji: "📋", color: "#6c5ce7" },
                      { label: "Sesiones", value: summary?.sessions ?? 0, emoji: "📅", color: "var(--accent-soft)" },
                    ] as Array<{ label: string; value: number; emoji: string; color: string }>
                  ).map((item) => {
                    const max = Math.max(
                      summary?.users ?? 0,
                      summary?.athletes ?? 0,
                      summary?.exercises ?? 0,
                      summary?.programs ?? 0,
                      summary?.sessions ?? 0,
                      1,
                    );
                    const pct = Math.round((item.value / max) * 100);
                    return (
                      <div key={item.label} className="chart-bar-row">
                        <span className="chart-bar-label">{item.emoji} {item.label}</span>
                        <div className="chart-bar-track">
                          <div className="chart-bar-fill" style={{ width: `${pct}%`, background: item.color }} />
                        </div>
                        <span className="chart-bar-value">{item.value}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="helper-text" style={{ marginTop: 14 }}>
                  Totales actuales · recarga la página para actualizar
                </p>
              </section>

              <div className="home-actions">
                <section className="panel-card home-action-card">
                  <p className="eyebrow">Acceso rápido</p>
                  <h2>👥 Usuarios</h2>
                  <p className="helper-text">Gestiona equipos, coaches y atletas del sistema.</p>
                  <button type="button" className="primary-button" onClick={() => setAdminView("users")}>
                    Ir a Usuarios →
                  </button>
                </section>
                <section className="panel-card home-action-card">
                  <p className="eyebrow">Acceso rápido</p>
                  <h2>🏋️ Entrenamiento</h2>
                  <p className="helper-text">Ejercicios, plantilla base, programas y sesiones.</p>
                  <button type="button" className="primary-button" onClick={() => setAdminView("training")}>
                    Ir a Entrenamiento →
                  </button>
                </section>
              </div>
            </div>
          ) : null}

      {adminView === "training" ? (
      <>
      <section className="workspace-grid">
        <aside className="sidebar-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Catalogo</p>
              <h2>Ejercicios</h2>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSelectedExerciseId(null);
                setExerciseForm(emptyExerciseForm());
                setExerciseModalOpen(true);
              }}
            >
              Nuevo
            </button>
          </div>

          <input
            className="exercise-search"
            placeholder="Buscar ejercicio..."
            value={exerciseSearch}
            onChange={(event) => setExerciseSearch(event.target.value)}
          />

          <div className="exercise-list">
            {exercises
              .filter((exercise) =>
                exerciseSearch
                  ? exercise.name.toLowerCase().includes(exerciseSearch.toLowerCase()) ||
                    exercise.category.toLowerCase().includes(exerciseSearch.toLowerCase())
                  : true,
              )
              .map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  className={`list-item ${selectedExerciseId === exercise.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedExerciseId(exercise.id);
                    setExerciseModalOpen(true);
                  }}
                >
                  <strong>{exercise.name}</strong>
                  <div className="exercise-badges">
                    <span className="category-badge">{exercise.category}</span>
                    {exercise.isBlock ? <span className="block-badge">⬣ Bloque</span> : null}
                    {exercise.defaultSeriesProtocol === "STRENGTH_EXPLOSION" ? <span className="series-badge">Fuerza</span> : null}
                    {exercise.perLeg ? <span className="perleg-badge">Por pierna</span> : null}
                    {exercise.requiresLoad ? <span className="load-badge">Con carga</span> : null}
                    {exercise.mediaAssets.some((a) => a.kind === "IMAGE") ? <span className="media-badge">🖼</span> : null}
                    {exercise.mediaAssets.some((a) => a.kind === "GIF") ? <span className="media-badge">GIF</span> : null}
                    {exercise.mediaAssets.some((a) => a.kind === "VIDEO") ? <span className="media-badge">▶</span> : null}
                  </div>
                </button>
              ))}
          </div>
        </aside>

        <section className="editor-column">
          <article className="panel-card">
            <div className="section-header">
              <div>
                <p className="eyebrow">Plantilla base</p>
                <h2>Prescripciones por dia</h2>
              </div>
              <label className="day-picker">
                Dia
                <select value={selectedDayNumber} onChange={(event) => setSelectedDayNumber(Number(event.target.value))}>
                  {templateDays.map((day) => (
                    <option key={day.id} value={day.dayNumber}>
                      Dia {day.dayNumber} - {day.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="prescription-toolbar">
              <div>
                <strong>{selectedDay?.title ?? "Sin dia seleccionado"}</strong>
                <p>{selectedDay?.dayType ?? ""}{prescriptionsDraft.length > 0 ? ` · ${prescriptionsDraft.length} ejercicio${prescriptionsDraft.length !== 1 ? "s" : ""}` : ""}</p>
              </div>
              <div className="action-row compact-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setPrescriptionsDraft((current) => [
                      ...current,
                      emptyPrescription(current.length + 1, exerciseOptions[0]?.id ?? ""),
                    ]);
                    setSelectedPrescriptionIdx(prescriptionsDraft.length);
                  }}
                >
                  Agregar fila
                </button>
                <button className="primary-button" type="button" onClick={handlePrescriptionsSave} disabled={loading || !prescriptionsDraft.length}>
                  Guardar dia
                </button>
              </div>
            </div>

            {/* Dot navigator */}
            {prescriptionsDraft.length > 0 && (
              <div className="presc-nav">
                {prescriptionsDraft.map((row, index) => (
                  <button
                    key={`dot-${row.id ?? "new"}-${index}`}
                    type="button"
                    className={`presc-dot${selectedPrescriptionIdx === index ? " active" : ""}`}
                    onClick={() => setSelectedPrescriptionIdx(index)}
                    title={exerciseOptions.find((e) => e.id === row.exerciseId)?.name ?? `#${index + 1}`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="prescription-table">
              {prescriptionsDraft.map((row, index) => {
                if (index !== selectedPrescriptionIdx) {
                  return null;
                }

                const exercise = exerciseById.get(row.exerciseId);
                const usesStrengthPreset = exercise?.defaultSeriesProtocol === "STRENGTH_EXPLOSION";
                const strengthPreview = strengthSeriesPreview();
                const effectiveSeriesProtocol = usesStrengthPreset ? "STRENGTH_EXPLOSION" : row.seriesProtocol;

                return (
                  <div key={`${row.id ?? "new"}-${index}`} className="prescription-card">
                    <div className="presc-row-top">
                      <label className="presc-field-wide">
                        Ejercicio
                        <select
                          value={row.exerciseId}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? {
                                      ...entry,
                                      exerciseId: event.target.value,
                                      seriesProtocol:
                                        exerciseById.get(event.target.value)?.defaultSeriesProtocol === "STRENGTH_EXPLOSION"
                                          ? "NONE"
                                          : entry.seriesProtocol,
                                    }
                                  : entry,
                              ),
                            )
                          }
                        >
                          <option value="">Selecciona</option>
                          {exerciseOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {usesStrengthPreset ? (
                        <div className="series-hint strength presc-field-sm">
                          <strong>{seriesProtocolLabel("STRENGTH_EXPLOSION")}</strong>
                          <span>Se toma directo del ejercicio. No hace falta editar sets/carga aqui.</span>
                        </div>
                      ) : (
                        <label className="presc-field-sm">
                          Serie
                          <select
                            value={row.seriesProtocol}
                            onChange={(event) =>
                              setPrescriptionsDraft((current) =>
                                current.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, seriesProtocol: event.target.value as PrescriptionRecord["seriesProtocol"] }
                                    : entry,
                                ),
                              )
                            }
                          >
                            <option value="NONE">Sin serie especial</option>
                            <option value="PLYOMETRIC_SPEED">Serie pliometrica</option>
                          </select>
                        </label>
                      )}
                      <label className="presc-field-sm">
                        Bloque
                        <input
                          value={row.blockLabel}
                          placeholder="A, B…"
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, blockLabel: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-xs">
                        #
                        <input
                          type="number"
                          value={row.orderIndex}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, orderIndex: Number(event.target.value) || index + 1 } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>

                    {effectiveSeriesProtocol === "PLYOMETRIC_SPEED" ? (
                      <div className="series-hint plyometric">
                        <strong>Serie pliometrica</strong>
                        <span>{plyometricSeriesReminder}</span>
                        <span>Tip: usa un objetivo externo y subelo progresivamente cuando sea posible.</span>
                      </div>
                    ) : null}

                    {usesStrengthPreset ? (
                      <div className="series-hint strength">
                        <strong>Serie de fuerza y explosion</strong>
                        <span>{strengthSeriesSummary}</span>
                        <span>{strengthSeriesReminder}</span>
                        <span>Tip de carga: {strengthSeriesLoadHint}</span>
                      </div>
                    ) : null}

                    <div className="presc-row-params">
                      <label className="presc-field-xs">
                        Sets
                        <input
                          type="number"
                          value={usesStrengthPreset ? strengthPreview.sets : row.sets}
                          disabled={usesStrengthPreset}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, sets: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-sm">
                        Reps / texto
                        <input
                          value={usesStrengthPreset ? strengthPreview.repsText : row.repsText}
                          disabled={usesStrengthPreset}
                          placeholder="ej. 8 o AMRAP"
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, repsText: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-xs">
                        Dur. s
                        <input
                          type="number"
                          value={row.durationSeconds}
                          disabled={usesStrengthPreset}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, durationSeconds: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-xs">
                        Desc. s
                        <input
                          type="number"
                          value={usesStrengthPreset ? strengthPreview.restSeconds : row.restSeconds}
                          disabled={usesStrengthPreset}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, restSeconds: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-sm">
                        Carga
                        <input
                          value={usesStrengthPreset ? strengthPreview.loadText : row.loadText}
                          disabled={usesStrengthPreset}
                          placeholder="ej. 70% 1RM"
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, loadText: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-sm">
                        Tempo
                        <input
                          value={usesStrengthPreset ? strengthPreview.tempoText : row.tempoText}
                          disabled={usesStrengthPreset}
                          placeholder="ej. 3-1-3"
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, tempoText: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="presc-field-wide">
                        Notas
                        <input
                          value={row.notes}
                          placeholder={effectiveSeriesProtocol === "PLYOMETRIC_SPEED" ? plyometricSeriesReminder : "Notas extra"}
                          onChange={(event) =>
                            setPrescriptionsDraft((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <span className="helper-text">Activo: {seriesProtocolLabel(effectiveSeriesProtocol)}</span>
                      <button
                        className="ghost-button danger-text"
                        type="button"
                        onClick={() => {
                          setPrescriptionsDraft((current) =>
                            current
                              .filter((_, entryIndex) => entryIndex !== index)
                              .map((entry, entryIndex) => ({ ...entry, orderIndex: entryIndex + 1 })),
                          );
                          setSelectedPrescriptionIdx(Math.max(0, index - 1));
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      </section>

      {exerciseModalOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) setExerciseModalOpen(false);
          }}
        >
          <div className="modal-panel">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Ejercicio</p>
                <h2>{exerciseForm.id ? "Editar ejercicio" : "Nuevo ejercicio"}</h2>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setExerciseModalOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="modal-body">
              <form className="stack-form" onSubmit={handleExerciseSubmit}>
                <div className="form-grid">
                  <label>
                    Nombre
                    <input
                      value={exerciseForm.name}
                      onChange={(event) =>
                        setExerciseForm((current) => ({
                          ...current,
                          name: event.target.value,
                          slug: current.id ? current.slug : slugify(event.target.value),
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Slug
                    <input
                      value={exerciseForm.slug}
                      onChange={(event) => setExerciseForm((current) => ({ ...current, slug: slugify(event.target.value) }))}
                      required
                    />
                  </label>
                  <label>
                    Categoria
                    <input
                      value={exerciseForm.category}
                      onChange={(event) => setExerciseForm((current) => ({ ...current, category: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Equipamiento
                    <input
                      value={exerciseForm.equipment}
                      onChange={(event) => setExerciseForm((current) => ({ ...current, equipment: event.target.value }))}
                    />
                  </label>
                </div>

                <label>
                  Descripcion
                  <textarea
                    value={exerciseForm.description}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, description: event.target.value }))}
                    rows={3}
                  />
                </label>

                <label>
                  Resumen tecnico
                  <textarea
                    value={exerciseForm.summary}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, summary: event.target.value }))}
                    rows={2}
                    required
                  />
                </label>

                <label>
                  Pasos / ejecucion
                  <textarea
                    value={exerciseForm.steps}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, steps: event.target.value }))}
                    rows={5}
                    required
                  />
                </label>

                <label>
                  Notas de seguridad
                  <textarea
                    value={exerciseForm.safetyNotes}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, safetyNotes: event.target.value }))}
                    rows={3}
                  />
                </label>

                <label>
                  Serie base del ejercicio
                  <select
                    value={exerciseForm.defaultSeriesProtocol}
                    onChange={(event) =>
                      setExerciseForm((current) => ({
                        ...current,
                        defaultSeriesProtocol: event.target.value as ExerciseFormState["defaultSeriesProtocol"],
                      }))
                    }
                  >
                    <option value="NONE">Sin serie especial</option>
                    <option value="STRENGTH_EXPLOSION">Serie de fuerza y explosion</option>
                  </select>
                </label>

                {exerciseForm.defaultSeriesProtocol === "STRENGTH_EXPLOSION" ? (
                  <div className="series-hint strength">
                    <strong>Preset activo para este ejercicio</strong>
                    <span>{strengthSeriesSummary}</span>
                    <span>{strengthSeriesReminder}</span>
                    <span>Tip de carga: {strengthSeriesLoadHint}</span>
                  </div>
                ) : null}

                <p className="helper-text">La serie pliometrica no se fija aqui: se marca por prescripcion en cada dia para enfatizar maxima intensidad y velocidad.</p>

                <label className="checkbox-row">
                  <input
                    checked={exerciseForm.requiresLoad}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, requiresLoad: event.target.checked }))}
                    type="checkbox"
                  />
                  Requiere carga externa
                </label>

                <label className="checkbox-row">
                  <input
                    checked={exerciseForm.perLeg}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, perLeg: event.target.checked }))}
                    type="checkbox"
                  />
                  Se ejecuta por pierna
                </label>

                <label className="checkbox-row">
                  <input
                    checked={exerciseForm.isBlock}
                    onChange={(event) => setExerciseForm((current) => ({ ...current, isBlock: event.target.checked }))}
                    type="checkbox"
                  />
                  Es un bloque (contiene mini-ejercicios)
                </label>

                <div className="action-row">
                  <button className="primary-button" type="submit" disabled={loading}>
                    {exerciseForm.id ? "Guardar ejercicio" : "Crear ejercicio"}
                  </button>
                  {exerciseForm.id ? (
                    <button className="danger-button" type="button" onClick={handleExerciseDelete} disabled={loading}>
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </form>

              {exerciseForm.id ? (
                <div className="modal-section">
                  <div className="section-header modal-section-title">
                    <div>
                      <p className="eyebrow">Media</p>
                      <h2>Assets del ejercicio</h2>
                    </div>
                  </div>

                  <form className="stack-form" onSubmit={handleMediaUpload}>
                    <div className="form-grid">
                      <label>
                        Tipo
                        <select
                          value={uploadState.kind}
                          onChange={(event) =>
                            setUploadState((current) => ({ ...current, kind: event.target.value as MediaKind }))
                          }
                        >
                          <option value="IMAGE">Imagen</option>
                          <option value="GIF">GIF</option>
                          <option value="VIDEO">Video</option>
                        </select>
                      </label>
                      <label>
                        Titulo
                        <input
                          value={uploadState.title}
                          onChange={(event) => setUploadState((current) => ({ ...current, title: event.target.value }))}
                        />
                      </label>
                      <label>
                        Archivo
                        <input
                          type="file"
                          onChange={(event) =>
                            setUploadState((current) => ({ ...current, file: event.target.files?.[0] ?? null }))
                          }
                          required
                        />
                      </label>
                    </div>

                    <label className="checkbox-row">
                      <input
                        checked={uploadState.isPrimary}
                        onChange={(event) =>
                          setUploadState((current) => ({ ...current, isPrimary: event.target.checked }))
                        }
                        type="checkbox"
                      />
                      Marcar como asset principal
                    </label>

                    <button className="secondary-button" type="submit" disabled={loading || !uploadState.file}>
                      Subir a MinIO
                    </button>
                  </form>

                  <div className="media-grid">
                    {selectedExercise?.mediaAssets.length ? (
                      selectedExercise.mediaAssets.map((asset) => (
                        <article key={asset.id} className="media-card">
                          <div>
                            <strong>{asset.title || asset.kind}</strong>
                            <p>{asset.isPrimary ? "Principal" : asset.kind}</p>
                          </div>
                          {asset.url ? (
                            <a href={asset.url} target="_blank" rel="noreferrer">
                              Abrir asset
                            </a>
                          ) : null}
                          <button className="ghost-button danger-text" type="button" onClick={() => handleMediaDelete(asset.id)}>
                            Eliminar
                          </button>
                        </article>
                      ))
                    ) : (
                      <p className="helper-text">Todavia no hay media asociada a este ejercicio.</p>
                    )}
                  </div>
                </div>
              ) : null}

              {/* ── Block Items Editor (only for isBlock exercises that are saved) ── */}
              {exerciseForm.id && exerciseForm.isBlock ? (
                <div className="modal-section">
                  <div className="section-header modal-section-title">
                    <div>
                      <p className="eyebrow">Estructura</p>
                      <h2>Mini-ejercicios del bloque</h2>
                    </div>
                  </div>

                  <form className="stack-form" onSubmit={handleSaveBlockItems}>
                    {/* Add item row */}
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <label style={{ flex: 1 }}>
                        Añadir ejercicio
                        <select
                          defaultValue=""
                          onChange={(event) => {
                            const exId = event.target.value;
                            if (!exId) return;
                            event.target.value = "";
                            setBlockDraft((prev) => [
                              ...prev,
                              { _key: `${exId}-${Date.now()}`, exerciseId: exId, order: prev.length, setsOverride: "", repsKind: "reps" as const, repsOverride: "", notes: "" },
                            ]);
                          }}
                        >
                          <option value="">— seleccionar —</option>
                          {exercises
                            .filter((ex) => ex.id !== exerciseForm.id && !blockDraft.some((d) => d.exerciseId === ex.id))
                            .map((ex) => (
                              <option key={ex.id} value={ex.id}>{ex.name}</option>
                            ))}
                        </select>
                      </label>
                    </div>

                    {/* Current items */}
                    {blockDraft.map((item, idx) => {
                      const exName = exercises.find((e) => e.id === item.exerciseId)?.name ?? item.exerciseId;
                      return (
                        <div key={item._key} className="block-item-row">
                          <div className="block-item-info">
                            <span className="block-item-num">{idx + 1}</span>
                            <strong>{exName}</strong>
                          </div>
                          <div className="block-item-fields">
                            <label>
                              Series
                              <input
                                type="number"
                                min={1}
                                value={item.setsOverride}
                                placeholder="—"
                                onChange={(e) => setBlockDraft((prev) => prev.map((d, i) => i === idx ? { ...d, setsOverride: e.target.value } : d))}
                                style={{ width: 60 }}
                              />
                            </label>
                            <label>
                              Tipo
                              <select
                                value={item.repsKind}
                                onChange={(e) => setBlockDraft((prev) => prev.map((d, i) => i === idx ? { ...d, repsKind: e.target.value as "reps" | "time", repsOverride: "" } : d))}
                                style={{ width: 90 }}
                              >
                                <option value="reps">Reps</option>
                                <option value="time">Tiempo</option>
                              </select>
                            </label>
                            <label>
                              {item.repsKind === "reps" ? "N° reps" : "Duración"}
                              <input
                                value={item.repsOverride}
                                placeholder={item.repsKind === "reps" ? "ej. 6" : "ej. 30s"}
                                onChange={(e) => setBlockDraft((prev) => prev.map((d, i) => i === idx ? { ...d, repsOverride: e.target.value } : d))}
                                style={{ width: 90 }}
                              />
                            </label>
                            <label>
                              Notas
                              <input
                                value={item.notes}
                                placeholder="opcional"
                                onChange={(e) => setBlockDraft((prev) => prev.map((d, i) => i === idx ? { ...d, notes: e.target.value } : d))}
                                style={{ width: 130 }}
                              />
                            </label>
                          </div>
                          <div className="block-item-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={idx === 0}
                              onClick={() => setBlockDraft((prev) => {
                                const next = [...prev];
                                const tmp = next[idx - 1]!;
                                next[idx - 1] = next[idx]!;
                                next[idx] = tmp;
                                return next;
                              })}
                            >↑</button>
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={idx === blockDraft.length - 1}
                              onClick={() => setBlockDraft((prev) => {
                                const next = [...prev];
                                const tmp = next[idx]!;
                                next[idx] = next[idx + 1]!;
                                next[idx + 1] = tmp;
                                return next;
                              })}
                            >↓</button>
                            <button
                              type="button"
                              className="ghost-button danger-text"
                              onClick={() => setBlockDraft((prev) => prev.filter((_, i) => i !== idx))}
                            >✕</button>
                          </div>
                        </div>
                      );
                    })}

                    <button className="primary-button" type="submit" disabled={loading}>
                      Guardar estructura del bloque
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      </>
      ) : null}

      {adminView === "users" ? (
      <section className="management-grid">
        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Organizacion</p>
              <h2>Equipos y staff</h2>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSelectedTeamId(null);
                setTeamForm(emptyTeamForm());
              }}
            >
              Nuevo equipo
            </button>
          </div>

          <div className="team-list">
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                className={`list-item ${selectedTeamId === team.id ? "active" : ""}`}
                onClick={() => setSelectedTeamId(team.id)}
              >
                <strong>{team.name}</strong>
                <span>{team.slug}</span>
              </button>
            ))}
          </div>

          <form className="stack-form section-spacer" onSubmit={handleTeamSubmit}>
            <div className="form-grid">
              <label>
                Nombre del equipo
                <input
                  value={teamForm.name}
                  onChange={(event) =>
                    setTeamForm((current) => ({
                      ...current,
                      name: event.target.value,
                      slug: current.id ? current.slug : slugify(event.target.value),
                    }))
                  }
                  required
                />
              </label>
              <label>
                Slug
                <input
                  value={teamForm.slug}
                  onChange={(event) => setTeamForm((current) => ({ ...current, slug: slugify(event.target.value) }))}
                  required
                />
              </label>
            </div>

            <label>
              Descripcion
              <textarea
                value={teamForm.description}
                onChange={(event) => setTeamForm((current) => ({ ...current, description: event.target.value }))}
                rows={3}
              />
            </label>

            <div className="action-row">
              <button className="primary-button" type="submit" disabled={loading}>
                {teamForm.id ? "Guardar equipo" : "Crear equipo"}
              </button>
            </div>
          </form>

          <form className="stack-form section-spacer" onSubmit={handleMemberSubmit}>
            <div className="section-header compact-header">
              <div>
              <p className="eyebrow">Staff</p>
                <h3>{selectedTeam ? `Alta sobre ${selectedTeam.name}` : "Selecciona un equipo"}</h3>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setSelectedMembershipId("");
                  setMemberForm(emptyMemberForm());
                }}
              >
                Nuevo staff
              </button>
            </div>
            <div className="form-grid">
              <label>
                Rol
                <select
                  value={memberForm.role}
                  onChange={(event) =>
                    setMemberForm((current) => ({ ...current, role: event.target.value as MemberFormState["role"] }))
                  }
                >
                  <option value="COACH">Coach</option>
                  <option value="TEAM_ADMIN">Team admin</option>
                </select>
              </label>
              <label>
                Email
                <input
                  value={memberForm.email}
                  onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))}
                  type="email"
                  required
                />
              </label>
              <label>
                Nombre
                <input
                  value={memberForm.firstName}
                  onChange={(event) => setMemberForm((current) => ({ ...current, firstName: event.target.value }))}
                />
              </label>
              <label>
                Apellido
                <input
                  value={memberForm.lastName}
                  onChange={(event) => setMemberForm((current) => ({ ...current, lastName: event.target.value }))}
                />
              </label>
              <label>
                Password inicial
                <input
                  value={memberForm.password}
                  onChange={(event) => setMemberForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
            </div>

            <div className="action-row compact-row">
              <button className="secondary-button" type="submit" disabled={loading || !selectedTeamId}>
                {selectedMembershipId ? "Guardar staff" : "Crear o asociar staff"}
              </button>
              {selectedMembershipId ? (
                <button className="danger-button" type="button" disabled={loading} onClick={() => handleMemberDelete(selectedMembershipId)}>
                  Quitar staff
                </button>
              ) : null}
            </div>
          </form>

          {selectedTeam ? (
            <div className="detail-stack section-spacer">
              <div>
                <p className="eyebrow">Miembros actuales</p>
                <div className="detail-list">
                  {selectedTeamStaff.map((membership) => (
                    <article key={membership.id} className="detail-card">
                      <strong>{displayName(membership.user)}</strong>
                      <span>{membership.user.email}</span>
                      <p>{membership.role}</p>
                      <div className="action-row compact-row left-row">
                        <button className="ghost-button" type="button" onClick={() => setSelectedMembershipId(membership.id)}>
                          Editar
                        </button>
                        <button className="ghost-button danger-text" type="button" onClick={() => handleMemberDelete(membership.id)}>
                          Quitar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="helper-text section-spacer">Crea un equipo para cargar coaches, team admins y atletas.</p>
          )}
        </article>

        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Atletas</p>
              <h2>Atletas y coaches</h2>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setSelectedAthleteProfileId("");
                setAthleteForm(emptyAthleteForm());
              }}
            >
              Nuevo atleta
            </button>
          </div>

          <div className={`workflow-note ${canCreateAthlete ? "" : "warning-note"}`}>
            <strong>Orden recomendado</strong>
            <p>
              1. Crea o selecciona un equipo. 2. Crea staff y coaches si aplica. 3. Crea el atleta dentro de ese equipo. 4. Asigna coach opcionalmente. 5. Ve a Entrenamiento para generar programa y sesiones.
            </p>
          </div>

          <div className="detail-list compact-detail-list section-spacer">
            <article className="detail-card">
              <strong>Equipo activo</strong>
              <span>{selectedTeam?.name ?? "Sin seleccionar"}</span>
              <p>{selectedTeam ? `${selectedTeamAthleteCount} atletas · ${selectedTeamCoachCount} coaches` : "Selecciona un equipo para habilitar el alta."}</p>
            </article>
            <article className="detail-card">
              <strong>Alta de atleta</strong>
              <span>{canCreateAthlete ? "Habilitada" : "Bloqueada"}</span>
              <p>{canCreateAthlete ? "El atleta se crea o asocia directamente al equipo activo." : "Sin equipo activo no se puede crear ni asociar atleta."}</p>
            </article>
          </div>

          <form className="stack-form" onSubmit={handleAthleteSubmit}>
            <div className="form-grid">
              <label>
                Email
                <input
                  value={athleteForm.email}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, email: event.target.value }))}
                  type="email"
                  required
                />
              </label>
              <label>
                Password inicial
                <input
                  value={athleteForm.password}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <label>
                Nombre
                <input
                  value={athleteForm.firstName}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, firstName: event.target.value }))}
                />
              </label>
              <label>
                Apellido
                <input
                  value={athleteForm.lastName}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, lastName: event.target.value }))}
                />
              </label>
              <label>
                Display name
                <input
                  value={athleteForm.displayName}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, displayName: event.target.value }))}
                />
              </label>
              <label>
                Deporte
                <input
                  value={athleteForm.sport}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, sport: event.target.value }))}
                />
              </label>
              <label className="checkbox-label">
                <input
                  checked={athleteForm.trainsSport}
                  onChange={(event) => setAthleteForm((current) => ({ ...current, trainsSport: event.target.checked }))}
                  type="checkbox"
                />
                Entrena deporte o pista ademas del programa
              </label>
              <label>
                Fase
                <select
                  value={athleteForm.seasonPhase}
                  onChange={(event) =>
                    setAthleteForm((current) => ({ ...current, seasonPhase: event.target.value as SeasonPhase }))
                  }
                >
                  {seasonPhaseOptions.map((phase) => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Dias disponibles
                <input
                  value={athleteForm.availableWeekdays}
                  onChange={(event) =>
                    setAthleteForm((current) => ({ ...current, availableWeekdays: event.target.value }))
                  }
                  placeholder="1,3,5"
                />
              </label>
              <label>
                Dias de deporte/pista
                <input
                  value={athleteForm.sportTrainingDays}
                  onChange={(event) =>
                    setAthleteForm((current) => ({ ...current, sportTrainingDays: event.target.value }))
                  }
                  placeholder="2,4"
                />
              </label>
            </div>

            <label>
              Notas
              <textarea
                value={athleteForm.notes}
                onChange={(event) => setAthleteForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
              />
            </label>

            <p className="helper-text">
              Si el email ya existe, el sistema asociara ese usuario al equipo como atleta. Si es un alta nueva y quieres que pueda entrar de inmediato, define una password inicial.
            </p>

            <div className="action-row compact-row">
              <button className="secondary-button" type="submit" disabled={loading || !selectedTeamId}>
                {selectedAthleteProfileId ? "Guardar atleta" : "Crear o asociar atleta"}
              </button>
              {selectedAthleteProfileId ? (
                <button className="danger-button" type="button" disabled={loading} onClick={() => void handleAthleteDelete()}>
                  Dar de baja
                </button>
              ) : null}
            </div>
          </form>

          <div className="detail-stack section-spacer">
            <div className="section-header">
              <div>
                <p className="eyebrow">Roster</p>
                <h3>{selectedTeam ? selectedTeam.name : "Selecciona un equipo"}</h3>
              </div>
              <label className="day-picker mini-picker">
                Atleta activo
                <select
                  value={selectedAthleteProfileId}
                  onChange={(event) => setSelectedAthleteProfileId(event.target.value)}
                  disabled={!selectedTeam?.athletes.length}
                >
                  <option value="">Selecciona</option>
                  {selectedTeam?.athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="detail-list">
              {selectedTeam?.athletes.map((athlete) => (
                <article
                  key={athlete.id}
                  className={`detail-card ${selectedAthleteProfileId === athlete.id ? "highlight-card" : ""}`}
                >
                  <strong>{athlete.displayName}</strong>
                  <span>{athlete.user.email}</span>
                  <p>{athlete.sport || "Sin deporte"}</p>
                  <small>{formatWeekdaySummary(athleteWeekdays(athlete))}</small>
                  {athlete.trainsSport ? <small>Deporte/pista: {formatWeekdaySummary(athleteSportWeekdays(athlete))}</small> : null}
                  <div className="action-row compact-row left-row">
                    <button className="ghost-button" type="button" onClick={() => setSelectedAthleteProfileId(athlete.id)}>
                      Editar
                    </button>
                    <button className="ghost-button danger-text" type="button" onClick={() => void handleAthleteDelete(athlete.id)}>
                      Baja
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <form className="stack-form section-spacer" onSubmit={handleAssignCoach}>
            <div>
              <p className="eyebrow">Asignacion</p>
              <h3>Coach principal</h3>
            </div>
            <div className="form-grid">
              <label>
                Atleta
                <select
                  value={selectedAthleteProfileId}
                  onChange={(event) => setSelectedAthleteProfileId(event.target.value)}
                  disabled={!selectedTeam?.athletes.length}
                >
                  <option value="">Selecciona</option>
                  {selectedTeam?.athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Coach
                <select
                  value={selectedCoachUserId}
                  onChange={(event) => setSelectedCoachUserId(event.target.value)}
                  disabled={!selectedTeamCoaches.length}
                >
                  <option value="">Selecciona</option>
                  {selectedTeamCoaches.map((coach) => (
                    <option key={coach.user.id} value={coach.user.id}>
                      {displayName(coach.user)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="secondary-button" type="submit" disabled={loading || !selectedAthleteProfileId || !selectedCoachUserId}>
              Asignar coach
            </button>
          </form>

          {selectedAthlete ? (
            <div className="detail-stack section-spacer">
              <div>
                <p className="eyebrow">Atleta activo</p>
                <div className="detail-card highlight-card">
                  <strong>{selectedAthlete.displayName}</strong>
                  <span>{selectedAthlete.user.email}</span>
                  <p>
                    {selectedAthlete.sport || "Sin deporte"} · {selectedAthlete.seasonPhase}
                  </p>
                  <small>Disponibilidad: {formatWeekdaySummary(athleteWeekdays(selectedAthlete))}</small>
                  <small>
                    Contexto deporte: {selectedAthlete.trainsSport ? formatWeekdaySummary(athleteSportWeekdays(selectedAthlete)) : "No declarado"}
                  </small>
                  <small>
                    Coaches: {selectedAthlete.coachAssignments.length ? selectedAthlete.coachAssignments.map((assignment) => displayName(assignment.coach)).join(", ") : "Sin asignar"}
                  </small>
                  {selectedAthlete.coachAssignments.length ? (
                    <div className="chip-row">
                      {selectedAthlete.coachAssignments.map((assignment) => (
                        <div key={assignment.id} className="session-chip removable-chip">
                          <span>{displayName(assignment.coach)}</span>
                          <button className="chip-action" type="button" onClick={() => handleAssignmentDelete(assignment.id)}>
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {teamlessAthletes.length ? (
            <div className="detail-stack section-spacer">
              <div>
                <p className="eyebrow">Autoregistro</p>
                <h3>Atletas creados desde la app</h3>
              </div>
              <div className="detail-list">
                {teamlessAthletes.map((athlete) => (
                  <article key={athlete.id} className="detail-card">
                    <strong>{athlete.displayName}</strong>
                    <span>{athlete.user.email}</span>
                    <p>{athlete.sport || "Sin deporte"} · {athlete.seasonPhase}</p>
                    <small>Disponibilidad jump: {formatWeekdaySummary(athleteWeekdays(athlete))}</small>
                    <small>Deporte/pista: {athlete.trainsSport ? formatWeekdaySummary(athleteSportWeekdays(athlete)) : "No declarado"}</small>
                    <small>{athlete.onboardingCompletedAt ? `Onboarding ${new Date(athlete.onboardingCompletedAt).toLocaleDateString()}` : "Onboarding pendiente"}</small>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </section>
      ) : null}

      {adminView === "training" ? (
      <section className="management-grid">
        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Programas</p>
              <h2>Generacion y seguimiento</h2>
            </div>
          </div>

          <div className="workflow-note">
            <strong>Como se relacionan con sesiones</strong>
            <p>
              El programa personalizado define el bloque de trabajo de un atleta. Las sesiones son las instancias calendarizadas que se generan automaticamente desde ese programa y luego se editan en esta misma vista.
            </p>
          </div>

          <form className="stack-form section-spacer" onSubmit={handleGenerateProgram}>
            <div>
              <p className="eyebrow">Generador</p>
              <h3>Programa personalizado + sesiones</h3>
            </div>
            <div className="form-grid">
              <label>
                Atleta
                <select
                  value={programGeneration.athleteProfileId}
                  onChange={(event) =>
                    setProgramGeneration((current) => ({ ...current, athleteProfileId: event.target.value }))
                  }
                  required
                >
                  <option value="">Selecciona</option>
                  {allAthletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.displayName} · {athlete.team?.name ?? "Sin equipo"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Inicio
                <input
                  value={programGeneration.startDate}
                  onChange={(event) => setProgramGeneration((current) => ({ ...current, startDate: event.target.value }))}
                  type="date"
                  required
                />
              </label>
              <label>
                Programa
                <select
                  value={programGeneration.templateCode}
                  onChange={(event) => setProgramGeneration((current) => ({ ...current, templateCode: event.target.value }))}
                  required
                >
                  {allTemplates.map((tmpl) => (
                    <option key={tmpl.code} value={tmpl.code}>
                      {tmpl.name}
                    </option>
                  ))}
                  {!allTemplates.length ? <option value="JUMP-MANUAL-14D">Jump Manual 14D</option> : null}
                </select>
              </label>
              <label>
                Fase override
                <select
                  value={programGeneration.phase}
                  onChange={(event) =>
                    setProgramGeneration((current) => ({
                      ...current,
                      phase: event.target.value as ProgramGenerationState["phase"],
                    }))
                  }
                >
                  <option value="">Usar perfil del atleta</option>
                  {seasonPhaseOptions.map((phase) => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  checked={programGeneration.includePreparationPhase}
                  onChange={(event) =>
                    setProgramGeneration((current) => ({ ...current, includePreparationPhase: event.target.checked }))
                  }
                  type="checkbox"
                />
                Incluir 3 semanas de adecuacion y prevencion
              </label>
            </div>

            {selectedProgramAthlete ? (
              <div className="workflow-note">
                <strong>Contexto del atleta</strong>
                <p>
                  {selectedProgramAthlete.sport || "Sin deporte"} · jump {formatWeekdaySummary(athleteWeekdays(selectedProgramAthlete))} · deporte/pista {selectedProgramAthlete.trainsSport ? formatWeekdaySummary(athleteSportWeekdays(selectedProgramAthlete)) : "No declarado"}
                </p>
                <p>
                  {programGeneration.includePreparationPhase
                    ? "Se generara primero un bloque de 3 semanas con isometricos, aterrizajes y bajo impacto para llegar mejor al inicio del programa principal."
                    : "Se omitira la fase previa y se entrara directo al bloque principal. Usalo solo si el atleta ya tolera bien la carga."}
                </p>
              </div>
            ) : null}

            <label>
              Notas del programa
              <textarea
                value={programGeneration.notes}
                onChange={(event) => setProgramGeneration((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
              />
            </label>

            <button className="primary-button" type="submit" disabled={loading || !programGeneration.athleteProfileId}>
              Generar programa
            </button>
          </form>

          <div className="detail-stack section-spacer">
            <div>
              <p className="eyebrow">Programas recientes</p>
              <div className="program-list">
                {programs.length ? (
                  programs.map((program) => (
                    <article key={program.id} className="detail-card program-card">
                      <strong>{program.name}</strong>
                      <span>
                        {program.athleteProfile.displayName} · {program.athleteProfile.team?.name ?? "Sin equipo"}
                      </span>
                      <p>
                        {program.phase} · {program.status} · {new Date(program.startDate).toLocaleDateString()}
                      </p>
                      <small>{program.template.name}</small>
                      <div className="chip-row">
                        {program.sessions.map((session) => (
                          <span key={session.id} className="session-chip">
                            {new Date(session.scheduledDate).toLocaleDateString()} · {session.dayType}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="helper-text">Todavia no hay programas personalizados generados.</p>
                )}
              </div>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Sesiones</p>
              <h2>Que se edita aqui</h2>
            </div>
          </div>

          <div className="workflow-note">
            <strong>Sesion = instancia operativa del programa</strong>
            <p>
              Aqui no creas usuarios ni atletas. Aqui ajustas fecha, estado y notas de las sesiones ya generadas desde un programa personalizado. Por eso esta vista pertenece a Entrenamiento y no a Usuarios.
            </p>
          </div>

          <div className="detail-list compact-detail-list section-spacer">
            <article className="detail-card">
              <strong>Programas cargados</strong>
              <span>{programs.length}</span>
              <p>Selecciona uno abajo para ver y editar sus sesiones.</p>
            </article>
            <article className="detail-card">
              <strong>Sesiones visibles</strong>
              <span>{programSessions.length}</span>
              <p>{selectedProgram ? `Sobre ${selectedProgram.athleteProfile.displayName}` : "Aun sin programa seleccionado"}</p>
            </article>
          </div>
        </article>
      </section>
      ) : null}

      {adminView === "training" ? (
      <section className="management-grid">
        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Sesiones</p>
              <h2>Reprogramacion y estado</h2>
            </div>
            <label className="day-picker mini-picker">
              Programa
              <select value={selectedProgramId} onChange={(event) => setSelectedProgramId(event.target.value)}>
                <option value="">Selecciona</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.athleteProfile.displayName} · {program.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedProgram ? (
            <p className="helper-text">
              {selectedProgram.athleteProfile.displayName} · {selectedProgram.phase} · {selectedProgram.status}
            </p>
          ) : (
            <p className="helper-text">Selecciona un programa personalizado para editar sus sesiones.</p>
          )}

          <div className="detail-list section-spacer">
            {programSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`detail-card detail-button ${selectedProgramSessionId === session.id ? "active" : ""}`}
                onClick={() => setSelectedProgramSessionId(session.id)}
              >
                <strong>{session.title}</strong>
                <span>{new Date(session.scheduledDate).toLocaleDateString()}</span>
                <p>
                  {session.dayType} · {session.status}
                </p>
                <small>
                  {session.sessionExercises.filter((exercise) => Boolean(exercise.completedAt)).length}/{session.sessionExercises.length} ejercicios completados
                </small>
              </button>
            ))}
            {selectedProgramId && !programSessions.length ? <p className="helper-text">Este programa todavia no tiene sesiones visibles.</p> : null}
          </div>

          {selectedProgramSession ? (
            <form className="stack-form section-spacer" onSubmit={handleSessionUpdate}>
              <div className="section-header compact-header">
                <div>
                  <p className="eyebrow">Sesion activa</p>
                  <h3>{selectedProgramSession.personalProgram.athleteProfile.displayName ?? displayName(selectedProgramSession.personalProgram.athleteProfile.user)}</h3>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  Titulo
                  <input
                    value={sessionEditor.title}
                    onChange={(event) => setSessionEditor((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <label>
                  Fecha
                  <input
                    type="date"
                    value={sessionEditor.scheduledDate}
                    onChange={(event) => setSessionEditor((current) => ({ ...current, scheduledDate: event.target.value }))}
                  />
                </label>
                <label>
                  Estado
                  <select
                    value={sessionEditor.status}
                    onChange={(event) => setSessionEditor((current) => ({ ...current, status: event.target.value as SessionStatus }))}
                  >
                    {sessionStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Atleta
                  <input
                    value={selectedProgramSession.personalProgram.athleteProfile.displayName ?? displayName(selectedProgramSession.personalProgram.athleteProfile.user)}
                    disabled
                  />
                </label>
              </div>

              <label>
                Notas
                <textarea
                  value={sessionEditor.notes}
                  onChange={(event) => setSessionEditor((current) => ({ ...current, notes: event.target.value }))}
                  rows={3}
                />
              </label>

              <div className="action-row">
                <button className="primary-button" type="submit" disabled={loading}>
                  Guardar sesion
                </button>
              </div>

              <div className="detail-stack">
                <div>
                  <p className="eyebrow">Ejercicios</p>
                  <div className="detail-list">
                    {selectedProgramSession.sessionExercises.map((exercise) => (
                      <article key={exercise.id} className="detail-card">
                        <strong>{exercise.orderIndex}. {exercise.exercise.name}</strong>
                        <span>{exercise.exercise.category}</span>
                        <p>
                          {exercise.sets ? `${exercise.sets} sets` : "Sin sets"}
                          {exercise.repsText ? ` · ${exercise.repsText}` : ""}
                          {exercise.durationSeconds ? ` · ${exercise.durationSeconds}s` : ""}
                        </p>
                        <small>{exercise.completedAt ? "Marcado como completado" : "Pendiente"}</small>
                      </article>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="eyebrow">Logs</p>
                  <div className="program-list">
                    {selectedProgramSession.logs.length ? (
                      selectedProgramSession.logs.map((log) => (
                        <article key={log.id} className="detail-card program-card">
                          <strong>{displayName(log.athleteProfile.user)}</strong>
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                          <p>RPE {log.perceivedExertion ?? "-"}</p>
                          <small>{log.notes || "Sin notas"}</small>
                        </article>
                      ))
                    ) : (
                      <p className="helper-text">Todavia no hay logs sobre esta sesion.</p>
                    )}
                  </div>
                </div>
              </div>
            </form>
          ) : null}
        </article>

        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Coach</p>
              <h2>Seguimiento multiatleta</h2>
            </div>
            <label className="day-picker mini-picker">
              Coach
              <select value={selectedCoachDashboardId} onChange={(event) => setSelectedCoachDashboardId(event.target.value)}>
                <option value="">Selecciona</option>
                {coachOptions.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.label} · {coach.teamName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {coachDashboard ? (
            <>
              <div className="detail-list">
                <article className="detail-card">
                  <strong>{displayName(coachDashboard.coach)}</strong>
                  <span>{coachDashboard.coach.email}</span>
                  <p>{coachDashboard.metrics.athletes} atletas asignados</p>
                </article>
                <article className="detail-card">
                  <strong>{coachDashboard.metrics.activePrograms}</strong>
                  <span>Programas activos</span>
                  <p>{coachDashboard.metrics.recentLogs} logs recientes</p>
                </article>
              </div>

              <div className="detail-stack section-spacer">
                {coachDashboard.athletes.length ? (
                  coachDashboard.athletes.map((athlete) => (
                    <article key={athlete.id} className="detail-card coach-athlete-card">
                      <strong>{athlete.displayName ?? displayName(athlete.user)}</strong>
                      <span>
                        {(athlete.team?.name ?? "Sin equipo")} · {athlete.sport || "Sin deporte"} · {athlete.seasonPhase}
                      </span>
                      {athlete.personalPrograms[0] ? (
                        <p>
                          {athlete.personalPrograms[0].name} · {athlete.personalPrograms[0].status}
                        </p>
                      ) : (
                        <p>Sin programa personal activo.</p>
                      )}

                      {athlete.personalPrograms[0]?.sessions.length ? (
                        <div className="chip-row">
                          {athlete.personalPrograms[0].sessions.map((session) => (
                            <span key={session.id} className="session-chip">
                              {new Date(session.scheduledDate).toLocaleDateString()} · {session.dayType}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="program-list">
                        {athlete.sessionLogs.length ? (
                          athlete.sessionLogs.map((log) => (
                            <article key={log.id} className="detail-card nested-card">
                              <strong>{log.scheduledSession.title}</strong>
                              <span>{new Date(log.createdAt).toLocaleString()}</span>
                              <p>RPE {log.perceivedExertion ?? "-"}</p>
                              <small>{log.notes || "Sin notas"}</small>
                            </article>
                          ))
                        ) : (
                          <p className="helper-text">Sin logs recientes de este atleta.</p>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="helper-text">Ese coach no tiene atletas asignados todavia.</p>
                )}
              </div>
            </>
          ) : (
            <p className="helper-text">Selecciona un coach para revisar sus atletas y logs recientes.</p>
          )}
        </article>
      </section>
      ) : null}

      {adminView === "templates" ? (
      <section className="management-grid">
        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Programas de entrenamiento</p>
              <h2>Plantillas</h2>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setTemplateForm(emptyTemplateForm());
                setTemplateModalOpen(true);
              }}
            >
              + Nuevo programa
            </button>
          </div>

          <div className="detail-list section-spacer">
            {allTemplates.length ? (
              allTemplates.map((tmpl) => (
                <article key={tmpl.id} className="detail-card">
                  <strong>{tmpl.name}</strong>
                  <span>{tmpl.code}</span>
                  <p>{tmpl.description || "Sin descripcion"}</p>
                  <small>{tmpl.cycleLengthDays} dias · {tmpl._count.days} días definidos · {tmpl._count.personalPrograms} programas activos</small>
                  <div className="chip-row">
                    {tmpl.isEditable ? (
                      <>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            setTemplateForm({ id: tmpl.id, code: tmpl.code, name: tmpl.name, description: tmpl.description ?? "", cycleLengthDays: String(tmpl.cycleLengthDays) });
                            setTemplateModalOpen(true);
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => void handleTemplateDelete(tmpl.code)}
                          disabled={loading}
                        >
                          Eliminar
                        </button>
                      </>
                    ) : (
                      <span className="session-chip">Solo lectura</span>
                    )}
                    <button
                      type="button"
                      className={`ghost-button${selectedTemplateCode === tmpl.code ? " active" : ""}`}
                      onClick={() => {
                        setSelectedTemplateCode(tmpl.code);
                        void handleTemplateDaysLoad(tmpl.code);
                        setAdminView("training");
                      }}
                    >
                      Ver en Entrenamiento
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="helper-text">No hay programas definidos todavia.</p>
            )}
          </div>

          {templateModalOpen ? (
            <div className="modal-overlay" onClick={() => setTemplateModalOpen(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="section-header">
                  <h3>{templateForm.id ? "Editar programa" : "Nuevo programa"}</h3>
                  <button type="button" className="ghost-button" onClick={() => setTemplateModalOpen(false)}>✕</button>
                </div>
                <form className="stack-form" onSubmit={(e) => void handleTemplateSubmit(e)}>
                  <div className="form-grid">
                    <label>
                      Código
                      <input
                        value={templateForm.code}
                        onChange={(e) => setTemplateForm((f) => ({ ...f, code: e.target.value }))}
                        placeholder="ej. SPRINT-8W"
                        required
                        disabled={Boolean(templateForm.id)}
                      />
                    </label>
                    <label>
                      Nombre
                      <input
                        value={templateForm.name}
                        onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="ej. Plan Sprint 8 semanas"
                        required
                      />
                    </label>
                    <label>
                      Duración del ciclo (días)
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={templateForm.cycleLengthDays}
                        onChange={(e) => setTemplateForm((f) => ({ ...f, cycleLengthDays: e.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      Descripción
                      <textarea
                        value={templateForm.description}
                        onChange={(e) => setTemplateForm((f) => ({ ...f, description: e.target.value }))}
                        rows={2}
                      />
                    </label>
                  </div>
                  <button className="primary-button" type="submit" disabled={loading}>
                    {templateForm.id ? "Guardar cambios" : "Crear programa"}
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Exclusiones por atleta</p>
              <h2>Ejercicios excluidos</h2>
            </div>
          </div>
          <p className="helper-text section-spacer">
            Selecciona un atleta para gestionar qué ejercicios se omiten al generar su programa (ej. dolor de espalda → quitar peso muerto).
          </p>

          <div className="detail-list">
            {allAthletes.map((athlete) => (
              <article key={athlete.id} className={`detail-card${exclusionsAthleteId === athlete.id ? " active" : ""}`}>
                <strong>{athlete.displayName}</strong>
                <span>{athlete.team?.name ?? "Sin equipo"} · {athlete.sport || "Sin deporte"}</span>
                {athlete.exerciseExclusions?.length ? (
                  <p>{athlete.exerciseExclusions.length} ejercicio(s) excluido(s)</p>
                ) : (
                  <p>Sin exclusiones</p>
                )}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setExclusionsAthleteId(athlete.id);
                    setExclusionsDraft(athlete.exerciseExclusions ?? []);
                  }}
                >
                  Editar exclusiones
                </button>
              </article>
            ))}
          </div>

          {exclusionsAthleteId ? (
            <div className="modal-overlay" onClick={() => setExclusionsAthleteId("")}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="section-header">
                  <h3>Exclusiones de {allAthletes.find((a) => a.id === exclusionsAthleteId)?.displayName}</h3>
                  <button type="button" className="ghost-button" onClick={() => setExclusionsAthleteId("")}>✕</button>
                </div>
                <p className="helper-text">Marca los ejercicios que NO se incluirán al generar el programa de este atleta.</p>
                <div className="detail-list section-spacer">
                  {exercises.map((ex) => (
                    <label key={ex.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={exclusionsDraft.includes(ex.id)}
                        onChange={(e) => {
                          setExclusionsDraft((d) =>
                            e.target.checked ? [...d, ex.id] : d.filter((id) => id !== ex.id),
                          );
                        }}
                      />
                      {ex.name}
                    </label>
                  ))}
                </div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={loading}
                  onClick={() => void handleExclusionsUpdate(exclusionsAthleteId, exclusionsDraft)}
                >
                  Guardar exclusiones
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </section>
      ) : null}

        </div>
      </div>
    </div>
  );
}

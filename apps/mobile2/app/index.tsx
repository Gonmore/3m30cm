import Constants from "expo-constants";
import * as AuthSession from "expo-auth-session";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { GoogleSignin as NativeGoogleSignin } from "@react-native-google-signin/google-signin";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { C, R, S } from "@mobile/components/tokens";
import { useTheme } from "@mobile/components/ThemeContext";
import AppHeader from "@mobile/components/AppHeader";
import DrawerMenu, { type AppScreen } from "@mobile/components/DrawerMenu";
import JumpGuideModal from "@mobile/components/JumpGuideModal";
import { ProfileModal } from "@mobile/components/ProfileModal";
import CoachDashboardScreen from "@mobile/components/screens/CoachDashboardScreen";
import { apiBaseUrl, getRuntimeAppConfigExtra, rewriteLocalAssetUrl } from "@mobile/components/runtimeConfig";
import EjerciciosScreen from "@mobile/components/screens/EjerciciosScreen";
import EvolucionScreen from "@mobile/components/screens/EvolucionScreen";
import HoyScreenV2 from "../components/screens/HoyScreenV2";
import ProgramaScreen from "@mobile/components/screens/ProgramaScreen";
import type { SessionDetail as SharedSessionDetail, SessionGuidance as SharedSessionGuidance } from "@mobile/components/types";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Required for expo-auth-session to handle browser redirects
WebBrowser.maybeCompleteAuthSession();

const accessTokenStorageKey = "jump-athlete-access-token";
const calendarSyncStorageKey = "jump-athlete-calendar-sync";

/** Decode a JWT payload without verifying the signature (client-side only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isCoachToken(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const platformRole = payload.platformRole as string | null;
  const teamRoles = payload.teamRoles as string[] | null;
  return (
    platformRole === "COACH" ||
    platformRole === "SUPERADMIN" ||
    (Array.isArray(teamRoles) && teamRoles.includes("COACH"))
  );
}

function hasAthleteRole(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const teamRoles = payload.teamRoles as string[] | null;
  return Array.isArray(teamRoles) && teamRoles.includes("ATHLETE");
}

function formatGoogleTokenDiagnostics(idToken: string): string {
  const payload = decodeJwtPayload(idToken);
  if (!payload) {
    return "Token de Google no decodificable en cliente.";
  }

  const diagnosticFields = [
    payload.aud ? `aud=${String(payload.aud)}` : null,
    payload.azp ? `azp=${String(payload.azp)}` : null,
    payload.iss ? `iss=${String(payload.iss)}` : null,
    payload.email ? `email=${String(payload.email)}` : null,
    payload.email_verified !== undefined ? `email_verified=${String(payload.email_verified)}` : null,
  ].filter(Boolean);

  return diagnosticFields.length > 0
    ? `Token Google: ${diagnosticFields.join(" | ")}`
    : "Token Google sin campos de diagnostico visibles.";
}

function formatGoogleAuthError(error: unknown, idToken?: string): string {
  const baseMessage = error instanceof Error ? error.message : "No se pudo iniciar sesion con Google";
  if (!idToken) {
    return baseMessage;
  }

  return `${baseMessage}\n${formatGoogleTokenDiagnostics(idToken)}`;
}

const reminderSyncStorageKey = "jump-athlete-reminder-sync";
const trendWindowStorageKey = "jump-athlete-trend-window";
const favoriteSessionStorageKey = "jump-athlete-favorite-session";
const selectedCycleStorageKey = "jump-athlete-selected-cycle";
const selectedExerciseStorageKey = "jump-athlete-selected-exercise";
const exerciseProgressKey = "jump-athlete-exercise-progress";
const cachedSessionsStorageKey = "jump-athlete-cached-sessions";

const sessionStatuses = ["PLANNED", "COMPLETED", "SKIPPED"] as const;
const notificationChannelId = "training-reminders";
const isWebPlatform = Platform.OS === "web";
const isExpoGo = !isWebPlatform && (Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo");
const useNativeAndroidGoogleSignIn = Platform.OS === "android" && !isExpoGo;
const sessionCacheVersion = 2;
const offlinePreloadMessage = "cargando todo el contenido de la sesion en el telefono, luego podras entrenar estando offline";
const sessionCacheRootDirectory = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}jump-session-cache/` : null;

type CalendarModule = typeof import("expo-calendar");
type NotificationHandlerConfig = Parameters<typeof import("expo-notifications/build/NotificationsHandler").setNotificationHandler>[0];
type NotificationPermissionResult = Awaited<ReturnType<typeof import("expo-notifications/build/NotificationPermissions").getPermissionsAsync>>;
type NotificationRequestInput = import("expo-notifications/build/Notifications.types").NotificationRequestInput;
type NotificationChannelInput = import("expo-notifications/build/NotificationChannelManager.types").NotificationChannelInput;
type NotificationTriggerTypes = typeof import("expo-notifications/build/Notifications.types").SchedulableTriggerInputTypes;

interface NotificationsModule {
  setNotificationHandler: (handler: NotificationHandlerConfig) => void;
  getPermissionsAsync: () => Promise<NotificationPermissionResult>;
  requestPermissionsAsync: () => Promise<NotificationPermissionResult>;
  setNotificationChannelAsync: (channelId: string, channel: NotificationChannelInput) => Promise<import("expo-notifications/build/NotificationChannelManager.types").NotificationChannel | null>;
  cancelScheduledNotificationAsync: typeof import("expo-notifications/build/cancelScheduledNotificationAsync").default;
  scheduleNotificationAsync: typeof import("expo-notifications/build/scheduleNotificationAsync").default;
  AndroidImportance: { HIGH: number };
  SchedulableTriggerInputTypes: NotificationTriggerTypes;
}

let calendarModulePromise: Promise<CalendarModule | null> | null = null;
let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;

class UnauthorizedRequestError extends Error {
  constructor(message = "Invalid or expired token") {
    super(message);
    this.name = "UnauthorizedRequestError";
  }
}

type SessionStatus = (typeof sessionStatuses)[number];
type PermissionState = "unknown" | "granted" | "denied";
type TrendWindow = "7D" | "28D" | "ALL";

type SessionIntegrationMap = Record<string, string>;

interface AthleteLogMetrics {
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

interface LoginResponse {
  accessToken: string;
}

interface PlanningRecommendation {
  needsProgramSetup: boolean;
  recommendedPreparationPhase: boolean;
  recommendedPreparationWeeks: number;
  sportTrainingDays: number[];
  jumpTrainingDays: number[];
  summary: string;
  focusAreas: string[];
}

interface AthleteRegistrationResponse {
  accessToken: string;
}

interface AthleteProfileResponse {
  athleteProfile: {
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
      coach: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
      };
    }>;
  };
  activeProgram: {
    id: string;
    name: string;
    phase: string;
    status: string;
    startDate: string;
    template: {
      id: string;
      code: string;
      name: string;
    } | null;
    sessions: Array<{
      id: string;
      title: string;
      dayType: string;
      status: string;
      scheduledDate: string;
    }>;
  } | null;
  planningRecommendation: PlanningRecommendation;
}

interface ProgramListResponse {
  programs: Array<{
    id: string;
    name: string;
    phase: string;
    status: string;
    startDate: string;
    template: {
      id: string;
      code: string;
      name: string;
    } | null;
  }>;
}

interface SessionListResponse {
  sessions: Array<{
    id: string;
    title: string;
    dayType: string;
    status: SessionStatus | "RESCHEDULED";
    scheduledDate: string;
    personalProgram: {
      id: string;
      name: string;
      phase: string;
      status: string;
    };
    sessionExercises: Array<{
      id: string;
      orderIndex: number;
      completedAt: string | null;
    }>;
    logs: Array<{
      id: string;
      perceivedExertion: number | null;
      createdAt: string;
      metrics: AthleteLogMetrics | null;
    }>;
  }>;
}

interface AutoSessionAdjustmentResponse {
  rolledOverSessions: Array<{
    id: string;
    title: string;
    scheduledDate: string;
    rescheduleCount: number;
  }>;
  skippedSessions: Array<{
    id: string;
    title: string;
  }>;
}

interface AthleteProgressResponse {
  summary: {
    totalSessions: number;
    completedSessions: number;
    skippedSessions: number;
    rescheduledSessions: number;
    upcomingSessions: number;
    completionRate: number;
    currentStreak: number;
  };
  nextSession: {
    id: string;
    title: string;
    dayType: string;
    status: string;
    scheduledDate: string;
  } | null;
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
  feedback: {
    status: "protect" | "focus" | "push" | "steady";
    title: string;
    summary: string;
    actions: string[];
  };
  personalBests: {
    jumpHeightCm: number | null;
    avgLoadKg: number | null;
    peakVelocityMps: number | null;
  };
  trends: {
    jumpHeightCm: Array<{ date: string; value: number }>;
    readinessScore: Array<{ date: string; value: number }>;
    avgLoadKg: Array<{ date: string; value: number }>;
  };
  windowComparisons: {
    last7Days: {
      days: number;
      currentLogs: number;
      previousLogs: number;
      jumpHeightAvg: number | null;
      jumpHeightDelta: number | null;
      readinessAvg: number | null;
      readinessDelta: number | null;
      avgLoadKg: number | null;
      avgLoadDelta: number | null;
    };
    last28Days: {
      days: number;
      currentLogs: number;
      previousLogs: number;
      jumpHeightAvg: number | null;
      jumpHeightDelta: number | null;
      readinessAvg: number | null;
      readinessDelta: number | null;
      avgLoadKg: number | null;
      avgLoadDelta: number | null;
    };
  };
  blockComparison: {
    currentProgramId: string | null;
    currentProgramName: string | null;
    currentProgramBestJumpCm: number | null;
    previousProgramBestJumpCm: number | null;
    deltaVsPreviousProgramCm: number | null;
  };
  phaseComparison: {
    currentPhase: string;
    currentPhaseBestJumpCm: number | null;
    referencePhaseBestJumpCm: number | null;
    deltaVsReferencePhaseCm: number | null;
  };
  cycleEvolution: Array<{
    id: string;
    name: string;
    phase: string;
    startDate: string;
    totalSessions: number;
    completedSessions: number;
    completionRate: number;
    bestJumpCm: number | null;
    averageReadiness: number | null;
    averageLoadKg: number | null;
    deltaVsPreviousCycleCm: number | null;
  }>;
  historicalBestSessions: {
    jumpHeight: {
      id: string;
      createdAt: string;
      perceivedExertion: number | null;
      notes: string | null;
      metrics: AthleteLogMetrics | null;
      scheduledSession: {
        id: string;
        title: string;
        dayType: string;
        status: string;
        scheduledDate: string;
      };
    } | null;
    readiness: {
      id: string;
      createdAt: string;
      perceivedExertion: number | null;
      notes: string | null;
      metrics: AthleteLogMetrics | null;
      scheduledSession: {
        id: string;
        title: string;
        dayType: string;
        status: string;
        scheduledDate: string;
      };
    } | null;
    avgLoad: {
      id: string;
      createdAt: string;
      perceivedExertion: number | null;
      notes: string | null;
      metrics: AthleteLogMetrics | null;
      scheduledSession: {
        id: string;
        title: string;
        dayType: string;
        status: string;
        scheduledDate: string;
      };
    } | null;
  };
  recentLogs: Array<{
    id: string;
    notes: string | null;
    perceivedExertion: number | null;
    createdAt: string;
    metrics: AthleteLogMetrics | null;
    scheduledSession: {
      id: string;
      title: string;
      dayType: string;
      status: string;
      scheduledDate: string;
    };
  }>;
}

interface SessionDetailResponse {
  session: SharedSessionDetail;
  guidance?: SharedSessionGuidance;
}

interface CachedSessionRecord {
  version: number;
  cachedAt: string;
  session: SessionDetailResponse["session"];
  guidance: SessionDetailResponse["guidance"] | null;
  mediaMap: Record<string, string>;
}

interface PreloadProgressState {
  visible: boolean;
  sessionId: string | null;
  sessionTitle: string;
  progress: number;
  statusText: string;
  detailText: string;
}

interface LogDraftState {
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

function createIdlePreloadState(): PreloadProgressState {
  return {
    visible: false,
    sessionId: null,
    sessionTitle: "",
    progress: 0,
    statusText: "",
    detailText: offlinePreloadMessage,
  };
}

function sanitizeCacheSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function inferMediaExtension(url: string, kind: string) {
  const cleanUrl = url.split(/[?#]/)[0] ?? "";
  const extensionMatch = cleanUrl.match(/\.([a-z0-9]{2,5})$/i);

  if (extensionMatch) {
    return `.${extensionMatch[1].toLowerCase()}`;
  }

  switch (kind.toUpperCase()) {
    case "VIDEO":
      return ".mp4";
    case "GIF":
      return ".gif";
    default:
      return ".jpg";
  }
}

function getSessionCacheDirectory(sessionId: string) {
  if (!sessionCacheRootDirectory) {
    return null;
  }

  return `${sessionCacheRootDirectory}${sanitizeCacheSegment(sessionId)}/`;
}

function getSessionCacheManifestPath(sessionId: string) {
  const sessionDirectory = getSessionCacheDirectory(sessionId);
  return sessionDirectory ? `${sessionDirectory}session.json` : null;
}

function normalizeMediaSourceUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  return rewriteLocalAssetUrl(url) ?? url;
}

function attachSessionOfflineMedia(
  session: SessionDetailResponse["session"],
  mediaMap: Record<string, string>,
): SessionDetailResponse["session"] {
  const resolveOfflineUrl = (url: string | null) => {
    const normalizedUrl = normalizeMediaSourceUrl(url);
    if (!normalizedUrl) {
      return null;
    }

    return mediaMap[normalizedUrl] ?? null;
  };

  return {
    ...session,
    sessionExercises: session.sessionExercises.map((sessionExercise) => ({
      ...sessionExercise,
      exercise: {
        ...sessionExercise.exercise,
        mediaAssets: sessionExercise.exercise.mediaAssets.map((asset) => ({
          ...asset,
          offlineUrl: resolveOfflineUrl(asset.url),
        })),
        asBlock: sessionExercise.exercise.asBlock
          ? {
              ...sessionExercise.exercise.asBlock,
              items: sessionExercise.exercise.asBlock.items.map((item) => ({
                ...item,
                exercise: {
                  ...item.exercise,
                  mediaAssets: item.exercise.mediaAssets.map((asset) => ({
                    ...asset,
                    offlineUrl: resolveOfflineUrl(asset.url),
                  })),
                },
              })),
            }
          : null,
      },
    })),
  };
}

function collectSessionMediaDownloads(session: SessionDetailResponse["session"], sessionDirectory: string) {
  const downloads = new Map<string, { sourceUrl: string; fileUri: string }>();

  const registerAsset = (assetId: string, url: string | null, kind: string) => {
    const sourceUrl = normalizeMediaSourceUrl(url);
    if (!sourceUrl || downloads.has(sourceUrl)) {
      return;
    }

    const fileName = `${sanitizeCacheSegment(assetId)}${inferMediaExtension(sourceUrl, kind)}`;
    downloads.set(sourceUrl, {
      sourceUrl,
      fileUri: `${sessionDirectory}${fileName}`,
    });
  };

  session.sessionExercises.forEach((sessionExercise) => {
    sessionExercise.exercise.mediaAssets.forEach((asset) => {
      registerAsset(asset.id, asset.url, asset.kind);
    });

    sessionExercise.exercise.asBlock?.items.forEach((item) => {
      item.exercise.mediaAssets.forEach((asset) => {
        registerAsset(asset.id, asset.url, asset.kind);
      });
    });
  });

  return Array.from(downloads.values());
}

interface PreSessionCheckInState {
  readinessScore: string;
  sorenessScore: string;
  painScore: string;
  moodScore: string;
  sleepHours: string;
  notes: string;
  savedAt: string | null;
}

interface AthleteSetupState {
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

interface PublicTemplateMeta {
  id: string;
  code: string;
  name: string;
  description: string | null;
  cycleLengthDays: number;
}

async function getCalendarModule() {
  if (isWebPlatform) {
    return null;
  }

  calendarModulePromise ??= import("expo-calendar").catch(() => null);
  return calendarModulePromise;
}

async function getNotificationsModule() {
  if (isWebPlatform) {
    return null;
  }

  notificationsModulePromise ??= (async () => {
    try {
      const [
        permissionsModule,
        notificationsHandlerModule,
        setNotificationChannelModule,
        cancelScheduledNotificationModule,
        scheduleNotificationModule,
        notificationsTypesModule,
        notificationChannelTypesModule,
      ] = await Promise.all([
        import("expo-notifications/build/NotificationPermissions"),
        import("expo-notifications/build/NotificationsHandler"),
        import("expo-notifications/build/setNotificationChannelAsync"),
        import("expo-notifications/build/cancelScheduledNotificationAsync"),
        import("expo-notifications/build/scheduleNotificationAsync"),
        import("expo-notifications/build/Notifications.types"),
        import("expo-notifications/build/NotificationChannelManager.types"),
      ]);

      return {
        setNotificationHandler: notificationsHandlerModule.setNotificationHandler,
        getPermissionsAsync: permissionsModule.getPermissionsAsync,
        requestPermissionsAsync: permissionsModule.requestPermissionsAsync,
        setNotificationChannelAsync: setNotificationChannelModule.default,
        cancelScheduledNotificationAsync: cancelScheduledNotificationModule.default,
        scheduleNotificationAsync: scheduleNotificationModule.default,
        AndroidImportance: notificationChannelTypesModule.AndroidImportance,
        SchedulableTriggerInputTypes: notificationsTypesModule.SchedulableTriggerInputTypes,
      } satisfies NotificationsModule;
    } catch {
      return null;
    }
  })();

  return notificationsModulePromise;
}

void getNotificationsModule().then((notifications) => {
  notifications?.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
});

const emptyLogDraft = (): LogDraftState => ({
  notes: "",
  perceivedExertion: "",
  status: "COMPLETED",
  completedExerciseIds: [],
  readinessScore: "",
  sorenessScore: "",
  painScore: "",
  moodScore: "",
  sleepHours: "",
  jumpHeightCm: "",
  bodyWeightKg: "",
  avgLoadKg: "",
  peakVelocityMps: "",
  sessionDurationMin: "",
  jumpTestAttempt1Cm: "",
  jumpTestAttempt2Cm: "",
  jumpTestAttempt3Cm: "",
});

const emptyPreSessionCheckIn = (): PreSessionCheckInState => ({
  readinessScore: "",
  sorenessScore: "",
  painScore: "",
  moodScore: "",
  sleepHours: "",
  notes: "",
  savedAt: null,
});

const emptyAthleteSetup = (): AthleteSetupState => ({
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  displayName: "",
  sport: "",
  trainsSport: false,
  sportTrainingDays: "2,4",
  seasonPhase: "OFF_SEASON",
  availableWeekdays: "1,3,5",
  startDate: new Date().toISOString().slice(0, 10),
  includePreparationPhase: true,
  notes: "",
  templateCode: "JUMP-MANUAL-14D",
});

function displayCoachName(firstName: string | null, lastName: string | null, email: string) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || email;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatWeekdays(weekdays?: number[]) {
  if (!weekdays?.length) {
    return "Sin restriccion semanal";
  }

  const labels = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  return weekdays.map((entry) => labels[entry] ?? String(entry)).join(", ");
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

function buildReminderDate(sessionDate: string) {
  const reminderDate = new Date(sessionDate);
  reminderDate.setHours(8, 0, 0, 0);
  return reminderDate.getTime() > Date.now() + 60 * 1000 ? reminderDate : null;
}

function startOfLocalDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameLocalDay(left: string | Date, right: string | Date) {
  return startOfLocalDay(new Date(left)).getTime() === startOfLocalDay(new Date(right)).getTime();
}

function formatSessionDayType(dayType: string) {
  const labels: Record<string, string> = {
    EXPLOSIVE: "pliometria",
    STRENGTH: "fuerza",
    RECOVERY: "recuperacion",
    REST: "descanso",
    UPPER_CORE: "tren superior y core",
    OTHER: "sesion personalizada",
    POWER: "potencia",
    SPEED: "velocidad",
  };

  return labels[dayType] ?? dayType.toLowerCase();
}

function buildMotivationalReminderCopy(session: { title: string; dayType: string }, streak: number) {
  const streakText = streak > 0 ? `Llevas ${streak} dias de racha.` : "Hoy arranca una nueva racha.";

  if (session.dayType === "STRENGTH") {
    return {
      title: "Hola campeon, hoy toca fuerza",
      body: `${streakText} Los pesos para evolucionar ya estan programados en ${session.title}. Puedes precargar la sesion para hacerla offline o iniciar ahora mismo.`,
    };
  }

  if (session.dayType === "EXPLOSIVE" || session.dayType === "POWER" || session.dayType === "SPEED") {
    return {
      title: "Hola campeon, hoy toca velocidad y altura",
      body: `${streakText} ${session.title} esta lista para que priorices rapidez, alturas y calidad de contacto. Puedes precargar la sesion o iniciarla ahora.`,
    };
  }

  return {
    title: `Hola campeon, hoy toca ${formatSessionDayType(session.dayType)}`,
    body: `${streakText} ${session.title} ya esta preparada. Puedes precargar la sesion o iniciarla ahora desde la app.`,
  };
}

function buildSessionNotes(session: SessionDetailResponse["session"]) {
  return session.sessionExercises
    .map((exercise) => {
      const parts = [
        `${exercise.orderIndex}. ${exercise.exercise.name}`,
        exercise.sets ? `${exercise.sets} sets` : null,
        exercise.repsText,
        exercise.durationSeconds ? `${exercise.durationSeconds}s` : null,
        exercise.loadText ? `carga ${exercise.loadText}` : null,
      ].filter(Boolean);

      return parts.join(" · ");
    })
    .join("\n");
}

function buildCalendarSessionNotes(session: { title: string; dayType: string; scheduledDate: string; sessionExercises?: SessionDetailResponse["session"]["sessionExercises"] }) {
  if (session.sessionExercises?.length) {
    return buildSessionNotes(session as SessionDetailResponse["session"]);
  }

  return `${session.title} · ${formatSessionDayType(session.dayType)} · ${formatDateTime(session.scheduledDate)}`;
}

async function readStoredMap(storageKey: string) {
  const rawValue = await readStoredValue(storageKey);

  if (!rawValue) {
    return {} as SessionIntegrationMap;
  }

  try {
    return JSON.parse(rawValue) as SessionIntegrationMap;
  } catch {
    return {} as SessionIntegrationMap;
  }
}

async function readStoredJson<T>(storageKey: string, fallback: T) {
  const rawValue = await readStoredValue(storageKey);

  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

async function writeStoredMap(storageKey: string, value: SessionIntegrationMap) {
  await writeStoredValue(storageKey, JSON.stringify(value));
}

async function readStoredValue(storageKey: string) {
  if (isWebPlatform) {
    try {
      return globalThis.localStorage?.getItem(storageKey) ?? null;
    } catch {
      return null;
    }
  }

  return SecureStore.getItemAsync(storageKey);
}

async function writeStoredValue(storageKey: string, value: string) {
  if (isWebPlatform) {
    try {
      globalThis.localStorage?.setItem(storageKey, value);
    } catch {
      return;
    }

    return;
  }

  await SecureStore.setItemAsync(storageKey, value);
}

async function deleteStoredValue(storageKey: string) {
  if (isWebPlatform) {
    try {
      globalThis.localStorage?.removeItem(storageKey);
    } catch {
      return;
    }

    return;
  }

  await SecureStore.deleteItemAsync(storageKey);
}

async function ensureSessionCacheDirectory(sessionId: string) {
  const sessionDirectory = getSessionCacheDirectory(sessionId);

  if (!sessionCacheRootDirectory || !sessionDirectory) {
    throw new Error("La cache offline no esta disponible en este dispositivo.");
  }

  await FileSystem.makeDirectoryAsync(sessionCacheRootDirectory, { intermediates: true });
  await FileSystem.makeDirectoryAsync(sessionDirectory, { intermediates: true });
  return sessionDirectory;
}

async function readCachedSessionIds() {
  try {
    const rawValue = await readStoredValue(cachedSessionsStorageKey);
    if (!rawValue) {
      return [] as string[];
    }

    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [] as string[];
  }
}

async function writeCachedSessionIds(sessionIds: string[]) {
  await writeStoredValue(cachedSessionsStorageKey, JSON.stringify(Array.from(new Set(sessionIds))));
}

async function loadValidCachedSessionIds() {
  const storedIds = await readCachedSessionIds();
  const validIds: string[] = [];

  for (const sessionId of storedIds) {
    const record = await readCachedSessionRecord(sessionId);
    if (record) {
      validIds.push(sessionId);
    }
  }

  if (validIds.length !== storedIds.length) {
    await writeCachedSessionIds(validIds);
  }

  return validIds;
}

async function readCachedSessionRecord(sessionId: string): Promise<CachedSessionRecord | null> {
  const manifestPath = getSessionCacheManifestPath(sessionId);

  if (!manifestPath) {
    return null;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(manifestPath);
    if (!fileInfo.exists) {
      return null;
    }

    const rawValue = await FileSystem.readAsStringAsync(manifestPath);
    const parsed = JSON.parse(rawValue) as CachedSessionRecord;

    if (!parsed || parsed.version !== sessionCacheVersion || !parsed.session) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedSessionRecord(sessionId: string, record: CachedSessionRecord) {
  const manifestPath = getSessionCacheManifestPath(sessionId);

  if (!manifestPath) {
    throw new Error("No se pudo guardar la sesion offline.");
  }

  await ensureSessionCacheDirectory(sessionId);
  await FileSystem.writeAsStringAsync(manifestPath, JSON.stringify(record));
}

async function loadExerciseProgress(sessionId: string): Promise<number> {
  try {
    const raw = await readStoredValue(exerciseProgressKey);
    if (!raw) return 0;
    const data = JSON.parse(raw) as { sessionId: string; step: number; date: string };
    const today = new Date().toISOString().slice(0, 10);
    if (data.sessionId === sessionId && data.date === today) return data.step;
  } catch { /* ignore */ }
  return 0;
}

async function saveExerciseProgress(sessionId: string, step: number) {
  const date = new Date().toISOString().slice(0, 10);
  await writeStoredValue(exerciseProgressKey, JSON.stringify({ sessionId, step, date }));
}

async function clearExerciseProgress(sessionId: string) {
  try {
    const raw = await readStoredValue(exerciseProgressKey);
    if (!raw) {
      return;
    }

    const data = JSON.parse(raw) as { sessionId?: string };
    if (data.sessionId === sessionId) {
      await deleteStoredValue(exerciseProgressKey);
    }
  } catch {
    // ignore persisted progress cleanup failures
  }
}

function permissionLabel(state: PermissionState) {
  if (state === "granted") {
    return "habilitado";
  }

  if (state === "denied") {
    return "denegado";
  }

  return "pendiente";
}

function toInputValue(value?: number | null) {
  return typeof value === "number" ? String(value) : "";
}

function toOptionalNumber(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatMetric(value: number | null | undefined, suffix: string, fallback = "-") {
  if (typeof value !== "number") {
    return fallback;
  }

  return `${value}${suffix}`;
}

function formatSignedMetric(value: number | null | undefined, suffix: string, fallback = "-") {
  if (typeof value !== "number") {
    return fallback;
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value}${suffix}`;
}

function buildTrendBars(series: Array<{ date: string; value: number }>) {
  const peak = Math.max(...series.map((entry) => entry.value), 1);

  return series.map((entry) => ({
    ...entry,
    height: Math.max(18, Math.round((entry.value / peak) * 88)),
    label: new Date(entry.date).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
  }));
}

function filterSeriesByWindow(series: Array<{ date: string; value: number }>, window: TrendWindow) {
  if (window === "ALL") {
    return series;
  }

  const days = window === "7D" ? 7 : 28;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return series.filter((entry) => new Date(entry.date) >= cutoff);
}

function deriveTrendDelta(series: Array<{ value: number }>) {
  if (series.length < 2) {
    return null;
  }

  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? 0;
  return Math.round((last - first) * 10) / 10;
}

function feedbackToneLabel(status?: AthleteProgressResponse["feedback"]["status"]) {
  switch (status) {
    case "push":
      return "Ventana de empuje";
    case "protect":
      return "Proteccion y recovery";
    case "focus":
      return "Recuperar consistencia";
    default:
      return "Ritmo estable";
  }
}

function getPreSessionCheckInStorageKey(athleteProfileId: string) {
  return `jump-athlete-session-precheck-${athleteProfileId}`;
}

function mergeCheckInIntoLogDraft(draft: LogDraftState, checkIn?: PreSessionCheckInState | null) {
  if (!checkIn) {
    return draft;
  }

  return {
    ...draft,
    readinessScore: checkIn.readinessScore || draft.readinessScore,
    sorenessScore: checkIn.sorenessScore || draft.sorenessScore,
    painScore: checkIn.painScore || draft.painScore,
    moodScore: checkIn.moodScore || draft.moodScore,
    sleepHours: checkIn.sleepHours || draft.sleepHours,
    notes: checkIn.notes || draft.notes,
  };
}

function buildPreSessionFeedback(checkIn?: PreSessionCheckInState | null) {
  const readinessScore = toOptionalNumber(checkIn?.readinessScore ?? "");
  const sorenessScore = toOptionalNumber(checkIn?.sorenessScore ?? "");
  const painScore = toOptionalNumber(checkIn?.painScore ?? "");
  const sleepHours = toOptionalNumber(checkIn?.sleepHours ?? "");

  if ([readinessScore, sorenessScore, painScore, sleepHours].every((value) => typeof value !== "number")) {
    return {
      status: "steady" as const,
      title: "Check-in previo pendiente",
      summary: "Registra sensaciones antes de abrir la sesion para arrancar con una referencia clara de readiness, dolor y sueno.",
    };
  }

  if ((painScore ?? 0) >= 7 || (readinessScore ?? 10) <= 4 || (sleepHours ?? 24) < 5.5) {
    return {
      status: "protect" as const,
      title: "Entrada en modo proteccion",
      summary: "Llega con calma, baja la agresividad del bloque inicial y usa el calentamiento para confirmar si puedes sostener la sesion.",
    };
  }

  if ((readinessScore ?? 0) >= 8 && (sorenessScore ?? 10) <= 4 && (painScore ?? 10) <= 3 && (sleepHours ?? 0) >= 7) {
    return {
      status: "push" as const,
      title: "Ventana alta para rendir",
      summary: "Hoy tienes margen para buscar una sesion limpia y agresiva, siempre que la tecnica salga rapida desde las primeras repeticiones.",
    };
  }

  return {
    status: "focus" as const,
    title: "Check-in correcto, entra con foco",
    summary: "No hace falta proteger ni forzar. Empieza fino, registra sensaciones y deja que el rendimiento decida si puedes apretar mas tarde.",
  };
}

async function requestJson<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & { message?: string; detail?: string };
  const combinedMessage = [data.message, data.detail].filter(Boolean).join(": ");

  if (response.status === 401) {
    throw new UnauthorizedRequestError(combinedMessage || "Invalid or expired token");
  }

  if (!response.ok) {
    throw new Error(combinedMessage || "Request failed");
  }

  return data;
}

export default function HomeScreen() {
  const { C } = useTheme();
  const { resetToken } = useLocalSearchParams<{ resetToken?: string }>();
  const appConfigExtra = getRuntimeAppConfigExtra();
  const googleClientIds = appConfigExtra.googleClientIds ?? {};
  const authSt = useMemo(() => StyleSheet.create({
    safeArea:       { flex: 1, backgroundColor: C.bg },
    scroll:         { flexGrow: 1, paddingHorizontal: S.lg, paddingBottom: S.xl, gap: S.md },
    logoWrap:       { alignItems: 'center', paddingTop: 48, paddingBottom: S.lg, gap: S.sm },
    logo:           { width: 160, height: 52 },
    logoSub:        { color: C.textMuted, fontSize: 11, letterSpacing: 2.5, textTransform: 'uppercase' },
    tabRow:         { flexDirection: 'row', backgroundColor: C.surface, borderRadius: R.full, padding: 4 },
    tab:            { flex: 1, paddingVertical: 10, borderRadius: R.full, alignItems: 'center' },
    tabActive:      { backgroundColor: C.amber },
    tabText:        { color: C.textMuted, fontWeight: '600', fontSize: 14 },
    tabTextActive:  { color: C.bg, fontWeight: '800' },
    card:           { backgroundColor: C.surface, borderRadius: R.xl, padding: S.lg, borderWidth: 1, borderColor: C.border, gap: S.sm },
    cardTitle:      { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 4 },
    input:          { backgroundColor: C.surfaceRaise, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 13, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border },
    pwRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceRaise, borderRadius: R.md, borderWidth: 1, borderColor: C.border },
    pwInput:        { flex: 1, paddingHorizontal: S.md, paddingVertical: 13, color: C.text, fontSize: 15 },
    pwToggle:       { paddingHorizontal: 12, paddingVertical: 13 },
    primaryBtn:     { backgroundColor: C.amber, borderRadius: R.full, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
    primaryBtnText: { color: C.bg, fontWeight: '800', fontSize: 15, letterSpacing: 0.4 },
    feedbackBox:    { borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, borderWidth: 1 },
    feedbackError:  { backgroundColor: 'rgba(224, 90, 58, 0.16)', borderColor: C.dangerBorder },
    feedbackSuccess:{ backgroundColor: 'rgba(44, 196, 176, 0.16)', borderColor: C.teal },
    feedbackText:   { color: C.text, fontWeight: '700', fontSize: 13, textAlign: 'center' },
    errorText:      { color: C.danger, fontWeight: '600', fontSize: 13, textAlign: 'center' },
    successText:    { color: C.teal, fontWeight: '600', fontSize: 13, textAlign: 'center' },
    footer:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#000', paddingVertical: 14, paddingHorizontal: S.lg },
    footerText:     { color: 'rgba(255,255,255,0.38)', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600' },
    byBadge:        { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
    byText:         { color: 'rgba(255,255,255,0.38)', fontSize: 7, fontWeight: '700' },
    footerLogo:     { width: 72, height: 26, opacity: 0.42 },
    forgotLink:     { color: C.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 4 },
    divider:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dividerLine:    { flex: 1, height: 1, backgroundColor: C.border },
    dividerText:    { color: C.textMuted, fontSize: 13 },
    socialBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: C.borderStrong, borderRadius: R.full, paddingVertical: 12, backgroundColor: C.surfaceRaise },
    socialBtnDisabled: { opacity: 0.5 },
    socialBtnText:  { color: C.text, fontWeight: '600', fontSize: 14 },
    helperText:     { color: C.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
    modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', paddingHorizontal: S.lg },
    modalCard:      { backgroundColor: C.surface, borderRadius: R.xl, padding: S.lg, gap: S.sm, borderWidth: 1, borderColor: C.border },
  }), [C]);

  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [profile, setProfile] = useState<AthleteProfileResponse["athleteProfile"] | null>(null);
  const [activeProgram, setActiveProgram] = useState<AthleteProfileResponse["activeProgram"] | null>(null);
  const [planningRecommendation, setPlanningRecommendation] = useState<PlanningRecommendation | null>(null);
  const [programs, setPrograms] = useState<ProgramListResponse["programs"]>([]);
  const [sessions, setSessions] = useState<SessionListResponse["sessions"]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [favoriteSessionId, setFavoriteSessionId] = useState<string | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetailResponse["session"] | null>(null);
  const [selectedSessionGuidance, setSelectedSessionGuidance] = useState<SessionDetailResponse["guidance"] | null>(null);
  const [cachedSessionIds, setCachedSessionIds] = useState<string[]>([]);
  const [preloadState, setPreloadState] = useState<PreloadProgressState>(createIdlePreloadState());
  const [logDraft, setLogDraft] = useState<LogDraftState>(emptyLogDraft);
  const [preSessionCheckIns, setPreSessionCheckIns] = useState<Record<string, PreSessionCheckInState>>({});
  const [progress, setProgress] = useState<AthleteProgressResponse | null>(null);
  const [trendWindow, setTrendWindow] = useState<TrendWindow>("28D");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [resetPasswordEmail, setResetPasswordEmail] = useState("");
  const [resetPasswordCode, setResetPasswordCode] = useState("");
  const [resetPasswordToken, setResetPasswordToken] = useState("");
  const [resetPasswordNew, setResetPasswordNew] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [athleteSetup, setAthleteSetup] = useState<AthleteSetupState>(emptyAthleteSetup);
  const [startDateMode, setStartDateMode] = useState<'hoy' | 'manana' | 'otra'>('hoy');
  const [availableTemplates, setAvailableTemplates] = useState<PublicTemplateMeta[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Auto-dismiss success toast after 10 s (errors stay until dismissed)
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 10_000);
    return () => clearTimeout(t);
  }, [message]);

  useEffect(() => {
    void loadValidCachedSessionIds().then(setCachedSessionIds);
  }, []);

  // Handle deep link reset token from _layout router push
  useEffect(() => {
    if (resetToken) {
      setResetPasswordToken(resetToken);
      setResetPasswordEmail("");
      setResetPasswordCode("");
      setResetPasswordNew("");
      setResetPasswordVisible(true);
    }
  }, [resetToken]);

  useEffect(() => {
    requestJson<{ templates: PublicTemplateMeta[] }>("/api/v1/templates/program-templates")
      .then((res) => {
        setAvailableTemplates(res.templates);
        if (res.templates.length > 0) {
          setAthleteSetup((s) => ({ ...s, templateCode: res.templates[0].code }));
        }
      })
      .catch(() => {/* use default */});
  }, []);

  const [notificationPermission, setNotificationPermission] = useState<PermissionState>("unknown");
  const [calendarPermission, setCalendarPermission] = useState<PermissionState>("unknown");
  const autoSyncKeyRef = useRef<string>("");

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ?? googleClientIds.web;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? googleClientIds.ios;
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? googleClientIds.android;
  const expoProxyProjectFullName = ((Constants.expoConfig as (typeof Constants.expoConfig & { originalFullName?: string }) | null)?.originalFullName)
    ?? (Constants.expoConfig?.owner
      ? `@${Constants.expoConfig.owner}/${Constants.expoConfig.slug}`
      : `@anonymous/${Constants.expoConfig?.slug ?? "3m30cm-game"}`);
  const googleExpoGoRedirectUri = isExpoGo && googleWebClientId
    ? `https://auth.expo.io/${expoProxyProjectFullName}`
    : undefined;
  const googleExpoGoReturnUrl = isExpoGo ? AuthSession.getDefaultReturnUrl() : undefined;
  const googlePlatformClientConfigured = useNativeAndroidGoogleSignIn
    ? Boolean(googleWebClientId)
    : isExpoGo
      ? Boolean(googleWebClientId)
      : Platform.select({
        android: Boolean(googleAndroidClientId),
        ios: Boolean(googleIosClientId),
        default: Boolean(googleWebClientId),
      });

  useEffect(() => {
    if (!useNativeAndroidGoogleSignIn || !googleWebClientId) {
      return;
    }

    NativeGoogleSignin.configure({
      webClientId: googleWebClientId,
    });
  }, [googleWebClientId]);

  // Google OAuth hook
  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    clientId: isExpoGo ? googleWebClientId : undefined,
    androidClientId: !isExpoGo
      ? (useNativeAndroidGoogleSignIn
        ? googleWebClientId ?? googleAndroidClientId ?? "missing-google-web-client-id"
        : googleAndroidClientId ?? googleWebClientId ?? "missing-android-client-id")
      : undefined,
    iosClientId: !isExpoGo ? googleIosClientId ?? googleWebClientId : undefined,
    webClientId: googleWebClientId,
    redirectUri: googleExpoGoRedirectUri,
    responseType: isExpoGo ? AuthSession.ResponseType.IdToken : undefined,
  });

  const googleExpoGoPromptUrl = useMemo(() => {
    if (!isExpoGo || !googleRequest?.url || !googleExpoGoRedirectUri || !googleExpoGoReturnUrl) {
      return undefined;
    }

    const query = new URLSearchParams({
      authUrl: googleRequest.url,
      returnUrl: googleExpoGoReturnUrl,
    });

    return `${googleExpoGoRedirectUri}/start?${query.toString()}`;
  }, [googleExpoGoRedirectUri, googleExpoGoReturnUrl, googleRequest?.url]);

  useEffect(() => {
    if (googleResponse?.type !== "success") {
      return;
    }

    const googleIdToken = ("authentication" in googleResponse ? googleResponse.authentication?.idToken : undefined)
      ?? googleResponse.params?.id_token;

    if (googleIdToken) {
      void handleGoogleSignIn(googleIdToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  async function handleGoogleAccess() {
    setError("");
    setMessage("");

    if (useNativeAndroidGoogleSignIn) {
      if (!googleWebClientId) {
        setError("Falta configurar el client ID web de Google para Android.");
        return;
      }

      try {
        setLoading(true);
        await NativeGoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        NativeGoogleSignin.configure({ webClientId: googleWebClientId });

        const nativeGoogleResponse = await NativeGoogleSignin.signIn();
        if (nativeGoogleResponse.type !== "success") {
          return;
        }

        const nativeGoogleTokens = await NativeGoogleSignin.getTokens();
        if (!nativeGoogleTokens.idToken) {
          throw new Error("Google no devolvio un token de identidad.");
        }

        await handleGoogleSignIn(nativeGoogleTokens.idToken);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "No se pudo iniciar sesion con Google");
      } finally {
        setLoading(false);
      }
      return;
    }

    const googlePromptResult = await promptGoogleAsync(googleExpoGoPromptUrl ? { url: googleExpoGoPromptUrl } : undefined);
    if (googlePromptResult.type === "error") {
      setError("No se pudo completar el acceso con Google.");
    }
  }
  // ── New navigation state ──────────────────────────────────
  const [activeScreen, setActiveScreen] = useState<AppScreen>("hoy");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null);
  // Coach role: "coach" = pure coach view, "athlete" = pure athlete, "both" = switcher
  const [activeRole, setActiveRole] = useState<"athlete" | "coach">("athlete");
  const [exerciseStep, setExerciseStep] = useState(0);
  const [jumpGuideVisible, setJumpGuideVisible] = useState(false);
  const [todayProgressStep, setTodayProgressStep] = useState(0);

  async function handleUnauthorizedSession(messageText = "La sesion ya no es valida. Inicia sesion otra vez.") {
    await deleteStoredValue(accessTokenStorageKey);
    setAccessToken(null);
    setSelectedSessionId(null);
    setSelectedSession(null);
    setSelectedSessionGuidance(null);
    setLogDraft(emptyLogDraft());
    setError("");
    setMessage(messageText);
  }

  async function refreshNativePermissionState() {
    const [notifications, calendar] = await Promise.all([getNotificationsModule(), getCalendarModule()]);

    if (!notifications) {
      setNotificationPermission("unknown");
    } else {
      try {
        const notificationSettings = await notifications.getPermissionsAsync();
        setNotificationPermission(notificationSettings.granted ? "granted" : notificationSettings.canAskAgain ? "unknown" : "denied");
      } catch {
        setNotificationPermission("unknown");
      }
    }

    if (!calendar) {
      setCalendarPermission("unknown");
      return;
    }

    try {
      const calendarSettings = await calendar.getCalendarPermissionsAsync();
      setCalendarPermission(calendarSettings.granted ? "granted" : calendarSettings.canAskAgain ? "unknown" : "denied");
    } catch {
      setCalendarPermission("unknown");
    }
  }

  const completedExercisesCount = useMemo(
    () => logDraft.completedExerciseIds.length,
    [logDraft.completedExerciseIds],
  );

  const jumpTestPreview = useMemo(() => {
    const attempts = [
      toOptionalNumber(logDraft.jumpTestAttempt1Cm),
      toOptionalNumber(logDraft.jumpTestAttempt2Cm),
      toOptionalNumber(logDraft.jumpTestAttempt3Cm),
    ].filter((entry): entry is number => typeof entry === "number");

    const best = attempts.length ? Math.max(...attempts) : null;
    const average = attempts.length ? Math.round((attempts.reduce((total, entry) => total + entry, 0) / attempts.length) * 10) / 10 : null;

    return {
      attempts,
      best,
      average,
      deltaVsPersonalBest: best !== null && typeof progress?.personalBests.jumpHeightCm === "number" ? Math.round((best - progress.personalBests.jumpHeightCm) * 10) / 10 : null,
      deltaVsBlockBest: best !== null && typeof progress?.blockComparison.currentProgramBestJumpCm === "number" ? Math.round((best - progress.blockComparison.currentProgramBestJumpCm) * 10) / 10 : null,
      deltaVsPhaseReference: best !== null && typeof progress?.phaseComparison.referencePhaseBestJumpCm === "number" ? Math.round((best - progress.phaseComparison.referencePhaseBestJumpCm) * 10) / 10 : null,
    };
  }, [
    logDraft.jumpTestAttempt1Cm,
    logDraft.jumpTestAttempt2Cm,
    logDraft.jumpTestAttempt3Cm,
    progress,
  ]);

  const filteredJumpTrendBars = useMemo(
    () => buildTrendBars(filterSeriesByWindow(progress?.trends.jumpHeightCm ?? [], trendWindow)),
    [progress?.trends.jumpHeightCm, trendWindow],
  );
  const filteredReadinessTrendBars = useMemo(
    () => buildTrendBars(filterSeriesByWindow(progress?.trends.readinessScore ?? [], trendWindow)),
    [progress?.trends.readinessScore, trendWindow],
  );
  const filteredLoadTrendBars = useMemo(
    () => buildTrendBars(filterSeriesByWindow(progress?.trends.avgLoadKg ?? [], trendWindow)),
    [progress?.trends.avgLoadKg, trendWindow],
  );
  const selectedWindowComparison = trendWindow === "7D"
    ? progress?.windowComparisons.last7Days ?? null
    : trendWindow === "28D"
      ? progress?.windowComparisons.last28Days ?? null
      : null;
  const favoriteSession = useMemo(
    () => sessions.find((session) => session.id === favoriteSessionId) ?? null,
    [sessions, favoriteSessionId],
  );
  const todayPrimarySession = favoriteSession ?? progress?.nextSession ?? sessions[0] ?? null;
  const todaySessionSummary = useMemo(
    () => sessions.find((session) => session.id === todayPrimarySession?.id) ?? null,
    [sessions, todayPrimarySession?.id],
  );
  const selectedCycle = useMemo(
    () => progress?.cycleEvolution.find((cycle) => cycle.id === selectedCycleId) ?? progress?.cycleEvolution[0] ?? null,
    [progress?.cycleEvolution, selectedCycleId],
  );
  const selectedExercise = useMemo(
    () => selectedSession?.sessionExercises.find((exercise) => exercise.id === selectedExerciseId) ?? selectedSession?.sessionExercises[0] ?? null,
    [selectedSession, selectedExerciseId],
  );
  const favoriteSessionComparison = useMemo(() => {
    if (!favoriteSession?.logs[0]?.metrics) {
      return null;
    }

    const latestMetrics = favoriteSession.logs[0].metrics;
    return {
      jumpDeltaVsBest: typeof latestMetrics.jumpHeightCm === "number" && typeof progress?.historicalBestSessions.jumpHeight?.metrics?.jumpHeightCm === "number"
        ? Math.round((latestMetrics.jumpHeightCm - progress.historicalBestSessions.jumpHeight.metrics.jumpHeightCm) * 10) / 10
        : null,
      readinessDeltaVsBest: typeof latestMetrics.readinessScore === "number" && typeof progress?.historicalBestSessions.readiness?.metrics?.readinessScore === "number"
        ? Math.round((latestMetrics.readinessScore - progress.historicalBestSessions.readiness.metrics.readinessScore) * 10) / 10
        : null,
      loadDeltaVsBest: typeof latestMetrics.avgLoadKg === "number" && typeof progress?.historicalBestSessions.avgLoad?.metrics?.avgLoadKg === "number"
        ? Math.round((latestMetrics.avgLoadKg - progress.historicalBestSessions.avgLoad.metrics.avgLoadKg) * 10) / 10
        : null,
    };
  }, [favoriteSession, progress?.historicalBestSessions]);
  const todayCheckIn = todayPrimarySession ? preSessionCheckIns[todayPrimarySession.id] ?? emptyPreSessionCheckIn() : null;
  const todayCheckInFeedback = useMemo(
    () => buildPreSessionFeedback(todayCheckIn),
    [todayCheckIn],
  );
  const needsProgramSetup = !activeProgram;
  const todayCompletion = (() => {
    if (!todaySessionSummary) return 0;
    const total = Math.max(todaySessionSummary.sessionExercises.length, 1);
    // Use local step progress if available (set when user advances through exercises)
    if (todayProgressStep > 0) {
      return Math.round((Math.min(todayProgressStep, total) / total) * 100);
    }
    // Fall back to server's completedAt timestamps
    return Math.round((todaySessionSummary.sessionExercises.filter((exercise) => Boolean(exercise.completedAt)).length / total) * 100);
  })();

  const selectedSessionCompletion = selectedSession
    ? Math.round((completedExercisesCount / Math.max(selectedSession.sessionExercises.length, 1)) * 100)
    : 0;

  const athleteInitials = useMemo(() => {
    if (profile?.user.firstName && profile.user.lastName) {
      return `${profile.user.firstName[0]}${profile.user.lastName[0]}`.toUpperCase();
    }
    if (profile?.displayName) return profile.displayName.slice(0, 2).toUpperCase();
    return profile?.user.email?.slice(0, 2).toUpperCase() ?? "?";
  }, [profile]);

  useEffect(() => {
    void (async () => {
      try {
        const savedToken = await readStoredValue(accessTokenStorageKey);
        const savedTrendWindow = await readStoredValue(trendWindowStorageKey);
        const savedFavoriteSession = await readStoredValue(favoriteSessionStorageKey);
        const savedCycle = await readStoredValue(selectedCycleStorageKey);
        const savedExercise = await readStoredValue(selectedExerciseStorageKey);
        await refreshNativePermissionState();

        if (savedTrendWindow === "7D" || savedTrendWindow === "28D" || savedTrendWindow === "ALL") {
          setTrendWindow(savedTrendWindow);
        }

        if (savedFavoriteSession) {
          setFavoriteSessionId(savedFavoriteSession);
        }

        if (savedCycle) {
          setSelectedCycleId(savedCycle);
        }

        if (savedExercise) {
          setSelectedExerciseId(savedExercise);
        }

        if (savedToken) {
          setAccessToken(savedToken);
          if (isCoachToken(savedToken) && !hasAthleteRole(savedToken)) {
            setActiveRole("coach");
          } else {
            setActiveRole("athlete");
          }
        }
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setProfile(null);
      setActiveProgram(null);
      setPlanningRecommendation(null);
      setPrograms([]);
      setSessions([]);
      setSelectedSessionId(null);
      setSelectedSession(null);
      setSelectedSessionGuidance(null);
      setProgress(null);
      return;
    }

    void refreshAthleteArea(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    setAthleteSetup((current) => ({
      ...current,
      displayName: profile.displayName ?? current.displayName,
      sport: profile.sport ?? current.sport,
      trainsSport: profile.trainsSport,
      sportTrainingDays: Array.isArray(profile.sportTrainingDays?.trainingDays)
        ? profile.sportTrainingDays.trainingDays.join(",")
        : current.sportTrainingDays,
      seasonPhase: profile.seasonPhase ?? current.seasonPhase,
      availableWeekdays: Array.isArray(profile.weeklyAvailability?.availableWeekdays)
        ? profile.weeklyAvailability.availableWeekdays.join(",")
        : current.availableWeekdays,
      notes: profile.notes ?? current.notes,
    }));
  }, [profile]);

  useEffect(() => {
    void writeStoredValue(trendWindowStorageKey, trendWindow);
  }, [trendWindow]);

  useEffect(() => {
    if (favoriteSessionId) {
      void writeStoredValue(favoriteSessionStorageKey, favoriteSessionId);
      return;
    }

    void deleteStoredValue(favoriteSessionStorageKey);
  }, [favoriteSessionId]);

  useEffect(() => {
    if (selectedCycleId) {
      void writeStoredValue(selectedCycleStorageKey, selectedCycleId);
      return;
    }

    void deleteStoredValue(selectedCycleStorageKey);
  }, [selectedCycleId]);

  useEffect(() => {
    if (selectedExerciseId) {
      void writeStoredValue(selectedExerciseStorageKey, selectedExerciseId);
      return;
    }

    void deleteStoredValue(selectedExerciseStorageKey);
  }, [selectedExerciseId]);

  useEffect(() => {
    if (!profile?.id) {
      setPreSessionCheckIns({});
      return;
    }

    void (async () => {
      const storedCheckIns = await readStoredJson<Record<string, PreSessionCheckInState>>(
        getPreSessionCheckInStorageKey(profile.id),
        {},
      );
      setPreSessionCheckIns(storedCheckIns);
    })();
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) {
      return;
    }

    void writeStoredValue(getPreSessionCheckInStorageKey(profile.id), JSON.stringify(preSessionCheckIns));
  }, [preSessionCheckIns, profile?.id]);

  useEffect(() => {
    if (!accessToken || !selectedSessionId) {
      setSelectedSession(null);
      setSelectedSessionGuidance(null);
      return;
    }

    void loadSessionDetail(selectedSessionId, accessToken);
  }, [selectedSessionId, accessToken]);

  // Persist exercise step whenever it changes
  useEffect(() => {
    if (selectedSessionId && exerciseStep > 0) {
      void saveExerciseProgress(selectedSessionId, exerciseStep);
      // Keep todayProgressStep in sync when the user is on today's session
      if (selectedSessionId === todayPrimarySession?.id) {
        setTodayProgressStep(exerciseStep);
      }
    }
  }, [exerciseStep, selectedSessionId, todayPrimarySession?.id]);

  // Load the saved step for today's session (for the "% hoy" metric)
  useEffect(() => {
    if (!todayPrimarySession?.id) {
      setTodayProgressStep(0);
      return;
    }
    void loadExerciseProgress(todayPrimarySession.id).then(setTodayProgressStep);
  }, [todayPrimarySession?.id]);

  useEffect(() => {
    if (!selectedSession?.id) {
      return;
    }

    const savedCheckIn = preSessionCheckIns[selectedSession.id];
    if (!savedCheckIn) {
      return;
    }

    setLogDraft((current) => mergeCheckInIntoLogDraft(current, savedCheckIn));
  }, [selectedSession?.id, preSessionCheckIns]);

  async function refreshAthleteArea(token = accessToken ?? undefined) {
    if (!token) {
      return;
    }

    try {
      setRefreshing(true);
      setError("");

      const sessionAdjustment = await requestJson<AutoSessionAdjustmentResponse>(
        "/api/v1/athlete/sessions/auto-rollover",
        { method: "POST" },
        token,
      );

      const [profileResponse, programsResponse, sessionsResponse, progressResponse] = await Promise.all([
        requestJson<AthleteProfileResponse>("/api/v1/athlete/me", {}, token),
        requestJson<ProgramListResponse>("/api/v1/athlete/programs", {}, token),
        requestJson<SessionListResponse>("/api/v1/athlete/sessions", {}, token),
        requestJson<AthleteProgressResponse>("/api/v1/athlete/progress", {}, token),
      ]);

      setProfile(profileResponse.athleteProfile);
      setActiveProgram(profileResponse.activeProgram);
      setPlanningRecommendation(profileResponse.planningRecommendation);
      setCurrentAvatarUrl(profileResponse.athleteProfile.user.avatarUrl ?? null);
      setPrograms(programsResponse.programs);
      setSessions(sessionsResponse.sessions);
      setProgress(progressResponse);

      if (sessionAdjustment.rolledOverSessions.length || sessionAdjustment.skippedSessions.length) {
        const messages: string[] = [];

        if (sessionAdjustment.rolledOverSessions.length) {
          messages.push(`${sessionAdjustment.rolledOverSessions.length} sesion(es) se recorrieron automaticamente al siguiente dia.`);
        }

        if (sessionAdjustment.skippedSessions.length) {
          messages.push(`${sessionAdjustment.skippedSessions.length} sesion(es) quedaron como perdidas por superar el limite de 2 dias.`);
        }

        setMessage(messages.join(" "));
      }

      if (progressResponse.cycleEvolution.length) {
        setSelectedCycleId((current) => {
          const exists = progressResponse.cycleEvolution.some((cycle) => cycle.id === current);
          return exists ? current : progressResponse.cycleEvolution[0].id;
        });
      }

      const firstSession = sessionsResponse.sessions[0];
      if (firstSession) {
        setSelectedSessionId((current) => {
          const exists = sessionsResponse.sessions.some((session) => session.id === current);
          if (exists) {
            return current;
          }

          const favoriteExists = favoriteSessionId && sessionsResponse.sessions.some((session) => session.id === favoriteSessionId);
          return favoriteExists ? favoriteSessionId : firstSession.id;
        });
      } else {
        setSelectedSessionId(null);
      }
    } catch (requestError) {
      if (requestError instanceof UnauthorizedRequestError) {
        await handleUnauthorizedSession("Tu sesion expiro. Entra otra vez.");
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "No se pudo cargar la cuenta del atleta");
    } finally {
      setRefreshing(false);
    }
  }

  function applyLoadedSession(
    session: SessionDetailResponse["session"],
    guidance: SessionDetailResponse["guidance"] | null | undefined,
  ) {
    setSelectedSession(session);
    setSelectedSessionGuidance(guidance ?? null);

    if (session.sessionExercises.length) {
      setSelectedExerciseId((current) => {
        const exists = session.sessionExercises.some((exercise) => exercise.id === current);
        return exists ? current : session.sessionExercises[0].id;
      });
    } else {
      setSelectedExerciseId(null);
    }

    const lastMetrics = session.logs[0]?.metrics;
    const nextDraft: LogDraftState = {
      notes: session.logs[0]?.notes ?? "",
      perceivedExertion: session.logs[0]?.perceivedExertion?.toString() ?? "",
      status: session.status === "SKIPPED" ? "SKIPPED" : "COMPLETED",
      completedExerciseIds: session.sessionExercises
        .filter((exercise) => Boolean(exercise.completedAt))
        .map((exercise) => exercise.id),
      readinessScore: toInputValue(lastMetrics?.readinessScore),
      sorenessScore: toInputValue(lastMetrics?.sorenessScore),
      painScore: toInputValue(lastMetrics?.painScore),
      moodScore: toInputValue(lastMetrics?.moodScore),
      sleepHours: toInputValue(lastMetrics?.sleepHours),
      jumpHeightCm: toInputValue(lastMetrics?.jumpHeightCm),
      bodyWeightKg: toInputValue(lastMetrics?.bodyWeightKg),
      avgLoadKg: toInputValue(lastMetrics?.avgLoadKg),
      peakVelocityMps: toInputValue(lastMetrics?.peakVelocityMps),
      sessionDurationMin: toInputValue(lastMetrics?.sessionDurationMin),
      jumpTestAttempt1Cm: toInputValue(lastMetrics?.jumpTestAttempt1Cm),
      jumpTestAttempt2Cm: toInputValue(lastMetrics?.jumpTestAttempt2Cm),
      jumpTestAttempt3Cm: toInputValue(lastMetrics?.jumpTestAttempt3Cm),
    };

    setLogDraft(mergeCheckInIntoLogDraft(nextDraft, preSessionCheckIns[session.id] ?? null));
  }

  async function handlePreloadSession(sessionId: string, sessionTitle: string) {
    if (!accessToken) {
      setError("Necesitas iniciar sesion para precargar una sesion offline.");
      return;
    }

    setError("");
    setPreloadState({
      visible: true,
      sessionId,
      sessionTitle,
      progress: 4,
      statusText: "Preparando sesion offline...",
      detailText: offlinePreloadMessage,
    });

    try {
      const response = await requestJson<SessionDetailResponse>(`/api/v1/athlete/sessions/${sessionId}`, {}, accessToken);
      const sessionDirectory = await ensureSessionCacheDirectory(sessionId);
      const downloadTasks = collectSessionMediaDownloads(response.session, sessionDirectory);
      const mediaMap: Record<string, string> = {};

      setPreloadState({
        visible: true,
        sessionId,
        sessionTitle,
        progress: downloadTasks.length ? 12 : 85,
        statusText: downloadTasks.length
          ? `Descargando ${downloadTasks.length} recursos de la sesion...`
          : "Guardando sesion offline...",
        detailText: offlinePreloadMessage,
      });

      for (let index = 0; index < downloadTasks.length; index += 1) {
        const task = downloadTasks[index];
        const existingFile = await FileSystem.getInfoAsync(task.fileUri);

        if (!existingFile.exists) {
          await FileSystem.downloadAsync(task.sourceUrl, task.fileUri);
        }

        mediaMap[task.sourceUrl] = task.fileUri;

        const progressValue = 12 + Math.round(((index + 1) / Math.max(downloadTasks.length, 1)) * 78);
        setPreloadState({
          visible: true,
          sessionId,
          sessionTitle,
          progress: progressValue,
          statusText: `Descargando recurso ${index + 1} de ${downloadTasks.length}...`,
          detailText: offlinePreloadMessage,
        });
      }

      const cachedRecord: CachedSessionRecord = {
        version: sessionCacheVersion,
        cachedAt: new Date().toISOString(),
        session: response.session,
        guidance: response.guidance ?? null,
        mediaMap,
      };

      await writeCachedSessionRecord(sessionId, cachedRecord);
      setCachedSessionIds((current) => {
        const next = current.includes(sessionId) ? current : [...current, sessionId];
        void writeCachedSessionIds(next);
        return next;
      });

      setMessage(`Sesion lista offline: ${sessionTitle}.`);
      setPreloadState({
        visible: true,
        sessionId,
        sessionTitle,
        progress: 100,
        statusText: "Sesion lista para usar offline.",
        detailText: offlinePreloadMessage,
      });
    } catch (requestError) {
      if (requestError instanceof UnauthorizedRequestError) {
        await handleUnauthorizedSession("Tu sesion expiro. Entra otra vez.");
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "No se pudo precargar la sesion offline");
    } finally {
      setPreloadState(createIdlePreloadState());
    }
  }

  async function loadSessionDetail(sessionId: string, token = accessToken ?? undefined) {
    if (!token) {
      const cachedRecord = await readCachedSessionRecord(sessionId);
      if (cachedRecord) {
        applyLoadedSession(attachSessionOfflineMedia(cachedRecord.session, cachedRecord.mediaMap), cachedRecord.guidance);
      }
      return;
    }

    try {
      const cachedRecord = cachedSessionIds.includes(sessionId) ? await readCachedSessionRecord(sessionId) : null;
      const response = await requestJson<SessionDetailResponse>(`/api/v1/athlete/sessions/${sessionId}`, {}, token);
      const hydratedSession = cachedRecord
        ? attachSessionOfflineMedia(response.session, cachedRecord.mediaMap)
        : response.session;
      applyLoadedSession(hydratedSession, response.guidance ?? null);
    } catch (requestError) {
      if (requestError instanceof UnauthorizedRequestError) {
        await handleUnauthorizedSession("Tu sesion expiro. Entra otra vez.");
        return;
      }

      const cachedRecord = await readCachedSessionRecord(sessionId);
      if (cachedRecord) {
        applyLoadedSession(attachSessionOfflineMedia(cachedRecord.session, cachedRecord.mediaMap), cachedRecord.guidance);
        setMessage("Sin conectividad estable: abrimos la sesion precargada del telefono.");
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "No se pudo cargar la sesion");
    }
  }

  function applyJumpTestToDraft() {
    if (jumpTestPreview.best === null) {
      setMessage("Registra al menos un intento para volcar el test al log.");
      return;
    }

    setLogDraft((current) => ({
      ...current,
      jumpHeightCm: String(jumpTestPreview.best),
    }));
    setMessage("El mejor intento del test se copio al campo de salto.");
  }

  function toggleFavoriteSession(sessionId: string) {
    setFavoriteSessionId((current) => (current === sessionId ? null : sessionId));
  }

  function updateTodayCheckIn(field: keyof Omit<PreSessionCheckInState, "savedAt">, value: string) {
    if (!todayPrimarySession) {
      return;
    }

    setPreSessionCheckIns((current) => ({
      ...current,
      [todayPrimarySession.id]: {
        ...(current[todayPrimarySession.id] ?? emptyPreSessionCheckIn()),
        [field]: value,
      },
    }));
  }

  function saveTodayCheckIn() {
    if (!todayPrimarySession) {
      return;
    }

    setPreSessionCheckIns((current) => ({
      ...current,
      [todayPrimarySession.id]: {
        ...(current[todayPrimarySession.id] ?? emptyPreSessionCheckIn()),
        savedAt: new Date().toISOString(),
      },
    }));

    setSelectedSessionId(todayPrimarySession.id);
    setMessage("Check-in previo guardado y vinculado a la sesion de hoy.");
  }

  function clearTodayCheckIn() {
    if (!todayPrimarySession) {
      return;
    }

    setPreSessionCheckIns((current) => {
      const nextState = { ...current };
      delete nextState[todayPrimarySession.id];
      return nextState;
    });
    setMessage("Check-in previo eliminado.");
  }

  async function ensureNotificationAccess() {
    const notifications = await getNotificationsModule();
    if (!notifications) {
      setNotificationPermission("denied");
      setError("Las notificaciones no estan disponibles en este cliente.");
      return false;
    }

    const currentSettings = await notifications.getPermissionsAsync();
    const alreadyGranted = currentSettings.granted;

    if (alreadyGranted) {
      setNotificationPermission("granted");
    }

    const settings = alreadyGranted ? currentSettings : await notifications.requestPermissionsAsync();
    const granted = settings.granted;

    setNotificationPermission(granted ? "granted" : "denied");

    if (granted && Platform.OS === "android") {
      await notifications.setNotificationChannelAsync(notificationChannelId, {
        name: "Training reminders",
        importance: notifications.AndroidImportance.HIGH,
      });
    }

    return granted;
  }

  async function ensureCalendarAccess() {
    const calendar = await getCalendarModule();
    if (!calendar) {
      setCalendarPermission("denied");
      setError("El calendario no esta disponible en este cliente.");
      return false;
    }

    const currentSettings = await calendar.getCalendarPermissionsAsync();
    const settings = currentSettings.granted ? currentSettings : await calendar.requestCalendarPermissionsAsync();
    const granted = settings.granted;

    setCalendarPermission(granted ? "granted" : "denied");
    return granted;
  }

  async function resolveWritableCalendarId() {
    const calendar = await getCalendarModule();
    if (!calendar) {
      return null;
    }

    const calendars = await calendar.getCalendarsAsync(calendar.EntityTypes.EVENT);
    const writableCalendar = calendars.find((calendar) => calendar.allowsModifications) ?? calendars[0];
    return writableCalendar?.id ?? null;
  }

  async function handleEnableNotifications() {
    if (!accessToken) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const granted = await ensureNotificationAccess();
      if (!granted) {
        setMessage("Permiso de notificaciones no concedido.");
        return;
      }

      setMessage(
        isExpoGo
          ? "Permiso listo. En Expo Go solo quedan activos los recordatorios locales; el push remoto requiere un development build."
          : "Permiso listo. Puedes programar recordatorios locales desde la sesion seleccionada.",
      );
    } catch (requestError) {
      if (requestError instanceof UnauthorizedRequestError) {
        await handleUnauthorizedSession("Tu sesion expiro. Entra otra vez.");
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "No se pudo activar notificaciones");
    } finally {
      setLoading(false);
    }
  }

  async function handleScheduleReminder() {
    if (!selectedSession) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const granted = await ensureNotificationAccess();
      if (!granted) {
        setMessage("Sin permiso de notificaciones no se puede programar el recordatorio.");
        return;
      }

      if (!isSameLocalDay(selectedSession.scheduledDate, new Date())) {
        setError("El recordatorio motivacional solo se programa para sesiones del dia actual.");
        return;
      }

      const reminderDate = buildReminderDate(selectedSession.scheduledDate);
      if (!reminderDate) {
        setError("La hora de las 8:00 ya paso o la sesion no corresponde a hoy; no se pudo agendar el recordatorio motivacional.");
        return;
      }

      const reminderMap = await readStoredMap(reminderSyncStorageKey);
      const existingReminderId = reminderMap[selectedSession.id];
      const notifications = await getNotificationsModule();

      if (!notifications) {
        setError("Las notificaciones no estan disponibles en este cliente.");
        return;
      }

      if (existingReminderId) {
        await notifications.cancelScheduledNotificationAsync(existingReminderId).catch(() => undefined);
      }

      const reminderCopy = buildMotivationalReminderCopy(selectedSession, progress?.summary.currentStreak ?? 0);

      const notificationId = await notifications.scheduleNotificationAsync({
        content: {
          title: reminderCopy.title,
          body: reminderCopy.body,
          data: { sessionId: selectedSession.id },
        },
        trigger: {
          type: notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
          channelId: Platform.OS === "android" ? notificationChannelId : undefined,
        },
      });

      await writeStoredMap(reminderSyncStorageKey, {
        ...reminderMap,
        [selectedSession.id]: notificationId,
      });

      setMessage(`Recordatorio motivacional programado para ${reminderDate.toLocaleString()}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo programar el recordatorio");
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncCalendar() {
    if (!selectedSession) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const granted = await ensureCalendarAccess();
      if (!granted) {
        setMessage("Sin permiso de calendario no se pudo sincronizar la sesion.");
        return;
      }

      const calendarId = await resolveWritableCalendarId();
      if (!calendarId) {
        setError("No hay un calendario editable disponible en este dispositivo.");
        return;
      }

      const calendarMap = await readStoredMap(calendarSyncStorageKey);
      const existingEventId = calendarMap[selectedSession.id];
      const sessionStart = new Date(selectedSession.scheduledDate);
      const sessionEnd = new Date(sessionStart.getTime() + 60 * 60 * 1000);
      const eventPayload = {
        title: selectedSession.title,
        startDate: sessionStart,
        endDate: sessionEnd,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notes: buildCalendarSessionNotes(selectedSession),
        location: profile?.team?.name ?? undefined,
      };

      let eventId: string | undefined = existingEventId;
      const calendar = await getCalendarModule();

      if (!calendar) {
        setError("El calendario no esta disponible en este cliente.");
        return;
      }

      if (existingEventId) {
        const updatedEventId = await calendar.updateEventAsync(existingEventId, eventPayload).catch(() => null);
        eventId = updatedEventId ?? undefined;
      }

      if (!eventId) {
        eventId = await calendar.createEventAsync(calendarId, eventPayload);
      }

      await writeStoredMap(calendarSyncStorageKey, {
        ...calendarMap,
        [selectedSession.id]: eventId,
      });

      setMessage("Sesion sincronizada con el calendario del dispositivo.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo sincronizar con el calendario");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken || !todayPrimarySession || isWebPlatform) {
      return;
    }

    const syncKey = [
      todayPrimarySession.id,
      todayPrimarySession.scheduledDate,
      todayPrimarySession.status,
      progress?.summary.currentStreak ?? 0,
      notificationPermission,
      calendarPermission,
      profile?.team?.name ?? "",
    ].join("|");

    if (autoSyncKeyRef.current === syncKey) {
      return;
    }

    autoSyncKeyRef.current = syncKey;

    void (async () => {
      if (notificationPermission === "granted" && isSameLocalDay(todayPrimarySession.scheduledDate, new Date()) && todayPrimarySession.status !== "COMPLETED" && todayPrimarySession.status !== "SKIPPED") {
        const notifications = await getNotificationsModule();
        if (notifications) {
          const reminderMap = await readStoredMap(reminderSyncStorageKey);
          const existingReminderId = reminderMap[todayPrimarySession.id];
          const reminderDate = buildReminderDate(todayPrimarySession.scheduledDate);

          if (existingReminderId) {
            await notifications.cancelScheduledNotificationAsync(existingReminderId).catch(() => undefined);
          }

          if (reminderDate) {
            const reminderCopy = buildMotivationalReminderCopy(todayPrimarySession, progress?.summary.currentStreak ?? 0);
            const notificationId = await notifications.scheduleNotificationAsync({
              content: {
                title: reminderCopy.title,
                body: reminderCopy.body,
                data: { sessionId: todayPrimarySession.id },
              },
              trigger: {
                type: notifications.SchedulableTriggerInputTypes.DATE,
                date: reminderDate,
                channelId: Platform.OS === "android" ? notificationChannelId : undefined,
              },
            });

            await writeStoredMap(reminderSyncStorageKey, {
              ...reminderMap,
              [todayPrimarySession.id]: notificationId,
            });
          }
        }
      }

      if (calendarPermission === "granted" && todayPrimarySession.status !== "SKIPPED") {
        const calendar = await getCalendarModule();
        const calendarId = calendar ? await resolveWritableCalendarId() : null;

        if (calendar && calendarId) {
          const calendarMap = await readStoredMap(calendarSyncStorageKey);
          const existingEventId = calendarMap[todayPrimarySession.id];
          const sessionStart = new Date(todayPrimarySession.scheduledDate);
          const sessionEnd = new Date(sessionStart.getTime() + 60 * 60 * 1000);
          const eventPayload = {
            title: todayPrimarySession.title,
            startDate: sessionStart,
            endDate: sessionEnd,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            notes: buildCalendarSessionNotes(todayPrimarySession),
            location: profile?.team?.name ?? undefined,
          };

          let eventId: string | undefined = existingEventId;
          if (existingEventId) {
            const updatedEventId = await calendar.updateEventAsync(existingEventId, eventPayload).catch(() => null);
            eventId = updatedEventId ?? undefined;
          }

          if (!eventId) {
            eventId = await calendar.createEventAsync(calendarId, eventPayload);
          }

          await writeStoredMap(calendarSyncStorageKey, {
            ...calendarMap,
            [todayPrimarySession.id]: eventId,
          });
        }
      }
    })();
  }, [accessToken, calendarPermission, notificationPermission, profile?.team?.name, progress?.summary.currentStreak, todayPrimarySession]);

  async function handleLogin() {
    try {
      setLoading(true);
      setError("");
      setMessage("");

      const response = await requestJson<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });

      await writeStoredValue(accessTokenStorageKey, response.accessToken);
      setAccessToken(response.accessToken);
      // Route coach-only users directly to coach dashboard
      if (isCoachToken(response.accessToken) && !hasAthleteRole(response.accessToken)) {
        setActiveRole("coach");
      } else {
        setActiveRole("athlete");
      }
      setMessage("Sesion iniciada correctamente.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo iniciar sesion");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    try {
      setLoading(true);
      setError("");
      setMessage("");

      const response = await requestJson<AthleteRegistrationResponse>("/api/v1/auth/register/athlete", {
        method: "POST",
        body: JSON.stringify({
          email: athleteSetup.email,
          password: athleteSetup.password,
          firstName: athleteSetup.firstName || undefined,
          lastName: athleteSetup.lastName || undefined,
          displayName: athleteSetup.displayName || undefined,
          sport: athleteSetup.sport || undefined,
          trainsSport: athleteSetup.trainsSport,
          sportTrainingDays: athleteSetup.trainsSport ? parseWeekdaysInput(athleteSetup.sportTrainingDays) : [],
          seasonPhase: athleteSetup.seasonPhase,
          availableWeekdays: parseWeekdaysInput(athleteSetup.availableWeekdays),
          notes: athleteSetup.notes || undefined,
        }),
      });

      await writeStoredValue(accessTokenStorageKey, response.accessToken);
      setAccessToken(response.accessToken);
      setActiveRole("athlete"); // Registered users are always athletes
      setLoginForm({ email: athleteSetup.email, password: athleteSetup.password });
      setMessage("Cuenta creada. Completa tu contexto y genera tu primer bloque desde la app.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn(idToken: string) {
    try {
      setLoading(true);
      setError("");
      const response = await requestJson<LoginResponse>("/api/v1/auth/google", {
        method: "POST",
        headers: { "X-Auth-Debug": "1" },
        body: JSON.stringify({ idToken }),
      });
      await writeStoredValue(accessTokenStorageKey, response.accessToken);
      setAccessToken(response.accessToken);
      if (isCoachToken(response.accessToken) && !hasAthleteRole(response.accessToken)) {
        setActiveRole("coach");
      } else {
        setActiveRole("athlete");
      }
    } catch (requestError) {
      setError(formatGoogleAuthError(requestError, idToken));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!forgotPasswordEmail.trim()) {
      setError("Ingresa tu email para restablecer la contraseña.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const email = forgotPasswordEmail.trim().toLowerCase();
      await requestJson<{ message: string }>("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setForgotPasswordVisible(false);
      setForgotPasswordEmail("");
      setResetPasswordToken("");
      setResetPasswordEmail(email);
      setResetPasswordCode("");
      setResetPasswordNew("");
      setResetPasswordVisible(true);
      setMessage("Si existe una cuenta, recibirás un código y un enlace por email.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo enviar el email");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!resetPasswordNew || resetPasswordNew.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    const token = resetPasswordToken.trim();
    const email = resetPasswordEmail.trim().toLowerCase();
    const code = resetPasswordCode.trim();
    if (!token && (!email || code.length !== 6)) {
      setError("Ingresa tu email y el código de 6 dígitos, o abre el enlace del email.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      await requestJson<{ message: string }>("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(token
          ? { token, newPassword: resetPasswordNew }
          : { email, code, newPassword: resetPasswordNew }),
      });
      setResetPasswordVisible(false);
      setResetPasswordEmail("");
      setResetPasswordCode("");
      setResetPasswordToken("");
      setResetPasswordNew("");
      setMessage("Contraseña actualizada. Inicia sesión con tu nueva contraseña.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo restablecer la contraseña");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveOnboarding() {
    if (!accessToken) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const response = await requestJson<{ athleteProfile: AthleteProfileResponse["athleteProfile"]; planningRecommendation: PlanningRecommendation }>(
        "/api/v1/athlete/onboarding",
        {
          method: "PUT",
          body: JSON.stringify({
            displayName: athleteSetup.displayName || undefined,
            sport: athleteSetup.sport || undefined,
            trainsSport: athleteSetup.trainsSport,
            sportTrainingDays: athleteSetup.trainsSport ? parseWeekdaysInput(athleteSetup.sportTrainingDays) : [],
            seasonPhase: athleteSetup.seasonPhase,
            availableWeekdays: parseWeekdaysInput(athleteSetup.availableWeekdays),
            notes: athleteSetup.notes || undefined,
          }),
        },
        accessToken,
      );

      setProfile(response.athleteProfile);
      setPlanningRecommendation(response.planningRecommendation);
      setMessage("Contexto del atleta guardado. Ya puedes generar el plan inicial.");
    } catch (requestError) {
      if (requestError instanceof UnauthorizedRequestError) {
        await handleUnauthorizedSession("Tu sesion expiro. Entra otra vez.");
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el onboarding");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateProgramFromApp() {
    if (!accessToken) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");

      await requestJson<{ planningRecommendation: PlanningRecommendation }>(
        "/api/v1/athlete/programs/generate",
        {
          method: "POST",
          body: JSON.stringify({
            displayName: athleteSetup.displayName || undefined,
            sport: athleteSetup.sport || undefined,
            trainsSport: athleteSetup.trainsSport,
            sportTrainingDays: athleteSetup.trainsSport ? parseWeekdaysInput(athleteSetup.sportTrainingDays) : [],
            seasonPhase: athleteSetup.seasonPhase,
            availableWeekdays: parseWeekdaysInput(athleteSetup.availableWeekdays),
            startDate: athleteSetup.startDate,
            templateCode: athleteSetup.templateCode,
            includePreparationPhase: athleteSetup.includePreparationPhase,
            notes: athleteSetup.notes || undefined,
          }),
        },
        accessToken,
      );

      setMessage("Programa generado desde la app. Actualizando sesiones y seguimiento...");
      await refreshAthleteArea(accessToken);
    } catch (requestError) {
      if (requestError instanceof UnauthorizedRequestError) {
        await handleUnauthorizedSession("Tu sesion expiro. Entra otra vez.");
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "No se pudo generar el programa");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    if (useNativeAndroidGoogleSignIn) {
      await NativeGoogleSignin.signOut().catch(() => null);
    }
    await handleUnauthorizedSession("Sesion cerrada.");
  }

  function toggleExercise(exerciseId: string) {
    setLogDraft((current) => ({
      ...current,
      completedExerciseIds: current.completedExerciseIds.includes(exerciseId)
        ? current.completedExerciseIds
        : [...current.completedExerciseIds, exerciseId],
    }));
  }

  async function handleSubmitLog() {
    if (!accessToken || !selectedSession) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      await requestJson<SessionDetailResponse>(
        `/api/v1/athlete/sessions/${selectedSession.id}/logs`,
        {
          method: "POST",
          body: JSON.stringify({
            notes: logDraft.notes || undefined,
            perceivedExertion: logDraft.perceivedExertion ? Number(logDraft.perceivedExertion) : undefined,
            status: logDraft.status,
            completedExerciseIds: logDraft.completedExerciseIds,
            metrics: {
              completedExercises: logDraft.completedExerciseIds.length,
              totalExercises: selectedSession.sessionExercises.length,
              readinessScore: toOptionalNumber(logDraft.readinessScore),
              sorenessScore: toOptionalNumber(logDraft.sorenessScore),
              painScore: toOptionalNumber(logDraft.painScore),
              moodScore: toOptionalNumber(logDraft.moodScore),
              sleepHours: toOptionalNumber(logDraft.sleepHours),
              bodyWeightKg: toOptionalNumber(logDraft.bodyWeightKg),
              avgLoadKg: toOptionalNumber(logDraft.avgLoadKg),
              peakVelocityMps: toOptionalNumber(logDraft.peakVelocityMps),
              sessionDurationMin: toOptionalNumber(logDraft.sessionDurationMin),
              jumpTestAttempt1Cm: toOptionalNumber(logDraft.jumpTestAttempt1Cm),
              jumpTestAttempt2Cm: toOptionalNumber(logDraft.jumpTestAttempt2Cm),
              jumpTestAttempt3Cm: toOptionalNumber(logDraft.jumpTestAttempt3Cm),
              jumpTestAverageCm: jumpTestPreview.average ?? undefined,
              jumpTestBestCm: jumpTestPreview.best ?? undefined,
              jumpHeightCm: toOptionalNumber(logDraft.jumpHeightCm) ?? jumpTestPreview.best ?? undefined,
            },
          }),
        },
        accessToken,
      );

      setPreSessionCheckIns((current) => {
        const nextState = { ...current };
        delete nextState[selectedSession.id];
        return nextState;
      });

      setMessage("Registro de sesion guardado.");
      await refreshAthleteArea(accessToken);
      await clearExerciseProgress(selectedSession.id);
      setExerciseStep(0);
      setTodayProgressStep(0);
      setSelectedExerciseId(null);
      setSelectedSessionGuidance(null);
      setActiveScreen("hoy");
    } catch (requestError) {
      if (requestError instanceof UnauthorizedRequestError) {
        await handleUnauthorizedSession("Tu sesion expiro. Entra otra vez.");
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el registro");
    } finally {
      setLoading(false);
    }
  }

  if (booting) {
    return (
      <SafeAreaView style={authSt.safeArea}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Image source={require('../assets/img/Logo_Blanco.png')} style={{ width: 140, height: 48 }} resizeMode="contain" />
          <ActivityIndicator size="large" color={C.amber} />
        </View>
        <View style={authSt.footer}>
          <Text style={authSt.footerText}>powered</Text>
          <View style={authSt.byBadge}><Text style={authSt.byText}>by</Text></View>
          <Image source={require('../assets/img/Logo_Blanco.png')} style={authSt.footerLogo} resizeMode="contain" />
        </View>
      </SafeAreaView>
    );
  }

  if (!accessToken) {
    return (
      <SafeAreaView style={authSt.safeArea}>
        <ScrollView contentContainerStyle={authSt.scroll} keyboardShouldPersistTaps="handled">

          {/* ── Logo ── */}
          <View style={authSt.logoWrap}>
            <Image source={require('../assets/img/Logo_Blanco.png')} style={authSt.logo} resizeMode="contain" />
            <Text style={authSt.logoSub}>athlete app</Text>
          </View>

          {/* ── Tabs ── */}
          <View style={authSt.tabRow}>
            <Pressable
              style={[authSt.tab, authMode === "login" && authSt.tabActive]}
              onPress={() => setAuthMode("login")}
            >
              <Text style={[authSt.tabText, authMode === "login" && authSt.tabTextActive]}>Entrar</Text>
            </Pressable>
            <Pressable
              style={[authSt.tab, authMode === "register" && authSt.tabActive]}
              onPress={() => setAuthMode("register")}
            >
              <Text style={[authSt.tabText, authMode === "register" && authSt.tabTextActive]}>Crear cuenta</Text>
            </Pressable>
          </View>

          {/* ── Form ── */}
          <View style={authSt.card}>
            {authMode === "login" ? (
              <>
                <Text style={authSt.cardTitle}>Iniciar sesión</Text>
                {error ? (
                  <View style={[authSt.feedbackBox, authSt.feedbackError]}>
                    <Text style={authSt.feedbackText}>{error}</Text>
                  </View>
                ) : null}
                {message ? (
                  <View style={[authSt.feedbackBox, authSt.feedbackSuccess]}>
                    <Text style={authSt.feedbackText}>{message}</Text>
                  </View>
                ) : null}
                <TextInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="Email"
                  placeholderTextColor={C.textDisabled}
                  style={authSt.input}
                  value={loginForm.email}
                  onChangeText={(value) => setLoginForm((current) => ({ ...current, email: value }))}
                />
                <View style={authSt.pwRow}>
                  <TextInput
                    secureTextEntry={!showLoginPassword}
                    placeholder="Contraseña"
                    placeholderTextColor={C.textDisabled}
                    style={authSt.pwInput}
                    value={loginForm.password}
                    onChangeText={(value) => setLoginForm((current) => ({ ...current, password: value }))}
                  />
                  <Pressable style={authSt.pwToggle} onPress={() => setShowLoginPassword((v) => !v)}>
                    <Ionicons name={showLoginPassword ? "eye-off" : "eye"} size={20} color={C.textMuted} />
                  </Pressable>
                </View>
                <Pressable style={authSt.primaryBtn} onPress={() => void handleLogin()} disabled={loading}>
                  <Text style={authSt.primaryBtnText}>{loading ? "Entrando..." : "Entrar"}</Text>
                </Pressable>
                <Pressable onPress={() => { setForgotPasswordEmail(loginForm.email); setForgotPasswordVisible(true); }}>
                  <Text style={authSt.forgotLink}>¿Olvidaste tu contraseña?</Text>
                </Pressable>
                <View style={authSt.divider}>
                  <View style={authSt.dividerLine} />
                  <Text style={authSt.dividerText}>o</Text>
                  <View style={authSt.dividerLine} />
                </View>
                <Pressable
                  style={[authSt.socialBtn, (!googleRequest || !googlePlatformClientConfigured) && authSt.socialBtnDisabled]}
                  onPress={() => void handleGoogleAccess()}
                  disabled={!googleRequest || !googlePlatformClientConfigured || loading}
                >
                  <Ionicons name="logo-google" size={18} color={C.text} />
                  <Text style={authSt.socialBtnText}>Continuar con Google</Text>
                </Pressable>
                {useNativeAndroidGoogleSignIn && !googleWebClientId ? (
                  <Text style={authSt.helperText}>
                    Falta configurar el client ID web de Google para Android.
                  </Text>
                ) : useNativeAndroidGoogleSignIn ? (
                  <Text style={authSt.helperText}>
                    Android release usa Google nativo y requiere el client Android con su SHA-1 correcto en Google Cloud.
                  </Text>
                ) : isExpoGo && googleExpoGoRedirectUri ? (
                  <Text style={authSt.helperText}>
                    En Expo Go, Google usa el client web y el redirect URI {googleExpoGoRedirectUri}.
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={authSt.cardTitle}>Crear cuenta de atleta</Text>
                {error ? (
                  <View style={[authSt.feedbackBox, authSt.feedbackError]}>
                    <Text style={authSt.feedbackText}>{error}</Text>
                  </View>
                ) : null}
                {message ? (
                  <View style={[authSt.feedbackBox, authSt.feedbackSuccess]}>
                    <Text style={authSt.feedbackText}>{message}</Text>
                  </View>
                ) : null}
                <TextInput
                  autoCapitalize="words"
                  placeholder="Nombre"
                  placeholderTextColor={C.textDisabled}
                  style={authSt.input}
                  value={athleteSetup.firstName}
                  onChangeText={(value) => setAthleteSetup((current) => ({ ...current, firstName: value }))}
                />
                <TextInput
                  autoCapitalize="words"
                  placeholder="Apellido"
                  placeholderTextColor={C.textDisabled}
                  style={authSt.input}
                  value={athleteSetup.lastName}
                  onChangeText={(value) => setAthleteSetup((current) => ({ ...current, lastName: value }))}
                />
                <TextInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="Email"
                  placeholderTextColor={C.textDisabled}
                  style={authSt.input}
                  value={athleteSetup.email}
                  onChangeText={(value) => setAthleteSetup((current) => ({ ...current, email: value }))}
                />
                <View style={authSt.pwRow}>
                  <TextInput
                    secureTextEntry={!showRegPassword}
                    placeholder="Contraseña"
                    placeholderTextColor={C.textDisabled}
                    style={authSt.pwInput}
                    value={athleteSetup.password}
                    onChangeText={(value) => setAthleteSetup((current) => ({ ...current, password: value }))}
                  />
                  <Pressable style={authSt.pwToggle} onPress={() => setShowRegPassword((v) => !v)}>
                    <Ionicons name={showRegPassword ? "eye-off" : "eye"} size={20} color={C.textMuted} />
                  </Pressable>
                </View>
                <TextInput
                  placeholder="Nombre visible"
                  placeholderTextColor={C.textDisabled}
                  style={authSt.input}
                  value={athleteSetup.displayName}
                  onChangeText={(value) => setAthleteSetup((current) => ({ ...current, displayName: value }))}
                />
                <Pressable style={authSt.primaryBtn} onPress={() => void handleRegister()} disabled={loading || !athleteSetup.email || !athleteSetup.password}>
                  <Text style={authSt.primaryBtnText}>{loading ? "Creando..." : "Crear cuenta"}</Text>
                </Pressable>
              </>
            )}
          </View>

        </ScrollView>

        {/* ── Footer ── */}
        <View style={authSt.footer}>
          <Text style={authSt.footerText}>powered</Text>
          <View style={authSt.byBadge}><Text style={authSt.byText}>by</Text></View>
          <Image source={require('../assets/img/Logo_Blanco.png')} style={authSt.footerLogo} resizeMode="contain" />
        </View>

        {/* ── Forgot password modal ── */}
        <Modal visible={forgotPasswordVisible} transparent animationType="fade" onRequestClose={() => setForgotPasswordVisible(false)}>
          <Pressable style={authSt.modalOverlay} onPress={() => setForgotPasswordVisible(false)}>
            <Pressable style={authSt.modalCard} onPress={() => { /* prevent close */ }}>
              <Text style={authSt.cardTitle}>Restablecer contraseña</Text>
              <Text style={{ color: C.textSub, fontSize: 14, marginBottom: 4 }}>
                Ingresa tu email y te enviaremos un código de 6 dígitos y un enlace para restablecer tu contraseña.
              </Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Email"
                placeholderTextColor={C.textDisabled}
                style={authSt.input}
                value={forgotPasswordEmail}
                onChangeText={setForgotPasswordEmail}
              />
              <Pressable style={authSt.primaryBtn} onPress={() => void handleForgotPassword()} disabled={loading}>
                <Text style={authSt.primaryBtnText}>{loading ? "Enviando..." : "Enviar instrucciones"}</Text>
              </Pressable>
              <Pressable onPress={() => setForgotPasswordVisible(false)} style={{ alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ color: C.textMuted, fontSize: 14 }}>Cancelar</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── Reset password modal (from deep link) ── */}
        <Modal visible={resetPasswordVisible} transparent animationType="fade" onRequestClose={() => setResetPasswordVisible(false)}>
          <Pressable style={authSt.modalOverlay} onPress={() => setResetPasswordVisible(false)}>
            <Pressable style={authSt.modalCard} onPress={() => { /* prevent close */ }}>
              <Text style={authSt.cardTitle}>Nueva contraseña</Text>
              <Text style={{ color: C.textSub, fontSize: 14, marginBottom: 4 }}>
                {resetPasswordToken
                  ? "Abre este formulario desde el enlace del email y elige tu nueva contraseña."
                  : "Ingresa tu email, el código de 6 dígitos y tu nueva contraseña."}
              </Text>
              {!resetPasswordToken ? (
                <>
                  <TextInput
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor={C.textDisabled}
                    style={authSt.input}
                    value={resetPasswordEmail}
                    onChangeText={setResetPasswordEmail}
                  />
                  <TextInput
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="Código de 6 dígitos"
                    placeholderTextColor={C.textDisabled}
                    style={authSt.input}
                    value={resetPasswordCode}
                    onChangeText={(value) => setResetPasswordCode(value.replace(/\D/g, "").slice(0, 6))}
                  />
                </>
              ) : null}
              <View style={authSt.pwRow}>
                <TextInput
                  secureTextEntry={!showResetPassword}
                  placeholder="Nueva contraseña"
                  placeholderTextColor={C.textDisabled}
                  style={authSt.pwInput}
                  value={resetPasswordNew}
                  onChangeText={setResetPasswordNew}
                />
                <Pressable style={authSt.pwToggle} onPress={() => setShowResetPassword((v) => !v)}>
                  <Ionicons name={showResetPassword ? "eye-off" : "eye"} size={20} color={C.textMuted} />
                </Pressable>
              </View>
              <Pressable
                style={authSt.primaryBtn}
                onPress={() => void handleResetPassword()}
                disabled={loading || resetPasswordNew.length < 8 || (!resetPasswordToken.trim() && (!resetPasswordEmail.trim() || resetPasswordCode.trim().length !== 6))}
              >
                <Text style={authSt.primaryBtnText}>{loading ? "Guardando..." : "Guardar contraseña"}</Text>
              </Pressable>
              <Pressable onPress={() => setResetPasswordVisible(false)} style={{ alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ color: C.textMuted, fontSize: 14 }}>Cancelar</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── Coach dashboard view ──────────────────────────────────────
  if (accessToken && activeRole === "coach") {
    const hasAthlete = hasAthleteRole(accessToken);
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <AppHeader
          title="⚡  ENTRENADOR"
          subtitle="Panel de coach"
          onMenuPress={() => setDrawerOpen(true)}
          onAvatarPress={() => setProfileModalVisible(true)}
          avatarUrl={currentAvatarUrl}
          athleteInitials={profile ? athleteInitials : "CO"}
        />
        {hasAthlete && (
          <View style={{ flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Pressable
              style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: C.textMuted }}
              onPress={() => setActiveRole("athlete")}
            >
              <Text style={{ color: C.textMuted, fontWeight: '600', fontSize: 13 }}>Atleta</Text>
            </Pressable>
            <Pressable
              style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: C.amber }}
            >
              <Text style={{ color: C.amber, fontWeight: '700', fontSize: 13 }}>Entrenador</Text>
            </Pressable>
          </View>
        )}
        <CoachDashboardScreen accessToken={accessToken} apiBase={apiBaseUrl} />
        <ProfileModal
          visible={profileModalVisible}
          onClose={() => setProfileModalVisible(false)}
          onLogout={() => handleLogout()}
          accessToken={accessToken}
          avatarUrl={currentAvatarUrl}
          onAvatarChange={(url) => setCurrentAvatarUrl(url)}
          isOAuthUser={!!profile?.user.oauthProvider}
          apiBase={apiBaseUrl}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ── TOP BAR ───────────────────────────────────── */}
      <AppHeader
        title={
          activeScreen === "hoy" ? "◉  HOY" :
          activeScreen === "ejercicios" ? "⚡  SESIÓN" :
          activeScreen === "programa" ? "▤  PROGRAMA" :
          "↑  EVOLUCIÓN"
        }
        subtitle={
          activeScreen === "hoy"
            ? (profile?.displayName ?? profile?.user.email ?? "Atleta")
            : activeScreen === "ejercicios"
              ? (selectedSession?.title ?? "Sin sesión activa")
              : activeScreen === "programa"
                ? (activeProgram?.name ?? "Sin programa activo")
                : `Racha: ${progress?.summary.currentStreak ?? 0}`
        }
        onMenuPress={() => setDrawerOpen(true)}
        onAvatarPress={() => setProfileModalVisible(true)}
        avatarUrl={currentAvatarUrl}
        athleteInitials={athleteInitials}
      />

      {/* Role switcher for users with both athlete + coach roles */}
      {accessToken && isCoachToken(accessToken) && hasAthleteRole(accessToken) && (
        <View style={{ flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Pressable
            style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: C.amber }}
          >
            <Text style={{ color: C.amber, fontWeight: '700', fontSize: 13 }}>Atleta</Text>
          </Pressable>
          <Pressable
            style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: C.textMuted }}
            onPress={() => setActiveRole("coach")}
          >
            <Text style={{ color: C.textMuted, fontWeight: '600', fontSize: 13 }}>Entrenador</Text>
          </Pressable>
        </View>
      )}

      {/* ── SCREENS ───────────────────────────────────── */}
      {activeScreen === "hoy" ? (
        <HoyScreenV2
          profile={profile}
          activeProgram={activeProgram}
          sessions={sessions}
          progress={progress}
          todayPrimarySession={todayPrimarySession}
          todaySessionSummary={todaySessionSummary}
          todayCompletion={todayCompletion}
          favoriteSessionId={favoriteSessionId}
          todayCheckIn={todayCheckIn}
          athleteSetup={athleteSetup}
          loading={loading}
          refreshing={refreshing}
          planningRecommendation={planningRecommendation}
          onUpdateCheckIn={updateTodayCheckIn}
          onSaveCheckIn={saveTodayCheckIn}
          onClearCheckIn={clearTodayCheckIn}
          onStartSession={async () => {
            if (todayPrimarySession) {
              setSelectedSessionId(todayPrimarySession.id);
              const savedStep = await loadExerciseProgress(todayPrimarySession.id);
              setExerciseStep(savedStep);
            }
            setActiveScreen("ejercicios");
          }}
          onPreloadSession={() => {
            if (todayPrimarySession) {
              void handlePreloadSession(todayPrimarySession.id, todayPrimarySession.title);
            }
          }}
          todaySessionCached={todayPrimarySession ? cachedSessionIds.includes(todayPrimarySession.id) : false}
          preloadBusy={preloadState.visible && preloadState.sessionId === todayPrimarySession?.id}
          onToggleFavorite={() => todayPrimarySession && toggleFavoriteSession(todayPrimarySession.id)}
          onRefresh={() => void refreshAthleteArea()}
          onSetAthleteSetup={setAthleteSetup}
          onSaveOnboarding={() => void handleSaveOnboarding()}
          onGenerateProgram={() => void handleGenerateProgramFromApp()}
        />
      ) : null}

      {activeScreen === "ejercicios" ? (
        <EjerciciosScreen
          selectedSession={selectedSession as SharedSessionDetail | null}
          selectedSessionGuidance={(selectedSessionGuidance ?? null) as SharedSessionGuidance | null}
          logDraft={logDraft}
          exerciseStep={exerciseStep}
          loading={loading}
          onSetExerciseStep={setExerciseStep}
          onSetLogDraft={(updater) => setLogDraft((prev) => { const r = updater(prev); return r ?? prev; })}
          onToggleExercise={toggleExercise}
          onApplyJumpTest={(cm) => setLogDraft((p) => ({ ...p, jumpHeightCm: String(cm) }))}
          onSubmitLog={() => void handleSubmitLog()}
          onShowJumpGuide={() => setJumpGuideVisible(true)}
          onBack={() => setActiveScreen("hoy")}
        />
      ) : null}

      {activeScreen === "programa" ? (
        <ProgramaScreen
          activeProgram={activeProgram}
          programs={programs}
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          progress={progress}
          loading={loading}
          refreshing={refreshing}
          onSelectSession={(id) => setSelectedSessionId(id)}
          onPreviewSession={(id) => {
            setSelectedSessionId(id);
            setSelectedExerciseId(null);
            setExerciseStep(0);
            setActiveScreen("ejercicios");
          }}
          onPreloadSession={(id, title) => void handlePreloadSession(id, title)}
          cachedSessionIds={cachedSessionIds}
          preloadSessionId={preloadState.visible ? preloadState.sessionId : null}
          onRegenerateProgram={() => void handleGenerateProgramFromApp()}
          onRefresh={() => void refreshAthleteArea()}
        />
      ) : null}

      {activeScreen === "evolucion" ? (
        <EvolucionScreen
          progress={progress}
          trendWindow={trendWindow}
          selectedCycleId={selectedCycleId}
          loading={loading}
          onSetTrendWindow={setTrendWindow}
          onSetSelectedCycleId={setSelectedCycleId}
          onShowJumpGuide={() => setJumpGuideVisible(true)}
        />
      ) : null}

      <Modal visible={preloadState.visible} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.preloadOverlay}>
          <View style={styles.preloadCard}>
            <ActivityIndicator size="large" color="#e76f51" />
            <Text style={styles.preloadTitle}>{preloadState.sessionTitle || "Precargando sesion"}</Text>
            <Text style={styles.preloadStatus}>{preloadState.statusText}</Text>
            <Text style={styles.preloadBody}>{preloadState.detailText}</Text>
            <View style={styles.preloadProgressTrack}>
              <View style={[styles.preloadProgressFill, { width: `${Math.min(Math.max(preloadState.progress, 0), 100)}%` }]} />
            </View>
            <Text style={styles.preloadPercent}>{Math.min(Math.max(Math.round(preloadState.progress), 0), 100)}%</Text>
          </View>
        </View>
      </Modal>

      {/* ── DRAWER ────────────────────────────────────── */}
      <DrawerMenu
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeScreen={activeScreen}
        onNavigate={(screen) => { setActiveScreen(screen); setDrawerOpen(false); }}
        athleteName={profile?.displayName ?? profile?.user.email ?? "Atleta"}
        athleteEmail={profile?.user.email ?? ""}
      />

      {/* ── JUMP GUIDE ────────────────────────────────── */}
      <JumpGuideModal visible={jumpGuideVisible} onClose={() => setJumpGuideVisible(false)} />

      {/* ── PROFILE MODAL ─────────────────────────────── */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        onLogout={() => handleLogout()}
        accessToken={accessToken ?? ""}
        avatarUrl={currentAvatarUrl}
        onAvatarChange={(url) => setCurrentAvatarUrl(url)}
        isOAuthUser={!!profile?.user.oauthProvider}
        apiBase={apiBaseUrl}
      />

      {/* ── TOAST ─────────────────────────────────────── */}
      {(error || message) ? (
        <Pressable
          style={{ position: 'absolute', bottom: 68, left: 16, right: 16, backgroundColor: error ? '#E05A3A' : '#2CC4B0', borderRadius: 14, padding: 16, zIndex: 200 }}
          onPress={() => { setError(""); setMessage(""); }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>{error || message}</Text>
        </Pressable>
      ) : null}

      {/* ── LEGACY VIEW (hidden – pending cleanup) ────── */}
      <View style={{ display: 'none' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hoy</Text>
          <View style={styles.heroFocusCard}>
            <Text style={styles.eyebrow}>{favoriteSession ? "Tu sesion ancla" : "Entrada principal"}</Text>
            <Text style={styles.title}>{todayPrimarySession?.title ?? "No hay una sesion destacada ahora mismo"}</Text>
            <Text style={styles.description}>
              {todayPrimarySession
                ? `${formatDateTime(todayPrimarySession.scheduledDate)} · ${todayPrimarySession.dayType} · ${todayPrimarySession.status}`
                : "Selecciona una sesion favorita o espera a que aparezca la siguiente sesion planificada."}
            </Text>
            <View style={styles.metricGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Progreso hoy</Text>
                <Text style={styles.metricValue}>{todaySessionSummary ? `${todayCompletion}%` : "-"}</Text>
                <Text style={styles.metricSubtext}>
                  {todaySessionSummary
                    ? `${todaySessionSummary.sessionExercises.filter((exercise) => Boolean(exercise.completedAt)).length}/${todaySessionSummary.sessionExercises.length} ejercicios`
                    : "Sin detalle cargado"}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Check-in</Text>
                <Text style={styles.metricValue}>{todayCheckIn?.savedAt ? formatMetric(toOptionalNumber(todayCheckIn.readinessScore), "", "-") : "-"}</Text>
                <Text style={styles.metricSubtext}>{todayCheckIn?.savedAt ? `Ready · ${formatDateTime(todayCheckIn.savedAt)}` : "Aun no guardado"}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Ultimo log</Text>
                <Text style={styles.metricValue}>{todaySessionSummary?.logs[0]?.perceivedExertion ?? "-"}</Text>
                <Text style={styles.metricSubtext}>{todaySessionSummary?.logs[0] ? `RPE · ${formatDate(todaySessionSummary.logs[0].createdAt)}` : "Sin registro aun"}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Sesion favorita</Text>
                <Text style={styles.metricValue}>{favoriteSessionId === todayPrimarySession?.id ? "Si" : "No"}</Text>
                <Text style={styles.metricSubtext}>Persistida en el dispositivo</Text>
              </View>
            </View>
            {todayPrimarySession ? (
              <View style={styles.inlineRow}>
                <Pressable style={styles.primaryButton} onPress={() => setSelectedSessionId(todayPrimarySession.id)}>
                  <Text style={styles.primaryButtonText}>Abrir sesion</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => toggleFavoriteSession(todayPrimarySession.id)}>
                  <Text style={styles.secondaryButtonText}>{favoriteSessionId === todayPrimarySession.id ? "Quitar favorita" : "Marcar favorita"}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {todayPrimarySession ? (
            <View
              style={[
                styles.card,
                styles.feedbackCard,
                todayCheckInFeedback.status === "push"
                  ? styles.feedbackPush
                  : todayCheckInFeedback.status === "protect"
                    ? styles.feedbackProtect
                    : todayCheckInFeedback.status === "focus"
                      ? styles.feedbackFocus
                      : styles.feedbackSteady,
              ]}
            >
              <Text style={styles.metricLabel}>Pre check-in</Text>
              <Text style={styles.cardTitle}>{todayCheckInFeedback.title}</Text>
              <Text style={styles.cardDetail}>{todayCheckInFeedback.summary}</Text>
              <View style={styles.metricInputGrid}>
                <TextInput
                  keyboardType="number-pad"
                  placeholder="Ready 1-10"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={todayCheckIn?.readinessScore ?? ""}
                  onChangeText={(value) => updateTodayCheckIn("readinessScore", value)}
                />
                <TextInput
                  keyboardType="number-pad"
                  placeholder="Mood 1-10"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={todayCheckIn?.moodScore ?? ""}
                  onChangeText={(value) => updateTodayCheckIn("moodScore", value)}
                />
                <TextInput
                  keyboardType="number-pad"
                  placeholder="Soreness 1-10"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={todayCheckIn?.sorenessScore ?? ""}
                  onChangeText={(value) => updateTodayCheckIn("sorenessScore", value)}
                />
                <TextInput
                  keyboardType="number-pad"
                  placeholder="Pain 0-10"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={todayCheckIn?.painScore ?? ""}
                  onChangeText={(value) => updateTodayCheckIn("painScore", value)}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Sleep h"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={todayCheckIn?.sleepHours ?? ""}
                  onChangeText={(value) => updateTodayCheckIn("sleepHours", value)}
                />
              </View>
              <TextInput
                multiline
                placeholder="Nota rapida antes de entrenar"
                placeholderTextColor="#7a879d"
                style={[styles.input, styles.notesInput]}
                value={todayCheckIn?.notes ?? ""}
                onChangeText={(value) => updateTodayCheckIn("notes", value)}
              />
              <Text style={styles.helperText}>
                {todayCheckIn?.savedAt ? `Guardado ${formatDateTime(todayCheckIn.savedAt)} · al abrir la sesion, estos datos rellenan el log.` : "Todavia no has guardado un check-in para esta sesion."}
              </Text>
              <View style={styles.inlineRow}>
                <Pressable style={styles.primaryButton} onPress={saveTodayCheckIn}>
                  <Text style={styles.primaryButtonText}>Guardar check-in</Text>
                </Pressable>
                <Pressable style={styles.ghostButton} onPress={clearTodayCheckIn}>
                  <Text style={styles.ghostButtonText}>Limpiar</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Cuenta activa</Text>
          <Text style={styles.title}>{profile?.displayName ?? profile?.user.email ?? "Atleta"}</Text>
          <Text style={styles.description}>
            {(profile?.sport ?? "Sin deporte definido")} · {profile?.seasonPhase ?? "OFF_SEASON"}
          </Text>
          <Text style={styles.helperText}>
            Equipo: {profile?.team?.name ?? "Sin equipo"} · Jump: {formatWeekdays(profile?.weeklyAvailability?.availableWeekdays)} · Deporte/pista: {profile?.trainsSport ? formatWeekdays(profile?.sportTrainingDays?.trainingDays) : "No declarado"}
          </Text>
          <View style={styles.inlineRow}>
            <Pressable style={styles.secondaryButton} onPress={() => void refreshAthleteArea()} disabled={refreshing}>
              <Text style={styles.secondaryButtonText}>{refreshing ? "Actualizando..." : "Actualizar"}</Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={() => void handleLogout()}>
              <Text style={styles.ghostButtonText}>Cerrar sesion</Text>
            </Pressable>
          </View>
        </View>

        {needsProgramSetup ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Arma tu bloque desde la app</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Configura tu contexto deportivo</Text>
              <Text style={styles.cardDetail}>
                La app puede generar tu plan inicial si primero sabe en que fase estas, que dias puedes hacer jump y que dias ya cargas pista, cancha o tu deporte principal.
              </Text>
              {planningRecommendation ? <Text style={styles.helperText}>{planningRecommendation.summary}</Text> : null}
              <TextInput
                placeholder="Nombre visible"
                placeholderTextColor="#7a879d"
                style={styles.input}
                value={athleteSetup.displayName}
                onChangeText={(value) => setAthleteSetup((current) => ({ ...current, displayName: value }))}
              />
              <TextInput
                placeholder="Deporte principal"
                placeholderTextColor="#7a879d"
                style={styles.input}
                value={athleteSetup.sport}
                onChangeText={(value) => setAthleteSetup((current) => ({ ...current, sport: value }))}
              />
              <View style={styles.inlineRow}>
                <Pressable
                  style={[styles.secondaryButton, athleteSetup.trainsSport ? styles.selectedAuthButton : null]}
                  onPress={() => setAthleteSetup((current) => ({ ...current, trainsSport: !current.trainsSport }))}
                >
                  <Text style={styles.secondaryButtonText}>{athleteSetup.trainsSport ? "Tambien entreno deporte/pista" : "Solo jump por ahora"}</Text>
                </Pressable>
              </View>
              {athleteSetup.trainsSport ? (
                <TextInput
                  placeholder="Dias de deporte/pista: 2,4"
                  placeholderTextColor="#7a879d"
                  style={styles.input}
                  value={athleteSetup.sportTrainingDays}
                  onChangeText={(value) => setAthleteSetup((current) => ({ ...current, sportTrainingDays: value }))}
                />
              ) : null}
              <TextInput
                placeholder="Dias para jump: 1,3,5"
                placeholderTextColor="#7a879d"
                style={styles.input}
                value={athleteSetup.availableWeekdays}
                onChangeText={(value) => setAthleteSetup((current) => ({ ...current, availableWeekdays: value }))}
              />
              <TextInput
                placeholder="Fase: OFF_SEASON, PRESEASON, IN_SEASON, COMPETITION"
                placeholderTextColor="#7a879d"
                style={styles.input}
                value={athleteSetup.seasonPhase}
                onChangeText={(value) => setAthleteSetup((current) => ({ ...current, seasonPhase: value.toUpperCase() }))}
              />
              <Text style={styles.helperText}>Fecha de inicio del programa</Text>
              <View style={styles.inlineRow}>
                <Pressable
                  style={[styles.secondaryButton, startDateMode === 'hoy' ? styles.selectedAuthButton : null]}
                  onPress={() => { const d = new Date().toISOString().slice(0, 10); setStartDateMode('hoy'); setAthleteSetup((c) => ({ ...c, startDate: d })); }}
                >
                  <Text style={styles.secondaryButtonText}>Hoy</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryButton, startDateMode === 'manana' ? styles.selectedAuthButton : null]}
                  onPress={() => { const d = new Date(); d.setDate(d.getDate() + 1); setStartDateMode('manana'); setAthleteSetup((c) => ({ ...c, startDate: d.toISOString().slice(0, 10) })); }}
                >
                  <Text style={styles.secondaryButtonText}>Mañana</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryButton, startDateMode === 'otra' ? styles.selectedAuthButton : null]}
                  onPress={() => setStartDateMode('otra')}
                >
                  <Text style={styles.secondaryButtonText}>Otra fecha</Text>
                </Pressable>
              </View>
              {startDateMode === 'otra' ? (
                <TextInput
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor="#7a879d"
                  style={styles.input}
                  value={athleteSetup.startDate}
                  onChangeText={(value) => setAthleteSetup((c) => ({ ...c, startDate: value }))}
                  keyboardType="numeric"
                />
              ) : null}
              <View style={styles.inlineRow}>
                <Pressable
                  style={[styles.secondaryButton, athleteSetup.includePreparationPhase ? styles.selectedAuthButton : null]}
                  onPress={() => setAthleteSetup((current) => ({ ...current, includePreparationPhase: !current.includePreparationPhase }))}
                >
                  <Text style={styles.secondaryButtonText}>
                    {athleteSetup.includePreparationPhase ? "Incluye 3 semanas de adecuacion" : "Entrar directo al programa"}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.helperText}>
                {athleteSetup.includePreparationPhase
                  ? "La recomendacion por defecto es 3 semanas de isometricos, aterrizajes controlados y ejercicios basicos de bajo impacto para llegar mejor al bloque principal."
                  : "Solo omite esta fase si ya toleras bien fuerza y contactos y no vienes de una pausa o molestias."}
              </Text>
              {availableTemplates.length > 1 ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.helperText}>Programa de entrenamiento</Text>
                  {availableTemplates.map((tmpl) => (
                    <Pressable
                      key={tmpl.code}
                      style={[styles.secondaryButton, athleteSetup.templateCode === tmpl.code ? styles.selectedAuthButton : null]}
                      onPress={() => setAthleteSetup((current) => ({ ...current, templateCode: tmpl.code }))}
                    >
                      <Text style={styles.secondaryButtonText}>{tmpl.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <TextInput
                multiline
                placeholder="Notas sobre historial, molestias o contexto competitivo"
                placeholderTextColor="#7a879d"
                style={[styles.input, styles.notesInput]}
                value={athleteSetup.notes}
                onChangeText={(value) => setAthleteSetup((current) => ({ ...current, notes: value }))}
              />
              {planningRecommendation?.focusAreas.map((focus) => (
                <Text key={focus} style={styles.helperText}>• {focus}</Text>
              ))}
              <View style={styles.inlineRow}>
                <Pressable style={styles.secondaryButton} onPress={() => void handleSaveOnboarding()} disabled={loading}>
                  <Text style={styles.secondaryButtonText}>Guardar contexto</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={() => void handleGenerateProgramFromApp()} disabled={loading}>
                  <Text style={styles.primaryButtonText}>{loading ? "Generando..." : "Generar mi programa"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {message ? <Text style={styles.successText}>{message}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tu progreso</Text>
          <View style={styles.metricGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Cumplimiento</Text>
              <Text style={styles.metricValue}>{formatMetric(progress?.summary.completionRate, "%", "0%")}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Racha</Text>
              <Text style={styles.metricValue}>{progress?.summary.currentStreak ?? 0}</Text>
              <Text style={styles.metricSubtext}>sesiones</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Salto top</Text>
              <Text style={styles.metricValue}>{formatMetric(progress?.personalBests.jumpHeightCm, " cm")}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Carga top</Text>
              <Text style={styles.metricValue}>{formatMetric(progress?.personalBests.avgLoadKg, " kg")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pulso reciente</Text>
          <View style={styles.card}>
            <View style={styles.metricRow}>
              <View style={styles.metricInline}>
                <Text style={styles.metricLabel}>RPE medio</Text>
                <Text style={styles.metricInlineValue}>{formatMetric(progress?.recentAverages.perceivedExertion, "")}</Text>
              </View>
              <View style={styles.metricInline}>
                <Text style={styles.metricLabel}>Readiness</Text>
                <Text style={styles.metricInlineValue}>{formatMetric(progress?.recentAverages.readinessScore, "/10")}</Text>
              </View>
            </View>
            <View style={styles.metricRow}>
              <View style={styles.metricInline}>
                <Text style={styles.metricLabel}>Sueno</Text>
                <Text style={styles.metricInlineValue}>{formatMetric(progress?.recentAverages.sleepHours, " h")}</Text>
              </View>
              <View style={styles.metricInline}>
                <Text style={styles.metricLabel}>Dolor</Text>
                <Text style={styles.metricInlineValue}>{formatMetric(progress?.recentAverages.painScore, "/10")}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Objetivo semanal</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{progress?.weeklyGoal.completedSessions ?? 0}/{progress?.weeklyGoal.targetSessions ?? 0} sesiones completadas</Text>
            <Text style={styles.cardDetail}>
              Programadas esta semana: {progress?.weeklyGoal.scheduledSessions ?? 0} · Restantes para meta: {progress?.weeklyGoal.remainingSessions ?? 0}
            </Text>
            <Text style={styles.helperText}>
              Meta adaptativa {progress?.weeklyGoal.phase ?? "OFF_SEASON"}: {progress?.weeklyGoal.phaseSuggestedSessions ?? 0} sesiones base · fuente {progress?.weeklyGoal.source === "program" ? "programa actual" : "fase + disponibilidad"}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(progress?.weeklyGoal.completionRate ?? 0, 100)}%` }]} />
            </View>
            <View style={styles.tagRow}>
              <View style={styles.metricTag}><Text style={styles.metricTagText}>Meta {progress?.weeklyGoal.targetSessions ?? 0}</Text></View>
              <View style={styles.metricTag}><Text style={styles.metricTagText}>Cumplimiento {formatMetric(progress?.weeklyGoal.completionRate, "%", "0%")}</Text></View>
              <View style={styles.metricTag}><Text style={styles.metricTagText}>Tests salto {progress?.weeklyGoal.jumpTestsLogged ?? 0}</Text></View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feedback automatico</Text>
          <View
            style={[
              styles.card,
              styles.feedbackCard,
              progress?.feedback.status === "push"
                ? styles.feedbackPush
                : progress?.feedback.status === "protect"
                  ? styles.feedbackProtect
                  : progress?.feedback.status === "focus"
                    ? styles.feedbackFocus
                    : styles.feedbackSteady,
            ]}
          >
            <Text style={styles.metricLabel}>{feedbackToneLabel(progress?.feedback.status)}</Text>
            <Text style={styles.cardTitle}>{progress?.feedback.title ?? "Sigue registrando para recibir feedback"}</Text>
            <Text style={styles.cardDetail}>{progress?.feedback.summary ?? "El sistema necesita mas sesiones registradas para afinar el mensaje."}</Text>
            {progress?.feedback.actions.map((action) => (
              <Text key={action} style={styles.helperText}>• {action}</Text>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tendencias</Text>
          <View style={styles.inlineRow}>
            {(["7D", "28D", "ALL"] as TrendWindow[]).map((window) => (
              <Pressable
                key={window}
                style={[styles.windowChip, trendWindow === window ? styles.windowChipActive : null]}
                onPress={() => setTrendWindow(window)}
              >
                <Text style={[styles.windowChipText, trendWindow === window ? styles.windowChipTextActive : null]}>{window}</Text>
              </Pressable>
            ))}
          </View>
          {selectedWindowComparison ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Comparacion {selectedWindowComparison.days} dias vs ventana previa</Text>
              <View style={styles.tagRow}>
                <View style={styles.metricTag}><Text style={styles.metricTagText}>Salto {formatSignedMetric(selectedWindowComparison.jumpHeightDelta, " cm")}</Text></View>
                <View style={styles.metricTag}><Text style={styles.metricTagText}>Ready {formatSignedMetric(selectedWindowComparison.readinessDelta, "")}</Text></View>
                <View style={styles.metricTag}><Text style={styles.metricTagText}>Carga {formatSignedMetric(selectedWindowComparison.avgLoadDelta, " kg")}</Text></View>
              </View>
              <Text style={styles.helperText}>Logs comparados: {selectedWindowComparison.currentLogs} actuales vs {selectedWindowComparison.previousLogs} previos.</Text>
            </View>
          ) : null}
          <View style={styles.sectionList}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Salto</Text>
              <Text style={styles.cardDetail}>Ultimo delta {formatSignedMetric(deriveTrendDelta(filterSeriesByWindow(progress?.trends.jumpHeightCm ?? [], trendWindow)), " cm")}</Text>
              <View style={styles.trendChart}>
                {filteredJumpTrendBars.length ? filteredJumpTrendBars.map((entry) => (
                  <View key={`${entry.date}-${entry.value}`} style={styles.trendColumn}>
                    <View style={[styles.trendBar, { height: entry.height, backgroundColor: "#e76f51" }]} />
                    <Text style={styles.trendValue}>{entry.value}</Text>
                    <Text style={styles.trendLabel}>{entry.label}</Text>
                  </View>
                )) : <Text style={styles.helperText}>Aun no hay suficientes tests de salto para esta ventana.</Text>}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Readiness</Text>
              <Text style={styles.cardDetail}>Ultimo delta {formatSignedMetric(deriveTrendDelta(filterSeriesByWindow(progress?.trends.readinessScore ?? [], trendWindow)), "")}</Text>
              <View style={styles.trendChart}>
                {filteredReadinessTrendBars.length ? filteredReadinessTrendBars.map((entry) => (
                  <View key={`${entry.date}-${entry.value}`} style={styles.trendColumn}>
                    <View style={[styles.trendBar, { height: entry.height, backgroundColor: "#2a9d8f" }]} />
                    <Text style={styles.trendValue}>{entry.value}</Text>
                    <Text style={styles.trendLabel}>{entry.label}</Text>
                  </View>
                )) : <Text style={styles.helperText}>Registra readiness en varias sesiones para esta ventana.</Text>}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Carga</Text>
              <Text style={styles.cardDetail}>Ultimo delta {formatSignedMetric(deriveTrendDelta(filterSeriesByWindow(progress?.trends.avgLoadKg ?? [], trendWindow)), " kg")}</Text>
              <View style={styles.trendChart}>
                {filteredLoadTrendBars.length ? filteredLoadTrendBars.map((entry) => (
                  <View key={`${entry.date}-${entry.value}`} style={styles.trendColumn}>
                    <View style={[styles.trendBar, { height: entry.height, backgroundColor: "#14213d" }]} />
                    <Text style={styles.trendValue}>{entry.value}</Text>
                    <Text style={styles.trendLabel}>{entry.label}</Text>
                  </View>
                )) : <Text style={styles.helperText}>Registra carga media para construir esta comparativa.</Text>}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Programa activo</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{activeProgram?.name ?? "Sin programa activo"}</Text>
            <Text style={styles.cardDetail}>
              {activeProgram ? `${activeProgram.phase} · ${activeProgram.status} · Inicio ${formatDate(activeProgram.startDate)}` : "Pide a tu coach o admin que genere tu plan personalizado."}
            </Text>
            {activeProgram?.sessions.length ? (
              <View style={styles.badgeWrap}>
                {activeProgram.sessions.map((session) => (
                  <View key={session.id} style={styles.badge}>
                    <Text style={styles.badgeText}>{formatDate(session.scheduledDate)} · {session.dayType}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evolucion por ciclo</Text>
          {selectedCycle ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{selectedCycle.name}</Text>
              <Text style={styles.cardDetail}>{selectedCycle.phase} · Inicio {formatDate(selectedCycle.startDate)}</Text>
              <Text style={styles.helperText}>
                {selectedCycle.completedSessions}/{selectedCycle.totalSessions} sesiones · Readiness media {formatMetric(selectedCycle.averageReadiness, "/10")} · Carga media {formatMetric(selectedCycle.averageLoadKg, " kg")}
              </Text>
            </View>
          ) : null}
          <View style={styles.sectionList}>
            {progress?.cycleEvolution.length ? (
              progress.cycleEvolution.map((cycle) => (
                <Pressable
                  key={cycle.id}
                  style={[styles.sessionCard, selectedCycle?.id === cycle.id ? styles.sessionCardActive : null]}
                  onPress={() => setSelectedCycleId(cycle.id)}
                >
                  <Text style={styles.cardTitle}>{cycle.name}</Text>
                  <Text style={styles.cardDetail}>{cycle.phase} · Inicio {formatDate(cycle.startDate)}</Text>
                  <View style={styles.tagRow}>
                    <View style={styles.metricTag}><Text style={styles.metricTagText}>Cumplimiento {formatMetric(cycle.completionRate, "%", "0%")}</Text></View>
                    <View style={styles.metricTag}><Text style={styles.metricTagText}>Salto {formatMetric(cycle.bestJumpCm, " cm")}</Text></View>
                    <View style={styles.metricTag}><Text style={styles.metricTagText}>Vs ciclo previo {formatSignedMetric(cycle.deltaVsPreviousCycleCm, " cm")}</Text></View>
                  </View>
                  <Text style={styles.helperText}>
                    {cycle.completedSessions}/{cycle.totalSessions} sesiones · Readiness media {formatMetric(cycle.averageReadiness, "/10")} · Carga media {formatMetric(cycle.averageLoadKg, " kg")}
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.helperText}>Todavia no hay suficiente historial entre ciclos para comparar bloques.</Text>
            )}
          </View>
        </View>

        {favoriteSession ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sesion favorita vs mejor historico</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{favoriteSession.title}</Text>
              <Text style={styles.cardDetail}>{formatDate(favoriteSession.scheduledDate)} · {favoriteSession.dayType}</Text>
              <View style={styles.tagRow}>
                <View style={styles.metricTag}><Text style={styles.metricTagText}>Salto {formatSignedMetric(favoriteSessionComparison?.jumpDeltaVsBest, " cm")}</Text></View>
                <View style={styles.metricTag}><Text style={styles.metricTagText}>Ready {formatSignedMetric(favoriteSessionComparison?.readinessDeltaVsBest, "")}</Text></View>
                <View style={styles.metricTag}><Text style={styles.metricTagText}>Carga {formatSignedMetric(favoriteSessionComparison?.loadDeltaVsBest, " kg")}</Text></View>
              </View>
              <Text style={styles.helperText}>
                Mejor salto historico: {progress?.historicalBestSessions.jumpHeight?.scheduledSession.title ?? "sin referencia"} · mejor readiness: {progress?.historicalBestSessions.readiness?.scheduledSession.title ?? "sin referencia"}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tus coaches</Text>
          <View style={styles.card}>
            {profile?.coachAssignments.length ? (
              profile.coachAssignments.map((assignment) => (
                <Text key={assignment.id} style={styles.cardDetail}>
                  {displayCoachName(assignment.coach.firstName, assignment.coach.lastName, assignment.coach.email)}
                </Text>
              ))
            ) : (
              <Text style={styles.cardDetail}>Aun no tienes coach asignado.</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Agenda de sesiones</Text>
          <View style={styles.sectionList}>
            {sessions.map((session) => {
              const completedCount = session.sessionExercises.filter((exercise) => Boolean(exercise.completedAt)).length;
              return (
                <Pressable
                  key={session.id}
                  style={[styles.sessionCard, selectedSessionId === session.id ? styles.sessionCardActive : null]}
                  onPress={() => setSelectedSessionId(session.id)}
                >
                  <Text style={styles.cardTitle}>{session.title}</Text>
                  <Text style={styles.cardDetail}>
                    {formatDate(session.scheduledDate)} · {session.dayType} · {session.status}
                  </Text>
                  <Text style={styles.helperText}>
                    {session.personalProgram.name} · {completedCount}/{session.sessionExercises.length} ejercicios marcados
                  </Text>
                  {session.logs[0] ? (
                    <Text style={styles.helperText}>
                      Ultimo log: {formatDate(session.logs[0].createdAt)} · RPE {session.logs[0].perceivedExertion ?? "-"}
                    </Text>
                  ) : null}
                  {favoriteSessionId === session.id ? <Text style={styles.favoriteText}>Sesion favorita</Text> : null}
                </Pressable>
              );
            })}
            {!sessions.length ? <Text style={styles.helperText}>Todavia no tienes sesiones programadas.</Text> : null}
          </View>
        </View>

        {selectedSession ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sesion seleccionada</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{selectedSession.title}</Text>
              <Text style={styles.cardDetail}>
                {formatDate(selectedSession.scheduledDate)} · {selectedSession.dayType} · {selectedSession.status}
              </Text>
              {selectedSession.notes ? <Text style={styles.helperText}>{selectedSession.notes}</Text> : null}
              <View style={styles.inlineRow}>
                <Pressable style={styles.secondaryButton} onPress={() => toggleFavoriteSession(selectedSession.id)}>
                  <Text style={styles.secondaryButtonText}>{favoriteSessionId === selectedSession.id ? "Quitar favorita" : "Marcar favorita"}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Recordatorios y calendario</Text>
              <Text style={styles.helperText}>
                Notificaciones: {permissionLabel(notificationPermission)} · Recordatorios locales: disponibles
              </Text>
              <Text style={styles.helperText}>{isExpoGo ? "Push remoto: requiere development build" : "Push remoto: desactivado en esta vista"}</Text>
              <Text style={styles.helperText}>Calendario: {permissionLabel(calendarPermission)}</Text>
              <View style={styles.inlineRow}>
                <Pressable style={styles.secondaryButton} onPress={() => void handleEnableNotifications()} disabled={loading}>
                  <Text style={styles.secondaryButtonText}>Permitir notificaciones</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => void handleScheduleReminder()} disabled={loading}>
                  <Text style={styles.secondaryButtonText}>Programar recordatorio</Text>
                </Pressable>
                <Pressable style={styles.ghostButton} onPress={() => void handleSyncCalendar()} disabled={loading}>
                  <Text style={styles.ghostButtonText}>Sincronizar calendario</Text>
                </Pressable>
              </View>
              <Text style={styles.helperText}>
                El recordatorio motivacional se agenda a las 8:00 del mismo dia y la sincronizacion actualiza el mismo evento si la sesion cambia o se recorre automaticamente.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Estado de la sesion</Text>
              <Text style={styles.cardDetail}>Progreso actual: {selectedSessionCompletion}% del bloque marcado.</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${selectedSessionCompletion}%` }]} />
              </View>
              <Text style={styles.helperText}>
                {completedExercisesCount}/{selectedSession.sessionExercises.length} ejercicios completados en esta sesion.
              </Text>
            </View>

            {selectedSessionGuidance ? (
              <View
                style={[
                  styles.card,
                  styles.feedbackCard,
                  selectedSessionGuidance.intensity === "push"
                    ? styles.feedbackPush
                    : selectedSessionGuidance.intensity === "protect"
                      ? styles.feedbackProtect
                      : styles.feedbackSteady,
                ]}
              >
                <Text style={styles.metricLabel}>Guia de la sesion</Text>
                <Text style={styles.cardTitle}>{selectedSessionGuidance.title}</Text>
                <Text style={styles.cardDetail}>{selectedSessionGuidance.emphasis}</Text>
                <Text style={styles.helperText}>{selectedSessionGuidance.adjustment}</Text>
                {selectedSessionGuidance.cues.map((cue) => (
                  <Text key={cue} style={styles.helperText}>• {cue}</Text>
                ))}
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Test guiado de salto</Text>
              <Text style={styles.helperText}>Haz tres intentos explosivos y registra cada marca. El sistema compara el mejor intento contra tu mejor historico, tu bloque actual y la referencia de otras fases.</Text>
              <View style={styles.metricInputGrid}>
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Intento 1 cm"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.jumpTestAttempt1Cm}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, jumpTestAttempt1Cm: value }))}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Intento 2 cm"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.jumpTestAttempt2Cm}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, jumpTestAttempt2Cm: value }))}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Intento 3 cm"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.jumpTestAttempt3Cm}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, jumpTestAttempt3Cm: value }))}
                />
              </View>
              <View style={styles.metricRow}>
                <View style={styles.metricInline}>
                  <Text style={styles.metricLabel}>Mejor intento</Text>
                  <Text style={styles.metricInlineValue}>{formatMetric(jumpTestPreview.best, " cm")}</Text>
                </View>
                <View style={styles.metricInline}>
                  <Text style={styles.metricLabel}>Media</Text>
                  <Text style={styles.metricInlineValue}>{formatMetric(jumpTestPreview.average, " cm")}</Text>
                </View>
              </View>
              <View style={styles.tagRow}>
                <View style={styles.metricTag}><Text style={styles.metricTagText}>Vs PB {formatSignedMetric(jumpTestPreview.deltaVsPersonalBest, " cm")}</Text></View>
                <View style={styles.metricTag}><Text style={styles.metricTagText}>Vs bloque {formatSignedMetric(jumpTestPreview.deltaVsBlockBest, " cm")}</Text></View>
                <View style={styles.metricTag}><Text style={styles.metricTagText}>Vs fase {formatSignedMetric(jumpTestPreview.deltaVsPhaseReference, " cm")}</Text></View>
              </View>
              <Text style={styles.helperText}>
                Referencia bloque: {formatMetric(progress?.blockComparison.currentProgramBestJumpCm, " cm")} · Referencia fase: {formatMetric(progress?.phaseComparison.referencePhaseBestJumpCm, " cm")}
              </Text>
              <View style={styles.inlineRow}>
                <Pressable style={styles.secondaryButton} onPress={applyJumpTestToDraft}>
                  <Text style={styles.secondaryButtonText}>Usar mejor intento en el log</Text>
                </Pressable>
              </View>
            </View>

            {selectedSession.sessionExercises.map((sessionExercise) => {
              const instruction = sessionExercise.exercise.instructions.find((entry) => entry.locale === "es") ?? sessionExercise.exercise.instructions[0];
              const primaryMedia = sessionExercise.exercise.mediaAssets.find((asset) => asset.isPrimary) ?? sessionExercise.exercise.mediaAssets[0];
              const isCompleted = logDraft.completedExerciseIds.includes(sessionExercise.id);

              return (
                <Pressable
                  key={sessionExercise.id}
                  style={[styles.exerciseCard, selectedExercise?.id === sessionExercise.id ? styles.selectedExerciseCard : null]}
                  onPress={() => setSelectedExerciseId(sessionExercise.id)}
                >
                  <View style={styles.exerciseHeader}>
                    <View style={styles.exerciseCopy}>
                      <Text style={styles.cardTitle}>{sessionExercise.orderIndex}. {sessionExercise.exercise.name}</Text>
                      <Text style={styles.cardDetail}>{sessionExercise.exercise.category}</Text>
                    </View>
                    <Pressable
                      style={[styles.toggleChip, isCompleted ? styles.toggleChipActive : null]}
                      onPress={() => toggleExercise(sessionExercise.id)}
                    >
                      <Text style={[styles.toggleChipText, isCompleted ? styles.toggleChipTextActive : null]}>
                        {isCompleted ? "Hecho" : "Pendiente"}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.helperText}>
                    {sessionExercise.sets ? `${sessionExercise.sets} sets` : ""}
                    {sessionExercise.repsText ? ` · ${sessionExercise.repsText}` : ""}
                    {sessionExercise.durationSeconds ? ` · ${sessionExercise.durationSeconds}s` : ""}
                    {sessionExercise.restSeconds ? ` · descanso ${sessionExercise.restSeconds}s` : ""}
                    {sessionExercise.loadText ? ` · carga ${sessionExercise.loadText}` : ""}
                  </Text>
                  {instruction?.summary ? <Text style={styles.cardDetail}>{instruction.summary}</Text> : null}
                  {sessionExercise.guidance ? <Text style={styles.helperText}>{sessionExercise.guidance.focus}</Text> : null}
                  {sessionExercise.guidance?.cues.map((cue) => (
                    <Text key={`${sessionExercise.id}-${cue}`} style={styles.helperText}>• {cue}</Text>
                  ))}
                  {instruction?.steps ? <Text style={styles.helperText}>{instruction.steps}</Text> : null}
                  {instruction?.safetyNotes ? <Text style={styles.warningText}>{instruction.safetyNotes}</Text> : null}
                  {primaryMedia?.url ? (
                    <Pressable style={styles.linkButton} onPress={() => void Linking.openURL(primaryMedia.url as string)}>
                      <Text style={styles.linkButtonText}>Abrir media</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Registrar cumplimiento</Text>
              <Text style={styles.helperText}>{completedExercisesCount}/{selectedSession.sessionExercises.length} ejercicios marcados</Text>
              <View style={styles.statusRow}>
                {sessionStatuses.map((status) => (
                  <Pressable
                    key={status}
                    style={[styles.statusChip, logDraft.status === status ? styles.statusChipActive : null]}
                    onPress={() => setLogDraft((current) => ({ ...current, status }))}
                  >
                    <Text style={[styles.statusChipText, logDraft.status === status ? styles.statusChipTextActive : null]}>
                      {status}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                keyboardType="number-pad"
                placeholder="RPE 1-10"
                placeholderTextColor="#7a879d"
                style={styles.input}
                value={logDraft.perceivedExertion}
                onChangeText={(value) => setLogDraft((current) => ({ ...current, perceivedExertion: value }))}
              />
              <View style={styles.metricInputGrid}>
                <TextInput
                  keyboardType="number-pad"
                  placeholder="Readiness 1-10"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.readinessScore}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, readinessScore: value }))}
                />
                <TextInput
                  keyboardType="number-pad"
                  placeholder="Mood 1-10"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.moodScore}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, moodScore: value }))}
                />
                <TextInput
                  keyboardType="number-pad"
                  placeholder="Soreness 1-10"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.sorenessScore}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, sorenessScore: value }))}
                />
                <TextInput
                  keyboardType="number-pad"
                  placeholder="Pain 0-10"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.painScore}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, painScore: value }))}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Sleep h"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.sleepHours}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, sleepHours: value }))}
                />
                <TextInput
                  keyboardType="number-pad"
                  placeholder="Duracion min"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.sessionDurationMin}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, sessionDurationMin: value }))}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Salto cm"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.jumpHeightCm}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, jumpHeightCm: value }))}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Carga media kg"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.avgLoadKg}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, avgLoadKg: value }))}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Velocidad pico m/s"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.peakVelocityMps}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, peakVelocityMps: value }))}
                />
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="Peso corporal kg"
                  placeholderTextColor="#7a879d"
                  style={[styles.input, styles.metricInput]}
                  value={logDraft.bodyWeightKg}
                  onChangeText={(value) => setLogDraft((current) => ({ ...current, bodyWeightKg: value }))}
                />
              </View>
              <TextInput
                multiline
                placeholder="Notas del entrenamiento"
                placeholderTextColor="#7a879d"
                style={[styles.input, styles.notesInput]}
                value={logDraft.notes}
                onChangeText={(value) => setLogDraft((current) => ({ ...current, notes: value }))}
              />
              <Pressable style={styles.primaryButton} onPress={() => void handleSubmitLog()} disabled={loading}>
                <Text style={styles.primaryButtonText}>{loading ? "Guardando..." : "Guardar registro"}</Text>
              </Pressable>
            </View>

            {selectedSession.logs.length ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Historial rapido</Text>
                {selectedSession.logs.map((log) => (
                  <View key={log.id} style={styles.logRow}>
                    <Text style={styles.cardDetail}>{formatDate(log.createdAt)} · RPE {log.perceivedExertion ?? "-"}</Text>
                    <Text style={styles.helperText}>
                      Readiness {formatMetric(log.metrics?.readinessScore, "/10")} · Salto {formatMetric(log.metrics?.jumpHeightCm, " cm")} · Carga {formatMetric(log.metrics?.avgLoadKg, " kg")}
                    </Text>
                    <Text style={styles.helperText}>{log.notes || "Sin notas"}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ultimos registros</Text>
          <View style={styles.sectionList}>
            {progress?.recentLogs.length ? (
              progress.recentLogs.map((log) => (
                <View key={log.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{log.scheduledSession.title}</Text>
                  <Text style={styles.cardDetail}>
                    {formatDate(log.createdAt)} · {log.scheduledSession.dayType} · RPE {log.perceivedExertion ?? "-"}
                  </Text>
                  <View style={styles.tagRow}>
                    <View style={styles.metricTag}><Text style={styles.metricTagText}>Jump {formatMetric(log.metrics?.jumpHeightCm, " cm")}</Text></View>
                    <View style={styles.metricTag}><Text style={styles.metricTagText}>Ready {formatMetric(log.metrics?.readinessScore, "/10")}</Text></View>
                    <View style={styles.metricTag}><Text style={styles.metricTagText}>Load {formatMetric(log.metrics?.avgLoadKg, " kg")}</Text></View>
                    <View style={styles.metricTag}><Text style={styles.metricTagText}>Sleep {formatMetric(log.metrics?.sleepHours, " h")}</Text></View>
                  </View>
                  {log.notes ? <Text style={styles.helperText}>{log.notes}</Text> : null}
                </View>
              ))
            ) : (
              <Text style={styles.helperText}>Todavia no hay registros recientes para construir tendencia.</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Programas disponibles</Text>
          <View style={styles.sectionList}>
            {programs.map((program) => (
              <View key={program.id} style={styles.card}>
                <Text style={styles.cardTitle}>{program.name}</Text>
                <Text style={styles.cardDetail}>{program.phase} · {program.status} · {formatDate(program.startDate)}</Text>
                <Text style={styles.helperText}>{program.template?.name ?? "Sin plantilla"}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      </View>{/* end legacy */}

      {/* ── POWERED-BY FOOTER ─────────────────────────── */}
      <View style={authSt.footer}>
        <Text style={authSt.footerText}>powered</Text>
        <View style={authSt.byBadge}><Text style={authSt.byText}>by</Text></View>
        <Image source={require('../assets/img/Logo_Blanco.png')} style={authSt.footerLogo} resizeMode="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f6f1e9",
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  container: {
    padding: 20,
    gap: 18,
  },
  heroCard: {
    backgroundColor: "#fffdf8",
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(20, 33, 61, 0.1)",
    gap: 10,
  },
  heroFocusCard: {
    backgroundColor: "rgba(231, 111, 81, 0.12)",
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(231, 111, 81, 0.2)",
    gap: 10,
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.84)",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(20, 33, 61, 0.08)",
    gap: 10,
  },
  section: {
    gap: 12,
  },
  sectionList: {
    gap: 12,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: "rgba(255, 255, 255, 0.84)",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(20, 33, 61, 0.08)",
    gap: 6,
  },
  metricLabel: {
    color: "#5c677d",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metricValue: {
    color: "#14213d",
    fontSize: 28,
    fontWeight: "700",
  },
  metricSubtext: {
    color: "#5c677d",
    fontSize: 12,
  },
  metricRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  metricInline: {
    flex: 1,
    minWidth: 120,
    gap: 4,
  },
  metricInlineValue: {
    color: "#14213d",
    fontSize: 20,
    fontWeight: "700",
  },
  windowChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(20, 33, 61, 0.08)",
  },
  windowChipActive: {
    backgroundColor: "#14213d",
  },
  windowChipText: {
    color: "#14213d",
    fontWeight: "700",
  },
  windowChipTextActive: {
    color: "#fffdf8",
  },
  feedbackCard: {
    borderWidth: 1,
  },
  feedbackPush: {
    backgroundColor: "rgba(42, 157, 143, 0.12)",
    borderColor: "rgba(42, 157, 143, 0.2)",
  },
  feedbackProtect: {
    backgroundColor: "rgba(174, 32, 18, 0.08)",
    borderColor: "rgba(174, 32, 18, 0.2)",
  },
  feedbackFocus: {
    backgroundColor: "rgba(244, 162, 97, 0.14)",
    borderColor: "rgba(231, 111, 81, 0.2)",
  },
  feedbackSteady: {
    backgroundColor: "rgba(20, 33, 61, 0.05)",
    borderColor: "rgba(20, 33, 61, 0.12)",
  },
  trendChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    minHeight: 126,
    paddingTop: 8,
  },
  trendColumn: {
    alignItems: "center",
    justifyContent: "flex-end",
    flex: 1,
    gap: 4,
  },
  trendBar: {
    width: "100%",
    minWidth: 18,
    maxWidth: 28,
    borderRadius: 999,
  },
  trendValue: {
    color: "#14213d",
    fontSize: 11,
    fontWeight: "600",
  },
  trendLabel: {
    color: "#5c677d",
    fontSize: 10,
  },
  exerciseCard: {
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(20, 33, 61, 0.08)",
    gap: 10,
  },
  selectedExerciseCard: {
    borderColor: "rgba(231, 111, 81, 0.36)",
    backgroundColor: "rgba(244, 162, 97, 0.16)",
  },
  eyebrow: {
    color: "#5c677d",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: 12,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
    color: "#14213d",
    fontWeight: "700",
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    color: "#33415c",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#14213d",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#14213d",
  },
  cardDetail: {
    color: "#33415c",
    lineHeight: 22,
  },
  helperText: {
    color: "#5c677d",
    lineHeight: 20,
  },
  warningText: {
    color: "#ae2012",
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(20, 33, 61, 0.14)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    color: "#14213d",
  },
  notesInput: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  primaryButton: {
    backgroundColor: "#e76f51",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#fffdf8",
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "rgba(20, 33, 61, 0.08)",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 18,
  },
  selectedAuthButton: {
    backgroundColor: "rgba(231, 111, 81, 0.24)",
    borderWidth: 1,
    borderColor: "rgba(231, 111, 81, 0.32)",
  },
  secondaryButtonText: {
    color: "#14213d",
    fontWeight: "700",
  },
  ghostButton: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "rgba(20, 33, 61, 0.12)",
  },
  ghostButtonText: {
    color: "#14213d",
    fontWeight: "600",
  },
  inlineRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 4,
  },
  badgeWrap: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(20, 33, 61, 0.08)",
  },
  badgeText: {
    color: "#14213d",
    fontSize: 12,
    fontWeight: "600",
  },
  favoriteText: {
    color: "#c7512f",
    fontSize: 12,
    fontWeight: "700",
  },
  progressTrack: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(20, 33, 61, 0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#2a9d8f",
  },
  preloadOverlay: {
    flex: 1,
    backgroundColor: "rgba(20, 33, 61, 0.52)",
    justifyContent: "center",
    padding: 24,
  },
  preloadCard: {
    backgroundColor: "#fffdf8",
    borderRadius: 24,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(20, 33, 61, 0.08)",
    alignItems: "center",
  },
  preloadTitle: {
    color: "#14213d",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  preloadStatus: {
    color: "#c7512f",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  preloadBody: {
    color: "#5c677d",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  preloadProgressTrack: {
    width: "100%",
    height: 12,
    borderRadius: 999,
    backgroundColor: "rgba(20, 33, 61, 0.08)",
    overflow: "hidden",
  },
  preloadProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#e76f51",
  },
  preloadPercent: {
    color: "#14213d",
    fontSize: 18,
    fontWeight: "800",
  },
  sessionCard: {
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(20, 33, 61, 0.08)",
    gap: 8,
  },
  sessionCardActive: {
    borderColor: "rgba(231, 111, 81, 0.38)",
    backgroundColor: "rgba(244, 162, 97, 0.16)",
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  exerciseCopy: {
    flex: 1,
    gap: 4,
  },
  toggleChip: {
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(20, 33, 61, 0.08)",
  },
  toggleChipActive: {
    backgroundColor: "#2a9d8f",
  },
  toggleChipText: {
    color: "#14213d",
    fontWeight: "600",
  },
  toggleChipTextActive: {
    color: "#fffdf8",
  },
  linkButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(231, 111, 81, 0.12)",
  },
  linkButtonText: {
    color: "#c7512f",
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(20, 33, 61, 0.08)",
  },
  statusChipActive: {
    backgroundColor: "#14213d",
  },
  statusChipText: {
    color: "#14213d",
    fontWeight: "600",
  },
  statusChipTextActive: {
    color: "#fffdf8",
  },
  metricInputGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricInput: {
    minWidth: 140,
    flexGrow: 1,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricTag: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(20, 33, 61, 0.08)",
  },
  metricTagText: {
    color: "#14213d",
    fontSize: 12,
    fontWeight: "600",
  },
  logRow: {
    gap: 4,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(20, 33, 61, 0.08)",
  },
  errorText: {
    color: "#ae2012",
    lineHeight: 20,
  },
  successText: {
    color: "#2a9d8f",
    lineHeight: 20,
  },
});

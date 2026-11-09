import type { ScheduledSession } from "../types/api";

const STORAGE_KEY = "jump-athlete-notifications-enabled";

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function getNotificationsEnabledPreference() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setNotificationsEnabledPreference(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
}

export async function requestSessionNotificationPermission() {
  if (!notificationsSupported()) return "unsupported" as const;
  const permission = await Notification.requestPermission();
  const enabled = permission === "granted";
  setNotificationsEnabledPreference(enabled);
  if (enabled) {
    await showTestSessionNotification();
  }
  return permission;
}

async function postToServiceWorker(message: unknown) {
  if (!notificationsSupported()) return;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  reg?.active?.postMessage(message);
}

export async function syncSessionReminders(sessions: ScheduledSession[]) {
  if (!notificationsSupported() || !getNotificationsEnabledPreference()) return;
  const payload = {
    enabled: Notification.permission === "granted",
    updatedAt: new Date().toISOString(),
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      scheduledDate: s.scheduledDate,
      status: s.status,
    })),
  };
  await postToServiceWorker({ type: "SET_SESSION_REMINDERS", payload });
  await postToServiceWorker({ type: "CHECK_SESSION_REMINDERS" });
  await registerPeriodicSessionSync().catch(() => {});
}

export async function checkSessionReminders(options?: { force?: boolean; test?: boolean }) {
  if (!notificationsSupported()) return;
  await postToServiceWorker({ type: "CHECK_SESSION_REMINDERS", ...options });
}

export async function showTestSessionNotification() {
  if (!notificationsSupported()) return;
  await checkSessionReminders({ force: true, test: true });
}

async function registerPeriodicSessionSync() {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.ready;
  const periodic = (reg as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> } }).periodicSync;
  if (periodic) {
    await periodic.register("session-reminders", { minInterval: 12 * 60 * 60 * 1000 }).catch(() => {});
  }
  const sync = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
  if (sync) {
    await sync.register("session-reminders").catch(() => {});
  }
}

export function setupSessionReminderChecks(onCheck: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    if (document.visibilityState === "visible") onCheck();
  };
  document.addEventListener("visibilitychange", handler);
  window.addEventListener("focus", handler);
  return () => {
    document.removeEventListener("visibilitychange", handler);
    window.removeEventListener("focus", handler);
  };
}

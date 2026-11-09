import { useEffect } from "react";

import { useApi, handleApiResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import type { SessionsListResponse } from "../types/api";
import {
  checkSessionReminders,
  getNotificationsEnabledPreference,
  notificationsSupported,
  setupSessionReminderChecks,
  syncSessionReminders,
} from "./sessionReminders";

export function useSessionReminders() {
  const api = useApi();
  const { accessToken } = useAuth();

  useEffect(() => {
    if (!accessToken || !notificationsSupported() || !getNotificationsEnabledPreference()) return;
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await api("/athlete/sessions");
        const data = await handleApiResponse<SessionsListResponse>(res);
        if (!cancelled) await syncSessionReminders(data.sessions ?? []);
      } catch {
        if (!cancelled) await checkSessionReminders();
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 6 * 60 * 60 * 1000);
    const cleanup = setupSessionReminderChecks(() => void refresh());
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      cleanup();
    };
  }, [accessToken, api]);
}

import { useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";

export interface ApiError extends Error {
  status: number;
  data: unknown;
}

export function useApi() {
  const { accessToken } = useAuth();

  return useCallback(
    async (path: string, options: RequestInit = {}): Promise<Response> => {
      const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
      const response = await fetch(`/api/v1${path}`, {
        ...options,
        headers: {
          // For FormData the browser must set the multipart boundary itself.
          ...(isFormData ? {} : { "Content-Type": "application/json" }),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(options.headers ?? {}),
        },
      });

      if (response.status === 401) {
        const error = new Error("Session expired") as ApiError;
        error.status = 401;
        error.data = await response.json().catch(() => null);
        throw error;
      }

      return response;
    },
    [accessToken],
  );
}

export async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "Request failed" }));
    const error = new Error(data.message ?? "Request failed") as ApiError;
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return response.json() as Promise<T>;
}

export async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, options);
  return handleApiResponse<T>(response);
}

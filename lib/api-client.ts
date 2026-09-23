import { getAccessToken, setAccessToken } from "./token-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const message =
      typeof (body as { message?: unknown })?.message === "string"
        ? (body as { message: string }).message
        : Array.isArray((body as { message?: unknown })?.message)
          ? (body as { message: string[] }).message.join(", ")
          : `Request failed (${status})`;
    super(message);
    this.status = status;
    this.body = body;
  }
}

let refreshPromise: Promise<string | null> | null = null;

// De-duped: if several requests 401 at the same moment (e.g. a page firing
// multiple queries right as the access token expires), they all await the
// same in-flight refresh instead of each hitting /refresh separately.
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/admin/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retryOn401 = true,
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && retryOn401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(path, options, false);
    }
    setAccessToken(null);
    throw new ApiError(401, { message: "Session expired" });
  }

  if (!res.ok) {
    let body: unknown = {};
    try {
      body = await res.json();
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// The wrapper every feature page uses — handles auth headers and
// transparent access-token refresh on expiry. Login/session-restore
// deliberately bypass this (see auth-context.tsx) since applying
// refresh-on-401 logic to the login call itself would be actively wrong:
// a wrong-password 401 would trigger a refresh attempt instead of just
// failing.
export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { API_URL };

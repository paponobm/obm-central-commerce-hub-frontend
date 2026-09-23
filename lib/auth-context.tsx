"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { API_URL, ApiError } from "./api-client";
import { setAccessToken } from "./token-store";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

interface AuthContextValue {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On every page load, the access token is gone (it only ever lived in
  // memory), but the httpOnly refresh cookie may still be valid — so a
  // fresh page load doesn't mean a fresh login.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const refreshRes = await fetch(`${API_URL}/admin/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!refreshRes.ok) throw new Error("no session");
        const { accessToken } = (await refreshRes.json()) as {
          accessToken: string;
        };
        setAccessToken(accessToken);

        const meRes = await fetch(`${API_URL}/admin/users/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!meRes.ok) throw new Error("failed to load user");
        const me = (await meRes.json()) as AdminUser;
        if (!cancelled) setUser(me);
      } catch {
        setAccessToken(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      let body: { message?: string } = {};
      try {
        body = await res.json();
      } catch {
        // ignore
      }
      throw new ApiError(res.status, body);
    }
    const data = (await res.json()) as { accessToken: string; user: AdminUser };
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/admin/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // best-effort — clear local state regardless
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (permission: string) => user?.permissions.includes(permission) ?? false,
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api-client";
import { useAuth } from "./auth-context";
import type { ChannelWithStats } from "./types";

const STORAGE_KEY = "obm.activeChannelId";

interface ChannelScopeContextValue {
  channels: ChannelWithStats[] | null;
  loading: boolean;
  activeChannelId: string | null; // null = "All Stores"
  activeChannel: ChannelWithStats | null;
  setActiveChannelId: (channelId: string | null) => void;
  refresh: () => Promise<void>;
}

const ChannelScopeContext = createContext<ChannelScopeContextValue | undefined>(
  undefined,
);

export function ChannelScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ChannelWithStats[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const data = await api.get<ChannelWithStats[]>(
        "/admin/channels?withStats=true&includeInactive=true",
      );
      setChannels(data);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset scope when the signed-in user changes (including logout), then
  // reload the list for whoever is signed in now — a restricted user's
  // fetch returns only their assigned stores, so stale state from a
  // previous session must never leak across a re-login.
  useEffect(() => {
    if (!user) {
      setChannels(null);
      setActiveChannelIdState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [user, load]);

  // Restore the persisted store selection once the channel list is in,
  // dropping it back to "All Stores" if it no longer resolves — e.g. the
  // store was deactivated, or it belonged to a different signed-in user.
  useEffect(() => {
    if (!channels) return;
    // A restricted user with exactly one store has nothing to choose
    // between — that store IS their workspace. Deliberately not applied to
    // unrestricted users: for them "All Stores" also includes store-less
    // (manual) orders that a single-store scope would hide.
    if (channels.length === 1 && !user?.permissions.includes("channels.all_access")) {
      setActiveChannelIdState(channels[0].id);
      return;
    }
    const stored =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored && channels.some((c) => c.id === stored)) {
      setActiveChannelIdState(stored);
    } else {
      setActiveChannelIdState(null);
      if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-derive when the channel list itself changes
  }, [channels, user]);

  const setActiveChannelId = useCallback((channelId: string | null) => {
    setActiveChannelIdState(channelId);
    if (typeof window !== "undefined") {
      if (channelId) localStorage.setItem(STORAGE_KEY, channelId);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const activeChannel =
    channels?.find((c) => c.id === activeChannelId) ?? null;

  return (
    <ChannelScopeContext.Provider
      value={{
        channels,
        loading,
        activeChannelId,
        activeChannel,
        setActiveChannelId,
        refresh: load,
      }}
    >
      {children}
    </ChannelScopeContext.Provider>
  );
}

export function useChannelScope(): ChannelScopeContextValue {
  const ctx = useContext(ChannelScopeContext);
  if (!ctx) {
    throw new Error("useChannelScope must be used within ChannelScopeProvider");
  }
  return ctx;
}

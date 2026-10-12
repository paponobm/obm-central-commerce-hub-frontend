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

// Scoped per signed-in user — the plain key used to be shared by every
// account on the same browser, so logging in as a different user could
// silently inherit whichever store the PREVIOUS user last had active
// (e.g. an unrestricted Admin landing on "Online Burmese Market" instead
// of "All Stores" just because Papon had picked that store earlier).
function storageKeyFor(userId: string): string {
  return `${STORAGE_KEY}.${userId}`;
}

interface ChannelScopeContextValue {
  channels: ChannelWithStats[] | null;
  loading: boolean;
  // True once the persisted store selection has actually been applied (or
  // determined not to apply) — distinct from `loading`, which flips to
  // false as soon as the channel list itself arrives, one render BEFORE
  // this restore step runs. Code that treats a null activeChannelId as
  // meaningful (e.g. "no store is active") should wait for this, or it'll
  // act on a transient null that's about to be overwritten.
  restored: boolean;
  activeChannelId: string | null; // null = "All Stores"
  activeChannel: ChannelWithStats | null;
  setActiveChannelId: (channelId: string | null) => void;
  refresh: () => Promise<void>;
}

const ChannelScopeContext = createContext<ChannelScopeContextValue | undefined>(
  undefined,
);

export function ChannelScopeProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [channels, setChannels] = useState<ChannelWithStats[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(
    null,
  );
  const [restored, setRestored] = useState(false);

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
    // While auth itself is still rehydrating (e.g. the refresh-token call
    // right after a hard page reload), `user` is transiently null even for
    // someone who's genuinely signed in — treating that as "logged out"
    // here would finalize "no store" (restored=true) before the real
    // channel list and saved selection ever get a chance to load.
    if (authLoading) return;
    if (!user) {
      setChannels(null);
      setActiveChannelIdState(null);
      setLoading(false);
      setRestored(true);
      return;
    }
    setLoading(true);
    setRestored(false);
    load();
  }, [user, authLoading, load]);

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
      setRestored(true);
      return;
    }
    // An all-access user's scope always starts on "All Stores" — a store
    // they once clicked into (maybe during the same session they were
    // granted that access) must never come back pre-selected on a later
    // login just because it's still sitting in localStorage.
    if (user?.permissions.includes("channels.all_access")) {
      setActiveChannelIdState(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem(storageKeyFor(user.id));
      }
      setRestored(true);
      return;
    }
    const stored =
      typeof window !== "undefined" && user
        ? localStorage.getItem(storageKeyFor(user.id))
        : null;
    if (stored && channels.some((c) => c.id === stored)) {
      setActiveChannelIdState(stored);
    } else {
      setActiveChannelIdState(null);
      if (typeof window !== "undefined" && user) {
        localStorage.removeItem(storageKeyFor(user.id));
      }
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-derive when the channel list itself changes
  }, [channels, user]);

  const setActiveChannelId = useCallback(
    (channelId: string | null) => {
      setActiveChannelIdState(channelId);
      // All-access users get a fresh "All Stores" start on every login (see
      // the restore effect above) — their in-session picks stay in memory
      // only, so nothing is left behind to come back pre-selected later.
      if (
        typeof window !== "undefined" &&
        user &&
        !user.permissions.includes("channels.all_access")
      ) {
        const key = storageKeyFor(user.id);
        if (channelId) localStorage.setItem(key, channelId);
        else localStorage.removeItem(key);
      }
    },
    [user],
  );

  const activeChannel =
    channels?.find((c) => c.id === activeChannelId) ?? null;

  return (
    <ChannelScopeContext.Provider
      value={{
        channels,
        loading,
        restored,
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

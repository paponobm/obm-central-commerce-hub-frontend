"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";

export function StoreSelector() {
  const { channels, loading, activeChannelId, activeChannel, setActiveChannelId } =
    useChannelScope();
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // A restricted user assigned to exactly one store has nothing to switch
  // between — show a fixed label. Unrestricted users always get the
  // dropdown, since "All Stores" (the Central Hub view) is a real choice
  // even when only one store exists.
  if (!loading && channels && channels.length <= 1 && !hasPermission("channels.all_access")) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-fg">
        <span aria-hidden>🏬</span>
        {channels[0]?.name ?? "No store assigned"}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-fg transition-colors hover:bg-white/10 hover:text-white"
      >
        <span aria-hidden>🏬</span>
        {loading ? "Loading…" : (activeChannel?.name ?? "All Stores")}
        <span className="text-xs text-sidebar-fg/50" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setActiveChannelId(null);
              setOpen(false);
            }}
            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/5 ${
              activeChannelId === null
                ? "font-medium text-foreground"
                : "text-foreground/70"
            }`}
          >
            All Stores
            {activeChannelId === null && <span aria-hidden>✓</span>}
          </button>
          <div className="my-1 border-t border-black/5" />
          {(channels ?? []).map((channel) => (
            <button
              key={channel.id}
              type="button"
              onClick={() => {
                setActiveChannelId(channel.id);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/5 ${
                activeChannelId === channel.id
                  ? "font-medium text-foreground"
                  : "text-foreground/70"
              }`}
            >
              {channel.name}
              {activeChannelId === channel.id && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

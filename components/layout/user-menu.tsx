"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// Collapses the topbar's user info (previously always-visible email + name
// initial + Log out button) into a single avatar button — click it to see
// name/email and sign out, same pattern as StoreSelector's own dropdown.
export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
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

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-fg transition-opacity hover:opacity-90"
        title={user?.name}
        aria-label="Account menu"
      >
        {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-medium text-foreground">{user?.name}</div>
            <div className="truncate text-xs text-foreground/50">{user?.email}</div>
            <div className="mt-1 truncate text-xs text-foreground/50">{user?.role}</div>
          </div>
          <div className="my-1 border-t border-black/5" />
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-foreground/70 hover:bg-black/5"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

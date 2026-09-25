"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NAV_ENTRIES } from "./nav-config";

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, hasPermission } = useAuth();
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Whichever group contains the current route starts expanded, so landing
  // on e.g. /categories directly (not via a sidebar click) doesn't leave
  // the tree collapsed around the page you're already on.
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const entry of NAV_ENTRIES) {
        if (
          entry.type === "group" &&
          entry.children.some((c) => isActivePath(pathname, c.href))
        ) {
          next.add(entry.label);
        }
      }
      return next;
    });
  }, [pathname]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-fg">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-fg">
          O
        </div>
        <span className="text-base font-semibold text-white">
          Commerce Hub
        </span>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ENTRIES.map((entry) => {
          if (entry.permission && !hasPermission(entry.permission)) return null;

          if (entry.type === "link") {
            const active = isActivePath(pathname, entry.href);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-active text-sidebar-active-fg"
                    : "text-sidebar-fg hover:bg-white/5"
                }`}
              >
                {entry.label}
              </Link>
            );
          }

          const open = openGroups.has(entry.label);
          const groupHasActiveChild = entry.children.some((c) =>
            isActivePath(pathname, c.href),
          );

          return (
            <div key={entry.label}>
              <button
                type="button"
                onClick={() => toggleGroup(entry.label)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  groupHasActiveChild
                    ? "text-white"
                    : "text-sidebar-fg hover:bg-white/5"
                }`}
              >
                {entry.label}
                <span
                  className={`text-xs text-sidebar-fg/50 transition-transform ${open ? "rotate-90" : ""}`}
                  aria-hidden
                >
                  ›
                </span>
              </button>
              {open && (
                <div className="mt-1 space-y-0.5 border-l border-white/10 pl-4">
                  {entry.children.map((child) => {
                    const active = isActivePath(pathname, child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                          active
                            ? "bg-sidebar-active text-sidebar-active-fg"
                            : "text-sidebar-fg/80 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span
                          className={`h-1 w-1 shrink-0 rounded-full ${active ? "bg-white" : "bg-sidebar-fg/40"}`}
                          aria-hidden
                        />
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <div className="text-sm font-medium text-white">{user?.name}</div>
        <div className="text-xs text-sidebar-fg/60">{user?.role}</div>
      </div>
    </aside>
  );
}

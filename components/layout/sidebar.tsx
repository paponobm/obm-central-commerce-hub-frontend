"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";
import { NAV_ENTRIES, type NavEntry } from "./nav-config";

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// A parent's own href ("/orders") is always a path-prefix of its children's
// ("/orders/new"), so naively checking every entry independently marks both
// active at once on a child route. Only the single longest matching href —
// i.e. the most specific one — should ever be highlighted.
function findActiveHref(pathname: string, entries: NavEntry[]): string | null {
  const allHrefs = entries.flatMap((e) => (e.type === "link" ? [e.href] : e.children.map((c) => c.href)));
  const matches = allHrefs.filter((href) => isActivePath(pathname, href));
  if (matches.length === 0) return null;
  return matches.reduce((longest, href) => (href.length > longest.length ? href : longest));
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, hasPermission } = useAuth();
  const { activeChannel } = useChannelScope();
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Whichever group contains the current route starts expanded, so landing
  // on e.g. /categories directly (not via a sidebar click) doesn't leave
  // the tree collapsed around the page you're already on.
  const activeHref = findActiveHref(pathname, NAV_ENTRIES);

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const entry of NAV_ENTRIES) {
        if (
          entry.type === "group" &&
          entry.children.some((c) => c.href === activeHref)
        ) {
          next.add(entry.label);
        }
      }
      return next;
    });
  }, [activeHref]);

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
        <span className="truncate text-base font-semibold text-white">
          {activeChannel ? activeChannel.name : "Commerce Hub"}
        </span>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ENTRIES.map((rawEntry) => {
          const inStore = !!activeChannel;
          if (inStore && rawEntry.centralOnly) return null;
          const entry =
            inStore && rawEntry.type === "group"
              ? { ...rawEntry, children: rawEntry.children.filter((c) => !c.centralOnly) }
              : rawEntry;
          if (entry.permission && !hasPermission(entry.permission)) return null;

          if (entry.type === "link") {
            const active = entry.href === activeHref;
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
          const groupHasActiveChild = entry.children.some((c) => c.href === activeHref);

          return (
            <div key={entry.label}>
              <button
                type="button"
                onClick={() => toggleGroup(entry.label)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  groupHasActiveChild
                    ? "bg-sidebar-active text-sidebar-active-fg"
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
                    const active = child.href === activeHref;
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

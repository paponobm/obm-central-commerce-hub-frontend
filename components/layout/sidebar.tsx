"use client";

import { useEffect, useState, type SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";
import { NAV_ENTRIES, type NavEntry } from "./nav-config";
import { NAV_ICONS } from "./nav-icons";

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

type IconProps = SVGProps<SVGSVGElement>;
// The collapse/expand control — a double chevron, same hand-drawn-SVG
// convention as nav-icons.tsx. Mirrors horizontally via CSS when expanded
// rather than needing a second path.
function CollapseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M11.5 4.5 6 10l5.5 5.5" />
      <path d="M15.5 4.5 10 10l5.5 5.5" />
    </svg>
  );
}
function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}
// A nested nav item's own marker — a plain circle, same hand-drawn-SVG
// convention as every other icon here, replacing the old CSS dot so a
// child row reads as a proper icon in front of its text.
function ListItemIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <circle cx="10" cy="10" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

// "collapsed" is a desktop-only preference — on a narrow viewport the
// drawer is always full-width/full-label, regardless of it. Knowing the
// real viewport (not just Tailwind's CSS-only lg: breakpoint) is what lets
// the JS below — not just styling — tell those two apart, e.g. so a group
// click behaves correctly if collapse was toggled on desktop and the
// window was then resized down to mobile with the drawer still open.
// Starts false (SSR-safe) and syncs to the real value post-mount.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const { user, hasPermission } = useAuth();
  const { activeChannel } = useChannelScope();
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const isDesktop = useIsDesktop();
  // The icon-only mode only ever applies on desktop — on a narrow viewport
  // the drawer is always full-label, even if the desktop preference is
  // "collapsed" (e.g. collapsed there, then the window was resized down).
  const iconOnly = collapsed && isDesktop;

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

  // A route change from clicking a link in the mobile drawer should close
  // it — otherwise it stays open, covering the page it just navigated to.
  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // A collapsed group button has nowhere to show its children (no flyout
  // menu implemented) — clicking it expands the whole sidebar and opens
  // the group in one step, so it's always one click from a dead end.
  function handleGroupClick(label: string) {
    if (iconOnly) {
      onToggleCollapsed();
      setOpenGroups((prev) => new Set(prev).add(label));
      return;
    }
    toggleGroup(label);
  }

  return (
    <>
      {/* Backdrop — mobile only, closes the drawer on tap outside it. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-fg transition-[width,transform] duration-200 lg:static lg:translate-x-0 ${
          collapsed ? "w-64 lg:w-16" : "w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className={`flex items-start gap-2 px-5 py-5 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-fg ${collapsed ? "lg:hidden" : ""}`}>
            O
          </div>
          {/* min-w-0 lets this wrap/shrink inside the flex row instead of
              forcing it wider or truncating with "…" — a long store name
              shows in full across a couple of lines rather than being cut
              off. */}
          <span className={`min-w-0 flex-1 text-base font-semibold leading-tight text-white ${collapsed ? "lg:hidden" : ""}`}>
            {activeChannel ? activeChannel.name : "Commerce Hub"}
          </span>

          {/* Desktop collapse/expand toggle — same row as the name, not a
              row of its own. Collapsed mode has no room for the logo badge
              and this side by side, so it replaces the logo there instead
              of sitting beside it. */}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 text-sidebar-fg/70 hover:bg-white/10 hover:text-white lg:flex ${
              collapsed ? "" : "ml-auto"
            }`}
          >
            <CollapseIcon className={`h-3.5 w-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          </button>

          {/* Mobile-only dismiss button — the drawer has no collapsed mode
              of its own, so this is the explicit way to close it. */}
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sidebar-fg/70 hover:bg-white/10 lg:hidden"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2 pt-4">
          {NAV_ENTRIES.map((rawEntry) => {
            const inStore = !!activeChannel;
            if (inStore && rawEntry.centralOnly) return null;
            if (!inStore && rawEntry.storeOnly) return null;
            const entry =
              inStore && rawEntry.type === "group"
                ? { ...rawEntry, children: rawEntry.children.filter((c) => !c.centralOnly) }
                : rawEntry;
            if (entry.permission && !hasPermission(entry.permission)) return null;

            const Icon = NAV_ICONS[entry.icon];

            if (entry.type === "link") {
              const active = entry.href === activeHref;
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  title={collapsed ? entry.label : undefined}
                  className={`mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-md font-medium transition-colors ${
                    collapsed ? "lg:justify-center lg:px-0" : ""
                  } ${active ? "bg-sidebar-active text-sidebar-active-fg" : "text-sidebar-fg hover:bg-white/5"}`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0 opacity-80" />
                  <span className={collapsed ? "lg:hidden" : ""}>{entry.label}</span>
                </Link>
              );
            }

            const open = openGroups.has(entry.label);
            const groupHasActiveChild = entry.children.some((c) => c.href === activeHref);

            return (
              // Extra margin (vs. the plain links' mb-1) so an expandable
              // group — visually heavier, with its own chevron and nested
              // rows — reads as its own block rather than blending into the
              // flat list of single links around it.
              <div key={entry.label} className="my-2">
                <button
                  type="button"
                  onClick={() => handleGroupClick(entry.label)}
                  title={collapsed ? entry.label : undefined}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-md font-medium transition-colors ${
                    collapsed ? "lg:justify-center lg:px-0" : ""
                  } ${groupHasActiveChild ? "bg-sidebar-active text-sidebar-active-fg" : "text-sidebar-fg hover:bg-white/5"}`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-[18px] w-[18px] shrink-0 opacity-80" />
                    <span className={collapsed ? "lg:hidden" : ""}>{entry.label}</span>
                  </span>
                  <span
                    className={`text-sm text-sidebar-fg/50 transition-transform ${open ? "rotate-90" : ""} ${
                      collapsed ? "lg:hidden" : ""
                    }`}
                    aria-hidden
                  >
                    ›
                  </span>
                </button>
                {open && !iconOnly && (
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
                          <ListItemIcon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-sidebar-fg/40"}`} />
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

        <div className={`border-t border-white/10 px-5 py-4 ${collapsed ? "lg:hidden" : ""}`}>
          <div className="text-sm font-medium text-white">{user?.name}</div>
          <div className="text-xs text-sidebar-fg/60">{user?.role}</div>
        </div>
      </aside>
    </>
  );
}

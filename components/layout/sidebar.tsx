"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NAV_SECTIONS } from "./nav-config";

export function Sidebar() {
  const pathname = usePathname();
  const { user, hasPermission } = useAuth();

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

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {NAV_SECTIONS.map((section, i) => {
          const items = section.items.filter(
            (item) => !item.permission || hasPermission(item.permission),
          );
          if (items.length === 0) return null;
          return (
            <div key={i}>
              {section.title && (
                <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-fg/50">
                  {section.title}
                </div>
              )}
              <div className="space-y-1">
                {items.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-sidebar-active text-sidebar-active-fg"
                          : "text-sidebar-fg hover:bg-white/5"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
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

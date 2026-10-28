"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";
import { findNavTrail } from "./nav-config";

const ICON_BUTTON_CLASSES =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/50 hover:bg-black/5";

// Stands in for the sidebar's own nav tree on small screens, where the
// sidebar is off-canvas by default — hidden at the lg breakpoint, where the
// sidebar is always visible and already gives this context. Also carries
// quick-access buttons for the topbar shortcuts (search, New Order, Web
// Orders, Orders) that the topbar itself hides below md/lg to avoid
// overflowing a narrow screen — same permission/channel gating as those,
// just mirrored here rather than changing the topbar's own logic.
export function Breadcrumb() {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { activeChannel } = useChannelScope();
  const trail = findNavTrail(pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = search.trim();
    router.push(q ? `/orders?search=${encodeURIComponent(q)}` : "/orders");
    setSearchOpen(false);
    setSearch("");
  }

  if (trail.length === 0) return null;

  // Replaces the trail row in place while active — same md:hidden range as
  // the search icon that opens it, so it can never be left open past the
  // point the topbar's own search becomes visible instead.
  if (searchOpen) {
    return (
      <form onSubmit={handleSearch} className="mb-4 flex items-center gap-2 md:hidden">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order #, customer, phone…"
          className="w-full rounded-lg border border-black/10 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setSearchOpen(false)}
          aria-label="Cancel search"
          className={ICON_BUTTON_CLASSES}
        >
          ✕
        </button>
      </form>
    );
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-2 lg:hidden">
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-foreground/60">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        {trail.map((item, i) => {
          const isLast = i === trail.length - 1;
          return (
            <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              <span aria-hidden className="text-foreground/30">
                /
              </span>
              {!isLast && item.href ? (
                <Link href={item.href} className="hover:text-foreground">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? "font-medium text-foreground" : ""}>{item.label}</span>
              )}
            </span>
          );
        })}
      </nav>

      {/* Same shortcuts the topbar shows from md (search) / lg (the other
          three) up — this is their stand-in below that, so they're never
          simply unreachable on a phone. */}
      <div className="flex shrink-0 items-center gap-0.5">
        {hasPermission("orders.view") && (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            title="Search"
            className={`${ICON_BUTTON_CLASSES} md:hidden`}
          >
            🔍
          </button>
        )}
        {activeChannel && hasPermission("orders.create") && (
          <button
            type="button"
            onClick={() => router.push("/orders/new")}
            aria-label="New Order"
            title="New Order"
            className={ICON_BUTTON_CLASSES}
          >
            🛒
          </button>
        )}
        {activeChannel && hasPermission("orders.view") && (
          <button
            type="button"
            onClick={() => router.push("/web-orders")}
            aria-label="Web Orders"
            title="Web Orders"
            className={ICON_BUTTON_CLASSES}
          >
            🌐
          </button>
        )}
        {activeChannel && hasPermission("orders.view") && (
          <button
            type="button"
            onClick={() => router.push("/orders")}
            aria-label="Orders"
            title="Orders"
            className={ICON_BUTTON_CLASSES}
          >
            📋
          </button>
        )}
      </div>
    </div>
  );
}

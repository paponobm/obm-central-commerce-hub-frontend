"use client";

import { useState, type FormEvent, type ReactNode, type SVGProps } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";
import { StoreSelector } from "./store-selector";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

function NavAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-fg transition-colors hover:bg-white/10 hover:text-white"
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function HamburgerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden {...props}>
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  );
}

export function Topbar({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) {
  const { hasPermission } = useAuth();
  const { activeChannel } = useChannelScope();
  const router = useRouter();
  const [search, setSearch] = useState("");

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = search.trim();
    router.push(q ? `/orders?search=${encodeURIComponent(q)}` : "/orders");
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 bg-sidebar px-3 text-sidebar-fg sm:px-6">
      {/* Mobile-only — opens the off-canvas sidebar, which is the primary
          nav on a narrow viewport since the sidebar itself is hidden. */}
      <button
        type="button"
        onClick={onOpenMobileMenu}
        aria-label="Open menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sidebar-fg hover:bg-white/10 lg:hidden"
      >
        <HamburgerIcon className="h-5 w-5" />
      </button>

      <StoreSelector />
      <div className="mx-1 hidden h-6 w-px bg-white/10 sm:block" aria-hidden />

      {hasPermission("orders.view") && (
        <form
          onSubmit={handleSearch}
          className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 focus-within:border-primary md:flex"
        >
          <span aria-hidden className="text-sidebar-fg/50">
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, phone…"
            className="w-40 bg-transparent text-sm text-white outline-none placeholder:text-sidebar-fg/40 lg:w-56"
          />
        </form>
      )}

      {/* The same three shortcuts are always reachable via the sidebar/drawer
          too, so hiding them below lg keeps the topbar from overflowing a
          phone-width screen instead of needing its own scroll. */}
      {activeChannel && hasPermission("orders.create") && (
        <span className="hidden lg:inline-flex">
          <NavAction icon="🛒" label="New Order" onClick={() => router.push("/orders/new")} />
        </span>
      )}
      {activeChannel && hasPermission("orders.view") && (
        <span className="hidden lg:inline-flex">
          <NavAction icon="🌐" label="Web Orders" onClick={() => router.push("/web-orders")} />
        </span>
      )}
      {activeChannel && hasPermission("orders.view") && (
        <span className="hidden lg:inline-flex">
          <NavAction icon="📋" label="Orders" onClick={() => router.push("/orders")} />
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

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

export function Topbar() {
  const { user, logout, hasPermission } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = search.trim();
    router.push(q ? `/orders?search=${encodeURIComponent(q)}` : "/orders");
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 bg-sidebar px-6 text-sidebar-fg">
      {hasPermission("orders.view") && (
        <form
          onSubmit={handleSearch}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 focus-within:border-primary"
        >
          <span aria-hidden className="text-sidebar-fg/50">
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, phone…"
            className="w-56 bg-transparent text-sm text-white outline-none placeholder:text-sidebar-fg/40"
          />
        </form>
      )}

      {hasPermission("orders.create") && (
        <NavAction icon="🛒" label="New Order" onClick={() => router.push("/orders/new")} />
      )}
      {hasPermission("orders.view") && (
        <NavAction icon="📋" label="Orders" onClick={() => router.push("/orders")} />
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-sidebar-fg/70">{user?.email}</span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-fg"
          title={user?.name}
        >
          {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-sidebar-fg transition-colors hover:bg-white/10 hover:text-white"
        >
          Log out
        </button>
      </div>
    </header>
  );
}

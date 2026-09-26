"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";
import { Pill } from "@/components/ui/badge";

const TABS: { label: string; path: string; permission?: string }[] = [
  { label: "Overview", path: "", permission: "reports.view" },
  { label: "Orders", path: "/orders", permission: "orders.view" },
  { label: "Products", path: "/products", permission: "products.view" },
  { label: "Settings", path: "/settings", permission: "channels.manage" },
];

// The workspace is the same pages the rest of the admin uses, pointed at
// one store: this layout pins the global store scope to the URL's channel
// and the existing pages (which all read that scope) do the rest. There is
// deliberately no second implementation of Orders/Products/etc. here.
export default function ChannelWorkspaceLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { channels, loading, activeChannelId, setActiveChannelId } = useChannelScope();

  const channel = channels?.find((c) => c.id === id) ?? null;
  const base = `/channels/${id}`;
  const suffix = pathname.startsWith(base) ? pathname.slice(base.length) : "";

  const pinned = useRef(false);
  useEffect(() => {
    pinned.current = false;
  }, [id]);

  useEffect(() => {
    if (!channel) return;
    if (activeChannelId === id) {
      pinned.current = true;
    } else if (!pinned.current) {
      setActiveChannelId(id);
    } else {
      // Scope changed elsewhere (the topbar Store Selector) while inside
      // this workspace — follow it rather than show one store's header
      // over another store's data.
      router.replace(activeChannelId ? `/channels/${activeChannelId}${suffix}` : "/channels");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, channel, activeChannelId]);

  if (loading || !channels) return <p className="text-sm text-foreground/60">Loading…</p>;
  if (!channel) {
    return (
      <p className="text-sm text-status-cancelled">
        Store not found, or you don&apos;t have access to it.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{channel.name}</h1>
        <Pill tone={channel.isActive ? "primary" : "default"}>{channel.isActive ? "Active" : "Inactive"}</Pill>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-black/5">
        {TABS.filter((t) => !t.permission || hasPermission(t.permission)).map((t) => {
          const active = suffix === t.path;
          return (
            <Link
              key={t.label}
              href={`${base}${t.path}`}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-foreground/60 hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {activeChannelId === id ? children : <p className="text-sm text-foreground/60">Loading…</p>}
    </div>
  );
}

"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";
import { isBlockedInStore, isBlockedWithoutStore } from "@/components/layout/nav-config";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { activeChannelId, restored: scopeRestored } = useChannelScope();
  // Gated on scopeRestored, not just "not loading": activeChannelId starts
  // out null on every mount (a fresh page load included), and stays null for
  // one render even after the channel list itself has arrived — only once
  // the persisted store selection has actually been re-applied is a null
  // activeChannelId trustworthy. Checking isBlockedWithoutStore against that
  // earlier, transient null would wrongly bounce a page like Web Orders away
  // before its real (store-scoped) state ever loads in.
  const blocked =
    scopeRestored &&
    (activeChannelId ? isBlockedInStore(pathname) : isBlockedWithoutStore(pathname));

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // A storefront has no access to the central pages, and a store-only page
  // (e.g. Web Orders) has nothing to show once scope drops back to "All
  // Stores" — either way, send it home.
  useEffect(() => {
    if (blocked) router.replace("/");
  }, [blocked, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-foreground/60">
        Loading…
      </div>
    );
  }

  if (!user) {
    // Redirect is in flight (see effect above) — render nothing meanwhile.
    return null;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      {/* min-h-0 overrides the flex default of min-height:auto — without
          it this column grows to fit its content instead of respecting
          the parent's height, so overflow-y-auto below never kicks in
          and the whole page scrolls (topbar included) instead of just
          the content area. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* <AnnouncementBanner
          title="Package Expiring Soon"
          message="Your package will expire in 0 days. Please renew to avoid interruptions."
          actionLabel="Renew Package"
        /> */}
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">{blocked ? null : children}</main>
      </div>
    </div>
  );
}

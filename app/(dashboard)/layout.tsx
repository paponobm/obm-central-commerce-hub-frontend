"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";
import { isBlockedInStore } from "@/components/layout/nav-config";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { activeChannelId } = useChannelScope();
  const blocked = !!activeChannelId && isBlockedInStore(pathname);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // A storefront has no access to the central pages — send it home.
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
        <AnnouncementBanner
          title="Package Expiring Soon"
          message="Your package will expire in 0 days. Please renew to avoid interruptions."
          actionLabel="Renew Package"
        />
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">{blocked ? null : children}</main>
      </div>
    </div>
  );
}

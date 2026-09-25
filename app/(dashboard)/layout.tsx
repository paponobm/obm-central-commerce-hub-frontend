"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

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
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

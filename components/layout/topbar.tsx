"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-end gap-4 border-b border-black/5 bg-white px-6">
      <span className="text-sm text-foreground/60">{user?.email}</span>
      <Button variant="secondary" onClick={handleLogout}>
        Log out
      </Button>
    </header>
  );
}

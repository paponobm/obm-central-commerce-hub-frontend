"use client";

import { useEffect, useState } from "react";
import { applyTheme, getAppliedTheme, type Theme } from "@/lib/theme";

// The boot script in app/layout.tsx already set data-theme before this
// mounts, so read it rather than defaulting to light and flashing.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(getAppliedTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  if (!theme) return <span className="h-9 w-9" aria-hidden />;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-base text-sidebar-fg transition-colors hover:bg-white/10 hover:text-white"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

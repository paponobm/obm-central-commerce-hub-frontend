"use client";

import { useEffect } from "react";

// A minimal floating toast — this app has no toast system yet, so this is
// deliberately simple: fixed position, auto-dismiss, a manual close button.
// No animation library — just plain Tailwind utilities already in use
// elsewhere (no tailwindcss-animate plugin is installed).
export function Toast({
  message,
  variant = "success",
  onDismiss,
  durationMs = 5000,
}: {
  message: string;
  variant?: "success" | "error";
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
    // Restart the timer only when the message itself changes, not on every
    // re-render (onDismiss is a fresh closure each render in the caller).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, durationMs]);

  const toneClass =
    variant === "success" ? "bg-status-delivered" : "bg-status-cancelled";

  return (
    <div
      role="status"
      className={`fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${toneClass}`}
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-white/80 hover:text-white"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";

// Generic, reusable notice bar — deliberately not package/billing-specific
// in its own code, even though today's only caller passes static
// placeholder text (there's no subscription/billing system behind it yet).
// Wiring it to something real later is just a new caller, not a rewrite.
export function AnnouncementBanner({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-4 bg-sidebar px-6 py-3 text-white">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-white/60">{message}</div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="rounded-lg bg-status-pending px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            {actionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="text-white/50 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

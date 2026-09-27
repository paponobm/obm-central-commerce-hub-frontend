"use client";

import { useState } from "react";

export interface BarTrendPoint {
  label: string; // short axis label, e.g. "Sep 12"
  value: number;
  tooltipLabel?: string; // full label for the tooltip, e.g. "Sep 12, 2026"
}

// Single series over a small, fixed set of day-buckets — one hue (sequential
// job, not categorical), so no legend box per the skill's rule ("a single
// series needs no legend box"). Each bar is its own hit target with a
// pointermove/focus tooltip, per the skill's bar/cell interaction spec —
// there's no crosshair here because there's nothing to snap between bars.
export function BarTrendChart({ points }: { points: BarTrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));

  if (points.every((p) => p.value === 0)) {
    return <p className="text-sm text-foreground/50">No data yet.</p>;
  }

  return (
    <div className="relative">
      <div className="flex h-40 items-end gap-2">
        {points.map((p, i) => {
          const heightPct = Math.max((p.value / max) * 100, p.value > 0 ? 4 : 0);
          return (
            <button
              key={i}
              type="button"
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
            >
              {hover === i && (
                <div className="absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-card">
                  {p.tooltipLabel ?? p.label}: {p.value.toLocaleString()}
                </div>
              )}
              <div
                className="w-full max-w-[28px] rounded-t-[4px] bg-[var(--series-1)] transition-opacity group-hover:opacity-80"
                style={{ height: `${heightPct}%` }}
              />
              <span className="mt-2 text-[10px] text-foreground/40">{p.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

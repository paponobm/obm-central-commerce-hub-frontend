"use client";

import { useState } from "react";
import { formatAmount } from "@/lib/format";

// Same validated 8-slot categorical palette as StackedBarChart — fixed,
// CVD-safe order, never reordered or cycled per series. Kept here instead of
// imported so a chart can still pick either shape for the same segments
// without one depending on the other's internals.
const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

export interface DonutSegment {
  label: string;
  value: number;
  // Already-formatted secondary figure (e.g. money) shown under the count
  // in the legend — text, never color, carries this second value.
  secondaryLabel?: string;
}

// Part-to-whole as a donut + legend, with a per-wedge hover tooltip (the
// skill's interaction spec for bar/dot/cell-shaped marks) rather than labels
// crowded onto thin wedges. Many/similar-sized slices read worse here than
// as a stacked bar (see StackedBarChart's own note) — kept anyway because
// this is the shape asked for; the legend and hover keep it accessible.
export function DonutChart({
  segments,
  caption,
  totalAmount,
}: {
  segments: DonutSegment[];
  caption?: string;
  // Chart-wide money total shown as a second line under the donut (e.g.
  // "Total Value: ৳32,560") — separate from caption since it's always
  // formatted the same way, unlike the free-text caption.
  totalAmount?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (total === 0) {
    return <p className="text-base text-foreground/50">No data yet.</p>;
  }

  const size = 168;
  const radius = size / 2;
  const innerRadius = radius * 0.6;
  const cx = radius;
  const cy = radius;

  const toXY = (deg: number, r: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };

  let angle = -90;
  const arcs = visible.map((s) => {
    const colorIndex = segments.indexOf(s);
    // A single 100% segment sweeps a full 360° — its start and end points
    // land on the exact same spot, which SVG's arc command draws as a
    // zero-length (invisible) path. Nudging just under a full circle keeps
    // it a real wedge without visibly affecting any other case.
    const sweep = visible.length === 1 ? 359.99 : (s.value / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle += sweep;
    const mid = (start + end) / 2;
    const large = end - start > 180 ? 1 : 0;
    const [x1, y1] = toXY(start, radius);
    const [x2, y2] = toXY(end, radius);
    const [x3, y3] = toXY(end, innerRadius);
    const [x4, y4] = toXY(start, innerRadius);
    const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${x4} ${y4} Z`;
    return { label: s.label, value: s.value, colorIndex, mid, path, pct: (s.value / total) * 100 };
  });

  const hovered = arcs.find((a) => a.colorIndex === hoverIndex) ?? null;
  const [tx, ty] = hovered ? toXY(hovered.mid, radius * 1.18) : [cx, cy];

  return (
    <div className="flex items-center gap-5">
      {/* This column takes the leftover space and centers the chart (and its
          caption) within it, so the donut sits in the middle of the card's
          main area rather than flush against the legend. */}
      <div className="flex flex-1 flex-col items-center gap-3">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Order breakdown by stage">
            {arcs.map((a) => (
              <path
                key={a.label}
                d={a.path}
                fill={SERIES_COLORS[a.colorIndex % SERIES_COLORS.length]}
                onMouseEnter={() => setHoverIndex(a.colorIndex)}
                onMouseLeave={() => setHoverIndex(null)}
                className="cursor-pointer transition-opacity"
                style={{ opacity: hoverIndex === null || hoverIndex === a.colorIndex ? 1 : 0.35 }}
              />
            ))}
          </svg>
          {hovered && (
            <div
              className="pointer-events-none absolute z-10 min-w-[8rem] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-foreground px-3 py-2 text-background shadow-card"
              style={{ left: tx, top: ty }}
            >
              <div className="text-sm font-medium opacity-80">{hovered.label}</div>
              <div className="text-base font-semibold">Orders: {hovered.value}</div>
              <div className="text-sm opacity-70">{hovered.pct.toFixed(1)}%</div>
            </div>
          )}
        </div>
        {(caption || totalAmount !== undefined) && (
          <div className="text-center">
            {caption && <p className="text-sm font-medium text-foreground/70">{caption}</p>}
            {totalAmount !== undefined && (
              <p className="text-sm text-foreground/50">Total Value: ৳{formatAmount(totalAmount)}</p>
            )}
          </div>
        )}
      </div>

      {/* Legend — always present for 2+ series, text never color-alone. A
          natural width, pinned to the right, rather than stretching to
          fill the row (that was pushing it onto its own line before). */}
      <div className="flex shrink-0 flex-col gap-2">
        {segments.map((s) => {
          const colorIndex = segments.indexOf(s);
          return (
            <div key={s.label} className="flex items-center gap-1.5 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[colorIndex % SERIES_COLORS.length] }}
              />
              <span className="text-foreground/70">
                {s.label} <span className="text-foreground/50">({s.value})</span>
                {s.secondaryLabel && <span className="block text-foreground/40">{s.secondaryLabel}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

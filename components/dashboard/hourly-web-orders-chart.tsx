"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { todayStr, formatDisplayDate } from "@/lib/stat-date-range";
import { Card } from "@/components/ui/card";
import { LoadingLine } from "@/components/ui/spinner";
import { CompareDatesModal } from "@/components/ui/compare-dates-modal";

interface HourlyWebOrders {
  date: string;
  compareDate: string;
  hours: { hour: number; current: number; previous: number }[];
}

function dayBefore(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA");
}

function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// Internal SVG coordinate space — a fixed aspect ratio, scaled responsively
// by the container; the HTML tooltip overlay positions itself with the
// same percentages so it always lines up with the rendered chart.
const VB_W = 1000;
const VB_H = 360;
const PAD_LEFT = 36;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 32;

export function HourlyWebOrdersChart({ channelId }: { channelId?: string }) {
  const [date, setDate] = useState(todayStr());
  const [compareDate, setCompareDate] = useState(dayBefore(todayStr()));
  const [data, setData] = useState<HourlyWebOrders | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const today = todayStr();
  const preset: "today" | "yesterday" | "custom" =
    date === today && compareDate === dayBefore(today)
      ? "today"
      : date === dayBefore(today) && compareDate === dayBefore(dayBefore(today))
        ? "yesterday"
        : "custom";

  useEffect(() => {
    let cancelled = false;
    setError(null);

    function load() {
      const params = new URLSearchParams({ date, compareDate });
      if (channelId) params.set("channelId", channelId);
      api
        .get<HourlyWebOrders>(`/admin/reports/hourly-web-orders?${params}`)
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof ApiError ? err.message : "Failed to load hourly web orders");
          }
        });
    }

    load();
    // Same short-poll "stands in for real-time" convention used by every
    // other live card on this dashboard.
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [date, compareDate, channelId]);

  const { currentPath, previousPath, points, yTicks } = useMemo(() => {
    const hours = data?.hours ?? Array.from({ length: 24 }, (_, hour) => ({ hour, current: 0, previous: 0 }));
    const rawMax = Math.max(1, ...hours.map((h) => Math.max(h.current, h.previous)));
    // A "nice" ceiling (next multiple of a round step) so gridlines land on
    // whole numbers instead of odd fractions.
    const step = rawMax <= 4 ? 1 : rawMax <= 20 ? Math.ceil(rawMax / 4) : Math.ceil(rawMax / 4 / 5) * 5;
    const maxValue = step * 4;
    const chartW = VB_W - PAD_LEFT - PAD_RIGHT;
    const chartH = VB_H - PAD_TOP - PAD_BOTTOM;
    const xAt = (i: number) => PAD_LEFT + (i / 23) * chartW;
    const yAt = (v: number) => PAD_TOP + chartH - (v / maxValue) * chartH;

    const points = hours.map((h, i) => ({
      hour: h.hour,
      current: h.current,
      previous: h.previous,
      x: xAt(i),
      yCurrent: yAt(h.current),
      yPrevious: yAt(h.previous),
    }));
    const currentPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.yCurrent}`).join(" ");
    const previousPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.yPrevious}`).join(" ");
    const yTicks = [0, 1, 2, 3, 4].map((n) => ({ value: step * n, y: yAt(step * n) }));

    return { currentPath, previousPath, points, yTicks };
  }, [data]);

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const tooltipLeftPct = hovered ? (hovered.x / VB_W) * 100 : 0;
  const flipTooltip = hovered ? hovered.x > VB_W * 0.65 : false;

  const currentHour = new Date().getHours();
  const untilSuffix = date === today ? ` (Until ${hourLabel(currentHour)})` : "";

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Hourly Web Orders</h2>
          {data && (
            <p className="text-sm text-foreground/50">
              {formatDisplayDate(data.date)} vs {formatDisplayDate(data.compareDate)}
              {untilSuffix}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1 rounded-lg bg-black/5 p-1">
            <button
              type="button"
              onClick={() => {
                setDate(today);
                setCompareDate(dayBefore(today));
              }}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                preset === "today" ? "bg-card text-foreground shadow-sm" : "text-foreground/60 hover:text-foreground"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                setDate(dayBefore(today));
                setCompareDate(dayBefore(dayBefore(today)));
              }}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                preset === "yesterday" ? "bg-card text-foreground shadow-sm" : "text-foreground/60 hover:text-foreground"
              }`}
            >
              Yesterday
            </button>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label="Compare specific dates"
            title="Compare specific dates"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/10 text-foreground/60 hover:bg-black/5"
          >
            ⋯
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-2 text-base text-status-cancelled">{error}</p>
      ) : !data ? (
        <LoadingLine />
      ) : (
        <>
          <div ref={containerRef} className="relative mt-3 w-full" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {yTicks.map((t) => (
                <line
                  key={t.value}
                  x1={PAD_LEFT}
                  x2={VB_W - PAD_RIGHT}
                  y1={t.y}
                  y2={t.y}
                  stroke="currentColor"
                  className="text-foreground/10"
                  strokeWidth={1}
                />
              ))}
              {yTicks.map((t) => (
                <text key={t.value} x={PAD_LEFT - 8} y={t.y + 4} textAnchor="end" className="fill-foreground/40 text-[20px]">
                  {t.value}
                </text>
              ))}
              {points
                .filter((_, i) => i % 3 === 0)
                .map((p) => (
                  <text key={p.hour} x={p.x} y={VB_H - 10} textAnchor="middle" className="fill-foreground/40 text-[18px]">
                    {hourLabel(p.hour)}
                  </text>
                ))}

              <path d={previousPath} fill="none" stroke="currentColor" className="text-foreground/30" strokeWidth={2} strokeDasharray="6 5" />
              <path d={currentPath} fill="none" stroke="var(--series-1)" strokeWidth={2.5} />

              {hovered && (
                <>
                  <line x1={hovered.x} x2={hovered.x} y1={PAD_TOP} y2={VB_H - PAD_BOTTOM} stroke="currentColor" className="text-foreground/20" strokeWidth={1} />
                  <circle cx={hovered.x} cy={hovered.yPrevious} r={5} fill="var(--card-bg)" stroke="currentColor" className="text-foreground/40" strokeWidth={2} />
                  <circle cx={hovered.x} cy={hovered.yCurrent} r={5} fill="var(--series-1)" stroke="var(--card-bg)" strokeWidth={2} />
                </>
              )}

              {/* One invisible hit-target column per hour. */}
              {points.map((p, i) => (
                <rect
                  key={p.hour}
                  x={PAD_LEFT + (i / 24) * (VB_W - PAD_LEFT - PAD_RIGHT)}
                  y={0}
                  width={(VB_W - PAD_LEFT - PAD_RIGHT) / 24}
                  height={VB_H}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex((h) => (h === i ? null : h))}
                  style={{ cursor: "crosshair" }}
                />
              ))}
            </svg>

            {hovered && (
              <div
                className="pointer-events-none absolute top-2 z-10 w-40 rounded-lg border border-black/10 bg-card p-2.5 shadow-card"
                style={{
                  left: flipTooltip ? undefined : `${tooltipLeftPct}%`,
                  right: flipTooltip ? `${100 - tooltipLeftPct}%` : undefined,
                  transform: flipTooltip ? "translateX(-8px)" : "translateX(8px)",
                }}
              >
                <div className="mb-1.5 text-sm font-semibold text-foreground">{hourLabel(hovered.hour)}</div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-1.5 text-foreground/60">
                    <span className="h-2 w-2 shrink-0 rounded-sm bg-[var(--series-1)]" />
                    Current
                  </span>
                  <span className="font-semibold text-foreground">{hovered.current}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-1.5 text-foreground/60">
                    <span className="h-2 w-2 shrink-0 rounded-sm border border-foreground/40" />
                    Previous
                  </span>
                  <span className="font-semibold text-foreground">{hovered.previous}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-4 text-sm text-foreground/60">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-sm bg-[var(--series-1)]" />
              Current Web Orders
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-sm border border-foreground/40" />
              Previous Web Orders
            </span>
          </div>
        </>
      )}

      <CompareDatesModal
        open={modalOpen}
        initialDate={date}
        initialCompareDate={compareDate}
        today={today}
        onApply={(d, c) => {
          setDate(d);
          setCompareDate(c);
          setModalOpen(false);
        }}
        onClose={() => setModalOpen(false)}
      />
    </Card>
  );
}

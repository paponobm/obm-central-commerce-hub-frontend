"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { statRangeBounds, type StatRange } from "@/lib/stat-date-range";
import { Card } from "@/components/ui/card";
import { StatDateRangeSelect } from "@/components/ui/stat-date-range-select";
import { LoadingLine } from "@/components/ui/spinner";

interface OrdersSummary {
  range: { from: string; to: string };
  current: { count: number };
  previous: { count: number };
}

// Real orders only — same rule as the main Order List (a website order
// still unapproved in Web Orders doesn't count), excluding Cancelled and
// Pending Cancel. Shows a vs-previous-period delta for whatever range is
// selected (omitted for Lifetime, which has no meaningful "previous").
export function TotalOrdersCard({ channelId }: { channelId?: string }) {
  const [range, setRange] = useState<StatRange>("today");
  const [customFrom, setCustomFrom] = useState<string | undefined>();
  const [customTo, setCustomTo] = useState<string | undefined>();
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleRangeChange(next: StatRange, nextFrom?: string, nextTo?: string) {
    setRange(next);
    setCustomFrom(nextFrom);
    setCustomTo(nextTo);
  }

  useEffect(() => {
    const { from, to } = statRangeBounds(range, customFrom, customTo);
    const params = new URLSearchParams({ from, to });
    if (channelId) params.set("channelId", channelId);

    let cancelled = false;
    setSummary(null);
    setError(null);
    api
      .get<OrdersSummary>(`/admin/reports/orders-summary?${params}`)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load orders summary");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range, customFrom, customTo, channelId]);

  const delta =
    summary && range !== "lifetime"
      ? summary.previous.count > 0
        ? ((summary.current.count - summary.previous.count) / summary.previous.count) * 100
        : summary.current.count > 0
          ? 100
          : null
      : null;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-foreground/60">Total Orders</div>
        <StatDateRangeSelect value={range} customFrom={customFrom} customTo={customTo} onChange={handleRangeChange} />
      </div>
      {error ? (
        <p className="mt-2 text-sm text-status-cancelled">{error}</p>
      ) : !summary ? (
        <LoadingLine />
      ) : (
        <>
          <div className="mt-2 text-2xl font-semibold text-foreground">{summary.current.count}</div>
          {delta !== null && (
            <div
              className={`mt-1 text-xs font-medium ${
                delta >= 0 ? "text-status-delivered" : "text-status-cancelled"
              }`}
            >
              {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
              <span className="ml-1 font-normal text-foreground/40">Previous {summary.previous.count}</span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { OrderListItem } from "@/lib/types";
import { formatAmount } from "@/lib/format";
import { dateRangeCutoff, type DateRange } from "@/lib/date-range";
import { Card } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/donut-chart";
import { DateRangeSelect } from "@/components/ui/date-range-select";

// A specific store's orders broken down by source, with the same "Today ▾"
// filter as Web Order Report. Every source, not just WEBSITE — includeWebUnapproved
// keeps a pending web order counted here even before it's approved, matching
// what the original all-time stat on this card used to count.
export function OrdersBySourceReport({ channelId }: { channelId: string }) {
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>("today");

  useEffect(() => {
    setOrders(null);
    setError(null);
    api
      .get<OrderListItem[]>(`/admin/orders?channelId=${channelId}&includeWebUnapproved=true`)
      .then(setOrders)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load orders by source"));
  }, [channelId]);

  const segments = useMemo(() => {
    if (!orders) return [];
    const cutoff = dateRangeCutoff(range);
    const inRange = cutoff ? orders.filter((o) => new Date(o.createdAt) >= cutoff) : orders;
    const bySource = new Map<string, { count: number; total: number }>();
    for (const o of inRange) {
      const entry = bySource.get(o.source) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += Number(o.total);
      bySource.set(o.source, entry);
    }
    // Biggest source first, same order the original card showed.
    return Array.from(bySource.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([source, { count, total }]) => ({
        label: source,
        value: count,
        secondaryLabel: formatAmount(total),
      }));
  }, [orders, range]);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Orders by Source</h2>
        <DateRangeSelect value={range} onChange={setRange} />
      </div>

      {error ? (
        <p className="text-sm text-status-cancelled">{error}</p>
      ) : !orders ? (
        <p className="text-sm text-foreground/60">Loading…</p>
      ) : (
        <DonutChart segments={segments} />
      )}
    </Card>
  );
}

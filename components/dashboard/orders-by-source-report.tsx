"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { OrderListItem } from "@/lib/types";
import { formatAmount } from "@/lib/format";
import { dateRangeCutoff, type DateRange } from "@/lib/date-range";
import { Card } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/donut-chart";
import { DateRangeSelect } from "@/components/ui/date-range-select";
import { LoadingLine } from "@/components/ui/spinner";

// A specific store's orders broken down by source, with the same "Today ▾"
// filter as Web Order Report. Every source, not just WEBSITE — includeWebUnapproved
// keeps a pending web order counted here even before it's approved, matching
// what the original all-time stat on this card used to count.
export function OrdersBySourceReport({ channelId }: { channelId: string }) {
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>("today");

  useEffect(() => {
    let cancelled = false;
    setOrders(null);
    setError(null);

    function load() {
      api
        .get<OrderListItem[]>(`/admin/orders?channelId=${channelId}&includeWebUnapproved=true`)
        .then((data) => {
          if (!cancelled) setOrders(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load orders by source");
        });
    }

    load();
    // Same short-poll "stands in for real-time" convention used by Web
    // Order Report and the Web Orders list page.
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [channelId]);

  const { segments, totalCount, totalAmount } = useMemo(() => {
    if (!orders) return { segments: [], totalCount: 0, totalAmount: 0 };
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
    const segments = Array.from(bySource.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([source, { count, total }]) => ({
        label: source,
        value: count,
        secondaryLabel: formatAmount(total),
      }));
    return { segments, totalCount: inRange.length, totalAmount: inRange.reduce((sum, o) => sum + Number(o.total), 0) };
  }, [orders, range]);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Orders by Source</h2>
        <DateRangeSelect value={range} onChange={setRange} />
      </div>

      {error ? (
        <p className="text-base text-status-cancelled">{error}</p>
      ) : !orders ? (
        <LoadingLine />
      ) : (
        <DonutChart segments={segments} caption={`Total Orders: ${totalCount}`} totalAmount={totalAmount} />
      )}
    </Card>
  );
}

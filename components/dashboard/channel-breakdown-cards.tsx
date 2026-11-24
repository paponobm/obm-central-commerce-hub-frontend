"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { statRangeBounds, type StatRange } from "@/lib/stat-date-range";
import type { ChannelBreakdown } from "@/lib/types";
import { formatAmount } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { StatDateRangeSelect } from "@/components/ui/stat-date-range-select";
import { StatusBadge } from "@/components/ui/badge";
import { DonutChart } from "@/components/ui/donut-chart";
import { LoadingLine } from "@/components/ui/spinner";

interface ChannelCardProps {
  channelId: string;
  channelName: string;
}

// Shared by the three per-channel report cards below — same date-range
// filter + fetch + 8s poll as TotalOrdersCard, just against the one
// channel-breakdown endpoint that returns all three groupings together.
// Each card keeps its own independent range, same reasoning TotalOrdersCard
// and PendingWebOrdersCard already have separate ranges from each other.
function useChannelBreakdown(channelId: string) {
  const [range, setRange] = useState<StatRange>("today");
  const [customFrom, setCustomFrom] = useState<string | undefined>();
  const [customTo, setCustomTo] = useState<string | undefined>();
  const [data, setData] = useState<ChannelBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleRangeChange(next: StatRange, nextFrom?: string, nextTo?: string) {
    setRange(next);
    setCustomFrom(nextFrom);
    setCustomTo(nextTo);
  }

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    function load() {
      const { from, to } = statRangeBounds(range, customFrom, customTo);
      const params = new URLSearchParams({ from, to, channelId });
      api
        .get<ChannelBreakdown>(`/admin/reports/channel-breakdown?${params}`)
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load");
        });
    }

    load();
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [channelId, range, customFrom, customTo]);

  return { data, error, range, customFrom, customTo, handleRangeChange };
}

function CardHeader({
  title,
  range,
  customFrom,
  customTo,
  onChange,
}: {
  title: string;
  range: StatRange;
  customFrom?: string;
  customTo?: string;
  onChange: (next: StatRange, from?: string, to?: string) => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <StatDateRangeSelect value={range} customFrom={customFrom} customTo={customTo} onChange={onChange} />
    </div>
  );
}

// The "Stores" tile — same sales-total-plus-order-count figure it always
// showed, just filterable now instead of a fixed all-time number. Reuses
// the same channel-breakdown fetch as its siblings (summed across sources,
// since that's exactly "every order on this channel in range"), so adding
// a filter here didn't need a new endpoint. The channel name is its own
// button (not the whole tile, like before) — a nested interactive filter
// control inside an outer clickable card isn't valid, so `onSelect` only
// fires from the name/figures, never from the dropdown.
export function ChannelStoreCard({
  channelId,
  channelName,
  onSelect,
}: ChannelCardProps & { onSelect: () => void }) {
  const { data, error, range, customFrom, customTo, handleRangeChange } = useChannelBreakdown(channelId);
  const salesTotal = data ? data.bySource.reduce((sum, s) => sum + s.salesTotal, 0) : 0;
  const orderCount = data ? data.bySource.reduce((sum, s) => sum + s.orderCount, 0) : 0;
  return (
    <div className="rounded-card border border-black/5 bg-card p-5 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="truncate text-left text-base text-foreground/60 hover:text-foreground hover:underline"
        >
          {channelName}
        </button>
        <StatDateRangeSelect value={range} customFrom={customFrom} customTo={customTo} onChange={handleRangeChange} />
      </div>
      {error ? (
        <p className="text-sm text-status-cancelled">{error}</p>
      ) : !data ? (
        <LoadingLine />
      ) : (
        <>
          <div className="text-3xl font-semibold text-foreground">{formatAmount(salesTotal)}</div>
          <div className="mt-1 text-sm text-foreground/50">
            {orderCount} {orderCount === 1 ? "order" : "orders"}
          </div>
        </>
      )}
    </div>
  );
}

export function ChannelOrdersBySourceCard({ channelId, channelName }: ChannelCardProps) {
  const { data, error, range, customFrom, customTo, handleRangeChange } = useChannelBreakdown(channelId);
  return (
    <Card>
      <CardHeader
        title={`${channelName} Orders by Source`}
        range={range}
        customFrom={customFrom}
        customTo={customTo}
        onChange={handleRangeChange}
      />
      {error ? (
        <p className="text-base text-status-cancelled">{error}</p>
      ) : !data ? (
        <LoadingLine />
      ) : (
        <DonutChart
          segments={data.bySource.map((s) => ({
            label: s.source,
            value: s.orderCount,
            secondaryLabel: formatAmount(s.salesTotal),
          }))}
          caption={`Total Orders: ${data.bySource.reduce((sum, s) => sum + s.orderCount, 0)}`}
          totalAmount={data.bySource.reduce((sum, s) => sum + s.salesTotal, 0)}
        />
      )}
    </Card>
  );
}

// Same filter as its Source/Employee Discount siblings, but counting a
// different thing — see ReportsService.getChannelBreakdown's own comment:
// "Today" here means "currently in this status, and entered it today", not
// "created today", so a week-old order marked Shipped just now still shows
// up under Shipped.
export function ChannelOrdersByStatusCard({ channelId, channelName }: ChannelCardProps) {
  const { data, error, range, customFrom, customTo, handleRangeChange } = useChannelBreakdown(channelId);
  const entries = data ? Object.entries(data.byStatus).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]) : [];
  return (
    <Card>
      <CardHeader
        title={`${channelName} Orders by Status`}
        range={range}
        customFrom={customFrom}
        customTo={customTo}
        onChange={handleRangeChange}
      />
      {error ? (
        <p className="text-base text-status-cancelled">{error}</p>
      ) : !data ? (
        <LoadingLine />
      ) : entries.length === 0 ? (
        <p className="text-base text-foreground/50">No orders in this range.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {entries.map(([status, count]) => (
            <div key={status} className="rounded-lg border border-black/5 p-3">
              <StatusBadge status={status} compact />
              <div className="mt-2 text-xl font-semibold text-foreground">{count}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Same "manualDiscount summed per employee" rule as the Employee Report
// page — see ReportsService.getChannelBreakdown's own comment. A channel
// whose orders are mostly/entirely WEBSITE-sourced will often show little
// or nothing here, since a website order is never "handled" by a specific
// employee unless it was also created/approved manually — that's an
// honest reflection of the data, not a bug.
export function ChannelEmployeeDiscountCard({ channelId, channelName }: ChannelCardProps) {
  const { data, error, range, customFrom, customTo, handleRangeChange } = useChannelBreakdown(channelId);
  return (
    <Card>
      <CardHeader
        title={`${channelName} Employee Discount`}
        range={range}
        customFrom={customFrom}
        customTo={customTo}
        onChange={handleRangeChange}
      />
      {error ? (
        <p className="text-base text-status-cancelled">{error}</p>
      ) : !data ? (
        <LoadingLine />
      ) : data.employeeDiscount.length === 0 ? (
        <p className="text-base text-foreground/50">No employee discounts in this range.</p>
      ) : (
        <DonutChart
          segments={data.employeeDiscount.map((e) => ({
            label: e.employeeName,
            value: e.discountTotal,
            secondaryLabel: `${e.orderCount} order${e.orderCount === 1 ? "" : "s"}`,
          }))}
          caption={`Total Discount: ${formatAmount(data.employeeDiscount.reduce((sum, e) => sum + e.discountTotal, 0))}`}
          totalAmount={data.employeeDiscount.reduce((sum, e) => sum + e.discountTotal, 0)}
        />
      )}
    </Card>
  );
}

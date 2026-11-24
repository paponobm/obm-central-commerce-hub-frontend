"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { DashboardData, TopProduct } from "@/lib/types";
import { formatAmount } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { BarTrendChart } from "@/components/ui/bar-trend-chart";
import { WebOrderReport } from "@/components/dashboard/web-order-report";
import { OrdersBySourceReport } from "@/components/dashboard/orders-by-source-report";
import { TotalOrdersCard } from "@/components/dashboard/total-orders-card";
import { PendingWebOrdersCard } from "@/components/dashboard/pending-web-orders-card";
import { HourlyWebOrdersChart } from "@/components/dashboard/hourly-web-orders-chart";
import {
  ChannelEmployeeDiscountCard,
  ChannelOrdersBySourceCard,
  ChannelOrdersByStatusCard,
  ChannelStoreCard,
} from "@/components/dashboard/channel-breakdown-cards";
import { LoadingLine } from "@/components/ui/spinner";

function shortDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fullDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const { activeChannelId, activeChannel, setActiveChannelId } = useChannelScope();
  const [data, setData] = useState<DashboardData | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setTopProducts(null);
    setError(null);

    function load() {
      const qs = activeChannelId ? `?channelId=${activeChannelId}` : "";
      api
        .get<DashboardData>(`/admin/reports/dashboard${qs}`)
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
        });
      api
        .get<{ products: TopProduct[] }>(`/admin/reports/top-products?limit=5${qs ? `&${qs.slice(1)}` : ""}`)
        .then((r) => {
          if (!cancelled) setTopProducts(r.products);
        })
        .catch(() => {
          if (!cancelled) setTopProducts([]);
        });
    }

    load();
    // No push channel from the backend (REST only), so a short poll stands
    // in for real-time — same convention used by every live card on this
    // page. Paused while the tab is hidden so it doesn't keep hitting the
    // API when nobody's looking at the page.
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeChannelId]);

  if (error) {
    return <p className="text-sm text-status-cancelled">{error}</p>;
  }

  if (!data) {
    return <LoadingLine />;
  }

  const maxRevenue = Math.max(1, ...(topProducts ?? []).map((p) => p.revenue));

  const topSellingProductsCard = (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-foreground">Top Selling Products</h2>
      {!topProducts ? (
        <LoadingLine />
      ) : topProducts.length === 0 ? (
        <p className="text-base text-foreground/50">No sales in the last 30 days.</p>
      ) : (
        <div className="space-y-4">
          {topProducts.map((p, i) => (
            <div key={p.productId} className="flex items-center gap-3">
              <span className="w-4 shrink-0 text-sm font-medium text-foreground/40">{i + 1}</span>
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image, not part of the Next.js image pipeline
                <img src={p.image} alt={p.name} className="h-9 w-9 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-black/5 text-sm font-medium text-foreground/40">
                  {p.name.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-medium text-foreground">{p.name}</div>
                {p.sku && (
                  <div className="truncate text-sm text-foreground/50">
                    SKU {p.sku} - Return {p.returnPct.toFixed(1)}%
                  </div>
                )}
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-base font-semibold text-foreground">{p.quantitySold}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          activeChannel
            ? `Here's what's happening at ${activeChannel.name} today.`
            : "Here's what's happening across every storefront today."
        }
      />

      {/* All-stores only — moved to the very top, above every stat. Same
          per-store rollup the sidebar's own store switcher list draws from;
          clicking a card scopes the whole app to that store, same as
          picking it from the sidebar. Left out entirely once a single store
          is active, since "this store vs. every store" has nothing left to
          compare. */}
      {!activeChannel && (
        <>
          <h2 className="mb-3 text-base font-semibold text-foreground">Stores</h2>
          {data.ordersByChannel.length === 0 ? (
            <Card>
              <p className="text-base text-foreground/50">No orders yet.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...data.ordersByChannel]
                .sort((a, b) => b.salesTotal - a.salesTotal)
                .map((c) =>
                  c.channelId ? (
                    <ChannelStoreCard
                      key={c.channelId}
                      channelId={c.channelId}
                      channelName={c.channelName}
                      onSelect={() => {
                        setActiveChannelId(c.channelId!);
                        router.push("/");
                      }}
                    />
                  ) : (
                    // Manual/no-store orders have no channel to scope a
                    // filterable fetch to — kept as the old plain, all-time,
                    // non-clickable tile.
                    <div key="none" className="cursor-default rounded-card border border-black/5 bg-card p-5 text-left opacity-80 shadow-card">
                      <div className="truncate text-base text-foreground/60">{c.channelName}</div>
                      <div className="mt-2 text-3xl font-semibold text-foreground">{formatAmount(c.salesTotal)}</div>
                      <div className="mt-1 text-sm text-foreground/50">
                        {c.orderCount} {c.orderCount === 1 ? "order" : "orders"}
                      </div>
                    </div>
                  ),
                )}
            </div>
          )}
        </>
      )}

      {/* Total Orders / Pending Web Orders are store-scoped stats — kept
          exactly as they were for a single active store, but not shown on
          the all-stores view (which has the per-store Stores cards above
          and the per-channel report cards below instead). */}
      {activeChannel && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TotalOrdersCard channelId={activeChannel.id} />
          <PendingWebOrdersCard channelId={activeChannel.id} />
        </div>
      )}

      {/* Web Order Report / Orders by Source are store-specific (a web
          order funnel, and a single store's own source mix, only mean
          something for one store at a time) — untouched single-store view. */}
      {activeChannel && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <OrdersBySourceReport channelId={activeChannel.id} />
          <WebOrderReport channelId={activeChannel.id} />
        </div>
      )}

      {/* All-stores only — one Orders by Source / Orders by Status /
          Employee Discount trio per active store, each card independently
          date-filterable (same "Today ▾" control as Total Orders above),
          instead of one combined all-time chart for every store at once. */}
      {!activeChannel && (
        <div className="mt-6 space-y-6">
          {data.ordersByChannel
            .filter((c): c is typeof c & { channelId: string } => !!c.channelId)
            .map((c) => (
              <div key={c.channelId} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <ChannelOrdersBySourceCard channelId={c.channelId} channelName={c.channelName} />
                <ChannelOrdersByStatusCard channelId={c.channelId} channelName={c.channelName} />
                <ChannelEmployeeDiscountCard channelId={c.channelId} channelName={c.channelName} />
              </div>
            ))}
        </div>
      )}

      {/* Order Counts / Hourly Web Orders — single-store view only now. */}
      {activeChannel && (
        <>
          <Card className="mt-6">
            <h2 className="text-base font-semibold text-foreground">Order Counts</h2>
            <p className="mb-4 text-sm text-foreground/50">Orders created over the last 7 days</p>
            <BarTrendChart
              points={data.salesLast7Days.map((d) => ({
                label: shortDay(d.date),
                value: d.orderCount,
                tooltipLabel: fullDay(d.date),
              }))}
              seriesLabel="Created"
            />
          </Card>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <HourlyWebOrdersChart channelId={activeChannel.id} />
            {topSellingProductsCard}
          </div>
        </>
      )}

    </div>
  );
}

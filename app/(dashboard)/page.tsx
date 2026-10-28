"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { DashboardData, TopProduct } from "@/lib/types";
import { formatAmount } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/donut-chart";
import { BarTrendChart } from "@/components/ui/bar-trend-chart";
import { WebOrderReport } from "@/components/dashboard/web-order-report";
import { OrdersBySourceReport } from "@/components/dashboard/orders-by-source-report";
import { TotalOrdersCard } from "@/components/dashboard/total-orders-card";
import { PendingWebOrdersCard } from "@/components/dashboard/pending-web-orders-card";
import { HourlyWebOrdersChart } from "@/components/dashboard/hourly-web-orders-chart";
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

function StatCard({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  // Signed percent vs a named prior period — direction picks the color,
  // matching the skill's stat-tile delta spec (color = direction, since up
  // is "good" for every metric shown here).
  delta?: { pct: number; against: string };
}) {
  return (
    <Card>
      <div className="text-base text-foreground/60">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-foreground">{value}</div>
      {delta && (
        <div
          className={`mt-1 text-sm font-medium ${
            delta.pct >= 0 ? "text-status-delivered" : "text-status-cancelled"
          }`}
        >
          {delta.pct >= 0 ? "↑" : "↓"} {Math.abs(delta.pct).toFixed(1)}%
          <span className="ml-1 font-normal text-foreground/40">vs {delta.against}</span>
        </div>
      )}
      {hint && <div className="mt-1 text-sm text-foreground/50">{hint}</div>}
    </Card>
  );
}

export default function DashboardPage() {
  const { activeChannelId, activeChannel } = useChannelScope();
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

      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${activeChannel ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
      >
        <TotalOrdersCard channelId={activeChannel?.id} />
        {/* <StatCard label="Today's Sales" value={formatAmount(data.today.salesTotal)} /> */}
        <PendingWebOrdersCard channelId={activeChannel?.id} />
        {!activeChannel && (
          <StatCard
            label="Low Stock Products"
            value={String(data.lowStock.count)}
            hint={data.lowStock.count > 0 ? "Needs attention" : undefined}
          />
        )}
      </div>

      {/* <h2 className="mb-3 mt-6 text-base font-semibold text-foreground">
        {activeChannel ? "This store" : "Stores"}
      </h2>
      {data.ordersByChannel.length === 0 ? (
        <Card>
          <p className="text-base text-foreground/50">No orders yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.ordersByChannel.map((c) => (
            <Card key={c.channelId ?? "none"}>
              <div className="truncate text-base text-foreground/60">{c.channelName}</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{formatAmount(c.salesTotal)}</div>
              <div className="mt-1 text-sm text-foreground/50">
                {c.orderCount} {c.orderCount === 1 ? "order" : "orders"}
              </div>
            </Card>
          ))}
        </div>
      )} */}

      {/* Web Order Report is store-specific (a web order funnel only means
          something for one store at a time), so it only joins this row
          when a store is active; otherwise Orders by Source takes it alone. */}
      <div className={`mt-6 grid grid-cols-1 gap-6 ${activeChannel ? "lg:grid-cols-2" : ""}`}>
        
         {activeChannel ? (
          // Store-scoped and filterable, same "Today ▾" control as Web Order
          // Report. The all-stores view below has no single channel to scope
          // a live order fetch to, so it keeps the original unfiltered stat.
          <OrdersBySourceReport channelId={activeChannel.id} />
        ) : (
          <Card>
            <h2 className="mb-4 text-base font-semibold text-foreground">Orders by Source</h2>
            <DonutChart
              segments={data.ordersBySource.map((s) => ({
                label: s.source,
                value: s.orderCount,
                secondaryLabel: formatAmount(s.salesTotal),
              }))}
              caption={`Total Orders: ${data.ordersBySource.reduce((sum, s) => sum + s.orderCount, 0)}`}
              totalAmount={data.ordersBySource.reduce((sum, s) => sum + s.salesTotal, 0)}
            />
          </Card>
        )}
        {activeChannel && <WebOrderReport channelId={activeChannel.id} />}

       
      </div>

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
        <HourlyWebOrdersChart channelId={activeChannel?.id} />

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
      </div>

      {!activeChannel && data.lowStock.products.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-4 text-base font-semibold text-foreground">Low Stock Products</h2>
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-black/5 text-left text-sm text-foreground/50">
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium text-right">Available</th>
                <th className="pb-2 font-medium text-right">Threshold</th>
              </tr>
            </thead>
            <tbody>
              {data.lowStock.products.map((p) => (
                <tr key={p.productId} className="border-b border-black/5 last:border-0">
                  <td className="py-2.5">
                    <div className="font-medium text-foreground">{p.name}</div>
                    <div className="text-sm text-foreground/50">{p.sku}</div>
                  </td>
                  <td className="py-2.5 text-right text-status-cancelled">{p.availableStock}</td>
                  <td className="py-2.5 text-right text-foreground/50">{p.lowStockThreshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}


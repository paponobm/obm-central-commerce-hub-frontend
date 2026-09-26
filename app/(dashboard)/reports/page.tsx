"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";

interface SalesByPeriod {
  periods: { period: string; orderCount: number; salesTotal: number }[];
}
interface SalesByChannel {
  channels: { channelId: string | null; channelName: string; orderCount: number; salesTotal: number }[];
}
interface TopProducts {
  products: { productId: string; sku: string | null; name: string; quantitySold: number; revenue: number }[];
}
interface StockValuation {
  totalValue: number;
  itemCount: number;
  items: { productId: string; sku: string; name: string; currentStock: number; costPrice: number; value: number }[];
}

export default function ReportsPage() {
  const { activeChannelId, activeChannel } = useChannelScope();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [groupBy, setGroupBy] = useState("day");
  const [byPeriod, setByPeriod] = useState<SalesByPeriod | null>(null);
  const [byChannel, setByChannel] = useState<SalesByChannel | null>(null);
  const [top, setTop] = useState<TopProducts | null>(null);
  const [valuation, setValuation] = useState<StockValuation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const range = new URLSearchParams();
    if (from) range.set("from", from);
    if (to) range.set("to", to);
    if (activeChannelId) range.set("channelId", activeChannelId);
    const withGroup = new URLSearchParams(range);
    withGroup.set("groupBy", groupBy);
    const scopeOnly = activeChannelId ? `?channelId=${activeChannelId}` : "";

    setError(null);
    Promise.all([
      api.get<SalesByPeriod>(`/admin/reports/sales-by-period?${withGroup}`),
      api.get<SalesByChannel>(`/admin/reports/sales-by-channel?${range}`),
      api.get<TopProducts>(`/admin/reports/top-products?${range}`),
      api.get<StockValuation>(`/admin/reports/stock-valuation${scopeOnly}`),
    ])
      .then(([p, c, t, v]) => {
        setByPeriod(p);
        setByChannel(c);
        setTop(t);
        setValuation(v);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load reports"));
  }, [from, to, groupBy, activeChannelId]);

  const totalSales = byPeriod?.periods.reduce((s, p) => s + p.salesTotal, 0) ?? 0;
  const totalOrders = byPeriod?.periods.reduce((s, p) => s + p.orderCount, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="Reports"
        description={
          activeChannel
            ? `Sales and stock for ${activeChannel.name}. Cancelled orders are excluded.`
            : "Sales and stock across every store you can access. Cancelled orders are excluded."
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="w-32">
          <Label>Group by</Label>
          <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </Select>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-foreground">Sales by period</h2>
          <p className="mb-4 text-xs text-foreground/50">
            {totalOrders} orders · {money(totalSales)} (default range: last 30 days)
          </p>
          {!byPeriod ? (
            <p className="text-sm text-foreground/60">Loading…</p>
          ) : byPeriod.periods.length === 0 ? (
            <p className="text-sm text-foreground/50">No sales in this range.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 font-medium text-right">Orders</th>
                  <th className="pb-2 font-medium text-right">Sales</th>
                </tr>
              </thead>
              <tbody>
                {byPeriod.periods.map((p) => (
                  <tr key={p.period} className="border-b border-black/5 last:border-0">
                    <td className="py-2">{p.period}</td>
                    <td className="py-2 text-right">{p.orderCount}</td>
                    <td className="py-2 text-right font-medium">{money(p.salesTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-foreground">Sales by store</h2>
          {!byChannel ? (
            <p className="text-sm text-foreground/60">Loading…</p>
          ) : byChannel.channels.length === 0 ? (
            <p className="text-sm text-foreground/50">No sales in this range.</p>
          ) : (
            <div className="space-y-3">
              {byChannel.channels.map((c) => (
                <div key={c.channelId ?? "none"} className="flex items-center justify-between text-sm">
                  <span className="text-foreground/70">{c.channelName}</span>
                  <span className="font-medium text-foreground">
                    {c.orderCount} · {money(c.salesTotal)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-foreground">Top products</h2>
          {!top ? (
            <p className="text-sm text-foreground/60">Loading…</p>
          ) : top.products.length === 0 ? (
            <p className="text-sm text-foreground/50">No sales in this range.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium text-right">Sold</th>
                  <th className="pb-2 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {top.products.map((p) => (
                  <tr key={p.productId} className="border-b border-black/5 last:border-0">
                    <td className="py-2">
                      <div className="font-medium text-foreground">{p.name}</div>
                      <div className="text-xs text-foreground/50">{p.sku}</div>
                    </td>
                    <td className="py-2 text-right">{p.quantitySold}</td>
                    <td className="py-2 text-right font-medium">{money(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-foreground">Stock valuation</h2>
          <p className="mb-4 text-xs text-foreground/50">
            Current stock × cost price. Stock is shared across all stores.
          </p>
          {!valuation ? (
            <p className="text-sm text-foreground/60">Loading…</p>
          ) : (
            <>
              <div className="mb-3 text-2xl font-semibold text-foreground">{money(valuation.totalValue)}</div>
              <table className="w-full text-sm">
                <tbody>
                  {valuation.items.slice(0, 8).map((i) => (
                    <tr key={i.productId} className="border-b border-black/5 last:border-0">
                      <td className="py-2">
                        <div className="font-medium text-foreground">{i.name}</div>
                        <div className="text-xs text-foreground/50">
                          {i.currentStock} × {money(i.costPrice)}
                        </div>
                      </td>
                      <td className="py-2 text-right font-medium">{money(i.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type {
  OrderListItem,
  OrderStatus,
  OrderSource,
  PaymentStatus,
} from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { telHref, whatsappHref } from "@/lib/phone";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge, Pill } from "@/components/ui/badge";

const TABS: { label: string; value: OrderStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Processing", value: "PROCESSING" },
  { label: "Ready to Ship", value: "READY_TO_SHIP" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Returned", value: "RETURNED" },
];

const SOURCES: OrderSource[] = ["WEBSITE", "MANUAL", "FACEBOOK", "PHONE", "WHATSAPP", "OTHER"];
const PAYMENT_STATUSES: PaymentStatus[] = ["UNPAID", "PARTIAL", "PAID", "REFUNDED"];

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { channels: scopedChannels, activeChannelId: globalChannelId } =
    useChannelScope();

  // Fetched WITHOUT a status filter — status is filtered client-side so the
  // tab counts (computed from this same set) always match what's shown,
  // and switching tabs never needs a round trip. Source/channel/payment/
  // search still narrow the query server-side since those aren't tabs.
  const [allOrders, setAllOrders] = useState<OrderListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<OrderStatus | "">("");
  const [source, setSource] = useState("");
  const [channelId, setChannelId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  // Seeded from ?search= so the topbar's quick-search box lands here with
  // the term already applied, not just on the URL.
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const channels = scopedChannels ?? [];

  // When a specific store is selected globally (via the topbar Store
  // Selector), this page's own channel filter follows it instead of
  // offering a second, conflicting way to pick a channel. Back to "All
  // Stores" globally hands control back to the page-level dropdown.
  useEffect(() => {
    setChannelId(globalChannelId ?? "");
  }, [globalChannelId]);

  async function loadOrders(searchTerm: string) {
    const params = new URLSearchParams();
    if (source) params.set("source", source);
    if (channelId) params.set("channelId", channelId);
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    if (searchTerm) params.set("search", searchTerm);
    const qs = params.toString();
    try {
      const data = await api.get<OrderListItem[]>(`/admin/orders${qs ? `?${qs}` : ""}`);
      setAllOrders(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load orders");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => loadOrders(search), 250); // debounce typing
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, channelId, paymentStatus, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": allOrders?.length ?? 0 };
    for (const t of TABS) {
      if (t.value === "") continue;
      c[t.value] = allOrders?.filter((o) => o.status === t.value).length ?? 0;
    }
    return c;
  }, [allOrders]);

  const visibleOrders = useMemo(() => {
    if (!allOrders) return null;
    return activeTab ? allOrders.filter((o) => o.status === activeTab) : allOrders;
  }, [allOrders, activeTab]);

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order, from every storefront and every manual channel, in one place."
        actions={
          <Button variant="primary" onClick={() => router.push("/orders/new")}>
            New Order
          </Button>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-black/5">
        {TABS.map((t) => (
          <button
            key={t.value || "all"}
            onClick={() => setActiveTab(t.value)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === t.value
                ? "border-primary text-primary"
                : "border-transparent text-foreground/60 hover:text-foreground"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs ${
                activeTab === t.value ? "bg-primary/10 text-primary" : "bg-black/5 text-foreground/50"
              }`}
            >
              {counts[t.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-64">
          <Input
            placeholder="Search order #, customer, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        {globalChannelId ? (
          <div className="rounded-lg bg-black/5 px-3 py-2 text-sm text-foreground/60">
            Store: {channels.find((c) => c.id === globalChannelId)?.name ?? "…"}
          </div>
        ) : (
          <div className="w-52">
            <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-40">
          <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            <option value="">All payments</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}

        {!visibleOrders ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : visibleOrders.length === 0 ? (
          <p className="text-sm text-foreground/50">No orders match these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Order</th>
                <th className="pb-2 font-medium">Customer</th>
                <th className="pb-2 font-medium">Items</th>
                <th className="pb-2 font-medium">Channel / Source</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Payment</th>
                <th className="pb-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer border-b border-black/5 last:border-0 hover:bg-black/[0.02]"
                  onClick={() => router.push(`/orders/${o.id}`)}
                >
                  <td className="py-2.5">
                    <div className="font-medium text-foreground">{o.orderNumber}</div>
                    <div className="text-xs text-foreground/50">{formatDateTime(o.createdAt)}</div>
                  </td>
                  <td className="py-2.5 text-foreground/70">
                    <div className="font-medium text-foreground">{o.customer.name}</div>
                    <div
                      className="flex items-center gap-2 text-xs text-foreground/50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <a href={telHref(o.customer.phone)} className="hover:text-primary" title="Call">
                        📞
                      </a>
                      <a
                        href={whatsappHref(o.customer.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-status-delivered"
                        title="WhatsApp"
                      >
                        💬
                      </a>
                      {o.customer.phone}
                    </div>
                    <div className="max-w-[200px] truncate text-xs text-foreground/40" title={o.shippingAddress}>
                      {o.shippingAddress}
                    </div>
                  </td>
                  <td className="py-2.5 text-foreground/60">
                    {o.items.length === 1 ? (
                      <span>
                        {o.items[0].productName} × {o.items[0].quantity}
                      </span>
                    ) : (
                      <span>
                        {o.items[0]?.productName} × {o.items[0]?.quantity}
                        {o.items.length > 1 && (
                          <span className="text-foreground/40"> +{o.items.length - 1} more</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-foreground/60">
                    <div>{o.channel?.name ?? "No channel (manual)"}</div>
                    <div className="text-xs text-foreground/40">{o.source}</div>
                  </td>
                  <td className="py-2.5">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="py-2.5">
                    <Pill tone={o.paymentStatus === "PAID" ? "primary" : "default"}>
                      {o.paymentStatus}
                    </Pill>
                  </td>
                  <td className="py-2.5 text-right font-medium text-foreground">
                    {money(o.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

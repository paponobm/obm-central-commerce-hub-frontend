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
import { money, formatDateTime, formatRelativeTime } from "@/lib/format";
import { telHref, whatsappHref } from "@/lib/phone";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge, Pill } from "@/components/ui/badge";

// Matches the reference tab set exactly. Confirmed/Processing aren't given
// their own tab (the reference doesn't show them either) but stay reachable
// — and countable — via "All".
const TABS: { label: string; value: OrderStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "RTS", value: "READY_TO_SHIP" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Pending Return", value: "PENDING_RETURN" },
  { label: "Returned", value: "RETURNED" },
  { label: "Partial", value: "PARTIAL" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Pending Cancel", value: "PENDING_CANCEL" },
  { label: "Preorder", value: "PREORDER" },
  { label: "Lost", value: "LOST" },
];

// Mirrors OrdersService's TRANSITIONS map — which statuses can still reach
// CANCELLED, i.e. when the row-level Cancel shortcut should even appear.
const CAN_CANCEL_FROM = new Set<OrderStatus>([
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "PENDING_CANCEL",
  "PREORDER",
]);

const SOURCES: OrderSource[] = ["WEBSITE", "MANUAL", "FACEBOOK", "PHONE", "WHATSAPP", "OTHER"];
const PAYMENT_STATUSES: PaymentStatus[] = ["UNPAID", "PARTIAL", "PAID", "REFUNDED"];

type SortKey = "createdAt" | "total";

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

  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [productsModal, setProductsModal] = useState<OrderListItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    const filtered = activeTab ? allOrders.filter((o) => o.status === activeTab) : allOrders;
    if (!sort) return filtered;
    const sorted = [...filtered].sort((a, b) => {
      const av = sort.key === "total" ? Number(a.total) : new Date(a.createdAt).getTime();
      const bv = sort.key === "total" ? Number(b.total) : new Date(b.createdAt).getTime();
      return sort.dir === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [allOrders, activeTab, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
    });
  }

  function toggleRowSelected(orderId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!visibleOrders) return;
    setSelectedIds((prev) =>
      prev.size === visibleOrders.length ? new Set() : new Set(visibleOrders.map((o) => o.id)),
    );
  }

  async function copyToClipboard(e: React.MouseEvent, text: string, key: string) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId((v) => (v === key ? null : v)), 1500);
    } catch {
      // Clipboard permission denied or unavailable — nothing meaningful to
      // recover into, so just skip the "Copied" confirmation silently.
    }
  }

  function customerDetailsText(o: OrderListItem) {
    return `Name: ${o.customer.name}\nPhone: ${o.customer.phone}\nAddress: ${o.shippingAddress}`;
  }

  async function cancelOrder(e: React.MouseEvent, order: OrderListItem) {
    e.stopPropagation();
    if (!confirm(`Cancel order ${order.orderNumber}? This releases its reserved stock.`)) return;
    setRowError(null);
    setBusyId(order.id);
    try {
      await api.patch(`/admin/orders/${order.id}/status`, { status: "CANCELLED" });
      await loadOrders(search);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to cancel order");
    } finally {
      setBusyId(null);
    }
  }

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
        {rowError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {rowError}
          </p>
        )}

        {!visibleOrders ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : visibleOrders.length === 0 ? (
          <p className="text-sm text-foreground/50">No orders match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1800px] text-sm">
              <thead>
                <tr className="text-left text-sm font-semibold text-primary">
                  <th className="rounded-l-lg px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                    <input
                      type="checkbox"
                      checked={visibleOrders.length > 0 && selectedIds.size === visibleOrders.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-black/20 accent-primary"
                    />
                  </th>
                  <th className="px-8 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                    <button
                      type="button"
                      onClick={() => toggleSort("createdAt")}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      Date {sort?.key === "createdAt" ? (sort.dir === "desc" ? "↓" : "↑") : "↕"}
                    </button>
                  </th>
                  <th className="px-8 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Invoice</th>
                  <th className="px-8 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Customer</th>
                  <th className="px-8 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Note</th>
                  <th className="px-8 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Products</th>
                  <th className="px-8 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Status</th>
                  <th className="px-8 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Payment</th>
                  <th className="px-8 py-3 font-medium text-right" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                    <button
                      type="button"
                      onClick={() => toggleSort("total")}
                      className="ml-auto flex items-center gap-1 hover:text-foreground"
                    >
                      Total {sort?.key === "total" ? (sort.dir === "desc" ? "↓" : "↑") : "↕"}
                    </button>
                  </th>
                  <th className="px-8 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>User</th>
                  <th className="px-8 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Source</th>
                  <th className="rounded-r-lg px-8 py-3 font-medium text-right" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((o) => {
                  const visibleItems = o.items.slice(0, 2);
                  const hiddenCount = o.items.length - visibleItems.length;
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-black/10 align-middle last:border-0 hover:bg-primary/[0.03]"
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(o.id)}
                          onChange={() => toggleRowSelected(o.id)}
                          className="h-4 w-4 rounded border-black/20 accent-primary"
                        />
                      </td>
                      <td className="px-8 py-4 whitespace-nowrap">
                        <div className="text-foreground/70">{formatDateTime(o.createdAt)}</div>
                        <div className="text-xs text-foreground/40">
                          Updated {formatRelativeTime(o.updatedAt)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-8 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">{o.orderNumber}</span>
                          <button
                            type="button"
                            onClick={(e) => copyToClipboard(e, o.orderNumber, `${o.id}-invoice`)}
                            className="text-foreground/30 hover:text-foreground/60"
                            title="Copy invoice number"
                          >
                            {/* {copiedId === `${o.id}-invoice` ? "✓" : "⧉"} */}
                          </button>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-foreground/70">
                        <div className="flex items-center gap-1.5">
                          <span title="Customer">👤</span>
                          <span className="font-medium text-foreground">{o.customer.name}</span>
                          <button
                            type="button"
                            onClick={(e) => copyToClipboard(e, customerDetailsText(o), `${o.id}-customer`)}
                            className="text-foreground/30 hover:text-foreground/60"
                            title="Copy customer details"
                          >
                            {copiedId === `${o.id}-customer` ? "✓" : "⧉"}
                          </button>
                        </div>
                        <div
                          className="mt-1 flex items-center gap-2 text-xs text-foreground/50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a href={telHref(o.customer.phone)} className="text-blue-500 hover:text-blue-700" title="Call">
                            📞
                          </a>
                          <a
                            href={whatsappHref(o.customer.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-status-delivered hover:opacity-80"
                            title="WhatsApp"
                          >
                            💬
                          </a>
                          <span>{o.customer.phone}</span>
                          {o.customer.successRate !== null && (
                            <span
                              className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700"
                              title="Delivery success rate"
                            >
                              {o.customer.successRate}%
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-start gap-1 text-xs text-foreground/40">
                          <span>📍</span>
                          <span className="max-w-[180px] truncate" title={o.shippingAddress}>
                            {o.shippingAddress}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[160px] px-8 py-4 text-xs text-foreground/50">
                        {o.notes ? <span title={o.notes}>{o.notes}</span> : "—"}
                      </td>
                      <td
                        className="cursor-pointer px-8 py-4 text-foreground/60 hover:text-foreground"
                        onClick={() => setProductsModal(o)}
                      >
                        <div className="space-y-1.5">
                          {visibleItems.map((item) => (
                            <div key={item.id} className="flex items-start gap-2">
                              {item.product?.images[0]?.url ? (
                                <img
                                  src={item.product.images[0].url}
                                  alt={item.productName}
                                  className="h-7 w-7 shrink-0 rounded object-cover"
                                />
                              ) : (
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-black/5 text-xs text-foreground/30">
                                  —
                                </span>
                              )}
                              <div className="min-w-0">
                                <div className="truncate text-foreground">{item.productName}</div>
                                <div className="text-[11px]" style={{ color: "rgba(47, 111, 235, 0.8)" }}>
                                  {item.sku} · Qty: {item.quantity}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {o.items.length > 2 && (
                          <span className="mt-1 block text-xs font-medium text-primary">
                            +{hiddenCount} more products
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-4">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="px-8 py-4">
                        <Pill
                          tone={
                            o.paymentStatus === "PAID"
                              ? "primary"
                              : o.paymentStatus === "PARTIAL"
                                ? "warning"
                                : o.paymentStatus === "UNPAID"
                                  ? "danger"
                                  : "default"
                          }
                        >
                          {o.paymentStatus}
                        </Pill>
                      </td>
                      <td className="whitespace-nowrap px-8 py-4 text-right font-medium text-foreground">
                        {money(o.total)}
                      </td>
                      <td className="whitespace-nowrap px-8 py-4 text-foreground/60">
                        {o.createdBy?.name ?? "—"}
                      </td>
                      <td className="px-8 py-4 text-foreground/60">{o.source}</td>
                      <td className="px-8 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            onClick={() => router.push(`/orders/${o.id}`)}
                            className="text-primary hover:bg-primary/10"
                          >
                            View
                          </Button>
                          {CAN_CANCEL_FROM.has(o.status) && (
                            <Button
                              variant="ghost"
                              disabled={busyId === o.id}
                              onClick={(e) => cancelOrder(e, o)}
                              className="text-status-cancelled hover:bg-status-cancelled/10"
                            >
                              {busyId === o.id ? "Cancelling…" : "Cancel"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {productsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setProductsModal(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                Products - Invoice #{productsModal.orderNumber}
              </h3>
              <button
                type="button"
                onClick={() => setProductsModal(null)}
                className="text-foreground/40 hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {productsModal.items.map((item) => (
                <div key={item.id} className="flex gap-3 rounded-lg border border-black/10 p-3">
                  {item.product?.images[0]?.url ? (
                    <img
                      src={item.product.images[0].url}
                      alt={item.productName}
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-black/5 text-xs text-foreground/30">
                      —
                    </span>
                  )}
                  <div>
                    <div className="font-medium text-foreground">{item.productName}</div>
                    <div className="text-xs text-foreground/50">SKU: {item.sku}</div>
                    <div className="text-xs text-foreground/50">Quantity: {item.quantity}</div>
                    <div className="mt-1">
                      <StatusBadge status={productsModal.status} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

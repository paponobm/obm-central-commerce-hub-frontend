"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import type { OrderListItem, OrderStatus } from "@/lib/types";
import { formatAmount, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { isCompleteWebOrder } from "@/lib/web-orders";
import { useAuth } from "@/lib/auth-context";

type TabKey = "processing" | "incomplete" | "approved" | "cancelled" | "all";

const TAB_STORAGE_KEY = "web-orders-tab";
const SEARCH_STORAGE_KEY = "web-orders-search";

// An unfinished storefront checkout (phone entered, details missing). It has
// no order yet, so it is shown as a row in the same shape as an order.
interface CheckoutLead {
  id: string;
  channelId: string;
  phone: string;
  name: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
  total: number;
  items: {
    productId: string;
    productName: string;
    sku: string;
    image: string | null;
    quantity: number;
    unitPrice: number;
  }[];
}

type WebRow = OrderListItem & { isLead?: boolean };

function leadToRow(lead: CheckoutLead): WebRow {
  return {
    id: `lead-${lead.id}`,
    isLead: true,
    orderNumber: "Not ordered",
    channelId: lead.channelId,
    channel: null,
    source: "WEBSITE",
    status: "PENDING",
    paymentStatus: "UNPAID",
    shipmentStatus: "NOT_SHIPPED",
    customerResponse: "NO_RESPONSE",
    subtotal: String(lead.total),
    discount: "0",
    shippingFee: "0",
    total: String(lead.total),
    shippingName: lead.name ?? "",
    shippingPhone: lead.phone,
    shippingAddress: lead.address ?? "",
    notes: null,
    deliveryMethod: null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    createdBy: null,
    invoicePrinted: false,
    webApproved: false,
    customer: { id: "", name: lead.name ?? "", phone: lead.phone, successRate: null, orderCount: 0 },
    items: lead.items.map((i) => ({
      id: i.productId,
      productId: i.productId,
      productName: i.productName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: String(i.unitPrice),
      discount: "0",
      total: String(i.quantity * i.unitPrice),
      product: { images: i.image ? [{ url: i.image }] : [] },
    })),
  };
}

const APPROVED_STATUSES = new Set<OrderStatus>([
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "SHIPPED",
  "PARTIAL",
  "DELIVERED",
  "PENDING_RETURN",
  "RETURNED",
  "LOST",
]);

function matchesTab(o: WebRow, tab: TabKey): boolean {
  switch (tab) {
    // Checkout leads never become Processing: they have no order to approve.
    case "processing":
      return !o.isLead && o.status === "PENDING" && !o.webApproved && isCompleteWebOrder(o);
    case "incomplete":
      return o.isLead || (o.status === "PENDING" && !o.webApproved && !isCompleteWebOrder(o));
    case "approved":
      return o.webApproved || APPROVED_STATUSES.has(o.status);
    case "cancelled":
      return o.status === "CANCELLED";
    case "all":
      return true;
  }
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "processing", label: "Processing" },
  { key: "incomplete", label: "Incomplete" },
  { key: "approved", label: "Approved" },
  { key: "cancelled", label: "Cancel" },
  { key: "all", label: "All" },
];

export default function WebOrdersPage() {
  const [orders, setOrders] = useState<WebRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("processing");
  // Remembered per browser tab, so Back from an order's details returns to the
  // same tab and search rather than resetting to Processing.
  useEffect(() => {
    try {
      const savedTab = sessionStorage.getItem(TAB_STORAGE_KEY) as TabKey | null;
      if (savedTab && TABS.some((t) => t.key === savedTab)) setTab(savedTab);
      const savedSearch = sessionStorage.getItem(SEARCH_STORAGE_KEY);
      if (savedSearch) setSearch(savedSearch);
    } catch {
      // Storage unavailable (private mode or blocked): default to Processing.
    }
  }, []);
  // Row selection works on every tab, styled like the Order List checkboxes.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyCustomer(o: OrderListItem) {
    const text = `Name: ${o.shippingName || o.customer.name}\nPhone: ${o.shippingPhone || o.customer.phone}\nAddress: ${o.shippingAddress}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(o.id);
      setTimeout(() => setCopiedId((v) => (v === o.id ? null : v)), 1500);
    } catch {
      // Clipboard unavailable — nothing to recover, so skip the confirmation.
    }
  }

  // Wait for the signed-in user so the request carries a valid token on a
  // direct page load (before session restore, the token isn't set yet).
  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get<OrderListItem[]>("/admin/orders?source=WEBSITE"),
      api.get<CheckoutLead[]>("/admin/orders/checkout-leads"),
    ])
      .then(([orderRows, leads]) => setOrders([...orderRows, ...leads.map(leadToRow)]))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load web orders"));
  }, [user]);

  const counts = useMemo(() => {
    const result = {} as Record<TabKey, number>;
    for (const t of TABS) {
      result[t.key] = orders ? orders.filter((o) => matchesTab(o, t.key)).length : 0;
    }
    return result;
  }, [orders]);

  const visible = useMemo(() => {
    if (!orders) return null;
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => matchesTab(o, tab))
      .filter((o) =>
        !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.customer.name.toLowerCase().includes(q) ||
        o.customer.phone.toLowerCase().includes(q),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, tab, search]);

  return (
    <div>
      <PageHeader title="Web Orders" description="Orders placed on the online store, waiting to be approved." />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-black/5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              try {
                sessionStorage.setItem(TAB_STORAGE_KEY, t.key);
              } catch {
                // Storage unavailable: the tab still switches, it just won't be remembered.
              }
              setSelected(new Set());
            }}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-foreground/60 hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs text-foreground/50">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 w-72">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            try {
              sessionStorage.setItem(SEARCH_STORAGE_KEY, e.target.value);
            } catch {
              // Storage unavailable: search still works, it just won't be remembered.
            }
          }}
          placeholder="Search order #, customer, phone…"
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <Card>
        {selected.size > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-primary/5 px-4 py-2 text-sm">
            <span className="font-medium text-primary">{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} className="text-foreground/60 hover:text-foreground">
              Clear selection
            </button>
          </div>
        )}
        {error && <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{error}</p>}
        {!visible ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-foreground/50">No web orders in this tab.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="text-left font-semibold text-primary">
                  <th className="rounded-l-lg px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={visible.length > 0 && visible.every((o) => selected.has(o.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((o) => o.id)) : new Set())}
                      className="h-4 w-4 rounded border-black/20 accent-primary"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Created At</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Customer</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Note</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Order Items</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Success Rate</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Tags</th>
                  <th className="px-4 py-3 font-medium text-right" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Total</th>
                  <th className="rounded-r-lg px-4 py-3 font-medium text-right" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o.id} className="border-b border-black/10 align-middle last:border-0 hover:bg-primary/[0.03]">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${o.orderNumber}`}
                        className="h-4 w-4 rounded border-black/20 accent-primary"
                        checked={selected.has(o.id)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(o.id);
                            else next.delete(o.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="text-foreground/70">{formatDateTime(o.createdAt)}</div>
                      <div className="text-xs text-foreground/40">{o.isLead ? "Checkout not completed" : o.orderNumber}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">{o.shippingName || o.customer.name}</span>
                        <button
                          type="button"
                          onClick={() => copyCustomer(o)}
                          className="text-foreground/30 hover:text-foreground/60"
                          title="Copy customer details"
                        >
                          {copiedId === o.id ? "✓" : "⧉"}
                        </button>
                      </div>
                      <div className="text-xs text-foreground/50">{o.shippingPhone || o.customer.phone}</div>
                      <div className="max-w-[200px] truncate text-xs text-foreground/40">{o.shippingAddress}</div>
                      {!isCompleteWebOrder(o) && <div className="mt-1 text-xs text-red-600">Details missing</div>}
                    </td>
                    <td className="max-w-[160px] px-4 py-4 text-xs text-foreground/50">{o.notes ?? "—"}</td>
                    <td className="px-4 py-4">
                      <div className="space-y-2">
                        {o.items.map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            {item.product?.images[0]?.url ? (
                              // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
                              <img src={item.product.images[0].url} alt={item.productName} className="h-8 w-8 shrink-0 rounded object-cover" />
                            ) : (
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-black/5 text-xs text-foreground/30">—</span>
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-foreground">{item.productName}</div>
                              <div className="text-xs text-foreground/50">
                                {item.quantity} × {formatAmount(item.unitPrice)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {o.customer.successRate !== null ? (
                        <span className="font-semibold text-status-delivered">{o.customer.successRate}%</span>
                      ) : (
                        <span className="text-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {o.customer.orderCount > 1 && (
                        <span className="inline-block rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                          REPEAT
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-medium">{formatAmount(o.total)}</td>
                    <td className="px-4 py-4 text-right">
                      <Link href={`/web-orders/${o.id}`} className="inline-block rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

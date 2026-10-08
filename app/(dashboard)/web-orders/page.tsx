"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { CustomerResponseStatus, OrderListItem } from "@/lib/types";
import { telHref, whatsappHref } from "@/lib/phone";
import { formatAmount, formatRelativeTime } from "@/lib/format";

function listDate(value: string): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hour = d.getHours() % 12 || 12;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()},\n${hour}:${pad(d.getMinutes())} ${d.getHours() < 12 ? "am" : "pm"}`;
}
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { isCompleteWebOrder, webOrderStage } from "@/lib/web-orders";
import { useAuth } from "@/lib/auth-context";

type TabKey =
  | "processing"
  | "incomplete"
  | "goodNoResponse"
  | "noResponse"
  | "advancePayment"
  | "onHold"
  | "approved"
  | "cancelled"
  | "all";


// An unfinished storefront checkout (phone entered, details missing). It has
// no order yet, so it is shown as a row in the same shape as an order.
interface CheckoutLead {
  id: string;
  channelId: string;
  customerResponse: CustomerResponseStatus | null;
  cancelled: boolean;
  lastUpdate: { at: string; by: string | null };
  phone: string;
  name: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
  adminNotes: { id: string; note: string; createdAt: string; user: { name: string } | null }[];
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

type WebRow = OrderListItem & { isLead?: boolean; hasResponse?: boolean; leadCancelled?: boolean };

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
    customerResponse: lead.customerResponse ?? "NO_RESPONSE",
    hasResponse: lead.customerResponse !== null,
    leadCancelled: lead.cancelled,
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
    adminNotes: lead.adminNotes,
    lastUpdate: lead.lastUpdate,
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

function matchesTab(o: WebRow, tab: TabKey): boolean {
  if (tab === "all") return true;
  return webOrderStage(o) === tab;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "processing", label: "Processing" },
  { key: "incomplete", label: "Incomplete" },
  { key: "goodNoResponse", label: "Good But No Response" },
  { key: "noResponse", label: "No Response" },
  { key: "advancePayment", label: "Advance Payment" },
  { key: "onHold", label: "On Hold" },
  { key: "approved", label: "Approved" },
  { key: "cancelled", label: "Cancel" },
  { key: "all", label: "All" },
];

export default function WebOrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [orders, setOrders] = useState<WebRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("processing");
  // Row selection works on every tab, styled like the Order List checkboxes.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const { user } = useAuth();

  // Tab and search live in the URL, not sessionStorage — a fresh visit (the
  // sidebar link, etc.) always points at the plain /web-orders URL, so it
  // defaults to Processing. Only Back/Forward restores a different tab,
  // because that's the browser returning to the exact prior URL on its own.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get("tab") as TabKey | null;
    if (urlTab && TABS.some((t) => t.key === urlTab)) setTab(urlTab);
    const urlSearch = params.get("q");
    if (urlSearch) setSearch(urlSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once on mount only
  }, []);

  function updateUrl(nextTab: TabKey, nextSearch: string) {
    const params = new URLSearchParams();
    if (nextTab !== "processing") params.set("tab", nextTab);
    if (nextSearch) params.set("q", nextSearch);
    const qs = params.toString();
    // replace, not push — switching tabs shouldn't pile up Back-stops; the
    // single Web Orders history entry just reflects wherever you last were.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function selectTab(key: TabKey) {
    setTab(key);
    setSelected(new Set());
    updateUrl(key, search);
  }

  function updateSearch(value: string) {
    setSearch(value);
    updateUrl(tab, value);
  }
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

    let cancelled = false;
    function load() {
      Promise.all([
        api.get<OrderListItem[]>("/admin/orders?source=WEBSITE&includeWebUnapproved=true"),
        api.get<CheckoutLead[]>("/admin/orders/checkout-leads"),
      ])
        .then(([orderRows, leads]) => {
          if (!cancelled) setOrders([...orderRows, ...leads.map(leadToRow)]);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load web orders");
        });
    }

    load();
    // No push channel from the backend (REST only), so a short poll stands
    // in for real-time: a new storefront order shows up here within one
    // interval, no manual refresh needed. Paused while the tab is hidden so
    // it doesn't keep hitting the API when nobody's looking at the page.
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
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
            onClick={() => selectTab(t.key)}
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
          onChange={(e) => updateSearch(e.target.value)}
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
                      <div className="whitespace-pre-line text-foreground/70">{listDate(o.createdAt)}</div>
                      <div className="text-xs text-foreground/40">{o.isLead ? "Checkout not completed" : o.orderNumber}</div>
                    </td>
                    <td className="px-4 py-4 text-foreground/70">
                      <div className="flex items-center gap-1.5">
                        <span className="opacity-70" title="Customer">👤</span>
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
                      <div className="mt-1 flex items-center gap-2 text-xs text-foreground">
                        <a href={telHref(o.shippingPhone || o.customer.phone)} className="text-blue-500 hover:text-blue-700" title="Call">
                          📞
                        </a>
                        <a
                          href={whatsappHref(o.shippingPhone || o.customer.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-status-delivered hover:opacity-80"
                          title="WhatsApp"
                        >
                          💬
                        </a>
                        <span>{o.shippingPhone || o.customer.phone}</span>
                      </div>
                      <div className="mt-1 flex items-start gap-1 text-xs text-foreground">
                        <span className="opacity-70">📍</span>
                        <span className="max-w-[180px] truncate" title={o.shippingAddress}>
                          {o.shippingAddress}
                        </span>
                      </div>
                      {!isCompleteWebOrder(o) && <div className="mt-1 text-xs text-red-600">Details missing</div>}
                    </td>
                    <td className="max-w-[220px] px-4 py-4 text-xs text-foreground">
                      <div className="text-foreground/50">
                        Updated {formatRelativeTime(o.lastUpdate.at)}
                        {o.lastUpdate.by ? ` · ${o.lastUpdate.by}` : ""}
                      </div>
                      {o.notes && <div className="mt-1">{o.notes}</div>}
                      {o.adminNotes.map((n) => (
                        <div key={n.id} className="mt-1">
                          <span className="font-medium text-foreground/60">{n.user?.name ?? "Unknown"}:</span> {n.note}
                        </div>
                      ))}
                    </td>
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

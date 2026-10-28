"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { Customer, OrderListItem, OrderSource } from "@/lib/types";
import { formatAmount, formatRelativeTime } from "@/lib/format";
import { telHref } from "@/lib/phone";
import { isCompleteWebOrder } from "@/lib/web-orders";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { LoadingLine } from "@/components/ui/spinner";

// Same plain outline icons the Orders/Web Orders tables use for the
// Customer cell — duplicated locally since this app has no icon library
// and every list page defines its own copy the same way.
function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 4h4l2 5-2.5 2.5a11 11 0 0 0 5 5L16 14l5 2v4a2 2 0 0 1-2 2 16 16 0 0 1-14-14 2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 21s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

// Same palette as the Orders list's Source badge.
const SOURCE_STYLE: Record<OrderSource, string> = {
  WEBSITE: "bg-indigo-100 text-indigo-700",
  MANUAL: "bg-violet-100 text-violet-700",
  FACEBOOK: "bg-blue-100 text-blue-700",
  PHONE: "bg-emerald-100 text-emerald-700",
  WHATSAPP: "bg-green-100 text-green-700",
  OTHER: "bg-amber-100 text-amber-700",
  UNKNOWN: "bg-gray-200 text-gray-600",
};

// Order list date format: 04/10/2026,\n12:48 pm
function listDate(value: string): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hour = d.getHours() % 12 || 12;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()},\n${hour}:${pad(d.getMinutes())} ${d.getHours() < 12 ? "am" : "pm"}`;
}

function listUpdated(value: string): string {
  const minutes = (Date.now() - new Date(value).getTime()) / 60000;
  return minutes < 1 ? "less than a minute ago" : formatRelativeTime(value);
}

// Full checkout-lead shape — the backend already returns all of this (see
// web-orders/page.tsx's own CheckoutLead), just typed locally here too.
interface LeadResult {
  id: string;
  channelId: string;
  phone: string;
  name: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
  total: number;
  lastUpdate: { at: string; by: string | null };
  adminNotes: { id: string; note: string; createdAt: string; user: { name: string } | null }[];
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

function leadToRow(lead: LeadResult, channels: { id: string; name: string }[] | null): WebRow {
  return {
    id: `lead-${lead.id}`,
    isLead: true,
    orderNumber: "Not ordered",
    channelId: lead.channelId,
    channel: channels?.find((c) => c.id === lead.channelId) ? { id: lead.channelId, name: channels.find((c) => c.id === lead.channelId)!.name, slug: "" } : null,
    source: "WEBSITE",
    status: "PENDING",
    paymentStatus: "UNPAID",
    shipmentStatus: "NOT_SHIPPED",
    customerResponse: null,
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
    shipment: null,
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
      product: { thumbnailUrl: i.image ?? null, images: i.image ? [{ url: i.image }] : [] },
    })),
  };
}

// Same column set and header styling as the main Orders list table — this
// is a read-only preview (no bulk-select, no status-mutating menu, since
// those need the list page's own state machine), but every data column
// from that table is here so a result can be read without leaving Search.
function OrdersTable({ orders }: { orders: OrderListItem[] }) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyToClipboard(e: React.MouseEvent, text: string, key: string) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId((v) => (v === key ? null : v)), 1500);
    } catch {
      // No clipboard permission — nothing meaningful to recover into.
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1700px] text-base">
        <thead>
          <tr className="text-left text-base font-semibold text-primary">
            <th className="rounded-l-lg px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Date</th>
            <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Invoice</th>
            <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Store</th>
            <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Customer</th>
            <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Shipping Note</th>
            <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Products</th>
            <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Tags</th>
            <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Status Tags</th>
            <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Print</th>
            <th className="px-4 py-3 text-right font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Total</th>
            <th className="px-4 py-3 text-center font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Courier</th>
            <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>User</th>
            <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Source</th>
            <th className="rounded-r-lg px-4 py-3 text-right font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const visibleItems = o.items.slice(0, 3);
            const hiddenCount = o.items.length - visibleItems.length;
            return (
              <tr
                key={o.id}
                className="cursor-pointer border-b border-black/10 align-middle last:border-0 hover:bg-primary/[0.03]"
                onClick={() => router.push(`/orders/${o.id}`)}
              >
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="whitespace-pre-line font-medium text-foreground/70">{listDate(o.createdAt)}</div>
                  <div className="text-sm text-foreground/40">Updated {listUpdated(o.updatedAt)}</div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-medium text-foreground">{o.orderNumber}</td>
                <td className="px-4 py-4 text-foreground/70">{o.channel?.name ?? "—"}</td>
                <td className="px-4 py-4 text-foreground/70">
                  <div className="flex items-center gap-1.5">
                    <span title="Customer"><UserIcon className="h-4.5 w-4 text-foreground" /></span>
                    <span className="text-foreground">{o.customer.name}</span>
                    <button
                      type="button"
                      onClick={(e) => copyToClipboard(e, `Name: ${o.customer.name}\nPhone: ${o.customer.phone}\nAddress: ${o.shippingAddress}`, `${o.id}-customer`)}
                      className="text-foreground/30 hover:text-foreground/60"
                      title="Copy customer details"
                    >
                      {copiedId === `${o.id}-customer` ? "✓" : "⧉"}
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-foreground" onClick={(e) => e.stopPropagation()}>
                    <a href={telHref(o.customer.phone)} className="opacity-70 hover:opacity-100" title="Call">
                      <PhoneIcon className="h-4.5 w-4" />
                    </a>
                    <span>{o.customer.phone}</span>
                    {o.customer.successRate !== null && (
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-sm font-semibold text-green-700" title="Delivery success rate">
                        {o.customer.successRate}%
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-start gap-1 text-foreground">
                    <span className="opacity-70"><PinIcon className="h-4.5 w-4" /></span>
                    <span className="max-w-[180px] truncate" title={o.shippingAddress}>{o.shippingAddress}</span>
                  </div>
                </td>
                <td className="max-w-[160px] px-4 py-4 text-foreground">{o.notes ? <span title={o.notes}>{o.notes}</span> : "—"}</td>
                <td className="px-4 py-4 text-foreground/60">
                  <div className="mb-2"><StatusBadge status={o.status} compact /></div>
                  <div className="space-y-1.5">
                    {visibleItems.map((item) => {
                      const thumb = item.product?.thumbnailUrl ?? item.product?.images[0]?.url;
                      return (
                        <div key={item.id} className="flex items-start gap-2">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
                            <img src={thumb} alt={item.productName} className="h-7 w-7 shrink-0 rounded object-cover" />
                          ) : (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-black/5 text-sm text-foreground/30">—</span>
                          )}
                          <div className="min-w-0 max-w-[160px]">
                            <div className="truncate text-foreground" title={item.productName}>{item.productName}</div>
                            <div className="text-sm" style={{ color: "rgba(47, 111, 235, 0.8)" }}>{item.sku} · Qty: {item.quantity}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {o.items.length > 3 && (
                    <span className="mt-1 block text-sm font-medium text-primary">+{hiddenCount} more products</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  {o.customer.orderCount > 1 && (
                    <span className="inline-block rounded-md bg-sky-100 px-2 py-0.5 text-sm font-semibold text-sky-700">REPEAT({o.customer.orderCount})</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  {Number(o.discount) > 0 && (
                    <span className="inline-flex items-start gap-1.5 rounded-2xl border border-sky-200 bg-sky-100 px-2.5 py-1.5 text-sm leading-snug text-sky-700">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span className="flex flex-col">
                        <span>Employee</span>
                        <span>Discount</span>
                        <span>Order · {formatAmount(o.discount)}</span>
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 text-center text-xl font-bold">
                  {o.invoicePrinted ? (
                    <span className="text-status-delivered" title="Invoice printed">✓</span>
                  ) : (
                    <span className="text-status-cancelled" title="Not printed">✕</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-foreground">{formatAmount(o.total)}</td>
                <td className="px-4 py-4 text-center">
                  {o.shipment?.externalConsignmentId ? (
                    <div className="flex flex-col items-center gap-0.5 text-sm">
                      <span className="flex items-center gap-1 font-bold">
                        <span className="text-status-delivered" title="Entered to Steadfast">✓</span>
                        <span className="text-foreground">{o.shipment.externalConsignmentId}</span>
                      </span>
                    </div>
                  ) : (
                    <span className="text-base font-bold text-status-cancelled" title="Not entered to Steadfast">✕</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-foreground/60">{o.createdBy?.name ?? "—"}</td>
                <td className="px-4 py-4">
                  <span className={`inline-block rounded-full px-2.5 py-1 text-sm font-medium ${SOURCE_STYLE[o.source]}`}>
                    {o.source.charAt(0) + o.source.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    href={`/orders/${o.id}/edit`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-block rounded-lg border border-black/10 px-3 py-1.5 text-base font-medium text-primary hover:bg-primary/5"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Same column set and header styling as the Web Orders list table —
// pending web orders and incomplete-checkout leads share one row shape
// here exactly like that page's own WebRow/leadToRow.
function WebOrdersTable({ rows }: { rows: WebRow[] }) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyCustomer(e: React.MouseEvent, o: WebRow) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`Name: ${o.shippingName || o.customer.name}\nPhone: ${o.shippingPhone || o.customer.phone}\nAddress: ${o.shippingAddress}`);
      setCopiedId(o.id);
      setTimeout(() => setCopiedId((v) => (v === o.id ? null : v)), 1500);
    } catch {
      // No clipboard permission — nothing meaningful to recover into.
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-base">
        <thead>
          <tr className="text-left font-semibold text-primary">
            <th className="rounded-l-lg px-4 py-3 font-bold" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Created At</th>
            <th className="px-4 py-3 font-bold" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Store</th>
            <th className="px-4 py-3 font-bold" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Customer</th>
            <th className="px-4 py-3 font-bold" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Note</th>
            <th className="px-4 py-3 font-bold" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Order Items</th>
            <th className="px-4 py-3 font-bold" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Success Rate</th>
            <th className="px-4 py-3 font-bold" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Tags</th>
            <th className="px-4 py-3 text-right font-bold" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Total</th>
            <th className="rounded-r-lg px-4 py-3 text-right font-bold" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr
              key={o.id}
              className="cursor-pointer border-b border-black/10 align-middle last:border-0 hover:bg-primary/[0.03]"
              onClick={() => router.push(`/web-orders/${o.id}`)}
            >
              <td className="whitespace-nowrap px-4 py-4">
                <div className="whitespace-pre-line font-medium text-foreground/70">{listDate(o.createdAt)}</div>
                <div className="text-sm text-foreground/40">{o.isLead ? "Checkout not completed" : o.orderNumber}</div>
              </td>
              <td className="px-4 py-4 text-foreground/70">{o.channel?.name ?? "—"}</td>
              <td className="px-4 py-4 text-foreground/70">
                <div className="flex items-center gap-1.5">
                  <span title="Customer"><UserIcon className="h-4.5 w-4 text-foreground" /></span>
                  <span className="font-medium text-foreground">{o.shippingName || o.customer.name}</span>
                  <button type="button" onClick={(e) => copyCustomer(e, o)} className="text-foreground/30 hover:text-foreground/60" title="Copy customer details">
                    {copiedId === o.id ? "✓" : "⧉"}
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-foreground" onClick={(e) => e.stopPropagation()}>
                  <a href={telHref(o.shippingPhone || o.customer.phone)} className="opacity-70 hover:opacity-100" title="Call">
                    <PhoneIcon className="h-4.5 w-4" />
                  </a>
                  <span>{o.shippingPhone || o.customer.phone}</span>
                </div>
                <div className="mt-1 flex items-start gap-1 text-foreground">
                  <span className="opacity-70"><PinIcon className="h-4.5 w-4" /></span>
                  <span className="max-w-[180px] truncate" title={o.shippingAddress}>{o.shippingAddress}</span>
                </div>
                {!isCompleteWebOrder(o) && <div className="mt-1 text-sm text-red-600">Details missing</div>}
              </td>
              <td className="max-w-[220px] px-4 py-4 text-sm text-foreground">
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
                  {o.items.map((item) => {
                    const thumb = item.product?.thumbnailUrl ?? item.product?.images[0]?.url;
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
                          <img src={thumb} alt={item.productName} className="h-8 w-8 shrink-0 rounded object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-black/5 text-sm text-foreground/30">—</span>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-foreground">{item.productName}</div>
                          <div className="text-sm text-foreground/50">{item.quantity} × {formatAmount(item.unitPrice)}</div>
                        </div>
                      </div>
                    );
                  })}
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
                  <span className="inline-block rounded-md bg-sky-100 px-2 py-0.5 text-sm font-semibold text-sky-700">REPEAT</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-right font-medium">{formatAmount(o.total)}</td>
              <td className="px-4 py-4 text-right">
                <Link
                  href={`/web-orders/${o.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-block rounded-lg border border-black/10 px-3 py-1.5 text-base font-medium text-primary hover:bg-primary/5"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One search box over three already-existing search endpoints (Orders,
// checkout leads, Customers) — no new backend search logic, just fanned
// out and bucketed the same way the rest of the app already separates
// "real" orders from the Web Orders funnel.
export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { channels } = useChannelScope();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [leads, setLeads] = useState<LeadResult[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();

    // Keeps the URL shareable/bookmarkable without adding a history entry
    // per keystroke.
    const params = new URLSearchParams(window.location.search);
    if (q) params.set("q", q);
    else params.delete("q");
    const nextUrl = `/search${params.toString() ? `?${params}` : ""}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
      router.replace(nextUrl, { scroll: false });
    }

    if (!q) {
      setOrders(null);
      setLeads([]);
      setCustomers([]);
      setError(null);
      return;
    }

    // Search spans every store the user can see, regardless of which store
    // is currently active in the topbar — scoping it to the active store
    // hid orders/customers that live in a different store than whatever
    // happened to be selected, which is exactly what this page exists to
    // find.
    let cancelled = false;
    const timer = setTimeout(() => {
      setError(null);
      Promise.all([
        api.get<OrderListItem[]>(
          `/admin/orders?search=${encodeURIComponent(q)}&includeWebUnapproved=true`,
        ),
        api.get<LeadResult[]>("/admin/orders/checkout-leads"),
        api.get<Customer[]>(`/admin/customers?search=${encodeURIComponent(q)}`),
      ])
        .then(([orderRows, leadRows, customerRows]) => {
          if (cancelled) return;
          const needle = q.toLowerCase();
          setOrders(orderRows);
          setLeads(
            leadRows.filter(
              (l) => (l.name ?? "").toLowerCase().includes(needle) || l.phone.toLowerCase().includes(needle),
            ),
          );
          setCustomers(customerRows);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Search failed");
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const hasQuery = query.trim().length > 0;
  // "Approved" is the same rule the rest of the app uses to decide an order
  // has left the Web Orders queue (see Order Report / webOrderStage).
  const realOrders = (orders ?? []).filter((o) => o.webApproved || o.source !== "WEBSITE");
  const pendingWebOrders: WebRow[] = (orders ?? []).filter((o) => !o.webApproved && o.source === "WEBSITE");
  const webRows: WebRow[] = [...pendingWebOrders, ...leads.map((l) => leadToRow(l, channels))];

  return (
    <div>
      <PageHeader title="Search" description="Search orders, web orders, and customers." />

      <Card className="mb-6">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by order #, phone, or customer name…"
          className="w-full !text-base"
        />
      </Card>

      {error && (
        <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">{error}</p>
      )}

      {!hasQuery ? (
        <p className="text-base text-foreground/50">Type to search across orders, web orders, and customers.</p>
      ) : orders === null ? (
        <LoadingLine />
      ) : (
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-base font-semibold text-foreground">Orders · {realOrders.length} found</h2>
            {realOrders.length === 0 ? (
              <p className="text-sm text-foreground/50">No orders matched “{query}”.</p>
            ) : (
              <OrdersTable orders={realOrders} />
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold text-foreground">Web Orders · {webRows.length} found</h2>
            {webRows.length === 0 ? (
              <p className="text-sm text-foreground/50">No web orders matched “{query}”.</p>
            ) : (
              <WebOrdersTable rows={webRows} />
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold text-foreground">Customers · {customers.length} found</h2>
            {customers.length === 0 ? (
              <p className="text-sm text-foreground/50">No customers matched “{query}”.</p>
            ) : (
              <div className="divide-y divide-black/5">
                {customers.map((c) => (
                  <Link
                    key={c.id}
                    href={`/customers/${c.id}`}
                    className="flex items-center justify-between gap-4 py-2.5 hover:bg-black/5"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{c.name}</div>
                      <div className="truncate text-sm text-foreground/50">{c.phone}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { CustomerResponseStatus, OrderListItem, OrderStatus, PaymentStatus } from "@/lib/types";
import { webOrderStage, WEB_STAGE_LABELS, type WebStage } from "@/lib/web-orders";
import { Card } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/donut-chart";

// Just the checkout-lead fields this card needs to place a lead on a stage
// (see /admin/orders/checkout-leads).
interface LeadRow {
  channelId: string;
  name: string | null;
  address: string | null;
  phone: string;
  customerResponse: CustomerResponseStatus | null;
  cancelled: boolean;
  items: unknown[];
  createdAt: string;
}

// A combined, minimal shape covering both real orders and leads — just
// what webOrderStage() needs to place a row on a stage, plus createdAt for
// the date-range control.
interface WebOrderRow {
  isLead: boolean;
  status: OrderStatus;
  webApproved: boolean;
  customerResponse: CustomerResponseStatus | null;
  paymentStatus: PaymentStatus;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  items: unknown[];
  hasResponse: boolean;
  leadCancelled: boolean;
  createdAt: string;
}

type Tab = "web" | "incomplete";
const TABS: { key: Tab; label: string }[] = [
  { key: "web", label: "Web Orders" },
  { key: "incomplete", label: "Incomplete Orders" },
];

type DateRange = "today" | "7d" | "30d" | "all";
const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

function rangeCutoff(range: DateRange): Date | null {
  const now = new Date();
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (range === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

// Same stage order used throughout Web Orders, minus Incomplete — that one
// gets its own breakdown below instead of a single slice here.
const WEB_STAGES: WebStage[] = [
  "processing",
  "goodNoResponse",
  "noResponse",
  "advancePayment",
  "onHold",
  "approved",
  "cancelled",
];

// Picked in this priority so an incomplete row counts toward exactly one
// reason, not several — a part-to-whole chart needs that.
function missingReason(o: { shippingName: string; shippingPhone: string; shippingAddress: string; items: unknown[] }): string {
  if (!o.shippingName?.trim()) return "Missing name";
  if (!o.shippingPhone?.trim()) return "Missing phone";
  if (!o.shippingAddress?.trim()) return "Missing address";
  if (o.items.length === 0) return "No products";
  return "Other";
}

// A specific store's web-order funnel: live orders plus leads scoped to that
// store's channel, so it stays accurate even for an "all stores" admin.
export function WebOrderReport({ channelId }: { channelId: string }) {
  const [rows, setRows] = useState<WebOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("web");
  const [range, setRange] = useState<DateRange>("today");
  const [rangeOpen, setRangeOpen] = useState(false);
  const rangeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rangeRef.current && !rangeRef.current.contains(e.target as Node)) setRangeOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    setRows(null);
    setError(null);
    Promise.all([
      api.get<OrderListItem[]>(`/admin/orders?source=WEBSITE&includeWebUnapproved=true&channelId=${channelId}`),
      api.get<LeadRow[]>("/admin/orders/checkout-leads"),
    ])
      .then(([orders, leads]) => {
        const orderRows: WebOrderRow[] = orders.map((o) => ({
          isLead: false,
          status: o.status,
          webApproved: o.webApproved,
          customerResponse: o.customerResponse,
          paymentStatus: o.paymentStatus,
          shippingName: o.shippingName,
          shippingPhone: o.shippingPhone,
          shippingAddress: o.shippingAddress,
          items: o.items,
          hasResponse: true,
          leadCancelled: false,
          createdAt: o.createdAt,
        }));
        // checkout-leads has no channelId filter of its own (see its
        // service method), so this store's leads are picked out here.
        const leadRows = leads
          .filter((l) => l.channelId === channelId)
          .map((l): WebOrderRow => ({
            isLead: true,
            status: "PENDING",
            webApproved: false,
            customerResponse: l.customerResponse,
            paymentStatus: "UNPAID",
            shippingName: l.name ?? "",
            shippingPhone: l.phone,
            shippingAddress: l.address ?? "",
            items: l.items,
            hasResponse: l.customerResponse !== null,
            leadCancelled: l.cancelled,
            createdAt: l.createdAt,
          }));
        setRows([...orderRows, ...leadRows]);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load the web order report"));
  }, [channelId]);

  const rangedRows = useMemo(() => {
    if (!rows) return null;
    const cutoff = rangeCutoff(range);
    return cutoff ? rows.filter((r) => new Date(r.createdAt) >= cutoff) : rows;
  }, [rows, range]);

  const stages = useMemo(() => (rangedRows ?? []).map((r) => webOrderStage(r)), [rangedRows]);

  const webSegments = useMemo(
    () =>
      WEB_STAGES.map((stage) => ({
        label: WEB_STAGE_LABELS[stage],
        value: stages.filter((s) => s === stage).length,
      })),
    [stages],
  );

  const incompleteSegments = useMemo(() => {
    if (!rangedRows) return [];
    const reasons = new Map<string, number>();
    rangedRows.forEach((row, i) => {
      if (stages[i] !== "incomplete") return;
      const reason = missingReason(row);
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    });
    return Array.from(reasons.entries()).map(([label, value]) => ({ label, value }));
  }, [rangedRows, stages]);

  const segments = tab === "web" ? webSegments : incompleteSegments;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const rangeLabel = DATE_RANGES.find((r) => r.key === range)!.label;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Web Order Report</h2>
        <div ref={rangeRef} className="relative">
          <button
            type="button"
            onClick={() => setRangeOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
          >
            📅 {rangeLabel}
            <span aria-hidden>▾</span>
          </button>
          {rangeOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-black/10 bg-card py-1 shadow-card">
              {DATE_RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => {
                    setRange(r.key);
                    setRangeOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-black/5 ${
                    r.key === range ? "font-medium text-primary" : "text-foreground/70"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Underline tabs, same pattern as the Web Orders page's own tabs —
          kept in the app's primary blue rather than copying the reference's
          purple, to stay consistent with every other tab in this app. */}
      <div className="mb-4 flex gap-4 border-b border-black/5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-foreground/60 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-status-cancelled">{error}</p>
      ) : !rangedRows ? (
        <p className="text-sm text-foreground/60">Loading…</p>
      ) : (
        <DonutChart segments={segments} caption={`Total Orders: ${total}`} />
      )}
    </Card>
  );
}

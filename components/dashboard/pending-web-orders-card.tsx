"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { CustomerResponseStatus, OrderListItem, OrderStatus, PaymentStatus } from "@/lib/types";
import { webOrderStage, WEB_STAGE_LABELS, type WebStage } from "@/lib/web-orders";
import { statRangeBounds, type StatRange } from "@/lib/stat-date-range";
import { Card } from "@/components/ui/card";
import { StatDateRangeSelect } from "@/components/ui/stat-date-range-select";
import { LoadingLine } from "@/components/ui/spinner";

// Same checkout-lead shape WebOrderReport fetches (see
// /admin/orders/checkout-leads).
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

// Every web stage except the two that mean "done" — approved (left the
// queue, now a real order) or cancelled. Order here is also the display
// order in the hover breakdown.
const PENDING_STAGES: WebStage[] = [
  "processing",
  "incomplete",
  "goodNoResponse",
  "noResponse",
  "advancePayment",
  "onHold",
];

// Total count of web orders/leads still waiting on a decision (not yet
// approved or cancelled), with a hover breakdown by status. channelId
// omitted means every store the current user can access, same scoping
// rule every other report card uses.
export function PendingWebOrdersCard({ channelId }: { channelId?: string }) {
  const [rows, setRows] = useState<WebOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<StatRange>("today");
  const [customFrom, setCustomFrom] = useState<string | undefined>();
  const [customTo, setCustomTo] = useState<string | undefined>();

  function handleRangeChange(next: StatRange, nextFrom?: string, nextTo?: string) {
    setRange(next);
    setCustomFrom(nextFrom);
    setCustomTo(nextTo);
  }

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const qs = channelId ? `&channelId=${channelId}` : "";
    Promise.all([
      api.get<OrderListItem[]>(`/admin/orders?source=WEBSITE&includeWebUnapproved=true${qs}`),
      api.get<LeadRow[]>("/admin/orders/checkout-leads"),
    ])
      .then(([orders, leads]) => {
        if (cancelled) return;
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
        // checkout-leads always returns every lead across the user's
        // accessible channels (no channelId filter of its own) — narrowed
        // to one store here only when a specific store is active.
        const leadRows: WebOrderRow[] = leads
          .filter((l) => !channelId || l.channelId === channelId)
          .map((l) => ({
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
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load pending web orders");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const rangedRows = useMemo(() => {
    if (!rows) return null;
    const { from, to } = statRangeBounds(range, customFrom, customTo);
    const gte = new Date(`${from}T00:00:00`).getTime();
    const lte = new Date(`${to}T23:59:59.999`).getTime();
    return rows.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return t >= gte && t <= lte;
    });
  }, [rows, range, customFrom, customTo]);

  const breakdown = useMemo(() => {
    if (!rangedRows) return [];
    const counts = new Map<WebStage, number>();
    for (const row of rangedRows) {
      const stage = webOrderStage(row);
      if (stage && PENDING_STAGES.includes(stage)) {
        counts.set(stage, (counts.get(stage) ?? 0) + 1);
      }
    }
    return PENDING_STAGES.map((stage) => ({
      stage,
      label: WEB_STAGE_LABELS[stage],
      count: counts.get(stage) ?? 0,
    })).filter((s) => s.count > 0);
  }, [rangedRows]);

  const total = breakdown.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-foreground/60">Pending Web Orders</div>
        <StatDateRangeSelect value={range} customFrom={customFrom} customTo={customTo} onChange={handleRangeChange} />
      </div>
      {error ? (
        <p className="mt-2 text-sm text-status-cancelled">{error}</p>
      ) : !rangedRows ? (
        <LoadingLine />
      ) : (
        <div className="group relative mt-2 inline-block">
          <div className="text-2xl font-semibold text-foreground">{total}</div>
          {breakdown.length > 0 && (
            <div className="invisible absolute left-0 top-full z-20 mt-2 w-56 rounded-lg border border-black/10 bg-card p-3 opacity-0 shadow-card transition-opacity group-hover:visible group-hover:opacity-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-foreground/50">
                    <th className="pb-1.5 font-medium">Status</th>
                    <th className="pb-1.5 text-right font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((s) => (
                    <tr key={s.stage} className="border-t border-black/5">
                      <td className="py-1 text-foreground/80">{s.label}</td>
                      <td className="py-1 text-right font-semibold text-foreground">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

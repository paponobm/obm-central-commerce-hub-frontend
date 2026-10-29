"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { OrderListItem, OrderStatus } from "@/lib/types";
import { nextPathInPipeline, pathToReturned } from "@/lib/order-pipeline";
import { formatAmount } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ScanMode = "rts" | "shipping" | "return";

const MODES: { key: ScanMode; label: string; hint: string }[] = [
  { key: "rts", label: "Scan for RTS", hint: "Packed and ready — moves Pending → RTS" },
  { key: "shipping", label: "Scan for Shipping", hint: "Handed to courier — moves RTS → Shipped" },
  { key: "return", label: "Scan to Return", hint: "Parcel physically back — moves to Returned" },
];

const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  READY_TO_SHIP: "RTS",
  SHIPPED: "Shipped",
  PARTIAL: "Partial",
  DELIVERED: "Delivered",
  PENDING_RETURN: "Pending Return",
  RETURNED: "Returned",
};

// What each mode is willing to act on, and the exact steps to walk to get
// there — reusing the same pipeline helpers the Orders list's own bulk
// "Move to Next Status" action uses, so a scan can never do anything that
// action couldn't also do.
function pathForMode(mode: ScanMode, status: OrderStatus): OrderStatus[] | null {
  if (mode === "rts") {
    const path = nextPathInPipeline(status);
    return path && path.at(-1) === "READY_TO_SHIP" ? path : null;
  }
  if (mode === "shipping") {
    return status === "READY_TO_SHIP" ? ["SHIPPED"] : null;
  }
  return pathToReturned(status);
}

interface ScanLogEntry {
  id: string;
  at: string;
  mode: ScanMode;
  query: string;
  ok: boolean;
  message: string;
}

const MODE_TO_BACKEND: Record<ScanMode, "RTS" | "SHIPPING" | "RETURN"> = {
  rts: "RTS",
  shipping: "SHIPPING",
  return: "RETURN",
};

// Posted after every attempt, success or failure, for the Scan History
// page — fire-and-forget, same as the Orders list's own print-log call:
// this is an audit trail, so a logging hiccup must never block or surface
// as a failure on the scan the operator actually cares about.
function logScanEvent(entry: {
  mode: ScanMode;
  query: string;
  order?: OrderListItem;
  fromStatus?: OrderStatus;
  toStatus?: OrderStatus;
  success: boolean;
  message: string;
}) {
  api
    .post("/admin/orders/scan-events", {
      mode: MODE_TO_BACKEND[entry.mode],
      query: entry.query,
      orderId: entry.order?.id,
      orderNumber: entry.order?.orderNumber,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      success: entry.success,
      message: entry.message,
      channelId: entry.order?.channelId ?? undefined,
      provider: entry.order?.shipment?.provider ?? undefined,
    })
    .catch(() => {});
}

export default function ScanToUpdatePage() {
  const [mode, setMode] = useState<ScanMode>("rts");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<ScanLogEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Always refocused after a scan resolves (success or failure) — a
  // handheld scanner just keeps firing into whatever has focus, so the next
  // scan must land back in this box without the operator touching anything.
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  function pushLog(entry: Omit<ScanLogEntry, "id" | "at">) {
    setLog((prev) => [{ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry }, ...prev].slice(0, 200));
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    // Strips ALL whitespace, not just the ends — a scanner or a manual typo
    // can land a stray space anywhere in the middle (e.g. "OBM- 10217"),
    // and the order number itself never legitimately contains one.
    const query = value.replace(/\s+/g, "");
    // Cleared immediately (not after the request resolves) so a scanner
    // firing again right away never appends onto stale leftover text.
    setValue("");
    if (!query || busy) return;
    setBusy(true);
    // Hoisted above the try so the catch block can still attribute a
    // mid-chain PATCH failure to the right order instead of logging it as
    // an unresolved miss.
    let order: OrderListItem | undefined;
    try {
      order = await api.get<OrderListItem>(`/admin/orders/by-number/${encodeURIComponent(query)}`);
      const path = pathForMode(mode, order.status);
      if (!path) {
        const text = `${order.orderNumber} is at ${STATUS_LABEL[order.status] ?? order.status} — not eligible for "${MODES.find((m) => m.key === mode)!.label}".`;
        setBanner({ ok: false, text });
        pushLog({ mode, query, ok: false, message: text });
        logScanEvent({ mode, query, order, fromStatus: order.status, success: false, message: text });
        return;
      }
      for (const step of path) {
        await api.patch(`/admin/orders/${order.id}/status`, {
          status: step,
          ...(step === "RETURNED" ? { returnAction: "restock" } : {}),
        });
      }
      const finalStatus = path.at(-1)!;
      const finalLabel = STATUS_LABEL[finalStatus] ?? finalStatus;
      const text = `${order.orderNumber} — ${order.shippingName || order.customer.name} — ${formatAmount(order.total)} → ${finalLabel}`;
      setBanner({ ok: true, text });
      pushLog({ mode, query, ok: true, message: text });
      logScanEvent({ mode, query, order, fromStatus: order.status, toStatus: finalStatus, success: true, message: text });
    } catch (err) {
      const text = err instanceof ApiError ? `${query}: ${err.message}` : `${query}: scan failed`;
      setBanner({ ok: false, text });
      pushLog({ mode, query, ok: false, message: text });
      logScanEvent({ mode, query, order, fromStatus: order?.status, success: false, message: text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Scan To Update"
        description="Scan a parcel's barcode (or type the order number) to move it through the pipeline."
      />

      {/* Fixed mode selector — stays put while scanning a whole batch, so
          the operator picks it once and then just keeps scanning. */}
      <div className="sticky top-0 z-10 -mx-1 mb-6 bg-background px-1 py-1">
        <Card>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  mode === m.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-black/10 text-foreground hover:bg-black/5"
                }`}
              >
                <div className="text-base font-semibold">{m.label}</div>
                <div className="mt-0.5 text-sm text-foreground/60">{m.hint}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mb-6">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          {/* Plain input, not the shared <Input> — this page needs a real
              ref to refocus after every scan, which <Input> (a plain
              function component, not forwardRef) can't accept. */}
          <input
            ref={inputRef}
            autoFocus
            disabled={busy}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Scan barcode or type order number (e.g. OBM-10252)…"
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-black/5"
          />
          <Button type="submit" disabled={busy || !value.trim()}>
            {busy ? "Checking…" : "Submit"}
          </Button>
        </form>
      </Card>

      {banner && (
        <div
          className={`mb-6 rounded-lg px-4 py-3 text-base font-medium ${
            banner.ok ? "bg-status-delivered/10 text-status-delivered" : "bg-status-cancelled/10 text-status-cancelled"
          }`}
        >
          {banner.ok ? "✓ " : "✕ "}
          {banner.text}
        </div>
      )}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-foreground">This session&apos;s scans · {log.length}</h2>
        {log.length === 0 ? (
          <p className="text-base text-foreground/50">Nothing scanned yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                  <th className="rounded-l-lg px-3 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Mode</th>
                  <th className="px-3 py-2.5 font-medium">Scanned</th>
                  <th className="rounded-r-lg px-3 py-2.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={entry.id} className="border-b border-black/5 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5 text-foreground/60">
                      {new Date(entry.at).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2.5 text-foreground/70">{MODES.find((m) => m.key === entry.mode)?.label}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{entry.query}</td>
                    <td className={`px-3 py-2.5 ${entry.ok ? "text-status-delivered" : "text-status-cancelled"}`}>
                      {entry.message}
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

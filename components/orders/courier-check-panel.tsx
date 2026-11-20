"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { BdCourierCheckResult, BdCourierCourierStat, PhoneSummary } from "@/lib/types";
import { Pill } from "@/components/ui/badge";

const PHONE_RE = /^01\d{9}$/;
// Billed external lookup — wait for typing to actually stop, not on every
// keystroke (same spirit as the Orders page's own 250ms search debounce,
// just longer since this one costs money per call). "Our Record" below
// rides the same debounce/timer even though it's free, so both cards
// always land together.
const DEBOUNCE_MS = 600;

// Each courier's own brand color for its card's title band, same as the
// reference design. Best-effort for the smaller couriers BD Courier
// reports on but whose brand color wasn't part of that reference.
const COURIER_COLORS: Record<string, string> = {
  pathao: "bg-[#e3344a]",
  steadfast: "bg-[#0f9960]",
  redx: "bg-[#e5252a]",
  parceldex: "bg-slate-600",
  courierfast: "bg-amber-600",
  paperfly: "bg-sky-600",
  carrybee: "bg-yellow-500",
};
const DEFAULT_COURIER_COLOR = "bg-foreground/70";

function barColor(ratio: number): string {
  if (ratio >= 85) return "bg-status-delivered";
  if (ratio >= 60) return "bg-status-pending";
  return "bg-status-cancelled";
}

function rateTextColor(ratio: number): string {
  if (ratio >= 85) return "text-status-delivered";
  if (ratio >= 60) return "text-status-pending";
  return "text-status-cancelled";
}

function StatRow({ label, value, valueClass = "text-foreground" }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-foreground/50">{label}</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

function StatCard({
  stat,
  titleBand,
}: {
  stat: BdCourierCourierStat;
  // Omitted for the plain "Overall" card, which the reference leaves
  // uncolored — only the per-courier cards get a brand band.
  titleBand?: string;
}) {
  const hasData = stat.totalParcel > 0;
  return (
    <div className="min-w-[190px] shrink-0 overflow-hidden rounded-lg border border-black/10 bg-white text-xs">
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 ${
          titleBand ? `${titleBand} text-white` : "text-foreground"
        }`}
      >
        {stat.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- external courier logo, not part of the Next.js image pipeline
          <img src={stat.logo} alt="" className="h-3.5 w-3.5 rounded-full bg-white object-contain" />
        )}
        <span className="truncate text-sm font-semibold">{stat.name}</span>
      </div>
      <div className="space-y-0.5 p-2.5">
        <StatRow
          label="Success Rate"
          value={hasData ? `${stat.successRatio}%` : "—"}
          valueClass={hasData ? rateTextColor(stat.successRatio) : "text-foreground/50"}
        />
        <StatRow label="Total" value={stat.totalParcel} />
        <StatRow label="Success" value={stat.successParcel} />
        <StatRow label="Cancelled" value={stat.cancelledParcel} />
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/10">
          {hasData && (
            <div className={`h-full ${barColor(stat.successRatio)}`} style={{ width: `${Math.min(stat.successRatio, 100)}%` }} />
          )}
        </div>
      </div>
    </div>
  );
}

function OurRecordCard({
  summary,
  onAutofill,
}: {
  summary: PhoneSummary;
  onAutofill?: (name: string, address: string) => void;
}) {
  return (
    <div className="min-w-[190px] shrink-0 rounded-lg border border-black/10 bg-white p-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Our Record</span>
        {onAutofill && !summary.isNewCustomer && summary.lastName && summary.lastAddress && (
          <button
            type="button"
            onClick={() => onAutofill(summary.lastName!, summary.lastAddress!)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Autofill
          </button>
        )}
      </div>
      {summary.isNewCustomer ? (
        <div className="mt-2">
          <Pill tone="default">New customer</Pill>
          <div className="mt-1 text-xs text-foreground/50">No orders yet</div>
        </div>
      ) : (
        <div className="mt-2 text-xs text-foreground/70">
          <div className="flex justify-between">
            <span className="text-foreground/50">Total</span>
            <span className="font-semibold text-foreground">{summary.totalOrders}</span>
          </div>
          <div className="mt-0.5 flex justify-between">
            <span className="text-foreground/50">Shipped</span>
            <span className="font-semibold text-foreground">{summary.shippedOrders}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Shown on New Order, Web Orders, and Edit Order. "Our Record" is our own
// order history for this phone number — always shown once a valid number
// is entered, independent of BD Courier. The courier breakdown next to it
// only appears when BD Courier is connected; it silently renders nothing
// for that half of the panel otherwise (not every deployment has it
// configured), while "Our Record" still shows alone.
export function CourierCheckPanel({
  phone,
  onAutofill,
}: {
  phone: string;
  onAutofill?: (name: string, address: string) => void;
}) {
  const [ourRecord, setOurRecord] = useState<PhoneSummary | null>(null);
  const [result, setResult] = useState<BdCourierCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    setOurRecord(null);
    setResult(null);
    setError(null);
    if (!PHONE_RE.test(phone)) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      // Two independent requests, each updates its own half of the panel
      // the moment IT resolves — "Our Record" is always fast (our own DB),
      // BD Courier can take up to the full 10s timeout; Our Record
      // shouldn't sit on "Checking…" that whole time waiting for it.
      api
        .get<PhoneSummary>(`/admin/customers/phone-summary?phone=${phone}`)
        .then((r) => {
          if (!cancelled) setOurRecord(r);
        })
        .catch(() => undefined);

      api
        .get<BdCourierCheckResult>(`/admin/bd-courier/check?phone=${phone}`)
        .then((r) => {
          if (cancelled) return;
          setResult(r);
          setNotConfigured(false);
        })
        .catch((err) => {
          if (cancelled) return;
          const message = err instanceof ApiError ? err.message : "Could not reach BD Courier";
          if (message.toLowerCase().includes("not connected")) {
            setNotConfigured(true);
          } else {
            setError(message);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone]);

  if (!PHONE_RE.test(phone)) return null;
  if (!ourRecord && !result && !error && !loading) return null;

  return (
    <div className="mb-4 rounded-lg border border-black/10 bg-black/[0.02] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">
        Courier Delivery History
      </div>
      {loading && !ourRecord && !result && <div className="text-sm text-foreground/50">Checking…</div>}
      {error && (
        <p className="mb-2 rounded-lg bg-status-cancelled/10 px-3 py-2 text-xs text-status-cancelled">{error}</p>
      )}
      {result && result.reports.length > 0 && (
        <div className="mb-2 rounded-lg bg-status-cancelled/10 px-3 py-2 text-xs text-status-cancelled">
          ⚠ {result.reports.length} fraud report{result.reports.length > 1 ? "s" : ""} for this number:{" "}
          {result.reports.map((r) => r.details).join("; ")}
        </div>
      )}
      {(ourRecord || result) && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {ourRecord && <OurRecordCard summary={ourRecord} onAutofill={onAutofill} />}
          {result && (
            <>
              <StatCard stat={{ ...result.summary, name: "Overall" }} />
              {result.couriers.map((c) => (
                <StatCard key={c.key} stat={c} titleBand={COURIER_COLORS[c.key] ?? DEFAULT_COURIER_COLOR} />
              ))}
              {result.couriers.length === 0 && !notConfigured && (
                <div className="flex items-center text-sm text-foreground/50">No courier history found for this number.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

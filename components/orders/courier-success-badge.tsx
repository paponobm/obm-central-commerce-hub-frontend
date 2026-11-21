"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { BdCourierCheckResult } from "@/lib/types";

const PHONE_RE = /^01\d{9}$/;
const SIZE = 36;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// 0 itself is left neutral (gray) — it's as likely to mean "every parcel
// genuinely failed" as some other edge case, and a bare 0% isn't worth
// the same alarm as a real-but-poor rate; 1-49% gets that treatment
// instead.
function successColor(ratio: number): string {
  if (ratio >= 90) return "text-status-delivered";
  if (ratio >= 50) return "text-status-pending";
  if (ratio > 0) return "text-status-cancelled";
  return "text-foreground/40";
}

function SuccessRing({ ratio }: { ratio: number }) {
  const offset = CIRCUMFERENCE * (1 - Math.min(ratio, 100) / 100);
  return (
    <svg width={SIZE} height={SIZE} className="-rotate-90 shrink-0">
      <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-black/10" />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={successColor(ratio)}
      />
    </svg>
  );
}

// The Web Orders list's own "Success Rate" column — BD Courier's overall
// delivery success for this row's phone number. orderId/leadId route this
// through the persisted, fetch-once endpoint (same one the detail panel
// uses) — once a row's been checked, reopening or reloading this list
// never re-bills for it again, only an actual phone-number edit does.
export function CourierSuccessBadge({
  phone,
  orderId,
  leadId,
}: {
  phone: string;
  orderId?: string;
  leadId?: string;
}) {
  const [result, setResult] = useState<BdCourierCheckResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!PHONE_RE.test(phone)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ phone });
    if (orderId) params.set("orderId", orderId);
    if (leadId) params.set("leadId", leadId);
    api
      .get<BdCourierCheckResult>(`/admin/bd-courier/check?${params}`)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phone, orderId, leadId]);

  if (loading) return <span className="text-sm text-foreground/40">…</span>;
  if (!result || result.summary.totalParcel === 0) {
    return <span className="text-foreground/40">—</span>;
  }

  const { successRatio, successParcel, totalParcel } = result.summary;
  return (
    <div className="flex items-center gap-2">
      <SuccessRing ratio={successRatio} />
      <div className={`text-xs font-semibold leading-tight ${successColor(successRatio)}`}>
        <div>Success: {successRatio}%</div>
        <div>Order: {successParcel}/{totalParcel}</div>
      </div>
    </div>
  );
}

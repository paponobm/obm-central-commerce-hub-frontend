"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { IntegrationProvider, OrderStatus } from "@/lib/types";
import { StatDateRangeSelect } from "@/components/ui/stat-date-range-select";
import { statRangeBounds, type StatRange } from "@/lib/stat-date-range";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Pill, StatusBadge } from "@/components/ui/badge";
import { LoadingLine } from "@/components/ui/spinner";

type BackendScanMode = "RTS" | "SHIPPING" | "RETURN";

// Same wording as the Scan To Update page's own mode buttons (lib/types'
// ScanMode is uppercase/backend-shaped; that page's own keys are lowercase
// locally) — kept in sync by hand since it's a 3-entry label, not worth a
// shared module for.
const MODE_LABEL: Record<BackendScanMode, string> = {
  RTS: "Scan for RTS",
  SHIPPING: "Scan for Shipping",
  RETURN: "Scan to Return",
};

interface ScanHistoryRow {
  mode: BackendScanMode;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  parcels: number;
}

interface ScanHistoryDay {
  date: string;
  scanned: number;
  updated: number;
  failed: number;
  rows: ScanHistoryRow[];
}

function formatDayHeading(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ScanHistoryPage() {
  const [range, setRange] = useState<StatRange>("7d");
  const [customFrom, setCustomFrom] = useState<string | undefined>();
  const [customTo, setCustomTo] = useState<string | undefined>();
  const [provider, setProvider] = useState<"" | IntegrationProvider>("");
  const [days, setDays] = useState<ScanHistoryDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = statRangeBounds(range, customFrom, customTo);
    setError(null);
    setDays(null);
    api
      .get<ScanHistoryDay[]>(
        `/admin/orders/scan-events?from=${from}&to=${to}${provider ? `&provider=${provider}` : ""}`,
      )
      .then((rows) => {
        if (!cancelled) setDays(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load scan history");
      });
    return () => {
      cancelled = true;
    };
  }, [range, customFrom, customTo, provider]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Scan History" description="Every Scan To Update attempt, grouped by day." />
        <div className="flex items-center gap-2">
          <Select
            value={provider}
            onChange={(e) => setProvider(e.target.value as "" | IntegrationProvider)}
            className="w-40 !text-sm"
          >
            <option value="">All couriers</option>
            <option value="STEADFAST">Steadfast</option>
          </Select>
          <StatDateRangeSelect
            value={range}
            customFrom={customFrom}
            customTo={customTo}
            onChange={(r, from, to) => {
              setRange(r);
              setCustomFrom(from);
              setCustomTo(to);
            }}
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">{error}</p>
      )}

      <div className="mt-6 space-y-6">
        {days === null ? (
          <Card>
            <LoadingLine />
          </Card>
        ) : days.length === 0 ? (
          <Card>
            <p className="text-base text-foreground/50">No scans recorded in this range.</p>
          </Card>
        ) : (
          days.map((day) => (
            <Card key={day.date}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">{formatDayHeading(day.date)}</h2>
                <div className="flex items-center gap-2">
                  <Pill>{day.scanned} scanned</Pill>
                  <Pill tone="success">{day.updated} updated</Pill>
                  {day.failed > 0 && <Pill tone="danger">{day.failed} failed</Pill>}
                </div>
              </div>

              {day.rows.length === 0 ? (
                <p className="mt-4 text-sm text-foreground/50">No successful transitions this day.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-foreground/50">
                        <th className="border-b border-black/10 pb-2 pr-4 font-medium">Scan</th>
                        <th className="border-b border-black/10 pb-2 pr-4 font-medium">From</th>
                        <th className="border-b border-black/10 pb-2 pr-4 font-medium">To</th>
                        <th className="border-b border-black/10 pb-2 text-right font-medium">Parcels</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.rows.map((row, i) => (
                        <tr key={i} className="border-b border-black/5 last:border-0">
                          <td className="py-2.5 pr-4 text-foreground">{MODE_LABEL[row.mode]}</td>
                          <td className="py-2.5 pr-4">
                            {row.fromStatus ? <StatusBadge status={row.fromStatus} compact /> : "—"}
                          </td>
                          <td className="py-2.5 pr-4">
                            {row.toStatus ? <StatusBadge status={row.toStatus} compact /> : "—"}
                          </td>
                          <td className="py-2.5 text-right font-medium text-foreground">{row.parcels}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

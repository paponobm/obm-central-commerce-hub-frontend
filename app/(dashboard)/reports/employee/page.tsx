"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import { formatAmount } from "@/lib/format";
import type { OrderSource, OrderStatus } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { LoadingLine } from "@/components/ui/spinner";

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";
type ReportTab = "status" | "sources";

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString("en-CA");
}

// Same preset-pill pattern as the COD Report page — duplicated, not
// imported, same reason that page gives for its own copy: each report page
// keeps its date control local rather than sharing one.
const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "custom", label: "Custom" },
];

function presetRange(preset: Preset): { from?: string; to?: string } {
  switch (preset) {
    case "today":
      return { from: dateStr(0), to: dateStr(0) };
    case "yesterday":
      return { from: dateStr(1), to: dateStr(1) };
    case "7d":
      return { from: dateStr(6), to: dateStr(0) };
    default:
      return {};
  }
}

const TABS: { key: ReportTab; label: string }[] = [
  { key: "status", label: "Order Status" },
  { key: "sources", label: "Order Sources" },
];

// Same 11 statuses the Orders list's own tabs track — matches the backend's
// EMPLOYEE_REPORT_STATUSES exactly, with "RTS" as the one short label (same
// override StatusBadge uses) so the column header isn't needlessly wide.
const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  PENDING: "Pending",
  READY_TO_SHIP: "RTS",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  PENDING_RETURN: "Pending Return",
  RETURNED: "Returned",
  PARTIAL: "Partial",
  CANCELLED: "Cancelled",
  PENDING_CANCEL: "Pending Cancel",
  PREORDER: "Preorder",
  LOST: "Lost",
};

// A status column reads as "good" (green) or "bad" (red) the same way the
// rest of the app already colors these — DELIVERED is the one success
// state, the cancel/return family is the one failure state; everything
// still mid-pipeline (Pending/RTS/Shipped/Preorder/Pending Return) stays
// neutral rather than guessing a sentiment for an order that hasn't
// resolved yet.
type Tone = "positive" | "negative" | "neutral";
const STATUS_TONE: Partial<Record<OrderStatus, Tone>> = {
  DELIVERED: "positive",
  RETURNED: "negative",
  CANCELLED: "negative",
  PENDING_CANCEL: "negative",
  LOST: "negative",
};
function toneTextClass(tone: Tone): string {
  if (tone === "positive") return "text-status-delivered";
  if (tone === "negative") return "text-status-cancelled";
  return "text-foreground";
}
function tonePctClass(tone: Tone): string {
  if (tone === "positive") return "text-status-delivered/60";
  if (tone === "negative") return "text-status-cancelled/60";
  return "text-foreground/40";
}

// Same sentence-case convention the Orders list uses for its own Source badge.
function sourceLabel(s: OrderSource): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

type Metric = { count: number; amount: number };

interface EmployeeRow {
  id: string;
  name: string;
  total: Metric;
  byStatus: Record<OrderStatus, Metric>;
  bySource: Record<OrderSource, Metric>;
}

interface EmployeeReport {
  statuses: OrderStatus[];
  sources: OrderSource[];
  employees: EmployeeRow[];
}

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

type SortKey = "total" | OrderStatus | OrderSource;
type MetricKind = "count" | "amount";
interface SortState {
  key: SortKey;
  metric: MetricKind;
  dir: "asc" | "desc";
}

// One table column per metric — Count and Amount are always separate
// columns, never stacked in one cell (the reference's own flat layout).
// "total" itself still gets the pill treatment on its Count column; every
// other column is plain toned text.
interface DataColumn {
  key: SortKey;
  metric: MetricKind;
  label: string;
  tone: Tone;
  isTotalCount?: boolean;
}

function SortIcon({ active, dir }: { active: boolean; dir?: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 text-foreground/30">↕</span>;
  return <span className="ml-1 text-primary">{dir === "asc" ? "↑" : "↓"}</span>;
}

export default function EmployeeReportPage() {
  const { activeChannelId, activeChannel } = useChannelScope();
  const [tab, setTab] = useState<ReportTab>("status");
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<EmployeeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[1]);
  const [sort, setSort] = useState<SortState | null>(null);
  const [nameFilter, setNameFilter] = useState("");

  useEffect(() => {
    const range = preset === "custom" ? { from, to } : presetRange(preset);
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    if (activeChannelId) params.set("channelId", activeChannelId);

    let cancelled = false;
    setError(null);
    setPage(1);
    api
      .get<EmployeeReport>(`/admin/reports/employee-report?${params}`)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load the employee report");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [preset, from, to, activeChannelId]);

  // The per-status/source list (key/label/tone), unchanged from before —
  // just no longer rendered as one cell each; dataColumns below splits
  // every entry here into its own Count column and its own Amount column.
  const columns =
    tab === "status"
      ? (report?.statuses ?? []).map((s) => ({ key: s as SortKey, label: STATUS_LABEL[s] ?? s, tone: STATUS_TONE[s] ?? "neutral" as Tone }))
      : (report?.sources ?? []).map((s) => ({ key: s as SortKey, label: sourceLabel(s), tone: "neutral" as Tone }));

  const dataColumns: DataColumn[] = [
    { key: "total", metric: "count", label: "Total", tone: "neutral", isTotalCount: true },
    { key: "total", metric: "amount", label: "Total Money", tone: "positive" },
    ...columns.flatMap((c) => [
      { key: c.key, metric: "count" as MetricKind, label: `${c.label} Count`, tone: c.tone },
      { key: c.key, metric: "amount" as MetricKind, label: `${c.label} Amount`, tone: c.tone },
    ]),
  ];

  function metricFor(emp: EmployeeRow, key: SortKey): Metric {
    if (key === "total") return emp.total;
    return tab === "status" ? emp.byStatus[key as OrderStatus] : emp.bySource[key as OrderSource];
  }

  function toggleSort(key: SortKey, metric: MetricKind) {
    setPage(1);
    setSort((prev) => {
      if (!prev || prev.key !== key || prev.metric !== metric) return { key, metric, dir: "desc" };
      return { key, metric, dir: prev.dir === "desc" ? "asc" : "desc" };
    });
  }

  // Filters the whole report (sort, pagination, and the grand-total footer
  // all key off this), not just which rows render — searching for one
  // employee should show that employee's own totals in the footer, not
  // everyone's.
  const filteredEmployees = useMemo(() => {
    if (!report) return [];
    const q = nameFilter.trim().toLowerCase();
    return q ? report.employees.filter((e) => e.name.toLowerCase().includes(q)) : report.employees;
  }, [report, nameFilter]);

  const sortedEmployees = useMemo(() => {
    if (!sort) return filteredEmployees;
    return [...filteredEmployees].sort((a, b) => {
      const av = sort.metric === "count" ? metricFor(a, sort.key).count : metricFor(a, sort.key).amount;
      const bv = sort.metric === "count" ? metricFor(b, sort.key).count : metricFor(b, sort.key).amount;
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredEmployees, sort, tab]);

  const totalPages = report ? Math.max(1, Math.ceil(sortedEmployees.length / pageSize)) : 1;
  const pagedEmployees = useMemo(
    () => sortedEmployees.slice((page - 1) * pageSize, page * pageSize),
    [sortedEmployees, page, pageSize],
  );

  // Grand totals across every employee in the current (name-filtered) set,
  // not just the current page, so the footer row stays the same number
  // while paging.
  const grandTotal = useMemo(() => {
    if (!report) return null;
    const total: Metric = { count: 0, amount: 0 };
    const byColumn = new Map<SortKey, Metric>(columns.map((c) => [c.key, { count: 0, amount: 0 }]));
    for (const emp of filteredEmployees) {
      total.count += emp.total.count;
      total.amount += emp.total.amount;
      for (const c of columns) {
        const cell = tab === "status" ? emp.byStatus[c.key as OrderStatus] : emp.bySource[c.key as OrderSource];
        const acc = byColumn.get(c.key)!;
        acc.count += cell.count;
        acc.amount += cell.amount;
      }
    }
    return { total, byColumn };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, filteredEmployees, tab]);

  return (
    <div>
      {/* Title, the Order Status / Order Sources tabs, and the date-range
          picker all stay fixed at the top of the scroll area — the table
          below can get tall/wide, and this keeps the controls that drive it
          always reachable instead of scrolling away with the rows. */}
      <div className="sticky top-0 z-10 -mx-1 bg-background px-1 pb-4 pt-1">
        <PageHeader
          title="Employee Report"
          description={
            activeChannel
              ? `Orders handled by each staff member for ${activeChannel.name}.`
              : "Orders handled by each staff member across every store you can access."
          }
        />

        <div className="mb-4 flex gap-1 rounded-lg bg-black/5 p-1" style={{ width: "fit-content" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setSort(null);
              }}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.key ? "bg-card text-primary shadow-sm" : "text-foreground/60 hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Label>Search Employee</Label>
            <Input
              className="w-64"
              placeholder="Search employee name…"
              value={nameFilter}
              onChange={(e) => {
                setNameFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {preset === "custom" && (
              <>
                <div>
                  <Label>From</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label>To</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <Label>Date Range</Label>
              <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
                {PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
          {error}
        </p>
      )}

      <Card>
        {!report ? (
          <LoadingLine />
        ) : report.employees.length === 0 ? (
          <p className="text-base text-foreground/50">No staff-created orders in this range.</p>
        ) : filteredEmployees.length === 0 ? (
          <p className="text-base text-foreground/50">No employees match “{nameFilter}”.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              {tab === "status" ? (
                <table className="w-full min-w-[3400px] text-left text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                      <th className="sticky left-0 whitespace-nowrap rounded-l-lg bg-[color-mix(in_srgb,var(--primary)_15%,var(--card-bg))] px-5 py-2.5 font-medium">Employee</th>
                      {dataColumns.map((col, i) => {
                        const active = sort?.key === col.key && sort.metric === col.metric;
                        return (
                          <th key={`${col.key}-${col.metric}`} className={`whitespace-nowrap px-5 py-2.5 text-right font-medium ${i === dataColumns.length - 1 ? "rounded-r-lg" : ""}`}>
                            <button
                              type="button"
                              onClick={() => toggleSort(col.key, col.metric)}
                              className="inline-flex items-center hover:text-foreground"
                            >
                              {col.label}
                              <SortIcon active={active} dir={active ? sort.dir : undefined} />
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEmployees.map((emp) => (
                      <tr key={emp.id} className="border-b border-black/5 last:border-0">
                        <td className="sticky left-0 bg-card px-5 py-2.5 font-medium text-foreground">{emp.name}</td>
                        {dataColumns.map((col) => {
                          const metric = metricFor(emp, col.key);
                          if (col.isTotalCount) {
                            return (
                              <td key={`${col.key}-${col.metric}`} className="px-5 py-2.5 text-right">
                                {metric.count > 0 ? (
                                  <span className="inline-block rounded-full bg-[color-mix(in_srgb,var(--status-delivered)_12%,transparent)] px-2.5 py-0.5 text-status-delivered">
                                    {metric.count}
                                  </span>
                                ) : (
                                  <span className="text-foreground/40">0</span>
                                )}
                              </td>
                            );
                          }
                          if (col.metric === "amount") {
                            return (
                              <td key={`${col.key}-${col.metric}`} className={`px-5 py-2.5 text-right ${toneTextClass(col.tone)}`}>
                                ৳{formatAmount(metric.amount)}
                              </td>
                            );
                          }
                          const pct = emp.total.count > 0 ? (metric.count / emp.total.count) * 100 : 0;
                          return (
                            <td key={`${col.key}-${col.metric}`} className={`px-5 py-2.5 text-right ${toneTextClass(col.tone)}`}>
                              {metric.count}
                              <div className={`text-xs ${tonePctClass(col.tone)}`}>({pct.toFixed(1)}%)</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  {grandTotal && (
                    <tfoot>
                      <tr className="border-t-2 border-black/10 bg-black/[0.03] text-foreground">
                        <td className="sticky left-0 bg-[color-mix(in_srgb,black_3%,var(--card-bg))] px-5 py-2.5">Total</td>
                        {dataColumns.map((col) => {
                          const acc = col.key === "total" ? grandTotal.total : grandTotal.byColumn.get(col.key)!;
                          return (
                            <td key={`${col.key}-${col.metric}`} className="px-5 py-2.5 text-right">
                              {col.metric === "count" ? acc.count : `৳${formatAmount(acc.amount)}`}
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              ) : (
                // Order Sources — a grouped two-row header per the reference:
                // each source name spans its own Count/Money pair underneath
                // it, instead of the Status tab's flat "X Count"/"X Amount"
                // column labels. Employee/Total stay single columns spanning
                // both header rows since they aren't grouped under anything.
                <table className="w-full min-w-[3000px] text-left text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                      <th rowSpan={2} className="sticky left-0 whitespace-nowrap rounded-l-lg bg-[color-mix(in_srgb,var(--primary)_15%,var(--card-bg))] px-5 py-2.5 align-bottom font-medium">
                        Employee
                      </th>
                      <th rowSpan={2} className="whitespace-nowrap px-5 py-2.5 text-right align-bottom font-medium">
                        <button type="button" onClick={() => toggleSort("total", "count")} className="inline-flex items-center hover:text-foreground">
                          Total
                          <SortIcon active={sort?.key === "total" && sort.metric === "count"} dir={sort?.key === "total" && sort.metric === "count" ? sort.dir : undefined} />
                        </button>
                      </th>
                      {columns.map((c, i) => (
                        <th
                          key={c.key}
                          colSpan={2}
                          className={`whitespace-nowrap border-b border-black/10 px-5 py-2 text-center font-medium ${i === columns.length - 1 ? "rounded-r-lg" : ""}`}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                    <tr style={{ backgroundColor: "rgba(47, 111, 235, 0.08)" }}>
                      {columns.map((c) => (
                        <Fragment key={c.key}>
                          <th className="whitespace-nowrap px-5 py-2 text-right text-xs font-medium text-foreground/60">
                            <button
                              type="button"
                              onClick={() => toggleSort(c.key, "count")}
                              className="inline-flex items-center hover:text-foreground"
                            >
                              Count
                              <SortIcon active={sort?.key === c.key && sort.metric === "count"} dir={sort?.key === c.key && sort.metric === "count" ? sort.dir : undefined} />
                            </button>
                          </th>
                          <th className="whitespace-nowrap px-5 py-2 text-right text-xs font-medium text-foreground/60">
                            <button
                              type="button"
                              onClick={() => toggleSort(c.key, "amount")}
                              className="inline-flex items-center hover:text-foreground"
                            >
                              Money
                              <SortIcon active={sort?.key === c.key && sort.metric === "amount"} dir={sort?.key === c.key && sort.metric === "amount" ? sort.dir : undefined} />
                            </button>
                          </th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEmployees.map((emp) => (
                      <tr key={emp.id} className="border-b border-black/5 last:border-0">
                        <td className="sticky left-0 bg-card px-5 py-2.5 font-medium text-foreground">{emp.name}</td>
                        <td className="px-5 py-2.5 text-right">
                          {emp.total.count > 0 ? (
                            <span className="inline-block rounded-full bg-[color-mix(in_srgb,var(--status-delivered)_12%,transparent)] px-2.5 py-0.5 text-status-delivered">
                              {emp.total.count}
                            </span>
                          ) : (
                            <span className="text-foreground/40">0</span>
                          )}
                        </td>
                        {columns.map((c) => {
                          const metric = metricFor(emp, c.key);
                          const pct = emp.total.count > 0 ? (metric.count / emp.total.count) * 100 : 0;
                          return (
                            <Fragment key={c.key}>
                              <td className="px-5 py-2.5 text-right text-foreground">
                                {metric.count}
                                <div className="text-xs text-foreground/40">({pct.toFixed(1)}%)</div>
                              </td>
                              <td className="px-5 py-2.5 text-right text-foreground">
                                ৳{formatAmount(metric.amount)}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  {grandTotal && (
                    <tfoot>
                      <tr className="border-t-2 border-black/10 bg-black/[0.03] text-foreground">
                        <td className="sticky left-0 bg-[color-mix(in_srgb,black_3%,var(--card-bg))] px-5 py-2.5">Total</td>
                        <td className="px-5 py-2.5 text-right">{grandTotal.total.count}</td>
                        {columns.map((c) => {
                          const acc = grandTotal.byColumn.get(c.key)!;
                          return (
                            <Fragment key={c.key}>
                              <td className="px-5 py-2.5 text-right">{acc.count}</td>
                              <td className="px-5 py-2.5 text-right">৳{formatAmount(acc.amount)}</td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 text-base">
              <span className="font-bold text-primary">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sortedEmployees.length)} of{" "}
                {sortedEmployees.length}
              </span>
              <div className="flex items-center gap-2">
                <Select
                  className="w-auto !text-base font-bold !text-primary"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  className="!text-base !font-bold !text-primary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="font-bold text-primary">
                  Page {page} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className="!text-base !font-bold !text-primary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

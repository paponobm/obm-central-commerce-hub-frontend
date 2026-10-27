"use client";

import { useEffect, useState, type ReactNode, type SVGProps } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import { formatAmount } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Input, Label } from "@/components/ui/input";
import { LoadingLine } from "@/components/ui/spinner";
import type { OrderReport, OrderReportMetric } from "@/lib/types";

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString("en-CA");
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "custom", label: "Custom" },
];

// "30d" deliberately sends no from/to — the backend's own default range
// (resolveDateRange's defaultDays=30) is the same window, so this just
// defers to it instead of recomputing the same thing on the client.
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

// One color per funnel stage. Tailwind class names are spelled out in full
// (not templated) because dynamic `bg-${c}-600` strings aren't picked up by
// Tailwind's static build-time scan.
interface Tone {
  panel: string; // card background + border
  iconBg: string;
  iconText: string;
  amount: string;
  line: string; // connector stem/bracket color
  arrow: string;
}

const TONES: Record<string, Tone> = {
  incoming: {
    panel: "border-indigo-500/30 bg-indigo-500/10",
    iconBg: "bg-indigo-500/20",
    iconText: "text-indigo-400",
    amount: "text-indigo-300",
    line: "bg-indigo-500",
    arrow: "text-indigo-500",
  },
  website: {
    panel: "border-blue-500/40 bg-blue-500/10",
    iconBg: "bg-blue-500/20",
    iconText: "text-blue-400",
    amount: "text-blue-300",
    line: "bg-blue-500",
    arrow: "text-blue-500",
  },
  approvedWeb: {
    panel: "border-amber-500/40 bg-amber-500/10",
    iconBg: "bg-amber-500/20",
    iconText: "text-amber-400",
    amount: "text-amber-300",
    line: "bg-amber-500",
    arrow: "text-amber-500",
  },
  approvedOutside: {
    panel: "border-purple-500/40 bg-purple-500/10",
    iconBg: "bg-purple-500/20",
    iconText: "text-purple-400",
    amount: "text-purple-300",
    line: "bg-purple-500",
    arrow: "text-purple-500",
  },
  total: {
    panel: "border-slate-600 bg-slate-800",
    iconBg: "bg-slate-700",
    iconText: "text-slate-300",
    amount: "text-slate-300",
    line: "bg-slate-500",
    arrow: "text-slate-500",
  },
  delivered: {
    panel: "border-emerald-500/40 bg-emerald-500/10",
    iconBg: "bg-emerald-500/20",
    iconText: "text-emerald-400",
    amount: "text-emerald-300",
    line: "bg-emerald-500",
    arrow: "text-emerald-500",
  },
  partial: {
    panel: "border-sky-500/40 bg-sky-500/10",
    iconBg: "bg-sky-500/20",
    iconText: "text-sky-400",
    amount: "text-sky-300",
    line: "bg-sky-500",
    arrow: "text-sky-500",
  },
  cancelled: {
    panel: "border-orange-500/40 bg-orange-500/10",
    iconBg: "bg-orange-500/20",
    iconText: "text-orange-400",
    amount: "text-orange-300",
    line: "bg-orange-500",
    arrow: "text-orange-500",
  },
  returned: {
    panel: "border-rose-500/40 bg-rose-500/10",
    iconBg: "bg-rose-500/20",
    iconText: "text-rose-400",
    amount: "text-rose-300",
    line: "bg-rose-500",
    arrow: "text-rose-500",
  },
};

// Small hand-drawn icon set for the funnel badges — same inline-SVG
// convention used everywhere else in this app (no icon library installed).
type IconProps = SVGProps<SVGSVGElement>;
function iconBase(props: IconProps) {
  return {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}
function InboxIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <path d="M3 11.5 5 4h10l2 7.5" />
      <path d="M3 11.5h4.5l1 2h3l1-2H17V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4.5Z" />
    </svg>
  );
}
function GlobeIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7Z" />
    </svg>
  );
}
function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <circle cx="10" cy="10" r="7" />
      <path d="M7 10.2l2 2 4-4.4" />
    </svg>
  );
}
function TruckIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <path d="M2.5 6h8v7h-8z" />
      <path d="M10.5 9h3.3L16 11.3V13h-5.5z" />
      <circle cx="5.3" cy="14.8" r="1.3" />
      <circle cx="13.2" cy="14.8" r="1.3" />
    </svg>
  );
}
function BoxIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <path d="M10 2.5 17 6v8l-7 3.5L3 14V6l7-3.5Z" />
      <path d="M3 6l7 3.5L17 6" />
      <path d="M10 9.5V17.5" />
    </svg>
  );
}
function XCircleIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <circle cx="10" cy="10" r="7" />
      <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />
    </svg>
  );
}
function UndoIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <path d="M4 10a6 6 0 1 1 1.8 4.3" />
      <path d="M4 10V6M4 10h4" />
    </svg>
  );
}

function FunnelBox({
  icon: Icon,
  label,
  metric,
  tone,
  sub,
}: {
  icon: (props: IconProps) => ReactNode;
  label: string;
  metric: OrderReportMetric | undefined;
  tone: Tone;
  sub?: string;
}) {
  return (
    <div
      className={`flex w-60 flex-col items-center justify-center gap-1.5 rounded-2xl border px-5 py-5 text-center ${tone.panel}`}
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${tone.iconBg}`}>
        <Icon className={`h-5 w-5 ${tone.iconText}`} />
      </div>
      <div className="text-3xl font-extrabold text-white">{metric ? metric.count : "–"}</div>
      <div className="whitespace-nowrap text-sm font-semibold text-white/90">{label}</div>
      <div className={`text-sm font-semibold ${tone.amount}`}>
        {metric ? `৳${formatAmount(metric.amount)}` : ""}
      </div>
      {sub && <div className="text-[11px] font-medium text-white/40">{sub}</div>}
    </div>
  );
}

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg width="11" height="6" viewBox="0 0 11 6" className={className} fill="currentColor" aria-hidden>
      <path d="M0 0 L5.5 6 L11 0 Z" />
    </svg>
  );
}

// One parent stem forking into N sibling slots — a bracket bar colored per
// child branch, each ending in its own stem + arrowhead right above that
// child's box. A slot with `connected: false` renders no bracket segment,
// stem, or arrow at all (just blank space of the same height) — its box
// still sits in that column with nothing feeding into it, matching the
// reference's "Approved Outside Web" (a sibling, not a child of "From
// Website Orders").
function Branch({
  stemTone,
  items,
  maxWidthClass = "max-w-6xl",
}: {
  stemTone: Tone;
  items: { node: ReactNode; tone: Tone; connected?: boolean }[];
  maxWidthClass?: string;
}) {
  const count = items.length;
  return (
    <div className="flex w-full flex-col items-center">
      <div className={`h-6 w-0.5 rounded-full ${stemTone.line}`} />
      <div className={`flex w-full ${maxWidthClass}`}>
        {items.map((item, i) => {
          const connected = item.connected !== false;
          return (
            <div key={i} className="flex min-w-0 flex-1 justify-center">
              {connected ? (
                <div
                  className={`h-0.5 ${item.tone.line} ${
                    count === 1
                      ? "w-0"
                      : i === 0
                        ? "ml-[50%] w-1/2 rounded-tl-full"
                        : i === count - 1
                          ? "mr-[50%] w-1/2 rounded-tr-full"
                          : "w-full"
                  }`}
                />
              ) : (
                <div className="h-0.5 w-0" />
              )}
            </div>
          );
        })}
      </div>
      <div className={`flex w-full ${maxWidthClass}`}>
        {items.map((item, i) => {
          const connected = item.connected !== false;
          return (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-0 px-2 sm:px-3">
              {connected ? (
                <>
                  <div className={`h-5 w-0.5 rounded-full ${item.tone.line}`} />
                  <Arrow className={item.tone.arrow} />
                </>
              ) : (
                <div className="h-5" />
              )}
              <div className="mt-2 w-full">{item.node}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The reverse of Branch: N boxes above converge into one shared stem below,
// feeding the next box (Total Orders).
function Merge({
  tones,
  stemTone,
  maxWidthClass = "max-w-6xl",
}: {
  tones: Tone[];
  stemTone: Tone;
  maxWidthClass?: string;
}) {
  const count = tones.length;
  return (
    <div className="flex w-full flex-col items-center">
      <div className={`flex w-full ${maxWidthClass}`}>
        {tones.map((tone, i) => (
          <div key={i} className="flex min-w-0 flex-1 justify-center">
            <div className={`h-5 w-0.5 rounded-full ${tone.line}`} />
          </div>
        ))}
      </div>
      <div className={`flex w-full ${maxWidthClass}`}>
        {tones.map((tone, i) => (
          <div key={i} className="flex min-w-0 flex-1 justify-center">
            <div
              className={`h-0.5 ${tone.line} ${
                count === 1
                  ? "w-0"
                  : i === 0
                    ? "ml-[50%] w-1/2 rounded-bl-full"
                    : i === count - 1
                      ? "mr-[50%] w-1/2 rounded-br-full"
                      : "w-full"
              }`}
            />
          </div>
        ))}
      </div>
      <div className={`h-6 w-0.5 rounded-full ${stemTone.line}`} />
      <Arrow className={stemTone.arrow} />
    </div>
  );
}

export default function OrderReportPage() {
  const { activeChannelId, activeChannel } = useChannelScope();
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<OrderReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const range = preset === "custom" ? { from, to } : presetRange(preset);
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    if (activeChannelId) params.set("channelId", activeChannelId);

    // A slower in-flight request for a preset the user already switched away
    // from must never overwrite the result of a later one that resolves
    // first — guard with the same cancelled-flag pattern used elsewhere in
    // the app (e.g. the Web Orders list load).
    let cancelled = false;
    setError(null);
    api
      .get<OrderReport>(`/admin/reports/order-report?${params}`)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load the order report");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [preset, from, to, activeChannelId]);

  return (
    <div>
      <PageHeader
        title="Order Report"
        description={
          activeChannel
            ? `Website-to-fulfillment funnel for ${activeChannel.name}.`
            : "Website-to-fulfillment funnel across every store you can access."
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-lg bg-black/5 p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                preset === p.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
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
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
          {error}
        </p>
      )}

      {/* A dark panel (not the shared light Card) — the tinted, bordered
          funnel boxes below are designed against a dark backdrop, matching
          the reference diagram; nothing else on this page, or any other
          page, uses this styling. */}
      <div className="relative overflow-x-auto rounded-card border border-black/5 bg-slate-900 p-8 shadow-card">
        {!report ? (
          <LoadingLine />
        ) : (
          <>
            {/* Total Incoming Orders — a standalone KPI card pinned to the
                top-left corner, not a node in the funnel tree below it. */}
            <div
              className={`mb-10 flex w-fit items-center gap-3 rounded-2xl border px-4 py-3 sm:absolute sm:left-8 sm:top-8 sm:mb-0 ${TONES.incoming.panel}`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONES.incoming.iconBg}`}>
                <InboxIcon className={`h-5 w-5 ${TONES.incoming.iconText}`} />
              </div>
              <div>
                <div className="text-xs font-medium text-white/60">Total Incoming Orders</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-white">{report.totalIncoming.count}</span>
                  <span className={`text-sm font-semibold ${TONES.incoming.amount}`}>
                    ৳{formatAmount(report.totalIncoming.amount)}
                  </span>
                </div>
                <div className="text-[11px] text-white/40">Web Orders + Outside Web</div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-0">
              <FunnelBox icon={GlobeIcon} label="From Website Orders" metric={report.fromWebsite} tone={TONES.website} />
              <Branch
                stemTone={TONES.website}
                maxWidthClass="max-w-2xl"
                items={[
                  {
                    tone: TONES.approvedWeb,
                    node: (
                      <FunnelBox
                        icon={CheckCircleIcon}
                        label="Approved From Web"
                        metric={report.approvedFromWeb}
                        tone={TONES.approvedWeb}
                      />
                    ),
                  },
                  {
                    tone: TONES.approvedOutside,
                    connected: false,
                    node: (
                      <FunnelBox
                        icon={CheckCircleIcon}
                        label="Approved Outside Web"
                        metric={report.approvedOutsideWeb}
                        tone={TONES.approvedOutside}
                      />
                    ),
                  },
                ]}
              />
              <Merge tones={[TONES.approvedWeb, TONES.approvedOutside]} stemTone={TONES.total} maxWidthClass="max-w-2xl" />
              <div
                className={`flex items-center gap-2 rounded-full border px-6 py-2.5 text-base ${TONES.total.panel}`}
              >
                <span className="font-semibold text-white/80">Total Orders</span>
                <span className="font-bold text-white">{report.totalOrders.count}</span>
                <span className="text-slate-400">·</span>
                <span className="font-medium text-slate-400">৳{formatAmount(report.totalOrders.amount)}</span>
              </div>
              <Branch
                stemTone={TONES.total}
                items={[
                  {
                    tone: TONES.delivered,
                    node: <FunnelBox icon={TruckIcon} label="Delivered" metric={report.delivered} tone={TONES.delivered} />,
                  },
                  {
                    tone: TONES.partial,
                    node: <FunnelBox icon={BoxIcon} label="Partial" metric={report.partial} tone={TONES.partial} />,
                  },
                  {
                    tone: TONES.cancelled,
                    node: (
                      <FunnelBox
                        icon={XCircleIcon}
                        label="Cancelled"
                        metric={report.cancelled}
                        tone={TONES.cancelled}
                        sub="Includes pending cancel"
                      />
                    ),
                  },
                  {
                    tone: TONES.returned,
                    node: (
                      <FunnelBox
                        icon={UndoIcon}
                        label="Returned"
                        metric={report.returned}
                        tone={TONES.returned}
                        sub="Includes pending returns"
                      />
                    ),
                  },
                ]}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

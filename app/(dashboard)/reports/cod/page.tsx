"use client";

import { useEffect, useState, type ReactNode, type SVGProps } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import { formatAmount } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Input, Label } from "@/components/ui/input";
import { LoadingLine } from "@/components/ui/spinner";
import type { CodReport, OrderReportMetric } from "@/lib/types";

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

// Same Tone/Branch/FunnelBox pattern as the Order Report page — duplicated
// here (not imported) since that page keeps everything local and isn't
// meant to be touched for this feature. Tailwind class names are spelled
// out in full (not templated) because dynamic `bg-${c}-600` strings aren't
// picked up by Tailwind's static build-time scan.
interface Tone {
  panel: string;
  iconBg: string;
  iconText: string;
  amount: string;
  line: string;
  arrow: string;
}

const TONES: Record<string, Tone> = {
  parcels: {
    panel: "border-cyan-500/40 bg-cyan-500/10",
    iconBg: "bg-cyan-500/20",
    iconText: "text-cyan-400",
    amount: "text-cyan-300",
    line: "bg-cyan-500",
    arrow: "text-cyan-500",
  },
  customer: {
    panel: "border-blue-500/40 bg-blue-500/10",
    iconBg: "bg-blue-500/20",
    iconText: "text-blue-400",
    amount: "text-blue-300",
    line: "bg-blue-500",
    arrow: "text-blue-500",
  },
  steadfast: {
    panel: "border-orange-500/40 bg-orange-500/10",
    iconBg: "bg-orange-500/20",
    iconText: "text-orange-400",
    amount: "text-orange-300",
    line: "bg-orange-500",
    arrow: "text-orange-500",
  },
};

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
function PackageIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <path d="M10 2.5 17 6v8l-7 3.5L3 14V6l7-3.5Z" />
      <path d="M3 6l7 3.5L17 6" />
      <path d="M10 9.5V17.5" />
    </svg>
  );
}
function UserIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.8 16.2c1-2.8 3.4-4.4 6.2-4.4s5.2 1.6 6.2 4.4" />
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
// child's box.
function Branch({
  stemTone,
  items,
  maxWidthClass = "max-w-2xl",
}: {
  stemTone: Tone;
  items: { node: ReactNode; tone: Tone }[];
  maxWidthClass?: string;
}) {
  const count = items.length;
  return (
    <div className="flex w-full flex-col items-center">
      <div className={`h-6 w-0.5 rounded-full ${stemTone.line}`} />
      <div className={`flex w-full ${maxWidthClass}`}>
        {items.map((item, i) => (
          <div key={i} className="flex min-w-0 flex-1 justify-center">
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
          </div>
        ))}
      </div>
      <div className={`flex w-full ${maxWidthClass}`}>
        {items.map((item, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-0 px-2 sm:px-3">
            <div className={`h-5 w-0.5 rounded-full ${item.tone.line}`} />
            <Arrow className={item.tone.arrow} />
            <div className="mt-2 w-full">{item.node}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CodReportPage() {
  const { activeChannelId, activeChannel } = useChannelScope();
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<CodReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const range = preset === "custom" ? { from, to } : presetRange(preset);
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    if (activeChannelId) params.set("channelId", activeChannelId);

    // Same cancelled-flag guard as the Order Report page — a slower
    // in-flight request for a preset the user already switched away from
    // must never overwrite a later, faster result.
    let cancelled = false;
    setError(null);
    api
      .get<CodReport>(`/admin/reports/cod-report?${params}`)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load the COD report");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [preset, from, to, activeChannelId]);

  return (
    <div>
      <PageHeader
        title="COD Report"
        description={
          activeChannel
            ? `Customer delivery charge vs. Steadfast's actual cost for ${activeChannel.name}.`
            : "Customer delivery charge vs. Steadfast's actual cost across every store you can access."
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

      <div className="relative overflow-x-auto rounded-card border border-black/5 bg-slate-900 p-8 shadow-card">
        {!report ? (
          <LoadingLine />
        ) : (
          <div className="flex flex-col items-center gap-0">
            <FunnelBox
              icon={PackageIcon}
              label="Total Delivered Parcel"
              metric={report.totalParcels}
              tone={TONES.parcels}
              sub="Delivered + pending return + returned"
            />
            <Branch
              stemTone={TONES.parcels}
              items={[
                {
                  tone: TONES.customer,
                  node: (
                    <FunnelBox
                      icon={UserIcon}
                      label="Customer Delivery Charge"
                      metric={report.totalParcels}
                      tone={TONES.customer}
                    />
                  ),
                },
                {
                  tone: TONES.steadfast,
                  node: (
                    <FunnelBox
                      icon={TruckIcon}
                      label="Steadfast Delivery Charge"
                      metric={report.steadfastCharge}
                      tone={TONES.steadfast}
                      sub={`COD ৳${formatAmount(report.codCharge.amount)} · Delivery ৳${formatAmount(report.deliveryCharge.amount)}`}
                    />
                  ),
                },
              ]}
            />
            <p className="mt-8 max-w-md text-center text-[11px] text-white/40">
              Delivery charge is a flat ৳70 per parcel; COD charge is 1% of COD collected, applied
              to delivered parcels only — returned parcels ({report.returned.count}) carry no COD
              charge. Neither figure is pulled from Steadfast&apos;s API; both are computed here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

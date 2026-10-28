"use client";

import { useEffect, useRef, useState, type SVGProps } from "react";
import {
  STAT_RANGE_CUSTOM,
  STAT_RANGE_EXTENDED,
  STAT_RANGE_LABELS,
  STAT_RANGE_QUICK,
  formatDisplayDate,
  formatDisplayDateShort,
  todayStr,
  type StatRange,
} from "@/lib/stat-date-range";
import { SelectDateModal } from "./select-date-modal";
import { SelectRangeModal } from "./select-range-modal";

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
function ClockIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 2.5" />
    </svg>
  );
}
function CalendarIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <rect x="3" y="4.5" width="14" height="12" rx="1.5" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" />
    </svg>
  );
}
function SparkleIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)}>
      <path d="M10 3.5 11.3 8 15.5 9 11.3 10 10 14.5 8.7 10 4.5 9 8.7 8Z" />
    </svg>
  );
}
function CheckIcon(props: IconProps) {
  return (
    <svg {...iconBase(props)} strokeWidth={2}>
      <path d="M5 10.3l3 3 7-7" />
    </svg>
  );
}

// "today"/"yesterday" are a point in time (clock), "lifetime" is open-ended
// (sparkle), everything else (including both custom entries) is a
// calendar span.
function rangeIcon(key: StatRange) {
  if (key === "today" || key === "yesterday") return ClockIcon;
  if (key === "lifetime") return SparkleIcon;
  return CalendarIcon;
}

// The "📅 Today ▾" filter control for the Dashboard's Total Orders /
// Pending Web Orders cards — same trigger-button pattern as
// DateRangeSelect, with a three-section (Quick select / Extended range /
// Custom) panel, a per-row icon, the selected row shown as a highlighted
// pill with a filled checkmark badge, and the two Custom entries opening a
// calendar modal instead of applying a fixed range directly.
export function StatDateRangeSelect({
  value,
  customFrom,
  customTo,
  onChange,
}: {
  value: StatRange;
  customFrom?: string;
  customTo?: string;
  onChange: (range: StatRange, customFrom?: string, customTo?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"date" | "range" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const today = todayStr();

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function triggerLabel(): string {
    if (value === "customDate") return customFrom ? formatDisplayDate(customFrom) : STAT_RANGE_LABELS[value];
    if (value === "customRange") {
      if (!customFrom || !customTo) return STAT_RANGE_LABELS[value];
      return customFrom === customTo
        ? formatDisplayDate(customFrom)
        : `${formatDisplayDateShort(customFrom)} – ${formatDisplayDateShort(customTo)}`;
    }
    return STAT_RANGE_LABELS[value];
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
      >
        📅 {triggerLabel()}
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-black/10 bg-card py-1.5 shadow-card">
          <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
            Quick select
          </div>
          {STAT_RANGE_QUICK.map((r) => (
            <Option
              key={r.key}
              rangeKey={r.key}
              label={r.label}
              value={value}
              onSelect={() => onChange(r.key)}
              setOpen={setOpen}
            />
          ))}
          <div className="my-1 border-t border-black/5" />
          <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
            Extended range
          </div>
          {STAT_RANGE_EXTENDED.map((r) => (
            <Option
              key={r.key}
              rangeKey={r.key}
              label={r.label}
              value={value}
              onSelect={() => onChange(r.key)}
              setOpen={setOpen}
            />
          ))}
          <div className="my-1 border-t border-black/5" />
          <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
            Custom
          </div>
          {STAT_RANGE_CUSTOM.map((r) => (
            <Option
              key={r.key}
              rangeKey={r.key}
              label={r.label}
              value={value}
              onSelect={() => setModal(r.key === "customDate" ? "date" : "range")}
              setOpen={setOpen}
            />
          ))}
        </div>
      )}

      <SelectDateModal
        open={modal === "date"}
        initialDate={value === "customDate" && customFrom ? customFrom : today}
        today={today}
        onApply={(date) => {
          onChange("customDate", date, date);
          setModal(null);
        }}
        onClose={() => setModal(null)}
      />
      <SelectRangeModal
        open={modal === "range"}
        initialFrom={value === "customRange" && customFrom ? customFrom : today}
        initialTo={value === "customRange" && customTo ? customTo : today}
        today={today}
        onApply={(from, to) => {
          onChange("customRange", from, to);
          setModal(null);
        }}
        onClose={() => setModal(null)}
      />
    </div>
  );
}

function Option({
  rangeKey,
  label,
  value,
  onSelect,
  setOpen,
}: {
  rangeKey: StatRange;
  label: string;
  value: StatRange;
  onSelect: () => void;
  setOpen: (open: boolean) => void;
}) {
  const selected = rangeKey === value;
  const Icon = rangeIcon(rangeKey);
  return (
    <button
      type="button"
      onClick={() => {
        onSelect();
        setOpen(false);
      }}
      className={`mx-1.5 my-0.5 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
        selected ? "bg-status-delivered/10 font-medium text-status-delivered" : "text-foreground/70 hover:bg-black/5"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-status-delivered" : "text-foreground/40"}`} />
      <span className="flex-1">{label}</span>
      {selected && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-status-delivered text-white">
          <CheckIcon className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  );
}

// Richer date-range picker for the Dashboard's Total Orders / Pending Web
// Orders cards — a superset of lib/date-range.ts's simpler "Today ▾"
// control (which stays as-is for the report cards already using it).
export type StatRange =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "lastYear"
  | "lifetime"
  | "customDate"
  | "customRange";

export const STAT_RANGE_QUICK: { key: StatRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

export const STAT_RANGE_EXTENDED: { key: StatRange; label: string }[] = [
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "thisYear", label: "This year" },
  { key: "lastYear", label: "Last year" },
  { key: "lifetime", label: "Lifetime" },
];

// Not preset buttons (picking either opens a calendar modal instead of
// applying a fixed range) — still needs a menu entry each.
export const STAT_RANGE_CUSTOM: { key: StatRange; label: string }[] = [
  { key: "customDate", label: "Select a date" },
  { key: "customRange", label: "Custom range" },
];

export const STAT_RANGE_LABELS: Record<StatRange, string> = Object.fromEntries(
  [...STAT_RANGE_QUICK, ...STAT_RANGE_EXTENDED, ...STAT_RANGE_CUSTOM].map((r) => [r.key, r.label]),
) as Record<StatRange, string>;

function toDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function formatDisplayDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDisplayDateShort(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Absolute [from, to] bounds (YYYY-MM-DD, inclusive, browser-local calendar
// days — same convention the Order/COD Report preset pickers already use)
// for a stat range. "lifetime" uses a fixed far-past floor rather than an
// open-ended bound, so every caller can treat the result as a plain
// from/to pair with no separate null-bound case to handle. "customDate"/
// "customRange" come from the calendar modals — customFrom/customTo are
// required for those two and ignored otherwise.
export function statRangeBounds(
  range: StatRange,
  customFrom?: string,
  customTo?: string,
): { from: string; to: string } {
  const now = new Date();
  switch (range) {
    case "today":
      return { from: toDateStr(now), to: toDateStr(now) };
    case "yesterday": {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return { from: toDateStr(d), to: toDateStr(d) };
    }
    case "7d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: toDateStr(from), to: toDateStr(now) };
    }
    case "30d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: toDateStr(from), to: toDateStr(now) };
    }
    case "thisMonth":
      return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: toDateStr(now) };
    case "lastMonth":
      return {
        from: toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toDateStr(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "thisYear":
      return { from: toDateStr(new Date(now.getFullYear(), 0, 1)), to: toDateStr(now) };
    case "lastYear":
      return {
        from: toDateStr(new Date(now.getFullYear() - 1, 0, 1)),
        to: toDateStr(new Date(now.getFullYear() - 1, 11, 31)),
      };
    case "lifetime":
      return { from: "2000-01-01", to: toDateStr(now) };
    case "customDate":
      return { from: customFrom ?? toDateStr(now), to: customFrom ?? toDateStr(now) };
    case "customRange":
      return { from: customFrom ?? toDateStr(now), to: customTo ?? customFrom ?? toDateStr(now) };
  }
}

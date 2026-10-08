// Shared by every dashboard report card with a "Today ▾" filter (Web Order
// Report, Orders by Source), so they all offer the same choices and compute
// the same cutoff the same way.
export type DateRange = "today" | "7d" | "30d" | "all";

export const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

// null means no cutoff — every row passes.
export function dateRangeCutoff(range: DateRange): Date | null {
  const now = new Date();
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (range === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

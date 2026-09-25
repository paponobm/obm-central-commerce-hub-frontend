// Part-to-whole breakdown as a horizontal stacked bar + legend — the form
// the dataviz skill's own choosing-a-form guide calls for here ("part-to-
// whole -> stacked bar, go horizontal for many/long-named categories"),
// not a donut. Colors are the skill's validated 8-slot categorical palette
// in its fixed, CVD-safe order — never reordered or cycled per series.
const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

export interface StackedBarSegment {
  label: string;
  value: number;
}

export function StackedBarChart({ segments }: { segments: StackedBarSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);

  if (total === 0) {
    return <p className="text-sm text-foreground/50">No data yet.</p>;
  }

  return (
    <div>
      {/* The bar: each segment's flex-basis is its share of the total; a
          2px surface gap (the chart's white/card background) separates
          touching segments per the skill's mark spec, done here via a
          border rather than a true gap so segments still sum to 100%. */}
      <div className="flex h-8 w-full overflow-hidden rounded-md">
        {visible.map((s, i) => {
          const pct = (s.value / total) * 100;
          const colorIndex = segments.indexOf(s);
          return (
            <div
              key={s.label}
              style={{
                width: `${pct}%`,
                backgroundColor: SERIES_COLORS[colorIndex % SERIES_COLORS.length],
              }}
              className={i > 0 ? "border-l-2 border-card" : ""}
              title={`${s.label}: ${s.value} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend — always present for 2+ series; label + count are always
          visible text (never color-alone), which is also what the
          palette's contrast WARN requires as "relief" for its lighter
          slots (aqua, yellow, magenta). */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {segments.map((s) => {
          const colorIndex = segments.indexOf(s);
          return (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[colorIndex % SERIES_COLORS.length] }}
              />
              <span className="text-foreground/70">{s.label}</span>
              <span className="ml-auto font-medium text-foreground">{s.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Shifts a {year, month} pair by `delta` months, rolling the year over at
// either end — shared by both calendar modals' prev/next controls.
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  if (m < 0) {
    m = 11;
    y -= 1;
  } else if (m > 11) {
    m = 0;
    y += 1;
  }
  return { year: y, month: m };
}

// 42 cells (6 full weeks, Sunday-first) covering the given month plus its
// leading/trailing padding days from the adjacent months.
function buildMonthGrid(year: number, month: number): { date: string; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const cells: { date: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({ date: toDateStr(d), inMonth: d.getMonth() === month });
  }
  return cells;
}

// One month's day grid — today gets an outline, the selected endpoint(s)
// a solid fill, and anything strictly between selectedFrom/selectedTo a
// light fill (range mode; single-date callers pass the same value for
// both and never trigger this).
export function MiniCalendar({
  year,
  month,
  today,
  selectedFrom,
  selectedTo,
  onSelectDay,
}: {
  year: number;
  month: number;
  today: string;
  selectedFrom?: string;
  selectedTo?: string;
  onSelectDay: (date: string) => void;
}) {
  const cells = buildMonthGrid(year, month);
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-foreground/40">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {cells.map((c) => {
          const isStart = c.date === selectedFrom;
          const isEnd = c.date === selectedTo;
          const inRange = Boolean(
            selectedFrom && selectedTo && selectedFrom !== selectedTo && c.date > selectedFrom && c.date < selectedTo,
          );
          const isToday = c.date === today;
          return (
            <button
              key={c.date}
              type="button"
              onClick={() => onSelectDay(c.date)}
              className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                isStart || isEnd
                  ? "bg-status-delivered font-semibold text-white"
                  : inRange
                    ? // bg-status-delivered/NN doesn't render — that token is a
                      // plain CSS var (not an rgb-channel triplet), so Tailwind's
                      // opacity-suffix math on it is a no-op. color-mix() as an
                      // arbitrary value sidesteps that without touching the
                      // shared color config other components rely on.
                      "bg-[color-mix(in_srgb,var(--status-delivered)_18%,transparent)] text-foreground"
                    : isToday
                      ? "border border-status-delivered font-medium text-status-delivered"
                      : c.inMonth
                        ? "text-foreground/80 hover:bg-black/5"
                        : "text-foreground/25 hover:bg-black/5"
              }`}
            >
              {Number(c.date.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

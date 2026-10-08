"use client";

import { useEffect, useRef, useState } from "react";
import { DATE_RANGES, type DateRange } from "@/lib/date-range";

// The "Today ▾" control used by every filterable dashboard report card.
export function DateRangeSelect({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const label = DATE_RANGES.find((r) => r.key === value)?.label ?? "Today";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
      >
        📅 {label}
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-black/10 bg-card py-1 shadow-card">
          {DATE_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => {
                onChange(r.key);
                setOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-black/5 ${
                r.key === value ? "font-medium text-primary" : "text-foreground/70"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

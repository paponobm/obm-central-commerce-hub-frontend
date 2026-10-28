"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { Button } from "./button";
import { MiniCalendar, monthLabel, shiftMonth } from "./mini-calendar";
import { formatDisplayDate } from "@/lib/stat-date-range";

// Two synced months with a single shared prev/next pair, plus a two-click
// range select: the first click starts a fresh (zero-length) range, the
// second click sets the other end, normalized so from <= to.
export function SelectRangeModal({
  open,
  initialFrom,
  initialTo,
  today,
  onApply,
  onClose,
}: {
  open: boolean;
  initialFrom: string;
  initialTo: string;
  today: string;
  onApply: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const initial = new Date(`${initialFrom}T00:00:00`);
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [pickingEnd, setPickingEnd] = useState(false);

  function handleSelect(date: string) {
    if (!pickingEnd) {
      setFrom(date);
      setTo(date);
      setPickingEnd(true);
      return;
    }
    if (date < from) {
      setTo(from);
      setFrom(date);
    } else {
      setTo(date);
    }
    setPickingEnd(false);
  }

  const nextView = shiftMonth(view.year, view.month, 1);

  return (
    <Modal open={open} onClose={onClose} title="📅 Select date range" size="lg">
      <p className="mb-4 text-xs text-foreground/50">
        {formatDisplayDate(from)} — {formatDisplayDate(to)}
      </p>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
              aria-label="Previous month"
              className="flex h-6 w-6 items-center justify-center rounded text-foreground/50 hover:bg-black/5"
            >
              ‹
            </button>
            <div className="text-sm font-medium text-foreground">{monthLabel(view.year, view.month)}</div>
            <span className="w-6" />
          </div>
          <div className="mt-3">
            <MiniCalendar year={view.year} month={view.month} today={today} selectedFrom={from} selectedTo={to} onSelectDay={handleSelect} />
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="w-6" />
            <div className="text-sm font-medium text-foreground">{monthLabel(nextView.year, nextView.month)}</div>
            <button
              type="button"
              onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
              aria-label="Next month"
              className="flex h-6 w-6 items-center justify-center rounded text-foreground/50 hover:bg-black/5"
            >
              ›
            </button>
          </div>
          <div className="mt-3">
            <MiniCalendar
              year={nextView.year}
              month={nextView.month}
              today={today}
              selectedFrom={from}
              selectedTo={to}
              onSelectDay={handleSelect}
            />
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={() => onApply(from, to)}>
          Apply Range
        </Button>
      </div>
    </Modal>
  );
}

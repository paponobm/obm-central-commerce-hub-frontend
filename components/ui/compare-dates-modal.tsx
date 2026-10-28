"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { Button } from "./button";
import { MiniCalendar, monthLabel, shiftMonth } from "./mini-calendar";
import { formatDisplayDate } from "@/lib/stat-date-range";

// Two independent single-date pickers side by side — unlike
// SelectRangeModal, these are two unrelated dates (a day and whatever day
// it's compared against), not a continuous span, so each calendar tracks
// its own selection with no in-between highlighting.
export function CompareDatesModal({
  open,
  initialDate,
  initialCompareDate,
  today,
  onApply,
  onClose,
}: {
  open: boolean;
  initialDate: string;
  initialCompareDate: string;
  today: string;
  onApply: (date: string, compareDate: string) => void;
  onClose: () => void;
}) {
  const dateStart = new Date(`${initialDate}T00:00:00`);
  const compareStart = new Date(`${initialCompareDate}T00:00:00`);
  const [leftView, setLeftView] = useState({ year: dateStart.getFullYear(), month: dateStart.getMonth() });
  const [rightView, setRightView] = useState({ year: compareStart.getFullYear(), month: compareStart.getMonth() });
  const [date, setDate] = useState(initialDate);
  const [compareDate, setCompareDate] = useState(initialCompareDate);

  return (
    <Modal open={open} onClose={onClose} title="📅 Compare dates" size="lg">
      <p className="mb-4 text-xs text-foreground/50">
        {formatDisplayDate(date)} vs {formatDisplayDate(compareDate)}
      </p>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex-1">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">Date</div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setLeftView((v) => shiftMonth(v.year, v.month, -1))}
              aria-label="Previous month"
              className="flex h-6 w-6 items-center justify-center rounded text-foreground/50 hover:bg-black/5"
            >
              ‹
            </button>
            <div className="text-sm font-medium text-foreground">{monthLabel(leftView.year, leftView.month)}</div>
            <button
              type="button"
              onClick={() => setLeftView((v) => shiftMonth(v.year, v.month, 1))}
              aria-label="Next month"
              className="flex h-6 w-6 items-center justify-center rounded text-foreground/50 hover:bg-black/5"
            >
              ›
            </button>
          </div>
          <div className="mt-3">
            <MiniCalendar
              year={leftView.year}
              month={leftView.month}
              today={today}
              selectedFrom={date}
              selectedTo={date}
              onSelectDay={setDate}
            />
          </div>
        </div>
        <div className="flex-1">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">Compare to</div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setRightView((v) => shiftMonth(v.year, v.month, -1))}
              aria-label="Previous month"
              className="flex h-6 w-6 items-center justify-center rounded text-foreground/50 hover:bg-black/5"
            >
              ‹
            </button>
            <div className="text-sm font-medium text-foreground">{monthLabel(rightView.year, rightView.month)}</div>
            <button
              type="button"
              onClick={() => setRightView((v) => shiftMonth(v.year, v.month, 1))}
              aria-label="Next month"
              className="flex h-6 w-6 items-center justify-center rounded text-foreground/50 hover:bg-black/5"
            >
              ›
            </button>
          </div>
          <div className="mt-3">
            <MiniCalendar
              year={rightView.year}
              month={rightView.month}
              today={today}
              selectedFrom={compareDate}
              selectedTo={compareDate}
              onSelectDay={setCompareDate}
            />
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={() => onApply(date, compareDate)}>
          Apply
        </Button>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { MiniCalendar, monthLabel, shiftMonth } from "./mini-calendar";

// A single-month picker — clicking a day applies it immediately (no
// separate confirm step, same as a native <input type="date">).
export function SelectDateModal({
  open,
  initialDate,
  today,
  onApply,
  onClose,
}: {
  open: boolean;
  initialDate: string;
  today: string;
  onApply: (date: string) => void;
  onClose: () => void;
}) {
  const initial = new Date(`${initialDate}T00:00:00`);
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  return (
    <Modal open={open} onClose={onClose} title="📅 Select a date">
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
          year={view.year}
          month={view.month}
          today={today}
          selectedFrom={initialDate}
          selectedTo={initialDate}
          onSelectDay={onApply}
        />
      </div>
    </Modal>
  );
}

"use client";

import type { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  titleClassName = "",
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  // Every existing caller keeps the default title size untouched — only an
  // explicit opt-in bumps it, same pattern as the "lg" size opt-in below.
  titleClassName?: string;
  children: ReactNode;
  // "lg" is wider and allows the modal itself to grow taller (up to the
  // viewport) instead of only the default compact form size. "xl" is wider
  // still, for multi-column forms — both opt-in, so every existing modal
  // keeps its exact current size.
  size?: "md" | "lg" | "xl";
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`flex w-full flex-col rounded-card bg-card p-6 shadow-card ${
          size === "xl"
            ? "max-w-4xl max-h-[85vh]"
            : size === "lg"
              ? "max-w-2xl max-h-[85vh]"
              : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className={`text-sm font-semibold text-foreground ${titleClassName}`}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-cancelled text-base text-white hover:opacity-90"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

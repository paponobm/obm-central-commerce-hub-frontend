"use client";

import type { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  // "lg" is wider and allows the modal itself to grow taller (up to the
  // viewport) instead of only the default compact form size — opt-in, so
  // every existing modal keeps its exact current size.
  size?: "md" | "lg";
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`flex w-full flex-col rounded-card bg-card p-6 shadow-card ${
          size === "lg" ? "max-w-2xl max-h-[85vh]" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-foreground/40 hover:text-foreground"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

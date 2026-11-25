"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Shared by the New and Edit Product pages — same 7 tabs, same stub content
// for the ones with nothing built yet, same "has a missing required field"
// dot logic, so the two pages can't silently drift apart.
export const PRODUCT_TABS = [
  { key: "general", label: "General" },
  { key: "priceVariants", label: "Price & Variants" },
  { key: "stockDelivery", label: "Stock & Delivery" },
  { key: "detailsCompliance", label: "Details & Compliance" },
  { key: "seo", label: "SEO" },
  { key: "marketing", label: "Marketing" },
  { key: "activity", label: "Activity" },
] as const;

export type ProductTabKey = (typeof PRODUCT_TABS)[number]["key"];

export interface ChecklistItem {
  label: string;
  done: boolean;
  // Which tab this requirement's field actually lives on — null when the
  // field lives in the sidebar (Thumbnail) instead of any tab, so it has
  // nowhere to put a dot.
  tab: ProductTabKey | null;
}

export function ProductTabNav({
  tab,
  onChange,
  checklist,
}: {
  tab: ProductTabKey;
  onChange: (tab: ProductTabKey) => void;
  checklist: ChecklistItem[];
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {PRODUCT_TABS.map((t) => {
        const hasIssue = checklist.some((c) => c.tab === t.key && !c.done);
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`relative whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-foreground/60 hover:text-foreground"
            }`}
          >
            {t.label}
            {hasIssue && (
              <span className="absolute right-0.5 top-2.5 h-1.5 w-1.5 rounded-full bg-status-pending" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

// Sits beside the tab nav on both the New and Edit Product pages — once a
// real draft product exists (right after the New page's first auto-save,
// or always on the Edit page), shows whether the draft is currently
// up to date, plus the "Duplicate" button.
export function DraftAutoSaveStatus({
  status,
  onDuplicate,
  duplicating,
}: {
  status: "saving" | "saved" | null;
  onDuplicate: () => void;
  duplicating: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 pb-1 pl-2">
      {status === "saving" && <span className="text-sm text-foreground/50">Saving…</span>}
      {status === "saved" && (
        <span className="flex items-center gap-1 text-sm font-medium text-status-delivered">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Draft auto-saved
        </span>
      )}
      <Button type="button" variant="secondary" disabled={duplicating} onClick={onDuplicate} className="!text-sm">
        {duplicating ? "Duplicating…" : "Duplicate"}
      </Button>
    </div>
  );
}

// Placeholder for the four tabs with no content yet (Stock & Delivery,
// Details & Compliance, Marketing, Activity) — visible and clearly labeled
// rather than hidden, so it's obvious more is coming rather than looking
// broken or forgotten.
export function ComingSoonTab({ label }: { label: string }) {
  return (
    <Card>
      <h2 className="mb-1 text-lg font-bold text-primary">{label}</h2>
      <p className="text-sm text-foreground/50">Nothing here yet — coming soon.</p>
    </Card>
  );
}

// Genuinely pins the footer to the bottom of the screen, always — a plain
// `sticky bottom-0` only "catches" an element while its container has
// scrollable overflow to catch it from; on a tab with little content (or a
// tall screen) there's nothing to scroll, so a sticky footer just sits
// wherever the content ends, floating well above the real bottom of the
// page. Portaled straight to <body> so `position: fixed` is genuinely
// viewport-relative (nested inside the page it can get clipped/dragged by
// the dashboard layout's own scrolling <main>).
//
// It's constrained to the dashboard's own <main> content column (measured
// live, not `inset-x-0`) — a full-viewport-width bar would otherwise paint
// over the left Sidebar, since the portal escapes the page's own layout
// entirely. A ResizeObserver on <main> keeps it correct as the Sidebar
// collapses/expands (that changes main's width, which this also catches).
export function ProductFooterBar({ children }: { children: ReactNode }) {
  const [bounds, setBounds] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const update = () => {
      const rect = main.getBoundingClientRect();
      setBounds({ left: rect.left, width: rect.width });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(main);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!bounds) return null;

  return createPortal(
    <div
      className="fixed bottom-0 z-30 bg-card px-4 pt-3 shadow-card sm:px-6"
      style={{ left: bounds.left, width: bounds.width }}
    >
      <div className="mx-auto max-w-[1600px]">{children}</div>
    </div>,
    document.body,
  );
}

// The footer's "Ready to publish: X/Y" line + progress bar — shared so both
// pages count the same way.
export function PublishChecklist({ checklist }: { checklist: ChecklistItem[] }) {
  const done = checklist.filter((c) => c.done).length;
  const missing = checklist.filter((c) => !c.done);
  return (
    <div className="mb-3">
      <p className="mb-2 text-sm text-foreground/70">
        Ready to publish: <span className="font-bold text-foreground">{done}/{checklist.length}</span>
        {missing.length > 0 && <> · remaining: {missing.map((m) => m.label).join(", ")}</>}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(done / checklist.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

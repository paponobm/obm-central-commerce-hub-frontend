"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type {
  OrderListItem,
  OrderDetail,
  OrderStatus,
  OrderSource,
  PaymentStatus,
  PaymentMethod,
  Integration,
  InventorySummary,
} from "@/lib/types";
import { formatAmount, formatDateTime, formatRelativeTime } from "@/lib/format";
import { printInvoices, type InvoiceMode, type PaperSize } from "@/lib/print-invoice";
import { telHref } from "@/lib/phone";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Toast } from "@/components/ui/toast";
import { LoadingLine } from "@/components/ui/spinner";

// Small inline line icons for the Customer cell — plain outline style (no
// icon library in this app), matching currentColor so they pick up
// whatever opacity/color wrapper they're placed in.
function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 4h4l2 5-2.5 2.5a11 11 0 0 0 5 5L16 14l5 2v4a2 2 0 0 1-2 2 16 16 0 0 1-14-14 2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 21s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function PrinterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// Matches the reference tab set exactly. Confirmed/Processing aren't given
// their own tab (the reference doesn't show them either) but stay reachable
// — and countable — via "All".
const TABS: { label: string; value: OrderStatus | "" }[] = [
  { label: "Pending", value: "PENDING" },
  { label: "RTS", value: "READY_TO_SHIP" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Pending Return", value: "PENDING_RETURN" },
  { label: "Returned", value: "RETURNED" },
  { label: "Partial", value: "PARTIAL" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Pending Cancel", value: "PENDING_CANCEL" },
  { label: "Preorder", value: "PREORDER" },
  { label: "Lost", value: "LOST" },
  { label: "All", value: "" },
];

// Mirrors OrdersService's TRANSITIONS map — which statuses can still reach
// CANCELLED, i.e. when the row-level Cancel shortcut should even appear.
const CAN_CANCEL_FROM = new Set<OrderStatus>([
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "PENDING_CANCEL",
  "PREORDER",
]);

// The plain fulfillment pipeline. Bulk status moves only ever step to an
// order's own immediate neighbor here — never jump ahead or behind several
// stages at once, in either direction.
const PIPELINE: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED"];
const PIPELINE_LABEL: Partial<Record<OrderStatus, string>> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  READY_TO_SHIP: "RTS",
  SHIPPED: "Shipped",
};

// The steps to walk for the bulk "move forward" action. Every stage steps
// to just its immediate neighbor — except PENDING, which goes straight to
// RTS: Confirmed and Processing have no tab of their own to stop at, so
// there's nothing there for a bulk action to land on. An order already
// sitting in Confirmed or Processing (reached some other way) still only
// moves one step at a time from there.
function nextPathInPipeline(status: OrderStatus): OrderStatus[] | null {
  if (status === "PENDING") return ["CONFIRMED", "PROCESSING", "READY_TO_SHIP"];
  const i = PIPELINE.indexOf(status);
  return i >= 0 && i < PIPELINE.length - 1 ? [PIPELINE[i + 1]] : null;
}

function prevInPipeline(status: OrderStatus): OrderStatus | null {
  // Mirrors nextPathInPipeline's own PENDING -> RTS shortcut in reverse —
  // RTS steps straight back to PENDING, not PROCESSING, since neither
  // CONFIRMED nor PROCESSING has a tab to land on.
  if (status === "READY_TO_SHIP") return "PENDING";
  const i = PIPELINE.indexOf(status);
  return i > 0 ? PIPELINE[i - 1] : null;
}

type OrderFilters = {
  printFilter: "all" | "printed" | "not";
  dateRange: "all" | "today" | "7" | "30";
  sku: string;
  name: string;
  includeOtherProducts: boolean;
};

function orderMatchesFilters(o: OrderListItem, f: OrderFilters): boolean {
  if (f.printFilter === "printed" && !o.invoicePrinted) return false;
  if (f.printFilter === "not" && o.invoicePrinted) return false;
  if (f.dateRange !== "all") {
    const days = f.dateRange === "today" ? 1 : Number(f.dateRange);
    const cutoff = f.dateRange === "today"
      ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
      : Date.now() - days * 24 * 60 * 60 * 1000;
    if (new Date(o.createdAt).getTime() < cutoff) return false;
  }
  if (f.sku || f.name) {
    const itemMatches = (item: OrderListItem["items"][number]) =>
      (!f.sku || item.sku.toLowerCase().includes(f.sku)) &&
      (!f.name || item.productName.toLowerCase().includes(f.name));
    if (f.includeOtherProducts) {
      if (!o.items.some(itemMatches)) return false;
    } else if (!o.items.every(itemMatches)) {
      return false;
    }
  }
  return true;
}

// Standard palette classes (not theme tokens) so each source colour renders reliably.
const SOURCE_STYLE: Record<OrderSource, string> = {
  WEBSITE: "bg-indigo-100 text-indigo-700",
  MANUAL: "bg-violet-100 text-violet-700",
  FACEBOOK: "bg-blue-100 text-blue-700",
  PHONE: "bg-emerald-100 text-emerald-700",
  WHATSAPP: "bg-green-100 text-green-700",
  OTHER: "bg-amber-100 text-amber-700",
  UNKNOWN: "bg-gray-200 text-gray-600",
};

const SOURCES: OrderSource[] = ["WEBSITE", "MANUAL", "FACEBOOK", "PHONE", "WHATSAPP", "OTHER", "UNKNOWN"];
const PAYMENT_STATUSES: PaymentStatus[] = ["UNPAID", "PARTIAL", "PAID", "REFUNDED"];

// Order list date format: 04/10/2026,\n12:48 pm
function listDate(value: string): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hour = d.getHours() % 12 || 12;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()},\n${hour}:${pad(d.getMinutes())} ${d.getHours() < 12 ? "am" : "pm"}`;
}

function listUpdated(value: string): string {
  const minutes = (Date.now() - new Date(value).getTime()) / 60000;
  return minutes < 1 ? "less than a minute ago" : formatRelativeTime(value);
}

type SortKey = "createdAt" | "total" | "sku" | "quantity" | "shippingFee" | "discount";

const SORT_OPTIONS: { label: string; key: SortKey; dir: "asc" | "desc" }[] = [
  { label: "Date Created (Newest)", key: "createdAt", dir: "desc" },
  { label: "Date Created (Oldest)", key: "createdAt", dir: "asc" },
  { label: "Order Amount (High to Low)", key: "total", dir: "desc" },
  { label: "Order Amount (Low to High)", key: "total", dir: "asc" },
  { label: "SKU", key: "sku", dir: "asc" },
  { label: "Quantity (High to Low)", key: "quantity", dir: "desc" },
  { label: "Quantity (Low to High)", key: "quantity", dir: "asc" },
  { label: "Delivery Charge (High to Low)", key: "shippingFee", dir: "desc" },
  { label: "Delivery Charge (Low to High)", key: "shippingFee", dir: "asc" },
  { label: "Discount (High to Low)", key: "discount", dir: "desc" },
  { label: "Discount (Low to High)", key: "discount", dir: "asc" },
];

function sortValue(o: OrderListItem, key: SortKey): number | string {
  switch (key) {
    case "createdAt":
      return new Date(o.createdAt).getTime();
    case "total":
      return Number(o.total);
    case "shippingFee":
      return Number(o.shippingFee);
    case "discount":
      return Number(o.discount);
    case "quantity":
      return o.items.reduce((sum, i) => sum + i.quantity, 0);
    case "sku":
      return o.items[0]?.sku ?? "";
  }
}

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { channels: scopedChannels, activeChannelId: globalChannelId } =
    useChannelScope();

  // Fetched WITHOUT a status filter — status is filtered client-side so the
  // tab counts (computed from this same set) always match what's shown,
  // and switching tabs never needs a round trip. Source/channel/payment/
  // search still narrow the query server-side since those aren't tabs.
  const [allOrders, setAllOrders] = useState<OrderListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<OrderStatus | "">("PENDING");
  const [source, setSource] = useState("");
  const [channelId, setChannelId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  // Seeded from ?search= so the topbar's quick-search box lands here with
  // the term already applied, not just on the URL.
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [productsModal, setProductsModal] = useState<OrderListItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(true);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [printFilter, setPrintFilter] = useState<"all" | "printed" | "not">("all");
  const [dateRange, setDateRange] = useState<"all" | "today" | "7" | "30">("all");
  const [skuFilter, setSkuFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [includeOtherProducts, setIncludeOtherProducts] = useState(true);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // Fixed-position coords for the open row menu, captured from the trigger
  // button on click — the menu renders through a portal (see
  // renderActionsCell) so it isn't clipped by the table's own
  // overflow-auto scroll container near the bottom/edge of the list.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const [detailsData, setDetailsData] = useState<OrderDetail | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [paymentTxnId, setPaymentTxnId] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const channels = scopedChannels ?? [];

  // When a specific store is selected globally (via the topbar Store
  // Selector), this page's own channel filter follows it instead of
  // offering a second, conflicting way to pick a channel. Back to "All
  // Stores" globally hands control back to the page-level dropdown.
  useEffect(() => {
    setChannelId(globalChannelId ?? "");
  }, [globalChannelId]);

  async function loadOrders(searchTerm: string) {
    const params = new URLSearchParams();
    if (source) params.set("source", source);
    if (channelId) params.set("channelId", channelId);
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    if (searchTerm) params.set("search", searchTerm);
    const qs = params.toString();
    try {
      const data = await api.get<OrderListItem[]>(`/admin/orders${qs ? `?${qs}` : ""}`);
      setAllOrders(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load orders");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => loadOrders(search), 250); // debounce typing
    // No push channel from the backend (REST only), so a short poll stands
    // in for real-time — e.g. a Steadfast webhook marking an order
    // Delivered/Pending Return shows up here within one interval, no
    // manual refresh needed. Paused while the tab is hidden, mirroring the
    // same pattern already used on Web Orders.
    const interval = setInterval(() => {
      if (!document.hidden) loadOrders(search);
    }, 8000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, channelId, paymentStatus, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": allOrders?.length ?? 0 };
    for (const t of TABS) {
      if (t.value === "") continue;
      c[t.value] = allOrders?.filter((o) => o.status === t.value).length ?? 0;
    }
    return c;
  }, [allOrders]);

  const visibleOrders = useMemo(() => {
    if (!allOrders) return null;
    const tabbed = activeTab ? allOrders.filter((o) => o.status === activeTab) : allOrders;
    const filtered = tabbed.filter((o) => orderMatchesFilters(o, {
      printFilter,
      dateRange,
      sku: skuFilter.trim().toLowerCase(),
      name: nameFilter.trim().toLowerCase(),
      includeOtherProducts,
    }));
    if (!sort) return filtered;
    const sorted = [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [allOrders, activeTab, sort, printFilter, dateRange, skuFilter, nameFilter, includeOtherProducts]);

  // Drives which bulk "Update Status" buttons even show — e.g. selecting
  // only orders already sitting in RTS has nothing for "Sent to RTS" to do,
  // so that button (and the others, by the same rule) just doesn't appear.
  const selectedOrders = useMemo(
    () => (allOrders ?? []).filter((o) => selectedIds.has(o.id)),
    [allOrders, selectedIds],
  );
  // Each selected order moves to ITS OWN immediate next/previous stage, not
  // a single fixed target — these just collect that per-order target so the
  // button can show a specific name when the selection is all one status,
  // and fall back to a generic label when it's a mixed bag.
  const nextTargets = selectedOrders
    .map((o) => nextPathInPipeline(o.status)?.at(-1) ?? null)
    .filter((s): s is OrderStatus => s !== null);
  const canBulkNext = nextTargets.length > 0;
  const nextLabel = nextTargets.every((s) => s === nextTargets[0]) ? PIPELINE_LABEL[nextTargets[0]] : null;

  const prevTargets = selectedOrders
    .map((o) => prevInPipeline(o.status))
    .filter((s): s is OrderStatus => s !== null);
  const canBulkPrev = prevTargets.length > 0;
  const prevLabel = prevTargets.every((s) => s === prevTargets[0]) ? PIPELINE_LABEL[prevTargets[0]] : null;

  const canBulkCancel = selectedOrders.some((o) => CAN_CANCEL_FROM.has(o.status));
  // Mirrors the per-row "Entry to Steadfast" action's own eligibility —
  // same statuses it's offered for there.
  const canBulkSteadfast = selectedOrders.some(
    (o) => o.status === "PENDING" || o.status === "READY_TO_SHIP" || o.status === "SHIPPED",
  );

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
    });
  }

  // A selection only ever makes sense against the tab you made it on —
  // switching tabs drops it, so coming back to a tab never shows stale
  // checkmarks left over from before you navigated away.
  function selectTab(value: OrderStatus | "") {
    setActiveTab(value);
    setSelectedIds(new Set());
  }

  function toggleRowSelected(orderId: string) {
    setBulkMenuOpen(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!visibleOrders) return;
    setBulkMenuOpen(true);
    setSelectedIds((prev) =>
      prev.size === visibleOrders.length ? new Set() : new Set(visibleOrders.map((o) => o.id)),
    );
  }

  // Moves each selected order exactly one step along PIPELINE — never
  // multiple stages in one click. Each order advances from ITS OWN current
  // status, so a mixed selection (some Pending, some Processing) ends up at
  // different targets, each just one step ahead of where it started.
  async function bulkMoveNext() {
    if (!allOrders) return;
    const targets = allOrders.filter((o) => selectedIds.has(o.id));
    if (targets.length === 0) return;

    // Pre-flight stock check — READY_TO_SHIP is where stock actually gets
    // deducted (see deductOnShip in orders.service.ts, which rejects the
    // move outright if currentStock can't cover the order), so warn before
    // spending a network round trip on something that's going to fail, and
    // give the admin a clear reason instead of just letting it error out.
    const rtsTargets = targets.filter((o) => nextPathInPipeline(o.status)?.includes("READY_TO_SHIP"));
    if (rtsTargets.length > 0) {
      try {
        const inventory = await api.get<InventorySummary[]>("/admin/inventory");
        const stockByProduct = new Map(inventory.map((i) => [i.productId, i.currentStock]));
        const shortages: string[] = [];
        for (const o of rtsTargets) {
          for (const item of o.items) {
            const stock = stockByProduct.get(item.productId);
            if (stock !== undefined && stock < item.quantity) {
              shortages.push(`${o.orderNumber} — ${item.productName} (need ${item.quantity}, have ${stock})`);
            }
          }
        }
        if (shortages.length > 0) {
          const proceed = confirm(
            `These products aren't in stock and will fail to move to RTS:\n\n${shortages.join("\n")}\n\nContinue anyway? (orders with enough stock will still move normally)`,
          );
          if (!proceed) return;
        }
      } catch {
        // If the pre-check itself can't load, don't block the real action
        // on it — fall through and let the normal per-order error handling
        // below catch any actual failure.
      }
    }

    // Cleared up front, not after the walk + reload finish — each status
    // step is a real network round trip, so waiting until the very end left
    // the checkboxes looking "stuck" selected for several seconds after the
    // action had already been kicked off.
    setSelectedIds(new Set());
    setBulkBusy(true);
    setRowError(null);
    let failed = 0;
    let ineligible = 0;
    // Collected verbatim from the backend rather than reworded — moving to
    // READY_TO_SHIP is also where stock actually gets deducted (see
    // orders.service.ts), so a 409 here names the exact out-of-stock
    // product instead of a generic "something went wrong".
    const failedMessages: string[] = [];
    for (const o of targets) {
      const path = nextPathInPipeline(o.status);
      if (!path) {
        ineligible++;
        continue;
      }
      try {
        for (const step of path) {
          await api.patch(`/admin/orders/${o.id}/status`, { status: step });
        }
      } catch (err) {
        failed++;
        failedMessages.push(
          err instanceof ApiError
            ? `${o.orderNumber}: ${err.message}`
            : `${o.orderNumber}: failed to update`,
        );
      }
    }
    await loadOrders(search);
    setBulkBusy(false);
    if (failed > 0 || ineligible > 0) {
      setRowError(
        [
          ...failedMessages,
          ineligible > 0 ? `${ineligible} skipped (no next stage from their current status).` : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
  }

  async function bulkMovePrev() {
    if (!allOrders) return;
    const targets = allOrders.filter((o) => selectedIds.has(o.id));
    if (targets.length === 0) return;

    setSelectedIds(new Set());
    setBulkBusy(true);
    setRowError(null);
    let failed = 0;
    let ineligible = 0;
    for (const o of targets) {
      const prev = prevInPipeline(o.status);
      if (!prev) {
        ineligible++;
        continue;
      }
      try {
        await api.patch(`/admin/orders/${o.id}/status`, { status: prev });
      } catch {
        failed++;
      }
    }
    await loadOrders(search);
    setBulkBusy(false);
    if (failed > 0 || ineligible > 0) {
      setRowError(
        [
          failed > 0 ? `${failed} failed.` : null,
          ineligible > 0 ? `${ineligible} skipped (no previous stage from their current status).` : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
  }

  function runPrint(mode: InvoiceMode) {
    const selected = (allOrders ?? []).filter((o) => selectedIds.has(o.id));
    const storeName = globalChannelId
      ? channels.find((c) => c.id === globalChannelId)?.name ?? "Invoice"
      : "Invoice";
    if (printInvoices(selected, mode, storeName, paperSize)) {
      setShowPrintDialog(false);
      api
        .post("/admin/orders/print-log", { orderIds: selected.map((o) => o.id) })
        .then(() => loadOrders(search))
        .catch(() => {});
    } else {
      setPrintError("Pop-up blocked. Allow pop-ups for this site to print invoices.");
    }
  }

  async function bulkCancel() {
    if (!allOrders) return;
    const targets = allOrders.filter((o) => selectedIds.has(o.id) && CAN_CANCEL_FROM.has(o.status));
    if (targets.length === 0) {
      setRowError("None of the selected orders can be cancelled.");
      return;
    }
    if (!confirm(`Cancel ${targets.length} order(s)? This releases their reserved stock.`)) return;
    setSelectedIds(new Set());
    setBulkBusy(true);
    setRowError(null);
    let failed = 0;
    for (const o of targets) {
      try {
        await api.patch(`/admin/orders/${o.id}/status`, { status: "CANCELLED" });
      } catch {
        failed++;
      }
    }
    await loadOrders(search);
    setBulkBusy(false);
    if (failed > 0) setRowError(`${failed} order(s) failed to cancel.`);
  }

  // Bulk version of enterToSteadfast — same default-integration resolution,
  // just looped over every eligible selected order.
  async function bulkEnterToSteadfast() {
    if (!allOrders) return;
    const targets = allOrders.filter(
      (o) =>
        selectedIds.has(o.id) &&
        (o.status === "PENDING" || o.status === "READY_TO_SHIP" || o.status === "SHIPPED"),
    );
    if (targets.length === 0) {
      setRowError("None of the selected orders are eligible for Steadfast entry.");
      return;
    }
    setBulkMenuOpen(false);
    setSelectedIds(new Set());
    setBulkBusy(true);
    setRowError(null);
    setSuccessMessage(null);
    try {
      const integrations = await api.get<Integration[]>("/admin/integrations");
      const steadfast =
        integrations.find((i) => i.provider === "STEADFAST" && i.isEnabled && i.isDefault) ??
        integrations.find((i) => i.provider === "STEADFAST" && i.isEnabled);
      if (!steadfast) {
        setRowError("No enabled Steadfast integration found — add one under Integrations.");
        return;
      }
      let failed = 0;
      for (const o of targets) {
        try {
          await api.post(`/admin/orders/${o.id}/shipment`, { integrationId: steadfast.id });
        } catch {
          failed++;
        }
      }
      await loadOrders(search);
      const succeeded = targets.length - failed;
      if (succeeded > 0) {
        setSuccessMessage(`${succeeded} of ${targets.length} order(s) entered to Steadfast successfully.`);
      }
      if (failed > 0) setRowError(`${failed} of ${targets.length} order(s) failed to enter Steadfast.`);
    } finally {
      setBulkBusy(false);
    }
  }

  async function copyToClipboard(e: React.MouseEvent, text: string, key: string) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId((v) => (v === key ? null : v)), 1500);
    } catch {
      // Clipboard permission denied or unavailable — nothing meaningful to
      // recover into, so just skip the "Copied" confirmation silently.
    }
  }

  function customerDetailsText(o: OrderListItem) {
    return `Name: ${o.customer.name}\nPhone: ${o.customer.phone}\nAddress: ${o.shippingAddress}`;
  }

  async function cancelOrder(e: React.MouseEvent, order: OrderListItem) {
    e.stopPropagation();
    if (!confirm(`Cancel order ${order.orderNumber}? This releases its reserved stock.`)) return;
    setRowError(null);
    setBusyId(order.id);
    try {
      await api.patch(`/admin/orders/${order.id}/status`, { status: "CANCELLED" });
      await loadOrders(search);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to cancel order");
    } finally {
      setBusyId(null);
    }
  }

  // Quick action for a Pending, RTS or Shipped order — books it with whichever enabled
  // Steadfast integration is marked default (or the first enabled one, if
  // none is). Full control over which integration/courier to use lives on
  // the Order Detail page's own Courier Shipment card; this is just the
  // one-click shortcut for the common case.
  async function enterToSteadfast(e: React.MouseEvent, order: OrderListItem) {
    e.stopPropagation();
    setRowError(null);
    setSuccessMessage(null);
    setBusyId(order.id);
    try {
      const integrations = await api.get<Integration[]>("/admin/integrations");
      const steadfast =
        integrations.find((i) => i.provider === "STEADFAST" && i.isEnabled && i.isDefault) ??
        integrations.find((i) => i.provider === "STEADFAST" && i.isEnabled);
      if (!steadfast) {
        setRowError("No enabled Steadfast integration found — add one under Integrations.");
        return;
      }
      await api.post(`/admin/orders/${order.id}/shipment`, { integrationId: steadfast.id });
      await loadOrders(search);
      setSuccessMessage(`Order ${order.orderNumber} entered to Steadfast successfully.`);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to create Steadfast shipment");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (!detailsOrderId) return;
    setDetailsData(null);
    setDetailsError(null);
    setShowRecordPayment(false);
    setPaymentAmount("");
    setPaymentTxnId("");
    setPaymentError(null);
    api
      .get<OrderDetail>(`/admin/orders/${detailsOrderId}`)
      .then(setDetailsData)
      .catch((err) => setDetailsError(err instanceof ApiError ? err.message : "Failed to load order"));
  }, [detailsOrderId]);

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!detailsOrderId) return;
    setPaymentError(null);
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setPaymentError("Enter a valid amount.");
      return;
    }
    setPaymentSubmitting(true);
    try {
      const updated = await api.post<OrderDetail>(`/admin/orders/${detailsOrderId}/payments`, {
        amount: Number(paymentAmount),
        method: paymentMethod,
        transactionId: paymentTxnId || undefined,
      });
      setDetailsData(updated);
      setShowRecordPayment(false);
      setPaymentAmount("");
      setPaymentTxnId("");
      await loadOrders(search);
    } catch (err) {
      setPaymentError(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally {
      setPaymentSubmitting(false);
    }
  }

  function renderActionsCell(o: OrderListItem, menuKey: string) {
    const menuWidth = 176; // w-44
    return (
          <td className="px-4 py-4">
            <div className="relative flex justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (openMenuId === menuKey) {
                    setOpenMenuId(null);
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  // Invoice + divider + Order Details + Edit are always
                  // there; Cancel and Entry to Steadfast only show up for
                  // some statuses — estimate the real height so the flip
                  // decision below is accurate instead of guessing high.
                  const itemHeight = 36;
                  let menuHeight = itemHeight * 3 + 9 + 8; // Invoice, Order Details, Edit + divider + padding
                  if (CAN_CANCEL_FROM.has(o.status)) menuHeight += itemHeight;
                  if (o.status === "READY_TO_SHIP" || o.status === "PENDING" || o.status === "SHIPPED") {
                    menuHeight += itemHeight;
                  }
                  const fitsBelow = rect.bottom + 4 + menuHeight <= window.innerHeight;
                  setMenuPos({
                    top: fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - 4 - menuHeight),
                    left: Math.max(8, rect.right - menuWidth),
                  });
                  setOpenMenuId(menuKey);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 text-xl text-foreground/50 hover:bg-black/5 hover:text-foreground"
                aria-label="Order actions"
              >
                ⋮
              </button>
              {openMenuId === menuKey && menuPos &&
                createPortal(
                  <div
                    style={{ top: menuPos.top, left: menuPos.left, width: menuWidth }}
                    className="fixed z-30 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenuId(null);
                        setSelectedIds(new Set([o.id]));
                        setPrintError(null);
                        setShowPrintDialog(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-black/5"
                    >
                      <PrinterIcon className="h-4 w-4 text-foreground/50" />
                      Invoice
                    </button>
                    <div className="my-1 border-t border-black/5" />
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenuId(null);
                        setDetailsOrderId(o.id);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-black/5"
                    >
                      <FileTextIcon className="h-4 w-4 text-foreground/50" />
                      Order Details
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenuId(null);
                        router.push(`/orders/${o.id}/edit`);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-black/5"
                    >
                      <EditIcon className="h-4 w-4 text-foreground/50" />
                      Edit
                    </button>
                    {CAN_CANCEL_FROM.has(o.status) && (
                      <button
                        type="button"
                        disabled={busyId === o.id}
                        onClick={(e) => {
                          setOpenMenuId(null);
                          cancelOrder(e, o);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-status-cancelled hover:bg-status-cancelled/10"
                      >
                        {busyId === o.id ? "Cancelling…" : "Cancel"}
                      </button>
                    )}
                    {(o.status === "READY_TO_SHIP" || o.status === "PENDING" || o.status === "SHIPPED") && (
                      <button
                        type="button"
                        disabled={busyId === o.id}
                        onClick={(e) => {
                          setOpenMenuId(null);
                          enterToSteadfast(e, o);
                        }}
                        className="flex w-full items-center gap-2.5 bg-status-cancelled px-3 py-2 text-left text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        <SendIcon className="h-4 w-4" />
                        {busyId === o.id ? "Booking…" : "Entry to Steadfast"}
                      </button>
                    )}
                  </div>,
                  document.body,
                )}
            </div>
          </td>
    );
  }

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order, from every storefront and every manual channel, in one place."
        // actions={
        //   <Button variant="primary" onClick={() => router.push("/orders/new")}>
        //     New Order
        //   </Button>
        // }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-black/5">
        {TABS.map((t) => (
          <button
            key={t.value || "all"}
            onClick={() => selectTab(t.value)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === t.value
                ? "border-primary text-primary"
                : "border-transparent text-foreground/60 hover:text-foreground"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs ${
                activeTab === t.value ? "bg-primary/10 text-primary" : "bg-black/5 text-foreground/50"
              }`}
            >
              {counts[t.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-64">
          <Input
            placeholder="Search order #, customer, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
        {/* {globalChannelId ? (
          <div className="rounded-lg bg-black/5 px-3 py-2 text-sm text-foreground/60">
            Store: {channels.find((c) => c.id === globalChannelId)?.name ?? "…"}
          </div>
        ) : (
          <div className="w-52">
            <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )} */}
        <div className="relative">
          <Button variant="secondary" onClick={() => setFiltersOpen((v) => !v)}>
            Filters
          </Button>

          {filtersOpen && (
            <div className="absolute left-0 top-11 z-30 w-72 space-y-4 rounded-xl border border-black/10 bg-white p-4 shadow-lg">
              <div>
                <div className="mb-1 text-xs font-medium text-foreground/70">Date range</div>
                <Select value={dateRange} onChange={(e) => setDateRange(e.target.value as typeof dateRange)}>
                  <option value="all">All dates</option>
                  <option value="today">Today</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                </Select>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground/70">Print status</div>
                <div className="flex gap-2">
                  {(
                    [
                      { value: "all", label: "All" },
                      { value: "printed", label: "Printed" },
                      { value: "not", label: "Not printed" },
                    ] as { value: typeof printFilter; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPrintFilter(opt.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        printFilter === opt.value ? "bg-primary text-primary-fg" : "bg-black/5 text-foreground/70"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground/70">Product SKU</div>
                <Input placeholder="Enter SKU to filter" value={skuFilter} onChange={(e) => setSkuFilter(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground/70">Product name</div>
                <Input placeholder="Enter product name" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
              </div>
              <label className="flex items-start justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium text-foreground">Include other products</span>
                  <span className="block text-xs text-foreground/50">Orders that also contain other products are shown.</span>
                </span>
                <input
                  type="checkbox"
                  checked={includeOtherProducts}
                  onChange={(e) => setIncludeOtherProducts(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-primary"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setPrintFilter("all");
                  setDateRange("all");
                  setSkuFilter("");
                  setNameFilter("");
                  setIncludeOtherProducts(true);
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
        <div className="w-60">
          <Select
            value={sort ? `${sort.key}:${sort.dir}` : "createdAt:desc"}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(":") as [SortKey, "asc" | "desc"];
              setSort({ key, dir });
            }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={`${opt.key}:${opt.dir}`} value={`${opt.key}:${opt.dir}`}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            <option value="">All payments</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {selectedIds.size > 0 && bulkMenuOpen && (
        <div className="relative z-30 h-0">
          <div className="absolute left-1/2 top-0 mt-2 w-72 -translate-x-1/2 rounded-xl border border-black/10 bg-white p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-2">
            <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-foreground">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              ✓ Select All
            </button>
          </div>

          <div className="my-1 border-t border-black/5" />

          <div className="px-2 pb-1 pt-2 text-xs font-medium text-foreground/40">
            Print Options
          </div>
          <button
            type="button"
            onClick={() => {
              setBulkMenuOpen(false);
              setPrintError(null);
              setShowPrintDialog(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm font-medium text-foreground hover:bg-black/5"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs text-foreground/60">
              🧾
            </span>
            Invoice
          </button>

          <div className="my-1 border-t border-black/5" />

          <div className="px-2 pb-1 pt-2 text-xs font-medium text-foreground/40">
            Update Status ({selectedIds.size} selected)
          </div>
          {canBulkNext && (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={bulkMoveNext}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm font-medium text-foreground hover:bg-black/5 disabled:opacity-50"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-fg">
                ✓
              </span>
              {bulkBusy ? "Working…" : nextLabel ? `Sent to ${nextLabel}` : "Move to Next Status"}
            </button>
          )}
          {canBulkPrev && (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={bulkMovePrev}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm font-medium text-foreground hover:bg-black/5 disabled:opacity-50"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/10 text-xs text-foreground/60">
                ↺
              </span>
              {bulkBusy ? "Working…" : prevLabel ? `Sent back to ${prevLabel}` : "Move to Previous Status"}
            </button>
          )}
          {canBulkCancel && (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={bulkCancel}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm font-medium text-status-cancelled hover:bg-status-cancelled/10 disabled:opacity-50"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-cancelled text-xs text-white">
                ✕
              </span>
              Cancel
            </button>
          )}
          {!canBulkNext && !canBulkPrev && !canBulkCancel && (
            <p className="px-2 py-2 text-sm text-foreground/50">
              No status actions available for this selection.
            </p>
          )}

          <div className="my-1 border-t border-black/5" />

          <div className="px-2 pb-1 pt-2 text-xs font-medium text-foreground/40">
            Courier Services
          </div>
          {canBulkSteadfast ? (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={bulkEnterToSteadfast}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-status-cancelled px-2 py-2.5 text-center text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <span aria-hidden>➤</span>
              {bulkBusy ? "Working…" : "Entry to Steadfast"}
            </button>
          ) : (
            <p className="px-2 py-2 text-sm text-foreground/50">
              No eligible orders in this selection.
            </p>
          )}

          <div className="my-1 border-t border-black/5" />

          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="w-full rounded-lg px-2 py-2 text-left text-sm text-foreground/50 hover:bg-black/5 hover:text-foreground"
          >
            Clear selection
          </button>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && bulkMenuOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setBulkMenuOpen(false)} />
      )}

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}
        {rowError && (
          <Toast message={rowError} variant="error" onDismiss={() => setRowError(null)} />
        )}
        {successMessage && (
          <Toast message={successMessage} variant="success" onDismiss={() => setSuccessMessage(null)} />
        )}

        {!visibleOrders ? (
          <LoadingLine />
        ) : visibleOrders.length === 0 ? (
          <p className="text-sm text-foreground/50">No orders match these filters.</p>
        ) : (
          <div className="max-h-[calc(100vh-19rem)] overflow-auto">
            <table className="w-full min-w-[1800px] text-sm">
              <thead>
                <tr className="text-left text-sm font-semibold text-primary">
                  <th className="rounded-l-lg px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                    <input
                      type="checkbox"
                      checked={visibleOrders.length > 0 && selectedIds.size === visibleOrders.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-black/20 accent-primary"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                    <button
                      type="button"
                      onClick={() => toggleSort("createdAt")}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      Date {sort?.key === "createdAt" ? (sort.dir === "desc" ? "↓" : "↑") : "↕"}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Invoice</th>
                  <th className="px-4 py-3 font-medium text-right" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Actions</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Customer</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Shipping Note</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Products</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Tags</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Status Tags</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Print</th>
                  <th className="px-4 py-3 font-medium text-right" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                    <button
                      type="button"
                      onClick={() => toggleSort("total")}
                      className="ml-auto flex items-center gap-1 hover:text-foreground"
                    >
                      Total {sort?.key === "total" ? (sort.dir === "desc" ? "↓" : "↑") : "↕"}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Upload</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>User</th>
                  <th className="px-4 py-3 font-medium" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Source</th>
                  <th className="rounded-r-lg px-4 py-3 font-medium text-right" style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((o) => {
                  const visibleItems = o.items.slice(0, 3);
                  const hiddenCount = o.items.length - visibleItems.length;
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-black/10 align-middle last:border-0 hover:bg-primary/[0.03]"
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(o.id)}
                          onChange={() => toggleRowSelected(o.id)}
                          className="h-4 w-4 rounded border-black/20 accent-primary"
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="whitespace-pre-line font-medium text-foreground/70">{listDate(o.createdAt)}</div>
                        <div className="text-xs text-foreground/40">
                          Updated {listUpdated(o.updatedAt)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">
                            {o.orderNumber.split("-")[0]}-<br />
                            {o.orderNumber.split("-").slice(1).join("-")}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => copyToClipboard(e, o.orderNumber, `${o.id}-invoice`)}
                            className="text-foreground/30 hover:text-foreground/60"
                            title="Copy invoice number"
                          >
                            {/* {copiedId === `${o.id}-invoice` ? "✓" : "⧉"} */}
                          </button>
                        </div>
                      </td>
                      {renderActionsCell(o, `${o.id}-top`)}
                      <td className="px-4 py-4 text-foreground/70">
                        <div className="flex items-center gap-1.5">
                          <span title="Customer"><UserIcon className="h-4.5 w-4 text-foreground" /></span>
                          <span className="font-medium text-foreground">{o.customer.name}</span>
                          <button
                            type="button"
                            onClick={(e) => copyToClipboard(e, customerDetailsText(o), `${o.id}-customer`)}
                            className="text-foreground/30 hover:text-foreground/60"
                            title="Copy customer details"
                          >
                            {copiedId === `${o.id}-customer` ? "✓" : "⧉"}
                          </button>
                        </div>
                        <div
                          className="mt-1 flex items-center gap-2 text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a href={telHref(o.customer.phone)} className="opacity-70 hover:opacity-100" title="Call">
                            <PhoneIcon className="h-4.5 w-4" />
                          </a>
                          {/* <a
                            href={whatsappHref(o.customer.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-status-delivered hover:opacity-80"
                            title="WhatsApp"
                          >
                            💬
                          </a> */}
                          <span>{o.customer.phone}</span>
                          {o.customer.successRate !== null && (
                            <span
                              className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700"
                              title="Delivery success rate"
                            >
                              {o.customer.successRate}%
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-start gap-1 text-foreground">
                          <span className="opacity-70"><PinIcon className="h-4.5 w-4" /></span>
                          <span className="max-w-[180px] truncate" title={o.shippingAddress}>
                            {o.shippingAddress}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[160px] px-4 py-4 text-foreground">
                        {o.notes ? <span title={o.notes}>{o.notes}</span> : "—"}
                      </td>
                      <td
                        className="cursor-pointer px-8 py-4 text-foreground/60 hover:text-foreground"
                        onClick={() => setProductsModal(o)}
                      >
                        <div className="mb-2">
                          <StatusBadge status={o.status} compact />
                        </div>
                        <div className="space-y-1.5">
                          {visibleItems.map((item) => {
                            const thumb = item.product?.thumbnailUrl ?? item.product?.images[0]?.url;
                            return (
                            <div key={item.id} className="flex items-start gap-2">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={item.productName}
                                  className="h-7 w-7 shrink-0 rounded object-cover"
                                />
                              ) : (
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-black/5 text-xs text-foreground/30">
                                  —
                                </span>
                              )}
                              <div className="min-w-0 max-w-[160px]">
                                <div className="truncate text-foreground" title={item.productName}>{item.productName}</div>
                                <div className="text-[11px]" style={{ color: "rgba(47, 111, 235, 0.8)" }}>
                                  {item.sku} · Qty: {item.quantity}
                                </div>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                        {o.items.length > 3 && (
                          <span className="mt-1 block text-xs font-medium text-primary">
                            +{hiddenCount} more products
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {o.customer.orderCount > 1 && (
                          <span className="inline-block rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                            REPEAT({o.customer.orderCount})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {Number(o.discount) > 0 && (
                          <span className="inline-flex items-start gap-1.5 rounded-2xl border border-sky-200 bg-sky-100 px-2.5 py-1.5 text-xs leading-snug text-sky-700">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                            <span className="flex flex-col">
                              <span>Employee</span>
                              <span>Discount</span>
                              <span>Order · {formatAmount(o.discount)}</span>
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center text-xl font-bold">
                        {o.invoicePrinted ? (
                          <span className="text-status-delivered" title="Invoice printed ">✓</span>
                        ) : (
                          <span className="text-status-cancelled" title="Not printed">✕</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-foreground">
                        {formatAmount(o.total)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {o.shipment?.externalConsignmentId ? (
                          <div className="flex flex-col items-center gap-0.5 text-xs">
                            <span className="flex items-center gap-1 font-bold">
                              <span className="text-status-delivered" title="Entered to Steadfast">✓</span>
                              <span className="text-foreground">{o.shipment.externalConsignmentId}</span>
                            </span>
                            <a
                              href={`https://steadfast.com.bd/user/consignment/${o.shipment.externalConsignmentId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline"
                            >
                              Panel Link
                            </a>
                          </div>
                        ) : (
                          <span className="text-base font-bold text-status-cancelled" title="Not entered to Steadfast">
                            ✕
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-foreground/60">
                        {o.createdBy?.name ?? "—"}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${SOURCE_STYLE[o.source]}`}>
                          {o.source.charAt(0) + o.source.slice(1).toLowerCase()}
                        </span>
                      </td>
                      {renderActionsCell(o, o.id)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openMenuId && <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />}
      {filtersOpen && <div className="fixed inset-0 z-20" onClick={() => setFiltersOpen(false)} />}

      {productsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setProductsModal(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                Products - Invoice #{productsModal.orderNumber}
              </h3>
              <button
                type="button"
                onClick={() => setProductsModal(null)}
                className="text-foreground/40 hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {productsModal.items.map((item) => {
                const thumb = item.product?.thumbnailUrl ?? item.product?.images[0]?.url;
                return (
                <div key={item.id} className="flex gap-3 rounded-lg border border-black/10 p-3">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={item.productName}
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-black/5 text-xs text-foreground/30">
                      —
                    </span>
                  )}
                  <div>
                    <div className="font-medium text-foreground">{item.productName}</div>
                    <div className="text-xs text-foreground/50">SKU: {item.sku}</div>
                    <div className="text-xs text-foreground/50">Quantity: {item.quantity}</div>
                    <div className="mt-1">
                      <StatusBadge status={productsModal.status} compact />
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showPrintDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowPrintDialog(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">Print Invoice</h3>
                <p className="mt-1 text-sm text-foreground/60">{selectedIds.size} orders selected</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintDialog(false)}
                className="text-foreground/40 hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="mt-5">
              <label className="mb-1 block text-xs font-medium text-foreground/70">Paper size</label>
              <Select value={paperSize} onChange={(e) => setPaperSize(e.target.value as PaperSize)}>
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="Letter">Letter</option>
              </Select>
            </div>
            <div className="mt-4 space-y-2">
              {(
                [
                  { mode: "by-invoice", label: "Print Invoice (By Invoice)" },
                  { mode: "grouped-by-sku", label: "Print Invoice (Grouped by SKU)" },
                ] as { mode: InvoiceMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => runPrint(opt.mode)}
                  className="flex w-full items-center gap-3 rounded-lg border border-black/10 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-black/5"
                >
                  <span aria-hidden="true">🧾</span>
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => runPrint("by-invoice")}
                className="flex w-full items-center gap-3 rounded-lg border border-black/10 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-black/5"
              >
                <span aria-hidden="true">📄</span>
                Download PDF
              </button>
            </div>
            <p className="mt-3 text-xs text-foreground/50">
              PDF downloads through the print dialog — choose “Save as PDF” as the destination.
            </p>
            {printError && (
              <p className="mt-3 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                {printError}
              </p>
            )}
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={() => setShowPrintDialog(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailsOrderId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetailsOrderId(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/10 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Order Details</h3>
                <p className="text-xs text-foreground/50">Full order summary, payments &amp; history</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOrderId(null)}
                className="text-foreground/40 hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 p-6">
              {detailsError && (
                <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                  {detailsError}
                </p>
              )}
              {!detailsData && !detailsError && (
                <LoadingLine className="justify-center py-8 text-sm text-foreground/50" />
              )}
              {detailsData && (
                <>
                  <div className="rounded-lg border border-black/10 p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="font-semibold text-foreground">Bill to:</div>
                        <div className="text-foreground/70">{detailsData.shippingName}</div>
                        <div className="text-foreground/70">{detailsData.shippingAddress}</div>
                        <div className="text-foreground/70">{detailsData.shippingPhone}</div>
                      </div>
                      <div className="space-y-1 text-right">
                        <div>
                          <span className="text-foreground/50">Invoice ID#: </span>
                          <span className="font-medium text-foreground">{detailsData.orderNumber}</span>
                        </div>
                        <div>
                          <span className="text-foreground/50">Invoice date: </span>
                          <span className="text-foreground">{formatDateTime(detailsData.createdAt)}</span>
                        </div>
                        <div>
                          <span className="text-foreground/50">Courier Status: </span>
                          <span className="text-foreground">
                            {detailsData.shipmentStatus.replaceAll("_", " ")}
                          </span>
                        </div>
                        <div>
                          <span className="text-foreground/50">Ref: </span>
                          <span className="text-foreground">{detailsData.source}</span>
                        </div>
                      </div>
                    </div>

                    <table className="mt-4 w-full text-sm">
                      <thead>
                        <tr className="border-b border-black/10 text-left text-foreground/50">
                          <th className="py-2 font-medium">Products</th>
                          <th className="py-2 text-right font-medium">Qty</th>
                          <th className="py-2 text-right font-medium">Unit price</th>
                          <th className="py-2 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailsData.items.map((item) => (
                          <tr key={item.id} className="border-b border-black/5">
                            <td className="py-2 text-foreground">
                              {item.productName} ({item.sku})
                            </td>
                            <td className="py-2 text-right text-foreground/70">{item.quantity}</td>
                            <td className="py-2 text-right text-foreground/70">{formatAmount(item.unitPrice)}</td>
                            <td className="py-2 text-right text-foreground/70">{formatAmount(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} className="pt-2 text-right text-foreground/50">
                            Sub-Total
                          </td>
                          <td className="pt-2 text-right text-foreground">{formatAmount(detailsData.subtotal)}</td>
                        </tr>
                        {Number(detailsData.discount) > 0 && (
                          <tr>
                            <td colSpan={3} className="pt-1 text-right text-foreground/50">
                              Discount
                            </td>
                            <td className="pt-1 text-right text-foreground">
                              -{formatAmount(detailsData.discount)}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td colSpan={3} className="pt-1 text-right text-foreground/50">
                            Delivery Charge
                          </td>
                          <td className="pt-1 text-right text-foreground">{formatAmount(detailsData.shippingFee)}</td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="pt-1 text-right font-semibold text-foreground">
                            Total
                          </td>
                          <td className="pt-1 text-right font-semibold text-foreground">
                            {formatAmount(detailsData.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="rounded-lg border border-black/10 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-foreground">Advance Payment</h4>
                      {!showRecordPayment && (
                        <Button variant="secondary" onClick={() => setShowRecordPayment(true)}>
                          Record Advance Payment
                        </Button>
                      )}
                    </div>

                    {showRecordPayment ? (
                      <form onSubmit={submitPayment} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Amount"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                        />
                        <Select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        >
                          {(["COD", "BKASH", "NAGAD", "BANK_TRANSFER", "CARD", "OTHER"] as PaymentMethod[]).map(
                            (m) => (
                              <option key={m} value={m}>
                                {m.replaceAll("_", " ")}
                              </option>
                            ),
                          )}
                        </Select>
                        <Input
                          placeholder="Transaction ID (optional)"
                          value={paymentTxnId}
                          onChange={(e) => setPaymentTxnId(e.target.value)}
                        />
                        {paymentError && (
                          <p className="sm:col-span-3 text-sm text-status-cancelled">{paymentError}</p>
                        )}
                        <div className="flex gap-2 sm:col-span-3">
                          <Button type="submit" disabled={paymentSubmitting}>
                            {paymentSubmitting ? "Saving…" : "Save Payment"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setShowRecordPayment(false);
                              setPaymentError(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : detailsData.payments.length === 0 ? (
                      <p className="mt-2 text-sm text-foreground/50">No advance recorded yet.</p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {detailsData.payments.map((p) => (
                          <div key={p.id} className="flex justify-between text-sm">
                            <span className="text-foreground/70">
                              {p.method.replaceAll("_", " ")}
                              {p.transactionId ? ` · ${p.transactionId}` : ""}
                              {p.paidAt ? ` · ${formatDateTime(p.paidAt)}` : ""}
                            </span>
                            <span className="font-medium text-foreground">{formatAmount(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-black/10">
                    <h4 className="border-b border-black/10 px-4 py-3 text-sm font-semibold text-foreground">Products</h4>
                    {detailsData.items.map((item) => {
                      const thumb = item.product?.thumbnailUrl ?? item.product?.images[0]?.url;
                      return (
                      <div key={item.id} className="flex items-center gap-4 border-b border-black/5 px-4 py-3 last:border-b-0">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={item.productName}
                            className="h-14 w-14 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-black/5 text-xs text-foreground/30">
                            {item.productName.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">{item.productName}</div>
                          <div className="text-xs text-foreground/50">SKU: {item.sku}</div>
                          <div className="mt-1 text-xs text-foreground/60">
                            Status: {detailsData.status.charAt(0) + detailsData.status.slice(1).toLowerCase().replaceAll("_", " ")}
                          </div>
                        </div>
                        <div className="grid shrink-0 grid-cols-3 gap-x-6 text-right text-sm">
                          <div>
                            <div className="text-xs text-foreground/50">Qty</div>
                            <div className="text-foreground">{item.quantity}</div>
                          </div>
                          <div>
                            <div className="text-xs text-foreground/50">Unit</div>
                            <div className="text-foreground">{formatAmount(item.unitPrice)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-foreground/50">Total</div>
                            <div className="text-foreground">{formatAmount(item.total)}</div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end border-t border-black/10 px-6 py-4">
              <Button variant="secondary" onClick={() => setDetailsOrderId(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

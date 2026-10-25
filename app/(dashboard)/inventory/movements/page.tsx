"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { StockMovement } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { LoadingLine } from "@/components/ui/spinner";

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100, 200, 500] as const;

// Same solid-colour pill language as the Available/Status column on the
// All Stock page — green for stock coming in or freed up, red for stock
// leaving or written off, amber for committing it to an order, blue for a
// neutral manual correction.
function movementTone(type: string): "success" | "danger" | "alert" | "info" | "default" {
  switch (type) {
    case "PURCHASE":
    case "RETURN":
    case "RELEASE":
      return "success";
    case "DEDUCT":
    case "DAMAGE":
      return "danger";
    case "RESERVE":
      return "alert";
    case "ADJUSTMENT":
      return "info";
    default:
      return "default";
  }
}

export default function StockMovementsPage() {
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId");

  const [rows, setRows] = useState<StockMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  useEffect(() => {
    setRows(null);
    setPage(1);
    // The highest page-size option (500) is also the backend's own cap on
    // this route, so fetching that much up front means every page-size
    // choice below has real data to show rather than quietly running out.
    const url = productId
      ? `/admin/inventory/${productId}/movements`
      : "/admin/inventory/movements?limit=500";
    api
      .get<StockMovement[]>(url)
      .then(setRows)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load stock movements"),
      );
  }, [productId]);

  // Changing the page size would otherwise strand the view on a page that
  // no longer exists (e.g. on page 5 of 20-per-page, then switching to 100
  // per page only has 2 pages).
  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const productName = rows && rows.length > 0 ? rows[0].product?.name : undefined;
  const totalPages = rows ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  const pagedRows = rows?.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <PageHeader
        title={productId ? `Stock Movements — ${productName ?? "Product"}` : "Stock Movements"}
        description="Every change to stock, newest first — the ledger behind the numbers."
      />
      {productId && (
        <Link href="/inventory/movements" className="mb-4 inline-block text-base text-primary hover:underline">
          ← Back to all movements
        </Link>
      )}
      <Card>
        {error && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
            {error}
          </p>
        )}
        {!rows ? (
          <LoadingLine className="text-base text-foreground/60" />
        ) : rows.length === 0 ? (
          <p className="text-base text-foreground/50">No stock movements yet.</p>
        ) : (
          <table className="w-full text-base">
            <thead>
              <tr
                className="text-left text-base font-bold text-foreground"
                style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}
              >
                <th className="rounded-l-lg px-3 py-3 font-bold">When</th>
                <th className="px-3 py-3 font-bold">Product</th>
                <th className="px-3 py-3 font-bold">Type</th>
                <th className="px-3 py-3 text-right font-bold">Qty</th>
                <th className="px-3 py-3 text-right font-bold">Balance</th>
                <th className="rounded-r-lg px-3 py-3 font-bold">Note / By</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows!.map((m) => (
                <tr key={m.id} className="border-b border-black/5 last:border-0">
                  <td className="whitespace-nowrap px-3 py-3 text-sm text-foreground/50">
                    {formatDateTime(m.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      {m.product?.imageUrl ? (
                        <img
                          src={m.product.imageUrl}
                          alt={m.product.name}
                          className="h-9 w-9 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-black/5 text-xs text-foreground/30">
                          —
                        </span>
                      )}
                      <div>
                        <div className="font-bold text-primary">{m.product?.name ?? "—"}</div>
                        <div className="text-sm text-foreground/50">{m.product?.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Pill tone={movementTone(m.type)}>{m.type}</Pill>
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-medium ${
                      m.quantity < 0 ? "text-status-cancelled" : "text-foreground"
                    }`}
                  >
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="px-3 py-3 text-right text-foreground/70">{m.balanceAfter}</td>
                  <td className="px-3 py-3 text-foreground/60">
                    {m.note && <div>{m.note}</div>}
                    {m.createdBy && (
                      <div className="text-sm text-foreground/40">by {m.createdBy.name}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows && rows.length > 0 && (
          <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 text-base">
            <span className="font-bold text-primary">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} of {rows.length}
            </span>
            <div className="flex items-center gap-2">
              <Select
                className="w-auto !text-base font-bold !text-primary"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="secondary"
                className="!text-base !font-bold !text-primary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="font-bold text-primary">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                className="!text-base !font-bold !text-primary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

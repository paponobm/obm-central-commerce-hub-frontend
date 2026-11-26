"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { CallRequest, CallRequestStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { LoadingLine } from "@/components/ui/spinner";

const TABS: { key: "all" | CallRequestStatus; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "SOLVED", label: "Solved" },
  { key: "all", label: "All" },
];

// Every storefront's "ফ্রি কল-পরামর্শ নিন" (free call consultation) leads,
// reviewed centrally — not scoped to whichever store is currently active
// (see this page's centralOnly nav entry), since a call-back request isn't
// really a per-store concern the way Orders/Products are.
export default function CounselingPage() {
  const [requests, setRequests] = useState<CallRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | CallRequestStatus>("PENDING");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<CallRequest[]>("/admin/call-requests");
      setRequests(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load counseling requests");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markSolved(id: string) {
    setUpdatingId(id);
    setLoadError(null);
    try {
      await api.patch(`/admin/call-requests/${id}/status`, { status: "SOLVED" });
      setRequests((rows) =>
        rows ? rows.map((r) => (r.id === id ? { ...r, status: "SOLVED" } : r)) : rows,
      );
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  const pendingCount = requests?.filter((r) => r.status === "PENDING").length ?? 0;
  const solvedCount = requests?.filter((r) => r.status === "SOLVED").length ?? 0;
  const visibleRequests = requests?.filter((r) => tab === "all" || r.status === tab);

  return (
    <div>
      <PageHeader
        title="Counseling"
        description="Free call-back requests from every storefront, in one place."
      />

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
            {loadError}
          </p>
        )}

        <div className="mb-4 flex gap-1 border-b border-black/5">
          {TABS.map((t) => {
            const count = t.key === "all" ? requests?.length ?? 0 : t.key === "PENDING" ? pendingCount : solvedCount;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-base font-medium transition-colors ${
                  tab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-foreground/60 hover:text-foreground"
                }`}
              >
                {t.label}
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-black/5 px-1.5 text-xs font-semibold text-foreground/70">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {!requests ? (
          <LoadingLine />
        ) : visibleRequests!.length === 0 ? (
          <div className="flex min-h-[12rem] items-center justify-center">
            <p className="text-base text-foreground/50">No counseling requests here yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead>
                <tr
                  className="text-left text-base font-bold text-foreground"
                  style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}
                >
                  <th className="rounded-l-lg px-3 py-3 font-bold">Name</th>
                  <th className="px-3 py-3 font-bold">Phone</th>
                  <th className="px-3 py-3 font-bold">Details</th>
                  <th className="px-3 py-3 font-bold">Store</th>
                  <th className="px-3 py-3 font-bold">Requested</th>
                  <th className="rounded-r-lg px-3 py-3 text-right font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests!.map((r) => (
                  <tr key={r.id} className="border-b border-black/5 last:border-0">
                    <td className="px-3 py-3 font-medium text-foreground">{r.name}</td>
                    <td className="px-3 py-3 text-foreground/70">{r.phone}</td>
                    <td className="max-w-xs px-3 py-3 text-foreground/70">
                      <p className="line-clamp-1 break-words hover:line-clamp-none">{r.problem}</p>
                    </td>
                    <td className="px-3 py-3 text-foreground/60">{r.channel?.name ?? "—"}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-foreground/50">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {r.status === "SOLVED" ? (
                        <Pill tone="success">Solved</Pill>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <Pill tone="warning">Pending</Pill>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={updatingId === r.id}
                            onClick={() => markSolved(r.id)}
                            className="!px-2.5 !py-1 !text-sm"
                          >
                            {updatingId === r.id ? "Saving…" : "Solved"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

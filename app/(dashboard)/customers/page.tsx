"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { Customer } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingLine } from "@/components/ui/spinner";
import { money } from "@/lib/format";

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100, 200, 500] as const;

// Short "Reference" badge for a customer's most recent order source —
// same abbreviation style as the reference design (e.g. "FB" for Facebook).
const SOURCE_ABBR: Record<string, string> = {
  FACEBOOK: "FB",
  WEBSITE: "WEB",
  WHATSAPP: "WA",
  INSTAGRAM: "IG",
  TIKTOK: "TT",
  MESSENGER: "MSG",
  DIRECT: "DIR",
  MANUAL: "MAN",
  PHONE: "PHN",
  EXCHANGE: "EXC",
  OTHER: "OTH",
  UNKNOWN: "—",
};

// Minimum order-count tiers for the "Repeat" filter — "repeat" and "2" are
// deliberately the same threshold (>1 order is what the row's own "Repeat"
// pill already means), kept as distinct <option> values since a native
// <select> can't tell two options with an identical `value` apart.
const REPEAT_THRESHOLDS: Record<string, number> = {
  repeat: 2,
  "2": 2,
  "5": 5,
  "10": 10,
};

// Same two icons, same hand-drawn-SVG convention, as the row actions on
// Products/Inventory — kept local to this file like those are.
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

// Same summary-card shape as Products/Inventory's own top-of-page cards.
const SUMMARY_DOT_CLASSES = {
  primary: "bg-primary",
  delivered: "bg-status-delivered",
} as const;
const SUMMARY_BADGE_CLASSES = {
  primary: "bg-primary/10",
  delivered: "bg-status-delivered/10",
} as const;

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof SUMMARY_DOT_CLASSES;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground/60">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${SUMMARY_BADGE_CLASSES[tone]}`}>
          <span className={`h-2 w-2 rounded-full ${SUMMARY_DOT_CLASSES[tone]}`} />
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}

interface FormState {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes: string;
}

export default function CustomersPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { activeChannelId } = useChannelScope();

  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Both client-side filters over the already-fetched `customers` list —
  // "Reference" and address are only resolved server-side (see findAll's
  // fallback-to-latest-order logic), so there's no separate backend param
  // to add here; same pattern as the other list pages' client-side filters.
  const [referenceFilter, setReferenceFilter] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [repeatFilter, setRepeatFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (activeChannelId) params.set("channelId", activeChannelId);
    const qs = params.toString();
    try {
      setCustomers(await api.get<Customer[]>(`/admin/customers${qs ? `?${qs}` : ""}`));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load customers");
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeChannelId]);

  // Back to page 1 whenever the result set itself could change shape —
  // otherwise a search narrowing the list could strand the view on a page
  // that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [search, activeChannelId, referenceFilter, locationSearch, repeatFilter, pageSize]);

  function openEdit(c: Customer) {
    setFormError(null);
    setForm({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      notes: c.notes ?? "",
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    setSubmitting(true);
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      await api.patch(`/admin/customers/${form.id}`, payload);
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredCustomers = customers?.filter((c) => {
    if (referenceFilter && c.lastSource !== referenceFilter) return false;
    if (locationSearch && !(c.address ?? "").toLowerCase().includes(locationSearch.toLowerCase())) return false;
    if (repeatFilter && c.orderCount < REPEAT_THRESHOLDS[repeatFilter]) return false;
    return true;
  });
  const totalPages = filteredCustomers ? Math.max(1, Math.ceil(filteredCustomers.length / pageSize)) : 1;
  const pagedCustomers = filteredCustomers?.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <PageHeader title="Customers" description="One shared customer list across every storefront." />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:w-1/2">
        <SummaryCard label="Total Customer" value={customers?.length ?? 0} tone="primary" />
        <SummaryCard
          label="Total Repeat Customer"
          value={customers?.filter((c) => c.orderCount > 1).length ?? 0}
          tone="delivered"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-64">
          <Input
            placeholder="Search name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-64">
          <Input
            placeholder="Search by location/address…"
            value={locationSearch}
            onChange={(e) => setLocationSearch(e.target.value)}
          />
        </div>
        <div className="w-48">
          <Select value={referenceFilter} onChange={(e) => setReferenceFilter(e.target.value)}>
            <option value="">All References</option>
            {Object.keys(SOURCE_ABBR).map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()} ({SOURCE_ABBR[s]})
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={repeatFilter} onChange={(e) => setRepeatFilter(e.target.value)}>
            <option value="">All</option>
            <option value="repeat">Repeat</option>
            <option value="2">Repeat(2)</option>
            <option value="5">Repeat(5)</option>
            <option value="10">Repeat(10)</option>
          </Select>
        </div>
      </div>

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}
        {!customers ? (
          <LoadingLine />
        ) : filteredCustomers!.length === 0 ? (
          <p className="text-sm text-foreground/50">No customers match.</p>
        ) : (
          <table className="w-full text-base">
            <thead>
              <tr
                className="text-left text-base font-bold text-foreground"
                style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}
              >
                <th className="rounded-l-lg px-3 py-3 font-bold">Mobile</th>
                <th className="px-3 py-3 font-bold">Customer Details</th>
                <th className="px-3 py-3 font-bold">Reference</th>
                <th className="px-3 py-3 font-bold">Total</th>
                <th className="px-3 py-3 font-bold">Since</th>
                <th className="rounded-r-lg px-3 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedCustomers!.map((c) => (
                <tr key={c.id} className="group border-b border-black/5 last:border-0">
                  <td className="px-3 py-3 text-foreground/70">{c.phone}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => router.push(`/customers/${c.id}`)}
                        className="font-bold text-primary hover:underline"
                      >
                        {c.name}
                      </button>
                      {c.orderCount > 1 && <Pill tone="info">Repeat ({c.orderCount})</Pill>}
                    </div>
                    {/* Fixed-width column stays the same size either way — on
                        row hover it only switches from a single truncated
                        line to wrapping across as many lines as needed,
                        growing the row (not a floating overlay). */}
                    <span className="block max-w-[320px] truncate text-sm text-foreground/50 group-hover:whitespace-normal">
                      {c.address ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Pill tone="default">{SOURCE_ABBR[c.lastSource ?? ""] ?? "—"}</Pill>
                  </td>
                  <td className="px-3 py-3 font-medium text-foreground">{money(c.totalSpent)}</td>
                  <td className="px-3 py-3 text-sm text-foreground/50">{formatDateTime(c.createdAt)}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        title="View"
                        aria-label={`View ${c.name}`}
                        onClick={() => router.push(`/customers/${c.id}`)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      {hasPermission("customers.manage") && (
                        <button
                          type="button"
                          title="Edit"
                          aria-label={`Edit ${c.name}`}
                          onClick={() => openEdit(c)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-600 hover:bg-amber-500/10"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {filteredCustomers && filteredCustomers.length > 0 && (
          <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 text-base">
            <span className="font-bold text-primary">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredCustomers.length)} of{" "}
              {filteredCustomers.length}
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

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title="Edit Customer"
      >
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input required minLength={5} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {formError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                {formError}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save Changes"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { CustomerDetail } from "@/lib/types";
import { money, formatDateTime } from "@/lib/format";
import { telHref, whatsappHref } from "@/lib/phone";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Pill, StatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingLine } from "@/components/ui/spinner";

// Same lookup as the Customers list page's own "Reference" badge — kept
// local to each file, same convention as this codebase's other small
// per-page constants (e.g. the icon components below).
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

function BackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function CallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4.5 4h3.5l1.5 5-2 1.5a12 12 0 0 0 6 6l1.5-2 5 1.5V19a2 2 0 0 1-2.2 2A17 17 0 0 1 2.5 6.2 2 2 0 0 1 4.5 4Z" />
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
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2Zm5.7 14.2c-.2.6-1.2 1.2-1.7 1.3-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.5-4-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4.2.5.7 1.8.8 1.9.1.1.1.3 0 .5-.1.2-.1.3-.3.5l-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.5 1.5.3.1.5.1.6-.1l.7-.8c.2-.3.4-.2.7-.1l1.6.8c.2.1.4.2.5.3.1.2.1.8-.1 1.4Z" />
    </svg>
  );
}
function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 21s7-6.5 7-11.5a7 7 0 1 0-14 0C5 14.5 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}
function PackageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  );
}
function ReturnIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 7h11a4 4 0 0 1 0 8H9" />
      <path d="m8 11-4-4 4-4" />
    </svg>
  );
}
function WalletIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3" />
      <path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1h-4a2 2 0 1 0 0 4" />
    </svg>
  );
}

function StatTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: (props: { className?: string }) => JSX.Element;
  tone: "primary" | "cancelled" | "delivered";
}) {
  const Icon = icon;
  const toneClasses = {
    primary: "bg-primary/10 text-primary",
    cancelled: "bg-status-cancelled/10 text-status-cancelled",
    delivered: "bg-status-delivered/10 text-status-delivered",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-black/[0.015] p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClasses}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-foreground/50">{label}</div>
        <div className="mt-0.5 text-xl font-bold text-foreground">{value}</div>
      </div>
    </div>
  );
}

interface FormState {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes: string;
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api
      .get<CustomerDetail>(`/admin/customers/${params.id}`)
      .then(setCustomer)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load customer"));
  }

  useEffect(load, [params.id]);

  function openEdit() {
    if (!customer) return;
    setFormError(null);
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? "",
      address: customer.address ?? "",
      city: customer.city ?? "",
      notes: customer.notes ?? "",
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form || !customer) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await api.patch(`/admin/customers/${customer.id}`, {
        name: form.name,
        phone: form.phone,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setForm(null);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <p className="text-sm text-status-cancelled">{error}</p>;
  if (!customer) return <LoadingLine />;

  const initials = Array.from(customer.name.trim()).slice(0, 2).join("") || "?";

  return (
    <div>
      <button
        type="button"
        onClick={() => router.push("/customers")}
        className="mb-4 flex items-center gap-1 text-sm font-medium text-foreground/60 hover:text-primary"
      >
        <BackIcon className="h-4 w-4" />
        Back to Customers
      </button>

      <Card className="overflow-hidden !p-0">
        <div className="h-16 bg-gradient-to-r from-primary/15 via-status-delivered/10 to-transparent" />
        <div className="px-6 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="-mt-8 flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--status-delivered)_18%,white)] text-lg font-bold text-status-delivered ring-4 ring-white">
                {initials}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl font-bold text-foreground">{customer.name}</span>
                  <Pill tone={customer.orderCount > 1 ? "info" : "default"}>
                    {customer.orderCount > 1 ? `Repeat (${customer.orderCount})` : "New"}
                  </Pill>
                  <Pill tone="default">{SOURCE_ABBR[customer.lastSource ?? ""] ?? "—"}</Pill>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-sm text-foreground/60">
                  <CallIcon className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
                  {customer.phone}
                  <a
                    href={telHref(customer.phone)}
                    title="Call"
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    <CallIcon className="h-3 w-3" />
                  </a>
                  <a
                    href={whatsappHref(customer.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="WhatsApp"
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20"
                  >
                    <WhatsAppIcon className="h-3 w-3" />
                  </a>
                </div>
                {(customer.address || customer.city) && (
                  <div className="mt-1 flex items-start gap-2 text-sm text-foreground/60">
                    <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/40" />
                    {[customer.address, customer.city].filter(Boolean).join(", ")}
                  </div>
                )}
                {customer.notes && (
                  <p className="mt-2 max-w-md rounded-lg bg-black/5 px-3 py-2 text-sm text-foreground/70">
                    {customer.notes}
                  </p>
                )}
              </div>
            </div>

            {hasPermission("customers.manage") && (
              <button
                type="button"
                onClick={openEdit}
                className="mt-2 flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                <PencilIcon className="h-4 w-4" />
                Edit
              </button>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="Orders" value={String(customer.stats.totalOrders)} icon={PackageIcon} tone="primary" />
            <StatTile label="Returned" value={String(customer.stats.returnedCount)} icon={ReturnIcon} tone="cancelled" />
            <StatTile label="Lifetime Value" value={money(customer.stats.totalSpent)} icon={WalletIcon} tone="delivered" />
          </div>
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
          Orders
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-sm font-semibold text-primary">
            {customer.orders.length}
          </span>
        </h2>
        {customer.orders.length === 0 ? (
          <p className="text-sm text-foreground/50">No orders yet.</p>
        ) : (
          <div className="space-y-2">
            {customer.orders.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/5 px-4 py-3 transition-colors hover:border-primary/20 hover:bg-primary/[0.02]"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-delivered/10 text-status-delivered">
                    <PackageIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      Order {o.orderNumber}
                      <StatusBadge status={o.status} compact />
                    </div>
                    <div className="mt-0.5 text-xs text-foreground/50">
                      {o.createdByName ? `Taken by ${o.createdByName} · ` : ""}
                      {formatDateTime(o.createdAt)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">{money(o.total)}</span>
                  <Button variant="secondary" onClick={() => router.push(`/orders/${o.id}`)}>
                    View details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {customer.ordersByChannel.length > 1 && (
        <Card className="mt-6">
          <h2 className="mb-3 text-base font-semibold text-foreground">Orders by Store</h2>
          <div className="space-y-3">
            {customer.ordersByChannel.map((c) => (
              <div key={c.channelId ?? "none"} className="flex items-center justify-between text-sm">
                <span className="text-foreground/70">{c.channelName}</span>
                <span className="font-medium text-foreground">
                  {c.orderCount} · {money(c.totalSpent)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title="Edit Customer">
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

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
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface FormState {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes: string;
}

const EMPTY: FormState = { id: null, name: "", phone: "", email: "", address: "", city: "", notes: "" };

export default function CustomersPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { activeChannelId } = useChannelScope();

  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
      if (form.id) await api.patch(`/admin/customers/${form.id}`, payload);
      else await api.post("/admin/customers", payload);
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        description="One shared customer list across every storefront."
        actions={
          hasPermission("customers.manage") && (
            <Button
              variant="primary"
              onClick={() => {
                setFormError(null);
                setForm({ ...EMPTY });
              }}
            >
              New Customer
            </Button>
          )
        }
      />

      <div className="mb-4 w-64">
        <Input
          placeholder="Search name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}
        {!customers ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : customers.length === 0 ? (
          <p className="text-sm text-foreground/50">No customers match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Phone</th>
                <th className="pb-2 font-medium">City</th>
                <th className="pb-2 font-medium">Since</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-black/5 last:border-0">
                  <td className="py-2.5">
                    <button
                      onClick={() => router.push(`/customers/${c.id}`)}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {c.name}
                    </button>
                  </td>
                  <td className="py-2.5 text-foreground/70">{c.phone}</td>
                  <td className="py-2.5 text-foreground/60">{c.city ?? "—"}</td>
                  <td className="py-2.5 text-xs text-foreground/50">{formatDateTime(c.createdAt)}</td>
                  <td className="py-2.5 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => router.push(`/customers/${c.id}`)}>
                        View
                      </Button>
                      {hasPermission("customers.manage") && (
                        <Button variant="ghost" onClick={() => openEdit(c)}>
                          Edit
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit Customer" : "New Customer"}
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
                {submitting ? "Saving…" : form.id ? "Save Changes" : "Create Customer"}
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

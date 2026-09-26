"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Supplier } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface FormState {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  address: string;
}
const EMPTY: FormState = { id: null, name: "", phone: "", email: "", address: "" };

export default function SuppliersPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    try {
      setSuppliers(await api.get<Supplier[]>("/admin/suppliers"));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load suppliers");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    setSubmitting(true);
    const payload = {
      name: form.name,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
    };
    try {
      if (form.id) await api.patch(`/admin/suppliers/${form.id}`, payload);
      else await api.post("/admin/suppliers", payload);
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(s: Supplier) {
    if (!confirm(`Delete "${s.name}"? Past purchases keep their record.`)) return;
    setDeletingId(s.id);
    try {
      await api.delete(`/admin/suppliers/${s.id}`);
      await load();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to delete supplier");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Who you buy stock from."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setFormError(null);
              setForm({ ...EMPTY });
            }}
          >
            New Supplier
          </Button>
        }
      />
      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}
        {!suppliers ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : suppliers.length === 0 ? (
          <p className="text-sm text-foreground/50">No suppliers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Phone</th>
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-black/5 last:border-0">
                  <td className="py-2.5">
                    <button
                      onClick={() => router.push(`/suppliers/${s.id}`)}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {s.name}
                    </button>
                  </td>
                  <td className="py-2.5 text-foreground/70">{s.phone ?? "—"}</td>
                  <td className="py-2.5 text-foreground/60">{s.email ?? "—"}</td>
                  <td className="py-2.5 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setFormError(null);
                          setForm({
                            id: s.id,
                            name: s.name,
                            phone: s.phone ?? "",
                            email: s.email ?? "",
                            address: s.address ?? "",
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-status-cancelled hover:bg-status-cancelled/10"
                        disabled={deletingId === s.id}
                        onClick={() => handleDelete(s)}
                      >
                        {deletingId === s.id ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit Supplier" : "New Supplier"}>
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            {formError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{formError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : form.id ? "Save Changes" : "Create Supplier"}
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

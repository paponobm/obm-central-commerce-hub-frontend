"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { Role, StaffUser } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

interface FormState {
  id: string | null;
  name: string;
  email: string;
  password: string;
  roleId: string;
  channelIds: string[];
  isActive: boolean;
}

const EMPTY: FormState = {
  id: null,
  name: "",
  email: "",
  password: "",
  roleId: "",
  channelIds: [],
  isActive: true,
};

export default function UsersPage() {
  const { channels } = useChannelScope();
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      setUsers(await api.get<StaffUser[]>("/admin/users"));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load users");
    }
  }

  useEffect(() => {
    load();
    api.get<Role[]>("/admin/roles").then(setRoles).catch(() => {});
  }, []);

  const channelName = (id: string) => channels?.find((c) => c.id === id)?.name ?? id;
  const selectedRole = roles.find((r) => r.id === form?.roleId);
  const roleIsUnrestricted = selectedRole?.permissions.includes("channels.all_access") ?? false;

  function toggleChannel(id: string) {
    setForm((f) =>
      f
        ? {
            ...f,
            channelIds: f.channelIds.includes(id)
              ? f.channelIds.filter((c) => c !== id)
              : [...f.channelIds, id],
          }
        : f,
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    setSubmitting(true);
    try {
      if (form.id) {
        await api.patch(`/admin/users/${form.id}`, {
          name: form.name,
          email: form.email,
          roleId: form.roleId,
          channelIds: form.channelIds,
          isActive: form.isActive,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await api.post("/admin/users", {
          name: form.name,
          email: form.email,
          password: form.password,
          roleId: form.roleId,
          channelIds: form.channelIds,
          isActive: form.isActive,
        });
      }
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
        title="Users"
        description="Staff accounts, their role (what they can do), and their stores (where they can do it)."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setFormError(null);
              setForm({ ...EMPTY });
            }}
          >
            New User
          </Button>
        }
      />
      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}
        {!users ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-foreground/50">
                <th className="pb-2 font-medium">User</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Stores</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const unrestricted =
                  roles.find((r) => r.id === u.role.id)?.permissions.includes("channels.all_access") ?? false;
                return (
                  <tr key={u.id} className="border-b border-black/5 last:border-0">
                    <td className="py-2.5">
                      <div className="font-medium text-foreground">{u.name}</div>
                      <div className="text-xs text-foreground/50">{u.email}</div>
                    </td>
                    <td className="py-2.5">
                      <Pill>{u.role.name}</Pill>
                    </td>
                    <td className="py-2.5">
                      {unrestricted ? (
                        <span className="text-xs text-foreground/50">All stores</span>
                      ) : u.channelIds.length === 0 ? (
                        <span className="text-xs text-status-cancelled">None assigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.channelIds.map((id) => (
                            <Pill key={id} tone="primary">
                              {channelName(id)}
                            </Pill>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5">
                      <Pill tone={u.isActive ? "primary" : "default"}>{u.isActive ? "Active" : "Inactive"}</Pill>
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setFormError(null);
                          setForm({
                            id: u.id,
                            name: u.name,
                            email: u.email,
                            password: "",
                            roleId: u.role.id,
                            channelIds: u.channelIds,
                            isActive: u.isActive,
                          });
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit User" : "New User"}>
        {form && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>{form.id ? "New password (leave blank to keep)" : "Password"}</Label>
              <Input
                type="password"
                required={!form.id}
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                <option value="">Choose…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Stores</Label>
              {roleIsUnrestricted ? (
                <p className="text-xs text-foreground/50">
                  This role has access to every store — assignments below are ignored.
                </p>
              ) : (
                <p className="mb-1 text-xs text-foreground/50">
                  The user can only see and act on the stores ticked here. None ticked = no access.
                </p>
              )}
              <div className="mt-1 space-y-1">
                {(channels ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.channelIds.includes(c.id)}
                      onChange={() => toggleChannel(c.id)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active (can log in)
            </label>
            {formError && (
              <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">{formError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : form.id ? "Save Changes" : "Create User"}
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

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { Role, StaffUser } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { LoadingLine } from "@/components/ui/spinner";

// Mirrors the backend's role-hierarchy.ts — which roles a given actor role
// is allowed to create/edit users as. Manager and Member grant no
// user-management capability at all (absent as keys => []).
const ASSIGNABLE_ROLES: Record<string, string[]> = {
  "Super Admin": ["Super Admin", "Admin", "Manager", "Member"],
  Admin: ["Manager", "Member"],
};
function assignableRoleNames(actorRoleName: string | undefined): string[] {
  return ASSIGNABLE_ROLES[actorRoleName ?? ""] ?? [];
}

const ADMIN_ONLY_PERMISSION = "users.manage";
const STORE_WIDE_PERMISSION = "channels.all_access";

// Mirrors the sidebar's own nav-config.ts: one section per nav item, in
// the same order, with the same central-only boundary — a specific store
// only ever offers the sections that store scope actually unlocks in the
// app itself (Orders/Products/Customers/Reports), same as the sidebar.
const NAV_GROUPS: {
  key: string;
  title: string;
  permissionKeys: string[];
  centralOnly: boolean;
  // Mirrors nav-config.ts's own storeOnly flag on the Orders group — it's
  // a storefront feature, so it has nothing to grant under "All Stores"
  // and isn't offered there at all, the same way the sidebar hides it.
  storeOnly?: boolean;
}[] = [
  {
    // Independent of the Reports group below — its own dashboard.view
    // permission, not shared with reports.view.
    key: "dashboard",
    title: "Dashboard",
    permissionKeys: ["dashboard.view"],
    centralOnly: false,
  },
  {
    key: "orders",
    title: "Orders",
    permissionKeys: [
      "orders.view",
      "orders.create",
      "orders.update_status",
      "payments.view",
      "payments.manage",
      "shipments.view",
      "shipments.manage",
    ],
    centralOnly: false,
    storeOnly: true,
  },
  {
    key: "products",
    title: "Products",
    permissionKeys: ["products.view", "products.manage", "products.publish"],
    centralOnly: false,
  },
  {
    key: "inventory",
    title: "Inventory",
    permissionKeys: ["inventory.view", "inventory.adjust"],
    centralOnly: true,
  },
  {
    key: "purchasing",
    title: "Purchasing",
    permissionKeys: ["suppliers.manage"],
    centralOnly: true,
  },
  {
    key: "customers",
    title: "Customers",
    permissionKeys: ["customers.view", "customers.manage"],
    centralOnly: false,
  },
  {
    key: "channels",
    title: "Channels",
    permissionKeys: ["channels.view", "channels.manage"],
    centralOnly: true,
  },
  {
    key: "reports",
    title: "Reports",
    permissionKeys: ["reports.view"],
    centralOnly: false,
  },
  {
    key: "users",
    title: "Users, Roles & Settings",
    permissionKeys: [ADMIN_ONLY_PERMISSION],
    centralOnly: true,
  },
];

interface FormState {
  id: string | null;
  name: string;
  email: string;
  password: string;
  roleId: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  id: null,
  name: "",
  email: "",
  password: "",
  roleId: "",
  isActive: true,
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { channels } = useChannelScope();
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The per-user Access popup — permissions AND stores for an existing
  // user are both managed here, via the 🔐 icon on their row, not inline
  // in the create/edit form.
  const [accessUser, setAccessUser] = useState<StaffUser | null>(null);
  // "All Stores" scope's grants.
  const [accessPermissions, setAccessPermissions] = useState<string[]>([]);
  // Per-store grants, independent of accessPermissions and of each other —
  // keyed by channel id. A permission can be on for "All Stores" and off
  // for a specific store (or vice versa) at the same time.
  const [accessChannelPermissions, setAccessChannelPermissions] = useState<Record<string, string[]>>({});
  // Which scope's toggles are currently shown/editable: null = "All
  // Stores" tab, otherwise a channel id.
  const [accessActiveScope, setAccessActiveScope] = useState<string | null>(null);
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const assignable = assignableRoleNames(currentUser?.role);
  const assignableRoles = roles.filter((r) => assignable.includes(r.name));
  const channelName = (id: string) => channels?.find((c) => c.id === id)?.name ?? id;

  const selectedRole = roles.find((r) => r.id === form?.roleId);
  const isSuperAdminRole = selectedRole?.name === "Super Admin";

  function openCreate() {
    setFormError(null);
    setForm({ ...EMPTY });
  }

  function openEdit(u: StaffUser) {
    setFormError(null);
    setForm({
      id: u.id,
      name: u.name,
      email: u.email,
      password: "",
      roleId: u.role.id,
      isActive: u.isActive,
    });
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
          isActive: form.isActive,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await api.post("/admin/users", {
          name: form.name,
          email: form.email,
          password: form.password,
          roleId: form.roleId,
          permissions: { allStores: [], byChannel: {} },
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

  async function handleDelete(u: StaffUser) {
    if (!confirm(`Delete "${u.name}" (${u.email})? This cannot be undone.`)) return;
    setDeletingId(u.id);
    try {
      await api.delete(`/admin/users/${u.id}`);
      await load();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to delete user");
    } finally {
      setDeletingId(null);
    }
  }

  function openAccess(u: StaffUser) {
    setAccessError(null);
    setAccessUser(u);
    setAccessPermissions(u.permissionsByScope.allStores);
    setAccessChannelPermissions(u.permissionsByScope.byChannel);
    setAccessActiveScope(null);
  }

  // One switch per sidebar section — "Orders" means every order-related
  // function (view, create, update status, payments, shipments) at once,
  // not a granular breakdown. Turning it on grants the whole group; off
  // removes all of it. Applies to whichever scope tab is active — the
  // "All Stores" bucket or one specific store's own independent bucket.
  function toggleAccessGroup(keys: string[], scopeKey: string | null) {
    if (scopeKey === null) {
      setAccessPermissions((prev) => {
        const allOn = keys.every((k) => prev.includes(k));
        return allOn ? prev.filter((p) => !keys.includes(p)) : Array.from(new Set(prev.concat(keys)));
      });
      return;
    }
    setAccessChannelPermissions((prev) => {
      const current = prev[scopeKey] ?? [];
      const allOn = keys.every((k) => current.includes(k));
      const next = allOn
        ? current.filter((p) => !keys.includes(p))
        : Array.from(new Set(current.concat(keys)));
      return { ...prev, [scopeKey]: next };
    });
  }

  const accessIsMember = accessUser?.role.name === "Member";
  const accessIsAdmin = accessUser?.role.name === "Admin";

  // Every scope is always offered — which stores (and "All Stores") a user
  // can actually reach is derived entirely from which scopes end up with
  // any permission granted, not picked separately beforehand. A Member
  // never gets "All Stores" (the backend enforces they land on at most one
  // store either way).
  const accessScopeTabs: { key: string | null; label: string }[] = accessUser
    ? [
        ...(accessIsMember ? [] : [{ key: null, label: "All Stores" }]),
        ...(channels ?? []).map((c) => ({ key: c.id, label: c.name })),
      ]
    : [];
  const accessActiveScopeValid = accessScopeTabs.some((t) => t.key === accessActiveScope);
  const accessEffectiveScope = accessActiveScopeValid ? accessActiveScope : (accessScopeTabs[0]?.key ?? null);

  // Same nav-matching rule as the sidebar itself: centralOnly sections only
  // ever apply to "All Stores"; Orders only ever applies to one specific
  // store — mirrors nav-config.ts's own storeOnly flag.
  function navGroupsForScope(isAllStoresTab: boolean) {
    return NAV_GROUPS.filter((g) => !g.centralOnly || isAllStoresTab)
      .filter((g) => !g.storeOnly || !isAllStoresTab)
      .filter((g) => g.key !== "users" || accessIsAdmin);
  }

  function permissionsForScope(scopeKey: string | null): string[] {
    return scopeKey === null ? accessPermissions : (accessChannelPermissions[scopeKey] ?? []);
  }

  function scopeTabCount(scopeKey: string | null) {
    const groups = navGroupsForScope(scopeKey === null);
    const perms = permissionsForScope(scopeKey);
    const granted = groups.filter((g) => g.permissionKeys.every((k) => perms.includes(k))).length;
    return `${granted}/${groups.length}`;
  }

  async function handleAccessSave() {
    if (!accessUser) return;
    setAccessSaving(true);
    setAccessError(null);
    try {
      // Store assignment is derived server-side from which scopes end up
      // with any permission granted — not sent explicitly here.
      await api.patch(`/admin/users/${accessUser.id}`, {
        permissions: {
          allStores: accessPermissions,
          byChannel: accessChannelPermissions,
        },
      });
      setAccessUser(null);
      await load();
    } catch (err) {
      setAccessError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setAccessSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Staff accounts and their role. Permissions and stores for everyone but Super Admin are granted per user via the access icon on each row."
        actions={
          assignable.length > 0 && (
            <Button variant="primary" onClick={openCreate}>
              New User
            </Button>
          )
        }
      />
      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
            {loadError}
          </p>
        )}
        {!users ? (
          <LoadingLine />
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
                const unrestricted = u.role.name === "Super Admin" || u.permissions.includes(STORE_WIDE_PERMISSION);
                const canManage = assignable.includes(u.role.name);
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
                      {canManage && (
                        <div className="flex items-center justify-end gap-1">
                          {u.role.name !== "Super Admin" && (
                            <button
                              type="button"
                              onClick={() => openAccess(u)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-base text-foreground/50 hover:bg-black/5 hover:text-foreground"
                              aria-label="Manage access"
                              title="Manage permissions & stores"
                            >
                              🔐
                            </button>
                          )}
                          <Button variant="ghost" onClick={() => openEdit(u)}>
                            Edit
                          </Button>
                          {u.role.name !== "Super Admin" && u.id !== currentUser?.id && (
                            <Button
                              variant="ghost"
                              className="text-status-cancelled hover:bg-status-cancelled/10"
                              disabled={deletingId === u.id}
                              onClick={() => handleDelete(u)}
                            >
                              {deletingId === u.id ? "Deleting…" : "Delete"}
                            </Button>
                          )}
                        </div>
                      )}
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
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>

            <p className="rounded-lg bg-black/5 px-3 py-2 text-xs text-foreground/60">
              {isSuperAdminRole
                ? "Super Admin always has every permission and every store."
                : form.id
                  ? "Permissions and stores are managed via the 🔐 icon on this user's row."
                  : "Permissions and stores start empty — grant them via the 🔐 icon on this user's row after creating it."}
            </p>

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

      <Modal
        open={!!accessUser}
        onClose={() => setAccessUser(null)}
        title={accessUser ? `${accessUser.name}'s Access` : ""}
        size="lg"
      >
        {accessUser && (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="mb-4 shrink-0 text-xs text-foreground/50">
              Only what&apos;s switched on here applies to {accessUser.name} — not a shared role-wide set.
            </p>

            {accessScopeTabs.length === 0 ? (
              <p className="text-sm text-foreground/50">Pick a store above to grant permissions.</p>
            ) : (
              <>
                <p className="mb-2 shrink-0 text-xs text-foreground/50">
                  Each store below has its own independent permissions — granting something for one store
                  never grants it for another, or for &quot;All Stores&quot;.
                </p>
                <div className="mb-3 flex shrink-0 flex-wrap gap-1.5">
                  {accessScopeTabs.map((tab) => (
                    <button
                      key={tab.key ?? "all-stores"}
                      type="button"
                      onClick={() => setAccessActiveScope(tab.key)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        tab.key === accessEffectiveScope
                          ? "bg-primary text-white"
                          : "bg-black/5 text-foreground/70 hover:bg-black/10"
                      }`}
                    >
                      {tab.label} ({scopeTabCount(tab.key)})
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                  {navGroupsForScope(accessEffectiveScope === null).map((group) => (
                    <div key={group.key} className="flex items-center justify-between gap-3 rounded-lg bg-black/5 px-3 py-2">
                      <span className="text-sm font-medium text-foreground">{group.title}</span>
                      <Switch
                        checked={group.permissionKeys.every((k) => permissionsForScope(accessEffectiveScope).includes(k))}
                        onChange={() => toggleAccessGroup(group.permissionKeys, accessEffectiveScope)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {accessError && (
              <p className="mt-4 shrink-0 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                {accessError}
              </p>
            )}
            <div className="mt-4 flex shrink-0 items-center gap-2 border-t border-black/5 pt-4">
              <Button onClick={handleAccessSave} disabled={accessSaving}>
                {accessSaving ? "Saving…" : "Save Changes"}
              </Button>
              <Button variant="secondary" onClick={() => setAccessUser(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

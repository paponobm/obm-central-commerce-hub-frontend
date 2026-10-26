"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { Role, StaffUser } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Pill } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { LoadingLine } from "@/components/ui/spinner";

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-3.17 4.24M6.6 6.6C3.9 8.35 2 11 2 11s4 7 11 7a10.9 10.9 0 0 0 5-1.2M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

// Visible borders/background for the New/Edit User form's fields specifically
// (the shared Input/Select/Textarea default is intentionally subtle
// everywhere else — scoped here via `!` overrides, not a global change).
// Deliberately only "black/20" and "black/10" — globals.css only remaps
// those two exact opacity steps to a light overlay in dark mode (see
// :root[data-theme="dark"] .border-black\/20 etc.); any other opacity value,
// including an arbitrary one, stays literally black and disappears against
// the dark card background.
const VISIBLE_FIELD_CLASSES = "w-full !text-base !border-black/20 !bg-black/10";

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "delivered" | "pending";
}) {
  const dotClasses = { primary: "bg-primary", delivered: "bg-status-delivered", pending: "bg-status-pending" };
  const badgeClasses = {
    primary: "bg-primary/10",
    delivered: "bg-status-delivered/10",
    pending: "bg-status-pending/10",
  };
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground/60">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${badgeClasses[tone]}`}>
          <span className={`h-2 w-2 rounded-full ${dotClasses[tone]}`} />
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}

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
  // Three independent rows, each its own nav-visibility-only permission —
  // the actual Users/Roles/Settings pages and APIs stay gated solely by
  // ADMIN_ONLY_PERMISSION (unchanged); handleAccessSave grants that
  // alongside whichever of these are on, so a page still works if reached
  // directly even when its own link is toggled off.
  {
    key: "users",
    title: "Users",
    permissionKeys: ["nav.users"],
    centralOnly: true,
  },
  {
    key: "roles",
    title: "Roles",
    permissionKeys: ["nav.roles"],
    centralOnly: true,
  },
  {
    key: "settings-nav",
    title: "Settings",
    permissionKeys: ["nav.settings"],
    centralOnly: true,
  },
];

const USERS_ROLES_SETTINGS_GROUP_KEYS = ["users", "roles", "settings-nav"];

const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;
const SHIFT_OPTIONS = ["Morning", "Afternoon", "Evening", "Night"] as const;

interface FormState {
  id: string | null;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  roleId: string;
  isActive: boolean;
  avatarUrl: string;
  phone: string;
  employeeCode: string;
  gender: string;
  joiningDate: string;
  shift: string;
  designation: string;
  about: string;
}

const EMPTY: FormState = {
  id: null,
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  roleId: "",
  isActive: true,
  avatarUrl: "",
  phone: "",
  employeeCode: "",
  gender: "",
  joiningDate: "",
  shift: "",
  designation: "",
  about: "",
};

// Distinct colors per role so the list is scannable at a glance — matches
// the Pill component's existing solid tones, no new styling introduced.
const ROLE_TONES: Record<string, "info" | "alert" | "success" | "default"> = {
  "Super Admin": "info",
  Admin: "alert",
  Manager: "success",
};
function roleTone(roleName: string): "info" | "alert" | "success" | "default" {
  return ROLE_TONES[roleName] ?? "default";
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { channels } = useChannelScope();
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // Click-to-zoom on a row's profile photo — holds the image URL (and whose
  // it is, for the alt text) currently shown full-size, or null when closed.
  const [zoomedAvatar, setZoomedAvatar] = useState<{ url: string; name: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
  // Manage-access and Delete are Super Admin only — an Admin can still
  // edit a Manager/Member (gated by canManage below) but can't grant
  // permissions or remove accounts.
  const isSuperAdminActor = currentUser?.role === "Super Admin";

  const selectedRole = roles.find((r) => r.id === form?.roleId);
  const isSuperAdminRole = selectedRole?.name === "Super Admin";

  function openCreate() {
    setFormError(null);
    setAvatarError(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setForm({ ...EMPTY });
  }

  function openEdit(u: StaffUser) {
    setFormError(null);
    setAvatarError(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setForm({
      id: u.id,
      name: u.name,
      email: u.email,
      password: "",
      confirmPassword: "",
      roleId: u.role.id,
      isActive: u.isActive,
      avatarUrl: u.avatarUrl ?? "",
      phone: u.phone ?? "",
      employeeCode: u.employeeCode ?? "",
      gender: u.gender ?? "",
      joiningDate: u.joiningDate ? u.joiningDate.slice(0, 10) : "",
      shift: u.shift ?? "",
      designation: u.designation ?? "",
      about: u.about ?? "",
    });
  }

  // Generates a readable-but-strong password (upper/lower/digit/symbol,
  // 12 chars) and fills both fields, matching the reference form's
  // "Generate Password" button — purely a convenience, same /admin/users
  // password rules apply either way (min 8 chars, enforced server-side).
  function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    const value = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setForm((prev) => (prev ? { ...prev, password: value, confirmPassword: value } : prev));
  }

  async function handleAvatarSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    setUploadingAvatar(true);
    try {
      const { url } = await api.upload<{ url: string }>("/admin/uploads/image", file);
      setForm((prev) => (prev ? { ...prev, avatarUrl: url } : prev));
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : "Failed to upload photo");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFormError(null);

    // Password confirmation is a pure client-side check — the backend only
    // ever sees the one password value, same as before.
    if ((form.password || !form.id) && form.password !== form.confirmPassword) {
      setFormError("Password and Confirm Password don't match.");
      return;
    }

    const profileFields = {
      avatarUrl: form.avatarUrl || undefined,
      phone: form.phone || undefined,
      employeeCode: form.employeeCode || undefined,
      gender: form.gender || undefined,
      joiningDate: form.joiningDate || undefined,
      shift: form.shift || undefined,
      designation: form.designation || undefined,
      about: form.about || undefined,
    };

    setSubmitting(true);
    try {
      if (form.id) {
        await api.patch(`/admin/users/${form.id}`, {
          name: form.name,
          email: form.email,
          roleId: form.roleId,
          isActive: form.isActive,
          ...(form.password ? { password: form.password } : {}),
          ...profileFields,
        });
      } else {
        await api.post("/admin/users", {
          name: form.name,
          email: form.email,
          password: form.password,
          roleId: form.roleId,
          permissions: { allStores: [], byChannel: {} },
          isActive: form.isActive,
          ...profileFields,
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
      .filter((g) => !USERS_ROLES_SETTINGS_GROUP_KEYS.includes(g.key) || accessIsAdmin);
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

  // The three sidebar links (nav.users/nav.roles/nav.settings) are display
  // toggles only — the actual Users/Roles/Settings pages and APIs are still
  // gated solely by ADMIN_ONLY_PERMISSION (users.manage), unchanged. So
  // whenever any one of the three is on for a scope, users.manage must also
  // be on for that same scope (otherwise the page would 403 even though its
  // link shows); when none of the three is on, there's no reason to keep
  // users.manage granted either.
  const NAV_DISPLAY_KEYS = ["nav.users", "nav.roles", "nav.settings"];
  function withDerivedUsersManage(perms: string[]): string[] {
    const withoutIt = perms.filter((p) => p !== ADMIN_ONLY_PERMISSION);
    const anyNavOn = NAV_DISPLAY_KEYS.some((k) => perms.includes(k));
    return anyNavOn ? [...withoutIt, ADMIN_ONLY_PERMISSION] : withoutIt;
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
          allStores: withDerivedUsersManage(accessPermissions),
          byChannel: Object.fromEntries(
            Object.entries(accessChannelPermissions).map(([channelId, perms]) => [
              channelId,
              withDerivedUsersManage(perms),
            ]),
          ),
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

  const totalUsers = users?.length ?? 0;
  const activeCount = users?.filter((u) => u.isActive).length ?? 0;
  const inactiveCount = totalUsers - activeCount;

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

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Total Users" value={String(totalUsers)} tone="primary" />
        <SummaryCard label="Active" value={String(activeCount)} tone="delivered" />
        <SummaryCard label="Inactive" value={String(inactiveCount)} tone="pending" />
      </div>

      <Card>
        {loadError && (
          <p className="mb-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
            {loadError}
          </p>
        )}
        {!users ? (
          <LoadingLine />
        ) : (
          <table className="w-full text-left text-base">
            <thead>
              <tr style={{ backgroundColor: "rgba(47, 111, 235, 0.15)" }}>
                <th className="rounded-l-lg px-3 py-3 font-bold">#</th>
                <th className="px-3 py-3 font-bold">User</th>
                <th className="px-3 py-3 font-bold">Role</th>
                <th className="px-3 py-3 font-bold">Stores</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="rounded-r-lg px-3 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const unrestricted = u.role.name === "Super Admin" || u.permissions.includes(STORE_WIDE_PERMISSION);
                const canManage = assignable.includes(u.role.name);
                return (
                  <tr key={u.id} className="border-b border-black/5 last:border-0">
                    <td className="px-3 py-3 text-foreground/50">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        {u.avatarUrl ? (
                          <button
                            type="button"
                            onClick={() => setZoomedAvatar({ url: u.avatarUrl!, name: u.name })}
                            className="shrink-0 rounded-full"
                            aria-label={`View ${u.name}'s photo`}
                            title="Click to zoom"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded profile photo */}
                            <img
                              src={u.avatarUrl}
                              alt={u.name}
                              className="h-9 w-9 rounded-full border border-black/15 object-cover transition-transform hover:scale-105"
                            />
                          </button>
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-sm font-semibold text-primary">
                            {u.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <div className="font-bold text-primary">{u.name}</div>
                          <div className="text-sm text-foreground/50">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Pill tone={roleTone(u.role.name)}>{u.role.name}</Pill>
                    </td>
                    <td className="px-3 py-3">
                      {unrestricted ? (
                        <span className="text-sm text-foreground/50">All stores</span>
                      ) : u.channelIds.length === 0 ? (
                        <span className="text-sm text-status-cancelled">None assigned</span>
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
                    <td className="px-3 py-3">
                      <Pill tone={u.isActive ? "success" : "default"}>{u.isActive ? "Active" : "Inactive"}</Pill>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {canManage && (
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Manage-access and Delete are Super Admin only — an
                              Admin can still edit a Manager/Member (below),
                              just not grant permissions or remove them. */}
                          {isSuperAdminActor && u.role.name !== "Super Admin" && (
                            <button
                              type="button"
                              onClick={() => openAccess(u)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-foreground/50 hover:bg-black/5 hover:text-foreground"
                              aria-label="Manage access"
                              title="Manage permissions & stores"
                            >
                              <LockIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-foreground/50 hover:bg-black/5 hover:text-foreground"
                            aria-label={`Edit ${u.name}`}
                            title="Edit"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          {isSuperAdminActor && u.role.name !== "Super Admin" && u.id !== currentUser?.id && (
                            <button
                              type="button"
                              disabled={deletingId === u.id}
                              onClick={() => handleDelete(u)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/15 text-status-cancelled hover:bg-status-cancelled/10 disabled:opacity-50"
                              aria-label={`Delete ${u.name}`}
                              title="Delete"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
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

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit User" : "New User"}
        titleClassName="!text-lg"
        size="xl"
      >
        {form && (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            <div>
              <Label className="!text-base !font-bold">Profile Photo</Label>
              <div className="flex items-center gap-3">
                {form.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded profile photo
                  <img
                    src={form.avatarUrl}
                    alt={form.name || "Profile"}
                    className="h-16 w-16 shrink-0 rounded-full border-2 border-black/15 object-cover"
                  />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10 text-xl font-semibold text-primary">
                    {form.name ? form.name.charAt(0).toUpperCase() : "?"}
                  </span>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-black/15 bg-white px-3 py-2 text-base font-medium text-foreground hover:bg-black/5">
                  {uploadingAvatar ? "Uploading…" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    disabled={uploadingAvatar}
                    onChange={handleAvatarSelect}
                  />
                </label>
              </div>
              {avatarError && <p className="mt-2 text-base text-status-cancelled">{avatarError}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label className="!text-base !font-bold">Full Name *</Label>
                <Input
                  required
                  className={VISIBLE_FIELD_CLASSES}
                  placeholder="First and last name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label className="!text-base !font-bold">Email *</Label>
                <Input
                  required
                  type="email"
                  className={VISIBLE_FIELD_CLASSES}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label className="!text-base !font-bold">Contact Number</Label>
                <Input
                  className={VISIBLE_FIELD_CLASSES}
                  placeholder="01XXXXXXXXX"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label className="!text-base !font-bold">
                  {form.id ? "New Password (leave blank to keep)" : "Password *"}
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    required={!form.id}
                    minLength={8}
                    className={`${VISIBLE_FIELD_CLASSES} pr-10`}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-foreground/40 hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOffIcon className="h-4.5 w-4" /> : <EyeIcon className="h-4.5 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="!text-base !font-bold">
                  {form.id ? "Confirm New Password" : "Confirm Password *"}
                </Label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    required={!form.id}
                    minLength={8}
                    className={`${VISIBLE_FIELD_CLASSES} pr-10`}
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-foreground/40 hover:text-foreground"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOffIcon className="h-4.5 w-4" /> : <EyeIcon className="h-4.5 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-end">
                <Button type="button" variant="secondary" onClick={generatePassword}>
                  Generate Password
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label className="!text-base !font-bold">Emp Code</Label>
                <Input
                  className={VISIBLE_FIELD_CLASSES}
                  value={form.employeeCode}
                  onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                />
              </div>
              <div>
                <Label className="!text-base !font-bold">Role *</Label>
                <Select
                  required
                  className={VISIBLE_FIELD_CLASSES}
                  value={form.roleId}
                  onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="!text-base !font-bold">Gender</Label>
                <Select
                  className={VISIBLE_FIELD_CLASSES}
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="">Select</option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label className="!text-base !font-bold">Joining Date</Label>
                <Input
                  type="date"
                  className={VISIBLE_FIELD_CLASSES}
                  value={form.joiningDate}
                  onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="!text-base !font-bold">Shift</Label>
                <Select
                  className={VISIBLE_FIELD_CLASSES}
                  value={form.shift}
                  onChange={(e) => setForm({ ...form, shift: e.target.value })}
                >
                  <option value="">Select</option>
                  {SHIFT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="!text-base !font-bold">Designation</Label>
                <Input
                  className={VISIBLE_FIELD_CLASSES}
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label className="!text-base !font-bold">About</Label>
              <Textarea
                rows={4}
                className={VISIBLE_FIELD_CLASSES}
                value={form.about}
                onChange={(e) => setForm({ ...form, about: e.target.value })}
              />
            </div>

            <p className="rounded-lg bg-black/5 px-3 py-2 text-base text-foreground/60">
              {isSuperAdminRole
                ? "Super Admin always has every permission and every store."
                : form.id
                  ? "Permissions and stores are managed via the 🔐 icon on this user's row."
                  : "Permissions and stores start empty — grant them via the 🔐 icon on this user's row after creating it."}
            </p>

            <label className="flex items-center gap-2 text-base text-foreground">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active (can log in)
            </label>
          </div>

            {formError && (
              <p className="mt-4 shrink-0 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">{formError}</p>
            )}
            <div className="mt-4 flex shrink-0 items-center gap-2 border-t border-black/5 pt-4">
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
        titleClassName="!text-lg"
        size="lg"
      >
        {accessUser && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* <p className="mb-4 shrink-0 text-base text-foreground/50">
              Only what&apos;s switched on here applies to {accessUser.name} — not a shared role-wide set.
            </p> */}

            {accessScopeTabs.length === 0 ? (
              <p className="text-base text-foreground/50">Pick a store above to grant permissions.</p>
            ) : (
              <>
                {/* <p className="mb-2 shrink-0 text-base text-foreground/50">
                  Each store below has its own independent permissions — granting something for one store
                  never grants it for another, or for &quot;All Stores&quot;.
                </p> */}
                <div className="mb-3 flex shrink-0 flex-wrap gap-1.5">
                  {accessScopeTabs.map((tab) => (
                    <button
                      key={tab.key ?? "all-stores"}
                      type="button"
                      onClick={() => setAccessActiveScope(tab.key)}
                      className={`rounded-lg px-3 py-1.5 text-base font-medium transition-colors ${
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
                      <span className="text-base font-medium text-foreground">{group.title}</span>
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
              <p className="mt-4 shrink-0 rounded-lg bg-status-cancelled/10 px-3 py-2 text-base text-status-cancelled">
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

      {zoomedAvatar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoomedAvatar(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded profile photo, zoomed view */}
            <img
              src={zoomedAvatar.url}
              alt={zoomedAvatar.name}
              className="max-h-[80vh] max-w-[80vw] rounded-xl border-4 border-white object-contain shadow-card"
            />
            <button
              type="button"
              onClick={() => setZoomedAvatar(null)}
              aria-label="Close"
              className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-status-cancelled text-base text-white hover:opacity-90"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

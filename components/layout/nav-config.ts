import type { NavIconKey } from "./nav-icons";

export interface NavLink {
  type: "link";
  label: string;
  href: string;
  icon: NavIconKey;
  permission?: string;
  centralOnly?: boolean;
  storeOnly?: boolean;
}

export interface NavGroup {
  type: "group";
  label: string;
  icon: NavIconKey;
  permission?: string;
  centralOnly?: boolean;
  storeOnly?: boolean;
  children: { label: string; href: string; centralOnly?: boolean }[];
}

export type NavEntry = NavLink | NavGroup;

// Groups only exist where there's more than one real page behind them —
// no nested item here points anywhere that doesn't already exist.
export const NAV_ENTRIES: NavEntry[] = [
  { type: "link", label: "Dashboard", href: "/", icon: "dashboard", permission: "dashboard.view" },
  { type: "link", label: "Search", href: "/search", icon: "search", permission: "orders.view" },
  {
    type: "group",
    label: "Orders",
    icon: "orders",
    permission: "orders.view",
    storeOnly: true,
    children: [
      { label: "New Order", href: "/orders/new" },
      { label: "Web Orders", href: "/web-orders" },
      { label: "All Orders", href: "/orders" },
    ],
  },
  {
    type: "group",
    label: "Products",
    icon: "products",
    permission: "products.view",
    children: [
      { label: "All Products", href: "/products" },
      { label: "Categories", href: "/categories", centralOnly: true },
      { label: "Brands", href: "/brands", centralOnly: true },
    ],
  },
  {
    type: "group",
    label: "Inventory",
    icon: "inventory",
    permission: "inventory.view",
    centralOnly: true,
    children: [
      { label: "All Stock", href: "/inventory" },
      // { label: "Low Stock", href: "/inventory/low-stock" },
      { label: "Movements", href: "/inventory/movements" },
    ],
  },
  // Turned off in the sidebar per request (not needed yet) — uncomment to
  // bring back. The page and its backend module are untouched, so this is
  // reversible with just this one block restored.
  // {
  //   type: "group",
  //   label: "Purchasing",
  //   permission: "suppliers.manage",
  //   centralOnly: true,
  //   children: [
  //     { label: "Purchases", href: "/purchases" },
  //     { label: "Suppliers", href: "/suppliers" },
  //   ],
  // },
  // Courier integrations are configured per storefront, so this is
  // storeOnly — hidden under "All Stores" and only shown once a specific
  // store (e.g. Online Burmese Market) is selected.
  {
    type: "link",
    label: "Integrations",
    href: "/integrations",
    icon: "integrations",
    permission: "integrations.manage",
    storeOnly: true,
  },
  { type: "link", label: "Customers", href: "/customers", icon: "customers", permission: "customers.view" },
  // channels.view is a baseline permission granted automatically to any
  // non-Super-Admin user (see UsersService.sanitizePermissions — the store
  // picker itself depends on it), so it can't be used to gate this link;
  // channels.manage is the one that actually reflects a deliberate grant.
  { type: "link", label: "Channels", href: "/channels", icon: "channels", permission: "channels.manage", centralOnly: true },
  {
    type: "group",
    label: "Reports",
    icon: "reports",
    permission: "reports.view",
    children: [
      { label: "Sales Report", href: "/reports" },
      { label: "Order Report", href: "/reports/order" },
      { label: "COD Report", href: "/reports/cod" },
    ],
  },
  // Each gated on its own nav-visibility-only permission, independent of
  // the others — the pages/APIs themselves are still all gated solely by
  // users.manage (unchanged), so one of these being off only hides that
  // link; it doesn't block the page if reached directly. See the Access
  // panel in users/page.tsx, which grants these alongside users.manage.
  { type: "link", label: "Users", href: "/users", icon: "users", permission: "nav.users", centralOnly: true },
  { type: "link", label: "Roles", href: "/roles", icon: "roles", permission: "nav.roles", centralOnly: true },
  { type: "link", label: "Settings", href: "/settings", icon: "settings", permission: "nav.settings", centralOnly: true },
];

// Inside a storefront (a specific store selected), Dashboard, Orders,
// Products, Customers, and Reports are all available, each scoped to that
// store. Everything below is the shared, cross-store side of the business —
// hidden from the sidebar and redirected away from if reached by URL. The
// server enforces the same boundary for store-assigned users
// (CentralOnlyGuard); this is the matching UI mode.
export const STORE_BLOCKED_PREFIXES = [
  "/inventory",
  "/purchases",
  "/suppliers",
  "/users",
  "/roles",
  "/settings",
  "/categories",
  "/brands",
];

export function isBlockedInStore(pathname: string): boolean {
  if (STORE_BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  // Store workspace tabs that are central-only: /channels/:id/{customers,inventory,reports}
  return /^\/channels\/[^/]+\/(customers|inventory|reports)(\/|$)/.test(pathname);
}

// The reverse boundary: Web Orders (the checkout-lead funnel) is inherently
// per-channel — its own nav link and topbar shortcut only ever appear once a
// specific store is active — so landing back on "All Stores" while still on
// one of its pages (e.g. by switching stores mid-visit) sends you to the
// Dashboard instead of leaving an orphaned page open. Orders and New Order
// are deliberately NOT here — both already have their own "All Stores" /
// "no channel" modes.
export const STORE_ONLY_PREFIXES = ["/web-orders", "/integrations"];

export function isBlockedWithoutStore(pathname: string): boolean {
  return STORE_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function trailIsActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

// The current route's nav trail (e.g. [{label: "Products"}, {label: "All
// Products", href: "/products"}]) — for the small-screen breadcrumb, which
// stands in for the sidebar's own nav tree when that's off-canvas. Same
// longest-prefix-match convention as the sidebar's own active-highlight
// (a detail route like /products/abc123 still resolves to its nearest real
// entry), computed independently here so the sidebar's own logic is
// untouched.
export function findNavTrail(pathname: string): BreadcrumbItem[] {
  let best: { trail: BreadcrumbItem[]; href: string } | null = null;
  for (const entry of NAV_ENTRIES) {
    if (entry.type === "link") {
      if (trailIsActivePath(pathname, entry.href) && (!best || entry.href.length > best.href.length)) {
        best = { trail: [{ label: entry.label, href: entry.href }], href: entry.href };
      }
    } else {
      for (const child of entry.children) {
        if (trailIsActivePath(pathname, child.href) && (!best || child.href.length > best.href.length)) {
          best = {
            trail: [{ label: entry.label }, { label: child.label, href: child.href }],
            href: child.href,
          };
        }
      }
    }
  }
  return best?.trail ?? [];
}

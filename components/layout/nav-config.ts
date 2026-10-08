export interface NavLink {
  type: "link";
  label: string;
  href: string;
  permission?: string;
  centralOnly?: boolean;
}

export interface NavGroup {
  type: "group";
  label: string;
  permission?: string;
  centralOnly?: boolean;
  storeOnly?: boolean;
  children: { label: string; href: string; centralOnly?: boolean }[];
}

export type NavEntry = NavLink | NavGroup;

// Groups only exist where there's more than one real page behind them —
// no nested item here points anywhere that doesn't already exist.
export const NAV_ENTRIES: NavEntry[] = [
  { type: "link", label: "Dashboard", href: "/" },
  {
    type: "group",
    label: "Orders",
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
    permission: "inventory.view",
    centralOnly: true,
    children: [
      { label: "All Stock", href: "/inventory" },
      { label: "Low Stock", href: "/inventory/low-stock" },
      { label: "Movements", href: "/inventory/movements" },
    ],
  },
  {
    type: "group",
    label: "Purchasing",
    permission: "suppliers.manage",
    centralOnly: true,
    children: [
      { label: "Purchases", href: "/purchases" },
      { label: "Suppliers", href: "/suppliers" },
    ],
  },
  { type: "link", label: "Customers", href: "/customers", permission: "customers.view" },
  { type: "link", label: "Channels", href: "/channels", permission: "channels.view", centralOnly: true },
  { type: "link", label: "Reports", href: "/reports", permission: "reports.view" },
  { type: "link", label: "Users", href: "/users", permission: "users.manage", centralOnly: true },
  { type: "link", label: "Roles", href: "/roles", permission: "users.manage", centralOnly: true },
  { type: "link", label: "Settings", href: "/settings", permission: "users.manage", centralOnly: true },
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
export const STORE_ONLY_PREFIXES = ["/web-orders"];

export function isBlockedWithoutStore(pathname: string): boolean {
  return STORE_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

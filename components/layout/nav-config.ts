export interface NavLink {
  type: "link";
  label: string;
  href: string;
  permission?: string;
}

export interface NavGroup {
  type: "group";
  label: string;
  permission?: string;
  children: { label: string; href: string }[];
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
    children: [
      { label: "New Order", href: "/orders/new" },
      { label: "All Orders", href: "/orders" },
    ],
  },
  {
    type: "group",
    label: "Products",
    permission: "products.view",
    children: [
      { label: "All Products", href: "/products" },
      { label: "Categories", href: "/categories" },
      { label: "Brands", href: "/brands" },
    ],
  },
  { type: "link", label: "Inventory", href: "/inventory", permission: "inventory.view" },
  { type: "link", label: "Customers", href: "/customers", permission: "customers.view" },
  { type: "link", label: "Channels", href: "/channels", permission: "channels.view" },
  { type: "link", label: "Reports", href: "/reports", permission: "reports.view" },
  { type: "link", label: "Roles", href: "/roles", permission: "users.manage" },
];

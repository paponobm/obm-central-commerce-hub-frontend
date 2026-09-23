export interface NavItem {
  label: string;
  href: string;
  permission?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ label: "Dashboard", href: "/" }],
  },
  {
    title: "Work",
    items: [
      { label: "Orders", href: "/orders", permission: "orders.view" },
      { label: "Products", href: "/products", permission: "products.view" },
      { label: "Categories", href: "/categories", permission: "products.view" },
      { label: "Brands", href: "/brands", permission: "products.view" },
      { label: "Inventory", href: "/inventory", permission: "inventory.view" },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Customers", href: "/customers", permission: "customers.view" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Channels", href: "/channels", permission: "channels.view" },
      { label: "Reports", href: "/reports", permission: "reports.view" },
      { label: "Roles", href: "/roles", permission: "users.manage" },
    ],
  },
];

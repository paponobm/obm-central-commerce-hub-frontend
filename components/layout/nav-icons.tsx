import type { SVGProps } from "react";

// One plain outline icon per top-level sidebar entry — same hand-drawn-SVG
// convention used elsewhere in the app (no icon library installed).
// Consistent 20x20 viewBox / stroke style so every row lines up.

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

function DashboardIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.3" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.3" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.3" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.3" />
    </svg>
  );
}

function OrdersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 4h10l1 3H4l1-3Z" />
      <path d="M4 7h12l-1 9a1.5 1.5 0 0 1-1.5 1.3h-7A1.5 1.5 0 0 1 5 16L4 7Z" />
      <path d="M7.5 10v3M12.5 10v3" />
    </svg>
  );
}

function ProductsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 2.5 17 6v8l-7 3.5L3 14V6l7-3.5Z" />
      <path d="M3 6l7 3.5L17 6" />
      <path d="M10 9.5V17.5" />
    </svg>
  );
}

function InventoryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="3" width="15" height="4" rx="1" />
      <path d="M3.5 7v8a1.3 1.3 0 0 0 1.3 1.3h10.4A1.3 1.3 0 0 0 16.5 15V7" />
      <path d="M8 10.5h4" />
    </svg>
  );
}

function IntegrationsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3v3M13 3v3" />
      <rect x="5" y="6" width="10" height="7" rx="2" />
      <path d="M10 13v2a2 2 0 0 1-2 2H6" />
    </svg>
  );
}

function CustomersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="7" cy="7" r="2.6" />
      <path d="M2.5 16.5c0-2.8 2-4.7 4.5-4.7s4.5 1.9 4.5 4.7" />
      <circle cx="14.2" cy="6.5" r="2.1" />
      <path d="M12.8 11.6c1.9.2 3.2 1.9 3.2 4.4" />
    </svg>
  );
}

function ChannelsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 7l1-3.5h12L17 7" />
      <path d="M3 7a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 2-0" />
      <path d="M4 7v8.5A1 1 0 0 0 5 16.5h10a1 1 0 0 0 1-1V7" />
      <path d="M8 16.5V12h4v4.5" />
    </svg>
  );
}

function ReportsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 17V3" />
      <path d="M3 17h14" />
      <rect x="5.5" y="10" width="2.3" height="5" />
      <rect x="9.3" y="7" width="2.3" height="8" />
      <rect x="13.2" y="4" width="2.3" height="11" />
    </svg>
  );
}

function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M3.5 17c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    </svg>
  );
}

function RolesIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 2.5 16 5v4.5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V5l6-2.5Z" />
      <path d="M7.3 10l1.9 1.9 3.5-3.8" />
    </svg>
  );
}

function SettingsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 3.3v1.6M10 15.1v1.6M16.7 10h-1.6M4.9 10H3.3M14.7 5.3l-1.1 1.1M6.4 13.6l-1.1 1.1M14.7 14.7l-1.1-1.1M6.4 6.4 5.3 5.3" />
    </svg>
  );
}

export const NAV_ICONS = {
  dashboard: DashboardIcon,
  orders: OrdersIcon,
  products: ProductsIcon,
  inventory: InventoryIcon,
  integrations: IntegrationsIcon,
  customers: CustomersIcon,
  channels: ChannelsIcon,
  reports: ReportsIcon,
  users: UsersIcon,
  roles: RolesIcon,
  settings: SettingsIcon,
} as const;

export type NavIconKey = keyof typeof NAV_ICONS;

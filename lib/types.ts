export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURNED";

export type OrderSource = "WEBSITE" | "MANUAL" | "FACEBOOK" | "PHONE" | "WHATSAPP" | "OTHER";
export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED";
export type ShipmentStatus =
  | "NOT_SHIPPED"
  | "PROCESSING"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED";
export type PaymentMethod = "COD" | "BKASH" | "NAGAD" | "BANK_TRANSFER" | "CARD" | "OTHER";

export interface Channel {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logoUrl: string | null;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface Brand {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  costPrice: string;
  basePrice: string;
  unit: string;
  categoryId: string | null;
  brandId: string | null;
  isActive: boolean;
  category?: Category | null;
  brand?: Brand | null;
  inventory?: InventorySummary | null;
  images?: { id: string; url: string; sortOrder: number }[];
  channels?: { channel: Channel; isPublished: boolean; price: string; name: string | null }[];
}

export interface ProductChannelOverride {
  channelId: string;
  channelName: string;
  channelSlug: string;
  linked: boolean;
  isPublished: boolean;
  name: string | null;
  slug: string | null;
  price: string | null;
  compareAtPrice: string | null;
  isFeatured: boolean;
  sortOrder: number;
}

export interface InventorySummary {
  productId: string;
  sku: string;
  name: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string } | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  channelId: string | null;
  source: OrderSource;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shipmentStatus: ShipmentStatus;
  subtotal: string;
  discount: string;
  shippingFee: string;
  total: string;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  notes: string | null;
  createdAt: string;
  customer?: Customer;
  channel?: Channel | null;
  items?: OrderItem[];
  statusHistory?: OrderStatusHistoryEntry[];
  payments?: Payment[];
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  total: string;
}

export interface OrderStatusHistoryEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  amount: string;
  status: PaymentStatus;
  paidAt: string | null;
}

export interface DashboardData {
  today: { orderCount: number; salesTotal: number };
  ordersByStatus: Record<OrderStatus, number>;
  ordersByChannel: {
    channelId: string | null;
    channelName: string;
    orderCount: number;
    salesTotal: number;
  }[];
  ordersBySource: { source: OrderSource; orderCount: number; salesTotal: number }[];
  lowStock: { count: number; products: InventorySummary[] };
  recentOrders: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    total: number;
    customerName: string | null;
    channelName: string;
    source: OrderSource;
    createdAt: string;
  }[];
  salesLast7Days: { date: string; orderCount: number; salesTotal: number }[];
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
}

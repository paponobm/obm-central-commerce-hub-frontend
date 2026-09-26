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
export type CustomerResponseStatus =
  | "NO_RESPONSE"
  | "CALL_BACK"
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "CONFIRMED";
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

export interface ChannelWithStats extends Channel {
  productCount: number;
  orderCount: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  parentId: string | null;
}

export interface Brand {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  sortOrder: number;
}

// The findOne() include is a raw Prisma relation, not run through
// InventoryService — no computed availableStock/isLowStock here, just the
// four stored columns. Compute availableStock client-side where needed.
export interface RawInventory {
  id: string;
  productId: string;
  currentStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  updatedAt: string;
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
  inventory?: RawInventory | null;
  images?: ProductImage[];
  // Only published (isPublished: true) rows — see ProductsService.findAll.
  channels?: { channelId: string; channel: { name: string } }[];
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
  product?: { id: string; sku: string; name: string };
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

export interface CustomerDetail extends Customer {
  stats: { totalOrders: number; totalSpent: number; lastOrderAt: string | null };
  ordersByChannel: {
    channelId: string | null;
    channelName: string;
    orderCount: number;
    totalSpent: number;
  }[];
  orders: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    total: number;
    createdAt: string;
    channelName: string;
  }[];
}

interface OrderBase {
  id: string;
  orderNumber: string;
  channelId: string | null;
  source: OrderSource;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shipmentStatus: ShipmentStatus;
  customerResponse: CustomerResponseStatus;
  subtotal: string;
  discount: string;
  shippingFee: string;
  total: string;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  notes: string | null;
  createdAt: string;
  items: OrderItem[];
}

// GET /admin/orders — customer/channel are select-limited subsets, not the
// full shapes findOne() returns.
export interface OrderListItem extends OrderBase {
  customer: Pick<Customer, "id" | "name" | "phone">;
  channel: Pick<Channel, "id" | "name" | "slug"> | null;
}

// GET /admin/orders/:id — full nested shapes plus history/payments/shipment.
export interface OrderDetail extends OrderBase {
  customer: Customer;
  channel: Channel | null;
  statusHistory: OrderStatusHistoryEntry[];
  timeline: TimelineEntry[];
  payments: Payment[];
  shipment: unknown | null;
}

interface TimelineActor {
  id: string;
  name: string;
}

export type TimelineEntry =
  | {
      type: "status";
      id: string;
      fromStatus: OrderStatus | null;
      toStatus: OrderStatus;
      note: string | null;
      changedBy: TimelineActor | null;
      createdAt: string;
    }
  | {
      type: "customer_response";
      id: string;
      fromResponse: CustomerResponseStatus | null;
      toResponse: CustomerResponseStatus | null;
      note: string | null;
      changedBy: TimelineActor | null;
      createdAt: string;
    };

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

export type PurchaseStatus = "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED";

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  createdAt: string;
}

export interface SupplierDetail extends Supplier {
  purchases: {
    id: string;
    status: PurchaseStatus;
    totalCost: string;
    createdAt: string;
    receivedAt: string | null;
  }[];
}

export interface PurchaseListItem {
  id: string;
  status: PurchaseStatus;
  totalCost: string;
  createdAt: string;
  receivedAt: string | null;
  supplier: { id: string; name: string };
  _count: { items: number };
}

export interface PurchaseDetail {
  id: string;
  status: PurchaseStatus;
  totalCost: string;
  createdAt: string;
  receivedAt: string | null;
  supplier: { id: string; name: string };
  createdBy: { id: string; name: string } | null;
  items: {
    id: string;
    productId: string;
    quantity: number;
    unitCost: string;
    total: string;
    product: { id: string; sku: string; name: string };
  }[];
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  role: { id: string; name: string };
  channelIds: string[];
}

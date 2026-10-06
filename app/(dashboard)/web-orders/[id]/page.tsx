"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { OrderStatus, PaymentMethod, Product, OrderDetail, OrderListItem } from "@/lib/types";
import { formatAmount, formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

// An Incomplete storefront checkout, as returned by /admin/orders/checkout-leads.
interface LeadRecord {
  id: string;
  channelId: string;
  phone: string;
  name: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
  total: number;
  items: { productId: string; productName: string; sku: string; image: string | null; quantity: number; unitPrice: number }[];
}

// Shapes a lead like an order so the same form and totals can be used. A lead
// has no order yet: approving it creates the order from these details.
function leadAsOrder(lead: LeadRecord): OrderDetail {
  return {
    id: `lead-${lead.id}`,
    orderNumber: "Not ordered",
    channelId: lead.channelId,
    channel: null,
    source: "WEBSITE",
    status: "PENDING",
    paymentStatus: "UNPAID",
    shipmentStatus: "NOT_SHIPPED",
    customerResponse: "NO_RESPONSE",
    subtotal: String(lead.total),
    discount: "0",
    shippingFee: "0",
    total: String(lead.total),
    shippingName: lead.name ?? "",
    shippingPhone: lead.phone,
    shippingAddress: lead.address ?? "",
    notes: null,
    deliveryMethod: null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    customer: { id: "", name: lead.name ?? "", phone: lead.phone, email: null, address: lead.address, city: null, notes: null, createdAt: lead.createdAt },
    statusHistory: [],
    timeline: [],
    payments: [],
    shipment: null,
    items: lead.items.map((i) => ({
      id: i.productId,
      productId: i.productId,
      productName: i.productName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: String(i.unitPrice),
      discount: "0",
      total: String(i.quantity * i.unitPrice),
      product: { images: i.image ? [{ url: i.image }] : [] },
    })),
  };
}

interface OrderNote {
  id: string;
  createdAt: string;
  after: { note?: string } | null;
  user: { id: string; name: string } | null;
}

// Same starting set as New Order / Edit Order.
const DELIVERY_METHODS = ["Steadfast", "Pathao", "RedX", "eCourier", "Own Delivery", "Other"];
const PAYMENT_METHODS: PaymentMethod[] = ["COD", "BKASH", "NAGAD", "BANK_TRANSFER", "CARD", "OTHER"];
// Mirrors OrdersService's TRANSITIONS for PENDING. The backend enforces the
// same rule; this only limits the dropdown to valid choices.
const PENDING_NEXT_STATUSES: OrderStatus[] = ["CONFIRMED", "PREORDER", "PENDING_CANCEL", "CANCELLED"];

interface LineItem {
  productId: string;
  productName: string;
  sku: string;
  image?: string;
  quantity: number;
  unitPrice: string; // blank = let the backend resolve channel/base price
}

function availableStock(p: Product): number {
  return p.inventory ? p.inventory.currentStock - p.inventory.reservedStock : 0;
}

// A web order is reviewed and approved here, in the same form as New Order.
// Layout: form and products on the left, order summary and customer success
// rate on the right. Approve saves those changes first, then marks the order
// approved so it moves to the Pending list.
export default function WebOrderDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  // Incomplete checkouts are opened with a "lead-" id from the Web Orders list.
  const isLead = orderId.startsWith("lead-");
  const leadId = isLead ? orderId.slice("lead-".length) : null;
  const { user } = useAuth();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [successRate, setSuccessRate] = useState<OrderListItem["customer"] | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_METHODS[0]);
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingNote, setShippingNote] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [discount, setDiscount] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [transactionId, setTransactionId] = useState("");
  // Payment Method / Transaction ID only appear once an advance has a value,
  // same as New Order.
  const hasAdvance = Number(advanceAmount) > 0;

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [notes, setNotes] = useState<OrderNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  async function addNote() {
    const text = noteText.trim();
    if (!text) return;
    setNoteError(null);
    setNoteSaving(true);
    try {
      const created = await api.post<OrderNote>(`/admin/orders/${orderId}/notes`, { note: text });
      setNotes((list) => [created, ...list]);
      setNoteText("");
    } catch (err) {
      setNoteError(err instanceof ApiError ? err.message : "Failed to add note");
    } finally {
      setNoteSaving(false);
    }
  }

  async function updateStatus() {
    if (!order || !nextStatus) return;
    if (nextStatus === "CANCELLED" && !window.confirm(`Cancel order ${order.orderNumber}?`)) return;
    setStatusError(null);
    setStatusSaving(true);
    try {
      await api.patch(`/admin/orders/${orderId}/status`, { status: nextStatus });
      // Leaving PENDING switches the page to its read-only notice.
      setOrder({ ...order, status: nextStatus });
      setNextStatus("");
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setStatusSaving(false);
    }
  }
  const pricingRef = useRef<HTMLDivElement>(null);
  const [pricingInView, setPricingInView] = useState(false);

  useEffect(() => {
    const el = pricingRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setPricingInView(entry.isIntersecting), {
      threshold: 0.2,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [order]);

  // Close the product picker when clicking anywhere outside it.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get<Product[]>("/admin/products").then(setProducts).catch(() => {});
    if (!isLead) api.get<OrderNote[]>(`/admin/orders/${orderId}/notes`).then(setNotes).catch(() => {});
  }, [orderId, user, isLead]);

  useEffect(() => {
    if (!user) return;
    const load: Promise<OrderDetail> = isLead
      ? api.get<LeadRecord[]>("/admin/orders/checkout-leads").then((list) => {
          const lead = list.find((l) => l.id === leadId);
          if (!lead) throw new Error("This checkout is no longer incomplete.");
          return leadAsOrder(lead);
        })
      : api.get<OrderDetail>(`/admin/orders/${orderId}`);
    load
      .then((o) => {
        setOrder(o);
        setCustomerName(o.shippingName);
        setCustomerPhone(o.shippingPhone);
        setDeliveryMethod(o.deliveryMethod ?? DELIVERY_METHODS[0]);
        setShippingAddress(o.shippingAddress);
        setShippingNote(o.notes ?? "");
        setDiscount(Number(o.discount) > 0 ? o.discount : "");
        setShippingFee(Number(o.shippingFee) > 0 ? o.shippingFee : "");
        setLineItems(
          o.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            image: item.product?.images[0]?.url,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        );
        if (isLead) return null;
        return api.get<OrderListItem[]>(`/admin/orders?customerId=${o.customer.id}`);
      })
      .then((list) => {
        if (list) setSuccessRate(list[0]?.customer ?? null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load order"));
  }, [orderId, user, isLead, leadId]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const pool = q
      ? products.filter(
          (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
        )
      : products;
    return pool.slice(0, 20);
  }, [products, productSearch]);

  function addProduct(p: Product) {
    setLineItems((rows) => {
      const existing = rows.find((r) => r.productId === p.id);
      if (existing) {
        return rows.map((r) =>
          r.productId === p.id ? { ...r, quantity: r.quantity + 1 } : r,
        );
      }
      return [
        ...rows,
        {
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          image: p.images?.[0]?.url,
          quantity: 1,
          unitPrice: "",
        },
      ];
    });
  }

  function updateLineItem(productId: string, patch: Partial<LineItem>) {
    setLineItems((rows) =>
      rows.map((r) => (r.productId === productId ? { ...r, ...patch } : r)),
    );
  }

  function removeLineItem(productId: string) {
    setLineItems((rows) => rows.filter((r) => r.productId !== productId));
  }

  // Mirrors OrdersService.updateOrder's exact formula, same as New Order.
  const subTotal = lineItems.reduce((sum, item) => {
    const unitPrice = item.unitPrice
      ? Number(item.unitPrice)
      : Number(products.find((p) => p.id === item.productId)?.basePrice ?? 0);
    return sum + item.quantity * unitPrice;
  }, 0);
  const orderTotal = Math.max(
    0,
    subTotal - (Number(discount) || 0) + (Number(shippingFee) || 0),
  );
  // Same as New Order: what is still due after the advance.
  const grandTotal = Math.max(0, orderTotal - (Number(advanceAmount) || 0));

  async function handleApprove(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const validItems = lineItems.filter((i) => i.quantity > 0);
    if (validItems.length === 0) {
      setFormError("Add at least one product line item.");
      return;
    }
    if (!customerName || !customerPhone) {
      setFormError("Mobile number and name are required.");
      return;
    }
    if (!shippingAddress) {
      setFormError("Address is required.");
      return;
    }
    if (Number(advanceAmount) > orderTotal) {
      setFormError("Advance cannot be more than the order total.");
      return;
    }

    setSubmitting(true);
    if (isLead) {
      // The order is created from the lead's details, then approved. The lead
      // is removed straight after creation so a failed approval can't leave a
      // duplicate Incomplete entry behind.
      let createdId: string | null = null;
      try {
        const created = await api.post<OrderDetail>("/admin/orders", {
          source: "WEBSITE",
          channelId: order?.channelId ?? undefined,
          customerName,
          customerPhone,
          shippingName: customerName,
          shippingPhone: customerPhone,
          shippingAddress,
          deliveryMethod: deliveryMethod || undefined,
          items: validItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice ? Number(i.unitPrice) : undefined,
          })),
          discount: discount ? Number(discount) : undefined,
          shippingFee: shippingFee ? Number(shippingFee) : undefined,
          notes: shippingNote || undefined,
          paymentMethod,
          advanceAmount: advanceAmount ? Number(advanceAmount) : undefined,
          transactionId: hasAdvance ? transactionId || undefined : undefined,
        });
        createdId = created.id;
        await api.delete(`/admin/orders/checkout-leads/${leadId}`);
        await api.post(`/admin/orders/${created.id}/web-approve`);
        router.push("/web-orders");
      } catch (err) {
        setFormError(
          createdId
            ? "The order was created but could not be approved. Open it from Processing to approve it."
            : err instanceof ApiError
              ? err.message
              : "Something went wrong. Try again.",
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      await api.patch(`/admin/orders/${orderId}`, {
        customerName,
        customerPhone,
        shippingAddress,
        deliveryMethod: deliveryMethod || undefined,
        items: validItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice ? Number(i.unitPrice) : undefined,
        })),
        discount: discount ? Number(discount) : undefined,
        shippingFee: shippingFee ? Number(shippingFee) : undefined,
        notes: shippingNote || undefined,
      });
      await api.post(`/admin/orders/${orderId}/web-approve`);
      if (Number(advanceAmount) > 0) {
        // Recorded after approval, so a failure here can't leave the order
        // half-done in a way that double-charges on retry.
        await api.post(`/admin/orders/${orderId}/payments`, {
          amount: Number(advanceAmount),
          method: paymentMethod,
          transactionId: transactionId || undefined,
        });
      }
      router.push("/web-orders");
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? `${err.message}. If the order was already approved, add the advance from the order page.`
          : "Something went wrong. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
          {loadError}
        </p>
      </div>
    );
  }

  if (!order) {
    return <p className="text-sm text-foreground/60">Loading…</p>;
  }

  // Status and customer-response changes from the order timeline, plus notes,
  // newest first.
  const activity = [
    ...order.timeline.map((t) =>
      t.type === "status"
        ? {
            key: `s-${t.id}`,
            at: t.createdAt,
            by: t.changedBy?.name ?? null,
            text: `Order status changed to ${t.toStatus.replaceAll("_", " ")}`,
          }
        : {
            key: `c-${t.id}`,
            at: t.createdAt,
            by: t.changedBy?.name ?? null,
            text: `Customer response changed to ${(t.toResponse ?? "none").replaceAll("_", " ")}`,
          },
    ),
    ...notes.map((n) => ({
      key: `n-${n.id}`,
      at: n.createdAt,
      by: n.user?.name ?? null,
      text: `Note added: ${n.after?.note ?? ""}`,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/web-orders")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-foreground/70 hover:bg-black/5"
            aria-label="Back to web orders"
            title="Back to web orders"
          >
            ←
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Web Order Details</h1>
            <p className="text-sm text-foreground/60">
              {isLead
                ? "Complete the details and approve to create this order."
                : `Review and approve order #${order.orderNumber}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isLead ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">Incomplete</span>
          ) : (
            <StatusBadge status={order.status} />
          )}
          <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-700">WEB</span>
          <span className="rounded-full border border-black/10 px-3 py-1 text-foreground/70">
            Created {formatDateTime(order.createdAt)}
          </span>
        </div>
      </div>

      {order.status !== "PENDING" ? (
        <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
          Order {order.orderNumber} is already past web approval (status: {order.status.replaceAll("_", " ")}).
        </p>
      ) : (
        <form onSubmit={handleApprove} className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <h2 className="mb-4 text-base font-semibold text-foreground">Customer details</h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div>
                  <Label>Mobile Number</Label>
                  <Input
                    required
                    placeholder="Mobile Number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input
                    required
                    placeholder="Customer Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Delivery Method</Label>
                  <Select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)}>
                    {DELIVERY_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <Label>Address</Label>
                  <Textarea
                    required
                    rows={3}
                    placeholder="Enter address"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Shipping Note</Label>
                  <Textarea
                    rows={3}
                    placeholder="Enter shipping note"
                    value={shippingNote}
                    onChange={(e) => setShippingNote(e.target.value)}
                  />
                </div>
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 text-base font-semibold text-foreground">Add products</h2>
              <div ref={pickerRef} className="relative">
                <Input
                  placeholder="Search by name or SKU, then click to add…"
                  value={productSearch}
                  onFocus={() => setPickerOpen(true)}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setPickerOpen(true);
                  }}
                />
                {pickerOpen && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-lg border border-black/10 bg-white p-2 shadow-lg">
                    {filteredProducts.map((p) => {
                      const available = availableStock(p);
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 rounded-lg p-2 hover:bg-black/5"
                        >
                          {p.images?.[0]?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
                            <img src={p.images[0].url} alt={p.name} className="h-12 w-12 shrink-0 rounded-md object-cover" />
                          ) : (
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-black/5 text-sm text-foreground/40">
                              {p.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                            <div className="text-xs font-medium text-primary">SKU: {p.sku}</div>
                            <div className="mt-0.5 flex items-center gap-3 text-xs">
                              <span className="text-foreground/60">Price: {formatAmount(p.basePrice)}</span>
                              <span className={available <= 0 ? "text-status-cancelled" : "text-foreground/40"}>
                                Stock: {available}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => addProduct(p)}
                            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
                          >
                            + Add
                          </button>
                        </div>
                      );
                    })}
                    {filteredProducts.length === 0 && (
                      <p className="py-6 text-center text-sm text-foreground/50">No products found.</p>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                Ordered products
                {lineItems.length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                    {lineItems.length}
                  </span>
                )}
              </h2>
              {lineItems.length === 0 ? (
                <div className="flex min-h-[12rem] items-center justify-center">
                  <p className="text-sm text-status-cancelled">
                    No products added. Use Add products above.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lineItems.map((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    const unitPrice = item.unitPrice ? Number(item.unitPrice) : Number(product?.basePrice ?? 0);
                    const available = product ? availableStock(product) : null;
                    const lineTotal = item.quantity * unitPrice;

                    function setPrice(next: number) {
                      updateLineItem(item.productId, { unitPrice: String(Math.max(0, next)) });
                    }

                    return (
                      <div key={item.productId} className="rounded-lg border border-black/5 p-3">
                        <div className="flex items-start gap-3">
                          {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
                            <img
                              src={item.image}
                              alt={item.productName}
                              className="h-14 w-14 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-black/5 text-sm text-foreground/40">
                              {item.productName.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">
                              {item.productName}
                            </div>
                            <div className="text-xs font-medium text-primary">SKU: {item.sku}</div>
                            <div className="mt-1 flex items-center gap-3 text-xs">
                              <span className="text-foreground/60">{formatAmount(unitPrice)}</span>
                              {available !== null && (
                                <span className={available <= 0 ? "text-status-cancelled" : "text-foreground/40"}>
                                  Stock: {available}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLineItem(item.productId)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-status-cancelled/20 bg-status-cancelled/5 text-status-cancelled transition-colors hover:bg-status-cancelled hover:text-white"
                            aria-label="Remove"
                            title="Remove"
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6M14 11v6" />
                            </svg>
                          </button>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-3">
                          <div>
                            <Label>Qty</Label>
                            <div className="flex min-w-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  updateLineItem(item.productId, {
                                    quantity: Math.max(1, item.quantity - 1),
                                  })
                                }
                                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 text-foreground/60 hover:bg-black/5"
                                aria-label="Decrease quantity"
                              >
                                −
                              </button>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateLineItem(item.productId, {
                                    quantity: Math.max(1, Number(e.target.value)),
                                  })
                                }
                                className="w-0 min-w-0 flex-1 text-center"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateLineItem(item.productId, { quantity: item.quantity + 1 })
                                }
                                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 text-foreground/60 hover:bg-black/5"
                                aria-label="Increase quantity"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div>
                            <Label>Price</Label>
                            <div className="flex min-w-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setPrice(unitPrice - 1)}
                                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 text-foreground/60 hover:bg-black/5"
                                aria-label="Decrease price"
                              >
                                −
                              </button>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice !== "" ? String(Number(item.unitPrice)) : ""}
                                onBlur={(e) => {
                                  if (e.target.value !== "") {
                                    updateLineItem(item.productId, { unitPrice: String(Number(e.target.value)) });
                                  }
                                }}
                                placeholder={product?.basePrice}
                                onChange={(e) => updateLineItem(item.productId, { unitPrice: e.target.value })}
                                className="w-0 min-w-0 flex-1 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                title="Unit price (blank = storefront/base price)"
                              />
                              <button
                                type="button"
                                onClick={() => setPrice(unitPrice + 1)}
                                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 text-foreground/60 hover:bg-black/5"
                                aria-label="Increase price"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div>
                            <Label>Total</Label>
                            <div className="rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-center text-sm text-foreground/70">
                              {formatAmount(lineTotal)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <div ref={pricingRef}>
              <Card>
                <div
                  className={`grid grid-cols-2 gap-3 whitespace-nowrap ${
                    hasAdvance ? "sm:grid-cols-6" : "sm:grid-cols-5"
                  }`}
                >
                  <div>
                    <Label>Discount</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Advance</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Sub Total</Label>
                    <div className="rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-sm text-foreground/50">
                      {formatAmount(subTotal)}
                    </div>
                  </div>
                  <div>
                    <Label>Delivery Charge</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={shippingFee}
                      onChange={(e) => setShippingFee(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-status-cancelled">Grand Total</Label>
                    <div className="rounded-lg border border-status-cancelled/30 bg-status-cancelled/5 px-3 py-2 text-sm font-semibold text-status-cancelled">
                      {formatAmount(grandTotal)}
                    </div>
                  </div>
                  {hasAdvance && (
                    <div>
                      <Label>Payment Method</Label>
                      <Select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m.replaceAll("_", " ")}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>

                {hasAdvance && (
                  <div className="mt-3">
                    <Label>Transaction ID</Label>
                    <Input
                      placeholder="Enter transaction ID"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                    />
                  </div>
                )}

                {formError && (
                  <p className="mt-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                    {formError}
                  </p>
                )}

                <Button type="submit" disabled={submitting} className="mt-4 w-full">
                  {submitting ? "Approving…" : `Approve Order (${formatAmount(grandTotal)}৳)`}
                </Button>
              </Card>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Card>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-foreground">Order summary</h2>
                  <span className="text-xs text-foreground/50">#{order.orderNumber}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <div className="text-xs text-foreground/50">Date</div>
                    <div className="font-medium">{formatDateTime(order.createdAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-foreground/50">Status</div>
                    <div className="font-medium">{order.status.replaceAll("_", " ")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-foreground/50">Payment</div>
                    <div className="font-medium">{order.paymentStatus}</div>
                  </div>
                  <div>
                    <div className="text-xs text-foreground/50">Source</div>
                    <div className="font-medium">{order.source}</div>
                  </div>
                </div>

              </Card>
            </div>

            <Card>
              <h2 className="mb-3 text-base font-semibold text-foreground">Customer success rate</h2>
              {successRate && successRate.successRate !== null ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-foreground/50">Success rate</div>
                    <div className="text-2xl font-bold text-status-delivered">{successRate.successRate}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-foreground/50">Total orders</div>
                    <div className="text-2xl font-bold">{successRate.orderCount}</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground/50">No order history yet.</p>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-base font-semibold text-foreground">Order items</h2>
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 text-sm">
                    {item.product?.images[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
                      <img src={item.product.images[0].url} alt={item.productName} className="h-12 w-12 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-black/5 text-foreground/40">
                        {item.productName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{item.productName}</div>
                      <div className="text-xs text-foreground/50">{formatAmount(item.unitPrice)}৳</div>
                    </div>
                    <span className="shrink-0 text-foreground/60">{item.quantity}x</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="mb-3 text-base font-semibold text-foreground">Order tags</h2>
              <div className="flex flex-wrap gap-2">
                {(successRate?.orderCount ?? 0) > 1 && (
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">REPEAT</span>
                )}
                {(successRate?.orderCount ?? 0) <= 1 && (
                  <p className="text-sm text-foreground/50">No tags.</p>
                )}
              </div>
            </Card>

            {!isLead && (
            <Card>
              <h2 className="mb-3 text-base font-semibold text-foreground">Order actions</h2>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as OrderStatus | "")}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
              >
                <option value="">Change status</option>
                {PENDING_NEXT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              {statusError && (
                <p className="mt-3 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                  {statusError}
                </p>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={!nextStatus || statusSaving}
                onClick={updateStatus}
                className="mt-3 w-full"
              >
                {statusSaving ? "Updating…" : "Update"}
              </Button>

              <div className="mt-4 rounded-lg border border-black/10 p-3">
                <Label>Note</Label>
                <Textarea
                  rows={3}
                  placeholder="Write a note about this order"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                {noteError && (
                  <p className="mt-2 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                    {noteError}
                  </p>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!noteText.trim() || noteSaving}
                  onClick={addNote}
                  className="mt-3"
                >
                  {noteSaving ? "Adding…" : "Add Note"}
                </Button>
                {notes.length > 0 && (
                  <div className="mt-4 space-y-3 border-t border-black/5 pt-3">
                    {notes.map((n) => (
                      <div key={n.id} className="text-sm">
                        <div className="text-xs text-foreground/50">
                          {n.user?.name ?? "Unknown"} · {formatDateTime(n.createdAt)}
                        </div>
                        <div className="whitespace-pre-line">{n.after?.note}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
            )}

          <Card>
            <h2 className="mb-3 text-base font-semibold text-foreground">Activity log</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-foreground/50">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {activity.map((a) => (
                  <div key={a.key} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/50">
                      <span>{formatDateTime(a.at)}</span>
                      {a.by && (
                        <span className="rounded bg-black/5 px-1.5 py-0.5 font-medium text-foreground/70">{a.by}</span>
                      )}
                    </div>
                    <div className="whitespace-pre-line">{a.text}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          </div>

          {lineItems.length > 0 && !pricingInView && (
            <div className="sticky bottom-0 z-10 rounded-lg bg-primary px-6 py-1.5 shadow-card lg:col-span-3">
              <button
                type="button"
                onClick={() => pricingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="flex w-full items-center justify-between text-primary-fg"
              >
                <span className="text-sm font-medium opacity-80">Total</span>
                <span className="flex items-center gap-2 text-base font-semibold">
                  {formatAmount(orderTotal)}৳
                  <span aria-hidden="true">▲</span>
                </span>
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

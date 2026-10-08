"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { OrderSource, PaymentMethod, Product, OrderDetail, Payment } from "@/lib/types";
import { formatAmount } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

const SOURCES: OrderSource[] = ["UNKNOWN", "MANUAL", "PHONE", "FACEBOOK", "WHATSAPP", "WEBSITE", "OTHER"];
const PAYMENT_METHODS: PaymentMethod[] = ["COD", "BKASH", "NAGAD", "BANK_TRANSFER", "CARD", "OTHER"];
// Free-text on the order, purely informational (see Order.deliveryMethod) —
// not tied to any courier integration, so this list is just a starting set.
const DELIVERY_METHODS = ["Steadfast", "Pathao", "RedX", "eCourier", "Own Delivery", "Other"];

// Mirrors OrdersService's EDITABLE_STATUSES — content editing is only safe
// while stock is merely *reserved*, not yet deducted (i.e. before SHIPPED).
// This is just an early, friendlier guard; the backend enforces the same
// rule regardless.
const EDITABLE_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "PENDING_CANCEL",
  "PREORDER",
]);

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

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_METHODS[0]);
  const [source, setSource] = useState<OrderSource>("UNKNOWN");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingNote, setShippingNote] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [discount, setDiscount] = useState("");
  const [shippingFee, setShippingFee] = useState("");

  // Advance Payment rows — editable in place, saved per-row via its own
  // "Update" button rather than the main form submit, since a payment edit
  // goes through a different endpoint (PATCH .../payments/:paymentId).
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentDrafts, setPaymentDrafts] = useState<
    Record<string, { amount: string; method: PaymentMethod; transactionId: string }>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    api.get<Product[]>("/admin/products").then(setProducts).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get<OrderDetail>(`/admin/orders/${orderId}`)
      .then((o) => {
        setOrder(o);
        setCustomerName(o.shippingName);
        setCustomerPhone(o.shippingPhone);
        setDeliveryMethod(o.deliveryMethod ?? DELIVERY_METHODS[0]);
        setSource(o.source);
        setShippingAddress(o.shippingAddress);
        setShippingNote(o.notes ?? "");
        setDiscount(Number(o.discount) > 0 ? o.discount : "");
        setShippingFee(Number(o.shippingFee) > 0 ? o.shippingFee : "");
        setPayments(o.payments);
        setPaymentDrafts(
          Object.fromEntries(
            o.payments.map((p) => [
              p.id,
              {
                amount: String(Math.round(Number(p.amount))),
                method: p.method,
                transactionId: p.transactionId ?? "",
              },
            ]),
          ),
        );
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
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load order"));
  }, [orderId]);

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

  // Saves every Advance Payment row whose draft actually changed, as part of
  // the single Save Changes submit rather than a separate button per row.
  async function savePaymentDrafts() {
    let latestPayments = payments;
    for (const p of payments) {
      const draft = paymentDrafts[p.id];
      if (!draft) continue;
      const amount = Math.round(Number(draft.amount));
      const transactionId = draft.transactionId || null;
      const unchanged =
        amount === Math.round(Number(p.amount)) &&
        draft.method === p.method &&
        transactionId === p.transactionId;
      if (unchanged) continue;
      if (!amount || amount < 1) {
        throw new Error("Advance payment amount must be a whole number of at least 1.");
      }
      const updated = await api.patch<OrderDetail>(
        `/admin/orders/${orderId}/payments/${p.id}`,
        { amount, method: draft.method, transactionId },
      );
      latestPayments = updated.payments;
    }
    setPayments(latestPayments);
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

  async function handleSubmit(e: FormEvent) {
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

    setSubmitting(true);
    try {
      await api.patch<OrderDetail>(`/admin/orders/${orderId}`, {
        customerName,
        customerPhone,
        shippingAddress,
        deliveryMethod: deliveryMethod || undefined,
        source,
        items: validItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice ? Number(i.unitPrice) : undefined,
        })),
        discount: discount ? Number(discount) : undefined,
        shippingFee: shippingFee ? Number(shippingFee) : undefined,
        notes: shippingNote || undefined,
      });
      await savePaymentDrafts();
      router.push("/orders");
    } catch (err) {
      setFormError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Edit Order" />
        <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
          {loadError}
        </p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Edit Order" />
        <p className="text-sm text-foreground/60">Loading…</p>
      </div>
    );
  }

  if (!EDITABLE_STATUSES.has(order.status)) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Edit Order"
          actions={
            <Button variant="secondary" onClick={() => router.push(`/orders/${orderId}`)}>
              Back
            </Button>
          }
        />
        <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
          Order {order.orderNumber} can no longer be edited (status: {order.status.replaceAll("_", " ")}).
          Stock for this order has already shipped or otherwise moved past the editable stage.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Edit Order"
        description={`Update items, customer info, and charges for order ${order.orderNumber}.`}
        actions={
          <Button variant="secondary" onClick={() => router.push("/orders")}>
            Cancel
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
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

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
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
            <div>
              <Label>Extra Options</Label>
              <div className="space-y-3 rounded-lg border border-black/10 p-3">
                {/* Channel is set once at order creation (it's baked into
                    the line items' channel-scoped pricing) and isn't part
                    of UpdateOrderDto, so it's not editable here. Source is
                    just a tag, so it's editable, same as at creation. */}
                <Select value={source} onChange={(e) => setSource(e.target.value as OrderSource)}>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
              Ordered Products
              {lineItems.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                  {lineItems.length}
                </span>
              )}
            </h2>
            {lineItems.length === 0 ? (
              <div className="flex min-h-[24rem] items-center justify-center">
                <p className="text-sm text-status-cancelled">
                  No Products added. Please add products to the order
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

          <Card>
            <h2 className="mb-4 text-base font-semibold text-foreground">Click To Add Products</h2>
            <Input
              placeholder="Search by name or SKU…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            <div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto">
              {filteredProducts.map((p) => {
                const available = availableStock(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center gap-3 rounded-lg border border-black/5 p-2.5 text-left hover:bg-black/5"
                  >
                    {p.images?.[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
                      <img
                        src={p.images[0].url}
                        alt={p.name}
                        className="h-14 w-14 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-black/5 text-sm text-foreground/40">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                      <div className="text-xs font-medium text-primary">SKU: {p.sku}</div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="text-foreground/60">Price: {formatAmount(p.basePrice)}</span>
                        <span className={available <= 0 ? "text-status-cancelled" : "text-foreground/40"}>
                          Stock: {available}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredProducts.length === 0 && (
                <p className="py-6 text-center text-sm text-foreground/50">No products found.</p>
              )}
            </div>
          </Card>
        </div>

        <div ref={pricingRef}>
          <Card>
            <div className="grid grid-cols-2 gap-3 whitespace-nowrap sm:grid-cols-4">
              <div>
                <Label>Discount</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
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
                  step="1"
                  placeholder="0"
                  value={shippingFee}
                  onChange={(e) => setShippingFee(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-status-cancelled">Total</Label>
                <div className="rounded-lg border border-status-cancelled/30 bg-status-cancelled/5 px-3 py-2 text-sm font-semibold text-status-cancelled">
                  {formatAmount(orderTotal)}
                </div>
              </div>
            </div>

            {payments.length > 0 && (
              <div className="mt-4 border-t border-black/5 pt-4">
                <Label>Advance Payment</Label>
                {/* Each payment is saved independently via its own Update
                    PATCH, folded into the single Save Changes submit below
                    rather than a separate button per row. Amount is whole
                    numbers only, no decimal point. */}
                <div className="mt-1 space-y-3">
                  {payments.map((p) => {
                    const draft = paymentDrafts[p.id];
                    if (!draft) return null;
                    return (
                      <div key={p.id} className="rounded-lg border border-black/10 p-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <Label>Amount</Label>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={draft.amount}
                              onChange={(e) =>
                                setPaymentDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], amount: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label>Payment Method</Label>
                            <Select
                              value={draft.method}
                              onChange={(e) =>
                                setPaymentDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], method: e.target.value as PaymentMethod },
                                }))
                              }
                            >
                              {PAYMENT_METHODS.map((m) => (
                                <option key={m} value={m}>
                                  {m.replaceAll("_", " ")}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <Label>Transaction ID</Label>
                            <Input
                              placeholder="Enter transaction ID"
                              value={draft.transactionId}
                              onChange={(e) =>
                                setPaymentDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: { ...prev[p.id], transactionId: e.target.value },
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {formError && (
              <p className="mt-4 rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
                {formError}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="mt-4 w-full">
              {submitting ? "Saving…" : `Save Changes (${formatAmount(orderTotal)}৳)`}
            </Button>
          </Card>
        </div>

        {lineItems.length > 0 && !pricingInView && (
          <div className="sticky bottom-0 z-10 mt-6 rounded-lg bg-primary px-6 py-1.5 shadow-card">
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
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { OrderSource, PaymentMethod, Product, OrderDetail } from "@/lib/types";
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

export default function NewOrderPage() {
  const router = useRouter();
  const { channels: scopedChannels, activeChannelId: globalChannelId } =
    useChannelScope();
  const channels = scopedChannels ?? [];

  const [products, setProducts] = useState<Product[]>([]);

  // A single customer field pair — the backend already resolves an existing
  // customer by phone number (CustomersService.resolveCustomer), so there's
  // no need for a separate "existing customer" search flow here.
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_METHODS[0]);
  const [source, setSource] = useState<OrderSource>("UNKNOWN");
  const [channelId, setChannelId] = useState(globalChannelId ?? "");

  // Follows the global Store Selector — creating an order while a specific
  // store is active shouldn't default to "no channel".
  useEffect(() => {
    setChannelId(globalChannelId ?? "");
  }, [globalChannelId]);

  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingNote, setShippingNote] = useState("");

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [discount, setDiscount] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [transactionId, setTransactionId] = useState("");
  // Payment Method / Transaction ID only make sense once there's actually a
  // payment being recorded — collapsed until Advance has a value, per the
  // reference layout, instead of showing controls that do nothing yet.
  const hasAdvance = Number(advanceAmount) > 0;

  const [formError, setFormError] = useState<string | null>(null);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pricingRef = useRef<HTMLDivElement>(null);
  // Hides the sticky Total bar once the actual pricing/Create Order section
  // scrolls into view, so it doesn't sit there duplicating a button that's
  // already on screen.
  const [pricingInView, setPricingInView] = useState(false);

  useEffect(() => {
    const el = pricingRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setPricingInView(entry.isIntersecting), {
      threshold: 0.2,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    api.get<Product[]>("/admin/products").then(setProducts).catch(() => {});
  }, []);

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

  // subTotal/orderTotal mirror OrdersService.createOrder's exact formula
  // (subtotal = sum(qty * unitPrice), total = subtotal - discount + shippingFee)
  // — orderTotal is what actually gets stored as Order.total server-side,
  // unaffected by any advance payment. "Grand Total" as shown on this page
  // is the balance still due after that advance (COD collection amount),
  // which is why it's a separate figure from orderTotal.
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
  const grandTotal = Math.max(0, orderTotal - (Number(advanceAmount) || 0));

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
      const order = await api.post<OrderDetail>("/admin/orders", {
        source,
        channelId: channelId || undefined,
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
      setCreatedOrderNumber(order.orderNumber);
      setCustomerName("");
      setCustomerPhone("");
      setShippingAddress("");
      setShippingNote("");
      setLineItems([]);
      setDiscount("");
      setAdvanceAmount("");
      setShippingFee("");
      setTransactionId("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="New Order"
        description="Manual, phone, Facebook, or WhatsApp order — enters the same reservation system as website checkout."
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
                {!globalChannelId && (
                  <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                    <option value="">No channel (manual)</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
                <Select value={source} onChange={(e) => setSource(e.target.value as OrderSource)}>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
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
                              value={String(Number(item.unitPrice !== "" ? item.unitPrice : (product?.basePrice ?? 0)))}
                              onBlur={(e) => {
                                if (e.target.value !== "") {
                                  updateLineItem(item.productId, { unitPrice: String(Number(e.target.value)) });
                                }
                              }}
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
            {submitting ? "Creating Order…" : `Create Order (${formatAmount(grandTotal)}৳)`}
          </Button>
        </Card>
        </div>

        {lineItems.length > 0 && !pricingInView && (
          <div className="sticky bottom-0 z-10 mt-6 cursor-pointer rounded-lg bg-primary px-6 py-1.5 shadow-card transition-colors hover:bg-status-cancelled">
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

      {createdOrderNumber && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCreatedOrderNumber(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl text-primary">
              ✓
            </div>
            <h3 className="text-base font-semibold text-foreground">Order created</h3>
            <p className="mt-1 text-sm text-foreground/60">
              Order {createdOrderNumber} has been created successfully.
            </p>
            <Button className="mt-5 w-full" onClick={() => setCreatedOrderNumber(null)}>
              OK
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

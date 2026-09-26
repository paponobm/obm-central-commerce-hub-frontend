"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useChannelScope } from "@/lib/channel-scope-context";
import type { Customer, OrderSource, PaymentMethod, Product, OrderDetail } from "@/lib/types";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

const SOURCES: OrderSource[] = ["MANUAL", "PHONE", "FACEBOOK", "WHATSAPP", "WEBSITE", "OTHER"];
const PAYMENT_METHODS: PaymentMethod[] = ["COD", "BKASH", "NAGAD", "BANK_TRANSFER", "CARD", "OTHER"];

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

  const [customerMode, setCustomerMode] = useState<"existing" | "new">("new");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");

  const [source, setSource] = useState<OrderSource>("MANUAL");
  const [channelId, setChannelId] = useState(globalChannelId ?? "");

  // Follows the global Store Selector — creating an order while a specific
  // store is active shouldn't default to "no channel".
  useEffect(() => {
    setChannelId(globalChannelId ?? "");
  }, [globalChannelId]);

  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [discount, setDiscount] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [isPaid, setIsPaid] = useState(false);
  const [notes, setNotes] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<Product[]>("/admin/products").then(setProducts).catch(() => {});
  }, []);

  useEffect(() => {
    if (customerMode !== "existing" || customerSearch.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<Customer[]>(`/admin/customers?search=${encodeURIComponent(customerSearch)}`)
        .then(setCustomerResults)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearch, customerMode]);

  function pickCustomer(c: Customer) {
    setSelectedCustomer(c);
    setCustomerResults([]);
    setCustomerSearch(`${c.name} (${c.phone})`);
    setShippingName((v) => v || c.name);
    setShippingPhone((v) => v || c.phone);
    setShippingAddress((v) => v || c.address || "");
  }

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const validItems = lineItems.filter((i) => i.quantity > 0);
    if (validItems.length === 0) {
      setFormError("Add at least one product line item.");
      return;
    }
    if (customerMode === "existing" && !selectedCustomer) {
      setFormError("Select an existing customer, or switch to \"New customer\".");
      return;
    }
    if (customerMode === "new" && (!newCustomerName || !newCustomerPhone)) {
      setFormError("New customer needs a name and phone number.");
      return;
    }
    if (!shippingAddress) {
      setFormError("Shipping address is required.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await api.post<OrderDetail>("/admin/orders", {
        source,
        channelId: channelId || undefined,
        customerId: customerMode === "existing" ? selectedCustomer?.id : undefined,
        customerName: customerMode === "new" ? newCustomerName : undefined,
        customerPhone: customerMode === "new" ? newCustomerPhone : undefined,
        customerEmail: customerMode === "new" ? newCustomerEmail || undefined : undefined,
        shippingName: shippingName || undefined,
        shippingPhone: shippingPhone || undefined,
        shippingAddress,
        items: validItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice ? Number(i.unitPrice) : undefined,
        })),
        discount: discount ? Number(discount) : undefined,
        shippingFee: shippingFee ? Number(shippingFee) : undefined,
        notes: notes || undefined,
        paymentMethod,
        isPaid,
      });
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New Order"
        description="Manual, phone, Facebook, or WhatsApp order — enters the same reservation system as website checkout."
        actions={
          <Button variant="secondary" onClick={() => router.push("/orders")}>
            Cancel
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-foreground">Customer</h2>
            <div className="mb-3 flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={customerMode === "new"}
                  onChange={() => {
                    setCustomerMode("new");
                    setSelectedCustomer(null);
                  }}
                />
                New customer
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={customerMode === "existing"}
                  onChange={() => setCustomerMode("existing")}
                />
                Existing customer
              </label>
            </div>

            {customerMode === "existing" ? (
              <div className="relative">
                <Input
                  placeholder="Search by name or phone…"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setSelectedCustomer(null);
                  }}
                />
                {customerResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-black/10 bg-white shadow-card">
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickCustomer(c)}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
                      >
                        {c.name} · {c.phone}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    required
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Email (optional)</Label>
                  <Input
                    type="email"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                  />
                </div>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-foreground">Items</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/40">
                  Order Items {lineItems.length > 0 && `(${lineItems.length})`}
                </h3>
                {lineItems.length === 0 ? (
                  <p className="rounded-lg bg-black/5 px-3 py-6 text-center text-sm text-foreground/50">
                    No products added. Search on the right to add products to this order.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {lineItems.map((item) => (
                      <div
                        key={item.productId}
                        className="flex items-center gap-2 rounded-lg border border-black/5 p-2"
                      >
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
                          <img
                            src={item.image}
                            alt={item.productName}
                            className="h-10 w-10 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-black/5 text-xs text-foreground/40">
                            {item.productName.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {item.productName}
                          </div>
                          <div className="text-xs text-foreground/50">{item.sku}</div>
                        </div>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(item.productId, {
                              quantity: Math.max(1, Number(e.target.value)),
                            })
                          }
                          className="w-16 text-right"
                          title="Quantity"
                        />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          placeholder={
                            products.find((p) => p.id === item.productId)?.basePrice
                          }
                          onChange={(e) =>
                            updateLineItem(item.productId, { unitPrice: e.target.value })
                          }
                          className="w-24 text-right"
                          title="Unit price (blank = storefront/base price)"
                        />
                        <button
                          type="button"
                          onClick={() => removeLineItem(item.productId)}
                          className="shrink-0 text-status-cancelled hover:opacity-70"
                          aria-label="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/40">
                  Add Products
                </h3>
                <Input
                  placeholder="Search by name or SKU…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
                  {filteredProducts.map((p) => {
                    const available = availableStock(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProduct(p)}
                        className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-black/5"
                      >
                        {p.images?.[0]?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded product image
                          <img
                            src={p.images[0].url}
                            alt={p.name}
                            className="h-10 w-10 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-black/5 text-xs text-foreground/40">
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {p.name}
                          </div>
                          <div className="text-xs text-foreground/50">{p.sku}</div>
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          <div className="font-medium text-foreground">{money(p.basePrice)}</div>
                          <div className={available <= 0 ? "text-status-cancelled" : "text-foreground/40"}>
                            Stock: {available}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <p className="py-6 text-center text-sm text-foreground/50">
                      No products found.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-foreground">Shipping</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Recipient Name</Label>
                <Input value={shippingName} onChange={(e) => setShippingName(e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)} />
              </div>
            </div>
            <div className="mt-4">
              <Label>Address</Label>
              <Textarea
                required
                rows={2}
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-foreground">Order Info</h2>
            <div className="space-y-4">
              <div>
                <Label>Source</Label>
                <Select value={source} onChange={(e) => setSource(e.target.value as OrderSource)}>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Channel</Label>
                {globalChannelId ? (
                  <div className="flex h-[42px] items-center rounded-lg bg-black/5 px-3 text-sm text-foreground/70">
                    {channels.find((c) => c.id === globalChannelId)?.name ?? "…"}
                  </div>
                ) : (
                  <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                    <option value="">None</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-foreground">Discount & Shipping</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Discount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <div>
                <Label>Shipping Fee</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingFee}
                  onChange={(e) => setShippingFee(e.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-foreground">Payment</h2>
            <div className="space-y-4">
              <div>
                <Label>Method</Label>
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
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={isPaid}
                  onChange={(e) => setIsPaid(e.target.checked)}
                />
                Paid in full now (unchecked = due / COD)
              </label>
            </div>
          </Card>

          <Card>
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Card>

          {formError && (
            <p className="rounded-lg bg-status-cancelled/10 px-3 py-2 text-sm text-status-cancelled">
              {formError}
            </p>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating Order…" : "Create Order"}
          </Button>
        </div>
      </form>
    </div>
  );
}

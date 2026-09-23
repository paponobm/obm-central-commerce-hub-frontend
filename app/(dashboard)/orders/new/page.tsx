"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { Channel, Customer, OrderSource, PaymentMethod, Product, OrderDetail } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

const SOURCES: OrderSource[] = ["MANUAL", "PHONE", "FACEBOOK", "WHATSAPP", "WEBSITE", "OTHER"];
const PAYMENT_METHODS: PaymentMethod[] = ["COD", "BKASH", "NAGAD", "BANK_TRANSFER", "CARD", "OTHER"];

interface ItemRow {
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
}

const EMPTY_ITEM: ItemRow = { productId: "", quantity: "1", unitPrice: "", discount: "" };

export default function NewOrderPage() {
  const router = useRouter();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [customerMode, setCustomerMode] = useState<"existing" | "new">("new");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");

  const [source, setSource] = useState<OrderSource>("MANUAL");
  const [channelId, setChannelId] = useState("");

  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");

  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [discount, setDiscount] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [isPaid, setIsPaid] = useState(false);
  const [notes, setNotes] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<Channel[]>("/admin/channels").then(setChannels).catch(() => {});
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

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addItemRow() {
    setItems((rows) => [...rows, { ...EMPTY_ITEM }]);
  }

  function removeItemRow(index: number) {
    setItems((rows) => rows.filter((_, i) => i !== index));
  }

  function productPrice(productId: string): string {
    const p = products.find((x) => x.id === productId);
    return p ? p.basePrice : "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const validItems = items.filter((i) => i.productId && Number(i.quantity) > 0);
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
          quantity: Number(i.quantity),
          unitPrice: i.unitPrice ? Number(i.unitPrice) : undefined,
          discount: i.discount ? Number(i.discount) : undefined,
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
            <div className="space-y-3">
              {items.map((row, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-5">
                    {i === 0 && <Label>Product</Label>}
                    <Select
                      required
                      value={row.productId}
                      onChange={(e) => updateItem(i, { productId: e.target.value })}
                    >
                      <option value="">Choose a product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <Label>Qty</Label>}
                    <Input
                      required
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) => updateItem(i, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <Label>Price</Label>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.unitPrice}
                      placeholder={productPrice(row.productId)}
                      onChange={(e) => updateItem(i, { unitPrice: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <Label>Discount</Label>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.discount}
                      onChange={(e) => updateItem(i, { discount: e.target.value })}
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-status-cancelled hover:bg-status-cancelled/10"
                      disabled={items.length === 1}
                      onClick={() => removeItemRow(i)}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" className="mt-3" onClick={addItemRow}>
              Add Item
            </Button>
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
                <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                  <option value="">None</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
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

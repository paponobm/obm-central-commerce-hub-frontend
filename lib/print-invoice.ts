import JsBarcode from "jsbarcode";
import type { OrderListItem } from "@/lib/types";
import { formatAmount, formatDateTime } from "@/lib/format";

export type InvoiceMode = "by-invoice" | "grouped-by-sku";
export type PaperSize = "A4" | "A5" | "Letter";

function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLES = `
  @page { size: __PAPER__; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 15px; margin: 0; }
  .invoice { page-break-after: always; }
  .invoice:last-child { page-break-after: auto; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .row > div { flex: 1; }
  .row .barcode { flex: 0 0 auto; }
  .badge { display: inline-block; background: #000; color: #fff; padding: 12px 18px; font-weight: 700; font-size: 22px; letter-spacing: 1px; border-radius: 4px; }
  .billing { margin-top: 14px; line-height: 1.5; }
  .billing .name, .billing .phone { font-weight: 700; }
  .barcode { text-align: center; padding-top: 4px; }
  .barcode svg { width: 220px; height: auto; }
  .meta { text-align: right; line-height: 1.7; }
  .brand { font-size: 24px; font-weight: 700; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #000; color: #fff; text-align: left; padding: 10px 10px; font-size: 14px; text-transform: uppercase; }
  td { padding: 9px 10px; border-bottom: 1px solid #e5e7eb; font-size: 15px; }
  .r { text-align: right; }
  .foot { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 14px; gap: 24px; }
  .contact { background: #f3f4f6; border-radius: 4px; padding: 10px 12px; min-width: 220px; line-height: 1.5; }
  .contact b { display: block; margin-bottom: 2px; }
  .totals { min-width: 240px; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .totals .grand { font-weight: 700; border-top: 1px solid #111; margin-top: 4px; padding-top: 6px; }
  .thanks { text-align: center; margin-top: 28px; color: #444; }
`;

function barcodeSvg(value: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, { format: "CODE128", displayValue: true, height: 46, width: 1.6, fontSize: 13, margin: 0 });
  return svg.outerHTML;
}

function invoiceHtml(order: OrderListItem, storeName: string): string {
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td>${esc(item.productName)}</td>
          <td class="r">${esc(item.quantity)}</td>
          <td class="r">${esc(formatAmount(item.unitPrice))}</td>
          <td class="r">${esc(formatAmount(item.total))}</td>
        </tr>`,
    )
    .join("");
  const discount = Number(order.discount) > 0
    ? `<div><span>Discount</span><span>-${esc(formatAmount(order.discount))}</span></div>`
    : "";
  return `
    <section class="invoice">
      <div class="top">
        <span class="badge">INVOICE</span>
        <div class="brand">${esc(storeName)}</div>
      </div>
      <div class="row">
        <div class="billing">
          <div>Billing To</div>
          <div class="name">${esc(order.shippingName)}</div>
          <div class="phone">${esc(order.shippingPhone)}</div>
          <div>${esc(order.shippingAddress)}</div>
        </div>
        <div class="barcode">${barcodeSvg(order.orderNumber)}</div>
        <div class="meta">
          <div><b>Invoice No:</b> ${esc(order.orderNumber)}</div>
          <div><b>Invoice Date:</b> ${esc(formatDateTime(order.createdAt))}</div>
          <div><b>Total Items:</b> ${order.items.length}</div>
          <div><b>Delivery:</b> ${esc(order.deliveryMethod ?? "—")}</div>
          <div><b>Tracking:</b> —</div>
        </div>
      </div>
      <table>
        <thead><tr><th>Products</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="foot">
        <div class="contact">
          <b>Contact Us</b>
          <div>${esc(storeName)}</div>
        </div>
        <div class="totals">
          <div><span>Sub Total</span><span>${esc(formatAmount(order.subtotal))}</span></div>
          ${discount}
          <div><span>Delivery Charge</span><span>${esc(formatAmount(order.shippingFee))}</span></div>
          <div class="grand"><span>Total</span><span>${esc(formatAmount(order.total))}</span></div>
        </div>
      </div>
      <div class="thanks">Thank you for your purchase</div>
    </section>`;
}

function groupedHtml(orders: OrderListItem[], storeName: string): string {
  const bySku = new Map<string, { name: string; qty: number; price: number; amount: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const entry = bySku.get(item.sku) ?? { name: item.productName, qty: 0, price: Number(item.unitPrice), amount: 0 };
      entry.qty += item.quantity;
      entry.amount += Number(item.total);
      bySku.set(item.sku, entry);
    }
  }
  const sum = (pick: (o: OrderListItem) => string | number) =>
    orders.reduce((total, o) => total + Number(pick(o)), 0);
  const rows = Array.from(bySku.entries())
    .map(
      ([sku, e]) => `
        <tr>
          <td>${esc(sku)}</td>
          <td>${esc(e.name)}</td>
          <td class="r">${e.qty}</td>
          <td class="r">${esc(formatAmount(e.price))}</td>
          <td class="r">${esc(formatAmount(e.amount))}</td>
        </tr>`,
    )
    .join("");
  const discountTotal = sum((o) => o.discount);
  return `
    <section class="invoice">
      <div class="head">
        <div><span class="badge">INVOICE SUMMARY</span></div>
        <div>
          <div class="brand">${esc(storeName)}</div>
          <div class="meta">
            <div><b>Orders:</b> ${orders.length}</div>
            <div><b>Printed:</b> ${esc(formatDateTime(new Date().toISOString()))}</div>
          </div>
        </div>
      </div>
      <table>
        <thead><tr><th>SKU</th><th>Products</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div><span>Sub Total</span><span>${esc(formatAmount(sum((o) => o.subtotal)))}</span></div>
        ${discountTotal > 0 ? `<div><span>Discount</span><span>-${esc(formatAmount(discountTotal))}</span></div>` : ""}
        <div><span>Delivery Charge</span><span>${esc(formatAmount(sum((o) => o.shippingFee)))}</span></div>
        <div class="grand"><span>Total</span><span>${esc(formatAmount(sum((o) => o.total)))}</span></div>
      </div>
    </section>`;
}

// Prints through a hidden iframe on this page, so only the browser's print
// dialog appears — no extra tab. The dialog's "Save as PDF" destination covers
// the "Download PDF" option too.
export function printInvoices(
  orders: OrderListItem[],
  mode: InvoiceMode,
  storeName: string,
  paper: PaperSize,
): boolean {
  const body =
    mode === "by-invoice"
      ? orders.map((o) => invoiceHtml(o, storeName)).join("")
      : groupedHtml(orders, storeName);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return false;
  }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice</title><style>${STYLES.replace("__PAPER__", paper)}</style></head><body>${body}</body></html>`);
  doc.close();
  setTimeout(() => {
    win.focus();
    win.print();
    frame.remove();
  }, 150);
  return true;
}

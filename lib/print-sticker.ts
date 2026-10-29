import JsBarcode from "jsbarcode";
import type { OrderListItem } from "@/lib/types";
import { formatAmount } from "@/lib/format";

function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function dateMDY(value: string): string {
  const d = new Date(value);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function barcodeSvg(value: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, { format: "CODE128", displayValue: true, height: 46, width: 1.6, fontSize: 13, margin: 0 });
  return svg.outerHTML;
}

const PROVIDER_LABEL: Record<string, string> = {
  STEADFAST: "Steadfast",
};

// A fixed 4"x6" label (101.6mm x 152.4mm) — the standard courier sticker
// size, same aspect ratio as the reference tool's "Print Sticker" output.
// The sticker box is sized to the full page content area (flex column, with
// the courier-barcode box growing to fill leftover space) so the printed
// label fills the page the way the reference does, instead of leaving
// blank space below a shorter block of content.
const STYLES = `
  @page { size: 100mm 150mm; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
  .sticker { width: 92mm; height: 142mm; display: flex; flex-direction: column; page-break-after: always; border: 1.5px solid #111; padding: 4mm; }
  .sticker:last-child { page-break-after: auto; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #111; padding-bottom: 3mm; margin-bottom: 3mm; }
  .store { font-size: 17px; font-weight: 700; max-width: 48mm; line-height: 1.25; }
  .meta { text-align: right; font-size: 12px; line-height: 1.7; }
  .meta b { font-weight: 700; }
  .field { display: flex; gap: 6px; align-items: baseline; margin-bottom: 2.5mm; }
  .field .label { font-weight: 700; font-size: 12px; letter-spacing: 0.5px; width: 18mm; flex: 0 0 auto; }
  .field .value { font-size: 18px; font-weight: 600; }
  .barcode-box { border: 1.5px solid #111; border-radius: 2mm; padding: 2mm 0; text-align: center; margin-bottom: 3mm; }
  .barcode-box svg { width: 72mm; height: auto; }
  .courier-row { font-size: 13px; margin-bottom: 1.5mm; display: flex; gap: 6px; align-items: baseline; }
  .courier-row .label { font-weight: 700; }
  .courier-row .value { font-size: 17px; font-weight: 600; }
  .courier-row .value.parcel { font-weight: 700; }
  .courier-barcode-label { font-size: 11px; letter-spacing: 1px; font-weight: 700; text-transform: uppercase; text-align: center; margin-top: 3mm; }
  .courier-barcode-box { flex: 1; border: 1.5px solid #111; border-radius: 2mm; padding: 4mm 0; text-align: center; margin-top: 1.5mm; display: flex; align-items: center; justify-content: center; }
  .courier-barcode-box svg { width: 72mm; height: auto; }
  .tracking-pending { color: #888; font-size: 14px; font-weight: 600; }
  .cod { margin-top: 3mm; background: #111; color: #fff; text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 1px; border-radius: 3mm; padding: 3.5mm 0; }
`;

function stickerHtml(order: OrderListItem, storeName: string): string {
  const consignmentId = order.shipment?.externalConsignmentId ?? null;
  const providerLabel = order.shipment?.provider ? (PROVIDER_LABEL[order.shipment.provider] ?? order.shipment.provider) : "—";
  const courierBarcode = consignmentId
    ? `<div class="courier-barcode-box">${barcodeSvg(consignmentId)}</div>`
    : `<div class="courier-barcode-box"><span class="tracking-pending">Tracking pending</span></div>`;
  return `
    <section class="sticker">
      <div class="top">
        <div class="store">${esc(storeName)}</div>
        <div class="meta">
          <div>Date: ${esc(dateMDY(order.createdAt))}</div>
          <div><b>IV NO: ${esc(order.orderNumber)}</b></div>
        </div>
      </div>
      <div class="field"><span class="label">NAME</span><span class="value">${esc(order.shippingName)}</span></div>
      <div class="field"><span class="label">PHONE</span><span class="value">${esc(order.shippingPhone)}</span></div>
      <div class="barcode-box">${barcodeSvg(order.orderNumber)}</div>
      <div class="courier-row"><span class="label">Courier:</span> <span class="value">${esc(providerLabel)}</span></div>
      <div class="courier-row"><span class="label">Parcel ID:</span> <span class="value parcel">${esc(consignmentId ?? "N/A")}</span></div>
      <div class="courier-barcode-label">Courier Barcode</div>
      ${courierBarcode}
      <div class="cod">COD - ${esc(formatAmount(order.total))}</div>
    </section>`;
}

// Prints through a hidden iframe, same mechanism as printInvoices — only the
// browser's print dialog appears, and its "Save as PDF" destination covers
// the "Download PDF" option too.
export function printStickers(orders: OrderListItem[], storeName: string): boolean {
  const body = orders.map((o) => stickerHtml(o, storeName)).join("");
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
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Sticker</title><style>${STYLES}</style></head><body>${body}</body></html>`);
  doc.close();
  setTimeout(() => {
    win.focus();
    win.print();
    frame.remove();
  }, 150);
  return true;
}

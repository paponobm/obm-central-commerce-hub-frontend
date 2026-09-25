// Best-effort normalization for a Bangladesh-first customer base: strips
// formatting, and turns a local 0-prefixed number into the +880 form
// wa.me/tel: links expect. Not a general international phone library —
// doesn't need to be one for this business.
function digitsOnly(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export function telHref(phone: string): string {
  return `tel:${digitsOnly(phone)}`;
}

export function whatsappHref(phone: string): string {
  let digits = digitsOnly(phone);
  if (digits.startsWith("0")) digits = `88${digits}`;
  return `https://wa.me/${digits}`;
}

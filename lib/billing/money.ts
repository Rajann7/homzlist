/**
 * Money + GST maths. Shared by server and client, but ONLY the server's result
 * is authoritative — the client uses these purely to render what the server
 * already computed (Doc9 §12: client-sent amounts are always ignored).
 *
 * All amounts are integer paise (Doc2 §15). No floats anywhere in the pipeline.
 */

/** ₹ display for an integer-paise amount: 99900 → "₹999", 94282 → "₹942.82". */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return (
    "₹" +
    rupees.toLocaleString("en-IN", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Indian short form for big prices (Doc2 §15): 8500000 paise → "₹85 Lakh". */
export function formatShortRupees(paise: number): string {
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${+(r / 1_00_00_000).toFixed(2)} Cr`;
  if (r >= 1_00_000) return `₹${+(r / 1_00_000).toFixed(2)} Lakh`;
  return formatPaise(paise);
}

export interface TaxBreakdown {
  basePaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  gstRateBps: number;
}

/**
 * GST is charged ON TOP of the (discounted) price, matching the P6 checkout and
 * the P11 invoice: ₹999 − ₹200 coupon = ₹799 taxable → CGST ₹72 + SGST ₹72 →
 * ₹943 total. Intra-state (place of supply = home state) splits CGST/SGST 50-50;
 * inter-state charges a single IGST line.
 */
export function computeTax(
  basePaise: number,
  discountPaise: number,
  { gstRateBps, intraState }: { gstRateBps: number; intraState: boolean },
): TaxBreakdown {
  const discount = Math.min(Math.max(0, Math.round(discountPaise)), basePaise);
  const taxable = basePaise - discount;
  const gst = Math.round((taxable * gstRateBps) / 10000);
  // Split so the halves always sum back to `gst` exactly (no rounding drift).
  const cgst = intraState ? Math.floor(gst / 2) : 0;
  const sgst = intraState ? gst - cgst : 0;
  const igst = intraState ? 0 : gst;
  return {
    basePaise,
    discountPaise: discount,
    taxablePaise: taxable,
    cgstPaise: cgst,
    sgstPaise: sgst,
    igstPaise: igst,
    totalPaise: taxable + gst,
    gstRateBps,
  };
}

/** GSTIN format check (15 chars: 2 state + 10 PAN + entity + Z + checksum). */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Coupon codes are uppercase alphanumerics — keeps them out of query wildcards. */
export const COUPON_RE = /^[A-Z0-9]{3,24}$/;

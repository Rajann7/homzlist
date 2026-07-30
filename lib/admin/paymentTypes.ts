/**
 * The payment shapes A17/A18's client screens and their server reader share.
 *
 * Deliberately NOT `server-only`: Next follows even a type-only import into a
 * server-only module before the types are erased, so a client component that
 * imported these from `payments.ts` would fail the build. A12 hit exactly that.
 */

export interface PaymentFilters {
  q: string | null;
  status: string | null;
  method: string | null;
}

/** The states `payments.status` actually holds, in the order A17 lists them. */
export const PAYMENT_STATUS_CHIPS = [
  { key: "all", label: "All" },
  { key: "success", label: "Success" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunded" },
  { key: "chargeback", label: "Chargeback" },
] as const;

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  success: "Success",
  pending: "Pending",
  failed: "Failed",
  refunded: "Refunded",
  chargeback: "Chargeback",
};

export interface PaymentRow {
  id: string;
  ref: string;
  payer: { id: string; name: string; initials: string };
  amountLabel: string;
  method: string;
  status: string;
  statusLabel: string;
  atLabel: string;
  refundedAtLabel: string | null;
  forWhat: string;
}

export interface PaymentDetail {
  id: string;
  ref: string;
  status: string;
  statusLabel: string;
  amountLabel: string;
  amountPaise: number;
  method: string;
  methodDetail: string | null;
  atLabel: string;
  capturedAtLabel: string | null;
  refundedAtLabel: string | null;
  refundId: string | null;
  refundReason: string | null;
  failureReason: string | null;
  payer: { id: string; name: string; initials: string; phone: string };
  order: {
    id: string;
    kind: string;
    catalogCode: string | null;
    baseLabel: string;
    discountLabel: string;
    taxLabel: string;
    totalLabel: string;
    couponCode: string | null;
    gstin: string | null;
    placeOfSupply: string | null;
    status: string;
  } | null;
  /** What the money bought — the thing a refund has to take back with it. */
  grants: Array<{ label: string; detail: string }>;
  refundable: boolean;
  refundBlockedReason: string | null;
}

import { cn } from "@/lib/utils";

/**
 * StatusBadge — Doc1 Component 18 / §9. 4px radius, 11/600 UPPERCASE +0.3ls.
 * Single badge language across the app. Max 2 badges on any photo (enforced by
 * callers). `onPhoto` variant uses the 60%-black chip treatment (Doc1 §7).
 */

export type BadgeKind =
  | "promoted"
  | "verified"
  | "sold"
  | "rented"
  | "under-review"
  | "expired"
  | "changes-requested"
  | "for-sale"
  | "for-rent"
  | "new-project"
  | "fulfilled"
  // Billing/boost states (P11) — same badge language, not a second one.
  | "active"
  | "pending"
  | "pending-approval"
  | "failed"
  | "refunded"
  | "trial"
  | "grace"
  | "rejected"
  | "stopped"
  | "success";

const LABEL: Record<BadgeKind, string> = {
  promoted: "Promoted",
  verified: "Verified",
  sold: "Sold",
  rented: "Rented",
  "under-review": "Under Review",
  expired: "Expired",
  "changes-requested": "Changes Requested",
  "for-sale": "For Sale",
  "for-rent": "For Rent",
  "new-project": "New Project",
  fulfilled: "Fulfilled ✓",
  active: "Active",
  pending: "Pending",
  "pending-approval": "Pending approval",
  failed: "Failed",
  refunded: "Refunded",
  trial: "Trial",
  grace: "Grace",
  rejected: "Rejected",
  stopped: "Stopped",
  success: "Success",
};

// Token-based colour pairs (Doc1 §2 #18). Dark mode auto-swaps via tokens.
const STYLE: Record<BadgeKind, string> = {
  promoted: "bg-black/60 text-white",
  verified: "bg-accent-soft text-accent",
  sold: "bg-ink-primary text-ink-inverse",
  rented: "bg-warning text-ink-inverse",
  "under-review": "bg-info-soft text-info",
  expired: "bg-surface-3 text-ink-tertiary",
  "changes-requested": "bg-warning-soft text-warning",
  "for-sale": "bg-accent-soft text-accent",
  "for-rent": "bg-warning-soft text-warning",
  "new-project": "bg-info-soft text-info",
  fulfilled: "bg-accent-soft text-accent",
  active: "bg-accent-soft text-accent",
  pending: "bg-info-soft text-info",
  "pending-approval": "bg-info-soft text-info",
  failed: "bg-error-soft text-error",
  refunded: "bg-surface-2 text-ink-secondary",
  trial: "bg-info-soft text-info",
  grace: "bg-warning-soft text-warning",
  rejected: "bg-error-soft text-error",
  stopped: "bg-surface-3 text-ink-tertiary",
  success: "bg-accent-soft text-accent",
};

export function StatusBadge({
  kind,
  label,
  onPhoto = false,
  className,
}: {
  kind: BadgeKind;
  /** Override the canonical label (server-supplied status text). */
  label?: string;
  onPhoto?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "chrome inline-flex items-center rounded-4 px-2 py-0.5 text-11 font-semibold uppercase tracking-[0.3px]",
        onPhoto ? "bg-black/60 text-white" : STYLE[kind],
        className,
      )}
    >
      {label ?? LABEL[kind]}
    </span>
  );
}

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
  | "fulfilled";

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
};

export function StatusBadge({
  kind,
  onPhoto = false,
  className,
}: {
  kind: BadgeKind;
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
      {LABEL[kind]}
    </span>
  );
}

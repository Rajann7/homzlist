/**
 * The listing state machine, as A12 shows it.
 *
 * Deliberately NOT `server-only`: A12's chip row is a client component and needs
 * the same list the server counts over, and a status the two disagree about is a
 * chip that lies. It is also not a config table — these are the states the
 * schema itself allows, the same reasoning as the risk bands in A3.
 */

export const STATUS_CHIPS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "pending_review", label: "Pending" },
  { key: "changes_requested", label: "Changes requested" },
  { key: "rejected", label: "Rejected" },
  { key: "hidden", label: "Hidden" },
  { key: "payment_pending", label: "Payment pending" },
  { key: "archived", label: "Archived" },
  { key: "draft", label: "Draft" },
  { key: "deleted", label: "Trash" },
] as const;

/** The label the status badge shows — A12 and A11's Listings tab share it. */
export const LISTING_STATUS_LABEL: Record<string, string> = {
  live: "Live",
  pending_review: "Pending",
  changes_requested: "Changes Requested",
  rejected: "Rejected",
  hidden: "Hidden",
  payment_pending: "Payment pending",
  archived: "Archived",
  draft: "Draft",
  deleted: "Deleted",
};

/** The states A4 was built to decide — the only ones with a review screen. */
export const REVIEWABLE = ["pending_review", "changes_requested", "payment_pending", "rejected"];

// ---- the shapes A12's client screen and its server reader share -----------
// They live here, not in listingsMaster.ts: that module is `server-only`, and
// Next follows a type-only import into it before the types are erased, which
// fails the build with "you're importing a component that needs server-only".

export interface ListingFilters {
  q: string | null;
  status: string | null;
  type: string | null;
  cityId: string | null;
  role: string | null;
  boosted: string | null;
  reported: string | null;
}

export interface ListingFilterOptions {
  types: Array<{ value: string; label: string }>;
  cities: Array<{ value: string; label: string }>;
  roles: Array<{ value: string; label: string }>;
}

export interface MasterListingRow {
  id: string;
  shortId: string;
  title: string;
  typeLabel: string;
  priceLabel: string;
  location: string;
  poster: { id: string; name: string; initials: string; role: string };
  status: string;
  statusLabel: string;
  postedLabel: string;
  coverUrl: string | null;
  boosted: boolean;
  reports: number;
  /** A4 only exists for a listing that is actually in a review state. */
  reviewHref: string | null;
}

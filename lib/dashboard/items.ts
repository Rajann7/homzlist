import type { IconName } from "@/components/ui/Icon";

/**
 * The seller destinations — the Dashboard hub's one and only definition.
 *
 * These nine rows were written out by hand inside `ProfileMenuSheet` until
 * 6 Aug 2026, when they moved out to the hub behind the feed header's grid
 * icon (Rajan: "profile ke sidebar se hata do, home ke icon me sab daal diya").
 * The sheet no longer draws them at all, so this file is now their single
 * definition rather than a list two surfaces shared.
 *
 * Nothing here decides access. Every href is a route that authorises itself
 * server-side; this file only says which door to draw (CLAUDE.md rule 4). In
 * particular these are NOT role-filtered, and that is deliberate — see
 * HUB_GROUPS below.
 */

/** Which server-computed count rides this item. `null` = the item shows none. */
export type DashCountKey =
  | "listings"
  | "leads"
  | "browseRequirements"
  | "myRequirements"
  | "proposals"
  | "visits"
  | "boosts"
  | "plan";

/**
 * Icon-chip tone. Categorical only — a tone says "this is a different
 * destination", never "this is urgent/healthy/broken". Status colour on this
 * screen is carried by the badge alone.
 */
export type DashTone =
  | "green" | "amber" | "blue" | "violet" | "teal" | "pink" | "indigo" | "cyan" | "orange";

/** Tailwind classes per tone. A map, not a template string — a constructed
 *  class name (`bg-tone-${x}`) is not in the source text, so Tailwind's scanner
 *  never emits the rule and the chip renders transparent. */
export const TONE_BG: Record<DashTone, string> = {
  green: "bg-tone-green",
  amber: "bg-tone-amber",
  blue: "bg-tone-blue",
  violet: "bg-tone-violet",
  teal: "bg-tone-teal",
  pink: "bg-tone-pink",
  indigo: "bg-tone-indigo",
  cyan: "bg-tone-cyan",
  orange: "bg-tone-orange",
};

export interface DashItem {
  key: string;
  icon: IconName;
  /** Chip colour — one per destination, so no two tiles read alike. */
  tone: DashTone;
  /** Row label. Kept verbatim from the profile sheet — design lock. */
  label: string;
  /**
   * One-line context. Hub only; the profile sheet has never shown a subtitle.
   *
   * Where the item carries a count, this line NAMES WHAT THE COUNT COUNTS.
   * That is not decoration — the badges are deliberately a subset (live, new,
   * pending, upcoming) while the screens behind them list every status, so
   * "Scheduled site visits · 1" over a screen showing eight visits was the UI
   * stating something the server does not back up. Each subtitle now says
   * which subset the number is, so the tile and the screen cannot disagree.
   */
  subtitle: string;
  href: string;
  count: DashCountKey | null;
  /**
   * A count that means "this is waiting on you" renders as a solid ink pill
   * instead of the accent one, so attention reads before the number does.
   */
  urgent?: boolean;
}

/** The nine destinations, keyed. Order here is not a surface order — see below. */
export const DASH_ITEMS: Record<string, DashItem> = {
  listings: {
    key: "listings",
    icon: "home",
    tone: "green",
    label: "My Listings",
    subtitle: "Live right now",
    href: "/listings",
    count: "listings",
  },
  browseRequirements: {
    key: "browseRequirements",
    icon: "search",
    tone: "blue",
    label: "Browse requirements",
    subtitle: "Buyers looking now",
    href: "/requirements",
    count: "browseRequirements",
  },
  myRequirements: {
    key: "myRequirements",
    icon: "file",
    tone: "violet",
    label: "My requirements",
    subtitle: "Live right now",
    href: "/requirements/mine",
    count: "myRequirements",
  },
  proposals: {
    key: "proposals",
    icon: "send",
    tone: "teal",
    label: "My proposals",
    subtitle: "Awaiting a reply",
    href: "/proposals",
    count: "proposals",
  },
  visits: {
    key: "visits",
    icon: "pin",
    tone: "pink",
    label: "My visits",
    subtitle: "Coming up",
    href: "/visits",
    count: "visits",
    urgent: true,
  },
  leads: {
    key: "leads",
    icon: "filter",
    tone: "amber",
    label: "Leads",
    subtitle: "New enquiries",
    href: "/leads",
    count: "leads",
    urgent: true,
  },
  plan: {
    key: "plan",
    icon: "card",
    tone: "indigo",
    label: "My plan",
    subtitle: "Plan and renewal",
    href: "/plans/my",
    count: "plan",
  },
  payments: {
    key: "payments",
    icon: "receipt",
    tone: "cyan",
    label: "Payments",
    subtitle: "Invoices and history",
    href: "/payments",
    count: null,
  },
  boosts: {
    key: "boosts",
    icon: "rocket",
    tone: "orange",
    label: "Boosts",
    subtitle: "Running now",
    href: "/boost",
    count: "boosts",
  },
};

export interface DashGroup {
  title: string;
  /** `wide` items span both bento columns and read as the group's anchor. */
  items: { key: string; wide?: boolean }[];
}

/**
 * Hub arrangement — the approved bento (Rajan, 6 Aug 2026).
 *
 * DELIBERATELY NOT ROLE-FILTERED. It looks like a builder should not see
 * "Browse requirements" or "My proposals", and that was raised as a gap — but
 * the server says otherwise, and `scripts/check-builder-requirements-live.mjs`
 * asserts it in both directions:
 *
 *   · "builder with ₹9,999 sees UNLOCKED requirements" — a builder's
 *     requirement access ships WITH the project plan (migration 0087).
 *   · "builder WITH a live project can send a proposal".
 *
 * What a builder cannot do is BUY the ₹2,999 requirement-only plan, and that is
 * already refused server-side (403 on quote and checkout) with the plan absent
 * from their catalog. Hiding the tiles would therefore hide two screens
 * builders legitimately use, and would break that check script.
 *
 * The same holds for the rest: every one of the nine is gated by ENTITLEMENT
 * (an active plan, a live project, a quota), never by role, and each screen
 * already renders its own locked/empty state — which is where the upsell
 * lives. A hidden tile has no upsell. If a role rule is ever wanted here it
 * has to be enforced on the server first; a client-side filter over a server
 * that still allows the route would be decoration, not a gate.
 */
export const HUB_GROUPS: DashGroup[] = [
  {
    title: "Inventory",
    items: [{ key: "listings", wide: true }, { key: "leads" }, { key: "browseRequirements" }],
  },
  {
    title: "Requirements",
    items: [{ key: "myRequirements" }, { key: "proposals" }, { key: "visits", wide: true }],
  },
  {
    title: "Billing & growth",
    items: [{ key: "plan", wide: true }, { key: "payments" }, { key: "boosts" }],
  },
];

/** Resolve a key to its item, skipping anything unknown (never throws). */
export function dashItem(key: string): DashItem | null {
  return DASH_ITEMS[key] ?? null;
}

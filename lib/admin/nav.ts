import type { IconName } from "@/components/ui/Icon";
import { can, type Capability, type StaffLevel } from "./permissions";

/**
 * The sidebar, exactly as P13/P14/P15 list it (identical in all three packets)
 * — order, grouping, labels and which entries only a Super Admin ever sees.
 *
 * The design hardcodes the badge numbers (Listings 12, Requirements 3, …). Those
 * are the ONE thing that changes here: CLAUDE.md rule 12 means a badge is a real
 * count or it is not drawn. `badgeKey` names which dashboard tile feeds it, so
 * the sidebar and A2's tiles can never disagree — they read the same query.
 *
 * `cap` is the capability the screen needs. Hiding a row is a courtesy, not the
 * control: every page and endpoint behind it re-checks server-side (Doc3 §1.1
 * "not UI-hidden only").
 */

import type { TileKey } from "./dashboard";

export interface NavLeaf {
  label: string;
  href: string;
  badgeKey?: TileKey;
  cap?: Capability;
}

export interface NavItem extends NavLeaf {
  type: "item";
  icon: IconName;
}

export interface NavGroup {
  type: "group";
  key: string;
  icon: IconName;
  label: string;
  children: NavLeaf[];
}

export type NavEntry = NavItem | NavGroup;

const ALL: NavEntry[] = [
  { type: "item", icon: "home", label: "Dashboard", href: "/" },
  {
    type: "group",
    key: "queues",
    icon: "layers",
    label: "Queues",
    children: [
      { label: "Listings", href: "/queues/listings", badgeKey: "listings", cap: "queues.view" },
      { label: "Requirements", href: "/queues/requirements", badgeKey: "requirements", cap: "queues.view" },
      { label: "Boosts", href: "/queues/boosts", badgeKey: "boosts", cap: "queues.view" },
      { label: "Verifications", href: "/queues/verifications", badgeKey: "verifications", cap: "queues.view" },
      { label: "Appeals", href: "/queues/appeals", badgeKey: "appeals", cap: "queues.view" },
      { label: "Reports", href: "/queues/reports", badgeKey: "reports", cap: "queues.view" },
    ],
  },
  { type: "item", icon: "users", label: "Users", href: "/users", cap: "users.edit" },
  { type: "item", icon: "list", label: "Listings", href: "/listings", cap: "listings.edit" },
  { type: "item", icon: "card", label: "Payments", href: "/payments", cap: "refunds" },
  { type: "item", icon: "rupee", label: "Finance", href: "/finance", cap: "refunds" },
  {
    type: "group",
    key: "plans",
    icon: "tag",
    label: "Plans",
    children: [
      { label: "Plans", href: "/plans", cap: "plans" },
      { label: "Coupons", href: "/plans/coupons", cap: "coupons" },
      { label: "Grants", href: "/plans/grants", cap: "grants" },
    ],
  },
  { type: "item", icon: "stack", label: "Master Data", href: "/master-data", cap: "masterdata" },
  { type: "item", icon: "file", label: "CMS", href: "/cms", cap: "cms" },
  { type: "item", icon: "mail", label: "Templates", href: "/templates", cap: "templates" },
  {
    type: "group",
    key: "support",
    icon: "headset",
    label: "Support",
    children: [
      { label: "Tickets", href: "/support/tickets", badgeKey: "tickets", cap: "tickets" },
      { label: "Disputes", href: "/support/disputes", cap: "tickets" },
    ],
  },
  { type: "item", icon: "shield", label: "Staff", href: "/staff", cap: "staff" },
  { type: "item", icon: "chart", label: "Analytics", href: "/analytics", cap: "queues.view" },
  { type: "item", icon: "book", label: "Audit Log", href: "/audit", cap: "audit" },
  {
    type: "group",
    key: "system",
    icon: "settings",
    label: "System",
    children: [
      { label: "Cron & Status", href: "/system/cron", cap: "queues.view" },
      { label: "Settings & Flags", href: "/system/settings", cap: "flags" },
      { label: "Trash", href: "/system/trash", cap: "listings.edit" },
      { label: "Exports", href: "/system/exports", cap: "users.edit" },
    ],
  },
];

/** Drop what this level cannot reach, then drop any group left empty. */
export function navFor(level: StaffLevel): NavEntry[] {
  const allowed = (leaf: NavLeaf) => !leaf.cap || can(level, leaf.cap);
  const out: NavEntry[] = [];
  for (const entry of ALL) {
    if (entry.type === "item") {
      if (allowed(entry)) out.push(entry);
      continue;
    }
    const children = entry.children.filter(allowed);
    if (children.length) out.push({ ...entry, children });
  }
  return out;
}

/**
 * Screen key ↔ route. The design addresses screens by key (`this.go('users')`);
 * the app addresses them by URL. This is the one place the two are tied
 * together, so the sidebar, breadcrumbs and lock gates all agree.
 *
 * Only screens that are FULL ROUTES appear here. Details that the design opens
 * as stacked panels (a user, a listing, a payment…) deliberately have no entry —
 * giving them one is how they turn into pages, which §5 forbids.
 */

/**
 * The BROWSER's base, which on account.homzlist.com is the root.
 *
 * `/account` is the internal rewrite target — middleware maps `/queues/listings`
 * → `/account/queues/listings` so the files can live in the (admin) group. It is
 * not a URL anyone ever types, and using it as an href produced
 * `/account/account/...` on the next rewrite: every link in the panel 404'd.
 * That went unnoticed through P2 because the screens were reached by typing
 * their URLs; the first CLICK-driven navigation (A4's auto-advance) found it.
 */
export const ADMIN_BASE = "";

export const SCREEN_ROUTES: Record<string, string> = {
  dashboard: "/",
  listings: `${ADMIN_BASE}/queues/listings`,
  requirements: `${ADMIN_BASE}/queues/requirements`,
  boosts: `${ADMIN_BASE}/queues/boosts`,
  verifications: `${ADMIN_BASE}/queues/verifications`,
  appeals: `${ADMIN_BASE}/queues/appeals`,
  reports: `${ADMIN_BASE}/queues/reports`,
  users: `${ADMIN_BASE}/users`,
  listingsMaster: `${ADMIN_BASE}/listings`,
  payments: `${ADMIN_BASE}/payments`,
  finance: `${ADMIN_BASE}/finance`,
  plans: `${ADMIN_BASE}/plans`,
  coupons: `${ADMIN_BASE}/coupons`,
  grants: `${ADMIN_BASE}/grants`,
  masterData: `${ADMIN_BASE}/master-data`,
  cms: `${ADMIN_BASE}/cms`,
  templates: `${ADMIN_BASE}/templates`,
  settings: `${ADMIN_BASE}/settings`,
  tickets: `${ADMIN_BASE}/tickets`,
  disputes: `${ADMIN_BASE}/disputes`,
  staff: `${ADMIN_BASE}/staff`,
  audit: `${ADMIN_BASE}/audit`,
  cron: `${ADMIN_BASE}/cron`,
  analytics: `${ADMIN_BASE}/analytics`,
  trash: `${ADMIN_BASE}/trash`,
  exports: `${ADMIN_BASE}/exports`,
};

/** A4 Review is a full screen in the design (`this.go('review')`), not a panel. */
export const reviewRoute = (listingId: string) =>
  `${ADMIN_BASE}/queues/listings/${listingId}`;

/**
 * Which screen a pathname belongs to — drives the sidebar's active row.
 *
 * Accepts both the browser path (`/queues/listings`) and the rewritten one
 * (`/account/queues/listings`), because a client component rendered on the
 * server can be handed either: the browser knows the URL it asked for, the
 * server knows the one middleware rewrote it to. Normalising here means no
 * caller has to know which side it is on.
 */
export function screenForPath(pathname: string): string {
  const path = pathname.replace(/^\/account(?=\/|$)/, "") || "/";
  if (path === "/") return "dashboard";
  if (path.startsWith("/queues/listings/")) return "review";
  const hit = Object.entries(SCREEN_ROUTES)
    .filter(([key]) => key !== "dashboard")
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, route]) => path === route || path.startsWith(`${route}/`));
  return hit ? hit[0] : "dashboard";
}

/* ══════════════════════════════════════════ the screen tables ══════════════
   These live HERE, in a module with no "use client", because both halves of
   the app need them: the sidebar and breadcrumbs (client) and the route guards
   (server). They were in admin-context.tsx, which IS a client module — and a
   Server Component reading a constant out of one gets a client REFERENCE, not
   the value. Every unbuilt screen's placeholder threw "Cannot access
   users.toString on the server" and rendered the not-found page instead.
   ========================================================================== */

export type AdminRole = "staff" | "admin" | "super";

/** template line 249 */
export const ROLE_RANK: Record<AdminRole, number> = { staff: 1, admin: 2, super: 3 };

/** template line 248 — which screens each role may open at all. */
export const SCREEN_MIN_ROLE: Record<string, AdminRole> = {
  staff: "super",
  audit: "super",
  settings: "super",
  users: "admin",
  listingsMaster: "admin",
  payments: "admin",
  finance: "admin",
  plans: "admin",
  coupons: "admin",
  grants: "admin",
  masterData: "admin",
  cms: "admin",
  templates: "admin",
  // A23 Tickets gates at Admin on the page (`screenGate("admin")`). Missing
  // here, the sidebar offered Staff a Support ▸ Tickets row WITH a badge count
  // and the dashboard offered them a Tickets tile — both landing on the lock
  // gate. The table is what `canSee` reads, so an entry missing from it is a
  // screen advertised to a role that cannot open it.
  tickets: "admin",
  disputes: "admin",
  cron: "admin",
  trash: "admin",
  exports: "admin",
  analytics: "admin",
};

/** template line 1994 */
export function canSee(role: AdminRole, screen: string): boolean {
  const need = SCREEN_MIN_ROLE[screen];
  if (!need) return true;
  return ROLE_RANK[role] >= ROLE_RANK[need];
}

/** template line 244 */
export const SCREEN_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  listings: "Listings",
  review: "Review",
  requirements: "Requirements",
  boosts: "Boosts",
  verifications: "Verifications",
  appeals: "Appeals",
  reports: "Reports",
  users: "Users",
  listingsMaster: "Listings",
  payments: "Payments",
  finance: "Finance",
  plans: "Plans",
  coupons: "Coupons",
  grants: "Grants & trials",
  masterData: "Master data",
  cms: "Content",
  templates: "Templates",
  settings: "Settings",
  tickets: "Tickets",
  disputes: "Disputes",
  staff: "Staff",
  audit: "Audit log",
  cron: "System status",
  analytics: "Analytics",
  trash: "Trash",
  exports: "Exports",
};

/** template line 245 */
export const QUEUE_SCREENS = [
  "listings",
  "review",
  "requirements",
  "boosts",
  "verifications",
  "appeals",
  "reports",
];

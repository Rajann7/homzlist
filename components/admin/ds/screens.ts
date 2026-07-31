/**
 * Screen key ↔ route. The design addresses screens by key (`this.go('users')`);
 * the app addresses them by URL. This is the one place the two are tied
 * together, so the sidebar, breadcrumbs and lock gates all agree.
 *
 * Only screens that are FULL ROUTES appear here. Details that the design opens
 * as stacked panels (a user, a listing, a payment…) deliberately have no entry —
 * giving them one is how they turn into pages, which §5 forbids.
 */

export const ADMIN_BASE = "/account";

export const SCREEN_ROUTES: Record<string, string> = {
  dashboard: `${ADMIN_BASE}`,
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

/** Which screen a pathname belongs to — drives the sidebar's active row. */
export function screenForPath(pathname: string): string {
  if (pathname === ADMIN_BASE || pathname === `${ADMIN_BASE}/`) return "dashboard";
  if (pathname.startsWith(`${ADMIN_BASE}/queues/listings/`)) return "review";
  const hit = Object.entries(SCREEN_ROUTES)
    .filter(([key]) => key !== "dashboard")
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, route]) => pathname === route || pathname.startsWith(`${route}/`));
  return hit ? hit[0] : "dashboard";
}

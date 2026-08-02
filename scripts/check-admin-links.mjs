/**
 * Every destination the admin panel links to, fetched as the browser would.
 *
 * This exists because P2 shipped with EVERY internal link broken and nobody
 * noticed: `SCREEN_ROUTES` used `/account/...`, which is the internal rewrite
 * target, so middleware rewrote it a second time to `/account/account/...` and
 * returned the 404 page. Typing the URLs by hand — which is how the screens
 * were checked — never goes through a link, so it never went wrong.
 *
 * The check is deliberately dumb: ask for the href, assert the response is the
 * screen and not the not-found page. A 200 is not enough on its own, because
 * Next streams the shell first and then renders `notFound()` into it.
 *
 *   PORT=3000 node scripts/check-admin-links.mjs
 */
import { connect, env } from "./lib/dbx.mjs";

const PORT = process.env.PORT ?? "3000";
const ADMIN = `http://account.localhost:${PORT}`;

const sql = await connect();
const one = async (q) => (await sql.query(q)).rows[0];

/* ---------------------------------------------------------------- session */
const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const absorb = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const p = c.split(";")[0];
    const i = p.indexOf("=");
    jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
};

const email = process.env.ADMIN_DEV_EMAIL ?? env.ADMIN_DEV_EMAIL;
absorb(
  await fetch(`${ADMIN}/api/v1/admin/auth/dev`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  }),
);

/* ------------------------------------------------------------------ routes */
// Kept in step with components/admin/ds/screens.ts by hand on purpose: if that
// file changes shape, this check should fail loudly rather than follow it.
/**
 * Each route is checked against a marker only THAT screen renders.
 *
 * Grepping for "Page not found" does not work: Next inlines the not-found
 * template into the RSC payload of every response, so the string is present
 * whether or not it is what you are looking at. A positive marker is the only
 * honest signal — and for a screen a later part builds, the marker is the
 * design's own placeholder, which is exactly what should be there today.
 */
/** The marker a screen a LATER part builds must still be showing. */
const UNBUILT = "a later delivery batch";
const SCREENS = [
  ["/", "Refresh dashboard"],
  ["/queues/listings", "Listings queue"],
  ["/queues/requirements", "Requirements queue"],
  ["/queues/boosts", "Boost queue"],
  ["/queues/verifications", "Verification queue"],
  ["/queues/appeals", "Appeals queue"],
  ["/queues/reports", "Reports queue"],
  // P4 built these two, so the marker is their own copy, not the placeholder.
  ["/users", "No users match|users"],
  ["/listings", "No listings here|Listings"],
  // P5a built these three.
  ["/plans", "Plans|grandfathering"],
  ["/coupons", "Coupons|No coupons here"],
  ["/grants", "Grants|never shown to users"],
  // P5b built these two.
  ["/finance", "Finance|Reconciliation"],
  ["/payments", "Payments|Abandoned"],
  // P6 built these three.
  ["/master-data", "Master data|Locations"],
  ["/cms", "Content|Broadcasts"],
  ["/templates", "Templates|UI strings"],
  // P7 built the last nine.
  ["/settings", "Settings|Feature flags"],
  ["/tickets", "Tickets|Assigned to me"],
  ["/disputes", "Disputes|intermediary"],
  ["/staff", "Staff|Permission matrix"],
  ["/audit", "Audit log|Entity ID"],
  ["/cron", "System status|Cron jobs"],
  ["/analytics", "Analytics|Funnel"],
  ["/trash", "Trash|purge date"],
  ["/exports", "Exports|private bucket"],
];

const listing = await one(
  `select id from admin_listing_queue where status='pending_review' limit 1`,
);
if (listing) {
  SCREENS.push([
    `/queues/listings/${listing.id}?tab=pending`,
    "This is exactly what users will see",
  ]);
}

let failures = 0;
console.log(`\nadmin link sweep — ${SCREENS.length} destinations\n`);

for (const [path, marker] of SCREENS) {
  const res = await fetch(ADMIN + path, {
    headers: { cookie: cookie() },
    redirect: "manual",
  });
  const body = res.status === 200 ? await res.text() : "";
  const redirected = res.status >= 300 && res.status < 400;
  // A marker may be an alternation ("A|B") — a built screen can legitimately be
  // in its empty state or its populated one, and both are the screen.
  const ok = res.status === 200 && marker.split("|").some((m) => body.includes(m));
  if (!ok) failures++;

  const verdict = ok
    ? marker === UNBUILT
      ? "ok (placeholder, as designed)"
      : "ok"
    : redirected
      ? `REDIRECT → ${res.headers.get("location")}`
      : res.status !== 200
        ? `HTTP ${res.status}`
        : `rendered, but not the screen (no "${marker}")`;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${path.padEnd(42)} ${verdict}`);
}

/* --------------------------------------------- the internal path must NOT work */
// The rewrite target is not a URL. If it ever starts answering, a link built
// from it would "work" and the bug would come back invisible.
{
  const res = await fetch(`${ADMIN}/account/queues/listings`, {
    headers: { cookie: cookie() },
    redirect: "manual",
  });
  const body = res.status === 200 ? await res.text() : "";
  // It must NOT render the queue. (It still returns 200 with the not-found UI
  // inside the shell, which is why the marker is the signal here too.)
  const isQueue = body.includes("Listings queue");
  if (isQueue) failures++;
  console.log(
    `  ${isQueue ? "FAIL" : "ok  "} ${"/account/... (internal, must not resolve)".padEnd(42)} ${
      isQueue ? "the rewrite target answered!" : "does not render a screen"
    }`,
  );
}

console.log(`\n${failures ? `${failures} BROKEN LINK(S)` : "every admin destination resolves"}\n`);
await sql.end();
process.exit(failures ? 1 : 0);

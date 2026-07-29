import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listMine, activeBoostsFor, leadCountsFor } from "@/lib/listings/service";
import { listMyProjectCards } from "@/lib/listings/projects";
import { myListingDTO } from "@/lib/listings/dto";

/**
 * GET /api/v1/listings/mine (Doc7 §56) — the owner's manager view: every
 * status, plus the per-field notes on changes-requested and what can be
 * boosted or re-activated. Scoped to the session user in the query itself.
 *
 * It returns PROJECTS as well as listings. A builder cannot post a property
 * (migration 0067), so a listings-only query meant the one product they CAN
 * post was missing from the one screen named after it — they created a scheme,
 * opened My Listings and read "No listings yet" while the row existed.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const [rows, projects] = await Promise.all([listMine(claims.sub), listMyProjectCards(claims.sub)]);

  // The profile grid draws a PROMOTED chip per tile (designs/P9 S1). Which
  // tiles get it comes from the `boosts` table in one batched query — never
  // from anything the client could assume. Projects are boostable too (Doc2
  // §13), and their boosts are matched on the project kind.
  // The profile card also states WHERE a boost is running and how long it has
  // left, and carries the listing's lead count — both batched here for the same
  // reason the chip is: one query for the list, never one per row.
  //
  // `activeBoostsFor` answers "is it boosted" as well (it is the same `boosts`
  // query with two more columns), so `promoted` is read off the same map rather
  // than costing a second round trip per subject kind.
  const [boosts, projectBoosts, leads] = await Promise.all([
    activeBoostsFor(rows.map((r) => r.id)),
    activeBoostsFor(projects.map((p) => p.id), "project"),
    leadCountsFor(rows.map((r) => r.id)),
  ]);

  // One list, newest first, whichever table the row came from.
  const items = [
    ...rows.map((r) => ({
      ...myListingDTO(r),
      subjectKind: "listing" as const,
      promoted: boosts.has(r.id),
      boost: boosts.get(r.id) ?? null,
      leads: leads.get(r.id) ?? 0,
      sortAt: r.created_at,
    })),
    ...projects.map(({ createdAt, ...p }) => ({
      ...p,
      promoted: projectBoosts.has(p.id),
      boost: projectBoosts.get(p.id) ?? null,
      sortAt: createdAt,
    })),
  ].sort((a, b) => String(b.sortAt ?? "").localeCompare(String(a.sortAt ?? "")));

  const by = (fn: (r: (typeof items)[number]) => boolean) => items.filter(fn).length;

  return ok({
    items: items.map(({ sortAt: _sortAt, ...i }) => i),
    counts: {
      live: by((r) => r.status === "live"),
      pending: by((r) => r.status === "pending_review"),
      action: by((r) => r.status === "changes_requested" || r.status === "rejected"),
    },
    // The manager's filter chips (designs/P9 S6) each carry a count. They are
    // computed HERE, from the same rows the list is built from, so the chip and
    // the list can never disagree — and a filter the seller has nothing in
    // still shows an honest 0 rather than being hidden.
    filters: [
      { key: "all", label: "All", count: items.length },
      // Drafts have already drawn a paid slot, so they must be findable — they
      // were only reachable under "All", which is how a paid-for listing could
      // sit unfinished without the seller ever seeing it again.
      { key: "draft", label: "Draft", count: by((r) => r.status === "draft") },
      { key: "live", label: "Live", count: by((r) => r.status === "live") },
      { key: "pending_review", label: "Pending", count: by((r) => r.status === "pending_review") },
      { key: "changes_requested", label: "Changes requested", count: by((r) => r.status === "changes_requested") },
      { key: "rejected", label: "Rejected", count: by((r) => r.status === "rejected") },
      { key: "hidden", label: "Hidden", count: by((r) => r.status === "hidden") },
      { key: "sold", label: "Sold", count: by((r) => r.availability === "sold") },
      { key: "rented", label: "Rented", count: by((r) => r.availability === "rented") },
      { key: "archived", label: "Archived", count: by((r) => r.status === "archived") },
    ],
  });
}

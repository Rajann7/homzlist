import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listMine, promotedListingIds } from "@/lib/listings/service";
import { myListingDTO } from "@/lib/listings/dto";

/**
 * GET /api/v1/listings/mine (Doc7 §56) — the owner's manager view: every
 * status, plus the per-field notes on changes-requested and what can be
 * boosted or re-activated. Scoped to the session user in the query itself.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const rows = await listMine(claims.sub);
  const by = (fn: (r: (typeof rows)[number]) => boolean) => rows.filter(fn).length;

  // The profile grid draws a PROMOTED chip per tile (designs/P9 S1). Which
  // tiles get it comes from the `boosts` table in one batched query — never
  // from anything the client could assume.
  const promoted = await promotedListingIds(rows.map((r) => r.id));

  return ok({
    items: rows.map((r) => ({ ...myListingDTO(r), promoted: promoted.has(r.id) })),
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
      { key: "all", label: "All", count: rows.length },
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

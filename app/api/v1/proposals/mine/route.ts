import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { myProposals, proposalBalance } from "@/lib/listings/proposals";

/**
 * GET /api/v1/proposals/mine (Doc7 §72) — the sender's proposals with per-status
 * footers (incl. the non-refund note on declined/expired) + the pooled balance
 * for the counter strip. All computed server-side.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const [items, balance] = await Promise.all([myProposals(claims.sub), proposalBalance(claims.sub)]);
  const count = (s: string) => items.filter((i) => i.status === s).length;
  return ok({
    items,
    balance,
    filters: [
      { key: "all", label: "All", count: items.length },
      { key: "pending", label: "Pending", count: count("pending") },
      { key: "accepted", label: "Accepted", count: count("accepted") },
      { key: "declined", label: "Declined", count: count("declined") },
      { key: "expired", label: "Expired", count: count("expired") },
      { key: "fulfilled", label: "Fulfilled", count: count("fulfilled") },
    ],
  });
}

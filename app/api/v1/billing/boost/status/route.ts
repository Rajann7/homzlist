import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listBoosts, expireBoosts, getListingLabels } from "@/lib/billing/service";
import { boostDTO } from "@/lib/billing/dto";

/**
 * GET /api/v1/billing/boost/status (Doc7 §40) — active / pending / past.
 *
 * NO analytics reach the user: Doc2 §13 says the boost surface shows "active
 * till [date]" and status only. Views/clicks aren't in the DTO at all — they're
 * stripped server-side, never merely hidden in the UI (Doc9 §17).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  await expireBoosts();
  const rows = await listBoosts(claims.sub);

  // Label each boost with its listing. Scoped to the caller's own listings, so
  // a boost row can never surface someone else's title.
  const labels = await getListingLabels(claims.sub, rows.map((b) => b.listing_id));
  const items = rows.map((b) => boostDTO(b, labels[b.listing_id] ?? null));

  const active = items.filter((b) => b.status === "active");
  const pending = items.filter((b) => b.status === "pending_approval");
  const past = items.filter((b) => ["expired", "rejected", "stopped", "cancelled"].includes(b.status));

  // "Ends tomorrow" → the 1-tap renew banner (no auto-charge — Doc2 §13).
  const renewPrompt = active.find((b) => b.daysLeft !== null && b.daysLeft <= 1) ?? null;

  return ok({
    active,
    pending,
    past,
    counts: { active: active.length, pending: pending.length, past: past.length },
    renewPrompt: renewPrompt ? { boostId: renewPrompt.id, price: renewPrompt.price, durationLabel: renewPrompt.durationLabel, targetLabel: renewPrompt.targetLabel } : null,
  });
}

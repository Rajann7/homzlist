import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listBoosts, expireBoosts } from "@/lib/billing/service";
import { getBoostSubject } from "@/lib/billing/boost";
import { boostDTO } from "@/lib/billing/dto";

/**
 * GET /api/v1/billing/boost/status (Doc7 §40) — active / pending / past.
 *
 * NO analytics reach the user: Doc2 §13 says the boost surface shows "active
 * till [date]" and status only. Views/clicks aren't in the DTO at all — they're
 * stripped server-side, never merely hidden in the UI (Doc9 §17).
 *
 * Labels resolve per SUBJECT (listing / project / requirement, Doc2 §13) and are
 * always scoped to the caller, so a boost row can never surface someone else's
 * title.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  await expireBoosts();
  const rows = await listBoosts(claims.sub);

  const labels = new Map<string, { title: string; price: string }>();
  for (const b of rows) {
    const key = `${b.subject_kind ?? "listing"}:${b.listing_id}`;
    if (labels.has(key)) continue;
    const subject = await getBoostSubject(claims.sub, b.subject_kind ?? "listing", b.listing_id);
    if (subject) labels.set(key, { title: subject.title, price: subject.priceLabel });
  }

  const items = rows.map((b) => boostDTO(b, labels.get(`${b.subject_kind ?? "listing"}:${b.listing_id}`) ?? null));

  // `paused` sits with active: the boost is paid for and resuming gives back the
  // paused days, so it belongs on the Active tab with an honest "Paused" badge
  // rather than buried in Past as though it were over.
  const active = items.filter((b) => b.status === "active" || b.status === "paused");
  const pending = items.filter((b) => b.status === "pending_approval");
  const past = items.filter((b) => ["expired", "rejected", "stopped", "cancelled"].includes(b.status));

  // "Ends tomorrow" → the 1-tap renew banner (no auto-charge — Doc2 §13). A
  // paused boost is excluded: its end date moves when it resumes.
  const renewPrompt = active.find((b) => b.status === "active" && b.daysLeft !== null && b.daysLeft <= 1) ?? null;

  return ok({
    active,
    pending,
    past,
    counts: { active: active.length, pending: pending.length, past: past.length },
    renewPrompt: renewPrompt
      ? {
          boostId: renewPrompt.id,
          price: renewPrompt.price,
          durationLabel: renewPrompt.durationLabel,
          targetLabel: renewPrompt.targetLabel,
        }
      : null,
  });
}

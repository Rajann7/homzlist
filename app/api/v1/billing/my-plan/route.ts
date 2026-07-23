import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getActivePlans, getConsumptions, getSettings, expirePlans, getListingLabels,
  getNotificationPrefs,
} from "@/lib/billing/service";
import { myPlanDTO } from "@/lib/billing/dto";

/**
 * GET /api/v1/billing/my-plan (Doc7 §28) — active plans, pooled balances (FIFO),
 * usage bars, consumed-trace, grace/trial state. ALL computed server-side; the
 * client only renders. This is the endpoint the app asks "what may I do?".
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  // Roll over anything that lapsed since the last cron tick, so the dashboard
  // can never show an expired plan as active (Doc2 §4.3).
  await expirePlans(claims.sub);

  const [plans, consumptions, settings, prefs] = await Promise.all([
    getActivePlans(claims.sub),
    getConsumptions(claims.sub),
    getSettings(),
    getNotificationPrefs(claims.sub),
  ]);

  // Name the listings that consumed a slot, so the trace reads
  // "Listing #4521 — 3 BHK Flat, Mavdi" rather than a bare count (Doc2 §4.2).
  // Keyed by listing id and scoped to this user's own listings.
  const listingIds = consumptions.filter((c) => c.kind === "listing" && c.ref_id).map((c) => c.ref_id!);
  const labels = await getListingLabels(claims.sub, listingIds);
  const slotLabels: Record<string, string> = {};
  for (const [id, l] of Object.entries(labels)) slotLabels[id] = l.title;

  const dto = myPlanDTO(plans, consumptions, {
    graceHours: Number(settings.grace_hours ?? 24),
    slotLabels,
    requirementDaysLeft: null,
    expiryReminders: prefs.expiryReminders,
  });

  return ok(dto);
}

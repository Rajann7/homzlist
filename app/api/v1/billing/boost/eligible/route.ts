import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCatalog, getSettings } from "@/lib/billing/service";
import { listBoostSubjects, resolveTarget, TARGETINGS, type BoostTargeting } from "@/lib/billing/boost";
import { getProfileById } from "@/lib/profile/service";
import { flagEnabled } from "@/lib/system/flags";

/**
 * GET /api/v1/billing/boost/eligible (Doc7 §38) — the boost purchase screen's
 * data: which subjects may be boosted, the current admin rates, and the reach
 * estimates per targeting scope.
 *
 * Doc2 §13 makes listings, PROJECTS and REQUIREMENTS all boostable (the
 * requirement case is §9.2's locked-but-top), so the picker is fed by
 * `listBoostSubjects` rather than a listings-only query. Ineligible subjects are
 * returned WITH a lock label (the design shows them dimmed) but the server
 * refuses to boost them at checkout regardless — the dimming is presentation,
 * the refusal is the control.
 *
 * Target LABELS are resolved from the locations table per subject, so the
 * design's "Whole city — Rajkot" / "Whole state — Gujarat" rows carry the real
 * place names instead of the literal word "City".
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile) return fail("UNAUTHORIZED");

  // A22 Feature flags → Boost. Off = nothing is boostable (the purchase screen is
  // empty); existing boosts keep running. Default-on, so no change while enabled.
  if (!(await flagEnabled("boost", { role: profile.role, userId: claims.sub })))
    return ok({ listings: [], durations: [], targets: [], targetLabels: {} });

  const [subjects, rates, settings] = await Promise.all([
    listBoostSubjects(claims.sub),
    getCatalog(profile.role, "boost"),
    getSettings(),
  ]);

  // Resolved label per (subject, scope). The client switches cards without a
  // round-trip, and every label it can render came from the server.
  const targetLabels: Record<string, Record<string, string>> = {};
  for (const s of subjects) {
    if (!s.eligible) continue;
    const resolved = await Promise.all(TARGETINGS.map((t) => resolveTarget(s, t as BoostTargeting)));
    targetLabels[`${s.kind}:${s.id}`] = Object.fromEntries(resolved.map((r) => [r.targeting, r.label]));
  }

  return ok({
    listings: subjects.map((s) => ({
      id: s.id,
      subjectKind: s.kind,
      title: s.title,
      areaLabel: s.areaLabel,
      price: s.priceLabel,
      coverUrl: s.coverUrl,
      eligible: s.eligible,
      lockLabel: s.lockLabel,
    })),
    durations: rates.map((r) => ({
      code: r.code,
      label: (r.period_days ?? 7) >= 30 ? "1 Month" : `${r.period_days} Days`,
      price: `₹${(r.price_paise / 100).toLocaleString("en-IN")}`,
      pricePaise: r.price_paise,
      perDay: `≈ ₹${Math.round(r.price_paise / 100 / (r.period_days ?? 7))}/day`,
      bestValue: (r.period_days ?? 7) >= 30,
    })),
    // City / state / all-India. Area-only targeting is no longer sold, and the
    // per-scope "reach" estimate is no longer sent: it came from an admin-typed
    // settings blob, not from a count of anything, so it read as a promise the
    // product could not keep.
    targets: TARGETINGS.map((key) => ({ key })),
    targetLabels,
  });
}

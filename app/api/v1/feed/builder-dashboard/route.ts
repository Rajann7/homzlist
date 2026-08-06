import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { builderDashboard, PROJECT_STATE_LABEL } from "@/lib/feed/service";

/**
 * GET /api/v1/feed/builder-dashboard (Doc7 §80) — builder role ONLY: own project
 * stats + matched requirements, never any foreign listing. The role gate is
 * server-side; a non-builder gets 403.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");
  if (profile.role !== "builder") return fail("FORBIDDEN");

  const { projects, matched } = await builderDashboard(claims.sub);
  return ok({
    projects: projects.map((p) => ({
      id: p.id, name: p.name, coverUrl: p.coverUrl,
      // The state leads the existing stat line when the project isn't live yet —
      // no new element on the card, but the builder can finally see that their
      // project exists and is waiting on review.
      statLine: [
        PROJECT_STATE_LABEL[p.status] ?? null,
        p.unitsAvailable != null && p.unitsTotal != null ? `${p.unitsAvailable}/${p.unitsTotal} units` : null,
        `${p.leads} lead${p.leads === 1 ? "" : "s"}`,
      ].filter(Boolean).join(" · "),
      buildStatus: p.buildStatus,
    })),
    // Already access-stripped by the matching engine: a builder without an
    // active requirement-access plan receives preview fields only — no budget,
    // no poster — exactly like a locked browse card (Doc9 §17). It used to send
    // the full requirement to every builder.
    matched,
  });
}

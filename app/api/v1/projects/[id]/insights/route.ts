import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProject, ownerProjectLeadCount } from "@/lib/listings/projects";
import { cheapestBoostPaise, isPromoted } from "@/lib/listings/service";
import { formatShortRupees } from "@/lib/billing/money";

/**
 * GET /api/v1/projects/:id/insights — the builder's own view of one project.
 *
 * BUILDER-ONLY, and the check is ownership of the row. A project that exists
 * but isn't the caller's answers 404 exactly like one that doesn't exist, so
 * the endpoint can't be used to test whether an id is real (Doc9 §API1).
 *
 * ONE metric: leads (migration 0051). Views and shares were briefly built here
 * and removed — a builder's question is who wants the project, not how many
 * people scrolled past it.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const project = (await getProject(params.id, claims.sub)) as Record<string, any> | null;
  if (!project || !project.isOwner) return fail("NOT_FOUND");

  const [leads, promoted, boostFromPaise] = await Promise.all([
    ownerProjectLeadCount(params.id),
    // `boosts.listing_id` carries the subject id whatever its kind, so a
    // project boost is found by exactly the same query a listing one is.
    isPromoted(params.id),
    cheapestBoostPaise(),
  ]);

  return ok({
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      badge: project.badge,
      coverUrl: project.coverUrl,
      areaLabel: project.areaLabel,
      priceFrom: project.priceFrom,
      buildStatusLabel: project.buildStatusLabel,
      possessionLabel: project.possessionLabel,
      totalUnits: project.totalUnits,
      availableUnits: project.availableUnits,
      promoted,
      // A project is boostable on the same terms as a listing: live only.
      canBoost: project.status === "live" && !promoted,
      leads,
      boostFrom: boostFromPaise === null ? null : formatShortRupees(boostFromPaise),
    },
  });
}

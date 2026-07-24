import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { builderDashboard } from "@/lib/feed/service";
import { requirementDTO } from "@/lib/listings/dto";

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
      statLine: [
        p.unitsAvailable != null && p.unitsTotal != null ? `${p.unitsAvailable}/${p.unitsTotal} units` : null,
        `${p.leads} lead${p.leads === 1 ? "" : "s"}`,
      ].filter(Boolean).join(" · "),
      buildStatus: p.buildStatus,
    })),
    matched: matched.map((m) => ({ requirement: requirementDTO(m.requirement), matchedTo: m.matchedTo, tierLabel: m.tierLabel })),
  });
}

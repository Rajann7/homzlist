import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { purgeProject } from "@/lib/listings/projects";

/**
 * POST /api/v1/projects/:id/purge — "Delete now" on the trash screen
 * (designs/P10 S4), the project mirror of the listing purge. Permanently
 * removes a project that is ALREADY in trash; the 30-day cron does the same
 * thing on its own schedule.
 *
 * A project that is not in trash, or not yours, is NOT_FOUND rather than 403.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  // Irreversible — capped well below anything that could be used to walk ids.
  const limited = await rateLimit(`project-purge:${claims.sub}`, 30, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const purged = await purgeProject(params.id, claims.sub);
  if (!purged) return fail("NOT_FOUND");
  return ok({ purged: true });
}

import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { purgeListing } from "@/lib/listings/service";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/listings/:id/purge — "Delete now" on the trash screen
 * (designs/P10 S4). Permanently removes a listing that is ALREADY in trash;
 * the 30-day cron does the same thing on its own schedule.
 *
 * A listing that is not in trash, or not yours, is NOT FOUND rather than 403 —
 * answering "wrong owner" would confirm the id is real (Doc9 §API1).
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
 const params = await props.params;
 const claims = await getCurrentUser();
 if (!claims) return fail("UNAUTHORIZED");
 if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

 // Irreversible — cap it well below anything that could be used to walk ids.
 const limited = await rateLimit(`listing-purge:${claims.sub}`, 30, 3600);
 if (!limited.allowed) return fail("RATE_LIMITED");

 const purged = await purgeListing(params.id, claims.sub);
 if (!purged) return fail("NOT_FOUND");
 return ok({ purged: true });
}

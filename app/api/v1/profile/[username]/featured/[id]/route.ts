import { ok, fail } from "@/lib/api";
import { getProfileByUsername } from "@/lib/profile/service";
import { getCollection } from "@/lib/profile/featured";
import { featuredItemDTO } from "@/lib/listings/dto";

/**
 * GET /api/v1/profile/:username/featured/:id — what a VISITOR sees inside one
 * featured circle. Guest-readable, live+available listings only.
 *
 * The collection is looked up scoped to that username's profile, so an id that
 * belongs to somebody else is a 404 rather than a way to read another profile's
 * shelf through this URL.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
 _req: Request,
 props: { params: Promise<{ username: string; id: string }> }
) {
 const params = await props.params;
 if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

 const profile = await getProfileByUsername(params.username);
 if (!profile || !profile.is_registered) return fail("NOT_FOUND");
 if (profile.state === "deleted" || profile.state === "suspended") return fail("NOT_FOUND");

 const collection = await getCollection(profile.id, params.id);
 if (!collection) return fail("NOT_FOUND");

 return ok({ id: collection.id, name: collection.name, items: collection.listings.map(featuredItemDTO) });
}

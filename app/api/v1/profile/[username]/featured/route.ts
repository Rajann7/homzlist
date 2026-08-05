import { ok, fail } from "@/lib/api";
import { getProfileByUsername } from "@/lib/profile/service";
import { listCollections } from "@/lib/profile/featured";

/**
 * GET /api/v1/profile/:username/featured — the featured circles a VISITOR sees
 * on someone's profile (P9 S2 draws this row). Guest-readable.
 *
 * Safe to expose because `listCollections` counts and covers only live+available
 * listings: a visitor is never told about unpublished stock, exactly like
 * `getPublicProfileCounts`. A suspended or deleted profile shows nothing at all
 * — the same rule `publicProfileDTO` applies to the rest of the screen.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_req: Request, props: { params: Promise<{ username: string }> }) {
 const params = await props.params;
 const profile = await getProfileByUsername(params.username);
 if (!profile || !profile.is_registered) return fail("NOT_FOUND");
 if (profile.state === "deleted" || profile.state === "suspended") return ok({ items: [] });

 const items = await listCollections(profile.id);
 // A visitor has no reason to see an empty shelf: only collections with
 // something live in them are drawn.
 return ok({ items: items.filter((c) => c.count > 0) });
}

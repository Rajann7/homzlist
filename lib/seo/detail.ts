import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getListingForViewer } from "@/lib/listings/service";
import { getProject } from "@/lib/listings/projects";
import { getRequirementForViewer } from "@/lib/listings/requirements";
import { getProfileByUsername } from "@/lib/profile/service";

/**
 * The GUEST view of a detail record, fetched once per request.
 *
 * Every public detail route needs the same record twice — once in
 * `generateMetadata` and once in the page — and the two must never disagree
 * about whether it exists or what it is called. `cache()` makes the second call
 * free and makes disagreement impossible: it is literally the same promise.
 *
 * The viewer is always `null` because middleware strips the session on the
 * public host, so these ask exactly the question a crawler and a logged-out
 * human ask. That is also what makes them the right 404 gate: the state-access
 * matrix (Doc2 §5.4) already returns null for draft / pending / rejected /
 * hidden / archived / deleted, so a route that calls `notFound()` on null
 * inherits the matrix instead of re-implementing it.
 *
 * These wrap the SAME functions the API routes use. There is no second query
 * here that could drift from the one the page's own fetch will run.
 */

export const guestListing = cache((id: string) => getListingForViewer(id, null));
export const guestProject = cache((id: string) => getProject(id, null));
export const guestRequirement = cache((id: string) => getRequirementForViewer(id, null));
export const guestProfile = cache((handle: string) => getProfileByUsername(handle));

/** `listings.city_id` → `locations`, not `cities` (that one is the launch config). */
export const locationName = cache(async (id: string | null): Promise<string | null> => {
  if (!id) return null;
  const { data } = await createServiceClient()
    .from("locations")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  return (data as { name: string } | null)?.name ?? null;
});

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ₹ in the same short form the cards use — metadata must not invent a format. */
export function priceLabel(paise: number | null, onRequest: boolean): string {
  if (onRequest || paise == null) return "Price on request";
  const r = Math.round(paise / 100);
  if (r >= 10_000_000) return `₹${(r / 10_000_000).toFixed(r % 10_000_000 === 0 ? 0 : 2)} Cr`;
  if (r >= 100_000) return `₹${(r / 100_000).toFixed(r % 100_000 === 0 ? 0 : 2)} L`;
  return `₹${r.toLocaleString("en-IN")}`;
}

/**
 * Meta descriptions are truncated by the engine at ~160 chars; doing it here
 * means we choose where the cut lands rather than letting it fall mid-word.
 */
export function clamp(text: string | null | undefined, max = 160): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/[\s,;.]+\S*$/, "")}…`;
}

/** The metadata every non-indexable detail surface shares. */
export const NOT_FOUND_META = {
  title: "Not found",
  robots: { index: false, follow: false },
} as const;

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { formatShortRupees } from "@/lib/billing/money";
import { placementsFor, outOfCityIds, stateIdOfCity } from "@/lib/billing/placement";

/**
 * Stories (Doc7 §84-86, Doc2 §9.3) — AUTO-GENERATED ONLY.
 *
 * Source: every approved listing/project that went live in the last 24h in the
 * viewer's city. One poster/day = ONE circle with multiple segments. Order:
 * boosted first → recency (cascade order). NO cap. NO add-story anywhere — the
 * client never renders a "your story" circle and there is no create path.
 *
 * Seen-state is stored PER CITY (`story_seen`) so a ring greys only in the city
 * it was seen in. Media is served through `storySegment` so a later hardening
 * can swap public URLs for signed 24h URLs (tracked in PENDING — listing photos
 * currently live in the public bucket).
 */

const db = () => createServiceClient();

/** Stand-in id for "match nothing", so a guest's `neq` filter stays valid SQL. */
const NIL = "00000000-0000-0000-0000-000000000000";

export type Ring = "unseen" | "seen" | "project" | "boosted";

export interface StorySegment {
  id: string;                // listing/project id
  kind: "property" | "project";
  cover: string | null;
  price: string;
  meta: string;
  areaLabel: string | null;
  available: boolean;        // false → "no longer available" state
}

export interface StoryCircle {
  posterId: string;
  posterName: string;
  posterAvatar: string | null;
  verified: boolean;
  ring: Ring;
  boosted: boolean;
  isProject: boolean;
  segments: StorySegment[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function viewerCity(viewerId: string | null): Promise<string | null> {
  if (!viewerId) return null;
  const { data } = await db().from("profiles").select("city_id").eq("id", viewerId).maybeSingle();
  return (data as { city_id: string | null } | null)?.city_id ?? null;
}

/** Build the story row for a viewer. */
export async function getStories(viewerId: string | null, cityOverride?: string | null): Promise<StoryCircle[]> {
  const cityId = cityOverride ?? (await viewerCity(viewerId));
  const since = new Date(Date.now() - DAY_MS).toISOString();

  // Approved-in-last-24h listings + projects in the city.
  let lq = db()
    .from("listings")
    .select("id,profile_id,cover_url,price_paise,price_on_request,area_label,area_id,attributes,area_sqft,live_at")
    .eq("status", "live").eq("availability", "available")
    .gte("live_at", since)
    .order("live_at", { ascending: false });
  if (cityId) lq = lq.eq("city_id", cityId);
  if (viewerId) lq = lq.neq("profile_id", viewerId); // never a "your story" circle (Doc2 §9.3)

  let pq = db()
    .from("projects")
    .select("id,profile_id,cover_url,name,area_label,area_id,live_at")
    .eq("status", "live")
    .gte("live_at", since)
    .order("live_at", { ascending: false });
  if (cityId) pq = pq.eq("city_id", cityId);
  if (viewerId) pq = pq.neq("profile_id", viewerId);

  const [{ data: lRows }, { data: pRows }] = await Promise.all([lq, pq]);
  let listings = (lRows ?? []) as any[];
  let projects = (pRows ?? []) as any[];

  // Which boosts target THIS viewer (Doc2 §13). Placement used to be a bare
  // `status = 'active'` read, so an area-targeted boost in another city put a
  // gold ring at the front of everyone's row.
  const placements = await placementsFor(
    { cityId, stateId: cityId ? await stateIdOfCity(cityId) : null },
    ["listing", "project"],
  );
  const boostedIds = placements.rank;

  // Doc2 §13 promises "story-row first" for the areas targeted, and a state or
  // All-India boost targets viewers outside the subject's own city — which the
  // city-scoped queries above filter out. Fetch those explicitly (still inside
  // the 24h story window, still live, still not the viewer's own).
  const missingListing = outOfCityIds(placements, "listing").filter((id) => !listings.some((l) => l.id === id));
  const missingProject = outOfCityIds(placements, "project").filter((id) => !projects.some((p) => p.id === id));
  if (missingListing.length || missingProject.length) {
    const [extraL, extraP] = await Promise.all([
      missingListing.length
        ? db().from("listings")
            .select("id,profile_id,cover_url,price_paise,price_on_request,area_label,area_id,attributes,area_sqft,live_at")
            .in("id", missingListing).eq("status", "live").eq("availability", "available").gte("live_at", since)
            .neq("profile_id", viewerId ?? NIL)
        : Promise.resolve({ data: [] }),
      missingProject.length
        ? db().from("projects")
            .select("id,profile_id,cover_url,name,area_label,area_id,live_at")
            .in("id", missingProject).eq("status", "live").gte("live_at", since)
            .neq("profile_id", viewerId ?? NIL)
        : Promise.resolve({ data: [] }),
    ]);
    listings = [...((extraL.data ?? []) as any[]), ...listings];
    projects = [...((extraP.data ?? []) as any[]), ...projects];
  }

  const posterIds = [...new Set([...listings, ...projects].map((r) => r.profile_id))];
  if (!posterIds.length) return [];

  const [{ data: profs }, { data: vers }, seen] = await Promise.all([
    db().from("profiles").select("id,name,photo_url,role").in("id", posterIds),
    db().from("verifications").select("profile_id").eq("level", "phone").eq("status", "approved").in("profile_id", posterIds),
    seenSet(viewerId, cityId),
  ]);
  const profMap = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
  const verifiedSet = new Set(((vers ?? []) as { profile_id: string }[]).map((v) => v.profile_id));

  // Group by poster: one circle per poster, segments = their items (boosted first).
  const byPoster = new Map<string, { segments: StorySegment[]; boosted: boolean; isProject: boolean }>();
  const order: string[] = [];

  const pushSeg = (posterId: string, seg: StorySegment, boosted: boolean, isProject: boolean) => {
    if (!byPoster.has(posterId)) { byPoster.set(posterId, { segments: [], boosted: false, isProject: false }); order.push(posterId); }
    const c = byPoster.get(posterId)!;
    c.segments.push(seg);
    c.boosted = c.boosted || boosted;
    c.isProject = c.isProject || isProject;
  };

  for (const l of listings) {
    const bhk = l.attributes?.bhk;
    const perSqft = l.price_paise && l.area_sqft ? Math.round((l.price_paise / 100) / l.area_sqft) : null;
    pushSeg(l.profile_id, {
      id: l.id, kind: "property", cover: l.cover_url,
      price: l.price_on_request ? "Price on request" : formatShortRupees(l.price_paise),
      meta: [bhk ? `${bhk} BHK` : null, l.area_sqft ? `${l.area_sqft.toLocaleString("en-IN")} sqft` : null, l.area_label].filter(Boolean).join(" · "),
      areaLabel: l.area_label, available: true,
    }, boostedIds.has(l.id), false);
  }
  for (const p of projects) {
    pushSeg(p.profile_id, {
      id: p.id, kind: "project", cover: p.cover_url, price: p.name,
      // Projects are boostable too (Doc2 §13) — this was hard-coded `false`.
      meta: p.area_label ?? "", areaLabel: p.area_label, available: true,
    }, boostedIds.has(p.id), true);
  }

  // Boosted posters first, then insertion (recency) order.
  const circles: (StoryCircle & { boostRank: number })[] = order.map((posterId) => {
    const g = byPoster.get(posterId)!;
    const prof = profMap.get(posterId) ?? {};
    const allSeen = g.segments.every((s) => seen.has(s.id));
    const ring: Ring = g.boosted ? "boosted" : allSeen ? "seen" : g.isProject ? "project" : "unseen";
    // Doc2 §9.3: "boosted-seen → normal position (no re-first)". Once the viewer
    // has watched a boosted circle it stops jumping the queue on every refresh —
    // otherwise the same gold ring sat at slot 0 all day, which is what made the
    // row feel stale rather than promoted.
    const jumpsQueue = g.boosted && !allSeen;
    return {
      posterId, posterName: prof.name ?? "HomzList user", posterAvatar: prof.photo_url ?? null,
      verified: verifiedSet.has(posterId), ring, boosted: g.boosted, isProject: g.isProject, segments: g.segments,
      // FIFO among boosted circles, mirroring the feed's tie-break.
      boostRank: jumpsQueue ? Math.min(...g.segments.map((s) => boostedIds.get(s.id) ?? Number.MAX_SAFE_INTEGER)) : Number.MAX_SAFE_INTEGER,
    };
  });
  circles.sort((a, b) => a.boostRank - b.boostRank);
  return circles.map(({ boostRank: _boostRank, ...c }) => c);
}

async function seenSet(viewerId: string | null, cityId: string | null): Promise<Set<string>> {
  if (!viewerId || !cityId) return new Set();
  const { data } = await db().from("story_seen").select("segment_id").eq("profile_id", viewerId).eq("city_id", cityId);
  return new Set(((data ?? []) as { segment_id: string }[]).map((s) => s.segment_id));
}

/** Mark a segment seen for this (viewer, city). No view-count is ever exposed. */
export async function markSeen(viewerId: string, cityId: string, segmentId: string): Promise<void> {
  await db().from("story_seen").upsert(
    { profile_id: viewerId, city_id: cityId, segment_id: segmentId },
    { onConflict: "profile_id,city_id,segment_id" },
  );
}

/**
 * One segment's media + overlay data (Doc7 §86). Mid-24h the listing may have
 * sold/hidden → `available:false` drives the viewer's "no longer available"
 * state. The cover is the (currently public) photo URL; a private story bucket
 * with signed 24h URLs is a later hardening (PENDING).
 */
export async function storySegment(segmentId: string): Promise<StorySegment | null> {
  const { data: l } = await db()
    .from("listings")
    .select("id,cover_url,price_paise,price_on_request,area_label,attributes,area_sqft,status,availability,live_at")
    .eq("id", segmentId).maybeSingle();
  if (l) {
    const row = l as any;
    // GATE (Doc9 IDOR + Doc2 §9.3): a segment is only exposed if the listing was
    // GENUINELY a story — approved and live within the last 24h. A draft/rejected
    // listing (live_at null / not fresh) was never a story → 404, so its
    // price/cover/area never leak. A listing that went sold/hidden mid-window
    // still has a fresh live_at → `available:false` drives "no longer available".
    const fresh = row.live_at && Date.now() - new Date(row.live_at).getTime() < DAY_MS;
    if (!fresh) return null;
    const available = row.status === "live" && row.availability === "available";
    const bhk = row.attributes?.bhk;
    return {
      id: row.id, kind: "property", cover: row.cover_url,
      price: row.price_on_request ? "Price on request" : formatShortRupees(row.price_paise),
      meta: [bhk ? `${bhk} BHK` : null, row.area_sqft ? `${row.area_sqft.toLocaleString("en-IN")} sqft` : null, row.area_label].filter(Boolean).join(" · "),
      areaLabel: row.area_label, available,
    };
  }
  const { data: p } = await db().from("projects").select("id,cover_url,name,area_label,status,live_at").eq("id", segmentId).maybeSingle();
  if (p) {
    const row = p as any;
    const fresh = row.live_at && Date.now() - new Date(row.live_at).getTime() < DAY_MS;
    if (!fresh) return null; // never a story → 404 (no leak)
    return { id: row.id, kind: "project", cover: row.cover_url, price: row.name, meta: row.area_label ?? "", areaLabel: row.area_label, available: row.status === "live" };
  }
  return null;
}

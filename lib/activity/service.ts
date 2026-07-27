import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { formatShortRupees } from "@/lib/billing/money";
import { myProposals } from "@/lib/listings/proposals";
import { myVisits } from "@/lib/listings/visits";

/**
 * P10 S2 — Your activity (Doc4 §58). A read-only aggregation over what the user
 * has already done, every number a real query: recently-viewed listings (from
 * `listing_views`, viewer side), the Saved/Proposals/Visits/Saved-searches
 * counts, and the last few inquiries sent. Nothing here is invented — a section
 * with no rows returns an empty list, not a placeholder count.
 */

const db = () => createServiceClient();

export interface RecentTile {
  listingId: string;
  coverUrl: string | null;
  price: string;
  title: string | null;
  viewedOn: string; // IST date (YYYY-MM-DD)
}

export interface InquiryItem {
  id: string;
  listingId: string;
  coverUrl: string | null;
  title: string | null;
  status: "sent" | "accepted" | "declined";
  createdAt: string;
}

export interface ActivityView {
  recentlyViewed: RecentTile[];
  inquiries: InquiryItem[];
  counts: { saved: number; inquiries: number; proposals: number; visits: number; savedSearches: number };
}

export async function getActivity(profileId: string): Promise<ActivityView> {
  const [viewsRes, inqRes, savedRes, searchRes, proposals, visits, inqCount] = await Promise.all([
    db()
      .from("listing_views")
      .select("listing_id,viewed_on,created_at,listings(id,cover_url,price_paise,price_on_request,title)")
      .eq("viewer_key", profileId)
      .order("created_at", { ascending: false })
      .limit(30),
    db()
      .from("inquiries")
      .select("id,listing_id,status,created_at,listings(cover_url,title)")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(6),
    db().from("saves").select("id", { count: "exact", head: true }).eq("profile_id", profileId),
    db().from("saved_searches").select("id", { count: "exact", head: true }).eq("profile_id", profileId),
    myProposals(profileId),
    myVisits(profileId),
    db().from("inquiries").select("id", { count: "exact", head: true }).eq("profile_id", profileId),
  ]);

  // Recently viewed — dedupe by listing (keep the most recent view), cap at 10.
  const seen = new Set<string>();
  const recentlyViewed: RecentTile[] = [];
  for (const v of (viewsRes.data ?? []) as any[]) {
    const l = v.listings;
    if (!l || seen.has(v.listing_id)) continue;
    seen.add(v.listing_id);
    recentlyViewed.push({
      listingId: v.listing_id,
      coverUrl: l.cover_url,
      price: l.price_on_request || l.price_paise === null ? "Price on request" : formatShortRupees(l.price_paise),
      title: l.title,
      viewedOn: v.viewed_on,
    });
    if (recentlyViewed.length >= 10) break;
  }

  const inquiries: InquiryItem[] = ((inqRes.data ?? []) as any[]).map((q) => ({
    id: q.id,
    listingId: q.listing_id,
    coverUrl: q.listings?.cover_url ?? null,
    title: q.listings?.title ?? null,
    status: q.status,
    createdAt: q.created_at,
  }));

  return {
    recentlyViewed,
    inquiries,
    counts: {
      saved: savedRes.count ?? 0,
      inquiries: inqCount.count ?? 0,
      proposals: proposals.length,
      visits: visits.length,
      savedSearches: searchRes.count ?? 0,
    },
  };
}

/** Clear the user's recently-viewed history (their own `listing_views` rows). */
export async function clearRecentlyViewed(profileId: string): Promise<{ cleared: number }> {
  const { count } = await db()
    .from("listing_views")
    .delete({ count: "exact" })
    .eq("viewer_key", profileId);
  return { cleared: count ?? 0 };
}

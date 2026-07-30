import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The "Looking in Mavdi?" block at the foot of a blog post (P12 S4).
 *
 * The area comes from the post's own tags matched against the launched locations,
 * and the three cards are real LIVE listings in that area with their real prices
 * — never a decorative row of placeholders. If the post names no area we know, or
 * the area has nothing live, the block is omitted rather than rendered empty.
 */
export interface AreaBlock {
  areaName: string;
  areaSlug: string;
  /** The area page's canonical path is `/area/<area>-<city>` (lib/seo/slugs). */
  citySlug: string;
  listings: Array<{ id: string; priceLabel: string; subtitle: string; coverUrl: string | null }>;
}

/** ₹52 Lakh · ₹1.2 Cr · ₹18,000/mo — Doc1's Indian money formatting. */
function priceLabel(paise: number | null, kind: string, onRequest: boolean): string {
  if (onRequest || paise == null) return "Price on request";
  const rupees = Math.round(paise / 100);
  if (kind === "rent") return `₹${rupees.toLocaleString("en-IN")}/mo`;
  if (rupees >= 10_000_000) {
    const cr = rupees / 10_000_000;
    return `₹${cr % 1 === 0 ? cr : cr.toFixed(2).replace(/0$/, "")} Cr`;
  }
  if (rupees >= 100_000) {
    const l = rupees / 100_000;
    return `₹${l % 1 === 0 ? l : l.toFixed(1)} Lakh`;
  }
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export async function getAreaBlock(tags: string[]): Promise<AreaBlock | null> {
  if (!tags.length) return null;
  const db = createServiceClient();

  const slugs = tags.map((t) => t.toLowerCase().replace(/\s+/g, "-"));
  const { data: areas } = await db
    .from("locations")
    .select("id, name, slug, parent_id")
    .eq("level", "area")
    .eq("is_active", true)
    .eq("is_launched", true)
    .in("slug", slugs)
    .limit(1);
  const area = areas?.[0];
  if (!area) return null;

  const { data: listings } = await db
    .from("listings")
    .select("id, kind, price_paise, price_on_request, attributes, type_code, cover_url, area_label")
    .eq("status", "live")
    .eq("area_id", area.id)
    .order("live_at", { ascending: false })
    .limit(3);
  if (!listings?.length) return null;

  const { data: city } = await db
    .from("locations").select("slug").eq("id", area.parent_id as string).maybeSingle();

  return {
    areaName: area.name as string,
    areaSlug: area.slug as string,
    citySlug: (city?.slug as string) ?? "rajkot",
    listings: listings.map((l: Record<string, unknown>) => {
      const attrs = (l.attributes as Record<string, unknown>) ?? {};
      const bhk = attrs.bhk ?? attrs.bedrooms;
      return {
        id: l.id as string,
        priceLabel: priceLabel(
          l.price_paise as number | null,
          l.kind as string,
          Boolean(l.price_on_request),
        ),
        subtitle: [bhk ? `${bhk} BHK` : null, (l.area_label as string) ?? area.name].filter(Boolean).join(" · "),
        coverUrl: (l.cover_url as string) ?? null,
      };
    }),
  };
}

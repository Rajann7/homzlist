import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingDetail } from "@/components/listings/ListingDetail";
import { jsonLd, realEstateListingSchema, siteUrl } from "@/lib/seo/schema";
import {
  NOT_FOUND_META,
  UUID_RE,
  clamp,
  guestListing,
  locationName,
  priceLabel,
} from "@/lib/seo/detail";

/**
 * P4 — public property detail (homzlist.com/property/:id).
 * Guests may view LIVE listings; anything else 404s via the server's
 * state-access matrix (Doc2 §5.4).
 *
 * That sentence was the INTENT and not the behaviour: the page rendered a
 * client component for every id, so the server answered 200 to a pending
 * listing, a deleted one and a random UUID alike, and the only thing that ever
 * 404'd was the browser after its own fetch. Meanwhile `sitemap-listings.xml`
 * publishes each approved listing to Google, pointing at a page whose server
 * HTML carried the homepage's title, no description, no canonical and no OG
 * image — so every listing shared one title and no share preview had a picture.
 *
 * Resolving the record here fixes both halves at once, and the gate is the
 * matrix itself (`guestListing` = the same `getListingForViewer(id, null)` the
 * API uses), not a second copy of the rules.
 */
export const dynamic = "force-dynamic";
// Supabase reads on an SSR surface land in Next's persistent DATA cache, which
// outlives a restart. On a page whose whole job is to reflect "this listing is
// live now", that means an approved listing can stay invisible indefinitely.
// Same opt-out the area page already carries.
export const fetchCache = "force-no-store";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return NOT_FOUND_META;

  const l = await guestListing(id);
  if (!l) return NOT_FOUND_META;

  const city = await locationName(l.city_id);
  const where = [l.area_label, city].filter(Boolean).join(", ");
  const price = priceLabel(l.price_paise, Boolean(l.price_on_request));
  // A live listing always has a title, but the column is nullable — a metadata
  // builder must never be the thing that throws on a half-filled row.
  const name = l.title ?? "Property";
  // The title the seller wrote already reads "3 BHK Bungalow for Rent, Mochi
  // Bazar" — adding the price and city is what makes it distinct in a SERP.
  const title = clamp([name, price, city].filter(Boolean).join(" · "), 60);
  const description = clamp(
    l.description || `${name}${where ? ` in ${where}` : ""} — ${price} on HomzList.`,
  );
  const url = `${siteUrl()}/property/${id}`;
  const image = l.cover_url
    ? [{ url: l.cover_url, width: 1200, height: 630 }]
    : [{
        url: `${siteUrl()}/api/og?title=${encodeURIComponent(name)}&subtitle=${encodeURIComponent(where || "HomzList")}`,
        width: 1200,
        height: 630,
      }];

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    // A sold or unavailable listing stays readable but must not be indexed as
    // if it were on the market.
    robots:
      l.availability === "available"
        ? { index: true, follow: true }
        : { index: false, follow: true },
    openGraph: { title, description, url, type: "website", siteName: "HomzList", images: image },
    twitter: { card: "summary_large_image", title, description, images: image.map((i) => i.url) },
  };
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  // A malformed id is not a lookup — answer before touching the database.
  if (!UUID_RE.test(id)) notFound();

  // The public host is the guest surface — middleware strips any session before
  // this renders, so every viewer here is a guest. Actions gate to login.
  // `cache()` means this is the same promise generateMetadata already awaited:
  // one query, and the two can never disagree about whether it exists.
  const l = await guestListing(id);
  if (!l) notFound();

  const city = await locationName(l.city_id);
  const attrs = (l.attributes ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof attrs[k] === "string" ? (attrs[k] as string) : null);

  return (
    <>
      {/* Structured data — `realEstateListingSchema` has existed since the SEO
          module landed and had no caller anywhere in the repo, so no listing
          has ever carried it. Escaped by `jsonLd`, which is what keeps a
          seller-controlled title from closing the script block. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            realEstateListingSchema({
              id: l.id,
              title: l.title ?? "Property",
              description: l.description,
              pricePaise: l.price_paise,
              priceOnRequest: Boolean(l.price_on_request),
              kind: l.kind === "rent" ? "rent" : "sell",
              areaLabel: l.area_label,
              cityName: city,
              areaSqft: l.area_sqft ?? null,
              bhk: str("bhk"),
              bathrooms: str("bathrooms"),
              photos: l.cover_url ? [l.cover_url] : [],
              liveAt: l.live_at,
              availability: l.availability,
            }),
          ),
        }}
      />
      <ListingDetail id={id} isGuest />
    </>
  );
}

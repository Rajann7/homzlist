import "server-only";
import type { FeedCard } from "@/lib/feed/service";
import type { Faq } from "./content";

/**
 * JSON-LD (Doc3 §4): BreadcrumbList · ItemList (landings) · RealEstateListing
 * + priceValidUntil (listings) · FAQPage.
 *
 * Discipline: schema must describe what is VISIBLE on the page. Google treats
 * structured data that contradicts the rendered content as spam, so every
 * builder here takes the same objects the page renders — never a second query
 * with different filters.
 */

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://homzlist.com";
}

const abs = (path: string) => (path.startsWith("http") ? path : `${siteUrl()}${path}`);

export function breadcrumbSchema(items: { label: string; href: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: b.label,
      item: abs(b.href),
    })),
  };
}

export function faqSchema(faqs: Faq[]) {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

/**
 * ItemList for a landing page. Uses `url` per item rather than inlining a full
 * RealEstateListing for each — the listing's own page carries that, and
 * duplicating it here (with a price the card only shows abbreviated) is how
 * price mismatches get flagged.
 */
export function itemListSchema(name: string, cards: FeedCard[]) {
  if (!cards.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: cards.length,
    itemListElement: cards.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: abs(`/${c.kind === "project" ? "project" : "property"}/${c.id}`),
      name: c.title ?? c.price ?? name,
    })),
  };
}

export interface ListingSchemaInput {
  id: string;
  title: string;
  description: string | null;
  pricePaise: number | null;
  priceOnRequest: boolean;
  kind: "sell" | "rent";
  areaLabel: string | null;
  cityName: string | null;
  areaSqft: number | null;
  bhk: string | null;
  bathrooms: string | null;
  photos: string[];
  liveAt: string | null;
  /** Doc3 §4: auto-updated on sold — null once unavailable. */
  availability: string;
}

export function realEstateListingSchema(l: ListingSchemaInput) {
  const price = l.priceOnRequest || l.pricePaise == null ? null : Math.round(l.pricePaise / 100);

  // priceValidUntil: 90 days out while available. A SOLD listing gets no offer
  // block at all rather than a stale one — which is what "auto-updated on sold"
  // has to mean in practice.
  const available = l.availability === "available";
  const validUntil = available
    ? new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)
    : null;

  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": abs(`/property/${l.id}`),
    url: abs(`/property/${l.id}`),
    name: l.title,
    ...(l.description ? { description: l.description.slice(0, 500) } : {}),
    ...(l.photos.length ? { image: l.photos.slice(0, 6) } : {}),
    ...(l.liveAt ? { datePosted: l.liveAt } : {}),
    address: {
      "@type": "PostalAddress",
      ...(l.areaLabel ? { streetAddress: l.areaLabel } : {}),
      ...(l.cityName ? { addressLocality: l.cityName } : {}),
      addressCountry: "IN",
    },
    ...(l.areaSqft
      ? { floorSize: { "@type": "QuantitativeValue", value: l.areaSqft, unitCode: "FTK" } }
      : {}),
    ...(l.bhk ? { numberOfRooms: Number(l.bhk) || undefined } : {}),
    ...(l.bathrooms ? { numberOfBathroomsTotal: Number(l.bathrooms) || undefined } : {}),
    ...(price != null && available
      ? {
          offers: {
            "@type": "Offer",
            price,
            priceCurrency: "INR",
            availability: "https://schema.org/InStock",
            ...(validUntil ? { priceValidUntil: validUntil } : {}),
            ...(l.kind === "rent" ? { businessFunction: "http://purl.org/goodrelations/v1#LeaseOut" } : {}),
          },
        }
      : {}),
  };
}

/**
 * Render one or more JSON-LD blobs into a single `<script>` payload.
 *
 * The escaping here is load-bearing, not cosmetic. `JSON.stringify` does NOT
 * escape HTML-significant characters, so a listing title containing
 * `</script><script>…` closes the JSON-LD block and opens a real one — a
 * stored XSS on the public, unauthenticated SEO landing pages, reachable by
 * anyone who can name a listing. (Confirmed exploitable in dev before this fix;
 * listing titles are seller-controlled and validate.ts caps length only.)
 *
 * Escaped here rather than at input, because this is the point of injection:
 *   < > &      → their \\uXXXX form — JSON-equivalent, but inert in HTML.
 *   U+2028/29  → legal inside a JSON string, yet a real line terminator to a
 *                JS parser, so they break the block a different way.
 *
 * The replacements are double-backslashed deliberately: what must land in the
 * HTML is the two characters \ and u followed by the code point, not the
 * character itself. A single backslash here would re-emit the raw character
 * and reopen the hole.
 */
export function jsonLd(...blobs: (object | null)[]): string {
  const kept = blobs.filter(Boolean);
  return JSON.stringify(kept.length === 1 ? kept[0] : kept)
    .replace(/[<>&\u2028\u2029]/g, (c) => JSON_LD_ESCAPES[c] ?? c);
}

const JSON_LD_ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

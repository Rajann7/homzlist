import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OtherProfile } from "@/components/profile/OtherProfile";
import { siteUrl } from "@/lib/seo/schema";
import { NOT_FOUND_META, clamp, guestProfile, locationName } from "@/lib/seo/detail";

/**
 * homzlist.com/profile/:username — public Other Profile (P9 S2). Guest-readable.
 * Server-rendered shell; the client component fetches the public (stripped) DTO.
 *
 * The metadata used to be `{ title: "@" + username }` built from the URL alone —
 * which meant a profile that does not exist still returned 200 with a confident
 * title for it, and a profile that DOES exist advertised a handle rather than
 * the person or firm. Resolving the row fixes both: a real name and city in the
 * title, and a real 404 for a handle nobody owns.
 *
 * `noindex, follow`: a seller profile carries a person's name, photo, phone and
 * office address. It is public to someone who has the link — that is not the
 * same as wanting it permanently indexed and searchable by name. Links are still
 * followed so the listings on it are discovered.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata(props: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await props.params;
  const p = await guestProfile(username);
  if (!p) return NOT_FOUND_META;

  const city = await locationName(p.city_id ?? null);
  const who = p.name || `@${p.username ?? username}`;
  const title = clamp([who, p.role ? String(p.role) : null, city].filter(Boolean).join(" · "), 60);

  return {
    title: { absolute: title },
    description: clamp(p.bio || `${who} on HomzList${city ? `, ${city}` : ""}.`),
    alternates: { canonical: `${siteUrl()}/profile/${p.username ?? username}` },
    robots: { index: false, follow: true },
    openGraph: {
      title,
      url: `${siteUrl()}/profile/${p.username ?? username}`,
      type: "profile",
      siteName: "HomzList",
      ...(p.photo_url ? { images: [{ url: p.photo_url }] } : {}),
    },
  };
}

export default async function PublicProfilePage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;
  // Same promise generateMetadata awaited. `getProfileByUsername` already
  // rejects a malformed handle, so this is the whole gate.
  if (!(await guestProfile(username))) notFound();

  // Public host = guest surface (session stripped by middleware) → gate writes.
  return <OtherProfile username={username} isGuest />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RequirementDetail } from "@/components/listings/RequirementDetail";
import { siteUrl } from "@/lib/seo/schema";
import { NOT_FOUND_META, UUID_RE, clamp, guestRequirement } from "@/lib/seo/detail";

/**
 * P4 S4 — public requirement detail (homzlist.com/requirements/:id).
 *
 * Requirement-mode feed cards tap through to `/requirements/:id`, but that route
 * existed only on the seller host — so on the public site every unlocked
 * requirement card was a 404 (CLAUDE.md rule 10, same class of gap as
 * `/project/:id`). Same component as the seller side; locked / unlocked / own is
 * decided server-side, so a guest still cannot see a budget.
 *
 * DELIBERATELY `noindex, follow`, unlike listings and projects. A requirement is
 * a person saying what they want to buy and how much they have — the content a
 * guest is allowed to SEE (locked: no budget, no contact) is not content we
 * should be putting in a search index against that person. The page stays
 * crawlable for its links so the seller-side funnel is still reachable; it just
 * does not become a public, permanent record of somebody's house hunt.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return NOT_FOUND_META;

  const req = await guestRequirement(id);
  if (!req) return NOT_FOUND_META;

  // Built from the SHAPE of the need only — never the budget, never the notes,
  // never the person. `guestRequirement` hands a guest `access: "locked"`, and
  // this stays on the safe side of that regardless of what the row holds.
  const r = req.row;
  const what = [
    r.bhk ? `${r.bhk} BHK` : "Property",
    r.kind === "rent" ? "wanted on rent" : "wanted to buy",
    r.area_label ? `in ${r.area_label}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const title = clamp(`${what} · HomzList`, 60);

  return {
    title: { absolute: title },
    description: clamp(
      "A buyer is looking for a property on HomzList. Sign in as a seller to see the full requirement.",
    ),
    alternates: { canonical: `${siteUrl()}/requirements/${id}` },
    robots: { index: false, follow: true },
    openGraph: { title, url: `${siteUrl()}/requirements/${id}`, type: "website", siteName: "HomzList" },
  };
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();

  // Public host = guest surface → billing CTAs gate to login (seller-only routes).
  // Non-live requirements are owner-only, so for a guest this is the 404 gate.
  if (!(await guestRequirement(id))) notFound();

  return <RequirementDetail id={id} isGuest />;
}

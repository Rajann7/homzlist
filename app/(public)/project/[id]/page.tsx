import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectDetail } from "@/components/listings/ProjectDetail";
import { siteUrl } from "@/lib/seo/schema";
import { NOT_FOUND_META, UUID_RE, clamp, guestProject } from "@/lib/seo/detail";

/**
 * P4 S3 — public project detail (homzlist.com/project/:id).
 *
 * The feed mixes builder PROJECT cards in with property cards and taps them
 * through to `/project/:id` (PropertyFeed.tsx). That route existed only on the
 * seller host — and under a different name (`/projects/:id`) — so on the public
 * site every project card in the feed was a 404 (CLAUDE.md rule 10). Same
 * component as the seller side; the server decides what a guest may see.
 *
 * Resolved on the server for the same two reasons `/property/:id` is: a project
 * that is not live must be a real 404 rather than a 200 the browser corrects,
 * and a project a guest CAN see needs its own title and share preview instead
 * of the homepage's.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) return NOT_FOUND_META;

  const p = await guestProject(id);
  if (!p) return NOT_FOUND_META;

  const title = clamp([p.name, p.priceFrom ? `from ${p.priceFrom}` : null, p.areaLabel]
    .filter(Boolean)
    .join(" · "), 60);
  const description = clamp(
    p.description || `${p.name}${p.areaLabel ? ` in ${p.areaLabel}` : ""} — a builder project on HomzList.`,
  );
  const url = `${siteUrl()}/project/${id}`;
  const image = p.coverUrl
    ? [{ url: p.coverUrl, width: 1200, height: 630 }]
    : [{
        url: `${siteUrl()}/api/og?title=${encodeURIComponent(p.name ?? "Project")}&subtitle=${encodeURIComponent(p.areaLabel ?? "HomzList")}`,
        width: 1200,
        height: 630,
      }];

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title, description, url, type: "website", siteName: "HomzList", images: image },
    twitter: { card: "summary_large_image", title, description, images: image.map((i) => i.url) },
  };
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();

  // Same promise generateMetadata awaited (React `cache`) — one query, and the
  // 404 gate is the project state-access rule itself, not a copy of it.
  if (!(await guestProject(id))) notFound();

  return <ProjectDetail id={id} isGuest />;
}

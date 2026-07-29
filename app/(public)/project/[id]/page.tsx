import { ProjectDetail } from "@/components/listings/ProjectDetail";

/**
 * P4 S3 — public project detail (homzlist.com/project/:id).
 *
 * The feed mixes builder PROJECT cards in with property cards and taps them
 * through to `/project/:id` (PropertyFeed.tsx). That route existed only on the
 * seller host — and under a different name (`/projects/:id`) — so on the public
 * site every project card in the feed was a 404 (CLAUDE.md rule 10). Same
 * component as the seller side; the server decides what a guest may see.
 */
export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  return <ProjectDetail id={params.id} isGuest />;
}

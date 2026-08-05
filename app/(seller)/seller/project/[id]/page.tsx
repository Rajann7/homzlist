import { ProjectDetail } from "@/components/listings/ProjectDetail";

/**
 * seller.homzlist.com/project/:id — P4 S3, singular alias.
 *
 * `/project/:id` (singular) is what the feed and the builder dashboard link to,
 * and both of those render on the seller host as well as the public one. Only
 * the plural `/projects/:id` existed here, so a project card tapped from the
 * seller-side feed 404'd. Same component either way; the older plural route is
 * left in place for existing links.
 */
export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ id: string }> }) {
 const params = await props.params;
 return <ProjectDetail id={params.id} />;
}

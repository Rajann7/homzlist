import { ProjectDetail } from "@/components/listings/ProjectDetail";

/** P4 S3 — project detail. */
export const dynamic = "force-dynamic";

export default async function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <ProjectDetail id={params.id} />;
}

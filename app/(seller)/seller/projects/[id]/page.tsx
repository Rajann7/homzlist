import { ProjectDetail } from "@/components/listings/ProjectDetail";

/** P4 S3 — project detail. */
export const dynamic = "force-dynamic";

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  return <ProjectDetail id={params.id} />;
}

import { ProjectInsights } from "@/components/listings/ProjectInsights";

/** Project insights (builder-only; the API 404s anything else). */
export const metadata = { title: "Project insights" };
export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  return <ProjectInsights id={params.id} />;
}

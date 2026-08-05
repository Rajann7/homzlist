import { ProjectInsights } from "@/components/listings/ProjectInsights";

/** Project insights (builder-only; the API 404s anything else). */
export const metadata = { title: "Project insights" };
export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <ProjectInsights id={params.id} />;
}

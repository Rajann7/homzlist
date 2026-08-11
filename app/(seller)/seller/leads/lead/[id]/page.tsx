import { LeadDetail } from "@/components/leads/LeadDetail";

/** One lead in full — status is the only workflow. */
export const metadata = { title: "Lead" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function LeadDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <LeadDetail id={id} base="/leads" />;
}

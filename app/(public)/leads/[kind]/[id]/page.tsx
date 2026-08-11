import { SubjectLeads } from "@/components/leads/SubjectLeads";

/** Every lead on ONE of my posts (property / project / requirement). */
export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const KINDS = new Set(["listing", "project", "requirement"]);

export default async function SubjectLeadsPage(props: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await props.params;
  const safe = KINDS.has(kind) ? (kind as "listing" | "project" | "requirement") : "listing";
  return <SubjectLeads kind={safe} id={id} base="/leads" />;
}

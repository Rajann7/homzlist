import { RequirementDetail } from "@/components/listings/RequirementDetail";

/** P4 S4 — requirement detail (locked / unlocked / own decided server-side). */
export const dynamic = "force-dynamic";

export default async function RequirementDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <RequirementDetail id={params.id} />;
}

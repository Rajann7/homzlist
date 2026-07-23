import { RequirementDetail } from "@/components/listings/RequirementDetail";

/** P4 S4 — requirement detail (locked / unlocked / own decided server-side). */
export const dynamic = "force-dynamic";

export default function RequirementDetailPage({ params }: { params: { id: string } }) {
  return <RequirementDetail id={params.id} />;
}

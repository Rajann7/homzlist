import { ProposalsReceived } from "@/components/listings/ProposalsReceived";

/** P8 S5 — Proposals Received on a requirement I own. */
export const dynamic = "force-dynamic";

export default function ProposalsReceivedPage({ params }: { params: { id: string } }) {
  return <ProposalsReceived requirementId={params.id} />;
}

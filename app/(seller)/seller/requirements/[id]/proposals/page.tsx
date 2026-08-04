import { ProposalsReceived } from "@/components/listings/ProposalsReceived";

/** P8 S5 — Proposals Received on a requirement I own. */
export const dynamic = "force-dynamic";

export default async function ProposalsReceivedPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <ProposalsReceived requirementId={params.id} />;
}

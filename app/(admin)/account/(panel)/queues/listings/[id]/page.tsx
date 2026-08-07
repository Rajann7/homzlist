import { notFound } from "next/navigation";
import { ReviewDetail } from "@/components/admin/queues/ReviewDetail";
import { screenGate } from "@/lib/admin/screen-gate";
import { reviewPayload } from "@/lib/admin/review";
import { claimReviewLock } from "@/lib/admin/review-lock";

/**
 * A4 — Review detail (Doc5 A4, template 675-808).
 *
 * The lock is claimed HERE, on the server, as the screen renders. Claiming from
 * the client would leave a window in which two admins both see an unlocked
 * screen, which is the one thing the lock exists to prevent.
 *
 * `?tab=` carries which queue the moderator came from, so "3 of 12", the next/
 * prev arrows and the × all walk the same list they were looking at.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ReviewPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const gate = await screenGate("staff");
  if (!gate.ok) return gate.lock;
  const me = gate.me;
  const tab = searchParams.tab ?? "pending";

  const [data, lock] = await Promise.all([
    reviewPayload(params.id, tab),
    claimReviewLock("listing", params.id, me),
  ]);
  if (!data) notFound();

  return <ReviewDetail data={data} lock={lock} backTab={tab} />;
}

import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { reopenTicket } from "@/lib/support/service";

/** POST /api/v1/support/tickets/:id/reopen — the closed-thread bar's button. */
export const dynamic = "force-dynamic";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  const res = await reopenTicket(claims.sub, params.id);
  if (!res.ok) return fail("NOT_FOUND");
  return ok({ reopened: true });
}

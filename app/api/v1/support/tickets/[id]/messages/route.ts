import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { replyToTicket } from "@/lib/support/service";
import { createServiceClient } from "@/lib/supabase/server";

/** POST /api/v1/support/tickets/:id/messages — reply in the thread. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { body?: string; attachments?: string[] };
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  const { data } = await createServiceClient()
    .from("profiles").select("name").eq("id", claims.sub).maybeSingle();
  const name = (data as { name: string | null } | null)?.name ?? "You";

  const res = await replyToTicket(claims.sub, name, params.id, body.body ?? "", body.attachments ?? []);
  if (!res.ok) {
    if (res.reason === "NOT_FOUND") return fail("NOT_FOUND");
    if (res.reason === "CLOSED") return fail("FORBIDDEN");
    return fail("VALIDATION_ERROR");
  }
  return ok(res.message);
}

import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { requestMeta } from "@/lib/admin/session";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * A31 — impersonation, start and end (Doc5 A31, Doc3 §1.9).
 *
 * The important design decision, and it is a security one: this NEVER mints a
 * user session. The admin cookie is host-only to account.<domain> (Doc9 §21),
 * and handing an admin a seller session would put a real, writable identity in
 * their browser — one that no amount of "read-only" UI could take back.
 *
 * So "open in user view" renders the user's own data, read-only, inside the
 * admin panel, under an audited session row. Nothing the user could DO is
 * reachable, because none of it is rendered and none of their credentials
 * exist here. Both the start and the end are logged, which is what Doc5 means
 * by "audited both ends".
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gate = await requireCapability("users.edit");
  if (isDenial(gate)) return gate.response;

  let body: { action?: unknown; profileId?: unknown; sessionId?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const db = createServiceClient();
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  if (body.action === "start") {
    const profileId = typeof body.profileId === "string" ? body.profileId : "";
    if (!profileId) return fail("VALIDATION_ERROR", { field: "profileId" });
    if (reason.length < 5) return fail("VALIDATION_ERROR", { field: "reason" });

    const { data: who } = await db.from("profiles").select("id, name").eq("id", profileId).maybeSingle();
    if (!who) return fail("NOT_FOUND");
    const target = who as { id: string; name: string | null };

    // One open session per admin per user: reopening while one is already live
    // would leave the first with no end, and "audited both ends" would be a lie.
    await db
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("staff_id", gate.staff.id)
      .is("ended_at", null);

    const { ip } = requestMeta();
    const { data, error } = await db
      .from("impersonation_sessions")
      .insert({
        staff_id: gate.staff.id,
        staff_name: gate.staff.name,
        profile_id: target.id,
        reason,
        ip,
      })
      .select("id, started_at")
      .single();
    if (error) return fail("SERVER_ERROR");

    await audit({
      actor: gate.staff,
      action: "impersonate_start",
      entityType: "user",
      entityId: target.id,
      entityLabel: target.name || target.id.slice(0, 8),
      summary: `Opened a read-only user view as ${target.name || target.id.slice(0, 8)} — ${reason}`,
      reason,
      sensitive: true,
    });

    return ok({ sessionId: data.id, startedAt: data.started_at });
  }

  if (body.action === "end") {
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) return fail("VALIDATION_ERROR", { field: "sessionId" });

    const { data: found } = await db
      .from("impersonation_sessions")
      .select("id, profile_id, staff_id, started_at, ended_at")
      .eq("id", sessionId)
      .maybeSingle();
    if (!found) return fail("NOT_FOUND");
    const session = found as { id: string; profile_id: string; staff_id: string; started_at: string; ended_at: string | null };
    // An admin may only close their own session.
    if (session.staff_id !== gate.staff.id) return fail("FORBIDDEN");
    if (session.ended_at) return ok({ alreadyEnded: true });

    const endedAt = new Date();
    await db.from("impersonation_sessions").update({ ended_at: endedAt.toISOString() }).eq("id", session.id);

    const minutes = Math.max(1, Math.round((endedAt.getTime() - new Date(session.started_at).getTime()) / 60_000));
    await audit({
      actor: gate.staff,
      action: "impersonate_end",
      entityType: "user",
      entityId: session.profile_id,
      entityLabel: session.profile_id.slice(0, 8),
      summary: `Closed the read-only user view after ${minutes} minute${minutes === 1 ? "" : "s"}`,
      sensitive: true,
    });

    return ok({ minutes });
  }

  return fail("VALIDATION_ERROR", { field: "action" });
}

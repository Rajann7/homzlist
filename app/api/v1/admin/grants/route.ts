import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * A15 — grants and trials (Doc5 A15, Doc2 §4.2).
 *
 * A grant is a plan somebody did not pay for, so the thing that makes it a
 * grant and not a gift is the paper trail: who, to whom, which plan, for how
 * long, and why. All five are required, and all five are on the row.
 *
 * The entitlement it creates is a REAL `user_plans` row built from the catalog
 * snapshot — the same shape `activatePaidOrder` builds — because a granted plan
 * has to be indistinguishable from a bought one everywhere that reads quotas.
 * The only differences are `is_trial`, `granted_by`, and `order_id` being null.
 */
export const dynamic = "force-dynamic";

const MAX_DAYS = 180;

export async function POST(req: NextRequest) {
  const gate = await requireCapability("grants");
  if (isDenial(gate)) return gate.response;

  let body: { action?: unknown; profileId?: unknown; code?: unknown; days?: unknown; reason?: unknown; grantId?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const db = createServiceClient();
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  // ------------------------------------------------------------------- grant
  if (body.action === "grant") {
    const profileId = typeof body.profileId === "string" ? body.profileId : "";
    const code = typeof body.code === "string" ? body.code : "";
    const days = Number(body.days);

    if (!profileId) return fail("VALIDATION_ERROR", { field: "profileId" });
    if (!code) return fail("VALIDATION_ERROR", { field: "code" });
    if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) return fail("VALIDATION_ERROR", { field: "days", max: MAX_DAYS });
    if (reason.length < 5) return fail("VALIDATION_ERROR", { field: "reason" });

    const [{ data: who }, { data: plan }] = await Promise.all([
      db.from("profiles").select("id, name, role").eq("id", profileId).maybeSingle(),
      db.from("plan_catalog").select("*").eq("code", code).eq("is_active", true).maybeSingle(),
    ]);
    if (!who) return fail("NOT_FOUND", { field: "profileId" });
    if (!plan) return fail("VALIDATION_ERROR", { field: "code" });

    const target = who as { id: string; name: string | null; role: string | null };
    const t = plan as Record<string, unknown>;

    // The catalog says which roles a plan is for. Granting a broker plan to an
    // owner would create quotas their screens cannot spend.
    const roles = (t.roles as string[] | null) ?? null;
    if (roles?.length && target.role && !roles.includes(target.role)) {
      return fail("VALIDATION_ERROR", { field: "code", detail: "role_mismatch", roles });
    }

    // One active trial at a time — otherwise two grants stack quotas and the
    // "trial ends" job has two rows to argue with.
    const { data: running } = await db
      .from("user_plans")
      .select("id")
      .eq("profile_id", profileId)
      .eq("is_trial", true)
      .eq("status", "active")
      .maybeSingle();
    if (running) return fail("LISTING_STATE_LOCKED", { alreadyOnTrial: true });

    const now = new Date();
    const expires = new Date(now.getTime() + days * 86_400_000);

    const { data: created, error } = await db
      .from("user_plans")
      .insert({
        profile_id: profileId,
        order_id: null,
        catalog_code: t.code as string,
        name: t.name as string,
        terms: t,
        listing_quota: t.listing_quota ?? 0,
        project_quota: t.project_quota ?? 0,
        requirement_quota: t.requirement_quota ?? 0,
        proposal_quota: t.proposal_quota ?? 0,
        purchased_at: now.toISOString(),
        starts_at: now.toISOString(),
        expires_at: expires.toISOString(),
        status: "active",
        is_trial: true,
        granted_by: gate.staff.id,
      })
      .select("id")
      .single();
    if (error) return fail("SERVER_ERROR");

    const { data: grant } = await db
      .from("grants")
      .insert({
        profile_id: profileId,
        kind: "trial",
        catalog_code: t.code as string,
        contents: { listing_quota: t.listing_quota, requirement_quota: t.requirement_quota, proposal_quota: t.proposal_quota },
        duration_days: days,
        reason,
        granted_by: gate.staff.id,
        granted_by_name: gate.staff.name,
        user_plan_id: created.id,
        notified_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    const { notify } = await import("@/lib/notifications/service");
    await notify({
      profileId,
      type: "trial_ending",
      title: `You have ${t.name as string} for ${days} days`,
      body: `HomzList has given you this plan. ${reason.slice(0, 160)}`,
    });

    await audit({
      actor: gate.staff,
      action: "grant",
      entityType: "grant",
      entityId: grant?.id ?? created.id,
      entityLabel: target.name || profileId.slice(0, 8),
      summary: `Granted ${t.name as string} to ${target.name || profileId.slice(0, 8)} for ${days} days — ${reason}`,
      reason,
      sensitive: true,
    });

    return ok({ grantId: grant?.id ?? null, planId: created.id, expiresAt: expires.toISOString() });
  }

  // ------------------------------------------------------------------ revoke
  if (body.action === "revoke") {
    const grantId = typeof body.grantId === "string" ? body.grantId : "";
    if (!grantId) return fail("VALIDATION_ERROR", { field: "grantId" });
    if (reason.length < 5) return fail("VALIDATION_ERROR", { field: "reason" });

    const { data: found } = await db
      .from("grants")
      .select("id, profile_id, catalog_code, user_plan_id, revoked_at")
      .eq("id", grantId)
      .maybeSingle();
    if (!found) return fail("NOT_FOUND");
    const grant = found as { id: string; profile_id: string; catalog_code: string | null; user_plan_id: string | null; revoked_at: string | null };
    if (grant.revoked_at) return fail("LISTING_STATE_LOCKED", { alreadyRevoked: true });

    await db.from("grants").update({ revoked_at: new Date().toISOString() }).eq("id", grant.id);
    if (grant.user_plan_id) {
      // Doc5 A15's copy: "their trial listing stays live but new actions stop".
      // So the plan ends; nothing published under it is pulled down.
      await db
        .from("user_plans")
        .update({ status: "revoked", revoked_reason: reason })
        .eq("id", grant.user_plan_id);
    }

    const { notify } = await import("@/lib/notifications/service");
    await notify({
      profileId: grant.profile_id,
      type: "plan_expired",
      title: "Your granted plan has ended",
      body: `${reason.slice(0, 160)} What you already posted stays live.`,
    });

    await audit({
      actor: gate.staff,
      action: "revoke",
      entityType: "grant",
      entityId: grant.id,
      entityLabel: grant.catalog_code ?? grant.id.slice(0, 8),
      summary: `Revoked a granted ${grant.catalog_code ?? "plan"} — ${reason}`,
      reason,
      sensitive: true,
    });

    return ok({ revoked: true });
  }

  return fail("VALIDATION_ERROR", { field: "action" });
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { GrantRow, GrantablePlan } from "./grantTypes";

/**
 * A15's reader (Doc5 A15 "Grants & trials").
 *
 * A grant row is only half the story — what matters is whether the entitlement
 * it created is still alive. So every row carries the state of its `user_plans`
 * row, not just its own `revoked_at`: a grant that was never revoked but whose
 * plan expired last month is not "active", and a screen that says it is would
 * have an admin re-granting something that already ran out.
 */

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

function initialsOf(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "??";
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase();
}

export async function grantsList(): Promise<GrantRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("grants")
    .select("id, profile_id, kind, catalog_code, duration_days, reason, granted_by_name, user_plan_id, revoked_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  const profileIds = [...new Set(rows.map((r) => r.profile_id as string).filter(Boolean))];
  const planIds = [...new Set(rows.map((r) => r.user_plan_id as string).filter(Boolean))];

  const [people, plans, catalog] = await Promise.all([
    profileIds.length ? db.from("profiles").select("id, name").in("id", profileIds) : Promise.resolve({ data: [] }),
    planIds.length ? db.from("user_plans").select("id, status, expires_at, listing_quota, listing_used").in("id", planIds) : Promise.resolve({ data: [] }),
    db.from("plan_catalog").select("code, name"),
  ]);

  const nameOf = new Map(((people.data ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, p.name || "Unnamed"]));
  const planOf = new Map(
    ((plans.data ?? []) as Array<{ id: string; status: string; expires_at: string | null; listing_quota: number; listing_used: number }>).map((p) => [p.id, p]),
  );
  const catalogName = new Map(((catalog.data ?? []) as Array<{ code: string; name: string }>).map((c) => [c.code, c.name]));

  const now = Date.now();

  return rows.map((r) => {
    const who = nameOf.get(r.profile_id as string) ?? "Unknown";
    const plan = r.user_plan_id ? planOf.get(r.user_plan_id as string) : undefined;
    const expired = Boolean(plan?.expires_at && new Date(plan.expires_at).getTime() < now);

    const state = r.revoked_at
      ? "Revoked"
      : !plan
        ? "No plan attached"
        : plan.status === "revoked"
          ? "Revoked"
          : plan.status === "expired" || expired
            ? "Expired"
            : "Active";

    return {
      id: r.id as string,
      person: { id: (r.profile_id as string) ?? "", name: who, initials: initialsOf(who) },
      kind: ((r.kind as string) ?? "trial").replace(/^./, (c) => c.toUpperCase()),
      planName: catalogName.get((r.catalog_code as string) ?? "") ?? ((r.catalog_code as string) ?? "—"),
      days: Number(r.duration_days ?? 0),
      reason: (r.reason as string) ?? "—",
      grantedBy: (r.granted_by_name as string) ?? "An admin",
      grantedLabel: day(r.created_at as string),
      expiresLabel: plan?.expires_at ? day(plan.expires_at) : "—",
      usageLabel: plan ? `${plan.listing_used ?? 0} of ${plan.listing_quota ?? 0} listings used` : "—",
      state,
      revocable: state === "Active",
    };
  });
}

/** The plans an admin may grant — the catalog itself, never a typed-in list. */
export async function grantablePlans(): Promise<GrantablePlan[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("plan_catalog")
    .select("code, name, kind, roles, listing_quota, requirement_quota, proposal_quota, period_days")
    .eq("is_active", true)
    .order("sort_order");

  return ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    code: p.code as string,
    name: p.name as string,
    kind: (p.kind as string) ?? "plan",
    roles: (p.roles as string[] | null) ?? [],
    listingQuota: Number(p.listing_quota ?? 0),
    requirementQuota: Number(p.requirement_quota ?? 0),
    proposalQuota: Number(p.proposal_quota ?? 0),
    defaultDays: Number(p.period_days ?? 14),
  }));
}

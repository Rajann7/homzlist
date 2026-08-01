import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/service";
import type { AdminIdentity } from "./guard";

/**
 * P5a — A13 Plans · A14 Coupons · A15 Grants & trials.
 *
 * The three screens that decide what the product COSTS, so two rules run
 * through every write here:
 *
 *  · GRANDFATHERING IS REAL, NOT A CAPTION. A13's note says "Changes apply to
 *    new purchases only. Existing users keep the plan they bought." That is
 *    true because a purchase copies its terms into `user_plans` at checkout —
 *    editing `plan_catalog` cannot reach a plan somebody already owns. The
 *    save path deliberately does NOT touch user_plans, and says how many
 *    holders it left alone so the admin can see the promise being kept.
 *  · A COUPON'S STATE IS DERIVED. Active / Scheduled / Expired / Exhausted are
 *    four facts about dates and a cap (migration 0102), never a stored column
 *    somebody has to remember to flip when the cap fills.
 */

const db = () => createServiceClient();

export type CatalogResult =
  | { ok: true; label: string; summary: string; diff?: Record<string, unknown> }
  | { ok: false; reason: "not_found" | "bad_state" | "validation"; message?: string };

/* ═══════════════════════════════════════════════════════ A13 · plans ═══════ */

const PLAN_FIELDS = [
  "name",
  "sub_label",
  "price_paise",
  "period_days",
  "roles",
  "features",
  "listing_quota",
  "requirement_quota",
  "requirement_days",
  "proposal_quota",
  "project_quota",
  "requirement_access",
  "proposals_expire_with_plan",
  "is_active",
  "sort_order",
] as const;

export async function planList() {
  const { data } = await db()
    .from("admin_plan_catalog")
    .select("*")
    .order("kind")
    .order("sort_order");
  return (data ?? []) as Record<string, unknown>[];
}

export async function planDetail(code: string) {
  const { data } = await db().from("admin_plan_catalog").select("*").eq("code", code).maybeSingle();
  if (!data) return null;

  // The edit panel shows what a change would leave alone — the grandfathering
  // note is a number, not a sentence.
  const { count: holders } = await db()
    .from("user_plans")
    .select("id", { count: "exact", head: true })
    .eq("catalog_code", code)
    .eq("status", "active");

  return { plan: data as Record<string, unknown>, activeHolders: holders ?? 0 };
}

export async function savePlan(
  code: string,
  me: AdminIdentity,
  changes: Record<string, unknown>,
): Promise<CatalogResult> {
  const { data: before } = await db()
    .from("plan_catalog")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (!before) return { ok: false, reason: "not_found" };
  const prev = before as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of PLAN_FIELDS) {
    if (!(key in changes)) continue;
    if (JSON.stringify(prev[key]) === JSON.stringify(changes[key])) continue;
    patch[key] = changes[key];
    diff[key] = { from: prev[key], to: changes[key] };
  }
  if (!Object.keys(patch).length)
    return { ok: false, reason: "validation", message: "Nothing changed" };

  if (patch.price_paise !== undefined && Number(patch.price_paise) < 0)
    return { ok: false, reason: "validation", message: "Price cannot be negative" };
  if (patch.roles !== undefined && (!Array.isArray(patch.roles) || !patch.roles.length))
    return { ok: false, reason: "validation", message: "A plan must be available to some role" };

  patch.updated_at = new Date().toISOString();
  const { error } = await db().from("plan_catalog").update(patch).eq("code", code);
  if (error) return { ok: false, reason: "validation", message: error.message };

  // Deliberately NOT touching user_plans. See the file header.
  const { count: holders } = await db()
    .from("user_plans")
    .select("id", { count: "exact", head: true })
    .eq("catalog_code", code)
    .eq("status", "active");

  return {
    ok: true,
    label: (prev.name as string) ?? code,
    summary: `${Object.keys(diff).length} field(s) changed · ${holders ?? 0} existing holders keep their terms`,
    diff: { changes: diff, grandfathered: holders ?? 0 },
  };
}

export async function createPlan(
  me: AdminIdentity,
  input: Record<string, unknown>,
): Promise<CatalogResult> {
  const code = String(input.code ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(code))
    return { ok: false, reason: "validation", message: "Code must be 3–32 chars: a-z 0-9 _" };
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, reason: "validation", message: "A name is required" };

  const row: Record<string, unknown> = {
    code,
    kind: input.kind === "topup" ? "topup" : "plan",
    name,
    sub_label: input.sub_label ?? null,
    price_paise: Number(input.price_paise ?? 0),
    period_days: input.period_days === null ? null : Number(input.period_days ?? 0) || null,
    roles: Array.isArray(input.roles) && input.roles.length ? input.roles : ["owner", "broker", "builder"],
    features: Array.isArray(input.features) ? input.features : [],
    listing_quota: Number(input.listing_quota ?? 0),
    requirement_quota: Number(input.requirement_quota ?? 0),
    proposal_quota: Number(input.proposal_quota ?? 0),
    project_quota: Number(input.project_quota ?? 0),
    requirement_access: Boolean(input.requirement_access),
    // A new plan is created HIDDEN. Publishing a price to every seller the
    // instant an admin hits Save, before anyone has checked it, is a mistake
    // with money attached — the toggle on the card is the deliberate second step.
    is_active: false,
    sort_order: Number(input.sort_order ?? 100),
  };

  const { error } = await db().from("plan_catalog").insert(row);
  if (error) {
    return {
      ok: false,
      reason: "validation",
      message: error.code === "23505" ? "That code already exists" : error.message,
    };
  }
  void me;
  return {
    ok: true,
    label: name,
    summary: `Plan created (hidden — turn it on when the price is checked)`,
    diff: { code, price_paise: row.price_paise },
  };
}

/**
 * template 1709 — "Plans with purchases can't be deleted — hide instead".
 *
 * The design says it in a toast; the server enforces it. A deleted plan whose
 * `user_plans` rows point at a code that no longer exists is a foreign key
 * violation at best and an unreadable receipt at worst.
 */
export async function deletePlan(code: string, me: AdminIdentity): Promise<CatalogResult> {
  const { count: sold } = await db()
    .from("user_plans")
    .select("id", { count: "exact", head: true })
    .eq("catalog_code", code);
  if ((sold ?? 0) > 0) {
    return {
      ok: false,
      reason: "bad_state",
      message: "Plans with purchases can't be deleted — hide instead",
    };
  }
  const { data } = await db()
    .from("plan_catalog")
    .delete()
    .eq("code", code)
    .select("name")
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  void me;
  return { ok: true, label: (data as { name: string }).name, summary: "Plan deleted (never sold)" };
}

/** template 1709 — "Duplicate". A copy, hidden, with a free code. */
export async function duplicatePlan(code: string, me: AdminIdentity): Promise<CatalogResult> {
  const { data } = await db().from("plan_catalog").select("*").eq("code", code).maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  const src = data as Record<string, unknown>;

  let newCode = `${code}_copy`;
  for (let i = 2; i < 20; i++) {
    const { data: taken } = await db()
      .from("plan_catalog")
      .select("code")
      .eq("code", newCode)
      .maybeSingle();
    if (!taken) break;
    newCode = `${code}_copy${i}`;
  }

  const { created_at, updated_at, ...rest } = src as Record<string, unknown> & {
    created_at?: unknown;
    updated_at?: unknown;
  };
  void created_at;
  void updated_at;
  const { error } = await db()
    .from("plan_catalog")
    .insert({ ...rest, code: newCode, name: `${src.name} (copy)`, is_active: false });
  if (error) return { ok: false, reason: "validation", message: error.message };
  void me;
  return { ok: true, label: `${src.name} (copy)`, summary: `Duplicated as ${newCode}, hidden` };
}

/** template 1709 — "View purchases": who actually bought this plan. */
export async function planPurchases(code: string) {
  const { data } = await db()
    .from("orders")
    .select("id, profile_id, total_paise, status, created_at")
    .eq("catalog_code", code)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(rows.map((r) => r.profile_id as string))];
  const { data: people } = ids.length
    ? await db().from("profiles").select("id, name").in("id", ids)
    : { data: [] };
  const nameOf = new Map(((people ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  return {
    rows: rows.map((r) => ({ ...r, user_name: nameOf.get(r.profile_id as string) ?? "—" })),
  };
}

/* ═════════════════════════════════════════════════════ A14 · coupons ═══════ */

export async function couponDetail(id: string) {
  const { data } = await db().from("admin_coupon_list").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: recent } = await db()
    .from("coupon_redemptions")
    .select("id, profile_id, order_id, created_at")
    .eq("coupon_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  return { coupon: data as Record<string, unknown>, redemptions: (recent ?? []) as Record<string, unknown>[] };
}

function validateCoupon(input: Record<string, unknown>): string | null {
  const type = String(input.discount_type ?? "flat");
  if (type !== "flat" && type !== "percent") return "Discount must be flat or percent";
  const value = Number(input.discount_value ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "Discount must be more than zero";
  if (type === "percent" && value > 100) return "A percentage cannot exceed 100";
  if (input.usage_cap !== null && input.usage_cap !== undefined && Number(input.usage_cap) < 0)
    return "Usage cap cannot be negative";
  const per = Number(input.per_user_limit ?? 1);
  if (!Number.isInteger(per) || per < 1) return "Per-user limit must be at least 1";
  const starts = input.starts_at ? new Date(String(input.starts_at)) : null;
  const ends = input.expires_at ? new Date(String(input.expires_at)) : null;
  if (starts && ends && starts >= ends) return "The end date must be after the start date";
  return null;
}

export async function saveCoupon(
  id: string | null,
  me: AdminIdentity,
  input: Record<string, unknown>,
): Promise<CatalogResult> {
  const problem = validateCoupon(input);
  if (problem) return { ok: false, reason: "validation", message: problem };

  const code = String(input.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,24}$/.test(code))
    return { ok: false, reason: "validation", message: "Code must be 3–24 letters or digits" };

  const row: Record<string, unknown> = {
    code,
    label: (input.label as string)?.trim() || null,
    discount_type: input.discount_type ?? "flat",
    // A flat discount is money, so it is stored in PAISE like every other
    // amount in the schema; a percent is a plain number.
    discount_value: Number(input.discount_value),
    max_discount_paise: input.max_discount_paise ? Number(input.max_discount_paise) : null,
    min_value_paise: Number(input.min_value_paise ?? 0),
    applies_to: input.applies_to ?? "both",
    catalog_codes: Array.isArray(input.catalog_codes) ? input.catalog_codes : [],
    per_user_limit: Number(input.per_user_limit ?? 1),
    usage_cap: input.usage_cap ? Number(input.usage_cap) : null,
    starts_at: input.starts_at ?? null,
    expires_at: input.expires_at ?? null,
    is_active: input.is_active === undefined ? true : Boolean(input.is_active),
  };

  if (!id) {
    const { data, error } = await db().from("coupons").insert({ ...row, created_by: me.id }).select("id").maybeSingle();
    if (error)
      return {
        ok: false,
        reason: "validation",
        message: error.code === "23505" ? "That code already exists" : error.message,
      };
    return {
      ok: true,
      label: code,
      summary: `Coupon created${row.usage_cap ? ` · cap ${row.usage_cap}` : " · no cap"}`,
      diff: { id: (data as { id: string }).id, ...row },
    };
  }

  const { data: before } = await db().from("coupons").select("*").eq("id", id).maybeSingle();
  if (!before) return { ok: false, reason: "not_found" };
  const prev = before as Record<string, unknown>;

  // The cap cannot be lowered under what has already been redeemed: those
  // discounts were given, and a cap that claims otherwise makes the usage bar
  // read more than 100%.
  if (row.usage_cap !== null && Number(row.usage_cap) < Number(prev.used_count ?? 0)) {
    return {
      ok: false,
      reason: "validation",
      message: `${prev.used_count} are already redeemed — the cap cannot go below that`,
    };
  }

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(row)) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(v)) diff[k] = { from: prev[k], to: v };
  }
  if (!Object.keys(diff).length)
    return { ok: false, reason: "validation", message: "Nothing changed" };

  const { error } = await db().from("coupons").update(row).eq("id", id);
  if (error)
    return {
      ok: false,
      reason: "validation",
      message: error.code === "23505" ? "That code already exists" : error.message,
    };

  return { ok: true, label: code, summary: `${Object.keys(diff).length} field(s) changed`, diff };
}

/** The design's row menu: end a coupon now, without deleting its history. */
export async function endCoupon(id: string, me: AdminIdentity): Promise<CatalogResult> {
  const { data } = await db()
    .from("coupons")
    .update({ is_active: false, expires_at: new Date().toISOString() })
    .eq("id", id)
    .eq("is_active", true)
    .select("code, used_count")
    .maybeSingle();
  if (!data) return { ok: false, reason: "bad_state", message: "Already ended" };
  void me;
  const row = data as { code: string; used_count: number };
  return {
    ok: true,
    label: row.code,
    summary: `Ended · ${row.used_count} redemptions kept`,
  };
}

export async function deleteCoupon(id: string, me: AdminIdentity): Promise<CatalogResult> {
  const { data: c } = await db()
    .from("coupons")
    .select("code, used_count")
    .eq("id", id)
    .maybeSingle();
  if (!c) return { ok: false, reason: "not_found" };
  const row = c as { code: string; used_count: number };
  if (row.used_count > 0) {
    // Same rule as a sold plan: a redemption pointing at a deleted coupon makes
    // an order's discount unexplainable.
    return {
      ok: false,
      reason: "bad_state",
      message: "This coupon has been redeemed — end it instead of deleting it",
    };
  }
  await db().from("coupons").delete().eq("id", id);
  void me;
  return { ok: true, label: row.code, summary: "Coupon deleted (never redeemed)" };
}

/* ══════════════════════════════════════════════════════ A15 · grants ═══════ */

export async function grantDetail(id: string) {
  const { data } = await db().from("admin_grant_list").select("*").eq("id", id).maybeSingle();
  return (data as Record<string, unknown>) ?? null;
}

/**
 * template 1259 — the grants log's row menu.
 *
 * Revoking a grant has to revoke the PLAN, not just mark the log entry: the
 * quota check reads `user_plans`, so a "revoked" grant whose plan is still
 * active is a revocation that gave the user everything anyway.
 */
export async function revokeGrant(
  id: string,
  me: AdminIdentity,
  reason: string,
): Promise<CatalogResult> {
  if (!reason.trim()) return { ok: false, reason: "validation", message: "A reason is required" };

  const { data } = await db()
    .from("grants")
    .select("id, profile_id, user_plan_id, revoked_at, contents")
    .eq("id", id)
    .maybeSingle();
  const g = data as
    | { id: string; profile_id: string; user_plan_id: string | null; revoked_at: string | null }
    | null;
  if (!g) return { ok: false, reason: "not_found" };
  if (g.revoked_at) return { ok: false, reason: "bad_state", message: "Already revoked" };

  await db()
    .from("grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);

  let planRevoked = false;
  if (g.user_plan_id) {
    const { data: plan } = await db()
      .from("user_plans")
      .update({ status: "revoked", revoked_reason: reason.trim().slice(0, 300) })
      .eq("id", g.user_plan_id)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    planRevoked = Boolean(plan);
  }

  await notify({
    profileId: g.profile_id,
    type: "admin_message",
    title: "Your trial has been ended",
    body: reason.trim().slice(0, 300),
    actorId: me.id,
  });

  return {
    ok: true,
    label: "Grant",
    summary: planRevoked
      ? "Grant revoked and the trial plan withdrawn"
      : "Grant revoked (its plan had already ended)",
    diff: { reason: reason.trim(), planRevoked },
  };
}

/** Extend a trial that is about to run out — the design's "8 days left" row. */
export async function extendGrant(
  id: string,
  me: AdminIdentity,
  days: number,
  reason: string,
): Promise<CatalogResult> {
  if (!Number.isInteger(days) || days < 1 || days > 365)
    return { ok: false, reason: "validation", message: "Extend by 1–365 days" };
  if (!reason.trim()) return { ok: false, reason: "validation", message: "A reason is required" };

  const { data } = await db()
    .from("grants")
    .select("id, profile_id, user_plan_id, revoked_at")
    .eq("id", id)
    .maybeSingle();
  const g = data as
    | { id: string; profile_id: string; user_plan_id: string | null; revoked_at: string | null }
    | null;
  if (!g) return { ok: false, reason: "not_found" };
  if (g.revoked_at || !g.user_plan_id)
    return { ok: false, reason: "bad_state", message: "This grant has no live plan to extend" };

  const { data: plan } = await db()
    .from("user_plans")
    .select("id, expires_at, status")
    .eq("id", g.user_plan_id)
    .maybeSingle();
  const p = plan as { id: string; expires_at: string | null; status: string } | null;
  if (!p || p.status !== "active")
    return { ok: false, reason: "bad_state", message: "That plan is no longer active" };

  // Extend from whichever is LATER — now, or the old end. Extending an expired
  // trial from its old date would add days that are already in the past.
  const base = p.expires_at && new Date(p.expires_at) > new Date() ? new Date(p.expires_at) : new Date();
  const next = new Date(base.getTime() + days * 86_400_000).toISOString();

  await db().from("user_plans").update({ expires_at: next }).eq("id", p.id);
  await db()
    .from("grants")
    .update({ duration_days: days, reason: reason.trim().slice(0, 300) })
    .eq("id", id);

  await notify({
    profileId: g.profile_id,
    type: "admin_message",
    title: `Your trial has been extended by ${days} days`,
    actorId: me.id,
  });

  return {
    ok: true,
    label: "Grant",
    summary: `Extended ${days} days — now ends ${new Date(next).toLocaleDateString("en-IN")}`,
    diff: { days, from: p.expires_at, to: next, reason: reason.trim() },
  };
}

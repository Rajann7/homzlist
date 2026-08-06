import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import {
  getRequirementForViewer, requirementProposalCount,
  setRequirementActive, fulfillRequirement, deleteRequirement,
  updateRequirementContent, reopenRequirement,
} from "@/lib/listings/requirements";
import { requirementDetailDTO } from "@/lib/listings/dto";
import { requirementUnlockPlan } from "@/lib/billing/service";
import { requirementUnlockDTO } from "@/lib/billing/dto";
import { getProfileById } from "@/lib/profile/service";
import { getPropertyType } from "@/lib/listings/service";
import { canPostRequirement } from "@/lib/listings/capabilities";

/**
 * GET    /api/v1/requirements/:id (Doc7 §64) — locked / unlocked / own, decided
 *        server-side. A locked viewer's payload simply does not contain the
 *        budget or the poster, so there is nothing to reveal in DevTools.
 * PATCH  — the poster's toggle + "mark fulfilled" (P4 S4c).
 * DELETE — soft-delete. The plan quota is NOT returned (Doc2 §4.2).
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A body carrying the requirement's own fields, not just a status flip. */
function isContentEdit(b: Record<string, unknown>): boolean {
  return typeof b.typeCode === "string" && b.typeCode.length > 0;
}

/** "40,00,000" → paise. undefined signals "sent but unparseable". */
function toPaise(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const digits = String(v).replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n >= 0 ? n * 100 : undefined;
}

function bhkOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  // Guests may see the locked preview — that's the paywall's whole point.
  const claims = await getCurrentUser();
  const res = await getRequirementForViewer(params.id, claims?.sub ?? null);
  if (!res) return fail("NOT_FOUND");

  const proposals = res.access === "own" ? await requirementProposalCount(params.id) : null;

  // WHICH plan unlocks this card, for THIS viewer's role. The screen hardcoded
  // "₹2,999 /month" and `plan=p2999` — a price that belongs in `plan_catalog`
  // (CLAUDE.md rule 12), and a plan checkout refuses to a builder (0087), so
  // every Unlock on a builder's requirement detail dead-ended at "That plan
  // isn't available for your account". The browse card and the feed card were
  // fixed for this; the detail behind them was not.
  const unlockPlan = res.access === "locked"
    ? requirementUnlockDTO(await requirementUnlockPlan(
        (claims ? (await getProfileById(claims.sub))?.role ?? null : "owner") as never,
      ))
    : null;

  return ok({
    requirement: requirementDetailDTO(res.row, res.access, proposals, (await getPropertyType(res.row.type_code))?.label ?? null),
    unlockPlan,
  });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`requirement-patch:${claims.sub}`, 60, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  /**
   * A Builder may no longer have a requirement out there (migration 0067), so
   * the three paths that would put one BACK on the public surface — reopen,
   * the active toggle and a content edit (which re-enters review) — are closed
   * for that role. Marking one fulfilled and deleting it stay open: those are
   * ways OUT of the state, and closing them would strand the rows 0067 paused.
   */
  const profile = await getProfileById(claims.sub);
  const revives = body.reopen === true || body.isActive === true || isContentEdit(body);
  if (revives && !canPostRequirement(profile?.role ?? null)) return fail("FORBIDDEN");

  // Every mutation below is scoped to the caller's own row, so a crafted id
  // belonging to someone else matches nothing and returns 404.
  if (body.fulfilled === true) {
    const done = await fulfillRequirement(params.id, claims.sub);
    if (!done) return fail("NOT_FOUND");
  } else if (body.reopen === true) {
    // Reopen a fulfilled requirement — consumes a fresh slot (design S4 dialog).
    const res = await reopenRequirement(params.id, claims.sub);
    if (!res.ok) return fail(res.reason === "no_quota" ? "PLAN_REQUIRED" : "NOT_FOUND");
  } else if (typeof body.isActive === "boolean") {
    const done = await setRequirementActive(params.id, claims.sub, body.isActive);
    if (!done) return fail("NOT_FOUND");
  } else if (isContentEdit(body)) {
    // Editing the requirement itself (P6 S4 in edit mode). It re-validates
    // through the same rules as posting, but draws NO quota — the post was
    // already paid for. A content change goes back to pending_review.
    const res = await updateRequirementContent(params.id, claims.sub, {
      kind: body.kind === "rent" ? "rent" : "sell",
      typeCode: typeof body.typeCode === "string" ? body.typeCode : "",
      bhk: bhkOrNull(body.bhk),
      budgetMinPaise: toPaise(body.budgetMin),
      budgetMaxPaise: toPaise(body.budgetMax),
      areaIds: (Array.isArray(body.areaIds) ? body.areaIds : []).filter(
        (a): a is string => typeof a === "string" && UUID_RE.test(a),
      ),
      urgency:
        body.urgency === "1_3_months" || body.urgency === "exploring" ? body.urgency : "immediate",
      notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
    });
    if (!res.ok) {
      if (res.reason === "not_found") return fail("NOT_FOUND");
      return fail("VALIDATION_ERROR", { errors: res.errors });
    }
  } else {
    return fail("VALIDATION_ERROR");
  }

  const res = await getRequirementForViewer(params.id, claims.sub);
  if (!res) return fail("NOT_FOUND");
  const proposals = await requirementProposalCount(params.id);
  return ok({ requirement: requirementDetailDTO(res.row, res.access, proposals, (await getPropertyType(res.row.type_code))?.label ?? null) });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const done = await deleteRequirement(params.id, claims.sub);
  if (!done) return fail("NOT_FOUND");
  // Deleting does not give the quota back — the client says so out loud.
  return ok({ deleted: true, quotaReturned: false });
}

import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { actionOptions } from "@/lib/admin/reviewConfig";
import { approveBoost, rejectBoost } from "@/lib/billing/boost";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/boosts/:id — A6's two decisions (Doc5 A6).
 *
 *   {action:"approve"}       → the paid window starts now (or queues behind a
 *                              boost already running on the same subject)
 *   {action:"reject_refund"} → rejected AND handed to the refund sweep
 *
 * This is the endpoint that closes gap A1 in docs/PENDING-INTEGRATIONS.md: a
 * seller could pay for a boost and it sat in `pending_approval` forever, because
 * nothing in the product could approve one. The state machine already existed in
 * lib/billing/boost.ts (consecutive queueing, eligibility re-check at approval,
 * auto-refund on reject) — what was missing was a screen and an admin-session
 * gate reaching it.
 *
 * Rejecting is deliberately the ONLY admin path that refunds here: `stopBoost`
 * ends a live boost WITHOUT a refund and belongs to A12/A18, not to a queue
 * whose whole subject is boosts that never ran.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireCapability("queues.decide");
  if (isDenial(gate)) return gate.response;
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  let body: { action?: unknown; reasonCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const db = createServiceClient();
  const { data: before } = await db
    .from("boosts")
    .select("id, status, price_paise, listing_id, subject_kind, target_label, profile_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return fail("NOT_FOUND");
  const row = before as Record<string, unknown>;
  const label = `Boost #${params.id.slice(0, 8)} · ${(row.target_label as string) ?? "—"}`;

  // ---------------------------------------------------------------- approve
  if (body.action === "approve") {
    const res = await approveBoost(params.id, gate.staff.id);
    if (!res.ok) {
      if (res.reason === "not_found") return fail("NOT_FOUND");
      if (res.reason === "city_cap") return fail("LISTING_STATE_LOCKED", { cityCapReached: true });
      // `ineligible` means the subject went sold/hidden while the boost waited.
      // approveBoost has already rejected + queued the refund, so the moderator
      // is told what actually happened rather than "conflict".
      if (res.reason === "ineligible") {
        await audit({
          actor: gate.staff,
          action: "reject",
          entityType: "boost",
          entityId: params.id,
          entityLabel: label,
          summary: "Auto-rejected on approval — the boosted item is no longer live · refund queued",
          diff: { status: { old: row.status, new: "rejected" } },
          sensitive: true,
        });
        return fail("LISTING_STATE_LOCKED", { autoRejected: true, refunding: true });
      }
      return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });
    }

    await audit({
      actor: gate.staff,
      action: "approve",
      entityType: "boost",
      entityId: params.id,
      entityLabel: label,
      summary:
        res.status === "active"
          ? `Boost approved — runs ${res.startsAt.slice(0, 10)} to ${res.endsAt.slice(0, 10)}${res.queuedAfter ? " (queued behind a running boost)" : ""}`
          : "Boost approved",
      diff: { status: { old: row.status, new: "active" } },
    });

    return ok(res);
  }

  // --------------------------------------------------------- reject & refund
  if (body.action !== "reject_refund") return fail("VALIDATION_ERROR", { field: "action" });

  // The reason must be one the config offers — the poster is told this, and it
  // is attached to a refund, so it may not be arbitrary text.
  const code = typeof body.reasonCode === "string" ? body.reasonCode : "";
  const options = await actionOptions("boost_refund");
  const chosen = options.find((o) => o.value === code);
  if (!chosen) return fail("VALIDATION_ERROR", { field: "reasonCode" });

  const res = await rejectBoost(params.id, gate.staff.id, chosen.label);
  if (!res.ok) {
    if (res.reason === "not_found") return fail("NOT_FOUND");
    if (res.reason === "validation") return fail("VALIDATION_ERROR", { field: "reasonCode" });
    return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });
  }

  await audit({
    actor: gate.staff,
    action: "refund",
    entityType: "boost",
    entityId: params.id,
    entityLabel: label,
    summary: `Boost rejected and refund queued — ${chosen.label} · ₹${Math.round(((row.price_paise as number) ?? 0) / 100).toLocaleString("en-IN")}`,
    diff: { status: { old: row.status, new: "rejected" } },
    reason: chosen.label,
    // A refund moves money, so A26 shows it with the shield regardless.
    sensitive: true,
  });

  return ok(res);
}

/**
 * POST-only, but Next.js answers an unmatched method with 405 — and a 405 on
 * account.homzlist.com confirms the route exists to anyone walking paths, which
 * Doc9 §API1 does not allow. An explicit GET that 404s keeps every probe
 * indistinguishable from a path that was never there.
 */
export async function GET() {
  return fail("NOT_FOUND");
}

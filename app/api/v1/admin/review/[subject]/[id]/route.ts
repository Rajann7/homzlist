import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { acquireLock, releaseLock } from "@/lib/admin/locks";
import { reviewDetail } from "@/lib/admin/review";
import { resolveRejectReason, changeFields } from "@/lib/admin/reviewConfig";
import { moderate, type ModerationSubject } from "@/lib/listings/moderation";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/review/:subject/:id — A4/A5's three decisions, plus the
 * lock lifecycle the panel depends on.
 *
 * Separate from the existing /admin/moderate/:subject/:id, which gates on the
 * USER session (`isStaff` over a seller cookie). account.homzlist.com has its
 * own isolated session (Doc9 §21), so the admin panel cannot use that gate — but
 * it must not fork the state machine either. Both routes therefore call the same
 * `moderate()`: the three-reject lock, the seller's moderation_events row, the
 * boost side-effects and the notification all happen exactly once, in one place.
 *
 * What this route adds on top of `moderate()`:
 *   · the capability check (queues.decide) against the ADMIN seat,
 *   · the review lock, so two admins can't both decide the same item,
 *   · the audit row with the reason (Doc3 §1.8 — every mutation is logged),
 *   · reason/notes validated against the config tables, not free text.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECTS = ["listing", "requirement"] as const;

type Body = {
  action?: unknown;
  /** reject: a `reject_templates.code`; `other` carries `reasonText`. */
  reasonCode?: unknown;
  reasonText?: unknown;
  /** request_changes: {field_key: note} — keys must exist in config. */
  notes?: unknown;
};

/**
 * GET — the same detail A4's page renders, for the screens that review inside a
 * sheet instead of a full page (A5's requirement panel). Reading needs only a
 * seat: `queues.view` is what put the row on screen in the first place.
 */
export async function GET(_req: NextRequest, { params }: { params: { subject: string; id: string } }) {
  const gate = await requireCapability("queues.view");
  if (isDenial(gate)) return gate.response;

  const subject = params.subject as (typeof SUBJECTS)[number];
  if (!SUBJECTS.includes(subject) || !UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const loaded = await reviewDetail(subject, params.id, gate.staff);
  if (!loaded.ok) return fail("NOT_FOUND");
  return ok({ detail: loaded.detail });
}

export async function POST(req: NextRequest, { params }: { params: { subject: string; id: string } }) {
  const gate = await requireCapability("queues.decide");
  if (isDenial(gate)) return gate.response;

  const subject = params.subject as (typeof SUBJECTS)[number];
  if (!SUBJECTS.includes(subject) || !UUID_RE.test(params.id)) return fail("NOT_FOUND");

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const action = body.action;

  // ---- lock lifecycle -------------------------------------------------------
  // The panel takes the lock on open and refreshes it while it stays open; a
  // 10-minute TTL means an abandoned tab frees the item on its own (locks.ts).
  if (action === "lock") {
    const r = await acquireLock(subject, params.id, gate.staff);
    return r.ok ? ok({ lock: r.lock }) : ok({ lock: r.heldBy, taken: true });
  }
  if (action === "unlock") {
    await releaseLock(subject, params.id, gate.staff.id);
    return ok({ released: true });
  }

  if (action !== "approve" && action !== "reject" && action !== "request_changes") {
    return fail("VALIDATION_ERROR", { field: "action" });
  }

  // ---- someone else is reviewing it ----------------------------------------
  // A4 renders read-only when another admin holds the lock, but the button being
  // absent is not the control: a decision from a session that does not hold the
  // lock is refused here.
  const held = await acquireLock(subject, params.id, gate.staff);
  if (!held.ok) {
    return fail("LISTING_STATE_LOCKED", { heldBy: held.heldBy.lockedByName, lockedAt: held.heldBy.lockedAt });
  }

  const db = createServiceClient();
  const isListing = subject === "listing";
  const table = isListing ? "listings" : "requirements";
  // A requirement has no `title` column — asking for one made the select fail,
  // which read as "row not found" and answered every requirement decision with a
  // 404. The columns are per-subject, and the audit label falls back to the area.
  const { data: before } = await db
    .from(table)
    .select(isListing ? "id, title, status, reject_count" : "id, area_label, status, reject_count")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return fail("NOT_FOUND");
  const row = before as Record<string, unknown>;
  const label = (row.title as string) || (row.area_label as string) || params.id.slice(0, 8);

  // ---- reason / notes, validated against config ----------------------------
  let reason: string | null = null;
  let notes: Record<string, string> | null = null;

  if (action === "reject") {
    const code = typeof body.reasonCode === "string" ? body.reasonCode : "";
    reason = await resolveRejectReason(subject, code, typeof body.reasonText === "string" ? body.reasonText : null);
    // An unknown code is a rejected request, not a silent fallback: the poster
    // sees this string, so it may only ever be one the config offers.
    if (!reason) return fail("VALIDATION_ERROR", { field: "reasonCode" });
  }

  if (action === "request_changes") {
    const allowed = new Set((await changeFields(subject)).map((c) => c.fieldKey));
    const raw = body.notes && typeof body.notes === "object" && !Array.isArray(body.notes)
      ? (body.notes as Record<string, unknown>)
      : {};
    const entries = Object.entries(raw)
      .filter(([k, v]) => allowed.has(k) && typeof v === "string" && v.trim().length > 0)
      .slice(0, 20)
      .map(([k, v]) => [k, String(v).trim().slice(0, 300)] as const);
    if (!entries.length) return fail("VALIDATION_ERROR", { field: "notes" });
    notes = Object.fromEntries(entries);
  }

  const res = await moderate(subject as ModerationSubject, params.id, gate.staff.id, {
    action,
    notes,
    reason,
  });

  if (!res.ok) {
    if (res.reason === "not_found") return fail("NOT_FOUND");
    if (res.reason === "locked") return fail("LISTING_STATE_LOCKED", { locked: true });
    if (res.reason === "bad_state") return fail("LISTING_STATE_LOCKED", { alreadyDecided: true });
    return fail("VALIDATION_ERROR");
  }

  await audit({
    actor: gate.staff,
    action: action === "approve" ? "approve" : action === "reject" ? "reject" : "request_changes",
    entityType: subject,
    entityId: params.id,
    entityLabel: label,
    summary:
      action === "approve"
        ? "Approved in review"
        : action === "reject"
          ? `Rejected — ${reason}${res.locked ? " · locked after 3 rejections" : ""}`
          : `Changes requested on ${Object.keys(notes ?? {}).join(", ")}`,
    diff: {
      status: { old: row.status, new: res.status },
      ...(action === "reject"
        ? { reject_count: { old: row.reject_count ?? 0, new: res.rejectCount } }
        : {}),
    },
    reason,
  });

  // The decision is made — the item must not stay locked to this admin, or the
  // next reviewer finds a decided row they cannot open.
  await releaseLock(subject, params.id, gate.staff.id);

  return ok({ status: res.status, locked: res.locked, rejectCount: res.rejectCount });
}

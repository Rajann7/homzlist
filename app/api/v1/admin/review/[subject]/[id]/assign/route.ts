import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability, requireStaff } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * A4's ⋯ sheet, made real (Doc5 A4 — "open in user view / assign / internal note
 * / skip"). Three of those four write something:
 *
 *   POST {action:"assign", to}  → review_assignments + a bell notice ADDRESSED to
 *                                 that seat, so the assignee finds out
 *   POST {action:"note", body}  → admin_notes, visible on the item and on A11
 *   DELETE                      → un-assign
 *
 * "Open in user view" is a link and "Skip for now" releases the lock — both are
 * handled by the panel itself. Assignment needs `queues.decide`, because handing
 * an item to someone changes who is accountable for it; a note only needs a seat.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECTS = ["listing", "requirement", "verification", "appeal", "report", "boost"];

/** GET — who this is assigned to, and the seats it could be assigned to. */
export async function GET(_req: NextRequest, { params }: { params: { subject: string; id: string } }) {
  const gate = await requireStaff();
  if (isDenial(gate)) return gate.response;
  if (!SUBJECTS.includes(params.subject) || !UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const db = createServiceClient();
  const [assignment, seats] = await Promise.all([
    db
      .from("review_assignments")
      .select("assigned_to, assigned_by, note, created_at")
      .eq("subject_type", params.subject)
      .eq("subject_id", params.id)
      .maybeSingle(),
    db.from("staff").select("profile_id, display_name, email, level").eq("is_active", true).order("display_name"),
  ]);

  const rows = (seats.data ?? []) as Array<Record<string, unknown>>;
  const names = new Map(
    rows.map((s) => [s.profile_id as string, (s.display_name as string) || (s.email as string)]),
  );
  const a = assignment.data as Record<string, unknown> | null;

  return ok({
    assignment: a
      ? {
          assignedTo: a.assigned_to as string,
          assignedToName: names.get(a.assigned_to as string) ?? "an admin",
          note: (a.note as string) ?? null,
          createdAt: a.created_at as string,
        }
      : null,
    // Assigning an item to yourself is not an assignment, so the current seat is
    // not offered.
    seats: rows
      .filter((s) => s.profile_id !== gate.staff.id)
      .map((s) => ({
        id: s.profile_id as string,
        name: (s.display_name as string) || (s.email as string),
        level: s.level as string,
      })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { subject: string; id: string } }) {
  /**
   * The seat is resolved FIRST, before anything else can answer.
   *
   * This used to validate the action after parsing the body, so an anonymous POST
   * with an unknown action got a 422 — which confirmed the endpoint exists on a
   * host whose whole point is that probing tells you nothing (Doc9 §API1). Every
   * path out of this handler is now behind the gate.
   */
  const seat = await requireStaff();
  if (isDenial(seat)) return seat.response;

  if (!SUBJECTS.includes(params.subject) || !UUID_RE.test(params.id)) return fail("NOT_FOUND");

  let body: { action?: unknown; to?: unknown; body?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const db = createServiceClient();

  // ---- internal note --------------------------------------------------------
  if (body.action === "note") {
    const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
    if (text.length < 2) return fail("VALIDATION_ERROR", { field: "body" });

    const { data, error } = await db
      .from("admin_notes")
      .insert({
        subject_type: params.subject,
        subject_id: params.id,
        author_id: seat.staff.id,
        author_name: seat.staff.name,
        body: text,
      })
      .select("id, created_at")
      .single();
    if (error) return fail("SERVER_ERROR");

    await audit({
      actor: seat.staff,
      action: "send",
      entityType: params.subject === "listing" ? "listing" : "requirement",
      entityId: params.id,
      entityLabel: params.id.slice(0, 8),
      summary: "Added an internal note",
    });
    return ok({ id: data.id, createdAt: data.created_at });
  }

  // ---- assignment -----------------------------------------------------------
  if (body.action !== "assign") return fail("VALIDATION_ERROR", { field: "action" });

  const gate = await requireCapability("queues.decide");
  if (isDenial(gate)) return gate.response;

  const to = typeof body.to === "string" ? body.to : "";
  if (!UUID_RE.test(to)) return fail("VALIDATION_ERROR", { field: "to" });

  // The target must be a live seat — an assignment to a revoked admin is an item
  // that quietly belongs to nobody.
  const { data: target } = await db
    .from("staff")
    .select("profile_id, display_name, email")
    .eq("profile_id", to)
    .eq("is_active", true)
    .maybeSingle();
  if (!target) return fail("VALIDATION_ERROR", { field: "to" });

  const note = typeof body.body === "string" ? body.body.trim().slice(0, 300) : null;
  const { error } = await db.from("review_assignments").upsert(
    {
      subject_type: params.subject,
      subject_id: params.id,
      assigned_to: to,
      assigned_by: gate.staff.id,
      note,
    },
    { onConflict: "subject_type,subject_id" },
  );
  if (error) return fail("SERVER_ERROR");

  const targetName = (target.display_name as string) || (target.email as string);

  // The part that makes it an assignment rather than a row: the assignee is told.
  await db.from("admin_notifications").insert({
    kind: "queue",
    severity: "info",
    staff_id: to,
    title: `${gate.staff.name} assigned you a ${params.subject} to review`,
    body: note ?? `#${params.id.slice(0, 8)} is waiting for your decision.`,
    link_screen: `/queues/${params.subject}s/${params.id}`,
  });

  await audit({
    actor: gate.staff,
    action: "edit",
    entityType: params.subject === "listing" ? "listing" : "requirement",
    entityId: params.id,
    entityLabel: params.id.slice(0, 8),
    summary: `Assigned review to ${targetName}`,
    reason: note,
  });

  return ok({ assignedTo: to, assignedToName: targetName });
}

export async function DELETE(_req: NextRequest, { params }: { params: { subject: string; id: string } }) {
  const gate = await requireCapability("queues.decide");
  if (isDenial(gate)) return gate.response;
  if (!SUBJECTS.includes(params.subject) || !UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const db = createServiceClient();
  await db
    .from("review_assignments")
    .delete()
    .eq("subject_type", params.subject)
    .eq("subject_id", params.id);

  await audit({
    actor: gate.staff,
    action: "edit",
    entityType: params.subject === "listing" ? "listing" : "requirement",
    entityId: params.id,
    entityLabel: params.id.slice(0, 8),
    summary: "Cleared the review assignment",
  });
  return ok({ cleared: true });
}

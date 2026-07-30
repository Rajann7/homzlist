import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/audit";
import { moderate, type ModerationSubject } from "@/lib/listings/moderation";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/admin/queues/:subject/bulk — A3's bulk bar.
 *
 * Reuses `moderate()` per item rather than issuing one mass UPDATE. That is
 * deliberate: the three-reject lock, the notification, the story generation and
 * the boost side-effects all live in that function, and a bulk action that
 * skipped them would quietly produce listings that went live without telling
 * anyone (PROOF.md — a promise with no job behind it).
 *
 * Doc3 §1.4 caps a bulk action at 20; the cap is enforced HERE, not only in the
 * bulk bar that draws "Max 20 at a time".
 */
export const dynamic = "force-dynamic";

const BULK_MAX = 20;
const SUBJECTS = ["listing", "requirement", "project"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { subject: string } }) {
  const gate = await requireCapability("queues.decide");
  if (isDenial(gate)) return gate.response;
  if (!SUBJECTS.includes(params.subject)) return fail("NOT_FOUND");

  let body: { ids?: unknown; action?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)) : [];
  const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
  if (!ids.length || !action) return fail("VALIDATION_ERROR", { field: "ids" });
  if (ids.length > BULK_MAX) return fail("VALIDATION_ERROR", { field: "ids" });

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (action === "reject" && reason.length < 3) return fail("VALIDATION_ERROR", { field: "reason" });

  const subject = params.subject as ModerationSubject;
  const db = createServiceClient();

  // Labels first, so the audit row can name what was acted on even after the
  // status change makes it harder to find.
  const { data: labelRows } = await db
    .from(subject === "listing" ? "listings" : subject === "requirement" ? "requirements" : "projects")
    .select("id, title")
    .in("id", ids);
  const labels = new Map(((labelRows ?? []) as Array<Record<string, unknown>>).map((r) => [r.id as string, (r.title as string) ?? "Untitled"]));

  const done: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const id of ids) {
    const r = await moderate(subject, id, gate.staff.id, action === "approve" ? { action: "approve" } : { action: "reject", reason });
    if (r.ok) {
      done.push(id);
      await audit({
        actor: gate.staff,
        action: action === "approve" ? "approve" : "reject",
        entityType: subject,
        entityId: id,
        entityLabel: labels.get(id) ?? id,
        summary: action === "approve" ? "Approved in a bulk action" : `Rejected in a bulk action — ${reason}`,
        reason: action === "reject" ? reason : null,
      });
    } else {
      skipped.push({ id, reason: r.reason });
    }
  }

  return ok({ done: done.length, skipped });
}

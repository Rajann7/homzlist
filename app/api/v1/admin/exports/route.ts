import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireStaff } from "@/lib/admin/auth";
import { can } from "@/lib/admin/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import { audit } from "@/lib/admin/audit";

/**
 * POST /api/v1/admin/exports — queue an export (A3/A10's export sheet).
 *
 * The export sheet is not a download button: Doc5 A30 makes the Exports Centre
 * the one audited place a file can come from, and Doc3 §1.8 says export actions
 * are themselves audited with a monthly report to super admins. So this creates
 * a real `exports` row in `processing`, and A30 (P6) is where it is collected.
 * The toast the design shows — "Export ready — check Exports Center" — is
 * telling the truth about where the file goes.
 *
 * `contains_personal_data` is set by the ENTITY, not by the caller: a user or
 * payment export carries phone numbers whether or not the requester ticks a box.
 */
export const dynamic = "force-dynamic";

/** Entity → the capability that may export it, and whether it carries PII. */
const ENTITIES: Record<string, { cap: Parameters<typeof can>[1]; pii: boolean; needsReason: boolean }> = {
  listings: { cap: "queues.view", pii: false, needsReason: false },
  requirements: { cap: "queues.view", pii: false, needsReason: false },
  users: { cap: "users.edit", pii: true, needsReason: false },
  payments: { cap: "refunds", pii: true, needsReason: true },
  coupons: { cap: "coupons", pii: false, needsReason: false },
  finance: { cap: "refunds", pii: false, needsReason: false },
  audit: { cap: "audit", pii: true, needsReason: true },
};

const EXPIRY_HOURS = 48;

export async function POST(req: NextRequest) {
  const gate = await requireStaff();
  if (isDenial(gate)) return gate.response;

  let body: { entity?: unknown; name?: unknown; filters?: unknown; format?: unknown; rowCount?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const entity = typeof body.entity === "string" ? body.entity : "";
  const spec = ENTITIES[entity];
  if (!spec) return fail("VALIDATION_ERROR", { field: "entity" });
  if (!can(gate.staff.level, spec.cap)) return fail("FORBIDDEN");

  const format = body.format === "xlsx" ? "xlsx" : "csv";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  // Doc5 A30: "reason input (required for Payments/Audit)".
  if (spec.needsReason && reason.length < 3) return fail("VALIDATION_ERROR", { field: "reason" });

  const rowCount = Number.isFinite(Number(body.rowCount)) ? Math.max(0, Math.floor(Number(body.rowCount))) : 0;
  const filters = body.filters && typeof body.filters === "object" ? body.filters : {};
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : `${entity} export`;

  const db = createServiceClient();
  const { data, error } = await db
    .from("exports")
    .insert({
      name,
      entity,
      filters,
      format,
      row_count: rowCount,
      status: "processing",
      reason: reason || null,
      contains_personal_data: spec.pii,
      requested_by: gate.staff.id,
      requested_by_name: gate.staff.name,
      expires_at: new Date(Date.now() + EXPIRY_HOURS * 3_600_000).toISOString(),
    })
    .select("id")
    .single();

  if (error) return fail("SERVER_ERROR");

  await audit({
    actor: gate.staff,
    action: "export",
    entityType: "export",
    entityId: data.id,
    entityLabel: name,
    summary: `Queued a ${format.toUpperCase()} export of ${rowCount} ${entity} row(s)${spec.pii ? " containing personal data" : ""}`,
    reason: reason || null,
  });

  return ok({ id: data.id, status: "processing", expiresInHours: EXPIRY_HOURS });
}

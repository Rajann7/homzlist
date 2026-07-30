import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { audit } from "@/lib/admin/audit";

/**
 * Internal notes on any entity (Doc5 A11 "Notes — internal sticky notes CRUD").
 *
 * A4's assign route already writes `admin_notes` for a listing or a requirement
 * under review; this is the same table for the entities that have no review
 * screen — a user, and later a payment or a ticket. One table, so A11's Notes
 * tab and A26's audit trail cannot drift apart.
 *
 * Notes are never shown to the person they are about, which is why the subject
 * whitelist is a whitelist and not the caller's string.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const SUBJECTS = new Set(["user", "listing", "requirement", "payment", "ticket"]);

export async function GET(req: NextRequest) {
  const gate = await requireCapability("users.edit");
  if (isDenial(gate)) return gate.response;

  const subjectType = req.nextUrl.searchParams.get("subjectType") ?? "";
  const subjectId = req.nextUrl.searchParams.get("subjectId") ?? "";
  if (!SUBJECTS.has(subjectType) || !subjectId) return fail("VALIDATION_ERROR", { field: "subject" });

  const db = createServiceClient();
  const { data } = await db
    .from("admin_notes")
    .select("id, body, author_name, created_at")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false });

  return ok({
    notes: (data ?? []).map((n: Record<string, unknown>) => ({
      id: n.id as string,
      body: n.body as string,
      author: (n.author_name as string) ?? "An admin",
      atLabel: new Date(n.created_at as string).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireCapability("users.edit");
  if (isDenial(gate)) return gate.response;

  let body: { subjectType?: unknown; subjectId?: unknown; body?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const subjectType = typeof body.subjectType === "string" ? body.subjectType : "";
  const subjectId = typeof body.subjectId === "string" ? body.subjectId : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (!SUBJECTS.has(subjectType) || !subjectId) return fail("VALIDATION_ERROR", { field: "subject" });
  if (text.length < 2) return fail("VALIDATION_ERROR", { field: "body" });

  const db = createServiceClient();

  // The subject has to exist. Without this the table would happily collect
  // notes against ids that were never anything.
  if (subjectType === "user") {
    const { data: who } = await db.from("profiles").select("id").eq("id", subjectId).maybeSingle();
    if (!who) return fail("NOT_FOUND");
  }

  const { data, error } = await db
    .from("admin_notes")
    .insert({
      subject_type: subjectType,
      subject_id: subjectId,
      author_id: gate.staff.id,
      author_name: gate.staff.name,
      body: text,
    })
    .select("id, created_at")
    .single();

  if (error) return fail("SERVER_ERROR");

  await audit({
    actor: gate.staff,
    action: "send",
    entityType: subjectType === "user" ? "user" : "listing",
    entityId: subjectId,
    entityLabel: subjectId.slice(0, 8),
    summary: "Added an internal note",
  });

  return ok({ id: data.id, createdAt: data.created_at });
}

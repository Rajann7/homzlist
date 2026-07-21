import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { submitIdVerification } from "@/lib/profile/service";

/**
 * POST /api/v1/profile/verification/id (Doc7 §18) — submit an ID/property doc
 * for verification → admin queue (status: pending). The actual private-R2 upload
 * is wired with the storage module; here we record the submission + doc type.
 */
export const dynamic = "force-dynamic";

const DOC_TYPES = ["aadhaar", "pan", "driving_licence", "property_tax", "index_copy", "electricity_bill"];

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  let body: { docType?: string; docKey?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  if (!body.docType || !DOC_TYPES.includes(body.docType)) return fail("VALIDATION_ERROR", { field: "docType" });

  // docKey = server-generated private-R2 key (placeholder until storage module).
  await submitIdVerification(claims.sub, body.docType, body.docKey ?? "pending-upload");
  return ok({ status: "pending" });
}

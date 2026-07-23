import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
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

  // Throttle resubmissions so a user can't flood the admin verification queue.
  const limited = await rateLimit(`verify-id:${claims.sub}`, 10, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED", { retryAfterSec: limited.retryAfterSec });

  let body: { docType?: string; docKey?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  if (!body.docType || !DOC_TYPES.includes(body.docType)) return fail("VALIDATION_ERROR", { field: "docType" });

  // The doc must live under THIS user's private prefix. A crafted key
  // pointing at someone else's upload is refused (Doc9 §API1).
  const docKey = typeof body.docKey === "string" ? body.docKey : "";
  if (!docKey.startsWith(`docs/${claims.sub}/`)) return fail("VALIDATION_ERROR", { field: "docKey" });

  await submitIdVerification(claims.sub, body.docType, docKey);
  return ok({ status: "pending" });
}

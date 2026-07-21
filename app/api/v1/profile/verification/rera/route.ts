import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById, submitReraVerification } from "@/lib/profile/service";

/**
 * POST /api/v1/profile/verification/rera (Doc7 §19) — Broker/Builder only.
 * Submit RERA number + certificate → admin queue (pending). Owners are rejected.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile) return fail("UNAUTHORIZED");
  if (profile.role !== "broker" && profile.role !== "builder") return fail("FORBIDDEN"); // RERA hidden for Owner

  let body: { reraNumber?: string; docKey?: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }
  const rera = (body.reraNumber ?? "").trim();
  if (rera.length < 6 || rera.length > 40) return fail("VALIDATION_ERROR", { field: "reraNumber" });

  await submitReraVerification(claims.sub, rera, body.docKey ?? "pending-upload");
  return ok({ status: "pending" });
}

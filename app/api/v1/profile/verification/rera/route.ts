import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { getProfileById, submitReraVerification } from "@/lib/profile/service";

/**
 * POST /api/v1/profile/verification/rera (Doc7 §19) — Broker/Builder only.
 * Submit RERA number + certificate → admin queue (pending). Owners are rejected.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  // Throttle resubmissions so a user can't flood the admin verification queue.
  const limited = await rateLimit(`verify-rera:${claims.sub}`, 10, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED", { retryAfterSec: limited.retryAfterSec });

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

  // A RERA certificate is optional, but if one is attached it must live under
  // THIS user's private prefix — a crafted key pointing at someone else's
  // upload is refused (Doc9 §API1).
  const docKey = typeof body.docKey === "string" ? body.docKey : "";
  if (docKey && !docKey.startsWith(`docs/${claims.sub}/`)) return fail("VALIDATION_ERROR", { field: "docKey" });

  await submitReraVerification(claims.sub, rera, docKey || "pending-upload");
  return ok({ status: "pending" });
}

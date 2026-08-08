import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { rateLimit } from "@/lib/auth/rate-limit";
import { createRequirement, MAX_AREAS } from "@/lib/listings/requirements";
import { canPostRequirement } from "@/lib/listings/capabilities";
import { requirementDTO } from "@/lib/listings/dto";
import { flagEnabled } from "@/lib/system/flags";

/**
 * POST /api/v1/requirements (Doc7 §62) — post a requirement.
 *
 * The client sends WHAT it wants; the quota draw, the 30-day expiry and the
 * moderation state are all decided here. A requirement with no plan behind it
 * cannot be created: `createRequirement` consumes the pooled quota atomically
 * before it writes anything (Doc2 §4.2).
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rupees (what the form shows) → paise (what we store). Rejects nonsense. */
function toPaise(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_00_00_000) return undefined; // undefined = invalid
  return Math.round(n * 100);
}

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");
  // Requirements are an Owner/Broker product — a Builder posts projects only.
  if (!canPostRequirement(profile.role)) return fail("FORBIDDEN");
  // A22 Feature flags → Requirements. Off = no new requirements posted. Default-on.
  if (!(await flagEnabled("requirements", { role: profile.role, userId: claims.sub })))
    return fail("FORBIDDEN");

  const limited = await rateLimit(`requirement-post:${claims.sub}`, 20, 3600, "requirement_create");
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const kind = body.kind === "rent" ? "rent" : "sell";
  const typeCode = typeof body.typeCode === "string" ? body.typeCode : "";
  if (!typeCode) return fail("VALIDATION_ERROR", { field: "typeCode" });

  const min = toPaise(body.budgetMin);
  const max = toPaise(body.budgetMax);
  if (min === undefined) return fail("VALIDATION_ERROR", { field: "budgetMin" });
  if (max === undefined) return fail("VALIDATION_ERROR", { field: "budgetMax" });

  // Area ids must look like ids before they reach a query.
  const rawAreas = Array.isArray(body.areaIds) ? body.areaIds : [];
  const areaIds = rawAreas.filter((a): a is string => typeof a === "string" && UUID_RE.test(a)).slice(0, MAX_AREAS);

  const urgency =
    body.urgency === "1_3_months" || body.urgency === "exploring" ? body.urgency : "immediate";

  const bhkRaw = Number(body.bhk);
  const bhk = Number.isInteger(bhkRaw) && bhkRaw >= 1 && bhkRaw <= 10 ? bhkRaw : null;

  const res = await createRequirement(claims.sub, {
    kind,
    typeCode,
    bhk,
    budgetMinPaise: min,
    budgetMaxPaise: max,
    areaIds,
    urgency,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
  });

  if (!res.ok) {
    // Out of quota → the plan wall, exactly like a listing with no slot.
    if (res.reason === "no_quota") return fail("PLAN_REQUIRED");
    return fail("VALIDATION_ERROR", { errors: res.errors });
  }

  return ok({ requirement: requirementDTO(res.requirement) });
}

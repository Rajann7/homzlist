import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createCollection } from "@/lib/saved/service";

/** POST /api/v1/saved/collections — create a private saved collection. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }
  const name = typeof body.name === "string" ? body.name : "";
  const r = await createCollection(claims.sub, name);
  if ("error" in r) return fail("VALIDATION_ERROR", { field: "name", reason: r.error });
  return ok({ id: r.id });
}

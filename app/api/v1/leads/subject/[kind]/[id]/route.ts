import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { listSubjectLeads, markSubjectSeen, type SubjectKind } from "@/lib/leads/service";

/**
 * GET  /api/v1/leads/subject/:kind/:id — every lead on ONE of my subjects.
 * POST /api/v1/leads/subject/:kind/:id — mark them all seen (clears the badge).
 *
 * Owner-scoped in the service: another seller's listing id returns an empty
 * list, never someone else's leads.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(["listing", "project", "requirement"]);

export async function GET(_req: NextRequest, props: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!KINDS.has(kind) || !UUID_RE.test(id)) return fail("NOT_FOUND");
  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");
  return ok(await listSubjectLeads(claims.sub, kind as SubjectKind, id));
}

export async function POST(_req: NextRequest, props: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!KINDS.has(kind) || !UUID_RE.test(id)) return fail("NOT_FOUND");
  const seen = await markSubjectSeen(claims.sub, kind as SubjectKind, id);
  return ok({ seen });
}

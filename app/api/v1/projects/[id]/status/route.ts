import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import { setProjectStatus, PROJECT_NOT_OWNED, type ProjectStatusAction } from "@/lib/listings/projects";

/**
 * POST /api/v1/projects/:id/status — the project state machine (migration
 * 0079), the mirror of `POST /listings/:id/status`.
 *
 * Until now a project had no status route at all: a builder could not take a
 * scheme off the feed for any reason. Hiding pauses a running boost and
 * unhiding resumes it, both server-side, so the days the builder paid for are
 * never spent against a project nobody can see.
 *
 * Someone else's project is NOT_FOUND, never 403 — answering "not yours" would
 * confirm the id is real (Doc9 §API1). An illegal transition on your OWN
 * project is a genuine 400.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS: ProjectStatusAction[] = ["hide", "unhide", "restore"];

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  // hide/unhide churns the boosts table on every call — cap the thrash.
  const limited = await rateLimit(`project-status:${claims.sub}`, 60, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const action = body.action as ProjectStatusAction;
  if (!ACTIONS.includes(action)) return fail("VALIDATION_ERROR", { field: "action" });

  const project = await setProjectStatus(params.id, claims.sub, action);
  if (project === PROJECT_NOT_OWNED) return fail("NOT_FOUND");
  if (!project) return fail("LISTING_STATE_LOCKED");

  return ok({ project: { id: project.id, status: project.status } });
}

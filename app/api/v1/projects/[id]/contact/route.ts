import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProject, recordProjectLead } from "@/lib/listings/projects";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * POST /api/v1/projects/:id/contact — the viewer tapped Call or WhatsApp on a
 * project, so record a lead for the builder (migration 0051).
 *
 * Until now both buttons opened the dialler / wa.me and left no trace at all,
 * which is why a builder's insights had nothing to count. This is the write
 * behind the Leads card.
 *
 * Signed-in only: `leads.lead_profile_id` is not nullable, and an anonymous
 * "somebody rang" is not a lead a builder can act on. A guest tapping Call
 * still gets their call — the client fires this and ignores the result.
 *
 * The response is the same shape whether or not a lead was recorded (own
 * project, non-live project): whether it landed is not something the caller
 * needs to learn.
 */
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNELS = ["call", "whatsapp"] as const;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`project-contact:${claims.sub}`, 120, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR");
  }

  const channel = CHANNELS.find((c) => c === body.channel);
  if (!channel) return fail("VALIDATION_ERROR", { field: "channel" });

  const project = (await getProject(params.id, claims.sub)) as Record<string, any> | null;
  if (!project) return fail("NOT_FOUND");

  // Own project, or one that isn't live, records nothing — you are not your own
  // lead, and a project nobody else can open cannot be generating interest.
  if (project.status === "live" && !project.isOwner) {
    await recordProjectLead(
      params.id,
      project.profileId,
      claims.sub,
      channel === "call" ? "Tapped Call on the project" : "Tapped WhatsApp on the project",
    );
  }

  return ok({ recorded: true });
}

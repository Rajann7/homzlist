import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/auth/rate-limit";
import {
  getLead, setLeadStatus, addLeadNote, markLeadNotRelevant, markLeadSeen,
  recordContact, withdrawSent, LEAD_STATUSES, type LeadStatus,
} from "@/lib/leads/service";
import { reportLead } from "@/lib/leads/report";

/**
 * GET   /api/v1/leads/:id — one lead (owner only). Opening it marks it seen.
 * PATCH /api/v1/leads/:id — status / note / not_relevant / seen / contact /
 *                           withdraw / report. Every action is owner- or
 *                           sender-scoped inside the service, so a stranger's
 *                           id is a 404 rather than a silent write.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(id)) return fail("NOT_FOUND");
  const lead = await getLead(claims.sub, id);
  if (!lead) return fail("NOT_FOUND");
  await markLeadSeen(id, claims.sub);
  return ok({ lead });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(id)) return fail("NOT_FOUND");

  const limited = await rateLimit(`lead-act:${claims.sub}`, 120, 3600);
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  let done = false;
  switch (body.action) {
    case "status": {
      const status = body.status as LeadStatus;
      if (!LEAD_STATUSES.includes(status)) return fail("VALIDATION_ERROR", { field: "status" });
      done = await setLeadStatus(id, claims.sub, status, typeof body.note === "string" ? body.note : null);
      break;
    }
    case "note": {
      const text = typeof body.text === "string" ? body.text : "";
      if (!text.trim()) return fail("VALIDATION_ERROR", { field: "text" });
      done = await addLeadNote(id, claims.sub, text);
      break;
    }
    case "not_relevant":
      done = await markLeadNotRelevant(id, claims.sub);
      break;
    case "seen":
      done = (await markLeadSeen(id, claims.sub)) || Boolean(await getLead(claims.sub, id));
      break;
    case "contact": {
      // The tap on Call / WhatsApp. With no chat, this event is the platform's
      // only evidence a connection happened — and it, not the owner's
      // bookkeeping, is what moves the lead out of New.
      const channel = body.channel === "whatsapp" ? "whatsapp" : body.channel === "profile" ? "profile" : "call";
      done = await recordContact(id, claims.sub, channel);
      break;
    }
    case "withdraw":
      done = await withdrawSent(id, claims.sub);
      break;
    case "report": {
      const res = await reportLead(id, claims.sub,
        typeof body.reason === "string" ? body.reason : "",
        typeof body.note === "string" ? body.note : null);
      if (!res.ok) return fail(res.reason === "invalid" ? "VALIDATION_ERROR" : "NOT_FOUND");
      return ok({ reported: true, alreadyReported: res.alreadyReported });
    }
    default:
      return fail("VALIDATION_ERROR", { field: "action" });
  }

  if (!done) return fail("NOT_FOUND");
  return ok({ updated: true });
}

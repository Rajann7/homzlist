import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive } from "@/lib/chat/guard";
import { getInbox, requestsSummary, unreadTotal, type InboxSection } from "@/lib/chat/service";

/**
 * GET /api/v1/chat/inbox — the subject-grouped Messages home.
 *
 * `?section=received` (threads on MY posts) or `?section=sent` (threads I opened
 * on someone else's). Both segment counts come back on every call, so the two
 * segment labels are never a client-side guess. Grouping, the summary sentence
 * and every count are computed server-side.
 */
export const dynamic = "force-dynamic";
const SECTIONS = new Set<InboxSection>(["received", "sent"]);

export async function GET(req: NextRequest) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-inbox:${auth.id}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const url = new URL(req.url);
  const section = (url.searchParams.get("section") ?? "received") as InboxSection;
  if (!SECTIONS.has(section)) return fail("VALIDATION_ERROR", { field: "section" });

  const data = await getInbox(auth.id, section, {
    search: url.searchParams.get("q")?.slice(0, 80) || undefined,
  });
  const [requests, unread] = await Promise.all([requestsSummary(auth.id), unreadTotal(auth.id)]);
  return ok({ ...data, requests, unreadTotal: unread });
}

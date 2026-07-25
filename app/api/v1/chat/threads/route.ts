import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireActive } from "@/lib/chat/guard";
import { getThreads, requestsSummary, unreadTotal, type Tab } from "@/lib/chat/service";

/**
 * GET /api/v1/chat/threads (Doc7 §91) — the 4-tab Messages Home, server-scoped.
 * `?tab=my-listings|my-inquiries|requirement-leads|my-responses` + grouping /
 * unread-only / search. Also returns the Requests-row summary + unread total so
 * the header/nav badges never guess.
 */
export const dynamic = "force-dynamic";
const TABS = new Set<Tab>(["my-listings", "my-inquiries", "requirement-leads", "my-responses"]);

export async function GET(req: NextRequest) {
  const auth = await requireActive();
  if ("error" in auth) return fail(auth.error);
  const limited = await rateLimit(`chat-threads:${auth.id}`, 240, 60);
  if (!limited.allowed) return fail("RATE_LIMITED");

  const url = new URL(req.url);
  const tab = (url.searchParams.get("tab") ?? "my-listings") as Tab;
  if (!TABS.has(tab)) return fail("VALIDATION_ERROR", { field: "tab" });

  const data = await getThreads(auth.id, tab, {
    grouping: url.searchParams.get("grouping") === "1",
    unreadOnly: url.searchParams.get("unread") === "1",
    search: url.searchParams.get("q")?.slice(0, 80) || undefined,
  });
  const [requests, unread] = await Promise.all([requestsSummary(auth.id), unreadTotal(auth.id)]);
  return ok({ ...data, requests, unreadTotal: unread });
}

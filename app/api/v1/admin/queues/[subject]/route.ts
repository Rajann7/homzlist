import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { isDenial, requireCapability } from "@/lib/admin/auth";
import { queuePage, LISTING_TABS, type QueueSubject } from "@/lib/admin/queues";

/**
 * GET /api/v1/admin/queues/:subject — A3/A5's table.
 *
 * Capability-gated on `queues.view`, which every level holds — but it is checked
 * rather than assumed, so the day a fourth level exists this endpoint does not
 * quietly open up.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const SUBJECTS: QueueSubject[] = ["listing", "requirement"];
const TAB_KEYS = LISTING_TABS.map((t) => t.key);

export async function GET(req: NextRequest, { params }: { params: { subject: string } }) {
  const gate = await requireCapability("queues.view");
  if (isDenial(gate)) return gate.response;

  const subject = params.subject as QueueSubject;
  if (!SUBJECTS.includes(subject)) return fail("NOT_FOUND");

  const sp = req.nextUrl.searchParams;
  const tab = TAB_KEYS.includes(sp.get("tab") ?? "") ? (sp.get("tab") as string) : "pending";
  const risk = sp.get("risk");

  const page = await queuePage(subject, {
    tab,
    staff: gate.staff,
    filters: {
      type: sp.get("type"),
      cityId: sp.get("city"),
      risk: risk === "low" || risk === "medium" || risk === "high" ? risk : null,
      role: sp.get("role"),
      since: sp.get("since"),
    },
  });

  // Risk is computed after the query, so filtering by band happens here — the
  // count still reflects the tab, which is what the tab strip shows.
  const rows = page.rows.filter((r) => !risk || r.risk.band === risk);

  return ok({ tab, tabs: LISTING_TABS, rows, counts: page.counts, total: rows.length });
}

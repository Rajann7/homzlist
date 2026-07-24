import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { myVisits, type VisitView } from "@/lib/listings/visits";

/**
 * GET /api/v1/visits/mine (Doc7 §102) — the buyer's consolidated visits, with the
 * date-section + time labels the design's grouped list needs, computed
 * server-side (IST). `?filter=upcoming|completed|cancelled` narrows it.
 */
export const dynamic = "force-dynamic";

const IST = "Asia/Kolkata";

function istMidnight(d: Date): number {
  // Compare calendar days in IST, not UTC, so "Tomorrow" is correct near midnight.
  const s = d.toLocaleDateString("en-CA", { timeZone: IST }); // YYYY-MM-DD
  return new Date(`${s}T00:00:00+05:30`).getTime();
}

type Section = "tomorrow" | "this_week" | "upcoming" | "completed" | "cancelled";

function sectionFor(v: VisitView, now: Date): Section {
  if (v.status === "cancelled") return "cancelled";
  if (v.status === "completed") return "completed";
  const day0 = istMidnight(now);
  const vday = istMidnight(new Date(v.scheduled_at));
  const dayDiff = Math.round((vday - day0) / 86_400_000);
  if (dayDiff === 1) return "tomorrow";
  if (dayDiff >= 0 && dayDiff <= 7) return "this_week";
  if (dayDiff < 0) return "this_week"; // past-due but not yet closed → shows with the outcome prompt
  return "upcoming";
}

export async function GET(req: NextRequest) {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const filter = new URL(req.url).searchParams.get("filter");
  const now = new Date();
  const rows = await myVisits(claims.sub);

  const shaped = rows.map((v) => {
    const scheduled = new Date(v.scheduled_at);
    const isPast = scheduled.getTime() < now.getTime() && v.status !== "completed" && v.status !== "cancelled";
    return {
      id: v.id,
      scheduledAt: v.scheduled_at,
      note: v.note,
      status: v.status,
      outcome: v.outcome,
      section: sectionFor(v, now),
      timeLabel: scheduled.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: IST }),
      dateLabel: scheduled.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST }),
      listing: v.listing,
      counterparty: v.counterparty,
      isPast,
    };
  });

  const filtered =
    filter === "upcoming" ? shaped.filter((v) => v.status === "proposed" || v.status === "confirmed")
    : filter === "completed" ? shaped.filter((v) => v.status === "completed")
    : filter === "cancelled" ? shaped.filter((v) => v.status === "cancelled")
    : shaped;

  return ok({ items: filtered });
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Visits (Doc2 §10.2 scheduler, Doc7 §100-102).
 *
 * Module 5 owns the buyer's consolidated "My visits" screen and the
 * reschedule / cancel / outcome management. Visit ORIGINATION (proposing slots
 * from inside a chat) is the chat visit-scheduler — Module 6 — so it is tracked
 * in PENDING-INTEGRATIONS.md and seeded here so every state renders.
 *
 * A visit is always between a buyer and the listing's poster; either side may
 * reschedule/cancel/record the outcome, so mutations scope to (buyer OR poster).
 */

const db = () => createServiceClient();

export interface VisitRow {
  id: string;
  listing_id: string | null;
  requirement_id: string | null;
  buyer_id: string;
  poster_id: string;
  scheduled_at: string;
  note: string | null;
  status: "proposed" | "confirmed" | "completed" | "cancelled";
  outcome: "done" | "cancelled" | null;
  cancel_reason: string | null;
  thread_id: string | null;
  created_at: string;
}

export interface VisitView extends VisitRow {
  listing: { title: string | null; priceLabel: string; areaLabel: string | null; coverUrl: string | null } | null;
  counterparty: { name: string; role: string | null };
}

/** The buyer's consolidated visits (Doc7 §102), newest first. */
export async function myVisits(buyerId: string): Promise<VisitView[]> {
  const { data } = await db()
    .from("visits")
    .select("*")
    .eq("buyer_id", buyerId)
    .order("scheduled_at", { ascending: true });
  const rows = (data ?? []) as VisitRow[];
  if (!rows.length) return [];

  const listingIds = rows.map((r) => r.listing_id).filter((x): x is string => Boolean(x));
  const posterIds = [...new Set(rows.map((r) => r.poster_id))];
  const [{ data: listings }, { data: profs }] = await Promise.all([
    listingIds.length
      ? db().from("listings").select("id,title,price_paise,price_on_request,area_label,cover_url").in("id", listingIds)
      : Promise.resolve({ data: [] as unknown[] }),
    db().from("profiles").select("id,name,role").in("id", posterIds),
  ]);
  const listMap = new Map((listings ?? []).map((l: any) => [l.id, l]));
  const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));

  return rows.map((r) => {
    const l: any = r.listing_id ? listMap.get(r.listing_id) : null;
    const poster: any = profMap.get(r.poster_id) ?? {};
    return {
      ...r,
      listing: l
        ? { title: l.title, priceLabel: l.price_on_request ? "Price on request" : priceLabel(l.price_paise), areaLabel: l.area_label, coverUrl: l.cover_url }
        : null,
      counterparty: { name: poster.name ?? "HomzList user", role: poster.role ?? null },
    };
  });
}

/**
 * Scope helper — the caller must be a party to the visit (buyer OR poster).
 *
 * Deliberately fetches by id and checks membership in JS rather than building a
 * PostgREST `.or(\`buyer_id.eq.${userId}…\`)` filter: never string-interpolate a
 * value (even a trusted JWT sub) into a PostgREST filter expression — a comma or
 * paren in an interpolated value is filter-injection. A non-party gets null → 404.
 */
async function ownVisit(id: string, userId: string): Promise<VisitRow | null> {
  const { data } = await db().from("visits").select("*").eq("id", id).maybeSingle();
  const v = (data as VisitRow) ?? null;
  if (!v || (v.buyer_id !== userId && v.poster_id !== userId)) return null;
  return v;
}

/** Propose a new time — resets to `proposed`, awaiting the other side (Doc7 §101). */
export async function rescheduleVisit(id: string, userId: string, scheduledAt: string, note: string | null): Promise<boolean> {
  const v = await ownVisit(id, userId);
  if (!v || v.status === "cancelled" || v.status === "completed") return false;
  const { data } = await db()
    .from("visits")
    .update({ scheduled_at: scheduledAt, note: note?.slice(0, 500) ?? v.note, status: "proposed" })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

export async function cancelVisit(id: string, userId: string, reason: string | null): Promise<boolean> {
  const v = await ownVisit(id, userId);
  if (!v || v.status === "cancelled" || v.status === "completed") return false;
  const { data } = await db()
    .from("visits")
    .update({ status: "cancelled", cancel_reason: reason?.slice(0, 200) ?? null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

/** Confirm a proposed time (the other party agrees). */
export async function confirmVisit(id: string, userId: string): Promise<boolean> {
  const v = await ownVisit(id, userId);
  if (!v || v.status !== "proposed") return false;
  const { data } = await db().from("visits").update({ status: "confirmed" }).eq("id", id).select("id").maybeSingle();
  return Boolean(data);
}

/**
 * Post-visit outcome (Done / Cancelled). Done → completed; and if this visit
 * belongs to a lead pipeline, nudge that lead to the "visit" stage — the
 * documented "visit outcome feeds pipeline" behaviour (Doc2 §10.4).
 */
export async function setVisitOutcome(id: string, userId: string, outcome: "done" | "cancelled"): Promise<boolean> {
  const v = await ownVisit(id, userId);
  if (!v) return false;
  const status = outcome === "done" ? "completed" : "cancelled";
  const { data } = await db()
    .from("visits")
    .update({ status, outcome, cancel_reason: outcome === "cancelled" ? (v.cancel_reason ?? "Visit didn't happen") : v.cancel_reason })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (!data) return false;

  if (outcome === "done" && v.listing_id) {
    // Best-effort pipeline update — a lead for this buyer+listing moves to
    // "visit". Never throws into the outcome path.
    await db()
      .from("leads")
      .update({ stage: "visit", last_activity: "Visit completed", last_activity_at: new Date().toISOString() })
      .eq("lead_profile_id", v.buyer_id)
      .eq("listing_id", v.listing_id)
      .in("stage", ["new", "contacted"]);
  }
  return true;
}

function priceLabel(paise: number | null): string {
  if (paise === null) return "—";
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${+(r / 1_00_00_000).toFixed(2)} Cr`;
  if (r >= 1_00_000) return `₹${+(r / 1_00_000).toFixed(2)} Lakh`;
  if (r >= 1_000) return `₹${+(r / 1_000).toFixed(2)} K`;
  return `₹${r}`;
}

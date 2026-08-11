import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { listInquiryOptions } from "@/lib/inquiry/service";
import { flagEnabled } from "@/lib/system/flags";
import { rateLimit } from "@/lib/auth/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import {
  sendProposal, proposalsForRequirement, proposalBalance, builderMayPropose,
} from "@/lib/listings/proposals";

/**
 * POST /api/v1/requirements/:id/proposals (Doc7 §70) — send a proposal.
 *   Server: self-block, duplicate guard, atomic quota decrement, NEED_TOPUP when
 *   the pool is empty (client opens the inline top-up sheet).
 *
 * GET  ?view=received (Doc7 §71) — the POSTER's received proposals, each with the
 *   SENDER's number auto-included (the number rule). Ownership-scoped.
 * GET  (default) — the SENDER's proposal sheet: their live listings for the
 *   picker + current balance + duplicate state.
 */
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function priceLabel(paise: number | null, onReq: boolean): string {
  if (onReq) return "Price on request";
  if (paise === null) return "—";
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${+(r / 1_00_00_000).toFixed(2)} Cr`;
  if (r >= 1_00_000) return `₹${+(r / 1_00_000).toFixed(2)} L`;
  return `₹${Math.round(r)}`;
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const view = new URL(req.url).searchParams.get("view");

  if (view === "received") {
    const items = await proposalsForRequirement(params.id, claims.sub);
    if (items === null) return fail("NOT_FOUND"); // not the owner → 404, no leak
    const count = (s: string) => items.filter((i) => i.status === s).length;
    const newCount = items.filter((i) => i.isNew).length;
    // The requirement ref shown in the sub-header.
    const db = createServiceClient();
    const { data: r } = await db.from("requirements").select("bhk,budget_min_paise,budget_max_paise,area_label").eq("id", params.id).maybeSingle();
    const lakh = (paise: number) => Math.round(paise / 1_00_00_000); // 1 Lakh = 1e7 paise
    const ref = r
      ? [r.bhk ? `${r.bhk} BHK` : null,
         r.budget_min_paise != null && r.budget_max_paise != null ? `₹${lakh(r.budget_min_paise)}–${lakh(r.budget_max_paise)} L` : null,
         r.area_label].filter(Boolean).join(" · ")
      : "";
    return ok({
      items,
      requirementRef: ref,
      filters: [
        { key: "all", label: "All", count: items.length },
        { key: "new", label: "New", count: newCount },
        { key: "accepted", label: "Accepted", count: count("accepted") },
        { key: "declined", label: "Declined", count: count("declined") },
        { key: "not_relevant", label: "Not relevant", count: count("not_relevant") },
      ],
    });
  }

  // Default: the sender's proposal sheet data.
  const db = createServiceClient();
  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");
  const [{ data: listings }, { data: projects }, balance, { data: dup }, canPropose, options] = await Promise.all([
    db.from("listings").select("id,title,price_paise,price_on_request,area_label,cover_url,attributes")
      .eq("profile_id", claims.sub).eq("status", "live").order("created_at", { ascending: false }).limit(20),
    // "I Have a Property" covers projects too — a builder answering a
    // requirement offers a scheme, and the old sheet could not express that.
    db.from("projects").select("id,name,area_label,cover_url")
      .eq("profile_id", claims.sub).eq("status", "live").order("created_at", { ascending: false }).limit(20),
    proposalBalance(claims.sub),
    db.from("proposals").select("id").eq("requirement_id", params.id).eq("sender_id", claims.sub).in("status", ["pending", "accepted"]).maybeSingle(),
    // Same answer the POST enforces, so the sheet can say WHY up front instead
    // of offering a Send button that is going to 403 (0087 builder rule).
    builderMayPropose(claims.sub),
    // The chips and the consent wording are rows, never a hardcoded array.
    listInquiryOptions("requirement"),
  ]);

  return ok({
    balance,
    canPropose,
    alreadySent: Boolean(dup),
    listings: ((listings ?? []) as any[]).map((l) => ({
      id: l.id,
      title: l.title,
      priceLabel: priceLabel(l.price_paise, l.price_on_request),
      areaLabel: l.area_label,
      coverUrl: l.cover_url,
    })),
    projects: ((projects ?? []) as any[]).map((p) => ({
      id: p.id,
      title: p.name,
      priceLabel: "Project",
      areaLabel: p.area_label,
      coverUrl: p.cover_url,
    })),
    offers: options.offers,
    when: options.when,
    consentText: options.consentText,
    consentVersion: options.consentVersion,
    myNumber: profile.phone ?? null,
  });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");
  if (!UUID_RE.test(params.id)) return fail("NOT_FOUND");

  const profile = await getProfileById(claims.sub);
  if (!profile || profile.state !== "active") return fail("FORBIDDEN");
  // A22 Feature flags → Proposals. Off = no new proposals sent. Default-on.
  if (!(await flagEnabled("proposals", { role: profile.role, userId: claims.sub })))
    return fail("FORBIDDEN");

  const limited = await rateLimit(`proposal-send:${claims.sub}`, 60, 3600, "proposal_send");
  if (!limited.allowed) return fail("RATE_LIMITED");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("VALIDATION_ERROR"); }

  // Sharing contact details needs consent here for exactly the reason it does
  // on a property inquiry — the requirement owner gets the sender's number.
  if (body.consent !== true) return fail("VALIDATION_ERROR", { field: "consent" });

  const res = await sendProposal(claims.sub, params.id, {
    mode: body.mode === "listing" ? "listing" : "help",
    listingId: typeof body.listingId === "string" ? body.listingId : null,
    projectId: typeof body.projectId === "string" ? body.projectId : null,
    message: typeof body.message === "string" ? body.message : null,
    offers: Array.isArray(body.offers) ? body.offers.filter((o: unknown): o is string => typeof o === "string") : [],
    contactPref: body.contactPref === "whatsapp" ? "whatsapp" : "call",
    contactNumber: typeof body.contactNumber === "string" ? body.contactNumber : null,
    whenToken: typeof body.whenToken === "string" ? body.whenToken : "anytime",
    preferredDate: typeof body.preferredDate === "string" ? body.preferredDate : null,
    consent: true,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  if (!res.ok) {
    switch (res.reason) {
      case "need_topup": return fail("NEED_TOPUP", { balance: res.balance });
      case "duplicate": return fail("DUPLICATE_PROPOSAL");
      case "self": return fail("SELF_ACTION_BLOCKED");
      case "needs_live_project": return fail("PROJECT_REQUIRED");
      case "not_open": return fail("NOT_FOUND");
      case "bad_listing": return fail("VALIDATION_ERROR", { field: "listingId" });
      default: return fail("VALIDATION_ERROR");
    }
  }

  const balance = await proposalBalance(claims.sub);
  return ok({ proposal: { id: res.proposal.id }, balanceLeft: balance.left });
}

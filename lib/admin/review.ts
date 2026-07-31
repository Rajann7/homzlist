import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { previewCard } from "@/lib/feed/service";
import type { FeedCard } from "@/lib/feed/client";
import { shortAge } from "./dashboard";

/**
 * A4 — everything the review screen shows about one listing.
 *
 * The design's left pane is labelled "This is exactly what users will see", so
 * the Feed-card tab renders the REAL `FeedCard` component off the REAL
 * `previewCard()` DTO — the same builder the seller's own preview uses. If the
 * card ever changes, this changes with it, which is the entire point of the
 * promise on that screen.
 *
 * (The Full-listing tab reproduces P4's layout from this payload instead of
 * mounting `ListingDetail`: that component fetches `/api/v1/listings/:id` with
 * a USER session, which an admin on account.* does not have. Same fields, same
 * order, same safety note — drawn from the row the moderator is judging.)
 *
 * The risk breakdown is the same arithmetic as the queue's badge (migration
 * 0095), spelled out line by line, because a score a moderator cannot explain
 * is a score they will learn to ignore.
 */

export type ReviewField = { key: string; label: string; value: string; warn?: boolean };

export type ReviewPayload = {
  id: string;
  title: string;
  status: string;
  /** "3 of 12" — position in the queue this listing was opened from */
  position: { index: number; total: number };
  prevId: string | null;
  nextId: string | null;
  card: FeedCard | null;
  full: {
    price: string;
    summary: string;
    location: string;
    specs: { value: string; label: string }[];
    amenities: string[];
    description: string;
    photos: string[];
  };
  risk: { score: number; reasons: { text: string; points: string }[] };
  fields: ReviewField[];
  doc: {
    type: string | null;
    nameOnDoc: string | null;
    nameOnAccount: string;
    key: string | null;
    bucket: string | null;
    mismatch: boolean;
  };
  poster: {
    id: string;
    name: string;
    initials: string;
    role: string;
    isNew: boolean;
    registered: string;
    listings: number;
    rejections: number;
    reports: number;
    phoneVerified: boolean;
    idVerified: boolean;
  };
  history: { when: string; what: string }[];
  rejectCount: number;
  openReports: number;
  locationTrail: string;
};

const money = (paise: number | null) => {
  if (paise === null || paise === undefined) return "Price on request";
  const rupees = paise / 100;
  if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (rupees >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(2).replace(/\.00$/, "")} Lakh`;
  return `₹${rupees.toLocaleString("en-IN")}`;
};

const initialsOf = (name: string) => {
  const parts = (name ?? "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
};

export async function reviewPayload(
  id: string,
  tab: string,
): Promise<ReviewPayload | null> {
  const db = createServiceClient();

  const { data: row } = await db
    .from("listings")
    .select(
      "id, profile_id, title, description, status, type_code, kind, price_paise, price_on_request, is_negotiable, area_label, pincode, attributes, amenities, area_sqft, reject_count, review_notes, reject_reason, flagged_reason, contact_public, contact_number, ownership_proof_type, ownership_proof_key, ownership_proof_bucket, ownership_proof_name, created_at, submitted_at, city_id, state_id, district_id, taluka_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;
  const l = row as Record<string, any>;

  const [
    { data: poster },
    { data: photos },
    { data: history },
    { data: verifs },
    { data: reports },
    { count: posterListings },
    { data: locs },
  ] = await Promise.all([
    db.from("profiles").select("id, name, role, created_at").eq("id", l.profile_id).maybeSingle(),
    db.from("listing_photos").select("url, position").eq("listing_id", id).order("position"),
    db
      .from("moderation_log")
      .select("action, reason, created_at, actor_id")
      .eq("subject_id", id)
      .order("created_at", { ascending: true }),
    db.from("verifications").select("level, status").eq("profile_id", l.profile_id),
    db.from("reports").select("id, reason, status").eq("subject_type", "listing").eq("subject_id", id),
    db
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", l.profile_id)
      .is("deleted_at", null),
    db
      .from("locations")
      .select("id, name")
      .in("id", [l.state_id, l.district_id, l.taluka_id, l.city_id].filter(Boolean)),
  ]);

  const p = (poster ?? {}) as { id: string; name: string; role: string; created_at: string };
  const photoUrls = ((photos ?? []) as { url: string }[]).map((x) => x.url);
  const openReports = ((reports ?? []) as { status: string }[]).filter((r) =>
    ["open", "reviewing"].includes(r.status),
  ).length;
  const verifSet = new Set(
    ((verifs ?? []) as { level: string; status: string }[])
      .filter((v) => v.status === "approved")
      .map((v) => v.level),
  );

  // ---- risk, spelled out (same terms as the queue's score) ----------------
  const isNew = new Date(p.created_at) > new Date(Date.now() - 7 * 86_400_000);
  const hasNumber = Boolean(l.flagged_reason);
  const reasons: { text: string; points: string }[] = [];
  let score = 0;
  if (isNew) {
    reasons.push({ text: `New account (registered ${shortAge(new Date(p.created_at))} ago)`, points: "+2" });
    score += 2;
  }
  if ((l.reject_count ?? 0) > 0) {
    reasons.push({ text: `Prior rejection (${l.reject_count})`, points: "+2" });
    score += 2;
  }
  if (hasNumber) {
    reasons.push({ text: flagLabel(l.flagged_reason), points: "+3" });
    score += 3;
  }
  if (openReports > 0) {
    reasons.push({ text: `Reported ${openReports} time${openReports === 1 ? "" : "s"}`, points: "+3" });
    score += 3;
  }

  // ---- position in the queue ---------------------------------------------
  // The same view, the same order the queue screen used, so "3 of 12" and the
  // ↑↓ keys agree with the list the moderator came from.
  const { data: queue } = await db
    .from("admin_listing_queue")
    .select("id")
    .eq("status", tabStatus(tab))
    .order("risk_score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(500);
  const ids = ((queue ?? []) as { id: string }[]).map((q) => q.id);
  const index = ids.indexOf(id);

  const attrs = (l.attributes ?? {}) as Record<string, string>;
  const named = (idv: string | null) =>
    ((locs ?? []) as { id: string; name: string }[]).find((x) => x.id === idv)?.name ?? null;

  const fields: ReviewField[] = [
    { key: "title", label: "Title", value: l.title ?? "—" },
    { key: "type", label: "Type", value: l.type_code ?? "—" },
    { key: "kind", label: "Looking to", value: l.kind === "rent" ? "Rent" : "Sell" },
    ...Object.entries(attrs)
      .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
      .slice(0, 20)
      .map(([k, v]) => ({
        key: k,
        label: k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
        value: String(v),
      })),
    { key: "area", label: "Built-up", value: l.area_sqft ? `${l.area_sqft} sqft` : "—" },
    { key: "negotiable", label: "Negotiable", value: l.is_negotiable ? "Yes" : "No" },
    {
      key: "contact",
      label: "Contact",
      value: l.contact_public ? "Number public" : "Number hidden",
      warn: !l.contact_public,
    },
  ];

  return {
    id: l.id,
    title: l.title ?? "Untitled listing",
    status: l.status,
    position: { index: index >= 0 ? index + 1 : 1, total: ids.length || 1 },
    prevId: index > 0 ? ids[index - 1] : null,
    nextId: index >= 0 && index < ids.length - 1 ? ids[index + 1] : null,
    card: await previewCard(id, l.profile_id),
    full: {
      price: l.price_on_request ? "Price on request" : money(l.price_paise),
      summary: [
        attrs.bhk ? `${attrs.bhk} BHK` : null,
        l.type_code,
        l.kind === "rent" ? "For Rent" : "For Sale",
      ]
        .filter(Boolean)
        .join(" · "),
      location: [l.area_label, l.pincode].filter(Boolean).join(" · "),
      specs: [
        attrs.bhk ? { value: String(attrs.bhk), label: "BHK" } : null,
        attrs.bathrooms ? { value: String(attrs.bathrooms), label: "Baths" } : null,
        l.area_sqft ? { value: String(l.area_sqft), label: "Sq.ft" } : null,
        attrs.facing ? { value: String(attrs.facing), label: "Facing" } : null,
      ].filter(Boolean) as { value: string; label: string }[],
      amenities: Array.isArray(l.amenities) ? l.amenities.slice(0, 12) : [],
      description: l.description ?? "",
      photos: photoUrls,
    },
    risk: { score, reasons },
    fields,
    doc: {
      type: l.ownership_proof_type,
      nameOnDoc: l.ownership_proof_name,
      nameOnAccount: p.name ?? "",
      key: l.ownership_proof_key,
      bucket: l.ownership_proof_bucket,
      mismatch: Boolean(
        l.ownership_proof_name &&
          p.name &&
          l.ownership_proof_name.trim().toLowerCase() !== p.name.trim().toLowerCase(),
      ),
    },
    poster: {
      id: p.id,
      name: p.name ?? "",
      initials: initialsOf(p.name ?? ""),
      role: p.role ?? "",
      isNew,
      registered: new Date(p.created_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }),
      listings: posterListings ?? 0,
      rejections: l.reject_count ?? 0,
      reports: ((reports ?? []) as unknown[]).length,
      phoneVerified: verifSet.has("phone"),
      idVerified: verifSet.has("id"),
    },
    history: ((history ?? []) as { action: string; reason: string | null; created_at: string }[]).map(
      (h) => ({
        when: new Date(h.created_at).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          timeZone: "Asia/Kolkata",
        }),
        what: `${h.action.replace(/_/g, " ")}${h.reason ? ` — ${h.reason}` : ""}`,
      }),
    ),
    rejectCount: l.reject_count ?? 0,
    openReports,
    // "Gujarat › Rajkot › Mavdi · 360004". District, taluka and city are very
    // often the same word in Gujarat, and area_label already ends in the city —
    // repeating "Rajkot" four times is noise in a breadcrumb whose job is to
    // let a moderator check the location is complete.
    locationTrail: dedupe([
      named(l.state_id),
      named(l.district_id),
      named(l.taluka_id),
      named(l.city_id),
      l.area_label,
      l.pincode,
    ]).join(" › "),
  };
}

/**
 * `flagged_reason` is a machine code (`blocklist_word`, `number_pattern`). A
 * moderator reading "blocklist_word +3" has to go and find out what that means;
 * the design writes the sentence instead ("Phone number detected in
 * description"), so this is the same information in the same words.
 */
/** Drop empties, and any step already named by the one before it. */
function dedupe(parts: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of parts) {
    const part = (raw ?? "").trim();
    if (!part) continue;
    const last = out[out.length - 1];
    if (last && (last === part || part.startsWith(`${last},`) || last.endsWith(`, ${part}`))) {
      if (part.length > last.length) out[out.length - 1] = part;
      continue;
    }
    out.push(part);
  }
  return out;
}

function flagLabel(code: string | null): string {
  const map: Record<string, string> = {
    number_pattern: "Phone number detected in the description",
    blocklist_word: "Blocked word detected in the content",
    url: "Link detected in the content",
  };
  return map[code ?? ""] ?? (code ? code.replace(/_/g, " ") : "Auto-flagged by the content check");
}

function tabStatus(tab: string): string {
  if (tab === "changes") return "changes_requested";
  if (tab === "payment") return "payment_pending";
  if (tab === "rejected") return "rejected";
  return "pending_review";
}

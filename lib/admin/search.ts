import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { maskPhone } from "@/lib/auth/phone";
import type { AdminIdentity } from "./guard";
import { ROLE_RANK } from "./guard";

/**
 * The header's global search (template 1608-1620) — "Search phone, name,
 * listing ID, payment ID…".
 *
 * Four groups, four real queries, and three rules that are not negotiable:
 *
 *  · ROLE. Users, listings-master and payments are admin-level screens
 *    (SCREEN_MIN_ROLE, template 248). A staff-level admin searching must not
 *    get a payment row back in a dropdown that their role cannot open — the
 *    filter happens here, server-side, not by hiding rows in the overlay.
 *  · MASKED. The result line shows a masked phone, the way the design draws it
 *    ("+91 98xxx xx21"). The panel has screens that reveal a full number with
 *    an audit row behind it; a search dropdown is not one of them.
 *  · BOUNDED. Every group is capped and the query must be at least two
 *    characters, so this cannot be walked to enumerate the user table.
 */

export type SearchHit = {
  id: string;
  title: string;
  sub: string;
  /** which screen opens it — resolved to a route by the overlay */
  screen: string;
};

export type SearchGroup = { label: string; hits: SearchHit[] };

const PER_GROUP = 5;

const money = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

/** "₹40–60L" — the design's own shorthand for a requirement's budget. */
function budgetLabel(min: number | null, max: number | null): string {
  const lakh = (paise: number | null) =>
    paise ? `${Math.round(paise / 10_000_000)}L` : null;
  const lo = lakh(min);
  const hi = lakh(max);
  if (lo && hi) return `₹${lo.replace("L", "")}–${hi}`;
  return lo ? `₹${lo}+` : hi ? `up to ₹${hi}` : "";
}

/** PostgREST `or` values are comma-separated; a comma in the term would split it. */
const safe = (q: string) => q.replace(/[,()*]/g, " ").trim();

export async function adminSearch(me: AdminIdentity, rawQuery: string): Promise<SearchGroup[]> {
  const q = safe(rawQuery);
  if (q.length < 2) return [];

  const db = createServiceClient();
  const like = `%${q}%`;
  const groups: SearchGroup[] = [];
  const isAdmin = ROLE_RANK[me.role] >= ROLE_RANK.admin;

  if (isAdmin) {
    const { data } = await db
      .from("profiles")
      .select("id, name, username, phone, role")
      .or(`name.ilike.${like},username.ilike.${like},phone.ilike.${like}`)
      .neq("state", "deleted")
      .limit(PER_GROUP);
    const rows = (data ?? []) as {
      id: string;
      name: string | null;
      username: string | null;
      phone: string | null;
      role: string | null;
    }[];
    const hits = rows.map((p) => ({
      id: p.id,
      title: p.name ?? p.username ?? "Unnamed",
      sub: [p.phone ? maskPhone(p.phone) : null, p.role ? p.role[0].toUpperCase() + p.role.slice(1) : null]
        .filter(Boolean)
        .join(" · "),
      screen: "users",
    }));
    if (hits.length) groups.push({ label: "USERS", hits });
  }

  {
    // Listings are reachable by every admin role: a staff moderator's whole job
    // is the listing queue. The SCREEN they open differs by role, which is the
    // shell's gate, not this one's.
    const { data } = await db
      .from("listings")
      .select("id, title, status, area_label")
      .or(`title.ilike.${like},area_label.ilike.${like}`)
      .is("deleted_at", null)
      .limit(PER_GROUP);
    const rows = (data ?? []) as {
      id: string;
      title: string | null;
      status: string;
      area_label: string | null;
    }[];
    const hits = rows.map((l) => ({
      id: l.id,
      title: l.title ?? "Untitled listing",
      sub: [l.area_label, String(l.status).replace(/_/g, " ")].filter(Boolean).join(" · "),
      screen: isAdmin ? "listingsMaster" : "listings",
    }));
    if (hits.length) groups.push({ label: "LISTINGS", hits });
  }

  if (isAdmin) {
    const { data } = await db
      .from("payments")
      .select("id, razorpay_payment_id, amount_paise, status")
      .ilike("razorpay_payment_id", like)
      .limit(PER_GROUP);
    const rows = (data ?? []) as {
      id: string;
      razorpay_payment_id: string | null;
      amount_paise: number;
      status: string;
    }[];
    const hits = rows.map((p) => ({
      id: p.id,
      title: p.razorpay_payment_id ?? p.id,
      sub: `${money(Number(p.amount_paise))} · ${p.status}`,
      screen: "payments",
    }));
    if (hits.length) groups.push({ label: "PAYMENTS", hits });
  }

  {
    // A requirement has no title of its own — it IS its criteria, which is also
    // how the design labels it ("3 BHK · ₹40–60L"). So the searchable text is
    // the area it is looking in.
    const { data } = await db
      .from("requirements")
      .select("id, bhk, type_code, area_label, budget_min_paise, budget_max_paise, status")
      .ilike("area_label", like)
      .is("deleted_at", null)
      .limit(PER_GROUP);
    const rows = (data ?? []) as {
      id: string;
      bhk: number | null;
      type_code: string | null;
      area_label: string | null;
      budget_min_paise: number | null;
      budget_max_paise: number | null;
      status: string;
    }[];
    const hits = rows.map((r) => ({
      id: r.id,
      title: [r.bhk ? `${r.bhk} BHK` : null, r.type_code, r.area_label]
        .filter(Boolean)
        .join(" · "),
      sub: [budgetLabel(r.budget_min_paise, r.budget_max_paise), String(r.status).replace(/_/g, " ")]
        .filter(Boolean)
        .join(" · "),
      screen: "requirements",
    }));
    if (hits.length) groups.push({ label: "REQUIREMENTS", hits });
  }

  return groups;
}

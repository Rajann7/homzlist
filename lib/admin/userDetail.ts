import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * A11's Overview reader (Doc5 A11 / designs P14's user panel).
 *
 * Everything the header and the Overview tab show is a real row: the profile
 * itself, the verification levels actually approved, the suspension actually in
 * force, and the counts the tabs will drill into. Nothing is derived in the
 * browser, and the phone number is only here because the caller already passed
 * `users.edit` — A10's list and this panel read through the same guard.
 */

export interface UserDetail {
  id: string;
  name: string;
  initials: string;
  handle: string;
  phone: string;
  email: string | null;
  role: string | null;
  roleLabel: string;
  city: string;
  bio: string | null;
  status: string;
  statusLabel: string;
  joinedLabel: string;
  lastActiveLabel: string;
  verified: { id: boolean; rera: boolean };
  /** In force right now, if any — the header's red banner. */
  suspension: { reason: string; days: number | null; sinceLabel: string } | null;
  counts: {
    listings: number;
    requirements: number;
    leads: number;
    payments: number;
    plans: number;
    reports: number;
    notes: number;
  };
  plans: Array<{ id: string; name: string; isTrial: boolean; startsLabel: string; expiresLabel: string; status: string }>;
  notes: Array<{ id: string; body: string; author: string; atLabel: string }>;
}

const ROLE_LABEL: Record<string, string> = { owner: "Owner", broker: "Broker", builder: "Builder" };
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
  deleted: "Deleted",
  archived: "Archived",
};

function initialsOf(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "??";
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase();
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

export async function userDetail(id: string): Promise<UserDetail | null> {
  const db = createServiceClient();

  const { data: p } = await db
    .from("profiles")
    .select("id, name, username, phone, email, role, city_id, bio, state, created_at, last_active_at")
    .eq("id", id)
    .maybeSingle();

  if (!p) return null;
  const row = p as Record<string, unknown>;

  const [city, verifs, suspension, listings, requirements, leads, payments, plans, reports, notes] = await Promise.all([
    row.city_id ? db.from("locations").select("name").eq("id", row.city_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("verifications").select("level").eq("profile_id", id).eq("status", "approved"),
    db.from("account_suspensions").select("reason, days, created_at").eq("profile_id", id).is("lifted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("listings").select("id", { count: "exact", head: true }).eq("profile_id", id),
    db.from("requirements").select("id", { count: "exact", head: true }).eq("profile_id", id),
    db.from("leads").select("id", { count: "exact", head: true }).eq("owner_id", id),
    db.from("payments").select("id", { count: "exact", head: true }).eq("profile_id", id),
    db.from("user_plans").select("id, name, is_trial, starts_at, expires_at, status").eq("profile_id", id).order("purchased_at", { ascending: false }),
    db.from("reports").select("id", { count: "exact", head: true }).eq("subject_type", "user").eq("subject_id", id),
    db.from("admin_notes").select("id, body, author_name, created_at").eq("subject_type", "user").eq("subject_id", id).order("created_at", { ascending: false }),
  ]);

  const levels = (verifs.data ?? []) as Array<{ level: string }>;
  const sus = suspension.data as { reason: string | null; days: number | null; created_at: string } | null;
  const name = (row.name as string) || "Unnamed";
  const state = (row.state as string) ?? "active";

  return {
    id,
    name,
    initials: initialsOf(name),
    handle: row.username ? `@${row.username as string}` : "—",
    phone: (row.phone as string) ?? "—",
    email: (row.email as string) ?? null,
    role: (row.role as string) ?? null,
    roleLabel: ROLE_LABEL[(row.role as string) ?? ""] ?? "No role",
    city: ((city.data as { name?: string } | null)?.name as string) ?? "—",
    bio: (row.bio as string) ?? null,
    status: state,
    statusLabel: STATUS_LABEL[state] ?? state,
    joinedLabel: day(row.created_at as string),
    lastActiveLabel: stamp((row.last_active_at as string) ?? null),
    verified: { id: levels.some((v) => v.level !== "rera"), rera: levels.some((v) => v.level === "rera") },
    suspension: sus ? { reason: sus.reason ?? "No reason recorded", days: sus.days, sinceLabel: day(sus.created_at) } : null,
    counts: {
      listings: listings.count ?? 0,
      requirements: requirements.count ?? 0,
      leads: leads.count ?? 0,
      payments: payments.count ?? 0,
      plans: (plans.data ?? []).length,
      reports: reports.count ?? 0,
      notes: (notes.data ?? []).length,
    },
    plans: ((plans.data ?? []) as Array<Record<string, unknown>>).map((pl) => ({
      id: pl.id as string,
      name: (pl.name as string) ?? "Plan",
      isTrial: Boolean(pl.is_trial),
      startsLabel: day(pl.starts_at as string),
      expiresLabel: day(pl.expires_at as string),
      status: (pl.status as string) ?? "—",
    })),
    notes: ((notes.data ?? []) as Array<Record<string, unknown>>).map((n) => ({
      id: n.id as string,
      body: n.body as string,
      author: (n.author_name as string) ?? "An admin",
      atLabel: stamp(n.created_at as string),
    })),
  };
}

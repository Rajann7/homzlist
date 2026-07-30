import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * A10's reader (Doc5 A10 / designs P14 `usersEl`).
 *
 * Every column the table draws is a real query — the design's "4,281 users",
 * "3 live · 1 pending" and "12 leads" are the SHAPE, not the numbers
 * (CLAUDE.md rule 12). The per-user counts are gathered in a handful of grouped
 * reads over the page's ids rather than a query per row, so a 50-row page is a
 * fixed number of round trips.
 *
 * Nothing here is filtered in the browser: search, every filter, sorting and
 * paging all happen in Postgres, because the browser must never receive rows an
 * admin filtered away (Doc9 — private fields are stripped server-side, not
 * hidden with CSS).
 */

export const USER_STATUSES = ["active", "suspended", "deactivated", "deleted", "archived"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** The design's six filter chips, in its order. */
export interface UserFilters {
  q: string | null;
  role: string | null;
  status: string | null;
  /** "none" = no active plan, otherwise a plan_catalog code. */
  plan: string | null;
  cityId: string | null;
  /** id | rera | none */
  verification: string | null;
  /** 7d | 30d | 90d | year */
  joined: string | null;
}

export const EMPTY_FILTERS: UserFilters = {
  q: null,
  role: null,
  status: null,
  plan: null,
  cityId: null,
  verification: null,
  joined: null,
};

export function readFilters(sp: Record<string, string | string[] | undefined>): UserFilters {
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : null;
  };
  return {
    q: one("q"),
    role: one("role"),
    status: one("status"),
    plan: one("plan"),
    cityId: one("city"),
    verification: one("verification"),
    joined: one("joined"),
  };
}

export interface UserRow {
  id: string;
  name: string;
  initials: string;
  handle: string;
  phone: string;
  role: string | null;
  roleLabel: string;
  city: string;
  /** Approved verification levels — the design's verification cluster. */
  verified: { id: boolean; rera: boolean };
  plans: string[];
  /** "Trial · 4 days left" when an active plan is a trial. */
  trialLabel: string | null;
  listings: number;
  /** The design's grey "live/pending" beside the listing count. */
  listingSplit: string;
  leads: number;
  joinedLabel: string;
  status: UserStatus;
  statusLabel: string;
  /** Registered in the last 7 days — the design's "New" chip. */
  isNew: boolean;
  /** Open reports against this user — the design's red flag icon. */
  reports: number;
  deleted: boolean;
}

const ROLE_LABEL: Record<string, string> = { owner: "Owner", broker: "Broker", builder: "Builder" };

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
  deleted: "Deleted",
  archived: "Archived",
};

const JOINED_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, year: 365 };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function dayLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export interface UsersPage {
  rows: UserRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function usersPage(filters: UserFilters, page = 1, pageSize = 50): Promise<UsersPage> {
  const db = createServiceClient();

  // ---- ids the filters allow, decided in Postgres -------------------------
  let q = db
    .from("profiles")
    .select("id, name, username, phone, role, city_id, state, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.q) {
    // Name, handle or phone. `or` on a quoted pattern, so a comma or a paren in
    // the search box cannot break out of the filter expression.
    // The value is DOUBLE-QUOTED inside the `or` expression, so a comma or a
    // paren in the search box is just a character and cannot split the filter
    // list. Only the quote and the backslash have to be escaped — stripping
    // punctuation instead would silently fail to find "R.K. Properties".
    const safe = filters.q.trim().replace(/["\\]/g, (c) => `\\${c}`);
    if (safe) q = q.or(`name.ilike."%${safe}%",username.ilike."%${safe}%",phone.ilike."%${safe}%"`);
  }
  if (filters.role) q = q.eq("role", filters.role);
  if (filters.status) q = q.eq("state", filters.status);
  if (filters.cityId) q = q.eq("city_id", filters.cityId);
  if (filters.joined && JOINED_DAYS[filters.joined]) {
    q = q.gte("created_at", new Date(Date.now() - JOINED_DAYS[filters.joined] * 86_400_000).toISOString());
  }

  // Plan and verification are one-to-many, so they narrow by id set rather than
  // by a column on profiles.
  if (filters.plan) {
    const { data } = await db
      .from("user_plans")
      .select("profile_id, catalog_code")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());
    const withPlan = (data ?? []) as Array<{ profile_id: string; catalog_code: string | null }>;
    if (filters.plan === "none") {
      const ids = [...new Set(withPlan.map((r) => r.profile_id))];
      if (ids.length) q = q.not("id", "in", `(${ids.join(",")})`);
    } else {
      const ids = [...new Set(withPlan.filter((r) => r.catalog_code === filters.plan).map((r) => r.profile_id))];
      q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    }
  }
  if (filters.verification) {
    const { data } = await db.from("verifications").select("profile_id, level").eq("status", "approved");
    const rows = (data ?? []) as Array<{ profile_id: string; level: string }>;
    if (filters.verification === "none") {
      const ids = [...new Set(rows.map((r) => r.profile_id))];
      if (ids.length) q = q.not("id", "in", `(${ids.join(",")})`);
    } else {
      const ids = [...new Set(rows.filter((r) => r.level === filters.verification).map((r) => r.profile_id))];
      q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    }
  }

  const from = (page - 1) * pageSize;
  const { data, count } = await q.range(from, from + pageSize - 1);
  const base = (data ?? []) as Array<Record<string, unknown>>;
  const ids = base.map((r) => r.id as string);

  if (ids.length === 0) return { rows: [], total: count ?? 0, page, pageSize };

  // Only the cities this page actually references. `locations` holds 104k city
  // rows, and the client caps a read at 1000 — reading "all cities" silently
  // returned the first thousand and left every row on the page showing "—".
  const cityIds = [...new Set(base.map((r) => r.city_id as string | null).filter(Boolean))] as string[];

  const [cities, verifs, plans, listings, leads, reports] = await Promise.all([
    cityIds.length
      ? db.from("locations").select("id, name").in("id", cityIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    db.from("verifications").select("profile_id, level").eq("status", "approved").in("profile_id", ids),
    db
      .from("user_plans")
      .select("profile_id, name, is_trial, expires_at")
      .eq("status", "active")
      .in("profile_id", ids),
    db.from("listings").select("profile_id, status").in("profile_id", ids),
    db.from("leads").select("owner_id").in("owner_id", ids),
    db.from("reports").select("subject_id").eq("subject_type", "user").in("status", ["open", "reviewing"]).in("subject_id", ids),
  ]);

  const cityName = new Map(((cities.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));

  const verifBy = new Map<string, { id: boolean; rera: boolean }>();
  for (const v of (verifs.data ?? []) as Array<{ profile_id: string; level: string }>) {
    const cur = verifBy.get(v.profile_id) ?? { id: false, rera: false };
    if (v.level === "rera") cur.rera = true;
    else cur.id = true;
    verifBy.set(v.profile_id, cur);
  }

  const plansBy = new Map<string, string[]>();
  const trialBy = new Map<string, string>();
  for (const p of (plans.data ?? []) as Array<{ profile_id: string; name: string | null; is_trial: boolean; expires_at: string | null }>) {
    const list = plansBy.get(p.profile_id) ?? [];
    if (p.name) list.push(p.name);
    plansBy.set(p.profile_id, list);
    if (p.is_trial && p.expires_at) {
      const days = Math.max(0, Math.ceil((new Date(p.expires_at).getTime() - Date.now()) / 86_400_000));
      trialBy.set(p.profile_id, `Trial · ${days} day${days === 1 ? "" : "s"} left`);
    }
  }

  const listingsBy = new Map<string, Record<string, number>>();
  for (const l of (listings.data ?? []) as Array<{ profile_id: string; status: string }>) {
    const byStatus = listingsBy.get(l.profile_id) ?? {};
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
    listingsBy.set(l.profile_id, byStatus);
  }

  const leadsBy = new Map<string, number>();
  for (const l of (leads.data ?? []) as Array<{ owner_id: string }>) {
    leadsBy.set(l.owner_id, (leadsBy.get(l.owner_id) ?? 0) + 1);
  }

  const reportsBy = new Map<string, number>();
  for (const r of (reports.data ?? []) as Array<{ subject_id: string }>) {
    reportsBy.set(r.subject_id, (reportsBy.get(r.subject_id) ?? 0) + 1);
  }

  const weekAgo = Date.now() - 7 * 86_400_000;

  const rows: UserRow[] = base.map((r) => {
    const id = r.id as string;
    const name = (r.name as string) || "Unnamed";
    const state = ((r.state as string) ?? "active") as UserStatus;
    const byStatus = listingsBy.get(id) ?? {};
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const live = byStatus.live ?? 0;
    const pending = (byStatus.pending_review ?? 0) + (byStatus.payment_pending ?? 0);
    // The design writes this as a compact "10/2" beside the total, not as
    // prose — which also stops "3" and "1 live" reading as "31".
    const split = total === 0 ? "" : `${live}/${pending}`;

    return {
      id,
      name,
      initials: initialsOf(name),
      handle: r.username ? `@${r.username as string}` : "—",
      phone: (r.phone as string) ?? "—",
      role: (r.role as string) ?? null,
      roleLabel: ROLE_LABEL[(r.role as string) ?? ""] ?? "No role",
      city: cityName.get(r.city_id as string) ?? "—",
      verified: verifBy.get(id) ?? { id: false, rera: false },
      plans: plansBy.get(id) ?? [],
      trialLabel: trialBy.get(id) ?? null,
      listings: total,
      listingSplit: split,
      leads: leadsBy.get(id) ?? 0,
      joinedLabel: dayLabel(r.created_at as string),
      status: state,
      statusLabel: STATUS_LABEL[state] ?? state,
      isNew: new Date(r.created_at as string).getTime() > weekAgo,
      reports: reportsBy.get(id) ?? 0,
      deleted: state === "deleted",
    };
  });

  return { rows, total: count ?? 0, page, pageSize };
}

// ------------------------------------------------------------ filter options

export interface FilterOption {
  value: string;
  label: string;
}

export interface UserFilterOptions {
  roles: FilterOption[];
  statuses: FilterOption[];
  plans: FilterOption[];
  cities: FilterOption[];
  verifications: FilterOption[];
  joined: FilterOption[];
}

/**
 * Every option list comes from its own table (CLAUDE.md rule 7). Roles and
 * statuses are enum values on `profiles`, so they are read from the enum rather
 * than typed into the component.
 */
export async function userFilterOptions(): Promise<UserFilterOptions> {
  const db = createServiceClient();
  const [cities, catalog] = await Promise.all([
    db.from("locations").select("id, name").eq("level", "city").eq("is_active", true).eq("is_launched", true).order("name"),
    db.from("plan_catalog").select("code, name").eq("is_active", true).order("sort_order"),
  ]);

  return {
    roles: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })),
    statuses: USER_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
    plans: [
      { value: "none", label: "No plan" },
      ...((catalog.data ?? []) as Array<{ code: string; name: string }>).map((p) => ({ value: p.code, label: p.name })),
    ],
    cities: ((cities.data ?? []) as Array<{ id: string; name: string }>).map((c) => ({ value: c.id, label: c.name })),
    verifications: [
      { value: "id", label: "ID verified" },
      { value: "rera", label: "RERA verified" },
      { value: "none", label: "Not verified" },
    ],
    joined: [
      { value: "7d", label: "Last 7 days" },
      { value: "30d", label: "Last 30 days" },
      { value: "90d", label: "Last 90 days" },
      { value: "year", label: "Last year" },
    ],
  };
}

/** The design's "4,281 users" pill — every profile, filters aside. */
export async function totalUsers(): Promise<number> {
  const { count } = await createServiceClient()
    .from("profiles")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { LISTING_STATUS_LABEL, REVIEWABLE, STATUS_CHIPS } from "./listingStatuses";
import type { ListingFilterOptions, ListingFilters, MasterListingRow } from "./listingStatuses";

export type { ListingFilterOptions, ListingFilters, MasterListingRow };

/**
 * A12's reader (Doc5 A12 / designs P14 `listingsMasterEl`).
 *
 * A3 is the review QUEUE — only what is waiting on a decision. A12 is every
 * listing in every state, which is why it has its own reader: the status chips
 * are counted over the whole table, and "Trash" is a real state (deleted_at set)
 * rather than a filter over the live set.
 *
 * The counts on the chips are queried, not guessed, so a chip can never promise
 * rows the table then fails to show.
 */

export const EMPTY_LISTING_FILTERS: ListingFilters = {
  q: null,
  status: null,
  type: null,
  cityId: null,
  role: null,
  boosted: null,
  reported: null,
};

export function readListingFilters(sp: Record<string, string | string[] | undefined>): ListingFilters {
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : null;
  };
  return {
    q: one("q"),
    status: one("status"),
    type: one("type"),
    cityId: one("city"),
    role: one("role"),
    boosted: one("boosted"),
    reported: one("reported"),
  };
}

export interface ListingsMasterPage {
  rows: MasterListingRow[];
  total: number;
  counts: Record<string, number>;
  page: number;
  pageSize: number;
}

function initialsOf(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "??";
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase();
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const money = (paise: number | null, onRequest: boolean) =>
  onRequest ? "On request" : paise == null ? "—" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

export async function listingsMasterPage(
  filters: ListingFilters,
  page = 1,
  pageSize = 50,
): Promise<ListingsMasterPage> {
  const db = createServiceClient();

  // Chip counts over the WHOLE table, so a chip's number is the number of rows
  // clicking it will show. Counted with `head` rather than by reading the status
  // column and tallying it here — the client caps a read at 1000 rows, and a
  // tally over a truncated read is a number that goes quietly wrong once the
  // table outgrows the page (the same trap A10 hit on `locations`).
  const chipKeys = STATUS_CHIPS.filter((c) => c.key !== "all").map((c) => c.key);
  const countResults = await Promise.all([
    db.from("listings").select("id", { count: "exact", head: true }),
    ...chipKeys.map((k) => db.from("listings").select("id", { count: "exact", head: true }).eq("status", k)),
  ]);
  const counts: Record<string, number> = { all: countResults[0].count ?? 0 };
  chipKeys.forEach((k, i) => {
    counts[k] = countResults[i + 1].count ?? 0;
  });

  let q = db
    .from("listings")
    .select("id, title, type_code, kind, price_paise, price_on_request, area_label, status, profile_id, cover_url, created_at, city_id", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.type) q = q.eq("type_code", filters.type);
  if (filters.cityId) q = q.eq("city_id", filters.cityId);
  if (filters.q) {
    const raw = filters.q.trim();
    // A full uuid is an id lookup; anything else is a title search. The title
    // goes through `.ilike()` as a VALUE — not spliced into an `or()` string —
    // so a comma in "Showroom, Kothi" is just a character. Only the LIKE
    // wildcards themselves are escaped, so a literal % cannot match everything.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
      q = q.eq("id", raw);
    } else if (raw) {
      q = q.ilike("title", `%${raw.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    }
  }

  // Role, boosted and reported are all one-to-many, so they narrow by id set.
  if (filters.role) {
    const { data } = await db.from("profiles").select("id").eq("role", filters.role);
    const ids = ((data ?? []) as Array<{ id: string }>).map((p) => p.id);
    q = q.in("profile_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }

  let boostedIds: string[] | null = null;
  if (filters.boosted === "yes" || filters.boosted === "no") {
    const { data } = await db.from("boosts").select("listing_id").eq("status", "active");
    boostedIds = [...new Set(((data ?? []) as Array<{ listing_id: string | null }>).map((b) => b.listing_id).filter(Boolean) as string[])];
    if (filters.boosted === "yes") {
      q = q.in("id", boostedIds.length ? boostedIds : ["00000000-0000-0000-0000-000000000000"]);
    } else if (boostedIds.length) {
      q = q.not("id", "in", `(${boostedIds.join(",")})`);
    }
  }

  if (filters.reported === "yes") {
    const { data } = await db.from("reports").select("subject_id").eq("subject_type", "listing").in("status", ["open", "reviewing"]);
    const ids = [...new Set(((data ?? []) as Array<{ subject_id: string }>).map((r) => r.subject_id))];
    q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }

  const from = (page - 1) * pageSize;
  const { data, count } = await q.range(from, from + pageSize - 1);
  const base = (data ?? []) as Array<Record<string, unknown>>;
  const ids = base.map((r) => r.id as string);

  if (!ids.length) return { rows: [], total: count ?? 0, counts, page, pageSize };

  const posterIds = [...new Set(base.map((r) => r.profile_id as string).filter(Boolean))];
  const typeCodes = [...new Set(base.map((r) => r.type_code as string).filter(Boolean))];

  const [posters, types, boosts, reports] = await Promise.all([
    posterIds.length ? db.from("profiles").select("id, name, role").in("id", posterIds) : Promise.resolve({ data: [] }),
    typeCodes.length ? db.from("property_types").select("code, label").in("code", typeCodes) : Promise.resolve({ data: [] }),
    db.from("boosts").select("listing_id").eq("status", "active").in("listing_id", ids),
    db.from("reports").select("subject_id").eq("subject_type", "listing").in("status", ["open", "reviewing"]).in("subject_id", ids),
  ]);

  const posterOf = new Map(
    ((posters.data ?? []) as Array<{ id: string; name: string | null; role: string | null }>).map((p) => [p.id, p]),
  );
  const typeOf = new Map(((types.data ?? []) as Array<{ code: string; label: string }>).map((t) => [t.code, t.label]));
  const isBoosted = new Set(((boosts.data ?? []) as Array<{ listing_id: string }>).map((b) => b.listing_id));
  const reportsBy = new Map<string, number>();
  for (const r of (reports.data ?? []) as Array<{ subject_id: string }>) {
    reportsBy.set(r.subject_id, (reportsBy.get(r.subject_id) ?? 0) + 1);
  }

  const rows: MasterListingRow[] = base.map((r) => {
    const id = r.id as string;
    const p = posterOf.get(r.profile_id as string);
    const name = p?.name || "Unknown";
    const status = (r.status as string) ?? "draft";
    return {
      id,
      shortId: id.slice(0, 8),
      title: (r.title as string) ?? "Untitled",
      typeLabel: `${typeOf.get(r.type_code as string) ?? (r.type_code as string) ?? "—"} / ${r.kind === "rent" ? "Rent" : "Sale"}`,
      priceLabel: money(r.price_paise as number | null, Boolean(r.price_on_request)),
      location: (r.area_label as string) ?? "—",
      poster: {
        id: (r.profile_id as string) ?? "",
        name,
        initials: initialsOf(name),
        role: p?.role ? p.role[0].toUpperCase() + p.role.slice(1) : "—",
      },
      status,
      statusLabel: LISTING_STATUS_LABEL[status] ?? status,
      postedLabel: day(r.created_at as string),
      coverUrl: (r.cover_url as string) ?? null,
      boosted: isBoosted.has(id),
      reports: reportsBy.get(id) ?? 0,
      reviewHref: REVIEWABLE.includes(status)
        ? `/queues/listings/${id}`
        : null,
    };
  });

  return { rows, total: count ?? 0, counts, page, pageSize };
}

export async function listingFilterOptions(): Promise<ListingFilterOptions> {
  const db = createServiceClient();
  const [types, cities] = await Promise.all([
    db.from("property_types").select("code, label").eq("is_active", true).order("sort_order"),
    db.from("locations").select("id, name").eq("level", "city").eq("is_active", true).eq("is_launched", true).order("name"),
  ]);
  return {
    types: ((types.data ?? []) as Array<{ code: string; label: string }>).map((t) => ({ value: t.code, label: t.label })),
    cities: ((cities.data ?? []) as Array<{ id: string; name: string }>).map((c) => ({ value: c.id, label: c.name })),
    roles: [
      { value: "owner", label: "Owner" },
      { value: "broker", label: "Broker" },
      { value: "builder", label: "Builder" },
    ],
  };
}

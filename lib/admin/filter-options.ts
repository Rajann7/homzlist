import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The option lists the queues' filter sheets offer.
 *
 * The design draws them as literals — "Flat · Villa · Shop · Office · House",
 * "Rajkot · Ahmedabad · Surat" (template 1631). Shipping those literals would
 * be a filter that offers a type nobody can post and hides one they can:
 * CLAUDE.md bans option lists hardcoded in a component instead of read from a
 * config table, and this is exactly that case. `property_types` and `locations`
 * are the tables the CREATE form already uses, so the queue can only ever offer
 * what a seller could actually have chosen.
 */

export type Options = { value: string; label: string }[];

export type QueueFilterOptions = {
  types: Options;
  cities: Options;
  roles: Options;
  reportReasons: Options;
};

/** The three roles a poster can be — not a fourth invented for the filter. */
const ROLES: Options = [
  { value: "owner", label: "Owner" },
  { value: "broker", label: "Broker" },
  { value: "builder", label: "Builder" },
];

/**
 * A10/A12's own option lists, and the two counts their page headers print.
 *
 * The header badges are the design's "4,281 users" and "2,140" — real counts
 * over the whole table, not the length of the loaded page, because they sit
 * NEXT to a separate filtered count ("128 users") and the two must be able to
 * disagree honestly.
 */
export async function masterFilterOptions(): Promise<{ types: Options; cities: Options }> {
  const db = createServiceClient();
  const [{ data: types }, { data: projectTypes }, { data: cities }] = await Promise.all([
    db.from("property_types").select("code, label").eq("is_active", true).order("sort_order"),
    db.from("project_types").select("code, label").eq("is_active", true).order("sort_order"),
    // The cities that actually HAVE a listing, not all 104,612 rows of the
    // location master. A filter listing every city in India is unusable, and
    // one listing cities with nothing in them promises rows it cannot show.
    db.from("admin_listing_master").select("city_name").not("city_name", "is", null).limit(5000),
  ]);
  const all = [
    ...((types ?? []) as { code: string; label: string }[]),
    // A12 lists projects too, so its Type filter has to offer project types —
    // otherwise every builder row is unreachable through the filter.
    ...((projectTypes ?? []) as { code: string; label: string }[]),
  ];
  const seen = new Set<string>();
  return {
    types: all
      .filter((t) => (seen.has(t.code) ? false : (seen.add(t.code), true)))
      .map((t) => ({ value: t.code, label: t.label })),
    cities: [
      ...new Set(((cities ?? []) as { city_name: string }[]).map((c) => c.city_name)),
    ]
      .sort()
      .map((name) => ({ value: name, label: name })),
  };
}

export async function registeredUserCount(): Promise<number> {
  const db = createServiceClient();
  const { count } = await db
    .from("admin_user_list")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

export async function listingMasterCount(): Promise<number> {
  const db = createServiceClient();
  const { count } = await db
    .from("admin_listing_master")
    .select("id", { count: "exact", head: true })
    .neq("status_key", "trash");
  return count ?? 0;
}

export async function queueFilterOptions(): Promise<QueueFilterOptions> {
  const db = createServiceClient();

  const [{ data: types }, { data: cities }, { data: reasons }] = await Promise.all([
    db.from("property_types").select("code, label").eq("is_active", true).order("sort_order"),
    // FOUND IN P4: this read `.eq("kind","city")` and `locations` has no
    // `kind` column — it is `level`. PostgREST errored, `data` came back null,
    // and every queue's City filter has been silently EMPTY since P3: a pill
    // that opened onto no options at all. It is also scoped to launched cities
    // now, because the master table holds 104,612 of them.
    db
      .from("locations")
      .select("id, name")
      .eq("level", "city")
      .eq("is_launched", true)
      .order("name")
      .limit(60),
    db.from("reports").select("reason").limit(1000),
  ]);

  const reasonSet = new Set(
    ((reasons ?? []) as { reason: string | null }[]).map((r) => r.reason).filter(Boolean) as string[],
  );

  return {
    types: ((types ?? []) as { code: string; label: string }[]).map((t) => ({
      value: t.code,
      label: t.label,
    })),
    cities: ((cities ?? []) as { id: string; name: string }[]).map((c) => ({
      value: c.name,
      label: c.name,
    })),
    roles: ROLES,
    reportReasons: [...reasonSet].sort().map((r) => ({
      value: r,
      label: r.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    })),
  };
}

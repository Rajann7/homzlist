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

export async function queueFilterOptions(): Promise<QueueFilterOptions> {
  const db = createServiceClient();

  const [{ data: types }, { data: cities }, { data: reasons }] = await Promise.all([
    db.from("property_types").select("code, label").eq("is_active", true).order("sort_order"),
    // Only cities that actually have something in a queue would be ideal, but a
    // filter that changes its options as the queue drains is worse to use than
    // one that lists the launched cities. `locations` is the master list A19 owns.
    db.from("locations").select("id, name").eq("kind", "city").order("name").limit(60),
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

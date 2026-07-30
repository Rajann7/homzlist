import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The option lists A3's filter sheet renders (Doc5 A3: "filter chips
 * type/city/risk/date/role + clear").
 *
 * The design's sheet hardcodes `['Flat','Villa','Shop','Office','House']` and
 * `['Rajkot','Ahmedabad','Surat']` because it is a mock. Here they are the real
 * `property_types` and launched `locations` rows — CLAUDE.md rule 7: an option
 * list a screen renders comes from its config table, never from an array in a
 * component. A city HomzList has not launched in must not be offered as a filter.
 */

export interface FilterOption {
  value: string;
  label: string;
}

export interface QueueFilterOptions {
  types: FilterOption[];
  cities: FilterOption[];
  /** The three risk bands, which ARE a code-level rule (lib/admin/risk.bandOf). */
  risks: FilterOption[];
  roles: FilterOption[];
}

export async function queueFilterOptions(): Promise<QueueFilterOptions> {
  const db = createServiceClient();

  const [types, cities] = await Promise.all([
    db.from("property_types").select("code, label").eq("is_active", true).order("sort_order", { ascending: true }),
    db
      .from("locations")
      .select("id, name")
      .eq("level", "city")
      .eq("is_active", true)
      .eq("is_launched", true)
      .order("name", { ascending: true }),
  ]);

  return {
    types: ((types.data ?? []) as Array<Record<string, unknown>>).map((t) => ({
      value: t.code as string,
      label: t.label as string,
    })),
    cities: ((cities.data ?? []) as Array<Record<string, unknown>>).map((c) => ({
      value: c.id as string,
      label: c.name as string,
    })),
    // Bands come from `bandOf` (0–2 / 3–5 / 6+), not from a table: the scoring
    // rule is code Doc3 §1.4 fixes, and A25 shows it as a reference.
    risks: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
    // `profiles.role` — the three seller roles a poster can have.
    roles: [
      { value: "owner", label: "Owner" },
      { value: "broker", label: "Broker" },
      { value: "builder", label: "Builder" },
    ],
  };
}

import { ok, fail } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfileById } from "@/lib/profile/service";
import { getPropertyTypes, getFieldDefinitions, getAmenities, getFieldGroups } from "@/lib/listings/service";
import { typeConfigDTO } from "@/lib/listings/dto";
import { AREA_UNITS } from "@/lib/listings/validate";

/**
 * GET /api/v1/listings/config (Doc7 §43) — the dynamic field config.
 *
 * This is what makes "new property types = config only, no code" true (Doc2
 * §5.1). EVERYTHING the form renders comes from here:
 *   - which types exist (role-filtered — a Builder never sees PG/Hostel),
 *   - which fields each type shows,
 *   - the OPTIONS inside every field (BHK values, furnishing, facing…), and
 *   - the amenity master list.
 * Nothing is hardcoded client-side, so a new option is a database row.
 */
export const dynamic = "force-dynamic";

// Category labels are display chrome for the accordion, not business data.
const CATEGORY_LABELS: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  plot: "Plot / Land",
  pg: "PG / Hostel",
};

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) return fail("UNAUTHORIZED");

  const profile = await getProfileById(claims.sub);
  if (!profile) return fail("UNAUTHORIZED");

  const [types, fields, amenities, groups] = await Promise.all([
    getPropertyTypes(profile.role),
    getFieldDefinitions(),
    getAmenities(),
    getFieldGroups(),
  ]);

  return ok({
    role: profile.role,
    types: types.map(typeConfigDTO),
    // Keyed by field name so the form can look up a definition directly.
    fieldDefs: Object.fromEntries(fields.map((f) => [f.key, f])),
    // The titled blocks the form renders, in order (migration 0055). Data, so
    // adding a section is a row rather than a component change.
    fieldGroups: groups,
    amenities,
    // Derived from the types actually offered, so an empty category never shows.
    categories: [...new Set(types.map((t) => t.category))].map((key) => ({
      key,
      label: CATEGORY_LABELS[key] ?? key,
    })),
    areaUnits: AREA_UNITS,
  });
}

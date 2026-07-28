/**
 * Which title a `field_groups` section wears, for the thing that is rendering it.
 *
 * One global list of sections is what let an Agriculture Land listing show
 * "Parking & utilities" over water + electricity and "Building & ownership" over
 * facing + ownership (migration 0072). The rows are still one list — a section
 * simply carries an alternative title per scope.
 *
 * Resolution, most specific first:
 *    project:<category>   →   project   →   <category>   →   `label`
 *
 * Deliberately NOT in dto.ts: the creation form is a client component and must
 * resolve the same title from the same map, so a seller fills in the section a
 * buyer reads. No `server-only` import may reach this file.
 */

export interface GroupScope {
  /** A builder's scheme titles some sections differently from a property. */
  kind: "property" | "project";
  /** `property_types.category` / `project_types.category`. */
  category?: string | null;
}

export interface ScopedGroup {
  key: string;
  label: string;
  icon?: string | null;
  tone?: string | null;
  scope_labels?: Record<string, string> | null;
}

export function groupLabel(group: ScopedGroup, scope: GroupScope | undefined): string {
  const map = group.scope_labels;
  if (!map || !scope) return group.label;
  const category = scope.category ?? "";
  const keys = scope.kind === "project"
    ? [`project:${category}`, "project", category]
    : [category];
  for (const k of keys) {
    if (k && typeof map[k] === "string" && map[k]) return map[k];
  }
  return group.label;
}

/** The whole list, re-titled for one scope, order preserved. */
export function scopedGroups<T extends ScopedGroup>(groups: T[] | undefined, scope: GroupScope | undefined): T[] {
  return (groups ?? []).map((g) => ({ ...g, label: groupLabel(g, scope) }));
}

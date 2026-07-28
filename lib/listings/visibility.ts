/**
 * Conditional field visibility — ONE engine, used by the form and by the server.
 *
 * The rule lives in `field_definitions.show_if` (data, never a branch in a
 * component). It used to be a single `{field, in:[…]}` test, which could not
 * express the things the form actually needs:
 *
 *   - "Possession by" must appear for an under-construction build and NOT for a
 *     ready-to-move one — the driver has three values, so a second field has to
 *     read the same driver with the opposite set.
 *   - "Road width" is meaningless unless "Road touch" is on — a BOOLEAN test.
 *   - "Parking type" only matters once at least one parking count is above zero
 *     — a NUMERIC test, across two fields.
 *   - The furnishing checklist is driven by `furnishing` on a home and by
 *     `shell_state` on a shop — the same field, two different drivers.
 *
 * So a condition is one of:
 *   {field, in: [...]}      value is one of these
 *   {field, not_in: [...]}  value is none of these
 *   {field, eq: true|false} truthiness test (toggles)
 *   {field, gt: n}          numeric test
 *   {all: [...]}            every child matches
 *   {any: [...]}            at least one child matches
 *
 * The server uses this to STRIP hidden attributes before they are stored:
 * without that, filling in a possession date and then switching the property to
 * ready-to-move saves a possession date on a finished flat, and the detail
 * screen prints it.
 */

export type ShowIf =
  | { field: string; in?: string[]; not_in?: string[]; eq?: boolean; gt?: number }
  | { all: ShowIf[] }
  | { any: ShowIf[] };

/** Stepper/number values arrive as strings from the form; compare numerically. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** An unset toggle is `undefined`, not `false` — both mean "off". */
function truthy(v: unknown): boolean {
  return v === true || v === "true" || (typeof v === "number" && v !== 0);
}

export function matchesShowIf(cond: ShowIf | null | undefined, values: Record<string, unknown>): boolean {
  if (!cond) return true;
  if ("all" in cond) return cond.all.every((c) => matchesShowIf(c, values));
  if ("any" in cond) return cond.any.some((c) => matchesShowIf(c, values));

  const raw = values[cond.field];
  if (cond.eq !== undefined) return truthy(raw) === cond.eq;
  if (cond.gt !== undefined) return num(raw) > cond.gt;

  const v = raw === undefined || raw === null ? "" : String(raw);
  if (cond.in && !cond.in.includes(v)) return false;
  if (cond.not_in && cond.not_in.includes(v)) return false;
  return true;
}

/**
 * The keys a type asks for, for this kind. `fields` is common, `sell_fields`
 * and `rent_fields` are the per-kind extras — an ownership document and a bank
 * loan flag only make sense when the place is being SOLD, a deposit and a
 * lock-in only when it is being LET, and asking a landlord for "Approved for
 * bank loan" was pure noise on the screen.
 */
export function keysForKind(
  cfg: { fields?: string[]; sell_fields?: string[]; rent_fields?: string[] } | null | undefined,
  kind: string,
): string[] {
  const base = cfg?.fields ?? [];
  const extra = (kind === "rent" ? cfg?.rent_fields : cfg?.sell_fields) ?? [];
  // A key named in both lists must render once, in its `fields` position.
  return [...base, ...extra.filter((k) => !base.includes(k))];
}

/**
 * Resolve which of a type's keys are actually VISIBLE for a set of values.
 *
 * Iterated to a fixed point because conditions chain: `furnishing_details`
 * hangs off `furnishing`, and on a shop `furnishing` itself is absent so the
 * checklist has to fall to `shell_state`. Evaluating once in config order got
 * that wrong whenever a driver sat after its dependant in the array.
 */
export function visibleKeys(
  keys: string[],
  defs: Record<string, { showIf?: ShowIf | null } | undefined>,
  values: Record<string, unknown>,
): string[] {
  const present = new Set(keys);
  let current = new Set(keys);

  for (let pass = 0; pass < 5; pass++) {
    // A driver that the TYPE does not even ask for must not gate its dependant
    // — `road_width` on a type with no `road_touch` field would vanish forever.
    const scoped: Record<string, unknown> = {};
    for (const k of Object.keys(values)) scoped[k] = values[k];
    const next = new Set(
      keys.filter((k) => {
        const cond = defs[k]?.showIf;
        if (!cond) return true;
        return matchesShowIf(cond, maskHidden(scoped, present, current));
      }),
    );
    if (next.size === current.size && [...next].every((k) => current.has(k))) break;
    current = next;
  }
  return keys.filter((k) => current.has(k));
}

/**
 * A hidden field's value must not drive anything else. Otherwise a stale
 * "Furnished" left over from before the user switched to ready-to-move keeps
 * the checklist on screen after its own driver disappeared.
 */
function maskHidden(values: Record<string, unknown>, present: Set<string>, visible: Set<string>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (present.has(k) && !visible.has(k)) continue;
    out[k] = v;
  }
  return out;
}

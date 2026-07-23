/**
 * Field TYPES for the dynamic listing form.
 *
 * The definitions themselves — labels, controls, and every option list — live
 * in the `field_definitions` table and arrive via `/listings/config`
 * (Doc2 §5.1: "new types = config only"). This file deliberately contains NO
 * option data: adding a BHK value or a facing direction is a database row, not
 * a code change.
 */

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  /**
   * `multi` is a chip row that keeps an array (furnishing checklist);
   * `stepper` is a −/count/+ row for things you count (car parking).
   */
  control: "chips" | "select" | "multi" | "stepper" | "toggle" | "number" | "text" | "area";
  options?: FieldOption[];
  // Nullable because these arrive straight from nullable DB columns.
  placeholder?: string | null;
  hint?: string | null;
  /**
   * Conditional visibility, from the DB. Possession only exists while the
   * build is unfinished; the furnishing checklist only once furnishing is set.
   */
  showIf?: { field: string; in: string[] } | null;
  /**
   * Area unit set for an `area` control: 'land' shows Vigha/Guntha/Acre,
   * 'built' shows sq ft/yard/m. Null falls back to the type's areaUnits flag.
   */
  units?: "land" | "built" | null;
}

export interface Amenity {
  code: string;
  label: string;
  category: string;
  categories: string[];
}

/** Server-provided definitions, keyed by field name. */
export type FieldDefMap = Record<string, FieldDef>;

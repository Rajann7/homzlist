/**
 * Field TYPES for the dynamic listing form.
 *
 * The definitions themselves — labels, controls, and every option list — live
 * in the `field_definitions` table and arrive via `/listings/config`
 * (Doc2 §5.1: "new types = config only"). This file deliberately contains NO
 * option data: adding a BHK value or a facing direction is a database row, not
 * a code change.
 */

import type { ShowIf } from "@/lib/listings/visibility";

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
  control: "chips" | "select" | "multi" | "stepper" | "toggle" | "number" | "text" | "area" | "date";
  options?: FieldOption[];
  // Nullable because these arrive straight from nullable DB columns.
  placeholder?: string | null;
  hint?: string | null;
  /**
   * Conditional visibility, from the DB. Possession only exists while the
   * build is unfinished; the furnishing checklist only once furnishing is set;
   * road width only once the plot is road-touching. The grammar and the single
   * evaluator both live in `lib/listings/visibility` — the server runs the same
   * one to strip a hidden field's value before it can be stored.
   */
  showIf?: ShowIf | null;
  /**
   * Area unit set for an `area` control: 'land' shows Vigha/Guntha/Acre,
   * 'built' shows sq ft/yard/m. Null falls back to the type's areaUnits flag.
   */
  units?: "land" | "built" | null;
  /**
   * Which titled block of the form the field belongs in (migration 0055). Every
   * type lays its fields out in the same group order, so the form reads the same
   * way whether you're listing a flat or a godown.
   */
  group?: string | null;
}

/** A form section, from `field_groups`. */
export interface FieldGroup {
  key: string;
  label: string;
  sort_order: number;
  /**
   * Alternative titles per scope (0072). The form resolves the same title the
   * detail screen shows, so a seller fills in "Water & power" on a plot rather
   * than "Parking & utilities" and then reads a different heading back.
   */
  scope_labels?: Record<string, string> | null;
}

export interface Amenity {
  code: string;
  label: string;
  category: string;
  categories: string[];
}

/** Server-provided definitions, keyed by field name. */
export type FieldDefMap = Record<string, FieldDef>;

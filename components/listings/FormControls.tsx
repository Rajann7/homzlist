"use client";

import { useState } from "react";
import { BottomSheet, Icon, Toggle } from "@/components/billing/ui";
import type { FieldDef, FieldDefMap } from "./fields";
import { visibleKeys } from "@/lib/listings/visibility";
import { cn } from "@/lib/utils";

/**
 * The creation forms' shared controls.
 *
 * Both the listing form and the project form render fields the SERVER named,
 * from the same `field_definitions` table, under the same `field_groups`
 * headings, with the same conditional-visibility rules. They were two separate
 * implementations of that, and had already drifted: the project form hardcoded
 * its own option lists and asked a finished scheme for its possession date —
 * the exact bug the listing form had just been fixed for. One set of controls
 * is what stops that happening a third time.
 */

export const inputCls = (err?: string) =>
  cn(
    "h-11 w-full rounded-6 border bg-surface-2 px-3 text-15 text-ink-primary outline-none focus:border-accent",
    err ? "border-error" : "border-border",
  );

/** An `area` value is {value, unit} and a multi-select is an array — a filled
 *  count that treated either as "answered" the moment it was touched was wrong. */
export function hasValue(v: unknown): boolean {
  if (v === undefined || v === null || v === "" || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Boolean((v as { value?: unknown }).value);
  if (typeof v === "number") return v !== 0;
  return true;
}

/**
 * One foldable block of detail fields.
 *
 * A showroom asks 33 questions. Before this they were one unbroken column, so
 * the seller scrolled past everything to reach Price and the optional two
 * thirds were the same weight as the required ones. The header states what is
 * inside — how many of its fields are answered, and whether any of them is
 * mandatory — so folding hides nothing the seller needs to know about.
 */
export function CollapsibleSection({
  label, open, filled, total, required, error, onToggle, children,
}: {
  label: string; open: boolean; filled: number; total: number;
  required: boolean; error: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-8 border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="chrome flex w-full items-center gap-3 bg-surface-2 px-3.5 py-3 text-left active:bg-surface-3"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-13 font-semibold uppercase tracking-[0.04em] text-ink-secondary">
            {label}
            {required && <span className="ml-1 text-error">*</span>}
          </span>
          <span className={cn("mt-0.5 block text-11", error ? "text-error" : "text-ink-tertiary")}>
            {error ? "Needs attention" : `${filled} of ${total} filled`}
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={18}
          className={cn("shrink-0 text-ink-tertiary transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && <div className="flex flex-col gap-4 border-t border-divider p-3.5">{children}</div>}
    </section>
  );
}

/**
 * One labelled field. Metrics are the design's (`fLabel` / `helper` /
 * `errLine`): label 13/600 ink2 with 6px below, helper and error 11px at 6px
 * above, and the error carries the alert glyph the design draws.
 */
export function Field({ id, label, required, error, warning, hint, children }: { id?: string; label: string; required?: boolean; error?: string; warning?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="flex flex-col">
      <label className="mb-1.5 text-13 font-semibold leading-none text-ink-secondary">
        {label}
        {/* The type's `required` list is server config, so the marker is too —
            the form used to look identical whether a field blocked submit. */}
        {required && <span className="ml-0.5 text-error">*</span>}
      </label>
      {children}
      {/* Errors block; warnings are advice and never prevent submitting. */}
      {error && (
        <div className="mt-1.5 flex items-center gap-1.5 text-11 leading-none text-error">
          <Icon name="alert" size={14} className="shrink-0" />
          {error}
        </div>
      )}
      {!error && warning && (
        <div className="mt-1.5 flex items-center gap-1.5 text-11 leading-none text-warning">
          <Icon name="alert" size={14} className="shrink-0" />
          {warning}
        </div>
      )}
      {!error && !warning && hint && (
        <div className="mt-1.5 text-11 leading-[1.3] text-ink-tertiary">{hint}</div>
      )}
    </div>
  );
}

export function ToggleRow({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-6 bg-surface-2 px-3.5 py-3">
      <div className="flex-1">
        <div className="text-15 text-ink-primary">{label}</div>
        {sub && <div className="mt-0.5 text-11 text-ink-tertiary">{sub}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

/**
 * The unit list comes from the SERVER (`area_units`, migration 0068) — it used
 * to be these two arrays, hardcoded here, with the conversion factors in a
 * third place. `unitSet` decides which rows a field offers: a built structure
 * is measured in sq ft/yard/m, land adds the Gujarat units.
 *
 * The fallback is deliberately just sq ft: if the config hasn't arrived the
 * control must still be usable, and sq ft is the canonical unit everything is
 * stored in — never a guess at the rest of the list.
 */
export interface AreaUnitOption { code: string; label: string; unitSet: "land" | "built" | "both" }
const FALLBACK_UNITS: AreaUnitOption[] = [{ code: "sqft", label: "sq ft", unitSet: "both" }];

export function DynamicField({ def, value, onChange, error, required, onOpenSheet, landUnits, areaUnits }: { def: FieldDef; value: any; onChange: (v: unknown | ((prev: any) => unknown)) => void; error?: string; required?: boolean; onOpenSheet: () => void; landUnits?: boolean; areaUnits?: AreaUnitOption[] }) {
  if (def.control === "chips") {
    return (
      <Field id={`f-${def.key}`} label={def.label} required={required} error={error}>
        <div className="flex flex-wrap gap-2">
          {(def.options ?? []).map((o) => (
            <button
              key={o.value}
              onClick={() => onChange(value === o.value ? null : o.value)}
              className={cn(
                "h-9 rounded-6 px-3.5 text-13 font-semibold",
                value === o.value ? "bg-ink-primary text-page" : "bg-surface-2 text-ink-secondary",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Field>
    );
  }

  // Multi-pick chips: the furnishing checklist is a LIST of what's included,
  // not one item. Toggled inside the updater so two fast taps can't collide.
  if (def.control === "multi") {
    const picked: string[] = Array.isArray(value) ? value : [];
    return (
      <Field id={`f-${def.key}`} label={def.label} required={required} error={error}>
        <div className="flex flex-wrap gap-2">
          {(def.options ?? []).map((o) => {
            const on = picked.includes(o.value);
            return (
              <button
                key={o.value}
                // Updater form — see `set` above for why this must not read
                // `picked` from the closure.
                onClick={() =>
                  onChange((prev: unknown) => {
                    const cur: string[] = Array.isArray(prev) ? prev : [];
                    return cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value];
                  })
                }
                className={cn(
                  "h-9 rounded-6 px-3.5 text-13 font-semibold",
                  on ? "bg-ink-primary text-page" : "bg-surface-2 text-ink-secondary",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </Field>
    );
  }

  if (def.control === "stepper") {
    const n = Number(value ?? 0) || 0;
    return (
      <div className="flex items-center gap-3 rounded-6 bg-surface-2 px-3.5 py-2.5">
        <div className="flex-1 text-15 text-ink-primary">{def.label}</div>
        <button
          aria-label={`Decrease ${def.label}`}
          disabled={n <= 0}
          onClick={() => onChange((p: unknown) => Math.max(0, (Number(p ?? 0) || 0) - 1))}
          className="chrome grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-ink-primary disabled:opacity-40"
        >
          <Icon name="minus" size={16} />
        </button>
        <span className="w-6 text-center text-15 font-semibold tabular-nums text-ink-primary">{n}</span>
        <button
          aria-label={`Increase ${def.label}`}
          disabled={n >= 9}
          onClick={() => onChange((p: unknown) => Math.min(9, (Number(p ?? 0) || 0) + 1))}
          className="chrome grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-ink-primary disabled:opacity-40"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
    );
  }

  if (def.control === "select") {
    const label = def.options?.find((o) => o.value === value)?.label;
    return (
      <Field id={`f-${def.key}`} label={def.label} required={required} error={error}>
        <button onClick={onOpenSheet} className={cn(inputCls(error), "flex items-center text-left")}>
          <span className={cn("flex-1", label ? "text-ink-primary" : "text-ink-tertiary")}>{label ?? `Select ${def.label.toLowerCase()}`}</span>
          <Icon name="chevron-down" size={18} className="text-ink-tertiary" />
        </button>
      </Field>
    );
  }

  if (def.control === "toggle") {
    return <ToggleRow label={def.label} checked={!!value} onChange={onChange} />;
  }

  if (def.control === "area") {
    // Units are per-FIELD first (a farmhouse's land row is Vigha while its
    // construction row is sq ft), falling back to the type flag. Offering
    // "3 acre" as a flat's built-up area was never in the design.
    const useLand = def.units ? def.units === "land" : landUnits;
    const all = areaUnits?.length ? areaUnits : FALLBACK_UNITS;
    const units = all.filter((u) => u.unitSet === "both" || u.unitSet === (useLand ? "land" : "built"));
    const defaultUnit = units[0]?.code ?? "sqft";
    return (
      <Field id={`f-${def.key}`} label={def.label} required={required} error={error} hint={def.hint ?? "Converted automatically for search"}>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            value={value?.value ?? ""}
            // The unit is written with the value, not only when the <select> is
            // touched. It defaulted to sq ft on screen but stored nothing, so
            // "50" was saved with no unit at all and every reader had to assume
            // one — a silent guess on the number a plot is judged by.
            onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); onChange((prev: any) => ({ ...(prev ?? {}), value: v, unit: prev?.unit ?? defaultUnit })); }}
            placeholder="0"
            className={inputCls(error)}
          />
          <select
            value={value?.unit ?? defaultUnit}
            onChange={(e) => { const u = e.target.value; onChange((prev: any) => ({ ...(prev ?? {}), unit: u })); }}
            className="h-11 shrink-0 rounded-6 border border-border bg-surface-2 px-2 text-15 text-ink-primary outline-none"
          >
            {units.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}
          </select>
        </div>
      </Field>
    );
  }

  // A real date picker. "Available from" was a text box with a YYYY-MM-DD
  // placeholder, so it collected "next month" and "1/2/26" — neither of which
  // the `available_from` DATE column can store, so the value was dropped on
  // save and the listing showed no availability at all.
  if (def.control === "date") {
    return (
      <Field id={`f-${def.key}`} label={def.label} required={required} error={error} hint={def.hint ?? undefined}>
        <input
          type="date"
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onChange(e.target.value || null)}
          className={inputCls(error)}
        />
      </Field>
    );
  }

  // number | text
  return (
    <Field id={`f-${def.key}`} label={def.label} required={required} error={error} hint={def.hint ?? undefined}>
      <input
        inputMode={def.control === "number" ? "numeric" : "text"}
        value={value ?? ""}
        onChange={(e) => onChange(def.control === "number" ? e.target.value.replace(/\D/g, "") : e.target.value)}
        placeholder={def.placeholder ?? undefined}
        className={inputCls(error)}
      />
    </Field>
  );
}

/**
 * A whole set of server-named fields, laid out in the shared collapsible
 * blocks — the piece both creation forms actually call.
 *
 * `keys` is what the chosen type asks for; which of them are on screen is
 * decided here by `visibleKeys`, the same evaluator the server re-runs before
 * storing anything. So a field that vanishes cannot be submitted, and a field
 * that is submitted was on screen.
 */
export function DynamicSections({
  keys, defs, groups, values, errors = {}, required = [], landUnits, areaUnits, onChange, fallbackLabel = "Details",
}: {
  keys: string[];
  defs: FieldDefMap;
  groups: { key: string; label: string }[];
  values: Record<string, any>;
  errors?: Record<string, string>;
  required?: string[];
  landUnits?: boolean;
  /** The area-unit master from /listings/config (migration 0068). */
  areaUnits?: AreaUnitOption[];
  onChange: (key: string, v: unknown | ((prev: any) => unknown)) => void;
  /** Heading for fields whose group an admin hasn't filed yet. */
  fallbackLabel?: string;
}) {
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<FieldDef | null>(null);

  const shown = visibleKeys(keys.filter((k) => defs[k]), defs, values);
  const fields = shown.map((k) => defs[k]) as FieldDef[];

  const grouped = groups
    .map((g) => ({ key: g.key, label: g.label, items: fields.filter((f) => f.group === g.key) }))
    .filter((s) => s.items.length);
  const ungrouped = fields.filter((f) => !f.group || !groups.some((g) => g.key === f.group));
  const sections = ungrouped.length
    ? [...grouped, { key: "_other", label: fallbackLabel, items: ungrouped }]
    : grouped;

  if (!sections.length) return null;

  return (
    <>
      {sections.map((s, i) => {
        const sKeys = s.items.map((f) => f.key);
        const filled = sKeys.filter((k) => hasValue(values[k])).length;
        const needed = sKeys.filter((k) => required.includes(k));
        const hasError = sKeys.some((k) => errors[k]);
        // Open when the block holds something mandatory, when it already has an
        // answer (a resumed draft or an edit), or when it is the first block.
        const open = folded[s.key] === undefined
          ? Boolean(needed.length || filled || i === 0 || hasError)
          : !folded[s.key];
        return (
          <CollapsibleSection
            key={s.key}
            label={s.label}
            open={open || hasError}
            filled={filled}
            total={sKeys.length}
            required={needed.length > 0}
            error={hasError}
            onToggle={() => setFolded((f) => ({ ...f, [s.key]: open }))}
          >
            {s.items.map((f) => (
              <DynamicField
                key={f.key}
                def={f}
                value={values[f.key]}
                onChange={(v) => onChange(f.key, v)}
                error={errors[f.key]}
                required={required.includes(f.key)}
                onOpenSheet={() => setSheet(f)}
                landUnits={landUnits}
                areaUnits={areaUnits}
              />
            ))}
          </CollapsibleSection>
        );
      })}

      <OptionSheet
        field={sheet}
        value={sheet ? values[sheet.key] : null}
        onPick={(v) => { if (sheet) onChange(sheet.key, v); setSheet(null); }}
        onClose={() => setSheet(null)}
      />
    </>
  );
}

/** The picker a `select` control opens. Shared so both forms show one sheet. */
export function OptionSheet({
  field, value, onPick, onClose,
}: { field: FieldDef | null; value: unknown; onPick: (v: string) => void; onClose: () => void }) {
  return (
    <BottomSheet open={!!field} onClose={onClose} title={field?.label ?? ""}>
      <div className="flex flex-col gap-2 pb-2">
        {(field?.options ?? []).map((o) => (
          <button
            key={o.value}
            onClick={() => onPick(o.value)}
            className={cn(
              "flex h-12 items-center rounded-6 px-4 text-left text-15",
              value === o.value ? "bg-accent-soft font-semibold text-accent" : "bg-surface-2 text-ink-primary",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

/**
 * The creation forms' option chip.
 *
 * Deliberately NOT the app-wide pill `Chip`: that one is the feed and search
 * filter chip and appears on thirty other screens, where the design's full
 * radius stays. Inside a form these sit next to inputs and selects, so they
 * take the same 6px the rest of the controls do — a pill beside a square input
 * is the mismatch the tighter-radius pass was for.
 */
export function OptionChip({
  selected, onClick, children,
}: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "h-9 rounded-6 px-3.5 text-13 font-semibold",
        selected ? "bg-ink-primary text-page" : "bg-surface-2 text-ink-secondary",
      )}
    >
      {children}
    </button>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BottomSheet, Icon, Spinner, useToast } from "@/components/billing/ui";
import { listingsApi, type LocationNode } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * The location cascade and the pincode field, shared by the listing form, the
 * project form and the requirement form.
 *
 * Two things make this its own component rather than three copies of a
 * `<select>`:
 *
 * 1. SEARCH IS MANDATORY. The location master is the full India Post directory
 *    (migration 0054): 36 states, 658 districts, 7,168 talukas, 104,612
 *    cities/villages and 50,940 areas. A district can hold five hundred
 *    villages, so every sheet searches server-side and pages at 100 results.
 *
 * 2. PINCODE IS DERIVED, NOT TYPED. It is a required field, and the value comes
 *    from the chosen city/area's own postal codes — Rajkot has fourteen,
 *    Bengaluru a hundred and six. Picking the area usually narrows it to one,
 *    which is then selected automatically.
 */

export interface LocationValue {
  stateId: string | null;
  districtId: string | null;
  talukaId: string | null;
  cityId: string | null;
  areaId: string | null;
  areaLabel: string | null;
  pincode: string | null;
}

const LEVELS = [
  { level: "state", key: "stateId", label: "State", parentKey: null },
  { level: "district", key: "districtId", label: "District", parentKey: "stateId" },
  { level: "taluka", key: "talukaId", label: "Taluka", parentKey: "districtId" },
  { level: "city", key: "cityId", label: "City / Village", parentKey: "talukaId" },
  { level: "area", key: "areaId", label: "Area / Landmark", parentKey: "cityId" },
] as const;

type LevelKey = (typeof LEVELS)[number]["key"];

export function LocationCascade({
  values,
  set,
  errors,
  /** Area is optional on a listing; a requirement wants only down to the city. */
  deepest = "areaId",
}: {
  values: Record<string, any>;
  set: (k: string, v: unknown) => void;
  errors?: Record<string, string>;
  deepest?: LevelKey;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  /** Resolved names for whatever ids are currently held, so an edit re-opens on them. */
  const [names, setNames] = useState<Record<string, string>>({});
  const [requesting, setRequesting] = useState(false);

  const levels = LEVELS.slice(0, LEVELS.findIndex((l) => l.key === deepest) + 1);
  const ids = levels.map((l) => values[l.key] ?? "").join("|");

  // Resolve the held ids to names in ONE request. The old cascade loaded every
  // level's full child list just to find the selected row's label, which is a
  // 500-row download per level now that the master is real.
  useEffect(() => {
    const held = levels.map((l) => values[l.key]).filter(Boolean) as string[];
    const missing = held.filter((id) => !names[id]);
    if (!missing.length) return;
    void listingsApi.locationsByIds(missing).then((r) => {
      if (r.ok) setNames((n) => ({ ...n, ...Object.fromEntries(r.data.items.map((i) => [i.id, i.name])) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return (
    <>
      {levels.map((l, i) => {
        const parentId = l.parentKey ? values[l.parentKey] : null;
        const disabled = i > 0 && !parentId;
        const chosenName = values[l.key] ? names[values[l.key]] : null;
        const error = errors?.[l.key];

        return (
          <Field key={l.key} id={`f-${l.key}`} label={l.label} required={l.key === "cityId"} error={error}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setOpen(l.level)}
              className={cn(fieldButtonCls(error), disabled && "opacity-50")}
            >
              <span className={cn("flex-1 truncate", chosenName ? "text-ink-primary" : "text-ink-tertiary")}>
                {chosenName ?? (disabled ? `Choose ${levels[i - 1].label.toLowerCase()} first` : `Select ${l.label.toLowerCase()}`)}
              </span>
              <Icon name="chevron-down" size={18} className="shrink-0 text-ink-tertiary" />
            </button>

            <SearchSheet
              open={open === l.level}
              title={l.label}
              level={l.level}
              parentId={parentId ?? null}
              selectedId={values[l.key] ?? null}
              onClose={() => setOpen(null)}
              onPick={(node) => {
                setNames((n) => ({ ...n, [node.id]: node.name }));
                set(l.key, node.id);
                // Choosing a parent invalidates everything below it, pincode
                // included — a code from the old city is worse than none.
                levels.slice(i + 1).forEach((deeper) => set(deeper.key, null));
                if (l.key !== "areaId") set("areaLabel", null);
                set("pincode", null);
                if (l.key === "areaId") {
                  const city = values.cityId ? names[values.cityId] : null;
                  set("areaLabel", city ? `${node.name}, ${city}` : node.name);
                }
                setOpen(null);
              }}
              footer={
                l.level === "area" ? (
                  <button
                    type="button"
                    disabled={requesting}
                    onClick={async () => {
                      const name = window.prompt("Which area is missing?");
                      if (!name) return;
                      setRequesting(true);
                      const r = await listingsApi.requestArea(name, values.cityId ?? null);
                      setRequesting(false);
                      toast.show(r.ok ? "Requested — we'll notify you when it's added" : "Couldn't send that request");
                      setOpen(null);
                    }}
                    className="tap44 mt-2 w-full text-center text-13 font-semibold text-accent"
                  >
                    Can&apos;t find your area? Request it
                  </button>
                ) : null
              }
            />
          </Field>
        );
      })}
    </>
  );
}

/**
 * Pincode — required, and chosen from the codes the selected place actually
 * covers. Free text produced typos and, far more often, nulls: the column was
 * empty on most rows even though every area page wants a postal anchor.
 */
export function PincodeField({
  cityId,
  areaId,
  value,
  onChange,
  error,
}: {
  cityId: string | null;
  areaId: string | null;
  value: string | null;
  onChange: (v: string | null) => void;
  error?: string;
}) {
  const [options, setOptions] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  // `onChange` is a new closure every render; keeping it in a ref stops the
  // fetch effect from re-running on each keystroke elsewhere in the form.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!cityId) { setOptions(null); return; }
    let live = true;
    setOptions(null);
    void listingsApi.pincodes(cityId, areaId).then((r) => {
      if (!live) return;
      const list = r.ok ? r.data.pincodes : [];
      setOptions(list);
      // One code for this locality is not a choice — fill it in. Anything else
      // stays the user's pick, and an existing value is left alone if it's
      // still valid for the place they chose.
      if (list.length === 1) onChangeRef.current(list[0]);
    });
    return () => { live = false; };
  }, [cityId, areaId]);

  const empty = options !== null && options.length === 0;

  return (
    <Field
      id="f-pincode"
      label="Pincode"
      required
      error={error}
      hint={
        !cityId ? "Select a city first — we'll list its pincodes."
          : empty ? "No pincode on record for this area — type the 6-digit code."
          : options && options.length > 1 ? `${options.length} pincodes cover this area`
          : undefined
      }
    >
      {/* With nothing on record the field falls back to a typed code rather
          than leaving the user stuck on a required field they cannot fill. */}
      {empty ? (
        <input
          inputMode="numeric"
          maxLength={6}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6) || null)}
          placeholder="360004"
          className={inputCls(error)}
        />
      ) : (
        <button
          type="button"
          disabled={!cityId}
          onClick={() => setOpen(true)}
          className={cn(fieldButtonCls(error), !cityId && "opacity-50")}
        >
          <span className={cn("flex-1 tabular-nums", value ? "text-ink-primary" : "text-ink-tertiary")}>
            {value ?? (cityId ? (options === null ? "Loading…" : "Select pincode") : "Select a city first")}
          </span>
          {options === null && cityId ? <Spinner size={16} /> : <Icon name="chevron-down" size={18} className="text-ink-tertiary" />}
        </button>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Pincode">
        <div className="grid grid-cols-3 gap-2 pb-2">
          {(options ?? []).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { onChange(p); setOpen(false); }}
              className={cn(
                "h-11 rounded-8 text-15 tabular-nums",
                value === p ? "bg-accent-soft font-semibold text-accent" : "bg-surface-2 text-ink-primary",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </BottomSheet>
    </Field>
  );
}

/* ------------------------------------------------------------------ sheet */

/**
 * One level's picker. Every keystroke is a server search (debounced), because
 * the alternative — download the parent's children and filter locally — means
 * shipping five hundred rows to find one.
 */
function SearchSheet({
  open, title, level, parentId, selectedId, onClose, onPick, footer,
}: {
  open: boolean;
  title: string;
  level: string;
  parentId: string | null;
  selectedId: string | null;
  onClose: () => void;
  onPick: (node: LocationNode) => void;
  footer?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LocationNode[] | null>(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async (term: string) => {
    const r = await listingsApi.locations(level, parentId, term || null);
    if (r.ok) { setItems(r.data.items); setTruncated(r.data.truncated); }
    else { setItems([]); setTruncated(false); }
  }, [level, parentId]);

  useEffect(() => {
    if (!open) { setQ(""); setItems(null); return; }
    setItems(null);
    const t = setTimeout(() => void load(q), q ? 220 : 0);
    return () => clearTimeout(t);
  }, [open, q, load]);

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex h-[62vh] flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 rounded-8 bg-surface-2 px-3">
          <Icon name="search" size={18} className="text-ink-tertiary" strokeWidth={1.7} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            autoComplete="off"
            className="w-full bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
          />
          {q && (
            <button type="button" aria-label="Clear" onClick={() => setQ("")} className="text-ink-tertiary">
              <Icon name="close" size={16} strokeWidth={1.7} />
            </button>
          )}
        </div>

        <div className="mt-3 flex-1 overflow-y-auto overscroll-contain">
          {items === null && (
            <div className="grid place-items-center py-10"><Spinner size={22} /></div>
          )}

          {items?.length === 0 && (
            <p className="py-8 text-center text-13 text-ink-secondary">
              {q ? `Nothing matching "${q}".` : "Nothing here yet."}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {(items ?? []).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onPick(n)}
                className={cn(
                  "flex h-12 shrink-0 items-center gap-2 rounded-8 px-4 text-left text-15",
                  selectedId === n.id ? "bg-accent-soft font-semibold text-accent" : "bg-surface-2 text-ink-primary",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{n.name}</span>
                {n.pincode && <span className="shrink-0 text-11 tabular-nums text-ink-tertiary">{n.pincode}</span>}
                {selectedId === n.id && <Icon name="check" size={18} className="shrink-0" />}
              </button>
            ))}
          </div>

          {/* Honest about the cap rather than silently showing the first 100. */}
          {truncated && (
            <p className="py-3 text-center text-11 text-ink-tertiary">
              Showing the first 100 — type to narrow it down.
            </p>
          )}

          {footer}
        </div>
      </div>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------- primitives */

export const inputCls = (err?: string) =>
  cn(
    "h-11 w-full rounded-8 border bg-surface-2 px-3 text-15 text-ink-primary outline-none focus:border-accent",
    err ? "border-error" : "border-border",
  );

const fieldButtonCls = (err?: string) => cn(inputCls(err), "flex items-center gap-2 text-left");

/** Same metrics as the listing form's own `Field`, with a required marker. */
export function Field({
  id, label, required, error, hint, children,
}: {
  id?: string; label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div id={id} className="flex flex-col">
      <label className="mb-1.5 text-13 font-semibold leading-none text-ink-secondary">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </label>
      {children}
      {error ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-11 leading-none text-error">
          <Icon name="alert" size={14} className="shrink-0" />
          {error}
        </div>
      ) : hint ? (
        <div className="mt-1.5 text-11 leading-[1.3] text-ink-tertiary">{hint}</div>
      ) : null}
    </div>
  );
}

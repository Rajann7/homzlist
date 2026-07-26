"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { searchApi, filtersToQuery, type SearchConfigResponse, type SearchFilters } from "@/lib/search/client";
import { cn } from "@/lib/utils";

/**
 * P3 S3 — FILTER SHEET (90% height) + the nested location sheet.
 *
 * Sections, in the design's order: Looking to · Property type · [dynamic
 * per-type sections] · Budget (dual slider) · Location (nested sheet, stacked)
 * · Amenities · More toggles. Sticky bottom bar: "Clear all" + "Show N
 * properties" with N live.
 *
 * NOTHING in this sheet is a hardcoded list. The type chips, the amenity chips,
 * which sections a type reveals, and every option inside them come from
 * `/search/config`, which reads property_types + amenities + field_definitions
 * + search_filter_facets (CLAUDE.md rule 12). Selecting "Flat" reveals BHK /
 * Bathrooms / Furnishing / Floor / Facing because those are the fields the FLAT
 * type declares — not because this file says so.
 *
 * The count on the button is `GET /search?count=1` — the exact same predicate
 * the results page runs, so the button can never promise a number the results
 * do not deliver.
 */

export interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onApply: (next: SearchFilters) => void;
  onClearAll: () => void;
}

export function FilterSheet({ open, onClose, filters, onApply, onClearAll }: FilterSheetProps) {
  const [config, setConfig] = useState<SearchConfigResponse | null>(null);
  const [draft, setDraft] = useState<SearchFilters>(filters);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  // Re-seed the draft each time the sheet opens so a dismissed edit is discarded.
  useEffect(() => { if (open) setDraft(filters); }, [open, filters]);

  useEffect(() => {
    if (!open || config) return;
    void (async () => {
      const r = await searchApi.config(filters.cityId);
      if (r.ok) setConfig(r.data);
    })();
  }, [open, config, filters.cityId]);

  // ---- live count (debounced) ---------------------------------------------
  useEffect(() => {
    if (!open) return;
    setCounting(true);
    const t = setTimeout(async () => {
      const r = await searchApi.count(filtersToQuery(draft));
      if (r.ok) setCount(r.data.total);
      setCounting(false);
    }, 220);
    return () => clearTimeout(t);
  }, [draft, open]);

  // Esc + body-scroll lock, matching BottomSheet's behaviour.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Sheet stacking: Esc closes the TOP sheet only (Doc1 §4).
      if (locationOpen) setLocationOpen(false);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, locationOpen, onClose]);

  if (!open) return null;

  // ---- helpers -------------------------------------------------------------
  const toggleIn = (key: "types" | "areas" | "amenities", value: string) =>
    setDraft((d) => {
      const cur = d[key] ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...d, [key]: next.length ? next : undefined };
    });

  const toggleAttr = (key: string, value: string) =>
    setDraft((d) => {
      const attrs = { ...(d.attrs ?? {}) };
      const cur = attrs[key] ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      if (next.length) attrs[key] = next; else delete attrs[key];
      return { ...d, attrs: Object.keys(attrs).length ? attrs : undefined };
    });

  const attrOn = (key: string, value: string) => Boolean(draft.attrs?.[key]?.includes(value));
  const toggleFlag = (key: string) =>
    setDraft((d) => {
      const attrs = { ...(d.attrs ?? {}) };
      if (attrs[key]?.length) delete attrs[key]; else attrs[key] = ["true"];
      return { ...d, attrs: Object.keys(attrs).length ? attrs : undefined };
    });

  const selectedTypes = draft.types ?? [];
  // A facet shows when NO type is chosen (all-types search) or when at least one
  // chosen type declares that field. This IS the design's dynamic behaviour.
  const visibleFacets = (config?.facets ?? []).filter(
    (f) => selectedTypes.length === 0 ? false : selectedTypes.some((t) => f.forTypes.includes(t)),
  );

  const budgetMax = config?.budget.max ?? 300;
  const bMin = draft.budgetMin ?? 0;
  const bMax = draft.budgetMax ?? budgetMax;

  const selectedAreaNames = (draft.areas ?? [])
    .map((id) => config?.areas.find((a) => a.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <>
      {/* scrim */}
      <button aria-label="Close filters" onClick={onClose} tabIndex={-1}
              className="fixed inset-0 z-sheet-scrim animate-scrim-in bg-[color:var(--scrim-sheet)]" />

      <div
        role="dialog" aria-modal="true" aria-label="Filters"
        className="fixed inset-x-0 bottom-0 z-sheet mx-auto flex h-[90dvh] w-full max-w-column animate-sheet-in flex-col overflow-hidden rounded-t-12 bg-surface-1 shadow-l3"
      >
        {/* handle + title */}
        <div className="shrink-0 pt-2">
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border" />
          <div className="flex items-center gap-2 border-b border-divider px-4 pb-3 pt-1">
            <span className="flex-1 text-17 font-semibold text-ink-primary">Filters</span>
            <button onClick={() => setDraft({ q: draft.q })} className="text-15 font-semibold text-accent">Clear all</button>
            <button onClick={onClose} aria-label="Close" className="-mr-3 grid h-11 w-11 place-items-center">
              <Icon name="close" size={20} strokeWidth={1.9} className="text-ink-primary" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          {!config ? (
            <div className="space-y-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <div className="mb-2 h-3 w-24 animate-pulse rounded-4 bg-surface-2" />
                  <div className="flex gap-2">
                    {[0, 1, 2].map((j) => <div key={j} className="h-9 w-20 animate-pulse rounded-full bg-surface-2" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <Label>Looking to</Label>
              <ChipRow>
                {([["sell", "Buy"], ["rent", "Rent"]] as const).map(([v, l]) => (
                  <Chip key={v} label={l} on={draft.intent === v}
                        onClick={() => setDraft((d) => ({ ...d, intent: d.intent === v ? undefined : v }))} />
                ))}
              </ChipRow>

              <Label>Property type</Label>
              <ChipRow wrap>
                {config.types.map((t) => (
                  <Chip key={t.code} label={t.label} on={selectedTypes.includes(t.code)} onClick={() => toggleIn("types", t.code)} />
                ))}
              </ChipRow>

              {/* ---- dynamic per-type sections ---- */}
              {visibleFacets.map((f) =>
                f.control === "toggle" ? (
                  <ToggleRow key={f.key} label={f.label} on={Boolean(draft.attrs?.[f.key]?.length)} onClick={() => toggleFlag(f.key)} />
                ) : (
                  <div key={f.key}>
                    <Label>{f.label}</Label>
                    <ChipRow wrap>
                      {f.options.map((o) => (
                        <Chip key={o.value} label={o.label} on={attrOn(f.key, o.value)} onClick={() => toggleAttr(f.key, o.value)} />
                      ))}
                    </ChipRow>
                  </div>
                ),
              )}
              {selectedTypes.length === 0 && (
                <div className="mb-5 rounded-8 bg-surface-2 px-3 py-2.5 text-13 text-ink-secondary">
                  Pick a property type to filter by BHK, furnishing, plot size and more.
                </div>
              )}

              {/* ---- budget dual slider ---- */}
              <Label>Budget</Label>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-15 font-semibold text-ink-primary">{fmtLakh(bMin)}</span>
                <span className="text-13 text-ink-tertiary">to</span>
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-15 font-semibold text-ink-primary">{fmtLakh(bMax)}</span>
              </div>
              <DualRange
                min={0} max={budgetMax} step={config.budget.step}
                valueMin={bMin} valueMax={bMax}
                onChange={(lo, hi) => setDraft((d) => ({
                  ...d,
                  budgetMin: lo <= 0 ? undefined : lo,
                  budgetMax: hi >= budgetMax ? undefined : hi,
                }))}
              />

              {/* ---- location (nested sheet) ---- */}
              <div className="mb-2 flex items-center justify-between">
                <span className="text-13 font-semibold text-ink-secondary">Location</span>
                <button onClick={() => setLocationOpen(true)} className="text-13 font-semibold text-accent">Add areas</button>
              </div>
              <div className="mb-5 flex flex-wrap gap-2">
                {selectedAreaNames.length === 0 ? (
                  <span className="text-13 text-ink-tertiary">All areas</span>
                ) : (
                  (draft.areas ?? []).map((id) => {
                    const name = config.areas.find((a) => a.id === id)?.name ?? id;
                    return (
                      <span key={id} className="flex h-[34px] items-center gap-1.5 rounded-full bg-accent-soft pl-3.5 pr-2 text-13 font-semibold text-accent">
                        {name}
                        <button onClick={() => toggleIn("areas", id)} aria-label={`Remove ${name}`} className="grid h-[22px] w-[22px] place-items-center">
                          <Icon name="close" size={12} strokeWidth={2.4} />
                        </button>
                      </span>
                    );
                  })
                )}
              </div>

              {/* ---- amenities ---- */}
              <Label>Amenities</Label>
              <ChipRow wrap>
                {config.amenities.map((a) => (
                  <Chip key={a.code} label={a.label} on={(draft.amenities ?? []).includes(a.code)} onClick={() => toggleIn("amenities", a.code)} />
                ))}
              </ChipRow>

              {/* ---- More toggles ---- */}
              <div className="mb-1 text-13 font-semibold text-ink-secondary">More</div>
              <ToggleRow label="Price negotiable only" on={Boolean(draft.negotiableOnly)} onClick={() => setDraft((d) => ({ ...d, negotiableOnly: !d.negotiableOnly || undefined }))} />
              <ToggleRow label="Ready to move" on={Boolean(draft.readyToMove)} onClick={() => setDraft((d) => ({ ...d, readyToMove: !d.readyToMove || undefined }))} />
              <ToggleRow label="New construction" on={Boolean(draft.newConstruction)} onClick={() => setDraft((d) => ({ ...d, newConstruction: !d.newConstruction || undefined }))} />
              <ToggleRow label="Verified sellers only" on={Boolean(draft.verifiedOnly)} onClick={() => setDraft((d) => ({ ...d, verifiedOnly: !d.verifiedOnly || undefined }))} />
              <div className="h-4" />
            </>
          )}
        </div>

        {/* sticky bottom bar */}
        <div className="flex shrink-0 items-center gap-3 border-t border-border bg-surface-1 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-l2">
          <button onClick={onClearAll} className="text-15 font-semibold text-accent">Clear all</button>
          <button
            onClick={() => onApply(draft)}
            disabled={count === 0}
            className="h-11 flex-1 rounded-8 bg-accent text-15 font-semibold text-white disabled:bg-accent-disabled"
          >
            {counting || count === null
              ? "Counting…"
              : count === 0
                ? "No matches"
                : `Show ${count.toLocaleString("en-IN")} propert${count === 1 ? "y" : "ies"}`}
          </button>
        </div>
      </div>

      {/* ---- nested location sheet (stacks OVER the filter sheet) ---- */}
      {locationOpen && config && (
        <LocationSheet
          areas={config.areas}
          selected={draft.areas ?? []}
          onToggle={(id) => toggleIn("areas", id)}
          onClose={() => setLocationOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Nested location sheet
// ---------------------------------------------------------------------------

function LocationSheet({
  areas, selected, onToggle, onClose,
}: {
  areas: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const shown = useMemo(
    () => areas.filter((a) => a.name.toLowerCase().includes(term.trim().toLowerCase())),
    [areas, term],
  );

  return (
    <>
      {/* Its own scrim at a higher layer — back/tap closes only THIS sheet. */}
      <button aria-label="Close area picker" onClick={onClose} tabIndex={-1}
              className="fixed inset-0 z-[45] animate-scrim-in bg-[color:var(--scrim-sheet)]" />
      <div
        role="dialog" aria-modal="true" aria-label="Select areas"
        className="fixed inset-x-0 bottom-0 z-[46] mx-auto flex h-[82dvh] w-full max-w-column animate-sheet-in flex-col overflow-hidden rounded-t-12 bg-surface-1 shadow-l3"
      >
        <div className="shrink-0 pt-2">
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border" />
          <div className="flex items-center gap-2 px-4 pb-3 pt-1">
            <button onClick={onClose} aria-label="Back" className="-ml-3 grid h-11 w-11 place-items-center">
              <Icon name="arrow-left" size={22} strokeWidth={1.8} className="text-ink-primary" />
            </button>
            <span className="flex-1 text-17 font-semibold text-ink-primary">Select areas</span>
          </div>
          <div className="px-4 pb-3">
            <div className="flex h-10 items-center gap-2 rounded-8 border border-border bg-surface-2 px-3">
              <Icon name="search" size={17} strokeWidth={1.8} className="text-ink-tertiary" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search area…"
                aria-label="Search area"
                className="min-w-0 flex-1 bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4">
          {shown.length === 0 ? (
            <div className="py-8 text-center text-13 text-ink-tertiary">No areas match “{term}”</div>
          ) : shown.map((a) => {
            const on = selected.includes(a.id);
            return (
              <button key={a.id} onClick={() => onToggle(a.id)} className="flex h-13 w-full items-center gap-3 border-b border-divider py-3.5 text-left">
                <span className={cn(
                  "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md",
                  on ? "border border-accent bg-accent" : "border-[1.5px] border-border bg-transparent",
                )}>
                  {on && <Icon name="check" size={13} strokeWidth={3} className="text-white" />}
                </span>
                <span className="flex-1 text-15 text-ink-primary">{a.name}</span>
              </button>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-border bg-surface-1 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button onClick={onClose} className="h-11 w-full rounded-8 bg-accent text-15 font-semibold text-white">Apply</button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Dual-range slider
// ---------------------------------------------------------------------------

function DualRange({
  min, max, step, valueMin, valueMax, onChange,
}: {
  min: number; max: number; step: number;
  valueMin: number; valueMax: number;
  onChange: (lo: number, hi: number) => void;
}) {
  const lp = ((valueMin - min) / (max - min)) * 100;
  const rp = ((valueMax - min) / (max - min)) * 100;

  return (
    <div className="relative mx-1 mb-6 h-6">
      <div className="absolute inset-x-0 top-[11px] h-[3px] rounded-full bg-surface-3" />
      <div className="absolute top-[11px] h-[3px] rounded-full bg-accent" style={{ left: `${lp}%`, right: `${100 - rp}%` }} />
      {/* Two overlaid natives: pointer-events are off on the track and on for the
          thumbs, which is what lets both handles stay grabbable when they meet. */}
      <input
        type="range" min={min} max={max} step={step} value={valueMin}
        aria-label="Minimum budget"
        onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax - step), valueMax)}
        className="hz-rng"
      />
      <input
        type="range" min={min} max={max} step={step} value={valueMax}
        aria-label="Maximum budget"
        onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin + step))}
        className="hz-rng"
      />
    </div>
  );
}

/** Lakh → "₹20 L" / "₹1.5 Cr". */
function fmtLakh(l: number): string {
  if (l >= 100) {
    const cr = l / 100;
    return `₹${cr.toFixed(cr % 1 === 0 ? 0 : 1)} Cr`;
  }
  return `₹${l} L`;
}

// ---------------------------------------------------------------------------
// Small primitives (design-locked chip / toggle / label)
// ---------------------------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-13 font-semibold text-ink-secondary">{children}</div>;
}

function ChipRow({ children, wrap }: { children: React.ReactNode; wrap?: boolean }) {
  return <div className={cn("mb-5 flex gap-2", wrap ? "flex-wrap" : "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}>{children}</div>;
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-13 font-semibold transition-colors",
        on ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-ink-primary",
      )}
    >
      {label}
    </button>
  );
}

function ToggleRow({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div className="flex h-11 items-center justify-between">
      <span className="text-15 text-ink-primary">{label}</span>
      <button
        onClick={onClick}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={cn("relative h-7 w-[46px] rounded-full transition-colors", on ? "bg-accent" : "bg-surface-3")}
      >
        <span
          className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-[left]"
          style={{ left: on ? 21 : 3 }}
        />
      </button>
    </div>
  );
}

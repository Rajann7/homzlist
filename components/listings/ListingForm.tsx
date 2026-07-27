"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, BottomSheet, Button, Header, Icon, Skeleton, Toggle, useToast } from "@/components/billing/ui";
import { BackButton, SectionLabel } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { listingsApi, uploadDoc, formatIndianCommas, priceInWords, type TypeConfig, type LocationNode } from "@/lib/listings/client";
import { settingsApi } from "@/lib/settings/client";
import type { Amenity, FieldDef, FieldDefMap, FieldOption } from "./fields";
import { cn } from "@/lib/utils";

/**
 * P5 S4 — the dynamic listing form.
 *
 * Nothing about which fields exist is hardcoded here: the server's
 * `field_config` names them and this renders whatever it names (Doc2 §5.1), so
 * a new property type ships as a config row. Validation is likewise mirrored —
 * the server is authoritative and re-checks everything on submit.
 *
 * Warnings never block (Doc2 §5.3): they're shown inline and the user can
 * submit straight past them.
 */
export function ListingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  // `edit` turns this into an edit of a listing that already exists: the type
  // and kind come from the row, not the query string, and Continue PATCHes
  // instead of creating (and never spends a second slot).
  const editId = params.get("edit");
  const [loadedType, setLoadedType] = useState<{ code: string; kind: "sell" | "rent" } | null>(null);
  const typeCode = loadedType?.code ?? params.get("type") ?? "";
  const kind = loadedType?.kind ?? ((params.get("kind") === "rent" ? "rent" : "sell") as "sell" | "rent");
  const draftId = params.get("draft");

  const [type, setType] = useState<TypeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [sheet, setSheet] = useState<FieldDef | null>(null);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(draftId);
  // Field definitions + amenity list are DATA from the server, not constants.
  const [fieldDefs, setFieldDefs] = useState<FieldDefMap>({});
  const [amenities, setAmenities] = useState<Amenity[]>([]);

  const dirty = useRef(false);

  // ---- load config + any draft or existing listing --------------------------
  useEffect(() => {
    (async () => {
      // An edit reads the row FIRST — its type_code decides which config entry
      // and field list apply, so a query string can't be used to re-type it.
      let code = typeCode;
      if (editId) {
        const existing = await listingsApi.get(editId);
        if (existing.ok) {
          const l = existing.data.listing;
          code = l.typeCode;
          setLoadedType({ code: l.typeCode, kind: l.kind === "rent" ? "rent" : "sell" });
          setValues(listingToValues(l));
        }
      }

      const cfg = await listingsApi.config();
      if (cfg.ok) {
        setType(cfg.data.types.find((t) => t.code === code) ?? null);
        setFieldDefs(cfg.data.fieldDefs ?? {});
        setAmenities(cfg.data.amenities ?? []);
      }
      if (draftId) {
        const d = await listingsApi.drafts();
        if (d.ok) {
          const found = d.data.items.find((x) => x.id === draftId);
          if (found?.payload) setValues(found.payload as Record<string, any>);
        }
      }

      // A brand-new listing starts from the user's Privacy setting, "Show my
      // number by default on new listings" (P10 S6b) — read from the server, not
      // assumed. An edit or a resumed draft already carries its own value, so
      // neither is touched. The server applies the same default if the payload
      // omits `contactPublic`, so this only makes the toggle SHOW the truth.
      if (!editId && !draftId) {
        const p = await settingsApi.prefs();
        if (p.ok && p.data.showNumberDefault) {
          setValues((v) => (v.contactPublic === undefined ? { ...v, contactPublic: true } : v));
        }
      }
      setLoading(false);
    })();
  }, [typeCode, draftId, editId]);

  /**
   * `v` may be an updater. Multi-select controls MUST use that form: reading
   * the current array from the render closure meant two chips tapped inside
   * one frame both saw the same stale value and one selection vanished.
   */
  const set = (k: string, v: unknown | ((prev: any) => unknown)) => {
    dirty.current = true;
    setValues((s) => ({ ...s, [k]: typeof v === "function" ? (v as (p: any) => unknown)(s[k]) : v }));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  };

  // ---- auto-save draft (Doc2 §5.3) -----------------------------------------
  const saveDraft = useCallback(async (silent = true) => {
    // An edit already has a row; snapshotting it as a "draft" would put a
    // duplicate in the drafts list and eat one of the three slots there.
    if (editId || !dirty.current) return;
    const res = await listingsApi.saveDraft({ ...values, typeCode, kind }, values.title ?? null, savedDraftId ?? undefined);
    if (res.ok) {
      setSavedDraftId(res.data.id);
      dirty.current = false;
      if (!silent) toast.show("Draft saved");
    } else if (!silent) {
      const code = (res.error as any).code;
      toast.show(code === "DRAFT_LIMIT" ? "You already have 3 drafts — delete one first" : "Couldn't save the draft");
    }
  }, [values, typeCode, kind, savedDraftId, toast, editId]);

  useEffect(() => {
    const t = setInterval(() => void saveDraft(true), 20000);
    return () => clearInterval(t);
  }, [saveDraft]);

  const submit = async () => {
    setSubmitting(true);
    const payload = buildPayload(values, typeCode, kind, type);
    // Editing PATCHes the existing row — creating a second listing here would
    // spend another paid slot for what the user experienced as "fix a typo".
    const res = editId ? await listingsApi.update(editId, payload) : await listingsApi.create(payload);
    setSubmitting(false);

    if (editId && res.ok) {
      dirty.current = false;
      const { reReview } = res.data as { reReview?: boolean };
      toast.show(reReview ? "Saved — back to review for the changed details" : "Changes saved");
      router.push(`/listings/${editId}`);
      return;
    }

    if (!res.ok) {
      const err = res.error as any;
      if (err.code === "PLAN_REQUIRED") {
        // Payment-first: no slot → the plan wall, then back here.
        router.push("/create?wall=1");
        return;
      }
      if (err.errors) {
        setErrors(err.errors);
        setWarnings(err.warnings ?? {});
        const first = Object.keys(err.errors)[0];
        document.getElementById(`f-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        toast.show("Please fix the highlighted fields");
        return;
      }
      toast.show(err.code === "OFFLINE" ? "You're offline — your draft is saved" : "Couldn't submit right now");
      return;
    }

    if (savedDraftId) await listingsApi.deleteDraft(savedDraftId);
    dirty.current = false;
    router.push(`/create/photos?listing=${(res.data as { listing: { id: string } }).listing.id}`);
  };

  if (loading) {
    return (
      <Shell onClose={() => router.back()}>
        <div className="flex flex-col gap-4 p-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-8" />)}
        </div>
      </Shell>
    );
  }

  if (!type) {
    return (
      <Shell onClose={() => router.back()}>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-13 text-ink-secondary">That property type isn&apos;t available for your account.</p>
          <Button variant="outline" onClick={() => router.push("/create")}>Back to Create</Button>
        </div>
      </Shell>
    );
  }

  // The server names the fields; we render them in config order.
  // Both the field list AND every option inside it come from the server.
  // A field with `showIf` only appears once its controlling field matches —
  // possession under "under construction", the furnishing checklist under a
  // furnished flat (Doc2 §5.1: the rule is data, not a branch in here).
  const visible = (f: FieldDef) => !f.showIf || f.showIf.in.includes(String(values[f.showIf.field] ?? ""));
  const fields = (type.fields.map((f) => fieldDefs[f]).filter(Boolean) as FieldDef[]).filter(visible);
  // Rent-only extras, minus anything the type already lists for itself — a PG
  // declares `tenant_preference` in its own config, and adding it here again
  // rendered the same field twice, in two sections, writing one key.
  const rentFields = (kind === "rent"
    ? (["deposit", "available_from", "maintenance_included", "tenant_preference"]
        .filter((f) => !type.fields.includes(f))
        .map((f) => fieldDefs[f])
        .filter(Boolean) as FieldDef[])
    : []).filter(visible);

  const detailSection = !!fields.length && (
    <section className="flex flex-col gap-4">
      <SectionLabel>{type.label} details</SectionLabel>
      {fields.map((f) => (
        <DynamicField
          key={f.key}
          def={f}
          value={values[f.key]}
          onChange={(v) => set(f.key, v)}
          error={errors[f.key]}
          onOpenSheet={() => setSheet(f)}
          landUnits={type.areaUnits}
        />
      ))}
    </section>
  );

  return (
    <Shell
      title={editId ? "Edit listing" : "Add details"}
      onClose={() => (dirty.current ? setUnsavedOpen(true) : router.back())}
      onSaveDraft={editId ? undefined : () => void saveDraft(false)}
    >
      <div className="flex flex-col gap-6 p-4 pb-28">
        {/* ---- A. Basics ---- */}
        <section className="flex flex-col gap-4">
          <SectionLabel>Basics</SectionLabel>

          <Field id="f-title" label="Title" error={errors.title} warning={warnings.title} hint={`e.g. ${titleHint(type, kind)}`}>
            <input
              value={values.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              maxLength={120}
              placeholder={titleHint(type, kind)}
              className={inputCls(errors.title)}
            />
            <button
              type="button"
              onClick={() => set("title", autoTitle(values, type, kind))}
              className="tap44 mt-2 self-start text-13 font-semibold text-accent"
            >
              Auto-generate title
            </button>
          </Field>
        </section>

        {/* ---- B. Property details (design puts these before price) ---- */}
        {detailSection}

        {/* ---- C. Price ---- */}
        <section className="flex flex-col gap-4">
          <SectionLabel>{kind === "rent" ? "Rent" : "Price"}</SectionLabel>

          {!values.priceOnRequest && (
            <Field id="f-price" label={kind === "rent" ? "Monthly rent" : "Price"} error={errors.price} warning={warnings.price}>
              <div className={cn("flex items-center rounded-8 border bg-surface-2", errors.price ? "border-error" : "border-border")}>
                <span className="pl-3 text-15 font-semibold text-ink-secondary">₹</span>
                <input
                  inputMode="numeric"
                  value={formatIndianCommas(String(values.price ?? ""))}
                  onChange={(e) => set("price", e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  className="h-11 flex-1 bg-transparent px-3 text-15 text-ink-primary outline-none"
                />
              </div>
              {priceInWords(String(values.price ?? "")) && (
                <div className="mt-2 text-13 font-semibold text-accent">{priceInWords(String(values.price ?? ""))}</div>
              )}
            </Field>
          )}

          <ToggleRow label="Price negotiable" checked={!!values.isNegotiable} onChange={(v) => set("isNegotiable", v)} />
          <ToggleRow
            label="Price on request"
            sub="The card shows 'Price on request' instead of a figure"
            checked={!!values.priceOnRequest}
            onChange={(v) => set("priceOnRequest", v)}
          />

          {rentFields.map((f) => (
            <DynamicField key={f.key} def={f} value={values[f.key]} onChange={(v) => set(f.key, v)} error={errors[f.key]} onOpenSheet={() => setSheet(f)} />
          ))}
        </section>

        {/* ---- D. Location ---- */}
        <LocationSection values={values} set={set} error={errors.city} errors={errors} />

        {/* ---- E. Amenities (master list from the DB — Doc2 §5.1) ---- */}
        {!!amenities.length && (
          <section className="flex flex-col gap-4">
            <SectionLabel>Amenities</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {amenities
                .filter((a) => !a.categories.length || a.categories.includes(type.category))
                .map((a) => {
                  const on = ((values.amenities as string[]) ?? []).includes(a.label);
                  return (
                    <button
                      key={a.code}
                      // Computed inside the updater, not from the render closure:
                      // two chips tapped in the same frame both used to read the
                      // same stale array and one selection was silently dropped.
                      onClick={() =>
                        setValues((s) => {
                          dirty.current = true;
                          const cur = (s.amenities as string[]) ?? [];
                          return {
                            ...s,
                            amenities: cur.includes(a.label) ? cur.filter((x) => x !== a.label) : [...cur, a.label],
                          };
                        })
                      }
                      className={cn(
                        "h-9 rounded-full px-3.5 text-13 font-semibold",
                        on ? "bg-ink-primary text-page" : "bg-surface-2 text-ink-secondary",
                      )}
                    >
                      {a.label}
                    </button>
                  );
                })}
            </div>
          </section>
        )}

        {/* ---- F. Description ---- */}
        <section className="flex flex-col gap-4">
          <SectionLabel>Description</SectionLabel>
          <Field id="f-description" label="Description" error={errors.description} warning={warnings.description}>
            <textarea
              value={values.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder={descTemplate(type)}
              className={cn(inputCls(errors.description), "h-auto py-3 leading-[1.45]")}
            />
            <div className="mt-1 text-11 text-ink-tertiary">{(values.description ?? "").length} / 5000</div>
          </Field>
        </section>

        {/* ---- G. Contact (Doc2 §5.1 number rules) ---- */}
        <section className="flex flex-col gap-4">
          <SectionLabel>Contact</SectionLabel>
          <ToggleRow
            label="Show my number publicly"
            sub="Off means buyers must request it — you approve each one"
            checked={!!values.contactPublic}
            onChange={(v) => set("contactPublic", v)}
          />
          {values.contactPublic && (
            <>
              <Field id="f-contactNumber" label="Display number" error={errors.contactNumber} hint="Defaults to your account number. Changing it here doesn't need re-verification.">
                <input
                  inputMode="tel"
                  value={values.contactNumber ?? ""}
                  onChange={(e) => set("contactNumber", e.target.value)}
                  placeholder="98250 12345"
                  className={inputCls(errors.contactNumber)}
                />
              </Field>

              {/* On by default: most sellers WhatsApp on the same number, and
                  the detail screen's WhatsApp button reads this. */}
              <ToggleRow
                label="WhatsApp is on this number"
                checked={values.whatsappSame !== false}
                onChange={(v) => set("whatsappSame", v)}
              />
              {values.whatsappSame === false && (
                <Field id="f-whatsappNumber" label="WhatsApp number" error={errors.whatsappNumber}>
                  <input
                    inputMode="tel"
                    value={values.whatsappNumber ?? ""}
                    onChange={(e) => set("whatsappNumber", e.target.value)}
                    placeholder="98250 12345"
                    className={inputCls(errors.whatsappNumber)}
                  />
                </Field>
              )}
            </>
          )}

          <Field id="f-altNumber" label="Alternate number" error={errors.altNumber} hint="Optional — for a family member or assistant.">
            <input
              inputMode="tel"
              value={values.altNumber ?? ""}
              onChange={(e) => set("altNumber", e.target.value)}
              placeholder="98250 12345"
              className={inputCls(errors.altNumber)}
            />
          </Field>
        </section>

        {/* ---- H. Ownership proof (optional, private bucket) ---- */}
        <OwnershipProofSection values={values} set={set} proofTypes={fieldDefs.ownership_proof_type?.options ?? []} />

        <p className="text-11 leading-[1.45] text-ink-tertiary">
          Your listing goes to our team for review — usually approved within 24 hours.
        </p>
      </div>

      <div className="sticky bottom-0 z-sticky mt-auto border-t border-divider bg-page p-4 safe-bottom">
        <Button fullWidth loading={submitting} onClick={() => void submit()}>
          {editId ? "Save changes" : "Continue to photos"}
        </Button>
      </div>

      {/* Selector sheets for chip/option fields */}
      <BottomSheet open={!!sheet} onClose={() => setSheet(null)} title={sheet?.label ?? ""}>
        <div className="flex flex-col gap-2 pb-2">
          {(sheet?.options ?? []).map((o) => (
            <button
              key={o.value}
              onClick={() => { set(sheet!.key, o.value); setSheet(null); }}
              className={cn(
                "flex h-12 items-center rounded-8 px-4 text-left text-15",
                values[sheet?.key ?? ""] === o.value ? "bg-accent-soft font-semibold text-accent" : "bg-surface-2 text-ink-primary",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={unsavedOpen}
        onClose={() => setUnsavedOpen(false)}
        onConfirm={async () => { await saveDraft(false); setUnsavedOpen(false); router.push("/create"); }}
        title="Save as draft?"
        body="Your progress will be kept for 90 days."
        confirmLabel="Save draft"
        cancelLabel="Discard"
      />
    </Shell>
  );
}

/* ---------------------------------------------------------------- helpers */

function Shell({ children, onClose, onSaveDraft, title = "Add details" }: { children: React.ReactNode; onClose: () => void; onSaveDraft?: () => void; title?: string }) {
  return (
    <AppShell
      showNav={false}
      className="flex flex-col"
      header={
        <Header
          left={
            <button onClick={onClose} aria-label="Close" className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2">
              <Icon name="close" size={20} strokeWidth={1.9} />
            </button>
          }
          title={title}
          centerTitle
          right={onSaveDraft ? <button onClick={onSaveDraft} className="tap44 px-2 text-13 font-semibold text-accent">Save draft</button> : undefined}
        />
      }
    >
      {children}
    </AppShell>
  );
}

const inputCls = (err?: string) =>
  cn(
    "h-11 w-full rounded-8 border bg-surface-2 px-3 text-15 text-ink-primary outline-none focus:border-accent",
    err ? "border-error" : "border-border",
  );

/**
 * One labelled field. Metrics are the design's (`fLabel` / `helper` /
 * `errLine`): label 13/600 ink2 with 6px below, helper and error 11px at 6px
 * above, and the error carries the alert glyph the design draws.
 */
function Field({ id, label, error, warning, hint, children }: { id?: string; label: string; error?: string; warning?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="flex flex-col">
      <label className="mb-1.5 text-13 font-semibold leading-none text-ink-secondary">{label}</label>
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

function ToggleRow({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-8 bg-surface-2 px-3.5 py-3">
      <div className="flex-1">
        <div className="text-15 text-ink-primary">{label}</div>
        {sub && <div className="mt-0.5 text-11 text-ink-tertiary">{sub}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

/** designs/P5: a built structure is measured in sq ft/yard/m; land adds the
 *  Gujarat land units. Labels are the design's, values the server's. */
const AREA_UNITS_BUILT = [
  { value: "sqft", label: "sq ft" },
  { value: "sqyd", label: "sq yard" },
  { value: "sqm", label: "sq m" },
];
const AREA_UNITS_LAND = [
  { value: "sqft", label: "sq ft" },
  { value: "sqyd", label: "sq yard" },
  { value: "vigha", label: "Vigha" },
  { value: "guntha", label: "Guntha" },
  { value: "acre", label: "Acre" },
];

function DynamicField({ def, value, onChange, error, onOpenSheet, landUnits }: { def: FieldDef; value: any; onChange: (v: unknown | ((prev: any) => unknown)) => void; error?: string; onOpenSheet: () => void; landUnits?: boolean }) {
  if (def.control === "chips") {
    return (
      <Field id={`f-${def.key}`} label={def.label} error={error}>
        <div className="flex flex-wrap gap-2">
          {(def.options ?? []).map((o) => (
            <button
              key={o.value}
              onClick={() => onChange(value === o.value ? null : o.value)}
              className={cn(
                "h-9 rounded-full px-3.5 text-13 font-semibold",
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
      <Field id={`f-${def.key}`} label={def.label} error={error}>
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
                  "h-9 rounded-full px-3.5 text-13 font-semibold",
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
      <div className="flex items-center gap-3 rounded-8 bg-surface-2 px-3.5 py-2.5">
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
      <Field id={`f-${def.key}`} label={def.label} error={error}>
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
    const units = useLand ? AREA_UNITS_LAND : AREA_UNITS_BUILT;
    return (
      <Field id={`f-${def.key}`} label={def.label} error={error} hint={def.hint ?? "Converted automatically for search"}>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            value={value?.value ?? ""}
            onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); onChange((prev: any) => ({ ...(prev ?? {}), value: v })); }}
            placeholder="0"
            className={inputCls(error)}
          />
          <select
            value={value?.unit ?? "sqft"}
            onChange={(e) => { const u = e.target.value; onChange((prev: any) => ({ ...(prev ?? {}), unit: u })); }}
            className="h-11 shrink-0 rounded-8 border border-border bg-surface-2 px-2 text-15 text-ink-primary outline-none"
          >
            {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
      </Field>
    );
  }

  // number | text
  return (
    <Field id={`f-${def.key}`} label={def.label} error={error} hint={def.hint ?? undefined}>
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
 * P5 section H — "Add ownership proof (optional)".
 *
 * The document goes straight to the PRIVATE bucket via the shared uploads
 * presign (kind: "doc"), so the bytes never touch our API and the client never
 * picks the key. Only the returned key is carried in the form payload; nothing
 * about the file is ever shown to a buyer.
 */
function OwnershipProofSection({
  values, set, proofTypes,
}: { values: Record<string, any>; set: (k: string, v: unknown) => void; proofTypes: FieldOption[] }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typeSheet, setTypeSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const chosen = proofTypes.find((o) => o.value === values.ownershipProofType)?.label;

  const upload = async (file: File) => {
    setBusy(true);
    const res = await uploadDoc(file);
    setBusy(false);
    if (!res.ok) { toast.show(res.error ?? "Couldn't upload that document"); return; }
    set("ownershipProofKey", res.key);
    set("ownershipProofName", file.name);
    toast.show("Document attached");
  };

  return (
    <section className="overflow-hidden rounded-8 border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 bg-surface-2 p-3.5 text-left"
      >
        <Icon name="shield" size={20} className="shrink-0 text-ink-secondary" />
        <span className="min-w-0 flex-1">
          <span className="block text-15 font-semibold text-ink-primary">Add ownership proof (optional)</span>
          <span className="mt-0.5 block text-11 text-ink-tertiary">Verified listings get more genuine inquiries</span>
        </span>
        <Icon name="chevron-down" size={18} className={cn("shrink-0 text-ink-tertiary transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 p-3.5">
          <Field label="Document type">
            <button onClick={() => setTypeSheet(true)} className={cn(inputCls(), "flex items-center text-left")}>
              <span className={cn("flex-1", chosen ? "text-ink-primary" : "text-ink-tertiary")}>{chosen ?? "Select"}</span>
              <Icon name="chevron-down" size={18} className="text-ink-tertiary" />
            </button>
          </Field>

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex flex-col items-center gap-1.5 rounded-8 border-[1.5px] border-dashed border-border p-5 disabled:opacity-50"
          >
            <Icon name="upload" size={24} className="text-ink-tertiary" />
            <span className="text-13 text-ink-tertiary">
              {busy ? "Uploading…" : values.ownershipProofName ? String(values.ownershipProofName) : "Upload document (PDF/JPG)"}
            </span>
          </button>
          <div className="text-11 text-ink-tertiary">Only visible to HomzList admins — never shown publicly.</div>
        </div>
      )}

      <BottomSheet open={typeSheet} onClose={() => setTypeSheet(false)} title="Document type">
        <div className="flex flex-col gap-2 pb-2">
          {proofTypes.map((o) => (
            <button
              key={o.value}
              onClick={() => { set("ownershipProofType", o.value); setTypeSheet(false); }}
              className={cn(
                "flex h-12 items-center rounded-8 px-4 text-left text-15",
                values.ownershipProofType === o.value ? "bg-accent-soft font-semibold text-accent" : "bg-surface-2 text-ink-primary",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </BottomSheet>
    </section>
  );
}

/** Location cascade: each level loads from the server as the parent is chosen. */
function LocationSection({ values, set, error, errors }: { values: Record<string, any>; set: (k: string, v: unknown) => void; error?: string; errors?: Record<string, string> }) {
  const toast = useToast();
  const [nodes, setNodes] = useState<Record<string, LocationNode[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const levels = [
    { level: "state", key: "stateId", label: "State", parent: null as string | null },
    { level: "district", key: "districtId", label: "District", parent: values.stateId },
    { level: "taluka", key: "talukaId", label: "Taluka", parent: values.districtId },
    { level: "city", key: "cityId", label: "City / Village", parent: values.talukaId },
    { level: "area", key: "areaId", label: "Area / Landmark", parent: values.cityId },
  ];

  const load = async (level: string, parent: string | null) => {
    const r = await listingsApi.locations(level, parent);
    if (r.ok) setNodes((n) => ({ ...n, [level]: r.data.items }));
  };

  // Load every level whose parent is already known, not just states. On a
  // fresh form that IS just states; on an edit (or a resumed draft) the ids are
  // already set, and without this each row rendered "Select district" over a
  // value that was actually there — the location looked lost.
  const levelKey = levels.map((l) => values[l.key] ?? "").join("|");
  useEffect(() => {
    void (async () => {
      for (const l of levels) {
        if (l.parent === null && l.level !== "state") continue;
        if (nodes[l.level]?.length) continue;
        await load(l.level, l.parent);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelKey]);

  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>Location</SectionLabel>
      {levels.map((l, i) => {
        const disabled = i > 0 && !l.parent;
        const chosen = nodes[l.level]?.find((n) => n.id === values[l.key]);
        return (
          <Field key={l.key} id={l.key === "cityId" ? "f-city" : undefined} label={l.label} error={l.key === "cityId" ? error : undefined}>
            <button
              disabled={disabled}
              onClick={async () => { await load(l.level, l.parent); setOpen(l.level); }}
              className={cn(inputCls(l.key === "cityId" ? error : undefined), "flex items-center text-left", disabled && "opacity-50")}
            >
              <span className={cn("flex-1", chosen ? "text-ink-primary" : "text-ink-tertiary")}>
                {chosen?.name ?? (disabled ? `Choose ${levels[i - 1].label.toLowerCase()} first` : `Select ${l.label.toLowerCase()}`)}
              </span>
              <Icon name="chevron-down" size={18} className="text-ink-tertiary" />
            </button>

            <BottomSheet open={open === l.level} onClose={() => setOpen(null)} title={l.label}>
              <div className="flex flex-col gap-2 pb-2">
                {(nodes[l.level] ?? []).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      set(l.key, n.id);
                      if (l.key === "areaId") set("areaLabel", `${n.name}, ${nodes.city?.find((c) => c.id === values.cityId)?.name ?? ""}`.replace(/,\s*$/, ""));
                      // Choosing a parent invalidates everything below it.
                      levels.slice(i + 1).forEach((deeper) => set(deeper.key, null));
                      setOpen(null);
                    }}
                    className={cn(
                      "flex h-12 items-center rounded-8 px-4 text-left text-15",
                      values[l.key] === n.id ? "bg-accent-soft font-semibold text-accent" : "bg-surface-2 text-ink-primary",
                    )}
                  >
                    {n.name}
                  </button>
                ))}
                {!(nodes[l.level] ?? []).length && (
                  <p className="py-6 text-center text-13 text-ink-secondary">Nothing here yet.</p>
                )}
                {l.level === "area" && (
                  <button
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
                    className="tap44 mt-2 self-center text-13 font-semibold text-accent"
                  >
                    Can&apos;t find your area? Request it
                  </button>
                )}
              </div>
            </BottomSheet>
          </Field>
        );
      })}

      {/* Level 6. The column existed on `listings` and the create endpoint
          already accepted it — there was simply no field, so it was always
          null and area pages had no postal anchor. */}
      <Field label="Pincode" error={error && !values.cityId ? undefined : errors?.pincode} hint="Optional — helps buyers filter by area">
        <input
          inputMode="numeric"
          maxLength={6}
          value={values.pincode ?? ""}
          onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="360004"
          className={inputCls(errors?.pincode)}
        />
      </Field>
    </section>
  );
}

/* ---- payload + copy helpers --------------------------------------------- */

/**
 * Existing listing → form values. The owner-only `owner` block carries the
 * location ids and the private contact fields the public payload omits, which
 * is what lets the cascade and the contact rows re-open on the right entries.
 */
function listingToValues(l: any): Record<string, any> {
  const o = l.owner ?? {};
  const c = o.contact ?? l.contact ?? {};
  return {
    ...(l.attributes ?? {}),
    title: l.title ?? "",
    description: l.description ?? "",
    price: l.pricePaise ? String(Math.round(l.pricePaise / 100)) : "",
    priceOnRequest: !!l.priceOnRequest,
    isNegotiable: !!l.isNegotiable,
    deposit: o.depositPaise ? String(Math.round(o.depositPaise / 100)) : "",
    maintenance: o.maintenancePaise ? String(Math.round(o.maintenancePaise / 100)) : (l.attributes?.maintenance ?? ""),
    maintenance_included: !!o.maintenanceIncluded,
    available_from: o.availableFrom ?? null,
    stateId: o.location?.stateId ?? null,
    districtId: o.location?.districtId ?? null,
    talukaId: o.location?.talukaId ?? null,
    cityId: o.location?.cityId ?? null,
    areaId: o.location?.areaId ?? null,
    areaLabel: l.areaLabel ?? null,
    pincode: o.location?.pincode ?? "",
    amenities: l.amenities ?? [],
    contactPublic: !!(c.public ?? l.contactPublic),
    contactNumber: c.number ?? "",
    altNumber: c.alt ?? "",
    // Same number → the toggle reads "on"; a different one → off, field shown.
    whatsappSame: !c.whatsapp || c.whatsapp === c.number,
    whatsappNumber: c.whatsapp ?? "",
    ownershipProofType: o.ownershipProofType ?? null,
  };
}

function buildPayload(v: Record<string, any>, typeCode: string, kind: string, type: TypeConfig | null) {
  const attrs: Record<string, unknown> = {};
  for (const f of type?.fields ?? []) if (v[f] !== undefined && v[f] !== null && v[f] !== "") attrs[f] = v[f];

  return {
    typeCode,
    kind,
    title: v.title ?? null,
    description: v.description ?? null,
    // Rupees in the field → paise on the wire; the server re-derives the total.
    pricePaise: v.priceOnRequest ? null : v.price ? parseInt(String(v.price), 10) * 100 : null,
    priceOnRequest: !!v.priceOnRequest,
    isNegotiable: !!v.isNegotiable,
    depositPaise: v.deposit ? parseInt(String(v.deposit), 10) * 100 : null,
    // The dedicated column, not just the attributes blob — a filter or a
    // "maintenance under ₹2000" query reads the column, and it was always null.
    maintenancePaise: v.maintenance ? parseInt(String(v.maintenance), 10) * 100 : null,
    availableFrom: v.available_from ?? null,
    maintenanceIncluded: !!v.maintenance_included,
    stateId: v.stateId ?? null,
    districtId: v.districtId ?? null,
    talukaId: v.talukaId ?? null,
    cityId: v.cityId ?? null,
    areaId: v.areaId ?? null,
    areaLabel: v.areaLabel ?? null,
    pincode: v.pincode || null,
    attributes: attrs,
    amenities: v.amenities ?? [],
    contactPublic: !!v.contactPublic,
    contactNumber: v.contactNumber ?? null,
    altNumber: v.altNumber || null,
    // "WhatsApp is on this number" means store the display number as the
    // WhatsApp one, so the detail screen's button always has something to use.
    whatsappNumber: v.contactPublic
      ? (v.whatsappSame === false ? (v.whatsappNumber || null) : (v.contactNumber || null))
      : null,
    ownershipProofType: v.ownershipProofType ?? null,
    ownershipProofKey: v.ownershipProofKey ?? null,
    photoCount: 0,
  };
}

/** A plot or a PG has no BHK, so the example title must not invent one. */
function titleHint(t: TypeConfig, kind: string) {
  const bhk = t.fields.includes("bhk") ? "3 BHK " : "";
  return `${bhk}${t.label} ${kind === "rent" ? "for rent" : "for sale"} in Mavdi`;
}

function autoTitle(v: Record<string, any>, t: TypeConfig, kind: string) {
  const bits = [v.bhk ? `${v.bhk} BHK` : null, t.label, kind === "rent" ? "for rent" : "for sale", v.areaLabel ? `in ${v.areaLabel}` : null];
  return bits.filter(Boolean).join(" ");
}

function descTemplate(t: TypeConfig) {
  return `Describe your ${t.label.toLowerCase()} — condition, what's nearby, why someone would love it. Don't include phone numbers here.`;
}

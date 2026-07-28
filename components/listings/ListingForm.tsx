"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, BottomSheet, Button, Header, Icon, Skeleton, useToast } from "@/components/billing/ui";
import { SectionLabel } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { listingsApi, uploadDoc, formatIndianCommas, priceInWords, type TypeConfig } from "@/lib/listings/client";
import { settingsApi } from "@/lib/settings/client";
import { LocationCascade, PincodeField } from "./LocationPicker";
import type { Amenity, FieldDefMap, FieldGroup, FieldOption } from "./fields";
import { DynamicSections, Field, ToggleRow, inputCls, type AreaUnitOption } from "./FormControls";
import { keysForKind, visibleKeys } from "@/lib/listings/visibility";
import { scopedGroups } from "@/lib/listings/groupLabel";
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
  const [savedDraftId, setSavedDraftId] = useState<string | null>(draftId);
  // Field definitions + amenity list are DATA from the server, not constants.
  const [fieldDefs, setFieldDefs] = useState<FieldDefMap>({});
  const [fieldGroups, setFieldGroups] = useState<FieldGroup[]>([]);
  /** Area units, from the server (migration 0068) — never a list in here. */
  const [areaUnits, setAreaUnits] = useState<AreaUnitOption[]>([]);
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
        setFieldGroups(cfg.data.fieldGroups ?? []);
        setAreaUnits(cfg.data.areaUnits ?? []);
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
    const payload = buildPayload(values, typeCode, kind, type, fieldDefs);
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
        // Payment-first: no slot → the plan wall for the LISTING quota, which
        // returns to Create once paid.
        router.push("/create?wall=1&intent=listing");
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

  // The server names the fields; every option inside them comes from the server
  // too (Doc2 §5.1). `keysForKind` picks up the per-kind extras — a rented flat
  // is asked for its deposit and tenant preference, a sold one for its
  // ownership document, and neither is shown the other's questions.
  // `DynamicSections` then drops anything whose condition doesn't hold and lays
  // the rest out in the shared collapsible blocks.
  const askedKeys = keysForKind(
    { fields: type.fields, sell_fields: type.sellFields, rent_fields: type.rentFields },
    kind,
  ).filter((k) => fieldDefs[k]);

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
        <DynamicSections
          keys={askedKeys}
          defs={fieldDefs}
          groups={scopedGroups(fieldGroups, { kind: "property", category: type.category })}
          values={values}
          errors={errors}
          required={type.required}
          landUnits={type.areaUnits}
          areaUnits={areaUnits}
          onChange={set}
          fallbackLabel={`${type.label} details`}
        />

        {/* ---- C. Price ---- */}
        <section className="flex flex-col gap-4">
          <SectionLabel>{kind === "rent" ? "Rent" : "Price"}</SectionLabel>

          {!values.priceOnRequest && (
            <Field id="f-price" label={kind === "rent" ? "Monthly rent" : "Price"} error={errors.price} warning={warnings.price}>
              <div className={cn("flex items-center rounded-6 border bg-surface-2", errors.price ? "border-error" : "border-border")}>
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
          {/* Deposit, lease duration, lock-in and the rest of the rent terms are
              NOT stapled on here any more. They carry a `group` like every other
              field, so they render inside "Rental terms" with the same heading,
              ordering and collapse behaviour as everything else. */}
        </section>

        {/* ---- D. Location ---- */}
        <LocationSection values={values} set={set} errors={errors} />

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
                        "h-9 rounded-6 px-3.5 text-13 font-semibold",
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
            className="flex flex-col items-center gap-1.5 rounded-6 border-[1.5px] border-dashed border-border p-5 disabled:opacity-50"
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
                "flex h-12 items-center rounded-6 px-4 text-left text-15",
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

/**
 * Location — the cascade plus the pincode, both from `LocationPicker` so the
 * listing, project and requirement forms cannot drift apart. Pincode is
 * REQUIRED and picked from the codes the chosen place actually covers.
 */
function LocationSection({ values, set, errors }: { values: Record<string, any>; set: (k: string, v: unknown) => void; errors?: Record<string, string> }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>Location</SectionLabel>
      {/* The server names the city error `city`; the picker keys everything by
          the value name it writes, so map it across rather than diverge. */}
      <LocationCascade values={values} set={set} errors={{ ...errors, cityId: errors?.city ?? errors?.cityId ?? "" }} />
      <PincodeField
        cityId={values.cityId ?? null}
        areaId={values.areaId ?? null}
        value={values.pincode ?? null}
        onChange={(v) => set("pincode", v)}
        error={errors?.pincode}
      />
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

/** Rent extras that have a dedicated COLUMN — they must not also land in `attributes`. */
const RENT_COLUMNS = new Set(["deposit", "available_from", "maintenance_included"]);

function buildPayload(
  v: Record<string, any>,
  typeCode: string,
  kind: string,
  type: TypeConfig | null,
  defs: FieldDefMap = {},
) {
  const attrs: Record<string, unknown> = {};
  // The type's own fields plus the per-kind extras, minus anything currently
  // HIDDEN. Sending a hidden value would put a possession date on a
  // ready-to-move flat; the server strips it too, but the preview screen reads
  // this payload, so it has to be honest before the round trip.
  const keys = visibleKeys(
    keysForKind({ fields: type?.fields, sell_fields: type?.sellFields, rent_fields: type?.rentFields }, kind),
    defs,
    v,
  );
  for (const f of keys) {
    if (RENT_COLUMNS.has(f)) continue;
    if (v[f] !== undefined && v[f] !== null && v[f] !== "") attrs[f] = v[f];
  }

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

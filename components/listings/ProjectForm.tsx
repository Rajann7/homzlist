"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, BottomSheet, Button, Header, Icon, Skeleton, Toggle, useToast } from "@/components/billing/ui";
import { OfflineBanner, SectionLabel } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { listingsApi, uploadBrochure, uploadDoc, formatIndianCommas, priceInWords } from "@/lib/listings/client";
import { LocationCascade, PincodeField } from "./LocationPicker";
import { DynamicSections, OptionChip, hasValue } from "./FormControls";
import type { FieldDefMap, ProjectTypeConfig } from "@/lib/listings/client";
import { visibleKeys } from "@/lib/listings/visibility";
import { cn } from "@/lib/utils";

/**
 * P6 S5 — the Builder project form, 5 steps exactly as the design lays them out:
 * Basics → Unit types → Media → Amenities & Banks → Location & Review.
 *
 * Everything selectable (amenities, banks, unit names, build statuses, areas)
 * comes from the server or from the same config the listing form uses — the
 * design's example values are examples, not a hardcoded source of truth
 * (CLAUDE.md §7).
 *
 * Payment-first still applies: `POST /projects` draws the ₹9,999 slot before it
 * writes anything, so a builder with no plan is sent to the plan wall rather
 * than being allowed to fill five steps and fail at the end — the quota is
 * therefore checked when the form opens, too.
 */

const STEPS = ["Basics", "Unit types", "Media", "Amenities & Banks", "Location & Review"] as const;

/**
 * Nothing here is a constant any more.
 *
 * This file used to hold four option lists: BUILD_STATUS, EXEMPT_REASONS,
 * UNIT_NAMES and BANKS. Between them they decided the three statuses a scheme
 * could have, the seven unit names a builder could choose from (a row-house
 * scheme had to call its units "1 BHK" or "Shop"), and which lenders existed.
 * All four are `field_definitions` rows or `project_types.unit_types` now
 * (migrations 0062/0063) — CLAUDE.md rule 7.
 */

const BLANK_UNIT: UnitDraft = { unitType: "", areaSqft: "", carpetSqft: "", priceFrom: "", unitsAvailable: "", floorPlanUrl: null };

export interface UnitDraft {
  unitType: string;
  areaSqft: string;
  carpetSqft: string;
  priceFrom: string;
  unitsAvailable: string;
  floorPlanUrl: string | null;
}

export function ProjectForm() {
  // `?edit=<id>` re-opens the five-step wizard on an existing project.
  const editParams = useSearchParams();
  const editId = editParams.get("edit");
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [amenityOptions, setAmenityOptions] = useState<{ code: string; label: string }[]>([]);
  // Everything the form used to hardcode, now server data.
  const [projectTypes, setProjectTypes] = useState<ProjectTypeConfig[]>([]);
  const [fieldDefs, setFieldDefs] = useState<FieldDefMap>({});
  const [fieldGroups, setFieldGroups] = useState<{ key: string; label: string }[]>([]);
  /** Which kind of scheme this is — it decides every extra field below. */
  const [projectType, setProjectType] = useState<string>("");
  /** The chosen scheme's type-specific answers (site area, OC, land zone…). */
  const [attrs, setAttrs] = useState<Record<string, any>>({});
  const setAttr = (k: string, v: unknown | ((p: any) => unknown)) =>
    setAttrs((s) => ({ ...s, [k]: typeof v === "function" ? (v as (p: any) => unknown)(s[k]) : v }));

  const chosenType = projectTypes.find((t) => t.code === projectType) ?? null;
  const optionsOf = (key: string) => fieldDefs[key]?.options ?? [];
  /** The caller's role, so a non-Builder is turned away before step 1, not after step 5. */
  const [role, setRole] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ---- Step 1 ----
  const [name, setName] = useState("");
  const [buildStatus, setBuildStatus] = useState<string>("under_construction");
  const [possession, setPossession] = useState<string | null>(null);
  const [towers, setTowers] = useState("");
  const [floors, setFloors] = useState("");
  const [totalUnits, setTotalUnits] = useState("");
  const [availableUnits, setAvailableUnits] = useState("");
  const [reraNumber, setReraNumber] = useState("");
  const [reraExempt, setReraExempt] = useState(false);
  const [exemptReason, setExemptReason] = useState("");
  const [monthSheet, setMonthSheet] = useState(false);
  const [reasonSheet, setReasonSheet] = useState(false);

  // ---- Step 2 ----
  const [units, setUnits] = useState<UnitDraft[]>([]);
  const [unitSheet, setUnitSheet] = useState<{ index: number | null } | null>(null);

  // ---- Step 3 ----
  // The project doesn't exist until Step 5 submits, so the PDF is held here and
  // uploaded immediately after creation — the scan result comes from the server.
  const [brochureFile, setBrochureFile] = useState<File | null>(null);
  const [brochureName, setBrochureName] = useState<string | null>(null);
  const [brochureState, setBrochureState] = useState<"idle" | "scanning" | "ready" | "failed">("idle");

  // ---- Step 4 ----
  const [amenities, setAmenities] = useState<string[]>([]);
  const [banks, setBanks] = useState<string[]>([]);

  /**
   * ---- Step 5: location ----
   *
   * One bag of values, so the shared `LocationCascade` can drive it exactly as
   * it drives the listing form. It used to be an AREA picker alone, scoped to
   * whatever city sat on the builder's PROFILE — so a builder could only ever
   * publish projects in one city, and there was no way to say which state,
   * district or taluka the project was in. The pincode beside it was free text
   * and optional, so it was usually blank.
   */
  const [place, setPlace] = useState<Record<string, any>>({});
  const setPlaceField = (k: string, v: unknown) => setPlace((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    const [cfg, me] = await Promise.all([
      listingsApi.config(),
      fetch("/api/v1/auth/me").then((r) => r.json()).catch(() => null),
    ]);
    if (cfg.ok) {
      setAmenityOptions(cfg.data.amenities.map((a) => ({ code: a.code, label: a.label })));
      setProjectTypes(cfg.data.projectTypes ?? []);
      setFieldDefs(cfg.data.fieldDefs ?? {});
      setFieldGroups(cfg.data.fieldGroups ?? []);
    } else setOffline(cfg.error.code === "OFFLINE");
    // The profile's city is a starting SUGGESTION now, not the only option —
    // the cascade below can take the builder anywhere in the country.
    setRole(me?.data?.user?.role ?? null);
    const home = me?.data?.user?.cityId ?? null;
    if (home) setPlace((p) => ({ ...p, cityId: p.cityId ?? home }));

    // Edit mode: re-open all five steps on the project's current values.
    if (editId) {
      const r = await listingsApi.getProject(editId);
      if (r.ok) {
        const p = r.data.project;
        setName(p.name ?? "");
        setProjectType(p.projectType ?? "");
        setAttrs((p.attributes as Record<string, any>) ?? {});
        setBuildStatus(p.buildStatus ?? "under_construction");
        setPossession(p.possessionDate ?? null);
        setTowers(p.towers != null ? String(p.towers) : "");
        setFloors(p.floors != null ? String(p.floors) : "");
        setTotalUnits(p.totalUnits != null ? String(p.totalUnits) : "");
        setAvailableUnits(p.availableUnits != null ? String(p.availableUnits) : "");
        // RERA and the location ids are owner-only — the public shape carries
        // `rera` as a label pair and no ids at all.
        const o = p.owner ?? {};
        setReraNumber(o.reraNumber ?? "");
        setReraExempt(!!o.reraExempt);
        setExemptReason(o.reraExemptReason ?? "");
        setAmenities(p.amenities ?? []);
        setBanks(p.bankApprovals ?? []);
        // The owner payload carries the whole chain, so an edit re-opens the
        // cascade on the real place rather than on the builder's home city.
        setPlace({
          stateId: o.stateId ?? null,
          districtId: o.districtId ?? null,
          talukaId: o.talukaId ?? null,
          cityId: o.cityId ?? null,
          areaId: o.areaId ?? null,
          areaLabel: p.areaLabel ?? null,
          pincode: p.pincode ?? null,
        });
        setUnits((p.units ?? []).map((u: any) => ({
          unitType: u.unitType ?? "",
          areaSqft: u.areaSqft != null ? String(u.areaSqft) : "",
          carpetSqft: u.carpetSqft != null ? String(u.carpetSqft) : "",
          priceFrom: u.priceFromPaise != null ? String(Math.round(u.priceFromPaise / 100)) : "",
          unitsAvailable: u.unitsAvailable != null ? String(u.unitsAvailable) : "",
          floorPlanUrl: u.floorPlanUrl ?? null,
        })));
      }
    }
    setLoading(false);
  }, [editId]);

  useEffect(() => { void load(); }, [load]);

  const dirty = Boolean(name || units.length || amenities.length || banks.length || place.areaId);

  // Per-step validation — the design shows "per-step validation states".
  function stepErrors(i: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (i === 0) {
      // The scheme kind gates everything else on this step, so it is checked first.
      if (!projectType) e.projectType = "Choose the project type";
      if (name.trim().length < 3) e.name = "Enter the project name";
      if (!reraExempt && !reraNumber.trim()) e.reraNumber = "RERA number is required";
      if (reraExempt && !exemptReason) e.exemptReason = "Choose an exemption reason";
      // Whatever the chosen scheme marks as required, from its own config.
      for (const k of chosenType?.required ?? []) {
        if (!hasValue(attrs[k])) e[k] = `${fieldDefs[k]?.label ?? "This field"} is required`;
      }
      if (totalUnits && availableUnits && Number(availableUnits) > Number(totalUnits)) {
        e.availableUnits = "Available units can't exceed total units";
      }
    }
    if (i === 1 && units.length === 0) e.units = "Add at least one unit type";
    if (i === 4) {
      if (!place.cityId) e.cityId = "Choose the project's city";
      // Required, like it is on a listing: an area page with no postal anchor
      // is the reason it stopped being optional.
      if (!place.pincode) e.pincode = "Select a pincode";
      else if (!/^[1-9]\d{5}$/.test(String(place.pincode))) e.pincode = "Enter a valid 6-digit pincode";
    }
    return e;
  }

  function next() {
    const e = stepErrors(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    setConfirmOpen(false);
    setSubmitting(true);
    setErrors({});

    const payload = {
      name: name.trim(),
      projectType,
      // Only what the chosen scheme asks for, and only what is still visible —
      // the server re-runs the same filter, so this just keeps the request
      // honest rather than being the control.
      attributes: Object.fromEntries(
        visibleKeys(
          (chosenType?.fields ?? []).filter((k) => fieldDefs[k]),
          fieldDefs,
          { ...attrs, build_status: buildStatus },
        ).map((k) => [k, attrs[k]]).filter(([, v]) => v !== undefined && v !== null && v !== ""),
      ),
      reraNumber: reraExempt ? null : reraNumber.trim(),
      reraExempt,
      reraExemptReason: reraExempt ? exemptReason : null,
      buildStatus,
      // Mirrors the server: a finished scheme carries no possession date.
      possessionDate: buildStatus === "ready" ? null : possession,
      towers: towers ? Number(towers) : null,
      floors: floors ? Number(floors) : null,
      totalUnits: totalUnits ? Number(totalUnits) : null,
      availableUnits: availableUnits ? Number(availableUnits) : null,
      bankApprovals: banks,
      amenities,
      stateId: place.stateId ?? null,
      districtId: place.districtId ?? null,
      talukaId: place.talukaId ?? null,
      cityId: place.cityId ?? null,
      areaId: place.areaId ?? null,
      areaLabel: place.areaLabel ?? null,
      pincode: place.pincode || null,
      units: units.map((u) => ({
        unitType: u.unitType,
        areaSqft: u.areaSqft ? Number(u.areaSqft.replace(/\D/g, "")) : undefined,
        carpetSqft: u.carpetSqft ? Number(u.carpetSqft.replace(/\D/g, "")) : undefined,
        priceFromPaise: u.priceFrom ? Number(u.priceFrom.replace(/\D/g, "")) * 100 : undefined,
        unitsAvailable: u.unitsAvailable ? Number(u.unitsAvailable) : undefined,
        floorPlanUrl: u.floorPlanUrl ?? undefined,
      })),
    };

    // Editing PATCHes the existing project — no second ₹9,999 slot is drawn.
    const res = editId
      ? await listingsApi.updateProject(editId, payload)
      : await listingsApi.createProject(payload);

    if (res.ok) {
      // Attach the brochure now that the project id exists. A rejected PDF is
      // reported but never blocks the submission the user already paid for.
      const projectId = editId ?? res.data.project.id;
      if (brochureFile) {
        setBrochureState("scanning");
        const up = await uploadBrochure(projectId, brochureFile);
        if (!up.ok) toast.show(up.error ?? "Brochure couldn't be attached — add it from the project later");
      }
      setSubmitting(false);
      if (editId) {
        toast.show("Changes saved — back for review");
        router.replace(`/projects/${editId}`);
      } else {
        router.replace("/create/success?kind=project");
      }
      return;
    }
    setSubmitting(false);
    if (res.error.code === "PLAN_REQUIRED") {
      toast.show("A ₹9,999 project plan is needed");
      router.push("/create?wall=1&intent=project");
      return;
    }
    if (res.error.code === "FORBIDDEN") { toast.show("Projects are for Builder accounts"); return; }
    const field = (res.error as { field?: string }).field;
    if (field) setErrors({ [field]: "Please check this field" });
    toast.show("Please check the highlighted fields");
  }

  if (loading) {
    return (
      <Shell step={0} onClose={() => router.back()}>
        <div className="flex flex-col gap-4 p-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[120px] w-full rounded-12" />)}
        </div>
      </Shell>
    );
  }

  // Projects are Builder-only (Doc2 §6) and the server enforces it — but only
  // at the very END, on POST. An Owner who reached this URL could fill five
  // steps, upload a brochure and every floor plan, and be told "Projects are
  // for Builder accounts" on the last tap. Say it on arrival instead.
  if (role && role !== "builder") {
    return (
      <Shell step={0} onClose={() => router.push("/create")}>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Icon name="image" size={32} className="text-ink-tertiary" />
          <p className="text-15 font-semibold text-ink-primary">Projects are for Builder accounts</p>
          <p className="max-w-[280px] text-13 leading-[1.45] text-ink-secondary">
            You can still list individual properties for sale or rent.
          </p>
          <Button variant="outline" onClick={() => router.push("/create")}>Back to Create</Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={editId ? "Edit project" : "Post a project"} step={step} onClose={() => (dirty ? setLeaveOpen(true) : router.back())}>
      {offline && <OfflineBanner />}

      <div className="flex flex-col gap-6 p-4 pb-32">
        {step === 0 && (
          <>
            {/* The scheme kind comes FIRST — it decides every field below it.
                There was no such choice at all: a plotting scheme and an
                apartment tower filled in the identical form. */}
            <section className="flex flex-col gap-3">
              <SectionLabel>Project type</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {projectTypes.map((t) => (
                  <OptionChip
                    key={t.code}
                    selected={projectType === t.code}
                    // Switching the scheme kind changes which extras apply, so
                    // the previous kind's answers must not ride along.
                    onClick={() => { setProjectType(t.code); setAttrs({}); }}
                  >
                    {t.label}
                  </OptionChip>
                ))}
              </div>
              {errors.projectType && <FieldError msg={errors.projectType} />}
            </section>

            <Field label="Project name" error={errors.name}>
              <TextInput value={name} onChange={setName} placeholder="Shivalik Heights" />
            </Field>

            <section className="flex flex-col gap-3">
              <SectionLabel>Status</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {optionsOf("build_status").map((s) => (
                  <OptionChip key={s.value} selected={buildStatus === s.value} onClick={() => setBuildStatus(s.value)}>
                    {s.label}
                  </OptionChip>
                ))}
              </div>
            </section>

            {/* A finished scheme has nothing to possess LATER. The row was
                unconditional, so "Ready to move" was still asked for a
                possession month and the server stored whatever was picked. */}
            {buildStatus !== "ready" && (
              <RowButton
                label="Possession"
                value={possession ? formatMonth(possession) : null}
                placeholder="Choose month"
                onClick={() => setMonthSheet(true)}
              />
            )}

            <div className="flex gap-3">
              <Field label="Towers"><TextInput value={towers} onChange={(v) => setTowers(v.replace(/\D/g, ""))} numeric /></Field>
              <Field label="Floors"><TextInput value={floors} onChange={(v) => setFloors(v.replace(/\D/g, ""))} numeric /></Field>
            </div>
            <div className="flex gap-3">
              <Field label="Total units"><TextInput value={totalUnits} onChange={(v) => setTotalUnits(v.replace(/\D/g, ""))} numeric /></Field>
              <Field label="Available units" error={errors.availableUnits}>
                <TextInput value={availableUnits} onChange={(v) => setAvailableUnits(v.replace(/\D/g, ""))} numeric />
              </Field>
            </div>

            {/* RERA card — accentSoft, per the design */}
            <section className="flex flex-col gap-3 rounded-8 bg-accent-soft p-4">
              <Field label="RERA number" error={errors.reraNumber} hint="Required for projects — buyers look for this">
                <TextInput value={reraNumber} onChange={setReraNumber} disabled={reraExempt} placeholder="PR/GJ/RAJKOT/…" />
              </Field>
              <div className="flex items-center justify-between">
                <span className="text-13 font-semibold text-ink-primary">RERA exempt</span>
                <Toggle checked={reraExempt} label="RERA exempt" onChange={setReraExempt} />
              </div>
              {reraExempt && (
                <Field label="Exemption reason" error={errors.exemptReason}>
                  <button
                    onClick={() => setReasonSheet(true)}
                    className="flex h-11 items-center justify-between rounded-8 border border-border bg-surface-1 px-3 text-left"
                  >
                    <span className={cn("text-15", exemptReason ? "text-ink-primary" : "text-ink-tertiary")}>
                      {optionsOf("rera_exempt_reason").find((o) => o.value === exemptReason)?.label ?? "Choose a reason"}
                    </span>
                    <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
                  </button>
                </Field>
              )}
            </section>

            {/* The chosen scheme's own questions — the site area, the permitted
                floors on a plotting scheme, the Occupancy Certificate on a
                finished one. Rendered by the SAME component the listing form
                uses, so the two screens cannot drift apart again. */}
            <DynamicSections
              keys={chosenType?.fields ?? []}
              defs={fieldDefs}
              groups={fieldGroups}
              values={{ ...attrs, build_status: buildStatus }}
              errors={errors}
              required={chosenType?.required ?? []}
              landUnits
              onChange={setAttr}
              fallbackLabel={`${chosenType?.label ?? "Project"} details`}
            />
          </>
        )}

        {step === 1 && (
          <section className="flex flex-col gap-3">
            <SectionLabel>Unit types</SectionLabel>
            {units.map((u, i) => (
              <div key={i} className="rounded-12 border border-border bg-surface-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-15 font-semibold text-ink-primary">
                      {[u.unitType, u.areaSqft && `${formatIndianCommas(u.areaSqft)} sqft`, u.priceFrom && `${priceInWords(u.priceFrom)} onwards`]
                        .filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-0.5 text-11 text-ink-tertiary">
                      {[u.carpetSqft && `Carpet ${formatIndianCommas(u.carpetSqft)} sqft`, u.unitsAvailable && `${u.unitsAvailable} available`]
                        .filter(Boolean).join(" · ") || "No area details"}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button aria-label="Edit unit" onClick={() => setUnitSheet({ index: i })} className="grid h-9 w-9 place-items-center text-ink-secondary">
                      <Icon name="edit" size={18} />
                    </button>
                    <button aria-label="Delete unit" onClick={() => setUnits((c) => c.filter((_, x) => x !== i))} className="grid h-9 w-9 place-items-center text-error">
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={() => setUnitSheet({ index: null })}
              className="flex h-14 items-center justify-center gap-2 rounded-12 border border-dashed border-border text-15 font-semibold text-accent"
            >
              <Icon name="plus" size={18} /> Add unit type
            </button>
            {errors.units && <FieldError msg={errors.units} />}
          </section>
        )}

        {step === 2 && (
          <section className="flex flex-col gap-4">
            <SectionLabel>Media</SectionLabel>
            <p className="text-13 text-ink-secondary">
              Photos are added after the project is created, from the project&apos;s photo screen —
              unlimited for Builder accounts.
            </p>

            <div className="flex flex-col gap-2">
              <span className="text-13 font-semibold text-ink-secondary">Brochure (PDF, max 10MB)</span>
              <BrochureTile
                name={brochureName}
                state={brochureState}
                onPick={(file) => {
                  if (file.size > 10 * 1024 * 1024) {
                    setBrochureState("failed");
                    setBrochureName(file.name);
                    toast.show("That brochure is over 10MB");
                    return;
                  }
                  setBrochureFile(file);
                  setBrochureName(file.name);
                  // "Ready to upload" — the real scan is the server's magic-byte
                  // check on commit, which runs when the project is created.
                  setBrochureState("ready");
                }}
                onClear={() => { setBrochureFile(null); setBrochureName(null); setBrochureState("idle"); }}
              />
              <p className="text-11 text-ink-tertiary">
                Brochures are scanned before buyers can download them.
              </p>
            </div>
          </section>
        )}

        {step === 3 && (
          <>
            <section className="flex flex-col gap-3">
              <SectionLabel>Amenities</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {amenityOptions.map((a) => {
                  const on = amenities.includes(a.label);
                  return (
                    <OptionChip key={a.code} selected={on} onClick={() => setAmenities((c) => on ? c.filter((x) => x !== a.label) : [...c, a.label])}>
                      {a.label}
                    </OptionChip>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <SectionLabel>Bank approvals</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {optionsOf("bank_approvals").map((b) => {
                  const on = banks.includes(b.value);
                  return (
                    <OptionChip key={b.value} selected={on} onClick={() => setBanks((c) => on ? c.filter((x) => x !== b.value) : [...c, b.value])}>
                      {b.label}
                    </OptionChip>
                  );
                })}
              </div>
              <p className="text-11 text-ink-tertiary">Approved banks help buyers get loans faster.</p>
            </section>
          </>
        )}

        {step === 4 && (
          <>
            <section className="flex flex-col gap-4">
              <SectionLabel>Location</SectionLabel>
              <LocationCascade values={place} set={setPlaceField} errors={errors} />
              <PincodeField
                cityId={place.cityId ?? null}
                areaId={place.areaId ?? null}
                value={place.pincode ?? null}
                onChange={(v) => setPlaceField("pincode", v)}
                error={errors.pincode}
              />
            </section>

            <section className="flex flex-col gap-3">
              <SectionLabel>Review</SectionLabel>
              <div className="flex flex-col rounded-12 border border-border bg-surface-1">
                <ReviewRow label="Project" value={name} onEdit={() => setStep(0)} />
                <ReviewRow label="Type" value={chosenType?.label ?? ""} onEdit={() => setStep(0)} />
                <ReviewRow label="Status" value={optionsOf("build_status").find((b) => b.value === buildStatus)?.label ?? ""} onEdit={() => setStep(0)} />
                <ReviewRow label="RERA" value={reraExempt ? `Exempt — ${optionsOf("rera_exempt_reason").find((o) => o.value === exemptReason)?.label ?? exemptReason}` : reraNumber} onEdit={() => setStep(0)} />
                <ReviewRow label="Unit types" value={`${units.length} added`} onEdit={() => setStep(1)} />
                <ReviewRow label="Amenities" value={amenities.length ? `${amenities.length} selected` : "None"} onEdit={() => setStep(3)} />
                <ReviewRow label="Banks" value={banks.length ? banks.join(", ") : "None"} onEdit={() => setStep(3)} />
                <ReviewRow label="Location" value={place.areaLabel ?? "—"} onEdit={() => setStep(4)} last />
              </div>
            </section>

            {/* An edit is already paid for — showing the price here (and a
                "Continue to Payment" button below it) claimed a charge that
                never happens. */}
            <div className="flex items-center gap-3 rounded-8 bg-surface-2 p-3">
              <Icon name="check" size={18} className="text-accent" />
              <span className="text-13 text-accent">
                {editId ? "Editing an existing project — no new charge" : "₹9,999 · 6 months · 1 project"}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Sticky step nav */}
      <div className="sticky bottom-0 flex gap-3 border-t border-border bg-surface-1 p-4">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="flex-1">Back</Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button fullWidth={step === 0} className={step > 0 ? "flex-1" : undefined} onClick={next}>Continue</Button>
        ) : (
          <Button className="flex-1" loading={submitting} onClick={() => { const e = stepErrors(4); setErrors(e); if (!Object.keys(e).length) setConfirmOpen(true); }}>
            {editId ? "Save changes" : "Continue to Payment"}
          </Button>
        )}
      </div>

      <MonthSheet open={monthSheet} onClose={() => setMonthSheet(false)} onPick={(v) => { setPossession(v); setMonthSheet(false); }} />

      <BottomSheet open={reasonSheet} onClose={() => setReasonSheet(false)} title="Exemption reason">
        <div className="flex flex-col pb-2">
          {optionsOf("rera_exempt_reason").map((r) => (
            <button key={r.value} onClick={() => { setExemptReason(r.value); setReasonSheet(false); }} className="flex h-12 items-center justify-between px-4 text-left active:bg-surface-2">
              <span className="text-15 text-ink-primary">{r.label}</span>
              {exemptReason === r.value && <Icon name="check" size={20} className="text-accent" />}
            </button>
          ))}
        </div>
      </BottomSheet>

      <UnitSheet
        unitNames={chosenType?.unitTypes ?? []}
        open={Boolean(unitSheet)}
        initial={unitSheet?.index !== null && unitSheet?.index !== undefined ? units[unitSheet.index] : null}
        onClose={() => setUnitSheet(null)}
        onSave={(u) => {
          setUnits((cur) => {
            if (unitSheet?.index === null || unitSheet?.index === undefined) return [...cur, u];
            const next = [...cur];
            next[unitSheet.index] = u;
            return next;
          });
          setUnitSheet(null);
          toast.show("Unit added");
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void submit()}
        title={editId ? "Save these changes?" : "Submit this project for review?"}
        body={
          editId
            ? "Edited projects go back for review — usually within 24 hours. This does not use another project slot."
            : "Our team reviews projects within 24 hours. Your ₹9,999 project slot is used on submit."
        }
        confirmLabel={editId ? "Save" : "Submit"}
      />

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => router.back()}
        title="Discard this project?"
        body="Your changes won't be saved."
        confirmLabel="Discard"
        destructive
      />
    </Shell>
  );
}

// ---------------------------------------------------------------------------

function Shell({ children, step, onClose, title = "Post a project" }: { children: React.ReactNode; step: number; onClose: () => void; title?: string }) {
  return (
    <AppShell showNav={false}>
      <Header
        left={
          <button aria-label="Close" onClick={onClose} className="chrome grid h-11 w-11 -ml-2 place-items-center text-ink-primary active:bg-surface-2">
            <Icon name="close" size={24} strokeWidth={1.7} />
          </button>
        }
        title={title}
        centerTitle
      />
      {/* Step indicator + progress bar. designs/P6 S5 splits the line: the step
          count on the left, the step NAME on the right in ink3, both 11/600,
          over a 4px track on surface-1. */}
      <div className="border-b border-divider bg-surface-1 px-4 py-2.5">
        <div className="mb-1.5 flex justify-between text-11 font-semibold leading-none">
          <span className="text-ink-secondary">Step {step + 1} of {STEPS.length}</span>
          <span className="text-ink-tertiary">{STEPS[step]}</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>
      {children}
    </AppShell>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-13 font-semibold text-ink-secondary">{label}</span>
      {children}
      {hint && !error && <span className="text-11 text-ink-tertiary">{hint}</span>}
      {error && <FieldError msg={error} />}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span className="flex items-center gap-1.5">
      <Icon name="alert" size={14} className="text-error" />
      <span className="text-11 text-error">{msg}</span>
    </span>
  );
}

function TextInput({
  value, onChange, placeholder, numeric, disabled,
}: { value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; disabled?: boolean }) {
  return (
    <input
      value={value}
      disabled={disabled}
      inputMode={numeric ? "numeric" : "text"}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "h-11 w-full rounded-8 border border-border bg-surface-2 px-3 text-15 text-ink-primary outline-none placeholder:text-ink-tertiary focus:border-accent",
        disabled && "opacity-50",
      )}
    />
  );
}

function RowButton({ label, value, placeholder, onClick }: { label: string; value: string | null; placeholder: string; onClick: () => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-13 font-semibold text-ink-secondary">{label}</span>
      <button onClick={onClick} className="flex h-11 items-center justify-between rounded-8 border border-border bg-surface-2 px-3 text-left">
        <span className={cn("text-15", value ? "text-ink-primary" : "text-ink-tertiary")}>{value ?? placeholder}</span>
        <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
      </button>
    </div>
  );
}

function ReviewRow({ label, value, onEdit, last }: { label: string; value: string; onEdit: () => void; last?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 px-3 py-2.5", !last && "border-b border-divider")}>
      <span className="w-24 shrink-0 text-13 text-ink-secondary">{label}</span>
      <span className="min-w-0 flex-1 truncate text-13 text-ink-primary">{value || "—"}</span>
      <button onClick={onEdit} className="shrink-0 text-13 font-semibold text-accent">Edit</button>
    </div>
  );
}

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

/** Month picker — 36 months forward from today, matching "Dec 2026" in the design. */
function MonthSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (iso: string) => void }) {
  const now = new Date();
  const months = Array.from({ length: 36 }, (_, i) => new Date(now.getFullYear(), now.getMonth() + i, 1));
  return (
    <BottomSheet open={open} onClose={onClose} title="Possession month">
      <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto p-4">
        {months.map((m) => (
          <button
            key={m.toISOString()}
            onClick={() => onPick(m.toISOString().slice(0, 10))}
            className="h-11 rounded-8 bg-surface-2 text-13 font-semibold text-ink-primary active:bg-surface-3"
          >
            {m.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

function BrochureTile({
  name, state, onPick, onClear,
}: { name: string | null; state: string; onPick: (f: File) => void; onClear: () => void }) {
  if (!name) {
    return (
      <label className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-12 border border-dashed border-border text-15 font-semibold text-accent">
        <Icon name="plus" size={18} /> Upload brochure
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }}
        />
      </label>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-12 border border-border bg-surface-1 p-3">
      <Icon name="file" size={20} className="text-ink-secondary" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-13 font-semibold text-ink-primary">{name}</div>
        <div className="text-11 text-ink-tertiary">
          {state === "scanning" ? "Scanning…" : state === "ready" ? "Ready ✓" : "Upload failed"}
        </div>
      </div>
      <button aria-label="Remove brochure" onClick={onClear} className="grid h-9 w-9 place-items-center text-ink-tertiary">
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

function UnitSheet({
  open, initial, onClose, onSave, unitNames,
}: { open: boolean; initial: UnitDraft | null; onClose: () => void; onSave: (u: UnitDraft) => void;
     /** The chosen scheme's own unit names — a row-house scheme no longer has
      *  to call its units "1 BHK" or "Shop" (migration 0062). */
     unitNames: string[] }) {
  // Module scope, not a fresh object every render — as a local it was a new
  // identity each time, which is what the exhaustive-deps warning below was
  // really about and why the disable comment (placed on the wrong line, so it
  // never applied) was there.
  const [u, setU] = useState<UnitDraft>(BLANK_UNIT);
  const [nameSheet, setNameSheet] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const planRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => { if (open) setU(initial ?? BLANK_UNIT); }, [open, initial]);

  const set = (k: keyof UnitDraft, v: string | null) => setU((c) => ({ ...c, [k]: v }));
  const bump = (delta: number) =>
    setU((c) => ({ ...c, unitsAvailable: String(Math.max(0, Number(c.unitsAvailable || 0) + delta)) }));

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? "Edit unit" : "Add unit type"}>
      <div className="flex flex-col gap-4 p-4">
        <RowButton label="Unit name" value={u.unitType || null} placeholder="Choose" onClick={() => setNameSheet(true)} />

        <div className="flex gap-3">
          <Field label="Built-up (sqft)"><TextInput value={u.areaSqft} numeric onChange={(v) => set("areaSqft", v.replace(/\D/g, ""))} /></Field>
          <Field label="Carpet (sqft)"><TextInput value={u.carpetSqft} numeric onChange={(v) => set("carpetSqft", v.replace(/\D/g, ""))} /></Field>
        </div>

        <Field label="Price from" hint={u.priceFrom ? priceInWords(u.priceFrom) : undefined}>
          <TextInput value={u.priceFrom} numeric onChange={(v) => set("priceFrom", formatIndianCommas(v.replace(/\D/g, "")))} placeholder="45,00,000" />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-13 font-semibold text-ink-secondary">Units available</span>
          <div className="flex items-center gap-3">
            {/* Functional updates: reading the count from the render closure
                loses increments when the user taps faster than React commits. */}
            <button aria-label="Decrease" onClick={() => bump(-1)} className="grid h-11 w-11 place-items-center rounded-8 bg-surface-2 text-ink-primary">
              <Icon name="minus" size={18} />
            </button>
            <span className="min-w-[3ch] text-center text-17 font-semibold text-ink-primary">{u.unitsAvailable || 0}</span>
            <button aria-label="Increase" onClick={() => bump(1)} className="grid h-11 w-11 place-items-center rounded-8 bg-surface-2 text-ink-primary">
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>

        {/* Floor plan — the design lists it per unit type. `floorPlanUrl` was
            already in the payload and the DB column; there was just no way to
            set it, so every unit shipped without a plan. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-13 font-semibold text-ink-secondary">Floor plan</span>
          <input
            ref={planRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setPlanBusy(true);
              const res = await uploadDoc(f);
              setPlanBusy(false);
              if (res.ok) { set("floorPlanUrl", res.key!); toast.show("Floor plan attached"); }
              else toast.show(res.error ?? "Couldn't upload that floor plan");
            }}
          />
          <button
            onClick={() => planRef.current?.click()}
            disabled={planBusy}
            className="flex flex-col items-center gap-1.5 rounded-8 border-[1.5px] border-dashed border-border p-4 disabled:opacity-50"
          >
            <Icon name={u.floorPlanUrl ? "check-circle" : "upload"} size={20} className={u.floorPlanUrl ? "text-accent" : "text-ink-tertiary"} />
            <span className="text-13 text-ink-tertiary">
              {planBusy ? "Uploading…" : u.floorPlanUrl ? "Floor plan attached — tap to replace" : "Upload floor plan (PDF/JPG)"}
            </span>
          </button>
        </div>

        <Button fullWidth disabled={!u.unitType} onClick={() => onSave(u)}>
          {initial ? "Save unit" : "Add unit"}
        </Button>
      </div>

      <BottomSheet open={nameSheet} onClose={() => setNameSheet(false)} title="Unit name">
        <div className="flex flex-col pb-2">
          {unitNames.map((n) => (
            <button key={n} onClick={() => { set("unitType", n); setNameSheet(false); }} className="flex h-12 items-center justify-between px-4 text-left active:bg-surface-2">
              <span className="text-15 text-ink-primary">{n}</span>
              {u.unitType === n && <Icon name="check" size={20} className="text-accent" />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </BottomSheet>
  );
}

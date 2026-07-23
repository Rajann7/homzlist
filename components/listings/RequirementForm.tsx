"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, BottomSheet, Button, Chip, Header, Icon, Skeleton, useToast } from "@/components/billing/ui";
import { OfflineBanner, SectionLabel } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import {
  listingsApi, requirementsApi, formatIndianCommas, priceInWords,
  type TypeConfig, type LocationNode,
} from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * P6 S4 — "Post a requirement".
 *
 * Sections A-E exactly as the design lays them out. Two rules worth naming:
 *
 *  - BHK disappears for Plot/Office/Shop. The server drops a posted `bhk` for
 *    those types too, so hiding it here is presentation, not enforcement.
 *  - The number warning under Notes never blocks the submit (Doc2 §5.3
 *    warnings-only) — it nudges and flags for the admin queue.
 *
 * Quota comes from the server on load and again in the submit response; the
 * strip never derives "you have a post left" in the browser.
 */

const MAX_AREAS = 5;
const NOTES_MAX = 500;

/**
 * Mirrors the server's NO_BHK_TYPES — see lib/listings/requirements.ts.
 * These must be the real `property_types.code` values, not guessed names.
 */
const NO_BHK = new Set([
  "plot_res", "plot_com", "plot_agri", "plot_farm",
  "office", "shop", "showroom", "godown",
]);

const URGENCIES = [
  { value: "immediate", label: "Immediate (within 1 month)" },
  { value: "1_3_months", label: "1–3 months" },
  { value: "exploring", label: "Just exploring" },
] as const;

/** Same detection the server uses, for the inline nudge only. */
const NUMBERISH = /\b[6-9](?:[\s.-]?\d){9}\b/;

export function RequirementForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  // `?edit=<id>` reuses this whole screen to edit an existing requirement:
  // same fields, same rules, but it PATCHes and spends no second quota post.
  const editId = params.get("edit");

  const [types, setTypes] = useState<TypeConfig[]>([]);
  const [quota, setQuota] = useState<{ left: number; unlimited: boolean; label: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const [kind, setKind] = useState<"sell" | "rent">("sell");
  const [typeCode, setTypeCode] = useState<string>("");
  const [bhk, setBhk] = useState<number | null>(null);
  const [minB, setMinB] = useState("");
  const [maxB, setMaxB] = useState("");
  const [areas, setAreas] = useState<LocationNode[]>([]);
  const [urgency, setUrgency] = useState<string>("immediate");
  const [notes, setNotes] = useState("");

  const [typeSheet, setTypeSheet] = useState(false);
  const [areaSheet, setAreaSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [cfg, mine] = await Promise.all([listingsApi.config(), listingsApi.myRequirements()]);
    if (cfg.ok) setTypes(cfg.data.types);
    if (mine.ok) setQuota(mine.data.quota);
    else setOffline(mine.error.code === "OFFLINE");

    // Prefill from the row being edited. Areas come back as ids only, so they
    // are resolved against the location list to get their names for the chips.
    if (editId && mine.ok) {
      const r = await requirementsApi.get(editId);
      if (r.ok) {
        const q = r.data.requirement as typeof r.data.requirement & {
          budgetMinPaise?: number | null; budgetMaxPaise?: number | null; areaIds?: string[];
        };
        setKind(q.kind);
        setTypeCode(q.typeCode);
        setBhk(q.bhk);
        setMinB(q.budgetMinPaise ? formatIndianCommas(String(Math.round(q.budgetMinPaise / 100))) : "");
        setMaxB(q.budgetMaxPaise ? formatIndianCommas(String(Math.round(q.budgetMaxPaise / 100))) : "");
        setUrgency(q.urgency);
        setNotes(q.notes ?? "");
        const ids = q.areaIds ?? [];
        if (ids.length) {
          const named = await listingsApi.locationsByIds(ids);
          if (named.ok) setAreas(named.data.items);
        }
      }
    }
    setLoading(false);
  }, [editId]);

  useEffect(() => { void load(); }, [load]);

  // A plot can't be rented and a PG can't be bought, so a requirement for one
  // could never match a listing. The listing form's picker already filtered on
  // `kinds`; this one offered all 13 regardless (Doc2 §5.1).
  const typesForKind = useMemo(() => types.filter((t) => t.kinds.includes(kind)), [types, kind]);
  const selectedType = typesForKind.find((t) => t.code === typeCode) ?? null;
  const showBhk = Boolean(typeCode) && !NO_BHK.has(typeCode);

  /** Buy↔Rent drops a type the new kind can't have — a stale "Rent a plot". */
  function switchKind(next: "sell" | "rent") {
    setKind(next);
    const stillValid = types.find((t) => t.code === typeCode)?.kinds.includes(next);
    if (typeCode && !stillValid) { setTypeCode(""); setBhk(null); }
  }

  // Live word-line under the budget row: "₹40 Lakh – ₹60 Lakh".
  const budgetWords = useMemo(() => {
    const loDigits = minB.replace(/\D/g, "");
    const hiDigits = maxB.replace(/\D/g, "");
    const lo = priceInWords(loDigits);
    const hi = priceInWords(hiDigits);
    if (lo && hi) return `${lo} – ${hi}`;
    if (hi) return `Up to ${hi}`;
    if (lo) return `${lo}+`;
    return null;
  }, [minB, maxB]);

  const budgetError =
    minB && maxB && Number(maxB.replace(/[, ]/g, "")) < Number(minB.replace(/[, ]/g, ""))
      ? "Max budget must be higher than min"
      : null;

  const numberWarning = notes.trim() && NUMBERISH.test(notes);
  const dirty = Boolean(typeCode || minB || maxB || areas.length || notes.trim());
  // An edit spends no quota — the post was already paid for — so an empty
  // pool must not disable Save the way it disables a new post.
  const noQuota = !editId && quota !== null && !quota.unlimited && quota.left <= 0;

  const canSubmit =
    Boolean(typeCode) && areas.length > 0 && (Boolean(minB) || Boolean(maxB)) && !budgetError && !noQuota;

  async function submit() {
    setConfirm(false);
    setSubmitting(true);
    setErrors({});
    const payload = {
      kind,
      typeCode,
      bhk: showBhk ? bhk : null,
      budgetMin: minB.replace(/[, ]/g, "") || null,
      budgetMax: maxB.replace(/[, ]/g, "") || null,
      areaIds: areas.map((a) => a.id),
      urgency,
      notes: notes.trim() || null,
    };
    const res = editId
      ? await listingsApi.updateRequirement(editId, payload)
      : await listingsApi.postRequirement(payload);
    setSubmitting(false);

    if (res.ok) {
      // An edit goes back to the requirement it changed; a new post gets the
      // success screen with the review timeline.
      if (editId) {
        toast.show("Changes saved — back for review");
        router.replace(`/requirements/${editId}`);
      } else {
        router.replace("/create/success?kind=requirement");
      }
      return;
    }
    if (res.error.code === "PLAN_REQUIRED") {
      toast.show("No requirement posts left");
      router.push("/plans");
      return;
    }
    const fieldErrors = (res.error as { errors?: Record<string, string> }).errors;
    if (fieldErrors) setErrors(fieldErrors);
    toast.show("Please check the highlighted fields");
  }

  if (loading) {
    return (
      <Shell onClose={() => router.back()}>
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="h-[120px] w-full rounded-12" />
          <Skeleton className="h-[140px] w-full rounded-12" />
          <Skeleton className="h-[160px] w-full rounded-12" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={editId ? "Edit requirement" : "Post a requirement"} onClose={() => (dirty ? setLeaveOpen(true) : router.back())}>
      {offline && <OfflineBanner />}

      <div className="flex flex-col gap-6 p-4 pb-32">
        {/* ---- A. LOOKING FOR ---- */}
        <section className="flex flex-col gap-3">
          <SectionLabel>Looking for</SectionLabel>
          <div className="flex gap-2">
            <Chip selected={kind === "sell"} onClick={() => switchKind("sell")}>Buy</Chip>
            <Chip selected={kind === "rent"} onClick={() => switchKind("rent")}>Rent</Chip>
          </div>

          <button
            onClick={() => setTypeSheet(true)}
            className="flex h-11 items-center justify-between rounded-8 border border-border bg-surface-2 px-3 text-left"
          >
            <span className={cn("text-15", selectedType ? "text-ink-primary" : "text-ink-tertiary")}>
              {selectedType?.label ?? "Property type"}
            </span>
            <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
          </button>
          {errors.typeCode && <FieldError msg={errors.typeCode} />}

          {/* Hidden automatically for Plot/Office/Shop — design's explicit rule. */}
          {showBhk && (
            <div className="flex flex-col gap-2">
              <div className="text-13 font-semibold text-ink-secondary">BHK</div>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Chip key={n} selected={bhk === n} onClick={() => setBhk(bhk === n ? null : n)}>
                    {n === 5 ? "5+" : n}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ---- B. BUDGET ---- */}
        <section className="flex flex-col gap-3">
          <SectionLabel>Budget</SectionLabel>
          <div className="flex gap-3">
            <MoneyInput label="Min budget" value={minB} onChange={setMinB} />
            <MoneyInput label="Max budget" value={maxB} onChange={setMaxB} error={Boolean(budgetError)} />
          </div>
          {budgetWords && !budgetError && <div className="text-13 text-accent">{budgetWords}</div>}
          {(budgetError || errors.budgetMax || errors.budgetMin) && (
            <FieldError msg={budgetError ?? errors.budgetMax ?? errors.budgetMin} />
          )}
        </section>

        {/* ---- C. PREFERRED AREAS ---- */}
        <section className="flex flex-col gap-3">
          <SectionLabel>Preferred areas</SectionLabel>
          <button
            onClick={() => setAreaSheet(true)}
            className="flex h-11 items-center justify-between rounded-8 border border-border bg-surface-2 px-3 text-left"
          >
            <span className={cn("text-15", areas.length ? "text-ink-primary" : "text-ink-tertiary")}>
              {areas.length ? `${areas.length} area${areas.length === 1 ? "" : "s"} selected` : "Choose areas"}
            </span>
            <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
          </button>

          {areas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {areas.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAreas((cur) => cur.filter((x) => x.id !== a.id))}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-13 font-semibold text-ink-primary"
                >
                  {a.name}
                  <Icon name="close" size={14} className="text-ink-tertiary" />
                </button>
              ))}
            </div>
          )}
          {errors.areas && <FieldError msg={errors.areas} />}
          <p className="text-11 text-ink-tertiary">We&apos;ll also show you matches from nearby areas.</p>
        </section>

        {/* ---- D. URGENCY ---- */}
        <section className="flex flex-col gap-3">
          <SectionLabel>Urgency</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {URGENCIES.map((u) => (
              <Chip key={u.value} selected={urgency === u.value} onClick={() => setUrgency(u.value)}>
                {u.label}
              </Chip>
            ))}
          </div>
        </section>

        {/* ---- E. NOTES ---- */}
        <section className="flex flex-col gap-2">
          <SectionLabel>Notes</SectionLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
            rows={4}
            placeholder="Any specific needs — facing, floor, furnishing, school nearby…"
            className="w-full resize-none rounded-8 border border-border bg-surface-2 p-3 text-15 text-ink-primary placeholder:text-ink-tertiary focus:border-accent focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-11 text-ink-tertiary">{notes.length} / {NOTES_MAX}</span>
          </div>
          {/* Warning, never a blocker (Doc2 §5.3). */}
          {numberWarning && (
            <div className="flex items-start gap-2 rounded-8 bg-warning-soft p-3">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-11 leading-[1.45] text-ink-secondary">
                Sharing your number here is risky — buyers can request it safely in chat.
              </p>
            </div>
          )}
        </section>

        {/* ---- Plan strip — server-computed quota (not shown on an edit) ---- */}
        {quota && !editId && (
          <div
            className={cn(
              "flex items-center gap-3 rounded-8 p-3",
              noQuota ? "bg-warning-soft" : "bg-surface-2",
            )}
          >
            <Icon name={noQuota ? "alert" : "check"} size={18} className={noQuota ? "text-warning" : "text-accent"} />
            <span className={cn("flex-1 text-13", noQuota ? "text-ink-secondary" : "text-accent")}>
              {noQuota ? "No requirement posts left — buy a plan" : quota.label}
            </span>
            {noQuota && (
              <button onClick={() => router.push("/plans")} className="text-13 font-semibold text-accent">
                View Plans
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---- Sticky submit ---- */}
      <div className="sticky bottom-0 border-t border-border bg-surface-1 p-4">
        <Button fullWidth disabled={!canSubmit} loading={submitting} onClick={() => setConfirm(true)}>
          {editId ? "Save changes" : "Submit for Review"}
        </Button>
      </div>

      <TypeSheet
        open={typeSheet}
        types={typesForKind}
        selected={typeCode}
        onPick={(code) => {
          setTypeCode(code);
          if (NO_BHK.has(code)) setBhk(null);
          setTypeSheet(false);
        }}
        onClose={() => setTypeSheet(false)}
      />

      <AreaSheet
        open={areaSheet}
        selected={areas}
        onDone={(next) => { setAreas(next); setAreaSheet(false); }}
        onClose={() => setAreaSheet(false)}
      />

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void submit()}
        title={editId ? "Save these changes?" : "Submit this requirement?"}
        body={
          editId
            ? "Edited requirements go back for review — usually within 24 hours. This does not use another post."
            : "Requirements are reviewed within 24 hours. You'll be notified once it's live."
        }
        confirmLabel={editId ? "Save" : "Submit"}
      />

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => router.back()}
        title="Discard this requirement?"
        body="Your changes won't be saved."
        confirmLabel="Discard"
        destructive
      />
    </Shell>
  );
}

// ---------------------------------------------------------------------------

function Shell({ children, onClose, title = "Post a requirement" }: { children: React.ReactNode; onClose: () => void; title?: string }) {
  return (
    <AppShell showNav={false}>
      <Header
        left={
          <button
            aria-label="Close"
            onClick={onClose}
            className="chrome grid h-11 w-11 -ml-2 place-items-center text-ink-primary active:bg-surface-2"
          >
            <Icon name="close" size={24} strokeWidth={1.7} />
          </button>
        }
        title={title}
        centerTitle
        // designs/P6 S4 also shows a "Save draft" action here. Requirements
        // have no draft path — createRequirement goes straight to
        // pending_review and the `draft` enum state has never been written —
        // so the button is deliberately absent rather than faked. Tracked in
        // docs/PENDING-INTEGRATIONS.md.
      />
      {children}
    </AppShell>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="flex items-center gap-1.5">
      <Icon name="alert" size={14} className="text-error" />
      <span className="text-11 text-error">{msg}</span>
    </div>
  );
}

function MoneyInput({
  label, value, onChange, error,
}: { label: string; value: string; onChange: (v: string) => void; error?: boolean }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-13 font-semibold text-ink-secondary">{label}</span>
      <div
        className={cn(
          "flex h-11 items-center rounded-8 border bg-surface-2 px-3",
          error ? "border-error" : "border-border",
        )}
      >
        <span className="mr-1 text-15 text-ink-tertiary">₹</span>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(formatIndianCommas(e.target.value.replace(/[^\d]/g, "")))}
          className="w-full bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
          placeholder="0"
        />
      </div>
    </label>
  );
}

function TypeSheet({
  open, types, selected, onPick, onClose,
}: {
  open: boolean; types: TypeConfig[]; selected: string;
  onPick: (code: string) => void; onClose: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Property type">
      <div className="flex flex-col pb-2">
        {types.map((t) => (
          <button
            key={t.code}
            onClick={() => onPick(t.code)}
            className="flex h-12 items-center justify-between px-4 text-left active:bg-surface-2"
          >
            <span className="text-15 text-ink-primary">{t.label}</span>
            {selected === t.code && <Icon name="check" size={20} className="text-accent" />}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

/**
 * Areas multi-select with the design's 5-item cap. Options come from the
 * locations table — never a hardcoded list (CLAUDE.md §7).
 */
function AreaSheet({
  open, selected, onDone, onClose,
}: {
  open: boolean; selected: LocationNode[];
  onDone: (next: LocationNode[]) => void; onClose: () => void;
}) {
  const [items, setItems] = useState<LocationNode[]>([]);
  const [picked, setPicked] = useState<LocationNode[]>(selected);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setPicked(selected);
    setLoading(true);
    // Areas live under the user's city in the location cascade, so the list is
    // scoped to it rather than showing every area in the country.
    (async () => {
      const me = await fetch("/api/v1/auth/me").then((r) => r.json()).catch(() => null);
      const cityId: string | null = me?.data?.user?.cityId ?? null;
      const r = await listingsApi.locations("area", cityId);
      if (r.ok) setItems(r.data.items);
      setLoading(false);
    })();
  }, [open, selected]);

  const shown = items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));
  const atCap = picked.length >= MAX_AREAS;

  return (
    <BottomSheet open={open} onClose={onClose} title="Preferred areas">
      <div className="flex flex-col gap-2 px-4 pb-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search areas"
          className="h-11 rounded-8 border border-border bg-surface-2 px-3 text-15 text-ink-primary outline-none placeholder:text-ink-tertiary focus:border-accent"
        />
        <p className="text-11 text-ink-tertiary">Select up to {MAX_AREAS}</p>
      </div>

      <div className="max-h-[46vh] overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full rounded-8" />)}
          </div>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-13 text-ink-secondary">No areas match &ldquo;{q}&rdquo;</p>
        ) : (
          shown.map((a) => {
            const on = picked.some((p) => p.id === a.id);
            const disabled = !on && atCap;
            return (
              <button
                key={a.id}
                disabled={disabled}
                onClick={() => setPicked((cur) => (on ? cur.filter((x) => x.id !== a.id) : [...cur, a]))}
                className={cn(
                  "flex h-12 w-full items-center justify-between px-4 text-left active:bg-surface-2",
                  disabled && "opacity-40",
                )}
              >
                <span className="text-15 text-ink-primary">{a.name}</span>
                {on && <Icon name="check" size={20} className="text-accent" />}
              </button>
            );
          })
        )}
      </div>

      <div className="border-t border-border p-4">
        <Button fullWidth onClick={() => onDone(picked)}>
          Done{picked.length ? ` (${picked.length})` : ""}
        </Button>
      </div>
    </BottomSheet>
  );
}

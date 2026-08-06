"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Button, Header, Icon, Skeleton, StatusBadge, Toggle, useToast } from "@/components/billing/ui";
import { BackButton, Checklist, OfflineBanner } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { ProposalSheet } from "./ProposalSheet";
import { requirementsApi, type RequirementDetail as Detail, type UnlockPlan } from "@/lib/listings/client";
import { DetailAnswerGrid, DetailCard, DetailSection } from "./detailBody";

/**
 * P4 S4 — requirement detail, three variants the SERVER picks:
 *   locked   → paywall; the budget/notes never arrive, so the blur is honest
 *   unlocked → full data (Send Proposal itself lands in Module 5)
 *   own      → the poster's controls: active toggle, fulfil, delete
 */
export function RequirementDetail({ id, isGuest = false }: { id: string; isGuest?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  // Billing routes are seller-only; a guest on the public host must sign in
  // first (unlock then happens on the seller subdomain).
  const goOrLogin = (path: string) => router.push(isGuest ? "/login" : path);

  const [r, setR] = useState<Detail | null>(null);
  const [unlockPlan, setUnlockPlan] = useState<UnlockPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [offDlg, setOffDlg] = useState(false);
  const [fulfilDlg, setFulfilDlg] = useState(false);
  const [delDlg, setDelDlg] = useState(false);
  const [proposalSheet, setProposalSheet] = useState(false);

  const load = useCallback(async () => {
    const res = await requirementsApi.get(id);
    if (res.ok) { setR(res.data.requirement); setUnlockPlan(res.data.unlockPlan ?? null); }
    else if (res.error.code === "OFFLINE") setOffline(true);
    else setNotFound(true);
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function setActive(on: boolean) {
    setOffDlg(false);
    const res = await requirementsApi.setActive(id, on);
    if (res.ok) { setR(res.data.requirement); toast.show(on ? "Requirement active" : "Requirement turned off"); }
    else toast.show("Couldn't update that");
  }

  async function markFulfilled() {
    setFulfilDlg(false);
    const res = await requirementsApi.fulfill(id);
    if (res.ok) { setR(res.data.requirement); toast.show("Marked as fulfilled"); }
    else toast.show("Couldn't update that");
  }

  async function remove() {
    setDelDlg(false);
    const res = await requirementsApi.remove(id);
    if (res.ok) { toast.show("Requirement deleted"); router.replace("/requirements"); }
    else toast.show("Couldn't delete that");
  }

  if (loading) {
    return (
      <Shell isGuest={isGuest}>
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-[120px] w-full rounded-12" />
          <Skeleton className="h-[160px] w-full rounded-12" />
        </div>
      </Shell>
    );
  }

  if (notFound || !r) {
    return (
      <Shell isGuest={isGuest}>
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <h2 className="text-20 font-bold text-ink-primary">Requirement not found</h2>
          <p className="text-15 text-ink-secondary">It may have been fulfilled, expired or removed.</p>
          {/* `/requirements` exists on the SELLER host only — the public host
              has just `/requirements/:id`, so this button 404'd for exactly the
              visitors most likely to hit a dead requirement link. */}
          <Button className="mt-2" onClick={() => router.push(isGuest ? "/" : "/requirements")}>
            {isGuest ? "Back to Home" : "Go to My Requirements"}
          </Button>
        </div>
      </Shell>
    );
  }

  const isOwn = r.access === "own";
  const locked = r.access === "locked";

  return (
    <Shell isGuest={isGuest}>
      {offline && <OfflineBanner />}

      {/* Same card language as the property / project detail (detailBody): a
          surface-2 page, surface-1 cards with a 12px radius and an 8px gutter,
          answers in the two-column grid. The three screens are one design. */}
      <div className="flex grow flex-col bg-surface-2 pb-3">
        {/* ---- Headline card ------------------------------------------- */}
        <DetailCard>
          <div className="px-3.5 pb-3.5 pt-3.5 sm:px-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {/* Budget — blurred ONLY because it genuinely isn't in the payload */}
                {locked ? (
                  <div className="relative w-fit">
                    <div className="select-none text-24 font-bold leading-[1.05] text-ink-primary blur-[6px]" aria-hidden="true">
                      ₹00 L – ₹00 L
                    </div>
                    <span className="absolute inset-0 grid place-items-center">
                      <Icon name="lock" size={20} className="text-ink-tertiary" />
                    </span>
                  </div>
                ) : (
                  <div className="text-24 font-bold leading-[1.05] text-ink-primary sm:text-[28px]">{r.budgetLabel}</div>
                )}
                <div className="mt-2 text-13 leading-none text-ink-tertiary">Budget</div>
              </div>
              <span className="mt-1.5 shrink-0 rounded-4 bg-accent-soft px-2 py-1 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-accent">
                {r.kindLabel}
              </span>
            </div>

            <h1 className="mt-3 text-17 font-semibold leading-[1.35] text-ink-primary sm:text-20">
              {[r.bhk ? `${r.bhk} BHK` : null, r.typeLabel ?? r.typeCode].filter(Boolean).join(" ")}
            </h1>

            {r.areaLabel && (
              <div className="mt-2 flex items-start gap-2 text-13 leading-[1.4] text-ink-secondary sm:text-15">
                <Icon name="pin" size={16} className="mt-0.5 shrink-0 text-accent" />
                <span className="min-w-0">{r.areaLabel}</span>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {r.isUrgent && (
                <span className="flex items-center gap-1 rounded-4 bg-warning-soft px-2 py-1 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-warning">
                  <Icon name="clock" size={12} /> Urgent
                </span>
              )}
              {isOwn && r.status === "live" && r.daysLeft !== null && (
                <span className="rounded-4 bg-accent-soft px-2 py-1 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-accent">
                  Active · {r.daysLeft} days left
                </span>
              )}
              {/* Every other status — pending_review, changes_requested,
                  rejected, paused — used to render NOTHING, so a requirement
                  still in the moderation queue looked live. Server-computed. */}
              {!["live", "expired", "fulfilled"].includes(r.status) && (
                <StatusBadge kind={r.badge.kind as never} label={r.badge.label} />
              )}
            </div>
          </div>
        </DetailCard>

        {/* expired / fulfilled read as a full strip in the design, not a chip */}
        {r.status === "expired" && (
          <div className="mx-2 mt-2 flex items-center gap-2 rounded-12 bg-surface-3 px-3.5 py-2.5 sm:mx-3">
            <Icon name="clock" size={16} className="shrink-0 text-ink-secondary" />
            <span className="text-13 leading-[1.4] text-ink-secondary">This requirement has expired.</span>
          </div>
        )}
        {r.status === "fulfilled" && (
          <div className="mx-2 mt-2 flex items-center gap-2 rounded-12 bg-accent-soft px-3.5 py-2.5 sm:mx-3">
            <Icon name="check" size={16} className="shrink-0 text-accent" />
            <span className="text-13 leading-[1.4] text-ink-primary">Fulfilled — proposals are closed.</span>
          </div>
        )}

        {locked ? (
          <>
            {/* Poster card, blurred shapes only — there is no poster in the
                payload to reveal. */}
            <DetailCard>
              <div className="flex items-center gap-3 px-3.5 py-3.5 sm:px-4">
                <span className="h-11 w-11 shrink-0 rounded-8 bg-surface-3 blur-[6px]" aria-hidden="true" />
                <span className="h-4 w-32 rounded-4 bg-surface-3 blur-[6px]" aria-hidden="true" />
                <span className="flex-1" />
                <Icon name="lock" size={16} className="text-ink-tertiary" />
              </div>
            </DetailCard>

            {/* Paywall card */}
            <DetailCard>
              <div className="flex flex-col items-center gap-3 bg-accent-soft p-4 text-center">
                <Icon name="lock" size={32} className="text-accent" />
                <h3 className="text-17 font-semibold text-ink-primary">Unlock all requirements</h3>
                <p className="text-13 text-ink-secondary">See full details, budgets and contact posters directly</p>
                {/* Price + period come from `plan_catalog`, for the plan THIS
                    viewer's role can actually buy. */}
                <div className="flex items-baseline gap-1">
                  <span className="text-24 font-bold text-ink-primary">{unlockPlan?.price ?? ""}</span>
                  <span className="text-13 text-ink-tertiary">{unlockPlan?.subLabel ?? ""}</span>
                </div>
                <Checklist items={["View all requirements", "30 proposals included", "Instant match alerts"]} />
                <Button
                  fullWidth
                  className="mt-1"
                  disabled={!unlockPlan}
                  onClick={() => unlockPlan && goOrLogin(`/checkout?plan=${unlockPlan.code}`)}
                >
                  Continue to Payment
                </Button>
                <button onClick={() => goOrLogin("/plans")} className="text-13 font-semibold text-accent">
                  Compare plans
                </button>
              </div>
            </DetailCard>
          </>
        ) : (
          <>
            <DetailSection icon="list" tone="accent" title="Requirement details">
              <DetailAnswerGrid
                rows={[
                  { key: "cfg", label: "Configuration", value: r.bhk ? `${r.bhk} BHK` : "—" },
                  { key: "type", label: "Property type", value: r.typeLabel ?? r.typeCode },
                  { key: "areas", label: "Preferred areas", value: r.areaLabel ?? "—" },
                  { key: "urgency", label: "Urgency", value: r.urgencyLabel },
                  { key: "posted", label: "Posted", value: r.postedOn ?? "—" },
                  { key: "ref", label: "Requirement ID", value: r.referenceId ?? "—" },
                ]}
              />
            </DetailSection>

            {r.notes && (
              <DetailSection icon="file" tone="info" title="Notes">
                <p className="selectable whitespace-pre-wrap px-3.5 py-3 text-14 leading-[1.6] text-ink-secondary sm:px-4 sm:text-15">
                  {r.notes}
                </p>
              </DetailSection>
            )}
          </>
        )}

        {/* ---- Own-requirement controls (P4 S4c) ---- */}
        {isOwn && (
          <>
            <DetailCard>
              {/* The toggle only means anything once the requirement is live —
                  `setRequirementActive` refuses any other status. Before
                  approval it said "Receiving proposals" over a row in review. */}
              <div className="flex items-center gap-3 px-3.5 py-3.5 sm:px-4">
                <div className="flex-1">
                  <div className="text-15 font-semibold text-ink-primary">Requirement active</div>
                  <div className="mt-1 text-11 leading-[1.35] text-ink-tertiary">
                    {r.status !== "live" && r.status !== "paused"
                      ? "Starts receiving proposals once it's approved"
                      : r.isActive ? "Receiving proposals" : "Not receiving proposals"}
                  </div>
                </div>
                <Toggle
                  checked={Boolean(r.isActive) && (r.status === "live" || r.status === "paused")}
                  disabled={r.status !== "live" && r.status !== "paused"}
                  label="Requirement active"
                  onChange={(on) => (on ? void setActive(true) : setOffDlg(true))}
                />
              </div>

              <button
                onClick={() => router.push(`/requirements/${r.id}/proposals`)}
                className="flex h-14 w-full items-center gap-3 border-t border-divider px-3.5 text-left sm:px-4"
              >
                <span className="flex-1 text-15 font-semibold text-ink-primary">
                  {r.proposalCount ?? 0} proposal{(r.proposalCount ?? 0) === 1 ? "" : "s"} received
                </span>
                <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
              </button>
            </DetailCard>

            <p className="mx-3.5 mt-2 text-11 leading-[1.4] text-ink-tertiary sm:mx-4">{r.quotaNote}</p>
          </>
        )}
      </div>

      {/* Sticky bars */}
      {isOwn ? (
        <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-surface-1 p-4">
          <Button variant="outline" className="flex-1" onClick={() => router.push(`/requirements/new?edit=${r.id}`)}>Edit</Button>
          {/* `fulfillRequirement` only accepts live/paused, so offering this on
              a requirement still in review was a button that could only fail. */}
          {(r.status === "live" || r.status === "paused") && (
            <Button variant="outline" className="flex-1" onClick={() => setFulfilDlg(true)}>Mark Fulfilled</Button>
          )}
          <button onClick={() => setDelDlg(true)} className="px-2 text-13 font-semibold text-error">Delete</button>
        </div>
      ) : !locked ? (
        <div className="sticky bottom-0 border-t border-border bg-surface-1 p-4">
          <Button fullWidth onClick={() => setProposalSheet(true)}>
            Send Proposal
          </Button>
        </div>
      ) : null}

      {!isOwn && !locked && (
        <ProposalSheet
          open={proposalSheet}
          requirementId={r.id}
          onClose={() => setProposalSheet(false)}
          onSent={() => setProposalSheet(false)}
        />
      )}

      <ConfirmDialog
        open={offDlg}
        onClose={() => setOffDlg(false)}
        onConfirm={() => void setActive(false)}
        title="Turn off this requirement?"
        body="It will stop receiving proposals. This requirement will still count against your plan quota."
        confirmLabel="Turn Off"
      />
      <ConfirmDialog
        open={fulfilDlg}
        onClose={() => setFulfilDlg(false)}
        onConfirm={() => void markFulfilled()}
        title="Mark this requirement as fulfilled?"
        body="It will stop receiving proposals and show a Fulfilled badge."
        confirmLabel="Mark Fulfilled"
      />
      <ConfirmDialog
        open={delDlg}
        onClose={() => setDelDlg(false)}
        onConfirm={() => void remove()}
        title="Delete this requirement?"
        body="This cannot be undone. The requirement will still count against your plan quota."
        confirmLabel="Delete"
        destructive
      />
    </Shell>
  );
}

function Shell({ children, isGuest = false }: { children: React.ReactNode; isGuest?: boolean }) {
  return (
    <AppShell showNav={false}>
      {/* Same host rule as the not-found CTA: `/requirements` is seller-only. */}
      <Header left={<BackButton fallback={isGuest ? "/" : "/requirements"} />} title="Requirement" />
      {children}
    </AppShell>
  );
}


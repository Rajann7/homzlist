"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Button, Header, Icon, Skeleton, StatusBadge, Toggle, useToast } from "@/components/billing/ui";
import { BackButton, Checklist, OfflineBanner } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { requirementsApi, type RequirementDetail as Detail } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * P4 S4 — requirement detail, three variants the SERVER picks:
 *   locked   → paywall; the budget/notes never arrive, so the blur is honest
 *   unlocked → full data (Send Proposal itself lands in Module 5)
 *   own      → the poster's controls: active toggle, fulfil, delete
 */
export function RequirementDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();

  const [r, setR] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [offDlg, setOffDlg] = useState(false);
  const [fulfilDlg, setFulfilDlg] = useState(false);
  const [delDlg, setDelDlg] = useState(false);

  const load = useCallback(async () => {
    const res = await requirementsApi.get(id);
    if (res.ok) setR(res.data.requirement);
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
      <Shell>
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
      <Shell>
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <h2 className="text-20 font-bold text-ink-primary">Requirement not found</h2>
          <p className="text-15 text-ink-secondary">It may have been fulfilled, expired or removed.</p>
          <Button className="mt-2" onClick={() => router.push("/requirements")}>Go to My Requirements</Button>
        </div>
      </Shell>
    );
  }

  const isOwn = r.access === "own";
  const locked = r.access === "locked";

  return (
    <Shell>
      {offline && <OfflineBanner />}

      <div className="flex flex-col gap-5 p-4 pb-32">
        {/* Chips row — designs/P4 S4: 4px tags, 11px uppercase, not pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-4 bg-accent-soft px-2 py-1.5 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-accent">
            {r.kindLabel}
          </span>
          {r.isUrgent && (
            <span className="flex items-center gap-1 rounded-4 bg-warning-soft px-2 py-1.5 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-warning">
              <Icon name="clock" size={12} /> Urgent
            </span>
          )}
          {isOwn && r.status === "live" && r.daysLeft !== null && (
            <span className="rounded-4 bg-accent-soft px-2 py-1.5 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-accent">
              Active · {r.daysLeft} days left
            </span>
          )}
          {/* Every other status — pending_review, changes_requested, rejected,
              paused — used to render NOTHING, so a requirement still in the
              moderation queue looked live. The badge is server-computed. */}
          {!["live", "expired", "fulfilled"].includes(r.status) && (
            <StatusBadge kind={r.badge.kind as never} label={r.badge.label} />
          )}
        </div>

        {/* expired / fulfilled read as a full strip in the design, not a chip */}
        {r.status === "expired" && (
          <div className="flex items-center gap-2 rounded-8 bg-surface-3 px-3.5 py-2.5">
            <Icon name="clock" size={16} className="shrink-0 text-ink-secondary" />
            <span className="text-13 leading-[1.4] text-ink-secondary">
              This requirement has expired.
            </span>
          </div>
        )}
        {r.status === "fulfilled" && (
          <div className="flex items-center gap-2 rounded-8 bg-accent-soft px-3.5 py-2.5">
            <Icon name="check" size={16} className="shrink-0 text-accent" />
            <span className="text-13 leading-[1.4] text-ink-primary">
              Fulfilled — proposals are closed.
            </span>
          </div>
        )}

        {/* Budget — blurred ONLY because it genuinely isn't in the payload */}
        {locked ? (
          <div className="relative">
            <div className="select-none text-24 font-bold text-ink-primary blur-[6px]" aria-hidden="true">₹00 L – ₹00 L</div>
            <span className="absolute inset-0 grid place-items-center">
              <Icon name="lock" size={20} className="text-ink-tertiary" />
            </span>
          </div>
        ) : (
          <div className="text-24 font-bold text-ink-primary">{r.budgetLabel}</div>
        )}

        <div className="text-15 text-ink-primary">
          {[r.bhk ? `${r.bhk} BHK` : null, r.kind === "rent" ? "Rent" : "Buy", r.areaLabel].filter(Boolean).join(" · ")}
        </div>

        {locked ? (
          <>
            {/* Poster row, blurred shapes only */}
            <div className="relative flex items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-surface-3 blur-[6px]" aria-hidden="true" />
              <span className="h-4 w-32 rounded-4 bg-surface-3 blur-[6px]" aria-hidden="true" />
              <Icon name="lock" size={16} className="text-ink-tertiary" />
            </div>

            {/* Paywall card */}
            <div className="flex flex-col items-center gap-3 rounded-12 bg-accent-soft p-4 text-center">
              <Icon name="lock" size={32} className="text-accent" />
              <h3 className="text-17 font-semibold text-ink-primary">Unlock all requirements</h3>
              <p className="text-13 text-ink-secondary">See full details, budgets and contact posters directly</p>
              <div className="flex items-baseline gap-1">
                <span className="text-24 font-bold text-ink-primary">₹2,999</span>
                <span className="text-13 text-ink-tertiary">/month</span>
              </div>
              <Checklist items={["View all requirements", "30 proposals included", "Instant match alerts"]} />
              <Button fullWidth className="mt-1" onClick={() => router.push("/checkout?plan=p2999")}>
                Continue to Payment
              </Button>
              <button onClick={() => router.push("/plans")} className="text-13 font-semibold text-accent">
                Compare plans
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col rounded-12 border border-border bg-surface-1">
              <Row label="Configuration" value={r.bhk ? `${r.bhk} BHK` : "—"} />
              <Row label="Preferred areas" value={r.areaLabel ?? "—"} />
              <Row label="Urgency" value={r.urgencyLabel} />
              <Row label="Posted" value={r.postedOn ?? "—"} />
              <Row label="Requirement ID" value={r.referenceId ?? "—"} last />
            </div>

            {r.notes && (
              <div>
                <div className="mb-1.5 text-13 font-semibold text-ink-secondary">Notes</div>
                <p className="whitespace-pre-wrap text-15 leading-[1.45] text-ink-primary selectable">{r.notes}</p>
              </div>
            )}
          </>
        )}

        {/* ---- Own-requirement controls (P4 S4c) ---- */}
        {isOwn && (
          <>
            {/* The toggle only means anything once the requirement is live —
                `setRequirementActive` refuses any other status. Before approval
                it said "Receiving proposals" over a row still in review. */}
            <div className="flex items-center gap-3 rounded-8 bg-surface-2 p-4">
              <div className="flex-1">
                <div className="text-15 font-semibold text-ink-primary">Requirement active</div>
                <div className="mt-0.5 text-11 text-ink-tertiary">
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
              onClick={() => toast.show("Proposals arrive with the proposals module")}
              className="flex h-14 items-center gap-3 rounded-8 border border-border bg-surface-1 px-4 text-left"
            >
              <span className="flex-1 text-15 font-semibold text-ink-primary">
                {r.proposalCount ?? 0} proposal{(r.proposalCount ?? 0) === 1 ? "" : "s"} received
              </span>
              <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
            </button>

            <p className="text-11 text-ink-tertiary">{r.quotaNote}</p>
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
          <Button fullWidth onClick={() => toast.show("Sending proposals arrives with the proposals module")}>
            Send Proposal
          </Button>
        </div>
      ) : null}

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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell showNav={false}>
      <Header left={<BackButton fallback="/requirements" />} title="Requirement" />
      {children}
    </AppShell>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 px-3 py-2.5", !last && "border-b border-divider")}>
      <span className="w-32 shrink-0 text-13 text-ink-secondary">{label}</span>
      <span className="min-w-0 flex-1 text-13 text-ink-primary">{value}</span>
    </div>
  );
}

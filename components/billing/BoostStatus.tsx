"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Button, ConfirmDialog, EmptyState, Header, Icon, Skeleton, StatusBadge, useToast } from "./ui";
import { billingApi, type BoostView } from "@/lib/billing/client";
import { BackButton, Banner, OfflineBanner, Tabs } from "./primitives";

/**
 * P11 S5 — Boost status (Active / Pending / Past).
 *
 * Deliberately analytics-free: Doc2 §13 gives the user "active till [date]" and
 * status, nothing more. The payload from `/billing/boost/status` doesn't carry
 * views or clicks at all, so there is nothing here to accidentally reveal.
 */
export function BoostStatus() {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<Awaited<ReturnType<typeof billingApi.boostStatus>> | null>(null);
  const [tab, setTab] = useState<"active" | "pending" | "past">("active");
  const [offline, setOffline] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [renewId, setRenewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await billingApi.boostStatus();
    setData(res);
    setOffline(!res.ok && res.error.code === "OFFLINE");
    if (res.ok) {
      // Land on the tab that actually has something in it.
      setTab((t) =>
        res.data.counts[t] ? t : res.data.counts.active ? "active" : res.data.counts.pending ? "pending" : "past",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const doCancel = async () => {
    if (!cancelId) return;
    setBusy(true);
    const res = await billingApi.cancelBoost(cancelId);
    setBusy(false);
    setCancelId(null);
    toast.show(res.ok ? "Boost cancelled — refund started" : "Couldn't cancel this boost");
    void load();
  };

  const doRenew = async () => {
    if (!renewId) return;
    setBusy(true);
    // Renew is a 1-tap CTA that leads to a normal server-priced checkout —
    // it never auto-charges (Doc2 §13).
    const res = await billingApi.renewBoost(renewId);
    setBusy(false);
    setRenewId(null);
    if (!res.ok) {
      toast.show(res.error.code === "LISTING_STATE_LOCKED" ? "That listing is no longer live" : "Couldn't start the renewal");
      return;
    }
    const c = res.data.checkout;
    router.push(`/checkout?${new URLSearchParams({ plan: c.planId, listing: c.listingId ?? "", targeting: c.targeting ?? "area", targetLabel: c.targetLabel ?? "", next: "/boost" }).toString()}`);
  };

  if (!data) {
    return (
      <Shell>
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="h-[240px] w-full rounded-12" />
        </div>
      </Shell>
    );
  }

  if (!data.ok && !offline) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-13 text-ink-secondary">Couldn&apos;t load your boosts.</p>
          <Button variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      </Shell>
    );
  }

  const d = data.ok ? data.data : null;
  const empty = d && !d.counts.active && !d.counts.pending && !d.counts.past;

  if (empty) {
    return (
      <Shell>
        <EmptyState
          className="pt-10"
          title="No boosts yet"
          subtitle="Boost a listing to appear at the top of the feed, stories and search"
          illustration={<Icon name="rocket" size={96} className="text-ink-disabled" />}
          cta={{ label: "Boost a Listing", onClick: () => router.push("/boost/new") }}
        />
      </Shell>
    );
  }

  const list = d ? { active: d.active, pending: d.pending, past: d.past }[tab] : [];

  return (
    <Shell>
      {offline && <OfflineBanner />}

      {d?.renewPrompt && (
        <div className="px-4 pt-4">
          <Banner
            tone="accent"
            title="Your boost ends tomorrow"
            action={
              <Button size="small" onClick={() => setRenewId(d.renewPrompt!.boostId)}>
                Renew in 1 tap — {d.renewPrompt.price}
              </Button>
            }
          />
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "active", label: `Active ${d?.counts.active ?? 0}` },
          { key: "pending", label: `Pending ${d?.counts.pending ?? 0}` },
          { key: "past", label: `Past ${d?.counts.past ?? 0}` },
        ]}
      />

      <div className="flex flex-col gap-4 p-4">
        {!list.length && (
          <p className="py-8 text-center text-13 text-ink-secondary">
            {tab === "active" ? "No active boosts right now." : tab === "pending" ? "Nothing waiting for approval." : "No past boosts yet."}
          </p>
        )}
        {list.map((b) =>
          tab === "active" ? <ActiveCard key={b.id} b={b} onExtend={() => router.push(`/boost/new?listing=${b.listingId}`)} />
          : tab === "pending" ? <PendingCard key={b.id} b={b} onCancel={() => setCancelId(b.id)} />
          : <PastCard key={b.id} b={b} onAgain={() => router.push(`/boost/new?listing=${b.listingId}`)} />,
        )}
      </div>

      <ConfirmDialog
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={doCancel}
        loading={busy}
        destructive
        title="Cancel this boost?"
        body="You'll be refunded within 5–7 days."
        cancelLabel="Keep"
        confirmLabel="Cancel boost"
      />
      <ConfirmDialog
        open={!!renewId}
        onClose={() => setRenewId(null)}
        onConfirm={doRenew}
        loading={busy}
        title="Renew this boost?"
        body={d?.renewPrompt ? `${d.renewPrompt.durationLabel} · ${d.renewPrompt.targetLabel} · ${d.renewPrompt.price}` : undefined}
        confirmLabel="Pay & Renew"
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell showNav={false} header={<Header left={<BackButton fallback="/" />} title="Boosts" centerTitle />}>
      {children}
    </AppShell>
  );
}

function ListingRow({ b }: { b: BoostView }) {
  return (
    <div className="flex items-center gap-3 pt-3">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-8 bg-surface-3 text-ink-tertiary">
        <Icon name="image" size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-15 font-semibold text-ink-primary">{b.listingTitle}</div>
        <div className="text-11 text-ink-tertiary">{b.listingPrice}</div>
      </div>
    </div>
  );
}

function ActiveCard({ b, onExtend }: { b: BoostView; onExtend: () => void }) {
  const toast = useToast();
  return (
    <div className="rounded-12 border-[1.5px] border-accent bg-surface-1 p-4">
      <StatusBadge kind="promoted" />
      <ListingRow b={b} />
      <div className="my-3.5 h-px bg-divider" />
      <div className="flex items-center gap-2">
        <span className="text-accent"><Icon name="rocket" /></span>
        <div>
          <div className="text-17 font-semibold text-ink-primary">Boost active</div>
          <div className="text-13 text-ink-secondary">
            Ends on {b.endsOn} · {b.daysLeft} day{b.daysLeft === 1 ? "" : "s"} left
          </div>
        </div>
      </div>
      <div className="my-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent transition-[width] duration-[600ms] ease-out-quart" style={{ width: `${b.progressPct}%` }} />
      </div>
      <div className="text-11 leading-[1.7] text-ink-tertiary">
        Duration: {b.durationLabel}<br />
        Targeting: {b.targetLabel}<br />
        Started: {b.startedOn}
      </div>
      <div className="mt-3 rounded-8 bg-surface-2 p-2.5">
        <p className="text-11 leading-[1.45] text-ink-tertiary">Detailed views and clicks aren&apos;t shown for boosts.</p>
      </div>
      <div className="mt-3.5 flex items-center gap-4">
        <Button variant="outline" size="default" className="w-auto px-[18px]" onClick={onExtend}>Extend boost</Button>
        <button onClick={() => toast.show("Listing detail arrives with the listings module")} className="text-13 font-semibold text-accent">
          View listing
        </button>
      </div>
    </div>
  );
}

function PendingCard({ b, onCancel }: { b: BoostView; onCancel: () => void }) {
  return (
    <div className="rounded-12 bg-surface-1 p-4 shadow-l1 dark:border dark:border-border dark:shadow-none">
      <StatusBadge kind="pending-approval" />
      <div className="mt-3 flex items-start gap-2.5">
        <span className="text-info"><Icon name="clock" /></span>
        <div>
          <div className="text-15 font-semibold text-ink-primary">Waiting for admin approval</div>
          <p className="mt-1 text-11 leading-[1.45] text-ink-tertiary">
            Usually approved within a few hours. Your boost starts after approval.
          </p>
        </div>
      </div>
      <div className="mt-2.5 text-11 text-ink-tertiary">Paid {b.price} · {b.paidAgo}</div>
      <button onClick={onCancel} className="tap44 mt-3.5 text-13 font-semibold text-error">Cancel and refund</button>
    </div>
  );
}

function PastCard({ b, onAgain }: { b: BoostView; onAgain: () => void }) {
  return (
    <div className="rounded-12 bg-surface-1 p-4 shadow-l1 dark:border dark:border-border dark:shadow-none">
      <StatusBadge kind={b.badge.kind as "expired" | "rejected" | "stopped"} label={b.badge.label} />

      {b.status === "expired" && (
        <>
          <div className="mb-3 mt-2 text-11 text-ink-tertiary">
            Ran {b.startedOn} – {b.endsOn} · {b.durationLabel} · {b.targetLabel}
          </div>
          <Button size="small" onClick={onAgain}>Boost again</Button>
        </>
      )}

      {b.status === "rejected" && (
        <>
          <div className="mb-1 mt-2 text-13 text-ink-secondary">Reason: {b.rejectReason ?? "Not approved"}</div>
          {b.refundedOn && <div className="text-11 text-accent">{b.price} refunded on {b.refundedOn}</div>}
        </>
      )}

      {/* `stopped` is a LIVE boost ended early (listing sold) — those unused days
          genuinely aren't refunded. `cancelled` is cancelled before approval,
          which IS refunded in full, so it must not show the no-refund line or it
          contradicts the money the server actually returned. */}
      {b.status === "stopped" && (
        <>
          <div className="mb-1 mt-2 text-11 text-ink-tertiary">
            {b.stoppedReason ?? "Boost stopped automatically"}
          </div>
          <p className="text-11 leading-[1.45] text-ink-tertiary">
            No refund for unused days — see Refund Policy.
          </p>
        </>
      )}

      {b.status === "cancelled" && (
        <>
          <div className="mb-1 mt-2 text-11 text-ink-tertiary">
            {b.stoppedReason ?? "Cancelled before approval"}
          </div>
          {b.refundedOn ? (
            <div className="text-11 text-accent">{b.price} refunded on {b.refundedOn}</div>
          ) : (
            <p className="text-11 leading-[1.45] text-ink-tertiary">Refund in 5–7 days.</p>
          )}
        </>
      )}
    </div>
  );
}

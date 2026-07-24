"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checklist } from "@/components/billing/primitives";
import { ProposalSheet } from "@/components/listings/ProposalSheet";
import { browseApi, type BrowseCard } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * Requirement-mode feed (Doc7 §79) — the P2 feed shell showing requirement cards.
 * Reuses Module 5's `browseApi` (server-stripped locked cards) + `ProposalSheet`
 * + the same paywall. No re-modelling — this is the feed skin over browse.
 */
export function RequirementFeed({ kind }: { kind: "all" | "sell" | "rent" }) {
  const router = useRouter();
  type Data = { sections: { tier: string; label: string | null; cards: BrowseCard[] }[]; unlocked: boolean; balance: { left: number; unlimited: boolean } };
  const [data, setData] = useState<Data | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [proposalFor, setProposalFor] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setData(null);
    const res = await browseApi.list(kind === "all" ? null : kind, null);
    if (res.ok) setData(res.data as never);
    else setData({ sections: [], unlocked: false, balance: { left: 0, unlimited: false } });
  }, [kind]);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <div className="flex flex-col gap-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[150px] w-full rounded-12" />)}</div>;

  const total = data.sections.reduce((n, s) => n + s.cards.length, 0);
  if (total === 0) {
    return <EmptyState title="No requirements in your area yet" subtitle="Check back soon or expand your city." />;
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      {data.unlocked && (
        <div className="flex items-center justify-between rounded-8 bg-surface-2 px-3.5 py-2.5">
          <span className="text-13 font-semibold text-accent">{data.balance.unlimited ? "Unlimited proposals" : `${data.balance.left} proposals remaining`}</span>
          <button className="text-13 font-semibold text-accent" onClick={() => router.push("/plans/my")}>Top up</button>
        </div>
      )}
      {data.sections.map((s) => (
        <div key={s.tier} className="flex flex-col gap-3">
          {s.label && (
            <div className="flex items-center gap-1.5"><Icon name="pin" size={14} className="text-ink-tertiary" /><span className="text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{s.label}</span></div>
          )}
          {s.cards.map((c) => (
            <ReqCard key={c.id} c={c} sent={sent.has(c.id) || Boolean(c.alreadySent)} onUnlock={() => setPaywall(true)} onPropose={() => setProposalFor(c.id)} onOpen={() => router.push(`/requirements/${c.id}`)} />
          ))}
        </div>
      ))}

      <BottomSheet open={paywall} onClose={() => setPaywall(false)} title="Unlock requirements">
        <div className="flex flex-col gap-4 pb-2">
          <div className="rounded-12 bg-accent-soft p-4 text-center"><div className="flex items-baseline justify-center gap-1"><span className="text-24 font-bold text-ink-primary">₹2,999</span><span className="text-13 text-ink-tertiary">/month</span></div></div>
          <Checklist items={["Unlock all requirements", "30 proposals included", "Direct contact after acceptance"]} />
          <Button fullWidth onClick={() => router.push("/checkout?plan=p2999")}>Continue to Payment</Button>
          <button className="text-13 font-semibold text-accent" onClick={() => router.push("/plans")}>Compare plans</button>
        </div>
      </BottomSheet>

      {proposalFor && (
        <ProposalSheet open={Boolean(proposalFor)} requirementId={proposalFor} onClose={() => setProposalFor(null)} onSent={() => { setSent((s) => new Set(s).add(proposalFor)); setProposalFor(null); }} />
      )}
    </div>
  );
}

function ReqCard({ c, sent, onUnlock, onPropose, onOpen }: { c: BrowseCard; sent: boolean; onUnlock: () => void; onPropose: () => void; onOpen: () => void }) {
  const locked = c.access === "locked";
  return (
    <div className="relative overflow-hidden rounded-12 border border-border bg-surface-1 p-4 pl-5">
      {!locked && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
      {c.isBoosted && <span className="absolute right-3 top-3 rounded-4 bg-black/60 px-2 py-1 text-11 font-semibold uppercase text-white">Promoted</span>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-4 bg-accent-soft px-2 py-1.5 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-accent">{c.kindLabel}</span>
        {c.isUrgent && <span className="flex items-center gap-1 rounded-4 bg-warning-soft px-2 py-1.5 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-warning"><Icon name="clock" size={12} /> Urgent</span>}
      </div>
      {locked ? (
        <>
          <div className="relative mt-3 w-fit"><div className="select-none text-17 font-bold text-ink-primary blur-[6px]">₹00L – ₹00L</div><span className="absolute inset-0 grid place-items-center"><Icon name="lock" size={16} className="text-ink-tertiary" /></span></div>
          <div className="mt-1 text-13 text-ink-secondary">{c.summary}</div>
          <Button fullWidth className="mt-3" onClick={onUnlock}><Icon name="lock" size={16} className="mr-1.5" /> Unlock — ₹2,999/mo</Button>
        </>
      ) : (
        <>
          <button onClick={onOpen} className="mt-3 block text-left"><div className="text-17 font-bold text-ink-primary">{c.budgetLabel}</div><div className="mt-0.5 text-13 text-ink-secondary">{c.summary}</div></button>
          <div className="mt-2 flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-11 font-semibold text-ink-secondary">{(c.posterName ?? "?").slice(0, 1).toUpperCase()}</span>
            <span className="text-13 font-semibold text-ink-primary">{c.posterName}</span>
            {c.posterVerified && <Icon name="verified" size={14} className="text-accent" />}
            <span className="ml-auto text-11 text-ink-tertiary">{c.postedAgo}</span>
          </div>
          {sent ? <div className="mt-3 flex items-center justify-center gap-1 text-13 font-semibold text-accent"><Icon name="check" size={16} /> Proposal sent</div> : <Button fullWidth className="mt-3" onClick={onPropose}>Send Proposal</Button>}
        </>
      )}
    </div>
  );
}

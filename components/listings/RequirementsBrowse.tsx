"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, Chip, EmptyState, Header, Icon, Skeleton, useToast } from "@/components/billing/ui";
import { Checklist, OfflineBanner } from "@/components/billing/primitives";
import { ProposalSheet } from "./ProposalSheet";
import { browseApi, type BrowseCard, type BrowseSection } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * P8 S3 — Requirements Browse (Doc7 §63).
 *
 * Unpaid viewers see LOCKED cards: the budget and poster are genuinely absent
 * from the payload (server-stripped), so the blur is honest — there's nothing to
 * reveal in DevTools. A ₹2,999 Requirement Access unlocks full cards + cascade
 * sections + the proposal-counter strip.
 */
export function RequirementsBrowse() {
  const router = useRouter();
  const toast = useToast();

  type Data = { sections: BrowseSection[]; unlocked: boolean; cityName: string | null; balance: { left: number; total: number; unlimited: boolean } };
  const [data, setData] = useState<Data | null>(null);
  const [offline, setOffline] = useState(false);
  const [kind, setKind] = useState<"all" | "sell" | "rent">("all");
  const [paywall, setPaywall] = useState(false);
  const [proposalFor, setProposalFor] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setData(null);
    const res = await browseApi.list(kind === "all" ? null : kind, null);
    if (res.ok) { setData(res.data); setOffline(false); }
    else if (res.error.code === "OFFLINE") { setOffline(true); setData({ sections: [], unlocked: false, cityName: null, balance: { left: 0, total: 0, unlimited: false } }); }
    else { setData({ sections: [], unlocked: false, cityName: null, balance: { left: 0, total: 0, unlimited: false } }); }
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  const total = data ? data.sections.reduce((n, s) => n + s.cards.length, 0) : 0;

  return (
    <AppShell showNav>
      <Header
        title={<span className="text-20 font-bold">Requirements</span>}
        right={
          <div className="flex items-center">
            <button aria-label="My requirements" className="grid h-11 w-11 place-items-center" onClick={() => router.push("/requirements/mine")}>
              <Icon name="file" size={22} className="text-ink-primary" />
            </button>
          </div>
        }
      />

      {offline && <OfflineBanner />}

      {/* Mode strip */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip selected={kind === "all"} onClick={() => setKind("all")}>All</Chip>
        <Chip selected={kind === "sell"} onClick={() => setKind("sell")}>Buy</Chip>
        <Chip selected={kind === "rent"} onClick={() => setKind("rent")}>Rent</Chip>
      </div>

      {/* Unlock banner (unpaid, sticky under header) */}
      {data && !data.unlocked && (
        <div className="sticky top-0 z-10 mx-4 mb-1 flex items-center gap-3 rounded-12 bg-accent-soft p-3">
          <Icon name="lock" size={20} className="shrink-0 text-accent" />
          <div className="flex-1">
            <div className="text-15 font-semibold text-ink-primary">Unlock all requirements</div>
            <div className="text-11 text-ink-secondary">See full details and contact posters — ₹2,999/month</div>
          </div>
          <Button className="h-9 px-4 text-13" onClick={() => setPaywall(true)}>Unlock</Button>
        </div>
      )}

      {/* Proposal-counter strip (paid) */}
      {data?.unlocked && (
        <div className="mx-4 mb-1 flex items-center justify-between rounded-8 bg-surface-2 px-3.5 py-2.5">
          <span className="text-13 font-semibold text-accent">
            {data.balance.unlimited ? "Unlimited proposals" : `${data.balance.left} proposals remaining`}
          </span>
          <button className="text-13 font-semibold text-accent" onClick={() => router.push("/plans/my")}>Top up</button>
        </div>
      )}

      {!data ? (
        <div className="flex flex-col gap-3 p-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[168px] w-full rounded-12" />)}
        </div>
      ) : total === 0 ? (
        <EmptyState
          title="No requirements in your area yet"
          subtitle="Check back soon or expand your city — new requirements appear here as people post them."
          illustration={<MegaphoneArt />}
        />
      ) : (
        <div className="flex flex-col gap-4 p-4 pb-6">
          {data.sections.map((section) => (
            <div key={section.tier} className="flex flex-col gap-3">
              {section.label && (
                <div className="flex items-center gap-1.5 pt-1">
                  <Icon name="pin" size={14} className="text-ink-tertiary" />
                  <span className="text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{section.label}</span>
                </div>
              )}
              {section.cards.map((card) =>
                card.access === "locked" ? (
                  <LockedCard key={card.id} card={card} onUnlock={() => setPaywall(true)} />
                ) : (
                  <UnlockedCard
                    key={card.id}
                    card={card}
                    sent={sentIds.has(card.id) || Boolean(card.alreadySent)}
                    onOpen={() => router.push(`/requirements/${card.id}`)}
                    onPropose={() => setProposalFor(card.id)}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      )}

      {/* Paywall sheet */}
      <BottomSheet open={paywall} onClose={() => setPaywall(false)} title="Unlock requirements">
        <div className="flex flex-col gap-4 pb-2">
          <div className="rounded-12 bg-accent-soft p-4 text-center">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-24 font-bold text-ink-primary">₹2,999</span>
              <span className="text-13 text-ink-tertiary">/month</span>
            </div>
          </div>
          <Checklist items={["Unlock every requirement", "30 proposals included", "Instant match alerts for your areas", "Direct chat after acceptance"]} />
          <Button fullWidth onClick={() => router.push("/checkout?plan=p2999")}>Continue to Payment</Button>
          <button className="text-13 font-semibold text-accent" onClick={() => router.push("/plans")}>Compare plans</button>
          <p className="text-11 text-ink-tertiary">Auto-renewal is off. You'll be reminded before expiry.</p>
        </div>
      </BottomSheet>

      {proposalFor && (
        <ProposalSheet
          open={Boolean(proposalFor)}
          requirementId={proposalFor}
          onClose={() => setProposalFor(null)}
          onSent={() => { setSentIds((s) => new Set(s).add(proposalFor)); setProposalFor(null); void load(); }}
        />
      )}
    </AppShell>
  );
}

function LockedCard({ card, onUnlock }: { card: BrowseCard; onUnlock: () => void }) {
  return (
    <div className="relative flex flex-col gap-3 rounded-12 border border-border bg-surface-1 p-4">
      {card.isBoosted && (
        <span className="absolute right-3 top-3 rounded-4 bg-black/60 px-2 py-1 text-11 font-semibold uppercase tracking-[0.3px] text-white">Promoted</span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-4 bg-accent-soft px-2 py-1.5 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-accent">{card.kindLabel}</span>
        {card.isUrgent && (
          <span className="flex items-center gap-1 rounded-4 bg-warning-soft px-2 py-1.5 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-warning">
            <Icon name="clock" size={12} /> Urgent
          </span>
        )}
      </div>

      {/* Budget: blurred because it genuinely isn't in the payload */}
      <div className="relative w-fit">
        <div className="select-none text-20 font-bold text-ink-primary blur-[6px]" aria-hidden>₹00 L – ₹00 L</div>
        <span className="absolute inset-0 grid place-items-center"><Icon name="lock" size={18} className="text-ink-tertiary" /></span>
      </div>

      <div className="text-15 text-ink-primary">{card.summary}</div>

      {/* Poster row, blurred shapes */}
      <div className="relative flex items-center gap-2">
        <span className="h-6 w-6 rounded-full bg-surface-3 blur-[6px]" aria-hidden />
        <span className="h-3.5 w-28 rounded-4 bg-surface-3 blur-[6px]" aria-hidden />
        <Icon name="lock" size={14} className="text-ink-tertiary" />
      </div>

      <div className="text-11 text-ink-tertiary">Posted {card.postedAgo}</div>
      <Button fullWidth onClick={onUnlock}>
        <Icon name="lock" size={16} className="mr-1.5" /> Unlock — ₹2,999/mo
      </Button>
    </div>
  );
}

function UnlockedCard({
  card, sent, onOpen, onPropose,
}: { card: BrowseCard; sent: boolean; onOpen: () => void; onPropose: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-12 border border-border bg-surface-1 p-4 pl-5">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden />
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-4 bg-accent-soft px-2 py-1.5 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-accent">{card.kindLabel}</span>
        {card.isUrgent && (
          <span className="flex items-center gap-1 rounded-4 bg-warning-soft px-2 py-1.5 text-11 font-semibold uppercase leading-none tracking-[0.3px] text-warning">
            <Icon name="clock" size={12} /> Urgent
          </span>
        )}
      </div>

      <button onClick={onOpen} className="mt-3 block text-left">
        <div className="text-20 font-bold text-ink-primary">{card.budgetLabel}</div>
        <div className="mt-0.5 text-13 text-ink-secondary">{card.summary}</div>
      </button>

      {/* Poster row */}
      <div className="mt-3 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-11 font-semibold text-ink-secondary">
          {(card.posterName ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="text-13 font-semibold text-ink-primary">{card.posterName ?? "Poster"}</span>
        {card.posterVerified && <Icon name="verified" size={14} className="text-accent" />}
        {card.posterRole && <span className="rounded-4 bg-surface-2 px-1.5 py-0.5 text-11 text-ink-secondary capitalize">{card.posterRole}</span>}
        <span className="ml-auto text-11 text-ink-tertiary">{card.postedAgo}</span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-divider pt-3">
        <span className="text-11 text-ink-tertiary">{card.proposalCount ?? 0} proposal{(card.proposalCount ?? 0) === 1 ? "" : "s"} sent so far</span>
        {sent ? (
          <span className="flex items-center gap-1 text-13 font-semibold text-accent"><Icon name="check" size={16} /> Proposal sent</span>
        ) : (
          <Button className="h-9 px-4 text-13" onClick={onPropose}>Send Proposal</Button>
        )}
      </div>
    </div>
  );
}

function MegaphoneArt() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
      <path d="M24 40v16l8 2v10a4 4 0 004 4h2a4 4 0 004-4v-8l26 8V30L42 38H30a6 6 0 00-6 6z" stroke="var(--ink-tertiary)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="78" cy="44" r="3" fill="var(--accent)" />
    </svg>
  );
}

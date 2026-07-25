"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Button, Chip, EmptyState, Header, Icon, Skeleton, StatusBadge, useToast } from "@/components/billing/ui";
import { BackButton, OfflineBanner } from "@/components/billing/primitives";
import { TopupSheet } from "@/components/billing/TopupSheet";
import { proposalsApi, type SentProposal } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * P8 S6 — My Proposals Sent (Doc7 §72).
 *
 * Each row's footer copy is server-decided, including the non-refund note on
 * declined/expired proposals — the count genuinely isn't returned (Doc2 §8.1),
 * and the UI says so rather than implying otherwise.
 */
export function MyProposalsSent() {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<{ items: SentProposal[]; balance: { left: number; total: number; unlimited: boolean }; filters: { key: string; label: string; count: number }[] } | null>(null);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState("all");
  const [topup, setTopup] = useState(false);

  const load = useCallback(async () => {
    const res = await proposalsApi.mine();
    if (res.ok) { setData(res.data); setOffline(false); }
    else if (res.error.code === "OFFLINE") { setOffline(true); setData({ items: [], balance: { left: 0, total: 0, unlimited: false }, filters: [] }); }
    else setData({ items: [], balance: { left: 0, total: 0, unlimited: false }, filters: [] });
  }, []);

  useEffect(() => { void load(); }, [load]);

  const items = data?.items ?? [];
  const shown = filter === "all" ? items : items.filter((p) => p.status === filter);
  const balance = data?.balance;
  const pct = balance && balance.total > 0 ? Math.round((balance.left / balance.total) * 100) : 0;

  return (
    <AppShell showNav={false}>
      <Header left={<BackButton fallback="/requirements" />} title="My proposals" />
      {offline && <OfflineBanner />}

      {!data ? (
        <div className="flex flex-col gap-4 p-4"><Skeleton className="h-14 w-full rounded-8" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[120px] w-full rounded-12" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No proposals sent"
          subtitle="Browse requirements and offer your matching properties."
          illustration={<HandshakeArt />}
          cta={{ label: "Browse Requirements", onClick: () => router.push("/requirements") }}
        />
      ) : (
        <div className="flex flex-col gap-4 p-4 pb-8">
          {/* Counter strip + progress */}
          {balance && !balance.unlimited && (
            <div className="flex flex-col gap-2 rounded-8 bg-surface-2 px-3.5 py-3">
              <div className="flex items-center justify-between">
                <span className="text-13 font-semibold text-accent">{balance.left} of {balance.total} proposals remaining</span>
                <button className="text-13 font-semibold text-accent" onClick={() => setTopup(true)}>Top up</button>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
            </div>
          )}

          {/* Status filter chips */}
          <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {data.filters.map((f) => (
              <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)}>{f.label} {f.count}</Chip>
            ))}
          </div>

          {shown.map((p) => <SentRow key={p.id} p={p} onOpenReq={() => router.push(`/requirements/${p.requirementId}`)} onOpenChat={() => (p.threadId ? router.push(`/messages/${p.threadId}`) : toast.show("Chat opens once your proposal is accepted"))} />)}
        </div>
      )}

      <TopupSheet open={topup} onClose={() => setTopup(false)} onDone={() => { setTopup(false); void load(); }} />
    </AppShell>
  );
}

function SentRow({ p, onOpenReq, onOpenChat }: { p: SentProposal; onOpenReq: () => void; onOpenChat: () => void }) {
  const badge =
    p.status === "accepted" ? { kind: "active", label: "Accepted" }
    : p.status === "declined" ? { kind: "rejected", label: "Declined" }
    : p.status === "expired" ? { kind: "expired", label: "Expired" }
    : p.status === "fulfilled" ? { kind: "fulfilled", label: "Fulfilled" }
    : p.status === "not_relevant" ? { kind: "expired", label: "Not relevant" }
    : { kind: "pending", label: "Pending" };

  return (
    <div className="flex flex-col gap-2 rounded-12 border border-border bg-surface-1 p-3">
      <div className="flex items-start gap-2">
        <span className="flex-1 text-15 font-semibold text-ink-primary">{p.requirementRef || "Requirement"}</span>
        <StatusBadge kind={badge.kind as never} label={badge.label} />
      </div>
      <div className="flex items-center gap-1.5 text-11 text-ink-tertiary">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-secondary">{p.poster.name.slice(0, 1).toUpperCase()}</span>
        <span>{p.poster.name}{p.poster.role ? ` · ${p.poster.role}` : ""}</span>
      </div>

      {/* Attached listing / chat-only */}
      {p.listing ? (
        <div className="flex items-center gap-2 rounded-8 bg-surface-2 p-2">
          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-8 bg-surface-3">{p.listing.coverUrl && <img src={p.listing.coverUrl} alt="" className="h-full w-full object-cover" />}</span>
          <span className="truncate text-11 text-ink-secondary">{[p.listing.title, p.listing.priceLabel].filter(Boolean).join(" — ")}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-8 bg-surface-2 p-2 text-11 text-ink-tertiary"><Icon name="message" size={16} /> Chat request — no listing attached</div>
      )}

      <div className="text-11 text-ink-tertiary">Sent {p.sentAt}</div>

      {/* Status-specific footer */}
      <div className="flex items-center gap-2 border-t border-divider pt-2">
        {p.status === "accepted" ? (
          <>
            <Icon name="check" size={16} className="text-accent" />
            <span className="flex-1 text-11 text-accent">{p.footnote}</span>
            <Button variant="outline" className="h-8 px-3 text-13" onClick={onOpenChat}>Open chat</Button>
          </>
        ) : p.status === "pending" ? (
          <>
            <Icon name="clock" size={16} className="text-ink-tertiary" />
            <span className="flex-1 text-11 text-ink-tertiary">{p.footnote}</span>
            <button className="text-13 font-semibold text-accent" onClick={onOpenReq}>View requirement</button>
          </>
        ) : (
          <span className={cn("text-11", p.nonRefund ? "text-ink-secondary" : "text-ink-tertiary")}>{p.footnote}</span>
        )}
      </div>
    </div>
  );
}

function HandshakeArt() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
      <path d="M18 44l12-6 10 8 8-2 8 6 14-4" stroke="var(--ink-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 46l8 8 6-4" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

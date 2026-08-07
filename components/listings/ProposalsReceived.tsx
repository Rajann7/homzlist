"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Button, Chip, EmptyState, Header, Icon, Skeleton, StatusBadge, useToast } from "@/components/billing/ui";
import { BackButton, OfflineBanner } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { proposalsApi, type ReceivedProposal } from "@/lib/listings/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * P8 S5 — Proposals Received (Doc7 §71).
 *
 * The number rule (Doc2 §8.2): the poster sees each sender's number
 * automatically — it arrives in the payload for the poster's side only. Accept
 * opens a chat (Module 6); here it records the acceptance + reveals the path.
 */
export function ProposalsReceived({ requirementId }: { requirementId: string }) {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<{ items: ReceivedProposal[]; requirementRef: string; filters: { key: string; label: string; count: number }[] } | null>(null);
  const [offline, setOffline] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState("all");
  const [dialog, setDialog] = useState<{ kind: "decline" | "not_relevant"; id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    const res = await proposalsApi.received(requirementId);
    if (res.ok) { setData(res.data); setOffline(false); }
    else if (res.error.code === "OFFLINE") { setOffline(true); setData({ items: [], requirementRef: "", filters: [] }); }
    else setNotFound(true);
  }, [requirementId]);

  useEffect(() => { void load(); }, [load]);

  const accept = async (p: ReceivedProposal) => {
    const res = await proposalsApi.accept(p.id);
    if (res.ok) {
      // "Accept & Chat" — open the thread the acceptance grew (Doc2 §8.1).
      if (res.data.threadId) { router.push(`/messages/${res.data.threadId}`); return; }
      toast.show(`Chat started with ${p.sender.name}`);
      void load();
    } else {
      toast.show("Couldn't accept that");
    }
  };
  const runDialog = async () => {
    if (!dialog) return;
    const res = dialog.kind === "decline" ? await proposalsApi.decline(dialog.id) : await proposalsApi.notRelevant(dialog.id);
    setDialog(null);
    toast.show(res.ok ? (dialog.kind === "decline" ? "Proposal declined" : "Marked not relevant") : "Couldn't update that");
    void load();
  };

  if (notFound) {
    return (
      <AppShell showNav={false}>
        <Header left={<BackButton fallback="/requirements/mine" />} title="Proposals" />
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <h2 className="text-20 font-bold text-ink-primary">Requirement not found</h2>
          <p className="text-15 text-ink-secondary">It may have been removed, or it isn&apos;t yours.</p>
          <Button className="mt-2" onClick={() => router.push("/requirements/mine")}>Go to My Requirements</Button>
        </div>
      </AppShell>
    );
  }

  const items = data?.items ?? [];
  const shown = filter === "all" ? items
    : filter === "new" ? items.filter((p) => p.isNew)
    : items.filter((p) => p.status === filter);

  return (
    <AppShell showNav={false}>
      <Header
        left={<BackButton fallback="/requirements/mine" />}
        title={
          <div className="flex flex-col items-center">
            <span className="text-17 font-semibold text-ink-primary">Proposals</span>
            {data?.requirementRef && <span className="text-11 text-ink-tertiary">{data.requirementRef}</span>}
          </div>
        }
        centerTitle
      />
      {offline && <OfflineBanner />}

      {data && (
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {data.filters.map((f) => (
            <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)}>{f.label} {f.count}</Chip>
          ))}
        </div>
      )}

      {!data ? (
        <div className="flex flex-col gap-4 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-[260px] w-full rounded-12" />)}</div>
      ) : shown.length === 0 ? (
        <EmptyState
          title="No proposals yet"
          subtitle="Brokers and owners will respond soon — boost your requirement to get more."
          illustration={<InboxArt />}
          cta={{ label: "Boost Requirement", onClick: () => router.push(`/boost/new?requirement=${requirementId}`) }}
        />
      ) : (
        <div className="flex flex-col gap-3 p-4 pb-8">
          {shown.map((p) => (
            <ProposalCard key={p.id} p={p} toast={toast} onAccept={() => void accept(p)} onDecline={() => setDialog({ kind: "decline", id: p.id, name: p.sender.name })} onNotRelevant={() => setDialog({ kind: "not_relevant", id: p.id, name: p.sender.name })} onOpenListing={(id) => router.push(`/property/${id}`)} onOpenChat={(tid) => router.push(`/messages/${tid}`)} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={dialog?.kind === "decline"}
        onClose={() => setDialog(null)}
        onConfirm={() => void runDialog()}
        title="Decline this proposal?"
        body="They'll be notified. You can still see this in your declined list."
        confirmLabel="Decline"
        destructive
      />
      <ConfirmDialog
        open={dialog?.kind === "not_relevant"}
        onClose={() => setDialog(null)}
        onConfirm={() => void runDialog()}
        title="Mark as not relevant?"
        body="This helps us keep proposal quality high. Senders with repeated flags are reviewed."
        confirmLabel="Mark"
      />
    </AppShell>
  );
}

function ProposalCard({
  p, toast, onAccept, onDecline, onNotRelevant, onOpenListing, onOpenChat,
}: {
  p: ReceivedProposal;
  toast: { show: (m: string) => void };
  onAccept: () => void; onDecline: () => void; onNotRelevant: () => void; onOpenListing: (id: string) => void; onOpenChat: (threadId: string) => void;
}) {
  const accepted = p.status === "accepted";
  const closed = p.status === "declined" || p.status === "not_relevant";
  const trust = [
    p.sender.verified.phone ? "Phone verified ✓" : null,
    p.sender.verified.rera ? "RERA verified ✓" : null,
    p.sender.memberSince ? `Member since ${p.sender.memberSince}` : null,
    `Profile ${p.sender.profilePct}%`,
  ].filter(Boolean).join(" · ");

  return (
    <div className={cn("flex flex-col gap-3 rounded-12 border border-border bg-surface-1 p-4", (accepted || closed) && "opacity-90")}>
      {/* Sender row */}
      <div className="flex items-center gap-2">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-2 text-15 font-semibold text-ink-secondary">{p.sender.name.slice(0, 1).toUpperCase()}</span>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-15 font-semibold text-ink-primary">{p.sender.name}</span>
            {p.sender.verified.phone && <Icon name="verified" size={14} className="text-accent" />}
            {p.sender.role && <span className="rounded-4 bg-surface-2 px-1.5 py-0.5 text-11 text-ink-secondary capitalize">{p.sender.role}</span>}
          </div>
          <span className="text-11 text-ink-tertiary">{p.sentAgo}</span>
        </div>
        {p.isNew && <span className="h-2 w-2 rounded-full bg-accent" aria-label="New" />}
        {accepted && <StatusBadge kind="active" label="Accepted" />}
        {p.status === "declined" && <StatusBadge kind="rejected" label="Declined" />}
        {p.status === "not_relevant" && <StatusBadge kind="expired" label="Not relevant" />}
      </div>

      {/* Trust strip */}
      <div className="rounded-8 bg-surface-2 px-3 py-2 text-11 text-ink-secondary">{trust}</div>

      {/* Number row (auto-visible — the rule) */}
      {p.sender.phone && (
        <div className="flex flex-col gap-1.5 rounded-8 bg-accent-soft p-3">
          <div className="flex items-center gap-2">
            <Icon name="phone" size={18} className="text-accent" />
            <span className="flex-1 text-15 font-semibold text-ink-primary">{p.sender.phone}</span>
            <button aria-label="Copy number" className="grid h-9 w-9 place-items-center rounded-full bg-surface-1" onClick={() => { void navigator.clipboard?.writeText(p.sender.phone); toast.show("Number copied"); }}><Icon name="copy" size={16} className="text-ink-secondary" /></button>
            <a aria-label="Call" href={`tel:${p.sender.phone}`} className="grid h-9 w-9 place-items-center rounded-full bg-accent text-white"><Icon name="phone" size={16} /></a>
          </div>
          <span className="text-11 text-ink-tertiary">Numbers of people responding to your requirement are shown automatically.</span>
        </div>
      )}

      {/* Message */}
      <p className="text-15 leading-[1.45] text-ink-primary selectable">{p.message}</p>

      {/* Attached listing rich card */}
      {p.listing && (
        <button onClick={() => p.listing && onOpenListing(p.listing.id)} className="flex items-center gap-3 rounded-8 bg-surface-2 p-3 text-left">
          <span className="h-14 w-14 shrink-0 overflow-hidden rounded-8 bg-surface-3">{p.listing.coverUrl && <Img src={p.listing.coverUrl} alt="" className="h-full w-full object-cover" />}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-13 font-semibold text-ink-primary">{p.listing.title ?? "Listing"}</span>
            <span className="block truncate text-11 text-ink-tertiary">{[p.listing.priceLabel, p.listing.areaLabel].filter(Boolean).join(" · ")}</span>
          </span>
          <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
        </button>
      )}

      {/* Action row */}
      {accepted ? (
        <Button variant="outline" fullWidth onClick={() => (p.threadId ? onOpenChat(p.threadId) : toast.show("Opening chat…"))}>Open chat</Button>
      ) : closed ? null : (
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex-1" onClick={onDecline}>Decline</Button>
          <Button className="flex-1" onClick={onAccept}>Accept & Chat</Button>
          <button className="shrink-0 px-1 text-11 font-semibold text-error" onClick={onNotRelevant}>Not relevant</button>
        </div>
      )}
    </div>
  );
}

function InboxArt() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
      <path d="M22 40l6-14a4 4 0 013.7-2.5h32.6A4 4 0 0168 26l6 14v22a4 4 0 01-4 4H26a4 4 0 01-4-4V40z" stroke="var(--ink-tertiary)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M22 40h16l3 6h14l3-6h16" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

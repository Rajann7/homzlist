"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Avatar, VerifiedBadge, ConfirmDialog, Skeleton, useToast } from "@/components";
import { Glyph } from "./glyphs";
import { chatApi } from "@/lib/chat/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * P7 S2 — Message Requests. Preview-before-accept (the sender never learns you
 * saw it until you accept). Verified/Others split + trust strip come from the
 * server. Proposal variant shows the sender's number AUTO (Doc2 §8.1) — that
 * value is only present because the server put it there for the poster.
 */
export function Requests({ base = "/messages" }: { base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<"verified" | "others">("verified");
  const [decline, setDecline] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const res = await chatApi.requests();
    if (res.ok) {
      setData(res.data);
      // Open on the tab that HAS the requests. "Verified" was hardcoded as the
      // landing tab, so a poster with five unverified requests and no verified
      // ones opened this screen on "No message requests" — the header said 5,
      // the body said none, and the five sat one untapped tab away.
      if (res.data.verifiedCount === 0 && res.data.othersCount > 0) setSub("others");
      else if (res.data.verifiedCount > 0) setSub("verified");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const cards = data ? (sub === "verified" ? data.verified : data.others) : [];

  async function accept(card: any) {
    await chatApi.requestAct(card.threadId, "accept");
    toast.show("Chat started", { variant: "success" });
    router.push(`${base}/${card.threadId}`);
  }
  async function doDecline(card: any) {
    setDecline(null);
    await chatApi.requestAct(card.threadId, "decline");
    toast.show("Request declined");
    load();
  }

  return (
    <AppShell showNav={false}
      header={<Header left={<button aria-label="Back" onClick={() => router.push(base)} className="grid h-11 w-11 place-items-center -ml-2"><Icon name="arrow-left" size={24} className="text-ink-primary" /></button>}
        title={<span>Message requests</span>} />}>
      {data && <p className="px-4 pt-2 text-11 text-ink-tertiary">{data.total} request{data.total === 1 ? "" : "s"}</p>}

      {/* sub-tabs */}
      <div className="flex border-b border-border px-4">
        {(["verified", "others"] as const).map((s) => (
          <button key={s} onClick={() => setSub(s)} className={cn("relative px-4 py-3 text-15 font-semibold capitalize", sub === s ? "text-ink-primary" : "text-ink-tertiary")}>
            {s} {data ? `(${s === "verified" ? data.verifiedCount : data.othersCount})` : ""}
            {sub === s && <span className="absolute inset-x-3 bottom-0 h-[1.5px] rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3 p-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-12" />)}</div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-24 text-center">
          <span className="mb-4 text-ink-tertiary"><Glyph name="envelope-open" s={72} /></span>
          <h2 className="text-17 font-semibold text-ink-primary">No message requests</h2>
          <p className="mt-1 text-13 text-ink-secondary">New inquiries will appear here first</p>
        </div>
      ) : (
        <div className="space-y-3 p-4 pb-8">
          {cards.map((c: any) => (
            <div key={c.threadId} className="rounded-12 border border-border bg-surface-1 p-4">
              {/* sender row */}
              <div className="flex items-center gap-3">
                <Avatar src={c.person.photo} name={c.person.name} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-15 font-semibold text-ink-primary">{c.person.name}</span>
                    {c.verified && <VerifiedBadge level="id" />}
                    <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-11 text-ink-secondary">{c.person.roleTag}</span>
                  </div>
                  <span className="text-11 text-ink-tertiary">· {c.timeLabel}</span>
                </div>
              </div>

              {/* trust strip */}
              {c.trust && (
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-8 bg-surface-2 px-3 py-2 text-11 text-ink-secondary">
                  <span className="flex items-center gap-1"><Icon name="check" size={12} className="text-accent" /> Phone verified</span>
                  <span>·</span><span>Member since {c.trust.memberSince}</span>
                  <span>·</span><span>Profile {c.trust.profilePct}% complete</span>
                </div>
              )}

              {/* proposal: sender number auto-visible */}
              {c.senderNumber && (
                <div className="mt-3">
                  <div className="flex items-center gap-2 rounded-8 bg-accent-soft px-3 py-2">
                    <Icon name="phone" size={16} className="text-accent" />
                    <span className="flex-1 text-15 font-semibold text-ink-primary">{c.senderNumber}</span>
                    <button aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(c.senderNumber); toast.show("Number copied", { variant: "success" }); }} className="grid h-9 w-9 place-items-center"><Icon name="copy" size={18} className="text-accent" /></button>
                    <a aria-label="Call" href={`tel:${c.senderNumber}`} className="grid h-9 w-9 place-items-center"><Icon name="phone" size={18} className="text-accent" /></a>
                  </div>
                  <p className="mt-1 text-11 text-ink-tertiary">Numbers of people responding to your requirement are shown to you automatically.</p>
                </div>
              )}

              {/* message */}
              <p className="mt-3 text-15 text-ink-primary">{c.message}</p>

              {/* intent chips the sender ticked */}
              {c.intents?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.intents.map((it: string) => <span key={it} className="rounded-full bg-surface-2 px-2.5 py-1 text-11 text-ink-secondary">{it}</span>)}
                </div>
              )}

              {/* attached / listing / requirement card */}
              {(c.listingCard || c.attachedCard || c.projectCard) && (
                <RichCard card={c.listingCard || c.attachedCard || c.projectCard} project={!c.listingCard && !c.attachedCard && !!c.projectCard} />
              )}
              {c.requirementCard && <div className="mt-3 rounded-8 bg-surface-2 px-3 py-2 text-13 text-ink-secondary">For: {c.requirementCard.title}</div>}

              {/* seen-privacy note (inquiry only) */}
              {!c.senderNumber && (
                <p className="mt-3 flex items-center gap-1.5 text-11 text-ink-tertiary"><Icon name="info" size={13} /> {`They won't know you've seen this until you accept.`}</p>
              )}

              {/* actions */}
              <div className="mt-3 flex gap-2">
                <button onClick={() => setDecline(c)} className="h-11 flex-1 rounded-8 border border-border text-15 font-semibold text-ink-primary active:bg-surface-2">Decline</button>
                <button onClick={() => accept(c)} className="h-11 flex-1 rounded-8 bg-accent text-15 font-semibold text-ink-inverse active:bg-accent-pressed">Accept</button>
              </div>
              <button onClick={() => router.push(`/profile/${c.person.id}`)} className="mt-2 w-full text-center text-13 font-semibold text-accent">View profile</button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog open={!!decline} onClose={() => setDecline(null)} onConfirm={() => doDecline(decline)}
        title="Decline this request?" consequence="They can send a new inquiry after 30 days." destructive confirmLabel="Decline" />
    </AppShell>
  );
}

function RichCard({ card, project = false }: { card: any; project?: boolean }) {
  if (!card) return null;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-8 bg-surface-2 px-3 py-2">
      {card.cover ? <Img src={card.cover} alt="" className="h-12 w-12 rounded-4 object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-4 bg-surface-3"><Icon name={project ? "building" : "home"} size={18} className="text-ink-tertiary" /></span>}
      <div className="min-w-0 flex-1">
        {/* The subject's name wraps rather than being cut — on a request card it
            is the whole reason the person is writing. */}
        <span className="block break-words text-13 font-semibold text-ink-primary">{card.title}</span>
        <span className="block text-11 text-ink-tertiary">{[project ? "Project" : null, card.priceLabel].filter(Boolean).join(" · ")}</span>
      </div>
      <Icon name="chevron-right" size={18} className="text-ink-tertiary" />
    </div>
  );
}

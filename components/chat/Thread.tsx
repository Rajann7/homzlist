"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, Header, Icon, Avatar, VerifiedBadge, BottomSheet, ConfirmDialog, Skeleton, useToast } from "@/components";
import { Glyph } from "./glyphs";
import { chatApi } from "@/lib/chat/client";
import { PhotoViewer } from "./PhotoViewer";
import { subscribeChat, broadcastTyping } from "@/lib/chat/realtime-client";
import { threadTopic, inboxTopic } from "@/lib/chat/realtime-topics";
import { cn } from "@/lib/utils";

/**
 * P7 S3 — Chat Thread (the full behaviour set). Every bubble, card and state is
 * server-driven. The poster's number appears ONLY inside `view.otherNumber`,
 * which the server included solely because the viewer is entitled to it — the
 * NumberCard renders that sealed value, never a client-held digit.
 */

/** Same colour language as the inbox: green property · blue project · amber want. */
const SUBJECT = {
  listing: { chip: "bg-accent-soft text-accent", ink: "text-accent", label: "Property" },
  project: { chip: "bg-info-soft text-info", ink: "text-info", label: "Project" },
  requirement: { chip: "bg-warning-soft text-warning", ink: "text-warning", label: "Requirement" },
} as const;

const EMOJIS = ["👍", "❤️", "😊", "🙏", "✅"];
const SUGGESTIONS = ["Is it still available?", "Can we schedule a visit?", "Is the price negotiable?"];
const NUMBER_RE = /(?:\D|^)(\d[\s-]?){9}\d(?:\D|$)/;

export function Thread({ threadId, base = "/messages" }: { threadId: string; base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [msgSheet, setMsgSheet] = useState<any>(null);
  const [deleteSheet, setDeleteSheet] = useState<any>(null);
  const [reportSheet, setReportSheet] = useState<any>(null);
  const [allowDialog, setAllowDialog] = useState(false);
  const [blockDialog, setBlockDialog] = useState(false);
  const [quickReplies, setQuickReplies] = useState(false);
  const [chatSearch, setChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [searchIdx, setSearchIdx] = useState(0);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [visitSheet, setVisitSheet] = useState(false);
  // The slot picker serves both "propose" and "reschedule" — same sheet, and the
  // mode decides which endpoint the chosen slot goes to.
  const [visitMode, setVisitMode] = useState<"propose" | "reschedule">("propose");
  const [cancelVisitDialog, setCancelVisitDialog] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [warnDismissed, setWarnDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const peerTypingTimer = useRef<any>(null);
  const rtRef = useRef<{ unsubscribe: () => void; sendTyping: (p?: any) => void } | null>(null);
  const lastTypingSent = useRef(0);
  const [offline, setOffline] = useState(false);
  const queueRef = useRef<{ text: string; replyTo: string | null }[]>([]);
  const [priceFlash, setPriceFlash] = useState(false);
  const prevPrice = useRef<string | null>(null);

  const load = useCallback(async (markRead = true) => {
    const res = await chatApi.thread(threadId);
    if (res.ok) { setView(res.data); if (markRead && res.data.status === "accepted") chatApi.read(threadId); }
    setLoading(false);
  }, [threadId]);

  useEffect(() => { load(); }, [load]);
  // Open straight into in-chat search when arriving from Details → "Search in chat".
  const searchParams = useSearchParams();
  useEffect(() => { if (searchParams?.get("search") === "1") setChatSearch(true); }, [searchParams]);
  // Live: Supabase Realtime broadcast pings this thread on any change → refetch
  // through the sealed API + shows the peer's typing indicator. Poll = fallback.
  useEffect(() => {
    const ch = subscribeChat(threadTopic(threadId), {
      onRefresh: () => load(false),
      onTyping: () => { setPeerTyping(true); clearTimeout(peerTypingTimer.current); peerTypingTimer.current = setTimeout(() => setPeerTyping(false), 3000); },
    });
    rtRef.current = ch;
    return () => { ch.unsubscribe(); rtRef.current = null; };
  }, [threadId, load]);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && load(false), 15000);
    return () => clearInterval(t);
  }, [load]);

  // Offline queue: retry queued sends when the connection returns (Doc4 §37).
  useEffect(() => {
    const onOnline = async () => {
      if (!queueRef.current.length) return;
      const items = queueRef.current; queueRef.current = [];
      for (const it of items) await chatApi.send(threadId, { text: it.text, replyTo: it.replyTo });
      setOffline(false); toast.show("Messages sent", { variant: "success" }); load(false);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [threadId, load, toast]);

  // Pinned-listing price change between loads → brief flash on the bar (Doc4 §36).
  useEffect(() => {
    const cur = view?.pinned?.priceLabel ?? null;
    if (cur && prevPrice.current && prevPrice.current !== cur) { setPriceFlash(true); setTimeout(() => setPriceFlash(false), 1500); }
    prevPrice.current = cur;
  }, [view?.pinned?.priceLabel]);

  // Open scrolled to the unread divider (Doc2 §10.2) or the bottom.
  //
  // Keyed on the message COUNT, not on `view`. Depending on the whole object
  // would re-scroll on any change to the thread — a price edit, a read receipt
  // — and yank the reader out of position mid-message.
  const messageCount = view?.messages?.length ?? 0;
  useEffect(() => {
    if (!messageCount) return;
    const el = dividerRef.current ?? bottomRef.current;
    el?.scrollIntoView({ block: "center" });
  }, [messageCount]);

  if (loading) return <ThreadSkeleton base={base} onBack={() => router.push(base)} />;
  if (!view) return <NotFound base={base} onBack={() => router.push(base)} />;

  const p = view.person;

  // In-thread search (Doc2 §10.2): highlight matching text bubbles + N-of-M stepper.
  const searchQ = chatSearchQuery.trim().toLowerCase();
  const matchIds: string[] = searchQ
    ? (view.messages ?? [])
        .filter((m: any) => (m.kind === "text" || m.kind === "link") && m.body && !m.deleted && m.body.toLowerCase().includes(searchQ))
        .map((m: any) => m.id)
    : [];
  const activeMatchId = matchIds.length ? matchIds[Math.min(searchIdx, matchIds.length - 1)] : null;
  const searchCounter = matchIds.length ? `${Math.min(searchIdx + 1, matchIds.length)} of ${matchIds.length}` : "0 of 0";
  // The most recent of MY messages the other side has seen → "Seen HH:MM" label (Doc4 §36).
  const lastSeenId = [...(view.messages ?? [])].reverse().find((m: any) => m.mine && m.seen && !m.pending)?.id ?? null;
  // Only the newest card for the LIVE visit carries the controls; older ones in
  // the scrollback are a record of what was proposed, not a second set of buttons.
  const lastVisitCardId = view.visit
    ? [...(view.messages ?? [])].reverse().find((m: any) => (m.kind === "visit_proposal" || m.kind === "visit_confirmed") && m.meta?.visitId === view.visit.id)?.id ?? null
    : null;

  const composerDisabled = view.status === "declined" || view.block.iBlocked || view.block.blockedMe || p.deleted || (view.status === "pending" && view.side === "poster");
  const showNumberWarn = !warnDismissed && !view.numberAllowed && view.side === "buyer" && NUMBER_RE.test(text);

  async function doSend(body?: string) {
    const t = (body ?? text).trim();
    if (!t || sending) return;
    setSending(true);
    const replyId = reply?.id ?? null;
    const optimistic = { id: `tmp-${Date.now()}`, mine: true, kind: "text", body: t, reactions: {}, seen: false, pending: true, createdAt: new Date().toISOString(), time: "" };
    setView((v: any) => ({ ...v, messages: [...v.messages, optimistic] }));
    setText(""); setReply(null);
    const res = await chatApi.send(threadId, { text: t, replyTo: replyId });
    setSending(false);
    if (!res.ok) {
      // Keep the pending bubble (clock) + queue it; it auto-sends on reconnect.
      queueRef.current.push({ text: t, replyTo: replyId });
      setOffline(true);
      return;
    }
    setOffline(false);
    load(false);
  }

  // Throttled "typing" ping → the peer's open thread (bubble) + inbox (row preview).
  function onComposerType() {
    const now = Date.now();
    if (now - lastTypingSent.current < 2500) return;
    lastTypingSent.current = now;
    rtRef.current?.sendTyping({});
    if (view?.person?.id) broadcastTyping(inboxTopic(view.person.id), { threadId });
  }

  async function requestNumber() {
    const res = await chatApi.requestNumber(threadId);
    if (res.ok) { toast.show("Number requested"); load(false); }
  }
  async function respondNumber(allow: boolean) {
    setAllowDialog(false);
    const res = await chatApi.numberRespond(threadId, allow);
    if (res.ok) { toast.show(allow ? "Number shared" : "Request denied"); load(false); }
  }
  async function react(msg: any, emoji: string) { setMsgSheet(null); await chatApi.react(msg.id, emoji); load(false); }
  async function continuity(answer: "interested" | "not_interested" | "visit_fixed") { await chatApi.continuity(threadId, answer); toast.show("Lead status updated", { variant: "success" }); load(false); }

  async function openQuick() { const res = await chatApi.templates(); if (res.ok) setTemplates(res.data.templates); setQuickReplies(true); }

  /**
   * Act on the thread's live visit. "Reschedule" re-opens the same slot picker
   * the propose flow uses, so there is one way to choose a time; everything else
   * is a single call. Cancel confirms first — it's the other party's Saturday.
   */
  async function onVisit(input: { action: "confirm" | "reschedule" | "cancel" | "outcome"; outcome?: "done" | "cancelled" }) {
    if (input.action === "reschedule") { setVisitMode("reschedule"); setVisitSheet(true); return; }
    if (input.action === "cancel") { setCancelVisitDialog(true); return; }
    const res = await chatApi.visitAct(threadId, input);
    if (res.ok) {
      toast.show(
        input.action === "confirm" ? "Visit confirmed"
        : input.outcome === "done" ? "Visit marked as completed"
        : "Marked as not happened",
        { variant: "success" },
      );
      load(false);
    } else toast.show("Couldn't update that visit", { variant: "error" });
  }

  const searchHeader = (
    <div className="flex h-14 flex-none items-center gap-1.5 border-b border-divider bg-page px-2">
      <div className="flex h-9 flex-1 items-center gap-2 rounded-full bg-surface-2 px-3">
        <Icon name="search" size={18} className="text-ink-tertiary" />
        <input autoFocus value={chatSearchQuery} onChange={(e) => { setChatSearchQuery(e.target.value); setSearchIdx(0); }}
          placeholder="Search in chat" className="min-w-0 flex-1 bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary" />
      </div>
      {searchQ && <span className="whitespace-nowrap text-13 text-ink-tertiary">{searchCounter}</span>}
      <button aria-label="Previous match" onClick={() => setSearchIdx((i) => Math.max(0, i - 1))} className="grid h-11 w-9 place-items-center"><Icon name="chevron-up" size={20} className="text-ink-primary" /></button>
      <button aria-label="Next match" onClick={() => setSearchIdx((i) => Math.min(matchIds.length - 1, i + 1))} className="grid h-11 w-9 place-items-center"><Icon name="chevron-down" size={20} className="text-ink-primary" /></button>
      <button onClick={() => { setChatSearch(false); setChatSearchQuery(""); setSearchIdx(0); }} className="h-11 px-2 text-15 font-semibold text-accent">Done</button>
    </div>
  );

  return (
    <AppShell showNav={false} scroll={false} header={chatSearch ? searchHeader : (
      <Header
        left={<button aria-label="Back" onClick={() => router.push(base)} className="grid h-11 w-11 place-items-center -ml-2"><Icon name="arrow-left" size={24} className="text-ink-primary" /></button>}
        title={
          <button onClick={() => !p.deleted && router.push(`${base}/${threadId}/details`)} className="flex min-w-0 items-center gap-2">
            <Avatar src={p.photo} name={p.name} size={32} />
            <span className="min-w-0 text-left">
              <span className="flex items-center gap-1"><span className="truncate text-15 font-semibold text-ink-primary">{p.name}</span>{p.verified && <VerifiedBadge level="id" />}{p.roleTag && <span className="rounded-full bg-surface-2 px-1.5 text-11 text-ink-secondary">{p.roleTag}</span>}</span>
              <span className={cn("block text-11", p.online ? "text-accent" : "text-ink-tertiary")}>{p.deleted ? "" : p.online ? "Online" : p.lastSeen ? `Last seen ${p.lastSeen}` : ""}</span>
            </span>
          </button>
        }
        right={!p.deleted && <button aria-label="Chat menu" onClick={() => setMenu(true)} className="grid h-11 w-11 place-items-center"><Icon name="more" size={24} className="text-ink-primary" /></button>}
      />
    )}>
      {/* ── What this chat is about ───────────────────────────────────────
          The subject comes first, in full, with the same colour language the
          inbox uses (green property · blue project · amber requirement) and one
          sentence saying which way the conversation runs. Tapping it opens the
          real post. */}
      {view.pinned && (() => { const S = SUBJECT[(view.pinned.type as keyof typeof SUBJECT) ?? "listing"] ?? SUBJECT.listing; return (
        <div className={cn("shrink-0 border-b border-border transition-colors", priceFlash ? "bg-accent-soft" : "bg-surface-2")}>
          <button
            onClick={() => view.pinned.href && router.push(view.pinned.href)}
            className="flex w-full items-start gap-3 px-3 py-2.5 text-left active:bg-surface-3"
          >
            {view.pinned.cover ? (
              <img src={view.pinned.cover} alt="" className="h-12 w-12 shrink-0 rounded-8 bg-surface-3 object-cover" />
            ) : (
              <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-8", S.chip)}>
                <Icon name={view.pinned.type === "project" ? "building" : view.pinned.type === "requirement" ? "search-list" : "home"} size={22} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              {/* wraps — a chat's subject is never worth truncating */}
              <span className="block break-words text-13 font-semibold leading-snug text-ink-primary">{view.pinned.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-11 text-ink-tertiary">
                <span className={cn("rounded-4 px-1.5 py-0.5 font-semibold uppercase tracking-wide", S.chip)}>
                  {S.label}
                </span>
                {/* Which unit of the scheme this chat is about (0087). */}
                {view.pinned.unitLabel && <span className="font-semibold text-ink-primary">{view.pinned.unitLabel}</span>}
                {view.pinned.priceLabel && <span className="font-semibold text-ink-secondary">{view.pinned.priceLabel}</span>}
              </span>
            </span>
            <Icon name="chevron-right" size={18} className="mt-1 shrink-0 text-ink-tertiary" />
          </button>
          <div className="flex items-center gap-2 px-3 pb-2">
            {view.context && (
              <p className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-11 font-semibold", view.context.mine ? S.ink : "text-ink-secondary")}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
                  {view.context.mine ? <path d="M17 7L7 17M7 17h7M7 17v-7" /> : <path d="M7 17L17 7M17 7h-7M17 7v7" />}
                </svg>
                <span className="truncate">{view.context.line}</span>
              </p>
            )}
            {/* A site visit is an action, so it is a button you can see — it used
                to be the second row of a seven-item ⋯ menu. Only for a property
                or a project: there is nothing to visit about a requirement. */}
            {view.status === "accepted" && !view.visit && view.pinned.type !== "requirement" && !view.block.iBlocked && !view.block.blockedMe && (
              <button
                onClick={() => { setVisitMode("propose"); setVisitSheet(true); }}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1.5 text-11 font-semibold text-ink-primary shadow-l1 active:bg-surface-3"
              >
                <Icon name="clock" size={14} /> Site visit
              </button>
            )}
          </div>
        </div>
      ); })()}
      {view.listingBanner && <div className="shrink-0 bg-warning-soft px-4 py-1.5 text-center text-11 text-warning">{view.listingBanner}</div>}

      {/* Message area */}
      <div ref={scrollRef} onScroll={(e) => { const el = e.currentTarget; setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 240); }}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-3">
        {view.status === "pending" && view.side === "buyer" ? (
          <PendingCard name={p.name} />
        ) : view.status === "declined" ? (
          <DeclinedCard until={view.cooldownUntil} />
        ) : view.messages.length === 0 ? (
          <EmptyThread onChip={(c) => setText(c)} />
        ) : (
          view.messages.map((m: any, i: number) => (
            <MessageItem key={m.id} m={m} prev={view.messages[i - 1]} view={view}
              isDivider={m.id === view.firstUnreadId}
              dividerRef={m.id === view.firstUnreadId ? dividerRef : undefined}
              searchMatch={matchIds.includes(m.id)}
              activeMatch={m.id === activeMatchId}
              isLastSeen={m.id === lastSeenId}
              onViewPhoto={setViewPhoto}
              onReply={(msg: any) => setReply(msg)}
              onLong={() => m.kind === "text" || m.kind === "photo" ? setMsgSheet(m) : undefined}
              onAllow={() => setAllowDialog(true)} onDeny={() => respondNumber(false)}
              onContinuity={continuity}
              onVisit={onVisit} lastVisitCardId={lastVisitCardId}
              onCopyNumber={() => { navigator.clipboard?.writeText(view.otherNumber); toast.show("Number copied", { variant: "success" }); }}
              toast={toast} />
          ))
        )}
        {view.block.iBlocked && <BlockedCard name={p.name} onUnblock={async () => { await chatApi.block(threadId, "unblock"); load(false); }} />}
        {peerTyping && view.status === "accepted" && !p.deleted && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-16 rounded-bl-4 bg-surface-2 px-3 py-3">
              {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-ink-tertiary" style={{ animation: `dotb 1.2s ${i * 0.15}s infinite` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* jump to bottom */}
      {showJump && (
        <button onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })} className="absolute bottom-24 left-1/2 z-sticky -translate-x-1/2 rounded-full bg-surface-1 px-4 py-2 text-13 font-semibold text-ink-primary shadow-l2">
          <span className="flex items-center gap-1.5"><Icon name="chevron-down" size={16} /> New messages</span>
        </button>
      )}

      {/* Number pattern warning */}
      {showNumberWarn && (
        <div className="flex shrink-0 items-start gap-2 bg-warning-soft px-4 py-2 text-11 text-warning">
          <span className="flex-1">{`Sharing numbers directly isn't recommended. Use "Request number" — HomzList isn't responsible for off-platform deals.`}</span>
          <button aria-label="Dismiss" onClick={() => setWarnDismissed(true)}><Icon name="close" size={16} /></button>
        </div>
      )}

      {/* Composer / state strips */}
      {composerDisabled ? (
        <div className="shrink-0 border-t border-border bg-surface-2 px-4 py-3 text-center text-13 text-ink-tertiary">
          {view.block.iBlocked ? "You can't message a blocked user." : view.block.blockedMe ? "You can't reply to this conversation." : p.deleted ? "This account no longer exists." : view.status === "declined" ? "Inquiry declined." : "You can message after they accept."}
        </div>
      ) : (
        <div className="shrink-0 border-t border-border bg-surface-1">
          {offline && (
            <div className="flex items-center gap-2 border-b border-divider bg-warning-soft px-4 py-2 text-11 text-warning">
              <Icon name="wifi-off" size={14} /> No connection — messages will send automatically
            </div>
          )}
          {reply && (
            <div className="flex items-center gap-2 border-b border-divider px-4 py-2">
              <span className="border-l-2 border-accent pl-2 text-11 text-ink-tertiary flex-1 truncate">{reply.body ?? "Photo"}</span>
              <button aria-label="Cancel reply" onClick={() => setReply(null)}><Icon name="close" size={16} className="text-ink-tertiary" /></button>
            </div>
          )}
          {view.side === "buyer" && !view.numberAllowed && view.status === "accepted" && (
            <button onClick={requestNumber} className="flex w-full items-center justify-center gap-1.5 border-b border-divider py-2 text-13 font-semibold text-accent"><Icon name="phone" size={16} /> Request number</button>
          )}
          {/* Photo sending removed on Rajan's instruction — the composer is text
              only. Photos already in a thread still render and open full-screen. */}
          <div className="flex items-end gap-2 px-2 py-2">
            <textarea value={text} onChange={(e) => { setText(e.target.value); setWarnDismissed(false); onComposerType(); }} rows={1} placeholder="Message…"
              className={cn("max-h-28 min-h-11 flex-1 resize-none bg-surface-2 px-3 py-2.5 text-15 text-ink-primary outline-none placeholder:text-ink-tertiary", text.length > 60 ? "rounded-16" : "rounded-full")} />
            <button aria-label="Quick replies" onClick={openQuick} className="grid h-11 w-11 shrink-0 place-items-center text-ink-secondary"><Glyph name="bolt" s={22} /></button>
            <button aria-label="Send" disabled={!text.trim()} onClick={() => doSend()} className={cn("grid h-11 w-11 shrink-0 place-items-center transition-colors", text.trim() ? "text-accent" : "text-ink-tertiary")}><Icon name="send" size={22} /></button>
          </div>
          {text.length >= 1800 && <div className="px-4 pb-1 text-right text-11 text-ink-tertiary">{text.length.toLocaleString()} / 2,000</div>}
        </div>
      )}

      {/* ── Sheets & dialogs ─────────────────────────────────────────── */}
      {/* Four items, and every one of them is about the person you're talking
          to. "Propose a site visit" moved out to a visible button (a visit is an
          action, not a setting); "Not interested" lives on the continuity card
          that asks the question; Block and Report are one row, because nobody
          blocks someone they don't also want reported. */}
      <BottomSheet open={menu} onClose={() => setMenu(false)} title={p.name}>
        <div className="pb-2">
          <MenuRow label="View profile" onClick={() => { setMenu(false); router.push(`/profile/${p.id}`); }} />
          <MenuRow label="Search in this chat" onClick={() => { setMenu(false); setChatSearch(true); setChatSearchQuery(""); setSearchIdx(0); }} />
          <MenuRow label={view.myState.muted ? "Unmute notifications" : "Mute notifications"} onClick={async () => { setMenu(false); await chatApi.setState(threadId, { muted: !view.myState.muted }); toast.show(view.myState.muted ? "Unmuted" : "Muted"); load(false); }} />
          {/* The poster's own lead lives on this thread; closing it must stay
              reachable even in a thread the continuity card never appeared in. */}
          {view.side === "poster" && view.status === "accepted" && (
            <MenuRow label="Mark as not interested" onClick={() => { setMenu(false); continuity("not_interested"); }} />
          )}
          {view.block.iBlocked ? (
            <MenuRow label="Unblock user" danger onClick={() => { setMenu(false); setBlockDialog(true); }} />
          ) : (
            <MenuRow label="Report & block" danger onClick={() => { setMenu(false); setReportSheet({ user: true, thenBlock: true }); }} />
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={!!msgSheet} onClose={() => setMsgSheet(null)} hideHeader>
        {msgSheet && (
          <div className="pt-2">
            <div className="mb-2 flex justify-center gap-2 pb-2">
              {EMOJIS.map((e) => <button key={e} onClick={() => react(msgSheet, e)} className="grid h-11 w-11 place-items-center rounded-full text-2xl active:bg-surface-2">{e}</button>)}
            </div>
            <MenuRow label="Reply" onClick={() => { setReply(msgSheet); setMsgSheet(null); }} />
            {msgSheet.body && <MenuRow label="Copy text" onClick={() => { navigator.clipboard?.writeText(msgSheet.body); toast.show("Copied"); setMsgSheet(null); }} />}
            <MenuRow label="Report message" danger onClick={() => { setReportSheet({ messageId: msgSheet.id }); setMsgSheet(null); }} />
            {msgSheet.mine && <MenuRow label="Delete" danger onClick={() => { setDeleteSheet(msgSheet); setMsgSheet(null); }} />}
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={!!deleteSheet} onClose={() => setDeleteSheet(null)} hideHeader>
        {deleteSheet && (
          <div className="pt-2">
            <MenuRow label="Delete for me" onClick={async () => { await chatApi.deleteMsg(deleteSheet.id, "me"); setDeleteSheet(null); load(false); }} />
            <MenuRow label="Delete for everyone" danger onClick={async () => { await chatApi.deleteMsg(deleteSheet.id, "everyone"); setDeleteSheet(null); load(false); }} />
          </div>
        )}
      </BottomSheet>

      <PhotoViewer url={viewPhoto} onClose={() => setViewPhoto(null)} />

      <QuickRepliesSheet open={quickReplies} onClose={() => setQuickReplies(false)} templates={templates}
        onPick={(b: string) => { setText(b); setQuickReplies(false); }}
        onChange={async () => { const res = await chatApi.templates(); if (res.ok) setTemplates(res.data.templates); }}
        toast={toast} />

      <VisitSheet open={visitSheet} mode={visitMode} onClose={() => { setVisitSheet(false); setVisitMode("propose"); }}
        onPropose={async (iso) => {
          setVisitSheet(false);
          const r = visitMode === "reschedule"
            ? await chatApi.visitAct(threadId, { action: "reschedule", scheduledAt: iso })
            : await chatApi.proposeVisit(threadId, iso);
          setVisitMode("propose");
          if (r.ok) { toast.show(visitMode === "reschedule" ? "New time proposed" : "Visit proposed", { variant: "success" }); load(false); }
          else toast.show("Couldn't schedule that visit", { variant: "error" });
        }} />

      <ConfirmDialog open={cancelVisitDialog} onClose={() => setCancelVisitDialog(false)}
        onConfirm={async () => {
          setCancelVisitDialog(false);
          const r = await chatApi.visitAct(threadId, { action: "cancel" });
          if (r.ok) { toast.show("Visit cancelled"); load(false); } else toast.show("Couldn't cancel that visit", { variant: "error" });
        }}
        title="Cancel this site visit?" body={<span>{p.name} will see that it was cancelled.</span>} destructive confirmLabel="Cancel visit" />

      {/* "Report & block" is one decision for the user and two writes for us:
          the report row for the admin queue, then the block that actually stops
          them. Reporting alone used to leave the person able to keep messaging. */}
      <ReportSheet open={!!reportSheet} onClose={() => setReportSheet(null)} onSubmit={async (reason, note) => {
        const blockToo = !!reportSheet.thenBlock;
        const r = reportSheet.messageId ? await chatApi.reportMsg(reportSheet.messageId, reason, note) : await chatApi.reportUser(threadId, reason, note);
        setReportSheet(null);
        if (blockToo) await chatApi.block(threadId, "block");
        if (r.ok) toast.show(blockToo ? `Reported and blocked ${p.name}` : "Report submitted", { variant: "success" });
        if (blockToo) load(false);
      }} />

      <ConfirmDialog open={allowDialog} onClose={() => setAllowDialog(false)} onConfirm={() => respondNumber(true)}
        title="Share your number?" body={<span>Your number will be visible to {p.name} in this chat.</span>} confirmLabel="Allow" />

      <ConfirmDialog open={blockDialog} onClose={() => setBlockDialog(false)}
        onConfirm={async () => { setBlockDialog(false); await chatApi.block(threadId, view.block.iBlocked ? "unblock" : "block"); toast.show(view.block.iBlocked ? "Unblocked" : `Blocked ${p.name}`); load(false); }}
        title={view.block.iBlocked ? `Unblock ${p.name}?` : `Block ${p.name}?`} body={view.block.iBlocked ? undefined : "They won't be able to message you. Existing messages stay visible."} destructive={!view.block.iBlocked} confirmLabel={view.block.iBlocked ? "Unblock" : "Block"} />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Message renderer
// ---------------------------------------------------------------------------
function MessageItem({ m, prev, view, isDivider, dividerRef, onLong, onAllow, onDeny, onContinuity, onCopyNumber, onVisit, lastVisitCardId, toast, searchMatch, activeMatch, isLastSeen, onViewPhoto, onReply }: any) {
  const router = useRouter();
  const longTimer = useRef<any>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const dragStart = useRef<number | null>(null);
  const showDate = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
  // Swipe-right on a bubble → quick reply (Doc4 §37). Long-press → menu still works.
  const onBubbleDown = (x: number) => { dragStart.current = x; longTimer.current = setTimeout(onLong, 500); };
  const onBubbleMove = (x: number, down: boolean) => {
    clearTimeout(longTimer.current);
    if (dragStart.current == null || !down) return;
    const dx = x - dragStart.current;
    if (dx > 0) setDragX(Math.min(dx, 64));
  };
  const onBubbleUp = () => {
    clearTimeout(longTimer.current);
    if (dragX > 44 && !m.deleted) onReply?.(m);
    setDragX(0);
    dragStart.current = null;
  };
  // Quoted-reply: the original this message replied to (looked up client-side).
  const orig = m.replyTo ? (view.messages ?? []).find((x: any) => x.id === m.replyTo) : null;
  function jumpToOrig() {
    if (!orig) return;
    const el = document.querySelector(`[data-mid="${orig.id}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("ring-2", "ring-accent");
    setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 1200);
  }

  // Scroll the active search result into view when the stepper lands on it.
  useEffect(() => { if (activeMatch) bubbleRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [activeMatch]);

  const wrap = (child: React.ReactNode) => (
    <>
      {showDate && <div className="sticky top-1 z-[5] my-2 flex justify-center"><span className="rounded-full bg-surface-2 px-3 py-1 text-11 font-semibold text-ink-tertiary shadow-l1">{dayLabel(m.createdAt)}</span></div>}
      {isDivider && <div ref={dividerRef} className="my-2 flex items-center gap-2"><span className="h-px flex-1 bg-accent/30" /><span className="rounded-full bg-accent-soft px-2 py-0.5 text-11 font-semibold text-accent">New messages</span><span className="h-px flex-1 bg-accent/30" /></div>}
      {child}
    </>
  );

  // System card / line
  if (m.kind === "system") {
    const safety = m.meta?.subtype === "safety";
    return wrap(
      safety ? (
        <div className="mx-auto my-1 max-w-[90%] rounded-8 bg-surface-2 p-3 text-center"><span className="mb-1 inline-flex text-accent"><Icon name="shield" size={18} /></span><p className="text-11 text-ink-secondary">{m.body} <span className="font-semibold text-accent">Learn more</span></p></div>
      ) : <div className="my-1 text-center text-11 text-ink-tertiary">{m.body}</div>,
    );
  }

  if (m.kind === "continuity") {
    return wrap(
      <div className="mx-auto my-1 max-w-[90%] rounded-8 bg-surface-2 p-3 text-center">
        <p className="text-13 font-semibold text-ink-primary">{m.body}</p>
        <div className="mt-2 flex justify-center gap-2">
          {[["Interested", "interested"], ["Not interested", "not_interested"], ["Visit fixed", "visit_fixed"]].map(([l, v]) => (
            <button key={v} onClick={() => onContinuity(v)} className="rounded-full bg-surface-1 px-3 py-1.5 text-13 font-medium text-ink-primary active:bg-surface-3">{l}</button>
          ))}
        </div>
      </div>,
    );
  }

  if (m.kind === "number_request") {
    const requesterIsMe = m.mine;
    return wrap(
      <div className="mx-auto my-1 max-w-[90%] rounded-8 bg-surface-2 p-3 text-center">
        <p className="text-13 text-ink-secondary">{requesterIsMe ? "You requested their phone number" : `${view.person.name} requested your phone number`}</p>
        {!requesterIsMe && !view.numberAllowed && (
          <div className="mt-2 flex justify-center gap-2">
            <button onClick={onDeny} className="h-9 rounded-8 border border-border px-4 text-13 font-semibold text-ink-primary">Deny</button>
            <button onClick={onAllow} className="h-9 rounded-8 bg-accent px-4 text-13 font-semibold text-ink-inverse">Allow</button>
          </div>
        )}
      </div>,
    );
  }

  if (m.kind === "number_card") {
    // The digits come ONLY from view.otherNumber (sealed server-side).
    const num = view.otherNumber;
    return wrap(
      <div className="mx-auto my-1 w-[80%] max-w-[280px] rounded-12 bg-accent-soft p-3 text-center">
        <span className="mb-1 inline-flex text-accent"><Icon name="phone" size={20} /></span>
        <p className="text-17 font-semibold text-ink-primary">{num ?? "Number shared"}</p>
        {num && (
          <div className="mt-2 flex justify-center gap-3">
            <button onClick={onCopyNumber} className="grid h-10 w-10 place-items-center rounded-full bg-surface-1 text-ink-primary"><Icon name="copy" size={18} /></button>
            <a href={`tel:${num}`} className="grid h-10 w-10 place-items-center rounded-full bg-accent text-ink-inverse"><Icon name="phone" size={18} /></a>
          </div>
        )}
      </div>,
    );
  }

  if (m.kind === "visit_proposal" || m.kind === "visit_confirmed") {
    const confirmed = m.kind === "visit_confirmed";
    const when = m.meta?.scheduledAt ? new Date(m.meta.scheduledAt).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";
    // Controls belong ONLY on the card for the visit that is still live, and only
    // while the server says this viewer may act — an older card in the scrollback
    // is history, not a second set of buttons.
    const live = view.visit && m.meta?.visitId === view.visit.id ? view.visit : null;
    const isLatest = live && m.id === lastVisitCardId;
    const acts = isLatest ? live : null;
    return wrap(
      <div className={cn("mx-auto my-1 w-[86%] rounded-12 p-3", confirmed ? "border-[1.5px] border-accent bg-surface-1" : "border border-border bg-surface-1")}>
        <p className="flex items-center gap-1.5 text-15 font-semibold text-ink-primary">{confirmed ? <Icon name="check-circle" size={18} className="text-accent" /> : <Glyph name="calendar" s={18} />}{confirmed ? "Site visit confirmed" : "Site visit proposed"}</p>
        <p className="mt-1 text-13 text-ink-secondary">{when}</p>
        {view.pinned?.title && <p className="mt-0.5 text-11 text-ink-tertiary">{view.pinned.title}</p>}
        {acts && (
          <div className="mt-3 flex gap-4">
            {/* Confirm only makes sense for the side that didn't propose it. */}
            {acts.canConfirm && !m.mine && <button onClick={() => onVisit({ action: "confirm" })} className="text-13 font-semibold text-accent">Confirm</button>}
            {acts.canReschedule && <button onClick={() => onVisit({ action: "reschedule" })} className="text-13 font-semibold text-accent">Reschedule</button>}
            {acts.canCancel && <button onClick={() => onVisit({ action: "cancel" })} className="text-13 font-semibold text-error">Cancel</button>}
          </div>
        )}
        {/* The slot has passed — record what actually happened, which is what
            moves the lead to the Visit stage. Without this the visit state
            machine dead-ended at `confirmed` forever. */}
        {acts?.canSetOutcome && (
          <div className="mt-3 flex gap-4 border-t border-divider pt-2.5">
            <button onClick={() => onVisit({ action: "outcome", outcome: "done" })} className="text-13 font-semibold text-accent">Visit happened</button>
            <button onClick={() => onVisit({ action: "outcome", outcome: "cancelled" })} className="text-13 font-semibold text-ink-secondary">{`Didn't happen`}</button>
          </div>
        )}
      </div>,
    );
  }

  // text / photo / link bubble
  const mine = m.mine;
  return wrap(
    <div className={cn("relative flex flex-col", mine ? "items-end" : "items-start")}>
      {dragX > 8 && <span className="absolute left-1 top-1/2 -translate-y-1/2 text-ink-tertiary" style={{ opacity: Math.min(dragX / 44, 1) }}><Icon name="arrow-left" size={18} className="rotate-180" /></span>}
      <div
        ref={bubbleRef}
        data-mid={m.id}
        onPointerDown={(e) => onBubbleDown(e.clientX)}
        onPointerMove={(e) => onBubbleMove(e.clientX, !!e.buttons)}
        onPointerUp={onBubbleUp}
        onPointerCancel={onBubbleUp}
        style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}
        className={cn("relative max-w-[78%] px-3 py-2 text-15 transition-all",
          searchMatch ? "bg-warning-soft text-ink-primary" : mine ? "bg-accent-soft text-ink-primary" : "bg-surface-2 text-ink-primary",
          mine ? "rounded-16 rounded-br-4" : "rounded-16 rounded-bl-4")}
      >
        {orig && !m.deleted && (
          <button onClick={jumpToOrig} className="mb-1 block w-full rounded-4 border-l-2 border-accent bg-surface-1/70 py-1 pl-2 pr-1 text-left">
            <span className="block truncate text-11 text-ink-tertiary">{orig.deleted ? "Deleted message" : orig.kind === "photo" ? "Photo" : orig.body}</span>
          </button>
        )}
        {m.deleted ? (
          <span className="text-13 italic text-ink-tertiary">This message was deleted</span>
        ) : m.kind === "photo" && m.photo ? (
          <img src={m.photo} alt="" onClick={() => onViewPhoto?.(m.photo)} className="max-h-64 cursor-pointer rounded-12 object-cover" />
        ) : m.kind === "link" ? (
          <div>
            {/* Rich card for our own property/project links (title + live price
                + cover, resolved server-side); a plain domain card otherwise. */}
            {m.meta?.title ? (
              <button
                onClick={() => m.meta.entityId && router.push(m.meta.kind === "project" ? `/projects/${m.meta.entityId}` : `/property/${m.meta.entityId}`)}
                className="mb-1 block w-[220px] overflow-hidden rounded-8 bg-surface-1 text-left"
              >
                {m.meta.cover
                  ? <img src={m.meta.cover} alt="" className="h-[110px] w-full object-cover" />
                  : <span className="block h-[110px] w-full bg-surface-3" />}
                <span className="block p-2">
                  <span className="block text-13 font-semibold text-ink-primary">{m.meta.title}</span>
                  {m.meta.subtitle && <span className="block text-11 text-ink-secondary">{m.meta.subtitle}</span>}
                  <span className="block text-11 text-ink-tertiary">{m.meta.domain}</span>
                </span>
              </button>
            ) : m.meta?.domain ? (
              <div className="mb-1 rounded-8 bg-surface-1 p-2">
                <p className="text-11 text-ink-tertiary">{m.meta.domain}</p>
                {m.meta.external && <p className="mt-1 rounded bg-warning-soft px-1.5 py-0.5 text-11 text-warning">External link — open with care</p>}
              </div>
            ) : null}
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
        )}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-11 text-ink-tertiary">
          {m.time}
          {mine && !m.pending && <Ticks seen={m.seen} />}
          {mine && m.pending && <Icon name="clock" size={11} />}
        </span>
        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <span className={cn("absolute -bottom-2 rounded-full border border-border bg-surface-1 px-1.5 text-11", mine ? "right-2" : "left-2")}>
            {Object.entries(m.reactions).map(([e, arr]: any) => `${e}${arr.length > 1 ? " " + arr.length : ""}`).join(" ")}
          </span>
        )}
      </div>
      {mine && isLastSeen && <span className="mt-1 pr-1 text-11 text-ink-tertiary">Seen {m.time}</span>}
    </div>,
  );
}

/**
 * Delivery ticks — the design's exact double-check glyph (P7 bubble meta):
 * `stroke: ink3` once delivered, `stroke: accent` once seen. We were drawing the
 * single-check Icon, so a delivered message and a seen one differed only by
 * colour on a mark the design never uses.
 */
function Ticks({ seen }: { seen: boolean }) {
  return (
    <svg width="16" height="14" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth={2}
      className={seen ? "text-accent" : "text-ink-tertiary"} aria-label={seen ? "Seen" : "Delivered"}>
      <path d="M2 9l4 4 8-10M9 13l1 1 8-10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
function PendingCard({ name }: { name: string }) {
  return <div className="mx-auto mt-8 max-w-[85%] rounded-12 bg-surface-2 p-4 text-center"><span className="mb-2 inline-flex text-warning"><Icon name="clock" size={24} /></span><p className="text-13 text-ink-secondary">Waiting for {name} to accept your inquiry</p><p className="mt-1 text-11 text-ink-tertiary">{`You'll be notified when they respond`}</p></div>;
}
function DeclinedCard({ until }: { until: string | null }) {
  const d = until ? new Date(until).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
  return <div className="mx-auto mt-8 max-w-[85%] rounded-12 bg-error-soft p-4 text-center"><p className="text-13 text-error">Your inquiry was declined. You can send a new one after {d}.</p></div>;
}
function BlockedCard({ name, onUnblock }: { name: string; onUnblock: () => void }) {
  return <div className="mx-auto my-3 max-w-[85%] rounded-12 bg-surface-2 p-4 text-center"><p className="text-13 text-ink-secondary">You blocked {name}</p><button onClick={onUnblock} className="mt-1 text-13 font-semibold text-accent">Unblock</button></div>;
}
function EmptyThread({ onChip }: { onChip: (c: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <span className="mb-3 text-ink-tertiary"><Glyph name="chat-bubbles" s={64} /></span>
      <p className="text-15 font-semibold text-ink-primary">Say hello</p>
      <p className="mt-1 text-13 text-ink-secondary">Ask about availability, price or a site visit</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => <button key={s} onClick={() => onChip(s)} className="rounded-full bg-surface-2 px-3 py-1.5 text-13 text-ink-primary active:bg-surface-3">{s}</button>)}
      </div>
    </div>
  );
}
function MenuRow({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={cn("flex h-12 w-full items-center px-4 text-left text-15", danger ? "text-error" : "text-ink-primary")}>{label}</button>;
}

function QuickRepliesSheet({ open, onClose, templates, onPick, onChange, toast }: any) {
  const [editing, setEditing] = useState<any>(null);
  const [draft, setDraft] = useState("");
  return (
    <BottomSheet open={open} onClose={onClose} title="Quick replies">
      <div className="pb-4">
        {templates.map((t: any) => (
          <div key={t.id} className="flex items-center gap-2 border-b border-divider px-4 py-2">
            <button onClick={() => onPick(t.body)} className="flex-1 text-left text-15 text-ink-primary">{t.body}</button>
            {!t.isDefault && <>
              <button aria-label="Edit" onClick={() => { setEditing(t); setDraft(t.body); }} className="grid h-9 w-9 place-items-center text-ink-tertiary"><Icon name="edit" size={16} /></button>
              <button aria-label="Delete" onClick={async () => { await chatApi.templateDelete(t.id); onChange(); }} className="grid h-9 w-9 place-items-center text-error"><Icon name="trash" size={16} /></button>
            </>}
          </div>
        ))}
        {editing === "new" || editing ? (
          <div className="p-4">
            <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="w-full rounded-8 bg-surface-2 p-3 text-15 text-ink-primary outline-none" placeholder="Template text…" />
            <button onClick={async () => { if (editing === "new") await chatApi.templateCreate(draft); else await chatApi.templateUpdate(editing.id, draft); toast.show("Template saved", { variant: "success" }); setEditing(null); onChange(); }} className="mt-2 h-11 w-full rounded-8 bg-accent text-15 font-semibold text-ink-inverse">Save</button>
          </div>
        ) : (
          <button onClick={() => { setEditing("new"); setDraft(""); }} className="flex h-12 w-full items-center gap-2 px-4 text-15 font-semibold text-accent"><Icon name="plus" size={18} /> New template</button>
        )}
      </div>
    </BottomSheet>
  );
}

function VisitSheet({ open, onClose, onPropose, mode = "propose" }: { open: boolean; onClose: () => void; onPropose: (iso: string) => void; mode?: "propose" | "reschedule" }) {
  const days = Array.from({ length: 3 }).map((_, i) => { const d = new Date(); d.setDate(d.getDate() + i + 1); return d; });
  const times = ["10:00", "11:00", "16:00"];
  const [day, setDay] = useState(0);
  const [time, setTime] = useState("11:00");
  return (
    <BottomSheet open={open} onClose={onClose} title={mode === "reschedule" ? "Pick a new time" : "Propose a site visit"}>
      <div className="p-4">
        <div className="mb-3 flex gap-2">{days.map((d, i) => <button key={i} onClick={() => setDay(i)} className={cn("flex-1 rounded-8 py-2 text-13 font-medium", day === i ? "bg-accent text-ink-inverse" : "bg-surface-2 text-ink-secondary")}>{d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</button>)}</div>
        <div className="mb-4 flex gap-2">{times.map((t) => <button key={t} onClick={() => setTime(t)} className={cn("flex-1 rounded-8 py-2 text-13 font-medium", time === t ? "bg-accent text-ink-inverse" : "bg-surface-2 text-ink-secondary")}>{fmtTime(t)}</button>)}</div>
        <button onClick={() => { const d = days[day]; const [h, m] = time.split(":"); d.setHours(+h, +m, 0, 0); onPropose(d.toISOString()); }} className="h-11 w-full rounded-8 bg-accent text-15 font-semibold text-ink-inverse">{mode === "reschedule" ? "Propose new time" : "Propose visit"}</button>
      </div>
    </BottomSheet>
  );
}

function ReportSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (reason: string, note?: string) => void }) {
  const reasons = ["Spam", "Abusive language", "Fraud attempt", "Asking for payment off-platform", "Fake identity"];
  const [reason, setReason] = useState(reasons[0]);
  const [note, setNote] = useState("");
  return (
    <BottomSheet open={open} onClose={onClose} title="Report">
      <div className="p-4">
        {reasons.map((r) => (
          <button key={r} onClick={() => setReason(r)} className="flex w-full items-center gap-3 border-b border-divider py-2.5 text-left text-15 text-ink-primary">
            <span className={cn("grid h-5 w-5 place-items-center rounded-full border", reason === r ? "border-accent" : "border-border")}>{reason === r && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}</span>{r}
          </button>
        ))}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note (optional)" className="mt-3 w-full rounded-8 bg-surface-2 p-3 text-15 text-ink-primary outline-none" />
        <button onClick={() => onSubmit(reason, note)} className="mt-3 h-11 w-full rounded-8 bg-error text-15 font-semibold text-ink-inverse">Submit Report</button>
      </div>
    </BottomSheet>
  );
}

/**
 * The thread's twin: subject strip, then alternating bubbles. It draws the
 * subject header too, because that is the tallest thing on the screen — without
 * it the bubbles jumped down the moment the payload landed.
 */
function ThreadSkeleton({ base, onBack }: { base: string; onBack: () => void }) {
  return (
    <AppShell showNav={false} header={
      <Header
        left={<button aria-label="Back" onClick={onBack} className="grid h-11 w-11 place-items-center -ml-2"><Icon name="arrow-left" size={24} className="text-ink-primary" /></button>}
        title={<span className="flex items-center gap-2"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-3.5 w-28" /></span>}
      />}>
      <div className="border-b border-border bg-surface-2 px-3 py-2.5">
        <div className="flex gap-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-8" />
          <div className="flex-1 space-y-2 pt-0.5"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/3" /></div>
        </div>
        <Skeleton className="mt-2 h-3 w-1/2" />
      </div>
      <div className="space-y-3 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className={cn("h-10 rounded-16", i % 2 ? "ml-auto w-2/5" : "w-1/2")} />
        ))}
      </div>
    </AppShell>
  );
}
function NotFound({ base, onBack }: { base: string; onBack: () => void }) {
  return <AppShell showNav={false} header={<Header left={<button onClick={onBack} className="grid h-11 w-11 place-items-center -ml-2"><Icon name="arrow-left" size={24} /></button>} title="Chat" />}><div className="flex flex-col items-center pt-24 text-center"><p className="text-15 text-ink-secondary">{`This chat isn't available.`}</p></div></AppShell>;
}

function dayKey(iso: string) { return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }); }
function dayLabel(iso: string) {
  const d = new Date(iso); const today = new Date(); const y = new Date(); y.setDate(y.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(y.toISOString())) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
function fmtTime(t: string) { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const hh = h % 12 || 12; return `${hh}:${m.toString().padStart(2, "0")} ${ap}`; }

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Avatar, VerifiedBadge, BottomSheet, ConfirmDialog, Skeleton, useToast } from "@/components";
import { Glyph } from "./glyphs";
import { chatApi, type InboxSection } from "@/lib/chat/client";
import { subscribeChat } from "@/lib/chat/realtime-client";
import { inboxTopic } from "@/lib/chat/realtime-topics";
import { cn } from "@/lib/utils";

/**
 * P7 S1 — Messages Home, rebuilt as a list of SUBJECTS rather than of people.
 *
 * The screen answers "what is this chat about?" before "who is it with?", which
 * is the only question that matters when you have five flats, a requirement and
 * three projects running at once. Two sections, and a thread is in exactly one:
 *
 *   Received — someone wrote to MY listing / project / requirement  (arrow in)
 *   Sent     — I wrote to SOMEONE ELSE'S post                       (arrow out)
 *
 * Everything drawn here is a server query (`/chat/inbox`): the grouping, the
 * per-card sentence, both segment counts, unread, state chips. The client
 * decides nothing — see CLAUDE.md's backend lock.
 *
 * Titles are never truncated (that is the whole point of a subject-first card):
 * they wrap, and the meta line wraps with them.
 */

// The two section labels live here so they can be renamed in one place.
const SECTIONS: { key: InboxSection; label: string }[] = [
  { key: "received", label: "Received" },
  { key: "sent", label: "Sent" },
];

/** Colour = kind. Learned once, then never read again. */
const KIND = {
  listing: { chip: "bg-accent-soft text-accent", spine: "bg-accent", ink: "text-accent", label: "Property" },
  project: { chip: "bg-info-soft text-info", spine: "bg-info", ink: "text-info", label: "Project" },
  requirement: { chip: "bg-warning-soft text-warning", spine: "bg-warning", ink: "text-warning", label: "Requirement" },
} as const;

type Kind = keyof typeof KIND;

const EMPTY: Record<InboxSection, { glyph: any; title: string; sub: string; cta: string; href: string }> = {
  received: {
    glyph: "inbox", title: "No one has written to you yet",
    sub: "When someone messages about your property, requirement or project, it lands here",
    cta: "Boost a listing", href: "/boost/new",
  },
  sent: {
    glyph: "paper-plane", title: "You haven't contacted anyone",
    sub: "Ask about a property or answer someone's requirement — those chats live here",
    cta: "Explore properties", href: "/",
  },
};

export function Messages({ base = "/messages", meId, seller = false }: { base?: string; meId?: string; seller?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [section, setSection] = useState<InboxSection>("received");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const [rowSheet, setRowSheet] = useState<any>(null);
  const [deleteRow, setDeleteRow] = useState<any>(null);
  const [typing, setTyping] = useState<Set<string>>(new Set());
  const typingTimers = useRef<Record<string, any>>({});

  const markTyping = useCallback((threadId: string) => {
    setTyping((s) => new Set(s).add(threadId));
    clearTimeout(typingTimers.current[threadId]);
    typingTimers.current[threadId] = setTimeout(() => setTyping((s) => { const n = new Set(s); n.delete(threadId); return n; }), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await chatApi.inbox(section, { q: q.trim() || undefined });
    if (res.ok) { setData(res.data); setOffline(false); setFailed(false); }
    else if (res.error.code === "OFFLINE") setOffline(true);
    else setFailed(true);
    setLoading(false);
  }, [section, q]);

  useEffect(() => { load(); }, [load]);

  /**
   * Switching section drops the cards we are holding, so the skeleton shows
   * while the new section loads. Without this the screen kept the OTHER
   * section's cards on screen for the length of the fetch — Received's chats
   * sat under a highlighted "Sent" tab, which reads as wrong data rather than
   * as loading. The counts stay (both are in every payload) so the segment
   * itself never flickers.
   */
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setData((d: any) => (d ? { ...d, groups: null, counts: d.counts } : d));
  }, [section]);

  // Live: a Realtime ping on this user's inbox refetches. Focus + poll stay as
  // the fallback for a dropped socket.
  useEffect(() => {
    if (!meId) return;
    const ch = subscribeChat(inboxTopic(meId), { onRefresh: () => load(), onTyping: (p) => p?.threadId && markTyping(p.threadId) });
    return ch.unsubscribe;
  }, [meId, load, markTyping]);
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(t); };
  }, [load]);

  // `groups === null` means "loading a different section" (see the effect
  // above); `[]` means the server really answered with nothing.
  const groups: any[] | null = data?.groups ?? null;
  const counts = data?.counts ?? { received: { chats: 0, unread: 0 }, sent: { chats: 0, unread: 0 } };
  const requests = data?.requests;

  async function rowAction(row: any, action: "mute" | "read" | "archive" | "delete") {
    setRowSheet(null);
    if (action === "delete") { setDeleteRow(row); return; }
    if (action === "read") { await chatApi.read(row.threadId); toast.show("Marked as read"); load(); return; }
    if (action === "mute") { await chatApi.setState(row.threadId, { muted: !row.muted }); toast.show(row.muted ? "Unmuted" : "Muted"); load(); return; }
    if (action === "archive") { await chatApi.setState(row.threadId, { archived: true }); toast.show("Chat archived"); load(); return; }
  }

  const header = (
    <Header
      left={searching ? undefined : <span className="text-20 font-bold text-ink-primary">Messages</span>}
      title={undefined}
      right={
        searching ? (
          <div className="flex w-full items-center gap-2">
            <Icon name="search" size={20} className="text-ink-tertiary" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search people or properties…"
              className="min-w-0 flex-1 bg-transparent text-15 text-ink-primary outline-none placeholder:text-ink-tertiary"
            />
            <button aria-label="Close search" onClick={() => { setSearching(false); setQ(""); }} className="grid h-11 w-11 place-items-center"><Icon name="close" size={22} className="text-ink-primary" /></button>
          </div>
        ) : (
          <>
            <button aria-label="Search" onClick={() => setSearching(true)} className="grid h-11 w-11 place-items-center"><Icon name="search" size={24} className="text-ink-primary" /></button>
            <button aria-label="More" onClick={() => setMenu(true)} className="grid h-11 w-11 place-items-center"><Icon name="more" size={24} className="text-ink-primary" /></button>
          </>
        )
      }
      className={searching ? "[&>div]:pr-2" : undefined}
    />
  );

  return (
    <AppShell header={header} navItems={navFor(base, seller)}>
      {/* ── the only switch on the screen ───────────────────────────────── */}
      <div className="sticky top-0 z-sticky border-b border-divider bg-surface-1 px-3 pb-3 pt-1">
        <div className="flex gap-1 rounded-12 bg-surface-2 p-1">
          {SECTIONS.map((s) => {
            const active = s.key === section;
            const c = counts[s.key];
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                aria-pressed={active}
                className={cn(
                  "flex-1 rounded-8 py-2 text-center transition-colors",
                  active ? "bg-surface-1 shadow-l1" : "active:bg-surface-3",
                )}
              >
                <span className={cn("block text-15 font-semibold", active ? "text-ink-primary" : "text-ink-secondary")}>{s.label}</span>
                <span className={cn("mt-0.5 block text-11", active && c.unread > 0 ? "font-semibold text-accent" : "text-ink-tertiary")}>
                  {c.unread > 0 ? `${c.unread} unread` : `${c.chats} chat${c.chats === 1 ? "" : "s"}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {offline && (
        <div className="flex items-center justify-between bg-warning-soft px-4 py-2 text-13 text-warning">
          <span className="flex items-center gap-2"><Icon name="wifi-off" size={16} /> {`You're offline`}</span>
          <button onClick={load} className="font-semibold">Retry</button>
        </div>
      )}

      <div className="min-h-full bg-surface-2 pb-nav-safe pt-3">
        {/* new requests — pending threads on my posts, not yet accepted */}
        {section === "received" && requests?.total > 0 && !searching && (
          <button
            onClick={() => router.push(`${base}/requests`)}
            className="mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-12 border border-dashed border-accent bg-surface-1 px-3 py-2.5 text-left active:bg-surface-2"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Glyph name="envelope" s={19} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-15 font-semibold text-ink-primary">
                {requests.total} new {requests.total === 1 ? "person wants" : "people want"} to chat
              </span>
              <span className="block text-11 text-ink-tertiary">Accept to open the conversation</span>
            </span>
            <Icon name="chevron-right" size={20} className="shrink-0 text-ink-tertiary" />
          </button>
        )}

        {(loading && !data) || groups === null ? (
          <CardSkeletons />
        ) : failed ? (
          <div className="flex flex-col items-center px-8 pt-16 text-center">
            <span className="mb-3 text-ink-tertiary"><Icon name="alert" size={48} /></span>
            <h2 className="text-17 font-semibold text-ink-primary">Couldn&apos;t load your messages</h2>
            <p className="mt-1 text-13 text-ink-secondary">The server didn&apos;t answer. Nothing has been lost.</p>
            <button onClick={load} className="mt-5 h-11 rounded-8 bg-accent px-6 text-15 font-semibold text-ink-inverse active:bg-accent-pressed">Retry</button>
          </div>
        ) : groups.length === 0 ? (
          <Empty section={section} searching={!!q.trim()} onCta={(h) => router.push(h)} />
        ) : (
          groups.map((g) => (
            <SubjectCard
              key={g.key}
              g={g}
              typing={typing}
              onOpenSubject={() => g.subject.href && router.push(g.subject.href)}
              onOpenChat={(id: string) => router.push(`${base}/${id}`)}
              onLongPress={(r: any) => setRowSheet(r)}
            />
          ))
        )}
      </div>

      {/* ⋯ menu — three items, all of them real screens */}
      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Messages">
        <div className="pb-2">
          <SheetRow label="Mark all as read" onClick={async () => { setMenu(false); await chatApi.readAll(); toast.show("All marked as read"); load(); }} />
          <SheetRow label="Archived chats" onClick={() => { setMenu(false); router.push(`${base}/archived`); }} />
          <SheetRow label="Blocked users" onClick={() => { setMenu(false); router.push(`${base}/blocked`); }} />
        </div>
      </BottomSheet>

      {/* row long-press — three actions, the ones people actually use */}
      <BottomSheet open={!!rowSheet} onClose={() => setRowSheet(null)} title={rowSheet?.person?.name}>
        {rowSheet && (
          <div className="pb-2">
            {rowSheet.unread > 0 && <SheetRow label="Mark as read" onClick={() => rowAction(rowSheet, "read")} />}
            <SheetRow label={rowSheet.muted ? "Unmute notifications" : "Mute notifications"} onClick={() => rowAction(rowSheet, "mute")} />
            <SheetRow label="Archive chat" onClick={() => rowAction(rowSheet, "archive")} />
            <SheetRow label="Delete chat" danger onClick={() => rowAction(rowSheet, "delete")} />
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={!!deleteRow} onClose={() => setDeleteRow(null)}
        onConfirm={async () => { const r = deleteRow; setDeleteRow(null); await chatApi.deleteThread(r.threadId); toast.show("Chat deleted"); load(); }}
        title="Delete this chat?" consequence="This can't be undone." destructive confirmLabel="Delete"
      />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
/** One subject — a property, a project or a requirement — and its conversations. */
function SubjectCard({ g, typing, onOpenSubject, onOpenChat, onLongPress }: {
  g: any; typing: Set<string>;
  onOpenSubject: () => void;
  onOpenChat: (threadId: string) => void;
  onLongPress: (row: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const k = KIND[(g.subject.kind as Kind) ?? "listing"];
  const rows = expanded ? g.rows : g.rows.slice(0, 2);
  const hidden = g.rows.length - rows.length;

  return (
    <article className="relative mx-3 mb-3 overflow-hidden rounded-16 bg-surface-1 shadow-l1">
      {/* colour spine = what kind of post this is */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", k.spine)} />

      {/* the subject itself — tapping it opens the real post */}
      <button
        onClick={onOpenSubject}
        disabled={!g.subject.href}
        className="flex w-full items-start gap-3 py-3 pl-4 pr-3 text-left active:bg-surface-2 disabled:active:bg-transparent"
      >
        <Thumb subject={g.subject} kind={k} />
        <span className="min-w-0 flex-1">
          {/* NEVER truncated — a subject card whose subject is cut is pointless */}
          <span className="block break-words text-15 font-semibold leading-snug text-ink-primary">{g.subject.title}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-11 text-ink-tertiary">
            <span className={cn("rounded-4 px-1.5 py-0.5 text-11 font-semibold uppercase tracking-wide", k.chip)}>{k.label}</span>
            {g.subject.priceLabel && <span className="font-semibold text-ink-secondary">{g.subject.priceLabel}</span>}
            {/* The separator belongs to the piece BEFORE it, so a card with no
                price never opens with a stray "·". */}
            {[g.subject.meta, g.subject.gone ? "no longer live" : null].filter(Boolean).map((bit, i) => (
              <span key={i}>{i === 0 && !g.subject.priceLabel ? bit : `· ${bit}`}</span>
            ))}
          </span>
        </span>
        {g.subject.href ? <Icon name="chevron-right" size={18} className="mt-1 shrink-0 text-ink-tertiary" /> : null}
      </button>

      {/* the one sentence that explains the card */}
      <p className={cn("flex items-start gap-1.5 pb-2.5 pl-4 pr-3 text-13 font-semibold", g.direction === "in" ? k.ink : "text-ink-secondary")}>
        <DirectionArrow inbound={g.direction === "in"} />
        <span className="min-w-0">
          {g.summary}
          {g.detail && <span className="font-normal text-ink-tertiary"> · {g.detail}</span>}
        </span>
      </p>

      {/* the people */}
      <div>
        {rows.map((r: any) => (
          <ChatRow key={r.threadId} r={r} typing={typing.has(r.threadId)} sent={g.direction === "out"} onOpen={() => onOpenChat(r.threadId)} onLong={() => onLongPress(r)} />
        ))}
      </div>

      {hidden > 0 && (
        <button onClick={() => setExpanded(true)} className="w-full border-t border-divider py-2.5 text-13 font-semibold text-ink-secondary active:bg-surface-2">
          {hidden} more {hidden === 1 ? "chat" : "chats"} on this {k.label.toLowerCase()}
        </button>
      )}
      {expanded && g.rows.length > 2 && (
        <button onClick={() => setExpanded(false)} className="w-full border-t border-divider py-2.5 text-13 font-semibold text-ink-secondary active:bg-surface-2">
          Show less
        </button>
      )}
    </article>
  );
}

/** The subject's own photo. A requirement has none by nature — it gets a pin. */
function Thumb({ subject, kind }: { subject: any; kind: (typeof KIND)[Kind] }) {
  if (subject.cover) {
    return <img src={subject.cover} alt="" className="h-16 w-16 shrink-0 rounded-12 bg-surface-2 object-cover" />;
  }
  if (subject.kind === "requirement") {
    return (
      <span className={cn("grid h-16 w-16 shrink-0 place-items-center rounded-12 border border-dashed", kind.chip)}>
        <Icon name="search-list" size={26} />
      </span>
    );
  }
  return (
    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-12 bg-surface-2 text-ink-tertiary">
      <Icon name={subject.kind === "project" ? "building" : "home"} size={26} />
    </span>
  );
}

/** ↙ they came to me · ↗ I went to them. */
function DirectionArrow({ inbound }: { inbound: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
      {inbound ? <path d="M17 7L7 17M7 17h7M7 17v-7" /> : <path d="M7 17L17 7M17 7h-7M17 7v7" />}
    </svg>
  );
}

function ChatRow({ r, typing, sent, onOpen, onLong }: { r: any; typing: boolean; sent: boolean; onOpen: () => void; onLong: () => void }) {
  const longTimer = useRef<any>(null);
  const moved = useRef(false);

  // A state chip only where it tells you something you don't already know. In
  // Received, "Accepted" is just a record of your own tap — it went on every
  // row and said nothing; in Sent it is the answer you were waiting for.
  const state = r.pending
    ? { label: sent ? "Waiting to be accepted" : "New", cls: "bg-warning-soft text-warning" }
    : r.declined
      ? { label: "Declined", cls: "bg-error-soft text-error" }
      : sent && r.proposalStatus === "accepted"
        ? { label: "Accepted", cls: "bg-accent-soft text-accent" }
        : null;

  return (
    <button
      onClick={onOpen}
      onPointerDown={() => { moved.current = false; longTimer.current = setTimeout(() => { if (!moved.current) onLong(); }, 500); }}
      onPointerMove={() => { moved.current = true; clearTimeout(longTimer.current); }}
      onPointerUp={() => clearTimeout(longTimer.current)}
      onPointerLeave={() => clearTimeout(longTimer.current)}
      onContextMenu={(e) => { e.preventDefault(); onLong(); }}
      className="flex w-full items-start gap-3 border-t border-divider py-2.5 pl-4 pr-3 text-left active:bg-surface-2"
    >
      <Avatar src={r.person.photo} name={r.person.name} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn("text-15 text-ink-primary", r.unread > 0 ? "font-bold" : "font-semibold")}>{r.person.name}</span>
          {r.person.verified && <VerifiedBadge level="id" />}
          <span className="text-11 uppercase tracking-wide text-ink-tertiary">{r.person.roleTag}</span>
          {state && <span className={cn("rounded-4 px-1.5 py-0.5 text-11 font-semibold", state.cls)}>{state.label}</span>}
          {r.muted && <Glyph name="bell-off" s={13} className="text-ink-tertiary" />}
          <span className="ml-auto shrink-0 text-11 text-ink-tertiary">{r.timeLabel}</span>
        </span>
        <span className={cn("mt-0.5 line-clamp-2 text-13", typing ? "italic text-accent" : r.unread > 0 ? "font-medium text-ink-primary" : "text-ink-secondary")}>
          {typing ? "Typing…" : (
            <>
              {r.previewOwn && <span className="text-ink-tertiary">You: </span>}
              {r.preview}
            </>
          )}
        </span>
      </span>
      {r.unread > 0 && (
        <span className="mt-1 grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-11 font-bold text-ink-inverse">{r.unread}</span>
      )}
    </button>
  );
}

function Empty({ section, searching, onCta }: { section: InboxSection; searching: boolean; onCta: (href: string) => void }) {
  if (searching) {
    return (
      <div className="flex flex-col items-center px-8 pt-16 text-center">
        <span className="mb-3 text-ink-tertiary"><Icon name="search" size={44} /></span>
        <h2 className="text-17 font-semibold text-ink-primary">Nothing matched</h2>
        <p className="mt-1 text-13 text-ink-secondary">Try a person&apos;s name or a property title.</p>
      </div>
    );
  }
  const e = EMPTY[section];
  return (
    <div className="flex flex-col items-center px-8 pt-16 text-center">
      <span className="mb-4 text-ink-tertiary"><Glyph name={e.glyph} s={64} /></span>
      <h2 className="text-17 font-semibold text-ink-primary">{e.title}</h2>
      <p className="mt-1 text-13 text-ink-secondary">{e.sub}</p>
      <button onClick={() => onCta(e.href)} className="mt-5 h-11 rounded-8 bg-accent px-6 text-15 font-semibold text-ink-inverse active:bg-accent-pressed">{e.cta}</button>
    </div>
  );
}

/**
 * The card's own twin — same 64px thumb, same two title lines, same chat row —
 * so nothing moves when the data lands (Doc1 §11, no layout shift). Uses the
 * design system's `Skeleton`, which carries the shimmer; the grey blocks this
 * screen shipped with read as broken content rather than as loading.
 */
function CardSkeletons() {
  return (
    <div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="mx-3 mb-3 overflow-hidden rounded-16 bg-surface-1 shadow-l1">
          <div className="flex gap-3 py-3 pl-4 pr-3">
            <Skeleton className="h-16 w-16 shrink-0 rounded-12" />
            <div className="flex-1 space-y-2 pt-0.5">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
          <Skeleton className="mb-2.5 ml-4 h-3 w-1/2" />
          <div className="flex items-center gap-3 border-t border-divider py-2.5 pl-4 pr-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SheetRow({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={cn("flex h-12 w-full items-center px-4 text-left text-15", danger ? "text-error" : "text-ink-primary")}>{label}</button>;
}

// Host-visible (bare) paths — middleware maps them to the right route group per
// subdomain. Seller's home tab is their Listings dashboard; public's is the feed.
function navFor(base: string, seller: boolean) {
  return [
    { name: "nav-home" as const, href: seller ? "/listings" : "/", label: "Home", match: (p: string) => p === (seller ? "/listings" : "/") },
    { name: "nav-search" as const, href: "/search", label: "Search", match: (p: string) => p.includes("/search") },
    { name: "nav-create" as const, href: "/create", label: "Create", match: (p: string) => p.includes("/create") },
    { name: "nav-message" as const, href: base, label: "Messages", match: (p: string) => p.includes("/messages") },
    { name: "nav-profile" as const, href: "/profile", label: "Profile", match: (p: string) => p.includes("/profile") },
  ];
}

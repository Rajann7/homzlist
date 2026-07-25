"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Avatar, VerifiedBadge, BottomSheet, ConfirmDialog, useToast } from "@/components";
import { Glyph } from "./glyphs";
import { chatApi, type Tab } from "@/lib/chat/client";
import { subscribeChat } from "@/lib/chat/realtime-client";
import { inboxTopic } from "@/lib/chat/realtime-topics";
import { cn } from "@/lib/utils";

/**
 * P7 S1 — Messages Home (4 tabs). Every row, badge, filter and preview is a real
 * server query (chatApi). Grouping / unread-only / search / pin-mute-archive-
 * delete-block all persist through the API — no local business state.
 */

const TABS: { key: Tab; label: string }[] = [
  { key: "my-listings", label: "My Listings" },
  { key: "my-inquiries", label: "My Inquiries" },
  { key: "requirement-leads", label: "Requirement Leads" },
  { key: "my-responses", label: "My Responses" },
];

// Hrefs are the host-VISIBLE paths (bare, no "/seller" prefix). middleware.ts
// rewrites seller.host/X → the (seller) route group, so a literal "/seller/…"
// here double-prefixes to /seller/seller/… → 404 (Doc6 §4).
const EMPTY: Record<Tab, { glyph: any; title: string; sub: string; cta: string; href: string }> = {
  "my-listings": { glyph: "inbox", title: "No inquiries yet", sub: "Boost your listing to reach more buyers", cta: "Boost Listing", href: "/boost/new" },
  "my-inquiries": { glyph: "paper-plane", title: "You haven't inquired on anything", sub: "Explore properties and send your first inquiry", cta: "Explore Properties", href: "/" },
  "requirement-leads": { glyph: "megaphone", title: "No proposals yet", sub: "Boost your requirement so more brokers see it", cta: "Boost Requirement", href: "/requirements/mine" },
  "my-responses": { glyph: "handshake", title: "No proposals sent", sub: "Browse requirements and offer your properties", cta: "Browse Requirements", href: "/requirements" },
};

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  all: { label: "All", cls: "bg-surface-2 text-ink-secondary" },
  pending: { label: "Pending", cls: "bg-surface-2 text-ink-secondary" },
  accepted: { label: "Accepted", cls: "bg-accent-soft text-accent" },
  declined: { label: "Declined", cls: "bg-error-soft text-error" },
  not_relevant: { label: "Declined", cls: "bg-error-soft text-error" },
  expired: { label: "Expired", cls: "bg-surface-3 text-ink-tertiary" },
  fulfilled: { label: "Fulfilled", cls: "bg-surface-3 text-ink-tertiary" },
};

export function Messages({ base = "/messages", meId, seller = false }: { base?: string; meId?: string; seller?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("my-listings");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const [rowSheet, setRowSheet] = useState<any>(null);
  const [deleteRow, setDeleteRow] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reqSummary, setReqSummary] = useState<{ total: number; verified: number; others: number } | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Set<string>>(new Set());
  const typingTimers = useRef<Record<string, any>>({});
  const markTyping = useCallback((threadId: string) => {
    setTyping((s) => new Set(s).add(threadId));
    clearTimeout(typingTimers.current[threadId]);
    typingTimers.current[threadId] = setTimeout(() => setTyping((s) => { const n = new Set(s); n.delete(threadId); return n; }), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await chatApi.threads(tab, { grouping, unread: unreadOnly, q: q.trim() || undefined });
    if (res.ok) {
      setData(res.data);
      setReqSummary(res.data.requests);
      setOffline(false);
    } else if (res.error.code === "OFFLINE") setOffline(true);
    setLoading(false);
  }, [tab, grouping, unreadOnly, q]);

  useEffect(() => { load(); }, [load]);
  // Live: Supabase Realtime broadcast pings this user's inbox on any new/updated
  // thread → refetch. The focus-refresh + poll below stay as a fallback.
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

  const rows: any[] = data?.grouped ? [] : data?.rows ?? [];
  const groups: any[] = data?.grouped ? data?.groups ?? [] : [];
  const filteredRows = tab === "my-responses" && statusFilter !== "all" ? rows.filter((r) => (r.proposalStatus ?? "pending") === statusFilter) : rows;
  const statusCounts = data?.statusCounts;

  function toggleCheck(id: string) {
    setBulkMode(true);
    setChecked((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function exitBulk() { setBulkMode(false); setChecked(new Set()); }

  async function bulkAction(action: "read" | "archive" | "mute" | "delete") {
    const ids = [...checked];
    if (!ids.length) { exitBulk(); return; }
    exitBulk();
    await Promise.all(ids.map((id) =>
      action === "read" ? chatApi.read(id)
      : action === "archive" ? chatApi.setState(id, { archived: true })
      : action === "mute" ? chatApi.setState(id, { muted: true })
      : chatApi.deleteThread(id),
    ));
    toast.show(action === "read" ? "Marked as read" : action === "archive" ? `${ids.length} archived` : action === "mute" ? `${ids.length} muted` : `${ids.length} deleted`);
    load();
  }

  async function rowAction(row: any, action: "pin" | "mute" | "read" | "archive" | "block" | "delete") {
    setRowSheet(null);
    if (action === "delete") { setDeleteRow(row); return; }
    if (action === "read") { await chatApi.read(row.threadId); toast.show("Marked as read"); load(); return; }
    if (action === "block") { await chatApi.block(row.threadId, "block"); toast.show(`Blocked ${row.person.name}`, { variant: "success" }); load(); return; }
    if (action === "pin") { await chatApi.setState(row.threadId, { pinned: !row.pinned }); toast.show(row.pinned ? "Unpinned" : "Chat pinned"); load(); return; }
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
              placeholder="Search chats or properties…"
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

  const bulkHeader = (
    <Header
      left={<button aria-label="Exit selection" onClick={exitBulk} className="grid h-11 w-11 place-items-center -ml-2"><Icon name="close" size={24} className="text-ink-primary" /></button>}
      title={<span className="text-17 font-semibold text-ink-primary">{checked.size} selected</span>}
      right={
        <>
          <button aria-label="Mark read" onClick={() => bulkAction("read")} className="grid h-11 w-11 place-items-center"><Icon name="check" size={22} className="text-ink-primary" /></button>
          <button aria-label="Mute" onClick={() => bulkAction("mute")} className="grid h-11 w-11 place-items-center text-ink-primary"><Glyph name="bell-off" s={20} /></button>
          <button aria-label="Archive" onClick={() => bulkAction("archive")} className="grid h-11 w-11 place-items-center text-ink-primary"><Glyph name="archive" s={20} /></button>
          <button aria-label="Delete" onClick={() => bulkAction("delete")} className="grid h-11 w-11 place-items-center text-error"><Icon name="trash" size={20} /></button>
        </>
      }
    />
  );

  return (
    <AppShell header={bulkMode ? bulkHeader : header} navItems={navFor(base, seller)}>
      {/* Tabs */}
      <div className="sticky top-0 z-sticky border-b border-border bg-surface-1">
        <div className="no-scrollbar flex overflow-x-auto">
          {TABS.map((t) => {
            const active = t.key === tab;
            const count = tabUnread(data, t.key);
            return (
              <button key={t.key} onClick={() => { setTab(t.key); setStatusFilter("all"); }}
                className={cn("relative shrink-0 whitespace-nowrap px-4 py-3 text-15 font-semibold transition-colors", active ? "text-ink-primary" : "text-ink-tertiary")}>
                <span className="flex items-center gap-1.5">
                  {t.label}
                  {active && count > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-11 font-semibold text-white">{count}</span>}
                  {!active && count > 0 && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                </span>
                {active && <span className="absolute inset-x-3 bottom-0 h-[1.5px] rounded-full bg-accent" />}
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

      {/* Requests row */}
      {reqSummary && reqSummary.total > 0 && !searching && (
        <button onClick={() => router.push(`${base}/requests`)} className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 rounded-8 bg-surface-2 px-3 py-2.5 text-left active:bg-surface-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-1 text-ink-primary"><Glyph name="envelope" s={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-15 font-semibold text-ink-primary">Message requests <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-11 font-semibold text-white">{reqSummary.total}</span></span>
            <span className="block text-11 text-ink-tertiary">{reqSummary.verified} verified · {reqSummary.others} other{reqSummary.others === 1 ? "" : "s"}</span>
          </span>
          <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
        </button>
      )}

      {/* Controls row */}
      {!searching && (
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => setUnreadOnly((v) => !v)} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-13 font-medium transition-colors", unreadOnly ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-secondary")}>
            <span className="h-2 w-2 rounded-full bg-current" /> Unread only
          </button>
          <button aria-label="Toggle grouping" onClick={() => setGrouping((v) => !v)} className="grid h-9 w-9 place-items-center rounded-8 bg-surface-2 text-ink-secondary">
            <Glyph name={grouping ? "list" : "folder"} s={18} />
          </button>
        </div>
      )}

      {/* Tab-4 status strip */}
      {tab === "my-responses" && statusCounts && !searching && (
        <div className="no-scrollbar -mt-1 flex gap-2 overflow-x-auto px-4 pb-3">
          {["all", "pending", "accepted", "declined", "expired"].map((s) => {
            const n = s === "all" ? statusCounts.all : statusCounts[s] ?? 0;
            if (s !== "all" && !n) return null;
            const active = statusFilter === s;
            return (
              <button key={s} onClick={() => setStatusFilter(s)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-13 font-medium", active ? "bg-ink-primary text-ink-inverse" : "bg-surface-2 text-ink-secondary")}>
                {STATUS_CHIP[s].label} {n}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {loading && !data ? (
        <ListSkeleton />
      ) : data?.grouped ? (
        groups.length === 0 ? <Empty tab={tab} onCta={(h) => router.push(h)} /> : (
          <div className="pb-nav-safe">{groups.map((g) => <Group key={g.key} g={g} base={base} onOpen={(id) => router.push(`${base}/${id}`)} />)}</div>
        )
      ) : filteredRows.length === 0 ? (
        <Empty tab={tab} onCta={(h) => router.push(h)} />
      ) : (
        <div className="pb-nav-safe">
          {filteredRows.map((r) => (
            <ChatRow key={r.threadId} r={r} tab={tab} typing={typing.has(r.threadId)}
              bulkMode={bulkMode} isChecked={checked.has(r.threadId)} onToggleCheck={() => toggleCheck(r.threadId)}
              onOpen={() => router.push(`${base}/${r.threadId}`)}
              onLong={() => setRowSheet(r)}
              onSwipeAction={(a) => rowAction(r, a)} />
          ))}
        </div>
      )}

      {/* ⋯ menu sheet */}
      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Messages">
        <div className="pb-2">
          <SheetRow label="Select chats" onClick={() => { setMenu(false); setBulkMode(true); }} />
          <SheetRow label="Mark all as read" onClick={async () => { setMenu(false); await chatApi.readAll(); toast.show("All marked as read"); load(); }} />
          <SheetRow label="Archived chats" onClick={() => { setMenu(false); router.push(`${base}/archived`); }} />
          <SheetRow label="Blocked users" onClick={() => { setMenu(false); router.push(`${base}/blocked`); }} />
        </div>
      </BottomSheet>

      {/* Row long-press sheet */}
      <BottomSheet open={!!rowSheet} onClose={() => setRowSheet(null)} title={rowSheet?.person?.name}>
        {rowSheet && (
          <div className="pb-2">
            <SheetRow label={rowSheet.pinned ? "Unpin chat" : "Pin chat"} onClick={() => rowAction(rowSheet, "pin")} />
            <SheetRow label={rowSheet.muted ? "Unmute notifications" : "Mute notifications"} onClick={() => rowAction(rowSheet, "mute")} />
            <SheetRow label="Mark as read" onClick={() => rowAction(rowSheet, "read")} />
            <SheetRow label="Archive" onClick={() => rowAction(rowSheet, "archive")} />
            <SheetRow label="Block user" danger onClick={() => rowAction(rowSheet, "block")} />
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
function ChatRow({ r, tab, onOpen, onLong, onSwipeAction, bulkMode = false, isChecked = false, onToggleCheck, typing = false }: { r: any; tab: Tab; onOpen: () => void; onLong: () => void; onSwipeAction: (a: "archive" | "mute" | "delete") => void; bulkMode?: boolean; isChecked?: boolean; onToggleCheck?: () => void; typing?: boolean }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const longTimer = useRef<any>(null);
  const moved = useRef(false);

  const onDown = (x: number, y: number) => { if (bulkMode) return; start.current = { x, y }; moved.current = false; longTimer.current = setTimeout(() => { if (!moved.current) onLong(); }, 500); };
  const onMove = (x: number, y: number) => {
    if (!start.current) return;
    const ddx = x - start.current.x, ddy = y - start.current.y;
    if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) { moved.current = true; clearTimeout(longTimer.current); }
    if (Math.abs(ddx) > Math.abs(ddy)) setDx(Math.max(-210, Math.min(0, ddx)));
  };
  const onUp = () => { clearTimeout(longTimer.current); setDx((d) => (d < -70 ? -210 : 0)); start.current = null; };

  const proposalBadge = tab === "my-responses" ? STATUS_CHIP[r.proposalStatus ?? "pending"] : null;
  return (
    <div className="relative overflow-hidden">
      {/* swipe action buttons (disabled in bulk mode) */}
      {!bulkMode && (
        <div className="absolute inset-y-0 right-0 flex">
          <button onClick={() => onSwipeAction("archive")} className="grid w-[70px] place-items-center bg-surface-3 text-ink-secondary"><Glyph name="archive" s={20} /></button>
          <button onClick={() => onSwipeAction("mute")} className="grid w-[70px] place-items-center bg-warning text-white"><Glyph name="bell-off" s={20} /></button>
          <button onClick={() => onSwipeAction("delete")} className="grid w-[70px] place-items-center bg-error text-white"><Icon name="trash" size={20} /></button>
        </div>
      )}
      <button
        onClick={() => (bulkMode ? onToggleCheck?.() : dx === 0 ? onOpen() : setDx(0))}
        onPointerDown={(e) => onDown(e.clientX, e.clientY)}
        onPointerMove={(e) => e.buttons && onMove(e.clientX, e.clientY)}
        onPointerUp={onUp}
        style={{ transform: `translateX(${bulkMode ? 0 : dx}px)` }}
        className="flex w-full items-center gap-3 border-b border-divider bg-page px-4 py-3 text-left transition-transform active:bg-surface-2"
      >
        {bulkMode && (
          <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", isChecked ? "border-accent bg-accent text-white" : "border-border")}>
            {isChecked && <Icon name="check" size={12} />}
          </span>
        )}
        <Avatar src={r.person.photo} name={r.person.name} size={48} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-15 font-semibold text-ink-primary">{r.person.name}</span>
            {r.person.verified && <VerifiedBadge level="id" />}
            <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-11 text-ink-secondary">{r.person.roleTag}</span>
            {r.pinned && <Icon name="pin" size={12} className="ml-auto text-ink-tertiary" />}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {!typing && r.previewKind === "photo" && <Icon name="image" size={14} className="shrink-0 text-ink-tertiary" />}
            <span className={cn("truncate text-13", typing ? "italic text-accent" : r.pending ? "text-warning" : "text-ink-tertiary")}>
              {typing ? "Typing…" : r.pending ? "Waiting for owner to accept" : r.declined ? "Inquiry declined" : r.preview}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-11 text-ink-tertiary">{r.timeLabel}</span>
          {proposalBadge ? (
            <span className={cn("rounded-4 px-1.5 py-0.5 text-11 font-semibold", proposalBadge.cls)}>{proposalBadge.label}</span>
          ) : r.pending ? <Icon name="clock" size={14} className="text-warning" />
          : r.unread > 0 ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-error px-1 text-11 font-semibold text-white">{r.unread}</span>
          : r.muted ? <Glyph name="bell-off" s={14} className="text-ink-tertiary" /> : null}
        </span>
      </button>
    </div>
  );
}

function Group({ g, base, onOpen }: { g: any; base: string; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="mx-4 my-2 flex w-[calc(100%-2rem)] items-center gap-3 rounded-8 bg-surface-2 px-3 py-2.5 text-left">
        {g.card?.cover ? <img src={g.card.cover} alt="" className="h-10 w-10 rounded-4 object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-4 bg-surface-3"><Icon name="home" size={18} className="text-ink-tertiary" /></span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-13 font-semibold text-ink-primary">{g.card?.title ?? "Other"}{g.card?.priceLabel ? ` — ${g.card.priceLabel}` : ""}</span>
          <span className="block text-11 text-ink-tertiary">{g.chatCount} chats · {g.unreadCount} unread</span>
        </span>
        <Icon name="chevron-down" size={18} className={cn("text-ink-tertiary transition-transform", open && "rotate-180")} />
      </button>
      {open && g.rows.map((r: any) => (
        <ChatRow key={r.threadId} r={r} tab={"my-listings"} onOpen={() => onOpen(r.threadId)} onLong={() => {}} onSwipeAction={() => {}} />
      ))}
    </div>
  );
}

function Empty({ tab, onCta }: { tab: Tab; onCta: (href: string) => void }) {
  const e = EMPTY[tab];
  return (
    <div className="flex flex-col items-center px-8 pt-20 text-center">
      <span className="mb-4 text-ink-tertiary"><Glyph name={e.glyph} s={72} /></span>
      <h2 className="text-17 font-semibold text-ink-primary">{e.title}</h2>
      <p className="mt-1 text-13 text-ink-secondary">{e.sub}</p>
      <button onClick={() => onCta(e.href)} className="mt-5 h-11 rounded-8 bg-accent px-6 text-15 font-semibold text-white active:bg-accent-pressed">{e.cta}</button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="pt-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-divider px-4 py-3">
          <div className="h-12 w-12 shrink-0 rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2"><div className="h-3 w-1/3 rounded bg-surface-2" /><div className="h-3 w-2/3 rounded bg-surface-2" /></div>
        </div>
      ))}
    </div>
  );
}

function SheetRow({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={cn("flex h-12 w-full items-center px-4 text-left text-15", danger ? "text-error" : "text-ink-primary")}>{label}</button>;
}

function tabUnread(data: any, key: Tab): number {
  // Only the active tab's data is loaded; badge shows its unread total.
  if (!data) return 0;
  if (data.grouped) return (data.groups ?? []).reduce((n: number, g: any) => n + g.unreadCount, 0);
  return (data.rows ?? []).reduce((n: number, r: any) => n + (r.unread > 0 ? 1 : 0), 0);
}

// Host-visible (bare) paths — middleware maps them to the right route group per
// subdomain. Seller's home tab is their Listings dashboard; public's is the feed.
function navFor(base: string, seller: boolean) {
  return [
    { name: "home" as const, href: seller ? "/listings" : "/", label: "Home", match: (p: string) => p === (seller ? "/listings" : "/") },
    { name: "search" as const, href: "/search", label: "Search", match: (p: string) => p.includes("/search") },
    { name: "plus" as const, href: "/create", label: "Create", match: (p: string) => p.includes("/create") },
    { name: "message" as const, href: base, label: "Messages", match: (p: string) => p.includes("/messages") },
    { name: "user" as const, href: "/profile", label: "Profile", match: (p: string) => p.includes("/profile") },
  ];
}

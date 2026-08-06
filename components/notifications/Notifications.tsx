"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Avatar, BottomSheet, ConfirmDialog, Button, Skeleton, useToast, type IconName } from "@/components";
import { SheetOption, BackButton } from "@/components/billing/primitives";
import { notificationsApi, boldSegments, type Inbox, type NotificationRow, type NotificationAction } from "@/lib/notifications/client";
import { pushState } from "@/lib/notifications/push-client";
import { EnableSheet } from "./EnableSheet";
import { cn } from "@/lib/utils";

/**
 * P11 S7 — Notifications (Doc4 §61).
 *
 * Rendered exactly as the prototype: appbar + ⋯ sheet (Mark all as read /
 * Notification settings / Clear all), the blocked-permission banner, the chip
 * bar, sticky TODAY / THIS WEEK / EARLIER group headers, rows with an avatar or
 * a tinted icon circle, an unread dot on an accent-soft row, inline action
 * buttons, an optional thumbnail, and swipe-left-to-dismiss with the collapse
 * animation.
 *
 * Nothing on this screen is local business state. The rows, the group each row
 * falls in, the chip counts, the unread flag, WHICH buttons a row offers and
 * whether it may still be acted on all come from the server; every tap is an
 * API call and the list re-reads the server's answer.
 */

const GROUPS: { key: "today" | "week" | "earlier"; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "earlier", label: "Earlier" },
];

// .ic-accent / .ic-warn / .ic-err / .ic-info / .ic-neutral from the prototype.
const TONE: Record<string, string> = {
  accent: "bg-accent-soft text-accent",
  warn: "bg-warning-soft text-warning",
  err: "bg-error-soft text-error",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-2 text-ink-secondary",
};

export function Notifications({ base = "" }: { base?: string }) {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<Inbox | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [menu, setMenu] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [howTo, setHowTo] = useState(false);
  // Rows mid-collapse — kept out of the DOM flow exactly like the prototype's
  // max-height/opacity transition, then dropped when the server list refreshes.
  const [closing, setClosing] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await notificationsApi.list(filter);
    if (res.ok) { setData(res.data); setOffline(false); }
    else if (res.error.code === "OFFLINE") setOffline(true);
    setLoading(false);
  }, [filter]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  // The blocked banner reflects the BROWSER's real permission state, which is a
  // browser fact rather than stored data — read it live, re-read on focus (the
  // user may have just changed it in site settings).
  useEffect(() => {
    const sync = () => setBlocked(pushState().permission === "denied");
    sync();
    const onVis = () => document.visibilityState === "visible" && (sync(), load());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const rows = (data?.rows ?? []).filter((r) => !closing.has(r.id));

  function collapse(id: string) {
    setClosing((s) => new Set(s).add(id));
    setTimeout(() => { void load(); setClosing((s) => { const n = new Set(s); n.delete(id); return n; }); }, 280);
  }

  async function onDismiss(id: string) {
    collapse(id);
    await notificationsApi.dismiss(id);
  }

  /**
   * Follow a row's deep link — but only ever to a path on THIS origin.
   * `href` is server-written today, yet a tap that can be pointed at an
   * absolute URL is one bad producer away from an open redirect, so the
   * renderer refuses anything that isn't a single-slash relative path.
   */
  function safeHref(href: string | null): string | null {
    if (!href || !href.startsWith("/") || href.startsWith("//")) return null;
    return `${base}${href}`;
  }

  async function onOpen(row: NotificationRow) {
    const target = safeHref(row.href);
    // A tap always DOES something: every type carries a target (migrations
    // 0129/0132), and the read state is written even on the rare row whose
    // link the server could not build — never an inert row.
    if (row.unread) { await notificationsApi.markRead(row.id); void load(); }
    if (target) router.push(target);
  }

  async function onAction(row: NotificationRow, action: NotificationAction) {
    const res = await notificationsApi.act(row.id, action.key);
    if (!res.ok) {
      // A state conflict means someone (or the other tab) already answered —
      // say so and re-read, rather than leaving a button that does nothing.
      if (res.error.code === "LISTING_STATE_LOCKED") {
        toast.show(res.error.alreadyTaken ? "Already done" : "This is no longer available");
        void load();
      } else {
        toast.show(res.error.code === "OFFLINE" ? "You're offline — try again" : "Couldn't do that");
      }
      return;
    }
    if (res.data.dismissed) collapse(row.id); else void load();
    if (res.data.toast) toast.show(res.data.toast);
  }

  /**
   * Navigation-only actions (Renew, Edit listing, View invoice…).
   *
   * These take the row's own href. A row that somehow has none must not leave
   * a button that silently does nothing, so it falls back to the row tap —
   * which at minimum marks it read.
   */
  function onNavAction(row: NotificationRow) {
    const target = safeHref(row.href);
    if (target) router.push(target);
    else void onOpen(row);
  }

  const right = (
    <button aria-label="More" onClick={() => setMenu(true)} className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2">
      <Icon name="more" size={22} />
    </button>
  );
  const header = <Header left={<BackButton fallback={`${base}/`} />} title="Notifications" centerTitle right={right} />;

  // ---- loading skeleton (the prototype's six-row shimmer) ------------------
  if (loading && !data) {
    return (
      <AppShell header={header}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5 pt-1">
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </AppShell>
    );
  }

  const empty = (data?.total ?? 0) === 0;

  return (
    <AppShell header={header}>
      {offline && (
        <div className="flex items-center justify-center gap-2 bg-ink-primary px-2 py-2 text-[12px] text-page">
          <Icon name="wifi-off" size={16} />
          You&apos;re offline — showing last saved data
        </div>
      )}

      {/* Blocked-permission banner — designs/P11 S7 */}
      {!offline && blocked && (
        <div className="flex items-start gap-2.5 bg-warning-soft p-3">
          <span className="self-center shrink-0 text-warning"><Icon name="alert" size={20} /></span>
          <div className="flex-1 self-center text-11 leading-[1.4] text-ink-secondary">
            Browser notifications are blocked — you&apos;ll miss instant alerts
          </div>
          <button onClick={() => setHowTo(true)} className="chrome self-center text-13 font-semibold text-accent">
            How to enable
          </button>
        </div>
      )}

      {empty ? (
        <div className="flex flex-col items-center gap-2 px-6 pb-0 pt-10 text-center">
          <div className="mb-2 text-ink-disabled"><Icon name="bell" size={96} strokeWidth={1.2} /></div>
          <h3 className="text-17 font-semibold text-ink-primary">No notifications</h3>
          <p className="text-13 text-ink-tertiary">Inquiries, approvals and match alerts will appear here</p>
        </div>
      ) : (
        <>
          {/* Chip bar — counts are server counts */}
          <div className="px-4 pb-2 pt-3">
            {/* `no-scrollbar` (globals.css) is the project's scrollbar-hiding
                utility — the prototype's `.chips` sets scrollbar-width:none +
                ::-webkit-scrollbar{display:none}. Scrolling is unchanged; only
                the bar is hidden. */}
            <div className="no-scrollbar flex gap-2 overflow-x-auto py-0.5">
              {(data?.chips ?? []).map((c) => (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key)}
                  className={cn(
                    "chrome inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-3.5 text-13 font-semibold",
                    "transition-colors duration-150 ease-out-quart active:scale-[0.98]",
                    filter === c.key ? "bg-ink-primary text-page" : "bg-surface-2 text-ink-secondary",
                  )}
                >
                  {c.label}
                  {c.count != null && <span>{c.count}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="pb-6">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <p className="text-13 text-ink-tertiary">Nothing here for this filter</p>
              </div>
            ) : (
              GROUPS.map(({ key, label }) => {
                const group = rows.filter((r) => r.group === key);
                if (!group.length) return null;
                return (
                  <div key={key}>
                    <div className="chrome sticky top-0 z-sticky bg-page px-4 pb-2 pt-4 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">
                      {label}
                    </div>
                    {group.map((row) => (
                      <NotifRow
                        key={row.id}
                        row={row}
                        onOpen={() => onOpen(row)}
                        onDismiss={() => onDismiss(row.id)}
                        onAction={(a) => (SERVER_ACTIONS.has(a.key) ? onAction(row, a) : onNavAction(row))}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ⋯ sheet */}
      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Notifications">
        <SheetOption
          label="Mark all as read"
          icon={<Icon name="check-circle" size={20} />}
          onClick={async () => {
            setMenu(false);
            const r = await notificationsApi.markAllRead();
            if (r.ok) { toast.show("All marked as read"); void load(); }
          }}
        />
        <SheetOption
          label="Notification settings"
          icon={<Icon name="bell" size={20} />}
          onClick={() => { setMenu(false); router.push(`${base}/settings/notifications`); }}
        />
        <SheetOption
          label="Clear all"
          icon={<Icon name="close" size={20} />}
          destructive
          onClick={() => { setMenu(false); setClearOpen(true); }}
        />
      </BottomSheet>

      {/* Clear-all double confirm */}
      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear all notifications?"
        body="This removes every notification. This can't be undone."
        confirmLabel="Clear all"
        destructive
        onConfirm={async () => {
          setClearOpen(false);
          const r = await notificationsApi.clearAll();
          if (r.ok) { toast.show("Notifications cleared"); void load(); }
        }}
      />

      <EnableSheet open={howTo} onClose={() => setHowTo(false)} onResult={() => setBlocked(pushState().permission === "denied")} />
    </AppShell>
  );
}

/** Action keys the SERVER resolves; everything else is a plain deep link. */
const SERVER_ACTIONS = new Set(["number_allow", "number_deny", "still_yes", "still_no", "appeal", "not_you"]);

// ---------------------------------------------------------------------------
// One row: swipe-left reveals the red dismiss track, past 90px it dismisses.
// ---------------------------------------------------------------------------

function NotifRow({
  row, onOpen, onDismiss, onAction,
}: {
  row: NotificationRow;
  onOpen: () => void;
  onDismiss: () => void;
  onAction: (a: NotificationAction) => void;
}) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  // The ref drives the HANDLERS and the state drives the RENDER.
  //
  // The handlers have to read this synchronously: touchmove can fire before the
  // re-render from touchstart has committed, and a state read there would still
  // say false and swallow the first frames of the swipe. But the transform below
  // also needs it, and a ref read during render is not tracked. So both — the
  // ref stays the source of truth for the gesture, the state only mirrors it.
  const dragging = useRef(false);
  /** null until the first move decides horizontal (swipe) vs vertical (scroll). */
  const axis = useRef<"x" | "y" | null>(null);
  /** Set by a horizontal gesture so the click it ends with is not a tap. */
  const swiped = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  function reset() {
    dragging.current = false;
    axis.current = null;
    start.current = null;
    setIsDragging(false);
    setDx(0);
  }

  function onTouchStart(e: React.TouchEvent) {
    // A drag that starts on a button is a tap on that button, not a swipe.
    if ((e.target as HTMLElement).closest("button")) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    axis.current = null;
    // Cleared per gesture, not per click: a swipe usually ends WITHOUT a click,
    // and a flag left set would have swallowed the next real tap.
    swiped.current = false;
    dragging.current = true;
    setIsDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current || start.current == null) return;
    const mx = e.touches[0].clientX - start.current.x;
    const my = e.touches[0].clientY - start.current.y;

    // Decide the axis once, at the first move that is big enough to mean
    // something. A finger that is scrolling the list must not drag rows
    // sideways by the few pixels of horizontal wobble every scroll has.
    if (axis.current === null) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      axis.current = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (axis.current === "y") { reset(); return; }
      swiped.current = true;
    }
    setDx(Math.min(0, mx));
  }

  function onTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    axis.current = null;
    start.current = null;
    setIsDragging(false);
    if (dx < -90) { setGone(true); setDx(-window.innerWidth); setTimeout(onDismiss, 150); }
    else setDx(0);
  }

  const lead =
    row.lead.kind === "avatar" ? (
      <Avatar src={row.lead.photo} name={row.lead.name} size={40} />
    ) : (
      <div className={cn("grid h-9 w-9 flex-none place-items-center rounded-full", TONE[row.lead.tone] ?? TONE.neutral)}>
        <Icon name={row.lead.icon as IconName} size={20} />
      </div>
    );

  return (
    <div
      ref={wrap}
      className="relative overflow-hidden"
      style={gone ? { maxHeight: 0, opacity: 0, transition: "opacity .2s, max-height .25s, margin .25s" } : undefined}
    >
      {/* swipe track */}
      <div className="absolute inset-0 flex items-center justify-end bg-error pr-5 text-ink-inverse">
        <Icon name="close" size={24} />
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        // Without this the gesture never completed on a real device. The row
        // sits inside a vertically scrolling <main>; with the default
        // `touch-action: auto` the browser owns BOTH axes, so it claimed the
        // horizontal drag, fired `touchcancel` instead of `touchend`, and the
        // dismiss never ran — leaving the row stuck mid-swipe. `pan-y` gives
        // the browser the vertical scroll and keeps the horizontal drag for
        // us. `touchcancel` is still handled, because a system gesture (a
        // call, a notification shade) can cancel any touch at any time.
        onTouchCancel={onTouchEnd}
        // A swipe that ends is not also a tap — without this a released swipe
        // could still open the row it was dismissing.
        onClick={() => { if (!swiped.current) onOpen(); }}
        style={{ transform: `translateX(${dx}px)`, transition: isDragging ? "none" : undefined, touchAction: "pan-y" }}
        className={cn(
          "relative flex items-start gap-3 bg-page p-4 transition-transform duration-100 will-change-transform active:bg-surface-2",
          row.unread && "bg-accent-soft pl-6",
        )}
      >
        {row.unread && (
          <span className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent" />
        )}
        {lead}
        <div className="flex-1 text-13 leading-[1.45] text-ink-primary">
          {boldSegments(row.text).map((s, i) => (s.bold ? <b key={i} className="font-semibold">{s.text}</b> : <span key={i}>{s.text}</span>))}
          <div className="mt-[3px] text-11 text-ink-tertiary">{row.timeLabel}</div>
          {row.actions.length > 0 && (
            <div className="mt-2.5 flex gap-2">
              {row.actions.map((a) =>
                a.style === "link" || a.style === "link-error" ? (
                  <button
                    key={a.key}
                    onClick={(e) => { e.stopPropagation(); onAction(a); }}
                    className={cn(
                      "chrome inline-flex items-center gap-1 text-13 font-semibold",
                      a.style === "link-error" ? "text-error" : "text-accent",
                    )}
                  >
                    {a.label}
                  </button>
                ) : (
                  <Button
                    key={a.key}
                    size="small"
                    variant={a.style === "primary" ? "primary" : "outline"}
                    className="w-auto"
                    onClick={(e) => { e.stopPropagation(); onAction(a); }}
                  >
                    {a.label}
                  </Button>
                ),
              )}
            </div>
          )}
        </div>
        {row.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.thumbUrl} alt="" className="h-10 w-10 flex-none rounded-8 bg-surface-3 object-cover" />
        )}
      </div>
    </div>
  );
}

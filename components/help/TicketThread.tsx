"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { Header } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Badge, EmptyBlock } from "./primitives";
import { supportApi } from "@/lib/support/client";
import type { TicketThread as Thread } from "@/lib/support/types";
import { cn } from "@/lib/utils";

/**
 * P12 S2 — the ticket thread. User bubbles right, support bubbles left with the
 * "HomzList Support" label and avatar, system lines centred.
 *
 * Two states, exactly as designed: open shows the composer, closed swaps it for
 * the "This ticket is closed / Reopen ticket" bar. Reopening writes to the
 * server and re-reads, so the state on screen is the state in the database.
 */
const TIME = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function TicketThread({ id, base = "" }: { id: string; base?: string }) {
  const toast = useToast();
  const [t, setT] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await supportApi.ticket(id);
    if (r.ok) setT(r.data);
    else if (r.error.code === "NOT_FOUND") setNotFound(true);
    setLoading(false);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [t?.messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const r = await supportApi.reply(id, body);
    setSending(false);
    if (r.ok) {
      setText("");
      await load();
    } else {
      toast.show(r.error.code === "LISTING_STATE_LOCKED" ? "This ticket is closed — reopen it first" : "Couldn't send that", {
        variant: "error",
      });
    }
  };

  const reopen = async () => {
    const r = await supportApi.reopen(id);
    if (r.ok) {
      toast.show("Ticket reopened");
      await load();
    } else {
      toast.show("Couldn't reopen this ticket", { variant: "error" });
    }
  };

  if (loading) {
    return (
      <AppShell header={<Header left={<BackButton fallback={`${base}/support`} />} title="Ticket" />}>
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-16 w-3/4 rounded-12" />
          <Skeleton className="h-16 w-2/3 self-end rounded-12" />
        </div>
      </AppShell>
    );
  }

  if (notFound || !t) {
    return (
      <AppShell header={<Header left={<BackButton fallback={`${base}/support`} />} title="Ticket" />}>
        <EmptyBlock icon="headset" title="Ticket not found" body="It may have been removed, or it isn't yours." />
      </AppShell>
    );
  }

  const closed = t.status === "closed";

  return (
    <AppShell
      scroll={false}
      header={
        <Header
          left={<BackButton fallback={`${base}/support`} />}
          title={
            <span className="flex items-center gap-2">
              #{t.number}
              {closed ? <Badge tone="muted">Closed</Badge> : t.status === "replied" ? <Badge tone="accent" dot>Replied</Badge> : <Badge tone="info">Open</Badge>}
            </span>
          }
        />
      }
    >
      <div className="bg-surface-2 px-4 py-2.5 text-13 font-semibold text-ink-primary">{t.subject}</div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2.5 p-4">
          {t.messages.map((m) =>
            m.authorKind === "system" ? (
              <p key={m.id} className="px-6 py-1 text-center text-11 text-ink-tertiary">
                {m.body} — {TIME(m.createdAt)}
              </p>
            ) : m.authorKind === "user" ? (
              <div key={m.id} className="max-w-[78%] self-end rounded-12 rounded-br-[4px] bg-accent-soft px-3 py-2.5 text-15 leading-[1.45] text-ink-primary">
                {m.attachments.map((a) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={a.url} src={a.url} alt="" className="mb-1.5 h-20 w-[120px] rounded-8 object-cover" />
                ))}
                {m.body}
              </div>
            ) : (
              <div key={m.id} className="flex max-w-[85%] items-end gap-2 self-start">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-13 font-semibold text-accent">
                  H
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-11 font-semibold uppercase tracking-[0.3px] text-accent">HomzList Support</span>
                  <div className="rounded-12 rounded-bl-[4px] bg-surface-2 px-3 py-2.5 text-15 leading-[1.45] text-ink-primary">
                    {m.body}
                  </div>
                </div>
              </div>
            ),
          )}
          {t.resolution && closed && (
            <p className="px-6 py-1 text-center text-11 text-ink-tertiary">Resolution: {t.resolution}</p>
          )}
          <div ref={bottom} />
        </div>
      </div>

      {closed ? (
        <div className="flex flex-col items-center gap-3 border-t border-divider p-4">
          <p className="text-13 text-ink-tertiary">This ticket is closed</p>
          <button
            type="button"
            onClick={reopen}
            className="chrome inline-flex h-11 items-center gap-2 rounded-8 border border-border px-4 text-15 font-semibold text-ink-primary active:bg-surface-2"
          >
            <Icon name="rotate-ccw" size={20} />
            Reopen ticket
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-divider bg-page px-4 py-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Write a reply…"
            className="h-11 flex-1 rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] placeholder:text-ink-tertiary"
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || sending}
            aria-label="Send reply"
            className={cn(
              "chrome grid h-11 w-11 place-items-center rounded-full",
              text.trim() && !sending ? "text-accent active:bg-surface-2" : "text-ink-disabled",
            )}
          >
            <Icon name="send" size={24} />
          </button>
        </div>
      )}
    </AppShell>
  );
}

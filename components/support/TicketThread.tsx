"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, Header, Icon, Button, Skeleton, StatusBadge, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { supportApi, type TicketThread as Thread } from "@/lib/content/client";

/**
 * P12 S2c/S2d — the ticket thread, and the "Ticket created" success screen that
 * precedes it.
 *
 * Arriving with `?created=TKT-xxxx` shows the drawn-check success state first
 * (the design's S2c), then the thread — so a submitted ticket lands somewhere
 * that carries its number rather than dropping the user back into a list.
 *
 * A CLOSED ticket hides the composer and shows "Reopen ticket". The server
 * refuses a reply on a closed ticket too; hiding it is the courtesy, not the
 * control.
 */
export function TicketThread({ id, base = "" }: { id: string; base?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const createdNumber = params.get("created");

  const [thread, setThread] = useState<Thread | null>(null);
  const [missing, setMissing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(Boolean(createdNumber));
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await supportApi.thread(id);
    if (r.ok) { setThread(r.data); setOffline(false); setMissing(false); }
    else if (r.error.code === "OFFLINE") setOffline(true);
    else setMissing(true);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (thread && !showSuccess) bottom.current?.scrollIntoView({ block: "end" });
  }, [thread, showSuccess]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const r = await supportApi.reply(id, text);
    setSending(false);
    if (!r.ok) {
      toast.show(
        r.error.code === "OFFLINE" ? "You're offline — your reply wasn't sent"
          : r.error.code === "FORBIDDEN" ? "This ticket is closed — reopen it first"
          : "Couldn't send that",
      );
      return;
    }
    setDraft("");
    // Re-read rather than push the local echo: the server also flipped the
    // ticket back to `open`, and the badge has to follow it.
    await load();
  }

  async function reopen() {
    const r = await supportApi.reopen(id);
    if (!r.ok) { toast.show("Couldn't reopen that"); return; }
    await load();
    toast.show("Ticket reopened");
  }

  /* ── S2c · Ticket created ─────────────────────────────────────────────── */
  if (showSuccess && createdNumber) {
    return (
      <AppShell
        header={
          <Header
            left={
              <button
                aria-label="Close"
                onClick={() => router.replace(`${base}/help/tickets`)}
                className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
              >
                <Icon name="close" size={20} />
              </button>
            }
          />
        }
      >
        <div className="flex flex-col items-center gap-2 px-8 pt-16 text-center">
          <DrawnCheck />
          <p className="mt-4 text-17 font-semibold text-ink-primary">Ticket #{createdNumber} created</p>
          <p className="max-w-[280px] text-13 text-ink-secondary">
            We&apos;ve emailed you a confirmation. We&apos;ll reply within 24 hours.
          </p>
          <Button className="mt-4 min-w-[180px]" onClick={() => setShowSuccess(false)}>View ticket</Button>
        </div>
      </AppShell>
    );
  }

  const header = (
    <Header
      left={<BackButton fallback={`${base}/help/tickets`} />}
      title={
        thread ? (
          <span className="flex items-center gap-2">
            #{thread.number}
            <StatusBadge
              kind={thread.status === "open" ? "pending" : thread.status === "replied" ? "active" : "stopped"}
              label={thread.status === "open" ? "Open" : thread.status === "replied" ? "Replied" : "Closed"}
            />
          </span>
        ) : (
          "Ticket"
        )
      }
    />
  );

  if (missing) {
    return (
      <AppShell header={header}>
        <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
          <Icon name="headset" size={96} strokeWidth={1} className="text-ink-tertiary" />
          <p className="text-17 font-semibold text-ink-primary">Ticket not found</p>
          <p className="text-13 text-ink-secondary">It may belong to another account.</p>
          <Button variant="outline" className="mt-2" onClick={() => router.push(`${base}/help/tickets`)}>
            Back to Support
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!thread) {
    return (
      <AppShell header={header}>
        {offline ? (
          <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
            <Icon name="wifi-off" size={48} className="text-ink-disabled" />
            <p className="text-13 text-ink-tertiary">You&apos;re offline. Reconnect to read this ticket.</p>
            <Button variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-3/4 rounded-12" />)}
          </div>
        )}
      </AppShell>
    );
  }

  const closed = thread.status === "closed";

  return (
    <AppShell header={header} scroll={false}>
      <div className="bg-surface-2 px-4 py-2.5 text-13 font-semibold text-ink-primary">{thread.subject}</div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-2.5 p-4">
          <div className="px-6 py-1 text-center text-11 text-ink-tertiary">
            {thread.ackedAt
              ? `Ticket acknowledged automatically — ${stamp(thread.ackedAt)}`
              : `Opened ${stamp(thread.createdAt)}`}
          </div>

          {thread.messages.map((m) =>
            m.authorKind === "user" ? (
              <div key={m.id} className="max-w-[78%] self-end rounded-12 rounded-br-[4px] bg-accent-soft px-3 py-2.5 text-15 leading-[1.45] text-ink-primary">
                {m.attachments.length > 0 && (
                  <span className="mb-1.5 flex flex-wrap gap-1.5">
                    {m.attachments.map((key) => (
                      // Streamed through the authenticated route, never a signed
                      // storage URL — the ownership check runs on each read.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={key}
                        src={`/api/v1/support/tickets/${thread.id}/attachment?key=${encodeURIComponent(key)}`}
                        alt="Attached screenshot"
                        className="h-20 w-[120px] rounded-8 object-cover"
                        loading="lazy"
                      />
                    ))}
                  </span>
                )}
                {m.body}
              </div>
            ) : (
              <div key={m.id} className="flex max-w-[85%] items-end gap-2 self-start">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-13 font-semibold text-accent">H</span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-11 font-semibold uppercase tracking-[0.3px] text-accent">{m.authorName}</span>
                  <div className="rounded-12 rounded-bl-[4px] bg-surface-2 px-3 py-2.5 text-15 leading-[1.45] text-ink-primary">
                    {m.body}
                  </div>
                </div>
              </div>
            ),
          )}

          {thread.isGrievance && thread.slaDueAt && !closed && (
            <div className="mt-1 flex items-start gap-2.5 rounded-8 bg-info-soft p-3 text-11 leading-[1.5] text-ink-primary">
              <Icon name="clock" size={16} className="mt-px shrink-0 text-info" />
              <span>
                Grievance under the IT Rules, 2021 — resolution due by{" "}
                {new Date(thread.slaDueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
              </span>
            </div>
          )}

          <div className="px-6 py-1 text-center text-11 text-ink-tertiary">
            {stamp(thread.messages[thread.messages.length - 1]?.createdAt ?? thread.createdAt)}
          </div>
          <div ref={bottom} />
        </div>
      </div>

      {closed ? (
        <div className="flex flex-col items-center gap-3 border-t border-divider p-4">
          <p className="text-13 text-ink-tertiary">This ticket is closed</p>
          <Button variant="outline" onClick={() => void reopen()}>
            <Icon name="rotate-ccw" size={20} />
            Reopen ticket
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-divider bg-page px-4 py-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Write a reply…"
            className="h-11 flex-1 rounded-8 border border-border bg-surface-1 px-3 text-15 text-ink-primary outline-none focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] placeholder:text-ink-tertiary"
          />
          <button
            aria-label="Send"
            disabled={!draft.trim() || sending}
            onClick={() => void send()}
            className="chrome grid h-11 w-11 place-items-center rounded-full text-accent active:bg-surface-2 disabled:text-ink-disabled"
          >
            <Icon name="send" size={22} />
          </button>
        </div>
      )}
    </AppShell>
  );
}

function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

/** The design's stroke-drawn tick — 500ms circle, then a 350ms check. */
function DrawnCheck() {
  return (
    <svg width="96" height="96" viewBox="0 0 56 56" aria-hidden="true" className="[--dash:166]">
      <circle
        cx="28" cy="28" r="26" fill="none" stroke="var(--accent)" strokeWidth="2"
        strokeLinecap="round" strokeDasharray="166" strokeDashoffset="166"
        style={{ animation: "hz-draw .5s cubic-bezier(.2,0,0,1) forwards" }}
      />
      <path
        d="M17 29l8 8 15-16" fill="none" stroke="var(--accent)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="48" strokeDashoffset="48"
        style={{ animation: "hz-draw .35s .4s cubic-bezier(.2,0,0,1) forwards" }}
      />
    </svg>
  );
}

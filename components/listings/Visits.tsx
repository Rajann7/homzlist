"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, EmptyState, Header, Icon, Skeleton, useToast } from "@/components/billing/ui";
import { BackButton, OfflineBanner } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { visitsApi, type VisitView } from "@/lib/listings/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * P8 S1 — My Visits (Doc7 §102).
 *
 * The buyer's consolidated visits, grouped into date sections. Visit ORIGINATION
 * (proposing slots from a chat) is the chat scheduler — Module 6 — so it is
 * tracked in PENDING-INTEGRATIONS.md; here visits are viewed and managed
 * (reschedule / cancel / outcome), all server-driven.
 */
const SECTION_ORDER: { key: VisitView["section"]; label: string }[] = [
  { key: "tomorrow", label: "TOMORROW" },
  { key: "this_week", label: "THIS WEEK" },
  { key: "upcoming", label: "UPCOMING" },
  { key: "completed", label: "COMPLETED" },
  { key: "cancelled", label: "CANCELLED" },
];

const CANCEL_REASONS = ["Changed my mind", "Property not suitable", "Schedule conflict", "Other"];

export function Visits() {
  const router = useRouter();
  const toast = useToast();

  const [items, setItems] = useState<VisitView[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [filterSheet, setFilterSheet] = useState(false);
  const [reschedule, setReschedule] = useState<VisitView | null>(null);
  const [cancelFor, setCancelFor] = useState<VisitView | null>(null);
  const [cancelReason, setCancelReason] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await visitsApi.mine(filter === "all" ? undefined : filter);
    if (res.ok) { setItems(res.data.items); setOffline(false); }
    else if (res.error.code === "OFFLINE") { setOffline(true); setItems([]); }
    else setItems([]);
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const setOutcome = async (v: VisitView, outcome: "done" | "cancelled") => {
    const res = await visitsApi.outcome(v.id, outcome);
    toast.show(res.ok ? "Visit updated" : "Couldn't update that");
    void load();
  };
  const doCancel = async () => {
    if (!cancelFor) return;
    const res = await visitsApi.cancel(cancelFor.id, cancelReason);
    setCancelFor(null); setCancelReason(null);
    toast.show(res.ok ? "Visit cancelled" : "Couldn't cancel that");
    void load();
  };

  const grouped = useMemo(() => {
    const m = new Map<string, VisitView[]>();
    for (const v of items ?? []) { const a = m.get(v.section) ?? []; a.push(v); m.set(v.section, a); }
    return m;
  }, [items]);

  return (
    <AppShell showNav={false}>
      <Header
        left={<BackButton fallback="/requirements" />}
        title="My visits"
        right={<button aria-label="Filter" className="grid h-11 w-11 place-items-center" onClick={() => setFilterSheet(true)}><Icon name="filter" size={22} className="text-ink-primary" /></button>}
      />
      {offline && <OfflineBanner />}

      {!items ? (
        <div className="flex flex-col gap-4 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[150px] w-full rounded-12" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No visits scheduled"
          subtitle="Site visits you schedule from chats appear here."
          illustration={<CalendarArt />}
          cta={{ label: "Explore Properties", onClick: () => router.push("/") }}
        />
      ) : (
        <div className="flex flex-col gap-5 p-4 pb-8">
          {SECTION_ORDER.filter((s) => grouped.has(s.key)).map((s) => (
            <div key={s.key} className="flex flex-col gap-3">
              <div className="sticky top-0 z-[1] bg-surface-1/95 py-1 text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">{s.label}</div>
              {(grouped.get(s.key) ?? []).map((v) => (
                <VisitCard key={v.id} v={v} onReschedule={() => setReschedule(v)} onCancel={() => setCancelFor(v)} onOutcome={(o) => void setOutcome(v, o)} onMessage={() => (v.threadId ? router.push(`/messages/${v.threadId}`) : toast.show("This visit isn't linked to a chat"))} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Filter sheet */}
      <BottomSheet open={filterSheet} onClose={() => setFilterSheet(false)} title="Filter visits">
        <div className="flex flex-col pb-2">
          {[{ k: "all", l: "All" }, { k: "upcoming", l: "Upcoming" }, { k: "completed", l: "Completed" }, { k: "cancelled", l: "Cancelled" }].map((o) => (
            <button key={o.k} onClick={() => { setFilter(o.k); setFilterSheet(false); }} className={cn("flex items-center justify-between rounded-8 px-4 py-3 text-left text-15", filter === o.k ? "text-accent" : "text-ink-primary")}>
              {o.l}{filter === o.k && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Reschedule sheet */}
      <RescheduleSheet
        visit={reschedule}
        onClose={() => setReschedule(null)}
        onDone={async (whenISO, note) => {
          const v = reschedule; if (!v) return;
          const res = await visitsApi.reschedule(v.id, whenISO, note);
          setReschedule(null);
          toast.show(res.ok ? "New time proposed — waiting for confirmation" : "Couldn't reschedule");
          void load();
        }}
      />

      {/* Cancel dialog with reasons */}
      <ConfirmDialog
        open={Boolean(cancelFor)}
        onClose={() => { setCancelFor(null); setCancelReason(null); }}
        onConfirm={() => void doCancel()}
        title="Cancel this visit?"
        body={
          <div className="flex flex-col gap-2">
            <span>{cancelFor?.counterparty.name} will be notified.</span>
            <div className="flex flex-col">
              {CANCEL_REASONS.map((reason) => (
                <button key={reason} onClick={() => setCancelReason(reason)} className={cn("flex items-center justify-between rounded-8 px-3 py-2.5 text-left text-13", cancelReason === reason ? "bg-accent-soft text-accent" : "text-ink-primary")}>
                  {reason}{cancelReason === reason && <Icon name="check" size={16} />}
                </button>
              ))}
            </div>
          </div>
        }
        confirmLabel="Cancel visit"
        destructive
      />
    </AppShell>
  );
}

const STATUS_CHIP: Record<VisitView["status"], { label: string; cls: string }> = {
  proposed: { label: "Proposed", cls: "bg-surface-2 text-ink-secondary" },
  confirmed: { label: "Confirmed", cls: "bg-accent-soft text-accent" },
  completed: { label: "Completed", cls: "bg-surface-3 text-ink-tertiary" },
  cancelled: { label: "Cancelled", cls: "bg-error-soft text-error" },
};

function VisitCard({ v, onReschedule, onCancel, onOutcome, onMessage }: {
  v: VisitView; onReschedule: () => void; onCancel: () => void; onOutcome: (o: "done" | "cancelled") => void; onMessage: () => void;
}) {
  const chip = STATUS_CHIP[v.status];
  const upcoming = v.status === "proposed" || v.status === "confirmed";
  return (
    <div className={cn("flex flex-col gap-3 rounded-12 border border-border bg-surface-1 p-3", (v.status === "completed" || v.status === "cancelled") && "opacity-60")}>
      <div className="flex gap-3">
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-8 bg-surface-3">{v.listing?.coverUrl && <Img src={v.listing.coverUrl} alt="" className="h-full w-full object-cover" />}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-15 font-semibold text-ink-primary">{v.listing?.title ?? "Property visit"}</div>
          <div className="truncate text-11 text-ink-tertiary">{[v.listing?.priceLabel, v.listing?.areaLabel].filter(Boolean).join(" · ")}</div>
        </div>
        <button aria-label="Message" className="grid h-11 w-11 shrink-0 place-items-center" onClick={onMessage}><Icon name="message" size={20} className="text-ink-secondary" /></button>
      </div>

      <div className="flex items-center gap-2">
        <Icon name="clock" size={16} className="text-ink-tertiary" />
        <span className="text-13 font-semibold text-ink-primary">{v.dateLabel} · {v.timeLabel}</span>
        <span className={cn("ml-auto rounded-4 px-2.5 py-1 text-11 font-semibold uppercase tracking-[0.3px]", chip.cls)}>{chip.label}</span>
      </div>

      <div className="flex items-center gap-2 text-11 text-ink-tertiary">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-secondary">{v.counterparty.name.slice(0, 1).toUpperCase()}</span>
        <span>with {v.counterparty.name}{v.counterparty.role ? ` (${v.counterparty.role})` : ""}</span>
      </div>

      {/* Past-due outcome prompt */}
      {v.isPast ? (
        <div className="flex flex-col gap-2 rounded-8 bg-warning-soft p-3">
          <span className="text-11 font-semibold text-ink-secondary">How did this visit go?</span>
          <div className="flex gap-2">
            <button className="rounded-full bg-surface-1 px-3 py-1.5 text-13 font-semibold text-accent" onClick={() => onOutcome("done")}>Done</button>
            <button className="rounded-full bg-surface-1 px-3 py-1.5 text-13 font-semibold text-error" onClick={() => onOutcome("cancelled")}>Cancelled</button>
            <button className="rounded-full bg-surface-1 px-3 py-1.5 text-13 font-semibold text-ink-secondary" onClick={onReschedule}>Reschedule</button>
          </div>
        </div>
      ) : upcoming ? (
        <div className="flex items-center gap-4 border-t border-divider pt-2">
          <button className="text-13 font-semibold text-accent" onClick={onReschedule}>Reschedule</button>
          <button className="text-13 font-semibold text-error" onClick={onCancel}>Cancel</button>
        </div>
      ) : null}
    </div>
  );
}

function RescheduleSheet({ visit, onClose, onDone }: { visit: VisitView | null; onClose: () => void; onDone: (whenISO: string, note: string | null) => void }) {
  const [dayIdx, setDayIdx] = useState(0);
  const [time, setTime] = useState("11:00");
  const [note, setNote] = useState("");

  const days = useMemo(() => {
    const out: { label: string; date: Date }[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      out.push({ label: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }), date: d });
    }
    return out;
    // `visit` is not read in here — the seven days are always the next seven.
  }, []);
  const times = ["10:00", "11:00", "12:00", "15:00", "16:00", "17:00", "18:00"];

  const send = () => {
    const d = new Date(days[dayIdx].date);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    onDone(d.toISOString(), note.trim() || null);
  };

  return (
    <BottomSheet open={Boolean(visit)} onClose={onClose} title="Reschedule visit">
      <div className="flex flex-col gap-4 pb-2">
        <div>
          <div className="mb-2 text-13 font-semibold text-ink-secondary">Pick a day</div>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {days.map((d, i) => (
              <button key={i} onClick={() => setDayIdx(i)} className={cn("shrink-0 rounded-8 border px-3 py-2 text-13 font-semibold", dayIdx === i ? "border-accent bg-accent-soft text-accent" : "border-border text-ink-primary")}>{d.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-13 font-semibold text-ink-secondary">Pick a time</div>
          <div className="flex flex-wrap gap-2">
            {times.map((t) => (
              <button key={t} onClick={() => setTime(t)} className={cn("rounded-full border px-3 py-1.5 text-13 font-semibold", time === t ? "border-accent bg-accent-soft text-accent" : "border-border text-ink-primary")}>
                {new Date(`2020-01-01T${t}`).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              </button>
            ))}
          </div>
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note (optional)" className="w-full resize-none rounded-8 border border-border bg-surface-1 p-3 text-15 text-ink-primary outline-none focus:border-accent" />
        <Button fullWidth onClick={send}>Send new time</Button>
      </div>
    </BottomSheet>
  );
}

function CalendarArt() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
      <rect x="20" y="26" width="56" height="50" rx="6" stroke="var(--ink-tertiary)" strokeWidth="2" />
      <path d="M20 40h56M34 20v10M62 20v10" stroke="var(--ink-tertiary)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="48" cy="56" r="6" fill="var(--accent)" />
    </svg>
  );
}

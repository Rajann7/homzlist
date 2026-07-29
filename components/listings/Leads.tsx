"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, EmptyState, Header, Icon, Skeleton, useToast } from "@/components/billing/ui";
import { BackButton, OfflineBanner, SheetOption } from "@/components/billing/primitives";
import { leadsApi, type LeadView } from "@/lib/listings/client";
import { cn } from "@/lib/utils";

/**
 * P8 S2 — Leads Pipeline (Doc7 §103-105).
 *
 * Broker/Builder see the full pipeline; Owner sees a simplified list — the split
 * (`ownerVariant`) is decided from the ROLE server-side, never a client flag.
 * Auto-population from chat/visit outcomes is Module 6 (tracked in PENDING);
 * here leads are viewed and stage-managed, with CSV export built server-side.
 */
const STAGES: { key: LeadView["stage"]; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "visit", label: "Visit scheduled" },
  { key: "negotiation", label: "Negotiation" },
  { key: "closed_won", label: "Closed — won" },
  { key: "closed_lost", label: "Closed — lost" },
];

const STAGE_CHIP: Record<LeadView["stage"], { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-info-soft text-info" },
  contacted: { label: "Contacted", cls: "bg-surface-2 text-ink-secondary" },
  visit: { label: "Visit", cls: "bg-warning-soft text-warning" },
  negotiation: { label: "Negotiation", cls: "bg-accent-soft text-accent" },
  closed_won: { label: "Closed", cls: "bg-accent text-white" },
  closed_lost: { label: "Closed", cls: "bg-surface-3 text-ink-tertiary" },
};

const EXPORT_FIELDS = [
  { key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "property", label: "Property" },
  // Source tells a property lead from a requirement proposal from a project lead
  // — the three families the pipeline mixes together in one list.
  { key: "source", label: "Source" },
  { key: "stage", label: "Stage" }, { key: "date", label: "Date" }, { key: "last_activity", label: "Last activity" },
];

export function Leads() {
  const router = useRouter();
  const toast = useToast();

  type Data = { ownerVariant: boolean; leads: LeadView[]; stageCounts: { key: string; label: string; count: number }[]; summary: { total: number; newThisWeek: number; conversionPct: number | null } };
  const [data, setData] = useState<Data | null>(null);
  const [offline, setOffline] = useState(false);
  const [stageFilter, setStageFilter] = useState("all");
  const [moveFor, setMoveFor] = useState<LeadView | null>(null);
  const [noteFor, setNoteFor] = useState<LeadView | null>(null);
  const [moreFor, setMoreFor] = useState<LeadView | null>(null);
  const [exportSheet, setExportSheet] = useState(false);
  const [exportFields, setExportFields] = useState<Set<string>>(new Set(EXPORT_FIELDS.map((f) => f.key)));

  const load = useCallback(async () => {
    const res = await leadsApi.list();
    if (res.ok) { setData(res.data); setOffline(false); }
    else if (res.error.code === "OFFLINE") { setOffline(true); setData(null); }
    else setData({ ownerVariant: false, leads: [], stageCounts: [], summary: { total: 0, newThisWeek: 0, conversionPct: null } });
  }, []);

  useEffect(() => { void load(); }, [load]);

  const downloadCsv = async () => {
    setExportSheet(false);
    try {
      const res = await fetch(leadsApi.exportUrl([...exportFields]), { credentials: "same-origin" });
      if (!res.ok) { toast.show("Couldn't export"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `homzlist-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast.show("CSV downloaded");
    } catch { toast.show("Couldn't export"); }
  };

  const leads = data?.leads ?? [];
  const shown = stageFilter === "all" ? leads
    : stageFilter === "closed_won" ? leads.filter((l) => l.stage === "closed_won" || l.stage === "closed_lost")
    : leads.filter((l) => l.stage === stageFilter);

  return (
    <AppShell showNav={false}>
      <Header
        left={<BackButton fallback="/requirements" />}
        title="Leads"
        right={
          <div className="flex items-center">
            {!data?.ownerVariant && <button aria-label="Export" className="grid h-11 w-11 place-items-center" onClick={() => setExportSheet(true)}><Icon name="download" size={22} className="text-ink-primary" /></button>}
            <button aria-label="Filter" className="grid h-11 w-11 place-items-center" onClick={() => setStageFilter("all")}><Icon name="filter" size={22} className="text-ink-primary" /></button>
          </div>
        }
      />
      {offline && <OfflineBanner />}

      {!data ? (
        <div className="flex flex-col gap-4 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[150px] w-full rounded-12" />)}</div>
      ) : leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          subtitle="Leads from your listings and requirements appear here."
          illustration={<FunnelArt />}
          cta={{ label: "Boost a Listing", onClick: () => router.push("/boost/new") }}
        />
      ) : data.ownerVariant ? (
        // ---- Owner simplified list ----
        <div className="flex flex-col p-4">
          {shown.map((l) => (
            <button key={l.id} onClick={() => setMoveFor(l)} className="flex items-center gap-3 border-b border-divider py-3 text-left last:border-0">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-13 font-semibold text-ink-secondary">{l.lead.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-15 font-semibold text-ink-primary">{l.lead.name}</div>
                <div className="truncate text-11 text-ink-tertiary">{l.property?.title ?? "—"} · {l.lastActivity ?? ""}</div>
              </div>
              {l.stage === "new" && <span className="h-2 w-2 rounded-full bg-accent" />}
              <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
            </button>
          ))}
        </div>
      ) : (
        // ---- Broker/Builder pipeline ----
        <div className="flex flex-col gap-4 p-4 pb-8">
          {/* Stage segmented bar */}
          <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[{ key: "all", label: "All", count: data.summary.total }, ...data.stageCounts.filter((s) => s.key !== "all")].map((s) => (
              <button key={s.key} onClick={() => setStageFilter(s.key)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-13 font-semibold", stageFilter === s.key ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-primary")}>
                {s.key === "new" && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                {s.label} {s.count}
              </button>
            ))}
          </div>

          {/* Summary strip */}
          <div className="flex rounded-12 bg-surface-2 p-3">
            <SummaryCol value={String(data.summary.total)} label="Total leads" />
            <SummaryCol value={String(data.summary.newThisWeek)} label="New this week" />
            {data.summary.conversionPct !== null && <SummaryCol value={`${data.summary.conversionPct}%`} label="Conversion" />}
          </div>

          {shown.map((l) => (
            <LeadCard key={l.id} l={l} onMessage={() => (l.threadId ? router.push(`/messages/${l.threadId}`) : toast.show("No chat with this lead yet"))} onMove={() => setMoveFor(l)} onMore={() => setMoreFor(l)} onOpenProperty={() => (l.property ? router.push(`/property/${l.property.id}`) : toast.show("No property linked"))} />
          ))}
        </div>
      )}

      {/* Move-stage sheet */}
      <MoveStageSheet
        lead={moveFor}
        onClose={() => setMoveFor(null)}
        onDone={async (stage, note) => {
          const l = moveFor; if (!l) return;
          const res = await leadsApi.moveStage(l.id, stage, note);
          setMoveFor(null);
          toast.show(res.ok ? `Lead moved to ${STAGES.find((s) => s.key === stage)?.label ?? stage}` : "Couldn't move that lead");
          void load();
        }}
      />

      {/* Note sheet */}
      <NoteSheet
        lead={noteFor}
        onClose={() => setNoteFor(null)}
        onDone={async (text) => {
          const l = noteFor; if (!l) return;
          const res = await leadsApi.addNote(l.id, text);
          setNoteFor(null);
          toast.show(res.ok ? "Note added" : "Couldn't add note");
          void load();
        }}
      />

      {/* ⋯ sheet */}
      <BottomSheet open={Boolean(moreFor)} onClose={() => setMoreFor(null)} title="Lead options">
        <div className="flex flex-col pb-2">
          <SheetOption icon={<Icon name="user" size={22} className="text-ink-secondary" />} label="View profile" onClick={() => { setMoreFor(null); toast.show("Opens the profile"); }} />
          <SheetOption icon={<Icon name="edit" size={22} className="text-ink-secondary" />} label="Add note" onClick={() => { const l = moreFor; setMoreFor(null); setNoteFor(l); }} />
          <SheetOption icon={<Icon name="close" size={22} className="text-error" />} label="Mark not relevant" destructive onClick={async () => { const l = moreFor; setMoreFor(null); if (l) { const res = await leadsApi.notRelevant(l.id); toast.show(res.ok ? "Marked not relevant" : "Couldn't update that"); void load(); } }} />
        </div>
      </BottomSheet>

      {/* Export sheet */}
      <BottomSheet open={exportSheet} onClose={() => setExportSheet(false)} title="Export leads">
        <div className="flex flex-col gap-3 pb-2">
          <div className="text-13 font-semibold text-ink-secondary">Export as CSV</div>
          <div className="flex flex-col">
            {EXPORT_FIELDS.map((f) => {
              const on = exportFields.has(f.key);
              return (
                <button key={f.key} onClick={() => setExportFields((s) => { const n = new Set(s); on ? n.delete(f.key) : n.add(f.key); return n; })} className="flex items-center justify-between py-2.5 text-left text-15 text-ink-primary">
                  {f.label}
                  <span className={cn("grid h-5 w-5 place-items-center rounded-4 border", on ? "border-accent bg-accent" : "border-border")}>{on && <Icon name="check" size={14} className="text-white" />}</span>
                </button>
              );
            })}
          </div>
          <Button fullWidth disabled={exportFields.size === 0} onClick={() => void downloadCsv()}>Download CSV</Button>
        </div>
      </BottomSheet>
    </AppShell>
  );
}

function SummaryCol({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <span className="text-17 font-bold text-ink-primary">{value}</span>
      <span className="text-11 text-ink-tertiary">{label}</span>
    </div>
  );
}

function LeadCard({ l, onMessage, onMove, onMore, onOpenProperty }: {
  l: LeadView; onMessage: () => void; onMove: () => void; onMore: () => void; onOpenProperty: () => void;
}) {
  const chip = STAGE_CHIP[l.stage];
  const trust = [
    l.lead.verified.phone ? "Phone verified ✓" : null,
    l.lead.memberSince ? `Member since ${l.lead.memberSince}` : null,
    `Profile ${l.lead.profilePct}%`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-2 rounded-12 border border-border bg-surface-1 p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-13 font-semibold text-ink-secondary">{l.lead.name.slice(0, 1).toUpperCase()}</span>
        <div className="flex flex-1 items-center gap-1.5">
          <span className="text-15 font-semibold text-ink-primary">{l.lead.name}</span>
          {l.lead.verified.phone && <Icon name="verified" size={14} className="text-accent" />}
        </div>
        <span className={cn("rounded-4 px-2.5 py-1 text-11 font-semibold uppercase tracking-[0.3px]", chip.cls)}>{chip.label}</span>
      </div>

      <div className="text-11 text-ink-tertiary">{trust}</div>

      {l.property && (
        <button onClick={onOpenProperty} className="flex items-center gap-2 rounded-8 bg-surface-2 p-2 text-left">
          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-8 bg-surface-3">{l.property.coverUrl && <img src={l.property.coverUrl} alt="" className="h-full w-full object-cover" />}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-13 font-semibold text-ink-primary">{l.property.title ?? "Listing"}</span>
            <span className="block truncate text-11 text-ink-tertiary">{[l.property.priceLabel, l.property.areaLabel].filter(Boolean).join(" · ")}</span>
          </span>
        </button>
      )}

      {l.lastActivity && <div className="text-11 text-ink-tertiary">Last activity: {l.lastActivity}</div>}

      <div className="flex items-center gap-3 border-t border-divider pt-2">
        <Button variant="outline" className="h-9 flex-1 text-13" onClick={onMessage}>Message</Button>
        <Button variant="outline" className="h-9 flex-1 text-13" onClick={onMove}>Move stage</Button>
        <button aria-label="More" className="grid h-9 w-9 place-items-center" onClick={onMore}><Icon name="more" size={20} className="text-ink-secondary" /></button>
      </div>
    </div>
  );
}

function MoveStageSheet({ lead, onClose, onDone }: { lead: LeadView | null; onClose: () => void; onDone: (stage: LeadView["stage"], note: string | null) => void }) {
  const [stage, setStage] = useState<LeadView["stage"]>("new");
  const [note, setNote] = useState("");
  useEffect(() => { if (lead) { setStage(lead.stage); setNote(""); } }, [lead]);

  return (
    <BottomSheet open={Boolean(lead)} onClose={onClose} title="Move stage">
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex flex-col">
          {STAGES.map((s) => (
            <button key={s.key} onClick={() => setStage(s.key)} className={cn("flex items-center justify-between rounded-8 px-3 py-2.5 text-left text-15", stage === s.key ? "text-accent" : "text-ink-primary")}>
              {s.label}
              <span className={cn("grid h-5 w-5 place-items-center rounded-full border", stage === s.key ? "border-accent bg-accent" : "border-border")}>{stage === s.key && <Icon name="check" size={12} className="text-white" />}</span>
            </button>
          ))}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note (optional)" className="w-full resize-none rounded-8 border border-border bg-surface-1 p-3 text-15 text-ink-primary outline-none focus:border-accent" />
        <Button fullWidth onClick={() => onDone(stage, note.trim() || null)}>Update</Button>
      </div>
    </BottomSheet>
  );
}

function NoteSheet({ lead, onClose, onDone }: { lead: LeadView | null; onClose: () => void; onDone: (text: string) => void }) {
  const [text, setText] = useState("");
  useEffect(() => { if (lead) setText(""); }, [lead]);
  return (
    <BottomSheet open={Boolean(lead)} onClose={onClose} title="Add note">
      <div className="flex flex-col gap-3 pb-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Write a note about this lead" className="w-full resize-none rounded-8 border border-border bg-surface-1 p-3 text-15 text-ink-primary outline-none focus:border-accent" />
        <Button fullWidth disabled={!text.trim()} onClick={() => onDone(text.trim())}>Save</Button>
      </div>
    </BottomSheet>
  );
}

function FunnelArt() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
      <path d="M24 28h48l-18 22v18l-12 6V50L24 28z" stroke="var(--ink-tertiary)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="48" cy="38" r="3" fill="var(--accent)" />
    </svg>
  );
}

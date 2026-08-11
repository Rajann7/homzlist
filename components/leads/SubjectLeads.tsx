"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Skeleton, EmptyState, Chip } from "@/components/billing/ui";
import { cn } from "@/lib/utils";
import * as leadsApi from "@/lib/leads/client";
import { LeadActions, PersonRow, StatusPill, ago } from "./parts";

/**
 * Every lead on ONE of my posts.
 *
 * The filter chips are scoped to this post and carry their own counts, so a
 * seller working one flat never has to read past the other four. "Overdue" is a
 * first-class filter on purpose: a lead whose promised contact time has passed
 * is where leads quietly die, and it is invisible in a plain New/Contacted
 * split.
 *
 * Opening this screen marks the post's leads seen — that, not a tap on each
 * card, is what clears the nav badge.
 */
export function SubjectLeads({
  kind, id, base = "/leads",
}: { kind: leadsApi.SubjectKind; id: string; base?: string }) {
  const router = useRouter();
  const [data, setData] = useState<leadsApi.SubjectLeads | null>(null);
  const [filter, setFilter] = useState("all");
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const res = await leadsApi.subjectLeads(kind, id);
    if (res.ok) setData(res.data); else setFailed(true);
  }, [kind, id]);

  useEffect(() => {
    void (async () => {
      await load();
      // Seen is recorded after the read so the counts the screen just drew are
      // the pre-open ones — the owner sees what was new when they arrived.
      await leadsApi.markSubjectSeen(kind, id);
    })();
  }, [load, kind, id]);

  const leads = (data?.leads ?? []).filter((l) =>
    filter === "all" ? true : filter === "overdue" ? l.overdue : l.status === filter);

  return (
    <AppShell
      header={
        <Header
          left={
            <button type="button" onClick={() => router.push(base)} aria-label="Back" className="chrome grid h-11 w-11 place-items-center">
              <Icon name="chevron-left" size={22} />
            </button>
          }
          title={
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-15 font-semibold text-ink-primary">{data?.subject?.title ?? "Leads"}</span>
              {data?.subject && (
                <span className="text-11 font-normal text-ink-secondary">
                  {data.subject.total} lead{data.subject.total === 1 ? "" : "s"}
                  {data.subject.unseen ? ` · ${data.subject.unseen} new` : ""}
                </span>
              )}
            </span>
          }
        />
      }
    >
      {data && (
        <div className="flex gap-2 overflow-x-auto border-b border-divider px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {data.counts.filter((c) => c.count > 0 || c.key === "all").map((c) => (
            <Chip key={c.key} selected={filter === c.key} onClick={() => setFilter(c.key)} className="shrink-0">
              {c.label} {c.count}
            </Chip>
          ))}
        </div>
      )}

      {!data && !failed && (
        <div className="flex flex-col gap-3 p-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full rounded-12" />)}
        </div>
      )}

      {failed && (
        <EmptyState title="Couldn't load these leads" subtitle="Check your connection and try again." cta={{ label: "Retry", onClick: () => void load() }} />
      )}

      {data && leads.length === 0 && (
        <EmptyState
          title={filter === "all" ? "No leads on this yet" : "Nothing in this filter"}
          subtitle={filter === "all"
            ? "When someone sends an inquiry on this post, their card lands here with Call and WhatsApp ready."
            : "Try another filter to see the rest of your leads."}
          cta={filter === "all" ? undefined : { label: "Show all", onClick: () => setFilter("all") }}
        />
      )}

      <div className="pb-6">
        {leads.map((l) => <LeadCard key={l.id} lead={l} base={base} onChanged={() => void load()} />)}
      </div>
    </AppShell>
  );
}

export function LeadCard({
  lead, base, onChanged,
}: { lead: leadsApi.LeadView; base: string; onChanged: () => void }) {
  return (
    <div
      className={cn(
        "border-b border-divider px-3 py-3",
        !lead.seen && "bg-accent-soft/30 shadow-[inset_3px_0_0_var(--accent)]",
        lead.status === "archived" && "opacity-70",
      )}
    >
      <PersonRow
        person={lead.person}
        meta={`${roleLabel(lead.person.role)} · ${ago(lead.createdAt)}`}
        right={
          <>
            {lead.overdue && <StatusPill tone="overdue">Overdue</StatusPill>}
            <StatusPill tone={lead.status}>{lead.statusLabel}</StatusPill>
          </>
        }
      />

      <Link href={`${base}/lead/${lead.id}`} className="mt-2.5 block rounded-8 border border-divider bg-surface-2 px-3">
        <Row k="Wants" v={lead.wants.map((w) => w.label).join(" · ") || "—"} />
        <Row k="Contact by" v={`${lead.contactPref === "whatsapp" ? "WhatsApp" : "Call"}${lead.contactNumber ? ` · ${lead.contactNumber}` : ""}`} />
        <Row k="Best time" v={lead.preferredOn ? `${lead.whenLabel ?? ""} · ${lead.preferredOn}`.replace(/^ · /, "") : (lead.whenLabel ?? "—")} last />
      </Link>

      {lead.closedReason && <p className="mt-2 text-11 text-ink-tertiary">{lead.closedReason}</p>}

      <LeadActions lead={lead} onChanged={onChanged} />
    </div>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div className={cn("flex gap-2 py-2 text-13", !last && "border-b border-divider")}>
      <span className="w-[88px] shrink-0 text-ink-secondary">{k}</span>
      <span className="min-w-0 flex-1 break-words text-ink-primary">{v}</span>
    </div>
  );
}

export function roleLabel(role: string | null): string {
  if (role === "owner") return "Owner";
  if (role === "broker") return "Broker";
  if (role === "builder") return "Builder";
  return "Buyer";
}

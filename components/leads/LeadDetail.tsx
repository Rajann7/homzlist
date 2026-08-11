"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Skeleton, EmptyState, Chip } from "@/components/billing/ui";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import * as leadsApi from "@/lib/leads/client";
import { LeadActions, StatusPill, SubjectThumb, ago } from "./parts";
import { roleLabel } from "./SubjectLeads";

/**
 * One lead, in full.
 *
 * Status is the only workflow there is — New → Contacted → Converted →
 * Archived — and it is saved server-side, which is what the Leads counts and
 * the nav badge read. The number is shown in full: it was given to this seller
 * deliberately, and masking it here while the Call button dials it anyway would
 * be theatre.
 */
export function LeadDetail({ id, base = "/leads" }: { id: string; base?: string }) {
  const router = useRouter();
  const [lead, setLead] = useState<leadsApi.LeadView | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const res = await leadsApi.lead(id);
    if (res.ok) setLead(res.data.lead); else setFailed(true);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const subjectHref = lead?.subject.id
    ? lead.subject.kind === "requirement" ? `/requirements/${lead.subject.id}`
      : lead.subject.kind === "project" ? `/projects/${lead.subject.id}`
      : `/p/${lead.subject.id}`
    : null;

  return (
    <AppShell
      header={
        <Header
          left={
            <button type="button" onClick={() => router.back()} aria-label="Back" className="chrome grid h-11 w-11 place-items-center">
              <Icon name="chevron-left" size={22} />
            </button>
          }
          title="Lead"
        />
      }
    >
      {!lead && !failed && (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-14 w-full rounded-12" />
          <Skeleton className="h-24 w-full rounded-12" />
          <Skeleton className="h-40 w-full rounded-12" />
        </div>
      )}

      {failed && (
        <EmptyState title="This lead isn't available" subtitle="It may have been removed, or it isn't yours." cta={{ label: "Back to Leads", href: base }} />
      )}

      {lead && (
        <div className="p-4 pb-8">
          <div className="flex items-center gap-3">
            <Avatar src={lead.person.photoUrl} name={lead.person.name} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-15 font-semibold text-ink-primary">{lead.person.name}</div>
              <div className="mt-0.5 truncate text-12 text-ink-secondary">
                {roleLabel(lead.person.role)}
                {lead.person.memberSince ? ` · Member since ${lead.person.memberSince}` : ""}
              </div>
            </div>
            {lead.overdue && <StatusPill tone="overdue">Overdue</StatusPill>}
            <StatusPill tone={lead.status}>{lead.statusLabel}</StatusPill>
          </div>

          {/* What the inquiry was about — the snapshot, so an edited or removed
              post cannot rewrite or blank this card. */}
          <div className="mt-3.5 rounded-12 border border-border bg-surface-1 p-3">
            <div className="text-11 font-bold tracking-wide text-ink-tertiary">INQUIRY FOR</div>
            {subjectHref ? (
              <Link href={subjectHref} className="mt-2 flex items-center gap-3">
                <SubjectThumb kind={lead.subject.kind} coverUrl={lead.subject.coverUrl} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-13 font-semibold text-ink-primary">{lead.subject.title}</span>
                  <span className="mt-0.5 block truncate text-12 text-ink-secondary">{lead.subject.subtitle}</span>
                </span>
                <Icon name="chevron-right" size={16} className="text-ink-tertiary" />
              </Link>
            ) : (
              <div className="mt-2 flex items-center gap-3">
                <SubjectThumb kind={lead.subject.kind} coverUrl={lead.subject.coverUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-13 font-semibold text-ink-primary">{lead.subject.title}</div>
                  <div className="mt-0.5 text-12 text-ink-tertiary">No longer available</div>
                </div>
              </div>
            )}
          </div>

          {/* An offer attached to a requirement proposal. */}
          {lead.offer && (
            <div className="mt-3 rounded-12 border border-border bg-surface-1 p-3">
              <div className="text-11 font-bold tracking-wide text-ink-tertiary">THEY OFFERED</div>
              <Link
                href={lead.offer.kind === "project" ? `/projects/${lead.offer.id}` : `/p/${lead.offer.id}`}
                className="mt-2 flex items-center gap-3"
              >
                <SubjectThumb kind={lead.offer.kind} coverUrl={lead.offer.coverUrl} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-13 font-semibold text-ink-primary">{lead.offer.title}</span>
                  <span className="mt-0.5 block truncate text-12 text-ink-secondary">{lead.offer.subtitle}</span>
                </span>
                <Icon name="chevron-right" size={16} className="text-ink-tertiary" />
              </Link>
            </div>
          )}

          <div className="mt-3 rounded-12 border border-border bg-surface-1 px-3">
            <KV k="Wants" v={lead.wants.map((w) => w.label).join(" · ") || "—"} />
            <KV k="Contact by" v={lead.contactPref === "whatsapp" ? "WhatsApp" : "Call"} />
            <KV k="Number" v={lead.contactNumber ?? "—"} strong />
            <KV k="Best time" v={[lead.whenLabel, lead.preferredOn].filter(Boolean).join(" · ") || "—"} />
            <KV k="Received" v={new Date(lead.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} last />
          </div>

          <div className="mt-4 text-11 font-bold tracking-wide text-ink-tertiary">STATUS</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["new", "contacted", "converted", "archived"] as const).map((s) => (
              <Chip
                key={s}
                selected={lead.status === s}
                onClick={async () => { await leadsApi.setStatus(lead.id, s); void load(); }}
              >
                {s === "new" ? "New" : s === "contacted" ? "Contacted" : s === "converted" ? "Converted" : "Archived"}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-11 leading-snug text-ink-tertiary">
            Status is saved on the server and updates your Leads counts everywhere.
          </p>

          {lead.notes.length > 0 && (
            <>
              <div className="mt-4 text-11 font-bold tracking-wide text-ink-tertiary">NOTES</div>
              <div className="mt-2 flex flex-col gap-2">
                {lead.notes.map((n, i) => (
                  <div key={i} className="rounded-8 border border-divider bg-surface-2 p-2.5">
                    <div className="text-13 text-ink-primary">{n.text}</div>
                    <div className="mt-1 text-11 text-ink-tertiary">{ago(n.at)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <LeadActions lead={lead} onChanged={() => void load()} />
        </div>
      )}
    </AppShell>
  );
}

function KV({ k, v, last, strong }: { k: string; v: string; last?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex gap-2 py-2.5 text-13", !last && "border-b border-divider")}>
      <span className="w-[88px] shrink-0 text-ink-secondary">{k}</span>
      <span className={cn("min-w-0 flex-1 break-words text-ink-primary", strong && "font-semibold tracking-wide")}>{v}</span>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, BottomSheet, Header, Icon, Skeleton, EmptyState } from "@/components/billing/ui";
import { cn } from "@/lib/utils";
import * as leadsApi from "@/lib/leads/client";
import { KIND, StatusPill, SubjectThumb, ago } from "./parts";

/**
 * Leads — the screen that replaced Messages.
 *
 * RECEIVED is a list of the viewer's OWN posts (properties, projects,
 * requirements), each with its live lead count; tapping one opens that post's
 * leads. That ordering is deliberate: with no chat threads, "which of my flats
 * is this about?" is the only question worth answering first.
 *
 * SENT is what the viewer sent out, each card carrying the offer they attached
 * (when they answered a requirement with one of their own listings).
 *
 * Every number on this screen is a server aggregate — nothing is counted in the
 * client (CLAUDE.md §12).
 */
export function LeadsHub({ base = "/leads" }: { base?: string }) {
  const [tab, setTab] = useState<"received" | "sent">("received");
  // The header's search searches THIS screen. It used to be a link to /search,
  // which threw the user out of their leads into property search — the single
  // most jarring thing on the screen.
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "new" | "unanswered">("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [groups, setGroups] = useState<leadsApi.LeadGroups | null>(null);
  const [sent, setSent] = useState<leadsApi.SentLead[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const [g, s] = await Promise.all([leadsApi.leadGroups(), leadsApi.sentLeads()]);
    if (g.ok) setGroups(g.data); else setFailed(true);
    if (s.ok) setSent(s.data.sent);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loading = !groups && !failed;
  const needle = q.trim().toLowerCase();
  const allSubjects = groups?.subjects ?? [];
  const subjects = allSubjects
    .filter((s) => (needle ? `${s.title} ${s.subtitle}`.toLowerCase().includes(needle) : true))
    .filter((s) => (sort === "unanswered" ? s.unseen > 0 : true))
    .sort((a, b) =>
      sort === "new"
        ? b.unseen - a.unseen || (b.lastAt ?? "").localeCompare(a.lastAt ?? "")
        : 0);
  const byKind = (k: leadsApi.SubjectKind) => subjects.filter((s) => s.kind === k);
  const sentShown = (sent ?? []).filter((s) =>
    needle ? `${s.subject.title} ${s.to.name}`.toLowerCase().includes(needle) : true);

  return (
    <AppShell
      header={
        <Header
          title={
            <span className="flex flex-col leading-tight">
              <span className="text-17 font-semibold text-ink-primary">Leads</span>
              {groups && (
                <span className="text-11 font-normal text-ink-secondary">
                  {groups.totals.total} total{groups.totals.unseen ? ` · ${groups.totals.unseen} new` : ""}
                </span>
              )}
            </span>
          }
          right={
            <span className="flex items-center">
              <button
                type="button"
                aria-label="Search your leads"
                onClick={() => { setSearching((v) => !v); if (searching) setQ(""); }}
                className="chrome grid h-11 w-11 place-items-center"
              >
                <Icon name={searching ? "close" : "search"} size={22} />
              </button>
              <button
                type="button"
                aria-label="Sort and filter"
                onClick={() => setSortOpen(true)}
                className={cn("chrome grid h-11 w-11 place-items-center", sort !== "recent" && "text-accent")}
              >
                <Icon name="filter" size={22} />
              </button>
            </span>
          }
        />
      }
    >
      <div className="flex border-b border-divider bg-surface-1">
        {(["received", "sent"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "chrome flex-1 border-b-2 py-3 text-13 font-semibold",
              tab === k ? "border-ink-primary text-ink-primary" : "border-transparent text-ink-tertiary",
            )}
          >
            {k === "received" ? "Received" : "Sent"} · {k === "received" ? (groups?.totals.total ?? 0) : (sent?.length ?? 0)}
          </button>
        ))}
      </div>

      {searching && (
        <div className="border-b border-divider bg-surface-1 px-3 py-2">
          <div className="flex items-center gap-2 rounded-8 bg-surface-2 px-3">
            <Icon name="search" size={16} className="text-ink-tertiary" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === "received" ? "Search your properties, projects…" : "Search what you sent…"}
              className="h-10 flex-1 bg-transparent text-14 text-ink-primary outline-none placeholder:text-ink-tertiary"
            />
            {q && (
              <button type="button" aria-label="Clear" onClick={() => setQ("")} className="chrome grid h-8 w-8 place-items-center">
                <Icon name="close" size={14} className="text-ink-tertiary" />
              </button>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3 p-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[76px] w-full rounded-12" />)}
        </div>
      )}

      {failed && (
        <EmptyState
          title="Couldn't load your leads"
          subtitle="Check your connection and try again."
          cta={{ label: "Retry", onClick: () => void load() }}
        />
      )}

      {!loading && !failed && tab === "received" && (
        subjects.length === 0 ? (
          needle || sort === "unanswered" ? (
            <EmptyState
              title="Nothing matches"
              subtitle={needle ? `No post of yours matches "${q.trim()}".` : "Every post has been opened — nothing is waiting."}
              cta={{ label: "Clear", onClick: () => { setQ(""); setSort("recent"); } }}
            />
          ) : (
            <EmptyState
              title="No leads yet"
              subtitle="When someone sends an inquiry on your property, project or requirement, it lands here with Call and WhatsApp ready."
              cta={{ label: "Share a listing", href: "/profile" }}
            />
          )
        ) : (
          <div className="pb-6">
            <Group label="Properties" items={byKind("listing")} base={base} />
            <Group label="Projects" items={byKind("project")} base={base} />
            <Group label="Requirements" items={byKind("requirement")} base={base} />
          </div>
        )
      )}

      {!loading && !failed && tab === "sent" && (
        sentShown.length === 0 ? (
          needle ? (
            <EmptyState
              title="Nothing matches"
              subtitle={`Nothing you sent matches "${q.trim()}".`}
              cta={{ label: "Clear", onClick: () => setQ("") }}
            />
          ) : (
            <EmptyState
              title="You haven't sent anything yet"
              subtitle="Send an inquiry on a property or answer someone's requirement — they show up here with their status."
              cta={{ label: "Explore properties", href: "/" }}
            />
          )
        ) : (
          <div className="pb-6">
            {sentShown.map((s) => <SentCard key={s.id} sent={s} onChanged={() => void load()} />)}
          </div>
        )
      )}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort & filter">
        <div className="flex flex-col pb-2">
          {([
            { key: "recent", label: "Newest activity", sub: "The order they last moved in" },
            { key: "new", label: "Most new leads", sub: "Biggest unopened counts first" },
            { key: "unanswered", label: "Only unopened", sub: "Hide posts you have already been through" },
          ] as const).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => { setSort(o.key); setSortOpen(false); }}
              className="chrome flex items-center gap-3 border-b border-divider py-3 text-left last:border-0"
            >
              <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border", sort === o.key ? "border-accent bg-accent text-white" : "border-border")}>
                {sort === o.key && <Icon name="check" size={12} />}
              </span>
              <span className="min-w-0">
                <span className="block text-14 text-ink-primary">{o.label}</span>
                <span className="block text-12 text-ink-secondary">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </AppShell>
  );
}

function Group({ label, items, base }: { label: string; items: leadsApi.LeadSubject[]; base: string }) {
  if (!items.length) return null;
  return (
    <>
      <div className="flex items-center gap-2 bg-surface-2 px-3 pb-1.5 pt-3 text-11 font-bold uppercase tracking-wide text-ink-tertiary">
        {label} <span className="font-normal">· {items.length}</span>
      </div>
      {items.map((s) => (
        <Link
          key={`${s.kind}:${s.id}`}
          href={`${base}/${s.kind}/${s.id}`}
          className="flex items-center gap-3 border-b border-divider px-3 py-3 active:bg-surface-2"
        >
          <SubjectThumb kind={s.kind} coverUrl={s.coverUrl} />
          <div className="min-w-0 flex-1">
            <div className="text-13 font-semibold text-ink-primary">{s.title}</div>
            <div className="mt-0.5 truncate text-12 text-ink-secondary">
              {[s.subtitle, s.stateLabel].filter(Boolean).join(" · ")}
            </div>
            <div className={cn("mt-1 text-11 font-semibold", s.unseen ? "text-accent" : "text-ink-tertiary")}>
              {s.unseen ? `${s.unseen} new · ${s.total} total` : `${s.total} total`}
            </div>
          </div>
          <span
            className={cn(
              "grid h-6 min-w-6 shrink-0 place-items-center rounded-full px-1.5 text-12 font-bold",
              s.unseen ? "bg-accent text-white" : "bg-surface-3 text-ink-tertiary",
            )}
          >
            {s.unseen || 0}
          </span>
          <Icon name="chevron-right" size={16} className="shrink-0 text-ink-tertiary" />
        </Link>
      ))}
    </>
  );
}

function SentCard({ sent, onChanged }: { sent: leadsApi.SentLead; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const href = sent.subject.id
    ? sent.subject.kind === "requirement" ? `/requirements/${sent.subject.id}`
      : sent.subject.kind === "project" ? `/projects/${sent.subject.id}`
      : `/p/${sent.subject.id}`
    : null;

  return (
    <div className={cn("border-b border-divider px-3 py-3", sent.state === "closed" && "opacity-70")}>
      <div className="flex items-center gap-3">
        <SubjectThumb kind={sent.subject.kind} coverUrl={sent.subject.coverUrl} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-13 font-semibold text-ink-primary">{sent.subject.title}</span>
            <StatusPill tone={sent.state}>{sent.stateLabel}</StatusPill>
          </div>
          <div className="mt-0.5 truncate text-12 text-ink-secondary">
            To {sent.to.name}{sent.to.role ? ` · ${sent.to.role}` : ""} · {ago(sent.createdAt)}
          </div>
        </div>
      </div>

      {sent.summary && <div className="mt-2 text-12 text-ink-secondary">You asked: {sent.summary}</div>}

      {/* The offer attached to a requirement proposal — "I Have a Property". */}
      {sent.offer && (
        <div className="mt-2.5 flex items-center gap-2 rounded-8 border border-divider bg-surface-2 p-2">
          <SubjectThumb kind={sent.offer.kind} coverUrl={sent.offer.coverUrl} size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-11 font-bold tracking-wide text-ink-tertiary">YOU OFFERED</div>
            <div className="mt-0.5 truncate text-12 font-semibold text-ink-primary">
              {sent.offer.title}{sent.offer.subtitle ? ` · ${sent.offer.subtitle}` : ""}
            </div>
          </div>
          <span className={cn("rounded-full px-2 py-0.5 text-11 font-semibold", KIND[sent.offer.kind].chip)}>
            {KIND[sent.offer.kind].label}
          </span>
        </div>
      )}

      {sent.closedReason && <div className="mt-2 text-11 text-ink-tertiary">{sent.closedReason}</div>}

      {/* The other half of the evidence. The receiver tapping Call is what the
          platform can see; whether the sender's phone actually rang is the only
          thing that makes "response rate" a measurement rather than a guess. */}
      {sent.askAnswer && (
        <div className="mt-2.5 rounded-8 border border-divider bg-surface-2 p-2.5">
          <div className="text-12 font-semibold text-ink-primary">Did {sent.to.name} contact you?</div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => { setBusy(true); await leadsApi.answerSent(sent.id, "contacted"); setBusy(false); onChanged(); }}
              className="chrome h-8 flex-1 rounded-8 bg-accent text-12 font-semibold text-ink-inverse disabled:opacity-50"
            >
              Yes, they did
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => { setBusy(true); await leadsApi.answerSent(sent.id, "not_yet"); setBusy(false); onChanged(); }}
              className="chrome h-8 flex-1 rounded-8 border border-border text-12 font-semibold text-ink-primary disabled:opacity-50"
            >
              Not yet
            </button>
          </div>
        </div>
      )}
      {sent.senderAnswer && (
        <div className="mt-2 text-11 text-ink-tertiary">
          {sent.senderAnswer === "contacted" ? "You confirmed they contacted you." : "You told us they hadn't reached out yet."}
        </div>
      )}

      <div className="mt-2.5 flex gap-2">
        {href && (
          <Link href={href} className="chrome flex h-9 flex-1 items-center justify-center rounded-8 border border-border text-13 font-semibold text-ink-primary active:bg-surface-2">
            View {sent.subject.kind === "requirement" ? "requirement" : sent.subject.kind}
          </Link>
        )}
        {sent.canWithdraw && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); await leadsApi.withdraw(sent.id); setBusy(false); onChanged(); }}
            className="chrome flex h-9 flex-1 items-center justify-center rounded-8 border border-error/30 text-13 font-semibold text-error active:bg-error-soft disabled:opacity-50"
          >
            Cancel request
          </button>
        )}
      </div>
      {sent.canWithdraw && (
        <p className="mt-1.5 text-11 text-ink-tertiary">
          Cancelling stops further contact through HomzList. Details already shared cannot be recalled.
        </p>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, EmptyState, Header, Icon, Skeleton, StatusBadge, Toggle, useToast } from "@/components/billing/ui";
import { BackButton, OfflineBanner, SheetOption } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { listingsApi, requirementsApi, type RequirementCard } from "@/lib/listings/client";
import { cn } from "@/lib/utils";
import { Img } from "@/components/ui/Img";

/**
 * P8 S4 — My Requirements (Doc7 §65).
 *
 * Every count (proposals, "N new") and the matching strip come from the server;
 * the plan strip's quota is server-computed. The consequential actions — toggle
 * off, mark fulfilled, delete, reopen — each carry the design's exact
 * consequence line, because they all touch the plan quota (Doc2 §4.2).
 */
export function MyRequirements() {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<{ items: RequirementCard[]; quota: { label: string } } | null>(null);
  const [offline, setOffline] = useState(false);
  /**
   * A Builder reaches requirements through the project, never by posting one
   * (Rajan, 29 Jul 2026 — migration 0087). The server already refuses every
   * path that would put one back on the surface: POST /requirements, and PATCH
   * for reopen / isActive / a content edit are all FORBIDDEN for the role.
   *
   * This screen still drew all of them, so a builder got a "+", a quota strip
   * promising posts they cannot spend, an Edit that bounced to Create and an
   * active toggle that answered "Couldn't update that". The ways OUT of the
   * state — Mark fulfilled, Delete, Share — stay, because migration 0067 left
   * paused rows here and this is the only screen that can clear them.
   */
  const [mayPost, setMayPost] = useState(true);
  const [tip, setTip] = useState(false);
  const [sheetFor, setSheetFor] = useState<RequirementCard | null>(null);
  const [dialog, setDialog] = useState<{ kind: "off" | "fulfil" | "delete" | "reopen"; r: RequirementCard } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    // The role is the SERVER's answer (the same config call the create screens
    // read), never a guess from anything already in the browser.
    void listingsApi.config().then((cfg) => setMayPost(!cfg.ok || cfg.data.role !== "builder"));
    const res = await listingsApi.myRequirements();
    if (res.ok) { setData(res.data as never); setOffline(false); }
    else if (res.error.code === "OFFLINE") { setOffline(true); setData({ items: [], quota: { label: "" } }); }
    else setData({ items: [], quota: { label: "" } });
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setActive = async (r: RequirementCard, on: boolean) => {
    setBusy(true);
    const res = await requirementsApi.setActive(r.id, on);
    setBusy(false);
    toast.show(res.ok ? (on ? "Requirement active" : "Requirement turned off") : "Couldn't update that");
    void load();
  };
  const runDialog = async () => {
    if (!dialog) return;
    setBusy(true);
    const { kind, r } = dialog;
    let msg = "Done";
    if (kind === "off") { const res = await requirementsApi.setActive(r.id, false); msg = res.ok ? "Requirement turned off" : "Couldn't update that"; }
    else if (kind === "fulfil") { const res = await requirementsApi.fulfill(r.id); msg = res.ok ? "Marked as fulfilled" : "Couldn't update that"; }
    else if (kind === "delete") { const res = await requirementsApi.remove(r.id); msg = res.ok ? "Requirement deleted" : "Couldn't delete that"; }
    else if (kind === "reopen") { const res = await requirementsApi.reopen(r.id); msg = res.ok ? "Requirement reopened" : (res.ok === false && res.error.code === "PLAN_REQUIRED" ? "You need a plan slot to reopen" : "Couldn't reopen that"); }
    setBusy(false);
    setDialog(null);
    toast.show(msg);
    void load();
  };

  return (
    <AppShell showNav={false}>
      <Header
        left={<BackButton fallback="/requirements" />}
        title="My requirements"
        right={mayPost ? <button aria-label="Post a requirement" className="grid h-11 w-11 place-items-center" onClick={() => router.push("/requirements/new")}><Icon name="plus" size={24} className="text-ink-primary" /></button> : undefined}
      />
      {offline && <OfflineBanner />}

      {!data ? (
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="h-10 w-full rounded-8" />
          <Skeleton className="h-[220px] w-full rounded-12" />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          title="No requirements posted"
          subtitle="Tell us what you're looking for and matching properties will find you."
          illustration={<SearchListArt />}
          cta={mayPost ? { label: "Post a Requirement", onClick: () => router.push("/requirements/new") } : undefined}
        />
      ) : (
        <div className="flex flex-col gap-4 p-4 pb-8">
          {/* Plan strip — a count of posts that can still be spent, so it is not
              drawn for a role that can't spend them. */}
          {mayPost && (
            <div className="flex items-center gap-2 rounded-8 bg-surface-2 px-3.5 py-2.5">
              <span className="flex-1 text-13 text-ink-secondary">{data.quota.label}</span>
              <button aria-label="Quota info" onClick={() => setTip(true)}><Icon name="info" size={16} className="text-ink-tertiary" /></button>
            </div>
          )}

          {data.items.map((r) => (
            <RequirementCardView
              key={r.id}
              r={r}
              busy={busy}
              mayRevive={mayPost}
              onToggle={(on) => (on ? void setActive(r, true) : setDialog({ kind: "off", r }))}
              onProposals={() => router.push(`/requirements/${r.id}/proposals`)}
              onEdit={() => router.push(`/requirements/new?edit=${r.id}`)}
              onFulfil={() => setDialog({ kind: "fulfil", r })}
              onReopen={() => setDialog({ kind: "reopen", r })}
              onMore={() => setSheetFor(r)}
              onOpenMatch={(id) => router.push(`/property/${id}`)}
            />
          ))}
        </div>
      )}

      {/* ⓘ tooltip popup */}
      <BottomSheet open={tip} onClose={() => setTip(false)} title="About your quota">
        <p className="pb-4 text-13 leading-[1.5] text-ink-secondary">
          Your plan includes requirement posts for a fixed validity. Turning a requirement off or deleting it still uses the quota — turning it back on won&apos;t restore it.
        </p>
      </BottomSheet>

      {/* ⋯ sheet */}
      <BottomSheet open={Boolean(sheetFor)} onClose={() => setSheetFor(null)} title="Requirement options">
        <div className="flex flex-col pb-2">
          <SheetOption icon={<Icon name="rocket" size={22} className="text-ink-secondary" />} label="Boost requirement" onClick={() => { setSheetFor(null); router.push(`/boost/new?requirement=${sheetFor?.id}`); }} />
          <SheetOption icon={<Icon name="share" size={22} className="text-ink-secondary" />} label="Share" onClick={() => { const r = sheetFor; setSheetFor(null); if (r) { void navigator.clipboard?.writeText(`${location.origin}/requirements/${r.id}`); toast.show("Link copied"); } }} />
          <SheetOption icon={<Icon name="trash" size={22} className="text-error" />} label="Delete" destructive onClick={() => { const r = sheetFor; setSheetFor(null); if (r) setDialog({ kind: "delete", r }); }} />
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={dialog?.kind === "off"}
        onClose={() => setDialog(null)}
        onConfirm={() => void runDialog()}
        title="Turn off this requirement?"
        body="It will stop receiving proposals. This still counts against your plan quota — turning it back on won't restore it."
        confirmLabel="Turn Off"
      />
      <ConfirmDialog
        open={dialog?.kind === "fulfil"}
        onClose={() => setDialog(null)}
        onConfirm={() => void runDialog()}
        title="Mark as fulfilled?"
        body="New proposals will stop. You can reopen it later — it will use a slot again."
        confirmLabel="Mark Fulfilled"
      />
      <ConfirmDialog
        open={dialog?.kind === "reopen"}
        onClose={() => setDialog(null)}
        onConfirm={() => void runDialog()}
        title="Reopen this requirement?"
        body="It will use a requirement slot from your current plan."
        confirmLabel="Reopen"
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onClose={() => setDialog(null)}
        onConfirm={() => void runDialog()}
        title="Delete this requirement?"
        body="This can't be undone. Deleting still uses your plan quota — you won't get the slot back."
        confirmLabel="Delete"
        destructive
      />
    </AppShell>
  );
}

function RequirementCardView({
  r, busy, mayRevive, onToggle, onProposals, onEdit, onFulfil, onReopen, onMore, onOpenMatch,
}: {
  r: RequirementCard; busy: boolean;
  /** False for a Builder: reopen / turn on / edit are all 403 for that role. */
  mayRevive: boolean;
  onToggle: (on: boolean) => void; onProposals: () => void; onEdit: () => void;
  onFulfil: () => void; onReopen: () => void; onMore: () => void; onOpenMatch: (id: string) => void;
}) {
  const router = useRouter();
  const expired = r.status === "expired";
  const fulfilled = r.status === "fulfilled";
  const live = r.status === "live";
  const paused = r.status === "paused";
  const total = r.proposals?.total ?? 0;
  const newCount = r.proposals?.newCount ?? 0;
  const matches = r.matches ?? [];

  return (
    <div className={cn("flex flex-col gap-4 rounded-12 border border-border bg-surface-1 p-4", expired && "opacity-70")}>
      {/* Status chip */}
      <div className="flex items-center gap-2">
        {live && r.daysLeft !== null && <StatusBadge kind="active" label={`Active · ${r.daysLeft} days left`} />}
        {paused && <StatusBadge kind="expired" label="Off" />}
        {expired && <StatusBadge kind="expired" label="Expired" />}
        {fulfilled && <StatusBadge kind="fulfilled" label="Fulfilled" />}
        {!live && !paused && !expired && !fulfilled && <StatusBadge kind={r.badge.kind as never} label={r.badge.label} />}
      </div>

      <div>
        <div className="text-20 font-bold text-ink-primary">{r.budgetLabel}</div>
        <div className="mt-0.5 text-13 text-ink-secondary">{[r.bhk ? `${r.bhk} BHK` : null, r.kind === "rent" ? "Rent" : "Buy", r.typeCode].filter(Boolean).join(" · ")}</div>
      </div>
      {r.areaLabel && (
        <div className="flex flex-wrap gap-1.5">
          {r.areaLabel.split(",").slice(0, 3).map((a, i) => (
            <span key={i} className="rounded-full bg-surface-2 px-2.5 py-1 text-11 text-ink-secondary">{a.trim()}</span>
          ))}
        </div>
      )}

      {/* Expired banner */}
      {expired && (
        <div className="flex flex-col gap-2 rounded-8 bg-warning-soft p-3">
          <p className="text-11 text-ink-secondary">This requirement expired. Renew your plan to reactivate it.</p>
          <Button className="h-9 self-start px-4 text-13" onClick={() => router.push("/plans")}>View Plans</Button>
        </div>
      )}

      {/* Fulfilled note */}
      {fulfilled && (
        <div className="flex items-center justify-between">
          <span className="text-11 text-ink-tertiary">Proposals are closed for this requirement</span>
          {mayRevive && <button className="text-13 font-semibold text-accent" onClick={onReopen}>Reopen</button>}
        </div>
      )}

      {/* Active/paused controls */}
      {mayRevive && (live || paused || expired) && (
        <div className="flex items-center gap-3 rounded-8 bg-surface-2 p-3">
          <div className="flex-1">
            <div className="text-15 font-semibold text-ink-primary">Requirement active</div>
            {expired && <div className="mt-0.5 text-11 text-ink-tertiary">Renew a plan to turn this back on — it will use a requirement slot.</div>}
          </div>
          <Toggle
            checked={(live && r.isActive) || false}
            disabled={expired || busy}
            loading={busy}
            label="Requirement active"
            onChange={(on) => onToggle(on)}
          />
        </div>
      )}

      {/* Proposals row */}
      {(live || paused) && (
        <button onClick={onProposals} className="flex h-14 items-center gap-2 rounded-8 border border-border px-4 text-left">
          <span className="flex-1 text-15 font-semibold text-ink-primary">{total} proposal{total === 1 ? "" : "s"} received</span>
          {newCount > 0 && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-11 font-semibold text-accent">{newCount} new</span>}
          <Icon name="chevron-right" size={20} className="text-ink-tertiary" />
        </button>
      )}

      {/* Matching strip */}
      {matches.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-13 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Matching properties</div>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {matches.map((m) => (
              <button key={m.id} onClick={() => onOpenMatch(m.id)} className="flex w-[128px] shrink-0 flex-col overflow-hidden rounded-8 border border-border bg-surface-1 text-left">
                <div className="h-[76px] w-full bg-surface-3">{m.coverUrl && <Img src={m.coverUrl} alt="" className="h-full w-full object-cover" />}</div>
                <div className="p-2">
                  <div className="text-11 font-semibold text-ink-primary">{m.priceLabel}</div>
                  <div className="truncate text-11 text-ink-tertiary">{m.areaLabel ?? ""}</div>
                  {m.tier !== "exact" && m.tierLabel && <div className="mt-0.5 text-[10px] text-accent">{m.tierLabel}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action row */}
      {(live || paused) && (
        <div className="flex items-center gap-3 border-t border-divider pt-3">
          {mayRevive && <Button variant="outline" className="flex-1" onClick={onEdit}>Edit</Button>}
          <Button variant="outline" className="flex-1" onClick={onFulfil}>Mark Fulfilled</Button>
          <button aria-label="More" className="grid h-11 w-11 place-items-center" onClick={onMore}><Icon name="more" size={22} className="text-ink-secondary" /></button>
        </div>
      )}
    </div>
  );
}

function SearchListArt() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
      <rect x="20" y="24" width="44" height="48" rx="6" stroke="var(--ink-tertiary)" strokeWidth="2" />
      <path d="M28 38h28M28 48h28M28 58h18" stroke="var(--ink-tertiary)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="64" cy="60" r="10" stroke="var(--accent)" strokeWidth="2" />
      <path d="M71 67l6 6" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

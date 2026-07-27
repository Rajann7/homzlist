"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, type IconName, Button, Skeleton, useToast } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { activityApi, type ActivityView } from "@/lib/activity/client";
import { cn } from "@/lib/utils";

/**
 * P10 S2 — Your activity (Doc4 §58). A read-only hub over what the user has done.
 * Every value is the server's answer (GET /activity): recently-viewed tiles, the
 * Saved/Proposals/Visits/Saved-search counts and the last inquiries sent. Each
 * row routes to the screen that owns that thing. "Clear recently viewed" deletes
 * the caller's own view history.
 */
export function Activity({ base = "" }: { base?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<ActivityView | null>(null);
  const [offline, setOffline] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await activityApi.get();
    if (r.ok) { setData(r.data); setOffline(false); }
    else if (r.error.code === "OFFLINE") setOffline(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const go = (p: string) => router.push(`${base}${p}`);
  const header = <Header left={<BackButton fallback={`${base}/profile`} />} title="Your activity" centerTitle />;

  if (!data) {
    return (
      <AppShell header={header}>
        <div className="p-4"><Skeleton className="h-4 w-32" /></div>
        <div className="flex gap-3 px-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-28 shrink-0 rounded-10" />)}</div>
        <div className="mt-6 space-y-3 px-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-8" />)}</div>
      </AppShell>
    );
  }

  const { recentlyViewed, inquiries, counts } = data;
  const totallyEmpty =
    recentlyViewed.length === 0 && inquiries.length === 0 &&
    counts.saved === 0 && counts.proposals === 0 && counts.visits === 0 && counts.savedSearches === 0;

  async function clear() {
    setClearOpen(false);
    const r = await activityApi.clearRecentlyViewed();
    if (!r.ok) { toast.show("Couldn't clear that"); return; }
    await load();
    toast.show("Recently viewed cleared");
  }

  if (totallyEmpty) {
    return (
      <AppShell header={header}>
        {offline && <OfflineStrip />}
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <Icon name="clock" size={64} className="text-ink-disabled" strokeWidth={1.3} />
          <h3 className="text-17 font-semibold text-ink-primary">No activity yet</h3>
          <p className="max-w-xs text-13 text-ink-secondary">Properties you view and inquire about appear here.</p>
          <Button className="mt-2" onClick={() => go("/")}>Explore properties</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      {offline && <OfflineStrip />}

      {recentlyViewed.length > 0 && (
        <>
          <div className="px-4 pb-2 pt-4 text-13 font-semibold uppercase tracking-[0.4px] text-ink-tertiary">Recently viewed</div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
            {recentlyViewed.map((r) => (
              <button key={r.listingId} onClick={() => go(`/property/${r.listingId}`)} className="w-28 shrink-0 text-left">
                <span className="block aspect-square overflow-hidden rounded-10 bg-surface-3">
                  {r.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.coverUrl} alt="" data-protected="true" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center text-ink-tertiary"><Icon name="home" size={26} /></span>
                  )}
                </span>
                <span className="mt-1.5 block truncate text-13 font-semibold text-ink-primary">{r.price}</span>
                {r.title && <span className="block truncate text-11 text-ink-tertiary">{r.title}</span>}
                <span className="block text-11 text-ink-tertiary">{fmtDay(r.viewedOn)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <SectionHead>Saved</SectionHead>
      <NavRow icon="bookmark" label={`${counts.saved} ${counts.saved === 1 ? "property" : "properties"} saved`} onClick={() => go("/saved")} />

      {inquiries.length > 0 && (
        <>
          <SectionHead>Inquiries sent</SectionHead>
          {inquiries.map((q) => (
            <button key={q.id} onClick={() => go("/messages")} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2">
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-8 bg-surface-3 text-ink-tertiary">
                {q.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="home" size={20} />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-13 font-semibold text-ink-primary">{q.title ?? "Property"}</span>
              <InquiryBadge status={q.status} />
              <span className="text-11 text-ink-tertiary">{fmtRelative(q.createdAt)}</span>
              <Icon name="chevron-right" size={18} className="text-ink-tertiary" />
            </button>
          ))}
        </>
      )}

      <SectionHead>Proposals sent</SectionHead>
      <NavRow icon="send" label={`${counts.proposals} ${counts.proposals === 1 ? "proposal" : "proposals"}`} onClick={() => go("/proposals")} />

      <SectionHead>Site visits</SectionHead>
      <NavRow icon="pin" label={`${counts.visits} ${counts.visits === 1 ? "visit" : "visits"}`} onClick={() => go("/visits")} />

      <SectionHead>Searches</SectionHead>
      <NavRow icon="bell" label="Saved searches" sub={`${counts.savedSearches} saved`} onClick={() => go("/activity/saved-searches")} />

      {recentlyViewed.length > 0 && (
        <button onClick={() => setClearOpen(true)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-15 text-error active:bg-surface-2">
          <Icon name="trash" size={22} strokeWidth={1.7} /> Clear recently viewed
        </button>
      )}
      <div className="h-6" />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => void clear()}
        title="Clear recently viewed?"
        body="Your view history is removed. This doesn't affect anything you've saved or inquired about."
        confirmLabel="Clear"
        destructive
      />
    </AppShell>
  );
}

function OfflineStrip() {
  return (
    <div className="flex items-center justify-center gap-2 bg-ink-primary px-2 py-2 text-[12px] text-page">
      <Icon name="wifi-off" size={16} /> You&apos;re offline — showing last saved data
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <div className="chrome px-4 pb-2 pt-5 text-13 font-semibold uppercase tracking-[0.4px] text-ink-tertiary">{children}</div>;
}

function NavRow({ icon, label, sub, onClick }: { icon: IconName; label: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
      <Icon name={icon} size={22} strokeWidth={1.7} className="text-ink-secondary" />
      <span className="flex-1">
        <span className="block text-15 text-ink-primary">{label}</span>
        {sub && <span className="block text-11 text-ink-tertiary">{sub}</span>}
      </span>
      <Icon name="chevron-right" size={18} className="text-ink-tertiary" />
    </button>
  );
}

function InquiryBadge({ status }: { status: "sent" | "accepted" | "declined" }) {
  const map = {
    sent: { label: "Sent", cls: "bg-surface-3 text-ink-secondary" },
    accepted: { label: "Accepted", cls: "bg-accent-soft text-accent" },
    declined: { label: "Declined", cls: "bg-error-soft text-error" },
  }[status];
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-11 font-semibold", map.cls)}>{map.label}</span>;
}

function fmtDay(isoDate: string) {
  // viewed_on is a date; render "12 Jan" style, or "Today"/"Yesterday".
  const d = new Date(isoDate + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days}d` : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Header, Icon, Button, Skeleton, StatusBadge } from "@/components";
import { BackButton } from "@/components/billing/primitives";
import { supportApi, type TicketRow } from "@/lib/content/client";

/**
 * P12 S2 — the ticket list: three tabs with real counts, a card per ticket, the
 * skeleton, and the empty state.
 *
 * The tab counts come from the server's GROUP BY, not from filtering the array
 * on screen — so "Closed 3" is still 3 when the list is paginated.
 */

const TABS = [
  { key: "open", label: "Open" },
  { key: "replied", label: "Replied" },
  { key: "closed", label: "Closed" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (hrs < 48) return "yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function Support({ base = "" }: { base?: string }) {
  const router = useRouter();
  const [data, setData] = useState<{ tickets: TicketRow[]; counts: Record<TabKey, number> } | null>(null);
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<TabKey>("open");

  const load = useCallback(async () => {
    const r = await supportApi.list();
    if (r.ok) { setData(r.data as never); setOffline(false); }
    else if (r.error.code === "OFFLINE") setOffline(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const header = (
    <Header
      left={<BackButton fallback={`${base}/settings`} />}
      title="Support"
      right={
        <button
          aria-label="New ticket"
          onClick={() => router.push(`${base}/help/contact`)}
          className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
        >
          <Icon name="plus" size={22} />
        </button>
      }
    />
  );

  if (!data) {
    return (
      <AppShell header={header}>
        {offline ? (
          <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
            <Icon name="wifi-off" size={48} className="text-ink-disabled" />
            <p className="text-13 text-ink-tertiary">You&apos;re offline. Reconnect to see your tickets.</p>
            <Button variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[132px] rounded-12" />)}
          </div>
        )}
      </AppShell>
    );
  }

  const visible = data.tickets.filter((t) => t.status === tab);

  return (
    <AppShell header={header}>
      <div className="flex border-b border-divider">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`chrome h-11 flex-1 border-b-2 text-15 font-semibold transition-colors ${
              tab === t.key ? "border-ink-primary text-ink-primary" : "border-transparent text-ink-tertiary"
            }`}
          >
            {t.label} {data.counts[t.key] ?? 0}
          </button>
        ))}
      </div>

      {data.tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-8 py-12 text-center">
          <Icon name="headset" size={96} strokeWidth={1} className="text-ink-tertiary" />
          <p className="mt-2 text-17 font-semibold text-ink-primary">No support tickets</p>
          <p className="text-13 text-ink-secondary">Contact us if something isn&apos;t working</p>
          <Button className="mt-3" onClick={() => router.push(`${base}/help/contact`)}>Contact support</Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-8 py-12 text-center">
          <Icon name="check-circle" size={64} strokeWidth={1} className="text-ink-tertiary" />
          <p className="text-15 font-semibold text-ink-primary">Nothing {tab} right now</p>
          <p className="text-13 text-ink-secondary">
            {tab === "open" ? "Every ticket you raised has been answered." : tab === "replied" ? "No ticket is waiting on your reply." : "You haven't closed any tickets yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {visible.map((t) => (
            <button
              key={t.id}
              onClick={() => router.push(`${base}/help/tickets/${t.id}`)}
              className="chrome flex flex-col items-stretch gap-2 rounded-12 border border-border bg-surface-1 p-3 text-left transition-transform active:scale-[0.995] active:bg-surface-2"
            >
              <span className="flex items-center justify-between">
                <span className="text-11 text-ink-tertiary">#{t.number}</span>
                {/* The design's three tints, expressed as the existing badge
                    language: info for Open, accent for Replied, muted for Closed. */}
                <StatusBadge
                  kind={t.status === "open" ? "pending" : t.status === "replied" ? "active" : "stopped"}
                  label={t.status === "open" ? "Open" : t.status === "replied" ? "Replied" : "Closed"}
                />
              </span>
              <span className="text-15 font-semibold text-ink-primary">{t.subject}</span>
              <span>
                <span className="inline-flex h-[22px] items-center rounded-full bg-surface-2 px-3 text-11 text-ink-primary">
                  {t.categoryLabel}
                </span>
              </span>
              <span className="truncate text-13 text-ink-tertiary">{t.lastMessage}</span>
              <span className="flex items-center justify-between">
                <span className="text-11 text-ink-tertiary">
                  Updated {relative(t.updatedAt)} · {t.messageCount} message{t.messageCount === 1 ? "" : "s"}
                </span>
                <Icon name="chevron-right" size={16} className="text-ink-tertiary" />
              </span>
            </button>
          ))}
        </div>
      )}
    </AppShell>
  );
}

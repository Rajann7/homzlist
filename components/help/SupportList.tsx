"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/nav/AppShell";
import { Header } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge, P12Chip, Tabs, EmptyBlock, relativeTime } from "./primitives";
import { supportApi } from "@/lib/support/client";
import type { TicketSummary } from "@/lib/support/types";

/**
 * P12 S2 — Support. Three tabs with live counts and a card per ticket showing
 * the number, status badge, subject, category chip, last message and the
 * "updated · N messages" footer.
 *
 * Counts, statuses and message counts are all the server's answer; the tabs only
 * choose which of the fetched tickets to show.
 */
type Tab = "open" | "replied" | "closed";

export function SupportList({ base = "" }: { base?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("open");
  const [data, setData] = useState<{ tickets: TicketSummary[]; counts: Record<Tab, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const r = await supportApi.myTickets();
    if (r.ok) {
      setData(r.data as { tickets: TicketSummary[]; counts: Record<Tab, number> });
      setOffline(false);
    } else if (r.error.code === "OFFLINE") {
      setOffline(true);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const header = (
    <Header
      left={<BackButton fallback={`${base}/help`} />}
      title="Support"
      right={
        <Link
          href={`${base}/support/new`}
          aria-label="New ticket"
          className="chrome grid h-11 w-11 place-items-center rounded-full text-ink-primary active:bg-surface-2"
        >
          <Icon name="plus" size={24} />
        </Link>
      }
    />
  );

  if (loading) {
    return (
      <AppShell header={header}>
        <div className="flex h-11 border-b border-divider" />
        <div className="flex flex-col gap-3 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[132px] w-full rounded-12" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (offline || !data) {
    return (
      <AppShell header={header}>
        <div className="flex items-center justify-center gap-2 bg-ink-primary px-4 py-2 text-13 text-page">
          <Icon name="wifi-off" size={16} />
          You&apos;re offline — showing saved data
        </div>
        <EmptyBlock
          icon="cloud-off"
          title="Can't load your tickets"
          body="Check your connection and try again."
          action={
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              className="chrome mt-3 inline-flex h-11 items-center justify-center rounded-8 bg-accent px-4 text-15 font-semibold text-white"
            >
              Retry
            </button>
          }
        />
      </AppShell>
    );
  }

  const visible = data.tickets.filter((t) => t.status === tab);

  return (
    <AppShell header={header}>
      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "open", label: `Open ${data.counts.open}` },
          { key: "replied", label: `Replied ${data.counts.replied}` },
          { key: "closed", label: `Closed ${data.counts.closed}` },
        ]}
      />

      {data.tickets.length === 0 ? (
        <EmptyBlock
          icon="headset"
          title="No support tickets"
          body="Contact us if something isn't working"
          action={
            <Link
              href={`${base}/support/new`}
              className="chrome mt-3 inline-flex h-11 items-center justify-center rounded-8 bg-accent px-4 text-15 font-semibold text-white active:bg-accent-pressed"
            >
              Contact support
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyBlock
          icon="inbox"
          title={`No ${tab} tickets`}
          body={
            tab === "open"
              ? "Nothing needs your attention right now."
              : tab === "replied"
                ? "No ticket is waiting on a reply from you."
                : "You haven't closed any tickets yet."
          }
        />
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {visible.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => router.push(`${base}/support/${t.id}`)}
              className="chrome flex flex-col items-stretch gap-2 rounded-12 border border-border bg-surface-1 p-3 text-left active:bg-surface-2"
            >
              <span className="flex items-center justify-between">
                <span className="text-11 text-ink-tertiary">#{t.number}</span>
                {t.status === "open" ? (
                  <Badge tone="info">Open</Badge>
                ) : t.status === "replied" ? (
                  <Badge tone="accent" dot>
                    Replied
                  </Badge>
                ) : (
                  <Badge tone="muted">Closed</Badge>
                )}
              </span>
              <span className="text-15 font-semibold text-ink-primary">{t.subject}</span>
              <span className="flex flex-wrap gap-2">
                <P12Chip as="span" className="h-[22px] px-2 text-11">
                  {t.categoryLabel}
                </P12Chip>
                {t.isGrievance && <Badge tone="warn">Grievance</Badge>}
              </span>
              {t.lastMessage && (
                <span className="truncate text-13 text-ink-tertiary">
                  {t.lastAuthor === "user" ? "You: " : t.lastAuthor === "staff" ? "Support: " : ""}
                  {t.lastMessage}
                </span>
              )}
              <span className="flex items-center justify-between">
                <span className="text-11 text-ink-tertiary">
                  Updated {relativeTime(t.lastActivityAt)} · {t.messageCount} message{t.messageCount === 1 ? "" : "s"}
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

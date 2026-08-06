"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, EmptyState, Header, Icon, Skeleton, Toggle, useToast } from "./ui";
import { billingApi, type MyPlan as MyPlanData } from "@/lib/billing/client";
import { BackButton, Banner, OfflineBanner, SectionLabel, SheetOption, UsageBar } from "./primitives";
import { TopupSheet } from "./TopupSheet";

/**
 * P11 S2 — My plan dashboard.
 *
 * Every number here (usage bars, pooled totals, grace countdown, consumed-trace)
 * arrives pre-computed from `/billing/my-plan`. The component does no arithmetic
 * on entitlements — that would put a second, forgeable source of truth in the
 * browser (CLAUDE.md backend lock §1).
 */
export function MyPlan() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<MyPlanData | null>(null);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  // Mirrors the server's stored preference; seeded from the my-plan payload.
  const [reminders, setReminders] = useState(true);

  const load = useCallback(async () => {
    const res = await billingApi.myPlan();
    if (res.ok) {
      setData(res.data);
      setReminders(res.data.expiryReminders);
      setOffline(false);
      setFailed(false);
    } else {
      setOffline(res.error.code === "OFFLINE");
      setFailed(res.error.code !== "OFFLINE");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  let body: React.ReactNode;

  if (!data && !failed) {
    body = <PlanSkeleton />;
  } else if (!data) {
    body = (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-13 text-ink-secondary">Couldn&apos;t load your plan.</p>
        <Button variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  } else if (data.state === "none") {
    body = (
      <>
        {offline && <OfflineBanner />}
        <EmptyState
          className="pt-8"
          title="No active plan"
          subtitle="Buy a plan to post listings and requirements"
          illustration={
            <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="var(--ink-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="7" width="16" height="13" rx="2" />
              <path d="M8 7V5a4 4 0 0 1 8 0v2" />
            </svg>
          }
          cta={{ label: "View Plans", onClick: () => router.push("/plans") }}
        />
      </>
    );
  } else {
    body = (
      <>
        {offline && <OfflineBanner />}
        <div className="flex flex-col gap-4 p-4">
        {data.state === "trial" && data.trial && (
          <div className="rounded-12 bg-info-soft p-4">
            <div className="flex items-start gap-3">
              <span className="text-info"><Icon name="gift" /></span>
              <div className="flex-1">
                <div className="text-17 font-semibold text-ink-primary">{data.trial.name}</div>
                <div className="mt-0.5 text-11 text-ink-tertiary">{data.trial.summary}</div>
              </div>
            </div>
            <p className="mb-3.5 mt-3 text-11 leading-[1.45] text-ink-tertiary">{data.trial.note}</p>
            <Button fullWidth onClick={() => router.push("/plans")}>View Plans</Button>
          </div>
        )}

        {data.state === "grace" && data.grace && (
          <Banner tone="warn" icon={<Icon name="clock" size={22} />} title={data.grace.title}>
            <div className="mt-1 text-11 leading-[1.4] text-ink-secondary">
              Requirements you already unlocked stay visible for {data.grace.hoursLeft} more hours. New ones are locked.
            </div>
            <Button fullWidth className="mt-3" onClick={() => router.push("/plans")}>Renew now</Button>
          </Banner>
        )}

        {data.state === "expired" && data.expiredCard && (
          <>
            <div className="rounded-12 bg-surface-1 p-4 opacity-[0.65] shadow-l1 dark:border dark:border-border dark:shadow-none">
              <div className="flex items-center gap-2">
                <div className="flex-1 text-17 font-semibold text-ink-primary">{data.expiredCard.name}</div>
                <span className="chrome rounded-4 bg-surface-3 px-1.5 py-0.5 text-11 font-semibold uppercase tracking-[0.3px] text-ink-tertiary">Expired</span>
              </div>
              <div className="mt-1 text-11 text-ink-tertiary">{data.expiredCard.meta}</div>
              <p className="mt-3 text-11 leading-[1.45] text-ink-tertiary">
                Your requirement is off. Renew to turn it back on — it will use a requirement slot.
              </p>
            </div>
            <Button fullWidth onClick={() => router.push("/plans")}>Renew plan</Button>
          </>
        )}

        {data.cards.map((card) => (
          <div key={card.id} className="rounded-12 bg-surface-1 p-4 shadow-l1 dark:border dark:border-border dark:shadow-none">
            <div className="flex items-center gap-2">
              <div className="flex-1 text-17 font-semibold text-ink-primary">{card.name}</div>
              <span className="chrome rounded-4 bg-accent-soft px-1.5 py-0.5 text-11 font-semibold uppercase tracking-[0.3px] text-accent">Active</span>
            </div>
            <div className="mb-4 mt-1 text-11 text-ink-tertiary">{card.meta}</div>
            <div className="flex flex-col gap-4">
              {card.bars.map((b) => (
                <UsageBar
                  key={b.label}
                  label={b.label}
                  value={b.value}
                  pct={b.pct}
                  helper={b.helper}
                  action={b.topUp ? { label: "Top up", onClick: () => setTopupOpen(true) } : undefined}
                />
              ))}
            </div>
            {card.canRenew && (
              <Button variant="outline" fullWidth className="mt-4 border-accent text-accent" onClick={() => router.push("/plans")}>
                Renew now
              </Button>
            )}
          </div>
        ))}

        {data.pooled.activePlans > 1 && (
          <div className="rounded-12 bg-surface-2 p-4">
            <div className="flex text-center">
              <div className="flex-1">
                <div className="text-17 font-bold text-ink-primary">{data.pooled.activePlans}</div>
                <div className="text-11 text-ink-tertiary">Active plans</div>
              </div>
              <div className="flex-1">
                <div className="text-17 font-bold text-ink-primary">{data.pooled.unlimitedProposals ? "∞" : data.pooled.proposalsLeft}</div>
                <div className="text-11 text-ink-tertiary">Proposals left</div>
              </div>
              <div className="flex-1">
                <div className="text-17 font-bold text-ink-primary">{data.pooled.listingSlotsLeft}</div>
                <div className="text-11 text-ink-tertiary">Listing slots left</div>
              </div>
            </div>
            <p className="mt-3 text-center text-11 leading-[1.45] text-ink-tertiary">
              Proposals from all plans are pooled. The oldest plan is used first.
            </p>
          </div>
        )}

        {!!data.trace.length && (
          <>
            <SectionLabel>What you&apos;ve used</SectionLabel>
            <div className="rounded-12 bg-surface-1 px-3 py-4 shadow-l1 dark:border dark:border-border dark:shadow-none">
              <div className="flex flex-col">
                {data.trace.map((g, i) => (
                  <div key={g.id} className="flex gap-3">
                    <div className="flex w-3 shrink-0 flex-col items-center">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
                      {i < data.trace.length - 1 && <span className="my-1 w-0.5 flex-1 bg-divider" />}
                    </div>
                    <div className={i < data.trace.length - 1 ? "flex-1 pb-4" : "flex-1"}>
                      <div className="text-13 font-semibold text-ink-primary">{g.title}</div>
                      <div className="mt-1 text-11 leading-[1.5] text-ink-tertiary">
                        {/* Index key: two consumptions of the same kind on one
                            plan produce the SAME sentence ("1 listing slot
                            used" twice), so the text is not unique either. The
                            list is built server-side, is never reordered and
                            never filtered in place, so position is stable. */}
                        {g.lines.map((l, li) => <div key={li}>→ {l}</div>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="rounded-8 bg-surface-2 p-4">
          <div className="flex items-center gap-3">
            <span className="text-ink-secondary"><Icon name="bell" /></span>
            <div className="flex-1">
              <div className="text-13 font-semibold text-ink-primary">
                {reminders ? "Reminders on" : "Reminders off"}
              </div>
              <div className="mt-0.5 text-11 text-ink-tertiary">We&apos;ll notify you 7 days and 1 day before expiry</div>
            </div>
            {/* Persists to `notification_prefs`; the hourly billing cron reads it
                before sending. Optimistic, but reverts if the write fails so the
                switch can never show a preference the server didn't store. */}
            <Toggle
              checked={reminders}
              label="Expiry reminders"
              onChange={(on) => {
                const prev = reminders;
                setReminders(on);
                void billingApi.setExpiryReminders(on).then((res) => {
                  if (res.ok) {
                    setReminders(res.data.expiryReminders);
                    toast.show(res.data.expiryReminders ? "Reminders on" : "Reminders off");
                  } else {
                    setReminders(prev);
                    toast.show("Couldn't save. Try again.");
                  }
                });
              }}
            />
          </div>
        </div>

        <p className="text-11 leading-[1.45] text-ink-tertiary">
            Plans can&apos;t be paused or transferred. Deleting or turning off a requirement still uses its slot.
          </p>
        </div>
      </>
    );
  }

  return (
    <AppShell
      showNav={false}
      header={
        <Header
          left={<BackButton fallback="/plans" />}
          title="My plan"
          centerTitle
          right={<Button variant="icon" aria-label="More options" onClick={() => setMenuOpen(true)}><Icon name="more" /></Button>}
        />
      }
    >
      {body}

      <TopupSheet open={topupOpen} onClose={() => setTopupOpen(false)} onDone={() => void load()} />

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Options">
        <SheetOption label="Payment history" icon={<Icon name="receipt" size={20} />} onClick={() => { setMenuOpen(false); router.push("/payments"); }} />
        <SheetOption label="Download invoices" icon={<Icon name="download" size={20} />} onClick={() => { setMenuOpen(false); router.push("/payments"); }} />
        <SheetOption label="Contact support" icon={<Icon name="message" size={20} />} onClick={() => { setMenuOpen(false); toast.show("Support opens in the settings module"); }} />
      </BottomSheet>
    </AppShell>
  );
}

function PlanSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Skeleton className="h-[60px] w-full rounded-8" />
      <Skeleton className="h-[220px] w-full rounded-12" />
      <Skeleton className="h-[220px] w-full rounded-12" />
    </div>
  );
}

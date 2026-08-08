"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { navigateAfterClose } from "@/lib/hooks/use-back-close";
import { AppShell, Button, BottomSheet, Header, Skeleton, useToast, Icon } from "./ui";
import { billingApi, type PlanCard } from "@/lib/billing/client";
import { BackButton, Banner, Checklist, CouponRow, MicroBadge, OfflineBanner, SectionLabel, SheetOption } from "./primitives";
import { TopupSheet } from "./TopupSheet";

/**
 * P11 S1 — Plans & Pricing.
 *
 * Which cards exist, and at what price, is decided by the server
 * (`/billing/plans` role-filters and prices). This component never hardcodes a
 * plan, a price or a role rule — an admin price edit shows up on next load
 * (Doc2 §4.1), and a Broker simply never receives the ₹9,999 card.
 */

type CouponState = "closed" | "open" | "applied" | "invalid";

function roleLabelPlural(role: string): string {
  return { owner: "Owners", broker: "Brokers", builder: "Builders" }[role] ?? "You";
}

/** The one-line marketing tagline under a plan's price (P11 S1) — shared by the
 * card and the "Recommended for {role}" banner so they can never disagree. */
function planTagline(plan: PlanCard): string {
  if (plan.lifetime && plan.code === "p999") return "Lifetime listing — never expires";
  if (plan.code === "p2999") return "Unlock every requirement";
  return "";
}

export function Plans({ onBuy }: { onBuy?: (code: string) => void }) {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<Awaited<ReturnType<typeof billingApi.plans>> | null>(null);
  const [offline, setOffline] = useState(false);
  const [coupon, setCoupon] = useState<CouponState>("closed");
  const [couponLabel, setCouponLabel] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await billingApi.plans();
    setData(res);
    setOffline(!res.ok && res.error.code === "OFFLINE");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buy = (code: string) => {
    if (onBuy) return onBuy(code);
    // The coupon travels as a code only — the discount itself is recomputed and
    // re-validated server-side at checkout (Doc9 §12).
    const qs = new URLSearchParams({ plan: code });
    if (coupon === "applied" && couponLabel) qs.set("coupon", couponLabel.split(" ")[0]);
    router.push(`/checkout?${qs.toString()}`);
  };

  const applyCoupon = async (code: string) => {
    const plan = data?.ok ? data.data.plans[0]?.code : null;
    if (!plan) return;
    setCouponBusy(true);
    const res = await billingApi.validateCoupon(code, plan);
    setCouponBusy(false);
    if (res.ok && res.data.valid) {
      setCouponLabel(res.data.label ?? null);
      setCoupon("applied");
    } else {
      setCouponError(res.ok ? (res.data.message ?? "Invalid or expired code") : "Invalid or expired code");
      setCoupon("invalid");
    }
  };

  const d = data?.ok ? data.data : null;

  const body = !data ? (
    <PlansSkeleton />
  ) : !d && !offline ? (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-13 text-ink-secondary">Couldn&apos;t load plans.</p>
      <Button variant="outline" onClick={() => void load()}>Retry</Button>
    </div>
  ) : (
    <>
      {offline && <OfflineBanner />}
      <div className="flex flex-col gap-4 p-4">
        {d?.trial && (
          <Banner
            tone="info"
            icon={<Icon name="gift" size={22} />}
            title="You have a trial from HomzList"
            sub={d.trial.summary}
            action={
              <button onClick={() => router.push("/plans/my")} className="tap44 self-center text-13 font-semibold text-accent">
                View
              </button>
            }
          />
        )}

        {d?.activePlan && (
          <Banner
            tone="accent"
            icon={<Icon name="check-circle" size={20} />}
            action={
              <button onClick={() => router.push("/plans/my")} className="tap44 shrink-0 text-13 font-semibold text-accent">
                View details
              </button>
            }
          >
            <span className="text-13 font-semibold text-accent">
              You have an active {d.activePlan.name} plan
            </span>
          </Banner>
        )}

        {/* Recommended-for-role teaser (P11 S1) — the sub-copy is the recommended
            plan's own `subLabel`, never invented text, so it can't drift from
            the plan it's pointing at. */}
        {d?.role && d.recommended && (() => {
          const rec = d.plans.find((p) => p.code === d.recommended);
          if (!rec) return null;
          return (
            <Banner tone="info" icon={<Icon name="user" size={20} />} title={`Recommended for ${roleLabelPlural(d.role)}`} sub={planTagline(rec)} />
          );
        })()}

        {/* Plan cards, recommended first — order comes from the server's role hint. */}
        {orderPlans(d?.plans ?? [], d?.recommended).map((p, i) => (
          <PlanCardView key={p.code} plan={p} recommended={p.code === d?.recommended} mostPopular={i === 0 && p.code === "p999"} onBuy={() => buy(p.code)} />
        ))}

        {!!d?.addOns.length && (
          <>
            <SectionLabel>Add-ons</SectionLabel>
            {d.addOns.map((a) => (
              <div key={a.code} className="rounded-12 bg-surface-2 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-15 font-semibold text-ink-primary">{a.subLabel ?? a.name}</div>
                    <div className="mt-0.5 text-11 text-ink-tertiary">Valid with your active plan</div>
                  </div>
                  <div className="text-17 font-semibold text-ink-primary">{a.price}</div>
                  <Button variant="outline" size="small" onClick={() => setTopupOpen(true)}>Add</Button>
                </div>
              </div>
            ))}
          </>
        )}

        <CouponRow
          state={coupon}
          appliedLabel={couponLabel}
          errorText={couponError}
          busy={couponBusy}
          onOpen={() => setCoupon("open")}
          onApply={(c) => void applyCoupon(c)}
          onRemove={() => {
            setCoupon("closed");
            setCouponLabel(null);
          }}
        />

        <button onClick={() => setCompareOpen(true)} className="tap44 self-center p-2 text-13 font-semibold text-accent">
          Compare all plans
        </button>

        <div className="mt-1 flex flex-col gap-1.5">
          <p className="text-11 leading-[1.45] text-ink-tertiary">
            No refunds after purchase, except technical failures.{" "}
            <button onClick={() => setRefundOpen(true)} className="tap44 font-semibold text-accent">See Refund Policy.</button>
          </p>
          <p className="text-11 leading-[1.45] text-ink-tertiary">Prices include applicable taxes shown at checkout.</p>
          <p className="text-11 leading-[1.45] text-ink-tertiary">Plans don&apos;t auto-renew — you&apos;ll be reminded before expiry.</p>
        </div>
      </div>
    </>
  );

  return (
    <AppShell
      showNav={false}
      header={
        <Header
          left={<BackButton fallback="/" />}
          title="Plans"
          centerTitle
          right={<Button variant="icon" aria-label="More options" onClick={() => setMenuOpen(true)}><Icon name="more" /></Button>}
        />
      }
    >
      {body}

      <CompareSheet open={compareOpen} onClose={() => setCompareOpen(false)} plans={d?.plans ?? []} onChoose={(c) => { setCompareOpen(false); buy(c); }} />
      <RefundPolicySheet open={refundOpen} onClose={() => setRefundOpen(false)} />
      <TopupSheet open={topupOpen} onClose={() => setTopupOpen(false)} onDone={() => void load()} />

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Options">
        <SheetOption label="Payment history" icon={<Icon name="receipt" size={20} />} onClick={() => { setMenuOpen(false); navigateAfterClose(() => router.push("/payments")); }} />
        <SheetOption label="Refund policy" icon={<Icon name="info" size={20} />} onClick={() => { setMenuOpen(false); setRefundOpen(true); }} />
        {/* Was a "Support opens in the settings module" toast; P12 shipped the
            Help Centre, so this opens the real contact form. */}
        <SheetOption label="Contact support" icon={<Icon name="message" size={20} />} onClick={() => { setMenuOpen(false); navigateAfterClose(() => router.push("/help/contact")); }} />
      </BottomSheet>
    </AppShell>
  );
}

/** Recommended card first, then the rest in catalog order (P11 S1). */
function orderPlans(plans: PlanCard[], recommended?: string) {
  if (!recommended) return plans;
  const rec = plans.filter((p) => p.code === recommended);
  return [...rec, ...plans.filter((p) => p.code !== recommended)];
}

function PlanCardView({
  plan, recommended, mostPopular, onBuy,
}: {
  plan: PlanCard; recommended: boolean; mostPopular: boolean; onBuy: () => void;
}) {
  return (
    <div
      className="relative rounded-12 bg-surface-1 p-4 shadow-l1 dark:shadow-none"
      style={{ border: `1.5px solid var(--${recommended ? "accent" : "border"})` }}
    >
      {(recommended || mostPopular) && (
        <MicroBadge className="absolute right-3 top-3">{recommended ? "Recommended" : "Most Popular"}</MicroBadge>
      )}
      <div className="mb-0.5 text-17 font-semibold text-ink-primary">{plan.name}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[32px] font-bold leading-[1.25] text-ink-primary">{plan.price}</span>
        <span className="text-11 text-ink-tertiary">{plan.subLabel}</span>
      </div>
      {plan.lifetime && plan.code === "p999" ? (
        <div className="mb-3.5 mt-1 text-13 font-semibold text-accent">{planTagline(plan)}</div>
      ) : (
        <div className="mb-3.5 mt-1 text-13 text-ink-secondary">{planTagline(plan)}</div>
      )}
      <Checklist items={plan.features} />
      <Button variant={recommended ? "primary" : "outline"} fullWidth className={recommended ? "mt-4" : "mt-4 border-accent text-accent"} onClick={onBuy}>
        Buy Plan
      </Button>
    </div>
  );
}

/** 9-row feature comparison (P11 S1) — sticky feature column, scrolls inside. */
function CompareSheet({
  open, onClose, plans, onChoose,
}: {
  open: boolean; onClose: () => void; plans: PlanCard[]; onChoose: (code: string) => void;
}) {
  /**
   * Every cell has to match `plan_catalog`. The ₹9,999 column used to claim a
   * property listing, a 6-month listing validity and a requirement post;
   * `p9999` grants `listing_quota = 0` and `requirement_quota = 0` (migration
   * 0065 — it sells one project), and since 0067 the only role that can buy it
   * may not post either thing at all. The 6-month window belongs to the
   * PROJECT, and the plan card carries it in its own sub-label.
   */
  const rows: [string, string, string, string][] = [
    ["Property listing", "y", "—", "—"],
    ["Listing validity", "Lifetime", "—", "—"],
    ["Requirement post", "1 × 30 days", "—", "—"],
    ["View others' requirements", "—", "y", "Matched only"],
    ["Proposals included", "10", "30", "Unlimited"],
    ["Project posting", "—", "—", "y"],
    ["Match alerts", "—", "y", "Priority"],
    ["Boost eligible", "y", "y", "y"],
    ["Price", "₹999", "₹2,999", "₹9,999"],
  ];
  const codes = ["p999", "p2999", "p9999"];
  const available = new Set(plans.map((p) => p.code));

  const cell = (v: string) =>
    v === "y" ? <Icon name="check" size={18} strokeWidth={2} className="mx-auto text-accent" />
    : v === "—" ? <span className="text-ink-tertiary">—</span>
    : v;

  return (
    <BottomSheet open={open} onClose={onClose} title="Compare plans" className="h-[90dvh]">
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full border-collapse text-13">
          <thead>
            <tr>
              <th className="sticky left-0 z-[2] min-w-[130px] bg-surface-1 p-3 text-left" />
              <th className="p-3 font-semibold text-ink-primary">₹999</th>
              <th className="p-3 font-semibold text-ink-primary">₹2,999</th>
              <th className="p-3 font-semibold text-ink-primary">₹9,999</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                <td className="sticky left-0 z-[2] min-w-[130px] border-b border-divider bg-surface-1 p-3 text-left text-ink-secondary">{r[0]}</td>
                <td className="border-b border-divider p-3 text-center text-ink-primary">{cell(r[1])}</td>
                <td className="border-b border-divider p-3 text-center text-ink-primary">{cell(r[2])}</td>
                <td className="border-b border-divider p-3 text-center text-ink-primary">{cell(r[3])}</td>
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-[2] bg-surface-1" />
              {codes.map((c) => (
                <td key={c} className="p-2">
                  {/* A plan the server didn't offer this role can't be chosen here either. */}
                  <Button size="small" fullWidth disabled={!available.has(c)} onClick={() => onChoose(c)}>Choose</Button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </BottomSheet>
  );
}

function RefundPolicySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Refund policy">
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-15 leading-[1.45] text-ink-secondary">
          No refunds after purchase, except technical failures where a plan didn&apos;t activate. Boosts are refunded
          automatically if rejected by admin. No refund for unused boost days once a listing is marked sold.
        </p>
        <p className="text-15 leading-[1.45] text-ink-secondary">
          Approved technical-failure refunds are credited to your original payment method within 5–7 working days.
        </p>
      </div>
    </BottomSheet>
  );
}

function PlansSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Skeleton className="h-[60px] w-full rounded-8" />
      <Skeleton className="h-[220px] w-full rounded-12" />
      <Skeleton className="h-[220px] w-full rounded-12" />
    </div>
  );
}

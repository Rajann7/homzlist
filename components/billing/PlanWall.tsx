"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, BottomSheet, Button, Header, Icon, Skeleton } from "./ui";
import { billingApi, type PlanCard } from "@/lib/billing/client";
import { BackButton, CouponRow, MicroBadge } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * P5 S1 — Plan wall ("Choose a plan"), the PAYMENT-FIRST gate.
 *
 * This screen is the *UI* half of payment-first. The real gate is server-side:
 * `POST /listings` requires a reserved slot, so skipping this screen buys
 * nothing (Doc9 §11 "payment-first bypass"). Cards are role-filtered by the
 * server exactly as on the Plans screen.
 */
export function PlanWall({
  onChosen,
  /**
   * Which quota the buyer is actually blocked on. The wall is reached from a
   * specific unfinished action, and only the plans that unblock THAT action
   * belong on it — offering the ₹2,999 Requirement Access plan (zero listing
   * slots) to someone trying to post a listing took their money and returned
   * them to this same wall.
   */
  intent = "listing",
  /** Where checkout returns them — the screen they were interrupted on. */
  next = "/create",
  onBack,
}: {
  onChosen?: (code: string) => void;
  intent?: "listing" | "requirement" | "project";
  next?: string;
  onBack?: () => void;
}) {
  const router = useRouter();

  const [data, setData] = useState<Awaited<ReturnType<typeof billingApi.plans>> | null>(null);
  const [coupon, setCoupon] = useState<"closed" | "open" | "applied" | "invalid">("closed");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponLabel, setCouponLabel] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const load = useCallback(async () => setData(await billingApi.plans()), []);
  useEffect(() => { void load(); }, [load]);

  const choose = (code: string) => {
    if (onChosen) return onChosen(code);
    const qs = new URLSearchParams({ plan: code, next });
    if (couponCode) qs.set("coupon", couponCode);
    router.push(`/checkout?${qs.toString()}`);
  };

  const applyCoupon = async (code: string) => {
    const plan = data?.ok ? data.data.plans[0]?.code : null;
    if (!plan) return;
    setCouponBusy(true);
    const res = await billingApi.validateCoupon(code, plan);
    setCouponBusy(false);
    if (res.ok && res.data.valid) {
      setCouponCode(res.data.code ?? code);
      setCouponLabel(res.data.label ?? null);
      setCoupon("applied");
    } else setCoupon("invalid");
  };

  const d = data?.ok ? data.data : null;

  return (
    <AppShell
      showNav={false}
      header={
        <Header
          left={
            onBack ? (
              <BackButton icon="close" onClick={onBack} fallback="/create" />
            ) : (
              <BackButton icon="close" fallback="/" />
            )
          }
          title="Choose a plan"
          centerTitle
        />
      }
    >
      <div className="p-4 pb-8">
        <div className="mb-5 text-center">
          {/* Same line, same metrics — it just has to name the thing the buyer
              was actually blocked on, now that the wall serves both. */}
          <div className="text-15 leading-[1.4] text-ink-secondary">
            {intent === "requirement"
              ? "Buy a plan to post your requirement"
              : intent === "project"
                ? "Buy a plan to post your project"
                : "Buy a plan to post your listing"}
          </div>
          <div className="mt-1 text-13 leading-[1.3] text-ink-tertiary">One-time payment · Lifetime listing</div>
        </div>

        {!data ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[200px] w-full rounded-12" />
            <Skeleton className="h-[200px] w-full rounded-12" />
          </div>
        ) : !d ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-13 text-ink-secondary">Couldn&apos;t load plans.</p>
            <Button variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : (
          (() => {
            // Only plans that actually grant the blocked quota belong here, and
            // the badge must sit on one of those. `d.recommended` is the role
            // hint from the Plans screen — for a broker it is the ₹2,999
            // Requirement Access plan, which grants neither a listing slot nor
            // a requirement post (it sells proposals).
            const usable = d.plans.filter((p) =>
              intent === "requirement"
                ? p.requirementQuota !== 0
                : intent === "project"
                  ? p.projectQuota !== 0
                  : p.listingQuota !== 0,
            );
            const shown = usable.length ? usable : d.plans;
            const rec = shown.some((p) => p.code === d.recommended)
              ? d.recommended
              : shown[0]?.code;
            return orderPlans(shown, rec).map((p) => (
              <WallCard key={p.code} plan={p} recommended={p.code === rec} onChoose={() => choose(p.code)} />
            ));
          })()
        )}

        <div className="mt-1">
          <CouponRow
            state={coupon}
            appliedLabel={couponLabel}
            errorText="Invalid or expired code"
            busy={couponBusy}
            onOpen={() => setCoupon("open")}
            onApply={(c) => void applyCoupon(c)}
            onRemove={() => { setCoupon("closed"); setCouponCode(null); setCouponLabel(null); }}
          />
        </div>

        <button onClick={() => setCompareOpen(true)} className="tap44 mx-auto mt-5 block text-15 font-semibold text-accent">
          Compare plans
        </button>

        <div className="mt-4 text-center text-11 leading-[1.4] text-ink-tertiary">
          No refunds after purchase. See <a href="/legal/refund" className="text-accent">Refund Policy</a>.
        </div>
      </div>

      <CompareSheet open={compareOpen} onClose={() => setCompareOpen(false)} />
    </AppShell>
  );
}

function orderPlans(plans: PlanCard[], recommended?: string) {
  if (!recommended) return plans;
  return [...plans.filter((p) => p.code === recommended), ...plans.filter((p) => p.code !== recommended)];
}

function WallCard({ plan, recommended, onChoose }: { plan: PlanCard; recommended: boolean; onChoose: () => void }) {
  return (
    <div
      className={cn("relative mb-3 rounded-12 bg-surface-1 p-4", recommended ? "border-[1.5px] border-accent" : "border border-border")}
    >
      {recommended && <MicroBadge className="absolute right-3 top-3">Recommended</MicroBadge>}
      <div className="flex items-baseline gap-1.5">
        <span className="text-24 font-bold text-ink-primary">{plan.price}</span>
        <span className="text-13 text-ink-tertiary">{plan.subLabel}</span>
      </div>
      <div className="my-4 flex flex-col gap-2.5">
        {plan.features.map((f) => (
          <div key={f} className="flex items-start gap-2">
            <Icon name="check" size={17} strokeWidth={2} className="mt-px shrink-0 text-accent" />
            <span className="text-15 leading-[1.35] text-ink-primary">{f}</span>
          </div>
        ))}
      </div>
      <Button variant={recommended ? "primary" : "outline"} fullWidth onClick={onChoose}>Continue</Button>
    </div>
  );
}

function CompareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  /**
   * ₹999 · ₹2,999 · ₹9,999, and every cell has to match `plan_catalog`.
   *
   * The ₹9,999 column used to claim a property listing, a 6-month listing
   * validity and a requirement post. `p9999` grants `listing_quota = 0` and
   * `requirement_quota = 0` — it has sold one project and nothing else since
   * migration 0065 — and since 0067 the only role that can buy it may not post
   * a listing or a requirement at all. Its 6-month window is the PROJECT's, and
   * the card says so in its own sub-label ("per project · 6 months").
   */
  const rows: [string, string, string, string][] = [
    ["Property listing", "✓", "—", "—"],
    ["Listing validity", "Lifetime", "—", "—"],
    ["Requirement post", "1", "—", "—"],
    ["Requirement viewing", "—", "All", "All"],
    ["Proposals included", "10", "30", "∞"],
    ["Project posting", "—", "—", "✓"],
    ["Match alerts", "—", "✓", "✓"],
    ["Boost eligible", "✓", "✓", "✓"],
    ["Price", "₹999", "₹2,999", "₹9,999"],
  ];
  return (
    <BottomSheet open={open} onClose={onClose} title="Compare plans">
      <div className="pb-2">
        {rows.map((r, i) => (
          <div
            key={r[0]}
            className={cn("flex min-h-[44px] items-center border-b border-divider py-2", i === 0 && "border-t border-divider")}
          >
            <span className="flex-[1.4] pl-4 text-13 leading-[1.3] text-ink-secondary">{r[0]}</span>
            {[r[1], r[2], r[3]].map((v, j) => (
              <span
                key={j}
                className={cn(
                  "flex-1 text-center text-13 leading-[1.3] text-ink-primary",
                  i === rows.length - 1 ? "font-bold" : "font-semibold",
                  j === 2 && "pr-4",
                )}
              >
                {v}
              </span>
            ))}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

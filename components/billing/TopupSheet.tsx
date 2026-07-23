"use client";

import { useCallback, useEffect, useState } from "react";
import { BottomSheet, Button, Icon, Skeleton, useToast } from "./ui";
import { billingApi, newIdempotencyKey, type PlanCard } from "@/lib/billing/client";
import { CheckDraw, Checklist, CouponRow } from "./primitives";
import { payWithRazorpay } from "./pay";

/**
 * P11 S6 — Top-up sheet (+10 proposals).
 *
 * Two variants, as designed:
 *  - standalone (from Plans / My plan): success renders INSIDE the sheet with
 *    the new balance, then "Done".
 *  - inline (opened mid proposal-flow at 0 balance): on success the sheet closes
 *    itself and the pending proposal is sent by the caller's `onDone`.
 *
 * The balance shown is always the server's number, re-read when the sheet opens
 * and again after payment — never a locally incremented count.
 */
export function TopupSheet({
  open,
  onClose,
  onDone,
  autoSend,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after a successful top-up. In the inline variant, sends the proposal. */
  onDone?: (newBalance: number) => void;
  autoSend?: boolean;
}) {
  const toast = useToast();
  const [data, setData] = useState<{ addOn: PlanCard | null; balance: number; balancePct: number; expiryNote: string } | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<{ newBalance: number } | null>(null);
  const [coupon, setCoupon] = useState<"closed" | "open" | "applied" | "invalid">("closed");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponLabel, setCouponLabel] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await billingApi.topup();
    if (res.ok) setData(res.data);
  }, []);

  useEffect(() => {
    if (!open) {
      setDone(null);
      setPaying(false);
      setCoupon("closed");
      setCouponCode(null);
      return;
    }
    void load();
  }, [open, load]);

  const applyCoupon = async (code: string) => {
    if (!data?.addOn) return;
    setCouponBusy(true);
    const res = await billingApi.validateCoupon(code, data.addOn.code);
    setCouponBusy(false);
    if (res.ok && res.data.valid) {
      setCouponCode(res.data.code ?? code);
      setCouponLabel(res.data.label ?? null);
      setCoupon("applied");
    } else setCoupon("invalid");
  };

  const pay = async () => {
    if (!data?.addOn) return;
    setPaying(true);
    const result = await payWithRazorpay({
      intent: { planId: data.addOn.code, couponCode, idempotencyKey: newIdempotencyKey() },
      onFailure: (msg) => toast.show(msg),
    });
    setPaying(false);
    if (result.status !== "success") return;

    // Re-read the balance from the server — never `balance + 10` locally.
    const fresh = await billingApi.topup();
    const newBalance = fresh.ok ? fresh.data.balance : data.balance;

    if (autoSend) {
      onClose();
      onDone?.(newBalance);
      return;
    }
    setDone({ newBalance });
    onDone?.(newBalance);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Add proposals">
      {!data ? (
        <div className="flex flex-col gap-4 pb-4">
          <Skeleton className="h-[150px] w-full rounded-12" />
          <Skeleton className="h-11 w-full rounded-8" />
        </div>
      ) : done ? (
        <div className="flex flex-col gap-4 pb-2">
          <div className="pb-2 pt-4 text-center">
            <div className="flex justify-center"><CheckDraw /></div>
            <div className="mt-2 text-17 font-semibold text-ink-primary">
              {data.addOn?.subLabel?.replace("+", "") ?? "Proposals"} added
            </div>
            <div className="mt-1 text-11 text-ink-tertiary">New balance: {done.newBalance} proposals</div>
          </div>
          <Button fullWidth onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          <div className="rounded-12 bg-accent-soft p-4 text-center">
            <div className="flex justify-center text-accent"><Icon name="send" size={32} /></div>
            <div className="mt-2 text-20 font-bold text-ink-primary">{data.addOn?.subLabel ?? "+10 proposals"}</div>
            <div className="text-[32px] font-bold leading-[1.25] text-ink-primary">{data.addOn?.price ?? "—"}</div>
            <div className="text-11 text-ink-tertiary">Valid with your active plan</div>
          </div>

          <Checklist items={["Use on any requirement", data.expiryNote]} />

          <div className="flex flex-col gap-2 rounded-8 bg-surface-2 px-3.5 py-3">
            <div className="flex justify-between">
              <span className="text-13 text-ink-secondary">Current balance</span>
              <span className="text-13 font-semibold text-ink-primary">{data.balance} proposals</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent transition-[width] duration-[600ms] ease-out-quart" style={{ width: `${data.balancePct}%` }} />
            </div>
          </div>

          <CouponRow
            state={coupon}
            appliedLabel={couponLabel}
            errorText="Invalid or expired code"
            busy={couponBusy}
            onOpen={() => setCoupon("open")}
            onApply={(c) => void applyCoupon(c)}
            onRemove={() => { setCoupon("closed"); setCouponCode(null); }}
          />

          <Button fullWidth loading={paying} onClick={() => void pay()}>
            Pay {data.addOn?.price ?? ""}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, Button, Header, Icon, Skeleton, Spinner, useToast } from "./ui";
import {
  billingApi, newIdempotencyKey,
  type CheckoutIntent, type EnabledMethods, type PayerView, type QuoteView,
} from "@/lib/billing/client";
import { GSTIN_RE } from "@/lib/billing/money";
import { BackButton, CouponRow, Radio } from "./primitives";
import { payWithRazorpay, pollOrder } from "./pay";
import { cn } from "@/lib/utils";
import { usePublicOrigin } from "@/lib/hooks/use-public-href";

/**
 * P6 S2 — Checkout.
 *
 * The order summary is a QUOTE fetched from the server; nothing on this screen
 * computes an amount. Coupon and GSTIN are inputs the server re-validates when
 * the order is created, so editing the DOM changes what you see and nothing you
 * pay (Doc9 §12).
 *
 * States built: form · processing · pending-UPI (auto-poll + "safe to close") ·
 * failed (+ retry) · double-payment guard.
 */

type Phase = "form" | "paying" | "pending" | "failed" | "done";

/**
 * The rows designs/P6 S2 draws, keyed to the gateway flag that decides whether
 * each one can actually be charged. The list is never rendered as-is: a method
 * the Razorpay account has switched off is dropped, because offering it opens a
 * sheet that doesn't contain it (found live 2026-07-28 — UPI was off account-side
 * while this screen defaulted every user to it).
 */
const METHODS: { key: string; title: string; sub: string; flag: keyof EnabledMethods }[] = [
  { key: "upi", title: "UPI · GPay, PhonePe, Paytm", sub: "Instant", flag: "upi" },
  { key: "card", title: "Credit / Debit Card", sub: "Visa, Mastercard, RuPay", flag: "card" },
  { key: "net", title: "Net Banking", sub: "All major banks", flag: "netbanking" },
];

export function Checkout() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  // Legal links leave for the public host — see lib/utils `publicOrigin`.
  const publicBase = usePublicOrigin();

  const planId = params.get("plan") ?? "";
  const listingId = params.get("listing") ?? undefined;
  // Boost subjects can be a listing, project or requirement (Doc2 §13). The
  // server validates the value and re-checks ownership either way.
  const subjectKind = (params.get("kind") ?? undefined) as "listing" | "project" | "requirement" | undefined;
  const targeting = params.get("targeting") ?? undefined;
  const targetLabel = params.get("targetLabel") ?? undefined;
  const next = params.get("next") ?? undefined;

  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [enabled, setEnabled] = useState<EnabledMethods | null>(null);
  const [payer, setPayer] = useState<PayerView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [failReason, setFailReason] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ minutes: number } | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const [coupon, setCoupon] = useState<"closed" | "open" | "applied" | "invalid">("closed");
  const [couponCode, setCouponCode] = useState<string | null>(params.get("coupon"));
  const [couponLabel, setCouponLabel] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const [gstinOpen, setGstinOpen] = useState(false);
  const [gstin, setGstin] = useState("");
  const [gstinError, setGstinError] = useState<string | null>(null);
  // No default until the server says what is live — picking "upi" up front is how
  // the dead-method bug happened. `methodRows` seeds it from the first row that
  // survives the gateway filter.
  const [method, setMethod] = useState<string | null>(null);

  // One key per user-initiated attempt: a double-tap on Pay replays the same
  // order instead of creating a second one (Doc7 §0 idempotency).
  const idemKey = useRef(newIdempotencyKey());

  /**
   * Price the screen from the server. `/billing/quote` runs the SAME computation
   * `/billing/checkout` will, so the breakdown shown here and the amount actually
   * captured can never diverge — the Pay button always states the real total.
   */
  const loadQuote = useCallback(async (code: string | null) => {
    if (!planId) {
      setLoadError("Nothing to pay for");
      return;
    }
    const res = await billingApi.quote(planId, code);
    if (!res.ok) {
      setLoadError(
        res.error.code === "OFFLINE" ? "You're offline"
        : res.error.code === "FORBIDDEN" ? "That plan isn't available for your account"
        : res.error.code === "NOT_FOUND" ? "That plan is no longer available"
        : "Couldn't load checkout",
      );
      return;
    }
    setLoadError(null);
    setQuote(res.data.quote);
    setEnabled(res.data.methods);
    setPayer(res.data.payer);
  }, [planId]);

  useEffect(() => {
    void loadQuote(couponCode);
  }, [loadQuote, couponCode]);

  // Only the methods the gateway will actually accept. Until the quote lands we
  // show none rather than guessing. Memoised because the effect below depends on
  // it — a fresh array each render would re-run that effect on every render.
  const methodRows = useMemo(
    () => (enabled ? METHODS.filter((m) => enabled[m.flag]) : []),
    [enabled],
  );

  useEffect(() => {
    if (!method && methodRows.length) setMethod(methodRows[0].key);
  }, [method, methodRows]);

  // Declared ABOVE the polling effect that calls it, and memoised, so the
  // effect can depend on it honestly instead of suppressing the dependency
  // check — the previous order meant the effect closed over a `finish` that had
  // not been initialised yet at the time the effect was created.
  const finish = useCallback((id?: string) => {
    setPhase("done");
    const qs = new URLSearchParams({ kind: listingId ? "boost" : "plan" });
    if (id) qs.set("order", id);
    if (next) qs.set("next", next);
    router.replace(`/checkout/success?${qs.toString()}`);
  }, [listingId, next, router]);

  // Auto-poll a pending (UPI-collect) order. The page is safe to close — the
  // webhook activates regardless — but polling gets the user there sooner.
  useEffect(() => {
    if (phase !== "pending" || !orderId) return;
    let stop = false;
    const tick = async () => {
      const r = await pollOrder(orderId);
      if (stop) return;
      if (r.status === "success") finish(r.orderId);
      else if (r.status === "failed") { setPhase("failed"); setFailReason(r.reason ?? null); }
      else timer = setTimeout(tick, 5000);
    };
    let timer = setTimeout(tick, 5000);
    return () => { stop = true; clearTimeout(timer); };
  }, [phase, orderId, finish]);

  /**
   * Apply through `/billing/quote` rather than the validate endpoint, so the
   * summary the user sees is re-priced by the same code path that will charge
   * them. A rejected code re-prices at full amount and says so.
   */
  const applyCoupon = async (code: string) => {
    setCouponBusy(true);
    const res = await billingApi.quote(planId, code);
    setCouponBusy(false);
    if (res.ok && !res.data.quote.couponError) {
      setQuote(res.data.quote);
      setCouponCode(res.data.quote.couponCode);
      setCouponLabel(`${res.data.quote.couponCode} applied`);
      setCoupon("applied");
    } else {
      setCouponCode(null);
      setCoupon("invalid");
    }
  };

  const pay = async () => {
    if (gstin && !GSTIN_RE.test(gstin.toUpperCase())) {
      setGstinError("That GSTIN doesn't look right");
      return;
    }
    setGstinError(null);
    setPhase("paying");

    const intent: CheckoutIntent = {
      planId,
      listingId,
      subjectKind,
      targeting,
      targetLabel,
      couponCode,
      gstin: gstin ? gstin.toUpperCase() : null,
      idempotencyKey: idemKey.current,
    };

    const res = await payWithRazorpay({
      intent,
      method: method ?? undefined,
      // Server-supplied, so the sheet doesn't re-ask for the phone/email we hold.
      prefill: {
        name: payer?.name ?? undefined,
        contact: payer?.contact ?? undefined,
        email: payer?.email ?? undefined,
      },
      onFailure: (m) => toast.show(m),
    });
    setDuplicate(res.duplicateWarning ?? null);
    setOrderId(res.orderId ?? null);

    if (res.status === "success") finish(res.orderId);
    else if (res.status === "pending") setPhase("pending");
    else if (res.status === "cancelled") setPhase("form");
    else { setPhase("failed"); setFailReason(res.reason ?? null); }
  };

  // ---- pending-UPI state (auto-poll, "safe to close") ---------------------
  if (phase === "pending") {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <svg width="88" height="88" viewBox="0 0 96 96" fill="none" stroke="var(--info)" strokeWidth="2" aria-hidden="true">
            <circle cx="48" cy="48" r="34" />
            <path d="M48 30v18l12 8" strokeLinecap="round" />
          </svg>
          <div className="mt-5 text-20 font-bold text-ink-primary">Payment processing…</div>
          <p className="mt-2 max-w-[280px] text-15 leading-[1.45] text-ink-secondary">
            This can take up to 10 minutes. You can safely close this page — we&apos;ll notify you when it&apos;s done.
          </p>
          <Spinner size={24} className="mt-4 text-accent" />
          <Button
            variant="outline"
            className="mt-5 w-auto px-6"
            onClick={async () => {
              if (!orderId) return;
              const r = await pollOrder(orderId);
              if (r.status === "success") finish(r.orderId);
              else toast.show("Still processing");
            }}
          >
            Check status
          </Button>
          <button onClick={() => router.push(next ?? "/")} className="tap44 mt-3.5 text-15 font-semibold text-accent">
            Go to My Listings
          </button>
        </div>
      </Shell>
    );
  }

  // ---- failed state -------------------------------------------------------
  if (phase === "failed") {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <span className="grid h-[88px] w-[88px] place-items-center rounded-full bg-error-soft">
            <Icon name="x-circle" size={44} strokeWidth={2} className="text-error" />
          </span>
          <div className="mt-5 text-20 font-bold text-ink-primary">Payment failed</div>
          <p className="mt-2 max-w-[290px] text-15 leading-[1.45] text-ink-secondary">
            Your money wasn&apos;t deducted. If it was, it will be refunded automatically within 5–7 days.
          </p>
          {failReason && <p className="mt-2 text-11 text-ink-tertiary">{failReason}</p>}
          <Button
            className="mt-5 w-auto px-7"
            onClick={() => {
              // A retry is a NEW attempt, so it gets a fresh idempotency key.
              idemKey.current = newIdempotencyKey();
              setPhase("form");
            }}
          >
            Retry Payment
          </Button>
          {/* Was a "Support opens in the settings module" toast — a dead button
              on the one screen where a user has just lost a payment. P12 shipped
              the Help Centre, so it opens the real contact form. */}
          <button onClick={() => router.push("/help/contact")} className="tap44 mt-3.5 text-15 font-semibold text-accent">
            Contact Support
          </button>
          <div className="mt-3.5 text-11 text-ink-tertiary">Your listing is saved as a draft.</div>
        </div>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-13 text-ink-secondary">{loadError}</p>
          <Button variant="outline" onClick={() => router.push("/plans")}>Back to Plans</Button>
        </div>
      </Shell>
    );
  }

  if (!quote) return <CheckoutSkeleton />;

  // ---- form ---------------------------------------------------------------
  return (
    <Shell>
      <div className="flex flex-col p-4 pb-24">
        {duplicate && (
          <div className="mb-3.5 flex items-center gap-2 rounded-8 bg-warning-soft px-3.5 py-3">
            <span className="flex-1 text-13 leading-[1.35] text-ink-primary">
              You already paid for this plan {duplicate.minutes} minutes ago. Please wait before paying again.
            </span>
            <button
              onClick={async () => {
                if (!orderId) return;
                const r = await pollOrder(orderId);
                toast.show(r.status === "success" ? "Payment confirmed" : "Still processing");
              }}
              className="text-13 font-semibold text-accent"
            >
              Check status
            </button>
          </div>
        )}

        <div className="rounded-12 border border-border bg-surface-1 p-4">
          <div className="text-17 font-semibold text-ink-primary">{quote.planName}</div>
          {quote.planSub && <div className="mt-1 text-11 text-ink-tertiary">{quote.planSub}</div>}
          <div className="my-3.5 flex flex-col gap-2">
            {quote.features.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <Icon name="check" size={15} strokeWidth={2} className="shrink-0 text-accent" />
                <span className="text-13 text-ink-primary">{f}</span>
              </div>
            ))}
          </div>
          <div className="my-3 h-px bg-divider" />
          {quote.rows.map((r) => (
            <div key={r.k} className="flex justify-between py-1">
              <span className={cn(r.kind === "total" ? "text-17 font-semibold text-ink-primary" : r.kind === "discount" ? "text-13 text-accent" : "text-13 text-ink-secondary")}>
                {r.k}
              </span>
              <span className={cn(r.kind === "total" ? "text-20 font-bold text-accent" : r.kind === "discount" ? "text-13 font-semibold text-accent" : "text-13 font-semibold text-ink-primary")}>
                {r.v}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3">
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

        {!gstinOpen ? (
          <button onClick={() => setGstinOpen(true)} className="tap44 mt-3.5 self-start text-13 font-semibold text-accent">
            Add GSTIN for business invoice
          </button>
        ) : (
          <div className="mt-3">
            <input
              value={gstin}
              onChange={(e) => { setGstin(e.target.value.toUpperCase()); setGstinError(null); }}
              placeholder="GSTIN"
              maxLength={15}
              autoCapitalize="characters"
              // 48px to match the coupon row above it (designs/P6 S2)
              className="h-12 w-full rounded-8 border border-border bg-surface-2 px-3.5 text-15 text-ink-primary outline-none focus:border-accent"
            />
            <div className={cn("mt-1.5 text-11", gstinError ? "text-error" : "text-ink-tertiary")}>
              {gstinError ?? "For claiming input tax credit."}
            </div>
          </div>
        )}

        <div className="mb-2 mt-5 text-13 font-semibold text-ink-secondary">Payment method</div>
        <div className="flex flex-col gap-2">
          {methodRows.map((m) => (
            <button
              key={m.key}
              onClick={() => setMethod(m.key)}
              className={cn(
                "flex h-[52px] items-center gap-3 rounded-8 border bg-surface-2 px-3.5 text-left",
                method === m.key ? "border-accent" : "border-border",
              )}
            >
              <Radio on={method === m.key} />
              <span className="flex-1">
                <span className="block text-15 font-semibold text-ink-primary">{m.title}</span>
                <span className="mt-0.5 block text-11 text-ink-tertiary">{m.sub}</span>
              </span>
            </button>
          ))}
        </div>
        {!methodRows.length && (
          <div className="rounded-8 bg-warning-soft px-3.5 py-3 text-13 leading-[1.35] text-ink-primary">
            Online payments are temporarily unavailable. Please try again shortly.
          </div>
        )}
        <div className="mt-2.5 text-11 leading-[1.4] text-ink-tertiary">Payments are processed securely by Razorpay.</div>
        <div className="mt-4 text-11 leading-[1.4] text-ink-tertiary">
          By paying you agree to our <a href={`${publicBase}/legal/terms`} className="text-accent">Terms</a> and{" "}
          <a href={`${publicBase}/legal/refund`} className="text-accent">No-Refund Policy</a>.
        </div>
      </div>

      <div className="sticky bottom-0 z-sticky mt-auto border-t border-divider bg-page p-4 safe-bottom">
        {/* No live method = nothing this order could be charged with, so the
            button says so instead of opening an empty sheet. */}
        <Button fullWidth loading={phase === "paying"} disabled={!method} onClick={() => void pay()}>
          Pay {quote.totalLabel}
        </Button>
      </div>
    </Shell>
  );
}

/**
 * Loading state, shared with the route's Suspense fallback so the pre-hydration
 * frame shows the designed skeleton instead of blank space.
 */
export function CheckoutSkeleton() {
  return (
    <Shell>
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-[220px] w-full rounded-12" />
        <Skeleton className="h-[160px] w-full rounded-12" />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      showNav={false}
      className="flex flex-col"
      header={
        <Header
          left={<BackButton fallback="/plans" />}
          title="Checkout"
          centerTitle
          right={<span className="grid h-11 w-11 place-items-center text-ink-tertiary"><Icon name="lock" size={18} strokeWidth={1.7} /></span>}
        />
      }
    >
      {children}
    </AppShell>
  );
}

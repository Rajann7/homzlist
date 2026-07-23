"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, Button, Icon } from "./ui";
import { CheckDraw } from "./primitives";

/**
 * P6 S3 — Success.
 *
 * Reached only after the SERVER confirmed activation (`/billing/verify` or the
 * webhook). It shows no entitlement of its own — the plan/boost is already
 * granted server-side, and the next screen re-reads it (Doc7 §11).
 */

const COPY: Record<string, { title: string; sub: string; live: string }> = {
  plan: {
    title: "Payment successful",
    sub: "Your plan is active. You can post your listing now.",
    live: "Plan activated",
  },
  boost: {
    title: "Boost submitted",
    sub: "Your boost starts as soon as our team approves it — usually within a few hours.",
    live: "Boost goes live",
  },
  listing: {
    title: "Listing submitted",
    sub: "Your listing is under review. We usually approve within 24 hours.",
    live: "Live on HomzList",
  },
};

export function Success() {
  const router = useRouter();
  const params = useSearchParams();
  const kind = params.get("kind") ?? "plan";
  const next = params.get("next") ?? "/plans/my";
  const copy = COPY[kind] ?? COPY.plan;

  // A plan is live the moment payment clears — only a boost waits on approval,
  // so only the boost variant shows a pending step (Doc2 §13).
  const steps =
    kind === "boost"
      ? [
          { label: "Paid", sub: "Just now", state: "done" as const },
          { label: "Under review", sub: "Usually within a few hours", state: "current" as const },
          { label: copy.live, sub: "You'll be notified", state: "todo" as const },
        ]
      : [
          { label: "Payment received", sub: "Just now", state: "done" as const },
          { label: copy.live, sub: "Ready to use", state: "done" as const },
        ];

  const footNote =
    kind === "boost"
      ? "You'll get a notification and email when your boost is approved."
      : "Your invoice has been emailed to you.";

  return (
    <AppShell showNav={false} className="flex flex-col">
      <div className="flex flex-1 flex-col items-center px-6 pb-6 pt-12 text-center">
        <CheckDraw />
        <div className="mt-5 text-24 font-bold text-ink-primary">{copy.title}</div>
        <p className="mt-2 max-w-[290px] text-15 leading-[1.45] text-ink-secondary">{copy.sub}</p>

        <div className="mb-2 mt-6 w-full max-w-[320px] text-left">
          {steps.map((s, i) => (
            <div key={s.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={
                    s.state === "done"
                      ? "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent"
                      : s.state === "current"
                        ? "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-accent bg-page"
                        : "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-3"
                  }
                  style={s.state === "current" ? { animation: "hz-pulse 1.6s infinite" } : undefined}
                >
                  {s.state === "done" && <Icon name="check" size={12} strokeWidth={3} className="text-white" />}
                </span>
                {i < steps.length - 1 && (
                  <span className={`w-0.5 flex-1 ${s.state === "done" ? "bg-accent" : "bg-surface-3"}`} style={{ minHeight: 26 }} />
                )}
              </div>
              <div className="pb-5">
                <div className="text-13 font-semibold text-ink-primary">{s.label}</div>
                <div className="mt-0.5 text-11 text-ink-tertiary">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex w-full max-w-[320px] items-center gap-2 rounded-8 bg-surface-2 px-3.5 py-3">
          <Icon name="info" size={16} strokeWidth={1.7} className="shrink-0 text-ink-tertiary" />
          <span className="text-left text-11 leading-[1.4] text-ink-tertiary">{footNote}</span>
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-divider bg-page p-4 safe-bottom">
        <Button fullWidth onClick={() => router.replace(next)}>
          {kind === "boost" ? "View boost status" : "Go to My plan"}
        </Button>
        <button onClick={() => router.replace("/payments")} className="tap44 mx-auto mt-3 block text-15 font-semibold text-accent">
          View invoice
        </button>
      </div>
    </AppShell>
  );
}

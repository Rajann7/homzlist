"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, Button, Icon } from "@/components/billing/ui";
import { CheckDraw } from "@/components/billing/primitives";
import { cn } from "@/lib/utils";

/**
 * P6 S3 — submission success (distinct from the *payment* success in Module 3).
 *
 * This is the "we've got it, an admin is looking" screen: check animation, the
 * 3-node review timeline, and the variant copy for listing / requirement /
 * project. Nothing here is fetched — it reports the transition the caller just
 * completed, and every real status afterwards comes from My Listings.
 */

type Kind = "listing" | "requirement" | "project";

const COPY: Record<Kind, { title: string; body: string; live: string; cta: string; href: string }> = {
  listing: {
    title: "Listing submitted",
    body: "Your listing is under review. We usually approve within 24 hours.",
    live: "Live on HomzList",
    cta: "Go to My Listings",
    href: "/listings",
  },
  requirement: {
    title: "Requirement submitted",
    body: "Requirements are reviewed within 24 hours. We'll start matching as soon as it's live.",
    live: "Live & matching",
    cta: "Go to My Requirements",
    href: "/requirements",
  },
  project: {
    title: "Project submitted",
    body: "Your 6-month project listing activates after approval. We usually review within 24 hours.",
    live: "Live on HomzList",
    cta: "Go to My Listings",
    href: "/listings",
  },
};

export function SubmissionSuccess() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("kind");
  const kind: Kind = raw === "requirement" || raw === "project" ? raw : "listing";
  const copy = COPY[kind];

  /**
   * designs/P6 S3 puts a "Preview" text-link under the primary CTA, and it was
   * missing — so the screen that says "here's what you just posted" had no way
   * to actually show it. Requirements have no preview screen, and the link only
   * appears when the caller passed the id it needs.
   */
  const id = params.get("id");
  const previewHref =
    !id || kind === "requirement"
      ? null
      : kind === "project"
      ? `/create/preview?project=${id}`
      : `/create/preview?listing=${id}`;

  return (
    <AppShell showNav={false} className="flex flex-col">
      <div className="flex flex-1 flex-col items-center px-6 pb-6 pt-12 text-center">
        <CheckDraw size={72} />

        <h1 className="mt-5 text-24 font-bold leading-[1.25] text-ink-primary">{copy.title}</h1>
        <p className="mt-2 max-w-[290px] text-15 leading-[1.45] text-ink-secondary">{copy.body}</p>

        {/* 3-node vertical stepper */}
        <div className="mb-2 mt-6 w-full max-w-[320px] text-left">
          <Step done label="Submitted" sub="Just now" />
          <Step current label="Under review" sub="Usually within 24 hours" />
          <Step label={copy.live} sub="You'll be notified" last />
        </div>

        <div className="flex w-full max-w-[320px] items-center gap-2 rounded-8 bg-surface-2 px-3.5 py-3">
          <Icon name="info" size={16} className="shrink-0 text-ink-tertiary" />
          <p className="text-left text-11 leading-[1.4] text-ink-tertiary">
            You&apos;ll get a notification and email when it&apos;s approved.
          </p>
        </div>
      </div>

      {/* design: the CTA is a sticky bar, not the last item in the scroll flow */}
      <div className="sticky bottom-0 z-sticky mt-auto border-t border-border bg-surface-1 px-4 py-3 shadow-l2 safe-bottom">
        <Button fullWidth onClick={() => router.replace(copy.href)}>{copy.cta}</Button>
        {previewHref && (
          <button
            onClick={() => router.push(previewHref)}
            className="mt-2.5 h-11 w-full text-15 font-semibold leading-none text-accent"
          >
            {kind === "project" ? "Preview project" : "Preview listing"}
          </button>
        )}
      </div>
    </AppShell>
  );
}

function Step({
  label, sub, done, current, last,
}: { label: string; sub: string; done?: boolean; current?: boolean; last?: boolean }) {
  return (
    <div className="flex gap-3 text-left">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-full",
            done && "bg-accent",
            current && "border-2 border-accent bg-page",
            !done && !current && "bg-surface-3",
          )}
        >
          {done && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 6.2 4.8 8.5 9.5 3.8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {current && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
        </span>
        {!last && <span className={cn("w-0.5 flex-1", done ? "bg-accent" : "bg-surface-3")} style={{ minHeight: 26 }} />}
      </div>

      <div className={cn("pb-5", last && "pb-0")}>
        <div className={cn("text-13 font-semibold", done || current ? "text-ink-primary" : "text-ink-tertiary")}>
          {label}
        </div>
        <div className="mt-0.5 text-11 text-ink-tertiary">{sub}</div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Header, Wordmark } from "@/components/nav/Header";
import { BackButton } from "@/components/billing/primitives";

/**
 * P12's two header variants for the `g-ok` screens (legal, blog): a signed-in
 * user sees the ordinary titled appbar, a guest sees the wordmark with the
 * document name trailing right.
 *
 * The design switches these with a `body.guest` class; here the choice is made
 * from the server-resolved session, so it can't be flipped by a client that
 * wants the logged-in chrome.
 */
export function LegalHeader({
  title,
  guest,
  fallback = "/legal",
  right,
}: {
  title: string;
  guest: boolean;
  fallback?: string;
  right?: React.ReactNode;
}) {
  if (guest) {
    return (
      <Header
        left={<BackButton fallback={fallback} />}
        title={
          <Link href="/" className="chrome">
            <Wordmark className="text-17" />
          </Link>
        }
        right={
          right ?? <span className="chrome pr-3 text-13 font-semibold text-ink-primary">{title}</span>
        }
      />
    );
  }
  return <Header left={<BackButton fallback={fallback} />} title={title} right={right} />;
}

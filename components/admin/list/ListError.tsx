"use client";

/**
 * The state every admin list was missing.
 *
 * `useAdminList` has always returned an `error`, and not one of the 21 screens
 * read it: a failing endpoint rendered the ordinary empty table, so an outage
 * read as "you have no users" — with the screen header still showing the real
 * total two lines above the words "0 users". An admin cannot tell "nothing is
 * here" from "we could not ask".
 *
 * Built out of the design system's own parts (`AdminIcon`, `Btn`, Doc1 tokens)
 * and shaped like `LockGate`, which is the design's existing "this screen has
 * something to say instead of rows" surface. The design does not draw a list
 * error of its own — flagged for Rajan rather than invented in a new visual
 * language.
 */

import { AdminIcon, Btn } from "@/components/admin/ds";

/**
 * Why it failed, in the admin's words. The codes are the API's own
 * (`lib/api`), plus the two the hook synthesises for a transport failure.
 */
const MESSAGE: Record<string, { title: string; body: string }> = {
  OFFLINE: {
    title: "You're offline",
    body: "This list needs a connection. It will load as soon as you're back.",
  },
  UNAUTHORIZED: {
    title: "Your session ended",
    body: "Sign in again to load this list.",
  },
  FORBIDDEN: {
    title: "You don't have access to this list",
    body: "Ask a Super Admin if you need it.",
  },
  RATE_LIMITED: {
    title: "Too many requests",
    body: "Give it a moment and try again.",
  },
  MAINTENANCE: {
    title: "HomzList is under maintenance",
    body: "Lists are read-only until the window closes.",
  },
};

const FALLBACK = {
  title: "Couldn't load this list",
  body: "Something went wrong on our side. Nothing has been changed.",
};

export function ListError({ code, onRetry }: { code: string; onRetry: () => void }) {
  const { title, body } = MESSAGE[code] ?? FALLBACK;
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "72px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 999,
          background: "var(--s2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink3)",
        }}
      >
        <AdminIcon name="alert" size={32} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink1)" }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--ink2)", maxWidth: 340 }}>{body}</div>
      <Btn label="Try again" kind="outline" onClick={onRetry} style={{ marginTop: 4 }} />
    </div>
  );
}

"use client";

/**
 * A31's persistent banner, INSIDE the user app (Doc5 A31: "Full user-app shell
 * in frame + persistent top banner").
 *
 * The design lock is not broken by this: it renders only when the request
 * carries a live impersonation session, so a real user never sees a pixel of
 * it. What it changes for an admin is the thing the whole feature turns on —
 * without it, a tab that looks exactly like the user's own app has nothing on
 * screen saying it is not yours, and "which window am I in" becomes a question
 * you answer by clicking something.
 *
 * The copy and colours are the admin overlay's own (template 1761), so the
 * banner in the panel and the banner in the tab say the same thing.
 *
 * "Exit" ends the session on the SERVER; the read-only claim lives in the
 * signed token, so closing the tab without exiting changes nothing an attacker
 * could use — the session still expires on its own.
 */

import { useState } from "react";

export function ImpersonationBanner({
  name,
  staffName,
  startedAt,
}: {
  name: string;
  staffName: string;
  startedAt: string;
}) {
  const [busy, setBusy] = useState(false);
  const minutes = Math.max(1, Math.round((Date.now() - new Date(startedAt).getTime()) / 60_000));

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 200,
        background: "#F5A623",
        color: "#111",
        fontSize: 13,
        fontWeight: 600,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span style={{ flex: 1, minWidth: 0 }}>
        Viewing as {name} (read-only) · {staffName} · Started {minutes} min ago
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/v1/impersonate/exit", { method: "POST", cache: "no-store" }).catch(
            () => undefined,
          );
          window.close();
          // window.close() only works on a tab this script opened; if the admin
          // navigated here by hand it stays put, so land somewhere honest.
          window.location.href = "/login";
        }}
        style={{
          height: 32,
          padding: "0 12px",
          borderRadius: 8,
          border: "none",
          background: "#111",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          flex: "none",
        }}
      >
        {busy ? "Exiting…" : "Exit session"}
      </button>
    </div>
  );
}

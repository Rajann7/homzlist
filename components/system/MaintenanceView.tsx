"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Wordmark } from "@/components/nav/Header";
import { useToast } from "@/components/ui/Toast";
import { systemApi } from "@/lib/support/client";

/**
 * P12 S8 — the maintenance page.
 *
 * Message, ETA and start time are the admin-set row in maintenance_settings, so
 * the "Estimated: 30 minutes" chip counts down against a real ETA. "Try again"
 * re-reads that row: if maintenance has been switched off the page reloads into
 * the app, which is the only honest thing that button can do.
 */
export function MaintenanceView({
  message,
  minutesLeft,
  startedAt,
}: {
  message: string;
  minutesLeft: number | null;
  startedAt: string | null;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    const r = await systemApi.maintenance();
    setBusy(false);
    if (r.ok && !r.data.enabled) {
      window.location.href = "/";
      return;
    }
    toast.show("Still under maintenance — try again soon");
  };

  const eta =
    minutesLeft == null
      ? null
      : minutesLeft >= 60
        ? `${Math.round(minutesLeft / 60)} hour${Math.round(minutesLeft / 60) === 1 ? "" : "s"}`
        : `${minutesLeft} minutes`;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-column flex-col bg-page">
      <div className="flex min-h-[70vh] flex-col items-center gap-2 px-8 pt-20 text-center">
        <Icon name="wrench" size={96} strokeWidth={1} className="text-ink-tertiary" />
        <p className="mt-4 text-20 font-bold text-ink-primary">We&apos;ll be back shortly</p>
        <p className="max-w-[300px] text-15 text-ink-secondary">{message}</p>
        {eta && (
          <span className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-13 text-ink-primary">
            <Icon name="clock" size={16} />
            Estimated: {eta}
          </span>
        )}
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          className="chrome mt-4 inline-flex h-11 min-w-[160px] items-center justify-center rounded-8 bg-accent px-4 text-15 font-semibold text-white disabled:bg-accent-disabled"
        >
          {busy ? (
            <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/35 border-t-white" />
          ) : (
            "Try again"
          )}
        </button>
      </div>
      <div className="flex flex-col items-center gap-2 pb-6">
        <Wordmark className="text-15" />
        {startedAt && (
          <p className="text-11 text-ink-tertiary">
            Started{" "}
            {new Date(startedAt).toLocaleTimeString("en-IN", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST
          </p>
        )}
      </div>
    </div>
  );
}

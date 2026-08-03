"use client";

import { useState } from "react";
import { Icon, Button } from "@/components";
import { Wordmark } from "@/components/nav/Header";
import { useToast } from "@/components/ui/Toast";
import { systemApi } from "@/lib/content/client";

/**
 * P12 S8 — the maintenance page.
 *
 * Message, ETA and start time all come from `maintenance_settings`, which is
 * the row A20 writes. Nothing on this screen is a constant, including the
 * "Estimated: 30 minutes" chip — that is computed from the ETA timestamp, so it
 * counts down instead of saying "30 minutes" an hour later.
 *
 * "Try again" re-asks the server whether maintenance is still on, and reloads
 * when it is not. A retry button that only reloads the page and shows the same
 * page again is the kind of dead control this module went looking for.
 */
export function MaintenancePage({
  message,
  etaLabel,
  startedAt,
}: {
  message: string;
  etaLabel: string | null;
  startedAt: string | null;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    const r = await systemApi.maintenance();
    setBusy(false);
    if (r.ok && !r.data.enabled) { window.location.reload(); return; }
    toast.show(r.ok ? "Still under maintenance — try again soon" : "Couldn't reach HomzList — check your connection");
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-column flex-col bg-page">
      <div className="flex flex-1 flex-col items-center gap-2 px-8 pt-20 text-center">
        <Icon name="wrench" size={96} strokeWidth={1} className="text-ink-tertiary" />
        <p className="mt-4 text-20 font-bold text-ink-primary">We&apos;ll be back shortly</p>
        <p className="max-w-[300px] text-15 text-ink-secondary">{message}</p>
        {etaLabel && (
          <span className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-13 text-ink-primary">
            <Icon name="clock" size={16} />
            {etaLabel}
          </span>
        )}
        <Button className="mt-4 min-w-[160px]" loading={busy} onClick={() => void retry()}>Try again</Button>
        <Button
          variant="text"
          onClick={() => window.open("https://wa.me/", "_blank", "noopener,noreferrer")}
        >
          Check status on WhatsApp
        </Button>
      </div>
      <div className="flex flex-col items-center gap-2 pb-6">
        <Wordmark className="text-15" />
        {startedAt && (
          <p className="text-11 text-ink-tertiary">
            Started{" "}
            {new Date(startedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}{" "}
            IST
          </p>
        )}
      </div>
    </div>
  );
}

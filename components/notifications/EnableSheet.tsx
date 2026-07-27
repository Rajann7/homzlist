"use client";

import { BottomSheet, Button, useToast } from "@/components";
import { enablePush, pushState } from "@/lib/notifications/push-client";

/**
 * "How to enable" — shared by the P11 inbox banner and the P10 S7 preferences
 * card, because both offer the same link and it must do the same thing.
 *
 * It exists because a browser CANNOT be scripted into re-prompting once the
 * user has denied notifications: only they can undo that, in browser settings.
 * A button that silently fails is the dead control this replaces — so the sheet
 * says exactly which taps to make, per platform, and "Try again" re-attempts
 * registration for the cases that are still recoverable (permission still
 * `default`, or the user just changed it in another tab).
 */
export function EnableSheet({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  /** Lets the caller re-read the permission state after an attempt. */
  onResult?: () => void;
}) {
  const toast = useToast();

  return (
    <BottomSheet open={open} onClose={onClose} title="Enable notifications">
      <div className="space-y-3 px-4 pb-4 text-13 leading-[1.6] text-ink-secondary">
        <p>Your browser is blocking notifications for HomzList. Only you can undo that, from the browser itself:</p>
        <p><b className="text-ink-primary">Chrome / Edge:</b> tap the lock icon in the address bar → Site settings → Notifications → Allow.</p>
        <p><b className="text-ink-primary">Safari (iPhone):</b> add HomzList to your Home Screen first — iOS only delivers notifications to an installed app — then open Settings → Notifications → HomzList.</p>
        <p><b className="text-ink-primary">Android:</b> Settings → Apps → your browser → Notifications → Sites → homzlist.com.</p>
        <Button
          fullWidth
          onClick={async () => {
            const r = await enablePush();
            onResult?.();
            toast.show(r.ok ? "Notifications enabled" : r.reason ?? "Still blocked — change it in browser settings");
            if (r.ok || pushState().permission === "granted") onClose();
          }}
        >
          Try again
        </Button>
      </div>
    </BottomSheet>
  );
}

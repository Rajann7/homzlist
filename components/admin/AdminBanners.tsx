"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * The shell's two banners, built to the design's markup (P13-14-15 shell):
 *
 *   MAINTENANCE  errorSoft · 13px/600 · padding 8 16 · border-bottom border
 *                alert icon in --error · text · spacer · "Turn off" in --accent
 *   OFFLINE      warningSoft · same metrics · offline icon in --warning
 *
 * Both sit between the header and the scroll container, `flex:none`, in that order.
 *
 * The offline one is the browser's own online/offline state — nothing to fetch.
 * The maintenance one is real config (`maintenance_settings.enabled`), read on the
 * server and passed in, so the banner cannot claim maintenance is on when it is not.
 */

export function AdminBanners({
  maintenance,
  canLiftMaintenance,
}: {
  maintenance: { enabled: boolean; since: string | null } | null;
  /** `flags` capability — Super only. Without it the link is not offered. */
  canLiftMaintenance: boolean;
}) {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissedMaint, setDismissedMaint] = useState(false);

  useEffect(() => {
    // navigator.onLine is only meaningful after mount, and starting at `false`
    // would flash the banner on every load.
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const turnOff = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/admin/maintenance", { method: "POST", cache: "no-store" });
      if (r.ok) {
        setDismissedMaint(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const showMaint = Boolean(maintenance?.enabled) && !dismissedMaint;

  return (
    <>
      {showMaint && (
        <div
          className="flex flex-none items-center gap-2 border-b px-4 py-2 text-[13px] font-semibold"
          style={{ background: "var(--error-soft)", color: "var(--ink-primary)", borderColor: "var(--border)" }}
          role="status"
        >
          <span className="flex-none" style={{ color: "var(--error)" }}>
            <Icon name="alert" size={20} />
          </span>
          <span className="min-w-0">
            Maintenance mode is ON
            {maintenance?.since ? ` since ${maintenance.since}` : ""} · Users see the maintenance page
          </span>
          <span className="flex-1" />
          {canLiftMaintenance && (
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="flex-none disabled:opacity-40"
              style={{ color: "var(--accent)" }}
            >
              {busy ? "Turning off…" : "Turn off"}
            </button>
          )}
        </div>
      )}

      {offline && (
        <div
          className="flex flex-none items-center gap-2 border-b px-4 py-2 text-[13px] font-semibold"
          style={{ background: "var(--warning-soft)", color: "var(--ink-primary)", borderColor: "var(--border)" }}
          role="status"
        >
          <span className="flex-none" style={{ color: "var(--warning)" }}>
            <Icon name="wifi-off" size={18} />
          </span>
          You&apos;re offline — actions will fail. Reconnect before approving.
        </div>
      )}
    </>
  );
}

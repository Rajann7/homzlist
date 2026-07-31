"use client";

/**
 * The bell — template 1574-1578. A right sheet, a dot per row, one footer
 * button that marks everything read.
 *
 * The rows are handed in from the server (the layout reads them on every
 * request); this component owns only the in-flight state of the one button it
 * has. After marking read it refreshes the server tree rather than editing the
 * list locally, so the badge in the header, the dots here and the database all
 * change together or not at all.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RightSheet, Btn, useToast } from "@/components/admin/ds";
import { SCREEN_ROUTES } from "@/components/admin/ds";
import type { AdminNotification } from "@/lib/admin/notifications";

export function BellSheet({
  items,
  onClose,
}: {
  items: AdminNotification[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function markAllRead() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/v1/admin/notifications/read-all", {
      method: "POST",
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: { cleared: number } }
      | null;
    setBusy(false);
    if (!body?.ok) {
      toast("Could not mark them read — try again");
      return;
    }
    // Refresh BEFORE closing. `onClose` unmounts this sheet, and a refresh
    // requested from an unmounted component never lands — which left the
    // header's badge showing a count the database no longer had.
    router.refresh();
    onClose();
    toast(
      body.data?.cleared
        ? `${body.data.cleared} notification${body.data.cleared === 1 ? "" : "s"} marked read`
        : "Nothing left to mark read",
    );
  }

  return (
    <RightSheet
      title="Notifications"
      onClose={onClose}
      footer={
        <Btn
          label={busy ? "Marking…" : "Mark all read"}
          kind="outline"
          onClick={markAllRead}
          style={{ flex: 1 }}
        />
      }
    >
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)", padding: "12px 0" }}>
          Nothing needs your attention right now.
        </div>
      ) : (
        items.map((n) => {
          const href = n.screen ? SCREEN_ROUTES[n.screen] : undefined;
          const row = (
            <>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: n.severity === "error" ? "var(--error)" : "var(--info)",
                  marginTop: 5,
                  flex: "none",
                  opacity: n.unread ? 1 : 0.35,
                }}
              />
              <div style={{ fontSize: 13, color: "var(--ink1)", flex: 1 }}>{n.text}</div>
            </>
          );
          const style = {
            display: "flex",
            gap: 10,
            padding: "12px 0",
            borderBottom: "1px solid var(--divider)",
            cursor: href ? "pointer" : "default",
          } as const;
          return href ? (
            <div
              key={n.id}
              onClick={() => {
                onClose();
                router.push(href);
              }}
              style={style}
            >
              {row}
            </div>
          ) : (
            <div key={n.id} style={style}>
              {row}
            </div>
          );
        })
      )}
    </RightSheet>
  );
}

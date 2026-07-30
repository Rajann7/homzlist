"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * The admin bell drawer (P13 Part A): rows with SLA-overdue red dots, and a
 * "Mark all read" that really does persist — the unread count is a query over
 * admin_notifications.read_at, not component state.
 */

export interface BellItem {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  linkScreen: string | null;
  read: boolean;
  createdAt: string;
}

const DOT: Record<string, string> = {
  error: "var(--error)",
  warning: "var(--warning)",
  info: "var(--info)",
};

export function AdminBell({ items }: { items: BellItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const unread = items.filter((i) => !i.read).length;

  const markAll = async () => {
    setBusy(true);
    try {
      await fetch("/api/v1/admin/notifications", { method: "POST", cache: "no-store" });
      router.refresh();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-10 w-10 flex-none place-items-center rounded-8"
        style={{ color: "var(--ink-primary)" }}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
      >
        <Icon name="bell" size={20} />
        {unread > 0 && (
          <span
            className="absolute right-[6px] top-[6px] grid h-[16px] min-w-[16px] place-items-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: "var(--error)" }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(380px,88vw)] overflow-y-auto rounded-12 border"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,.16)" }}
          >
            <div className="flex items-center justify-between px-3 py-3">
              <span className="text-[15px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                Notifications
              </span>
              {unread > 0 && (
                <button type="button" onClick={markAll} disabled={busy} className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
                  {busy ? "Marking…" : "Mark all read"}
                </button>
              )}
            </div>
            <div className="h-px" style={{ background: "var(--divider)" }} />

            {items.length === 0 && (
              <p className="px-3 py-6 text-center text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
                Nothing new.
              </p>
            )}

            {items.map((n) => {
              const row = (
                <div className="flex gap-2 px-3 py-3" style={{ background: n.read ? undefined : "var(--surface-2)" }}>
                  <span className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: DOT[n.severity] ?? "var(--ink-tertiary)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="mt-[2px] block text-[11px]" style={{ color: "var(--ink-secondary)" }}>
                        {n.body}
                      </span>
                    )}
                  </span>
                </div>
              );
              return n.linkScreen ? (
                <Link key={n.id} href={n.linkScreen} onClick={() => setOpen(false)} className="block">
                  {row}
                </Link>
              ) : (
                <div key={n.id}>{row}</div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

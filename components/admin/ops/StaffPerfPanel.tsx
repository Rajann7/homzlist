"use client";

/**
 * A25's staff performance panel — template 2545,
 * `pushPanel('staffPerf',r)`.
 *
 * Every number is a real count over `admin_audit_log` — the only honest
 * source, because it is the table that records what they actually did.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  FField,
  F_INPUT_STYLE,
  F_TEXTAREA_STYLE,
  Modal,
  Mono,
  NoteStrip,
  RoleChip,
  Shimmer,
  StatusBadge,
  useAdminRole,
  useToast,
  usePanels,
  type PanelEntry,
} from "@/components/admin/ds";


type StaffRow = {
  id: string;
  display_name: string;
  level: string;
  email: string;
};

const ago = (iso: string | null) => {
  if (!iso) return "Never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 5) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

export function StaffPerfPanelBody({ panel }: { panel: PanelEntry }) {
  const row = panel.data as unknown as StaffRow;
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/v1/admin/system?what=staff-perf&id=${row.id}`, {
        cache: "no-store",
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok?: boolean; data?: Record<string, unknown> }
        | null;
      setData(json?.ok ? (json.data ?? null) : null);
    })();
  }, [row.id]);

  const activity = (data?.activity ?? []) as { bucket: string; n: number }[];
  const max = Math.max(1, ...activity.map((a) => a.n));
  const recent = (data?.recent ?? []) as {
    action: string;
    entity_label: string;
    created_at: string;
  }[];

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
      {!data ? (
        <Shimmer h={240} />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Avatar initials={row.display_name.slice(0, 2).toUpperCase()} size={44} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{row.display_name}</div>
              <RoleChip role={row.level} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {[
              [String(data.approvals ?? 0), "Approvals"],
              [String(data.rejections ?? 0), "Rejections"],
              [String(data.tickets_closed ?? 0), "Tickets closed"],
              [String(data.total_actions_30d ?? 0), "Actions (30d)"],
            ].map(([v, l]) => (
              <div
                key={l}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                  background: "var(--s2)",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
                <div style={{ fontSize: 11, color: "var(--ink3)" }}>{l}</div>
              </div>
            ))}
          </div>

          {activity.length ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Activity · 30 days</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 100, marginBottom: 16 }}>
                {activity.map((a) => (
                  <div
                    key={a.bucket}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                  >
                    <div
                      title={`${a.n} actions`}
                      style={{
                        width: "100%",
                        maxWidth: 24,
                        height: `${Math.round((a.n / max) * 80)}px`,
                        background: "var(--accent)",
                        borderRadius: "3px 3px 0 0",
                      }}
                    />
                    <div style={{ fontSize: 10, color: "var(--ink3)" }}>
                      {new Date(a.bucket).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <NoteStrip tone="neutral">No actions in the last 30 days.</NoteStrip>
          )}

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Recent actions</div>
          {recent.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink3)", padding: "10px 0" }}>Nothing yet.</div>
          ) : (
            recent.map((a, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 0",
                  borderTop: "1px solid var(--divider)",
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1 }}>{a.action}</span>
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>{a.entity_label}</span>
                <span style={{ fontSize: 11, color: "var(--ink3)" }}>{ago(a.created_at)}</span>
              </div>
            ))
          )}
        </>
      )}
      </div>
    </>
  );
}

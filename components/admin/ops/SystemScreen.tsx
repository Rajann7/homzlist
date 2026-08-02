"use client";

/**
 * A27 — System status. Template 2602-2629.
 *
 * The screen an admin opens when something is wrong, so the one thing it must
 * never do is report health it has not measured. Two consequences:
 *
 *  · A reading older than 10 minutes is STALE, not healthy. A monitor that
 *    stopped writing looks identical to a healthy system unless the screen
 *    checks the timestamp — which is exactly when you least want to be misled.
 *  · A card with no source says so. The design draws an error-rate card fed by
 *    Sentry and a cost-alerts card fed by provider billing; neither exists on
 *    this environment, so they render as "not wired" rather than as zeros.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Btn,
  DTable,
  NoteStrip,
  PageHead,
  Shimmer,
  StatusBadge,
  UsageBar,
  useToast,
  type Col,
} from "@/components/admin/ds";

type Component = {
  component: string;
  status: string;
  detail: string | null;
  latency_ms: number | null;
  checked_at: string;
  stale: boolean;
};
type Queue = { queue: string; depth: number; workers: number; oldest_age_seconds: number | null };
type Cron = {
  id: string;
  code: string;
  name: string;
  schedule: string;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
  next_run_at: string | null;
  last_error: string | null;
};
type Backup = {
  id: string;
  kind: string;
  status: string;
  size_bytes: number | null;
  started_at: string;
  restore_drill_at: string | null;
};

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/v1/admin/system", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  }).catch(() => null);
  return (await res?.json().catch(() => null)) as
    | { ok?: boolean; data?: Record<string, unknown>; error?: { message?: string } }
    | null;
}

const stamp = (iso: unknown) =>
  iso
    ? new Date(String(iso)).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";

const gb = (bytes: number | null) =>
  bytes ? `${(bytes / 1_073_741_824).toFixed(1)} GB` : "—";

export function SystemScreen() {
  const toast = useToast();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/admin/system?what=status", { cache: "no-store" }).catch(
      () => null,
    );
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: Record<string, unknown> }
      | null;
    setData(json?.ok ? (json.data ?? null) : null);
  }, []);

  useEffect(() => {
    void load();
    // The design's badge says "Updates every 30s", so it does.
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    const json = await post(body);
    setBusy(null);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) void load();
  };

  if (!data) {
    return (
      <div>
        <PageHead title="System status" />
        <Shimmer h={320} />
      </div>
    );
  }

  const components = (data.components ?? []) as Component[];
  const queues = (data.queues ?? []) as Queue[];
  const crons = (data.crons ?? []) as Cron[];
  const backups = (data.backups ?? []) as Backup[];
  const uptime = (data.uptime ?? []) as string[];
  const failing = Number(data.failing_crons ?? 0);

  const cronCols: Col<Cron>[] = [
    { label: "Job", cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { label: "Schedule", cell: (r) => <span style={{ color: "var(--ink2)" }}>{r.schedule}</span> },
    {
      label: "Last run",
      cell: (r) => (
        <span style={{ fontSize: 12, color: r.last_status === "failed" ? "var(--error)" : "var(--ink3)" }}>
          {stamp(r.last_run_at)}
          {r.last_duration_ms ? ` · ${(r.last_duration_ms / 1000).toFixed(1)}s` : ""}
          {r.last_status === "failed" && r.last_error ? ` · ${r.last_error.slice(0, 40)}` : ""}
        </span>
      ),
    },
    {
      label: "Status",
      cell: (r) => (
        <StatusBadge
          status={
            !r.enabled
              ? "Draft"
              : r.last_status === "failed"
                ? "Rejected"
                : r.last_status === "running" || r.last_status === "queued"
                  ? "Pending"
                  : "Approved"
          }
        />
      ),
    },
    {
      label: "Next run",
      cell: (r) => <span style={{ fontSize: 12, color: "var(--ink3)" }}>{stamp(r.next_run_at)}</span>,
    },
    {
      label: "",
      cell: (r) => (
        <div style={{ display: "flex", gap: 6 }}>
          <Btn
            label={busy === r.code ? "…" : r.last_status === "failed" ? "Retry" : "Run now"}
            kind="outline"
            style={{ height: 30, fontSize: 12 }}
            onClick={() => void act({ action: "cron_run", code: r.code }, r.code)}
          />
          <Btn
            label={r.enabled ? "Disable" : "Enable"}
            kind="outline"
            style={{ height: 30, fontSize: 12 }}
            onClick={() => void act({ action: "cron_toggle", code: r.code, enabled: !r.enabled }, r.code)}
          />
        </div>
      ),
    },
  ];

  const cronRows = crons.map((c) => ({
    ...c,
    _hl: c.last_status === "failed" ? "var(--error)" : undefined,
  }));

  return (
    <div>
      <PageHead
        title="System status"
        sub={
          <Badge
            bg="var(--s2)"
            fg="var(--ink3)"
            style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, fontSize: 12 }}
          >
            Updates every 30s
          </Badge>
        }
      />

      {/* template 2610 — 2 columns on mobile, 4 above */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" style={{ marginBottom: 16 }}>
        {components.length === 0 ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <NoteStrip tone="warn">
              No health checks have been recorded. The monitor that writes them is not running on
              this environment.
            </NoteStrip>
          </div>
        ) : (
          components.map((c) => (
            <div
              key={c.component}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--s1)",
                padding: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: c.stale
                      ? "var(--ink3)"
                      : c.status === "healthy"
                        ? "var(--accent)"
                        : "var(--error)",
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>
                  {c.component}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 4 }}>
                {/* A stale reading is reported as stale, never as healthy. */}
                {c.stale
                  ? `last checked ${stamp(c.checked_at)}`
                  : (c.detail ?? (c.latency_ms ? `${c.latency_ms}ms` : c.status))}
              </div>
              {c.component === "api" && uptime.length ? (
                <div style={{ display: "flex", gap: 2, marginTop: 10 }}>
                  {uptime.map((u, i) => (
                    <div
                      key={i}
                      title={`${24 - i}h ago · ${u}`}
                      style={{
                        flex: 1,
                        height: 14,
                        borderRadius: 2,
                        background:
                          u === "healthy"
                            ? "var(--accent)"
                            : u === "degraded"
                              ? "var(--warning)"
                              : "var(--s3)",
                        opacity: 0.85,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div
                  style={{ height: 14, marginTop: 10, background: "var(--accentSoft)", borderRadius: 2 }}
                />
              )}
            </div>
          ))
        )}
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--s1)",
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Queue depths</div>
        {queues.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--ink3)" }}>No queue readings recorded.</div>
        ) : (
          queues.map((q, i) => (
            <div key={q.queue} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--divider)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{q.queue}</span>
                <span style={{ color: "var(--ink2)" }}>
                  {q.depth} job{q.depth === 1 ? "" : "s"} · {q.workers} worker{q.workers === 1 ? "" : "s"}
                </span>
              </div>
              <UsageBar
                pct={Math.min(100, q.depth)}
                color={q.depth > 40 ? "var(--warning)" : "var(--accent)"}
              />
            </div>
          ))
        )}
        {queues.length ? (
          <div style={{ marginTop: 10 }}>
            <NoteStrip tone={queues.some((q) => q.depth > 40) ? "warn" : "ok"}>
              {queues.some((q) => q.depth > 40) ? "A queue is backing up." : "Queue depth normal."}
            </NoteStrip>
          </div>
        ) : null}
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Cron jobs</div>
      <DTable cols={cronCols} rows={cronRows} />
      {failing > 0 ? (
        <div
          style={{
            background: "var(--errorSoft)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 11,
            color: "var(--ink2)",
            marginTop: 10,
          }}
        >
          {failing} job{failing === 1 ? "" : "s"} failed on the last run — retry from the row, or
          check the error above.
        </div>
      ) : null}

      {/* template 2624: `mobile ? '1fr' : '1fr 1fr'` — split at tablet */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2" style={{ marginTop: 16 }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--s1)", padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Backups</div>
          {backups.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink3)" }}>No backups recorded yet.</div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.8 }}>
              <div>
                Last backup: {stamp(backups[0].started_at)}
                {backups[0].status === "ok" ? " ✓" : ` · ${backups[0].status}`} · {gb(backups[0].size_bytes)}
              </div>
              <div>{backups.length} recorded</div>
              {backups.find((b) => b.restore_drill_at) ? (
                <div style={{ color: "var(--accent)" }}>
                  Last restore drill: {stamp(backups.find((b) => b.restore_drill_at)!.restore_drill_at)} ✓
                </div>
              ) : (
                // A backup nobody has ever restored is a backup nobody knows
                // works. Saying so is the point of the line.
                <div style={{ color: "var(--warning)" }}>No restore drill has ever been recorded.</div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Btn
              label={busy === "backup" ? "Starting…" : "Run backup now"}
              kind="outline"
              style={{ height: 32, fontSize: 13 }}
              onClick={() => void act({ action: "cron_run", code: "backup" }, "backup")}
            />
          </div>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--s1)", padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Errors &amp; cost</div>
          {/* The design fills these from Sentry and the providers' billing APIs.
              Neither is connected on this environment, and a made-up "0.02%"
              would be worse than an empty card. */}
          <NoteStrip tone="neutral">
            Error tracking and provider cost alerts are not connected on this environment. They are
            tracked in docs/PENDING-INTEGRATIONS.md.
          </NoteStrip>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * A11 — the user detail panel. Template 1310-1389.
 *
 * A STACKED SIDE PANEL, never a route (§5): a user opens on top of whatever
 * screen you were on, and the breadcrumb pops back to it. Ten tabs, and each
 * one is fetched when it is opened rather than all ten up front — the Chats tab
 * in particular is a sensitive read and is audited when it happens.
 *
 * Every button in the header bar is the design's, gated by the design's role,
 * and wired to /api/v1/admin/users/:id/actions. Nothing here toasts on its own.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  Chip,
  GatedBtn,
  MiniCard,
  PRow,
  PSecH,
  RoleChip,
  SheetMenu,
  Shimmer,
  StatusBadge,
  ToolCol,
  UsageBar,
  VerifCluster,
  useAdminRole,
  usePanels,
  useToast,
  type PanelEntry,
} from "@/components/admin/ds";
import {
  AdjustBalanceOverlay,
  BanDeviceOverlay,
  DeleteUserOverlay,
  ForceExpireOverlay,
  GrantTrialOverlay,
  ImpersonateOverlay,
  LiftSuspendOverlay,
  MergeAccountsOverlay,
  RevokeSessionOverlay,
  RoleChangeOverlay,
  SendMessageOverlay,
  SuspendOverlay,
  makeRunner,
  type ImpSession,
} from "./overlays";

const TABS = [
  "overview",
  "plans",
  "payments",
  "listings",
  "requirements",
  "leads",
  "chats",
  "communication",
  "notes",
  "timeline",
] as const;
type Tab = (typeof TABS)[number];

type Header = {
  id: string;
  name: string | null;
  handle: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  city: string | null;
  status: string;
  joinedAt: string;
  lastActiveAt: string | null;
  verification: { phone: boolean; id: boolean; rera: boolean };
  listingsCount: number;
  leadsCount: number;
  viewsCount: number;
  reportsCount: number;
  trialEndsAt: string | null;
};

type Overlay =
  | "suspend"
  | "lift"
  | "role"
  | "grant"
  | "balance"
  | "message"
  | "more"
  | "merge"
  | "ban"
  | "delete"
  | "impersonate"
  | null;

const money = (paise: number | null | undefined) =>
  paise === null || paise === undefined
    ? "—"
    : `₹${Math.round(Number(paise) / 100).toLocaleString("en-IN")}`;

const day = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

const ago = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

export function UserPanelBody({ panel }: { panel: PanelEntry }) {
  const userId = String(panel.data.id ?? "");
  const toast = useToast();
  const role = useAdminRole();
  const { pushPanel, setPanelTab, popPanel } = usePanels();

  const tab = ((panel.tab as Tab) ?? "overview") as Tab;
  const [header, setHeader] = useState<Header | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [expireReq, setExpireReq] = useState<string | null>(null);
  const [signOutSid, setSignOutSid] = useState<string | null | undefined>(undefined);
  const [imp, setImp] = useState<ImpSession | null>(null);
  const [templates, setTemplates] = useState<
    { code: string; subject: string | null; body: string }[]
  >([]);
  const [nonce, setNonce] = useState(0);

  const run = makeRunner(userId);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/users/${userId}?tab=${tab}`, {
      cache: "no-store",
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { header: Header; data: Record<string, unknown> } }
      | null;
    if (json?.ok && json.data) {
      setHeader(json.data.header);
      setData(json.data.data);
    }
    setLoading(false);
    // The nonce is deliberately a dependency: it IS the reload trigger. An
    // action bumps it and this refetches — without it, a mutation would show a
    // success toast over stale rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab, nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  // The message templates the Send-message sheet offers come from the table A21
  // owns, not from a literal list in this file.
  useEffect(() => {
    fetch("/api/v1/admin/message-templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTemplates(j?.data?.rows ?? []))
      .catch(() => setTemplates([]));
  }, []);

  const reload = () => setNonce((n) => n + 1);
  const done = (message: string) => {
    setOverlay(null);
    setExpireReq(null);
    setSignOutSid(undefined);
    toast(message);
    reload();
  };

  const suspended = header?.status === "Suspended";
  const name = header?.name ?? "User";

  return (
    <>
      {/* ── header — template 1315-1330 ─────────────────────────────────── */}
      <div style={{ padding: "16px 24px 0", flex: "none" }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Avatar initials={name.slice(0, 2).toUpperCase()} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{name}</span>
              {header ? <VerifCluster v={header.verification} /> : null}
              <RoleChip role={roleLabel(header?.role)} />
              <StatusBadge status={header?.status ?? "Active"} />
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--ink3)",
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {(header?.handle ?? "@user") + " · " + (header?.phone ?? "—")}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
              Joined {day(header?.joinedAt)} · Last active {ago(header?.lastActiveAt)} ·{" "}
              {header?.city ?? "—"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0" }}>
          <GatedBtn
            label="Edit"
            kind="outline"
            need="admin"
            style={{ height: 34, fontSize: 13 }}
            onClick={() => setPanelTab("overview")}
          />
          <Btn
            label="Send message"
            kind="outline"
            style={{ height: 34, fontSize: 13 }}
            onClick={() => setOverlay("message")}
          />
          <GatedBtn
            label="Grant trial"
            kind="outline"
            need="admin"
            style={{ height: 34, fontSize: 13 }}
            onClick={() => setOverlay("grant")}
          />
          <GatedBtn
            label="Adjust balance"
            kind="outline"
            need="admin"
            style={{ height: 34, fontSize: 13 }}
            onClick={() => setOverlay("balance")}
          />
          <GatedBtn
            label="Role change"
            kind="outline"
            need="admin"
            style={{ height: 34, fontSize: 13 }}
            onClick={() => setOverlay("role")}
          />
          <GatedBtn
            label="Impersonate"
            kind="outline"
            need="admin"
            style={{ height: 34, fontSize: 13 }}
            onClick={() => setOverlay("impersonate")}
          />
          {suspended ? (
            <GatedBtn
              label="Lift suspension"
              kind="outline"
              need="admin"
              style={{ height: 34, fontSize: 13 }}
              onClick={() => setOverlay("lift")}
            />
          ) : (
            <GatedBtn
              label="Suspend"
              kind="danger"
              need="admin"
              style={{ height: 34, fontSize: 13 }}
              onClick={() => setOverlay("suspend")}
            />
          )}
          <button
            type="button"
            aria-label="More"
            onClick={() => setOverlay("more")}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--s1)",
              color: "var(--ink2)",
              cursor: "pointer",
            }}
          >
            <AdminIcon name="dots" size={18} />
          </button>
        </div>
      </div>

      {/* ── tab bar — template 1331 ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "1px solid var(--divider)",
          padding: "0 16px",
          overflowX: "auto",
          flex: "none",
        }}
      >
        {TABS.map((t) => (
          <div
            key={t}
            onClick={() => setPanelTab(t)}
            style={{
              padding: "10px 12px",
              fontSize: 14,
              fontWeight: 600,
              color: tab === t ? "var(--ink1)" : "var(--ink3)",
              borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
              cursor: "pointer",
              whiteSpace: "nowrap",
              textTransform: "capitalize",
            }}
          >
            {t}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 24px 24px" }}>
        {loading || !data ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <Shimmer key={i} h={44} />
            ))}
          </div>
        ) : tab === "overview" ? (
          <OverviewTab data={data} header={header} run={run} onSaved={done} />
        ) : tab === "plans" ? (
          <PlansTab
            data={data}
            onGrant={() => setOverlay("grant")}
            onAdjust={() => setOverlay("balance")}
          />
        ) : tab === "payments" ? (
          <PaymentsTab data={data} onOpen={(id) => pushPanel("payment", { id })} />
        ) : tab === "listings" ? (
          <ListingsTab data={data} onOpen={(r) => pushPanel("listing", r)} />
        ) : tab === "requirements" ? (
          <RequirementsTab data={data} onExpire={(id) => setExpireReq(id)} />
        ) : tab === "leads" ? (
          <LeadsTab data={data} />
        ) : tab === "chats" ? (
          <ChatsTab data={data} onOpen={(id, who) => pushPanel("chat", { id, who })} />
        ) : tab === "communication" ? (
          <CommunicationTab data={data} onSend={() => setOverlay("message")} />
        ) : tab === "notes" ? (
          <NotesTab data={data} run={run} onChanged={done} />
        ) : (
          <TimelineTab data={data} role={role} onSignOut={(sid) => setSignOutSid(sid)} />
        )}
      </div>

      {/* ── overlays ────────────────────────────────────────────────────── */}
      {overlay === "suspend" ? (
        <SuspendOverlay run={run} onClose={() => setOverlay(null)} onDone={done} />
      ) : null}
      {overlay === "lift" ? (
        <LiftSuspendOverlay run={run} onClose={() => setOverlay(null)} onDone={done} />
      ) : null}
      {overlay === "message" ? (
        <SendMessageOverlay
          run={run}
          templates={templates}
          onClose={() => setOverlay(null)}
          onDone={done}
        />
      ) : null}
      {overlay === "grant" ? (
        <GrantTrialOverlay
          run={run}
          userName={name}
          onClose={() => setOverlay(null)}
          onDone={done}
        />
      ) : null}
      {overlay === "balance" ? (
        <AdjustBalanceOverlay run={run} onClose={() => setOverlay(null)} onDone={done} />
      ) : null}
      {overlay === "role" ? (
        <RoleChangeOverlay
          run={run}
          userName={name}
          current={header?.role ?? null}
          onClose={() => setOverlay(null)}
          onDone={done}
        />
      ) : null}
      {overlay === "merge" ? (
        <MergeAccountsOverlay
          run={run}
          primary={{ id: userId, name: header?.name ?? null, phone: header?.phone ?? null }}
          onClose={() => setOverlay(null)}
          onDone={done}
        />
      ) : null}
      {overlay === "ban" ? (
        <BanDeviceOverlay run={run} onClose={() => setOverlay(null)} onDone={done} />
      ) : null}
      {overlay === "delete" ? (
        <DeleteUserOverlay
          run={run}
          onClose={() => setOverlay(null)}
          onDone={(m) => {
            // The design pops the panel after a delete (template 1776) — the
            // user it was showing no longer exists in the list behind it.
            setOverlay(null);
            toast(m);
            popPanel();
          }}
        />
      ) : null}
      {overlay === "impersonate" ? (
        <ImpersonateOverlay
          userId={userId}
          userName={name}
          live={imp}
          onClose={() => setOverlay(null)}
          onChanged={(session, message) => {
            setImp(session);
            toast(message);
            if (!session) setOverlay(null);
          }}
        />
      ) : null}
      {expireReq ? (
        <ForceExpireOverlay
          run={run}
          requirementId={expireReq}
          onClose={() => setExpireReq(null)}
          onDone={done}
        />
      ) : null}
      {signOutSid !== undefined ? (
        <RevokeSessionOverlay
          run={run}
          sid={signOutSid}
          onClose={() => setSignOutSid(undefined)}
          onDone={done}
        />
      ) : null}

      {/* template 1713 — the "more" sheet */}
      {overlay === "more" ? (
        <SheetMenu onClose={() => setOverlay(null)}>
          <ToolCol
            items={[
              ["Merge accounts", () => setOverlay("merge")],
              ["Ban device/IP", () => setOverlay("ban"), true],
              ["Delete user", () => setOverlay("delete"), true],
              ["Add internal note", () => setPanelTab("notes")],
              ["Open in user view ↗", () => setOverlay("impersonate")],
            ]}
            onPick={() => setOverlay(null)}
          />
        </SheetMenu>
      ) : null}
    </>
  );
}

function roleLabel(role: string | null | undefined): string {
  if (!role) return "Owner";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/* ────────────────────────────────────────────── template 1332 · Overview ─── */

function OverviewTab({
  data,
  header,
  run,
  onSaved,
}: {
  data: Record<string, unknown>;
  header: Header | null;
  run: ReturnType<typeof makeRunner>;
  onSaved: (message: string) => void;
}) {
  const toast = useToast();
  const fields = (data.fields ?? {}) as Record<string, string | null>;
  const consents = (data.consents ?? []) as {
    kind: string;
    version: string;
    accepted: boolean;
    accepted_at: string;
  }[];
  const flags = (data.flags ?? []) as { title: string; detail: string | null }[];
  const completion = Number(data.completion ?? 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");

  /** The design's pencil (template 1275) — a real edit, not a toast. */
  const startEdit = (field: string, current: string | null) => {
    setEditing(field);
    setValue(current ?? "");
  };
  const save = async () => {
    if (!editing) return;
    const res = await run({ action: "edit_field", field: editing, value });
    setEditing(null);
    if (!res.ok) return toast(res.message ?? "Couldn't save");
    onSaved(res.summary ?? "Saved");
  };

  const row = (label: string, field: string | null, shown: string | null) =>
    editing && field === editing ? (
      <div key={label} style={{ display: "flex", gap: 8, padding: "8px 0", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)", width: 120, flex: "none" }}>
          {label}
        </div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(null);
          }}
          style={{
            flex: 1,
            height: 34,
            padding: "0 8px",
            borderRadius: 8,
            border: "1px solid var(--accent)",
            background: "var(--s2)",
            color: "var(--ink1)",
            fontSize: 14,
          }}
        />
        <Btn label="Save" kind="primary" style={{ height: 32, fontSize: 13 }} onClick={save} />
      </div>
    ) : (
      <PRow
        key={label}
        label={label}
        value={shown ?? "—"}
        onEdit={field ? () => startEdit(field, shown) : undefined}
      />
    );

  return (
    <div>
      {row("Name", "name", fields.name)}
      {row("Bio", "bio", fields.bio)}
      {row("City", null, fields.city)}
      {row("Phone", null, fields.phone)}
      {row("Email", "email", fields.email)}
      {row("Role", null, fields.role ? roleLabel(fields.role) : null)}
      {row("Office address", "office_address", fields.officeAddress)}

      <PSecH>Profile</PSecH>
      <div style={{ fontSize: 13, color: "var(--ink2)" }}>Profile completion {completion}%</div>
      <UsageBar pct={completion} />
      <div style={{ fontSize: 13, color: "var(--ink2)", marginTop: 10 }}>
        Response time: {(data.responseLabel as string) ?? "not recorded"}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 10, lineHeight: 1.6 }}>
        {consents.length
          ? consents
              .map((c) => `${c.kind} v${c.version} accepted ${day(c.accepted_at)}`)
              .join(" · ")
          : "No consent records"}
      </div>

      <PSecH>Counters</PSecH>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <MiniCard value={header?.listingsCount ?? 0} label="Listings" />
        <MiniCard value={header?.leadsCount ?? 0} label="Leads" />
        <MiniCard value={(header?.viewsCount ?? 0).toLocaleString("en-IN")} label="Views" />
        <MiniCard value={header?.reportsCount ?? 0} label="Reports" />
      </div>

      {flags.length ? (
        <div
          style={{
            background: "var(--warningSoft)",
            borderRadius: 8,
            padding: 12,
            marginTop: 16,
            fontSize: 12,
            color: "var(--ink2)",
          }}
        >
          {flags.map((f) => f.title).join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────────────────────────────── template 1343 · Plans ─── */

function PlansTab({
  data,
  onGrant,
  onAdjust,
}: {
  data: Record<string, unknown>;
  onGrant: () => void;
  onAdjust: () => void;
}) {
  const plans = (data.plans ?? []) as Record<string, number | string | boolean | null>[];
  const consumptions = (data.consumptions ?? []) as Record<string, string | number | null>[];
  const adjustments = (data.adjustments ?? []) as Record<string, string | number>[];
  const active = plans.filter((p) => p.status === "active");

  const bar = (label: string, used: number, quota: number) =>
    quota > 0 ? (
      <div style={{ marginTop: 8 }} key={label}>
        <div style={{ fontSize: 12, color: "var(--ink2)" }}>
          {label} {used}/{quota}
        </div>
        <UsageBar pct={Math.round((used / quota) * 100)} />
      </div>
    ) : null;

  return (
    <div>
      {active.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)", padding: "16px 0" }}>
          No active plan.
        </div>
      ) : (
        active.map((p) => (
          <div
            key={String(p.id)}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{String(p.name)}</span>
              <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                {p.expires_at
                  ? `Expires ${day(String(p.expires_at))}`
                  : "Lifetime"}
                {p.is_trial ? " · trial" : ""}
              </span>
            </div>
            {bar("Listings", Number(p.listing_used), Number(p.listing_quota))}
            {bar("Requirements", Number(p.requirement_used), Number(p.requirement_quota))}
            {bar("Proposals", Number(p.proposal_used), Number(p.proposal_quota))}
            {bar("Projects", Number(p.project_used), Number(p.project_quota))}
          </div>
        ))
      )}
      {active.length > 1 ? (
        <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 4 }}>
          Balances pooled · FIFO — oldest plan consumed first
        </div>
      ) : null}

      <PSecH>Plan history</PSecH>
      {consumptions.length === 0 && adjustments.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>Nothing consumed yet.</div>
      ) : (
        <>
          {consumptions.map((c) => (
            <div
              key={String(c.id)}
              style={{ fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--divider)" }}
            >
              <div>
                {day(String(c.created_at))} — Consumed {String(c.kind)} ×{String(c.qty)}
                {c.reverted_at ? " (reverted)" : ""}
              </div>
              {c.note ? (
                <span style={{ fontSize: 12, color: "var(--ink3)" }}>{String(c.note)}</span>
              ) : null}
            </div>
          ))}
          {adjustments.map((a) => (
            <div
              key={String(a.id)}
              style={{ fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--divider)" }}
            >
              <div>
                {day(String(a.created_at))} — Balance {String(a.kind)}{" "}
                {Number(a.delta) > 0 ? `+${a.delta}` : a.delta} by {String(a.actor_name)}
              </div>
              <span style={{ fontSize: 12, color: "var(--ink3)" }}>{String(a.reason)}</span>
            </div>
          ))}
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <GatedBtn label="Grant trial" kind="outline" need="admin" style={{ flex: 1 }} onClick={onGrant} />
        <GatedBtn
          label="Adjust balance"
          kind="outline"
          need="admin"
          style={{ flex: 1 }}
          onClick={onAdjust}
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────── template 1350 · Payments ─── */

function PaymentsTab({
  data,
  onOpen,
}: {
  data: Record<string, unknown>;
  onOpen: (id: string) => void;
}) {
  const rows = (data.rows ?? []) as Record<string, string | number | null>[];
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--ink3)", marginBottom: 8 }}>
        Total paid {money(Number(data.totalPaid))} · {String(data.refunds)} refund
        {Number(data.refunds) === 1 ? "" : "s"} · {String(data.chargebacks)} chargeback
        {Number(data.chargebacks) === 1 ? "" : "s"}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>No payments yet.</div>
      ) : (
        rows.map((r) => (
          <div
            key={String(r.id)}
            onClick={() => onOpen(String(r.id))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 0",
              borderTop: "1px solid var(--divider)",
              cursor: "pointer",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{String(r.item)}</div>
              <div style={{ fontSize: 11, color: "var(--ink3)" }}>{day(String(r.created_at))}</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{money(Number(r.amount_paise))}</span>
            <StatusBadge status={payLabel(String(r.status))} />
            <span style={{ color: "var(--ink3)" }}>
              <AdminIcon name="chevR" size={16} />
            </span>
          </div>
        ))
      )}
    </div>
  );
}

const payLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ────────────────────────────────────────────── template 1354 · Listings ─── */

function ListingsTab({
  data,
  onOpen,
}: {
  data: Record<string, unknown>;
  onOpen: (row: Record<string, unknown>) => void;
}) {
  const rows = (data.rows ?? []) as Record<string, string | number | null>[];
  if (!rows.length)
    return <div style={{ fontSize: 13, color: "var(--ink3)" }}>Nothing posted yet.</div>;
  return (
    <div>
      {rows.map((r, i) => (
        <div
          key={String(r.id)}
          onClick={() => onOpen({ id: r.id, kind: r.kind, title: r.title })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 0",
            borderTop: i ? "1px solid var(--divider)" : "none",
            cursor: "pointer",
          }}
        >
          <Thumb40 url={r.cover_url as string | null} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{String(r.title ?? "Untitled")}</div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>
              {r.price_on_request ? "On request" : money(Number(r.price_paise))} ·{" "}
              {String(r.views_count)} views · {String(r.leads_count)} leads
            </div>
          </div>
          <StatusBadge status={statusChip(String(r.status_key))} />
        </div>
      ))}
    </div>
  );
}

function Thumb40({ url }: { url: string | null }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        flex: "none",
        background: url
          ? `center/cover url(${JSON.stringify(url)})`
          : "repeating-linear-gradient(135deg,var(--s2),var(--s2) 8px,var(--s3) 8px,var(--s3) 16px)",
      }}
    />
  );
}

export function statusChip(key: string): string {
  const map: Record<string, string> = {
    live: "Live",
    pending: "Pending",
    changes: "Changes Requested",
    rejected: "Rejected",
    hidden: "Hidden",
    sold: "Sold",
    rented: "Rented",
    archived: "Archived",
    trash: "Deleted",
  };
  return map[key] ?? key;
}

/* ────────────────────────────────────────── template 1356 · Requirements ─── */

function RequirementsTab({
  data,
  onExpire,
}: {
  data: Record<string, unknown>;
  onExpire: (id: string) => void;
}) {
  const rows = (data.rows ?? []) as Record<string, string | number | null>[];
  if (!rows.length)
    return <div style={{ fontSize: 13, color: "var(--ink3)" }}>No requirements posted.</div>;
  return (
    <div>
      {rows.map((r, i) => (
        <div
          key={String(r.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 0",
            borderTop: i ? "1px solid var(--divider)" : "none",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {money(Number(r.budget_min_paise))}–{money(Number(r.budget_max_paise))} ·{" "}
              {r.bhk ? `${r.bhk} BHK` : String(r.type_code)}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>
              {String(r.area_label ?? "—")} · {String(r.proposals)} proposals
            </div>
          </div>
          <Badge
            bg={r.status === "live" ? "var(--accentSoft)" : "var(--s3)"}
            fg={r.status === "live" ? "var(--accent)" : "var(--ink3)"}
            style={{ textTransform: "none", letterSpacing: 0 }}
          >
            {String(r.status)}
          </Badge>
          <button
            type="button"
            aria-label="Requirement actions"
            onClick={() => onExpire(String(r.id))}
            style={{
              width: 30,
              height: 30,
              border: "none",
              background: "transparent",
              color: "var(--ink3)",
              cursor: "pointer",
            }}
          >
            <AdminIcon name="dots" size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────── template 1358 · Leads ── */

function LeadsTab({ data }: { data: Record<string, unknown> }) {
  const groups = (data.groups ?? []) as {
    label: string;
    leads: Record<string, string | null>[];
  }[];
  if (!groups.length)
    return <div style={{ fontSize: 13, color: "var(--ink3)" }}>No leads yet.</div>;
  return (
    <div>
      {groups.map((g) => (
        <div key={g.label} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)", padding: "8px 0" }}>
            {g.label}
          </div>
          {g.leads.map((l) => (
            <div
              key={String(l.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                borderTop: "1px solid var(--divider)",
              }}
            >
              <Avatar initials={(l.lead_name ?? "U").slice(0, 2).toUpperCase()} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{l.lead_name}</div>
                <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                  {ago(l.last_activity_at)}
                </div>
              </div>
              <Badge bg="var(--infoSoft)" fg="var(--info)" style={{ textTransform: "none", letterSpacing: 0 }}>
                {String(l.stage)}
              </Badge>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────── template 1362 · Chats ── */

function ChatsTab({
  data,
  onOpen,
}: {
  data: Record<string, unknown>;
  onOpen: (id: string, who: string) => void;
}) {
  const rows = (data.rows ?? []) as Record<string, string | number | null>[];
  if (!rows.length)
    return <div style={{ fontSize: 13, color: "var(--ink3)" }}>No chats.</div>;
  return (
    <div>
      {rows.map((c, i) => (
        <div
          key={String(c.id)}
          onClick={() => onOpen(String(c.id), String(c.other_name))}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 0",
            borderTop: i ? "1px solid var(--divider)" : "none",
            cursor: "pointer",
          }}
        >
          <Thumb40 url={c.cover_url as string | null} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{String(c.other_name)}</div>
            <div
              style={{
                fontSize: 11,
                color: "var(--ink3)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {String(c.subject)} · {String(c.preview ?? "")}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>{ago(c.last_message_at as string)}</div>
            <Badge bg="var(--s2)" fg="var(--ink3)" style={{ textTransform: "none", letterSpacing: 0 }}>
              {String(c.message_count)}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────── template 1364 · Communication ────── */

function CommunicationTab({
  data,
  onSend,
}: {
  data: Record<string, unknown>;
  onSend: () => void;
}) {
  const rows = (data.rows ?? []) as Record<string, string | null>[];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Btn label="Send message" kind="primary" style={{ height: 34, fontSize: 13 }} onClick={onSend} />
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>Nothing sent to this user yet.</div>
      ) : (
        rows.map((c) => (
          <div
            key={String(c.id)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "12px 0",
              borderTop: "1px solid var(--divider)",
            }}
          >
            <span style={{ color: "var(--ink3)" }}>
              <AdminIcon name="msg" size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Badge bg="var(--s2)" fg="var(--ink2)" style={{ textTransform: "none", letterSpacing: 0 }}>
                  {c.subject ?? "Message"}
                </Badge>
                <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                  {c.sent_by_name} · {day(c.created_at)}
                </span>
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{c.body}</div>
              <div
                style={{
                  fontSize: 11,
                  color: c.delivered_at ? "var(--accent)" : "var(--ink3)",
                  marginTop: 2,
                }}
              >
                {c.delivered_at ? "Delivered ✓" : `Queued · ${c.channel}`}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────── template 1368 · Notes ── */

function NotesTab({
  data,
  run,
  onChanged,
}: {
  data: Record<string, unknown>;
  run: ReturnType<typeof makeRunner>;
  onChanged: (message: string) => void;
}) {
  const toast = useToast();
  const rows = (data.rows ?? []) as Record<string, string>[];
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div>
      {rows.map((n) => (
        <div
          key={n.id}
          style={{ background: "var(--warningSoft)", borderRadius: 8, padding: 12, marginBottom: 10 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Avatar initials={(n.author_name ?? "A").slice(0, 2).toUpperCase()} size={20} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>{n.author_name}</span>
            <span style={{ fontSize: 11, color: "var(--ink3)" }}>{day(n.created_at)}</span>
            <span
              onClick={async () => {
                const res = await run({ action: "delete_note", noteId: n.id });
                if (!res.ok) return toast(res.message ?? "Couldn't remove it");
                onChanged("Note removed");
              }}
              style={{ marginLeft: "auto", color: "var(--ink3)", cursor: "pointer" }}
            >
              <AdminIcon name="x" size={14} />
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink1)" }}>{n.body}</div>
        </div>
      ))}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add an internal note…"
        style={{
          width: "100%",
          height: 70,
          padding: 10,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--s2)",
          color: "var(--ink1)",
          fontSize: 13,
          fontFamily: "inherit",
          resize: "none",
          marginTop: 4,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <Btn
          label={busy ? "Adding…" : "Add"}
          kind="primary"
          style={{ height: 34, fontSize: 13 }}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            const res = await run({ action: "add_note", body });
            setBusy(false);
            if (!res.ok) return toast(res.message ?? "Couldn't add it");
            setBody("");
            onChanged("Note added");
          }}
        />
        <span style={{ fontSize: 11, color: "var(--ink3)" }}>
          Internal only — never visible to the user.
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── template 1373 · Timeline ── */

const TIMELINE_FILTERS: [label: string, group: string | null][] = [
  ["All", null],
  ["Account", "account"],
  ["Listings", "listings"],
  ["Payments", "payments"],
  ["Admin actions", "admin"],
];

function TimelineTab({
  data,
  role,
  onSignOut,
}: {
  data: Record<string, unknown>;
  role: string;
  onSignOut: (sid: string | null) => void;
}) {
  const devices = (data.devices ?? []) as {
    sid: string;
    label: string;
    platform: string;
    lastUsedAt: string;
  }[];
  const items = (data.items ?? []) as { at: string; text: string; group: string }[];
  const [filter, setFilter] = useState<string | null>(null);
  const shown = filter ? items.filter((i) => i.group === filter) : items;
  void role;

  return (
    <div>
      <PSecH>Devices &amp; sessions</PSecH>
      {devices.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>No live sessions.</div>
      ) : (
        devices.map((d, i) => (
          <div
            key={d.sid}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "11px 0",
              borderTop: i ? "1px solid var(--divider)" : "none",
            }}
          >
            <span style={{ color: "var(--ink3)", flex: "none", display: "flex" }}>
              <AdminIcon name={d.platform === "Web" ? "chart" : "badge"} size={20} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</div>
              <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                {d.platform} · last used {ago(d.lastUsedAt)}
              </div>
            </div>
            <GatedBtn
              label="Sign out"
              kind="outline"
              need="admin"
              style={{ height: 28, fontSize: 12 }}
              onClick={() => onSignOut(d.sid)}
            />
          </div>
        ))
      )}
      {devices.length ? (
        <div style={{ marginTop: 8 }}>
          <GatedBtn
            label="Sign out all devices"
            kind="outline"
            need="admin"
            style={{ height: 32, fontSize: 13 }}
            onClick={() => onSignOut(null)}
          />
        </div>
      ) : null}

      <PSecH>Activity log</PSecH>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {TIMELINE_FILTERS.map(([label, group]) => (
          <Chip key={label} label={label} active={filter === group} onClick={() => setFilter(group)} />
        ))}
      </div>
      {shown.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>Nothing here.</div>
      ) : (
        shown.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 14, position: "relative" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: "none",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: t.group === "admin" ? "var(--warning)" : "var(--accent)",
                  marginTop: 4,
                }}
              />
              {i < shown.length - 1 ? (
                <span style={{ width: 1, flex: 1, background: "var(--divider)", marginTop: 2 }} />
              ) : null}
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                {new Date(t.at).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <div style={{ fontSize: 13, marginTop: 1 }}>{t.text}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

"use client";

/**
 * The LISTING panel — template 1411-1446, opened from A12, from A11's Listings
 * tab, and from A12's row menu. A stacked side panel, not a route (§5).
 *
 * Seven tabs. The one that matters is Fields: the design's banner is the rule
 * ("Compliance edits only. Every change is logged with your name and the old
 * value.") and the footer refuses to save without a reason. The diff badge next
 * to a changed field is the OLD value, which is exactly what the audit row
 * carries.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  GatedBtn,
  PSecH,
  RoleChip,
  SheetMenu,
  Shimmer,
  StatusBadge,
  Thumb,
  ToolCol,
  Modal,
  useToast,
  usePanels,
  type PanelEntry,
} from "@/components/admin/ds";
import { statusChip } from "../users/UserPanel";

const TABS = ["preview", "fields", "photos", "leads", "boost", "reports", "timeline"] as const;
type Tab = (typeof TABS)[number];

type Header = Record<string, string | number | boolean | null>;

const money = (paise: unknown) =>
  paise === null || paise === undefined || paise === ""
    ? "—"
    : `₹${Math.round(Number(paise) / 100).toLocaleString("en-IN")}`;

const day = (iso: unknown) =>
  iso
    ? new Date(String(iso)).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export function ListingPanelBody({ panel }: { panel: PanelEntry }) {
  const router = useRouter();
  const id = String(panel.data.id ?? "");
  const kind = (panel.data.kind as string) === "project" ? "project" : "listing";
  const toast = useToast();
  const { setPanelTab, pushPanel, popPanel, notifyChanged } = usePanels();

  const tab = ((panel.tab as Tab) ?? "preview") as Tab;
  const [header, setHeader] = useState<Header | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [menu, setMenu] = useState<"more" | "photo" | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"hide" | "expire" | "pause" | "delete" | null>(null);
  const [decide, setDecide] = useState<"request_changes" | "reject" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/admin/listings-master/${id}?kind=${kind}&tab=${tab}`, {
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
  }, [id, kind, tab, nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      const res = await fetch(`/api/v1/admin/listings-master/${id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action, kind, ...extra }),
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok?: boolean; data?: { summary?: string }; error?: { message?: string } }
        | null;
      if (!json?.ok) {
        toast(json?.error?.message ?? "That didn't go through");
        return false;
      }
      toast(`${json.data?.summary ?? "Done"} · logged`);
      setNonce((n) => n + 1);
      // …and the queue behind this panel, which was still listing an approved
      // listing as pending until you navigated away.
      notifyChanged();
      return true;
    },
    [id, kind, toast, notifyChanged],
  );

  const title = String(header?.title ?? "Listing");

  /**
   * A submitted PROJECT has no other screen that can decide it: A3's queue is
   * listings-only, exactly as the design draws it. So the three decisions
   * appear here, and only while the row is actually awaiting one — a live
   * listing must not offer "Approve".
   */
  const awaitingReview = header?.status_key === "pending" || header?.status_key === "changes";

  return (
    <>
      {/* ── header — template 1414-1416 ─────────────────────────────────── */}
      <div style={{ padding: "16px 24px 0", flex: "none" }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Thumb size={48} src={(header?.cover_url as string) ?? null} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
              <StatusBadge status={statusChip(String(header?.status_key ?? "live"))} />
            </div>
            <div style={{ fontSize: 13, color: "var(--ink3)", marginTop: 2 }}>
              #{id.slice(0, 8)} ·{" "}
              {header?.price_on_request ? "On request" : money(header?.price_paise)}
            </div>
            <div style={{ marginTop: 6 }}>
              <span
                onClick={() =>
                  pushPanel("user", { id: header?.poster_id, name: header?.poster_name })
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <Avatar initials={String(header?.poster_name ?? "U").slice(0, 2).toUpperCase()} size={22} />
                {String(header?.poster_name ?? "—")}
                <RoleChip role={roleLabel(header?.poster_role as string)} />
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0" }}>
          <Btn
            label="Edit all fields"
            kind="outline"
            style={{ height: 34, fontSize: 13 }}
            onClick={() => setPanelTab("fields")}
          />
          <Btn
            label="Open in user view ↗"
            kind="outline"
            style={{ height: 34, fontSize: 13 }}
            onClick={() => {
              const path = kind === "project" ? `/project/${id}` : `/property/${id}`;
              window.open(
                `${window.location.protocol}//${window.location.host.replace(/^[^.]+\./, "seller.")}${path}`,
                "_blank",
                "noopener",
              );
            }}
          />
          <Btn
            label="Remove story"
            kind="outline"
            style={{ height: 34, fontSize: 13 }}
            onClick={() => void act("remove_story")}
          />
          <GatedBtn
            label="Hide"
            kind="danger"
            need="admin"
            style={{ height: 34, fontSize: 13 }}
            onClick={() => setConfirm("hide")}
          />
          <button
            type="button"
            aria-label="More"
            onClick={() => setMenu("more")}
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

        <div
          style={{
            background: "var(--infoSoft)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 11,
            color: "var(--ink2)",
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            marginBottom: 4,
          }}
        >
          <span style={{ color: "var(--info)" }}>
            <AdminIcon name="info" size={16} />
          </span>
          Compliance edits only. Every change is logged with your name and the old value. Do not
          &quot;improve&quot; user content.
        </div>
      </div>

      {/* ── tabs — template 1417 ────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "1px solid var(--divider)",
          padding: "8px 16px 0",
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

      {tab === "fields" ? (
        <FieldsTab
          data={data}
          loading={loading}
          kind={kind}
          onSave={async (changes, reason, reReview) =>
            act("edit", { changes, reason, reReview })
          }
        />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px 24px" }}>
          {loading || !data ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <Shimmer key={i} h={48} />
              ))}
            </div>
          ) : tab === "preview" ? (
            <PreviewTab header={header} data={data} />
          ) : tab === "photos" ? (
            <PhotosTab
              data={data}
              onMenu={(pid) => {
                setPhotoId(pid);
                setMenu("photo");
              }}
            />
          ) : tab === "leads" ? (
            <LeadsTab data={data} />
          ) : tab === "boost" ? (
            <BoostTab data={data} onPause={() => setConfirm("pause")} onResume={() => void act("resume_boost")} />
          ) : tab === "reports" ? (
            <ReportsTab data={data} onOpenQueue={() => router.push("/queues/reports")} />
          ) : (
            <TimelineTab data={data} />
          )}
        </div>
      )}

      {/* template 1712 — the "more" sheet */}
      {menu === "more" ? (
        <SheetMenu onClose={() => setMenu(null)}>
          <ToolCol
            items={[
              ["Mark sold", () => void act("mark_sold")],
              ["Restore", () => void act("restore")],
              ["Force expire", () => setConfirm("expire")],
              ...(awaitingReview
                ? ([
                    ["Approve", () => void act("approve")],
                    ["Request changes", () => setDecide("request_changes")],
                    ["Reject", () => setDecide("reject"), true],
                  ] as [string, () => void, boolean?][])
                : []),
              ["Delete", () => setConfirm("delete"), true],
            ]}
            onPick={() => setMenu(null)}
          />
        </SheetMenu>
      ) : null}

      {/* template 1714 — the photo menu */}
      {menu === "photo" && photoId ? (
        <SheetMenu onClose={() => setMenu(null)}>
          <ToolCol
            items={[
              ["Set as cover", () => void act("photo_cover", { photoId })],
              ["Remove photo", () => void act("photo_remove", { photoId }), true],
            ]}
            onPick={() => setMenu(null)}
          />
        </SheetMenu>
      ) : null}

      {decide ? (
        <DecideDialog
          which={decide}
          onClose={() => setDecide(null)}
          onGo={async (reason) => {
            await act(decide, { reason });
            setDecide(null);
          }}
        />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          which={confirm}
          onClose={() => setConfirm(null)}
          onGo={async (reason) => {
            const map = {
              hide: "hide",
              expire: "force_expire",
              pause: "pause_boost",
              delete: "delete",
            } as const;
            const ok = await act(map[confirm], { reason });
            setConfirm(null);
            if (ok && confirm === "delete") popPanel();
          }}
        />
      ) : null}
    </>
  );
}

function roleLabel(role: string | null | undefined): string {
  if (!role) return "Owner";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Request changes / Reject, with the same wording A4 uses for a listing — one
 * vocabulary for one state machine, whichever screen the decision came from.
 */
function DecideDialog({
  which,
  onClose,
  onGo,
}: {
  which: "request_changes" | "reject";
  onClose: () => void;
  onGo: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const isReject = which === "reject";
  return (
    <Modal
      title={isReject ? "Reject this posting?" : "Request changes?"}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Sending…" : isReject ? "Reject" : "Request changes"}
            kind={isReject ? "dangerFill" : "primary"}
            onClick={() => {
              if (!reason.trim()) return;
              setBusy(true);
              onGo(reason);
            }}
          />
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--ink2)" }}>
        {isReject
          ? "The poster is notified and can edit and resubmit. Three rejections lock it until an appeal."
          : "The poster is notified and can edit and resubmit right away."}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)…"
        style={{
          width: "100%",
          height: 60,
          marginTop: 10,
          padding: 10,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--s2)",
          color: "var(--ink1)",
          fontSize: 13,
          fontFamily: "inherit",
          resize: "none",
        }}
      />
    </Modal>
  );
}

/* template 1780 / 1784 — the panel's four confirmations, with the design's copy. */
const CONFIRMS = {
  hide: {
    title: "Hide this listing?",
    body: "It will be removed from feed and search; the poster is notified.",
    cta: "Hide",
  },
  expire: {
    title: "Force expire this listing?",
    body: "It stops showing immediately. The poster is notified and can repost.",
    cta: "Force expire",
  },
  pause: {
    title: "Pause this boost?",
    body: "The remaining days are preserved while paused.",
    cta: "Pause boost",
  },
  delete: {
    title: "Delete this listing?",
    body: "It moves to Trash and can be restored there for 30 days.",
    cta: "Delete",
  },
} as const;

function ConfirmDialog({
  which,
  onClose,
  onGo,
}: {
  which: keyof typeof CONFIRMS;
  onClose: () => void;
  onGo: (reason: string) => void;
}) {
  const c = CONFIRMS[which];
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={c.title}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} />
          <Btn
            label={busy ? "Working…" : c.cta}
            kind={which === "pause" ? "primary" : "dangerFill"}
            onClick={() => {
              setBusy(true);
              onGo(reason);
            }}
          />
        </>
      }
    >
      <div style={{ fontSize: 13, color: "var(--ink2)" }}>{c.body}</div>
      {which !== "pause" ? (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (shown to the poster)…"
          style={{
            width: "100%",
            height: 50,
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--s2)",
            color: "var(--ink1)",
            fontSize: 13,
            fontFamily: "inherit",
            resize: "none",
          }}
        />
      ) : null}
    </Modal>
  );
}

/* ──────────────────────────────────────────────── template 1419 · Preview ── */

function PreviewTab({ header, data }: { header: Header | null; data: Record<string, unknown> }) {
  const row = (data.row ?? {}) as Record<string, unknown>;
  const cover = (header?.cover_url as string) ?? null;
  return (
    <div>
      <div
        style={{
          height: 180,
          borderRadius: 12,
          background: cover
            ? `center/cover url(${JSON.stringify(cover)})`
            : "repeating-linear-gradient(135deg,var(--s2),var(--s2) 10px,var(--s3) 10px,var(--s3) 20px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink3)",
        }}
      >
        {cover ? null : (
          <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 11 }}>no photo</span>
        )}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>
        {header?.price_on_request ? "Price on request" : money(header?.price_paise)}
      </div>
      <div style={{ fontSize: 13, color: "var(--ink2)", marginTop: 2 }}>
        {[
          row.attributes && (row.attributes as Record<string, unknown>).bhk
            ? `${(row.attributes as Record<string, unknown>).bhk} BHK`
            : null,
          row.area_sqft ? `${row.area_sqft} sqft` : null,
          header?.area_label ?? header?.city_name,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
      <PSecH>Description</PSecH>
      <div style={{ fontSize: 13, color: "var(--ink2)", whiteSpace: "pre-wrap" }}>
        {String(row.description ?? "—")}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── template 1421 · Fields ──── */

const LISTING_FIELDS: [key: string, label: string, kind: "text" | "money" | "area"][] = [
  ["title", "Title", "text"],
  ["description", "Description", "text"],
  ["price_paise", "Price", "money"],
  ["area_label", "Location", "text"],
  ["pincode", "Pincode", "text"],
  ["area_sqft", "Area (sqft)", "area"],
];
const PROJECT_FIELDS: [key: string, label: string, kind: "text" | "money" | "area"][] = [
  ["name", "Name", "text"],
  ["description", "Description", "text"],
  ["area_label", "Location", "text"],
  ["pincode", "Pincode", "text"],
  ["rera_number", "RERA number", "text"],
  ["towers", "Towers", "area"],
  ["floors", "Floors", "area"],
  ["total_units", "Total units", "area"],
];

function FieldsTab({
  data,
  loading,
  kind,
  onSave,
}: {
  data: Record<string, unknown> | null;
  loading: boolean;
  kind: "listing" | "project";
  onSave: (changes: Record<string, unknown>, reason: string, reReview: boolean) => Promise<boolean>;
}) {
  const row = ((data?.row ?? {}) as Record<string, unknown>) ?? {};
  const spec = kind === "project" ? PROJECT_FIELDS : LISTING_FIELDS;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [reReview, setReReview] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const shown = (key: string, k: string) => {
    const raw = row[key];
    if (raw === null || raw === undefined) return "";
    if (k === "money") return String(Math.round(Number(raw) / 100));
    return String(raw);
  };

  const changed = spec.filter(([key, , k]) => draft[key] !== undefined && draft[key] !== shown(key, k));

  const toValue = (key: string, k: string) => {
    const v = draft[key] ?? "";
    if (k === "money") return v === "" ? null : Math.round(Number(v) * 100);
    if (k === "area") return v === "" ? null : Number(v);
    return v === "" ? null : v;
  };

  if (loading)
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px 24px" }}>
        <Shimmer h={200} />
      </div>
    );

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px 24px" }}>
        {spec.map(([key, label, k]) => {
          const current = shown(key, k);
          const value = draft[key] ?? current;
          const isChanged = value !== current;
          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                borderTop: "1px solid var(--divider)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink2)",
                  width: 100,
                  flex: "none",
                }}
              >
                {label}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  value={value}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  style={{
                    width: "100%",
                    height: 34,
                    padding: "0 8px",
                    borderRadius: 8,
                    border: `1px solid ${isChanged ? "var(--warning)" : "var(--border)"}`,
                    background: "var(--s2)",
                    color: "var(--ink1)",
                    fontSize: 14,
                  }}
                />
                {isChanged ? (
                  <Badge
                    bg="var(--warningSoft)"
                    fg="var(--warning)"
                    style={{ textTransform: "none", letterSpacing: 0, marginTop: 4 }}
                  >
                    {`${current || "empty"} → ${value || "empty"}`}
                  </Badge>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* the design's footer — template 1425 */}
      <div style={{ flex: "none", borderTop: "1px solid var(--divider)", padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
          {changed.length} unsaved change{changed.length === 1 ? "" : "s"}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for change (required)…"
          style={{
            width: "100%",
            height: 50,
            padding: 8,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--s2)",
            color: "var(--ink1)",
            fontSize: 13,
            fontFamily: "inherit",
            resize: "none",
            marginBottom: 8,
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <Btn label="Cancel" kind="outline" style={{ flex: 1 }} onClick={() => setDraft({})} />
          <Btn
            label="Save changes"
            kind="primary"
            style={{ flex: 1 }}
            onClick={() => changed.length && setConfirming(true)}
          />
        </div>
      </div>

      {/* template 1782 */}
      {confirming ? (
        <Modal
          title={`Save ${changed.length} change${changed.length === 1 ? "" : "s"} to this listing?`}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setConfirming(false)} />
              <Btn
                label={busy ? "Saving…" : "Save & log"}
                kind="primary"
                onClick={async () => {
                  setBusy(true);
                  const changes: Record<string, unknown> = {};
                  for (const [key, , k] of changed) changes[key] = toValue(key, k);
                  const ok = await onSave(changes, reason, reReview);
                  setBusy(false);
                  setConfirming(false);
                  if (ok) {
                    setDraft({});
                    setReason("");
                  }
                }}
              />
            </>
          }
        >
          <div style={{ fontSize: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {changed.map(([key, label, k]) => (
              <Badge
                key={key}
                bg="var(--warningSoft)"
                fg="var(--warning)"
                style={{ textTransform: "none", letterSpacing: 0 }}
              >
                {`${label}: ${shown(key, k) || "empty"} → ${draft[key] || "empty"}`}
              </Badge>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={reReview}
              onChange={() => setReReview((v) => !v)}
              style={{ accentColor: "var(--accent)" }}
            />
            Re-review required
          </label>
        </Modal>
      ) : null}
    </>
  );
}

/* ──────────────────────────────────────────────── template 1427 · Photos ─── */

function PhotosTab({
  data,
  onMenu,
}: {
  data: Record<string, unknown>;
  onMenu: (photoId: string) => void;
}) {
  const rows = (data.rows ?? []) as { id: string; url: string | null }[];
  if (!rows.length) return <div style={{ fontSize: 13, color: "var(--ink3)" }}>No photos.</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {rows.map((p, i) => (
        <div
          key={p.id}
          style={{
            position: "relative",
            borderRadius: 8,
            overflow: "hidden",
            aspectRatio: "4/3",
            background: p.url
              ? `center/cover url(${JSON.stringify(p.url)})`
              : "repeating-linear-gradient(135deg,var(--s2),var(--s2) 8px,var(--s3) 8px,var(--s3) 16px)",
          }}
        >
          {i === 0 ? (
            <span
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                background: "var(--ink1)",
                color: "var(--page)",
                fontSize: 9,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              COVER
            </span>
          ) : null}
          <button
            type="button"
            aria-label="Photo actions"
            onClick={() => onMenu(p.id)}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 26,
              height: 26,
              borderRadius: 6,
              border: "none",
              background: "rgba(0,0,0,.5)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            <AdminIcon name="dots" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────────────────────────── template 1429 · Leads ─── */

function LeadsTab({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows ?? []) as Record<string, string | null>[];
  if (!rows.length) return <div style={{ fontSize: 13, color: "var(--ink3)" }}>No leads yet.</div>;
  return (
    <div>
      {rows.map((c, i) => (
        <div
          key={String(c.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 0",
            borderTop: i ? "1px solid var(--divider)" : "none",
          }}
        >
          <Avatar initials={(c.lead_name ?? "U").slice(0, 2).toUpperCase()} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.lead_name}</div>
            <div style={{ fontSize: 11, color: "var(--ink3)" }}>{day(c.last_activity_at)}</div>
          </div>
          <Badge bg="var(--infoSoft)" fg="var(--info)" style={{ textTransform: "none", letterSpacing: 0 }}>
            {String(c.stage)}
          </Badge>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────────────────────────── template 1431 · Boost ─── */

function BoostTab({
  data,
  onPause,
  onResume,
}: {
  data: Record<string, unknown>;
  onPause: () => void;
  onResume: () => void;
}) {
  const active = data.active as Record<string, string | number | null> | null;
  const history = (data.history ?? []) as Record<string, string | number | null>[];
  return (
    <div>
      {active ? (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {active.status === "paused" ? "Paused boost" : "Active boost"}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink2)", marginTop: 4 }}>
            Active till {day(active.ends_at)} · {String(active.target_label)} ·{" "}
            {money(active.price_paise)} paid
          </div>
          {active.status === "paused" ? (
            <Btn
              label="Resume boost"
              kind="outline"
              style={{ height: 34, fontSize: 13, marginTop: 10 }}
              onClick={onResume}
            />
          ) : (
            <Btn
              label="Pause boost"
              kind="outline"
              style={{ height: 34, fontSize: 13, marginTop: 10 }}
              onClick={onPause}
            />
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>No active boost.</div>
      )}
      <PSecH>History</PSecH>
      {history.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--ink3)" }}>Never boosted.</div>
      ) : (
        history.map((b, i) => (
          <div key={i} style={{ fontSize: 12, color: "var(--ink2)" }}>
            · {day(b.created_at)} — {String(b.status)}
            {b.reject_reason ? ` (${b.reject_reason})` : ""}
          </div>
        ))
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── template 1433 · Reports ─── */

function ReportsTab({
  data,
  onOpenQueue,
}: {
  data: Record<string, unknown>;
  onOpenQueue: () => void;
}) {
  const rows = (data.rows ?? []) as Record<string, string | null>[];
  const open = Number(data.open ?? 0);
  if (!rows.length)
    return <div style={{ fontSize: 13, color: "var(--ink3)" }}>Never reported.</div>;
  return (
    <div style={{ background: "var(--errorSoft)", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        <Badge bg="var(--errorSoft)" fg="var(--error)" style={{ textTransform: "none", letterSpacing: 0 }}>
          {String(rows[0].reason)}
        </Badge>
        <Badge bg="var(--s2)" fg="var(--ink2)" style={{ textTransform: "none", letterSpacing: 0 }}>
          {rows.length} report{rows.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <div style={{ fontSize: 12, color: "var(--ink2)" }}>
        {open} open · first reported {day(rows[rows.length - 1].created_at)}
      </div>
      <span
        onClick={onOpenQueue}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--accent)",
          cursor: "pointer",
          display: "inline-block",
          marginTop: 8,
        }}
      >
        Open in reports queue →
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────── template 1436 · Timeline ─── */

function TimelineTab({ data }: { data: Record<string, unknown> }) {
  const items = (data.items ?? []) as { at: string; text: string }[];
  if (!items.length) return <div style={{ fontSize: 13, color: "var(--ink3)" }}>Nothing yet.</div>;
  return (
    <div>
      {items.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "var(--accent)",
                marginTop: 4,
              }}
            />
            {i < items.length - 1 ? (
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
            <div style={{ fontSize: 13 }}>{t.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

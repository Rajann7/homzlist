"use client";

/**
 * The PLAN editor — template 1276-1294 — and the purchases sheet the row menu
 * opens (template 1900).
 *
 * A stacked panel, like every other detail in the panel (§5).
 *
 * The footer demands a reason and the confirm dialog restates the change in the
 * design's own words (template 1786), including the sentence that matters:
 * "N existing users keep their original terms." That number is read from the
 * database, not written into the copy — grandfathering is enforced by the fact
 * that a purchase copies its terms into `user_plans`, and this is what makes
 * that visible at the moment of the decision.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Btn,
  Modal,
  PSecH,
  Shimmer,
  Switch,
  useToast,
  usePanels,
  type PanelEntry,
} from "@/components/admin/ds";
import { planContents, rupees, type PlanRow } from "./PlansScreen";

const inputStyle = {
  width: "100%",
  height: 40,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--s2)",
  color: "var(--ink1)",
  fontSize: 14,
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const cell = {
    width: 34,
    height: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--ink2)",
  } as const;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <span style={cell} onClick={() => onChange(Math.max(-1, value - 1))}>
        −
      </span>
      <span style={{ width: 44, textAlign: "center", fontSize: 14 }}>
        {value < 0 ? "∞" : value}
      </span>
      <span style={cell} onClick={() => onChange(Math.min(999, value + 1))}>
        +
      </span>
    </div>
  );
}

const ROLES = ["owner", "broker", "builder"] as const;
const BILLING: [label: string, days: number | null][] = [
  ["One-time", null],
  ["Monthly", 30],
  ["Per project · 6 months", 180],
];

type Draft = {
  name: string;
  sub_label: string;
  price: string;
  period_days: number | null;
  roles: string[];
  listing_quota: number;
  requirement_quota: number;
  proposal_quota: number;
  project_quota: number;
  requirement_access: boolean;
  is_active: boolean;
};

export function PlanEditPanelBody({ panel }: { panel: PanelEntry }) {
  const code = (panel.data.code as string) ?? null;
  const toast = useToast();
  const { popPanel, notifyChanged } = usePanels();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [holders, setHolders] = useState(0);
  const [newCode, setNewCode] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    if (!code) {
      const blank: Draft = {
        name: "",
        sub_label: "",
        price: "0",
        period_days: null,
        roles: [...ROLES],
        listing_quota: 1,
        requirement_quota: 1,
        proposal_quota: 10,
        project_quota: 0,
        requirement_access: false,
        is_active: false,
      };
      setDraft(blank);
      setOriginal(blank);
      return;
    }
    const res = await fetch(`/api/v1/admin/plans?code=${encodeURIComponent(code)}`, {
      cache: "no-store",
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { plan: PlanRow; activeHolders: number } }
      | null;
    if (!json?.ok || !json.data) return;
    const p = json.data.plan;
    const d: Draft = {
      name: p.name,
      sub_label: p.sub_label ?? "",
      price: String(Math.round(p.price_paise / 100)),
      period_days: p.period_days,
      roles: p.roles,
      listing_quota: p.listing_quota,
      requirement_quota: p.requirement_quota,
      proposal_quota: p.proposal_quota,
      project_quota: p.project_quota,
      requirement_access: p.requirement_access,
      is_active: p.is_active,
    };
    setDraft(d);
    setOriginal(d);
    setHolders(json.data.activeHolders);
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!draft || !original)
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <Shimmer key={i} h={48} />
        ))}
      </div>
    );

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  /** The design's confirm dialog lists what changed, in words (template 1786). */
  const changes: string[] = [];
  if (draft.name !== original.name) changes.push(`Name ${original.name || "—"} → ${draft.name}`);
  if (draft.price !== original.price) changes.push(`Price ₹${original.price} → ₹${draft.price}`);
  if (draft.period_days !== original.period_days) changes.push("Billing type changed");
  for (const [k, label] of [
    ["listing_quota", "Listings"],
    ["requirement_quota", "Requirements"],
    ["proposal_quota", "Proposals"],
    ["project_quota", "Projects"],
  ] as [keyof Draft, string][]) {
    if (draft[k] !== original[k]) changes.push(`${label} ${original[k]} → ${draft[k]}`);
  }
  if (JSON.stringify(draft.roles) !== JSON.stringify(original.roles)) changes.push("Roles changed");
  if (draft.requirement_access !== original.requirement_access)
    changes.push(`Requirement access ${draft.requirement_access ? "on" : "off"}`);
  if (draft.is_active !== original.is_active)
    changes.push(draft.is_active ? "Shown to users" : "Hidden from users");

  async function save() {
    setBusy(true);
    const body = code
      ? {
          action: "save",
          code,
          changes: {
            name: draft!.name,
            sub_label: draft!.sub_label || null,
            price_paise: Math.round(Number(draft!.price) * 100),
            period_days: draft!.period_days,
            roles: draft!.roles,
            listing_quota: draft!.listing_quota,
            requirement_quota: draft!.requirement_quota,
            proposal_quota: draft!.proposal_quota,
            project_quota: draft!.project_quota,
            requirement_access: draft!.requirement_access,
            is_active: draft!.is_active,
          },
          reason,
        }
      : {
          action: "create",
          code: newCode,
          name: draft!.name,
          sub_label: draft!.sub_label || null,
          price_paise: Math.round(Number(draft!.price) * 100),
          period_days: draft!.period_days,
          roles: draft!.roles,
          listing_quota: draft!.listing_quota,
          requirement_quota: draft!.requirement_quota,
          proposal_quota: draft!.proposal_quota,
          project_quota: draft!.project_quota,
          requirement_access: draft!.requirement_access,
          reason,
        };

    const res = await fetch("/api/v1/admin/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { summary?: string }; error?: { message?: string } }
      | null;
    setBusy(false);
    setConfirming(false);
    if (!json?.ok) return toast(json?.error?.message ?? "That didn't save");
    toast(`${json.data?.summary} · logged`);
    notifyChanged();
    popPanel();
  }

  const previewRow = {
    ...draft,
    price_paise: Math.round(Number(draft.price) * 100),
  } as unknown as PlanRow;

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
        {!code ? (
          <Field label="Code">
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="p1499"
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 4 }}>
              Permanent — every order and receipt is filed under it.
            </div>
          </Field>
        ) : null}

        <Field label="Name">
          <input value={draft.name} onChange={(e) => set("name", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Price">
          <input
            value={draft.price}
            onChange={(e) => set("price", e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            style={inputStyle}
          />
        </Field>
        <Field label="Billing type">
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {BILLING.map(([label, days]) => (
              <label
                key={label}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
              >
                <input
                  type="radio"
                  checked={draft.period_days === days}
                  onChange={() => set("period_days", days)}
                  style={{ accentColor: "var(--accent)" }}
                />
                {label}
              </label>
            ))}
          </div>
        </Field>

        <PSecH>Contents</PSecH>
        {(
          [
            ["listing_quota", "Property listings"],
            ["requirement_quota", "Requirement posts"],
            ["proposal_quota", "Proposals"],
            ["project_quota", "Projects"],
          ] as [keyof Draft, string][]
        ).map(([key, label]) => (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 13 }}>{label}</span>
            <Stepper value={draft[key] as number} onChange={(n) => set(key, n as never)} />
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
          <Switch on={draft.requirement_access} onClick={() => set("requirement_access", !draft.requirement_access)} />
          <span style={{ fontSize: 13 }}>Unlock all requirements</span>
        </div>

        <PSecH>Role availability</PSecH>
        <div style={{ display: "flex", gap: 14 }}>
          {ROLES.map((r) => (
            <label
              key={r}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={draft.roles.includes(r)}
                onChange={() =>
                  set(
                    "roles",
                    draft.roles.includes(r)
                      ? draft.roles.filter((x) => x !== r)
                      : [...draft.roles, r],
                  )
                }
                style={{ accentColor: "var(--accent)" }}
              />
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </label>
          ))}
        </div>

        <PSecH>Display</PSecH>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
          <Switch on={draft.is_active} onClick={() => set("is_active", !draft.is_active)} />
          <span style={{ fontSize: 13 }}>Shown to users</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 10 }}>
          {/* The design's "Most popular" badge is not a switch here on purpose:
              it is the top seller (migration 0103), so it cannot be assigned. */}
          The &quot;Most popular&quot; badge goes to whichever plan actually sells most.
        </div>
        <Field label="Description">
          <input
            value={draft.sub_label}
            onChange={(e) => set("sub_label", e.target.value)}
            placeholder="Best for individual owners"
            style={inputStyle}
          />
        </Field>

        <PSecH>Preview</PSecH>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 14,
            background: "var(--s1)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>{draft.name || "New plan"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            {rupees(Number(draft.price) * 100)}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink2)", marginTop: 6 }}>
            {planContents(previewRow).join(" · ")}
          </div>
        </div>
      </div>

      <div style={{ flex: "none", borderTop: "1px solid var(--divider)", padding: 16 }}>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for change…"
          style={{
            width: "100%",
            height: 44,
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
          <Btn label="Cancel" kind="outline" style={{ flex: 1 }} onClick={popPanel} />
          <Btn
            label={code ? "Save plan" : "Create plan"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={() => setConfirming(true)}
          />
        </div>
      </div>

      {confirming ? (
        <Modal
          title={code ? `Save changes to ${original.name}?` : `Create ${draft.name || "this plan"}?`}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Btn label="Cancel" kind="outline" onClick={() => setConfirming(false)} />
              <Btn label={busy ? "Saving…" : "Save & log"} kind="primary" onClick={save} />
            </>
          }
        >
          {changes.length ? (
            <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {changes.map((c) => (
                <Badge
                  key={c}
                  bg="var(--warningSoft)"
                  fg="var(--warning)"
                  style={{ textTransform: "none", letterSpacing: 0 }}
                >
                  {c}
                </Badge>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 10 }}>
              Nothing has changed yet.
            </div>
          )}
          {code ? (
            <div
              style={{
                background: "var(--accentSoft)",
                borderRadius: 8,
                padding: 10,
                fontSize: 11,
                color: "var(--ink2)",
              }}
            >
              {holders.toLocaleString("en-IN")} existing users keep their original terms.
            </div>
          ) : (
            <div
              style={{
                background: "var(--infoSoft)",
                borderRadius: 8,
                padding: 10,
                fontSize: 11,
                color: "var(--ink2)",
              }}
            >
              It is created HIDDEN. Turn it on from the card once the price is checked.
            </div>
          )}
        </Modal>
      ) : null}
    </>
  );
}

/** template 1900 — "Purchases": who actually bought this plan. */
export function PlanPurchasesPanelBody({ panel }: { panel: PanelEntry }) {
  const code = String(panel.data.code ?? "");
  const { pushPanel } = usePanels();
  const [rows, setRows] = useState<Record<string, string | number>[] | null>(null);

  useEffect(() => {
    fetch(`/api/v1/admin/plans?code=${encodeURIComponent(code)}&purchases=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setRows(j?.data?.rows ?? []))
      .catch(() => setRows([]));
  }, [code]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
      {rows === null ? (
        <Shimmer h={120} />
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>Nobody has bought this plan yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["User", "Date", "Amount"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "8px 6px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink3)",
                    borderBottom: "1px solid var(--divider)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td style={{ padding: "8px 6px", fontSize: 13 }}>
                  <span
                    onClick={() => pushPanel("user", { id: r.profile_id, name: r.user_name })}
                    style={{ color: "var(--accent)", cursor: "pointer" }}
                  >
                    {String(r.user_name)}
                  </span>
                </td>
                <td style={{ padding: "8px 6px", fontSize: 13, color: "var(--ink2)" }}>
                  {new Date(String(r.created_at)).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </td>
                <td style={{ padding: "8px 6px", fontSize: 13 }}>{rupees(Number(r.total_paise))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

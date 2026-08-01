"use client";

/**
 * The COUPON editor — template 1296-1309 — with the usage list its row menu
 * opens (template 1900).
 *
 * Two things the design says and the server enforces (lib/admin/catalog.ts):
 * a cap cannot go below what has already been redeemed, and a code that has
 * been redeemed is ENDED rather than deleted — a redemption pointing at a
 * coupon that no longer exists makes an order's discount unexplainable.
 *
 * The "User sees:" strip at the bottom is built from the draft, so it is a
 * preview of the real rule rather than a fixed sentence.
 */

import { useCallback, useEffect, useState } from "react";
import { Btn, PSecH, Shimmer, useToast, usePanels, type PanelEntry } from "@/components/admin/ds";

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

type Draft = {
  code: string;
  label: string;
  discount_type: "percent" | "flat";
  /** rupees in the form; paise on the wire */
  value: string;
  max_discount: string;
  min_value: string;
  applies_to: "plans" | "boosts" | "both";
  catalog_codes: string[];
  usage_cap: string;
  per_user_limit: string;
  starts_at: string;
  expires_at: string;
};

const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

export function CouponEditPanelBody({
  panel,
  planOptions,
}: {
  panel: PanelEntry;
  planOptions: { code: string; name: string }[];
}) {
  const id = (panel.data.id as string) ?? null;
  const toast = useToast();
  const { popPanel } = usePanels();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [used, setUsed] = useState(0);
  const [redemptions, setRedemptions] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setDraft({
        code: "",
        label: "",
        discount_type: "percent",
        value: "20",
        max_discount: "",
        min_value: "0",
        applies_to: "plans",
        catalog_codes: [],
        usage_cap: "",
        per_user_limit: "1",
        starts_at: "",
        expires_at: "",
      });
      return;
    }
    const res = await fetch(`/api/v1/admin/coupons?id=${id}`, { cache: "no-store" }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { coupon: Record<string, unknown>; redemptions: Record<string, string>[] } }
      | null;
    if (!json?.ok || !json.data) return;
    const c = json.data.coupon;
    setUsed(Number(c.used_count ?? 0));
    setRedemptions(json.data.redemptions);
    setDraft({
      code: String(c.code ?? ""),
      label: (c.label as string) ?? "",
      discount_type: c.discount_type === "flat" ? "flat" : "percent",
      value:
        c.discount_type === "flat"
          ? String(Math.round(Number(c.discount_value) / 100))
          : String(c.discount_value),
      max_discount: c.max_discount_paise ? String(Math.round(Number(c.max_discount_paise) / 100)) : "",
      min_value: String(Math.round(Number(c.min_value_paise ?? 0) / 100)),
      applies_to: (c.applies_to as Draft["applies_to"]) ?? "both",
      catalog_codes: (c.catalog_codes as string[]) ?? [],
      usage_cap: c.usage_cap ? String(c.usage_cap) : "",
      per_user_limit: String(c.per_user_limit ?? 1),
      starts_at: toDateInput(c.starts_at as string | null),
      expires_at: toDateInput(c.expires_at as string | null),
    });
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!draft)
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <Shimmer key={i} h={48} />
        ))}
      </div>
    );

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const preview = (() => {
    const off =
      draft.discount_type === "percent"
        ? `${draft.value || 0}% off${draft.max_discount ? `, max ₹${draft.max_discount}` : ""}`
        : `₹${draft.value || 0} off`;
    const on = draft.catalog_codes.length
      ? draft.catalog_codes.map((c) => planOptions.find((p) => p.code === c)?.name ?? c).join(", ")
      : draft.applies_to === "plans"
        ? "any plan"
        : draft.applies_to === "boosts"
          ? "any boost"
          : "plans and boosts";
    const min = Number(draft.min_value) > 0 ? ` on orders over ₹${draft.min_value}` : "";
    return `${off} on ${on}${min}`;
  })();

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/admin/coupons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        action: "save",
        id,
        code: draft!.code,
        label: draft!.label,
        discount_type: draft!.discount_type,
        discount_value:
          draft!.discount_type === "flat"
            ? Math.round(Number(draft!.value) * 100)
            : Number(draft!.value),
        max_discount_paise: draft!.max_discount ? Math.round(Number(draft!.max_discount) * 100) : null,
        min_value_paise: Math.round(Number(draft!.min_value || 0) * 100),
        applies_to: draft!.applies_to,
        catalog_codes: draft!.catalog_codes,
        usage_cap: draft!.usage_cap ? Number(draft!.usage_cap) : null,
        per_user_limit: Number(draft!.per_user_limit || 1),
        starts_at: draft!.starts_at ? new Date(draft!.starts_at).toISOString() : null,
        expires_at: draft!.expires_at ? new Date(`${draft!.expires_at}T23:59:59`).toISOString() : null,
      }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { summary?: string }; error?: { message?: string } }
      | null;
    setBusy(false);
    if (!json?.ok) return setError(json?.error?.message ?? "That didn't save");
    toast(`${json.data?.summary} · logged`);
    popPanel();
  }

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
        <Field label="Code">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={draft.code}
              onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="SAVE20"
              style={inputStyle}
            />
            <span
              onClick={() =>
                set("code", `HL${Math.random().toString(36).slice(2, 7).toUpperCase()}`)
              }
              style={{
                fontSize: 13,
                color: "var(--accent)",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Generate
            </span>
          </div>
        </Field>

        <Field label="Discount type">
          <div style={{ display: "flex", gap: 14 }}>
            {(
              [
                ["percent", "Percentage"],
                ["flat", "Flat amount"],
              ] as [Draft["discount_type"], string][]
            ).map(([v, label]) => (
              <label
                key={v}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
              >
                <input
                  type="radio"
                  checked={draft.discount_type === v}
                  onChange={() => set("discount_type", v)}
                  style={{ accentColor: "var(--accent)" }}
                />
                {label}
              </label>
            ))}
          </div>
        </Field>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label={draft.discount_type === "percent" ? "Value (%)" : "Value (₹)"}>
              <input
                value={draft.value}
                onChange={(e) => set("value", e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Max discount (₹)">
              <input
                value={draft.max_discount}
                onChange={(e) => set("max_discount", e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                disabled={draft.discount_type === "flat"}
                placeholder={draft.discount_type === "flat" ? "n/a" : "200"}
                style={{ ...inputStyle, opacity: draft.discount_type === "flat" ? 0.5 : 1 }}
              />
            </Field>
          </div>
        </div>

        <Field label="Applies to">
          <div style={{ display: "flex", gap: 14 }}>
            {(
              [
                ["plans", "Plans"],
                ["boosts", "Boosts"],
                ["both", "Both"],
              ] as [Draft["applies_to"], string][]
            ).map(([v, label]) => (
              <label
                key={v}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
              >
                <input
                  type="radio"
                  checked={draft.applies_to === v}
                  onChange={() => {
                    set("applies_to", v);
                    set("catalog_codes", []);
                  }}
                  style={{ accentColor: "var(--accent)" }}
                />
                {label}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Scope">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {planOptions.map((p) => (
              <label
                key={p.code}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={draft.catalog_codes.includes(p.code)}
                  onChange={() =>
                    set(
                      "catalog_codes",
                      draft.catalog_codes.includes(p.code)
                        ? draft.catalog_codes.filter((c) => c !== p.code)
                        : [...draft.catalog_codes, p.code],
                    )
                  }
                  style={{ accentColor: "var(--accent)" }}
                />
                {p.name}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 4 }}>
            Leave all unticked to cover everything inside &quot;Applies to&quot;.
          </div>
        </Field>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Usage cap">
              <input
                value={draft.usage_cap}
                onChange={(e) => set("usage_cap", e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="no cap"
                style={inputStyle}
              />
              {id && used > 0 ? (
                <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 4 }}>
                  {used} already redeemed — the cap cannot go below that.
                </div>
              ) : null}
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Per-user limit">
              <input
                value={draft.per_user_limit}
                onChange={(e) => set("per_user_limit", e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                style={inputStyle}
              />
            </Field>
          </div>
        </div>

        <Field label="Min order value (₹)">
          <input
            value={draft.min_value}
            onChange={(e) => set("min_value", e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            style={inputStyle}
          />
        </Field>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Start date">
              <input
                type="date"
                value={draft.starts_at}
                onChange={(e) => set("starts_at", e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="End date">
              <input
                type="date"
                value={draft.expires_at}
                onChange={(e) => set("expires_at", e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>
        </div>

        <Field label="Internal note">
          <input
            value={draft.label}
            onChange={(e) => set("label", e.target.value)}
            placeholder="New year promo"
            style={inputStyle}
          />
        </Field>

        <div
          style={{
            background: "var(--infoSoft)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
            color: "var(--ink2)",
          }}
        >
          User sees: <b>{draft.code || "CODE"}</b> — {preview}
        </div>

        {error ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: "var(--errorSoft)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--error)",
            }}
          >
            {error}
          </div>
        ) : null}

        {id && redemptions.length ? (
          <>
            <PSecH>Recent usage</PSecH>
            {redemptions.map((r) => (
              <div
                key={r.id}
                style={{
                  fontSize: 12,
                  color: "var(--ink2)",
                  padding: "6px 0",
                  borderTop: "1px solid var(--divider)",
                }}
              >
                {new Date(r.created_at).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            ))}
          </>
        ) : null}
      </div>

      <div
        style={{
          flex: "none",
          borderTop: "1px solid var(--divider)",
          padding: 16,
          display: "flex",
          gap: 8,
        }}
      >
        <Btn label="Cancel" kind="outline" style={{ flex: 1 }} onClick={popPanel} />
        <Btn
          label={busy ? "Saving…" : id ? "Save coupon" : "Create coupon"}
          kind="primary"
          style={{ flex: 1 }}
          onClick={save}
        />
      </div>
    </>
  );
}

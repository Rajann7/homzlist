"use client";

/**
 * The admin design's own primitives, PORTED — not rebuilt.
 *
 * Every function here is one of the helper methods on the prototype's
 * `Component` class in designs/_unpacked/P13.template.html, with the template
 * line number cited above it. Sizes, radii, weights, gaps and colours are the
 * design's literal values; colours go through the design's token names, which
 * app/(admin)/admin.css aliases onto Doc1's palette.
 *
 * Rebuilding these with the user-side `components/ui/*` is what made the first
 * admin attempt's icons, spacing and sizing all come out different. Do not.
 */

import type { CSSProperties, ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "./icons";
import { ROLE_RANK, useAdmin, useAdminRole, type AdminRole } from "./admin-context";

type S = CSSProperties;

/* ── template 467 — bdg(text,bg,fg,extra) ─────────────────────────────────── */
export function Badge({
  children,
  bg,
  fg,
  style,
}: {
  children: ReactNode;
  bg: string;
  fg: string;
  style?: S;
}) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: ".3px",
        textTransform: "uppercase",
        color: fg,
        background: bg,
        padding: "3px 7px",
        borderRadius: 4,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ── template 468-471 — statusBadge(st) ───────────────────────────────────── */
const STATUS_COLORS: Record<string, [string, string]> = {
  Pending: ["var(--infoSoft)", "var(--info)"],
  Approved: ["var(--accentSoft)", "var(--accent)"],
  "Changes Requested": ["var(--warningSoft)", "var(--warning)"],
  Updated: ["var(--warningSoft)", "var(--warning)"],
  Rejected: ["var(--errorSoft)", "var(--error)"],
  Live: ["var(--accentSoft)", "var(--accent)"],
  Hidden: ["var(--s3)", "var(--ink3)"],
  Sold: ["var(--sold)", "var(--soldInk)"],
  Rented: ["var(--warningSoft)", "var(--warning)"],
  Expired: ["var(--s3)", "var(--ink3)"],
  Promoted: ["var(--promoted)", "var(--promotedInk)"],
  Verified: ["var(--accentSoft)", "var(--accent)"],
  Suspended: ["var(--errorSoft)", "var(--error)"],
  Locked: ["var(--s3)", "var(--ink3)"],
  Open: ["var(--infoSoft)", "var(--info)"],
  Replied: ["var(--accentSoft)", "var(--accent)"],
  Closed: ["var(--s3)", "var(--ink3)"],
  "Payment pending": ["var(--infoSoft)", "var(--info)"],
};

export function StatusBadge({ status }: { status: string }) {
  const [bg, fg] = STATUS_COLORS[status] ?? ["var(--s2)", "var(--ink2)"];
  return (
    <Badge bg={bg} fg={fg}>
      {status}
    </Badge>
  );
}

/* ── template 472-475 — riskBadge(score) ──────────────────────────────────── */
export function RiskBadge({ score }: { score: number }) {
  let bg = "var(--errorSoft)";
  let fg = "var(--error)";
  let label = "High";
  if (score <= 2) {
    bg = "var(--s2)";
    fg = "var(--ink2)";
    label = "Low";
  } else if (score <= 5) {
    bg = "var(--warningSoft)";
    fg = "var(--warning)";
    label = "Medium";
  }
  return (
    <Badge bg={bg} fg={fg}>{`${label} · ${score}`}</Badge>
  );
}

/* ── template 962 — roleChip(role) ────────────────────────────────────────── */
const ROLE_CHIP_COLORS: Record<string, [string, string]> = {
  Owner: ["var(--s2)", "var(--ink2)"],
  Broker: ["var(--infoSoft)", "var(--info)"],
  Builder: ["var(--accentSoft)", "var(--accent)"],
  "Super Admin": ["var(--accentSoft)", "var(--accent)"],
  Admin: ["var(--infoSoft)", "var(--info)"],
  Staff: ["var(--s2)", "var(--ink2)"],
};

export function RoleChip({ role }: { role: string }) {
  const [bg, fg] = ROLE_CHIP_COLORS[role] ?? ["var(--s2)", "var(--ink2)"];
  return (
    <Badge bg={bg} fg={fg} style={{ textTransform: "none", letterSpacing: 0 }}>
      {role}
    </Badge>
  );
}

/* ── template 965 — verifCluster(v) ───────────────────────────────────────── */
export function VerifCluster({
  v,
}: {
  v: { phone?: boolean; id?: boolean; rera?: boolean };
}) {
  const item = (label: string, on: boolean, fill: boolean) => (
    <span
      key={label}
      title={label}
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: on ? (fill ? "var(--ink-inverse)" : "var(--accent)") : "var(--ink3)",
        background: on && fill ? "var(--accent)" : "transparent",
        border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 4,
        padding: "1px 4px",
        opacity: on ? 1 : 0.5,
      }}
    >
      {label}
    </span>
  );
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {item("P", !!v.phone, false)}
      {item("ID", !!v.id, false)}
      {item("RERA", !!v.rera, true)}
    </span>
  );
}

/* ── template 476 — card(kids,extra) ──────────────────────────────────────── */
export function Card({ children, style }: { children: ReactNode; style?: S }) {
  return (
    <div
      style={{
        background: "var(--s1)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "var(--L1)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── template 477 — shimmer(h,w,r) ────────────────────────────────────────── */
export function Shimmer({
  h,
  w = "100%",
  r = 8,
}: {
  h: number | string;
  w?: number | string;
  r?: number;
}) {
  return (
    <div
      style={{
        height: h,
        width: w,
        borderRadius: r,
        background:
          "linear-gradient(90deg,var(--s2) 25%,var(--s3) 37%,var(--s2) 63%)",
        backgroundSize: "400px 100%",
        animation: "admin-shimmer 1.2s infinite",
      }}
    />
  );
}

/* ── template 478-482 — pageHead(title,sub,right,hero) ────────────────────── */
export function PageHead({
  title,
  sub,
  right,
  hero,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  hero?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 20,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: hero ? 24 : 20, fontWeight: 700, color: "var(--ink1)" }}>
        {title}
      </div>
      {sub}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

/* ── template 483 — thumb(size,label) ─────────────────────────────────────── */
export function Thumb({
  size,
  label,
  src,
}: {
  size: number;
  label?: string;
  src?: string | null;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        flex: "none",
        background: src
          ? `center/cover no-repeat url(${JSON.stringify(src)})`
          : "repeating-linear-gradient(135deg,var(--s2),var(--s2) 6px,var(--s3) 6px,var(--s3) 12px)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ink3)",
        overflow: "hidden",
      }}
    >
      {src ? null : label ? (
        <span style={{ fontSize: 9, fontFamily: "ui-monospace,monospace" }}>{label}</span>
      ) : (
        <AdminIcon name="home" size={size > 60 ? 24 : 16} />
      )}
    </div>
  );
}

/* ── template 484 — avatar(initials,size,c) ───────────────────────────────── */
export function Avatar({
  initials,
  size,
  background,
  style,
}: {
  initials: string;
  size: number;
  background?: string;
  style?: S;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: 999,
        background: background ?? "linear-gradient(135deg,var(--accent),var(--info))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ink-inverse)",
        fontSize: size * 0.38,
        fontWeight: 700,
        ...style,
      }}
    >
      {initials}
    </div>
  );
}

/* ── template 485-488 — btn(label,kind,onClick,extra) ─────────────────────── */
export type BtnKind =
  | "primary"
  | "secondary"
  | "outline"
  | "warn"
  | "danger"
  | "dangerFill"
  | "link";

const BTN_STYLES: Record<BtnKind, S> = {
  primary: { background: "var(--accent)", color: "var(--ink-inverse)", border: "none" },
  secondary: { background: "var(--s2)", color: "var(--ink1)", border: "none" },
  outline: {
    background: "transparent",
    color: "var(--ink1)",
    border: "1px solid var(--border)",
  },
  warn: {
    background: "transparent",
    color: "var(--warning)",
    border: "1px solid var(--warning)",
  },
  danger: {
    background: "transparent",
    color: "var(--error)",
    border: "1px solid var(--error)",
  },
  dangerFill: { background: "var(--error)", color: "var(--ink-inverse)", border: "none" },
  link: { background: "transparent", color: "var(--accent)", border: "none" },
};

export function Btn({
  label,
  kind = "secondary",
  onClick,
  style,
  type = "button",
  disabled,
  title,
}: {
  label: ReactNode;
  kind?: BtnKind;
  onClick?: () => void;
  style?: S;
  type?: "button" | "submit";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: kind === "link" ? "auto" : 40,
        padding: kind === "link" ? 0 : "0 16px",
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        whiteSpace: "nowrap",
        ...BTN_STYLES[kind],
        ...style,
      }}
    >
      {label}
    </button>
  );
}

/* ── template 963 — gatedBtn(label,kind,onClick,need,extra) ───────────────────
   The design's UI half of role gating: below the required rank the button is
   rendered at 0.4 opacity, not-allowed, inert, with a tooltip. The server half
   lives in the API — this never decides anything.                            */
export function GatedBtn({
  label,
  kind = "secondary",
  onClick,
  need = "staff",
  style,
}: {
  label: ReactNode;
  kind?: BtnKind;
  onClick?: () => void;
  need?: AdminRole;
  style?: S;
}) {
  const role = useAdminRole();
  const ok = ROLE_RANK[role] >= ROLE_RANK[need];
  if (ok) return <Btn label={label} kind={kind} onClick={onClick} style={style} />;
  const tip = need === "super" ? "Super Admin only" : "Admin only";
  return (
    <span title={tip} style={{ display: "inline-flex" }}>
      <Btn
        label={label}
        kind={kind}
        style={{ opacity: 0.4, cursor: "not-allowed", ...style }}
        disabled
      />
    </span>
  );
}

/* ── template 489 — chip(label,active,onClick) ────────────────────────────── */
export function Chip({
  label,
  active,
  onClick,
}: {
  label: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 32,
        padding: "0 12px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--accentSoft)" : "var(--s1)",
        color: active ? "var(--accent)" : "var(--ink2)",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

/* ── template 964 — copyBtn() ────────────────────────────────────────────────
   The design toasts 'Copied'; here it actually writes to the clipboard first,
   which is the design working rather than the design changed.                */
export function CopyBtn({ value }: { value: string }) {
  const { toast } = useAdmin();
  return (
    <span
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          toast("Copied");
        } catch {
          toast("Couldn't copy");
        }
      }}
      style={{ color: "var(--ink3)", cursor: "pointer", display: "inline-flex" }}
    >
      <AdminIcon name="copy" size={13} />
    </span>
  );
}

/* ── template 966 — toolCol(items) ────────────────────────────────────────── */
export type ToolItem = [label: ReactNode, onSelect: () => void, danger?: boolean];

export function ToolCol({
  items,
  onPick,
}: {
  items: (ToolItem | null | false)[];
  onPick?: () => void;
}) {
  return (
    <div style={{ padding: 6 }}>
      {items.filter(Boolean).map((item, i) => {
        const [label, onSelect, danger] = item as ToolItem;
        return (
          <div
            key={i}
            onClick={() => {
              onPick?.();
              onSelect();
            }}
            style={{
              padding: "10px 12px",
              fontSize: 14,
              color: danger ? "var(--error)" : "var(--ink1)",
              cursor: "pointer",
              borderRadius: 8,
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

/* ── template 968 — usageBar(pct,color) ───────────────────────────────────── */
export function UsageBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        background: "var(--s3)",
        overflow: "hidden",
        marginTop: 4,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(100, pct)}%`,
          background: color ?? "var(--accent)",
          borderRadius: 999,
        }}
      />
    </div>
  );
}

/* ── template 969 — shareBar(pct) ─────────────────────────────────────────── */
export function ShareBar({ pct }: { pct: number }) {
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        background: "var(--s3)",
        overflow: "hidden",
        marginTop: 4,
        width: 120,
      }}
    >
      <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)" }} />
    </div>
  );
}

/* ── template 1274 — psecH(t) : panel section heading ─────────────────────── */
export function PSecH({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink3)",
        textTransform: "uppercase",
        letterSpacing: ".3px",
        margin: "18px 0 8px",
      }}
    >
      {children}
    </div>
  );
}

/* ── template 1275 — prow(l,v,edit) : panel label/value row ───────────────── */
export function PRow({
  label,
  value,
  onEdit,
}: {
  label: ReactNode;
  value: ReactNode;
  onEdit?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
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
          width: 120,
          flex: "none",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 15, color: "var(--ink1)", flex: 1 }}>{value}</div>
      {onEdit ? (
        <span onClick={onEdit} style={{ color: "var(--ink3)", cursor: "pointer", opacity: 0.6 }}>
          <AdminIcon name="note" size={15} />
        </span>
      ) : null}
    </div>
  );
}

/* ── template 1276 — miniCard(v,l) ────────────────────────────────────────── */
export function MiniCard({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 70,
        background: "var(--s2)",
        borderRadius: 8,
        padding: "10px 12px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--ink3)" }}>{label}</div>
    </div>
  );
}

/* ── template 2001 — noteStrip(text,tone) ─────────────────────────────────── */
const NOTE_TONES: Record<string, [string, string]> = {
  info: ["var(--infoSoft)", "var(--info)"],
  warn: ["var(--warningSoft)", "var(--warning)"],
  ok: ["var(--accentSoft)", "var(--accent)"],
  err: ["var(--errorSoft)", "var(--error)"],
  neutral: ["var(--s2)", "var(--ink3)"],
};

export function NoteStrip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "info" | "warn" | "ok" | "err" | "neutral";
}) {
  const [bg, fg] = NOTE_TONES[tone];
  return (
    <div
      style={{
        background: bg,
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 11,
        color: "var(--ink2)",
        marginBottom: 16,
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: fg, flex: "none", marginTop: 1, display: "flex" }}>
        <AdminIcon name="info" size={16} />
      </span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

/* ── template 2002 — sw(on,onClick) ───────────────────────────────────────── */
export function Switch({
  on,
  onClick,
  disabled,
}: {
  on: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <span
      role="switch"
      aria-checked={on}
      onClick={disabled ? undefined : onClick}
      style={{
        width: 40,
        height: 24,
        borderRadius: 999,
        background: on ? "var(--accent)" : "var(--s3)",
        position: "relative",
        display: "inline-block",
        cursor: onClick && !disabled ? "pointer" : "default",
        flex: "none",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 19 : 3,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "var(--ink-inverse)",
          transition: "left .2s",
        }}
      />
    </span>
  );
}

/* ── template 2379 — stepperInline(v) ─────────────────────────────────────── */
export function StepperInline({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
}: {
  value: number;
  onChange?: (next: number) => void;
  min?: number;
  max?: number;
}) {
  const step = (delta: number) => {
    if (!onChange) return;
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  };
  const arm: S = {
    width: 28,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--ink2)",
  };
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
      <span style={arm} onClick={() => step(-1)}>
        −
      </span>
      <span style={{ width: 36, textAlign: "center", fontSize: 13 }}>{value}</span>
      <span style={arm} onClick={() => step(1)}>
        +
      </span>
    </div>
  );
}

/* ── template 1995-1999 — lockGate(need) ──────────────────────────────────── */
export function LockGate({
  need,
  role,
  superAdminName,
  onBack,
}: {
  need: AdminRole;
  role: AdminRole;
  superAdminName: string;
  onBack?: () => void;
}) {
  const label = need === "admin" ? "Admin access required" : "Super Admin access required";
  const who = need === "admin" ? "an Admin or Super Admin" : "a Super Admin";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "90px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 999,
          background: "var(--s2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink3)",
        }}
      >
        <AdminIcon name="shield" size={32} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--ink2)", maxWidth: 340 }}>
        {`This area is restricted to ${who}. Your current role is ${role}. Ask ${superAdminName} (Super Admin) for access.`}
      </div>
      <Btn label="Go back" kind="outline" onClick={onBack} style={{ marginTop: 4 }} />
    </div>
  );
}

/* ── template 2000 — modTabs(tabs,active,onSel) ───────────────────────────── */
export function ModTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: [key: string, label: string, count?: ReactNode][];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--divider)",
        marginBottom: 16,
        overflowX: "auto",
      }}
    >
      {tabs.map(([key, label, count]) => (
        <div
          key={key}
          onClick={() => onSelect(key)}
          style={{
            padding: "10px 12px",
            fontSize: 15,
            fontWeight: 600,
            color: active === key ? "var(--ink1)" : "var(--ink3)",
            borderBottom: `2px solid ${active === key ? "var(--accent)" : "transparent"}`,
            cursor: "pointer",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {label}
          {count != null ? (
            <span style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 600 }}>{count}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ── template 2020 — mono(t,extra) ────────────────────────────────────────── */
export function Mono({ children, style }: { children: ReactNode; style?: S }) {
  return (
    <span
      style={{
        fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
        fontSize: 12,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ── template 2006-2019 — form field primitives ───────────────────────────── */
export function FLbl({ label, helper }: { label: ReactNode; helper?: ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)" }}>{label}</span>
      {helper ? (
        <span
          style={{ fontSize: 11, color: "var(--ink3)", marginLeft: 8, fontWeight: 400 }}
        >
          {helper}
        </span>
      ) : null}
    </div>
  );
}

export const F_INPUT_STYLE: S = {
  width: "100%",
  height: 40,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--s2)",
  color: "var(--ink1)",
  fontSize: 14,
};

export const F_TEXTAREA_STYLE: S = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--s2)",
  color: "var(--ink1)",
  fontSize: 13,
  fontFamily: "inherit",
  resize: "none",
};

export function FField({
  label,
  helper,
  children,
}: {
  label: ReactNode;
  helper?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <FLbl label={label} helper={helper} />
      {children}
    </div>
  );
}

/* ── template 830 — slaText(r) ────────────────────────────────────────────── */
export function SlaText({ sla, age }: { sla: "ok" | "warn" | "over"; age: string }) {
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 600,
        color:
          sla === "over"
            ? "var(--error)"
            : sla === "warn"
              ? "var(--warning)"
              : "var(--ink3)",
      }}
    >
      {age}
    </span>
  );
}

/* ── template 2004 — rowDots(items,size) ──────────────────────────────────── */
export function RowDots({
  onOpen,
  size = 18,
}: {
  onOpen: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      style={{
        width: 30,
        height: 30,
        border: "none",
        background: "transparent",
        color: "var(--ink3)",
        cursor: "pointer",
      }}
    >
      <AdminIcon name="dots" size={size} />
    </button>
  );
}

/** The design's square icon button — header/toolbar affordance, template 609-610. */
export function IconBtn({
  icon,
  size = 18,
  box = 36,
  onClick,
  title,
  disabled,
}: {
  icon: AdminIconName;
  size?: number;
  box?: number;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        width: box,
        height: box,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--s1)",
        color: "var(--ink2)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AdminIcon name={icon} size={size} />
    </button>
  );
}

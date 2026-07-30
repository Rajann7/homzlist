import type { Risk } from "@/lib/admin/risk";

/**
 * The small pieces every queue screen shares, matching the design's helpers
 * one-for-one (riskBadge / statusBadge / slaText / thumb / avatar in
 * designs/P13-14-15). Keeping them here means A3, A5–A9 and A12 cannot drift
 * apart — the propagation rule in PROOF.md applied to a component.
 */

/** P13: 0–2 Low surface2/ink2 · 3–5 Medium warningSoft/warning · 6+ High errorSoft/error, always with the number. */
export function RiskBadge({ risk }: { risk: Risk }) {
  const map = {
    low: ["var(--surface-2)", "var(--ink-secondary)"],
    medium: ["var(--warning-soft)", "var(--warning)"],
    high: ["var(--error-soft)", "var(--error)"],
  } as const;
  const [bg, fg] = map[risk.band];
  return (
    <span
      className="inline-block whitespace-nowrap rounded-4 px-[6px] py-[2px] text-[11px] font-semibold uppercase tracking-[0.3px]"
      style={{ background: bg, color: fg }}
    >
      {risk.bandLabel} · {risk.score}
    </span>
  );
}

/** The single status-badge system from P13/P14 — one map, every screen. */
const STATUS_COLORS: Record<string, [string, string]> = {
  Pending: ["var(--info-soft)", "var(--info)"],
  Approved: ["var(--accent-soft)", "var(--accent)"],
  "Changes Requested": ["var(--warning-soft)", "var(--warning)"],
  Updated: ["var(--warning-soft)", "var(--warning)"],
  Rejected: ["var(--error-soft)", "var(--error)"],
  Live: ["var(--accent-soft)", "var(--accent)"],
  Hidden: ["var(--surface-3)", "var(--ink-tertiary)"],
  Sold: ["var(--ink-primary)", "#ffffff"],
  Rented: ["var(--warning-soft)", "var(--warning)"],
  Expired: ["var(--surface-3)", "var(--ink-tertiary)"],
  Archived: ["var(--surface-3)", "var(--ink-tertiary)"],
  Promoted: ["rgba(0,0,0,.6)", "#ffffff"],
  Verified: ["var(--accent-soft)", "var(--accent)"],
  Suspended: ["var(--error-soft)", "var(--error)"],
  Locked: ["var(--surface-3)", "var(--ink-tertiary)"],
  Open: ["var(--info-soft)", "var(--info)"],
  Replied: ["var(--accent-soft)", "var(--accent)"],
  Closed: ["var(--surface-3)", "var(--ink-tertiary)"],
  "Payment pending": ["var(--info-soft)", "var(--info)"],
};

export function StatusBadge({ label }: { label: string }) {
  const [bg, fg] = STATUS_COLORS[label] ?? ["var(--surface-2)", "var(--ink-secondary)"];
  return (
    <span
      className="inline-block whitespace-nowrap rounded-4 px-[6px] py-[2px] text-[11px] font-semibold uppercase tracking-[0.3px]"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

/** P13: under 12h ink3 · 12–24h warning · over 24h error. */
export function SlaText({ sla, text }: { sla: "ok" | "warn" | "over"; text: string }) {
  const color = sla === "over" ? "var(--error)" : sla === "warn" ? "var(--warning)" : "var(--ink-tertiary)";
  return (
    <span className="whitespace-nowrap text-[13px] font-semibold" style={{ color }}>
      {text}
    </span>
  );
}

/** The design's diagonal-hatch placeholder when a listing has no cover yet. */
export function Thumb({ size, url }: { size: number; url: string | null }) {
  return (
    <span
      className="block shrink-0 overflow-hidden rounded-8 border"
      style={{
        width: size,
        height: size,
        borderColor: "var(--border)",
        background: url
          ? undefined
          : "repeating-linear-gradient(135deg,var(--surface-2),var(--surface-2) 6px,var(--surface-3) 6px,var(--surface-3) 12px)",
      }}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
    </span>
  );
}

export function Initials({ text, size }: { text: string; size: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: "linear-gradient(135deg,var(--accent),var(--info))",
      }}
    >
      {text}
    </span>
  );
}

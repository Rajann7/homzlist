"use client";

/**
 * The pieces A5-A9 all draw the same way, in one place.
 *
 * The design repeats a sub-tab strip on four screens (A3 601, A7 890, A8 915)
 * and an age-with-SLA-colour on all of them. Copying either into five files is
 * how five screens end up disagreeing about what "overdue" looks like.
 */

/** template 612/890/915 — the sub-tab strip, with each tab's real count. */
export function QueueTabs({
  tabs,
  active,
  counts,
  onPick,
}: {
  tabs: [key: string, label: string][];
  active: string;
  counts: Record<string, number>;
  onPick: (key: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--divider)",
        marginBottom: 14,
        overflowX: "auto",
      }}
    >
      {tabs.map(([key, label]) => (
        <div
          key={key}
          onClick={() => onPick(key)}
          style={{
            padding: "10px 12px",
            fontSize: 15,
            fontWeight: 600,
            color: active === key ? "var(--ink1)" : "var(--ink3)",
            borderBottom: `2px solid ${active === key ? "var(--accent)" : "transparent"}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
          }}
        >
          {label}
          <span style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 600 }}>
            {counts[key] ?? 0}
          </span>
        </div>
      ))}
    </div>
  );
}

/** "26h" / "2d", coloured by the design's SLA bands (24h over, 12h warn). */
export function ageOf(iso: string): { text: string; color: string; sla: "ok" | "warn" | "over" } {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  const text = hours < 1 ? "<1h" : hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  const sla = hours >= 24 ? "over" : hours >= 12 ? "warn" : "ok";
  return {
    text,
    sla,
    color: sla === "over" ? "var(--error)" : sla === "warn" ? "var(--warning)" : "var(--ink3)",
  };
}

export function initialsOf(name: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  return (
    ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || n.slice(0, 2).toUpperCase()
  );
}

/** "₹40–60L" / "₹15k–20k / mo" — the design's shorthand for a budget band. */
export function budgetLabel(min: number | null, max: number | null): string {
  const short = (paise: number | null) => {
    if (!paise) return null;
    const rupees = paise / 100;
    if (rupees >= 1_00_00_000) return `${(rupees / 1_00_00_000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
    if (rupees >= 1_00_000) return `${Math.round(rupees / 1_00_000)}L`;
    if (rupees >= 1_000) return `${Math.round(rupees / 1_000)}k`;
    return String(Math.round(rupees));
  };
  const lo = short(min);
  const hi = short(max);
  if (lo && hi) return `₹${lo} – ₹${hi}`;
  if (lo) return `₹${lo}+`;
  if (hi) return `up to ₹${hi}`;
  return "Budget not given";
}

export const money = (paise: number | null | undefined) =>
  paise === null || paise === undefined ? "—" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

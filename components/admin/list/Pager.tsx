"use client";

/**
 * The ONE control in the admin panel the design does not draw.
 *
 * P13-14-15 has no pagination anywhere across its 27 screens, yet A10 prints
 * "4,281 users" above a table that shows 50 — there is no way to reach row 51.
 * Rajan chose a numbered pager. It is built out of the design's own vocabulary
 * (32px controls, radius 8, `--accentSoft` for the current page, 13px text) so
 * it reads as part of the panel rather than a bolted-on widget, and it hides
 * itself entirely when everything fits on one page — which is every screen the
 * design was drawn against.
 */

import { AdminIcon } from "@/components/admin/ds/icons";

/** 1 … 4 5 [6] 7 8 … 20 — never more than seven slots, so it never wraps. */
function pageWindow(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push("gap");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const base = {
    minWidth: 32,
    height: 32,
    padding: "0 8px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--s1)",
    color: "var(--ink2)",
    fontSize: 13,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;

  const arrow = (dir: "prev" | "next") => {
    const target = dir === "prev" ? page - 1 : page + 1;
    const disabled = dir === "prev" ? page <= 1 : page >= pages;
    return (
      <button
        type="button"
        aria-label={dir === "prev" ? "Previous page" : "Next page"}
        disabled={disabled}
        onClick={() => onPage(target)}
        style={{ ...base, opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        <AdminIcon name={dir === "prev" ? "chevL" : "chevR"} size={16} />
      </button>
    );
  };

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginTop: 14,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--ink3)", marginRight: "auto" }}>
        {`${first}–${last} of ${total}`}
      </span>
      {arrow("prev")}
      {pageWindow(page, pages).map((slot, i) =>
        slot === "gap" ? (
          <span key={`g${i}`} style={{ fontSize: 13, color: "var(--ink3)", padding: "0 2px" }}>
            …
          </span>
        ) : (
          <button
            key={slot}
            type="button"
            aria-current={slot === page ? "page" : undefined}
            onClick={() => onPage(slot)}
            style={{
              ...base,
              borderColor: slot === page ? "var(--accent)" : "var(--border)",
              background: slot === page ? "var(--accentSoft)" : "var(--s1)",
              color: slot === page ? "var(--accent)" : "var(--ink2)",
              fontWeight: slot === page ? 600 : 400,
            }}
          >
            {slot}
          </button>
        ),
      )}
      {arrow("next")}
    </div>
  );
}

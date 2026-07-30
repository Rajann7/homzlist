"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * Global search (P13 Part A / Doc3 §1.3): "phone / name / listing ID / payment
 * ID / order ID", answered as a dropdown grouped by entity, each row deep-
 * linking to that entity's panel.
 *
 * The grouping and the matching both happen server-side — the browser never
 * receives rows it did not ask for, and phone numbers are never used to build a
 * client-side index.
 */

interface Hit {
  id: string;
  href: string;
  primary: string;
  secondary: string | null;
  badge: string | null;
}

interface Grouped {
  group: string;
  label: string;
  hits: Hit[];
}

export function AdminSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Grouped[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setGroups([]);
      return;
    }
    let dead = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/admin/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = await r.json();
        if (!dead && j.ok) setGroups(j.data.groups ?? []);
      } finally {
        if (!dead) setBusy(false);
      }
    }, 220);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const total = groups.reduce((n, g) => n + g.hits.length, 0);

  return (
    // Design: hidden below tablet (`notMobile`), `width:100%;max-width:340px;flex:1`.
    <div ref={box} className="relative hidden w-full max-w-[340px] flex-1 md:block">
      <div
        className="flex h-10 items-center gap-2 rounded-8 border px-3"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
      >
        <span className="flex-none" style={{ color: "var(--ink-tertiary)" }}><Icon name="search" size={18} /></span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search phone, name, listing ID, payment ID…"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          style={{ color: "var(--ink-primary)" }}
          aria-label="Global admin search"
        />
        {busy && <span className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>…</span>}
      </div>

      {open && q.trim().length >= 2 && (
        <div
          className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(480px,86vw)] overflow-y-auto rounded-12 border py-2"
          style={{ background: "var(--surface-1)", borderColor: "var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,.16)" }}
        >
          {!busy && total === 0 && (
            <p className="px-3 py-3 text-[13px]" style={{ color: "var(--ink-tertiary)" }}>
              Nothing matched “{q.trim()}”.
            </p>
          )}
          {groups.map((g) => (
            <div key={g.group}>
              <p
                className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.3px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                {g.label}
              </p>
              {g.hits.map((h) => (
                <button
                  key={`${g.group}-${h.id}`}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push(h.href);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--ink-primary)" }}>
                      {h.primary}
                    </span>
                    {h.secondary && (
                      <span className="block truncate text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
                        {h.secondary}
                      </span>
                    )}
                  </span>
                  {h.badge && (
                    <span
                      className="shrink-0 rounded-4 px-[6px] py-[2px] text-[11px] font-semibold uppercase"
                      style={{ background: "var(--surface-2)", color: "var(--ink-secondary)" }}
                    >
                      {h.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

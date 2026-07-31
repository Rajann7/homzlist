"use client";

/**
 * The header's global search — template 1608-1620.
 *
 * The design shows a pre-filled query with four groups of results, and the
 * surface it draws is specific: not a dropdown under the trigger but a 480px
 * card pinned 56px from the top and centred (12px inset on mobile). That is
 * `CenteredDrop`; the rows, the group headings and the ↑↓/↵/esc footer are the
 * design's.
 *
 * What is real here: every keystroke over two characters queries the server,
 * which decides what this ROLE may see. The empty state before typing is not
 * "no results" — the design never shows an empty search, and telling an admin
 * "nothing found" before they have typed would be false.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminIcon, CenteredDrop, Thumb, SCREEN_ROUTES } from "@/components/admin/ds";
import type { SearchGroup } from "@/lib/admin/search";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);

  // The latest response wins: a slow answer for "RK" must not overwrite the
  // results for "RK Prop" the admin is already looking at.
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/v1/admin/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as
        | { ok: boolean; data?: { groups: SearchGroup[] } }
        | null;
      if (mine !== seq.current) return;
      setGroups(body?.ok ? (body.data?.groups ?? []) : []);
      setCursor(0);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const flat = groups.flatMap((g) => g.hits);

  function open(screen: string) {
    const href = SCREEN_ROUTES[screen];
    if (!href) return;
    onClose();
    router.push(href);
  }

  // The footer promises ↑↓ navigate / ↵ open. It has to be true.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!flat.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      open(flat[cursor].screen);
    }
  }

  let index = -1;

  return (
    <CenteredDrop onClose={onClose}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          borderBottom: "1px solid var(--divider)",
          color: "var(--ink3)",
        }}
      >
        <AdminIcon name="search" size={18} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search phone, name, listing ID, payment ID…"
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            color: "var(--ink1)",
            fontSize: 14,
            outline: "none",
          }}
        />
      </div>

      <div style={{ maxHeight: 340, overflowY: "auto", padding: "6px 0" }}>
        {query.trim().length < MIN_CHARS ? (
          <div style={{ fontSize: 12, color: "var(--ink3)", padding: "12px 14px" }}>
            Type at least two characters.
          </div>
        ) : loading ? (
          <div style={{ fontSize: 12, color: "var(--ink3)", padding: "12px 14px" }}>
            Searching…
          </div>
        ) : flat.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--ink3)", padding: "12px 14px" }}>
            No matches.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--ink3)",
                  padding: "8px 14px 4px",
                }}
              >
                {g.label}
              </div>
              {g.hits.map((hit) => {
                index += 1;
                const active = index === cursor;
                return (
                  <div
                    key={hit.id}
                    onClick={() => open(hit.screen)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 14px",
                      cursor: "pointer",
                      background: active ? "var(--s2)" : "transparent",
                    }}
                  >
                    <Thumb size={32} />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--ink1)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {hit.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink3)" }}>{hit.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--divider)",
          fontSize: 11,
          color: "var(--ink3)",
          display: "flex",
          gap: 12,
        }}
      >
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>esc close</span>
      </div>
    </CenteredDrop>
  );
}

"use client";

/**
 * The one piece of state every admin list shares: what the admin has asked for.
 *
 * It lives in the URL, not in React state, for three reasons that all show up as
 * bugs otherwise — a filtered list survives a reload, it can be linked to a
 * colleague, and the browser Back button undoes a filter instead of leaving the
 * screen. The server is the only thing that narrows: this hook never filters,
 * sorts or counts anything locally, it just asks again.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type ListState<R> = {
  rows: R[];
  total: number;
  tabCounts: Record<string, number>;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
};

export type AdminListApi<R> = {
  data: ListState<R> | null;
  /** first load only — a refetch keeps the previous rows on screen (no flash) */
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** current filter values, keyed by the resource's filter keys */
  filters: Record<string, string[]>;
  search: string;
  setSearch: (term: string) => void;
  setFilter: (key: string, values: string[]) => void;
  clearFilters: () => void;
  /** replace every filter at once — what applying a saved view does */
  applyFilters: (next: Record<string, string[]>) => void;
  setSort: (column: string) => void;
  setPage: (page: number) => void;
  setTab: (tab: string) => void;
  tab: string | null;
  activeFilterCount: number;
  reload: () => void;
  /** the querystring the server was asked for — export and saved views reuse it */
  query: string;
};

const RESERVED = new Set(["q", "tab", "sort", "dir", "page", "pageSize"]);

/**
 * `defaultTab` is the tab the screen opens on when the URL names none. Every
 * queue in P3 has one (the design opens A3 on "Pending", A7 on "Pending", A9 on
 * "All"), and without it the first paint shows the UNFILTERED list under a
 * highlighted tab — a table quietly disagreeing with the chip above it.
 *
 * It is not written to the URL: a default that rewrites the address on mount
 * puts an entry in history that Back cannot escape.
 */
export function useAdminList<R = Record<string, unknown>>(
  resource: string,
  filterKeys: readonly string[],
  defaultTab?: string,
): AdminListApi<R> {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [data, setData] = useState<ListState<R> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadedOnce = useRef(false);

  /**
   * `filterKeys` is depended on by the query below, and a screen that passes an
   * ARRAY LITERAL passes a new one on every render — which recomputes the
   * query, refires the fetch, sets state, and renders again, forever. Two P3
   * screens did exactly that and rendered permanently empty while hammering the
   * endpoint. Depending on the CONTENTS rather than the identity makes the trap
   * impossible to re-arm.
   */
  const filterKey = filterKeys.join(",");

  const query = useMemo(() => {
    const out = new URLSearchParams();
    for (const key of filterKeys) for (const v of params.getAll(key)) out.append(key, v);
    for (const key of RESERVED) {
      const v = params.get(key);
      if (v) out.set(key, v);
      else if (key === "tab" && defaultTab) out.set("tab", defaultTab);
    }
    return out.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, filterKey, defaultTab]);

  useEffect(() => {
    let cancelled = false;
    if (loadedOnce.current) setRefreshing(true);
    else setLoading(true);

    // no-store: a re-read straight after a mutation must not come back stale
    // from the browser cache.
    fetch(`/api/v1/admin/list/${resource}?${query}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!body.ok) {
          setError(body.error?.code ?? "SERVER_ERROR");
          setData(null);
        } else {
          setError(null);
          setData(body.data as ListState<R>);
        }
      })
      .catch(() => {
        if (!cancelled) setError("OFFLINE");
      })
      .finally(() => {
        if (cancelled) return;
        loadedOnce.current = true;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resource, query, nonce]);

  /** Write the URL. Any change other than the page itself returns to page 1 —
   *  staying on page 7 of a list that now has 2 pages shows an empty table. */
  const push = useCallback(
    (mutate: (sp: URLSearchParams) => void, keepPage = false) => {
      const sp = new URLSearchParams(params.toString());
      mutate(sp);
      if (!keepPage) sp.delete("page");
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const filters = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const key of filterKeys) {
      const values = params.getAll(key);
      if (values.length) out[key] = values;
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, filterKey]);

  return {
    data,
    loading,
    refreshing,
    error,
    filters,
    search: params.get("q") ?? "",
    tab: params.get("tab") ?? defaultTab ?? null,
    activeFilterCount: Object.values(filters).reduce((n, v) => n + v.length, 0),
    query,
    setSearch: (term) =>
      push((sp) => (term ? sp.set("q", term) : sp.delete("q"))),
    setFilter: (key, values) =>
      push((sp) => {
        sp.delete(key);
        for (const v of values) sp.append(key, v);
      }),
    clearFilters: () =>
      push((sp) => {
        for (const key of filterKeys) sp.delete(key);
        sp.delete("q");
      }),
    applyFilters: (next) =>
      push((sp) => {
        for (const key of filterKeys) sp.delete(key);
        for (const [key, values] of Object.entries(next)) {
          if (!filterKeys.includes(key)) continue;
          for (const v of values) sp.append(key, v);
        }
      }),
    setTab: (tab) => push((sp) => sp.set("tab", tab)),
    setPage: (page) => push((sp) => sp.set("page", String(page)), true),
    // Clicking the column you are already sorted by flips the direction.
    setSort: (column) =>
      push((sp) => {
        const current = sp.get("sort");
        const dir = sp.get("dir") === "asc" ? "desc" : "asc";
        sp.set("sort", column);
        sp.set("dir", current === column ? dir : "desc");
      }),
    reload: () => setNonce((n) => n + 1),
  };
}

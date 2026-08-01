import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { AdminRole } from "./session";

/**
 * The shared list engine — built ONCE, so no screen invents its own.
 *
 * §3 is the whole point of this file: a filter that renders but filters nothing
 * is a failure. So every control resolves to SQL here, never to an in-memory
 * `.filter()` over the page that happens to be loaded:
 *
 *   · filters  → `.eq/.in/.gte/.lte/.is` on the query
 *   · search   → `.or(ilike…)` across the resource's declared search columns
 *   · sort     → `.order()` in the database, across all pages
 *   · tabs     → a real `count` over the WHOLE table per tab, so a chip can
 *                never promise rows the table then fails to show
 *   · paging   → `.range()`, applied AFTER the filters, so page 2 respects them
 *   · total    → the filtered count, which is the number the design prints next
 *                to the filter bar ("128 users")
 *
 * A resource declares what it allows; anything a caller sends that is not
 * declared is dropped rather than passed through, so a crafted query string
 * cannot sort or filter by a column the resource never meant to expose.
 */

export type FilterKind =
  | "eq"
  | "in"
  | "bool"
  | "isNull"
  | "dateFrom"
  | "dateTo"
  /** numeric >= / <= — A12's price range (template 1069) is a filter pill like
   *  any other, and a range that only narrowed the loaded page would be the
   *  thing §3 forbids. Kept separate from dateFrom/dateTo so a resource says
   *  what it means. */
  | "numFrom"
  | "numTo";

export type FilterDef = {
  /** query-string key, e.g. "role" */
  key: string;
  /** database column it narrows */
  column: string;
  kind: FilterKind;
  /** closed option list; a value outside it is rejected, not passed to SQL */
  options?: readonly string[];
};

export type TabDef = {
  key: string;
  label: string;
  /** applied on top of the caller's filters to produce this tab's count + rows */
  apply: (q: PgQuery) => PgQuery;
};

export type ListResource = {
  name: string;
  table: string;
  /** the columns actually selected — never `*`, so a private column cannot leak */
  select: string;
  searchColumns: readonly string[];
  sortColumns: readonly string[];
  defaultSort: { column: string; ascending: boolean };
  filters: readonly FilterDef[];
  tabs?: readonly TabDef[];
  /** minimum role, mirroring the design's SCREEN_MIN_ROLE (template 248) */
  minRole: AdminRole;
  /**
   * The columns the settings sheet may show/hide and the export may write, in
   * the design's order.
   *
   * `key` is the UI's name for the column and `field` is the row property it
   * reads — they are NOT the same thing ("time" is `created_at`, "admin" is
   * `actor_name`), and conflating them produces an export whose columns are all
   * silently blank except the two that happen to match.
   */
  columns: readonly { key: string; label: string; field: string }[];
};

export const columnKeys = (r: ListResource) => r.columns.map((c) => c.key);

export function columnField(r: ListResource, key: string): string | null {
  return r.columns.find((c) => c.key === key)?.field ?? null;
}

/** The subset of the Supabase query builder this engine uses. */
export type PgQuery = {
  eq: (c: string, v: unknown) => PgQuery;
  in: (c: string, v: unknown[]) => PgQuery;
  is: (c: string, v: unknown) => PgQuery;
  gte: (c: string, v: unknown) => PgQuery;
  lte: (c: string, v: unknown) => PgQuery;
  or: (f: string) => PgQuery;
  order: (c: string, o: { ascending: boolean }) => PgQuery;
  range: (a: number, b: number) => PgQuery;
};

export type ListParams = {
  search?: string;
  tab?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  filters?: Record<string, string | string[]>;
};

export type ListResult<R = Record<string, unknown>> = {
  rows: R[];
  /** rows matching the current filters + search + tab — the design's "128 users" */
  total: number;
  /** every tab's real count over the whole table, under the same filters */
  tabCounts: Record<string, number>;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
};

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

/** PostgREST treats , and ) as syntax inside or(); neutralise them. */
function escapeForOr(term: string): string {
  return term.replace(/[,()\\]/g, " ").trim();
}

function applyFilters(q: PgQuery, resource: ListResource, params: ListParams): PgQuery {
  const given = params.filters ?? {};
  for (const def of resource.filters) {
    const raw = given[def.key];
    if (raw === undefined || raw === "" || (Array.isArray(raw) && !raw.length)) continue;
    const values = (Array.isArray(raw) ? raw : [raw]).map(String);

    // A closed option list means exactly that: an unknown value narrows nothing
    // rather than reaching SQL.
    const allowed = def.options ? values.filter((v) => def.options!.includes(v)) : values;
    if (!allowed.length) continue;

    switch (def.kind) {
      case "eq":
        q = allowed.length > 1 ? q.in(def.column, allowed) : q.eq(def.column, allowed[0]);
        break;
      case "in":
        q = q.in(def.column, allowed);
        break;
      case "bool":
        q = q.eq(def.column, allowed[0] === "true");
        break;
      case "isNull":
        q = q.is(def.column, allowed[0] === "true" ? null : "not.null");
        break;
      case "dateFrom":
        q = q.gte(def.column, allowed[0]);
        break;
      case "dateTo":
        q = q.lte(def.column, allowed[0]);
        break;
      case "numFrom":
      case "numTo": {
        const n = Number(allowed[0]);
        if (!Number.isFinite(n)) break;
        q = def.kind === "numFrom" ? q.gte(def.column, n) : q.lte(def.column, n);
        break;
      }
    }
  }
  return q;
}

function applySearch(q: PgQuery, resource: ListResource, params: ListParams): PgQuery {
  const term = escapeForOr(params.search ?? "");
  if (!term || !resource.searchColumns.length) return q;
  return q.or(resource.searchColumns.map((c) => `${c}.ilike.%${term}%`).join(","));
}

export async function runList<R = Record<string, unknown>>(
  resource: ListResource,
  params: ListParams,
): Promise<ListResult<R>> {
  const db = createServiceClient();

  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const page = Math.max(1, params.page ?? 1);

  // Only a column the resource declared sortable may reach `order()`.
  const sort = resource.sortColumns.includes(params.sort ?? "")
    ? (params.sort as string)
    : resource.defaultSort.column;
  const dir: "asc" | "desc" =
    params.dir === "asc" || params.dir === "desc"
      ? params.dir
      : resource.defaultSort.ascending
        ? "asc"
        : "desc";

  const tab = resource.tabs?.find((t) => t.key === params.tab) ?? null;

  /** filters + search, shared by the row query and every count. */
  const narrowed = (q: PgQuery) => applySearch(applyFilters(q, resource, params), resource, params);

  // ---- rows -------------------------------------------------------------
  let rowQuery = db.from(resource.table).select(resource.select, { count: "exact" }) as PgQuery;
  rowQuery = narrowed(rowQuery);
  if (tab) rowQuery = tab.apply(rowQuery);
  rowQuery = rowQuery
    .order(sort, { ascending: dir === "asc" })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = (await rowQuery) as unknown as {
    data: R[] | null;
    error: { message: string } | null;
    count: number | null;
  };
  if (error) throw new Error(`list ${resource.name}: ${error.message}`);

  // ---- tab counts -------------------------------------------------------
  // Counted over the whole table under the same filters — head-only, so this
  // costs a count and not a second page of rows.
  const tabCounts: Record<string, number> = {};
  for (const t of resource.tabs ?? []) {
    let q = db
      .from(resource.table)
      .select(resource.select, { count: "exact", head: true }) as PgQuery;
    q = t.apply(narrowed(q));
    const { count: c } = (await q) as unknown as { count: number | null };
    tabCounts[t.key] = c ?? 0;
  }

  return {
    rows: data ?? [],
    total: count ?? 0,
    tabCounts,
    page,
    pageSize,
    sort,
    dir,
  };
}

/** Parse a request's query string into ListParams, keeping only declared keys. */
export function parseListParams(url: URL, resource: ListResource): ListParams {
  const filters: Record<string, string[]> = {};
  for (const def of resource.filters) {
    const values = url.searchParams.getAll(def.key);
    if (values.length) filters[def.key] = values;
  }
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE));
  return {
    search: url.searchParams.get("q") ?? undefined,
    tab: url.searchParams.get("tab") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: (url.searchParams.get("dir") as "asc" | "desc") ?? undefined,
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
    filters,
  };
}

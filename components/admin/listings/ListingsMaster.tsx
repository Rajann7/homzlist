"use client";

/**
 * A12 — Listings master. Template 1056-1105.
 *
 * Every status, not just the queue's: ten chips, each carrying a real count
 * over the whole table under the current filters. The "Trash" chip is the
 * design's own exception — it NAVIGATES to A29 rather than filtering
 * (template 1068) — so it routes away and still shows its count.
 *
 * Device branches, both the design's: `if(mobile)` (1076) is a card list, and
 * `!tablet && th(…)` (1085) drops Type, Location, Stats and Posted on tablet.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminIcon,
  Avatar,
  Badge,
  Chip,
  PageHead,
  RowCheck,
  SheetMenu,
  Shimmer,
  StatusBadge,
  Thumb,
  ToolCol,
  useToast,
  usePanels,
  SCREEN_ROUTES,
} from "@/components/admin/ds";
import {
  BulkBar,
  ColumnsSheet,
  ExportModal,
  FilterBar,
  FilterSheet,
  ListToolbar,
  Pager,
  SavedViewsMenu,
  useAdminList,
  type FilterGroup,
  ListError,
} from "@/components/admin/list";
import { statusChip } from "../users/UserPanel";

type Row = {
  id: string;
  kind: "listing" | "project";
  title: string | null;
  type_code: string | null;
  type_label: string | null;
  price_paise: number | null;
  price_on_request: boolean;
  area_label: string | null;
  city_name: string | null;
  poster_id: string;
  poster_name: string | null;
  poster_role: string | null;
  status_key: string;
  cover_url: string | null;
  created_at: string;
  views_count: number;
  leads_count: number;
  is_boosted: boolean;
  reports_count: number;
  expiry_prompted: boolean;
};

const FILTER_KEYS = [
  "type",
  "city",
  "role",
  "priceMin",
  "priceMax",
  "boosted",
  "reported",
  "from",
  "to",
] as const;

/** template 1063 — the design's ten chips, in its order. */
const CHIPS: [key: string, label: string][] = [
  ["all", "All"],
  ["live", "Live"],
  ["pending", "Pending"],
  ["changes", "Changes requested"],
  ["rejected", "Rejected"],
  ["hidden", "Hidden"],
  ["sold", "Sold"],
  ["rented", "Rented"],
  ["archived", "Archived"],
  ["trash", "Trash"],
];

const COLUMNS = [
  { key: "listing", label: "Listing" },
  { key: "type", label: "Type" },
  { key: "price", label: "Price" },
  { key: "location", label: "Location" },
  { key: "poster", label: "Poster" },
  { key: "status", label: "Status" },
  { key: "stats", label: "Stats" },
  { key: "posted", label: "Posted" },
  { key: "flags", label: "Flags" },
];

const money = (paise: number | null, onRequest: boolean) => {
  if (onRequest) return "On request";
  if (paise === null || paise === undefined) return "—";
  const rupees = Number(paise) / 100;
  if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (rupees >= 1_00_000) return `₹${Math.round(rupees / 1_00_000)} Lakh`;
  return `₹${Math.round(rupees).toLocaleString("en-IN")}`;
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/**
 * The design's Location cell is "Mavdi, Rajkot" — which is exactly what
 * `area_label` already holds. Appending city_name to it produced "Kharechiya,
 * Rajkot, Rajkot", and the extra width pushed Stats, Posted and Flags off the
 * right of the 1440 table.
 */
const locationOf = (r: { area_label: string | null; city_name: string | null }) =>
  r.area_label ?? r.city_name ?? "—";

/** "Last 7 days" as a real `from` bound — the design's date pill, made SQL. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

const L = (lakh: number) => String(lakh * 100000 * 100); // ₹ lakh → paise

export function ListingsMaster({
  options,
  total,
}: {
  options: { types: { value: string; label: string }[]; cities: { value: string; label: string }[] };
  total: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const { pushPanel, changed } = usePanels();
  const list = useAdminList<Row>("listings-master", FILTER_KEYS, "all");

  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);
  const [sheet, setSheet] = useState<"filters" | "columns" | "export" | "views" | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [rowMenu, setRowMenu] = useState<Row | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(COLUMNS.map((c) => c.key));

  const tab = list.tab ?? "all";
  const rows = list.data?.rows ?? [];
  const counts = list.data?.tabCounts ?? {};
  const shows = (key: string) => visibleColumns.includes(key);

  const groups: FilterGroup[] = [
    { key: "type", label: "Type", options: options.types },
    { key: "city", label: "City/Area", options: options.cities },
    {
      key: "role",
      label: "Role",
      options: [
        { value: "owner", label: "Owner" },
        { value: "broker", label: "Broker" },
        { value: "builder", label: "Builder" },
      ],
    },
    {
      key: "boosted",
      label: "Boosted",
      options: [
        { value: "true", label: "Boosted only" },
        { value: "false", label: "Not boosted" },
      ],
    },
    { key: "reported", label: "Reported", options: [{ value: "1", label: "Reported only" }] },
    // template 1069's "Price range" and "Date". Each band is ONE chip that sets
    // two real bounds (priceMin + priceMax), so the pill the design draws stays
    // one pill and still narrows in SQL.
    {
      key: "priceMin",
      label: "Price range",
      single: true,
      options: [
        { value: "0", label: "Under ₹25 Lakh", params: { priceMax: L(25) } },
        { value: L(25), label: "₹25–50 Lakh", params: { priceMax: L(50) } },
        { value: L(50), label: "₹50 Lakh – ₹1 Cr", params: { priceMax: L(100) } },
        { value: L(100), label: "Over ₹1 Cr", params: {} },
      ],
    },
    {
      key: "from",
      label: "Date",
      single: true,
      options: [
        { value: daysAgo(7), label: "Last 7 days" },
        { value: daysAgo(30), label: "Last 30 days" },
        { value: daysAgo(90), label: "Last 90 days" },
      ],
    },
  ];

  const open = (r: Row) => pushPanel("listing", { id: r.id, kind: r.kind, title: r.title });

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function runBulk(action: string, input: Record<string, unknown> = {}) {
    const res = await fetch(`/api/v1/admin/bulk/listings-master/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ ids: selected, input }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | {
          ok?: boolean;
          data?: { done: string[]; failed: { id: string; reason: string }[] };
          error?: { message?: string };
        }
      | null;
    if (!json?.ok || !json.data) {
      toast(json?.error?.message ?? "That didn't go through");
      return;
    }
    const { done, failed } = json.data;
    toast(
      failed.length === 0
        ? `${done.length} done · logged`
        : `${done.length} done, ${failed.length} skipped (${failed[0].reason})`,
    );
    setSelected([]);
    list.reload();
  }

  return (
    <div>
      <PageHead
        title="Listings"
        sub={
          <Badge
            bg="var(--s2)"
            fg="var(--ink2)"
            style={{
              textTransform: "none",
              letterSpacing: 0,
              fontWeight: 600,
              fontSize: 13,
              padding: "5px 10px",
              borderRadius: 999,
            }}
          >
            {total.toLocaleString("en-IN")}
          </Badge>
        }
        right={
          <ListToolbar
            viewLabel="Saved views"
            onOpenViews={() => setSheet("views")}
            onOpenColumns={() => setSheet("columns")}
            onOpenExport={() => setSheet("export")}
          />
        }
      />

      {/* template 1068 — the chips; Trash routes to A29 rather than filtering */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {CHIPS.map(([key, label]) => (
          <Chip
            key={key}
            label={`${label} ${(counts[key] ?? 0).toLocaleString("en-IN")}`}
            active={tab === key}
            onClick={() => (key === "trash" ? router.push(SCREEN_ROUTES.trash) : list.setTab(key))}
          />
        ))}
      </div>

      {/* MOBILE HAS NO FILTER BAR. Template 1079 is `head, chipRow, bulk, cards`
          — the chips are the only narrowing A12 offers at 390, and rendering
          the seven pills there added ~110px of controls the design never draws.
          A10 is the opposite (template 1019 keeps its bar on mobile), which is
          why this is a per-screen branch and not a change to FilterBar. */}
      <div className="hidden md:block">
      <FilterBar
        placeholder="Title or ID"
        search={list.search}
        onSearch={list.setSearch}
        groups={groups}
        filters={list.filters}
        onOpenFilters={() => setSheet("filters")}
        onClear={list.clearFilters}
        // No count here: A12's filter bar (template 1070) is search + pills, and
        // the counts it shows are the status chips above it.
      />
      </div>

      {selected.length ? (
        <BulkBar
          selected={selected}
          cap={20}
          onClear={() => setSelected([])}
          actions={[
            { key: "hide", label: "Hide", onRun: () => void runBulk("hide") },
            { key: "approve", label: "Approve", onRun: () => void runBulk("approve") },
            { key: "delete", label: "Delete", kind: "danger", onRun: () => void runBulk("delete") },
          ]}
        />
      ) : null}

      {list.error ? (
        <ListError code={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Shimmer key={i} h={56} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        /* template 1074 — the design's own empty state */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            padding: "70px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ color: "var(--ink3)" }}>
            <AdminIcon name="inbox" size={80} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink1)" }}>
            No listings here
          </div>
          <div style={{ fontSize: 13, color: "var(--ink2)" }}>
            No listings match this status filter.
          </div>
        </div>
      ) : (
        <>
          {/* mobile — template 1076 */}
          <div className="flex flex-col gap-[10px] md:hidden">
            {rows.map((r) => (
              <div
                key={r.id}
                onClick={() => open(r)}
                style={{
                  background: "var(--s1)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  gap: 10,
                  cursor: "pointer",
                }}
              >
                <Thumb size={48} src={r.cover_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
                    #{r.id.slice(0, 8)} · {money(r.price_paise, r.price_on_request)}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <StatusBadge status={statusChip(r.status_key)} />
                    {r.is_boosted ? <StatusBadge status="Promoted" /> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* tablet + desktop — template 1085 */}
          <div
            className="hidden md:block"
            style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "auto" }}
          >
            <table
              className="md:min-w-[900px] desktop:min-w-0"
              style={{ width: "100%", borderCollapse: "collapse", background: "var(--s1)" }}
            >
              <thead>
                <tr>
                  <Th w={40} />
                  {shows("listing") ? <Th>Listing</Th> : null}
                  {shows("type") ? <Th tabletHidden>Type</Th> : null}
                  {shows("price") ? <Th>Price</Th> : null}
                  {shows("location") ? <Th tabletHidden>Location</Th> : null}
                  {shows("poster") ? <Th>Poster</Th> : null}
                  {shows("status") ? <Th>Status</Th> : null}
                  {shows("stats") ? <Th tabletHidden>Stats</Th> : null}
                  {shows("posted") ? <Th tabletHidden>Posted</Th> : null}
                  {shows("flags") ? <Th>Flags</Th> : null}
                  <Th w={40} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isSel = selected.includes(r.id);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => open(r)}
                      style={{
                        borderTop: "1px solid var(--divider)",
                        cursor: "pointer",
                        background: isSel ? "var(--accentSoft)" : "transparent",
                      }}
                    >
                      <Td>
                        <RowCheck
                          checked={isSel}
                          onToggle={() => toggle(r.id)}
                          label={`Select ${r.title ?? "listing"}`}
                        />
                      </Td>
                      {shows("listing") ? (
                        <Td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Thumb size={40} src={r.cover_url} />
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: 180,
                                    display: "inline-block",
                                  }}
                                >
                                  {r.title}
                                </span>
                                {r.is_boosted ? (
                                  <Badge
                                    bg="var(--promoted)"
                                    fg="var(--promotedInk)"
                                    style={{ fontSize: 9, padding: "1px 4px" }}
                                  >
                                    Promoted
                                  </Badge>
                                ) : null}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                                #{r.id.slice(0, 8)}
                              </div>
                            </div>
                          </div>
                        </Td>
                      ) : null}
                      {shows("type") ? (
                        <Td tabletHidden>
                          <Badge
                            bg="var(--s2)"
                            fg="var(--ink2)"
                            style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
                          >
                            {r.type_label ?? r.type_code ?? "—"}
                          </Badge>
                        </Td>
                      ) : null}
                      {shows("price") ? (
                        <Td>
                          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                            {money(r.price_paise, r.price_on_request)}
                          </span>
                        </Td>
                      ) : null}
                      {shows("location") ? (
                        <Td tabletHidden>
                          <span style={{ color: "var(--ink2)", whiteSpace: "nowrap" }}>
                            {locationOf(r)}
                          </span>
                        </Td>
                      ) : null}
                      {shows("poster") ? (
                        <Td>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              pushPanel("user", { id: r.poster_id, name: r.poster_name });
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              cursor: "pointer",
                            }}
                          >
                            <Avatar
                              initials={(r.poster_name ?? "U").slice(0, 2).toUpperCase()}
                              size={24}
                            />
                            <span>{r.poster_name}</span>
                          </span>
                        </Td>
                      ) : null}
                      {shows("status") ? (
                        <Td>
                          <StatusBadge status={statusChip(r.status_key)} />
                        </Td>
                      ) : null}
                      {shows("stats") ? (
                        <Td tabletHidden>
                          <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                            {r.views_count} views · {r.leads_count} leads
                          </span>
                        </Td>
                      ) : null}
                      {shows("posted") ? (
                        <Td tabletHidden>
                          <span style={{ color: "var(--ink2)", whiteSpace: "nowrap" }}>
                            {day(r.created_at)}
                          </span>
                        </Td>
                      ) : null}
                      {shows("flags") ? (
                        <Td>
                          <span style={{ display: "inline-flex", gap: 6 }}>
                            {r.reports_count ? (
                              <span
                                title={`${r.reports_count} reports`}
                                style={{ color: "var(--error)" }}
                              >
                                <AdminIcon name="flag" size={15} />
                              </span>
                            ) : null}
                            {r.expiry_prompted ? (
                              <span title="Expiry prompt sent" style={{ color: "var(--warning)" }}>
                                <AdminIcon name="clock" size={15} />
                              </span>
                            ) : null}
                          </span>
                        </Td>
                      ) : null}
                      <Td>
                        <button
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRowMenu(r);
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
                          <AdminIcon name="dots" size={18} />
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}

      {sheet === "filters" ? (
        <FilterSheet
          groups={groups}
          value={list.filters}
          onApply={(next) => {
            list.applyFilters(next);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "columns" ? (
        <ColumnsSheet
          resource="listings-master"
          all={COLUMNS}
          visible={visibleColumns}
          onSaved={setVisibleColumns}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "views" ? (
        <SavedViewsMenu
          resource="listings-master"
          currentFilters={list.filters}
          onApply={(f) => {
            list.applyFilters(f);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "export" ? (
        <ExportModal
          title="Export listings"
          resource="listings-master"
          query={list.query}
          total={list.data?.total ?? 0}
          fields={COLUMNS}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {/* template 1707 — the row menu */}
      {rowMenu ? (
        <RowMenu
          row={rowMenu}
          onClose={() => setRowMenu(null)}
          onOpen={() => {
            const r = rowMenu;
            setRowMenu(null);
            open(r);
          }}
          onAction={async (action) => {
            const r = rowMenu;
            setRowMenu(null);
            const res = await fetch(`/api/v1/admin/listings-master/${r.id}/actions`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({ action, kind: r.kind }),
            }).catch(() => null);
            const json = (await res?.json().catch(() => null)) as
              | { ok?: boolean; data?: { summary?: string }; error?: { message?: string } }
              | null;
            toast(json?.ok ? `${json.data?.summary} · logged` : (json?.error?.message ?? "Failed"));
            if (json?.ok) list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function RowMenu({
  row,
  onClose,
  onOpen,
  onAction,
}: {
  row: Row;
  onClose: () => void;
  onOpen: () => void;
  onAction: (action: string) => void;
}) {
  return (
    <SheetMenu onClose={onClose}>
      <ToolCol
        items={[
          ["Open listing", onOpen],
          ["Edit", onOpen],
          [
            "Open in user view ↗",
            () =>
              window.open(
                `${window.location.protocol}//${window.location.host.replace(/^[^.]+\./, "seller.")}${
                  row.kind === "project" ? `/project/${row.id}` : `/property/${row.id}`
                }`,
                "_blank",
                "noopener",
              ),
          ],
          ["Remove story", () => onAction("remove_story")],
          ["Pause boost", () => onAction("pause_boost")],
          ["Hide", () => onAction("hide")],
          ["Mark sold", () => onAction("mark_sold")],
          ["Restore", () => onAction("restore")],
          ["Delete", () => onAction("delete"), true],
        ]}
        onPick={() => undefined}
      />
    </SheetMenu>
  );
}

function Th({
  children,
  w,
  tabletHidden,
}: {
  children?: React.ReactNode;
  w?: number;
  tabletHidden?: boolean;
}) {
  return (
    <th
      className={tabletHidden ? "hidden desktop:table-cell" : undefined}
      style={{
        textAlign: "left",
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink2)",
        background: "var(--s2)",
        whiteSpace: "nowrap",
        width: w,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, tabletHidden }: { children?: React.ReactNode; tabletHidden?: boolean }) {
  return (
    <td
      className={tabletHidden ? "hidden desktop:table-cell" : undefined}
      style={{ padding: "12px 16px", fontSize: 13, color: "var(--ink1)", verticalAlign: "middle" }}
    >
      {children}
    </td>
  );
}

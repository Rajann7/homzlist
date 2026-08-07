"use client";

/**
 * A10 — Users. Template 994-1046.
 *
 * Twelve columns and a card list, six filter pills, the saved-views / columns /
 * export toolbar, a bulk bar and a row menu. All of it is the P1 engine and the
 * P1b controls: this file draws the design's cells and nothing narrows anything
 * in the browser.
 *
 * The two device branches are the design's own: `if(mobile)` (template 1029)
 * gives a card list, and `!tablet && th(…)` (template 1032) drops Verification,
 * City, Leads and Joined on tablet. A 1000px table on a 390px screen is a
 * failure, and so is inventing a card list where the design keeps its table.
 */

import { useEffect, useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  CopyBtn,
  PageHead,
  RoleChip,
  RowCheck,
  SheetMenu,
  Shimmer,
  StatusBadge,
  ToolCol,
  VerifCluster,
  useToast,
  usePanels,
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
} from "@/components/admin/list";
import {
  GrantTrialOverlay,
  SendMessageOverlay,
  SuspendOverlay,
  makeRunner,
} from "./overlays";

export type UserRow = {
  id: string;
  name: string | null;
  handle: string;
  phone: string | null;
  role: string | null;
  city_name: string | null;
  v_phone: boolean;
  v_id: boolean;
  v_rera: boolean;
  plan_names: string[];
  plan_key: string;
  trial_ends_at: string | null;
  listings_count: number;
  listings_live: number;
  listings_other: number;
  leads_count: number;
  reports_count: number;
  is_new: boolean;
  joined_at: string;
  status_key: string;
};

const FILTER_KEYS = ["role", "status", "plan", "city", "verification", "from", "to"] as const;

/** template 1032 — the design's column set, in its order. */
const COLUMNS = [
  { key: "user", label: "User" },
  { key: "phone", label: "Phone" },
  { key: "role", label: "Role" },
  { key: "verification", label: "Verification" },
  { key: "city", label: "City" },
  { key: "plans", label: "Plans" },
  { key: "listings", label: "Listings" },
  { key: "leads", label: "Leads" },
  { key: "joined", label: "Joined" },
  { key: "status", label: "Status" },
];

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  trial: "Trial",
  deleted: "Deleted",
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const initials = (name: string | null) => (name ?? "U").slice(0, 2).toUpperCase();

/** "Last 7 days" as a real `from` bound — the design's date pill, made SQL. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}


export function UsersScreen({
  options,
  total,
}: {
  options: { cities: { value: string; label: string }[] };
  /** the design's "4,281 users" badge — every registered account, not the page */
  total: number;
}) {
  const toast = useToast();
  const { pushPanel, changed } = usePanels();
  const list = useAdminList<UserRow>("users", FILTER_KEYS);

  // A suspend/verify/role change happens inside the panel; this table prints
  // the same columns and must not keep showing the pre-action values.
  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);
  const [sheet, setSheet] = useState<"filters" | "columns" | "export" | "views" | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [rowMenu, setRowMenu] = useState<UserRow | null>(null);
  const [bulkOverlay, setBulkOverlay] = useState<"message" | "grant" | "suspend" | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(COLUMNS.map((c) => c.key));
  const [templates, setTemplates] = useState<
    { code: string; subject: string | null; body: string }[]
  >([]);

  const rows = list.data?.rows ?? [];
  const shows = (key: string) => visibleColumns.includes(key);

  // The templates the bulk Send-message sheet offers, from the table A21 owns.
  // In an EFFECT, not during render: fetching in the render body set state on an
  // unmounted component and React said so in the console on every load.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/message-templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setTemplates(j?.data?.rows ?? []))
      .catch(() => !cancelled && setTemplates([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const groups: FilterGroup[] = [
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
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "suspended", label: "Suspended" },
        { value: "trial", label: "Trial" },
        { value: "deleted", label: "Deleted" },
      ],
    },
    {
      key: "plan",
      label: "Plan",
      options: [
        { value: "paid", label: "On a paid plan" },
        { value: "trial", label: "On a trial" },
        { value: "none", label: "No plan" },
      ],
    },
    { key: "city", label: "City", options: options.cities },
    {
      key: "verification",
      label: "Verification",
      options: [
        { value: "rera", label: "RERA verified" },
        { value: "id", label: "ID verified" },
        { value: "phone", label: "Phone only" },
        { value: "none", label: "Unverified" },
      ],
    },
    // template 1005's sixth pill. A date range is one choice, so it is a
    // single-select group and every option is a real `joined_at >= …` bound.
    {
      key: "from",
      label: "Joined",
      single: true,
      options: [
        { value: daysAgo(7), label: "Last 7 days" },
        { value: daysAgo(30), label: "Last 30 days" },
        { value: daysAgo(90), label: "Last 90 days" },
        { value: daysAgo(365), label: "Last year" },
      ],
    },
  ];

  /** The bulk bar's three actions run through the shared bulk endpoint. */
  async function runBulk(action: string, input: Record<string, unknown>) {
    const res = await fetch(`/api/v1/admin/bulk/users/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ ids: selected, input }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { done: string[]; failed: { id: string; reason: string }[] }; error?: { message?: string } }
      | null;
    if (!json?.ok || !json.data)
      return { ok: false, message: json?.error?.message ?? "That didn't go through" };
    const { done, failed } = json.data;
    return {
      ok: true,
      summary:
        failed.length === 0
          ? `${done.length} done · logged`
          : `${done.length} done, ${failed.length} skipped (${failed[0].reason})`,
    };
  }

  const openUser = (r: UserRow) => pushPanel("user", { id: r.id, name: r.name });

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div>
      <PageHead
        title="Users"
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
            {`${total.toLocaleString("en-IN")} users`}
          </Badge>
        }
        right={
          <ListToolbar
            viewLabel="All users"
            onOpenViews={() => setSheet("views")}
            onOpenColumns={() => setSheet("columns")}
            onOpenExport={() => setSheet("export")}
          />
        }
      />

      <FilterBar
        placeholder="Name or phone"
        search={list.search}
        onSearch={list.setSearch}
        groups={groups}
        filters={list.filters}
        onOpenFilters={() => setSheet("filters")}
        onClear={list.clearFilters}
        countLabel={`${(list.data?.total ?? 0).toLocaleString("en-IN")} users`}
      />

      {selected.length ? (
        <BulkBar
          selected={selected}
          cap={20}
          onClear={() => setSelected([])}
          actions={[
            { key: "message", label: "Send message", onRun: () => setBulkOverlay("message") },
            { key: "grant", label: "Grant trial", onRun: () => setBulkOverlay("grant") },
            { key: "suspend", label: "Suspend", kind: "danger", onRun: () => setBulkOverlay("suspend") },
          ]}
        />
      ) : null}

      {list.loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Shimmer key={i} h={56} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        /* template 1017 — the design's own empty state */
        <div style={{ textAlign: "center", padding: 70, color: "var(--ink3)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <AdminIcon name="users" size={72} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink1)" }}>No users match</div>
          <div style={{ fontSize: 13 }}>Try clearing some filters.</div>
        </div>
      ) : (
        <>
          {/* mobile — template 1029 */}
          <div className="flex flex-col gap-[10px] md:hidden">
            {rows.map((r) => (
              <div
                key={r.id}
                onClick={() => openUser(r)}
                style={{
                  background: r.status_key === "suspended" ? "var(--errorSoft)" : "var(--s1)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  gap: 10,
                  cursor: "pointer",
                }}
              >
                <Avatar
                  initials={initials(r.name)}
                  size={40}
                  background={r.status_key === "deleted" ? "var(--s3)" : undefined}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: r.status_key === "deleted" ? "var(--ink3)" : "var(--ink1)",
                      }}
                    >
                      {r.name}
                    </span>
                    {r.is_new ? (
                      <Badge bg="var(--warningSoft)" fg="var(--warning)" style={{ fontSize: 10, padding: "1px 5px" }}>
                        New
                      </Badge>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>{r.phone}</div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginTop: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <RoleChip role={roleLabel(r.role)} />
                    <StatusBadge status={STATUS_LABEL[r.status_key] ?? r.status_key} />
                    {r.trial_ends_at ? (
                      <span style={{ fontSize: 11, color: "var(--info)" }}>
                        {daysLeft(r.trial_ends_at)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* tablet + desktop — template 1032 */}
          <div
            className="hidden md:block"
            style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "auto" }}
          >
            <table
              className="md:min-w-[820px] desktop:min-w-0"
              style={{ width: "100%", borderCollapse: "collapse", background: "var(--s1)" }}
            >
              <thead>
                <tr>
                  <Th w={40} />
                  {shows("user") ? <Th>User</Th> : null}
                  {shows("phone") ? <Th>Phone</Th> : null}
                  {shows("role") ? <Th>Role</Th> : null}
                  {shows("verification") ? <Th tabletHidden>Verification</Th> : null}
                  {shows("city") ? <Th tabletHidden>City</Th> : null}
                  {shows("plans") ? <Th>Plans</Th> : null}
                  {shows("listings") ? <Th>Listings</Th> : null}
                  {shows("leads") ? <Th tabletHidden>Leads</Th> : null}
                  {shows("joined") ? <Th tabletHidden>Joined</Th> : null}
                  {shows("status") ? <Th>Status</Th> : null}
                  <Th w={40} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isSel = selected.includes(r.id);
                  const deleted = r.status_key === "deleted";
                  return (
                    <tr
                      key={r.id}
                      onClick={() => !deleted && openUser(r)}
                      style={{
                        borderTop: "1px solid var(--divider)",
                        cursor: deleted ? "default" : "pointer",
                        background: isSel
                          ? "var(--accentSoft)"
                          : r.status_key === "suspended"
                            ? "var(--errorSoft)"
                            : "transparent",
                      }}
                    >
                      <Td>
                        <RowCheck
                          checked={isSel}
                          disabled={deleted}
                          onToggle={() => toggle(r.id)}
                          label={`Select ${r.name ?? "user"}`}
                        />
                      </Td>
                      {shows("user") ? (
                        <Td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Avatar
                              initials={initials(r.name)}
                              size={32}
                              background={deleted ? "var(--s3)" : undefined}
                            />
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: deleted ? "var(--ink3)" : "var(--ink1)",
                                  }}
                                >
                                  {r.name}
                                </span>
                                {r.is_new ? (
                                  <Badge
                                    bg="var(--warningSoft)"
                                    fg="var(--warning)"
                                    style={{ fontSize: 10, padding: "1px 5px" }}
                                  >
                                    New
                                  </Badge>
                                ) : null}
                                {r.reports_count ? (
                                  <span
                                    title={`${r.reports_count} reports`}
                                    style={{ color: "var(--error)", display: "inline-flex" }}
                                  >
                                    <AdminIcon name="flag" size={13} />
                                  </span>
                                ) : null}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--ink3)" }}>{r.handle}</div>
                            </div>
                          </div>
                        </Td>
                      ) : null}
                      {shows("phone") ? (
                        <Td>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              color: "var(--ink2)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {r.phone}
                            {deleted ? null : <CopyBtn value={r.phone ?? ""} />}
                          </span>
                        </Td>
                      ) : null}
                      {shows("role") ? (
                        <Td>
                          <RoleChip role={roleLabel(r.role)} />
                        </Td>
                      ) : null}
                      {shows("verification") ? (
                        <Td tabletHidden>
                          {deleted ? (
                            "—"
                          ) : (
                            <VerifCluster v={{ phone: r.v_phone, id: r.v_id, rera: r.v_rera }} />
                          )}
                        </Td>
                      ) : null}
                      {shows("city") ? (
                        <Td tabletHidden>
                          <span style={{ color: "var(--ink2)" }}>{r.city_name ?? "—"}</span>
                        </Td>
                      ) : null}
                      {shows("plans") ? (
                        <Td>
                          {r.plan_names?.length ? (
                            <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                              {/* Keyed by INDEX, not by name: a user can hold two of
                                  the same plan (buy the ₹999 twice) and React
                                  drops the duplicate, so one of the two chips
                                  the design draws silently vanished. */}
                              {r.plan_names.map((p, i) => (
                                <Badge
                                  key={`${p}-${i}`}
                                  bg="var(--accentSoft)"
                                  fg="var(--accent)"
                                  style={{ textTransform: "none", letterSpacing: 0 }}
                                >
                                  {p}
                                </Badge>
                              ))}
                            </span>
                          ) : (
                            <span style={{ color: "var(--ink3)" }}>No plan</span>
                          )}
                        </Td>
                      ) : null}
                      {shows("listings") ? (
                        <Td>
                          <span>
                            {r.listings_count}
                            <span style={{ fontSize: 11, color: "var(--ink3)", marginLeft: 4 }}>
                              {r.listings_live}/{r.listings_other}
                            </span>
                          </span>
                        </Td>
                      ) : null}
                      {shows("leads") ? <Td tabletHidden>{r.leads_count}</Td> : null}
                      {shows("joined") ? (
                        <Td tabletHidden>
                          <span style={{ color: "var(--ink2)", whiteSpace: "nowrap" }}>
                            {day(r.joined_at)}
                          </span>
                        </Td>
                      ) : null}
                      {shows("status") ? (
                        <Td>
                          {r.trial_ends_at ? (
                            <div>
                              <StatusBadge status={STATUS_LABEL[r.status_key] ?? r.status_key} />
                              <div style={{ fontSize: 11, color: "var(--info)", marginTop: 2 }}>
                                {daysLeft(r.trial_ends_at)}
                              </div>
                            </div>
                          ) : (
                            <StatusBadge status={STATUS_LABEL[r.status_key] ?? r.status_key} />
                          )}
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
          resource="users"
          all={COLUMNS}
          visible={visibleColumns}
          onSaved={(cols) => setVisibleColumns(cols)}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "views" ? (
        <SavedViewsMenu
          resource="users"
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
          title="Export users"
          resource="users"
          query={list.query}
          total={list.data?.total ?? 0}
          fields={COLUMNS}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {/* template 1706 — the row menu */}
      {rowMenu ? (
        <UserRowMenu
          row={rowMenu}
          onClose={() => setRowMenu(null)}
          onOpen={() => {
            const r = rowMenu;
            setRowMenu(null);
            openUser(r);
          }}
        />
      ) : null}

      {/* the bulk bar's sheets — the same components A11 opens */}
      {bulkOverlay === "message" ? (
        <SendMessageOverlay
          run={async (b) =>
            runBulk("send_message", {
              channels: b.channels,
              subject: b.subject,
              body: b.body,
            })
          }
          ids={selected}
          templates={templates}
          onClose={() => setBulkOverlay(null)}
          onDone={(m) => {
            setBulkOverlay(null);
            setSelected([]);
            toast(m);
            list.reload();
          }}
        />
      ) : null}
      {bulkOverlay === "grant" ? (
        <GrantTrialOverlay
          run={async (b) =>
            runBulk("grant_trial", {
              contents: b.contents,
              durationDays: b.durationDays,
              reason: b.reason,
              note: b.note,
            })
          }
          ids={selected}
          userName={`${selected.length} users`}
          onClose={() => setBulkOverlay(null)}
          onDone={(m) => {
            setBulkOverlay(null);
            setSelected([]);
            toast(m);
            list.reload();
          }}
        />
      ) : null}
      {bulkOverlay === "suspend" ? (
        <SuspendOverlay
          run={async (b) => runBulk("suspend", { days: b.days, reason: b.reason })}
          onClose={() => setBulkOverlay(null)}
          onDone={(m) => {
            setBulkOverlay(null);
            setSelected([]);
            toast(m);
            list.reload();
          }}
        />
      ) : null}

    </div>
  );
}

function UserRowMenu({
  row,
  onClose,
  onOpen,
}: {
  row: UserRow;
  onClose: () => void;
  onOpen: () => void;
}) {
  const toast = useToast();
  const run = makeRunner(row.id);
  const [overlay, setOverlay] = useState<"message" | "grant" | "suspend" | "impersonate" | null>(null);

  if (overlay === "message")
    return (
      <SendMessageOverlay
        run={run}
        templates={[]}
        onClose={onClose}
        onDone={(m) => {
          toast(m);
          onClose();
        }}
      />
    );
  if (overlay === "grant")
    return (
      <GrantTrialOverlay
        run={run}
        userName={row.name ?? "User"}
        onClose={onClose}
        onDone={(m) => {
          toast(m);
          onClose();
        }}
      />
    );
  if (overlay === "suspend")
    return (
      <SuspendOverlay
        run={run}
        onClose={onClose}
        onDone={(m) => {
          toast(m);
          onClose();
        }}
      />
    );

  return (
    <SheetMenu onClose={onClose}>
      <ToolCol
        items={[
          ["Open user", onOpen],
          ["Send message", () => setOverlay("message")],
          ["Suspend", () => setOverlay("suspend"), true],
          ["Grant trial", () => setOverlay("grant")],
          // Impersonation starts from the user panel, where the design puts the
          // running session's banner — sending it from a row menu would leave
          // the session live with nothing on screen saying so.
          ["Impersonate", onOpen],
        ]}
        onPick={() => undefined}
      />
    </SheetMenu>
  );
}

function roleLabel(role: string | null): string {
  if (!role) return "Owner";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function daysLeft(iso: string): string {
  const days = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
  return `${days} days left`;
}

/* The design's own th/td, including the tablet drop (template 1032). */
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

function Td({
  children,
  tabletHidden,
}: {
  children?: React.ReactNode;
  tabletHidden?: boolean;
}) {
  return (
    <td
      className={tabletHidden ? "hidden desktop:table-cell" : undefined}
      style={{
        padding: "12px 16px",
        fontSize: 13,
        color: "var(--ink1)",
        verticalAlign: "middle",
      }}
    >
      {children}
    </td>
  );
}

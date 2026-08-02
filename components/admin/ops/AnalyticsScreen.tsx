"use client";

/**
 * A28 — Analytics. Template 2630-2691.
 *
 * Five tabs. The rule that shapes all of them: a percentage with nothing to
 * compare against is NOT zero, it is unknown — so a stage with no prior stage,
 * an event with no previous window and an area with no priced listings all read
 * "—" rather than "0%". A dashboard that rounds unknowns to zero is one nobody
 * can act on.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AdminIcon,
  Badge,
  Btn,
  Chip,
  DTable,
  Modal,
  Mono,
  ModTabs,
  NoteStrip,
  PageHead,
  Shimmer,
  type Col,
} from "@/components/admin/ds";
import { ExportModal } from "@/components/admin/list";

type Tab = "funnel" | "events" | "content" | "cities" | "definitions";

const TABS: [Tab, string][] = [
  ["funnel", "Funnel"],
  ["events", "Events"],
  ["content", "Content"],
  ["cities", "Cities"],
  ["definitions", "Definitions"],
];

const RANGES: [days: number, label: string][] = [
  [7, "Last 7 days"],
  [30, "Last 30 days"],
  [90, "Last 90 days"],
];

const rupees = (paise: unknown) =>
  `₹${Math.round(Number(paise ?? 0) / 100).toLocaleString("en-IN")}`;

export function AnalyticsScreen() {
  const [tab, setTab] = useState<Tab>("funnel");
  const [days, setDays] = useState(30);
  const [segment, setSegment] = useState("All");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const q = tab === "funnel" ? `&days=${days}&segment=${encodeURIComponent(segment)}` : "";
    const res = await fetch(`/api/v1/admin/system?what=${tab}${q}`, { cache: "no-store" }).catch(
      () => null,
    );
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: Record<string, unknown> }
      | null;
    setData(json?.ok ? (json.data ?? null) : null);
    setLoading(false);
  }, [tab, days, segment]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHead
        title="Analytics"
        right={
          /* template 2637 — a range BUTTON and a download button, not a chip row */
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setRangeOpen(true)}
              style={{
                height: 36,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--s1)",
                color: "var(--ink1)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {RANGES.find(([d]) => d === days)?.[1] ?? "Last 30 days"}
              <AdminIcon name="chevD" size={16} />
            </button>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              title="Export"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--s1)",
                color: "var(--ink2)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AdminIcon name="download" size={18} />
            </button>
          </div>
        }
      />
      <ModTabs tabs={TABS} active={tab} onSelect={(k) => setTab(k as Tab)} />

      {loading || !data ? (
        <Shimmer h={300} />
      ) : tab === "funnel" ? (
        <FunnelTab data={data} segment={segment} onSegment={setSegment} />
      ) : tab === "events" ? (
        <EventsTab data={data} />
      ) : tab === "content" ? (
        <ContentTab data={data} />
      ) : tab === "cities" ? (
        <CitiesTab data={data} />
      ) : (
        <DefinitionsTab data={data} />
      )}

      {rangeOpen ? (
        <Modal
          title="Date range"
          onClose={() => setRangeOpen(false)}
          footer={<Btn label="Close" kind="outline" onClick={() => setRangeOpen(false)} style={{ flex: 1 }} />}
        >
          {RANGES.map(([d, label]) => (
            <label
              key={d}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", fontSize: 13, cursor: "pointer" }}
            >
              <input
                type="radio"
                name="anrange"
                checked={days === d}
                onChange={() => {
                  setDays(d);
                  setRangeOpen(false);
                }}
                style={{ accentColor: "var(--accent)" }}
              />
              {label}
            </label>
          ))}
        </Modal>
      ) : null}

      {exportOpen ? (
        <ExportModal
          title="Export analytics"
          resource="analytics-events"
          query=""
          total={0}
          fields={[
            { key: "event", label: "Event" },
            { key: "count", label: "Count (30d)" },
            { key: "prev", label: "Previous 30d" },
            { key: "last", label: "Last seen" },
          ]}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </div>
  );
}

function FunnelTab({
  data,
  segment,
  onSegment,
}: {
  data: Record<string, unknown>;
  segment: string;
  onSegment: (s: string) => void;
}) {
  const segments = (data.segments ?? ["All"]) as string[];
  const stages = (data.stages ?? []) as {
    key: string;
    label: string;
    n: number;
    pct: number | null;
    lost: number;
  }[];

  const chipRow = (
    /* template 2645 — the segment chips. Each one re-queries; it is not a
       client-side re-slice of the funnel already on screen. */
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      {segments.map((x) => (
        <Chip key={x} label={x} active={segment === x} onClick={() => onSegment(x)} />
      ))}
    </div>
  );

  if (!stages.length || stages.every((s) => s.n === 0)) {
    return (
      <div>
        {chipRow}
        <NoteStrip tone="neutral">
          {segment === "All"
            ? "No events in this range."
            : `No events from ${segment} in this range.`}
        </NoteStrip>
      </div>
    );
  }

  return (
    <div>
      {chipRow}
      {/* A segmented funnel cannot claim the whole site's visitor count, so it
          does not print one. */}
      {data.visitors !== null && data.visitors !== undefined ? (
        <div style={{ fontSize: 12, color: "var(--ink3)", marginBottom: 14 }}>
          {Number(data.visitors).toLocaleString("en-IN")} visitors in this range
        </div>
      ) : null}
      {stages.map((st, i) => (
        <div key={st.key} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: `${100 - i * 14}%`,
                minWidth: 180,
                maxWidth: "100%",
                background: "var(--accent)",
                opacity: 1 - i * 0.13,
                borderRadius: 8,
                padding: "12px 16px",
                color: "#fff",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{st.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {st.n.toLocaleString("en-IN")}
                {/* The percentage is of the stage BEFORE it, and it is "—"
                    when the previous stage was empty rather than 0%. */}
                {i > 0 ? `  ·  ${st.pct === null ? "—" : `${st.pct}%`}` : ""}
              </div>
            </div>
            {i > 0 && st.lost > 0 ? (
              <span style={{ fontSize: 12, color: "var(--ink3)" }}>
                −{st.lost.toLocaleString("en-IN")} dropped off here
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventsTab({ data }: { data: Record<string, unknown> }) {
  type Row = {
    id: string;
    name: string;
    count_30d: number;
    count_prev_30d: number;
    last_seen_at: string;
    trend_pct: number | null;
  };
  const rows = (data.rows ?? []) as Row[];

  const cols: Col<Row>[] = [
    { label: "Event", cell: (r) => <Mono style={{ fontWeight: 600 }}>{r.name}</Mono> },
    {
      label: "Count (30d)",
      cell: (r) => <span style={{ fontWeight: 600 }}>{Number(r.count_30d).toLocaleString("en-IN")}</span>,
    },
    {
      label: "Trend",
      cell: (r) =>
        r.trend_pct === null ? (
          // Nothing in the previous window, so there is no trend — not a 100%
          // rise.
          <span style={{ fontSize: 12, color: "var(--ink3)" }}>no prior window</span>
        ) : (
          <Badge
            bg={r.trend_pct >= 0 ? "var(--accentSoft)" : "var(--errorSoft)"}
            fg={r.trend_pct >= 0 ? "var(--accent)" : "var(--error)"}
            style={{ textTransform: "none", letterSpacing: 0 }}
          >
            {`${r.trend_pct >= 0 ? "▲" : "▼"} ${Math.abs(r.trend_pct)}%`}
          </Badge>
        ),
    },
    {
      label: "Last seen",
      cell: (r) => (
        <span style={{ color: "var(--ink3)" }}>
          {r.last_seen_at
            ? new Date(r.last_seen_at).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </span>
      ),
    },
  ];

  return rows.length === 0 ? (
    <NoteStrip tone="neutral">No events recorded yet.</NoteStrip>
  ) : (
    <DTable cols={cols} rows={rows} />
  );
}

function ContentTab({ data }: { data: Record<string, unknown> }) {
  type Area = { id: string; name: string; listings: number };
  const areas = (data.top_areas ?? []) as Area[];
  const impressions = data.story_impressions_24h as number | null;

  return (
    <div>
      {/* template 2666 — 2 columns on mobile, 4 above */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" style={{ marginBottom: 16 }}>
        {[
          [Number(data.live_listings ?? 0).toLocaleString("en-IN"), "Live listings"],
          [Number(data.requirements ?? 0).toLocaleString("en-IN"), "Requirements"],
          [Number(data.projects ?? 0).toLocaleString("en-IN"), "Projects"],
          [
            // Null, not 0: nothing has aggregated story impressions on this
            // environment and "0" would read as "nobody looked".
            impressions === null ? "—" : impressions.toLocaleString("en-IN"),
            "24h story impressions",
          ],
        ].map(([v, l]) => (
          <div
            key={l}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--s1)",
              padding: 16,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700 }}>{v}</div>
            <div style={{ fontSize: 13, color: "var(--ink2)", marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      <NoteStrip tone="neutral">
        Story analytics are admin-only — users never see story views.
      </NoteStrip>

      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Top areas</div>
      {areas.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>No live listings to rank.</div>
      ) : (
        <DTable
          cols={[
            { label: "Area", cell: (r: Area) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { label: "Live listings", cell: (r: Area) => r.listings.toLocaleString("en-IN") },
          ]}
          rows={areas}
        />
      )}
    </div>
  );
}

function CitiesTab({ data }: { data: Record<string, unknown> }) {
  type City = { id: string; name: string; signups: number; listings: number; inquiries: number; revenue: number };
  type Signal = { name: string; n: number; first: string };
  const cities = (data.cities ?? []) as City[];
  const expansion = (data.expansion ?? []) as Signal[];

  return (
    <div>
      {cities.length === 0 ? (
        <NoteStrip tone="neutral">No per-city stats recorded for this range.</NoteStrip>
      ) : (
        <DTable
          cols={[
            { label: "City", cell: (r: City) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { label: "Signups", cell: (r: City) => r.signups.toLocaleString("en-IN") },
            { label: "Listings", cell: (r: City) => r.listings.toLocaleString("en-IN") },
            { label: "Inquiries", cell: (r: City) => r.inquiries.toLocaleString("en-IN") },
            { label: "Revenue", cell: (r: City) => rupees(r.revenue) },
          ]}
          rows={cities}
        />
      )}

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--s1)",
          padding: 16,
          marginTop: 16,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Expansion signals</div>
        {expansion.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--ink3)" }}>
            Nobody has asked for a city we have not launched.
          </div>
        ) : (
          expansion.map((e, i) => (
            <div
              key={e.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderTop: i ? "1px solid var(--divider)" : "none",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                  {e.n} interested user{e.n === 1 ? "" : "s"} · first request{" "}
                  {new Date(e.first).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </div>
              </div>
              {/* Launching a city is a Master-data action (A19's location tree
                  sets `is_launched`), so this points there rather than being a
                  second, competing switch. */}
              <span style={{ fontSize: 12, color: "var(--ink3)" }}>
                Launch it from Master data → Locations
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DefinitionsTab({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows ?? []) as { key: string; label: string; definition: string }[];
  return (
    <div
      style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--s1)", padding: 20 }}
    >
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink3)" }}>No metric definitions recorded.</div>
      ) : (
        rows.map((d, i) => (
          <div
            key={d.key}
            style={{
              padding: "12px 0",
              borderTop: i ? "1px solid var(--divider)" : "none",
              fontSize: 13,
              color: "var(--ink2)",
            }}
          >
            <b style={{ color: "var(--ink1)" }}>{d.label} = </b>
            {d.definition}
          </div>
        ))
      )}
      <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 12 }}>
        These definitions are fixed — changing them breaks historical comparisons.
      </div>
    </div>
  );
}

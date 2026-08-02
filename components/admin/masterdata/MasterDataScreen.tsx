"use client";

/**
 * A19 — Master data. Template 2032-2180.
 *
 * Six tabs. Everything they edit is read by the PRODUCT: the location tree
 * decides where a listing can be, the amenities and property types decide what
 * a seller is shown, and the last two decide what gets flagged for moderation.
 *
 * The locations tab is the one that differs most from a naive port. The
 * prototype's tree is a dozen hardcoded nodes; the table has 163,424 rows, so
 * children are fetched per node and each row carries a real child count and a
 * real listing count.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AdminIcon,
  Avatar,
  Badge,
  Btn,
  DTable,
  FField,
  F_INPUT_STYLE,
  F_TEXTAREA_STYLE,
  Modal,
  ModTabs,
  Mono,
  NoteStrip,
  PageHead,
  RowMenu,
  SCREEN_ROUTES,
  Shimmer,
  StatusBadge,
  Switch,
  useToast,
  usePanels,
  type Col,
} from "@/components/admin/ds";
import { FilterBar, FilterSheet, Pager, useAdminList, type FilterGroup } from "@/components/admin/list";

type Tab = "locations" | "amenities" | "types" | "blocklist" | "patterns" | "requests";

const TABS: [Tab, string][] = [
  ["locations", "Locations"],
  ["amenities", "Amenities"],
  ["types", "Property types"],
  ["blocklist", "Blocklist"],
  ["patterns", "Number patterns"],
  ["requests", "Area requests"],
];

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/v1/admin/master-data", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  }).catch(() => null);
  return (await res?.json().catch(() => null)) as
    | { ok?: boolean; data?: Record<string, unknown>; error?: { message?: string } }
    | null;
}

export function MasterDataScreen({ pendingRequests }: { pendingRequests: number }) {
  const [tab, setTab] = useState<Tab>("locations");

  return (
    <div>
      <PageHead title="Master data" />
      <ModTabs
        tabs={TABS.map(([k, l]) =>
          // template 2035 — only the last tab carries a count, and it is the
          // real number of pending requests.
          k === "requests" ? [k, l, pendingRequests || undefined] : [k, l],
        )}
        active={tab}
        onSelect={(k) => setTab(k as Tab)}
      />
      {tab === "locations" ? (
        <LocationsTab />
      ) : tab === "amenities" ? (
        <AmenitiesTab />
      ) : tab === "types" ? (
        <TypesTab />
      ) : tab === "blocklist" ? (
        <BlocklistTab />
      ) : tab === "patterns" ? (
        <PatternsTab />
      ) : (
        <RequestsTab />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════ tab 1 · locations ══════ */

type Node = {
  id: string;
  name: string;
  name_gu: string | null;
  level: string;
  is_active: boolean;
  child_count: number;
  listings_count: number;
};

function LocationsTab() {
  const toast = useToast();
  const [roots, setRoots] = useState<Node[] | null>(null);
  const [children, setChildren] = useState<Record<string, Node[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Node[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  const loadRoots = useCallback(async () => {
    const res = await fetch("/api/v1/admin/master-data?what=tree&parent=root", {
      cache: "no-store",
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { nodes: Node[] } }
      | null;
    setRoots(json?.ok ? (json.data?.nodes ?? []) : []);
  }, []);

  useEffect(() => {
    void loadRoots();
  }, [loadRoots, nonce]);

  const toggle = async (node: Node) => {
    if (open[node.id]) {
      setOpen((o) => ({ ...o, [node.id]: false }));
      return;
    }
    setOpen((o) => ({ ...o, [node.id]: true }));
    if (children[node.id]) return;
    const res = await fetch(`/api/v1/admin/master-data?what=tree&parent=${node.id}`, {
      cache: "no-store",
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { nodes: Node[] } }
      | null;
    setChildren((c) => ({ ...c, [node.id]: json?.ok ? (json.data?.nodes ?? []) : [] }));
  };

  // The design's search box. Two characters is the server's own floor — below
  // it a prefix search over 163k rows returns everything and means nothing.
  useEffect(() => {
    if (term.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/v1/admin/master-data?what=search&q=${encodeURIComponent(term)}`,
        { cache: "no-store" },
      ).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok?: boolean; data?: { nodes: Node[] } }
        | null;
      setResults(json?.ok ? (json.data?.nodes ?? []) : []);
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  const toggleNode = async (node: Node) => {
    const json = await post({
      action: "location_save",
      id: node.id,
      name: node.name,
      is_active: !node.is_active,
      reason: node.is_active ? "Deactivated from the tree" : "Reactivated from the tree",
    });
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) {
      setChildren({});
      setNonce((n) => n + 1);
    }
  };

  const row = (node: Node, level: number): React.ReactNode => (
    <div key={`${node.id}-${level}`}>
      <div
        onClick={() => (node.child_count ? void toggle(node) : setSelected(node.id))}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 8px",
          paddingLeft: 8 + level * 16,
          borderRadius: 8,
          cursor: "pointer",
          background: selected === node.id ? "var(--accentSoft)" : "transparent",
        }}
      >
        {node.child_count ? (
          <span
            style={{
              color: "var(--ink3)",
              display: "flex",
              transform: open[node.id] ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform .2s",
            }}
          >
            <AdminIcon name="chevD" size={14} />
          </span>
        ) : (
          <span style={{ width: 14, flex: "none" }} />
        )}
        <span
          style={{
            color: node.child_count ? "var(--accent)" : "var(--ink3)",
            flex: "none",
            display: "flex",
          }}
        >
          <AdminIcon name={node.child_count ? "db" : "pin"} size={16} />
        </span>
        <span
          onClick={(e) => {
            e.stopPropagation();
            setSelected(node.id);
          }}
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: selected === node.id ? 600 : 400,
            color: "var(--ink1)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {node.name}
        </span>
        <span style={{ fontSize: 11, color: "var(--ink3)" }}>
          {node.listings_count.toLocaleString("en-IN")} listings
        </span>
        {/* template 2064 — every row carries the ⋯ menu. */}
        <span onClick={(e) => e.stopPropagation()} style={{ display: "flex" }}>
          <RowMenu
            items={[
              ["Add child area", () => { setSelected(node.id); setAddOpen(true); }],
              ["Edit details", () => setSelected(node.id)],
              [
                "View listings here",
                () => {
                  window.location.href = `${SCREEN_ROUTES.listingsMaster}?city=${encodeURIComponent(node.name)}`;
                },
              ],
              [
                node.is_active ? "Deactivate" : "Activate",
                () => void toggleNode(node),
              ],
              // The design's own copy. A location with listings under it cannot
              // be deleted, and this says so rather than offering a button that
              // would orphan them.
              ["Delete", () => toast("Move or merge listings first"), true],
            ]}
          />
        </span>
      </div>
      {open[node.id]
        ? (children[node.id] ?? []).map((c) => row(c, level + 1))
        : null}
    </div>
  );

  const leftPane = (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--s1)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: 12, borderBottom: "1px solid var(--divider)" }}>
        <div
          style={{
            height: 36,
            background: "var(--s2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 10px",
          }}
        >
          <span style={{ color: "var(--ink3)", display: "flex" }}>
            <AdminIcon name="search" size={16} />
          </span>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search state, city, area…"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 13,
              color: "var(--ink1)",
            }}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 8, maxHeight: 520 }}>
        {roots === null ? (
          <Shimmer h={200} />
        ) : results !== null ? (
          results.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink3)", padding: 12 }}>
              Nothing matches “{term}”.
            </div>
          ) : (
            results.map((n) => row({ ...n, child_count: 0, listings_count: 0 }, 0))
          )
        ) : (
          roots.map((n) => row(n, 0))
        )}
      </div>
      <div
        style={{
          padding: 10,
          borderTop: "1px solid var(--divider)",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Btn
          label="+ Add"
          kind="outline"
          style={{ height: 32, fontSize: 13 }}
          onClick={() => setAddOpen(true)}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* template 2067: `mobile ? column : '320px 1fr'` — the split starts at
          TABLET, not at desktop. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr] md:items-start">
        {leftPane}
        <NodeDetail id={selected} onSaved={() => setNonce((n) => n + 1)} />
      </div>

      {addOpen ? (
        <AddLocation
          parentId={selected}
          onClose={() => setAddOpen(false)}
          onDone={(msg) => {
            toast(msg);
            setAddOpen(false);
            setChildren({});
            setNonce((n) => n + 1);
          }}
        />
      ) : null}
    </>
  );
}

type Detail = {
  id: string;
  name: string;
  name_gu: string | null;
  level: string;
  is_active: boolean;
  highlights: string | null;
  pincodes: string[];
  adjacent: { id: string; name: string }[];
  listings_count: number;
  requirements_count: number;
  avg_rate_per_sqft: number | null;
};

/** template 2069-2085 — the right-hand pane. */
function NodeDetail({ id, onSaved }: { id: string | null; onSaved: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [nameGu, setNameGu] = useState("");
  const [level, setLevel] = useState("area");
  const [active, setActive] = useState(true);
  const [highlights, setHighlights] = useState("");
  const [pins, setPins] = useState<string[]>([]);
  const [newPin, setNewPin] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      setData(null);
      return;
    }
    setLoading(true);
    void (async () => {
      const res = await fetch(`/api/v1/admin/master-data?what=node&id=${id}`, {
        cache: "no-store",
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok?: boolean; data?: Detail }
        | null;
      const d = json?.ok ? (json.data ?? null) : null;
      setData(d);
      setLoading(false);
      if (d) {
        setName(d.name);
        setNameGu(d.name_gu ?? "");
        setLevel(d.level);
        setActive(d.is_active);
        setHighlights(d.highlights ?? "");
        setPins(d.pincodes);
        setReason("");
      }
    })();
  }, [id]);

  if (!id)
    return (
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--s1)",
          padding: 40,
          fontSize: 13,
          color: "var(--ink3)",
          textAlign: "center",
        }}
      >
        Pick a location on the left to edit it.
      </div>
    );

  if (loading || !data)
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <Shimmer h={320} />
      </div>
    );

  const save = async () => {
    setSaving(true);
    const json = await post({
      action: "location_save",
      id,
      name,
      name_gu: nameGu,
      level,
      is_active: active,
      highlights,
      pincodes: pins,
      reason,
    });
    setSaving(false);
    toast(json?.ok ? `${json.data?.summary} · logged` : (json?.error?.message ?? "That didn't save"));
    if (json?.ok) onSaved();
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--s1)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>{data.name}</div>
        <StatusBadge status={active ? "Active" : "Inactive"} />
      </div>

      <div style={{ padding: 20, maxHeight: 520, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FField label="Name (English)">
            <input value={name} onChange={(e) => setName(e.target.value)} style={F_INPUT_STYLE} />
          </FField>
          <FField label="Name (Gujarati)" helper="Both scripts are searchable">
            <input value={nameGu} onChange={(e) => setNameGu(e.target.value)} style={F_INPUT_STYLE} />
          </FField>
        </div>

        <FField label="Type">
          <select value={level} onChange={(e) => setLevel(e.target.value)} style={F_INPUT_STYLE}>
            {["area", "landmark", "village"].map((l) => (
              <option key={l} value={l}>
                {l[0].toUpperCase() + l.slice(1)}
              </option>
            ))}
          </select>
        </FField>

        <FField label="Pincode">
          <div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {pins.map((p) => (
                <span
                  key={p}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    background: "var(--s2)",
                    borderRadius: 999,
                    padding: "4px 6px 4px 10px",
                    fontSize: 12,
                  }}
                >
                  {p}
                  <span
                    onClick={() => setPins((v) => v.filter((x) => x !== p))}
                    style={{ color: "var(--ink3)", cursor: "pointer", display: "flex" }}
                  >
                    <AdminIcon name="x" size={12} />
                  </span>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="360004"
                style={{ ...F_INPUT_STYLE, maxWidth: 140 }}
              />
              <span
                onClick={() => {
                  // Six digits, first not zero — an Indian PIN. A free-text
                  // chip here is a pincode search that silently matches nothing.
                  if (!/^[1-9][0-9]{5}$/.test(newPin)) {
                    toast("That is not a valid 6-digit pincode");
                    return;
                  }
                  setPins((v) => [...new Set([...v, newPin])]);
                  setNewPin("");
                }}
                style={{
                  fontSize: 13,
                  color: "var(--accent)",
                  fontWeight: 600,
                  cursor: "pointer",
                  alignSelf: "center",
                }}
              >
                + Add another
              </span>
            </div>
          </div>
        </FField>

        <FField label="Adjacent landmarks">
          <div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {data.adjacent.length === 0 ? (
                <span style={{ fontSize: 12, color: "var(--ink3)" }}>None set.</span>
              ) : (
                data.adjacent.map((a) => (
                  <span
                    key={a.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "var(--accentSoft)",
                      color: "var(--accent)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {a.name}
                  </span>
                ))
              )}
            </div>
            <div
              style={{
                background: "var(--infoSoft)",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 11,
                color: "var(--ink2)",
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              Powers the cascade: when an exact-area search has few results, these areas are shown
              next, then the whole city.
            </div>
          </div>
        </FField>

        <FField
          label="Area highlights"
          helper="Shown on the area page and property details. Plain text only — no AI generation. 500-char limit."
        >
          <textarea
            value={highlights}
            onChange={(e) => setHighlights(e.target.value.slice(0, 500))}
            style={{ ...F_TEXTAREA_STYLE, height: 90 }}
          />
        </FField>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <Switch on={active} onClick={() => setActive((v) => !v)} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Active</span>
        </div>

        <div
          style={{
            background: "var(--s2)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: "var(--ink2)",
            marginTop: 8,
          }}
        >
          {data.listings_count} listings · {data.requirements_count} requirements
          {data.avg_rate_per_sqft
            ? ` · avg ₹${data.avg_rate_per_sqft.toLocaleString("en-IN")}/sqft`
            : " · not enough priced listings for an average"}
        </div>
      </div>

      <div
        style={{
          padding: 14,
          borderTop: "1px solid var(--divider)",
          display: "flex",
          gap: 8,
          alignItems: "center",
          position: "sticky",
          bottom: 0,
          background: "var(--s1)",
        }}
      >
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for change…"
          style={{ ...F_INPUT_STYLE, flex: 1, height: 38 }}
        />
        <Btn
          label="Cancel"
          kind="outline"
          style={{ height: 38 }}
          onClick={() => {
            setName(data.name);
            setNameGu(data.name_gu ?? "");
            setHighlights(data.highlights ?? "");
            setPins(data.pincodes);
            setActive(data.is_active);
            setReason("");
          }}
        />
        <Btn
          label={saving ? "Saving…" : "Save"}
          kind="primary"
          style={{ height: 38 }}
          onClick={save}
        />
      </div>
    </div>
  );
}

function AddLocation({
  parentId,
  onClose,
  onDone,
}: {
  parentId: string | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [nameGu, setNameGu] = useState("");
  const [level, setLevel] = useState("area");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title="Add child location"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Adding…" : "Add"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              const json = await post({
                action: "location_add",
                parent_id: parentId,
                name,
                name_gu: nameGu,
                level,
              });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Added"));
              else setError(json?.error?.message ?? "That didn't work");
            }}
          />
        </>
      }
    >
      {!parentId ? (
        <NoteStrip tone="warn">
          Nothing is selected, so this will be added at the top level.
        </NoteStrip>
      ) : null}
      <FField label="Name (English)">
        <input value={name} onChange={(e) => setName(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Name (Gujarati)">
        <input value={nameGu} onChange={(e) => setNameGu(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Type">
        <select value={level} onChange={(e) => setLevel(e.target.value)} style={F_INPUT_STYLE}>
          {["area", "landmark", "village", "city", "taluka", "district", "state"].map((l) => (
            <option key={l} value={l}>
              {l[0].toUpperCase() + l.slice(1)}
            </option>
          ))}
        </select>
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

/* ══════════════════════════════════════════════════ tab 2 · amenities ══════ */

type AmenityRow = {
  id: string;
  code: string;
  label: string;
  category: string;
  categories: string[];
  is_active: boolean;
  usage_count: number;
};

function AmenitiesTab() {
  const toast = useToast();
  const list = useAdminList<AmenityRow>("amenities", ["category"]);
  const [editing, setEditing] = useState<AmenityRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [merging, setMerging] = useState<AmenityRow | null>(null);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  const cols: Col<AmenityRow>[] = [
    {
      label: "Name",
      cell: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--ink2)", display: "flex" }}>
            <AdminIcon name="badge" size={18} />
          </span>
          <span style={{ fontWeight: 600 }}>{r.label}</span>
        </div>
      ),
    },
    {
      label: "Applies to",
      cell: (r) => (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {(r.categories.length ? r.categories : ["All"]).map((c) => (
            <Badge
              key={c}
              bg="var(--s2)"
              fg="var(--ink2)"
              style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
            >
              {c}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      label: "Usage",
      cell: (r) => <span style={{ color: "var(--ink2)" }}>{r.usage_count} listings</span>,
    },
    {
      label: "Status",
      cell: (r) => (
        <Switch
          on={r.is_active}
          onClick={() => void act({ action: "amenity_toggle", id: r.code, active: !r.is_active })}
        />
      ),
    },
    {
      label: "",
      w: 40,
      cell: (r) => (
        <RowMenu
          items={[
            [`Edit ${r.label}`, () => setEditing(r)],
            ["Merge into…", () => setMerging(r)],
            [
              r.is_active ? "Disable" : "Enable",
              () => void act({ action: "amenity_toggle", id: r.code, active: !r.is_active }),
            ],
            ["Delete", () => void act({ action: "amenity_delete", id: r.code }), true],
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn label="+ Add amenity" kind="primary" onClick={() => setAdding(true)} />
      </div>
      {list.loading ? (
        <Shimmer h={240} />
      ) : (
        <>
          <DTable cols={cols} rows={list.data?.rows ?? []} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}

      {adding || editing ? (
        <AmenityEditor
          row={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onDone={(msg) => {
            toast(msg);
            setAdding(false);
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}

      {merging ? (
        <MergeAmenity
          row={merging}
          options={(list.data?.rows ?? []).filter((r) => r.code !== merging.code)}
          onClose={() => setMerging(null)}
          onDone={(msg) => {
            toast(msg);
            setMerging(null);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function AmenityEditor({
  row,
  onClose,
  onDone,
}: {
  row: AmenityRow | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [label, setLabel] = useState(row?.label ?? "");
  const [cats, setCats] = useState<string[]>(row?.categories ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ALL = ["residential", "commercial", "plot", "pg"];

  return (
    <Modal
      title={row ? `Edit ${row.label}` : "Add amenity"}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Saving…" : "Save"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              const json = await post({
                action: "amenity_save",
                code: row?.code,
                label,
                categories: cats,
              });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That didn't save");
            }}
          />
        </>
      }
    >
      <FField label="Name">
        <input value={label} onChange={(e) => setLabel(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Applies to" helper="Leave all unticked to offer it on every property type">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {ALL.map((c) => (
            <label key={c} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={cats.includes(c)}
                onChange={(e) =>
                  setCats((v) => (e.target.checked ? [...v, c] : v.filter((x) => x !== c)))
                }
                style={{ accentColor: "var(--accent)" }}
              />
              {c[0].toUpperCase() + c.slice(1)}
            </label>
          ))}
        </div>
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

function MergeAmenity({
  row,
  options,
  onClose,
  onDone,
}: {
  row: AmenityRow;
  options: AmenityRow[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [into, setInto] = useState(options[0]?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={`Merge ${row.label}`}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Merging…" : "Merge"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              const json = await post({ action: "amenity_merge", id: row.code, into });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Merged"));
              else setError(json?.error?.message ?? "That didn't work");
            }}
          />
        </>
      }
    >
      <NoteStrip tone="warn">
        {`${row.usage_count} listing(s) use "${row.label}". They will be rewritten to the amenity you pick, and "${row.label}" will be removed.`}
      </NoteStrip>
      <FField label="Merge into">
        <select value={into} onChange={(e) => setInto(e.target.value)} style={F_INPUT_STYLE}>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

/* ═════════════════════════════════════════════ tab 3 · property types ══════ */

type TypeRow = {
  id: string;
  code: string;
  label: string;
  category: string;
  roles: string[];
  kinds: string[];
  field_config: Record<string, unknown>;
  is_active: boolean;
  field_count: number;
  listings_count: number;
};

function TypesTab() {
  const toast = useToast();
  const list = useAdminList<TypeRow>("property-types", ["category"]);
  const { pushPanel, changed } = usePanels();

  // A config saved in the panel changes the field COUNT this table prints, so
  // the list under it has to reload when the panel reports a change.
  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  const roleTag = (name: string, on: boolean) => (
    <span key={name} style={{ fontSize: 11, color: on ? "var(--accent)" : "var(--ink3)", fontWeight: on ? 600 : 400 }}>
      {name}
      {on ? " ✓" : " —"}
    </span>
  );

  const cols: Col<TypeRow>[] = [
    { label: "Type", cell: (r) => <span style={{ fontWeight: 600 }}>{r.label}</span> },
    {
      label: "Category",
      cell: (r) => (
        <Badge bg="var(--s2)" fg="var(--ink2)" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          {r.category}
        </Badge>
      ),
    },
    {
      label: "Available to",
      cell: (r) => (
        <span style={{ display: "inline-flex", gap: 8 }}>
          {roleTag("Owner", r.roles.includes("owner"))}
          {roleTag("Broker", r.roles.includes("broker"))}
          {roleTag("Builder", r.roles.includes("builder"))}
        </span>
      ),
    },
    {
      label: "Fields config",
      cell: (r) => (
        <span>
          {r.field_count} fields ·{" "}
          <span
            onClick={(e) => {
              e.stopPropagation();
              pushPanel("fieldConfig", r as unknown as Record<string, unknown>);
            }}
            style={{ color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
          >
            Edit config
          </span>
        </span>
      ),
    },
    { label: "Listings", cell: (r) => r.listings_count },
    {
      label: "Status",
      cell: (r) => (
        <Switch
          on={r.is_active}
          onClick={() => void act({ action: "type_toggle", id: r.code, active: !r.is_active })}
        />
      ),
    },
  ];

  return (
    <div>
      {list.loading ? (
        <Shimmer h={240} />
      ) : (
        <DTable cols={cols} rows={list.data?.rows ?? []} />
      )}
    </div>
  );
}


/* ══════════════════════════════════════════ tabs 4 & 5 · the rule tables ══ */

type WordRow = {
  id: string;
  word: string;
  script: string;
  severity: string;
  applies_to: string[];
  is_active: boolean;
  hits_30d: number;
};

function BlocklistTab() {
  const toast = useToast();
  const list = useAdminList<WordRow>("blocklist", ["severity", "active"], "en");
  const [editing, setEditing] = useState<WordRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testing, setTesting] = useState(false);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  const cols: Col<WordRow>[] = [
    { label: "Word / phrase", cell: (r) => <Mono style={{ fontWeight: 600 }}>{r.word}</Mono> },
    {
      label: "Severity",
      cell: (r) => (
        <Badge
          bg={r.severity === "block" ? "var(--errorSoft)" : "var(--warningSoft)"}
          fg={r.severity === "block" ? "var(--error)" : "var(--warning)"}
        >
          {r.severity === "block" ? "High" : "Flag"}
        </Badge>
      ),
    },
    {
      label: "Where",
      cell: (r) => (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {r.applies_to.map((w) => (
            <Badge
              key={w}
              bg="var(--s2)"
              fg="var(--ink2)"
              style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
            >
              {w}
            </Badge>
          ))}
        </span>
      ),
    },
    { label: "Hits (30d)", cell: (r) => r.hits_30d },
    {
      label: "",
      w: 40,
      cell: (r) => (
        <RowMenu
          items={[
            ["Edit word", () => setEditing(r)],
            ["Test match", () => setTesting(true)],
            [
              r.is_active ? "Disable" : "Enable",
              () => void act({ action: "word_toggle", id: r.id, active: !r.is_active }),
            ],
            ["Delete", () => void act({ action: "word_delete", id: r.id }), true],
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <NoteStrip tone="info">
        Words here trigger an auto-flag for admin review. Nothing is blocked from being typed —
        flags only.
      </NoteStrip>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <FilterBar
          placeholder="Search words"
          search={list.search}
          onSearch={list.setSearch}
          groups={SEVERITY_GROUPS}
          filters={list.filters}
          onOpenFilters={() => undefined}
          onClear={list.clearFilters}
          countLabel={`${(list.data?.total ?? 0).toLocaleString("en-IN")} words`}
        />
        <div style={{ flex: 1 }} />
        <span
          onClick={() => setTesting(true)}
          style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
        >
          Test match
        </span>
        <span
          onClick={() => setImporting(true)}
          style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
        >
          Bulk import
        </span>
        <Btn label="+ Add word" kind="primary" onClick={() => setAdding(true)} />
      </div>

      {/* template 2148 — the four script tabs. Each one re-queries. */}
      <ModTabs
        tabs={[
          ["en", "English"],
          ["gu", "ગુજરાતી"],
          ["hi", "हिन्दी"],
          ["tr", "Transliterated"],
        ]}
        active={list.tab ?? "en"}
        onSelect={list.setTab}
      />

      {list.loading ? (
        <Shimmer h={240} />
      ) : (list.data?.rows ?? []).length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink3)", fontSize: 13 }}>
          No words in this script yet.
        </div>
      ) : (
        <>
          <DTable cols={cols} rows={list.data?.rows ?? []} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}

      {adding || editing ? (
        <WordEditor
          row={editing}
          script={list.tab ?? "en"}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onDone={(msg) => {
            toast(msg);
            setAdding(false);
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}

      {importing ? (
        <BulkImport
          onClose={() => setImporting(false)}
          onDone={(msg) => {
            toast(msg);
            setImporting(false);
            list.reload();
          }}
        />
      ) : null}

      {testing ? <RuleTester onClose={() => setTesting(false)} /> : null}
    </div>
  );
}

const SEVERITY_GROUPS: FilterGroup[] = [
  {
    key: "severity",
    label: "Severity",
    options: [
      { value: "block", label: "High" },
      { value: "flag", label: "Flag" },
    ],
  },
];

const SCRIPT_OF: Record<string, string> = {
  en: "latin",
  gu: "gujarati",
  hi: "devanagari",
  tr: "translit",
};

function WordEditor({
  row,
  script,
  onClose,
  onDone,
}: {
  row: WordRow | null;
  script: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [word, setWord] = useState(row?.word ?? "");
  const [severity, setSeverity] = useState(row?.severity ?? "flag");
  const [where, setWhere] = useState<string[]>(
    row?.applies_to ?? ["listing", "requirement", "bio", "chat"],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={row ? "Edit word" : "Add word"}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Saving…" : "Save"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              const json = await post({
                action: "word_save",
                id: row?.id,
                word,
                severity,
                script: row?.script ?? SCRIPT_OF[script] ?? "latin",
                applies_to: where,
              });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That didn't save");
            }}
          />
        </>
      }
    >
      <FField label="Word or phrase">
        <input value={word} onChange={(e) => setWord(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Severity" helper="High refuses the content · Flag lets it through and queues a review">
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={F_INPUT_STYLE}>
          <option value="flag">Flag</option>
          <option value="block">High</option>
        </select>
      </FField>
      <FField label="Where">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {["listing", "requirement", "bio", "chat"].map((w) => (
            <label key={w} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={where.includes(w)}
                onChange={(e) =>
                  setWhere((v) => (e.target.checked ? [...v, w] : v.filter((x) => x !== w)))
                }
                style={{ accentColor: "var(--accent)" }}
              />
              {w[0].toUpperCase() + w.slice(1)}
            </label>
          ))}
        </div>
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

function BulkImport({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState("flag");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title="Bulk import"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Importing…" : "Import"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              const json = await post({ action: "word_import", text, severity });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Imported"));
              else setError(json?.error?.message ?? "That didn't work");
            }}
          />
        </>
      }
    >
      <FField label="Words" helper="One per line. Words already on the list are skipped.">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ ...F_TEXTAREA_STYLE, height: 160 }}
        />
      </FField>
      <FField label="Severity">
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={F_INPUT_STYLE}>
          <option value="flag">Flag</option>
          <option value="block">High</option>
        </select>
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

/**
 * "Test match" / "Test against text" (templates 2151, 2158).
 *
 * It shows BOTH engines' answers. The whole class of bug this screen exists to
 * prevent is the JavaScript detector and the SQL risk score disagreeing about
 * the same rule, and only showing them side by side makes that visible.
 */
function RuleTester({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("Call me on 98250 12345");
  const [result, setResult] = useState<
    { kind: string; label: string; action: string; js: boolean; sql: boolean | null }[] | null
  >(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const json = await post({ action: "rules_test", text });
    setBusy(false);
    setResult(
      json?.ok
        ? ((json.data?.matches ?? []) as {
            kind: string;
            label: string;
            action: string;
            js: boolean;
            sql: boolean | null;
          }[])
        : [],
    );
  };

  return (
    <Modal
      title="Test against text"
      onClose={onClose}
      footer={
        <>
          <Btn label="Close" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Testing…" : "Run test"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={run}
          />
        </>
      }
    >
      <FField label="Text">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ ...F_TEXTAREA_STYLE, height: 100 }}
        />
      </FField>
      {result === null ? null : result.length === 0 ? (
        <NoteStrip tone="neutral">Nothing matches. This text would go through untouched.</NoteStrip>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {result.map((m, i) => (
            <div
              key={i}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <Badge
                bg={m.action === "block" ? "var(--errorSoft)" : "var(--warningSoft)"}
                fg={m.action === "block" ? "var(--error)" : "var(--warning)"}
              >
                {m.action === "block" ? "High" : "Flag"}
              </Badge>
              <Mono style={{ fontWeight: 600, flex: 1 }}>{m.label}</Mono>
              <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                app {m.js ? "✓" : "—"}
                {m.kind === "pattern" ? ` · risk score ${m.sql === null ? "n/a" : m.sql ? "✓" : "—"}` : ""}
              </span>
            </div>
          ))}
          {result.some((m) => m.kind === "pattern" && m.sql !== null && m.js !== m.sql) ? (
            <NoteStrip tone="warn">
              One of these matches in the app but not in the risk score (or the other way round).
              The two dialects disagree — edit the pattern until both tick.
            </NoteStrip>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

type PatternRow = {
  id: string;
  label: string;
  pattern: string;
  sample: string | null;
  action: string;
  applies_to: string[];
  is_active: boolean;
  hits_30d: number;
};

function PatternsTab() {
  const toast = useToast();
  const list = useAdminList<PatternRow>("patterns", ["action"]);
  const [editing, setEditing] = useState<PatternRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState(false);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  const cols: Col<PatternRow>[] = [
    { label: "Pattern", cell: (r) => <Mono style={{ fontWeight: 600 }}>{r.pattern}</Mono> },
    { label: "Description", cell: (r) => <span style={{ color: "var(--ink2)" }}>{r.label}</span> },
    { label: "Hits", cell: (r) => r.hits_30d },
    {
      label: "Status",
      cell: (r) => (
        <Switch
          on={r.is_active}
          onClick={() => void act({ action: "pattern_toggle", id: r.id, active: !r.is_active })}
        />
      ),
    },
    {
      label: "",
      w: 40,
      cell: (r) => (
        <RowMenu
          items={[
            ["Edit pattern", () => setEditing(r)],
            ["Test against text", () => setTesting(true)],
            [
              r.is_active ? "Disable" : "Enable",
              () => void act({ action: "pattern_toggle", id: r.id, active: !r.is_active }),
            ],
            ["Delete", () => void act({ action: "pattern_delete", id: r.id }), true],
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <NoteStrip tone="info">
        Detects phone numbers written in text so we can warn users and flag listings. Users are
        never blocked from typing.
      </NoteStrip>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginBottom: 12, alignItems: "center" }}>
        <span
          onClick={() => setTesting(true)}
          style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, cursor: "pointer" }}
        >
          Test against text
        </span>
        <Btn label="+ Add pattern" kind="primary" onClick={() => setAdding(true)} />
      </div>

      {list.loading ? <Shimmer h={240} /> : <DTable cols={cols} rows={list.data?.rows ?? []} />}

      {adding || editing ? (
        <PatternEditor
          row={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onDone={(msg) => {
            toast(msg);
            setAdding(false);
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
      {testing ? <RuleTester onClose={() => setTesting(false)} /> : null}
    </div>
  );
}

function PatternEditor({
  row,
  onClose,
  onDone,
}: {
  row: PatternRow | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [label, setLabel] = useState(row?.label ?? "");
  const [pattern, setPattern] = useState(row?.pattern ?? "");
  const [sample, setSample] = useState(row?.sample ?? "");
  const [onMatch, setOnMatch] = useState(row?.action ?? "flag");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={row ? "Edit pattern" : "Add pattern"}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Saving…" : "Save"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              setError("");
              const json = await post({
                action: "pattern_save",
                id: row?.id,
                label,
                pattern,
                sample,
                on_match: onMatch,
              });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That pattern was refused");
            }}
          />
        </>
      }
    >
      <NoteStrip tone="info">
        Written as a JavaScript regex. It is translated to the dialect Postgres runs and BOTH are
        compiled before it is saved — a pattern that only works in one of them is refused.
      </NoteStrip>
      <FField label="Description">
        <input value={label} onChange={(e) => setLabel(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Pattern">
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          spellCheck={false}
          style={{ ...F_INPUT_STYLE, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}
        />
      </FField>
      <FField label="Sample" helper="If you give one it has to match, or the pattern is refused">
        <input value={sample} onChange={(e) => setSample(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Action">
        <select value={onMatch} onChange={(e) => setOnMatch(e.target.value)} style={F_INPUT_STYLE}>
          <option value="flag">Flag for review</option>
          <option value="block">Block the content</option>
        </select>
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

/* ══════════════════════════════════════════════ tab 6 · area requests ══════ */

type RequestRow = {
  id: string;
  name: string;
  status: string;
  city_name: string | null;
  profile_id: string;
  requester_name: string | null;
  requester_photo: string | null;
  created_at: string;
  resolved_at: string | null;
  ask_count: number;
};

function RequestsTab() {
  const toast = useToast();
  const { pushPanel } = usePanels();
  const list = useAdminList<RequestRow>("area-requests", ["city"], "pending");
  const [dismissing, setDismissing] = useState<RequestRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const approve = async (r: RequestRow) => {
    setBusy(r.id);
    const json = await post({ action: "area_approve", id: r.id });
    setBusy(null);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  const cols: Col<RequestRow>[] = [
    { label: "Requested area", cell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { label: "City", cell: (r) => r.city_name ?? "—" },
    {
      label: "Requested by",
      cell: (r) => (
        <span
          onClick={(e) => {
            e.stopPropagation();
            pushPanel("user", { id: r.profile_id, name: r.requester_name });
          }}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          <Avatar
            initials={(r.requester_name ?? "U").slice(0, 2).toUpperCase()}
            size={24}
          />
          {r.requester_name ?? "Unknown"}
        </span>
      ),
    },
    {
      label: "Date",
      cell: (r) => (
        <span style={{ color: "var(--ink2)" }}>
          {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </span>
      ),
    },
    {
      label: "Count",
      cell: (r) => (
        <Badge bg="var(--infoSoft)" fg="var(--info)" style={{ textTransform: "none", letterSpacing: 0 }}>
          {`${r.ask_count} user${r.ask_count === 1 ? "" : "s"} asked`}
        </Badge>
      ),
    },
    {
      label: "Status",
      cell: (r) => <StatusBadge status={r.status === "added" ? "Approved" : r.status === "rejected" ? "Rejected" : "Pending"} />,
    },
    {
      label: "",
      cell: (r) =>
        r.status === "pending" ? (
          <div style={{ display: "flex", gap: 6 }}>
            <Btn
              label={busy === r.id ? "Adding…" : "Add to master"}
              kind="primary"
              style={{ height: 32, fontSize: 13 }}
              onClick={() => void approve(r)}
            />
            <Btn
              label="Dismiss"
              kind="outline"
              style={{ height: 32, fontSize: 13 }}
              onClick={() => setDismissing(r)}
            />
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "var(--ink3)" }}>
            {r.resolved_at
              ? `${r.status === "added" ? "Added" : "Dismissed"} ${new Date(r.resolved_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
              : "—"}
          </span>
        ),
    },
  ];

  return (
    <div>
      <ModTabs
        tabs={[
          ["pending", "Pending"],
          ["added", "Added"],
          ["rejected", "Dismissed"],
        ]}
        active={list.tab ?? "pending"}
        onSelect={list.setTab}
      />
      {list.loading ? (
        <Shimmer h={240} />
      ) : (list.data?.rows ?? []).length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--ink3)", fontSize: 13 }}>
          Nothing here.
        </div>
      ) : (
        <DTable cols={cols} rows={list.data?.rows ?? []} />
      )}

      {dismissing ? (
        <DismissRequest
          row={dismissing}
          onClose={() => setDismissing(null)}
          onDone={(msg) => {
            toast(msg);
            setDismissing(null);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function DismissRequest({
  row,
  onClose,
  onDone,
}: {
  row: RequestRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={`Dismiss "${row.name}"`}
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Dismissing…" : "Dismiss"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              const json = await post({ action: "area_dismiss", id: row.id, reason });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Dismissed"));
              else setError(json?.error?.message ?? "That didn't work");
            }}
          />
        </>
      }
    >
      <FField label="Reason" helper="The person who asked is told this, so write it for them">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ ...F_TEXTAREA_STYLE, height: 90 }}
        />
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

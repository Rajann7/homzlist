"use client";

/**
 * A20 — Content. Template 2161-2236.
 *
 * Five tabs, and four of them publish to the PUBLIC site. The editors are
 * PANELS (template 2178 calls `pushPanel('pageEdit')`), not routes — §5 says
 * where a click lands is part of the design, and a page editor that navigated
 * away would lose the list behind it.
 */

import { useCallback, useEffect, useState } from "react";
import {
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
  ShareBar,
  Shimmer,
  StatusBadge,
  Switch,
  Thumb,
  useToast,
  usePanels,
  type Col,
} from "@/components/admin/ds";
import { Pager, useAdminList } from "@/components/admin/list";

type Tab = "pages" | "blog" | "faqs" | "banners" | "broadcasts";

const TABS: [Tab, string][] = [
  ["pages", "Pages"],
  ["blog", "Blog"],
  ["faqs", "FAQs"],
  ["banners", "Banners"],
  ["broadcasts", "Broadcasts"],
];

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/v1/admin/content", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  }).catch(() => null);
  return (await res?.json().catch(() => null)) as
    | { ok?: boolean; data?: Record<string, unknown>; error?: { message?: string } }
    | null;
}

const shortDate = (iso: unknown) =>
  iso
    ? new Date(String(iso)).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "—";

const ago = (iso: unknown) => {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(String(iso)).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  const days = Math.floor(mins / 1440);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
};

export function ContentScreen() {
  const [tab, setTab] = useState<Tab>("pages");
  return (
    <div>
      <PageHead title="Content" />
      <ModTabs tabs={TABS} active={tab} onSelect={(k) => setTab(k as Tab)} />
      {tab === "pages" ? (
        <PagesTab />
      ) : tab === "blog" ? (
        <BlogTab />
      ) : tab === "faqs" ? (
        <FaqsTab />
      ) : tab === "banners" ? (
        <BannersTab />
      ) : (
        <BroadcastsTab />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════ tab 1 · pages ══════ */

type PageRow = {
  id: string;
  slug: string;
  title: string;
  version_label: string;
  status_key: string;
  effective_date: string | null;
  updated_by_name: string | null;
  updated_at: string;
  requires_reacceptance: boolean;
};

function PagesTab() {
  const toast = useToast();
  const list = useAdminList<PageRow>("cms-pages", ["status"]);
  const { pushPanel, changed } = usePanels();

  // The panel edits what this table prints, so a change in the panel reloads
  // the list under it — a modal used to leave the row stale.
  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  const cols: Col<PageRow>[] = [
    { label: "Page", cell: (r) => <span style={{ fontWeight: 600 }}>{r.title}</span> },
    { label: "Version", cell: (r) => <Mono>{r.version_label}</Mono> },
    {
      label: "Status",
      cell: (r) => <StatusBadge status={r.status_key === "published" ? "Published" : "Draft"} />,
    },
    {
      label: "Effective",
      cell: (r) => <span style={{ color: "var(--ink2)" }}>{shortDate(r.effective_date)}</span>,
    },
    {
      label: "Updated by",
      cell: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Avatar initials={(r.updated_by_name ?? "—").slice(0, 2).toUpperCase()} size={22} />
          {r.updated_by_name ?? "—"}
        </span>
      ),
    },
    { label: "Updated", cell: (r) => <span style={{ color: "var(--ink3)" }}>{ago(r.updated_at)}</span> },
    {
      label: "",
      w: 40,
      cell: (r) => (
        <RowMenu
          items={[
            ["Edit page", () => pushPanel("pageEdit", r as unknown as Record<string, unknown>)],
            [
              "Copy public link",
              () => {
                void navigator.clipboard?.writeText(`https://homzlist.com/${r.slug}`);
                toast("Link copied");
              },
            ],
            ["Unpublish", () => void act({ action: "page_unpublish", id: r.id }), true],
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      {list.loading ? (
        <Shimmer h={240} />
      ) : (
        <>
          <DTable cols={cols} rows={list.data?.rows ?? []} onRow={(r) => pushPanel("pageEdit", r as unknown as Record<string, unknown>)} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════ tab 2 · blog ══════ */

type BlogRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  status_key: string;
  author_name: string | null;
  cover_url: string | null;
  view_count: number;
  created_at: string;
  published_at: string | null;
};

function BlogTab() {
  const toast = useToast();
  const list = useAdminList<BlogRow>("blog", ["category"], "all");
  const { pushPanel, changed } = usePanels();

  // The panel edits what this table prints, so a change in the panel reloads
  // the list under it — a modal used to leave the row stale.
  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  const cols: Col<BlogRow>[] = [
    {
      label: "Post",
      cell: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Thumb size={40} src={r.cover_url} />
          <span style={{ fontWeight: 600 }}>{r.title}</span>
        </div>
      ),
    },
    {
      label: "Category",
      cell: (r) => (
        <Badge bg="var(--s2)" fg="var(--ink2)" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          {r.category}
        </Badge>
      ),
    },
    {
      label: "Status",
      cell: (r) => (
        <StatusBadge
          status={
            r.status_key === "published" ? "Published" : r.status_key === "scheduled" ? "Scheduled" : "Draft"
          }
        />
      ),
    },
    { label: "Author", cell: (r) => r.author_name ?? "—" },
    { label: "Views", cell: (r) => r.view_count.toLocaleString("en-IN") },
    {
      label: "Date",
      cell: (r) => (
        <span style={{ color: "var(--ink2)" }}>{shortDate(r.published_at ?? r.created_at)}</span>
      ),
    },
    {
      label: "",
      w: 40,
      cell: (r) => (
        <RowMenu
          items={[
            ["Edit post", () => pushPanel("blogEdit", r as unknown as Record<string, unknown>)],
            [
              "Copy public link",
              () => {
                void navigator.clipboard?.writeText(`https://homzlist.com/blog/${r.slug}`);
                toast("Link copied");
              },
            ],
            ["Delete", () => void act({ action: "blog_delete", id: r.id }), true],
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <ModTabs
        tabs={[
          ["all", "All"],
          ["published", "Published"],
          ["scheduled", "Scheduled"],
          ["draft", "Draft"],
        ]}
        active={list.tab ?? "all"}
        onSelect={list.setTab}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn label="+ New post" kind="primary" onClick={() => pushPanel("blogEdit", {})} />
      </div>
      {list.loading ? (
        <Shimmer h={240} />
      ) : (
        <>
          <DTable cols={cols} rows={list.data?.rows ?? []} onRow={(r) => pushPanel("blogEdit", r as unknown as Record<string, unknown>)} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════ tab 3 · FAQs ══════ */

type FaqRow = {
  id: string;
  question: string;
  answer: string;
  category: string;
  view_count: number;
  helpful_pct: number | null;
  votes: number;
  is_active: boolean;
};

function FaqsTab() {
  const toast = useToast();
  const list = useAdminList<FaqRow>("faqs", ["category"]);
  const [cats, setCats] = useState<{ name: string; count: number }[]>([]);
  const [editing, setEditing] = useState<FaqRow | null>(null);
  const [adding, setAdding] = useState(false);

  const loadCats = useCallback(async () => {
    const res = await fetch("/api/v1/admin/content?what=faq-categories", { cache: "no-store" }).catch(
      () => null,
    );
    const json = (await res?.json().catch(() => null)) as
      | { ok?: boolean; data?: { categories: { name: string; count: number }[] } }
      | null;
    setCats(json?.ok ? (json.data?.categories ?? []) : []);
  }, []);

  useEffect(() => {
    void loadCats();
  }, [loadCats]);

  const act = async (body: Record<string, unknown>) => {
    const json = await post(body);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) {
      list.reload();
      void loadCats();
    }
  };

  const active = list.filters.category?.[0] ?? null;

  const cols: Col<FaqRow>[] = [
    { label: "Question", cell: (r) => <span style={{ fontWeight: 600 }}>{r.question}</span> },
    {
      label: "Category",
      cell: (r) => (
        <Badge bg="var(--s2)" fg="var(--ink2)" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          {r.category}
        </Badge>
      ),
    },
    { label: "Views", cell: (r) => r.view_count.toLocaleString("en-IN") },
    {
      label: "Helpful",
      cell: (r) =>
        r.votes === 0 ? (
          // A percentage over zero votes is not 0% helpful, it is unknown.
          <span style={{ fontSize: 12, color: "var(--ink3)" }}>no votes yet</span>
        ) : (
          <div>
            <span style={{ fontSize: 12 }}>{`${r.helpful_pct}% · ${r.votes} votes`}</span>
            <ShareBar pct={Number(r.helpful_pct ?? 0)} />
          </div>
        ),
    },
    {
      label: "Status",
      cell: (r) => <StatusBadge status={r.is_active ? "Published" : "Draft"} />,
    },
    {
      label: "",
      w: 40,
      cell: (r) => (
        <RowMenu
          items={[
            ["Edit FAQ", () => setEditing(r)],
            ["Delete", () => void act({ action: "faq_delete", id: r.id }), true],
          ]}
        />
      ),
    },
  ];

  const sidebar = (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--s1)",
        padding: 8,
        alignSelf: "start",
      }}
    >
      {cats.map((c) => (
        <div
          key={c.name}
          onClick={() => list.setFilter("category", active === c.name ? [] : [c.name])}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "9px 10px",
            borderRadius: 8,
            cursor: "pointer",
            background: active === c.name ? "var(--accentSoft)" : "transparent",
            fontSize: 13,
            fontWeight: active === c.name ? 600 : 400,
          }}
        >
          <span style={{ flex: 1 }}>{c.name}</span>
          <span style={{ fontSize: 11, color: "var(--ink3)" }}>{c.count}</span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* template 2207: `mobile ? column : '240px 1fr'` — tablet gets the split */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr] md:items-start">
        {sidebar}
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <Btn label="+ New FAQ" kind="primary" onClick={() => setAdding(true)} />
          </div>
          {list.loading ? (
            <Shimmer h={240} />
          ) : (
            <>
              <DTable cols={cols} rows={list.data?.rows ?? []} onRow={(r) => setEditing(r)} />
              <Pager
                page={list.data?.page ?? 1}
                pageSize={list.data?.pageSize ?? 50}
                total={list.data?.total ?? 0}
                onPage={list.setPage}
              />
            </>
          )}
        </div>
      </div>

      {adding || editing ? (
        <FaqEditor
          row={editing}
          categories={cats.map((c) => c.name)}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onDone={(msg) => {
            toast(msg);
            setAdding(false);
            setEditing(null);
            list.reload();
            void loadCats();
          }}
        />
      ) : null}
    </>
  );
}

function FaqEditor({
  row,
  categories,
  onClose,
  onDone,
}: {
  row: FaqRow | null;
  categories: string[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [question, setQuestion] = useState(row?.question ?? "");
  const [answer, setAnswer] = useState(row?.answer ?? "");
  const [category, setCategory] = useState(row?.category ?? categories[0] ?? "Getting Started");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={row ? "Edit FAQ" : "New FAQ"}
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
                action: "faq_save",
                id: row?.id,
                question,
                answer,
                category,
              });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That didn't save");
            }}
          />
        </>
      }
    >
      <FField label="Question">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Answer">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          style={{ ...F_TEXTAREA_STYLE, height: 160 }}
        />
      </FField>
      <FField label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={F_INPUT_STYLE}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

/* ════════════════════════════════════════════════════ tab 4 · banners ══════ */

type BannerRow = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  target_roles: string[];
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  impressions: number;
  clicks: number;
  status_key: string;
};

function BannersTab() {
  const toast = useToast();
  const list = useAdminList<BannerRow>("banners", ["placement"], "all");
  const { pushPanel, changed } = usePanels();

  // The panel edits what this table prints, so a change in the panel reloads
  // the list under it — a modal used to leave the row stale.
  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);

  return (
    <div>
      <ModTabs
        tabs={[
          ["all", "All"],
          ["active", "Active"],
          ["scheduled", "Scheduled"],
          ["expired", "Expired"],
        ]}
        active={list.tab ?? "all"}
        onSelect={list.setTab}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn label="+ New banner" kind="primary" onClick={() => pushPanel("bannerEdit", {})} />
      </div>

      {list.loading ? (
        <Shimmer h={240} />
      ) : (
        // template 2212: `mobile?'1fr':'repeat(2,1fr)'` — two columns from tablet
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(list.data?.rows ?? []).map((b) => (
            <div
              key={b.id}
              onClick={() => pushPanel("bannerEdit", b as unknown as Record<string, unknown>)}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--s1)",
                overflow: "hidden",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  height: 110,
                  background: b.image_url
                    ? `center/cover no-repeat url(${b.image_url})`
                    : "repeating-linear-gradient(135deg,var(--s2),var(--s2) 10px,var(--s3) 10px,var(--s3) 20px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--ink3)",
                }}
              >
                {b.image_url ? null : <Mono>16:5 banner</Mono>}
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{b.title}</span>
                  <StatusBadge
                    status={
                      b.status_key === "active"
                        ? "Active"
                        : b.status_key === "scheduled"
                          ? "Scheduled"
                          : b.status_key === "expired"
                            ? "Expired"
                            : "Paused"
                    }
                  />
                </div>
                <div style={{ display: "flex", gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
                  {(b.target_roles.length ? b.target_roles : ["All roles"]).map((t) => (
                    <Badge
                      key={t}
                      bg="var(--s2)"
                      fg="var(--ink2)"
                      style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "var(--ink3)",
                  }}
                >
                  <span>
                    {shortDate(b.starts_at)} – {shortDate(b.ends_at)}
                  </span>
                  <span>{b.impressions.toLocaleString("en-IN")} impressions</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/* ═════════════════════════════════════════════════ tab 5 · broadcasts ══════ */

type BroadcastRow = {
  id: string;
  title: string;
  body: string;
  channels: string[];
  recipient_count: number;
  status_key: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_count: number;
  delivered_pct: number | null;
};

function BroadcastsTab() {
  const toast = useToast();
  const list = useAdminList<BroadcastRow>("broadcasts", ["status"]);
  const { pushPanel, changed } = usePanels();

  // The panel edits what this table prints, so a change in the panel reloads
  // the list under it — a modal used to leave the row stale.
  useEffect(() => {
    if (changed) list.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (body: Record<string, unknown>) => {
    setBusy(String(body.id ?? ""));
    const json = await post(body);
    setBusy(null);
    toast(json?.ok ? `${json.data?.summary}` : (json?.error?.message ?? "That didn't work"));
    if (json?.ok) list.reload();
  };

  const cols: Col<BroadcastRow>[] = [
    { label: "Message", cell: (r) => <span style={{ fontWeight: 600 }}>{r.title}</span> },
    {
      label: "Channels",
      cell: (r) => (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {r.channels.map((c) => (
            <Badge
              key={c}
              bg="var(--s2)"
              fg="var(--ink2)"
              style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
            >
              {c === "in_app" ? "In-app" : c[0].toUpperCase() + c.slice(1)}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      label: "Audience",
      cell: (r) => (
        <span style={{ color: "var(--ink2)" }}>{r.recipient_count.toLocaleString("en-IN")}</span>
      ),
    },
    {
      label: "Sent/Scheduled",
      cell: (r) => (
        <span style={{ color: "var(--ink3)" }}>
          {r.sent_at ? `Sent ${shortDate(r.sent_at)}` : r.scheduled_at ? `Scheduled ${shortDate(r.scheduled_at)}` : "—"}
        </span>
      ),
    },
    {
      label: "Delivered",
      cell: (r) =>
        // "—" until a send has actually been attempted. 0% would read as a
        // failed send rather than one that has not run.
        r.delivered_pct === null ? (
          <span style={{ color: "var(--ink3)" }}>—</span>
        ) : (
          `${r.delivered_count.toLocaleString("en-IN")} · ${r.delivered_pct}%`
        ),
    },
    {
      label: "Status",
      cell: (r) => (
        <StatusBadge
          status={
            r.status_key === "sent"
              ? "Approved"
              : r.status_key === "scheduled"
                ? "Scheduled"
                : r.status_key === "failed"
                  ? "Rejected"
                  : "Draft"
          }
        />
      ),
    },
    {
      label: "",
      w: 40,
      cell: (r) => (
        <RowMenu
          items={[
            r.status_key !== "sent" && [
              busy === r.id ? "Sending…" : "Send now",
              () => void act({ action: "broadcast_send", id: r.id }),
            ],
            r.status_key === "sent" && [
              "Resend to non-openers",
              () => void act({ action: "broadcast_resend", id: r.id }),
            ],
            r.status_key !== "sent" && [
              "Cancel send",
              () => void act({ action: "broadcast_cancel", id: r.id }),
              true,
            ],
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn label="+ New broadcast" kind="primary" onClick={() => pushPanel("broadcastEdit", {})} />
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
    </div>
  );
}


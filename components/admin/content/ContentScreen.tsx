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
  const [editing, setEditing] = useState<PageRow | null>(null);

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
            ["Edit page", () => setEditing(r)],
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
          <DTable cols={cols} rows={list.data?.rows ?? []} onRow={(r) => setEditing(r)} />
          <Pager
            page={list.data?.page ?? 1}
            pageSize={list.data?.pageSize ?? 50}
            total={list.data?.total ?? 0}
            onPage={list.setPage}
          />
        </>
      )}
      {editing ? (
        <PageEditor
          row={editing}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            toast(msg);
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function PageEditor({
  row,
  onClose,
  onDone,
}: {
  row: PageRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [data, setData] = useState<{ body_md: string; versions: { version: number; created_at: string; is_material: boolean; note: string | null }[] } | null>(null);
  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState("");
  const [material, setMaterial] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/v1/admin/content?what=page&id=${row.id}`, {
        cache: "no-store",
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok?: boolean; data?: { body_md: string; versions: never[] } }
        | null;
      if (json?.ok && json.data) {
        setData(json.data as never);
        setBody(json.data.body_md ?? "");
      }
    })();
  }, [row.id]);

  const save = async (publish: boolean) => {
    setBusy(true);
    setError("");
    const json = await post({
      action: "page_save",
      id: row.id,
      title,
      body_md: body,
      publish,
      requires_reacceptance: material,
      note,
    });
    setBusy(false);
    if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
    else setError(json?.error?.message ?? "That didn't save");
  };

  return (
    <Modal
      title={`Edit — ${row.title}`}
      onClose={onClose}
      footer={
        <>
          <Btn
            label={busy ? "Saving…" : "Save draft"}
            kind="outline"
            style={{ flex: 1 }}
            onClick={() => void save(false)}
          />
          <Btn
            label={busy ? "Publishing…" : "Publish"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={() => void save(true)}
          />
        </>
      }
    >
      {data === null ? (
        <Shimmer h={200} />
      ) : (
        <>
          <FField label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={F_INPUT_STYLE} />
          </FField>
          <FField label="Body" helper="Markdown. This is what the public page renders.">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ ...F_TEXTAREA_STYLE, height: 240 }}
            />
          </FField>
          <FField label="Change note" helper="Kept on the version row, so a wording change is explicable later">
            <input value={note} onChange={(e) => setNote(e.target.value)} style={F_INPUT_STYLE} />
          </FField>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
            <Switch on={material} onClick={() => setMaterial((v) => !v)} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Material change — ask users to re-accept</span>
          </div>
          <NoteStrip tone="info">
            A draft save does not cut a version. Publishing does, and the version number is what a
            user&apos;s acceptance is recorded against.
          </NoteStrip>
          {data.versions?.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 6 }}>Version history</div>
              {data.versions.slice(0, 6).map((v) => (
                <div
                  key={v.version}
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--ink2)",
                    padding: "4px 0",
                  }}
                >
                  <Mono>v{v.version}</Mono>
                  <span>{shortDate(v.created_at)}</span>
                  {v.is_material ? (
                    <Badge bg="var(--warningSoft)" fg="var(--warning)">
                      re-accept
                    </Badge>
                  ) : null}
                  <span style={{ color: "var(--ink3)" }}>{v.note ?? ""}</span>
                </div>
              ))}
            </div>
          ) : null}
          {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
        </>
      )}
    </Modal>
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
  const [editing, setEditing] = useState<BlogRow | null>(null);
  const [adding, setAdding] = useState(false);

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
            ["Edit post", () => setEditing(r)],
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
        <Btn label="+ New post" kind="primary" onClick={() => setAdding(true)} />
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
      {adding || editing ? (
        <BlogEditor
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
    </div>
  );
}

function BlogEditor({
  row,
  onClose,
  onDone,
}: {
  row: BlogRow | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [title, setTitle] = useState(row?.title ?? "");
  const [category, setCategory] = useState(row?.category ?? "Buying Guide");
  const [status, setStatus] = useState(row?.status_key ?? "draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={row ? `Edit — ${row.title}` : "New post"}
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
                action: "blog_save",
                id: row?.id,
                title,
                category,
                status,
                scheduled_at: scheduledAt || null,
                body_md: body,
              });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That didn't save");
            }}
          />
        </>
      }
    >
      <FField label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={F_INPUT_STYLE}>
          {["Buying Guide", "Legal", "Area Guide", "Product", "Market"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </FField>
      <FField label="Body" helper="Markdown. The read time is computed from this, not typed.">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ ...F_TEXTAREA_STYLE, height: 200 }}
        />
      </FField>
      <FField label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={F_INPUT_STYLE}>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
        </select>
      </FField>
      {status === "scheduled" ? (
        <FField label="Publish at" helper="A scheduled post needs a date, and it has to be ahead">
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            style={F_INPUT_STYLE}
          />
        </FField>
      ) : null}
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
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
  const [editing, setEditing] = useState<BannerRow | null>(null);
  const [adding, setAdding] = useState(false);

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
        <Btn label="+ New banner" kind="primary" onClick={() => setAdding(true)} />
      </div>

      {list.loading ? (
        <Shimmer h={240} />
      ) : (
        // template 2212: `mobile?'1fr':'repeat(2,1fr)'` — two columns from tablet
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(list.data?.rows ?? []).map((b) => (
            <div
              key={b.id}
              onClick={() => setEditing(b)}
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

      {adding || editing ? (
        <BannerEditor
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
    </div>
  );
}

function BannerEditor({
  row,
  onClose,
  onDone,
}: {
  row: BannerRow | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [title, setTitle] = useState(row?.title ?? "");
  const [subtitle, setSubtitle] = useState(row?.subtitle ?? "");
  const [roles, setRoles] = useState<string[]>(row?.target_roles ?? []);
  const [starts, setStarts] = useState(row?.starts_at?.slice(0, 10) ?? "");
  const [ends, setEnds] = useState(row?.ends_at?.slice(0, 10) ?? "");
  const [active, setActive] = useState(row?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal
      title={row ? `Edit — ${row.title}` : "New banner"}
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
                action: "banner_save",
                id: row?.id,
                title,
                subtitle,
                target_roles: roles,
                starts_at: starts ? new Date(starts).toISOString() : null,
                ends_at: ends ? new Date(ends).toISOString() : null,
                is_active: active,
              });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That didn't save");
            }}
          />
        </>
      }
    >
      <FField label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Subtitle">
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Show to" helper="Leave all unticked to show it to everyone">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {["owner", "broker", "builder"].map((r) => (
            <label key={r} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={roles.includes(r)}
                onChange={(e) =>
                  setRoles((v) => (e.target.checked ? [...v, r] : v.filter((x) => x !== r)))
                }
                style={{ accentColor: "var(--accent)" }}
              />
              {r[0].toUpperCase() + r.slice(1)}
            </label>
          ))}
        </div>
      </FField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FField label="Starts">
          <input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} style={F_INPUT_STYLE} />
        </FField>
        <FField label="Ends">
          <input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} style={F_INPUT_STYLE} />
        </FField>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
        <Switch on={active} onClick={() => setActive((v) => !v)} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Active</span>
      </div>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
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
  const [composing, setComposing] = useState(false);
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
        <Btn label="+ New broadcast" kind="primary" onClick={() => setComposing(true)} />
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
      {composing ? (
        <BroadcastComposer
          onClose={() => setComposing(false)}
          onDone={(msg) => {
            toast(msg);
            setComposing(false);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function BroadcastComposer({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channels, setChannels] = useState<string[]>(["in_app"]);
  const [roles, setRoles] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The live audience count runs the SAME resolver the send runs, so the number
  // on screen is the number of people who will actually receive it.
  useEffect(() => {
    const audience = roles.length ? { role: roles } : {};
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/v1/admin/content?what=audience&audience=${encodeURIComponent(JSON.stringify(audience))}`,
        { cache: "no-store" },
      ).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok?: boolean; data?: { count: number } }
        | null;
      setCount(json?.ok ? (json.data?.count ?? 0) : null);
    }, 250);
    return () => clearTimeout(t);
  }, [roles]);

  return (
    <Modal
      title="New broadcast"
      onClose={onClose}
      footer={
        <>
          <Btn label="Cancel" kind="outline" onClick={onClose} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Saving…" : "Save draft"}
            kind="primary"
            style={{ flex: 1 }}
            onClick={async () => {
              setBusy(true);
              setError("");
              const json = await post({
                action: "broadcast_save",
                title,
                body,
                channels,
                audience: roles.length ? { role: roles } : {},
              });
              setBusy(false);
              if (json?.ok) onDone(String(json.data?.summary ?? "Saved"));
              else setError(json?.error?.message ?? "That didn't save");
            }}
          />
        </>
      }
    >
      <FField label="Subject">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Message">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ ...F_TEXTAREA_STYLE, height: 120 }}
        />
      </FField>
      <FField label="Channels">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            ["in_app", "In-app"],
            ["email", "Email"],
            ["whatsapp", "WhatsApp"],
          ].map(([k, l]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={channels.includes(k)}
                onChange={(e) =>
                  setChannels((v) => (e.target.checked ? [...v, k] : v.filter((x) => x !== k)))
                }
                style={{ accentColor: "var(--accent)" }}
              />
              {l}
            </label>
          ))}
        </div>
      </FField>
      <FField label="Audience" helper="Leave all unticked to send to every active user">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {["owner", "broker", "builder"].map((r) => (
            <label key={r} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={roles.includes(r)}
                onChange={(e) =>
                  setRoles((v) => (e.target.checked ? [...v, r] : v.filter((x) => x !== r)))
                }
                style={{ accentColor: "var(--accent)" }}
              />
              {r[0].toUpperCase() + r.slice(1)}
            </label>
          ))}
        </div>
      </FField>
      <NoteStrip tone={count === 0 ? "warn" : "info"}>
        {count === null
          ? "Counting…"
          : count === 0
            ? "Nobody matches this audience — the send would go to no one."
            : `${count.toLocaleString("en-IN")} people will receive this.`}
      </NoteStrip>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
    </Modal>
  );
}

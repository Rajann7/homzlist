"use client";

/**
 * A20's four editors, as STACKED PANELS.
 *
 * The design opens each with `pushPanel` — `pageEdit` (2178), `blogEdit`
 * (2189), `bannerEdit` (2212), `broadcastEdit` (2233). The first pass built
 * all four as centred `Modal`s, which §5 forbids: the surface type is part of
 * the design, and a modal has no breadcrumb bar and cannot be stacked on top of
 * another panel.
 *
 * A page editor in particular needs the stack — its version history links to a
 * user, and a modal has nowhere to put that.
 */

import { useEffect, useState } from "react";
import {
  Badge,
  Btn,
  FField,
  F_INPUT_STYLE,
  F_TEXTAREA_STYLE,
  Mono,
  NoteStrip,
  Shimmer,
  Switch,
  usePanels,
  type PanelEntry,
} from "@/components/admin/ds";

type PageRow = { id: string; slug: string; title: string; version_label: string };
type BlogRow = {
  id: string;
  title: string;
  category: string;
  status_key: string;
};
type BannerRow = {
  id: string;
  title: string;
  subtitle: string | null;
  target_roles: string[];
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
};

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
  iso ? new Date(String(iso)).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

export function PageEditPanelBody({ panel }: { panel: PanelEntry }) {
  const { popPanel, notifyChanged } = usePanels();
  const row = panel.data as unknown as PageRow;
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
    if (json?.ok) {
                notifyChanged();
                popPanel();
              }
    else setError(json?.error?.message ?? "That didn't save");
  };

    const footer = (
    <div
      style={{
        flex: "none",
        borderTop: "1px solid var(--divider)",
        padding: 16,
        display: "flex",
        gap: 8,
      }}
    >
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
    </div>
  );

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
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
      </div>
      {footer}
    </>
  );
}

export function BlogEditPanelBody({ panel }: { panel: PanelEntry }) {
  const { popPanel, notifyChanged } = usePanels();
  const row = panel.data?.id ? (panel.data as unknown as BlogRow) : null;
  const [title, setTitle] = useState(row?.title ?? "");
  const [category, setCategory] = useState(row?.category ?? "");
  const [status, setStatus] = useState(row?.status_key ?? "draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [body, setBody] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(row?.id));
  const [cats, setCats] = useState<{ slug: string; label: string }[]>([]);

  /**
   * Load the REAL post before letting anyone edit it.
   *
   * The panel used to open on an empty body box, because the list row it is
   * handed carries no body_md — and then saved that empty string over the
   * article. Editing a title deleted the post. The save side now leaves absent
   * fields alone (lib/admin/content.ts), and this side actually loads them, so
   * the box shows what is really there.
   */
  useEffect(() => {
    let dead = false;
    void (async () => {
      const [detail, categories] = await Promise.all([
        row?.id
          ? fetch(`/api/v1/admin/content?what=blog&id=${row.id}`, { credentials: "same-origin", cache: "no-store" })
              .then((r) => r.json()).catch(() => null)
          : Promise.resolve(null),
        fetch("/api/v1/admin/content?what=blog-categories", { credentials: "same-origin", cache: "no-store" })
          .then((r) => r.json()).catch(() => null),
      ]);
      if (dead) return;
      if (categories?.ok) setCats(categories.data.categories);
      if (detail?.ok) {
        const p = detail.data as Record<string, string | null>;
        setBody(p.body_md ?? "");
        setExcerpt(p.excerpt ?? "");
        setCoverUrl(p.cover_url ?? "");
        setSeoTitle(p.seo_title ?? "");
        setSeoDescription(p.seo_description ?? "");
        setCategory(p.category ?? "");
        setScheduledAt(p.scheduled_at ? String(p.scheduled_at).slice(0, 16) : "");
      }
      setLoading(false);
    })();
    return () => { dead = true; };
  }, [row?.id]);

    const footer = (
    <div
      style={{
        flex: "none",
        borderTop: "1px solid var(--divider)",
        padding: 16,
        display: "flex",
        gap: 8,
      }}
    >
          <Btn label="Cancel" kind="outline" onClick={popPanel} style={{ flex: 1 }} />
          <Btn
            label={busy ? "Saving…" : loading ? "Loading…" : "Save"}
            kind="primary"
            disabled={loading}
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
                excerpt,
                cover_url: coverUrl,
                seo_title: seoTitle,
                seo_description: seoDescription,
              });
              setBusy(false);
              if (json?.ok) {
                notifyChanged();
                popPanel();
              }
              else setError(json?.error?.message ?? "That didn't save");
            }}
          />
    </div>
  );

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
      <FField label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      {/* The categories are the rows the PUBLIC blog reads (blog_categories),
          not a hardcoded list. The old array held "Buying Guide", "Area Guide",
          "Product", "Market" — none of which match a chip on the live blog, so
          a post saved here landed in a category no filter could ever show. */}
      <FField label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={F_INPUT_STYLE}>
          <option value="">Choose a category…</option>
          {cats.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
      </FField>
      <FField label="Cover image URL" helper="Shown on the blog card and the post header. Left empty, the branded placeholder is used.">
        <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…" style={F_INPUT_STYLE} />
      </FField>
      <FField label="Excerpt" helper="One line under the title on the card, and the share description.">
        <input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} style={F_INPUT_STYLE} />
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
      <FField label="SEO title" helper="≤ 60 characters. Falls back to the post title.">
        <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="SEO description" helper="≤ 160 characters. Falls back to the excerpt.">
        <textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} style={{ ...F_TEXTAREA_STYLE, height: 70 }} />
      </FField>
      {error ? <NoteStrip tone="warn">{error}</NoteStrip> : null}
      </div>
      {footer}
    </>
  );
}

export function BannerEditPanelBody({ panel }: { panel: PanelEntry }) {
  const { popPanel, notifyChanged } = usePanels();
  const row = panel.data?.id ? (panel.data as unknown as BannerRow) : null;
  const [title, setTitle] = useState(row?.title ?? "");
  const [subtitle, setSubtitle] = useState(row?.subtitle ?? "");
  const [imageUrl, setImageUrl] = useState((row as { image_url?: string | null } | null)?.image_url ?? "");
  const [targetUrl, setTargetUrl] = useState((row as { target_url?: string | null } | null)?.target_url ?? "");
  const [frequency, setFrequency] = useState<number>((row as { frequency_cap?: number } | null)?.frequency_cap ?? 0);
  const [roles, setRoles] = useState<string[]>(row?.target_roles ?? []);
  const [starts, setStarts] = useState(row?.starts_at?.slice(0, 10) ?? "");
  const [ends, setEnds] = useState(row?.ends_at?.slice(0, 10) ?? "");
  const [active, setActive] = useState(row?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

    const footer = (
    <div
      style={{
        flex: "none",
        borderTop: "1px solid var(--divider)",
        padding: 16,
        display: "flex",
        gap: 8,
      }}
    >
          <Btn label="Cancel" kind="outline" onClick={popPanel} style={{ flex: 1 }} />
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
                image_url: imageUrl,
                target_url: targetUrl,
                frequency_cap: frequency,
                target_roles: roles,
                starts_at: starts ? new Date(starts).toISOString() : null,
                ends_at: ends ? new Date(ends).toISOString() : null,
                is_active: active,
              });
              setBusy(false);
              if (json?.ok) {
                notifyChanged();
                popPanel();
              }
              else setError(json?.error?.message ?? "That didn't save");
            }}
          />
    </div>
  );

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
      <FField label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Subtitle">
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} style={F_INPUT_STYLE} />
      </FField>
      <FField label="Banner image URL" helper="Shown as the banner background. Left empty, the green gradient is used.">
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" style={F_INPUT_STYLE} />
      </FField>
      <FField label="Link" helper="Where the banner opens when tapped. Left empty, the banner is not tappable.">
        <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://… or /path" style={F_INPUT_STYLE} />
      </FField>
      <FField label="Frequency" helper="How often one person sees it.">
        <select value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} style={F_INPUT_STYLE}>
          <option value={0}>Every visit</option>
          <option value={1}>Once per day</option>
          <option value={2}>Once per session</option>
        </select>
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
      </div>
      {footer}
    </>
  );
}

export function BroadcastEditPanelBody({ panel }: { panel: PanelEntry }) {
  const { popPanel, notifyChanged } = usePanels();
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

  const footer = (
    <div
      style={{
        flex: "none",
        borderTop: "1px solid var(--divider)",
        padding: 16,
        display: "flex",
        gap: 8,
      }}
    >
      <Btn label="Cancel" kind="outline" onClick={popPanel} style={{ flex: 1 }} />
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
              if (json?.ok) {
                notifyChanged();
                popPanel();
              }
              else setError(json?.error?.message ?? "That didn't save");
            }}
          />
    </div>
  );

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
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
      </div>
      {footer}
    </>
  );
}

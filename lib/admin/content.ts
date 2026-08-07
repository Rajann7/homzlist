import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "./audit";
import { sendAdminMessage } from "./users";
import type { AdminIdentity } from "./guard";

/**
 * A20 — Content. Template 2161-2236.
 *
 * Five tabs, and four of them publish to the PUBLIC site: a page, a post, an
 * FAQ and a banner all render on homzlist.com the moment they go live. So the
 * rules that matter here are not layout rules:
 *
 *  · A published page is VERSIONED. `cms_page_versions` gets a row on every
 *    publish, because "we changed the Terms on the 12th" has to be provable,
 *    and re-acceptance (Doc2 §22) is keyed off a version the user agreed to.
 *  · A MATERIAL change forces re-acceptance. The design has the switch; what
 *    makes it real is that the flag lands on the version row, so a user who
 *    accepted v1.2 is asked again and one who accepted v1.3 is not.
 *  · A broadcast HAS A SENDER. Nine rows sat in `broadcasts` with no code that
 *    could send one — the design's "Delivered 398 · 96%" column had nothing to
 *    count. It does now, per recipient (migration 0106).
 */

const db = () => createServiceClient();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

export interface ActionResult {
  ok: boolean;
  label?: string;
  summary?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/* ══════════════════════════════════════════════════════ tab 1 · pages ══════ */

export async function pageDetail(id: string) {
  if (!isUuid(id)) return null;
  const { data } = await db().from("cms_pages").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: versions } = await db()
    .from("cms_page_versions")
    .select("id, version, note, created_at, created_by, effective_date, is_material")
    .eq("page_id", id)
    .order("version", { ascending: false })
    .limit(30);
  return { ...data, versions: versions ?? [] };
}

/**
 * The full row behind a blog post, for the edit panel.
 *
 * The panel used to open with an EMPTY body box because the list view it was
 * handed does not carry body_md — and then saved that empty string over the
 * article. Editing the title of a 5,000-word post deleted the post. It also
 * blanked cover_url, the excerpt and both SEO fields the same way, and reset
 * read_minutes to 1. Nothing warned anyone, because from the panel's point of
 * view it had saved exactly what it was showing.
 */
export async function blogDetail(id: string) {
  if (!isUuid(id)) return null;
  const { data } = await db().from('blog_posts').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

/** The blog category chips, from the table the public site reads. */
export async function blogCategories() {
  const { data } = await db()
    .from('blog_categories')
    .select('slug, label')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []) as { slug: string; label: string }[];
}

export async function savePage(
  id: string,
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data: before } = await db().from("cms_pages").select("*").eq("id", id).maybeSingle();
  const page = before as
    | { id: string; title: string; body_md: string; version: number; is_published: boolean }
    | null;
  if (!page) return { ok: false, message: "Not found" };

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : page.title;
  const bodyMd = typeof body.body_md === "string" ? body.body_md : page.body_md;
  if (!title) return { ok: false, message: "A page needs a title" };
  if (!bodyMd.trim()) return { ok: false, message: "A page needs a body" };

  const publish = body.publish === true;
  const material = body.requires_reacceptance === true;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  const effective =
    typeof body.effective_date === "string" && body.effective_date
      ? body.effective_date
      : new Date().toISOString().slice(0, 10);

  // A draft save does not cut a version — only a publish does. Otherwise the
  // version number counts keystrokes rather than the changes users agreed to.
  const nextVersion = publish ? Number(page.version ?? 1) + 1 : Number(page.version ?? 1);

  const { error } = await db()
    .from("cms_pages")
    .update({
      title,
      body_md: bodyMd,
      seo_title: typeof body.seo_title === "string" ? body.seo_title.slice(0, 160) : null,
      seo_description:
        typeof body.seo_description === "string" ? body.seo_description.slice(0, 300) : null,
      version: nextVersion,
      is_published: publish ? true : page.is_published,
      requires_reacceptance: publish ? material : false,
      effective_date: publish ? effective : null,
      updated_by: me.id,
      updated_at: new Date().toISOString(),
      published_at: publish ? new Date().toISOString() : undefined,
    })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };

  if (publish) {
    // The version row is written AFTER the page, and its failure is not
    // swallowed: a published page with no version row is a page nobody can
    // prove the wording of.
    const { error: vErr } = await db().from("cms_page_versions").insert({
      page_id: id,
      version: nextVersion,
      title,
      body_md: bodyMd,
      note: note || null,
      created_by: me.id,
      effective_date: effective,
      is_material: material,
    });
    if (vErr) return { ok: false, message: `Published, but the version row failed: ${vErr.message}` };
  }

  await writeAudit(me, {
    action: publish ? "cms_publish" : "cms_edit",
    entityType: "cms_page",
    entityId: id,
    entityLabel: title,
    summary: publish
      ? `Published ${title} v${nextVersion}${material ? " — re-acceptance required" : ""}`
      : `Draft saved — ${title}`,
    diff: { before: { version: page.version, title: page.title }, material, note },
  });
  return {
    ok: true,
    label: title,
    summary: publish ? `${title} published as v${nextVersion}` : `${title} saved as draft`,
  };
}

/**
 * The pages the product cannot legally be without. By slug, because that is
 * what the public routes and the footer link to — `kind` only says "legal",
 * which is also true of the Cookie Policy and the Disclaimer.
 */
const LEGALLY_REQUIRED = new Set(["terms", "privacy", "refund", "grievance"]);

export async function unpublishPage(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db()
    .from("cms_pages")
    .select("id, title, slug, kind, is_published")
    .eq("id", id)
    .maybeSingle();
  const page = data as
    | { id: string; title: string; slug: string; kind: string | null; is_published: boolean }
    | null;
  if (!page) return { ok: false, message: "Not found" };
  // Terms, Privacy, Refund and the grievance page are linked from the signup
  // flow and the footer by law. Unpublishing one leaves a 404 where a legal
  // document has to be, so the panel refuses rather than letting an admin find
  // out later.
  //
  // Matched on SLUG. The first version of this guard tested `kind`, which holds
  // 'legal' | 'page' — so it never fired for any row, and Terms of Service was
  // unpublishable with one click.
  if (LEGALLY_REQUIRED.has(page.slug))
    return { ok: false, message: "That page is legally required — it cannot be unpublished" };

  await db().from("cms_pages").update({ is_published: false, updated_by: me.id }).eq("id", id);
  await writeAudit(me, {
    action: "cms_unpublish",
    entityType: "cms_page",
    entityId: id,
    entityLabel: page.title,
    summary: `Unpublished — ${page.title}`,
  });
  return { ok: true, label: page.title, summary: `${page.title} unpublished` };
}

/* ═══════════════════════════════════════════════════════ tab 2 · blog ══════ */

export async function saveBlogPost(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const id = isUuid(body.id) ? body.id : null;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return { ok: false, message: "Give the post a title" };

  const status = ["draft", "scheduled", "published"].includes(String(body.status))
    ? String(body.status)
    : "draft";
  const scheduledAt =
    typeof body.scheduled_at === "string" && body.scheduled_at ? body.scheduled_at : null;
  // A scheduled post with no date never publishes and nothing ever complains.
  if (status === "scheduled" && !scheduledAt)
    return { ok: false, message: "A scheduled post needs a date" };
  if (status === "scheduled" && new Date(scheduledAt!).getTime() < Date.now())
    return { ok: false, message: "That date is in the past — publish it instead" };

  /**
   * The slug is derived from the title ONLY when creating, or when an editor
   * deliberately types one.
   *
   * Re-deriving it on every save meant a title tweak silently changed the URL:
   * "Mavdi vs University Road: which area fits you?" turned
   * /blog/mavdi-vs-university-road into
   * /blog/mavdi-vs-university-road-which-area-fits-you, 404-ing every shared
   * link, every inbound link and the sitemap entry — with no warning, because
   * the post was still right there under a different address. A published URL
   * is a promise; it changes when someone means it to.
   */
  const explicitSlug =
    typeof body.slug === "string" && body.slug.trim()
      ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 120)
      : null;
  const derived = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);

  let slug = explicitSlug ?? derived;
  if (id && !explicitSlug) {
    const { data: existing } = await db().from("blog_posts").select("slug").eq("id", id).maybeSingle();
    slug = (existing as { slug: string } | null)?.slug ?? derived;
  }

  const { data: clash } = await db()
    .from("blog_posts")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (clash && clash.id !== id) return { ok: false, message: `The slug "${slug}" is taken` };

  /**
   * A field the panel did NOT send is LEFT ALONE, rather than nulled.
   *
   * The previous shape — `typeof body.x === "string" ? body.x : null` — wrote
   * null over anything the form did not carry. The edit panel never loaded the
   * body, the cover, the excerpt or the SEO fields, so saving a TITLE CHANGE
   * deleted a five-thousand-word article and reset "8 min read" to 1. Nothing
   * warned anyone: from the panel's point of view it saved what it was showing.
   *
   * `undefined` is omitted from the PATCH by supabase-js, which is exactly the
   * semantics wanted: absent means unchanged, empty string means cleared.
   */
  const sent = (k: string, max: number) =>
    typeof body[k] === "string" ? String(body[k]).slice(0, max) : undefined;

  const bodyMd = sent("body_md", 200_000);
  const patch: Record<string, unknown> = {
    slug,
    title,
    excerpt: sent("excerpt", 400),
    body_md: bodyMd,
    cover_url: sent("cover_url", 500),
    category: sent("category", 60),
    status,
    seo_title: sent("seo_title", 160),
    seo_description: sent("seo_description", 300),
    // "6 min read" is a fact about the body, so it is computed rather than
    // typed — a hand-entered number goes stale the first time someone edits a
    // paragraph. 200 wpm is the usual convention. Only recomputed when the body
    // was actually sent, or a title-only edit would drop every post to 1 min.
    read_minutes:
      bodyMd === undefined
        ? undefined
        : Math.max(1, Math.round(bodyMd.split(/\s+/).filter(Boolean).length / 200)),
    author_id: me.id,
    author_name: me.name,
    scheduled_at: scheduledAt,
    updated_at: new Date().toISOString(),
  };

  /**
   * `published_at` is the date the post CLAIMS, and the blog sorts on it.
   * Stamping `now()` on every save meant fixing a typo in a January post
   * reprinted it as today's and jumped it to the top of the list. It is set
   * once, when the post first goes live, and cleared only if it is unpublished.
   */
  if (status === "published") {
    const already = id
      ? ((await db().from("blog_posts").select("published_at").eq("id", id).maybeSingle()).data as
          { published_at: string | null } | null)?.published_at
      : null;
    patch.published_at = already ?? new Date().toISOString();
  } else {
    patch.published_at = null;
  }

  const { data, error } = id
    ? await db().from("blog_posts").update(patch).eq("id", id).select("id").single()
    : await db().from("blog_posts").insert(patch).select("id").single();
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: id ? "blog_edit" : "blog_add",
    entityType: "blog_post",
    entityId: data.id,
    entityLabel: title,
    summary: `${id ? "Post updated" : "Post created"} — ${title} (${status})`,
    diff: { status, slug },
  });
  return { ok: true, label: title, summary: `${title} saved`, data: { id: data.id } };
}

export async function deleteBlogPost(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db().from("blog_posts").select("id, title").eq("id", id).maybeSingle();
  if (!data) return { ok: false, message: "Not found" };
  await db().from("blog_posts").delete().eq("id", id);
  await writeAudit(me, {
    action: "blog_delete",
    entityType: "blog_post",
    entityId: id,
    entityLabel: data.title,
    summary: `Post deleted — ${data.title}`,
  });
  return { ok: true, label: data.title, summary: "Post deleted · logged" };
}

/* ═══════════════════════════════════════════════════════ tab 3 · FAQs ══════ */

export async function saveFaq(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const id = isUuid(body.id) ? body.id : null;
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 300) : "";
  const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 4000) : "";
  if (!question) return { ok: false, message: "Enter the question" };
  if (!answer) return { ok: false, message: "Enter the answer" };

  const patch = {
    question,
    answer,
    body_md: answer,
    category: typeof body.category === "string" ? body.category : "Getting Started",
    sort_order: typeof body.sort_order === "number" ? body.sort_order : 100,
    is_active: typeof body.is_active === "boolean" ? body.is_active : true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = id
    ? await db().from("faqs").update(patch).eq("id", id).select("id").single()
    : await db().from("faqs").insert(patch).select("id").single();
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: id ? "faq_edit" : "faq_add",
    entityType: "faq",
    entityId: data.id,
    entityLabel: question.slice(0, 80),
    summary: `${id ? "FAQ updated" : "FAQ added"} — ${question.slice(0, 80)}`,
    diff: { category: patch.category },
  });
  return { ok: true, label: question.slice(0, 60), summary: "FAQ saved" };
}

export async function deleteFaq(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db().from("faqs").select("id, question").eq("id", id).maybeSingle();
  if (!data) return { ok: false, message: "Not found" };
  await db().from("faqs").delete().eq("id", id);
  await writeAudit(me, {
    action: "faq_delete",
    entityType: "faq",
    entityId: id,
    entityLabel: data.question.slice(0, 80),
    summary: `FAQ deleted — ${data.question.slice(0, 80)}`,
  });
  return { ok: true, label: "FAQ", summary: "FAQ deleted · logged" };
}

/** The design's category sidebar (template 2196) — counts, not guesses. */
export async function faqCategories() {
  const { data } = await db().from("faqs").select("category").eq("is_active", true);
  const counts = new Map<string, number>();
  for (const f of (data ?? []) as { category: string }[]) {
    counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ════════════════════════════════════════════════════ tab 4 · banners ══════ */

export async function saveBanner(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const id = isUuid(body.id) ? body.id : null;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) return { ok: false, message: "Give the banner a title" };

  const starts = typeof body.starts_at === "string" && body.starts_at ? body.starts_at : null;
  const ends = typeof body.ends_at === "string" && body.ends_at ? body.ends_at : null;
  if (starts && ends && new Date(ends) <= new Date(starts))
    return { ok: false, message: "The end date must be after the start date" };

  // Build the patch from ONLY the fields the caller actually sent. Two reasons:
  //  1. every NOT-NULL column in feed_banners carries a DB default (frequency_cap
  //     0, placement 'feed', is_active true, target_roles/cities '{}', sort_order
  //     0), so an INSERT that omits them is filled correctly — this is what fixes
  //     the "frequency_cap null violates not-null" 422 the old unconditional patch
  //     produced on every save.
  //  2. an UPDATE must not wipe a field the form did not send (image_url,
  //     target_url, sort_order were being reset to null/default on every edit).
  const patch: Record<string, unknown> = { title, updated_at: new Date().toISOString() };
  patch.starts_at = starts; // always meaningful — null clears the window
  patch.ends_at = ends;
  if (typeof body.subtitle === "string") patch.subtitle = body.subtitle.slice(0, 200) || null;
  if (typeof body.image_url === "string") patch.image_url = body.image_url.trim() || null;
  if (typeof body.target_url === "string") patch.target_url = body.target_url.trim() || null;
  if (Array.isArray(body.target_cities)) patch.target_cities = body.target_cities.filter(isUuid);
  if (Array.isArray(body.target_roles))
    patch.target_roles = body.target_roles.filter((r): r is string =>
      ["owner", "broker", "builder"].includes(r as string),
    );
  if (typeof body.target_plan_status === "string")
    patch.target_plan_status = body.target_plan_status || null;
  if (typeof body.frequency_cap === "number" && Number.isFinite(body.frequency_cap))
    patch.frequency_cap = Math.max(0, Math.trunc(body.frequency_cap));
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;
  if (typeof body.placement === "string") patch.placement = body.placement;

  const { data, error } = id
    ? await db().from("feed_banners").update(patch).eq("id", id).select("id").single()
    : await db().from("feed_banners").insert(patch).select("id").single();
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: id ? "banner_edit" : "banner_add",
    entityType: "banner",
    entityId: data.id,
    entityLabel: title,
    summary: `${id ? "Banner updated" : "Banner created"} — ${title}`,
    diff: { starts, ends, roles: patch.target_roles },
  });
  return { ok: true, label: title, summary: `${title} saved`, data: { id: data.id } };
}

export async function toggleBanner(
  id: string,
  active: boolean,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db().from("feed_banners").select("id, title").eq("id", id).maybeSingle();
  if (!data) return { ok: false, message: "Not found" };
  await db().from("feed_banners").update({ is_active: active }).eq("id", id);
  await writeAudit(me, {
    action: "banner_edit",
    entityType: "banner",
    entityId: id,
    entityLabel: data.title,
    summary: `${data.title} turned ${active ? "on" : "off"}`,
    diff: { is_active: active },
  });
  return { ok: true, label: data.title, summary: `${data.title} turned ${active ? "on" : "off"}` };
}

/* ═════════════════════════════════════════════════ tab 5 · broadcasts ══════ */

interface Audience {
  role?: string[];
  city?: string[];
  plan_status?: string;
}

/**
 * Who a broadcast goes to — resolved as a QUERY, so the count on the compose
 * screen and the people who receive it are the same set.
 *
 * A stored `recipient_count` that was right when the draft was written is the
 * obvious alternative and it is wrong by the time the send runs.
 */
export async function resolveAudience(audience: Audience): Promise<string[]> {
  let q = db().from("profiles").select("id").eq("state", "active");
  if (audience.role?.length) q = q.in("role", audience.role);
  if (audience.city?.length) q = q.in("city_id", audience.city);
  const { data } = await q.limit(50_000);
  let ids = ((data ?? []) as { id: string }[]).map((p) => p.id);

  if (audience.plan_status) {
    const { data: plans } = await db()
      .from("user_plans")
      .select("profile_id")
      .eq("status", "active");
    const paid = new Set(((plans ?? []) as { profile_id: string }[]).map((p) => p.profile_id));
    ids =
      audience.plan_status === "none" ? ids.filter((i) => !paid.has(i)) : ids.filter((i) => paid.has(i));
  }
  return ids;
}

export async function audienceCount(audience: Audience): Promise<number> {
  return (await resolveAudience(audience)).length;
}

export async function saveBroadcast(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const id = isUuid(body.id) ? body.id : null;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (!title) return { ok: false, message: "Give the broadcast a subject" };
  if (!text) return { ok: false, message: "Write the message" };

  const channels = Array.isArray(body.channels)
    ? body.channels.filter((c): c is string => ["in_app", "email", "whatsapp"].includes(c as string))
    : [];
  if (!channels.length) return { ok: false, message: "Pick at least one channel" };

  const audience = (body.audience ?? {}) as Audience;
  const count = await audienceCount(audience);
  if (!count) return { ok: false, message: "That audience is empty — nobody would receive this" };

  const scheduledAt =
    typeof body.scheduled_at === "string" && body.scheduled_at ? body.scheduled_at : null;
  const status = scheduledAt ? "scheduled" : "draft";
  if (scheduledAt && new Date(scheduledAt).getTime() < Date.now())
    return { ok: false, message: "That send time has already passed" };

  const patch = {
    title,
    body: text,
    channels,
    audience,
    recipient_count: count,
    status,
    scheduled_at: scheduledAt,
  };
  const { data, error } = id
    ? await db().from("broadcasts").update(patch).eq("id", id).select("id").single()
    : await db().from("broadcasts").insert(patch).select("id").single();
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: id ? "broadcast_edit" : "broadcast_create",
    entityType: "broadcast",
    entityId: data.id,
    entityLabel: title,
    summary: `Broadcast ${status} — ${title} · ${count.toLocaleString("en-IN")} recipients`,
    diff: { channels, audience, count },
  });
  return {
    ok: true,
    label: title,
    summary: `${title} saved · ${count.toLocaleString("en-IN")} recipients`,
    data: { id: data.id, recipient_count: count },
  };
}

/**
 * The send. This is the job behind the design's Delivered column.
 *
 * It goes through `sendAdminMessage` — the same path A11's "Send message" uses
 * — rather than a second fan-out, so a channel with no credentials on this
 * environment reports `no_credentials` here exactly as it does there, and there
 * is one place per-channel delivery is recorded.
 *
 * The recipient rows are written FIRST, in the pending state. If the process
 * dies mid-send there is a record of who was in scope, so a resend can tell
 * "never attempted" from "attempted and failed" — without them, a crash halfway
 * through a 4,000-person send is unrecoverable except by sending to everyone
 * again.
 */
export async function sendBroadcast(
  id: string,
  me: AdminIdentity,
  opts: { onlyPending?: boolean } = {},
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db().from("broadcasts").select("*").eq("id", id).maybeSingle();
  const b = data as
    | {
        id: string;
        title: string;
        body: string;
        channels: string[];
        audience: Audience;
        status: string;
      }
    | null;
  if (!b) return { ok: false, message: "Not found" };
  if (b.status === "sent" && !opts.onlyPending)
    return { ok: false, message: "That broadcast has already been sent" };

  let ids = await resolveAudience(b.audience ?? {});
  if (opts.onlyPending) {
    const { data: done } = await db()
      .from("broadcast_recipients")
      .select("profile_id")
      .eq("broadcast_id", id)
      .not("delivered_at", "is", null);
    const already = new Set(((done ?? []) as { profile_id: string }[]).map((r) => r.profile_id));
    ids = ids.filter((i) => !already.has(i));
  }
  if (!ids.length) return { ok: false, message: "Nobody left to send to" };

  await db()
    .from("broadcast_recipients")
    .upsert(
      ids.map((profile_id) => ({ broadcast_id: id, profile_id })),
      { onConflict: "broadcast_id,profile_id" },
    );

  // In batches, so one 4,000-row send does not become one 4,000-row failure.
  const BATCH = 200;
  let delivered = 0;
  const failures: string[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const res = await sendAdminMessage(slice, me, b.channels, b.title, b.body);
    if (res.ok) {
      await db()
        .from("broadcast_recipients")
        .update({ delivered_at: new Date().toISOString(), delivery: res.diff ?? {} })
        .eq("broadcast_id", id)
        .in("profile_id", slice);
      delivered += slice.length;
    } else {
      failures.push(res.message ?? "send failed");
    }
  }

  const status = delivered === 0 ? "failed" : "sent";
  await db()
    .from("broadcasts")
    .update({ status, sent_at: new Date().toISOString(), sent_by: me.id, recipient_count: ids.length })
    .eq("id", id);

  await writeAudit(me, {
    action: "broadcast_send",
    entityType: "broadcast",
    entityId: id,
    entityLabel: b.title,
    summary: `Broadcast sent — ${b.title} · ${delivered}/${ids.length} delivered`,
    diff: { delivered, attempted: ids.length, failures: failures.slice(0, 5) },
  });

  return {
    ok: delivered > 0,
    label: b.title,
    summary: `${delivered.toLocaleString("en-IN")} of ${ids.length.toLocaleString("en-IN")} delivered`,
    message: delivered === 0 ? (failures[0] ?? "Nothing was delivered") : undefined,
  };
}

export async function cancelBroadcast(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db()
    .from("broadcasts")
    .select("id, title, status")
    .eq("id", id)
    .maybeSingle();
  const b = data as { id: string; title: string; status: string } | null;
  if (!b) return { ok: false, message: "Not found" };
  // The design puts "Cancel send" on every row menu, including sent ones. A
  // sent message cannot be un-sent, and a button that pretends otherwise is
  // worse than one that is honest about it.
  if (b.status === "sent") return { ok: false, message: "That broadcast has already gone out" };

  await db().from("broadcasts").update({ status: "draft", scheduled_at: null }).eq("id", id);
  await writeAudit(me, {
    action: "broadcast_cancel",
    entityType: "broadcast",
    entityId: id,
    entityLabel: b.title,
    summary: `Broadcast cancelled — ${b.title}`,
  });
  return { ok: true, label: b.title, summary: "Broadcast cancelled" };
}

/** The design's "View report" (template 2233). */
export async function broadcastReport(id: string) {
  if (!isUuid(id)) return null;
  const { data } = await db().from("admin_broadcast_list").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { count: attempted } = await db()
    .from("broadcast_recipients")
    .select("profile_id", { count: "exact", head: true })
    .eq("broadcast_id", id);
  const { count: delivered } = await db()
    .from("broadcast_recipients")
    .select("profile_id", { count: "exact", head: true })
    .eq("broadcast_id", id)
    .not("delivered_at", "is", null);
  return { ...data, attempted: attempted ?? 0, delivered: delivered ?? 0 };
}

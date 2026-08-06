import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications/service";
import type { AdminIdentity } from "./guard";

/**
 * A12 — the listings master and its edit panel (template 1056-1105, 1411-1446).
 *
 * The panel's own banner is the rule this file enforces (template 1416):
 * "Compliance edits only. Every change is logged with your name and the old
 * value. Do not 'improve' user content."
 *
 *  · EVERY EDIT CARRIES ITS OLD VALUE. `editListing` reads before it writes and
 *    returns the diff, so the audit row the route writes can answer "what did
 *    it say before" — a log that records only the new value cannot.
 *  · A REASON IS MANDATORY. The design's footer says "(required)", so the
 *    server refuses without one rather than trusting the textarea.
 *  · RE-REVIEW IS A REAL TRANSITION. The save dialog's "Re-review required"
 *    checkbox puts the listing back into `pending_review` — the same state A3's
 *    queue reads, so an admin edit lands in the queue like any other.
 *
 * Both KINDS are handled: a builder posts projects, not listings, so an action
 * that only knew about `listings` would be dead on every builder row.
 */

const db = () => createServiceClient();

export type MasterKind = "listing" | "project";

export type MasterResult =
  | { ok: true; label: string; summary: string; diff?: Record<string, unknown> }
  | { ok: false; reason: "not_found" | "bad_state" | "validation"; message?: string };

const TABLE: Record<MasterKind, string> = { listing: "listings", project: "projects" };
const TITLE: Record<MasterKind, string> = { listing: "title", project: "name" };

/**
 * The OWNER's own page for the thing an admin acted on — the target of the
 * notification that tells them about it. `admin_message` has no href template
 * (its subject changes per producer), so a producer that KNOWS the subject has
 * to say so, or the row falls back to Account status and the user has to go
 * looking for which listing we meant.
 */
const ownerHref = (kind: MasterKind, id: string) =>
  kind === "project" ? `/projects/${id}` : `/listings/${id}`;

/** …and the form that reopens it — a project does not edit in the flat form. */
const editHref = (kind: MasterKind, id: string) =>
  kind === "project" ? `/projects/new?edit=${id}` : `/create/form?edit=${id}`;

async function subject(kind: MasterKind, id: string) {
  const { data } = await db()
    .from(TABLE[kind])
    .select(`id, profile_id, status, ${TITLE[kind]}`)
    .eq("id", id)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

/* ════════════════════════════════════════════════ the panel's seven tabs ═══ */

export type ListingTab = "preview" | "fields" | "photos" | "leads" | "boost" | "reports" | "timeline";

export async function listingHeader(kind: MasterKind, id: string) {
  const { data } = await db()
    .from("admin_listing_master")
    .select("*")
    .eq("id", id)
    .eq("kind", kind)
    .maybeSingle();
  return (data as Record<string, unknown>) ?? null;
}

export async function listingTab(kind: MasterKind, id: string, tab: ListingTab): Promise<unknown> {
  switch (tab) {
    case "preview":
    case "fields":
      return fieldsTab(kind, id);
    case "photos":
      return photosTab(kind, id);
    case "leads":
      return leadsTab(kind, id);
    case "boost":
      return boostTab(kind, id);
    case "reports":
      return reportsTab(kind, id);
    case "timeline":
      return timelineTab(kind, id);
  }
}

/**
 * template 1421-1425 — the editable field list.
 *
 * The fields offered are the ones the TYPE actually defines (`field_definitions`,
 * which A19 owns), not a literal list: an admin editing "BHK" on an office is
 * the design's mock, not the product.
 */
async function fieldsTab(kind: MasterKind, id: string) {
  if (kind === "project") {
    const { data } = await db()
      .from("projects")
      .select(
        "id, name, description, project_type, area_label, pincode, amenities, rera_number, possession_date, towers, floors, total_units, available_units, attributes, status",
      )
      .eq("id", id)
      .maybeSingle();
    return { kind, row: data as Record<string, unknown> | null, definitions: [] };
  }

  const { data } = await db()
    .from("listings")
    .select(
      "id, title, description, type_code, kind, price_paise, price_on_request, is_negotiable, deposit_paise, maintenance_paise, area_label, pincode, amenities, attributes, area_sqft, status, contact_number, alt_number",
    )
    .eq("id", id)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return { kind, row: null, definitions: [] };

  const { data: defs } = await db()
    .from("field_definitions")
    .select('key, label, control, options, "group", units, is_active')
    .eq("is_active", true)
    .order("sort_order");

  const { data: amenityRows } = await db()
    .from("amenities")
    .select("code, label")
    .eq("is_active", true)
    .order("sort_order");

  return {
    kind,
    row,
    definitions: (defs ?? []) as Record<string, unknown>[],
    amenities: (amenityRows ?? []) as { code: string; label: string }[],
  };
}

/** template 1427 — the photo grid, with COVER on the first. */
async function photosTab(kind: MasterKind, id: string) {
  const table = kind === "listing" ? "listing_photos" : "project_photos";
  const column = kind === "listing" ? "listing_id" : "project_id";
  const { data } = await db()
    .from(table)
    .select("id, url, storage_key, position, status")
    .eq(column, id)
    .order("position");
  return { rows: (data ?? []) as Record<string, unknown>[] };
}

/** template 1429 */
async function leadsTab(kind: MasterKind, id: string) {
  const column = kind === "listing" ? "listing_id" : "project_id";
  const { data } = await db()
    .from("leads")
    .select("id, lead_profile_id, stage, last_activity, last_activity_at, source")
    .eq(column, id)
    .order("last_activity_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(rows.map((r) => r.lead_profile_id as string))];
  const { data: people } = ids.length
    ? await db().from("profiles").select("id, name, photo_url").in("id", ids)
    : { data: [] };
  const map = new Map(
    ((people ?? []) as { id: string; name: string; photo_url: string | null }[]).map((p) => [p.id, p]),
  );
  return {
    rows: rows.map((r) => ({
      ...r,
      lead_name: map.get(r.lead_profile_id as string)?.name ?? "—",
      lead_photo: map.get(r.lead_profile_id as string)?.photo_url ?? null,
    })),
  };
}

/** template 1431 — the ACTIVE boost, then history. */
async function boostTab(kind: MasterKind, id: string) {
  const { data } = await db()
    .from("boosts")
    .select(
      "id, status, targeting, target_label, duration_days, price_paise, starts_at, ends_at, paused_at, approved_at, created_at, reject_reason, stopped_reason",
    )
    .eq("subject_kind", kind)
    .eq("listing_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    active: rows.find((r) => r.status === "active" || r.status === "paused") ?? null,
    history: rows,
  };
}

/** template 1433 */
async function reportsTab(kind: MasterKind, id: string) {
  const { data } = await db()
    .from("reports")
    .select("id, reason, note, status, created_at, reporter_id")
    .eq("subject_type", kind)
    .eq("subject_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    rows,
    open: rows.filter((r) => r.status === "open" || r.status === "reviewing").length,
  };
}

/** template 1436 — the entity's own history, from the tables that recorded it. */
async function timelineTab(kind: MasterKind, id: string) {
  const [{ data: row }, { data: audit }, { data: moderation }, { data: prices }, { data: boosts }] =
    await Promise.all([
      db()
        .from(TABLE[kind])
        .select("created_at, submitted_at, approved_at, live_at, hidden_at, deleted_at")
        .eq("id", id)
        .maybeSingle(),
      db()
        .from("admin_audit_log")
        .select("action, actor_name, summary, created_at")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(40),
      db()
        .from("moderation_log")
        .select("action, reason, created_at, actor_id")
        .eq("subject", kind)
        .eq("subject_id", id)
        .order("created_at", { ascending: false })
        .limit(40),
      kind === "listing"
        ? db()
            .from("listing_price_history")
            .select("old_paise, new_paise, changed_at")
            .eq("listing_id", id)
            .order("changed_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
      db()
        .from("boosts")
        .select("status, created_at, approved_at, ends_at")
        .eq("subject_kind", kind)
        .eq("listing_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const items: { at: string; text: string }[] = [];
  const r = (row ?? {}) as Record<string, string | null>;
  if (r.created_at) items.push({ at: r.created_at, text: "Created" });
  if (r.submitted_at) items.push({ at: r.submitted_at, text: "Submitted for review" });
  if (r.approved_at) items.push({ at: r.approved_at, text: "Approved" });
  if (r.live_at) items.push({ at: r.live_at, text: "Went live" });
  if (r.hidden_at) items.push({ at: r.hidden_at, text: "Hidden" });
  if (r.deleted_at) items.push({ at: r.deleted_at, text: "Deleted" });
  for (const p of (prices ?? []) as Record<string, unknown>[]) {
    items.push({
      at: p.changed_at as string,
      text: `Price edited (₹${Math.round(Number(p.old_paise ?? 0) / 100).toLocaleString("en-IN")} → ₹${Math.round(Number(p.new_paise ?? 0) / 100).toLocaleString("en-IN")})`,
    });
  }
  for (const b of (boosts ?? []) as Record<string, unknown>[]) {
    if (b.approved_at) items.push({ at: b.approved_at as string, text: "Boost approved" });
  }
  for (const m of (moderation ?? []) as Record<string, unknown>[]) {
    items.push({ at: m.created_at as string, text: `Moderation: ${m.action}` });
  }
  for (const a of (audit ?? []) as Record<string, unknown>[]) {
    items.push({ at: a.created_at as string, text: `${a.summary} — ${a.actor_name}` });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { items };
}

/* ═══════════════════════════════════════════════════════ the actions ═══════ */

/** The columns an admin may touch, per kind. Anything else is refused. */
const EDITABLE: Record<MasterKind, Set<string>> = {
  listing: new Set([
    "title",
    "description",
    "price_paise",
    "area_label",
    "pincode",
    "amenities",
    "area_sqft",
    "is_negotiable",
    "deposit_paise",
    "maintenance_paise",
  ]),
  project: new Set([
    "name",
    "description",
    "area_label",
    "pincode",
    "amenities",
    "rera_number",
    "possession_date",
    "towers",
    "floors",
    "total_units",
    "available_units",
  ]),
};

/** template 1425/1782 — Save N changes, with a reason and an optional re-review. */
export async function editListing(
  kind: MasterKind,
  id: string,
  me: AdminIdentity,
  changes: Record<string, unknown>,
  reason: string,
  reReview: boolean,
): Promise<MasterResult> {
  if (!reason.trim()) return { ok: false, reason: "validation", message: "A reason is required" };
  const keys = Object.keys(changes).filter((k) => EDITABLE[kind].has(k));
  if (!keys.length) return { ok: false, reason: "validation", message: "Nothing to save" };

  const { data: before } = await db()
    .from(TABLE[kind])
    .select(`id, profile_id, status, ${TITLE[kind]}, ${keys.join(", ")}`)
    .eq("id", id)
    .maybeSingle();
  if (!before) return { ok: false, reason: "not_found" };
  const prev = before as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    if (JSON.stringify(prev[k]) === JSON.stringify(changes[k])) continue; // not a change
    patch[k] = changes[k];
    diff[k] = { from: prev[k], to: changes[k] };
  }
  if (!Object.keys(patch).length)
    return { ok: false, reason: "validation", message: "Those values are already set" };

  patch.updated_at = new Date().toISOString();
  patch.edited_since_approval = true;
  if (reReview) patch.status = "pending_review";

  const { error } = await db().from(TABLE[kind]).update(patch).eq("id", id);
  if (error) return { ok: false, reason: "validation", message: error.message };

  // A price change is history the user's own screens read, not just an audit
  // row — the price-drop notification and the saved-listing badge both hang
  // off this table.
  if (kind === "listing" && diff.price_paise) {
    await db().from("listing_price_history").insert({
      listing_id: id,
      old_paise: diff.price_paise.from as number,
      new_paise: diff.price_paise.to as number,
    });
  }

  // NOT written to moderation_log. FOUND BY THE P4 CHECK: that table's
  // `action` is CHECK-constrained to approve / request_changes / reject, so an
  // "admin_edit" row was rejected by Postgres and swallowed — the panel showed a
  // success toast over a trail entry that never existed. It also does not belong
  // there: a compliance edit is not a moderation DECISION. The audit row the
  // route writes carries the reason and the old value, which is the trail the
  // design's banner actually promises.

  await notify({
    profileId: prev.profile_id as string,
    type: reReview ? "listing_changes_requested" : "admin_message",
    title: reReview
      ? "Your listing is being re-reviewed after an edit"
      : "A compliance edit was made to your listing",
    body: reason.trim().slice(0, 300),
    href: reReview ? editHref(kind, id) : ownerHref(kind, id),
    entityKind: kind,
    entityId: id,
    actorId: me.id,
  });

  return {
    ok: true,
    label: (prev[TITLE[kind]] as string) ?? "Listing",
    summary: `${Object.keys(diff).length} field(s) edited${reReview ? " · sent for re-review" : ""}`,
    diff: { reason: reason.trim(), changes: diff, reReview },
  };
}

/** template 1780 — Hide this listing. */
export async function hideListing(
  kind: MasterKind,
  id: string,
  me: AdminIdentity,
  reason: string | null,
): Promise<MasterResult> {
  const { data } = await db()
    .from(TABLE[kind])
    .update({ status: "hidden", hidden_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "live")
    .select(`id, profile_id, ${TITLE[kind]}`)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return { ok: false, reason: "bad_state", message: "Only a live listing can be hidden" };

  await notify({
    profileId: row.profile_id as string,
    type: "admin_message",
    title: "Your listing has been hidden",
    body: reason?.trim() || "It is no longer shown in feed or search.",
    href: ownerHref(kind, id),
    entityKind: kind,
    entityId: id,
    actorId: me.id,
  });

  return {
    ok: true,
    label: (row[TITLE[kind]] as string) ?? "Listing",
    summary: "Hidden from feed and search",
    diff: { reason: reason?.trim() ?? null },
  };
}

/** template 1707/1712 — Restore (from hidden or archived, back to live). */
export async function restoreListing(
  kind: MasterKind,
  id: string,
  me: AdminIdentity,
): Promise<MasterResult> {
  // `projects` has no archived_at column — a project is never archived, only
  // hidden — so the patch is built per kind rather than sending a column that
  // does not exist and failing the whole update.
  const patch: Record<string, unknown> =
    kind === "listing"
      ? { status: "live", hidden_at: null, archived_at: null }
      : { status: "live", hidden_at: null };
  const { data } = await db()
    .from(TABLE[kind])
    .update(patch)
    .eq("id", id)
    .in("status", ["hidden", "archived"])
    .select(`id, profile_id, ${TITLE[kind]}`)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row)
    return { ok: false, reason: "bad_state", message: "Only a hidden or archived listing restores" };

  await notify({
    profileId: row.profile_id as string,
    type: "listing_approved",
    title: "Your listing is live again",
    entityKind: kind,
    entityId: id,
    actorId: me.id,
  });
  return { ok: true, label: (row[TITLE[kind]] as string) ?? "Listing", summary: "Restored to live" };
}

/**
 * template 1707/1712 — Mark sold.
 *
 * Projects have no `availability` column, because a project is not sold as one
 * unit — so this action refuses on a project rather than pretending.
 */
export async function markSold(
  kind: MasterKind,
  id: string,
  me: AdminIdentity,
): Promise<MasterResult> {
  if (kind === "project")
    return { ok: false, reason: "validation", message: "A project is not marked sold — edit its units" };

  const { data } = await db()
    .from("listings")
    .update({ availability: "sold", sold_at: new Date().toISOString() })
    .eq("id", id)
    .eq("availability", "available")
    .select("id, profile_id, title, kind")
    .maybeSingle();
  const row = data as { id: string; profile_id: string; title: string | null; kind: string } | null;
  if (!row) return { ok: false, reason: "bad_state", message: "Already marked sold or rented" };

  await notify({
    profileId: row.profile_id,
    type: "saved_listing_status",
    title: "Your listing is marked sold",
    entityKind: "listing",
    entityId: id,
    actorId: me.id,
  });
  return { ok: true, label: row.title ?? "Listing", summary: "Marked sold" };
}

/** template 1712 — Force expire (archive), the admin end of the expiry prompt. */
export async function forceExpireListing(
  kind: MasterKind,
  id: string,
  me: AdminIdentity,
): Promise<MasterResult> {
  const patch: Record<string, unknown> =
    kind === "listing"
      ? { status: "archived", archived_at: new Date().toISOString() }
      : { status: "archived" };
  const { data } = await db()
    .from(TABLE[kind])
    .update(patch)
    .eq("id", id)
    .in("status", ["live", "hidden"])
    .select(`id, profile_id, ${TITLE[kind]}`)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return { ok: false, reason: "bad_state", message: "Not a live or hidden listing" };

  await notify({
    profileId: row.profile_id as string,
    type: "still_available",
    title: "Your listing has expired",
    body: "It is no longer shown. You can repost it any time.",
    entityKind: kind,
    entityId: id,
    actorId: me.id,
  });
  return { ok: true, label: (row[TITLE[kind]] as string) ?? "Listing", summary: "Force expired" };
}

/** template 1707 — Delete (soft; A29 Trash restores it). Super only, per 1071. */
export async function deleteListing(
  kind: MasterKind,
  id: string,
  me: AdminIdentity,
  reason: string | null,
): Promise<MasterResult> {
  const now = new Date().toISOString();
  const { data } = await db()
    .from(TABLE[kind])
    .update({ status: "deleted", deleted_at: now })
    .eq("id", id)
    .is("deleted_at", null)
    .select(`id, profile_id, ${TITLE[kind]}`)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return { ok: false, reason: "bad_state", message: "Already deleted" };

  await db().from("trash_items").insert({
    entity_type: kind,
    entity_id: id,
    label: (row[TITLE[kind]] as string) ?? "Listing",
    deleted_by_kind: "admin",
    deleted_by: me.id,
    deleted_by_name: me.name,
    reason: reason?.trim() ?? "Deleted from the admin panel",
  });

  return {
    ok: true,
    label: (row[TITLE[kind]] as string) ?? "Listing",
    summary: "Deleted — recoverable from Trash for 30 days",
  };
}

/**
 * template 1416 — "Remove story".
 *
 * Stories are derived from `live_at` inside 24h, so before migration 0098 this
 * button had nothing it could write and the story would have reappeared on the
 * next feed read. It sets the suppression the story query now honours.
 */
export async function removeStory(
  kind: MasterKind,
  id: string,
  me: AdminIdentity,
): Promise<MasterResult> {
  const { data } = await db()
    .from(TABLE[kind])
    .update({ story_suppressed_at: new Date().toISOString() })
    .eq("id", id)
    .is("story_suppressed_at", null)
    .select(`id, ${TITLE[kind]}, live_at`)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return { ok: false, reason: "bad_state", message: "No story to remove" };
  void me;
  return { ok: true, label: (row[TITLE[kind]] as string) ?? "Listing", summary: "Story removed" };
}

/** template 1784 — Pause this boost. "The remaining days are preserved." */
export async function pauseBoost(
  kind: MasterKind,
  id: string,
  me: AdminIdentity,
  resume: boolean,
): Promise<MasterResult> {
  const { data: boost } = await db()
    .from("boosts")
    .select("id, status, ends_at, paused_at, profile_id")
    .eq("subject_kind", kind)
    .eq("listing_id", id)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const b = boost as
    | { id: string; status: string; ends_at: string; paused_at: string | null; profile_id: string }
    | null;
  if (!b) return { ok: false, reason: "not_found", message: "No active boost" };

  if (!resume) {
    if (b.status !== "active") return { ok: false, reason: "bad_state", message: "Already paused" };
    // Read the error and the row. The `.eq("status","active")` guard means a
    // concurrent pause makes this a no-op, and without checking we would have
    // answered "paused" over a boost that is still running.
    const { data: paused, error } = await db()
      .from("boosts")
      .update({ status: "paused", paused_at: new Date().toISOString() })
      .eq("id", b.id)
      .eq("status", "active")
      .select("id");
    if (error || !paused?.length)
      return { ok: false, reason: "bad_state", message: "Already paused" };
    return { ok: true, label: "Boost", summary: "Boost paused — remaining days preserved" };
  }

  if (b.status !== "paused" || !b.paused_at)
    return { ok: false, reason: "bad_state", message: "Not paused" };
  // Preserved means preserved: the end date moves forward by exactly the time
  // the boost spent paused, otherwise pausing silently costs the buyer days
  // they paid for.
  const pausedMs = Date.now() - new Date(b.paused_at).getTime();
  const newEnds = new Date(new Date(b.ends_at).getTime() + pausedMs).toISOString();
  const { data: resumed, error: resumeError } = await db()
    .from("boosts")
    .update({ status: "active", paused_at: null, ends_at: newEnds })
    .eq("id", b.id)
    .eq("status", "paused")
    .select("id");
  if (resumeError || !resumed?.length)
    return { ok: false, reason: "bad_state", message: "Not paused" };
  void me;
  return {
    ok: true,
    label: "Boost",
    summary: `Boost resumed — ends ${new Date(newEnds).toLocaleDateString("en-IN")}`,
    diff: { pausedMs, endsAt: newEnds },
  };
}

/** template 1714 — the photo menu: set as cover · remove photo. */
export async function photoAction(
  kind: MasterKind,
  id: string,
  photoId: string,
  me: AdminIdentity,
  action: "cover" | "remove",
): Promise<MasterResult> {
  const table = kind === "listing" ? "listing_photos" : "project_photos";
  const column = kind === "listing" ? "listing_id" : "project_id";

  const { data: photo } = await db()
    .from(table)
    .select("id, url, position")
    .eq("id", photoId)
    .eq(column, id)
    .maybeSingle();
  if (!photo) return { ok: false, reason: "not_found" };
  const p = photo as { id: string; url: string | null; position: number };

  if (action === "cover") {
    // Position 0 IS the cover everywhere else in the app, so the cover column
    // and the ordering cannot disagree.
    const { data: rows } = await db()
      .from(table)
      .select("id, position")
      .eq(column, id)
      .order("position");
    const others = ((rows ?? []) as { id: string }[]).filter((r) => r.id !== photoId);
    await db().from(table).update({ position: 0 }).eq("id", photoId);
    for (let i = 0; i < others.length; i++) {
      await db()
        .from(table)
        .update({ position: i + 1 })
        .eq("id", others[i].id);
    }
    await db().from(TABLE[kind]).update({ cover_url: p.url }).eq("id", id);
    void me;
    return { ok: true, label: "Photo", summary: "Cover updated" };
  }

  const { count } = await db()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, id);
  if ((count ?? 0) <= 1)
    return {
      ok: false,
      reason: "validation",
      message: "A listing must keep at least one photo — hide the listing instead",
    };

  await db().from(table).delete().eq("id", photoId);
  await db()
    .from(TABLE[kind])
    .update({ photo_count: Math.max(0, (count ?? 1) - 1) })
    .eq("id", id);
  // If the cover went, the next photo becomes the cover rather than leaving the
  // row pointing at a deleted image.
  const { data: next } = await db()
    .from(table)
    .select("url")
    .eq(column, id)
    .order("position")
    .limit(1)
    .maybeSingle();
  await db()
    .from(TABLE[kind])
    .update({ cover_url: (next as { url: string | null } | null)?.url ?? null })
    .eq("id", id);

  return { ok: true, label: "Photo", summary: "Photo removed" };
}

export { subject as masterSubject };

/* ═════════════════════════════════════════ the project moderation dead end ═ */

/**
 * Approve / request changes / reject, FROM THE MASTER.
 *
 * A builder posts projects, not listings. `moderate()` has always supported
 * `project`, but nothing in the panel called it with that subject: A3's queue
 * view is listings-only, so a submitted project sat in `pending_review` with no
 * screen able to decide it — a builder could pay, post, and never be reviewed.
 * That is exactly the state trap CLAUDE.md's hidden-issue hunt asks about.
 *
 * The design has no project-approval surface because it predates the
 * builder-projects-only change, so this adds the three decisions to the ONE
 * place a project already appears (A12's panel, template 1712's row menu), and
 * nowhere else. A3 keeps the five sub-tabs the design draws.
 *
 * It calls the same state machine the seller app and A4 obey — there is still
 * exactly one, so the panel and the queue cannot drift.
 */
export async function moderateFromMaster(
  kind: MasterKind,
  id: string,
  me: AdminIdentity,
  action: "approve" | "request_changes" | "reject",
  reason: string | null,
  notes: Record<string, string> | null,
): Promise<MasterResult> {
  if (action === "reject" && !reason?.trim()) {
    return { ok: false, reason: "validation", message: "A reason is required to reject" };
  }
  if (action === "request_changes" && !reason?.trim() && !notes) {
    return { ok: false, reason: "validation", message: "Say what needs changing" };
  }

  const { moderate } = await import("@/lib/listings/moderation");
  // `moderate()` refuses "request changes" with nothing to change — correctly,
  // because a seller told to fix something unnamed is a dead end. A4 has a
  // per-field note composer; A12's panel does not, so the reason the admin
  // typed IS the note, attached to the posting as a whole.
  const withNotes =
    action === "request_changes" && !notes && reason?.trim()
      ? { general: reason.trim().slice(0, 300) }
      : notes;

  const res = await moderate(kind, id, me.id, {
    action,
    notes: withNotes,
    reason: reason?.trim()?.slice(0, 300) ?? null,
  });

  if (!res.ok) {
    if (res.reason === "not_found") return { ok: false, reason: "not_found" };
    if (res.reason === "locked")
      return { ok: false, reason: "bad_state", message: "Locked after three rejections — needs an appeal" };
    return { ok: false, reason: "bad_state", message: "Already decided" };
  }

  const row = await subject(kind, id);
  return {
    ok: true,
    label: (row?.[TITLE[kind]] as string) ?? (kind === "project" ? "Project" : "Listing"),
    summary:
      action === "approve"
        ? "Approved from the listings master"
        : action === "reject"
          ? `Rejected — ${reason?.trim()}`
          : "Changes requested",
    diff: { action, reason: reason?.trim() ?? null, notes },
  };
}

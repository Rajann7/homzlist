import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { invalidateRules } from "@/lib/moderation/rules";
import { toPosix } from "./regex-dialect";
import { writeAudit } from "./audit";
import { notify } from "@/lib/notifications/service";
import type { AdminIdentity } from "./guard";

/**
 * A19 — Master data. Template 2032-2180.
 *
 * Six tabs, and every one of them edits a table the PRODUCT reads:
 *
 *   Locations       → `locations` + `location_pincodes` + `location_adjacency`
 *   Amenities       → `amenities`, which the create form and the filters read
 *   Property types  → `property_types.field_config`, which decides which fields
 *                     a seller even sees
 *   Blocklist       → `blocklist_words`  ─┐ read by lib/moderation/rules.ts on
 *   Number patterns → `number_patterns`  ─┘ every submit, every chat send
 *   Area requests   → `area_requests`, and approving one CREATES the location
 *
 * That last column is the point of the whole screen: these are not admin
 * preferences, they are the site's vocabulary. Every mutation here is audited,
 * and the ones that change moderation behaviour bust the rule cache so an
 * admin sees their own change take effect on the next request rather than in a
 * minute's time.
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

/* ══════════════════════════════════════════════════ tab 1 · locations ══════ */

/**
 * The tree, ONE LEVEL AT A TIME.
 *
 * `locations` holds 163,424 rows. The design draws an expandable tree and the
 * prototype's fixture is a dozen nodes, so the naive port is "select * and
 * build the tree in the browser" — which is a 163k-row payload for a screen
 * showing eight lines. Children are fetched per node instead, which is also
 * why each node carries `child_count`: the chevron has to know whether there is
 * anything under it before anyone clicks.
 */
export async function locationChildren(parentId: string | null) {
  let q = db()
    .from("locations")
    .select("id, name, name_gu, level, parent_id, is_active, is_launched, slug")
    .order("name", { ascending: true })
    .limit(300);
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  const { data } = await q;
  const rows = (data ?? []) as {
    id: string;
    name: string;
    level: string;
    is_active: boolean;
  }[];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const { data: kids } = await db().from("locations").select("parent_id").in("parent_id", ids);
  const kidCount = new Map<string, number>();
  for (const k of (kids ?? []) as { parent_id: string }[]) {
    kidCount.set(k.parent_id, (kidCount.get(k.parent_id) ?? 0) + 1);
  }

  // The design prints "2,140 listings" against GUJARAT and "45" against Mavdi —
  // a node's count is its whole SUBTREE, not the listings pinned to that exact
  // row. Counting `area_id` only would print 0 against every state, district
  // and taluka, which is what the first pass did.
  //
  // `listings` denormalises the whole chain (state_id · district_id ·
  // taluka_id · city_id · area_id), so the rollup is one indexed equality on
  // the column matching this node's own level — no recursive CTE, and no
  // 163k-row walk.
  const COLUMN_FOR_LEVEL: Record<string, string> = {
    state: "state_id",
    district: "district_id",
    taluka: "taluka_id",
    city: "city_id",
    area: "area_id",
    landmark: "area_id",
    village: "area_id",
  };
  const listingCount = new Map<string, number>();
  const byLevel = new Map<string, string[]>();
  for (const r of rows) {
    const col = COLUMN_FOR_LEVEL[r.level] ?? "area_id";
    byLevel.set(col, [...(byLevel.get(col) ?? []), r.id]);
  }
  await Promise.all(
    [...byLevel.entries()].map(async ([col, levelIds]) => {
      const { data } = await db()
        .from("listings")
        .select(col)
        .in(col, levelIds)
        .is("deleted_at", null);
      for (const l of (data ?? []) as Record<string, string | null>[]) {
        const key = l[col];
        if (key) listingCount.set(key, (listingCount.get(key) ?? 0) + 1);
      }
    }),
  );

  return rows.map((r) => ({
    ...r,
    child_count: kidCount.get(r.id) ?? 0,
    listings_count: listingCount.get(r.id) ?? 0,
  }));
}

/** The design's "Search state, city, area…" box (template 2062). Server-side. */
export async function searchLocations(term: string) {
  const t = term.trim();
  if (t.length < 2) return [];
  const { data } = await db()
    .from("locations")
    .select("id, name, name_gu, level, parent_id, is_active")
    .or(`name.ilike.%${t.replace(/[%,]/g, "")}%,name_gu.ilike.%${t.replace(/[%,]/g, "")}%`)
    .order("level", { ascending: true })
    .limit(50);
  return data ?? [];
}

/** The right-hand detail pane (template 2069-2085). */
export async function locationDetail(id: string) {
  if (!isUuid(id)) return null;
  const { data } = await db()
    .from("locations")
    .select("id, name, name_gu, level, parent_id, is_active, is_launched, highlights, slug, rera_portal_url")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const [{ data: pins }, { data: adj }, { count: listings }, { count: reqs }] = await Promise.all([
    db().from("location_pincodes").select("pincode").eq("location_id", id).order("pincode"),
    db().from("location_adjacency").select("adjacent_id").eq("location_id", id),
    db().from("listings").select("id", { count: "exact", head: true }).eq("area_id", id).is("deleted_at", null),
    db().from("requirements").select("id", { count: "exact", head: true }).contains("area_ids", [id]),
  ]);

  const adjIds = ((adj ?? []) as { adjacent_id: string }[]).map((a) => a.adjacent_id);
  const { data: adjRows } = adjIds.length
    ? await db().from("locations").select("id, name").in("id", adjIds)
    : { data: [] };

  // "avg ₹4,800/sqft" (template 2085). Derived from live listings that actually
  // carry both a price and an area — an average over rows missing one of them
  // would be a number nobody could reproduce.
  const { data: priced } = await db()
    .from("listings")
    .select("price_paise, area_sqft")
    .eq("area_id", id)
    .eq("status", "live")
    .is("deleted_at", null)
    .not("price_paise", "is", null)
    .gt("area_sqft", 0)
    .limit(500);
  const rows = (priced ?? []) as { price_paise: number; area_sqft: number }[];
  const avgRate = rows.length
    ? Math.round(
        rows.reduce((s, r) => s + Number(r.price_paise) / 100 / Number(r.area_sqft), 0) / rows.length,
      )
    : null;

  return {
    ...data,
    pincodes: ((pins ?? []) as { pincode: string }[]).map((p) => p.pincode),
    adjacent: adjRows ?? [],
    listings_count: listings ?? 0,
    requirements_count: reqs ?? 0,
    avg_rate_per_sqft: avgRate,
  };
}

export async function saveLocation(
  id: string,
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data: before } = await db()
    .from("locations")
    .select("id, name, name_gu, level, is_active, highlights")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { ok: false, message: "Not found" };

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : null;
  if (name !== null && !name) return { ok: false, message: "Name cannot be empty" };
  // The design's own limit, stated on the field (template 2083).
  const highlights =
    typeof body.highlights === "string" ? body.highlights.trim().slice(0, 500) : undefined;
  // The reason box is not decoration: the audit row is what makes a rename of a
  // location 1,480 listings point at explicable a month later.
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  const patch: Record<string, unknown> = {};
  if (name) patch.name = name;
  if (typeof body.name_gu === "string") patch.name_gu = body.name_gu.trim().slice(0, 120) || null;
  if (typeof body.level === "string" && ["area", "landmark", "village"].includes(body.level))
    patch.level = body.level;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (highlights !== undefined) patch.highlights = highlights || null;

  if (Object.keys(patch).length) {
    const { error } = await db().from("locations").update(patch).eq("id", id);
    if (error) return { ok: false, message: error.message };
  }

  if (Array.isArray(body.pincodes)) {
    const pins = [
      ...new Set(
        body.pincodes
          .filter((p): p is string => typeof p === "string")
          .map((p) => p.trim())
          .filter((p) => /^[1-9][0-9]{5}$/.test(p)),
      ),
    ].slice(0, 20);
    await db().from("location_pincodes").delete().eq("location_id", id);
    if (pins.length)
      await db()
        .from("location_pincodes")
        .insert(pins.map((pincode) => ({ location_id: id, pincode })));
  }

  if (Array.isArray(body.adjacent)) {
    const ids = [...new Set(body.adjacent.filter(isUuid))].filter((a) => a !== id).slice(0, 20);
    await db().from("location_adjacency").delete().eq("location_id", id);
    if (ids.length) {
      // Adjacency is SYMMETRIC — the search cascade reads it from whichever
      // side it starts on, so writing one direction would make "areas near
      // Mavdi" and "areas near Raiya Road" disagree.
      await db()
        .from("location_adjacency")
        .upsert(
          ids.flatMap((adjacent_id) => [
            { location_id: id, adjacent_id },
            { location_id: adjacent_id, adjacent_id: id },
          ]),
          { onConflict: "location_id,adjacent_id" },
        );
    }
  }

  await writeAudit(me, {
    action: "master_data_edit",
    entityType: "location",
    entityId: id,
    entityLabel: name ?? before.name,
    summary: reason ? `Location updated — ${reason}` : "Location updated",
    diff: { before, after: patch, reason },
  });
  return { ok: true, label: name ?? before.name, summary: `${name ?? before.name} updated` };
}

export async function addLocation(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const parentId = isUuid(body.parent_id) ? body.parent_id : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return { ok: false, message: "Give the location a name" };
  const level = typeof body.level === "string" ? body.level : "area";

  if (parentId) {
    // A duplicate under the same parent is the failure mode that matters: two
    // "Mavdi"s under Rajkot City split every listing count on the site.
    const { data: clash } = await db()
      .from("locations")
      .select("id")
      .eq("parent_id", parentId)
      .ilike("name", name)
      .maybeSingle();
    if (clash) return { ok: false, message: `${name} already exists here` };
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const { data, error } = await db()
    .from("locations")
    .insert({
      parent_id: parentId,
      name,
      name_gu: typeof body.name_gu === "string" ? body.name_gu.trim() || null : null,
      level,
      slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      is_active: true,
    })
    .select("id, name")
    .single();
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: "master_data_add",
    entityType: "location",
    entityId: data.id,
    entityLabel: data.name,
    summary: `Location added — ${data.name}`,
    diff: { parent_id: parentId, level },
  });
  return { ok: true, label: data.name, summary: `${data.name} added`, data: { id: data.id } };
}

/* ══════════════════════════════════════════════════ tab 2 · amenities ══════ */

export async function saveAmenity(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) : "";
  if (!label) return { ok: false, message: "Give the amenity a name" };
  const code =
    typeof body.code === "string" && body.code.trim()
      ? body.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40)
      : label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  const categories = Array.isArray(body.categories)
    ? body.categories.filter((c): c is string => typeof c === "string").slice(0, 8)
    : [];

  const { data: existing } = await db().from("amenities").select("*").eq("code", code).maybeSingle();
  const patch = {
    code,
    label,
    category: typeof body.category === "string" ? body.category : (existing?.category ?? "general"),
    categories,
    icon: typeof body.icon === "string" ? body.icon : (existing?.icon ?? null),
    is_active: typeof body.is_active === "boolean" ? body.is_active : (existing?.is_active ?? true),
    sort_order: typeof body.sort_order === "number" ? body.sort_order : (existing?.sort_order ?? 100),
  };
  const { error } = await db().from("amenities").upsert(patch, { onConflict: "code" });
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: existing ? "master_data_edit" : "master_data_add",
    entityType: "amenity",
    entityId: null,
    entityLabel: label,
    summary: existing ? `Amenity updated — ${label}` : `Amenity added — ${label}`,
    diff: { before: existing ?? null, after: patch },
  });
  return { ok: true, label, summary: existing ? `${label} updated` : `${label} added` };
}

export async function toggleAmenity(
  code: string,
  active: boolean,
  me: AdminIdentity,
): Promise<ActionResult> {
  const { data } = await db().from("amenities").select("code, label").eq("code", code).maybeSingle();
  if (!data) return { ok: false, message: "Not found" };
  await db().from("amenities").update({ is_active: active }).eq("code", code);
  await writeAudit(me, {
    action: "master_data_edit",
    entityType: "amenity",
    entityLabel: data.label,
    summary: `${data.label} turned ${active ? "on" : "off"}`,
    diff: { is_active: active },
  });
  return { ok: true, label: data.label, summary: `${data.label} turned ${active ? "on" : "off"}` };
}

/**
 * "Merge into…" (template 2124). The listings carrying the old code are
 * REWRITTEN, then the old amenity goes.
 *
 * Deleting without the rewrite is the failure the design's own "Move linked
 * listings first" toast is warning about — a listing left holding a code no
 * amenity defines renders a blank chip and matches no filter.
 */
export async function mergeAmenity(
  fromCode: string,
  intoCode: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (fromCode === intoCode) return { ok: false, message: "Pick a different amenity" };
  const { data: pair } = await db().from("amenities").select("code, label").in("code", [fromCode, intoCode]);
  const rows = (pair ?? []) as { code: string; label: string }[];
  const from = rows.find((r) => r.code === fromCode);
  const into = rows.find((r) => r.code === intoCode);
  if (!from || !into) return { ok: false, message: "Not found" };

  const { data: affected } = await db()
    .from("listings")
    .select("id, amenities")
    .contains("amenities", [fromCode]);
  const list = (affected ?? []) as { id: string; amenities: string[] }[];
  for (const l of list) {
    const next = [...new Set(l.amenities.map((a) => (a === fromCode ? intoCode : a)))];
    await db().from("listings").update({ amenities: next }).eq("id", l.id);
  }
  await db().from("amenities").delete().eq("code", fromCode);

  await writeAudit(me, {
    action: "master_data_merge",
    entityType: "amenity",
    entityLabel: from.label,
    summary: `${from.label} merged into ${into.label} — ${list.length} listing(s) rewritten`,
    diff: { from: fromCode, into: intoCode, listings: list.length },
  });
  return {
    ok: true,
    label: from.label,
    summary: `${from.label} merged into ${into.label} · ${list.length} listing(s) moved`,
  };
}

export async function deleteAmenity(code: string, me: AdminIdentity): Promise<ActionResult> {
  const { data } = await db().from("amenities").select("code, label").eq("code", code).maybeSingle();
  if (!data) return { ok: false, message: "Not found" };
  const { count } = await db()
    .from("listings")
    .select("id", { count: "exact", head: true })
    .contains("amenities", [code]);
  // The design's own copy for this case.
  if ((count ?? 0) > 0) return { ok: false, message: "Move linked listings first" };
  await db().from("amenities").delete().eq("code", code);
  await writeAudit(me, {
    action: "master_data_delete",
    entityType: "amenity",
    entityLabel: data.label,
    summary: `Amenity deleted — ${data.label}`,
  });
  return { ok: true, label: data.label, summary: `${data.label} removed` };
}

/* ═════════════════════════════════════════════ tab 3 · property types ══════ */

export async function togglePropertyType(
  code: string,
  active: boolean,
  me: AdminIdentity,
): Promise<ActionResult> {
  const { data } = await db().from("property_types").select("code, label").eq("code", code).maybeSingle();
  if (!data) return { ok: false, message: "Not found" };
  await db().from("property_types").update({ is_active: active }).eq("code", code);
  await writeAudit(me, {
    action: "master_data_edit",
    entityType: "property_type",
    entityLabel: data.label,
    summary: `${data.label} turned ${active ? "on" : "off"}`,
    diff: { is_active: active },
  });
  return { ok: true, label: data.label, summary: `${data.label} turned ${active ? "on" : "off"}` };
}

export async function savePropertyType(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const code = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
  if (!code) return { ok: false, message: "Not found" };
  const { data: before } = await db().from("property_types").select("*").eq("code", code).maybeSingle();
  if (!before) return { ok: false, message: "Not found" };

  const patch: Record<string, unknown> = {};
  if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim().slice(0, 60);
  if (Array.isArray(body.roles))
    patch.roles = body.roles.filter((r): r is string => ["owner", "broker", "builder"].includes(r as string));
  if (Array.isArray(body.kinds))
    patch.kinds = body.kinds.filter((k): k is string => ["sell", "rent"].includes(k as string));
  patch.updated_at = new Date().toISOString();

  const { error } = await db().from("property_types").update(patch).eq("code", code);
  if (error) return { ok: false, message: error.message };
  await writeAudit(me, {
    action: "master_data_edit",
    entityType: "property_type",
    entityLabel: (patch.label as string) ?? before.label,
    summary: `${(patch.label as string) ?? before.label} updated`,
    diff: { before, after: patch },
  });
  return { ok: true, label: before.label, summary: `${before.label} updated` };
}

/**
 * The design's "Edit config" panel (template 2137) — the JSON field-config
 * editor Doc5 A19 asks for.
 *
 * It is validated against `field_definitions`, not just parsed: a config
 * listing a field key that does not exist produces a form with an invisible
 * required field, which is a listing nobody can submit and nobody can debug.
 */
export async function savePropertyTypeConfig(
  code: string,
  raw: unknown,
  me: AdminIdentity,
): Promise<ActionResult> {
  const { data: before } = await db()
    .from("property_types")
    .select("code, label, field_config")
    .eq("code", code)
    .maybeSingle();
  if (!before) return { ok: false, message: "Not found" };

  let config: Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      return { ok: false, message: `That is not valid JSON: ${(e as Error).message}` };
    }
  } else if (raw && typeof raw === "object") {
    config = raw as Record<string, unknown>;
  } else {
    return { ok: false, message: "Config must be a JSON object" };
  }

  const arrayKeys = ["fields", "required", "highlights", "rent_fields", "sell_fields"];
  for (const k of arrayKeys) {
    if (k in config && !Array.isArray(config[k])) return { ok: false, message: `"${k}" must be a list` };
  }

  const { data: defs } = await db().from("field_definitions").select("key");
  const known = new Set(((defs ?? []) as { key: string }[]).map((d) => d.key));
  const referenced = new Set<string>();
  for (const k of arrayKeys) {
    for (const v of (config[k] as unknown[] | undefined) ?? []) {
      if (typeof v === "string") referenced.add(v);
    }
  }
  for (const s of (config.key_specs as { field?: string }[] | undefined) ?? []) {
    if (s && typeof s.field === "string") referenced.add(s.field);
  }
  // Rent/sell-only keys live in the listing row rather than in
  // `field_definitions`, so they are allowed through by name.
  const ROW_FIELDS = new Set([
    "deposit", "available_from", "maintenance_included", "tenant_preference",
    "notice_period", "pet_allowed", "ownership_type", "loan_available",
  ]);
  const unknown = [...referenced].filter((k) => !known.has(k) && !ROW_FIELDS.has(k));
  if (unknown.length)
    return {
      ok: false,
      message: `No such field: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}`,
    };

  // A required field the form never renders is a submit nobody can complete.
  const fields = new Set(((config.fields as string[] | undefined) ?? []).map(String));
  const orphanRequired = ((config.required as string[] | undefined) ?? []).filter(
    (r) => !fields.has(r) && !ROW_FIELDS.has(r),
  );
  if (orphanRequired.length)
    return {
      ok: false,
      message: `Required but not shown: ${orphanRequired.join(", ")} — add it to "fields" first`,
    };

  const { error } = await db()
    .from("property_types")
    .update({ field_config: config, updated_at: new Date().toISOString() })
    .eq("code", code);
  if (error) return { ok: false, message: error.message };

  await writeAudit(me, {
    action: "field_config_edit",
    entityType: "property_type",
    entityLabel: before.label,
    summary: `Field config updated — ${before.label} (${fields.size} fields)`,
    diff: { before: before.field_config, after: config },
  });
  return { ok: true, label: before.label, summary: `${before.label} config saved` };
}

/** The editor needs the list of keys it is allowed to use. */
export async function fieldCatalog() {
  const [{ data: defs }, { data: groups }] = await Promise.all([
    db().from("field_definitions").select("key, label, control, group, is_active").order("sort_order"),
    db().from("field_groups").select("key, label, sort_order").order("sort_order"),
  ]);
  return { fields: defs ?? [], groups: groups ?? [] };
}

/* ═══════════════════════════════════════ tabs 4 & 5 · the content rules ════ */

export async function saveBlocklistWord(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const word = typeof body.word === "string" ? body.word.trim().slice(0, 80) : "";
  if (!word) return { ok: false, message: "Enter a word or phrase" };
  const severity = body.severity === "block" ? "block" : "flag";
  const script = typeof body.script === "string" ? body.script : "latin";
  const appliesTo = Array.isArray(body.applies_to)
    ? body.applies_to.filter((a): a is string =>
        ["listing", "requirement", "bio", "chat"].includes(a as string),
      )
    : ["listing", "requirement", "bio", "chat"];
  if (!appliesTo.length) return { ok: false, message: "Choose at least one place to apply it" };

  const id = isUuid(body.id) ? body.id : null;
  const { data: before } = id
    ? await db().from("blocklist_words").select("*").eq("id", id).maybeSingle()
    : { data: null };

  // The unique index (0106) is the real guard; checking first is what turns a
  // 23505 into the design's own message.
  const { data: clash } = await db()
    .from("blocklist_words")
    .select("id")
    .ilike("word", word)
    .maybeSingle();
  if (clash && clash.id !== id) return { ok: false, message: `"${word}" is already on the list` };

  const patch = {
    word,
    severity,
    script,
    applies_to: appliesTo,
    note: typeof body.note === "string" ? body.note.slice(0, 200) : null,
    is_active: typeof body.is_active === "boolean" ? body.is_active : true,
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await db().from("blocklist_words").update(patch).eq("id", id)
    : await db().from("blocklist_words").insert(patch);
  if (error) return { ok: false, message: error.message };

  // Without this an admin adds a word and it does nothing for up to a minute,
  // which reads exactly like the bug this whole part exists to fix.
  invalidateRules();
  await writeAudit(me, {
    action: id ? "blocklist_edit" : "blocklist_add",
    entityType: "blocklist_word",
    entityId: id,
    entityLabel: word,
    summary: id ? `Blocked word updated — ${word}` : `Blocked word added — ${word} (${severity})`,
    diff: { before, after: patch },
  });
  return { ok: true, label: word, summary: id ? `"${word}" updated` : `"${word}" added` };
}

export async function toggleBlocklistWord(
  id: string,
  active: boolean,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db().from("blocklist_words").select("id, word").eq("id", id).maybeSingle();
  if (!data) return { ok: false, message: "Not found" };
  await db().from("blocklist_words").update({ is_active: active }).eq("id", id);
  invalidateRules();
  await writeAudit(me, {
    action: "blocklist_edit",
    entityType: "blocklist_word",
    entityId: id,
    entityLabel: data.word,
    summary: `"${data.word}" turned ${active ? "on" : "off"}`,
    diff: { is_active: active },
  });
  return { ok: true, label: data.word, summary: `Word turned ${active ? "on" : "off"}` };
}

export async function deleteBlocklistWord(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db().from("blocklist_words").select("id, word").eq("id", id).maybeSingle();
  if (!data) return { ok: false, message: "Not found" };
  await db().from("blocklist_words").delete().eq("id", id);
  invalidateRules();
  await writeAudit(me, {
    action: "blocklist_delete",
    entityType: "blocklist_word",
    entityId: id,
    entityLabel: data.word,
    summary: `Blocked word removed — ${data.word}`,
  });
  return { ok: true, label: data.word, summary: "Word removed · logged" };
}

/** "Bulk import" (template 2151). One word per line; duplicates are skipped. */
export async function importBlocklist(
  text: string,
  severity: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  const words = [
    ...new Set(
      String(text ?? "")
        .split(/[\r\n,]+/)
        .map((w) => w.trim().slice(0, 80))
        .filter(Boolean),
    ),
  ].slice(0, 500);
  if (!words.length) return { ok: false, message: "Nothing to import" };

  const { data: existing } = await db().from("blocklist_words").select("word");
  const have = new Set(((existing ?? []) as { word: string }[]).map((w) => w.word.toLowerCase()));
  const fresh = words.filter((w) => !have.has(w.toLowerCase()));
  if (fresh.length) {
    await db()
      .from("blocklist_words")
      .insert(
        fresh.map((word) => ({
          word,
          severity: severity === "block" ? "block" : "flag",
          script: "latin",
          applies_to: ["listing", "requirement", "bio", "chat"],
          is_active: true,
        })),
      );
    invalidateRules();
  }
  await writeAudit(me, {
    action: "blocklist_import",
    entityType: "blocklist_word",
    entityLabel: `${fresh.length} words`,
    summary: `Bulk import — ${fresh.length} added, ${words.length - fresh.length} already present`,
    diff: { added: fresh.slice(0, 50), skipped: words.length - fresh.length },
  });
  return {
    ok: true,
    label: `${fresh.length} words`,
    summary: `${fresh.length} added · ${words.length - fresh.length} already there`,
  };
}

export async function savePattern(
  body: Record<string, unknown>,
  me: AdminIdentity,
): Promise<ActionResult> {
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
  const pattern = typeof body.pattern === "string" ? body.pattern.trim() : "";
  if (!label) return { ok: false, message: "Give the pattern a name" };
  if (!pattern) return { ok: false, message: "Enter a pattern" };

  // Both dialects have to work before the row is stored. A pattern that only
  // runs in one of them is the exact split 0096 documented.
  const dialect = toPosix(pattern);
  if (!dialect.ok) return { ok: false, message: dialect.message ?? "Pattern cannot be translated" };

  // Compile the POSIX form in POSTGRES, not in our head: `[[:space:]-]` is
  // valid, `[a-\d]` is not, and only the server knows which.
  const { error: probe } = await db().rpc("hz_probe_regex", { p_pattern: dialect.posix });
  if (probe) return { ok: false, message: `Postgres rejected the pattern: ${probe.message}` };

  const sample = typeof body.sample === "string" ? body.sample.slice(0, 200) : "";
  // The design's editor has a sample and a "Test match" button; if a sample is
  // given it must actually match, or the row is documentation of a bug.
  if (sample) {
    let re: RegExp;
    try {
      re = new RegExp(
        dialect.caseInsensitive ? pattern.replace(/^\(\?i\)/, "") : pattern,
        dialect.caseInsensitive ? "i" : "",
      );
    } catch {
      return { ok: false, message: "Pattern will not compile" };
    }
    if (!re.test(sample))
      return { ok: false, message: "The sample does not match this pattern — fix one of them" };
  }

  const id = isUuid(body.id) ? body.id : null;
  const { data: before } = id
    ? await db().from("number_patterns").select("*").eq("id", id).maybeSingle()
    : { data: null };

  const appliesTo = Array.isArray(body.applies_to)
    ? body.applies_to.filter((a): a is string =>
        ["listing", "requirement", "bio", "chat"].includes(a as string),
      )
    : ["listing", "requirement", "bio", "chat"];

  const patch = {
    label,
    pattern,
    pattern_posix: dialect.posix,
    sample: sample || null,
    // `on_match`, not `action`: the route already uses `body.action` for WHICH
    // endpoint action this is ("pattern_save"), so reading the pattern's own
    // verdict from the same key meant it was always "pattern_save" — never
    // "block" — and the Block option could not be saved at all.
    action: body.on_match === "block" ? "block" : "flag",
    applies_to: appliesTo.length ? appliesTo : ["listing", "requirement", "bio", "chat"],
    is_active: typeof body.is_active === "boolean" ? body.is_active : true,
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await db().from("number_patterns").update(patch).eq("id", id)
    : await db().from("number_patterns").insert(patch);
  if (error) return { ok: false, message: error.message };

  invalidateRules();
  await writeAudit(me, {
    action: id ? "pattern_edit" : "pattern_add",
    entityType: "number_pattern",
    entityId: id,
    entityLabel: label,
    summary: id ? `Pattern updated — ${label}` : `Pattern added — ${label}`,
    diff: { before, after: patch },
  });
  return { ok: true, label, summary: id ? `${label} updated` : `${label} added` };
}

export async function togglePattern(
  id: string,
  active: boolean,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db().from("number_patterns").select("id, label").eq("id", id).maybeSingle();
  if (!data) return { ok: false, message: "Not found" };
  await db().from("number_patterns").update({ is_active: active }).eq("id", id);
  invalidateRules();
  await writeAudit(me, {
    action: "pattern_edit",
    entityType: "number_pattern",
    entityId: id,
    entityLabel: data.label,
    summary: `Pattern turned ${active ? "on" : "off"} — ${data.label}`,
    diff: { is_active: active },
  });
  return { ok: true, label: data.label, summary: `Pattern turned ${active ? "on" : "off"}` };
}

export async function deletePattern(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db().from("number_patterns").select("id, label").eq("id", id).maybeSingle();
  if (!data) return { ok: false, message: "Not found" };
  await db().from("number_patterns").delete().eq("id", id);
  invalidateRules();
  await writeAudit(me, {
    action: "pattern_delete",
    entityType: "number_pattern",
    entityId: id,
    entityLabel: data.label,
    summary: `Pattern removed — ${data.label}`,
  });
  return { ok: true, label: data.label, summary: "Pattern removed · logged" };
}

/**
 * "Test against text" / "Test match" (templates 2151, 2158).
 *
 * Runs BOTH dialects and reports both, because the whole class of bug this
 * screen exists to prevent is the two disagreeing.
 */
export async function testRules(text: string): Promise<{
  matches: { kind: string; label: string; action: string; js: boolean; sql: boolean | null }[];
}> {
  const t = String(text ?? "").slice(0, 2000);
  const [{ data: words }, { data: patterns }] = await Promise.all([
    db().from("blocklist_words").select("id, word, severity").eq("is_active", true),
    db().from("number_patterns").select("id, label, pattern, pattern_posix, action").eq("is_active", true),
  ]);

  const matches: { kind: string; label: string; action: string; js: boolean; sql: boolean | null }[] = [];

  for (const w of (words ?? []) as { word: string; severity: string }[]) {
    const safe = w.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let hit = false;
    try {
      hit = new RegExp(`(^|[^\\p{L}\\p{N}])${safe}([^\\p{L}\\p{N}]|$)`, "iu").test(t);
    } catch {
      hit = false;
    }
    if (hit) matches.push({ kind: "word", label: w.word, action: w.severity, js: true, sql: null });
  }

  for (const p of (patterns ?? []) as {
    label: string;
    pattern: string;
    pattern_posix: string | null;
    action: string;
  }[]) {
    let js = false;
    try {
      const src = p.pattern.startsWith("(?i)") ? p.pattern.slice(4) : p.pattern;
      js = new RegExp(src, p.pattern.startsWith("(?i)") ? "i" : "").test(t);
    } catch {
      js = false;
    }
    let sql: boolean | null = null;
    if (p.pattern_posix) {
      const { data } = await db().rpc("hz_test_regex", { p_pattern: p.pattern_posix, p_text: t });
      sql = typeof data === "boolean" ? data : null;
    }
    if (js || sql) matches.push({ kind: "pattern", label: p.label, action: p.action, js, sql });
  }

  return { matches };
}

/* ══════════════════════════════════════════════ tab 6 · area requests ══════ */

/**
 * "Add to master" (template 2178) — and the toast says "4 users notified", so
 * the notification is part of the action, not a caption on it.
 *
 * Every request for the same area name in the same city is resolved together:
 * approving one and leaving three identical ones pending would put the same
 * area in the queue four times.
 */
export async function approveAreaRequest(id: string, me: AdminIdentity): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const { data } = await db()
    .from("area_requests")
    .select("id, name, city_id, status, profile_id")
    .eq("id", id)
    .maybeSingle();
  const req = data as
    | { id: string; name: string; city_id: string | null; status: string; profile_id: string }
    | null;
  if (!req) return { ok: false, message: "Not found" };
  if (req.status !== "pending") return { ok: false, message: "That request is already resolved" };

  // If the area already exists we link to it rather than creating a duplicate.
  let areaId: string | null = null;
  if (req.city_id) {
    const { data: existing } = await db()
      .from("locations")
      .select("id")
      .eq("parent_id", req.city_id)
      .ilike("name", req.name)
      .maybeSingle();
    areaId = existing?.id ?? null;
  }
  if (!areaId) {
    const created = await addLocation({ parent_id: req.city_id, name: req.name, level: "area" }, me);
    if (!created.ok) return created;
    areaId = String(created.data?.id ?? "");
  }

  const { data: siblings } = await db()
    .from("area_requests")
    .select("id, profile_id")
    .eq("status", "pending")
    .ilike("name", req.name)
    .eq("city_id", req.city_id ?? "");
  const all = (siblings ?? []) as { id: string; profile_id: string }[];
  const ids = all.length ? all.map((s) => s.id) : [req.id];
  const askers = [...new Set((all.length ? all : [req]).map((s) => s.profile_id))];

  // 'added' / 'rejected', not 'approved' / 'dismissed': that is the vocabulary
  // `area_requests_status_check` allows. Writing the wrong one was refused by
  // Postgres and — because the error was not read — the endpoint answered 200
  // over a row that never moved.
  const { error: resolveErr } = await db()
    .from("area_requests")
    .update({
      status: "added",
      resolved_by: me.id,
      resolved_at: new Date().toISOString(),
      created_area_id: areaId,
    })
    .in("id", ids);
  if (resolveErr) return { ok: false, message: resolveErr.message };

  // The design promises the askers hear about it. This is that promise's job.
  for (const p of askers) {
    await notify({
      profileId: p,
      // The event IS "an area was added" — the same one the city-launch path
      // sends. A second type for the same fact would need a second preference
      // row for users to mute, which is how notification settings rot.
      type: "area_added",
      title: `${req.name} is now on HomzList`,
      body: "The area you asked for has been added — you can post and search in it now.",
      actorId: me.id,
    }).catch(() => {});
  }

  await writeAudit(me, {
    action: "area_request_approve",
    entityType: "area_request",
    entityId: req.id,
    entityLabel: req.name,
    summary: `Area added — ${req.name} · ${askers.length} user(s) notified`,
    diff: { area_id: areaId, resolved: ids.length },
  });
  return {
    ok: true,
    label: req.name,
    summary: `Area added · ${askers.length} user${askers.length === 1 ? "" : "s"} notified`,
  };
}

export async function dismissAreaRequest(
  id: string,
  reason: string,
  me: AdminIdentity,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, message: "Not found" };
  const note = String(reason ?? "").trim().slice(0, 300);
  // The design's dismiss overlay has a reason field and the requester is told,
  // so an empty reason would send someone a refusal with no explanation.
  if (!note) return { ok: false, message: "Give a reason — the requester is told" };

  const { data } = await db()
    .from("area_requests")
    .select("id, name, status, profile_id")
    .eq("id", id)
    .maybeSingle();
  const req = data as { id: string; name: string; status: string; profile_id: string } | null;
  if (!req) return { ok: false, message: "Not found" };
  if (req.status !== "pending") return { ok: false, message: "That request is already resolved" };

  const { error: dismissErr } = await db()
    .from("area_requests")
    .update({ status: "rejected", note, resolved_by: me.id, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (dismissErr) return { ok: false, message: dismissErr.message };

  await notify({
    profileId: req.profile_id,
    type: "area_request_dismissed",
    title: `About "${req.name}"`,
    body: note,
    actorId: me.id,
  }).catch(() => {});

  await writeAudit(me, {
    action: "area_request_dismiss",
    entityType: "area_request",
    entityId: req.id,
    entityLabel: req.name,
    summary: `Area request dismissed — ${req.name}`,
    diff: { reason: note },
  });
  return { ok: true, label: req.name, summary: "Request dismissed · requester told" };
}

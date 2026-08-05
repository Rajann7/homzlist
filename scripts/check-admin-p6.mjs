/**
 * P6 — A19 Master data · A20 Content · A21 Templates & strings.
 *
 * The rule this script exists to enforce is §3: a control must WORK in the pass
 * that introduces it. A19 in particular is a screen full of toggles over tables
 * that, until 0106/0107, NOTHING READ — so most of what follows is not "does
 * the endpoint return 200" but "did turning this off actually change what the
 * detector does".
 *
 * It rebuilds every state it consumes, so it is repeatable.
 *
 *   PORT=3000 node scripts/check-admin-p6.mjs
 */
import { connect, env } from "./lib/dbx.mjs";

const PORT = process.env.PORT ?? "3000";
const API = `http://account.localhost:${PORT}/api/v1/admin`;

const sql = await connect();
const one = async (q, ...a) => (await sql.query(q, a)).rows[0];

let failures = 0;
let checks = 0;
const check = (label, got, want, extra = "") => {
  checks++;
  const okay = String(got) === String(want);
  if (!okay) failures++;
  console.log(
    `  ${okay ? "ok  " : "FAIL"} ${label.padEnd(54)} got=${String(got).padEnd(14)} want=${want} ${extra}`,
  );
};
const gte = (label, got, want) => {
  checks++;
  const okay = Number(got) >= Number(want);
  if (!okay) failures++;
  console.log(
    `  ${okay ? "ok  " : "FAIL"} ${label.padEnd(54)} got=${String(got).padEnd(14)} want>=${want}`,
  );
};
const note = (s) => console.log(`  --   ${s}`);

function jar() {
  const c = new Map();
  return {
    header: () => [...c].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb: (res) => {
      for (const s of res.headers.getSetCookie?.() ?? []) {
        const p = s.split(";")[0];
        const i = p.indexOf("=");
        c.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
      }
    },
  };
}

async function signIn(email) {
  const j = jar();
  const res = await fetch(`${API}/auth/dev`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  j.absorb(res);
  const body = await res.json();
  if (!body.ok || body.data.outcome !== "ok") throw new Error(`sign-in failed for ${email}`);
  const call = async (path, init = {}) => {
    const r = await fetch(API + path, {
      ...init,
      headers: { "content-type": "application/json", cookie: j.header(), ...(init.headers ?? {}) },
    });
    j.absorb(r);
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  call.raw = (path, init = {}) =>
    fetch(API + path, { ...init, headers: { cookie: j.header(), ...(init.headers ?? {}) } });
  return call;
}

const api = await signIn(process.env.ADMIN_DEV_EMAIL ?? env.ADMIN_DEV_EMAIL);
const since = new Date().toISOString();
const audited = async (action) =>
  Number(
    (await one(`select count(*) n from admin_audit_log where action=$1 and created_at>=$2`, action, since)).n,
  );

const md = (body) => api("/master-data", { method: "POST", body: JSON.stringify(body) });
const content = (body) => api("/content", { method: "POST", body: JSON.stringify(body) });
const tpl = (body) => api("/templates", { method: "POST", body: JSON.stringify(body) });

/* ══════════════════════════════════════ 1 · A19 · the location tree ═══════ */
console.log("\nA19 Locations — a 163k-row table, one level at a time");
{
  const roots = await api("/master-data?what=tree&parent=root");
  check("tree root → 200", roots.status, 200);
  const dbRoots = Number((await one(`select count(*) n from locations where parent_id is null`)).n);
  check("root nodes match the table", roots.json.data.nodes.length, Math.min(dbRoots, 300));
  gte("…and there is more than one", dbRoots, 1);

  const withKids = roots.json.data.nodes.find((n) => n.child_count > 0);
  check("a root reports real children", Boolean(withKids), true);
  if (withKids) {
    const kids = await api(`/master-data?what=tree&parent=${withKids.id}`);
    const dbKids = Number(
      (await one(`select count(*) n from locations where parent_id=$1`, withKids.id)).n,
    );
    check("children match the table", kids.json.data.nodes.length, Math.min(dbKids, 300));
    check("…and the parent's count agreed", withKids.child_count, dbKids);
  }

  // The design prints "2,140 listings" against a STATE. That number is the
  // whole subtree, not the listings pinned to the state row — counting
  // `area_id` alone printed 0 against every state, district and taluka.
  const gujarat = roots.json.data.nodes.find((n) => n.name === "Gujarat");
  if (gujarat) {
    const rollup = Number(
      (
        await one(
          `select count(*) n from listings where state_id=$1 and deleted_at is null`,
          gujarat.id,
        )
      ).n,
    );
    check("a state's count is its whole SUBTREE", gujarat.listings_count, rollup);
    gte("…and it is not zero", rollup, 1);
  }

  // search is SERVER-side, and refuses to answer below two characters
  const short = await api("/master-data?what=search&q=a");
  check("a 1-character search returns nothing", short.json.data.nodes.length, 0);
  const found = await api("/master-data?what=search&q=Rajkot");
  gte("search finds real rows", found.json.data.nodes.length, 1);
  const dbFound = Number(
    (await one(`select count(*) n from locations where name ilike '%Rajkot%'`)).n,
  );
  check("…and they are a subset of the table's", found.json.data.nodes.length <= dbFound, true);

  // node detail, then a real edit
  const area = await one(
    `select id, name, parent_id from locations where level='area' and parent_id is not null limit 1`,
  );
  const detail = await api(`/master-data?what=node&id=${area.id}`);
  check("node detail → 200", detail.status, 200);
  check("it is the right node", detail.json.data.name, area.name);

  const stamp = `p6-${Date.now()}`;
  const saved = await md({
    action: "location_save",
    id: area.id,
    name: area.name,
    highlights: stamp,
    pincodes: ["360004", "360005"],
    reason: "P6 check",
  });
  check("save → 200", saved.status, 200);
  const after = await one(`select highlights from locations where id=$1`, area.id);
  check("the highlight really persisted", after.highlights, stamp);
  const pins = Number(
    (await one(`select count(*) n from location_pincodes where location_id=$1`, area.id)).n,
  );
  check("both pincodes persisted", pins, 2);
  gte("audit row carries the reason", await audited("master_data_edit"), 1);
  const auditRow = await one(
    `select diff from admin_audit_log where action='master_data_edit' and entity_id=$1
      order by created_at desc limit 1`,
    area.id,
  );
  check("…and the reason is in it", auditRow?.diff?.reason, "P6 check");

  // a duplicate under one parent is what splits every listing count on the site
  const dupe = await md({
    action: "location_add",
    parent_id: area.parent_id,
    name: area.name,
  });
  check("a duplicate name under one parent is refused", dupe.status, 422);

  // …and a genuinely new child under the same parent IS accepted, so the
  // refusal above is the duplicate check and not a broken endpoint.
  const freshName = `P6 probe area ${Date.now()}`;
  const fresh = await md({ action: "location_add", parent_id: area.parent_id, name: freshName });
  check("a new child under the same parent is accepted", fresh.status, 200);
  await sql.query(`delete from locations where name=$1`, [freshName]);
}

/* ═══════════════════════════════════════════ 2 · A19 · amenities ═════════ */
console.log("\nA19 Amenities — usage is a count over listings, not a stored number");
{
  const list = await api("/list/amenities");
  check("list → 200", list.status, 200);
  const row = list.json.data.rows.find((r) => r.usage_count > 0) ?? list.json.data.rows[0];
  const real = Number(
    (
      await one(
        `select count(*) n from listings where amenities @> array[$1::text] and deleted_at is null`,
        row.code,
      )
    ).n,
  );
  check(`usage for "${row.label}" matches a second query`, row.usage_count, real);

  // toggling really writes
  const before = row.is_active;
  await md({ action: "amenity_toggle", id: row.code, active: !before });
  const flipped = await one(`select is_active from amenities where code=$1`, row.code);
  check("the toggle persisted", flipped.is_active, !before);
  await md({ action: "amenity_toggle", id: row.code, active: before });

  // and delete refuses while listings still point at it
  if (real > 0) {
    const del = await md({ action: "amenity_delete", id: row.code });
    check("an amenity in use cannot be deleted", del.status, 422);
    check("…with the design's own wording", del.json.error?.message, "Move linked listings first");
  }
}

/* ═════════════════════════════════ 3 · A19 · the rules, end to end ═══════ */
console.log("\nA19 Blocklist & patterns — the tables that had no reader until now");
{
  // Clean up anything a previous run left, so this is repeatable.
  await sql.query(`delete from blocklist_words where word = 'p6probeword'`);
  await sql.query(`delete from number_patterns where label = 'P6 probe pattern'`);

  const listW = await api("/list/blocklist?tab=en");
  check("blocklist list → 200", listW.status, 200);
  const dbW = Number((await one(`select count(*) n from blocklist_words where script='latin'`)).n);
  check("English tab count is a real count", listW.json.data.total, dbW);

  // 1. a word an admin adds is live for the DETECTOR, not just the table
  const add = await md({
    action: "word_save",
    word: "p6probeword",
    severity: "flag",
    script: "latin",
    applies_to: ["listing", "chat"],
  });
  check("add word → 200", add.status, 200);
  const wordRow = await one(`select id, is_active from blocklist_words where word='p6probeword'`);
  check("the row exists", Boolean(wordRow), true);
  gte("audit row", await audited("blocklist_add"), 1);

  let test = await md({ action: "rules_test", text: "this has p6probeword in it" });
  check(
    "the detector matches it immediately",
    test.json.data.matches.some((m) => m.label === "p6probeword"),
    true,
  );

  // 2. disabling it really stops the detector — the whole point of the screen
  await md({ action: "word_toggle", id: wordRow.id, active: false });
  test = await md({ action: "rules_test", text: "this has p6probeword in it" });
  check(
    "disabling it really stops the detector",
    test.json.data.matches.some((m) => m.label === "p6probeword"),
    false,
  );

  // 3. a duplicate spelling is refused (unique index, 0106)
  const dupe = await md({ action: "word_save", word: "P6ProbeWord", severity: "flag" });
  check("a duplicate spelling is refused", dupe.status, 422);

  await md({ action: "word_delete", id: wordRow.id });
  check(
    "delete removes it",
    Number((await one(`select count(*) n from blocklist_words where word='p6probeword'`)).n),
    0,
  );

  // ---- patterns: BOTH dialects, or it is not saved ------------------------
  const badLookahead = await md({
    action: "pattern_save",
    label: "P6 probe pattern",
    pattern: "(?=foo)bar",
  });
  check("a lookahead Postgres cannot run is refused", badLookahead.status, 422);

  const badSample = await md({
    action: "pattern_save",
    label: "P6 probe pattern",
    pattern: "\\bZZZ\\d{4}\\b",
    sample: "nothing like it",
  });
  check("a sample that does not match is refused", badSample.status, 422);

  const good = await md({
    action: "pattern_save",
    label: "P6 probe pattern",
    pattern: "\\bZZZ\\d{4}\\b",
    sample: "ZZZ1234",
    on_match: "block",
  });
  check("a pattern valid in both dialects saves", good.status, 200);
  const pat = await one(
    `select id, pattern_posix, action, is_active from number_patterns where label='P6 probe pattern'`,
  );
  check("…and it stored a POSIX translation", pat.pattern_posix, "\\yZZZ[0-9]{4}\\y");
  // the collision the typecheck caught: `action` meant two different things
  check("…and 'Block' really stored as block", pat.action, "block");

  const both = await md({ action: "rules_test", text: "code ZZZ1234 here" });
  const m = both.json.data.matches.find((x) => x.label === "P6 probe pattern");
  check("the app engine matches", m?.js, true);
  check("…and so does the SQL engine", m?.sql, true);

  // and the risk score, which is the SQL side in production
  const risky = await one(`select hz_has_number_pattern('code ZZZ1234 here') r`);
  check("hz_has_number_pattern sees the new row", risky.r, true);
  await md({ action: "pattern_toggle", id: pat.id, active: false });
  const off = await one(`select hz_has_number_pattern('code ZZZ1234 here') r`);
  check("…and stops seeing it when disabled", off.r, false);

  await md({ action: "pattern_delete", id: pat.id });
  gte("audit rows for the pattern lifecycle", await audited("pattern_delete"), 1);
}

/* ═════════════ 3b · the detector, through the REAL seller endpoint ═══════ */
console.log("\nA19 — the rules run on a real submit, and the hit is counted");
{
  // Everything above proves the ADMIN side. This proves the other half: that a
  // real user posting a real listing goes through the same rules, and that the
  // match lands in `content_flag_hits` where A19's column reads it.
  //
  // Without this the whole part could pass with a detector nothing calls —
  // which is precisely the bug P6 exists to fix, one level up.
  const seller = await one(
    `select p.id, p.phone from profiles p
      join user_plans up on up.profile_id = p.id and up.status='active' and up.listing_quota > up.listing_used
     where p.state='active' limit 1`,
  );
  if (!seller) {
    note("no active seller with listing quota — the end-to-end submit cannot run here");
  } else {
    const jarU = jar();
    const call = async (path, init = {}) => {
      const r = await fetch(`http://seller.localhost:${PORT}${path}`, {
        ...init,
        headers: { "content-type": "application/json", cookie: jarU.header(), ...(init.headers ?? {}) },
      });
      jarU.absorb(r);
      return { status: r.status, json: await r.json().catch(() => null) };
    };
    const start = await call("/api/v1/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone: seller.phone }),
    });
    const verified = start.json?.ok
      ? await call("/api/v1/auth/otp/verify", {
          method: "POST",
          body: JSON.stringify({
            otpSession: start.json.data.otpSession,
            code: start.json.data.devCode ?? "123456",
          }),
        })
      : { json: null };

    if (!verified.json?.ok) {
      note("could not sign the seller in (rate limit or dev OTP off) — skipping the live submit");
    } else {
      const hitsBefore = Number(
        (await one(`select count(*) n from content_flag_hits where entity_type='listing'`)).n,
      );
      const type = await one(`select code from property_types where is_active limit 1`);
      const posted = await call("/api/v1/listings", {
        method: "POST",
        body: JSON.stringify({
          typeCode: type.code,
          kind: "sell",
          title: "P6 probe listing",
          // The exact case A19's patterns exist for.
          description: "Serious buyers only. Call me at 9825012345 to discuss.",
          pricePaise: 5_000_000_00,
          photoCount: 5,
        }),
      });
      // A validation refusal is fine — what matters is that the SCAN ran.
      check("the submit was accepted or refused, not crashed", posted.status < 500, true);

      const hitsAfter = Number(
        (await one(`select count(*) n from content_flag_hits where entity_type='listing'`)).n,
      );
      gte("a real submit recorded a rule hit", hitsAfter - hitsBefore, 1);
      const hit = await one(
        `select rule_kind, field from content_flag_hits where entity_type='listing'
          order by created_at desc limit 1`,
      );
      check("…it was a number PATTERN", hit.rule_kind, "pattern");
      check("…and it recorded where it was caught", hit.field, "description");

      // And A19's column now reads it.
      const counted = Number(
        (await one(`select coalesce(sum(hits_30d),0) n from admin_number_pattern_list`)).n,
      );
      gte("A19's Hits (30d) column reflects it", counted, 1);

      if (posted.json?.ok) {
        // The listing was flagged rather than blocked (Doc2 §5.1 — warnings
        // never block), which is the behaviour to prove, then cleaned up.
        const created = await one(
          `select id, flagged_reason from listings where title='P6 probe listing' order by created_at desc limit 1`,
        );
        check("…the listing was FLAGGED, not blocked", created?.flagged_reason, "phone_number_in_text");
        await sql.query(`delete from listings where title='P6 probe listing'`);
      }
    }
  }
}

/* ══════════════════════════════ 4 · A19 · hits, and the field config ═════ */
console.log("\nA19 Hits (30d) and the field-config editor");
{
  const patterns = await api("/list/patterns");
  check("patterns list → 200", patterns.status, 200);
  const p = patterns.json.data.rows[0];
  const realHits = Number(
    (
      await one(
        `select count(*) n from content_flag_hits
          where rule_kind='pattern' and rule_id=$1 and created_at > now() - interval '30 days'`,
        p.id,
      )
    ).n,
  );
  check("Hits (30d) is a real count", p.hits_30d, realHits);

  const cat = await api("/master-data?what=fields");
  check("field catalogue → 200", cat.status, 200);
  const dbFields = Number((await one(`select count(*) n from field_definitions`)).n);
  check("it lists every field definition", cat.json.data.fields.length, dbFields);

  const before = await one(`select field_config from property_types where code='flat'`);
  const bad = await md({
    action: "type_config",
    id: "flat",
    config: JSON.stringify({ fields: ["not_a_real_field"] }),
  });
  check("an unknown field key is refused", bad.status, 422);
  const orphan = await md({
    action: "type_config",
    id: "flat",
    config: JSON.stringify({ fields: ["bhk"], required: ["bathrooms"] }),
  });
  check("a required field that is not shown is refused", orphan.status, 422);
  const unchanged = await one(`select field_config from property_types where code='flat'`);
  check(
    "…and neither refusal touched the stored config",
    JSON.stringify(unchanged.field_config),
    JSON.stringify(before.field_config),
  );

  const okCfg = await md({
    action: "type_config",
    id: "flat",
    config: JSON.stringify(before.field_config),
  });
  check("a valid config saves", okCfg.status, 200);
  gte("audit row", await audited("field_config_edit"), 1);
}

/* ═══════════════════════════════════════════ 5 · A19 · area requests ═════ */
console.log("\nA19 Area requests — approving one CREATES the location and tells the asker");
{
  // SEED the two pending requests this section consumes.
  //
  // The first version read whatever happened to be pending, approved one and
  // dismissed another — and then had nothing to act on next run, so eleven
  // checks silently skipped and the script still said PASS. A check that
  // quietly stops checking is worse than one that fails.
  await sql.query(`delete from area_requests where name like 'P6 probe area%'`);
  const asker = await one(`select id from profiles where state='active' limit 1`);
  const city = await one(`select id from locations where level='city' and is_launched limit 1`);
  for (const n of [1, 2]) {
    await sql.query(
      `insert into area_requests (profile_id, name, city_id, status)
       values ($1, $2, $3, 'pending')`,
      [asker.id, `P6 probe area ${n}`, city?.id ?? null],
    );
  }

  const list = await api("/list/area-requests?tab=pending");
  check("pending list → 200", list.status, 200);
  const dbPending = Number((await one(`select count(*) n from area_requests where status='pending'`)).n);
  check("pending count is real", list.json.data.total, dbPending);

  const target = list.json.data.rows.find((r) => String(r.name).startsWith("P6 probe area")) ?? list.json.data.rows[0];
  if (!target) {
    note("no pending area requests to act on — seed one to exercise this");
  } else {
    const before = Number(
      (await one(`select count(*) n from notifications where profile_id=$1`, target.profile_id)).n,
    );
    const res = await md({ action: "area_approve", id: target.id });
    check("approve → 200", res.status, 200);
    const row = await one(
      `select status, created_area_id from area_requests where id=$1`,
      target.id,
    );
    check("the request is resolved", row.status, "added");
    check("…and it points at a real location", Boolean(row.created_area_id), true);
    const loc = await one(`select name from locations where id=$1`, row.created_area_id);
    check("…which exists", Boolean(loc), true);
    const after = Number(
      (await one(`select count(*) n from notifications where profile_id=$1`, target.profile_id)).n,
    );
    gte("the asker was told", after - before, 1);
    gte("audit row", await audited("area_request_approve"), 1);

    const second = await md({ action: "area_approve", id: target.id });
    check("approving twice is refused", second.status, 422);
  }

  const anotherPending = await one(
    `select id from area_requests where status='pending' and name like 'P6 probe area%' limit 1`,
  );
  if (anotherPending) {
    const noReason = await md({ action: "area_dismiss", id: anotherPending.id, reason: "" });
    check("dismissing without a reason is refused", noReason.status, 422);
    const done = await md({
      action: "area_dismiss",
      id: anotherPending.id,
      reason: "Covered by an existing area",
    });
    check("dismiss → 200", done.status, 200);
    const r = await one(`select status, note from area_requests where id=$1`, anotherPending.id);
    check("the reason is kept on the row", r.note, "Covered by an existing area");
    check("…and the status moved", r.status, "rejected");
  }
}

/* ════════════════════════════════════════════════ 6 · A20 · content ══════ */
console.log("\nA20 Content — a publish cuts a version, and a legal page cannot vanish");
{
  const pages = await api("/list/cms-pages");
  check("pages list → 200", pages.status, 200);
  const dbPages = Number((await one(`select count(*) n from cms_pages`)).n);
  check("page count is real", pages.json.data.total, dbPages);

  // Pick a page to exercise the draft/publish/version machinery on.
  //
  // This guard used to read `kind not in ('terms','privacy','grievance',
  // 'refund')` — but `kind` holds 'legal' or 'page', never a slug, so the test
  // was always true and this check happily grabbed a real legal page,
  // republished it with a throwaway body, and never put it back. It destroyed
  // `privacy` on one run and `refund` on the next, each time leaving the live
  // site serving a 28-character legal page. (The unpublish guard further down
  // already carries the same fix, with the same comment — only half the bug
  // was caught the first time.)
  //
  // Exclude by SLUG, prefer a page that is not legally required, and — since
  // every cms_page is real content — snapshot whatever we land on and restore
  // it at the end so the check is idempotent.
  const PAGE_COLS = `id, title, version, kind, body_md, requires_reacceptance, is_published,
                     seo_title, seo_description, effective_date`;
  const page = await one(`select ${PAGE_COLS} from cms_pages where kind is distinct from 'legal' limit 1`)
    ?? await one(`select ${PAGE_COLS} from cms_pages limit 1`);
  const versionsBefore = Number(
    (await one(`select count(*) n from cms_page_versions where page_id=$1`, page.id)).n,
  );

  const draft = await content({
    action: "page_save",
    id: page.id,
    title: page.title,
    body_md: `Draft body ${Date.now()}`,
  });
  check("a draft save → 200", draft.status, 200);
  const afterDraft = await one(`select version from cms_pages where id=$1`, page.id);
  check("a draft does NOT cut a version", Number(afterDraft.version), Number(page.version));

  const pub = await content({
    action: "page_save",
    id: page.id,
    title: page.title,
    body_md: `Published body ${Date.now()}`,
    publish: true,
    requires_reacceptance: true,
    note: "P6 check",
  });
  check("a publish → 200", pub.status, 200);
  const afterPub = await one(
    `select version, requires_reacceptance from cms_pages where id=$1`,
    page.id,
  );
  check("the version went up", Number(afterPub.version), Number(page.version) + 1);
  check("re-acceptance is set", afterPub.requires_reacceptance, true);
  const versionsAfter = Number(
    (await one(`select count(*) n from cms_page_versions where page_id=$1`, page.id)).n,
  );
  check("a version row was written", versionsAfter, versionsBefore + 1);
  const v = await one(
    `select is_material, note from cms_page_versions where page_id=$1 order by version desc limit 1`,
    page.id,
  );
  check("…and it records that the change was material", v.is_material, true);
  gte("audit row", await audited("cms_publish"), 1);

  // Put the page back exactly as it was and drop the version rows this check
  // cut. Without this the check is destructive: the page keeps whatever
  // throwaway body the last run published, and `check:module12`'s "no page
  // still carries the P6 placeholder body" assertion fails from then on.
  await one(
    `update cms_pages set title=$2, body_md=$3, version=$4, requires_reacceptance=$5,
            is_published=$6, seo_title=$7, seo_description=$8, effective_date=$9, updated_at=now()
       where id=$1 returning id`,
    page.id, page.title, page.body_md, page.version, page.requires_reacceptance,
    page.is_published, page.seo_title, page.seo_description, page.effective_date,
  );
  await one(`delete from cms_page_versions where page_id=$1 and note='P6 check' returning id`, page.id);
  const restored = await one(`select version, length(body_md) as len from cms_pages where id=$1`, page.id);
  check("the check restored the version it borrowed", Number(restored.version), Number(page.version));
  check("…and the original body", Number(restored.len), (page.body_md ?? "").length, `slug-kind=${page.kind}`);

  // by SLUG — 'kind' is 'legal' for the cookie policy too, and the first
  // version of this guard tested that and therefore never fired.
  const legal = await one(`select id, slug from cms_pages where slug in ('terms','privacy','grievance','refund') limit 1`);
  if (legal) {
    const un = await content({ action: "page_unpublish", id: legal.id });
    check("a legally required page cannot be unpublished", un.status, 422);
    const stillPub = await one(`select is_published from cms_pages where id=$1`, legal.id);
    check("…and it is still published", stillPub.is_published, true);
  } else {
    note("no legally-required page in this database to test the refusal against");
  }

  // blog: a scheduled post with no date never publishes and nothing complains
  const noDate = await content({ action: "blog_save", title: "P6 probe", status: "scheduled" });
  check("a scheduled post with no date is refused", noDate.status, 422);
  const past = await content({
    action: "blog_save",
    title: "P6 probe",
    status: "scheduled",
    scheduled_at: new Date(Date.now() - 86_400_000).toISOString(),
  });
  check("a schedule in the past is refused", past.status, 422);
}

/* ═════════════════════════════════════════ 7 · A20 · the broadcast send ══ */
console.log("\nA20 Broadcasts — the column that had nothing to count");
{
  await sql.query(`delete from broadcasts where title = 'P6 probe broadcast'`);

  const empty = await content({
    action: "broadcast_save",
    title: "P6 probe broadcast",
    body: "Probe",
    channels: ["in_app"],
    audience: { role: ["not_a_role"] },
  });
  check("an empty audience is refused", empty.status, 422);

  const saved = await content({
    action: "broadcast_save",
    title: "P6 probe broadcast",
    body: "Probe body from the P6 check.",
    channels: ["in_app"],
    audience: { role: ["broker"] },
  });
  check("save → 200", saved.status, 200);
  const b = await one(
    `select id, recipient_count, status from broadcasts where title='P6 probe broadcast'`,
  );
  const realAudience = Number(
    (await one(`select count(*) n from profiles where role='broker' and state='active'`)).n,
  );
  check("the recipient count is the audience QUERY", b.recipient_count, realAudience);

  const countEndpoint = await api(
    `/content?what=audience&audience=${encodeURIComponent(JSON.stringify({ role: ["broker"] }))}`,
  );
  check("…and the compose screen's count agrees", countEndpoint.json.data.count, realAudience);

  const sent = await content({ action: "broadcast_send", id: b.id });
  check("send → 200", sent.status, 200);
  const recipients = Number(
    (await one(`select count(*) n from broadcast_recipients where broadcast_id=$1`, b.id)).n,
  );
  check("a recipient row per person", recipients, realAudience);
  const delivered = Number(
    (
      await one(
        `select count(*) n from broadcast_recipients where broadcast_id=$1 and delivered_at is not null`,
        b.id,
      )
    ).n,
  );
  gte("…and they are marked delivered", delivered, 1);
  const view = await one(`select delivered_count, delivered_pct from admin_broadcast_list where id=$1`, b.id);
  check("the screen's Delivered column matches", Number(view.delivered_count), delivered);
  gte("audit row", await audited("broadcast_send"), 1);

  const again = await content({ action: "broadcast_send", id: b.id });
  check("sending twice is refused", again.status, 422);
  const cancel = await content({ action: "broadcast_cancel", id: b.id });
  check("a sent broadcast cannot be cancelled", cancel.status, 422);

  await sql.query(`delete from broadcasts where id=$1`, [b.id]);
}

/* ═════════════════════════════════════════ 8 · A21 · templates & strings ═ */
console.log("\nA21 Templates — three languages, and a variable that must exist");
{
  const list = await api("/list/templates?tab=email");
  check("email templates → 200", list.status, 200);
  const dbEmail = Number((await one(`select count(*) n from message_templates where channel='email'`)).n);
  check("the tab count is real", list.json.data.total, dbEmail);

  const row = list.json.data.rows[0];
  const realEn = (
    await one(
      `select count(*) n from message_template_locales where template_id=$1 and lang='en' and body <> ''`,
      row.id,
    )
  ).n;
  check("the EN dot is a fact about a locale row", row.has_en, Number(realEn) > 0);

  const bad = await tpl({
    action: "template_save",
    id: row.id,
    lang: "gu",
    subject: "Test",
    body: "Hello {{user_nmae}}",
  });
  check("an unknown variable is refused", bad.status, 422);

  const good = await tpl({
    action: "template_save",
    id: row.id,
    lang: "gu",
    subject: "પરીક્ષણ",
    body: "નમસ્તે {{user_name}}",
  });
  check("a Gujarati body saves", good.status, 200);
  const gu = await one(
    `select body from message_template_locales where template_id=$1 and lang='gu'`,
    row.id,
  );
  check("…into the locale table", gu.body, "નમસ્તે {{user_name}}");
  const dots = await one(`select has_gu from admin_template_list where id=$1`, row.id);
  check("…and the GU dot lights up", dots.has_gu, true);
  gte("audit row", await audited("template_edit"), 1);

  // `otp_login`, not `auth.*` — no template code carries that prefix, so the
  // first version of this guard could never fire and OTP was one click from
  // being switched off for every user on the site.
  const otp = await one(`select id from message_templates where code = 'otp_login' limit 1`);
  if (otp) {
    const off = await tpl({ action: "template_toggle", id: otp.id, active: false });
    check("the OTP template cannot be disabled", off.status, 422);
    const still = await one(`select is_active from message_templates where id=$1`, otp.id);
    check("…and it really is still enabled", still.is_active, true);
  } else {
    note("no otp_login template in this database to test the refusal against");
  }

  // …and a template that is NOT protected really does toggle, so the refusal
  // above is the guard rather than a broken endpoint.
  const ordinary = await one(
    `select id, is_active from message_templates where code not in ('otp_login','invoice') limit 1`,
  );
  const offOk = await tpl({ action: "template_toggle", id: ordinary.id, active: !ordinary.is_active });
  check("an ordinary template does toggle", offOk.status, 200);
  const flipped = await one(`select is_active from message_templates where id=$1`, ordinary.id);
  check("…and it persisted", flipped.is_active, !ordinary.is_active);
  await tpl({ action: "template_toggle", id: ordinary.id, active: ordinary.is_active });

  // UI strings
  const strings = await api("/list/ui-strings?tab=missgu");
  check("Missing GU tab → 200", strings.status, 200);
  const realMissing = Number(
    (await one(`select count(*) n from ui_strings where gu is null or gu = ''`)).n,
  );
  check("the chip count is a real count", strings.json.data.total, realMissing);

  const key = await one(`select key, en from ui_strings limit 1`);
  const blank = await tpl({ action: "string_save", key: key.key, en: "" });
  check("English cannot be emptied", blank.status, 422);
  const savedStr = await tpl({ action: "string_save", key: key.key, gu: "P6 ગુજરાતી" });
  check("a translation saves", savedStr.status, 200);
  const back = await one(`select gu from ui_strings where key=$1`, key.key);
  check("…and reads back", back.gu, "P6 ગુજરાતી");

  const imported = await tpl({
    action: "string_import",
    csv: `key,en,gu,hi\n"${key.key}","${key.en}","P6 import",""\n"not.a.real.key","x","y","z"`,
  });
  check("import → 200", imported.status, 200);
  check("…and it reports the unknown key rather than creating it", imported.json.data.unknown.length, 1);
  check(
    "…which really was not created",
    Number((await one(`select count(*) n from ui_strings where key='not.a.real.key'`)).n),
    0,
  );
  const afterImport = await one(`select gu from ui_strings where key=$1`, key.key);
  check("the known key was updated", afterImport.gu, "P6 import");

  const csv = await api.raw("/templates?what=strings-csv");
  check("the CSV export → 200", csv.status, 200);
  const text = await csv.text();
  const lines = text.trim().split("\n");
  const total = Number((await one(`select count(*) n from ui_strings`)).n);
  check("…with a header and every row", lines.length, total + 1);
}

/* ═══════════════════════════════════════════════════════ 9 · security ════ */
console.log("\nSecurity");
{
  for (const path of ["/master-data?what=tree", "/content?what=faq-categories", "/templates?what=strings-csv", "/list/blocklist", "/list/cms-pages", "/list/templates"]) {
    const r = await fetch(API + path);
    check(`anon ${path.split("?")[0]}`, r.status, 401);
  }
  for (const [path, body] of [
    ["/master-data", { action: "word_save", word: "x" }],
    ["/content", { action: "page_unpublish", id: "00000000-0000-0000-0000-000000000000" }],
    ["/templates", { action: "string_save", key: "x" }],
  ]) {
    const r = await fetch(API + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    check(`anon POST ${path}`, r.status, 401);
  }

  const staff = await signIn(process.env.STAFF_DEV_EMAIL ?? "rohit@homzlist.com");
  for (const path of ["/master-data?what=tree", "/content?what=faq-categories", "/list/blocklist"]) {
    const r = await staff(path);
    check(`staff ${path.split("?")[0]} → 403`, r.status, 403);
  }
  const staffWrite = await staff("/master-data", {
    method: "POST",
    body: JSON.stringify({ action: "word_save", word: "staffprobe" }),
  });
  check("staff cannot write a rule", staffWrite.status, 403);
  check(
    "…and nothing was written",
    Number((await one(`select count(*) n from blocklist_words where word='staffprobe'`)).n),
    0,
  );

  const badUuid = await md({ action: "area_approve", id: "not-a-uuid" });
  check("a non-uuid → 404", badUuid.status, 404);
  const unknown = await md({
    action: "area_approve",
    id: "00000000-0000-0000-0000-000000000000",
  });
  check("an unknown uuid → 404", unknown.status, 404);
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${checks - failures}/${checks} checks green`);
await sql.end();
process.exit(failures ? 1 : 0);

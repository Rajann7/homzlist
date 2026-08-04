/**
 * Module 12 seed — Help centre, legal pages, blog, taxonomies, and enough
 * demo state that every screen and every state can actually be looked at.
 *
 *   node scripts/seed-module12.mjs            # content + taxonomy (idempotent)
 *   node scripts/seed-module12.mjs --demo     # …plus tickets / exports / states
 *
 * Idempotent by slug throughout: re-running updates rows rather than
 * duplicating them, so it is safe to run after editing the content files.
 *
 * Two clean-ups it performs deliberately, both explained where they happen:
 *   1. The legal pages on the dev database had been overwritten with
 *      "Published body <timestamp>" by scripts/check-admin-p6.mjs. Real Doc10
 *      content is restored and the junk versions are removed.
 *   2. `faqs` carried 40 placeholder rows from the Module 11 admin seed with no
 *      slug, no body and no category. They are superseded by the 52 real
 *      articles and are removed, so the admin FAQ screen and the public Help
 *      centre are looking at the same list.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { LEGAL_PAGES } from "./seed-module12/legal.mjs";
import { HELP_CATEGORIES, HELP_CHIPS, HELP_ARTICLES } from "./seed-module12/help.mjs";
import { BLOG_CATEGORIES, BLOG_POSTS } from "./seed-module12/blog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
  if (m) E[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const ref = E.SUPABASE_PROJECT_REF;
const CANDIDATES = [
  { name: "direct", host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  ...["ap-south-1", "ap-southeast-1", "us-east-1", "eu-central-1"].flatMap((r) => [
    { name: `pooler-${r}:5432`, host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
    { name: `pooler-${r}:6543`, host: `aws-0-${r}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}` },
  ]),
];

async function connect() {
  let lastErr;
  for (const c of CANDIDATES) {
    const client = new pg.Client({
      host: c.host, port: c.port, user: c.user,
      password: E.SUPABASE_DB_PASSWORD, database: "postgres",
      ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
    });
    try { await client.connect(); console.log(`connected via ${c.name}`); return client; }
    catch (err) { lastErr = err; try { await client.end(); } catch {} }
  }
  throw lastErr;
}

const DEMO = process.argv.includes("--demo");

/* The design's popular-articles list, in the design's order. */
const POPULAR_ORDER = [
  "how-does-the-999-plan-work",
  "why-is-my-listing-under-review",
  "how-do-i-get-my-number-shared",
  "why-cant-i-see-requirement-details",
  "how-do-refunds-work",
  "how-do-i-get-a-verified-badge",
];

const TICKET_CATEGORIES = [
  { slug: "payment_refund",        label: "Payment or refund",        icon: "card",            sort: 1, pay: true },
  { slug: "listing_not_approved",  label: "Listing not approved",     icon: "bldg",            sort: 2 },
  { slug: "number_recovery",       label: "Lost access to my number", icon: "phone",           sort: 3, alt: true },
  { slug: "report",                label: "Report a user or listing", icon: "alert",           sort: 4, link: true },
  { slug: "verification",          label: "Verification issue",       icon: "verified",        sort: 5 },
  { slug: "bug",                   label: "Bug or technical problem", icon: "wrench",          sort: 6 },
  { slug: "other",                 label: "Something else",           icon: "more-horizontal", sort: 7 },
  // Reached only from the Grievance Officer page — see migration 0114.
  { slug: "grievance",             label: "Grievance complaint",      icon: "shield",          sort: 8, grievance: true, picker: false, link: true },
];

async function main() {
  const db = await connect();
  const q = (sql, params) => db.query(sql, params);
  const say = (s) => console.log(`  ${s}`);

  /* ═════════════════════════════════════════════ 1 · legal / CMS pages ═══ */
  console.log("\nLEGAL / CMS");

  // The P6 check script republishes each page with a throwaway body to prove the
  // version machinery works, and never cleans up. Those rows are why the live
  // legal pages read "Published body 1785656601391". Remove them first.
  const junk = await q(`delete from cms_page_versions where note = 'P6 check' returning id`);
  if (junk.rowCount) say(`removed ${junk.rowCount} throwaway 'P6 check' version(s)`);

  for (const p of LEGAL_PAGES) {
    const { rows } = await q(
      `insert into cms_pages
         (slug, title, body_md, version, is_published, requires_reacceptance,
          seo_title, seo_description, kind, icon, sort_order, effective_date,
          reader, published_at, updated_at)
       values ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,$11,$12, now(), now())
       on conflict (slug) do update set
         title = excluded.title, body_md = excluded.body_md,
         version = excluded.version, is_published = true,
         requires_reacceptance = excluded.requires_reacceptance,
         seo_title = excluded.seo_title, seo_description = excluded.seo_description,
         kind = excluded.kind, icon = excluded.icon, sort_order = excluded.sort_order,
         effective_date = excluded.effective_date, reader = excluded.reader,
         updated_at = now()
       returning id`,
      [p.slug, p.title, p.body_md, p.version, p.requires_reacceptance,
       p.seo_title, p.seo_description, p.kind, p.icon, p.sort_order, p.effective_date, p.reader],
    );
    const pageId = rows[0].id;

    // The current version must exist as a version row too — that is what "View
    // previous versions" reads, and what an old-version reader renders.
    await q(
      `insert into cms_page_versions (page_id, version, title, body_md, note, effective_date, is_material)
       select $1,$2,$3,$4,$5,$6,$7
       where not exists (select 1 from cms_page_versions where page_id = $1 and version = $2)`,
      [pageId, p.version, p.title, p.body_md, "Published version — Doc10 content.", p.effective_date, p.requires_reacceptance],
    );
  }
  say(`${LEGAL_PAGES.length} legal/CMS pages published from Doc10`);

  /* ═══════════════════════════════════════════════════ 2 · help centre ═══ */
  console.log("\nHELP CENTRE");

  for (const c of HELP_CATEGORIES) {
    await q(
      `insert into help_categories (slug, title, icon, search_terms, sort_order, is_active, updated_at)
       values ($1,$2,$3,$4,$5,true, now())
       on conflict (slug) do update set
         title = excluded.title, icon = excluded.icon,
         search_terms = excluded.search_terms, sort_order = excluded.sort_order,
         is_active = true, updated_at = now()`,
      [c.slug, c.title, c.icon, c.search_terms, c.sort_order],
    );
  }
  say(`${HELP_CATEGORIES.length} categories`);

  await q(`delete from help_chips`);
  for (const c of HELP_CHIPS) {
    await q(`insert into help_chips (label, query, sort_order, is_active) values ($1,$2,$3,true)`,
      [c.label, c.query, c.sort_order]);
  }
  say(`${HELP_CHIPS.length} search chips`);

  // The Module 11 admin seed left 40 placeholder FAQs with no slug, no body and
  // no category. They cannot render in the Help centre and they make the admin
  // FAQ list disagree with the public one. The 52 real articles replace them.
  const stale = await q(`delete from faqs where slug is null returning id`);
  if (stale.rowCount) say(`removed ${stale.rowCount} placeholder FAQ row(s) from the Module 11 seed`);

  const catIds = new Map(
    (await q(`select slug, id from help_categories`)).rows.map((r) => [r.slug, r.id]),
  );

  let order = 0;
  for (const art of HELP_ARTICLES) {
    const popIdx = POPULAR_ORDER.indexOf(art.slug);
    await q(
      `insert into faqs
         (category, category_id, slug, question, answer, body_md, search_terms,
          related_slugs, read_minutes, is_popular, sort_order, is_active, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true, now())
       on conflict (slug) do update set
         category = excluded.category, category_id = excluded.category_id,
         question = excluded.question, answer = excluded.answer,
         body_md = excluded.body_md, search_terms = excluded.search_terms,
         related_slugs = excluded.related_slugs, read_minutes = excluded.read_minutes,
         is_popular = excluded.is_popular, sort_order = excluded.sort_order,
         is_active = true, updated_at = now()`,
      [art.category, catIds.get(art.category), art.slug, art.question, art.answer,
       art.body_md, art.search, art.related, art.minutes, popIdx >= 0,
       popIdx >= 0 ? popIdx : ++order],
    );
  }
  say(`${HELP_ARTICLES.length} articles (${POPULAR_ORDER.length} marked popular)`);

  // Anything still orphaned cannot be reached.
  //
  // The same out-of-band P6 setup left 27 more draft articles with slugs and a
  // category NAME but no category_id — so they were invisible on the Help
  // centre (every query joins through the category) while still filling the
  // admin FAQ list, which is the "admin and public disagree" problem again.
  // They also duplicate the authored set (`block-a-user` vs `block-someone`,
  // `no-replies` vs `no-reply-from-owner`, …).
  //
  // The rule is deliberately narrow: only rows with NO category are removed. An
  // article an admin writes in the CMS has one, and is never touched by this.
  const orphans = await q(`delete from faqs where category_id is null returning slug`);
  if (orphans.rowCount) say(`removed ${orphans.rowCount} unreachable article(s) with no category`);

  /* ══════════════════════════════════════════════════════════ 3 · blog ═══ */
  console.log("\nBLOG");

  for (const c of BLOG_CATEGORIES) {
    await q(
      `insert into blog_categories (slug, label, sort_order, is_active)
       values ($1,$2,$3,true)
       on conflict (slug) do update set label = excluded.label, sort_order = excluded.sort_order, is_active = true`,
      [c.slug, c.label, c.sort_order],
    );
  }
  say(`${BLOG_CATEGORIES.length} categories`);

  // Only one post may be the hero card.
  await q(`update blog_posts set is_featured = false`);
  for (const p of BLOG_POSTS) {
    await q(
      `insert into blog_posts
         (slug, title, excerpt, body_md, category, tags, status, seo_title,
          seo_description, read_minutes, author_name, badge, is_featured,
          published_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,'published',$7,$8,$9,$10,$11,$12,$13, now())
       on conflict (slug) do update set
         title = excluded.title, excerpt = excluded.excerpt, body_md = excluded.body_md,
         category = excluded.category, tags = excluded.tags, status = 'published',
         seo_title = excluded.seo_title, seo_description = excluded.seo_description,
         read_minutes = excluded.read_minutes, author_name = excluded.author_name,
         badge = excluded.badge, is_featured = excluded.is_featured,
         published_at = excluded.published_at, updated_at = now()`,
      [p.slug, p.title, p.excerpt, p.body_md, p.category, p.tags ?? [], p.seo_title,
       p.seo_description, p.read_minutes, "HomzList Team", p.badge,
       Boolean(p.is_featured), p.published_at],
    );
  }
  const words = BLOG_POSTS.reduce((n, p) => n + p.body_md.split(/\s+/).length, 0);
  say(`${BLOG_POSTS.length} posts · ~${words.toLocaleString("en-IN")} words`);

  /* ═════════════════════════════════════════════ 4 · ticket taxonomy ═══ */
  console.log("\nSUPPORT");
  for (const c of TICKET_CATEGORIES) {
    await q(
      `insert into ticket_categories
         (slug, label, icon, needs_payment_ref, needs_alt_contact, needs_report_link,
          is_grievance, sort_order, is_active, show_in_picker)
       values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)
       on conflict (slug) do update set
         label = excluded.label, icon = excluded.icon,
         needs_payment_ref = excluded.needs_payment_ref,
         needs_alt_contact = excluded.needs_alt_contact,
         needs_report_link = excluded.needs_report_link,
         is_grievance = excluded.is_grievance, sort_order = excluded.sort_order,
         is_active = true, show_in_picker = excluded.show_in_picker`,
      [c.slug, c.label, c.icon, Boolean(c.pay), Boolean(c.alt), Boolean(c.link),
       Boolean(c.grievance), c.sort, c.picker !== false],
    );
  }
  // Existing tickets were seeded before the taxonomy existed; link them up so
  // the ticket list can print a category chip instead of a raw slug.
  await q(`update support_tickets t set category_id = c.id
             from ticket_categories c where c.slug = t.category and t.category_id is null`);
  say(`${TICKET_CATEGORIES.length} ticket categories (7 in the picker + grievance)`);

  if (DEMO) await seedDemo(q, say);

  await db.end();
  console.log("\nseed complete\n");
}

/* ═══════════════════════════════════════════════ demo state (--demo) ═══ */
async function seedDemo(q, say) {
  console.log("\nDEMO STATE");

  // A real user to hang the demo state on: the most recently active registered
  // profile, so the states are visible on an account that can actually log in.
  const { rows: who } = await q(
    `select id, name, phone from profiles
      where is_registered and state = 'active'
      order by last_active_at desc nulls last limit 4`,
  );
  if (!who.length) { say("no registered profiles — skipped"); return; }

  const cats = new Map((await q(`select slug, id from ticket_categories`)).rows.map((r) => [r.slug, r.id]));

  // One ticket per status the schema allows, so no state has zero rows.
  const specs = [
    { who: 0, cat: "payment_refund", status: "open",
      subject: "Payment deducted but plan not activated",
      payment_ref: "pay_RQ8k21LmVn3xYz",
      msgs: [["user", "Hi, I paid ₹999 at 2:31 PM today from UPI but my plan still shows inactive. Payment ID pay_RQ8k21LmVn3xYz."],
             ["user", "Screenshot of the payment attached."],
             ["staff", "Thanks for the details — we can see the payment. We've flagged this with our payments team. If the plan doesn't activate in the next hour, we'll refund it automatically. — Kinjal"]] },
    { who: 1, cat: "bug", status: "replied",
      subject: "Listing photos look blurry after upload",
      msgs: [["user", "I uploaded 10 photos from my phone and they all look soft in the feed."],
             ["staff", "Can you share the original photo so we can check the upload pipeline? — Devang"],
             ["user", "Sent one just now."],
             ["staff", "Got it, reproducing on our side."],
             ["staff", "Fixed — the resize step was running twice on portrait images. Re-upload and it should be sharp."]] },
    { who: 2, cat: "other", status: "closed",
      subject: "Change my registered number",
      msgs: [["user", "I've moved to a new number and want the account moved."],
             ["staff", "We'll verify both numbers by OTP. Sending one to the old number now."],
             ["user", "Verified."],
             ["staff", "Done! Your number ending 4482 is now active. Closing this — reopen any time."]] },
    { who: 0, cat: "grievance", status: "open",
      subject: "Listing using my property photos without permission",
      report_link: "https://homzlist.com/property/duplicate-listing",
      grievance: true,
      msgs: [["user", "Someone has copied my listing photos onto their own listing. Link attached."],
             ["staff", "Acknowledged. Ticket registered under the IT Rules 2021 grievance mechanism — we'll revert within 15 days. — Grievance desk"]] },
    { who: 3, cat: "verification", status: "closed",
      subject: "ID verification rejected twice",
      msgs: [["user", "My Aadhaar upload keeps getting rejected."],
             ["staff", "The name on the ID reads differently from your profile name. Update the profile name first, then resubmit."],
             ["user", "Updated and resubmitted."],
             ["staff", "Approved. Badge is live on your profile."]] },
  ];

  for (const s of specs) {
    const p = who[s.who % who.length];
    const num = `TKT-${2800 + specs.indexOf(s) * 7}`;
    const created = new Date(Date.now() - (specs.indexOf(s) + 1) * 26 * 3600_000);
    const { rows } = await q(
      `insert into support_tickets
         (number, profile_id, subject, category, category_id, status, is_grievance,
          payment_ref, report_link, acked_at, sla_due_at, closed_at, resolved_at,
          last_activity_at, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$13)
       on conflict (number) do update set status = excluded.status
       returning id`,
      [num, p.id, s.subject, s.cat, cats.get(s.cat), s.status, Boolean(s.grievance),
       s.payment_ref ?? null, s.report_link ?? null,
       created.toISOString(),
       new Date(created.getTime() + (s.grievance ? 15 * 24 : 24) * 3600_000).toISOString(),
       s.status === "closed" ? new Date(created.getTime() + 20 * 3600_000).toISOString() : null,
       created.toISOString()],
    );
    const tid = rows[0].id;
    await q(`delete from ticket_messages where ticket_id = $1`, [tid]);
    let t = created.getTime();
    for (const [kind, body] of s.msgs) {
      t += 40 * 60_000;
      await q(
        `insert into ticket_messages (ticket_id, author_kind, author_id, author_name, body, created_at)
         values ($1,$2,$3,$4,$5,$6)`,
        [tid, kind, kind === "user" ? p.id : null,
         kind === "user" ? (p.name ?? "You") : "HomzList Support", body, new Date(t).toISOString()],
      );
    }
    await q(`update support_tickets set last_activity_at = $2 where id = $1`, [tid, new Date(t).toISOString()]);
  }
  say(`${specs.length} demo tickets across open / replied / closed (+ a grievance)`);

  // Data-export states: one expired, one ready, so both halves of S5 render.
  const p0 = who[0];
  await q(`delete from data_export_requests where profile_id = $1`, [p0.id]);
  await q(
    `insert into data_export_requests (profile_id, format, status, requested_at, ready_at, expires_at, file_key, size_bytes)
     values ($1,'json','expired', now() - interval '32 days', now() - interval '32 days', now() - interval '30 days', 'demo/expired.zip', 3980000),
            ($1,'csv','expired',  now() - interval '9 days',  now() - interval '9 days',  now() - interval '7 days',  'demo/expired2.zip', 2410000)`,
    [p0.id],
  );
  say("2 previous (expired) export requests on the newest active account");

  await q(
    `insert into account_events (profile_id, kind, reason, meta)
     values ($1,'deactivate','Found a property', '{"seed":true}'::jsonb)
     on conflict do nothing`,
    [who[who.length - 1].id],
  );
  say("1 account event");
}

main().catch((e) => { console.error(e); process.exit(1); });

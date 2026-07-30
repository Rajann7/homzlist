/**
 * Module 12 seed — help centre, legal/CMS, blog, support tickets, data exports.
 *
 * Everything designs/P12 renders comes from these rows: the 8 category cards and
 * their article counts, the 6 popular articles, the 8 legal documents (Doc10)
 * with their version history, the blog list + post, and a support queue that has
 * a ticket in every tab the design shows (open / replied / closed).
 *
 *   node scripts/seed-module12.mjs          # reset + seed (idempotent)
 *   node scripts/seed-module12.mjs --keep   # leave existing rows alone
 *
 * Only rows this script owns are cleared on a reset: CMS pages by slug, faqs
 * that carry a slug, blog posts by slug, and tickets/exports it recorded in
 * seed_ledger. Hand-made and other-module rows are never touched.
 */
import { connect } from "./lib/dbx.mjs";
import { LEGAL_PAGES, LEGAL_HISTORY } from "./seed-module12/legal.mjs";
import { CATEGORIES, ARTICLES } from "./seed-module12/help.mjs";
import { BLOG_CATEGORIES, BLOG_POSTS } from "./seed-module12/blog.mjs";

const BATCH = "module12";
const keep = process.argv.includes("--keep");
const sql = await connect();

const remember = (table, id) =>
  sql.query(
    `insert into seed_ledger (batch, table_name, row_id) values ($1,$2,$3)
     on conflict do nothing`,
    [BATCH, table, String(id)],
  );

// ------------------------------------------------------------------- reset
if (!keep) {
  const owned = await sql.query(`select table_name, row_id from seed_ledger where batch = $1`, [BATCH]);
  const byTable = new Map();
  for (const r of owned.rows) byTable.set(r.table_name, [...(byTable.get(r.table_name) ?? []), r.row_id]);
  // children first
  for (const t of ["ticket_messages", "help_feedback", "ticket_attachments", "cms_page_versions",
                   "support_tickets", "data_export_requests", "faqs", "blog_posts", "cms_pages",
                   "help_categories", "blog_categories"]) {
    const ids = byTable.get(t);
    if (!ids?.length) continue;
    const col = t === "blog_categories" ? "slug" : "id";
    const cast = t === "blog_categories" ? "text[]" : "uuid[]";
    const r = await sql.query(`delete from ${t} where ${col} = any($1::${cast})`, [ids]);
    if (r.rowCount) console.log(`reset: ${t} −${r.rowCount}`);
  }
  await sql.query(`delete from seed_ledger where batch = $1`, [BATCH]);
}

// ------------------------------------------------------------ legal settings
// Doc10's placeholders, filled with the values we can state truthfully today.
// The advocate review before launch replaces entity_name / reg_no / officer.
await sql.query(
  `update legal_settings set
     entity_name = $1, entity_type = $2, registered_address = $3, reg_no = $4,
     support_email = $5, grievance_name = $6, grievance_email = $7,
     grievance_phone = $8, grievance_hours = $9, updated_at = now()
   where id = true`,
  [
    "HomzList", "proprietorship", "HomzList, Rajkot, Gujarat 360001", "[CIN/LLPIN/REG NO]",
    "support@homzlist.com", "[Officer Name]", "grievance@homzlist.com",
    "", "Mon–Fri, 10:00–18:00 IST",
  ],
);

// -------------------------------------------------------------- legal / CMS
const pageIdBySlug = new Map();
for (const p of LEGAL_PAGES) {
  const { rows } = await sql.query(
    `insert into cms_pages
       (slug, title, body_md, version, kind, icon, sort_order, effective_date,
        reader, is_published, seo_title, seo_description, published_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,true,$10,$11,$8::date,now())
     on conflict (slug) do update set
       title = excluded.title, body_md = excluded.body_md, version = excluded.version,
       kind = excluded.kind, icon = excluded.icon, sort_order = excluded.sort_order,
       effective_date = excluded.effective_date, reader = excluded.reader,
       seo_title = excluded.seo_title, seo_description = excluded.seo_description,
       is_published = true, published_at = excluded.published_at, updated_at = now()
     returning id`,
    [p.slug, p.title, p.body_md, p.version, p.kind ?? "legal", p.icon, p.sort_order,
     p.effective_date, p.reader ?? "longform", p.seo_title, p.seo_description],
  );
  pageIdBySlug.set(p.slug, rows[0].id);
  await remember("cms_pages", rows[0].id);
}

for (const h of LEGAL_HISTORY) {
  const pageId = pageIdBySlug.get(h.slug);
  const page = LEGAL_PAGES.find((p) => p.slug === h.slug);
  const { rows } = await sql.query(
    `insert into cms_page_versions (page_id, version, title, body_md, note, effective_date, is_material, created_at)
     values ($1,$2,$3,$4,$5,$6::date,$7,$6::date) returning id`,
    [pageId, h.version, page.title, page.body_md, h.note, h.effective_date, h.is_material],
  );
  await remember("cms_page_versions", rows[0].id);
}
// The live version is also a version row, so history is complete.
for (const p of LEGAL_PAGES) {
  const { rows } = await sql.query(
    `insert into cms_page_versions (page_id, version, title, body_md, note, effective_date, is_material, created_at)
     values ($1,$2,$3,$4,$5,$6::date,$7,$6::date) returning id`,
    [pageIdBySlug.get(p.slug), p.version, p.title, p.body_md, "Current published version.",
     p.effective_date, true],
  );
  await remember("cms_page_versions", rows[0].id);
}
console.log(`legal: ${LEGAL_PAGES.length} pages, ${LEGAL_HISTORY.length + LEGAL_PAGES.length} versions`);

// --------------------------------------------------------------- help centre
const catIdBySlug = new Map();
for (const c of CATEGORIES) {
  const { rows } = await sql.query(
    `insert into help_categories (slug, title, icon, search_terms, sort_order, is_active)
     values ($1,$2,$3,$4,$5,true)
     on conflict (slug) do update set
       title = excluded.title, icon = excluded.icon, search_terms = excluded.search_terms,
       sort_order = excluded.sort_order, is_active = true
     returning id`,
    [c.slug, c.title, c.icon, c.search_terms, c.sort_order],
  );
  catIdBySlug.set(c.slug, rows[0].id);
  await remember("help_categories", rows[0].id);
}

// Related articles: P12 pairs the ₹999 reader with refunds + under-review.
const RELATED = {
  "how-does-the-999-plan-work": ["how-do-refunds-work", "why-is-my-listing-under-review"],
  "why-is-my-listing-under-review": ["rejected-listing", "how-many-photos"],
  "how-do-i-get-my-number-shared": ["who-can-see-my-number", "someone-messaged-me"],
  "why-cant-i-see-requirement-details": ["post-a-requirement", "how-does-the-999-plan-work"],
  "how-do-refunds-work": ["after-i-pay", "payment-failed"],
  "how-do-i-get-a-verified-badge": ["what-badge-means", "how-long-verification"],
};

let nArticles = 0;
for (const [catSlug, list] of Object.entries(ARTICLES)) {
  const categoryId = catIdBySlug.get(catSlug);
  let i = 0;
  for (const a of list) {
    i += 1;
    const { rows } = await sql.query(
      `insert into faqs
         (category, category_id, slug, question, answer, body_md, read_minutes,
          is_popular, search_terms, related_slugs, sort_order, is_active, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,now())
       on conflict (slug) where slug is not null do update set
         category = excluded.category, category_id = excluded.category_id,
         question = excluded.question, answer = excluded.answer, body_md = excluded.body_md,
         read_minutes = excluded.read_minutes, is_popular = excluded.is_popular,
         search_terms = excluded.search_terms, related_slugs = excluded.related_slugs,
         sort_order = excluded.sort_order, is_active = true, updated_at = now()
       returning id`,
      [catSlug, categoryId, a.slug, a.question, a.answer, a.body,
       a.read_minutes ?? Math.max(2, Math.round(a.body.split(/\s+/).length / 200)),
       a.is_popular ?? false, `${a.search_terms ?? ""} ${a.question}`.trim().toLowerCase(),
       RELATED[a.slug] ?? [], a.sort_order ?? i],
    );
    await remember("faqs", rows[0].id);
    nArticles += 1;
  }
}
console.log(`help: ${CATEGORIES.length} categories, ${nArticles} articles`);

// ---------------------------------------------------------------------- blog
for (const c of BLOG_CATEGORIES) {
  await sql.query(
    `insert into blog_categories (slug, title, sort_order, is_active) values ($1,$2,$3,true)
     on conflict (slug) do update set title = excluded.title, sort_order = excluded.sort_order, is_active = true`,
    [c.slug, c.title, c.sort_order],
  );
  await remember("blog_categories", c.slug);
}
for (const p of BLOG_POSTS) {
  const { rows } = await sql.query(
    `insert into blog_posts
       (slug, title, excerpt, body_md, category, badge, tags, status, is_featured,
        seo_title, seo_description, read_minutes, author_name, published_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,'published',$8,$9,$10,$11,'HomzList Team',$12,now())
     on conflict (slug) do update set
       title = excluded.title, excerpt = excluded.excerpt, body_md = excluded.body_md,
       category = excluded.category, badge = excluded.badge, tags = excluded.tags,
       status = 'published', is_featured = excluded.is_featured,
       seo_title = excluded.seo_title, seo_description = excluded.seo_description,
       read_minutes = excluded.read_minutes, published_at = excluded.published_at, updated_at = now()
     returning id`,
    [p.slug, p.title, p.excerpt, p.body_md, p.category, p.badge, p.tags ?? [],
     p.is_featured ?? false, p.seo_title, p.seo_description, p.read_minutes, p.published_at],
  );
  await remember("blog_posts", rows[0].id);
}
console.log(`blog: ${BLOG_CATEGORIES.length} categories, ${BLOG_POSTS.length} posts`);

// ----------------------------------------------------- support tickets (S2)
// One real owner gets the queue P12 draws: 1 open, 1 replied, 3 closed.
const { rows: users } = await sql.query(
  `select id, name, role from profiles
   where state = 'active' and is_registered and role is not null
   order by role, created_at limit 40`,
);
const pick = (role) => users.find((u) => u.role === role);
const owner = pick("owner"), broker = pick("broker"), builder = pick("builder");
if (!owner) throw new Error("no active owner to attach support tickets to");

const TICKETS = [
  {
    who: owner, status: "open", category: "payment_refund",
    subject: "Payment deducted but plan not activated", payment_ref: "PAY-88213",
    hours: 2, priority: "high",
    msgs: [
      ["system", "Ticket acknowledged automatically", -50],
      ["user", "Hi, I paid ₹999 at 2:31 PM today from UPI but my plan still shows inactive. Payment ID PAY-88213.", -49],
      ["user", "Screenshot of the payment attached.", -48],
      ["staff", "Thanks for the details — we can see the payment (PAY-88213). We've flagged this with our payments team. If the plan doesn't activate in the next hour, we'll refund it automatically. — Kinjal", -2],
    ],
  },
  {
    who: owner, status: "replied", category: "bug",
    subject: "Listing photos look blurry after upload", hours: 26,
    msgs: [
      ["system", "Ticket acknowledged automatically", -74],
      ["user", "I uploaded 8 photos from my phone and they all look soft on the listing page. On my gallery they're sharp.", -73],
      ["staff", "Thanks for reporting. Which phone are you on, and roughly what size are the original files?", -60],
      ["user", "Redmi Note 12. The files are around 4 MB each.", -50],
      ["staff", "Can you share the original photo so we can check the upload pipeline? You can attach it here.", -26],
    ],
  },
  {
    who: owner, status: "closed", category: "number_recovery",
    subject: "Change my registered number", alt_contact: "kinjal.alt@example.com", days: 26,
    resolution: "Number updated after ownership verification.",
    msgs: [
      ["system", "Ticket acknowledged automatically", -700],
      ["user", "I've lost the SIM for the number on my account. Can you move it to my new number?", -699],
      ["staff", "We can, after verifying ownership. Can you confirm your last payment amount and the area of your live listing?", -690],
      ["user", "₹999 on 3 Nov, listing is in Mavdi.", -688],
      ["staff", "Verified. Sending an OTP to the new number now.", -680],
      ["staff", "Done! Your number ending 4482 is now active. Closing this — reopen any time if something looks off.", -672],
    ],
  },
  {
    who: broker ?? owner, status: "closed", category: "bug",
    subject: "Boost not showing on top in Mavdi", days: 33,
    resolution: "Cache invalidation bug; 1 boost day credited back.",
    msgs: [
      ["system", "Ticket acknowledged automatically", -800],
      ["user", "I bought a 7-day area boost for Mavdi yesterday and my listing is still showing in the normal position.", -799],
      ["staff", "Checking — we can see the boost is active on our side, so this looks like a caching issue on the feed.", -790],
      ["staff", "This was a caching issue — fixed now. Refund of 1 boost day has been credited to your boost balance.", -784],
    ],
  },
  {
    who: builder ?? owner, status: "closed", category: "payment_refund",
    subject: "Invoice shows wrong name", payment_ref: "PAY-87004", days: 46,
    resolution: "Corrected invoice re-issued with the registered business name.",
    msgs: [
      ["system", "Ticket acknowledged automatically", -1110],
      ["user", "The GST invoice for my last payment has my personal name, not my firm's. I need it corrected for accounting.", -1109],
      ["staff", "Corrected invoice attached. Sorry for the mix-up!", -1100],
    ],
  },
];

for (const t of TICKETS) {
  // Number comes from the same sequence the API uses, so seeded and real
  // tickets share one numbering space and can never collide.
  const { rows: seq } = await sql.query(`select 'TKT-' || nextval('support_ticket_seq') as number`);
  const number = seq[0].number;
  const last = t.hours != null ? `${t.hours} hours` : `${t.days} days`;
  const { rows } = await sql.query(
    `insert into support_tickets
       (number, profile_id, subject, category, priority, status, payment_ref, alt_contact,
        is_grievance, acked_at, sla_due_at, resolution, closed_at, last_activity_at, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,false,
             now() - interval '${last}', now() - interval '${last}' + interval '24 hours',
             $9, case when $6 = 'closed' then now() - interval '${last}' end,
             now() - interval '${last}', now() - interval '${last}')
     returning id, number`,
    [number, t.who.id, t.subject, t.category, t.priority ?? "normal", t.status,
     t.payment_ref ?? null, t.alt_contact ?? null, t.resolution ?? null],
  );
  const ticketId = rows[0].id;
  await remember("support_tickets", ticketId);
  for (const [kind, body, hoursAgo] of t.msgs) {
    const { rows: m } = await sql.query(
      `insert into ticket_messages (ticket_id, author_kind, author_id, author_name, body, created_at)
       values ($1,$2,$3,$4,$5, now() - interval '${Math.abs(hoursAgo)} hours') returning id`,
      [ticketId, kind, kind === "user" ? t.who.id : null,
       kind === "user" ? (t.who.name ?? "You") : kind === "staff" ? "HomzList Support" : "System", body],
    );
    await remember("ticket_messages", m[0].id);
  }
}
console.log(`support: ${TICKETS.length} tickets seeded`);

// -------------------------------------------------- data export history (S5)
// Two expired requests, so "Previous requests" is populated on first visit.
for (const d of [5, 60]) {
  const { rows } = await sql.query(
    `insert into data_export_requests
       (profile_id, format, status, filename, bytes, row_counts, ready_at, expires_at, created_at)
     values ($1,'json','expired',$2,0,'{}'::jsonb,
             now() - interval '${d} days', now() - interval '${d - 2} days', now() - interval '${d} days')
     returning id`,
    [owner.id, `homzlist-data-${d}d.json`],
  );
  await remember("data_export_requests", rows[0].id);
}
console.log("exports: 2 previous requests seeded");

// ------------------------------------------------------------------- proof
const { rows: proof } = await sql.query(`
  select 'cms_pages' t, count(*)::int n from cms_pages
  union all select 'cms_page_versions', count(*)::int from cms_page_versions
  union all select 'help_categories', count(*)::int from help_categories
  union all select 'faqs', count(*)::int from faqs
  union all select 'blog_categories', count(*)::int from blog_categories
  union all select 'blog_posts', count(*)::int from blog_posts
  union all select 'support_tickets', count(*)::int from support_tickets
  union all select 'ticket_messages', count(*)::int from ticket_messages
  union all select 'data_export_requests', count(*)::int from data_export_requests
  order by 1`);
console.table(proof);

await sql.end();

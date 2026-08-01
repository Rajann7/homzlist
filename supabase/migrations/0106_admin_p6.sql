-- ============================================================================
-- P6 — A19 Master data · A20 Content · A21 Templates & strings
--
-- Three things this migration is for, in order of how much they matter:
--
--  1. `blocklist_words` and `number_patterns` become TABLES WITH A READER.
--     0096 wrote down why they were not one: the app's real detectors were four
--     regexes in lib/listings/validate.ts and a four-word array in
--     lib/chat/service.ts, so an admin editing these tables changed nothing.
--     A19 is the screen that edits them, and §3 of the addendum says a control
--     must WORK in the pass that introduces it — so the detector moves onto the
--     tables here, and the previously-hardcoded rules are seeded AS ROWS so
--     detection behaviour is unchanged on the day it switches over.
--
--     Postgres cannot execute the JavaScript dialect these are written in (\b
--     is a backspace in POSIX ARE, not a word boundary — 0096 §1), so each
--     pattern carries a POSIX translation ALONGSIDE the JS source. The
--     translation is done once, by code, at save time; nothing has to remember
--     to keep two hand-written copies in step.
--
--  2. `content_flag_hits` — the design's "Hits (30d)" column. Without it the
--     number could only be invented. It records WHICH rule matched and WHERE,
--     never the user's text: an admin counting hits does not need the sentence,
--     and storing it would put listing bodies and chat lines in a second place.
--
--  3. The list views A19/A20/A21 read, for the same reason every other part has
--     them: the shared engine resolves filters and sorts to SQL on ONE
--     relation, so a screen that draws a usage count needs it as a column.
-- ============================================================================

/* ─────────────────────────────────── 1 · the detectors get a real source ── */

alter table public.number_patterns
  add column if not exists pattern_posix text,
  add column if not exists applies_to text[] not null default array['listing','requirement','bio','chat'],
  add column if not exists updated_at timestamptz not null default now();

comment on column public.number_patterns.pattern_posix is
  'The same rule in POSIX ARE so Postgres can run it. Written by lib/admin/regex-dialect.ts at save time — never by hand.';

-- The nine seeded rules, translated. Written out rather than computed so the
-- migration is reproducible: `\b`→`\y`, `\d`→[0-9], `\s`→[[:space:]],
-- `(?i)`→ handled by the caller with a case-insensitive match.
update public.number_patterns set pattern_posix = case label
  when 'Plain 10-digit'    then '\y[6-9][0-9]{9}\y'
  when 'Spaced groups'     then '\y[6-9][0-9]{4}[[:space:]-][0-9]{5}\y'
  when 'With +91'          then '[+]91[[:space:]-]?[6-9][0-9]{9}'
  when 'Dotted'            then '\y[6-9]([0-9][.[:space:]]){9}'
  when 'Leetspeak'         then '\y[6-9]([0-9]|[oOlIzZ]){9}\y'
  when 'Word digits'       then '(zero|one|two|three|four|five|six|seven|eight|nine)([[:space:]-]?(zero|one|two|three|four|five|six|seven|eight|nine)){9}'
  when 'WhatsApp link'     then '(wa\.me|api\.whatsapp\.com)/[+]?[0-9]{10,}'
  when 'Email fallback'    then '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
  when 'Gujarati digits'   then '[૦-૯]{10}'
  when 'Devanagari digits' then '[०-९]{10}'
  else pattern_posix end
where pattern_posix is null;

-- The four regexes that used to live in lib/listings/validate.ts. They are
-- seeded as rows so the switch-over changes no behaviour; from here an admin
-- can disable one and the detector really stops using it.
insert into public.number_patterns (label, pattern, pattern_posix, sample, action, is_active)
select v.label, v.pattern, v.posix, v.sample, 'flag', true
from (values
  ('Grouped 3-3-4', '\b[6-9]\d{2}[\s.-]\d{3}[\s.-]\d{4}\b',
   '\y[6-9][0-9]{2}[[:space:].-][0-9]{3}[[:space:].-][0-9]{4}\y', '982 501 2345'),
  ('Separated digits', '\b[6-9](?:[\s.-]?\d){9}\b',
   '\y[6-9]([[:space:].-]?[0-9]){9}\y', '9 8 2 5 0 1 2 3 4 5')
) as v(label, pattern, posix, sample)
where not exists (select 1 from public.number_patterns p where p.label = v.label);

-- The chat profanity array, seeded as rows for the same reason. `severity`
-- 'flag' matches what lib/chat/service.ts actually did with them: warn, never
-- block the send (Doc2 §10.2).
insert into public.blocklist_words (word, script, severity, applies_to, is_active)
select v.word, 'latin', 'flag', array['chat'], true
from (values ('fraud'), ('scam'), ('cheat'), ('bakwaas')) as v(word)
where not exists (select 1 from public.blocklist_words b where lower(b.word) = v.word);

-- Two words could not share a spelling, and nothing stopped it.
create unique index if not exists blocklist_words_word_uq
  on public.blocklist_words (lower(word));

alter table public.blocklist_words
  add column if not exists note text,
  add column if not exists updated_at timestamptz not null default now();

/* ────────────────────────────────────────── 2 · where the hits are kept ── */

create table if not exists public.content_flag_hits (
  id uuid primary key default gen_random_uuid(),
  -- 'word' → blocklist_words.id · 'pattern' → number_patterns.id
  rule_kind text not null check (rule_kind in ('word', 'pattern')),
  rule_id uuid not null,
  -- where it was caught, so "View 30d hits" can go somewhere
  entity_type text not null check (entity_type in ('listing', 'requirement', 'bio', 'chat')),
  entity_id uuid,
  field text,
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists content_flag_hits_rule_idx
  on public.content_flag_hits (rule_kind, rule_id, created_at desc);
create index if not exists content_flag_hits_recent_idx
  on public.content_flag_hits (created_at desc);

alter table public.content_flag_hits enable row level security;
-- No policy: only the service role reads or writes this. It is a moderation
-- side-channel, and a user being able to count their own flags tells them
-- exactly which rule to write around.
revoke all on public.content_flag_hits from anon, authenticated;

/* ──────────────────────────────── 3 · A21 gets its second and third language ── */

-- The design's Languages column draws EN/GU/HI dots per template and its editor
-- has a per-language tab (template 2299). `message_templates` had one body, so
-- two of those three dots could never light and the tab could not save.
create table if not exists public.message_template_locales (
  template_id uuid not null references public.message_templates(id) on delete cascade,
  lang text not null check (lang in ('en', 'gu', 'hi')),
  subject text,
  body text not null,
  updated_by uuid references public.staff(profile_id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (template_id, lang)
);

alter table public.message_template_locales enable row level security;
revoke all on public.message_template_locales from anon, authenticated;

-- English already exists on the parent row; it moves in so there is ONE place a
-- send looks for a body. The parent's `body` stays as the fallback for any code
-- that has not been switched over — it is not dropped in the same migration
-- that starts writing the new table.
insert into public.message_template_locales (template_id, lang, subject, body)
select id, 'en', subject, body from public.message_templates
where body is not null and body <> ''
on conflict do nothing;

/* ──────────────────────────── 3b · a broadcast gets a recipient ledger ─── */

-- `broadcasts` had nine rows and no reader: no code sent one, and its
-- "Delivered 398 · 96%" column had nothing to count. A per-recipient row is
-- what makes that number a fact — and what lets "Resend to non-openers"
-- (template 2233) know who the non-openers are.
create table if not exists public.broadcast_recipients (
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- the same per-channel shape admin_messages.delivery uses (0101), so one
  -- reader understands both
  delivery jsonb not null default '{}'::jsonb,
  delivered_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (broadcast_id, profile_id)
);

create index if not exists broadcast_recipients_profile_idx
  on public.broadcast_recipients (profile_id);

alter table public.broadcast_recipients enable row level security;
revoke all on public.broadcast_recipients from anon, authenticated;

/* ─────────────────────────────────── 4 · the FAQ view count has a source ── */

-- The design's FAQs table has a Views column. Nothing counted them, so it could
-- only ever have been a made-up number. The public FAQ page increments this.
alter table public.faqs add column if not exists view_count integer not null default 0;

create or replace function public.hz_bump_faq_view(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.faqs set view_count = view_count + 1 where id = p_id;
$$;
revoke all on function public.hz_bump_faq_view(uuid) from public;
grant execute on function public.hz_bump_faq_view(uuid) to anon, authenticated;

/* ══════════════════════════════════════════════ 5 · the P6 list views ═════ */

-- A19 · Amenities (template 2118). "Usage" is a real count over listings'
-- amenity codes — the number the design prints next to each row.
create or replace view public.admin_amenity_list as
select
  a.code                                   as id,
  a.code,
  a.label,
  a.category,
  coalesce(a.categories, array[]::text[])  as categories,
  a.icon,
  a.sort_order,
  a.is_active,
  coalesce(u.n, 0)                         as usage_count
from public.amenities a
left join lateral (
  select count(*) n from public.listings l
   where l.amenities @> array[a.code] and l.deleted_at is null
) u on true;

-- A19 · Property types (template 2131). "Fields config" counts the definitions
-- the type actually resolves, and "Listings" is a live count.
create or replace view public.admin_property_type_list as
select
  t.code                                   as id,
  t.code,
  t.label,
  t.category,
  coalesce(t.roles, array[]::text[])       as roles,
  -- `kinds` is listing_kind[], not text[] — cast so the engine and the JSON
  -- payload see plain strings
  coalesce(t.kinds::text[], array[]::text[]) as kinds,
  t.field_config,
  t.sort_order,
  t.is_active,
  coalesce(jsonb_array_length(
    case when jsonb_typeof(t.field_config -> 'fields') = 'array'
         then t.field_config -> 'fields' else '[]'::jsonb end), 0) as field_count,
  coalesce(l.n, 0)                         as listings_count
from public.property_types t
left join lateral (
  select count(*) n from public.listings l
   where l.type_code = t.code and l.deleted_at is null
) l on true;

-- A19 · Blocklist (template 2144) and Number patterns (2155). Both carry the
-- design's "Hits (30d)", which is why content_flag_hits exists.
create or replace view public.admin_blocklist as
select
  b.id,
  b.word,
  b.script,
  b.severity,
  coalesce(b.applies_to, array[]::text[])  as applies_to,
  b.is_active,
  b.note,
  b.created_at,
  coalesce(h.n, 0)                         as hits_30d
from public.blocklist_words b
left join lateral (
  select count(*) n from public.content_flag_hits h
   where h.rule_kind = 'word' and h.rule_id = b.id
     and h.created_at > now() - interval '30 days'
) h on true;

create or replace view public.admin_number_pattern_list as
select
  p.id,
  p.label,
  p.pattern,
  p.pattern_posix,
  p.sample,
  p.action,
  coalesce(p.applies_to, array[]::text[])  as applies_to,
  p.is_active,
  p.created_at,
  coalesce(h.n, 0)                         as hits_30d
from public.number_patterns p
left join lateral (
  select count(*) n from public.content_flag_hits h
   where h.rule_kind = 'pattern' and h.rule_id = p.id
     and h.created_at > now() - interval '30 days'
) h on true;

-- A19 · Area requests (template 2170). "N users asked" is a count of the OTHER
-- requests for the same name in the same city, which is what makes a request
-- worth acting on — one person asking is not a signal.
create or replace view public.admin_area_request_list as
select
  r.id,
  r.name,
  r.status,
  r.note,
  r.created_at,
  r.resolved_at,
  r.created_area_id,
  r.profile_id,
  p.name                                   as requester_name,
  p.photo_url                              as requester_photo,
  r.city_id,
  c.name                                   as city_name,
  (select count(*) from public.area_requests r2
    where lower(r2.name) = lower(r.name)
      and r2.city_id is not distinct from r.city_id) as ask_count
from public.area_requests r
left join public.profiles p on p.id = r.profile_id
left join public.locations c on c.id = r.city_id;

-- A20 · Pages (template 2166), Blog (2181), FAQs (2194), Banners (2210),
-- Broadcasts (2223).
create or replace view public.admin_cms_page_list as
select
  p.id,
  p.slug,
  p.title,
  p.kind,
  'v' || p.version                         as version_label,
  p.version,
  case when p.is_published then 'published' else 'draft' end as status_key,
  p.effective_date,
  p.requires_reacceptance,
  p.updated_at,
  p.updated_by,
  s.display_name                            as updated_by_name,
  (select count(*) from public.cms_page_versions v where v.page_id = p.id) as version_count
from public.cms_pages p
left join public.staff s on s.profile_id = p.updated_by;

create or replace view public.admin_blog_list as
select
  b.id,
  b.slug,
  b.title,
  b.category,
  b.status                                 as status_key,
  b.author_name,
  b.cover_url,
  coalesce(b.view_count, 0)                as view_count,
  b.scheduled_at,
  b.published_at,
  b.created_at,
  b.updated_at,
  b.is_featured
from public.blog_posts b;

create or replace view public.admin_faq_list as
select
  f.id,
  f.question,
  f.answer,
  f.category,
  f.sort_order,
  f.is_active,
  coalesce(f.view_count, 0)                as view_count,
  coalesce(f.helpful_yes, 0)               as helpful_yes,
  coalesce(f.helpful_no, 0)                as helpful_no,
  -- the design prints "92% · 41 votes"; both halves are facts about the two
  -- counters, so neither is stored
  coalesce(f.helpful_yes, 0) + coalesce(f.helpful_no, 0) as votes,
  case when coalesce(f.helpful_yes, 0) + coalesce(f.helpful_no, 0) = 0 then null
       else round(100.0 * f.helpful_yes / (f.helpful_yes + f.helpful_no)) end as helpful_pct,
  f.updated_at
from public.faqs f;

create or replace view public.admin_banner_list as
select
  b.id,
  b.title,
  b.subtitle,
  b.placement,
  b.image_url,
  b.target_url,
  coalesce(b.target_cities, array[]::uuid[]) as target_cities,
  coalesce(b.target_roles, array[]::text[])  as target_roles,
  b.target_plan_status,
  b.starts_at,
  b.ends_at,
  b.is_active,
  coalesce(b.impressions, 0)               as impressions,
  coalesce(b.clicks, 0)                    as clicks,
  b.sort_order,
  b.created_at,
  -- Active / Scheduled / Expired is a fact about two dates and a switch, so it
  -- is derived here rather than stored and left to go stale (the same rule
  -- 0102 applied to coupons).
  case
    when not b.is_active                                     then 'paused'
    when b.starts_at is not null and b.starts_at > now()      then 'scheduled'
    when b.ends_at   is not null and b.ends_at   < now()      then 'expired'
    else 'active'
  end                                      as status_key
from public.feed_banners b;

create or replace view public.admin_broadcast_list as
select
  b.id,
  b.title,
  b.body,
  coalesce(b.channels, array[]::text[])    as channels,
  b.audience,
  coalesce(b.recipient_count, 0)           as recipient_count,
  b.status                                 as status_key,
  b.scheduled_at,
  b.sent_at,
  b.sent_by,
  s.display_name                            as sent_by_name,
  b.created_at,
  -- "398 · 96%" — delivered is counted from the sends, not stored on the row,
  -- so a partial delivery cannot report itself as complete.
  coalesce(d.delivered, 0)                 as delivered_count,
  coalesce(d.attempted, 0)                 as attempted_count,
  -- the percentage is delivered / ATTEMPTED, not delivered / audience size:
  -- a send that has not run yet must read as "—", never as 0% delivered
  case when coalesce(d.attempted, 0) = 0 then null
       else round(100.0 * coalesce(d.delivered, 0) / d.attempted) end as delivered_pct
from public.broadcasts b
left join public.staff s on s.profile_id = b.sent_by
left join lateral (
  select count(*) filter (where r.delivered_at is not null) delivered,
         count(*)                                           attempted
    from public.broadcast_recipients r
   where r.broadcast_id = b.id
) d on true;

-- A21 · Templates (2270) and UI strings (2300).
create or replace view public.admin_template_list as
select
  t.id,
  t.code,
  t.channel,
  t.name,
  t.subject,
  t.body,
  t.variables,
  t.provider_ref,
  t.is_active,
  t.last_test_at,
  t.updated_at,
  s.display_name                            as updated_by_name,
  -- the design's three language dots, each one a fact about a locale row
  exists (select 1 from public.message_template_locales l
           where l.template_id = t.id and l.lang = 'en' and l.body <> '') as has_en,
  exists (select 1 from public.message_template_locales l
           where l.template_id = t.id and l.lang = 'gu' and l.body <> '') as has_gu,
  exists (select 1 from public.message_template_locales l
           where l.template_id = t.id and l.lang = 'hi' and l.body <> '') as has_hi
from public.message_templates t
left join public.staff s on s.profile_id = t.updated_by;

create or replace view public.admin_ui_string_list as
select
  u.key                                    as id,
  u.key,
  u.area,
  u.en,
  u.gu,
  u.hi,
  u.updated_at,
  (u.gu is null or u.gu = '')              as missing_gu,
  (u.hi is null or u.hi = '')              as missing_hi
from public.ui_strings u;

/* ─────────────────────────────────────────────────────────── grants ─────── */

-- Every view above is read through the service role by the admin API. None of
-- them is reachable by a browser session.
revoke all on public.admin_amenity_list        from anon, authenticated;
revoke all on public.admin_property_type_list  from anon, authenticated;
revoke all on public.admin_blocklist           from anon, authenticated;
revoke all on public.admin_number_pattern_list from anon, authenticated;
revoke all on public.admin_area_request_list   from anon, authenticated;
revoke all on public.admin_cms_page_list       from anon, authenticated;
revoke all on public.admin_blog_list           from anon, authenticated;
revoke all on public.admin_faq_list            from anon, authenticated;
revoke all on public.admin_banner_list         from anon, authenticated;
revoke all on public.admin_broadcast_list      from anon, authenticated;
revoke all on public.admin_template_list       from anon, authenticated;
revoke all on public.admin_ui_string_list      from anon, authenticated;

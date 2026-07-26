-- ============================================================================
-- HomzList — Migration 0030: Search & SEO (Module 8, P3)
--
-- Doc2 §12 (search), Doc3 §4 (SEO engine), Doc7 §108-118.
--
-- What this adds, and why each piece has to be a TABLE rather than something
-- the frontend keeps:
--
--   locations.slug        — the SEO URL segment. Landing pages are
--                           /flats-for-sale-in-mavdi-rajkot, so the area and
--                           city each need a stable, lowercase-hyphen segment
--                           that survives a rename (admin edits the name, the
--                           slug stays → no dead URLs, no silent 404 spike).
--   locations.is_launched — Doc3 "launch-city config". A city we have not
--                           opened yet renders P3-S5 (Coming soon) instead of
--                           an empty results page. Server-decided, never a
--                           client list of city names.
--   locations.highlights  — Doc7 §166 `PATCH .../highlights`. The "About Mavdi"
--                           block on the area page + the SEO unique-content
--                           block are built from this, not from a string in a
--                           component.
--   search_recents        — Doc7 §110/111. Max 20 PER MODE per user, server
--                           enforced (a trigger, so it holds no matter which
--                           code path writes).
--   saved_searches        — Doc7 §112-114. Saved search + new-match alerts.
--   city_interest_requests— Doc7 §118. The "Notify me" button on Coming-soon
--                           is a real expansion signal, not a toast that lies.
--   seo_content_templates — Doc3: "3-4 rotating template variations — no
--   seo_faq_templates       duplicate-content penalty" and "FAQ block
--                           auto-answered from data". Both are CONTENT, so they
--                           live in the DB where the admin CMS can edit them;
--                           the renderer only substitutes measured values.
--   location_adjacency    — already existed (0005) but had ZERO rows, which
--                           means the "NEARBY:" cascade in feed, search and
--                           matching has never actually fired. Seeded here.
--
-- RLS: every new table is deny-all to browser roles. The server API (service
-- role) is the only access path — same as every other module (Doc9 §4).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Location: slug, launch flag, SEO highlights
-- ---------------------------------------------------------------------------
alter table public.locations add column if not exists slug        text;
alter table public.locations add column if not exists is_launched boolean not null default true;
alter table public.locations add column if not exists highlights  text;

-- Slugify: lowercase, non-alphanumerics → single hyphen, trimmed.
create or replace function public.hz_slugify(txt text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(txt, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Backfill. Areas/cities can repeat a name across parents ("Satellite" exists
-- in more than one city in real master data), so uniqueness is per level +
-- parent, and a collision gets a numeric suffix rather than failing the load.
do $$
declare
  r      record;
  base   text;
  cand   text;
  n      integer;
begin
  for r in select id, name, level, parent_id from public.locations where slug is null order by level, name loop
    base := public.hz_slugify(r.name);
    if base = '' then base := 'area'; end if;
    cand := base;
    n := 1;
    while exists (
      select 1 from public.locations
      where slug = cand and level = r.level and parent_id is not distinct from r.parent_id and id <> r.id
    ) loop
      n := n + 1;
      cand := base || '-' || n;
    end loop;
    update public.locations set slug = cand where id = r.id;
  end loop;
end $$;

alter table public.locations alter column slug set not null;

create unique index if not exists locations_slug_scope_uidx
  on public.locations (level, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
-- City slugs are the first URL segment of a landing page, so they must be
-- globally unique among cities on their own.
create unique index if not exists locations_city_slug_uidx
  on public.locations (slug) where level = 'city';

-- Keep the slug when the NAME changes (renames must not break live URLs), but
-- give brand-new rows one automatically so the admin master-data screen never
-- has to think about it.
create or replace function public.hz_locations_slug_default()
returns trigger language plpgsql as $$
declare base text; cand text; n integer := 1;
begin
  if new.slug is null or new.slug = '' then
    base := public.hz_slugify(new.name);
    if base = '' then base := 'area'; end if;
    cand := base;
    while exists (
      select 1 from public.locations
      where slug = cand and level = new.level and parent_id is not distinct from new.parent_id and id <> new.id
    ) loop
      n := n + 1;
      cand := base || '-' || n;
    end loop;
    new.slug := cand;
  end if;
  return new;
end $$;

drop trigger if exists locations_slug_default on public.locations;
create trigger locations_slug_default before insert on public.locations
  for each row execute function public.hz_locations_slug_default();

-- ---------------------------------------------------------------------------
-- 2. Recent searches (Doc7 §110/111) — max 20 per user PER MODE
-- ---------------------------------------------------------------------------
create table if not exists public.search_recents (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Recents are kept mode-wise (Doc2 §12): a Property search and a Requirement
  -- search never appear in each other's list.
  mode       text not null default 'property' check (mode in ('property','requirement')),
  -- The raw text the user typed/tapped. Unicode: all-Indian-script input is
  -- accepted verbatim (Doc7 §108), so this is plain text, never normalised away.
  query      text not null check (length(query) between 1 and 120),
  -- When the row came from tapping a suggestion we remember WHAT it resolved to
  -- so replaying it re-runs the same search instead of a fuzzy text match.
  target_kind text check (target_kind in ('area','city','landing','text')),
  target_slug text,
  created_at timestamptz not null default now()
);
create index if not exists search_recents_user_idx
  on public.search_recents (profile_id, mode, created_at desc);
-- Re-searching the same thing moves it to the top rather than duplicating.
create unique index if not exists search_recents_dedupe_uidx
  on public.search_recents (profile_id, mode, lower(query));

-- The 20-cap is a DB rule, not an app convention — it holds for every writer.
create or replace function public.hz_trim_search_recents()
returns trigger language plpgsql as $$
begin
  delete from public.search_recents r
  where r.profile_id = new.profile_id
    and r.mode = new.mode
    and r.id not in (
      select id from public.search_recents
      where profile_id = new.profile_id and mode = new.mode
      order by created_at desc
      limit 20
    );
  return null;
end $$;

drop trigger if exists search_recents_trim on public.search_recents;
create trigger search_recents_trim after insert on public.search_recents
  for each row execute function public.hz_trim_search_recents();

-- ---------------------------------------------------------------------------
-- 3. Saved searches + new-match alerts (Doc7 §112-114)
-- ---------------------------------------------------------------------------
create table if not exists public.saved_searches (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  mode           text not null default 'property' check (mode in ('property','requirement')),
  label          text not null check (length(label) between 1 and 120),
  -- The exact filter payload the search ran with. Stored whole so an alert
  -- re-runs the identical query months later even if the UI has changed.
  params         jsonb not null default '{}'::jsonb,
  alerts_enabled boolean not null default true,
  -- Watermark for "what has this user already been alerted about". The alert
  -- job counts listings that went live after this, never re-notifying.
  last_alerted_at timestamptz not null default now(),
  last_match_count integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists saved_searches_user_idx  on public.saved_searches (profile_id, created_at desc);
create index if not exists saved_searches_alert_idx on public.saved_searches (alerts_enabled, last_alerted_at) where alerts_enabled;

drop trigger if exists saved_searches_updated_at on public.saved_searches;
create trigger saved_searches_updated_at before update on public.saved_searches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. City interest register (Doc7 §118) — the Coming-soon "Notify me"
-- ---------------------------------------------------------------------------
create table if not exists public.city_interest_requests (
  id          uuid primary key default gen_random_uuid(),
  -- Either an existing (un-launched) city, or a free-text name a user searched
  -- for that we have no master-data row for at all. Both are expansion signal.
  city_id     uuid references public.locations(id) on delete set null,
  city_name   text not null check (length(city_name) between 1 and 80),
  profile_id  uuid references public.profiles(id) on delete set null,
  -- Guests can register interest too (the screen is public), so we keep an
  -- anonymous fingerprint to dedupe rather than requiring an account.
  anon_key    text,
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists city_interest_city_idx on public.city_interest_requests (city_name, created_at desc);
-- One signal per person per city (a signed-in user OR an anon key).
create unique index if not exists city_interest_user_uidx
  on public.city_interest_requests (lower(city_name), profile_id) where profile_id is not null;
create unique index if not exists city_interest_anon_uidx
  on public.city_interest_requests (lower(city_name), anon_key) where profile_id is null and anon_key is not null;

-- ---------------------------------------------------------------------------
-- 5. SEO content templates (Doc3 §4 "3-4 rotating template variations")
-- ---------------------------------------------------------------------------
-- Placeholders are substituted server-side from MEASURED values only
-- ({count}, {type}, {intent}, {area}, {city}, {min}, {max}, {avg}, {month}).
-- Nothing here invents a number; the renderer refuses a template whose
-- placeholders it cannot fill from the query result.
create table if not exists public.seo_content_templates (
  id          uuid primary key default gen_random_uuid(),
  -- 'intro' = the unique content paragraph under the listings grid.
  -- 'meta'  = the meta-description variant. 'title' = the <title> variant.
  slot        text not null check (slot in ('intro','meta','title')),
  -- Which page family it applies to. NULL = any.
  page_kind   text check (page_kind in ('area','city','landing','project')),
  variant     smallint not null,          -- 1..4 — chosen deterministically per URL
  body        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists seo_content_templates_uidx
  on public.seo_content_templates (slot, coalesce(page_kind,'*'), variant);

create table if not exists public.seo_faq_templates (
  id          uuid primary key default gen_random_uuid(),
  page_kind   text not null default 'landing' check (page_kind in ('area','city','landing')),
  sort_order  integer not null default 0,
  question    text not null,
  answer      text not null,
  -- Which measured values the answer needs. If any is unavailable for a given
  -- page the FAQ item is DROPPED rather than rendered with a blank — an empty
  -- answer is worse than one fewer FAQ (and Google penalises thin FAQPage).
  requires    text[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists seo_faq_templates_idx on public.seo_faq_templates (page_kind, sort_order) where is_active;

-- ---------------------------------------------------------------------------
-- 6. RLS — deny-all to browser roles on every new table (Doc9 §4)
-- ---------------------------------------------------------------------------
alter table public.search_recents          enable row level security;
alter table public.saved_searches          enable row level security;
alter table public.city_interest_requests  enable row level security;
alter table public.seo_content_templates   enable row level security;
alter table public.seo_faq_templates       enable row level security;

-- ---------------------------------------------------------------------------
-- 7. Search indexes (Doc3 §5 "DB indexed search at launch")
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- Free-text over the fields the bar actually searches. Trigram so Unicode
-- (Gujarati/Hindi/…) and misspellings both work without a language config —
-- to_tsvector('english') would mangle Indic scripts, which is exactly the
-- all-Indian-script requirement in Doc7 §108.
create index if not exists listings_title_trgm_idx
  on public.listings using gin (title gin_trgm_ops) where status = 'live';
create index if not exists listings_arealabel_trgm_idx
  on public.listings using gin (area_label gin_trgm_ops) where status = 'live';
create index if not exists locations_name_trgm_idx
  on public.locations using gin (name gin_trgm_ops);
create index if not exists locations_name_gu_trgm_idx
  on public.locations using gin (name_gu gin_trgm_ops);
create index if not exists projects_name_trgm_idx
  on public.projects using gin (name gin_trgm_ops) where status = 'live';
create index if not exists profiles_name_trgm_idx
  on public.profiles using gin (name gin_trgm_ops);

-- The composite the results query orders on (Doc3 §5 "composite indexes").
create index if not exists listings_search_idx
  on public.listings (status, availability, city_id, area_id, type_code, kind, price_paise)
  where status = 'live';
create index if not exists listings_price_idx
  on public.listings (price_paise) where status = 'live' and availability = 'available';

-- Attribute filters (BHK/bathrooms/furnishing/facing) all live in `attributes`.
create index if not exists listings_attributes_gin_idx
  on public.listings using gin (attributes jsonb_path_ops) where status = 'live';
create index if not exists listings_amenities_gin_idx
  on public.listings using gin (amenities) where status = 'live';

-- ---------------------------------------------------------------------------
-- 8. Seed: rotating SEO content + FAQ templates
-- ---------------------------------------------------------------------------
insert into public.seo_content_templates (slot, page_kind, variant, body) values
  ('intro','landing',1,'{area} is one of {city}''s most searched localities for {typePlural}. HomzList currently lists {count} {intentPhrase} {typePlural} here, priced between {min} and {max}. Listings come directly from owners, brokers and builders — photos, full details and no spam calls.'),
  ('intro','landing',2,'Looking for {typePlural} {intentPhrase} in {area}? There are {count} live options on HomzList right now, from {min} upward. {area} sits within {city} and is popular with buyers comparing price per sqft against nearby localities.'),
  ('intro','landing',3,'HomzList tracks {count} {typePlural} {intentPhrase} in {area}, {city}. The typical asking price works out to about {avg}, with the range running {min} to {max}. Every listing is posted by a verified account and updated as availability changes.'),
  ('intro','landing',4,'{count} {typePlural} are {intentPhrase} in {area}, {city} as of {month}. Prices start at {min} and go up to {max}. Browse photos, compare per-sqft rates and contact the owner or broker directly through HomzList.'),
  ('intro','area',1,'{area} is part of {city} and currently has {count} live property listings on HomzList across all types, priced from {min}. Use the filters to narrow by type, budget and BHK.'),
  ('intro','area',2,'There are {count} properties listed in {area}, {city} on HomzList as of {month}, ranging {min} to {max}. Explore flats, plots and commercial options below.'),
  ('intro','area',3,'HomzList lists {count} properties in {area}, {city}. The average works out to roughly {avg}. Nearby localities are linked below if you want to widen the search.'),
  ('intro','city',1,'HomzList lists {count} properties across {city}, from {min} to {max}. Pick a locality below to narrow down, or search by budget and BHK.'),
  ('intro','city',2,'{count} live property listings in {city} as of {month}, priced {min} onward. Browse by locality, property type or intent.'),
  ('intro','city',3,'Property in {city}: {count} live listings on HomzList, averaging about {avg}. Owners, brokers and builders post directly — no call-centre in between.')
on conflict (slot, coalesce(page_kind,'*'), variant) do nothing;

insert into public.seo_faq_templates (page_kind, sort_order, question, answer, requires) values
  ('landing', 10, 'What is the average price of {aTypeSingular} in {area}?',
   'The average asking price for {typePlural} in {area}, {city} works out to about {avg}. Listings currently range from {min} to {max} depending on size, floor and amenities.',
   '{avg,min,max}'),
  ('landing', 20, 'How many {typePlural} are available {intentPhrase} in {area}?',
   'HomzList has {count} live {typePlural} {intentPhrase} in {area}, {city} right now. The list updates as sellers mark properties sold or rented, so what you see is current.',
   '{count}'),
  ('landing', 30, 'Which areas near {area} should I also check?',
   'Buyers looking at {area} commonly also compare {nearbyList}. Each of those has its own listings page on HomzList with current prices.',
   '{nearbyList}'),
  ('landing', 40, 'Are there new projects in {area}?',
   '{projectAnswer}',
   '{projectAnswer}'),
  ('landing', 50, 'Do I have to pay HomzList to contact a seller?',
   'No. Browsing and contacting a listing is free for buyers and tenants. HomzList charges the person posting the property, which is why there are no spam calls from agents you never contacted.',
   '{}'),
  ('area', 10, 'How many properties are listed in {area}?',
   'There are {count} live listings in {area}, {city} on HomzList as of {month}, across all property types.',
   '{count}'),
  ('area', 20, 'What is the price range in {area}?',
   'Current listings in {area} run from {min} to {max}, averaging about {avg}.',
   '{min,max,avg}'),
  ('area', 30, 'Which areas are near {area}?',
   'The localities adjacent to {area} are {nearbyList}. HomzList shows listings from those areas too when {area} runs short.',
   '{nearbyList}'),
  ('city', 10, 'How many properties are listed in {city}?',
   'HomzList has {count} live property listings across {city} as of {month}.',
   '{count}'),
  ('city', 20, 'Which are the most active localities in {city}?',
   'The localities with the most current listings in {city} are {nearbyList}.',
   '{nearbyList}')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 9. Seed: area highlights (Doc7 §166 — plain text, area page + SEO)
-- ---------------------------------------------------------------------------
-- Real editorial copy for the seeded localities. The P3 design's "About Mavdi"
-- paragraph is the Mavdi row here — it is CONTENT, so it lives in the DB where
-- the admin CMS edits it, not as a string inside the area page component.
update public.locations set highlights =
  'Mavdi is one of Rajkot''s fastest-growing residential areas, well connected to 150 Feet Ring Road. Schools, markets and hospitals are within 2 km. Popular with families and first-time buyers.'
where level = 'area' and name = 'Mavdi' and highlights is null;

update public.locations set highlights =
  'University Road is Rajkot''s education corridor, lined with colleges, hostels and student housing. Strong rental demand and steady resale values make it a favourite with investors.'
where level = 'area' and name = 'University Road' and highlights is null;

update public.locations set highlights =
  'Kalawad Road is Rajkot''s premium stretch, with high-rise apartments, showrooms and restaurants. It carries the city''s highest average per-sqft rates.'
where level = 'area' and name = 'Kalawad Road' and highlights is null;

update public.locations set highlights =
  '150 Feet Ring Road forms Rajkot''s outer arterial belt. Wide roads and newer construction make it popular for both large flats and commercial frontage.'
where level = 'area' and name = '150 Feet Ring Road' and highlights is null;

update public.locations set highlights =
  'Raiya Road connects central Rajkot to the growing western suburbs. A mix of older bungalows and new apartment projects, with good school access.'
where level = 'area' and name = 'Raiya Road' and highlights is null;

update public.locations set highlights =
  'Kuvadva Road is Rajkot''s industrial and warehousing approach, also holding affordable plots and farm land on the city fringe.'
where level = 'area' and name = 'Kuvadva Road' and highlights is null;

update public.locations set highlights =
  'Rajkot is Gujarat''s fourth-largest city and a major engineering and casting hub. Property demand is driven by local industry, education and a steady inflow from surrounding Saurashtra towns.'
where level = 'city' and name = 'Rajkot' and highlights is null;

-- ---------------------------------------------------------------------------
-- 10. Seed: location adjacency — the cascade has never had data
-- ---------------------------------------------------------------------------
-- `location_adjacency` shipped empty in 0005, so the "NEARBY:" cascade in the
-- feed, in search results and in requirement matching has silently never
-- fired — every one of those code paths queried the table, got nothing, and
-- degraded to "no nearby areas". These are real geographic neighbours.
create or replace function public.hz_link_adjacent(city text, a text, b text)
returns void language plpgsql as $$
declare ida uuid; idb uuid; idc uuid;
begin
  select id into idc from public.locations where level = 'city' and name = city limit 1;
  if idc is null then return; end if;
  select id into ida from public.locations where level = 'area' and parent_id = idc and name = a limit 1;
  select id into idb from public.locations where level = 'area' and parent_id = idc and name = b limit 1;
  if ida is null or idb is null then return; end if;
  -- Adjacency is symmetric; store both directions so a lookup never needs an OR.
  insert into public.location_adjacency (location_id, adjacent_id) values (ida, idb) on conflict do nothing;
  insert into public.location_adjacency (location_id, adjacent_id) values (idb, ida) on conflict do nothing;
end $$;

select public.hz_link_adjacent('Rajkot','Mavdi','150 Feet Ring Road');
select public.hz_link_adjacent('Rajkot','Mavdi','University Road');
select public.hz_link_adjacent('Rajkot','Mavdi','Raiya Road');
select public.hz_link_adjacent('Rajkot','University Road','Kalawad Road');
select public.hz_link_adjacent('Rajkot','University Road','Raiya Road');
select public.hz_link_adjacent('Rajkot','Kalawad Road','150 Feet Ring Road');
select public.hz_link_adjacent('Rajkot','Raiya Road','150 Feet Ring Road');
select public.hz_link_adjacent('Rajkot','Kuvadva Road','150 Feet Ring Road');
select public.hz_link_adjacent('Rajkot','Kuvadva Road','Mavdi');

select public.hz_link_adjacent('Ahmedabad','Satellite','Prahlad Nagar');
select public.hz_link_adjacent('Ahmedabad','Satellite','Bopal');
select public.hz_link_adjacent('Ahmedabad','Prahlad Nagar','Bopal');
select public.hz_link_adjacent('Ahmedabad','Maninagar','Satellite');

select public.hz_link_adjacent('Surat','Vesu','Piplod');
select public.hz_link_adjacent('Surat','Vesu','Pal');
select public.hz_link_adjacent('Surat','Piplod','Pal');
select public.hz_link_adjacent('Surat','Adajan','Pal');

select public.hz_link_adjacent('Vadodara','Alkapuri','Gotri');
select public.hz_link_adjacent('Vadodara','Gotri','Waghodia Road');
select public.hz_link_adjacent('Vadodara','Alkapuri','Manjalpur');
select public.hz_link_adjacent('Vadodara','Manjalpur','Waghodia Road');

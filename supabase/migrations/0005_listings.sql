-- ============================================================================
-- HomzList — Migration 0005: Listings & Projects (Module 4, foundation)
-- Doc2 §5 (listings) §6 (projects); Doc7 §4; Doc9 §11 (payment-first).
--
-- Money is integer paise. Areas are stored in a canonical unit (sq ft ×100, so
-- "area_sqft_x100") with the user's chosen display unit kept alongside — the
-- Vigha/Guntha converters are presentation, never the stored truth (Doc2 §5.1).
-- RLS: deny-all to browser roles; the server API is the access path (Doc9 §4).
-- ============================================================================

-- ---- location master data (State→District→Taluka→City→Area — Doc2 §5.1) ----
create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.locations(id) on delete cascade,
  level       text not null check (level in ('state','district','taluka','city','area')),
  name        text not null,
  name_gu     text,                       -- bilingual master data
  pincode     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists locations_parent_idx on public.locations (parent_id, level) where is_active;
create index if not exists locations_level_idx  on public.locations (level, name);

-- Adjacency for the feed's location cascade (exact → adjacent → city).
create table if not exists public.location_adjacency (
  location_id uuid not null references public.locations(id) on delete cascade,
  adjacent_id uuid not null references public.locations(id) on delete cascade,
  primary key (location_id, adjacent_id)
);

-- "Request area" → admin queue (Doc2 §5.1).
create table if not exists public.area_requests (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  city_id    uuid references public.locations(id) on delete set null,
  status     text not null default 'pending' check (status in ('pending','added','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists area_requests_status_idx on public.area_requests (status, created_at);

-- ---- enums ------------------------------------------------------------------
do $$ begin
  create type listing_state as enum (
    'draft','payment_pending','pending_review','changes_requested','rejected',
    'live','hidden','archived','deleted'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Availability within `live` (Doc2 §5.4 status actions).
  create type listing_availability as enum ('available','sold','rented','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type listing_kind as enum ('sell','rent');
exception when duplicate_object then null; end $$;

-- ---- property type catalog (config-driven — new types WITHOUT code) ---------
create table if not exists public.property_types (
  code        text primary key,           -- 'flat' | 'bungalow' | 'plot_agri' | 'pg' …
  label       text not null,
  category    text not null check (category in ('residential','commercial','plot','pg')),
  roles       text[] not null default '{owner,broker,builder}',
  kinds       listing_kind[] not null default '{sell,rent}',
  -- Which fields this type shows, and their rules. Drives the whole form.
  field_config jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- listings ----------------------------------------------------------------
create table if not exists public.listings (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  -- The slot that paid for this listing. Payment-first: a listing cannot exist
  -- without one (Doc9 §11), and a refund releases the slot which unpublishes.
  slot_id           uuid references public.listing_slots(id) on delete set null,
  type_code         text not null references public.property_types(code),
  kind              listing_kind not null default 'sell',
  status            listing_state not null default 'draft',
  availability      listing_availability not null default 'available',

  title             text,
  description       text,

  -- Price (Doc2 §5.1): paise, or "on request" with no figure at all.
  price_paise       bigint check (price_paise is null or price_paise >= 0),
  price_on_request  boolean not null default false,
  is_negotiable     boolean not null default false,
  -- Rent extras
  deposit_paise     bigint,
  maintenance_paise bigint,
  maintenance_included boolean not null default false,
  available_from    date,

  -- Location cascade (denormalised ids for fast filtering + a display label)
  state_id          uuid references public.locations(id),
  district_id       uuid references public.locations(id),
  taluka_id         uuid references public.locations(id),
  city_id           uuid references public.locations(id),
  area_id           uuid references public.locations(id),
  pincode           text,
  area_label        text,                 -- "Mavdi, Rajkot" for cards

  -- Every per-type field (BHK, bathrooms, furnishing, road width, …) lives here
  -- so a NEW property type needs config only, never a migration (Doc2 §5.1).
  attributes        jsonb not null default '{}'::jsonb,
  amenities         text[] not null default '{}',

  -- Contact rules (Doc2 §5.1) — the number is only exposed when public.
  contact_public    boolean not null default false,
  contact_number    text,
  alt_number        text,
  whatsapp_number   text,

  ownership_proof_type text,
  ownership_proof_key  text,              -- private R2 key (owner+admin only)

  cover_url         text,
  photo_count       integer not null default 0,

  -- Moderation (Doc2 §5.4)
  reject_count      integer not null default 0,
  review_notes      jsonb,                -- per-field notes for changes-requested
  reject_reason     text,
  is_locked         boolean not null default false,  -- 3 rejects → locked
  flagged_reason    text,                 -- number-in-description auto-flag

  -- Lifecycle (Doc2 §5.4)
  submitted_at      timestamptz,
  approved_at       timestamptz,
  live_at           timestamptz,
  still_available_asked_at timestamptz,
  hidden_at         timestamptz,
  archived_at       timestamptz,
  deleted_at        timestamptz,
  sold_at           timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists listings_owner_idx  on public.listings (profile_id, status, created_at desc);
create index if not exists listings_live_idx   on public.listings (status, availability, city_id, created_at desc) where status = 'live';
create index if not exists listings_area_idx   on public.listings (area_id) where status = 'live';
create index if not exists listings_slot_idx   on public.listings (slot_id);
create index if not exists listings_lifecycle_idx on public.listings (status, live_at) where status = 'live';

-- Price history → savers notified on a DROP only (Doc2 §5.4).
create table if not exists public.listing_price_history (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  old_paise   bigint,
  new_paise   bigint,
  changed_at  timestamptz not null default now()
);
create index if not exists price_history_listing_idx on public.listing_price_history (listing_id, changed_at desc);

-- ---- photos (pipeline state per file — Doc2 §5.2) --------------------------
create table if not exists public.listing_photos (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  storage_key  text not null,
  url          text,
  alt_text     text,
  position     integer not null default 0,   -- position 0 = cover (Doc2 §5.2)
  width        integer,
  height       integer,
  status       text not null default 'uploading'
                 check (status in ('uploading','processing','ready','failed')),
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists photos_listing_idx on public.listing_photos (listing_id, position);

-- ---- drafts (auto-save; max 3; 90-day expiry — Doc2 §5.3) ------------------
create table if not exists public.listing_drafts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'listing' check (kind in ('listing','requirement','project')),
  payload     jsonb not null default '{}'::jsonb,
  title       text,
  expires_at  timestamptz not null default (now() + interval '90 days'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists drafts_owner_idx on public.listing_drafts (profile_id, updated_at desc);

-- ---- projects (Builder — Doc2 §6) ------------------------------------------
create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  slot_id           uuid references public.listing_slots(id) on delete set null,
  name              text not null,
  status            listing_state not null default 'draft',
  -- RERA is REQUIRED unless explicitly exempt with a reason (Doc2 §6).
  rera_number       text,
  rera_exempt       boolean not null default false,
  rera_exempt_reason text,
  build_status      text check (build_status in ('booking_open','under_construction','ready')),
  possession_date   date,
  towers            integer,
  floors            integer,
  total_units       integer,
  available_units   integer,
  bank_approvals    text[] not null default '{}',
  amenities         text[] not null default '{}',
  description       text,
  state_id          uuid references public.locations(id),
  city_id           uuid references public.locations(id),
  area_id           uuid references public.locations(id),
  area_label        text,
  brochure_key      text,
  brochure_scanned  boolean not null default false,
  cover_url         text,
  approved_at       timestamptz,
  live_at           timestamptz,
  expires_at        timestamptz,          -- 1-year cycle (Doc2 §6)
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint rera_required check (rera_exempt = true or rera_number is not null or status = 'draft')
);
create index if not exists projects_owner_idx on public.projects (profile_id, status);
create index if not exists projects_live_idx  on public.projects (status, city_id) where status = 'live';

-- Unit-type repeater → expandable table on the detail screen (Doc2 §6).
create table if not exists public.project_units (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  unit_type      text not null,            -- '2BHK'
  area_sqft      integer,
  price_from_paise bigint,
  floor_plan_url text,
  available      boolean not null default true,
  position       integer not null default 0
);
create index if not exists project_units_idx on public.project_units (project_id, position);

-- ---- triggers ---------------------------------------------------------------
drop trigger if exists property_types_updated_at on public.property_types;
create trigger property_types_updated_at before update on public.property_types
  for each row execute function public.set_updated_at();
drop trigger if exists listings_updated_at on public.listings;
create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();
drop trigger if exists drafts_updated_at on public.listing_drafts;
create trigger drafts_updated_at before update on public.listing_drafts
  for each row execute function public.set_updated_at();
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- Now that `listings` exists, point the billing slot at it (Module 3 left this
-- FK for here, so a refund's slot-release can name the listing to unpublish).
do $$ begin
  alter table public.listing_slots
    add constraint listing_slots_listing_fk
    foreign key (listing_id) references public.listings(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---- seed: property types + field config (Doc2 §5.1) -----------------------
insert into public.property_types (code, label, category, roles, kinds, sort_order, field_config) values
  ('flat',        'Flat',          'residential', '{owner,broker,builder}', '{sell,rent}', 1,
   '{"fields":["bhk","bathrooms","balconies","floor","total_floors","furnishing","furnishing_details","lift","parking","maintenance","society_name","facing","age","water","ownership_type","construction_status"]}'),
  ('bungalow',    'Bungalow',      'residential', '{owner,broker,builder}', '{sell,rent}', 2,
   '{"fields":["bhk","bathrooms","plot_area","construction_area","floor_count","furnishing","parking","facing","age","water","garden","ownership_type","construction_status"]}'),
  ('tenement',    'Tenement',      'residential', '{owner,broker,builder}', '{sell,rent}', 3,
   '{"fields":["bhk","bathrooms","plot_area","construction_area","furnishing","parking","facing","age","water","ownership_type","construction_status"]}'),
  ('farmhouse',   'Farmhouse',     'residential', '{owner,broker,builder}', '{sell,rent}', 4,
   '{"fields":["plot_area","construction_area","bathrooms","furnishing","bore","garden","facing","age","water","ownership_type"],"hidden":["bhk"]}'),
  ('office',      'Office',        'commercial',  '{owner,broker,builder}', '{sell,rent}', 5,
   '{"fields":["carpet_area","washrooms","floor","total_floors","shell_state","furnishing","parking","lift","facing","age","ownership_type"]}'),
  ('shop',        'Shop',          'commercial',  '{owner,broker,builder}', '{sell,rent}', 6,
   '{"fields":["carpet_area","washrooms","floor","shell_state","frontage","parking","facing","age","ownership_type"]}'),
  ('showroom',    'Showroom',      'commercial',  '{owner,broker,builder}', '{sell,rent}', 7,
   '{"fields":["carpet_area","washrooms","floor","total_floors","shell_state","frontage","parking","facing","age","ownership_type"]}'),
  ('godown',      'Godown',        'commercial',  '{owner,broker,builder}', '{sell,rent}', 8,
   '{"fields":["carpet_area","height","shutter_count","washrooms","road_width","power_load","age","ownership_type"]}'),
  ('plot_res',    'Residential Plot','plot',      '{owner,broker,builder}', '{sell}',      9,
   '{"fields":["land_area","na_kheti","road_touch","road_width","corner_plot","fencing","facing","ownership_type"],"area_units":true}'),
  ('plot_com',    'Commercial Plot','plot',       '{owner,broker,builder}', '{sell}',      10,
   '{"fields":["land_area","na_kheti","road_touch","road_width","corner_plot","fencing","facing","ownership_type"],"area_units":true}'),
  ('plot_agri',   'Agriculture Land','plot',      '{owner,broker,builder}', '{sell}',      11,
   '{"fields":["land_area","na_kheti","bore","road_touch","road_width","corner_plot","fencing","ownership_type"],"area_units":true}'),
  ('plot_farm',   'Farm Land',     'plot',        '{owner,broker,builder}', '{sell}',      12,
   '{"fields":["land_area","na_kheti","bore","garden","road_touch","road_width","fencing","ownership_type"],"area_units":true}'),
  -- PG/Hostel is Owner/Broker only — Builders never see it (Doc2 §5.1).
  ('pg',          'PG / Hostel',   'pg',          '{owner,broker}',         '{rent}',      13,
   '{"fields":["pg_for","occupancy","meals","furnishing","bathrooms","ac","tenant_preference","notice_period","rules"]}')
on conflict (code) do nothing;

-- ---- RLS (deny-all for clients; server service-role only) -------------------
alter table public.locations            enable row level security;
alter table public.location_adjacency   enable row level security;
alter table public.area_requests        enable row level security;
alter table public.property_types       enable row level security;
alter table public.listings             enable row level security;
alter table public.listing_price_history enable row level security;
alter table public.listing_photos       enable row level security;
alter table public.listing_drafts       enable row level security;
alter table public.projects             enable row level security;
alter table public.project_units        enable row level security;

-- No policies: RLS on + zero policies = nothing for anon/authenticated. The API
-- enforces the Doc2 §5.4 URL state-access matrix per request (Doc9 §4/§API1).

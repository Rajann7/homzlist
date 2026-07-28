-- 0075 — a project gets a photo gallery.
--
-- Until now `projects` carried ONE image, `cover_url`, and the detail screen
-- handed its hero an empty photo array (`ProjectDetail` line 147:
-- `<DetailHero photos={[]} …>`). So the one screen a buyer uses to judge a
-- scheme showed a single picture with no way to swipe, while a ₹52-lakh flat
-- posted by an owner shows six — and the project FORM told the builder
-- "Photos are added after the project is created, from the project's photo
-- screen", a promise with nothing behind it (no table, no endpoint, no screen).
--
-- Same shape as `listing_photos` (0005 + 0007 bucket + 0016 variants folded in)
-- so `lib/listings/photos.ts` drives both from one implementation rather than a
-- second copy of presign → commit → verify → reorder → cover.
--
-- RLS on, zero policies — identical to every other table here: the browser
-- reads nothing directly, the API is the only path and it applies the same
-- state-access matrix the project itself uses (a non-live project's photos are
-- owner-only, because the project is).

create table if not exists public.project_photos (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  storage_key  text not null,
  url          text,
  bucket       text not null default 'listing-photos',
  alt_text     text,
  position     integer not null default 0,   -- position 0 = cover
  width        integer,
  height       integer,
  variants     jsonb,
  status       text not null default 'uploading'
                 check (status in ('uploading','processing','ready','failed')),
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists project_photos_project_idx on public.project_photos (project_id, position);
create index if not exists project_photos_bucket_idx on public.project_photos (bucket);

alter table public.project_photos enable row level security;

-- `projects` never counted its images; the card and the detail both want the
-- number without a second query, exactly as `listings.photo_count` does.
alter table public.projects
  add column if not exists photo_count integer not null default 0;

comment on column public.projects.photo_count is
  'Denormalised count of project_photos, maintained by lib/listings/photos.ts refreshCover.';

-- Every existing project already has a cover; it becomes photo #1 so no scheme
-- loses the image its builder uploaded and the gallery starts non-empty.
insert into public.project_photos (project_id, profile_id, storage_key, url, position, status)
select p.id, p.profile_id, p.cover_url, p.cover_url, 0, 'ready'
  from public.projects p
 where p.cover_url is not null
   and not exists (select 1 from public.project_photos pp where pp.project_id = p.id);

update public.projects p
   set photo_count = (select count(*) from public.project_photos pp where pp.project_id = p.id);

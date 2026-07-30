-- A8's "Auto-flag appeals" tab offers Dismiss flag ("content restored") and
-- Uphold flag. Neither had anything to act on.
--
-- The bio auto-flag (lib/profile/service.updateOwnProfile) only ever wrote a
-- `moderation_events` row. The bio itself kept showing publicly, so:
--   · "content restored" restored nothing — it was never withheld,
--   · "uphold" changed nothing either, and
--   · the number the flag exists to catch stayed visible on the profile
--     the whole time, which is the thing Doc2 §11 is about.
--
-- The flag becomes real state here. While `bio_flagged_at` is set and unresolved,
-- the PUBLIC profile payload omits the bio entirely (Doc9 §17 — stripped
-- server-side, never hidden with CSS); the owner still sees their own text.
alter table public.profiles
  add column if not exists bio_flagged_at   timestamptz,
  add column if not exists bio_flag_reason  text,
  -- null = still open · 'dismissed' = false positive, bio restored
  -- · 'upheld' = stays withheld
  add column if not exists bio_flag_outcome text
    check (bio_flag_outcome is null or bio_flag_outcome in ('dismissed', 'upheld')),
  add column if not exists bio_flag_resolved_at timestamptz,
  add column if not exists bio_flag_resolved_by uuid references public.profiles(id) on delete set null;

create index if not exists profiles_bio_flag_open_idx
  on public.profiles (bio_flagged_at)
  where bio_flagged_at is not null and bio_flag_outcome is null;

comment on column public.profiles.bio_flag_outcome is
  'Null while an auto-flag is open (bio withheld from public payloads). A8 sets dismissed (restored) or upheld (stays withheld).';

-- Backfill from the events that were already recorded, so the seven existing
-- appeals point at a flag that actually exists rather than at nothing.
update public.profiles p
   set bio_flagged_at  = e.created_at,
       bio_flag_reason = e.detail
  from (
    select profile_id, min(created_at) created_at, max(detail) detail
      from public.moderation_events
     where kind = 'bio_flag'
     group by profile_id
  ) e
 where e.profile_id = p.id
   and p.bio_flagged_at is null;

-- The seeded auto-flag appeals were written without a flag ever being raised, so
-- give each appealing profile the flag it is appealing. Without this the tab
-- shows an appeal against nothing, which is the state that made the buttons
-- meaningless in the first place.
update public.profiles p
   set bio_flagged_at  = coalesce(p.bio_flagged_at, a.created_at),
       bio_flag_reason = coalesce(p.bio_flag_reason, 'Phone number pattern detected')
  from public.moderation_appeals a
 where a.subject = 'auto_flag'
   and a.subject_id = p.id
   and p.bio_flagged_at is null;

-- An appeal already decided before this migration existed should not leave the
-- bio withheld forever: an upheld appeal means the flag stands, a rejected one
-- means the flag stands too, and an appeal the admin allowed means it goes.
update public.profiles p
   set bio_flag_outcome     = case when a.status = 'upheld' then 'dismissed' else 'upheld' end,
       bio_flag_resolved_at = a.resolved_at,
       bio_flag_resolved_by = a.resolved_by
  from public.moderation_appeals a
 where a.subject = 'auto_flag'
   and a.subject_id = p.id
   and a.status <> 'open'
   and p.bio_flag_outcome is null;

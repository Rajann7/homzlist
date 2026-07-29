-- ============================================================================
-- HomzList — Migration 0084: projects become a chat subject
--
-- Until now a project had NO conversation. `chat_threads` could point at a
-- listing (inquiry) or a requirement (proposal); a project detail's only
-- contact affordances were Call and WhatsApp, both of which leave the app and
-- leave behind nothing but a `leads` row (0051). So a builder could be selling
-- 6 projects and have zero of that traffic in Messages.
--
-- This adds the third subject. A project inquiry is the SAME shape as a listing
-- inquiry — kind='inquiry', buyer_id = the interested person, poster_id = the
-- builder — with `project_id` set instead of `listing_id`. Everything already
-- built on threads (participants, unread cursor, requests/accept, blocks,
-- retention, realtime) therefore works on it unchanged.
--
-- No RLS change is needed: chat_threads is deny-all to browser roles (0028) and
-- stays that way; the server API is the only path.
-- ============================================================================

-- ---- 1. the column ---------------------------------------------------------
-- `on delete set null` mirrors listing_id: the conversation outlives the post
-- (Doc2 §10.1 — chats survive archive/expiry/deletion of the subject).
alter table public.chat_threads
  add column if not exists project_id uuid references public.projects(id) on delete set null;

comment on column public.chat_threads.project_id is
  'Project this inquiry is about (0084). Mutually exclusive with listing_id: a '
  'thread has exactly one subject — listing, requirement or project.';

-- ---- 2. one thread per (buyer, project) ------------------------------------
-- The same wall listing inquiries have: re-inquiring reuses the row rather than
-- stacking a second conversation about the same project.
create unique index if not exists chat_threads_project_uniq
  on public.chat_threads (buyer_id, project_id)
  where kind = 'inquiry' and project_id is not null;

create index if not exists chat_threads_project_idx
  on public.chat_threads (project_id)
  where project_id is not null;

-- ---- 3. exactly one subject per thread -------------------------------------
-- Cheap guard against a future writer setting two subjects and making the
-- grouped inbox ambiguous. Written as NOT VALID first so any pre-existing row
-- (all of which have project_id null) cannot block the deploy, then validated.
do $$ begin
  alter table public.chat_threads
    add constraint chat_threads_one_subject check (
      (case when listing_id     is not null then 1 else 0 end) +
      (case when project_id     is not null then 1 else 0 end) +
      (case when requirement_id is not null then 1 else 0 end) <= 1
    ) not valid;
exception when duplicate_object then null; end $$;

alter table public.chat_threads validate constraint chat_threads_one_subject;

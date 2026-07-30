-- A4's ⋯ sheet offers "Assign to another admin". Nothing could store that, so
-- the menu item was a toast with no consequence: the assignee was never told,
-- and the queue row it belonged to looked identical to every other row.
--
-- An assignment is not a lock. A lock is a 10-minute "I am reading this right
-- now" (review_locks); an assignment is "this one is yours to decide", survives
-- the tab closing, and is what makes a night queue divisible between two people.
create table if not exists public.review_assignments (
  subject_type text not null,                     -- listing | requirement | verification | appeal | report | boost
  subject_id   uuid not null,
  assigned_to  uuid not null references public.staff(profile_id) on delete cascade,
  assigned_by  uuid references public.staff(profile_id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),
  primary key (subject_type, subject_id)
);
create index if not exists review_assignments_to_idx
  on public.review_assignments (assigned_to, created_at desc);

alter table public.review_assignments enable row level security;

-- The bell drawer reads `admin_notifications` and it is panel-wide (no staff
-- column), so an assignment could be announced but not addressed. A nullable
-- target keeps every existing row panel-wide and lets an assignment reach one
-- person, which is what "assign to another admin" has to mean.
alter table public.admin_notifications
  add column if not exists staff_id uuid references public.staff(profile_id) on delete cascade;

create index if not exists admin_notifications_staff_idx
  on public.admin_notifications (staff_id, created_at desc);

comment on column public.admin_notifications.staff_id is
  'Null = panel-wide (every admin sees it). Set = addressed to one seat, e.g. a review assignment.';

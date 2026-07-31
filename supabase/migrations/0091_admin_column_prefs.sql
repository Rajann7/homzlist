-- P1 — the shared list engine's only new table.
--
-- The design's column-settings sheet (template 609, 1000) must "persist per
-- admin and survive reload" (§3). Everything else the engine needs already
-- exists in 0088: saved views (admin_saved_views), export requests (exports)
-- and the audit trail (admin_audit_log).
--
-- One row per (staff, resource). `columns` is the ORDERED list of visible column
-- keys, so the sheet's reorder and its show/hide are the same stored value.

create table if not exists public.admin_column_prefs (
  staff_id   uuid not null references public.staff(profile_id) on delete cascade,
  resource   text not null,                    -- listings | users | payments | grants | …
  columns    jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (staff_id, resource)
);

-- Deny-all by default: no anon or authenticated role may read another admin's
-- preferences, or any at all. The admin API reaches these through the
-- service-role client, and only after requireAdmin() has authorized the caller.
alter table public.admin_column_prefs enable row level security;

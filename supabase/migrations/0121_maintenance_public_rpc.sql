-- Maintenance mode has to be readable from the EDGE, or it cannot freeze the API.
--
-- The page-tree gate (components/system/MaintenanceGate.tsx) stops a visitor
-- loading a screen, and stops there: an already-open tab, or anything calling
-- /api/v1 directly, keeps writing straight through a maintenance window. That
-- is not the freeze the word implies, and it matters most in exactly the case
-- maintenance exists for — running a migration.
--
-- The freeze belongs in middleware.ts, which is the one chokepoint every API
-- request passes. But middleware runs on the Edge, where the Supabase JS client
-- and ioredis are both unavailable (app/api/og/route.tsx documents the same
-- constraint). What Edge *can* do is `fetch`, so this is the read path: a
-- SECURITY DEFINER function exposed through PostgREST that returns ONLY the
-- three fields the maintenance page already publishes to anonymous callers via
-- GET /api/v1/system/maintenance. No new information is exposed — the same
-- facts get a second, Edge-reachable door.
--
-- `bypass_roles` is deliberately NOT returned: who may bypass is decided
-- server-side, never by anything the Edge can see.

create or replace function public.hz_maintenance_public()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select json_build_object(
              'enabled', m.enabled,
              'message', m.message,
              'eta',     m.eta)
       from public.maintenance_settings m
      order by m.updated_at desc
      limit 1),
    json_build_object('enabled', false, 'message', null, 'eta', null)
  );
$$;

revoke all on function public.hz_maintenance_public() from public;
grant execute on function public.hz_maintenance_public() to anon, authenticated, service_role;

comment on function public.hz_maintenance_public() is
  'Edge-readable maintenance flag for middleware.ts. Returns only what GET /api/v1/system/maintenance already publishes; never bypass_roles.';

-- ============================================================================
-- P6 helpers — the two things A19's rule editor needs from Postgres, plus the
-- notification the area-request dismiss actually sends.
--
-- The editor stores a rule in two dialects (0106). Storing a POSIX form our own
-- translator produced but Postgres refuses would put a row in the table that
-- silently never matches — which is the failure 0096 documented, moved one step
-- later. So the save path COMPILES the translation in Postgres before trusting
-- it, and "Test match" runs both engines and shows both answers.
-- ============================================================================

/** Does Postgres accept this pattern at all? Raises if not. */
create or replace function public.hz_probe_regex(p_pattern text)
returns boolean language plpgsql immutable set search_path = public as $$
begin
  -- The regex is only compiled when it is used, so it has to be used.
  perform 'homzlist-probe' ~ p_pattern;
  return true;
end;
$$;

/** Run one POSIX pattern against one text, case-insensitively, safely. */
create or replace function public.hz_test_regex(p_pattern text, p_text text)
returns boolean language plpgsql stable set search_path = public as $$
begin
  return coalesce(p_text, '') ~* p_pattern;
exception when others then
  return false;
end;
$$;

revoke all on function public.hz_probe_regex(text) from public, anon, authenticated;
revoke all on function public.hz_test_regex(text, text) from public, anon, authenticated;

-- A19's dismiss overlay tells the requester why. `notification_types.code` is
-- an ENUM, so the type has to exist in the enum before it can exist as a row —
-- the reason this is two statements and not one insert.
alter type public.notification_type add value if not exists 'area_request_dismissed';

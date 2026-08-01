-- ============================================================================
-- The risk score reads the same table the admin edits.
--
-- 0096 hardcoded the four detector regexes into `hz_has_number_pattern` and
-- wrote down exactly why: `number_patterns` held rows in a dialect Postgres
-- cannot run, and nothing read it. 0106 fixed both halves — every row now
-- carries a POSIX translation, and lib/moderation/rules.ts is the app-side
-- reader — so this function stops being the third copy of the rule.
--
-- Two things it deliberately keeps from 0096:
--   · it is still IMMUTABLE-free (it reads a table, so it is STABLE), which
--     means it cannot be used in an index predicate. It is not, today: it is
--     called by the queue views per row.
--   · a row with a NULL or unusable pattern_posix is skipped rather than
--     raising, because one bad pattern must not make the whole listings queue
--     un-queryable.
-- ============================================================================

create or replace function public.hz_has_number_pattern(p_text text)
returns boolean
language plpgsql stable set search_path = public as $$
declare
  r record;
begin
  if coalesce(p_text, '') = '' then
    return false;
  end if;
  for r in
    select pattern_posix from public.number_patterns
     where is_active and pattern_posix is not null and pattern_posix <> ''
       and 'listing' = any(coalesce(applies_to, array['listing']))
  loop
    begin
      if p_text ~* r.pattern_posix then
        return true;
      end if;
    exception when others then
      -- an unusable pattern is not a match, and not an outage
      continue;
    end;
  end loop;
  return false;
end;
$$;

revoke all on function public.hz_has_number_pattern(text) from public, anon, authenticated;

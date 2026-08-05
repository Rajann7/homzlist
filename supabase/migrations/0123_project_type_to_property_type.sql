-- The carousel feed's type rails carry BOTH kinds (Rajan, 5 Aug 2026).
--
-- The first cut gave projects their own rails and properties their own — which
-- split the same subject in two. A buyer looking for a flat wants the apartment
-- SCHEMES and the resale flats in one place. So a type rail is now:
--
--     boosted (any kind) → that type's projects → that type's properties
--
-- which needs one fact the database did not hold: which property type a scheme
-- type belongs under. It is a column on `project_types`, not a map in the code,
-- because it is exactly the kind of thing that changes when master data changes
-- (CLAUDE.md rule 12) — and the P14 master-data screens can edit it.
--
-- An ARRAY, not a single code: "Shops / Showroom scheme" genuinely belongs under
-- both Shop and Showroom, and a scheme that maps to several rails is normal.
-- An EMPTY array is meaningful too — that scheme type gets its own rail (Mixed
-- use has no property-type counterpart), so nothing is ever unreachable.

alter table public.project_types
  add column if not exists property_type_codes text[] not null default '{}';

comment on column public.project_types.property_type_codes is
  'Which property_types.code rails this scheme type appears under in the P2 feed. Empty = it gets its own rail.';

update public.project_types set property_type_codes = case code
  when 'apartment'          then array['flat']
  when 'bungalow_scheme'    then array['bungalow']
  when 'row_house'          then array['tenement']
  when 'farmhouse_scheme'   then array['farmhouse']
  -- One scheme, two rails: the type is literally "Shops / Showroom scheme".
  when 'shopping'           then array['shop', 'showroom']
  when 'commercial_complex' then array['office']
  when 'plotting'           then array['plot_res']
  -- 'mixed' stays '{}' on purpose → its own rail.
  else property_type_codes
end;

-- Every code written above must be a real property type, or a rail would be
-- built for a type that does not exist. Checked here rather than trusted.
do $$
declare bad text;
begin
  select string_agg(distinct c, ', ') into bad
    from public.project_types pt, unnest(pt.property_type_codes) as c
   where not exists (select 1 from public.property_types p where p.code = c);
  if bad is not null then
    raise exception 'project_types.property_type_codes references unknown property type(s): %', bad;
  end if;
end $$;

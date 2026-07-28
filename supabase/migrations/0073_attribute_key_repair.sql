-- 0073 — an answer stored under a key its type never asks for.
--
-- The second half of Rajan's Agriculture Land report (0072 was the first). The
-- section TITLES were wrong, and so was the content: that row genuinely carries
-- `furnishing`, `construction_status` and `society_name`, none of which
-- `plot_agri` asks for — they are pre-`sanitizeAttributes` seed rows, and the
-- detail screen printed them because `attributeRows` deliberately keeps a key it
-- doesn't recognise ("a retired field keeps showing rather than vanishing").
-- That fallback is what put Furnishing on farmland.
--
-- Audited over all 124 live listings: 39 carry at least one such key.
--
-- Two different problems in that list, and only one of them is a data problem:
--
--   • SYNONYMS — the same answer under an older name (`plot_area` where the
--     plot types now say `land_area`, `washroom` for `washrooms`, `floor_no`
--     for `floor`). The value is real and wanted; only the key is stale. Those
--     are renamed here, value-preserving, and only when the correct key is
--     empty so nothing can overwrite a real answer.
--
--   • GENUINELY FOREIGN — `furnishing` on a plot, `ownership_type` on a PG,
--     `wifi` on anything. There is no right key for those on that type. They
--     are left in the row (this migration destroys nothing) and simply stop
--     being rendered: lib/listings/dto.ts now renders only the keys the type
--     actually asks for, which is the global rule Rajan asked for.
--
-- Also normalised: `'true'` / `'false'` stored as STRINGS (corner_plot on 7
-- rows, meals on 3). `renderAttrValue` only recognises real booleans, so those
-- rows printed "Corner plot — false" instead of hiding it.

-- ---------------------------------------------------------------------------
-- 1. Synonym renames (only when the correct key is absent)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.rename_attr(p_types text[], p_from text, p_to text)
returns integer language plpgsql as $$
declare n integer;
begin
  update public.listings
     set attributes = (attributes - p_from) || jsonb_build_object(p_to, attributes -> p_from)
   where type_code = any(p_types)
     and attributes ? p_from
     and not attributes ? p_to;
  get diagnostics n = row_count;
  return n;
end $$;

do $$
begin
  perform pg_temp.rename_attr(array['plot_res','plot_com','plot_agri','plot_farm'], 'plot_area', 'land_area');
  perform pg_temp.rename_attr(array['farmhouse'], 'plot_area', 'land_area');
  perform pg_temp.rename_attr(array['farmhouse'], 'builtup_area', 'construction_area');
  perform pg_temp.rename_attr(array['shop','showroom','office','godown'], 'washroom', 'washrooms');
  perform pg_temp.rename_attr(array['bungalow','tenement','farmhouse'], 'total_floors', 'floor_count');
  perform pg_temp.rename_attr(array['flat'], 'built_up_area', 'builtup_area');
  perform pg_temp.rename_attr(array['flat'], 'floor_no', 'floor');
  perform pg_temp.rename_attr(array['flat','bungalow','tenement','farmhouse'], 'parking', 'car_parking');
end $$;

-- ---------------------------------------------------------------------------
-- 2. String booleans → real booleans
-- ---------------------------------------------------------------------------
do $$
declare r record; k text; patch jsonb;
begin
  for r in select id, attributes from public.listings where attributes::text like '%"true"%' or attributes::text like '%"false"%' loop
    patch := r.attributes;
    for k in select jsonb_object_keys(r.attributes) loop
      if r.attributes ->> k = 'true' then patch := patch || jsonb_build_object(k, true);
      elsif r.attributes ->> k = 'false' then patch := patch || jsonb_build_object(k, false);
      end if;
    end loop;
    if patch <> r.attributes then
      update public.listings set attributes = patch where id = r.id;
    end if;
  end loop;
end $$;

do $$
declare r record; k text; patch jsonb;
begin
  for r in select id, attributes from public.projects where attributes::text like '%"true"%' or attributes::text like '%"false"%' loop
    patch := r.attributes;
    for k in select jsonb_object_keys(r.attributes) loop
      if r.attributes ->> k = 'true' then patch := patch || jsonb_build_object(k, true);
      elsif r.attributes ->> k = 'false' then patch := patch || jsonb_build_object(k, false);
      end if;
    end loop;
    if patch <> r.attributes then
      update public.projects set attributes = patch where id = r.id;
    end if;
  end loop;
end $$;

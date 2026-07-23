-- ============================================================================
-- HomzList — Migration 0021: backfill broken listing location chains
--
-- QA found edit forms rendering a blank location cascade. Root cause: 6 of 10
-- listings had `state_id` + `city_id` + `area_id` set but `district_id` and
-- `taluka_id` NULL — a chain broken in the middle, so the cascade (which needs
-- each ancestor to unlock the next level) couldn't show the city/area.
--
-- The server now reconstructs the chain from parent_id on read, so edit is
-- fixed regardless. This backfills the stored columns too, so the DATA is
-- correct — filters and any future direct query on district/taluka work.
--
-- Fills the ancestors of the deepest id each row has, walking parent_id up.
-- ============================================================================

do $$
declare
  r record;
  cur uuid;
  node record;
  v_state uuid; v_district uuid; v_taluka uuid; v_city uuid;
begin
  for r in
    select id, state_id, district_id, taluka_id, city_id, area_id
    from public.listings
    where (city_id is not null or area_id is not null)
      and (district_id is null or taluka_id is null or state_id is null)
  loop
    v_state := null; v_district := null; v_taluka := null; v_city := null;
    cur := coalesce(r.area_id, r.city_id, r.taluka_id, r.district_id, r.state_id);

    -- Walk up to the root (max 6 hops).
    for i in 1..6 loop
      exit when cur is null;
      select id, parent_id, level into node from public.locations where id = cur;
      exit when not found;
      if    node.level = 'state'    then v_state := node.id;
      elsif node.level = 'district' then v_district := node.id;
      elsif node.level = 'taluka'   then v_taluka := node.id;
      elsif node.level = 'city'     then v_city := node.id;
      end if;
      cur := node.parent_id;
    end loop;

    update public.listings set
      state_id    = coalesce(state_id, v_state),
      district_id = coalesce(district_id, v_district),
      taluka_id   = coalesce(taluka_id, v_taluka),
      city_id     = coalesce(city_id, v_city)
    where id = r.id;
  end loop;
end $$;

-- 0074 — undo one of 0073's renames. `washroom` is not `washrooms`.
--
-- 0073 renamed the stale key `washroom` to `washrooms` on shop / showroom /
-- office / godown rows. Wrong: `washroom` has no field definition at all (it is
-- junk from an old seed) and its stored value is a BOOLEAN, while `washrooms`
-- is a COUNT (`control: chips`). The rename therefore put `true` into a count
-- field, and the detail read "Washrooms — Yes".
--
-- No real count is lost: 0073 only wrote the key where `washrooms` was empty,
-- so every boolean here is one it created. Rows whose seller actually chose a
-- count are untouched (`jsonb_typeof` is `number`/`string` there).

update public.listings
   set attributes = attributes - 'washrooms'
 where jsonb_typeof(attributes -> 'washrooms') = 'boolean';

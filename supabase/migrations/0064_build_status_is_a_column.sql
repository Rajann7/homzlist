-- 0064 — `build_status` is a COLUMN, so it must not also be a scheme field.
--
-- Migration 0062 listed it in every project type's `fields`. That made it two
-- things at once, and the live walk caught both consequences:
--
--   • it rendered TWICE on step 1 — once as the form's own Status chips, backed
--     by projects.build_status, and again inside the scheme's dynamic block,
--   • and the copy inside `attributes` is what the visibility rules then read,
--     so "Launch date" and the two certificates keyed off a duplicate that the
--     Status chips never updated. A ready-to-move scheme lost its Occupancy
--     Certificate and an under-construction one kept a launch date.
--
-- The column is the single value; it is passed to the evaluator as context.

begin;

update project_types
   set field_config = jsonb_set(
         field_config,
         '{fields}',
         (select coalesce(jsonb_agg(f), '[]'::jsonb)
            from jsonb_array_elements_text(field_config->'fields') f
           where f <> 'build_status')
       );

-- Any row written before this fix carries the duplicate; the column is right.
update projects set attributes = attributes - 'build_status' where attributes ? 'build_status';

commit;

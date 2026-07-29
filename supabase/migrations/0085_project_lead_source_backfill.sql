-- ============================================================================
-- HomzList — Migration 0085: file existing project leads under 'project'
--
-- 0081 made `project` a real value of `lead_source`, but the writer that
-- records a Call/WhatsApp tap on a project (lib/listings/projects.ts,
-- recordProjectLead) kept inserting 'inquiry'. Every lead that arrived that way
-- therefore shows in the builder's pipeline — and in the CSV export — as
-- "Property lead", next to leads that really are property inquiries.
--
-- The writer is fixed; this repairs the rows it already wrote. The predicate is
-- exact: a lead with a project_id IS a project lead, whichever door it came
-- through, and no other lead has one.
-- ============================================================================

update public.leads
   set source = 'project'
 where project_id is not null
   and source <> 'project';

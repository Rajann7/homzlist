-- A2's anomaly banners carry their own call-to-action text: the design draws
-- "Open payments", "View rate limits" and "Open reports" on three different
-- banners. The component was rendering a hardcoded "Open" for all of them,
-- which is a label the screen shows and therefore has to be a column
-- (CLAUDE.md rule 7), not a string in a component.
--
-- `link_screen` alone cannot produce it: two anomalies can point at the same
-- screen and still want different words.

alter table public.anomaly_events
  add column if not exists link_label text;

-- Backfill the rows that already exist, from the screen they point at.
update public.anomaly_events
   set link_label = case link_screen
     when 'payments'  then 'Open payments'
     when 'settings'  then 'View rate limits'
     when 'reports'   then 'Open reports'
     when 'analytics' then 'Open analytics'
     when 'users'     then 'Open users'
     when 'listings'  then 'Open listings'
     when 'finance'   then 'Open finance'
     else 'Open'
   end
 where link_label is null
   and link_screen is not null;

-- A link with no words is not a link: if a row names a screen it must name the
-- action too. Enforced going forward, so the next writer cannot skip it.
alter table public.anomaly_events
  drop constraint if exists anomaly_events_link_label_present;
alter table public.anomaly_events
  add constraint anomaly_events_link_label_present
  check (link_screen is null or link_label is not null);

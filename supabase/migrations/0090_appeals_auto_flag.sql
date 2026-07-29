-- Doc5 A8 gives the Appeals queue two tabs: reject-lock reopens AND auto-flag
-- appeals (a bio or description wrongly caught by the number/blocklist
-- detector). Only the first could ever be stored — moderation_appeals.subject
-- was limited to listing/requirement/project, so a user disputing a false
-- positive on their own profile had nowhere to land and that tab could never
-- have a row.
alter table public.moderation_appeals drop constraint if exists moderation_appeals_subject_check;
alter table public.moderation_appeals add constraint moderation_appeals_subject_check
  check (subject = any (array['listing'::text, 'requirement'::text, 'project'::text, 'auto_flag'::text]));

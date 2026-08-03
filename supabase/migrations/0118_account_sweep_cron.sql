-- The job row for /api/v1/cron/accounts, so A22's cron screen lists it with a
-- real last-run status instead of the sweep being invisible to the operators
-- responsible for it.
insert into public.cron_jobs (code, name, schedule, description, enabled)
values (
  'account_sweep',
  'Account + export sweep',
  'Daily 05:40 IST',
  'Expires data-export links past 48h (and deletes the object with them), and purges accounts whose 30-day deletion grace has ended.',
  true
)
on conflict (code) do update set
  name = excluded.name,
  schedule = excluded.schedule,
  description = excluded.description,
  enabled = true;

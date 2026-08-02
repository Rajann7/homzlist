-- ============================================================================
-- The anomaly detector gets a job row (M11.2).
--
-- P3 recorded that `anomaly_events` had five seeded rows and nothing that could
-- write a sixth: A2's banners were a promise with no job behind it. The
-- detector is lib/admin/anomalies.ts, driven by /api/v1/cron/anomalies — this
-- registers it so it appears on A27 with every other job, can be run by hand
-- from there, and can be disabled if it ever gets noisy.
--
-- Every ten minutes: fast enough that a queue backlog is caught while it is
-- still a backlog, slow enough that the sweep's own queries are not the load.
-- ============================================================================

insert into public.cron_jobs (code, name, schedule, description, enabled)
values (
  'anomaly_sweep',
  'Anomaly detection',
  '*/10 * * * *',
  'Report spikes, signup drops, queue backlogs, boost caps and OTP abuse — writes the banners A2 shows.',
  true
)
on conflict (code) do update
  set name = excluded.name,
      schedule = excluded.schedule,
      description = excluded.description;

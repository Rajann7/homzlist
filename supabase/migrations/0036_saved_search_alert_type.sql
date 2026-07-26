-- ============================================================================
-- HomzList — Migration 0036: the saved-search alert notification type
--
-- `saved_searches.alerts_enabled` (0030) promises "tell me when new matches
-- appear". The hidden-issue hunt asks: what code does that, and what triggers
-- it? The job is lib/search/alerts.ts, triggered by the cron in
-- app/api/v1/cron/search. It could not fire, though, because
-- `notification_type` had no value for it — inserting one would have raised.
--
-- Adding the enum value is what turns the toggle from a stored boolean into a
-- feature (Doc2 §12 "Saved searches + new-match alert notifications").
-- ============================================================================
do $$ begin
  alter type notification_type add value if not exists 'saved_search_match';
exception when duplicate_object then null; end $$;

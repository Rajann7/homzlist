-- ============================================================================
-- The risk score's "+3 number-pattern flag" was silently always 0.
--
-- 0095 read the patterns out of `number_patterns`, which looked like the right
-- source of truth: A19 is supposed to edit them. Two things are wrong with it,
-- and only a query proved either:
--
--  1. THE DIALECT. The seeded patterns are JavaScript regexes — `\b`, `(?i)`.
--     Postgres uses POSIX ARE, where `\b` is a BACKSPACE character, not a word
--     boundary (`\y` is). So `'Call me at 9825012345' ~ '\b[6-9]\d{9}\b'` is
--     FALSE. Every pattern in that table returns false against the very sample
--     it was written for.
--
--  2. NOTHING READS THAT TABLE. The app's real detector is the four regexes in
--     lib/listings/validate.ts, which is what actually sets
--     `listings.flagged_reason` at submit time. A risk score derived from a
--     second, unused table would disagree with the flag the moderator sees on
--     the same screen.
--
-- So the score now mirrors the detector that actually runs — translated to
-- POSIX, with `\y` — and keeps `flagged_reason` as the authoritative signal.
-- The `number_patterns` editor (A19, part P6) is recorded in
-- docs/PENDING-INTEGRATIONS.md: it is a table with no reader, and wiring it up
-- means giving it a dialect the server can actually execute.
-- ============================================================================

create or replace function public.hz_has_number_pattern(p_text text)
returns boolean
language sql immutable set search_path = public as $$
  -- lib/listings/validate.ts NUMBER_PATTERNS, as POSIX ARE:
  --   \b → \y   (word boundary)
  --   (?: → (   (POSIX groups are non-capturing for matching purposes here)
  select coalesce(p_text, '') ~ '\y[6-9][0-9]{9}\y'
      or coalesce(p_text, '') ~ '\y[6-9][0-9]{2}[[:space:].-][0-9]{3}[[:space:].-][0-9]{4}\y'
      or coalesce(p_text, '') ~ '\y[+]?91[[:space:].-]?[6-9][0-9]{9}\y'
      or coalesce(p_text, '') ~ '\y[6-9]([[:space:].-]?[0-9]){9}\y';
$$;

revoke all on function public.hz_has_number_pattern(text) from public, anon, authenticated;

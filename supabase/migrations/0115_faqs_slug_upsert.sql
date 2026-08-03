-- 0113 made `faqs.slug` unique with a partial index (`where slug is not null`),
-- which reads as the careful thing to do and is not: Postgres already treats
-- NULLs as distinct in a unique index, so the predicate bought nothing — and it
-- cost the ability to write `on conflict (slug) do update`, which is how the
-- content seed stays idempotent. Same guarantee, plain index.
drop index if exists public.faqs_slug_key;
create unique index if not exists faqs_slug_key on public.faqs (slug);

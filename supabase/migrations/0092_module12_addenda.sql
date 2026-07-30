-- 0092 — MODULE 12 addenda
--
-- Three things 0091 left implicit that P12 actually renders:
--   • the article reader's "Related articles" list is an editorial choice per
--     article (P12 pairs the ₹999 article with refunds + under-review, which
--     cross categories), so it needs its own column rather than a category guess;
--   • the blog hero and post header show a text badge ("Guide", "Legal") that is
--     not the same thing as the category slug used by the filter chips;
--   • ticket numbers are human-facing and sequential (#TKT-2841), so they come
--     from a sequence rather than a random suffix.

alter table public.faqs add column if not exists related_slugs text[] not null default '{}';

alter table public.blog_posts add column if not exists badge text;

create sequence if not exists public.support_ticket_seq start with 2843;

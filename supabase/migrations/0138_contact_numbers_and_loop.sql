-- ============================================================================
-- HomzList — Migration 0138: publisher contact numbers, and closing the loop
--
-- Three gaps the connection system left open, all of them the same shape: a
-- promise with nothing behind it.
--
-- 1. PROJECTS had no contact columns at all. `listings` has contact_public /
--    contact_number / alt_number / whatsapp_number; a project had only
--    rera_number, so a builder could never publish a number and the "Number
--    public" branch of the project screen was drawing data that did not exist.
--
-- 2. A published contact number was never VERIFIED. The create route took
--    `body.contactNumber` as a string, so anyone could publish a stranger's
--    number and hand them the harassment. The sender-side custom number is
--    already OTP-verified through `verified_contact_numbers`; this points the
--    publisher side at the same layer instead of building a second one.
--
-- 3. Nothing ever asked the SENDER whether the connection actually happened.
--    The receiver's tap on Call is one half of the evidence; the sender saying
--    "yes, they called" is the other, and it is the only quality signal the
--    marketplace has now that there are no messages to measure.
-- ============================================================================

-- ---- 1 + 2. contact columns, on both publishable things --------------------
alter table public.projects add column if not exists contact_public   boolean not null default false;
alter table public.projects add column if not exists contact_number   text;
alter table public.projects add column if not exists alt_number       text;
alter table public.projects add column if not exists whatsapp_number  text;

-- Whether the number on the post passed OTP. Existing rows are grandfathered
-- as false rather than silently claimed as verified — the badge must not lie
-- about numbers that were published before there was a check.
alter table public.listings add column if not exists contact_verified boolean not null default false;
alter table public.projects add column if not exists contact_verified boolean not null default false;

-- ---- 3. the sender's half of the loop --------------------------------------
-- null = never asked / not answered. The 48h nudge asks once; the answer is
-- what makes "response rate" a measurement rather than a guess.
do $$ begin
  create type lead_sender_answer as enum ('contacted', 'not_yet');
exception when duplicate_object then null; end $$;

alter table public.leads add column if not exists sender_answer    lead_sender_answer;
alter table public.leads add column if not exists sender_answer_at timestamptz;

create index if not exists leads_sender_answer_idx
  on public.leads (owner_id, sender_answer) where sender_answer is not null;

-- ---- per-target cooldown ----------------------------------------------------
-- One live inquiry per (sender, subject) is already enforced by the unique
-- indexes in 0135. What was missing is the RE-send wall: without it a sender
-- can re-open the same inquiry every few seconds and re-notify the owner each
-- time. The timestamp the wall reads is `updated_at`, which the re-send path
-- already writes, so no new column is needed — this index just makes the
-- lookup cheap.
create index if not exists inquiries_resend_idx on public.inquiries (profile_id, updated_at desc);

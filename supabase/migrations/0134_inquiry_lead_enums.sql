-- ============================================================================
-- HomzList — Migration 0134: enum values for the inquiry/lead connection system
--
-- Split from 0135 on purpose: Postgres will not let a value added by
-- `alter type ... add value` be USED in the same transaction, and the runner
-- wraps one migration per transaction. So the enum labels land here and 0135
-- (which seeds and constrains against them) runs in the next transaction.
--
-- Everything is additive. No existing label is renamed or dropped, so every
-- row written before this migration keeps its meaning.
-- ============================================================================

-- Report on a LEAD (the new "Report" action on a received lead, Doc2 §15).
-- The existing admin reports queue keys off report_subject, so adding the label
-- here is what makes lead reports show up there with assignment, resolution,
-- action-on-user and audit already wired — rather than a second queue.
do $$ begin
  alter type report_subject add value if not exists 'lead';
exception when undefined_object then null; end $$;

-- A proposal used to be 'listing' (offer one of my listings) or 'chat' (talk
-- about it). Chat is gone: the second mode is now "I Can Arrange It" — an offer
-- of help with no listing behind it. 'chat' stays in the enum so historical
-- rows still read; nothing writes it any more.
do $$ begin
  alter type proposal_mode add value if not exists 'help';
exception when undefined_object then null; end $$;

-- The lead pipeline the new design shows is New → Contacted → Converted →
-- Archived. lead_stage already had new/contacted/visit/negotiation/
-- closed_won/closed_lost; adding the two new labels lets the new UI write its
-- own vocabulary while legacy rows keep theirs (lib/listings/leads.ts maps the
-- old four onto the new four for display, so no row becomes unreadable).
do $$ begin
  alter type lead_stage add value if not exists 'converted';
exception when undefined_object then null; end $$;
do $$ begin
  alter type lead_stage add value if not exists 'archived';
exception when undefined_object then null; end $$;

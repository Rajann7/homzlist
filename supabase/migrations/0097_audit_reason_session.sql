-- A26's expandable row renders "old → new diff + reason text + Session: sess_8x2k",
-- and half of the admin panel's dialogs make a reason MANDATORY before they will
-- act (A12 field edits, A11 suspend/role-change/adjust-balance, A18 refunds,
-- A19 node saves…). 0088 gave admin_audit_log the diff but neither the reason
-- the admin typed nor the session it happened in, so the trail could record what
-- changed and never why — which is the part a 180-day legal retention exists for.
alter table public.admin_audit_log add column if not exists reason      text;
alter table public.admin_audit_log add column if not exists session_jti text;

create index if not exists admin_audit_log_session_idx
  on public.admin_audit_log (session_jti) where session_jti is not null;

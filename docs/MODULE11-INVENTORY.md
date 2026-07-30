# MODULE 11 — ADMIN PANEL (P13-14-15): complete inventory + part plan

Rule 1 of the module prompt: list every screen, sheet, popup, button, state and flow
BEFORE building, build all of them, split into parts if too big for one pass, never
deliver incomplete. This file is that list and the part ledger.

Sources: `designs/P13-14-15 - ADMIN DASH FULL.html` (locked visual truth — a bundled
React prototype, 2,768 lines; unpack with the same technique as
`scripts/build-designcheck.mjs`), `design-prompts/p13|p14|p15`, `docs/Doc3` §1,
`docs/Doc5` A1–A31 + FLOW 7, `build/Doc7` (admin endpoints), `build/Doc9` (admin security).

Baseline at start: admin is **3 placeholder files** — `app/(admin)/account/{layout,page,login/page}.tsx`
— plus 3 API routes (`admin/queue/[subject]`, `admin/moderate/[subject]/[id]`,
`admin/account-action`) that gate on the *user* session via `isStaff()`. Everything
else in this document is new. The 53 admin tables + ~19,250 seeded rows already exist
(migrations 0088–0090, `scripts/seed-admin.mjs`).

---

## 0. FOUNDATION (not a screen — every screen depends on it)

- **Google-only auth** (Doc3 §1.1): no email/password/OTP path anywhere. Whitelist =
  `staff` rows added by a super admin; non-whitelisted → logged + denied; removed
  email → sessions invalidated instantly.
- **Isolated session**: separate cookie scope from `homzlist.com`/`seller.` (Doc9 §21),
  30-min timeout, 2h idle heartbeat warning → auto-logout, revoked-mid-session redirect.
- **Login audit**: who/when/IP/device; unknown-email attempts → `admin_login_attempts`;
  5+ attempts → super-admin alert.
- **Permission matrix, server-side** (`staff` / `admin` / `super`) enforced per endpoint
  — never UI-hidden only. 19 capabilities × 3 roles (A25 matrix is the reference).
- **Audit log on every mutation**: `admin_audit_log` with old→new diff, reason, IP,
  session id, severity (sensitive = refunds, deletions, impersonation, evidence, flags).
- **Admin chat = READ-ONLY at the API** — no send even while impersonating.
- **Shared primitives** the 31 screens reuse: data table (sticky header, sortable,
  checkbox column, row 56px, hover/selected, mobile→cards), stacked side-panels +
  breadcrumb trail, saved views, column settings, export sheet, filter chips + sheets,
  bulk bar + confirm, quick-stat hover card, type-to-confirm dialog, doc viewer,
  read-only chat viewer, rich-text editor, JSON editor, toast, skeleton, offline banner,
  lock screen (Super-only areas), role-gated disabled buttons + tooltips.

## 1. SCREEN / CONTROL INVENTORY (A1–A31)

Each screen lists its controls. A control is only "built" when it passes PROOF.md's
5 gates (click → network → DB row → console → reload).

**A1 Login** — Google button · unauthorised-email state · revoked-mid-session state ·
loading · "all admin actions are logged" note.
**A2 Dashboard** — 7 pending tiles (count + oldest-age, SLA colour, tap→queue) · 4 stat
cards + prior-period delta + sparkline · 3 anomaly banners (dismissible) · revenue chart
(7d/30d/6m tabs, legend, tooltip) · SLA-overdue list · cron/backup/uptime strips · bell
drawer · skeleton · offline.
**A3 Listings Queue** — saved views (+save) · column settings · export sheet · 5 sub-tabs
(Pending / Updated-after-edit / Changes-requested / Payment-pending / Rejected) · filter
chips (type/city/risk/date/role) + clear · bulk bar (max 20 + count-confirm) · table
(thumb, type, location, poster + new-account flag, risk badge + reasons tooltip, SLA
timer, status, lock chip, chevron) · sort risk→oldest · keyboard ↑↓ · empty · skeleton.
**A4 Review Detail** — queue position + prev/next + keyboard hints (A/R/→) · exact
user-render tabs (Feed card | Full listing) · risk block with reasons · submitted-fields
list with per-field note icons + number-detection highlight · location breadcrumb ·
ownership doc viewer + name-mismatch note · poster panel + first-listing profile preview ·
prior-history strip + "2 of 3 rejections" · report-context card · SOP checklist ·
**Approve** dialog · **Request changes** note composer (field chips + templates +
poster preview) · **Reject** dialog (8 templates + 3rd-reject lock warning) · ⋯ sheet
(open in user view / assign / internal note / skip) · auto-advance · locked-by-other
read-only · skeleton · offline.
**A5 Requirements Queue + Review** — same pattern; render tabs Unlocked | Locked-view;
budget word-check; areas; own SOP checklist.
**A6 Boost Queue + Review** — promoted-card preview · payment block · 4 eligibility
checks incl. city cap · Approve dialog · Reject-&-refund dialog (auto-refund note).
**A7 Verification Queue** — 4 tabs · side-by-side doc viewer (zoom/rotate/page/download) ·
entered fields (ID masked / RERA + portal link) · checklist · grant-badge dialog (wording
note) · reject reasons · revoke flow.
**A8 Appeals** — 2 tabs · auto-flag appeal card (highlighted content + dismiss/uphold) ·
reject-lock reopen card (history timeline + unlock/keep-locked) · empty.
**A9 Reports Queue** — 5 filter chips · report cards (reason, grouped count, priority) ·
entity previews for listing/user/message (read-only chat context) · reporters list ·
Dismiss / Hide / Warn / Suspend / Ban device / Escalate / internal note · reporter-outcome
note · empty.
**A10 Users List** — saved views · column settings · export sheet (personal-data warning) ·
filters (role/status/plan/city/verification/joined) · table (quick-stat hover card, phone
copy, verification cluster, plans, listings split, leads, status) · 8 row variants · bulk
bar (message/trial/suspend) · empty/skeleton/offline.
**A11 User Detail** (10 tabs) — Overview (inline-edit rows, consent versions, counters,
flags) · Plans (usage bars, pooled/FIFO note, history, grant, adjust-balance) · Payments
(→ stacks A18) · Listings (→ stacks A12) · Requirements (force-expire) · Leads (grouped) ·
Chats (**read-only viewer, no composer anywhere**, deleted-message evidence note) ·
Communication (log + send sheet) · Notes (CRUD) · Timeline (+filters). Flows: suspend/lift,
role change, impersonate, merge accounts (type-to-confirm), ban device, delete user
(double-confirm), adjust balance, grant trial, send message. Role-gating with tooltips.
**A12 Listings Master** — 10 status chips · filters · table + flags · ⋯ sheet · detail
panel with SOP banner + 7 tabs (Preview / Fields with diffs + required reason +
re-review toggle / Photos remove-logged / Leads / Boost pause / Reports / Timeline) ·
bulk bar.
**A13 Plans** — plan cards + stats · edit panel (contents steppers, validity, role
availability, preview, grandfathering confirm) · purchases sub-view · delete-guard ·
+New plan.
**A14 Coupons** — 4 status chips · table · create/edit panel (generate code, discount
type, applies-to, caps, validity) · usage sub-view + totals.
**A15 Grants & Trials** — never-shown-to-users note · filters · table · new-grant sheet
(user search, contents, duration, required reason, notify preview) · extend · revoke.
**A16 Finance** — Revenue (4 KPIs, stacked chart, plan + city breakdowns) · Churn
(expiring/churned + reminder sheet + extension) · Reconciliation (sync, match summary,
mismatch rows, re-check, mark resolved, settlements) · Exports.
**A17 Payments List** — 7 status tabs incl. Abandoned + Chargebacks · search by IDs ·
table (coupon tooltip, method chips) · retry link · ⋯ actions.
**A18 Payment Detail** — summary rows · money breakdown · plan-consumption card + revoke
warning · webhook/reconciliation card + re-check · timeline · invoice (download/resend/
regenerate) · **refund dialog (full-only + type-to-confirm)** · 4 states (pending/failed/
refunded/chargeback).
**A19 Master Data** (6 tabs) — Locations tree + node panel (bilingual names, multi-pincode,
**adjacency mapper** + cascade explainer, highlights, stats) + merge/rename/delete guards ·
Amenities CRUD + icon picker · Property types + role availability + **JSON field-config
editor** + live form preview + validation · Blocklist (4 language tabs, variations, bulk
import) · Number patterns + regex test box · Area requests (add→notify / dismiss).
**A20 CMS** (5 tabs) — Pages + rich editor + versioning + **re-acceptance toggle** +
publish type-to-confirm + history diff + restore · Blog + SEO block + Google preview +
schedule · FAQs + helpful stats + feedback view · Banners + targeting + live feed preview
+ frequency · Broadcasts + audience builder + live count + channel tabs + WhatsApp
template restriction + quiet hours + cost estimate + send confirm + report.
**A21 Templates & Strings** — 4 channel tabs (~16 templates) + variables palette + live
preview + Meta approval chip + DLT counter + test send · UI strings table + missing-
translation filters + inline edit + import/export.
**A22 Settings & Flags** (Super only + lock screen) — 14 feature flags + scope panel +
kill-switch note · Branding + previews + contrast checker · Boost rates + city caps +
top-up + grandfathering · Rate limits (10) + velocity rules (6) · Retention with locked
legal minimums · Maintenance toggle + confirm + global banner + preview + bypass note +
schedule · 6 system actions.
**A23 Tickets** — 5 tabs · filters + SLA colours · thread panel (user context, bubbles,
internal notes, system lines, attachments) · 3 category context blocks (payment / number-
recovery checklist / report) · canned responses · internal-note toggle · assign · priority ·
merge · escalate · close · reopen · **grievance SLA variant**.
**A24 Disputes** — intermediary note · 3 tabs · table · panel (parties, related entity,
read-only chat evidence + logged note, claim, timeline, internal notes, **Section-79
resolution templates**, warn/suspend/remove/mark-resolved, **preserve evidence** Super-only).
**A25 Staff** (Super only) — Google-only note · table (online dot, role dropdown, last
login) · add-staff sheet (3 Google validation states) · **permission matrix** (19 × 3) ·
reset session · remove access · performance sub-view.
**A26 Audit Log** (Super only) — retention note · logged export · filters (admin/action/
entity/date/severity) · rows + inline diffs · sensitive highlighting · impersonation
start/end pairs · evidence-preservation card.
**A27 Cron & System** — health strip (4) + uptime bars · queue depths · 15 cron rows incl.
one failed + Run now + log console · backups + restore drill · errors · cost alerts.
**A28 Analytics** (5 tabs) — Funnel + drop-offs + segments + comparison · 10 events +
breakdowns · Content + admin-only story aggregates + top listings/areas · Cities +
expansion signals + enable-city · Definitions card.
**A29 Trash** — 8 type chips · table + purge countdown · restore/purge dialogs (user +
chat special notes) · bulk · empty.
**A30 Exports** — personal-data warning · table + statuses · new-export sheet (dynamic
filters, personal-data group, required reason) · filters popup · monthly report (Super).
**A31 Impersonation** — top strip + timer · disabled user-app frame (composer **absent**,
not disabled) · tooltips · session panel (capabilities / restrictions) · exit dialog ·
mobile variant.

**Shell (every screen)** — sidebar (240px / 64px rail / mobile drawer, groups, count
badges, role-hiding) · header (breadcrumbs, global search + grouped results dropdown,
bell drawer, staff-online strip, env badge, light/dark, avatar menu) · panel stack ·
toasts · dev-viewport parity (desktop 1440 / tablet 768 / mobile 390).

---

## 2. PART LEDGER

Parts are sequenced so every later part builds on a proven foundation. A part is closed
only with a PROOF.md report (5 gates per control + real DB rows + regression +
propagation) and the security sweep.

| Part | Scope | Status |
|------|-------|--------|
| **P1** | Foundation: Google auth + whitelist + isolated session + heartbeat/revoke · permission matrix (server) · audit-log writer · admin shell (sidebar/header/search/bell/avatar) · A1 Login · A2 Dashboard | ✅ done, DB-verified |
| **P2** | Queues: A3 Listings · A4 Review Detail (all 3 actions + composer + auto-advance + locks) · A5 Requirements · A6 Boosts · A7 Verifications · A8 Appeals · A9 Reports | ✅ **done, DB-verified 30 Jul 2026.** All seven screens live-exercised; every decision proven by real rows and reverted. Closed PENDING gaps A1, A5, M6.4 and the report half of A4. Findings + what is still open: docs/PENDING-INTEGRATIONS.md §M11-P2. |
| **P3** | People & content: A10 Users List · A11 User Detail (10 tabs + all flows) · A12 Listings Master · A31 Impersonation | ⬜ not started |
| **P4** | Money: A13 Plans · A14 Coupons · A15 Grants · A16 Finance · A17 Payments List · A18 Payment Detail | ⬜ not started |
| **P5** | Config & content ops: A19 Master Data · A20 CMS · A21 Templates & Strings | ⬜ not started |
| **P6** | Platform & oversight: A22 Settings & Flags · A23 Tickets · A24 Disputes · A25 Staff · A26 Audit Log · A27 Cron · A28 Analytics · A29 Trash · A30 Exports | ⬜ not started |

### Cross-part obligations (PROOF.md propagation sweep)
- **admin ⇄ public sync**: every flag/setting/CMS/branding/maintenance change must be
  read by the public + seller sides from the same table — verify both directions, not
  just the admin screen.
- **queue actions** already exist for the user side (Module 4 moderation); the admin
  screens must reuse those endpoints/state machines, not fork them.
- Any option list a screen renders (reject templates, ticket categories, dispute
  outcomes, cron names, retention rows) comes from its config table — CLAUDE.md rule 7.

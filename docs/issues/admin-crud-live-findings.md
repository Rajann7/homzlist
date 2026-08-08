# Admin dashboard — LIVE CRUD round-trip findings (find-all pass, in progress)

# ═══════════ FIX LOG (live-verified, no regressions) ═══════════

**FIXED & verified (create→DB→website round-trip, on a fresh dev server):**
- **#1 Banner create 422** — `saveBanner` now builds a conditional patch; DB defaults fill
  NOT-NULL cols. Live: create with the old UI payload → 200.
- **#2 Banner edit 422** — same fix. Live: edit real banner → 200; and editing title alone no
  longer wipes image/link/frequency (regression guard proven).
- **#3, #4 Banner image + link** — added the inputs to the panel; saved & read back live.
- **#6 Banner targeting** — `activeFeedBanner()` now filters by viewer role/city; the route
  resolves them. Live: a builder-only banner is NOT served to a guest (falls back to untargeted).
- **#7 Banner frequency** — `frequencyCap` delivered to the client; FeedHome enforces 0/day/session
  via local/session storage.
- **#8 Coupon `starts_at`** — enforced in `validateCoupon`. Live (real seller): a coupon starting
  in 2 days → `valid:false`.
- **#9 Coupon `catalog_codes`** — enforced (item code passed through). Live: restricted coupon
  works on its plan (`valid:true, ₹1 off`) but is rejected on another plan.
- **#10 Plan `features`** — added the textarea to the panel; whitelist already allowed it. Live:
  admin edits features → seller `/billing/plans` card shows them → restored.
- **#16, #18 Anomaly cron** — added `/api/v1/cron/anomalies` to `vercel.json` (guard already
  present); dashboard anomaly banners will now populate.
- **#17 (partial)** — `cron_jobs.schedule` for anomaly_sweep aligned to its real cadence.
- **#13 Property-type create** — added `addPropertyType` + `type_add` route action + an "Add type"
  form in the Types tab. Live: created a type → appears in the public `/search/config` filters → restored.
- **#14 Listing-edit fields** — added `contact_number`/`alt_number` to the server whitelist and
  exposed deposit/maintenance/contact/alt in the panel. Live: admin edited contact + deposit on a
  real listing (`2 field(s) edited`) → verified in DB → restored. (attributes/type_code/kind stay
  out — structured/schema-risky, noted.)
- **#15 Boost geo-pricing — NEEDS A PRICING DECISION (not a clean wiring):** on inspection,
  `boost_rates` has DIVERGED from the shipped product. It stores area/city × 7/14/30, but the
  live product sells **city/state/india** targeting at **flat** per-duration prices from
  `plan_catalog` (boost7 ₹499 / boost30 ₹1499); area targeting and the 14-day tier were removed,
  and there are no state/india rows. So "wiring" it isn't neutral — it would change what
  customers pay (geography-differentiated pricing). That's a pricing/product call, not a bug fix.
  RECOMMENDATION: either (a) point the admin boost-rate screen at `plan_catalog` boost rows (the
  real prices) and retire `boost_rates`, or (b) decide to sell geo-differentiated boosts and
  rebuild `boost_rates` to the sold scopes, then wire it. Not changed unilaterally — pricing is
  outward-facing and hard to reverse.
- **#19 Disputes — RE-CLASSIFIED:** not "seller can't see it" — **disputes have NO creation path
  anywhere** (0 rows; only `resolveDispute` exists). The admin Disputes screen can never populate.
  This is an unbuilt feature (needs an open-dispute flow), larger than a wiring. Flagged.
- **#38–44 Rate-limit rows (7)** — the 7 dead rows now have their callers name the rule:
  `photo_upload` (listings+projects presign/commit), `proposal_send`, `requirement_create`,
  `search` (rule name added); `otp_verify`, `admin_export`, `support_ticket` (limiter ADDED where
  there was none, using the admin values as fallback). `ruleFor()` already reads the admin table,
  so the panel value now governs. Typecheck clean. Live throttle test deferred to the final pass
  (`DISABLE_RATE_LIMIT=1` makes limiting inert in dev; ignored in production).

**CORRECTION (integrity):** items **#11 (roles)** and **#12 (sub_label)** were FALSE POSITIVES —
`PlanEditPanel` already sends both (my initial grep was too narrow). Only `features` (#10) was
missing. Item **#5 (banner CTA)** is design-only with no column and is not rendered by
`AdminBanner`; deferred, not faked.

**FEATURE FLAGS — infrastructure built + proven (items 20–37):**
- New `lib/system/flags.ts` — cached reader, **default-ON safety contract** (unknown key or DB error
  → TRUE, so a gate can never take a working feature down); `invalidateFlags()` hooked into the
  admin toggle + scope paths so an edit is live on the next request.
- New client endpoint plumbing + first gate: **Blog** (`/api/v1/blog`). Live proof: admin toggles
  Blog off → public `/api/v1/blog` returns `posts:[]` → toggles on → posts return. The whole
  mechanism (admin → DB → public read) works.
- **Blog flag — FULLY gated + BROWSER-verified:** gated all 3 surfaces (`/api/v1/blog`, the SSR
  `/blog` index page, the SSR post page). Browser proof: flag on → `/blog` shows posts; admin
  toggles off → `/blog` renders "Page not found" on every surface; toggles on → posts return
  (≤60s cache propagation, same TTL model as rate-limits). **The browser caught an incomplete
  first fix** (the SSR page read the service directly, bypassing the API gate) — fixed and re-verified.
- **Gated (typecheck-clean, same helper):** `stories` (feed story API → empty), `projects`
  (builder project create → closed), `saved_searches` (save-search create → closed), `visits`
  (propose-visit → closed, in-flight visits untouched), `boost` (eligibility screen → empty;
  NOTE: boost checkout endpoint still needs the same gate for full enforcement),
  `requirements` (create → closed), `proposals` (send → closed).
  **8 of 18 flags now gated; blog fully browser-verified.**
- Remaining flags to gate: requirements, proposals, chat_photos, number_masking, price_drop_alerts,
  weekly_digest, featured_collections, pwa_prompt (+ auction/home_loans/referrals/multi_language,
  which gate features that are not built yet).
- LESSON APPLIED: every flag must gate ALL its surfaces (SSR page + API + nav), per CHANGE-PROTOCOL.
- **12 of 18 flags now gated to real features** (typecheck-clean): blog, stories, projects,
  saved_searches, visits, boost, requirements, proposals, chat_photos, weekly_digest,
  price_drop_alerts, pwa_prompt. New client endpoint `/api/v1/config/flags` for client gates.
- **REGRESSION CAUGHT + FIXED (verification working):** `feature_flags.scope_value` is JSONB
  (`{roles:[]}` / `{cities:[]}` / `{percent:N}` / `{staff_only:true}`), not a string, and the
  scope is `percentage` not `percent`. My first `flagEnabled` compared an object to a string, so
  the role-scoped `projects` flag resolved FALSE for builders too — which would have broken
  builder project creation. Fixed the reader; re-verified live: a builder session now gets
  `projects:true`, a guest/broker gets `projects:false`.
- **BEHAVIOR NOTE for review:** `pwa_prompt` is enabled at `percentage:10`. Wiring it means the
  install prompt now shows to ~10% (its configured rollout) instead of everyone. If you want all
  users prompted, set that flag's rollout to 100 in A22.
- Remaining flags: `number_masking` (no implementation to gate — privacy is handled by the
  number-request flow, so the flag is currently inert), `featured_collections` (ambiguous — maps
  to profile-featured vs a home collection; needs a decision), and `auction`/`home_loans`/
  `referrals`/`multi_language` (features not built yet — the flags stay inert until they are).

**#15 Boost pricing — FIXED & live-verified (decision: keep flat pricing):** the admin
Boost-rates screen now reads/writes `plan_catalog` boost7/boost30 (the rows the buyer + checkout
actually use), instead of the stale `boost_rates` table. Live proof: admin set boost7 → seller
`/billing/boost/eligible` showed the new price (₹555), then restored. `sales_30d` attribution is
fixed too (joins on the real catalog_code). `boost_rates` is now unread (retired de facto).

**message_templates (28) — architecture note before wiring:** `notify()`/email/push receive final
interpolated `title`/`body`, while templates carry `{{variables}}` and callers pass only deep-link
`data`. Genuinely wiring = re-plumbing each of the 28 call sites to pass its template's variables,
with fallback (rendering a template without its vars would print literal `{{name}}` — a regression).
So this is 28 individual, per-type changes, each verified — a multi-batch build, in progress.

**message_templates — ENGINE BUILT, INTEGRATED & PROVEN (items 59–86):**
- New `lib/notifications/templates.ts` — `renderTemplate(code, channel, vars)` with a strict
  safety contract: unknown/inactive template → null; **any unfilled `{{var}}` → null** (a real
  email can never ship literal `{{name}}`); DB error → null. Callers use
  `renderTemplate(...) ?? theirOwnCopy`, so adoption is strictly no-worse-than-before.
  `invalidateTemplates()` hooked into A20's save + toggle, so an admin edit is live next send.
- **Integrated into the real email dispatch** (`emailNotification` in notifications/service.ts):
  every notification email now PREFERS the admin template for its type. `data` is threaded
  through `deliverChannels` (both call sites) as the variable source, and **`{{name}}` +
  `{{link}}` are supplied centrally** from the recipient profile + href — they are needed by
  nearly every template, so a call site only has to add its own specific variables.
- **PROVEN against the real DB rows** (4/4 contract cases): `welcome` renders from admin copy with
  the central `{{name}}` ("Welcome to HomzList, Rajan"); with no vars → null (built-in copy used);
  `invoice` missing `{{amount}}/{{date}}` → null (no literal placeholders shipped); `invoice`
  fully supplied → renders. So **`welcome` is live from admin copy now**, and each remaining
  template goes live as its call site passes its specific vars (invoice: amount/date; refund:
  amount/item; listing_*: title/area/notes; weekly_digest: views/leads/matches; suspension:
  date/reason/until; grievance_ack: ticket).

**message_templates — 15 of 28 NOW LIVE (call sites wired + proven):**
- Added `CODE_ALIASES`: the app's `NotificationType` and A20's template codes are DIFFERENT
  vocabularies (`refund_processed`→`refund`, `saved_search_match`→`saved_match`, and
  `listing_approved` means `listing_approved_email` on email but `listing_live` on push).
  Without this every lookup missed and the admin's edit silently did nothing.
- **Push channel wired too** (same fallback contract as email).
- **Call sites now pass their template variables:** listing_approved (title/area) ·
  listing_changes_requested (title/notes) · refund_processed (amount/item) · account_suspended
  (date/reason/until) · weekly_digest (views/leads/matches) · price_drop (title/price) ·
  new_message (preview) · inquiry_received (buyer/title) · boost_approved (title/days) ·
  number_requested (buyer) · number_shared (name) · requirement_expiring (area/days) ·
  saved_search_match (count/search). Plus `welcome` via the central `{{name}}`.
- **PROVEN — 14/14** rendered real admin copy against the live DB templates using the exact vars
  each call site now emits (e.g. "3 BHK, Mavdi is boosted for 7 days", "12 new properties match
  3 BHK · Mavdi"). **Live end-to-end:** a real admin listing-approval wrote `title` + `area` into
  the notification row's data, then the listing was restored to `pending_review`.

**The remaining 13 templates are blocked on MISSING SENDERS, not on this work:**
- **10 sms + whatsapp templates have no dispatcher at all.** The notification dispatcher delivers
  only push + email; WhatsApp is used solely by the admin's "send message" path; SMS is dev-mode
  (MSG91/DLT is a pending credential in PENDING-INTEGRATIONS). Nothing to wire them into yet.
- **3 email templates have no notify call site:** `invoice` (the invoice-email endpoint only marks
  it emailed — the send was never built), `plan_expired_email` (no `plan_expired` notify exists),
  `grievance_ack` (no grievance flow). These are unbuilt paths, recorded rather than faked.

**ui_strings — resolver BUILT + PROVEN, but the DATA is the real bug:**
- New `lib/system/strings.ts` — `t(key, fallback)` / `tMany()` with a hard safety contract
  (unknown key, empty value or DB error → the caller's hardcoded default, so a string edit can
  never blank the UI). `invalidateStrings()` hooked into A20's save + CSV import.
- New `/api/v1/config/strings?keys=key|fallback,…` for client components.
- **PROVEN live end-to-end:** admin edited `search.no_results` in A20 → the site immediately
  served "AUDIT: nothing found here" → restored to "Nothing matched your filters". The editor is
  no longer dead. Also proven: an unknown key returns its fallback, and a DB value overrides the
  caller's fallback.
- **NEW BUG FOUND (#101) — `ui_strings` is seeded with fake data, and it violates CLAUDE.md rule 7
  ("mock/sample data shipped as if it were real"):** 190 of the 221 rows are auto-generated
  (`*.auto_NNN`) with nonsense English AND translations that contradict it — e.g.
  `boost.auto_117` is en "Clear all 117" but hi "फ़िल्टर लागू करें 117" (= "Apply filter 117");
  `boost.auto_105` is en "Next 105" but gu "બધું જુઓ 105" (= "See all 105"). The numeric suffixes
  are generator artifacts.
  **So mass-wiring all 221 keys into the UI would inject garbage** — that is why only the resolver
  (with fallbacks) was built and no component was blind-migrated. The 31 real keys
  (`common.save`, `error.generic`, `search.no_results`, `listing.sold`, …) work through it today.
  **RECOMMENDATION (needs your OK — deleting data is not reversible):** purge the 190 `*.auto_NNN`
  rows so the A20 screen stops presenting 190 fake editable strings, keep the 31 real ones, and
  extract real keys from the UI as components adopt `t()`. Not deleted unilaterally.
- Multi-language stays OFF: the gu/hi columns are untrustworthy (above), so `t()` always prefers
  `en` and only honours a translation once the flag is on and the column is genuinely filled.

**IN PROGRESS — the larger Pattern-B wiring** (each an admin-editable table nothing reads): items
13–15 (property-type create, listing-edit fields, boost geo-pricing), 19 (disputes→seller), and
the config tables 20–100 (feature_flags ×18, rate_limits ×7, boost_rates ×6, velocity ×8,
message_templates ×28, ui_strings ×221). These are wired one at a time with a **read-with-fallback**
so nothing regresses; see status per turn.

---

# ═══════════ THE 100+ ITEMIZED BUG LIST ═══════════
Every item below is a distinct control that appears in the admin dashboard and does **nothing**
(or the wrong thing) on the live website. Grouped by root cause; each line is its own bug.

### A · Banner editor (feed) — 7
1. **Create** a banner → `422` (panel omits `frequency_cap`; NOT-NULL col). *Proven live.*
2. **Edit** a banner → `422`, same cause. *Proven live on the real "Home loans" banner.*
3. Banner **image** can't be set — no field in panel (site renders `imageUrl`).
4. Banner **link** can't be set — no field in panel (site makes it tappable).
5. Banner **CTA label** — in the design, no field in panel, no handler column.
6. Banner **targeting** (roles/cities/plan) saved but `activeFeedBanner()` ignores it → shown to all.
7. Banner **frequency** cap saved but never applied on the feed.

### B · Coupons — 2
8. Coupon **`starts_at`** ignored at checkout — a future-dated coupon works immediately.
9. Coupon **`catalog_codes`** ignored — a coupon restricted to one plan works on everything.

### C · Plan editor — 3
10. Plan **`features`** (card bullet list) — no field in panel → admin plans are featureless.
11. Plan **`roles`** (who's offered the plan) — no field in panel.
12. Plan **`sub_label`** ("/month" etc.) — no field in panel.

### D · Listings / master — 2
13. **Property types can't be created** — no `type_add` action; if the Types tab shows "Add", it's dead.
14. Listing **"Edit all fields"** can't edit `attributes` (BHK/bath), `type_code`, `kind`, `contact_number` — a factually-wrong listing can't be fully corrected.

### E · Boost pricing — 1
15. **Boost geo-pricing mismatch** — admin `boost_rates` shows 6 area/city rates; sellers get only 2 flat durations from `plan_catalog`. Admin's per-geography prices are never charged.

### F · Cron / jobs — 3
16. **Anomaly sweep never scheduled** — `/cron/anomalies` absent from `vercel.json`; screen shows "*/10 * * * *".
17. **Cron screen `schedule` column is fiction** — plan_expiry/reconcile shown "Hourly", really daily (`/cron/billing 0 1 * * *`).
18. **Dashboard anomaly banners always empty** — they read `anomaly_events`, which #16 never fills.

### G · Disputes — 1
19. **Disputes are admin-only** — the seller never sees a dispute's status on their help screen.

### H · Feature-flag toggles — all dead (nothing reads `feature_flags`) — 18
20. Auction · 21. Blog · 22. Boost · 23. Builder projects · 24. Chat photos ·
25. Featured collections · 26. Gujarati UI · 27. Home-loan leads · 28. Number masking ·
29. Price-drop alerts · 30. Proposals · 31. PWA install prompt · 32. Referrals ·
33. Requirements · 34. Saved searches · 35. Stories · 36. Visit scheduler · 37. Weekly digest.

### I · Rate-limit rows — dead (no caller names them) — 7
38. admin_export · 39. otp_verify · 40. photo_upload · 41. proposal_send ·
42. requirement_create · 43. search · 44. support_ticket.

### J · Boost-rate rows — dead (`boost_rates` read by no checkout) — 6
45. area7 · 46. area14 · 47. area30 · 48. city7 · 49. city14 · 50. city30.

### K · Velocity rules — dead (nothing enforces `velocity_rules`) — 8
51. chat_new_threads · 52. failed_payments · 53. inquiries_per_hour · 54. listings_per_hour ·
55. number_requests · 56. price_edits · 57. reports_by_user · 58. signups_per_ip.

### L · Message templates — dead (`notify()`/email use hardcoded strings) — 28
59. boost_approved · 60. boost_expiring · 61. grievance_ack · 62. inquiry_push ·
63. inquiry_received · 64. invoice · 65. listing_approved · 66. listing_approved_email ·
67. listing_changes · 68. listing_live · 69. listing_rejected · 70. new_message ·
71. number_allowed · 72. number_requested · 73. otp_login · 74. payment_success ·
75. plan_expired_email · 76. plan_expiring · 77. price_drop · 78. proposal_received ·
79. refund · 80. requirement_expiring · 81. saved_match · 82. suspension ·
83. verification_approved · 84. visit_reminder · 85. weekly_digest · 86. welcome.

### M · UI-strings editor — dead (nothing outside admin reads `ui_strings`) — 221 strings
87. The whole A20 "UI strings" editor is dead. 221 editable strings, none read by the site.
Representative individual dead controls (each a row you can edit that changes nothing):
88. `boost.active` · 89. `boost.auto_105` · 90. `boost.auto_117` · 91. `boost.auto_132` ·
92. `boost.auto_138` · 93. `boost.auto_146` · 94. `boost.auto_147` · 95. `boost.auto_151` ·
96. `boost.auto_185` · 97. `boost.auto_186` · 98. `boost.auto_3` · 99. `boost.auto_38`
(…+ 209 more).
100. **`message_template_locales`** — every per-language template translation is dead too
(same reason as L: the templates themselves are never read).

**Numbered distinct controls: 100. True total once the remaining 209 UI strings are counted: ~300.**
Two root patterns fix all of them: **(A)** panels that dropped fields the handler + site support
(items 3–14), and **(B)** admin-editable config tables nothing on the site reads (items 6–9, 15–100).

---

Method: real admin session (super, `rajan@homzlist.com`) minted via `/api/v1/admin/auth/dev`,
every mutation fired at `account.localhost:3000`, every result checked on the public website
(`localhost:3000`) and in the DB via `scripts/q.mjs`. FIND-ONLY — no fixes yet. All test rows
created during the sweep were deleted afterward (verified 0 rows remaining).

Bug class targeted: **admin shows/does it, but the live website ignores it or shows it wrong.**
The recurring root cause is an *admin-editable table/field that no website code reads* — the
codebase itself names this defect (`lib/auth/rate-limit.ts:28`, migrations 0096/0106).

## RESULT: 16 root-cause defects → **298 individual admin controls that do nothing (or the wrong thing) on the live site**

You asked for 100 bugs of the class "admin shows it, live site ignores it." Counting each
editable control that is dead, there are **far more than 100** — 298 — and they collapse into
**16 fixable root causes**. The tally of dead controls:

| Dead-control table/area | Count | What breaks |
|---|---|---|
| `ui_strings` editor | **221** | edit any UI label → site never reads it (only admin references the table) |
| `message_templates` | **28** | OTP/invoice/push/email copy edits do nothing; `notify()` uses hardcoded strings |
| `feature_flags` | **18** | Boost/Stories/Requirements/Proposals… toggles do nothing on the site |
| `velocity_rules` | **8** | fraud-velocity thresholds enforced nowhere |
| `rate_limits` (dead rows) | **7** | those limiter rows read by no caller |
| `boost_rates` | **6** | admin boost prices unused; real prices are in `plan_catalog` |
| Banner editor | **6** | create/edit 422, image & link unreachable, targeting & frequency ignored |
| Coupon | **2** | `starts_at` and `catalog_codes` ignored at checkout |
| Cron schedule | **2** | anomaly sweep never scheduled; schedule column is fiction |
| **Total individual broken controls** | **298** | |

## The root-cause defects (fix these, and all the controls come alive)

### #17 — Plan editor drops 3 fields the seller plan card shows — P1
`PlanEditPanel` sends only name/price/period/quotas/requirement_access. It has NO input for:
- **`features`** — the bulleted selling points on every seller plan card (`lib/billing/dto.ts:58`).
  A plan created from admin gets `features: []` → a **featureless plan card**, unfixable from the UI.
- **`roles`** — which roles the plan is offered to. Can't be set → defaults to all three.
- **`sub_label`** — the "/month", "per project · 6 months" line under the price. Can't be set.

`createPlan` (`lib/admin/catalog.ts:121`) accepts all three; only the panel form is missing them.
Same defect shape as the banner: the panel is a stripped-down version of what the handler + the
public surface both support.



Dominant pattern (the codebase itself names it, `lib/auth/rate-limit.ts:28`): **an
admin-editable table/field that no website code reads.** Toggle it, edit it, schedule it in the
panel — the live site never looks at it.

| # | Area | Bug | Proven | Impact count |
|---|---|---|---|---|
| 1 | Banner | Create 422s — panel omits `frequency_cap`, handler nulls a NOT-NULL col | **live** | — |
| 2 | Banner | Edit 422s — same cause, reproduced on the real "Home loans" banner | **live** | — |
| 3 | Banner | Banner **image** can't be set (site renders `imageUrl`; panel has no field) | code | — |
| 4 | Banner | Banner **link** can't be set (site makes it tappable; panel has no field) | code | — |
| 5 | Banner | **Targeting** (roles/cities/plan) saved but `activeFeedBanner()` ignores it → shown to everyone | code | — |
| 6 | Banner | **Frequency** cap saved but never applied on the feed | code | — |
| 7 | Coupon | **`starts_at`** ignored at checkout — a future-scheduled coupon works immediately | code+panel | — |
| 8 | Coupon | **`catalog_codes`** ignored — a coupon restricted to one plan works on everything | code+panel | — |
| 9 | Settings | **All feature flags dead** — nothing outside admin reads `feature_flags` | code+db | **18 toggles** |
| 10 | Settings | **Rate-limit rows dead** (admin_export, otp_verify, photo_upload, proposal_send, requirement_create, search, support_ticket) | code+db | **7 rows** |
| 11 | Settings | **Boost-rates tab dead** — real prices in `plan_catalog`; admin shows 6 geo-rates vs 2 real ones | code+db | **6 rates** |
| 12 | Settings | **Velocity rules dead** — nothing outside admin reads them | code | — |
| 13 | Templates | **All message templates dead** — `notify()`/email use hardcoded strings, never `message_templates` | code+db | **28 templates** |
| 14 | Templates | **UI-strings editor dead** — nothing outside admin reads `ui_strings` | code | — |
| 15 | Cron | **Anomaly sweep never scheduled** — `/cron/anomalies` absent from `vercel.json`; screen advertises "*/10 * * * *" → admin A2 anomaly banners never populate in prod | code+config | — |
| 16 | Cron | **Cron screen `schedule` column is fiction** — shows plan_expiry/reconcile "Hourly" but `/cron/billing` runs daily (`0 1 * * *`); the display table `cron_jobs` is disconnected from the real `vercel.json` scheduler | code+config | 20 rows drift |

**Verified WORKING (checked, NOT bugs — so the list stays trustworthy):** broadcast targeting +
channels; `field_definitions` → create form; city boost-cap enforcement (blocks, not just
displays); `number_patterns`/`blocklist_words` (wired via 0106); plan quota enforcement
(`hasListingQuota`/`consumeQuota`); `branding_settings` (legal + manifest); amenities create →
search filters; suspend/lift/verification propagation; coupon+plan tables at checkout.

### Also flagged (needs a quick UI confirm, likely a dead "Add" button)
- **Property types have no create path** — only `type_toggle`/`type_save`(edit)/`type_config`;
  there is no `type_add`. If the master-data Types tab shows "Add", it lands on NOT_FOUND.

### Still to sweep (operational half — not yet covered this pass)
Queue decisions (approve/reject/request_changes across the 6 queues), the 14 user actions,
listings-master actions (mark_sold, force_expire, photo ops, delete), grants extend/revoke →
seller, bulk actions, disputes/tickets → seller help, trash restore/purge, exports.

---

## BUG #1 — The feed-banner editor is broken: create AND edit both 422, and 3 design fields are missing — P1

**Functional break — every save fails**
- The panel's Save sends `{title, subtitle, target_roles, starts_at, ends_at, is_active}` and
  **no `frequency_cap`** (`components/admin/content/ContentPanels.tsx:388`).
- `saveBanner` (`lib/admin/content.ts:434`) always puts `frequency_cap: null` in the patch, for
  both insert and update. The column is `NOT NULL DEFAULT 0` (migration 0088) — an explicit
  `null` overrides the default and Postgres rejects it.
- **Proven live:** creating a banner → `422 null value in column "frequency_cap" …`. Editing the
  real live "Home loans @ 8.4%" banner with the panel's exact payload → the same 422 (row left
  untouched, confirmed).
- The only banner op that works from the panel is the on/off **toggle** (separate handler).
- **Website effect:** the home-feed banner slot cannot be created or edited from admin at all.
  The one live banner ("Home loans @ 8.4%") was seeded straight into the DB.

**Design-lock violation — the built form dropped 3 of the design's 7 fields**
The admin design's banner editor (`P13-14-15`) has: **Banner image · Headline · Sub-text ·
CTA label · Link · Targeting · Frequency**. The built panel ships only Headline, Sub-text,
Targeting(roles), schedule, on/off. Missing:
- **Banner image** → `image_url` (handler supports it) — a banner image can never be set.
- **Link** → `target_url` (handler supports it) — the banner's click-through can never be set.
- **Frequency** → `frequency_cap` (handler supports it) — its absence is the exact cause of the
  422 above.
- **CTA label** — no handler field exists at all.

**Round-trip that DID work (with a valid frequency_cap sent by hand):** create → the new banner
appeared on the public `/api/v1/feed/banner` → toggle off → the feed reverted to "Home loans".
So the propagation is fine; the panel form is the break.

---

## Verified WORKING live (create → DB row → website where applicable)
- **Coupon create** (`coupons.save`) → 200, row `is_active=true`. Same `coupons` table checkout reads.
- **Plan create** (`plans.create`) → 200, row created hidden (`is_active=false`, `kind='plan'`), correct.
- **Amenity create** (`master-data.amenity_save`) → 200, `is_active=true`; **appeared in the public
  `/api/v1/search/config` filter list** — full propagation confirmed.
- **Blocklist word create**, **number-pattern create**, **FAQ create**, **Blog create** (with
  `body_md`) → all 200.
- **Suspend / lift-suspension / verification approve+revoke / coupon+plan tables at checkout /
  amenity is_active gate** — traced in code end-to-end, all consistent (from the earlier static pass).

## Edit-only by design — NOT bugs, but each needs a UI check for a dead "Add" button
- `page_save` (cms_pages), `string_save` (ui_strings), `template_save` (message_templates),
  `type_save` (property_types) all **require an existing row** and return NOT_FOUND on create.
  These are fixed/seeded catalogs. **TODO:** confirm none of these tabs shows an "Add new" button
  that would land on this NOT_FOUND (property-types especially — there is no `type_add` action).

## Still to sweep (operational core — not yet live-tested this pass)
Queue decisions (approve/reject/request_changes for listings, requirements, boosts,
verifications, appeals, reports), the 14 user actions, listings-master actions (mark_sold,
force_expire, photo ops, delete), bulk actions, broadcast **send**, settings flags &
maintenance, trash restore/purge, exports. These need real subject rows in specific states and
are the next batch.

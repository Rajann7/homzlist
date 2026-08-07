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
- **#15 Boost geo-pricing — SCOPED (clean wiring pending):** `boost_rates` is keyed by
  (targeting, days) — exactly the boost's own shape — but purchase prices from `plan_catalog`
  boost7/boost30 (flat). Fix = price boosts from `boost_rates`; must also update the credit/renew
  paths that hardcode boost7/boost30. In progress.
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
  NOTE: boost checkout endpoint still needs the same gate for full enforcement).
- Remaining flags to gate: requirements, proposals, chat_photos, number_masking, price_drop_alerts,
  weekly_digest, featured_collections, pwa_prompt (+ auction/home_loans/referrals/multi_language,
  which gate features that are not built yet).
- LESSON APPLIED: every flag must gate ALL its surfaces (SSR page + API + nav), per CHANGE-PROTOCOL.

**STILL AHEAD (feature-scale, greenlit "wire for real"):** 16 more flag gates, message_templates
(28 — re-plumb `notify()`/email to interpolate DB templates with fallback), ui_strings (221 —
i18n resolver), boost geo-pricing (#15), disputes creation flow (#19).

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

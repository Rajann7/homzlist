# DOC 7 — HOMZLIST API LIST (Part 1)

> **SUPERSEDED — 11 Aug 2026 · chat removed, connections are leads.**
>
> Every passage below that describes chat threads, the message composer,
> accept/decline before connecting, number requests (Allow/Deny), "waiting for
> reply", or a proposal turning into a conversation is **no longer how HomzList
> works**. Those tables still exist for dispute evidence, but nothing reads or
> writes them.
>
> What replaced it: a sender answers three questions — **what** they want, **how**
> they want to be contacted (call / WhatsApp, own or an OTP-verified alternate
> number), and **when** — ticks the consent line, and that becomes a **lead** on
> the receiving side. The receiver acts with Call or WhatsApp, and the tap is
> recorded. A lead moves New → Contacted → Converted → Archived. Requirements are
> answered with **I Have a Property** or **I Can Arrange It**, both quota'd, both
> landing as the same lead.
>
> Surfaces: `/leads` (Received grouped by your own post, and Sent), the admin
> read-only **Lead panel**, and reports with `subject_type = 'lead'` in the
> existing reports queue. Implementation: migrations 0134-0136, `lib/inquiry/*`,
> `lib/leads/*`, `components/inquiry/*`, `components/leads/*`.


*Complete backend contract. Every endpoint, request/response shape, RLS rule, websocket event, env, and the backend-only rule. Nothing frontend-decided. All ~70 endpoints. Base: `/api/v1/`. Auth via httpOnly session cookie (30-day refresh + 15-min access). Errors: `{ code, message_key }` — friendly message translated on client, detail only in server logs.*

---

# SECTION 0 — GLOBAL RULES

- **Backend-only:** every business decision (paid-status, roles, numbers, locked content, listing-state access) is server-side. Frontend never holds a "flag" that grants access.
- **Auth:** cookie-based. Access token 15 min, refresh 30 days (httpOnly, subdomain-scoped, rotating). Middleware validates on every protected route (SSR — no data flash).
- **Authorization:** every endpoint checks role + ownership server-side. RLS on every Supabase table as a second wall.
- **Validation:** every input validated server-side (type, length, format, enum). Reject empty/oversized/malformed gracefully.
- **Response envelope:** `{ ok: true, data }` or `{ ok: false, error: { code, message_key } }`.
- **Pagination:** cursor-based — `?cursor=<id>&limit=<n>`; returns `{ items, nextCursor }`.
- **Rate limits:** per-endpoint (Doc 9). Auth tight, feed loose. No CAPTCHA.
- **Idempotency:** payment/webhook/proposal-send use idempotency keys.
- **Subdomain scope:** `(public)` endpoints are guest-readable; `(seller)` need seller session; `(admin)` need admin Google session on `account.homzlist.com`.

---

# SECTION 1 — AUTH (`/api/v1/auth`)

**1. POST `/auth/otp/request`** — start login/registration.
Req: `{ phone }` (+91, 10-digit). Server: rate-limit (3/hr/number, 10/day/IP), honeypot check, generate OTP (DEV: fixed/logged; PROD: MSG91 via provider layer), bind to session.
Res: `{ ok, data: { otpSession, resendIn: 30, attemptsLeft: 3 } }`. Generic — never reveals if number is registered (anti-enumeration).

**2. POST `/auth/otp/verify`** — verify OTP.
Req: `{ otpSession, code }`. Server: check attempts (3), lock after 10 fails/day (24h), success → issue access+refresh cookies.
Res new user: `{ ok, data: { isNew: true, next: "role" } }`. Existing: `{ ok, data: { isNew: false, user, next: "feed"|"seller" } }`. Fail: `{ ok:false, error:{ code:"OTP_INVALID", ... attemptsLeft } }`.

**3. POST `/auth/otp/resend`** — resend (max 3/session, 30s gap).

**4. POST `/auth/register`** — after OTP (new user): set role + basic details.
Req: `{ role:"owner"|"broker"|"builder", name, city_id, photo?, consent18:true, consentDpdp:true, tcVersion }`. Server: store consent versioned, create profile.
Res: `{ ok, data: { user, redirect } }`.

**5. POST `/auth/logout`** — clear cookies (this device).
**6. POST `/auth/logout-all`** — invalidate all sessions.
**7. GET `/auth/sessions`** — login activity (devices, last-active, IP-city).
**8. POST `/auth/session/:id/revoke`** — logout a specific device.
**9. POST `/auth/refresh`** — rotate access via refresh cookie.
**10. GET `/auth/me`** — current user (role, plan-summary, badges). Server-derived; source of truth for client gating.

**11. POST `/auth/number-change/start`** — dual-OTP: verify current number → returns session.
**12. POST `/auth/number-change/verify-old`** / **13. POST `/auth/number-change/verify-new`** — complete change.
**14. POST `/auth/saved-accounts`** — list masked saved accounts (device-local hint only; server validates on pick).

RLS: `profiles` — user reads/writes own row; public reads only public columns (name, role, badges, bio, city) of others.

---

# SECTION 2 — PROFILE & VERIFICATION (`/api/v1/profile`)

**15. GET `/profile/:username`** — public profile (server strips private fields: no Views/Leads/number for others).
**16. GET `/profile/me`** — full own profile (stats Listings/Views/Leads, verification, featured, pinned).
**17. PATCH `/profile/me`** — edit (name, bio [server number/URL auto-flag → admin queue], city, builder/broker extras). Photo via image pipeline.
**18. POST `/profile/verification/id`** — upload ID doc (private R2, signed). → admin verification queue.
**19. POST `/profile/verification/rera`** — RERA number + certificate → queue.
**20. GET `/profile/verification/status`** — levels (phone/id/rera: pending/approved/rejected/revoked).
**21. POST `/profile/featured`** / **22. DELETE `/profile/featured/:id`** — curate featured circles.
**23. POST `/profile/pin/:listingId`** / **24. DELETE** — pin up to 3.
**25. GET `/profile/account-status`** — rejections/warnings/reports-against-me.
**26. POST `/profile/role-change-request`** — request role change → admin approval.

RLS: verification docs — owner + admin only (signed URLs). Views/Leads columns — owner + admin only.

---

# SECTION 3 — PLANS, PAYMENTS, BOOST (`/api/v1/billing`)

**27. GET `/billing/plans`** — role-filtered plans (₹999/₹2,999/₹9,999), current prices (admin-editable), features. Server returns only plans valid for the user's role.
**28. GET `/billing/my-plan`** — active plans, pooled balances (FIFO), usage bars, consumed-trace, grace/trial state, expiry. **All computed server-side.**
**29. POST `/billing/checkout`** — create Razorpay order.
Req: `{ planId | boostId | topupId, couponCode?, gstin? }`. Server: compute amount + GST server-side (never trust client), create order, reserve slot (state: reserved).
Res: `{ ok, data: { razorpayOrderId, amount, keyId } }`.
**30. POST `/billing/webhook`** (Razorpay) — **HMAC-verified**, idempotent. On `paid`: verify amount/currency/status server-side → activate plan/boost/top-up (slot: consumed), generate invoice, notify. On mismatch: flag. Guess-proof path.
**31. POST `/billing/verify`** — client callback after checkout (server re-checks status with Razorpay; never activates on client word alone).
**32. GET `/billing/payments`** — history (statuses: success/pending/failed/refunded/chargeback), filters.
**33. GET `/billing/payments/:id`** — detail.
**34. GET `/billing/invoice/:id`** — invoice (GST line items, payment ID). PDF via server.
**35. POST `/billing/invoice/:id/email`** — resend invoice (Resend).
**36. POST `/billing/coupon/validate`** — server validates (per-user limit, expiry, min-value, applies-to).
**37. POST `/billing/topup`** — +10 proposals (₹499) → checkout; on success auto-send pending proposal if any.

**Boost:**
**38. GET `/billing/boost/eligible`** — only approved/live listings.
**39. POST `/billing/boost`** — create boost (listingId, duration, targeting city/state/india) → checkout → admin-approval queue.
**40. GET `/billing/boost/status`** — active/pending/expired/rejected; "active till" only (NO analytics to user).
**41. POST `/billing/boost/:id/renew`** — 1-tap renew.
**42. POST `/billing/boost/:id/cancel`** — cancel pending → refund.

Rules: payment-first (no listing form before plan). No refund except technical failure (atomic revoke → unpublish). Requirement-quota (toggle-on-after-renewal consumes; off/delete still counted) enforced server-side. RLS: billing rows — owner + admin only.

---

# SECTION 4 — LISTINGS & PROJECTS (`/api/v1/listings`)

**43. GET `/listings/config`** — dynamic field config (JSON) per property type (show/hide rules, units). Drives the form; new types added here without code.
**44. POST `/listings/draft`** — create/update draft (auto-save; max 3; 90-day expiry). Server validates partial.
**45. GET `/listings/drafts`** / **46. DELETE `/listings/draft/:id`**.
**47. POST `/listings`** — submit listing (requires reserved slot). Full server validation mirrors client (warnings-only never block, but required fields enforced). Sets state `pending_review`. Number/description auto-flag.
Req: type-specific payload (BHK/area/units/Vigha-Guntha/price[on-request/negotiable]/location cascade/amenities/contact-toggles/ownership-proof). 
**48. POST `/listings/:id/photos/presign`** — presigned R2 upload URLs (client uploads direct). 
**49. POST `/listings/:id/photos/commit`** — attach uploaded photos → enqueue image job (WebP/variants/EXIF-strip/watermark). Reorder, cover, alt-labels, per-photo retry.
**50. POST `/listings/:id/brochure`** — builder PDF → ClamAV scan → compress.
**51. GET `/listings/:id`** — detail. **Server enforces state-access matrix**: draft/pending/rejected/changes → owner+admin (else 404); hidden/archived → owner+admin; deleted → 404; live → public. Numbers: public only if owner set public; else absent from payload (Request-Number flow).
**52. PATCH `/listings/:id`** — edit (minor price → auto-approve; major photos/location → re-review while live version stays).
**53. POST `/listings/:id/status`** — sold/rented/completed/re-activate/restore (state machine + auto-actions: savers notified, boost auto-stop, sitemap update, chats banner).
**54. DELETE `/listings/:id`** — soft delete → 30-day trash.
**55. POST `/listings/:id/duplicate`** — copy fields (not photos), new slot.
**56. GET `/listings/mine`** — manager (all statuses, field-notes on changes-requested, expiry prompts).
**57. POST `/listings/:id/still-available`** — Yes/No answer to lifecycle prompt.
**58. GET `/listings/:id/stats`** — own only: views (unique/day self-excluded), saves, shares, leads.

**Projects (builder):**
**59. POST `/projects`** — project (RERA required/exempt+reason, unit-type repeater, floor plans, banks, possession). ₹9,999 slot.
**60. GET `/projects/:id`** — detail (numbers always public). 
**61. PATCH `/projects/:id/units`** — update unit availability.

RLS: listings — owner writes own; public reads only `live`; admin all. Ownership-proof docs — owner+admin.

---

# SECTION 5 — REQUIREMENTS, PROPOSALS, MATCHING (`/api/v1/requirements`)

**62. POST `/requirements`** — post (via quota). Fields: type, buy/rent, budget min/max, areas[], BHK, urgency, notes (number-detection). 30-day life. → admin review.
**63. GET `/requirements/browse`** — browse. Query: `?kind=sell|rent&type=<code>&city=<uuid>`. **Unpaid: server returns ONLY preview fields** (type, area, intent) — full data (budget, poster, contact) stripped server-side (DevTools-proof). Paid (₹2,999): full. Cascade sections (nearby). `noindex`.
  `city` is the GUEST's city-chip pick, validated as a `locations` row of level `city`; a signed-in profile's city always wins, so it cannot re-scope an account.
  Res adds `scope {cityId,cityName,stateId,stateName,source}` and `empty {title,subtitle,action}` — `empty` is non-null ONLY when there is nothing to show, and carries the server's copy plus the action the screen must offer (`pick_city`). Section tiers: `exact|adjacent|city` inside the city, then the fallbacks `state` ("Other cities in <State>", city empty) and `india` ("Across India", no city known). The LEADING section always has `label: null`.
**64. GET `/requirements/:id`** — locked/unlocked/own per entitlement (server-decided). Res: `{ requirement, unlockPlan }` — `unlockPlan` is non-null only for a LOCKED viewer and is the plan **their role** may buy (builder → p9999, owner/broker → p2999), read from `plan_catalog`. Never hardcode the price or the code on the screen.
**65. GET `/requirements/mine`** — with toggle state, proposals count, matching-strip.
**66. POST `/requirements/:id/toggle`** — on/off (server: on-after-renewal consumes quota; off still counted; confirm on client but enforced here).
**67. POST `/requirements/:id/fulfill`** / **68. DELETE** — (delete still counts quota).
**69. PATCH `/requirements/:id`** — edit → re-review + re-match.

**Proposals:**
**70. POST `/requirements/:id/proposals`** — send (2 modes: attach-listing | chat-request). Server: atomic quota decrement; duplicate guard; self-proposal blocked; if balance 0 → return `NEED_TOPUP` (client opens inline top-up). 
**71. GET `/requirements/:id/proposals`** — poster view: received proposals **with sender's number auto-visible** (the number rule — poster sees sender directly).

Poster receives unlimited proposals while their plan is active — no per-sender cap (a single sender may send multiple proposals as long as their own quota lasts).

**72. GET `/proposals/mine`** — sent proposals (statuses: pending/accepted/declined/expired/fulfilled; non-refund on expiry).
**73. POST `/proposals/:id/accept`** — opens chat. **74. POST `/proposals/:id/decline`**. **75. POST `/proposals/:id/not-relevant`** — 5 flags → sender admin-flagged.

**Matching:**
**76. GET `/match/for-requirement/:id`** — reverse-match (properties matching a requirement).
**77. (internal job)** — matching cascade (exact landmark→adjacent→city, budget ±20%) powers feed-fill, story order, builder auto-notify (3/day live + digest). Runs on approve/edit.

RLS: requirements — poster writes own; browse gated by entitlement (enforced in query + API strip). Proposals — sender + poster + admin.

---

# SECTION 6 — FEED & STORIES (`/api/v1/feed`, `/api/v1/stories`)

**78. GET `/feed`** — main feed. Query: `?mode=property|requirement&filter=buy|rent&sort=latest|nearby|price&cursor=&limit=`. Server: city from user profile; ranking = boosted (FIFO: boost-start then listing-date) → location cascade tiers (exact→adjacent→city, labeled) → recency; own listings excluded; responsive-seller slight boost. Returns mixed property+project cards (never requirements). Cursor pagination.
  **`city`** (all feed reads): the GUEST's city-chip pick. Validated as a `locations` row of level `city`; a signed-in profile's city always wins, so it can never re-scope an account. Omitted → unscoped for a guest who has not picked one.
Res: `{ items, nextCursor, sections:[{label:"Nearby: University Road", items}] }`.

**78a. GET `/feed/sections`** *(added 5 Aug 2026 — the carousel home feed)* — which RAILS the Property-mode feed draws, in order, for this viewer. Query: `?filter=buy|rent` (default all). Returns `{ sections, emptyCity }` — `emptyCity: { cityName }` when the viewer picked a city with nothing live, so the rails are ALL-INDIA and the screen says so (9 Aug 2026). Metadata only; rails carry no cards. On the home screen every rail is server-rendered with the page (lib/feed/initial) and this endpoint is only hit for a chip/sort/city change or by the PWA.
  **`city`** (all feed reads): the GUEST's city-chip pick. Validated as a `locations` row of level `city`; a signed-in profile's city always wins, so it can never re-scope an account. Omitted → unscoped for a guest who has not picked one.
Order *(reordered 8 Aug 2026 — Rajan)*: `HomzList top picks` (projects) → `Newly-added properties` (listings) → `Featured Developers` (builders) → `Featured Brokers` (brokers) → `Featured properties` (everything boosted, both kinds) → `Have a property to sell?` (CTA block) → `News and Articles` (blog). The per-type rails (`type:` / `ptype:`) were **removed from this response** in the same change — type-wise browsing lives on Search.
A rail with **0 live rows in the viewer's scope is not returned at all** (auto-hide), and a Buy/Rent chip removes the projects rail — the same rule `/feed` applies. `sell_cta` is the one section always present (it is a call to action, not a list). Counts come from `hz_feed_type_counts` (migration 0122) **plus** the boosted rows reaching in from outside the scope, so the number under a heading equals the cards the rail hands out. `featured` ships `viewAll: ""` — "boosted" is not a search filter, so it deliberately has no target rather than one that opens a different set.
Res: `{ sections: [{ key, kind:"projects"|"newly_added"|"builders"|"brokers"|"featured"|"sell_cta"|"news", title, subtitle, total, viewAll }] }`.

**78b. GET `/feed/section`** — one rail's page. Query: `?key=projects|newly_added|featured|builders|brokers|news|sell_cta&filter=&sort=&cursor=`. Same `getFeed` query as 78, narrowed to that rail — so boosts, the not-interested rules and card shape are identical inside a rail. Cursor = `live_at` for card rails, a numeric offset for the people rails, `published_at` for `news`. `sell_cta` answers with an empty page. Unknown/malformed key → 422. The retired `type:<code>` / `ptype:<code>` keys are **still accepted** so a PWA on a pre-8-Aug-2026 bundle keeps working.
  **`city`** (all feed reads): the GUEST's city-chip pick. Validated as a `locations` row of level `city`; a signed-in profile's city always wins, so it can never re-scope an account. Omitted → unscoped for a guest who has not picked one.
Res: `{ items, people, posts, nextCursor }`.

**79. GET `/feed/requirement-mode`** — requirement cards; **unpaid → locked cards (preview fields only, server-stripped)**; boosted-locked top. Identical payload and query to 63 (one engine) — this one is IP rate-limited because the requirement-mode feed is reachable anonymously on the public host. The feed surface MUST use this route, not 63.

**80. GET `/feed/builder-dashboard`** — builder role only: own project stats + matched requirements (no foreign listings). `matched: [{ card, matchedTo, tierLabel }]` where `card` is the SAME access-stripped browse card as 63/79 — a builder without active requirement access gets locked cards with no budget in the payload. Matching type set comes from `project_types.property_type_codes`, never a hardcoded list.

**81. ~~GET `/feed/suggested`~~** — **REMOVED 8 Aug 2026** with the home-feed reorder. The "Suggested for you" strip was the same recency set as the new `newly_added` rail in a smaller card, so the strip, the endpoint and `lib/feed/service.suggested` all went together rather than leaving a route nothing calls.

**82. POST `/feed/not-interested`** — down-rank a type/area for this user.

**83. GET `/feed/new-count`** — count of new listings since last-seen cursor (drives "New listings" pill; only surfaced if user on-feed ≥30s — client gates display, server gives count).
  **`city`** (all feed reads): the GUEST's city-chip pick. Validated as a `locations` row of level `city`; a signed-in profile's city always wins, so it can never re-scope an account. Omitted → unscoped for a guest who has not picked one.

**Stories:**
**84. GET `/stories`** — auto-generated only: approved listings/projects from last 24h in user's city; cascade order (selected area→adjacent→city), NO cap, boosted first, project rings distinct. One poster/day = one circle multi-segment. Server computes seen-state per city. NO add-story anywhere.
  **`city`** (all feed reads): the GUEST's city-chip pick. Validated as a `locations` row of level `city`; a signed-in profile's city always wins, so it can never re-scope an account. Omitted → unscoped for a guest who has not picked one.
Res: `{ circles:[{ posterId, segments:[{listingId, cover, price, ...}], ring:"unseen|seen|project|boosted" }] }`.
**85. POST `/stories/:segmentId/seen`** — mark seen (per-city seen store). No view-count exposed to owners.
**86. GET `/stories/:segmentId`** — story media (signed URL, **24h expiry** — dead after). Mid-24h sold/hidden → "No longer available" state.

RLS: feed/story queries respect listing state (`live` only for others), boost approval, and city.

---

# SECTION 7 — INQUIRY, CHAT & NUMBER (`/api/v1/chat`)

**87. POST `/chat/inquiry`** — send inquiry (FREE unlimited; anti-bot 100/day). Req: `{ listingId, message, intentChips[], shareNumber:bool }`. Creates a **chat request** (accept-before-seen). Self-inquiry blocked. One thread per user-per-listing (revives existing). Min-profile (name+city) required.
**88. GET `/chat/requests`** — poster's incoming requests (verified/others tabs; preview-before-accept; proposal variant shows **sender number auto**).

When a proposal/inquiry references a property, it renders as a clickable RICH CARD (thumbnail + price + BHK + location + status), like a WhatsApp/Instagram link preview — tapping opens the full listing. Same rich-card render applies wherever a listing is shared inside chat (§93).

**89. POST `/chat/requests/:id/accept`** — open thread (seen-status starts now). **90. POST `/chat/requests/:id/decline`** — 30-day cooldown (shown to sender).
**91. GET `/chat/threads`** — 4 tabs server-scoped: `?tab=my-listings|my-inquiries|requirement-leads|my-responses`; grouping (per-listing/requirement), unread filter, pin/mute/archive states.
**92. GET `/chat/threads/:id`** — messages (50/page, cursor up-scroll). Pinned listing card (live price). Server returns number **only if allowed** (else absent — DevTools-proof).
**93. POST `/chat/threads/:id/message`** — send (2000-char cap, photo via pipeline, link-preview). Optimistic on client; server persists + realtime broadcast. Number-pattern detection → soft-warn flag (admin). Profanity blocklist flag.
**94. POST `/chat/threads/:id/read`** — mark read (seen ticks).
**95. POST `/chat/messages/:id/react`** / **96. DELETE `/chat/messages/:id`** (for-me/everyone; soft-kept for admin evidence).
**97. POST `/chat/messages/:id/report`** — report a message.

**Number system (the rule):**
**98. POST `/chat/threads/:id/request-number`** — sender asks for poster's number.

**99. POST `/chat/threads/:id/number-response`** — poster Allow/Deny (confirm). Allow → NumberCard payload appears (copy+call). Deny → sender may re-request UNLIMITED times (no cooldown, no auto-block, no limit). The number is NEVER auto-revealed under any condition — only an explicit Allow reveals it. (Abuse is handled only via general rate-limiting, never by blocking the re-request feature.). **Number never in payload before Allow.**
Note: poster always sees the **sender's** number automatically (server includes it for poster side only).

**Visits & pipeline:**
**100. POST `/chat/threads/:id/visit`** — propose slots. **101. PATCH `/chat/visits/:id`** — confirm/reschedule/cancel/outcome. 
**102. GET `/visits/mine`** — buyer consolidated visits.
**103. GET `/leads`** — broker/builder pipeline (stages New→Contacted→Visit→Negotiation→Closed; trust info; visit-outcome feeds stage). **104. PATCH `/leads/:id/stage`**. **105. GET `/leads/export`** — CSV.
**106. POST `/chat/threads/:id/block`** / **107. quick-reply templates CRUD** (`/chat/templates`).

RLS: threads/messages — participants + admin (admin READ-ONLY, cannot POST message even via impersonation — enforced at API, not just UI). Number rows — gated by allow-state.

---

# SECTION 8 — SEARCH & SEO (`/api/v1/search`, public SEO routes)

**108. GET `/search/autocomplete`** — `?q=` debounced; returns suggestions (areas), landing-pages, recents. All-Indian-script Unicode input accepted.
**109. GET `/search`** — `?q=&tab=all|properties|projects|brokers|areas&filters=&sort=&cursor=`. Dynamic per-type filters (facing/tenant/furnishing/bath/budget/BHK/amenities). Result count. Cascade "Nearby". Zero-results → suggestions + requirement CTA. **Unpaid requirement results locked (server-stripped).**
**110. GET `/search/recent`** / **111. DELETE** — recent searches (max 20, mode-wise).
**112. POST `/search/saved`** — save search → new-match alerts (retention). **113. GET `/search/saved`** / **114. PATCH toggle alerts / DELETE**.

**SEO (SSR public pages, not JSON APIs — but server-rendered):**
- `/[city]`, `/flats-for-sale-in-[area]-[city]`, `/[bhk]-flats-for-rent-in-[city]`, `/plots-for-sale-in-[city]`, `/pg-in-[city]`, `/commercial-[type]-for-[intent]-in-[city]`, `/new-projects-in-[city]` — programmatic, **indexable only with ≥3 live listings** (else `noindex` + requirement CTA).
- Title/meta formulas, H1 = query, rotating unique-content blocks, nearby + cross-links, schema (RealEstateListing/ItemList/BreadcrumbList/FAQPage).
- **115. GET `/sitemap-[type].xml`** (listings/landing/areas/static) + index; sold auto-removed. **116. GET `/robots.txt`** (admin/chat/requirements/api disallowed). OG images generated server-side.
- **117. GET `/area/[area]-[city]`** — area page (stats, highlights, listings) = SEO landing + user browse.
- **118. POST `/city/request`** — "coming soon" interest register (expansion signal).

RLS/gating: requirement search results gated server-side; SEO pages guest-readable.

---

# SECTION 9 — NOTIFICATIONS (`/api/v1/notifications`)

**119. GET `/notifications`** — grouped Today/Week/Earlier; filters; unread. 23 types (inquiry, number-request [inline Allow/Deny], approval/rejection/changes, proposal, price-drop, saved-match, matching-requirement, still-available [inline Yes/No], expiries, plan/trial/boost, payment/refund, report-outcome, suspension-lifted, new-device, performance-nudge, area-added, digest).
**120. POST `/notifications/read-all`** / **121. POST `/notifications/:id/read`** / **122. POST `/notifications/:id/action`** (inline Allow/Deny/Yes/No).
**123. GET `/notifications/prefs`** / **124. PATCH** — per-category toggles (marketing separate — DPDP; payment can't be off). Quiet hours. 
**125. POST `/notifications/fcm-token`** — register device push token (Android/iOS-PWA/desktop).
Channels: FCM push + Resend email + WhatsApp (later). Server rules: grouping, batch/channel dedup, quiet-hours hold, 90-day purge.

RLS: notifications — recipient only.

---

# SECTION 10 — ADMIN (`/api/v1/admin/*` — `account.homzlist.com` only, Google-auth, whitelist)

*All admin endpoints: server-side role + permission-matrix check (Staff/Admin/Super), every action audit-logged (old→new), admin chat READ-ONLY enforced.*

**Auth/shell:** 126 `POST /admin/auth/google` (whitelist check; unauthorized/revoked) · 127 `GET /admin/me` · 128 `GET /admin/dashboard` (pending tiles+SLA, stats+deltas, anomalies, revenue, cron/backup) · 129 `GET /admin/search` (phone/name/listing-ID/payment-ID/order-ID).

**Queues:** 130 `GET /admin/queue/:type` (listings/requirements/boosts/verifications/appeals/reports; risk-score sorted; saved views; lock) · 131 `POST /admin/review/:id/approve` (→ live+story+notify+SEO ping) · 132 `POST /admin/review/:id/request-changes` (per-field notes; stays pending; no reject-count) · 133 `POST /admin/review/:id/reject` (templates+notes; 3→lock) · 134 `POST /admin/queue/:type/bulk` (max 20) · 135 `POST /admin/verification/:id/approve|reject|revoke` · 136 `POST /admin/boost/:id/approve|reject` (reject→auto-refund) · 137 `POST /admin/appeal/:id/resolve` · 138 `POST /admin/report/:id/action` (dismiss/hide/warn/suspend/ban; reporter auto-notified).

**Users:** 139 `GET /admin/users` (filters, export-audited) · 140 `GET /admin/users/:id` (deep-drill: plans/payments/listings/leads/chats[read-only]/comm-log/notes/timeline) · 141 `PATCH /admin/users/:id` (edit) · 142 `POST /admin/users/:id/suspend|lift` · 143 `POST /admin/users/:id/role` · 144 `POST /admin/users/:id/grant-trial` · 145 `POST /admin/users/:id/adjust-balance` (reason required) · 146 `POST /admin/users/:id/impersonate` (logged; **sends disabled**) · 147 `POST /admin/users/:id/message` · 148 `POST /admin/users/:id/merge` · 149 `POST /admin/users/:id/ban-device` (Super) · 150 `DELETE /admin/users/:id` (Super, double-confirm).

**Listings/Finance/Payments:** 151 `GET/PATCH /admin/listings/:id` (edit-with-diff + reason + re-review toggle; remove-story; pause-boost) · 152 `GET /admin/finance` (revenue/churn/reconciliation) · 153 `POST /admin/reconcile/sync` · 154 `GET /admin/payments` · 155 `GET /admin/payments/:id` · 156 `POST /admin/payments/:id/refund` (full-only, reason, type-to-confirm, atomic revoke, notify) · 157 `POST /admin/payments/:id/retry-link` · 158 `POST /admin/invoice/:id/regenerate`.

**Plans/Coupons/Grants:** 159 `GET/POST/PATCH /admin/plans` (grandfathering) · 160 `/admin/coupons` CRUD · 161 `/admin/grants` (trial log + new grant).

RLS/permission: enforced per matrix; audit table append-only.

---

# DOC 7 — HOMZLIST API LIST (Part 3 — Final)

---

# SECTION 11 — MASTER DATA (`/api/v1/admin/master`)

**162. GET `/admin/master/locations`** — location tree (state→district→taluka→city/village→area/landmark). **163. POST/PATCH/DELETE** — CRUD (delete-guard when listings exist). **164. POST `/admin/master/locations/merge`** — merge (listings move; URL redirects). **165. PATCH `/admin/master/locations/:id/adjacency`** — set adjacent landmarks (**powers the matching + feed + story cascade**). **166. PATCH `.../pincodes`**, `.../names` (English + Gujarati bilingual), `.../highlights` (plain text, area page + SEO).
**167. GET `/admin/master/area-requests`** — user "request area" queue → **POST `/admin/master/area-requests/:id/add`** (creates area + notifies requester) / dismiss.
**168. `/admin/master/amenities`** CRUD (applies-to type). **169. `/admin/master/property-types`** CRUD + **170. field-config JSON editor** (validates JSON; drives dynamic form; new types without code). **171. `/admin/master/blocklist`** CRUD (multi-script, variations). **172. `/admin/master/number-patterns`** CRUD (regex + test box).

*Public read: `GET /locations` (for cascading selects, cities, areas), `GET /amenities`, `GET /listings/config` — cached, guest-usable.*

**Full-India data note:** location master seeded from official postal/government datasets (states, districts, talukas, cities, villages, pincodes) at launch import; Rajkot/Gujarat detailed + adjacency mapped first; import job + admin CRUD keep it complete so nothing is added manually later. Every landmark discussed is covered via this master + area-request loop.

---

# SECTION 12 — CMS, LEGAL, BLOG (`/api/v1/admin/cms`, public read)

**173. GET `/cms/page/:slug`** — public legal/CMS page (Terms/Privacy/Refund/Disclaimer/Community/Grievance/Cookie/About) — versioned, from Doc 10 content. **174. admin `/admin/cms/pages`** CRUD + **175. version history + diff + restore** + **176. re-acceptance toggle** (forces users to re-accept on next login; versioned consent).
**177. GET `/blog`, `/blog/:slug`** — public (SEO, SSR). **admin `/admin/cms/blog`** CRUD + SEO fields + schedule.
**178. GET `/cms/faqs`** — public. **admin CRUD** + helpful-votes + feedback view.
**179. `/admin/cms/banners`** CRUD (image, targeting city/role/plan-status, schedule, frequency). **180. `/admin/cms/broadcasts`** (audience builder + count + channels + cost estimate + send). 
**181. GET `/cms/branding`** — public (logo/name/color/favicon/OG — admin-editable, reflects live). **admin `PATCH /admin/settings/branding`**.

*Admin↔public sync: CMS/branding/flags/plans/master edits purge relevant caches and reflect on public + seller immediately.*

---

# SECTION 13 — TEMPLATES, SETTINGS & FLAGS (`/api/v1/admin`)

**182. `/admin/templates`** — email/SMS/WhatsApp/push editors + variables + test-send (Meta-approved WhatsApp only; DLT for SMS). **183. `/admin/strings`** — UI translation strings (EN/GU/HI, missing-translation filter, inline edit). 
**184. `GET/PATCH /admin/settings/flags`** — feature flags (scope: all/percentage/city/role/staff). **When off → feature auto-hides, no gap** (client honors server flag, SSR, no flash). **185. `/admin/settings/boost-rates`**, **186. `/admin/settings/city-caps`**, **187. `/admin/settings/rate-limits`**, **188. `/admin/settings/velocity`**, **189. `/admin/settings/retention`** (legal minimums locked: audit 180d, payments 7yr). **190. `POST /admin/settings/maintenance`** (toggle + ETA + message; admin bypass). **191. system actions**: purge CDN, regenerate sitemaps, rebuild search index, recalc area stats, resend failed notifications, clear rate-limit blocks.

---

# SECTION 14 — SUPPORT, DISPUTES, STAFF, AUDIT (`/api/v1/admin`)

**192. `/admin/tickets`** — queues, assign, canned responses, internal notes, close/reopen; category context (payment→refund, number-recovery→verification checklist, report→entity); **grievance SLA** (24h ack + ticket-number, 15-day resolution). *(Public: `POST /support/ticket`, `GET /support/tickets/mine`.)*
**193. `/admin/disputes`** — structured log (parties, related entity, read-only chat evidence, resolution templates with **Section-79 intermediary stance**, mark-resolved, notify parties, **preserve evidence** Super-only).
**194. `/admin/staff`** — list, **add (Google-linked email validation, whitelist → instant access)**, role change, remove (**instant session revoke**), reset session, performance; **permission matrix** enforced. Min 2 super admins.
**195. `GET /admin/audit`** — every admin action (old→new diff, IP/device, sensitive-highlight, filters); export-audited; evidence-preservation lock (Super).

---

# SECTION 15 — SYSTEM, ANALYTICS, TRASH, EXPORTS (`/api/v1/admin`)

**196. `GET /admin/cron`** — job status (last/next/success), **`POST /admin/cron/:job/run`** (run-now), logs. Health (API/DB/Redis/queues), queue depths, error rate, backups (+restore-drill date), cost alerts (SMS/WhatsApp/storage/CDN budgets).
**197. `GET /admin/analytics`** — funnel (signup→plan→listing→lead + drop-offs), events (the 10 wired), story aggregates (admin-only — users never see story views), city breakdowns + expansion signals (enable-city), pinned definitions (view/lead).
**198. `/admin/trash`** — soft-deleted browser (restore/purge with countdown; user/chat special notes). **199. `/admin/exports`** — export center (personal-data warning, dynamic filters, reason for payments/audit, 48h expiry, monthly report). **200. `/admin/impersonation`** — session (top strip, disabled sends, capabilities/restrictions, exit logged).

**Public data-rights:** **201. POST `/data/download`** — user's own data (profile/listings/own-messages/payments — JSON/CSV zip; others' privacy never leaked). **202. POST `/account/deactivate`** / **203. POST `/account/delete`** (30-day grace, 7-day payment-hold, type-to-confirm, OTP re-verify).

---

# SECTION 16 — REALTIME (Supabase Realtime / WebSocket events)

Client subscribes per-user + per-thread. Events:
- `message.new` / `message.seen` / `message.deleted` / `message.reaction` — chat.
- `typing.start` / `typing.stop` — chat.
- `request.new` / `request.accepted` / `request.declined` — inquiries/proposals.
- `number.requested` / `number.allowed` / `number.denied` — number flow.
- `notification.new` — bell badge + push.
- `listing.new` — feed "New listings" pill count.
- `visit.updated` — scheduler.
- `boost.status` / `payment.status` / `listing.status` — status changes.
- `admin.queue.updated` — admin live counts.

Rules: events carry IDs only (client re-fetches gated data via API so RLS/entitlement applies); numbers never in event payloads before allow.

---

# SECTION 17 — CRON JOBS (BullMQ, watchdogged, 2AM IST unless noted)

1. Listing expiry check (2-month "still available?") 2. Project expiry (1-year) 3. Auto-hide after 15-day no-response 4. Auto-delete hidden after 1 month 5. Requirement expiry (30-day) + reminders (5d/1d) 6. Plan expiry (hourly, purchase-ts+period IST) + reminders (7d/1d) + grace 7. Story cleanup (hourly, 24h media expiry) 8. Orphan media cleanup (7-day) 9. Notification purge (90-day) 10. OTP log purge (30-day) 11. Chat archive (30-day inactive) + purge (12-month) 12. Reconciliation sync (hourly) 13. Sitemap regeneration (on approve + daily) 14. Weekly digest (Mon 9AM) 15. Backup (daily) + monthly retention 16. Matching job (on approve/edit) 17. Image processing (on upload) 18. Trash purge (30-day).
Each: notified + audit-logged; watchdog → admin email on failure; admin "Run now".

---

# SECTION 18 — RLS SUMMARY (every table — mandatory, Supabase)

| Table | Read | Write |
|---|---|---|
| profiles | public cols: all · private: owner+admin | owner+admin |
| listings/projects | live: public · other states: owner+admin | owner+admin |
| ownership_docs / brochures | owner+admin (signed) | owner |
| requirements | preview: entitlement-gated · full: paid/owner/admin | poster+admin |
| proposals | sender+poster+admin | sender+admin |
| chat_threads/messages | participants+admin(read-only) | participants (admin cannot send) |
| number_reveals | gated by allow-state | system |
| billing/payments/invoices | owner+admin | system+admin |
| notifications | recipient | system |
| saved/collections/activity/visits | owner | owner |
| leads | listing-owner(broker/builder)+admin | system+owner |
| audit_log | admin(Super) | append-only(system) |
| master_data/cms/settings/flags | public read (published) · admin write | admin(role-gated) |
| staff | Super | Super |

**Rule:** RLS is the second wall; API authorization is the first. Both required. Service-role key server-only (never client).

---

# SECTION 19 — BACKEND-ONLY ENFORCEMENT MAP (no frontend trust)

- Paid status / plan balance / entitlement → server (`/auth/me`, `/billing/my-plan`); client never grants access from a local flag.
- Locked-requirement full data → stripped server-side; never in payload for unpaid.
- Numbers → absent from payload until Allow; poster-sees-sender computed server-side.
- Listing-state URL access → server matrix (404 vs owner+admin vs public).
- Role/permissions → server; admin actions permission-checked server-side (not UI-hidden only).
- Prices/amounts/GST/coupon → computed server-side at checkout; webhook verifies; client amounts ignored.
- Feature flags/branding/plans/master → server (SSR); off = no flash, no gap.
- Views/leads/story-views definitions → server-computed; users never get story views.

---

# SECTION 20 — ERROR CODES (friendly to user, detail to logs)

`OTP_INVALID`, `OTP_LOCKED`, `RATE_LIMITED`, `NUMBER_LOCKED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `PLAN_REQUIRED`, `QUOTA_EXHAUSTED`, `NEED_TOPUP`, `PAYMENT_FAILED`, `PAYMENT_PENDING`, `DUPLICATE_PROPOSAL`, `SELF_ACTION_BLOCKED`, `LISTING_STATE_LOCKED`, `NUMBER_NOT_ALLOWED`, `VALIDATION_ERROR`, `FILE_TOO_LARGE`, `FILE_TYPE_BLOCKED`, `MAINTENANCE`, `SERVER_ERROR`.
Each maps to a `message_key` → translated friendly message (EN/GU/HI). Stack/detail → Sentry + structured logs only. Never leak internals to client.

---


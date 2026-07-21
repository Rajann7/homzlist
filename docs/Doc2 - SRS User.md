# DOC 2 — HOMZLIST MASTER SRS (PART A: USER SIDE PLATFORM SPEC)

*Complete functional specification of the user-facing platform. Every rule, business logic, state machine, permission, and edge case. Doc 3 covers Admin/System/Security/SEO/Architecture. Screen-level UI lives in Doc 4; this doc defines WHAT the system does.*

---

# 1. PLATFORM DEFINITION

- **Product**: HomzList (homzlist.com) — Instagram-style real estate listing platform. PWA (installable web app, no app store). Mobile-first; desktop = centered 470px column.
- **Content**: Properties (sale/rent), Builder projects, Requirements. Photos + text only — NO video/reels, NO follow system, NO map, NO comments on posts, NO user-uploaded stories.
- **Languages**: UI in English/Gujarati/Hindi (translation files; instant switch; error messages included). User content untranslated; ALL text inputs + search accept every Indian script (Unicode). Designs English-only.
- **Modes**: Global Property mode / Requirement mode toggle — switches feed + search context; persists per device; projects included in Property mode.
- **Dark mode**: full support. **Live updates**: no page reloads anywhere (city change → in-place feed refresh; chat/notifications real-time via WebSocket; everything else optimistic UI + background sync).

# 2. ROLES & PERMISSIONS

| Capability | Guest | Owner | Broker | Builder |
|---|---|---|---|---|
| Browse feed/search/detail (incl. shared links) | ✅ full view | ✅ | ✅ | ✅ |
| Save/like/inquiry/post/chat | ❌ → login wall | ✅ | ✅ | ✅ |
| List property (sale/rent) | ❌ | ✅ ₹999 | ✅ ₹999 | ✅ ₹999 |
| Post project | ❌ | ❌ | ❌ | ✅ ₹9,999 |
| Post requirement | ❌ | ✅ quota | ✅ quota | ✅ quota |
| View requirements | ❌ | ₹2,999 | ₹2,999 | ₹2,999 (project-matched: included unlimited) |
| Send proposals | ❌ | quota | quota | quota |
| Verified badges | — | Phone/ID | Phone/ID/RERA | Phone/ID/RERA |
| Leads pipeline screen | — | basic list | ✅ full | ✅ full |
| Feed type | public | all listings | all listings + own performance cards | **dashboard feed** (own stats + matched requirements only) |

- Role chosen at registration (Owner/Broker/Builder cards). Role change = profile request → admin approval (admin can also direct-change, logged). Multiple brokers may list the same property (no exclusivity, no duplicate logic — allowed by design). Co-ownership normal.
- Builder listing individual property uses ₹999 plan; builder never sees PG/irrelevant types in creation.
- PG/Hostel type: Owner/Broker only.

# 3. AUTHENTICATION & ACCOUNT

**3.1 Login (phone+OTP only; no password/email/social)**
- +91 fixed, 10-digit; E.164 stored. OTP 6-digit; 3 verify attempts/session; resend after 30s countdown, max 3 resends/session; account lock: 10 failed verifies/day per number = 24h lock + admin alert. SMS limits: 3 OTP/hour/number, 10/day/IP. WebOTP autofill (Android). OTP SMS English (DLT templates). Provider fallback (auto-switch). Honeypot field on registration.
- Session: JWT access 15min + refresh token (httpOnly, 30 days, rotation); multi-device valid; "Continue as [name]"; saved-accounts list; login-activity screen (per-device logout + logout-all); new-device alert. Session invalidated on suspend/role change.
- Guest: skip link → browse; any action → login sheet.

**3.2 Registration**: OTP → role cards → name + city (drives feed/stories) + photo (skippable) + 18+ checkbox + DPDP consent (versioned log) → feed + coach marks.

**3.3 Recovery & edge cases**
- Lost/changed number: support ticket only (category: number recovery) → admin verifies → number updated.
- Number change (self, both numbers alive): dual OTP (old + new).
- **Recycled SIM**: account inactive 12+ months + fresh registration on that number → old account auto-archived, new account created; old data via support recovery only.
- Account states: active / suspended (login shows "Account suspended — contact support"; listings hidden, chats frozen, boosts paused; others see "unavailable"; lift → notification) / deactivated (self; reversible by login) / deleted (30-day grace; plans forfeit — warned in confirm; payments retained 7 years anonymized; held 7 days if payment within last 7 days).
- Account switch (multi-account dropdown); merge = support SOP.

# 4. PLANS, PAYMENTS & MONETIZATION

**4.1 Plans (payment-first: plan wall BEFORE listing form)**
- **₹999 lifetime/listing**: 1 property (lifetime) + 1 requirement (30d) + 10 proposals (lifetime validity).
- **₹2,999/month**: unlock all requirements + 30 proposals (validity = plan period).
- **₹9,999/project/6mo (builder)**: project + unlimited matched requirements + notifications.
- **Property inquiries FREE unlimited** (all registered; bot cap 100/day).
- Top-ups: +10 proposals ≈ ₹499 (admin-editable), inline mid-flow purchase supported.
- Admin can customize all plans/prices/contents anytime (grandfathering: purchased plans keep original terms).

**4.2 Consumption rules**
- Multiple plans stack; balances POOLED; FIFO (oldest first). No pause. No pro-rata.
- Listing slot state machine: `reserved` (on submit) → `released` (reject) → `consumed` (approve).
- Requirement quota: consumed on post; **toggle-ON after renewal consumes; OFF still counted; DELETE still counted** (all logged, admin-visible).
- Proposal counters atomic (row-lock); consumed on send; refunded ONLY if requirement went OFF pre-delivery.
- Trial: admin-granted only (never user-visible option); paid purchase ends trial; trial listings stay live; expiry notices 2d + 0d.

**4.3 Payment processing**
- Razorpay (UPI/card/netbanking). Server verifies amount+currency+status before activation. Webhook HMAC verified; idempotency keys; guess-proof webhook path; retry-safe; hourly reconciliation cron; manual admin re-check per transaction.
- Pending-UPI state screen (auto-poll; "safe to close"); failed → draft kept + retry link notification; double-payment detect (same user/plan/10min) → auto refund-queue.
- **Refunds**: none, EXCEPT technical failure (paid, not activated → auto-activate or refund). Boost admin-reject = refund. Refund revokes consumed plan atomically (listing unpublishes). Chargeback → plan suspend + flag. Refund notification ("5–7 days").
- Invoices: line items (what plan contains) + GST fields + optional user GSTIN; receipt screen + email; history + resend.
- Coupons: per-user 1×, expiry, usage cap, min value, applies-to (plans/boosts/both).
- Plan expiry: purchase timestamp + period (IST), hourly expiry cron; reminders 7d + 1d; ₹2,999 expiry → 24h grace banner; unlocked requirements stay unlocked, new ones lock.
- Usage dashboard: per-plan bars, pooled totals, consumed-trace ("₹999 12-Jan → Listing #4521 + Req #89 + 7/10 proposals"), renew CTAs.

# 5. LISTINGS (PROPERTIES)

**5.1 Types & dynamic fields (JSON config-driven; role-filtered)**
- Residential: Flat, Bungalow, Tenement, Farmhouse · Commercial: Office, Shop, Showroom, Godown · Plot: Residential, Commercial, Agriculture, Farm · PG/Hostel (Owner/Broker only).
- Per-type field show/hide from config (new types = config only). Examples: Flat → BHK, bathrooms, balconies, floor/total floors, furnishing + detail checklist (AC/wardrobe/fridge/geyser…), lift, parking (2W/4W counts, covered/open), maintenance ₹/mo, society name, facing (8 directions), age, water (Bore/Municipal/Both); Farmhouse → NO BHK; land+construction area, bore, garden; Commercial → carpet area, washrooms, floor, shell state; Plot/Agri → area + unit selector (vigha/guntha/sq yd/sq ft/sq m + live conversion), NA/kheti, road-touch + road width, corner flag, fencing; Rent extras → deposit, available-from date, maintenance-included toggle, tenant preference (Family/Bachelors/Company + Veg-only); New-construction ↔ hides age; Resale ↔ hides possession; Ownership type (Freehold/Leasehold/POA).
- Price: integer paise stored; live comma format + word confirm ("₹85 Lakh"); negotiable checkbox; "Price on request" toggle (price optional; card shows label); sanity ranges per type (warning-only).
- Title: auto-hint per type; auto-generate button (from fields). Description: per-type template placeholder; number-pattern detection → warning + admin flag.
- Location: State→District→Taluka→City/Village→Area/Landmark→Pincode (admin master data; bilingual names; adjacency mapped; "Request area" → admin queue → notify on add). All-India live day 1.
- Contact: public-number toggle; editable display number (default = account; disclaimer; no re-verify); alternate number; WhatsApp-different toggle + number.
- Ownership proof: OPTIONAL; type dropdown (Index copy/Tax receipt/Allotment letter/POA/Other) + upload; signed private URLs (owner+admin only).

**5.2 Photos & media**
- Min 1; max Owner 10 / Broker 10 / Builder unlimited (+bulk). Any format; 25MB/file practical cap; client resize 2000px → presigned direct upload → queue: compress → WebP (+JPEG fallback) 4 variants; EXIF/GPS stripped; watermark (HomzList + listing ID); reorder (first = cover, labeled); crop/rotate/brightness; optional alt labels; partial-fail per-tile retry; sample-photo guide (one-time); progress UI; orphan cleanup 7d. Builder brochure: PDF ≤10MB ×2, virus-scanned, compressed.

**5.3 Quality & validation**: warnings only, NEVER blocks (min photo/desc/price warnings). Preview before submit (card + detail render). Duplicate-my-listing (copies all except photos; new slot). Drafts: auto-save; max 3; 90-day expiry (warn→delete); unsaved-changes prompt; session-expiry returns to restored draft. Server-side validation mirrors all client rules; inline field errors.

**5.4 Listing state machine**
`draft → payment_pending → pending_review → (approved | changes_requested | rejected) → live → status{Available|Sold|Rented|Completed} → hidden → archived → deleted(soft) → purged`
- Approve: live + story generated + notification + SEO ping. Changes-requested: per-field admin notes; stays pending; NOT counted toward reject-lock. Reject: templated reason (+field notes); resubmit; 3 rejects = locked → appeal/support; rejected idle 60d → auto-archive + notice.
- Edits: minor (price) auto-approve; major (photos/location) re-review while live version stays; pending-edit → "updated" flag for reviewer.
- **Expiry cycles**: Property — 2-month "Still available?" (email+push; inline Yes/No) → no response 15d → auto-hide → +1 month → soft-delete. Project — same at 1 year. Crons 2AM IST; watchdogged; all actions notified + logged.
- Status actions: Sold/Rented/Completed → archive + savers notified + chats banner (sending stays ON) + boost auto-stop + sitemap removal + shared links → "No longer available + similar" page. Rented → **Re-activate** (same slot, free, re-review). Archive-restore (mis-marks) → re-review. Trash: 30-day restore (slot stays consumed). Deleted URL → 404.
- Price changes: history kept; drop → savers notified (never on increase).
- URL access matrix: draft/pending/rejected/changes = owner+admin only (others 404); live = public; hidden/archived = owner+admin; deleted = 404.

# 6. PROJECTS (BUILDER)

- ₹9,999/6mo per project. Fields: project name, RERA number REQUIRED (or exempt + reason), status (Booking open/Under construction/Ready), possession date, towers/floors, total & available units, bank approvals (multi-select → badges), amenities, location cascade, brochure, unlimited photos + floor plans.
- **Unit-type repeater**: each = type (2BHK…), sqft, price-from, floor-plan images → rendered as expandable table.
- **Project contact numbers ALWAYS public** (Call + WhatsApp + Inquiry). 1-year expiry cycle. Matched-requirement engine feeds builder (Section 8). Project stories distinct ring.

# 7. REQUIREMENTS

- Structured: type, Buy/Rent, budget min–max, preferred areas (multi), BHK, urgency (Immediate/1–3mo/Exploring). Admin-approved. 30-day life (independent of plan). Reminders 5d+1d pre-expiry.
- **Visibility**: posting via quota; viewing others = ₹2,999. Unpaid see locked cards (type+area+intent only; poster blurred; details stripped SERVER-side — API returns preview fields only). Unlocked shows poster name+role+badges+city (never number). Searchable (locked results for unpaid). `noindex`.
- States: active → expired → (renew plan → Activate toggle → active again, quota consumed) / OFF / fulfilled (button; stops proposals; quota stays consumed) / deleted (quota stays consumed). Multiple active allowed (1/plan). Edit → re-review + re-match. Expired/OFF: chats continue (banner), proposals stop.
- Reverse-match: poster sees "Matching properties on platform" strip (same engine).

# 8. PROPOSALS & MATCHING

**8.1 Proposals (on requirements)**
- Two options: (a) **"I have a property"** — attach own live listing via picker (or none → similar-suggestion message allowed); (b) **"Can we chat"** — plain request. Poster receives UNLIMITED while plan active.
- Assembled proposal card to poster: sender name+badges + **sender's number VISIBLE (auto)** + message + attached listing rich card + trust strip (member-since, profile %).
- Accept → chat opens. Decline → status shown. Not-relevant flag → 5 flags = sender admin-flagged. 30-day no-response → expired (count NOT refunded; status shown). Self-proposal blocked. Duplicate indicator ("already sent"). Sender status list: pending/accepted/declined/expired/fulfilled. Balance-0 mid-flow → inline top-up sheet → auto-send after payment.

**8.2 Number visibility rule (GLOBAL — listings & requirements)**
- POSTER (listing owner / requirement poster) sees SENDER's number directly (auto).
- SENDER must "Request number" → poster Allow (confirm dialog: "Your number will be visible to X") / Deny. Denied → may re-request (NO auto-block, NO cooldown). Allowed → NumberCard in chat (copy + call). Numbers absent from ALL API payloads pre-allow.

**8.3 Matching engine (cascade)**
- Location: exact landmark → adjacent landmarks (admin adjacency map) → city. STOP at city. Results labeled by tier ("Nearby: University Road"). Same cascade powers feed fill + story order + reverse-match.
- Budget: ±20% overlap. Type must match. Requirement edit → re-match job.
- Builder (₹9,999): auto-notified of matches by project location — real-time max 3/day, remainder in daily digest.

# 9. FEED & STORIES

**9.1 Feed (Property mode)**
- Composition: property + project cards (NO requirements). Own listings excluded (own views/shares never counted).
- Ranking: Boosted (FIFO: boost start, then listing date) → location cascade tiers → recency; responsive sellers boosted slightly. Filter chips (Buy/Rent) persist per mode; sort: Latest/Nearby/Price.
- Mechanics: cursor pagination; position restore; pull-to-refresh (+ "All updated" toast); WebSocket "New listings" pill (only if ≥30s on feed; tap = top+refresh; never auto-inject); "You're all caught up ✓" + city suggestion; "Suggested for you" strip (area/budget; boosts may fill organically); Not-interested (⋯ → down-rank type/area); skeletons; image prefetch (next 3–4); admin banner slot (scheduled/city-targeted); PWA install card (not-installed, weekly, dismissible); performance-nudge card (own 0-inquiry listing after 30d).
- Guest feed: full browse; actions → login sheet.
- **Builder feed**: dashboard — own project stat cards + matched requirement cards (locked if unpaid beyond project scope) — never others' listings.

**9.2 Feed (Requirement mode)**: requirement cards (locked/unlocked); boosted top (locked-but-top for unpaid); same shell/filters adapted.

**9.3 Stories (auto-generated ONLY)**
- Source: every approved listing/project of last 24h in user's selected city. NO user story creation (no add-story UI anywhere).
- Order: boosted first → cascade (selected area → adjacent → city) → row ends when city exhausted (NO cap). One poster/day = one circle, multi-segment. Cover = listing cover photo. Project rings distinct color.
- Viewer: 5s/segment; tap prev/next; hold pause; swipe-down close; cube-swipe between posters; auto-advance chain; "Send Inquiry" button; listing overlay (price/BHK/area); Promoted tag.
- Rules: seen ring grays (stored per city); new-ring pulse; boosted-seen → normal position (no re-first); mid-24h sold/hidden → "No longer available" state on open; media = signed URL expiring 24h (direct links die); 24h auto-expiry + cleanup; empty city → cascade → else row hidden; NO story deep-links; NO view counts to owners (admin aggregates only); admin story-remove tool.

# 10. INQUIRY & CHAT SYSTEM

**10.1 Inquiry (property/project — FREE unlimited)**
- Public-number listing: Call + WhatsApp (wa.me pre-filled "Hi, [title] — [link]") + Send Inquiry (direct; no number-request needed for poster's number since public).
- Private: Send Inquiry + Request Number.
- Inquiry sheet: pre-filled message + intent chips (Site visit/Negotiable?/Documents?/Loan?) + number-share toggle → sent as **chat request**.
- Rules: self-inquiry blocked (hidden); one thread per user-per-listing (re-inquiry/deleted-chat revives thread); min profile (name+city) required; decline → 30-day cooldown (shown); accept-before-seen (poster previews full message + listing; seen-status starts post-accept); requests filtered Verified/Others.

**10.2 Chat thread**
- Pinned listing/requirement card (live-refresh; "Price updated" system line). Messages: 2000-char cap; photos (capped size); delivered/seen ticks + "Seen 2:30 PM"; typing indicator; last-seen (setting-toggleable); reactions (long-press); swipe-reply + quote-jump; copy; report-message; delete for me/everyone (soft-kept for admin); link previews + caution label; number-pattern soft warning (editable regex); profanity auto-flag (blocklist); first-message system warning (token/advance own-risk); drafts persist; unread divider + open position; sticky date separators; jump-to-bottom pill; 50-msg pagination; keyboard-aware bar; optimistic send; offline queue.
- Tools: quick replies (defaults + user's custom templates CRUD); visit scheduler (slots → confirm → both reminded → reschedule/cancel notify → post-visit outcome prompt Done/Cancelled/Reschedule → pipeline update); post-number-allow continuity prompt (Interested/Not/Visit fixed); "Not interested" polite close; NumberCard on allow.
- Lifecycle: chats survive listing archive (banner; sending ON), requirement expiry (proposals off), account deletion ("Deleted user"), block (thread visible; sending disabled), plan expiry. Pending chat/number requests auto-decline on listing hide (+notify). 30-day inactive → auto-archive (new msg → auto-unarchive). Retention: active unlimited; archived purge 12mo (admin-config).

**10.3 Messages screen — 4 tabs**
1. **My Listings** (received inquiries) 2. **My Inquiries** (sent) 3. **Requirement Leads** (proposals received) 4. **My Responses** (proposals sent — status list header).
- Per tab: Requests row (count; Verified/Others), unread filter, per-listing grouping ("Property X — 45 chats"), search, pin/mute/archive/delete (swipe + long-press bulk), unique empty states, badges. Marks-all-read. Blocked list in settings.

**10.4 Leads pipeline (Broker/Builder)**: stages New→Contacted→Visit→Negotiation→Closed; auto-updates from visit outcomes; lead cards show trust info (phone-verified, profile %, member-since); filters; CSV export; stage-move sheet. Owner sees simple list.

# 11. PROFILES

- Own: avatar(+ring), name, role badge, verification badges (Phone→ID→RERA; revocable; NEVER "property verified" wording), bio (auto-flag: numbers/URLs/blocklist → admin queue), member-since/"About account", response-time chip (auto), stats (Listings|Views|Leads → tap-through), Edit, Share+QR, Featured circles (curated), pinned (3), role-based grid tabs (swipe; Sell|Rent|Requirement / Builder: Projects|Sell-Rent|Requirement), grid/list toggle, SOLD/RENTED ribbons, collapsing header, own-post tap → stats screen (views unique/day self-excluded, saves, shares, leads→list→chats, boost status).
- Other: public listings, badges, about, response-time, Message, Call/WhatsApp (verified + public number), ⋯ report/block/share. Suspended → "unavailable".
- Edit: photo, name, bio, city (feed changes), number (dual-OTP), builder extras (logo/year/count). Verification screen: 3 levels, doc upload, statuses.
- My Listings manager: filter all states; per-state actions (edit/resubmit/re-activate/restore/boost/status); field-notes visible on changes-requested; expiry banners inline Yes/No.
- Saved: collections (folders CRUD, move sheet); status-change alerts. Activity: viewed/liked/inquiries/proposals/visits. Trash, Archived, Drafts screens. Account status page (rejections/warnings/reports-against-me outcomes).

# 12. SEARCH

- Bar: debounced autocomplete (recents max 20 mode-wise + clear; suggestions; landing-page rows). All-script input.
- Tabs: All/Properties/Projects/Brokers-Builders/Areas. Result count shown. Filters (bottom sheet; per-type dynamic incl. facing/tenant/furnishing/bathrooms; persist per mode; clear-all). Sort: newest/price↑/price↓.
- Area pages: listings + stats header + highlights + cross-links (SEO landing = same screen). Attribute chips tappable → filtered search. Similar properties on detail. Recently viewed. Saved searches + new-match alert notifications. Zero-results: tips + popular chips + requirement CTA. Unknown city: Coming-soon + interest register. Cascade sections in results.

# 13. BOOST (ADS)

- Eligible: approved/live listings/projects/requirements only (button hidden otherwise). Admin-approved post-payment. Durations 7d/1mo (admin rates; shown in sheet). Targeting: city/state/all-India.
- Placement: feed top (FIFO tie-break), story-row first, search top, "Promoted" tag; requirement boost → requirement-mode feed top + story first + **locked-but-top** for unpaid.
- NO user analytics — only "Active till [date]" status + queue list. Auto-renew = 1-tap renew notification (no auto-charge). Sold mid-boost → stop, no refund (T&C). Admin-hide → pause/resume; fraud → no refund; admin reject → refund. Expiry prompts apply to boosted (no exception). Consecutive queueing. Race sealed (webhook re-checks listing status → auto-refund if rejected).

# 14. NOTIFICATIONS

- Channels: web push (FCM; iOS requires installed PWA — documented), email (transactional service; SPF/DKIM/DMARC), WhatsApp Business (critical only: approval, payment, number-allow; pre-approved templates). In-app screen: Today/Week/Earlier; inline actions (Allow/Decline number requests); thumbnails; deep-link map per type; mark-all-read; badges (bell + PWA icon).
- Rules: per-thread grouping ("Rahul: 5 new messages"); batch dedup ("10 listings approved"); channel dedup (push-seen → email skipped); quiet hours (non-urgent ≥11PM held); per-category preferences (marketing consent separate — DPDP); Android inline reply; 90-day purge (config).
- Event catalog: approval/rejection/changes-requested; inquiry received; chat accepted; number request/allowed; proposal received/accepted/declined/expired; price-drop (saved); saved-listing status change; saved-search match; matching requirement (builder: 3/day live + digest); expiry prompts (2mo/1yr Still-available); requirement expiry (5d/1d); plan expiry (7d/1d) + grace; trial (2d/0d); boost approval/active/expiry+renew; payment success/failed+retry/refund processed; suspension lifted; report outcome (to reporter); performance nudge (0-inquiry 30d); area-request added; new-device login; weekly digests (buyer ≤5 matches; seller views/leads); PWA update toast.

# 15. CROSS-CUTTING USER RULES (edge-case register)

- One user-per-listing thread; thread revival; FIFO plan pool; atomic counters everywhere (proposal send, toggle vs expiry race — validity checked in transaction; boost vs reject webhook re-check; proposal vs requirement-OFF refund).
- Views: detail-page open, unique/day, self-excluded. Shares counted (self-excluded) + visible to owner. ?ref= attribution: shared-link inquiry tagged + credited to sharer's lead list.
- All timestamps UTC stored, IST displayed (2h ago/Yesterday/12 Jan/12 Jan 2025). Currency integer paise; ₹85 L/₹1.2 Cr formats. Counts 12.4K.
- Rate caps (anti-bot only): inquiries 100/day; velocity flags admin-configurable. Enumeration/404-spike blocked.
- All destructive/count-consuming actions = double-confirm with consequence line (delete requirement, number allow, account delete, plan-consuming toggles).
- Every screen: loading/empty/error/offline states; offline queue + auto-retry; cookie consent (guest first visit); T&C re-acceptance interstitial on updates; data-download (own data only: profile/listings/own messages/payments); grievance officer link in footer/legal (24h ack SLA).

---

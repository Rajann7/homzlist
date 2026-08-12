# PENDING — everything not finished, and exactly what to do when it unblocks

Status as of **2 Aug 2026**.

> **MODULE 11 IS COMPLETE — P0 through P7, all 31 screens.** Everything on this
> list that was "blocked on the admin panel" is now unblocked, because the admin
> panel exists. What is left below is blocked on a CREDENTIAL or a DEPLOY STEP,
> not on code — with the four exceptions marked 🔵, which are decisions for
> Rajan.
>
> Each part's checks are repeatable and prove their claims from the database:
> `check:admin-p2` · `p3` · `p4` · `p4-bands` · `p5a` · `p5b` · `p6` · `p7` ·
> `admin-links` · `bundle-secrets`.

## What is actually left

| # | Item | Blocked on | Costs money / breaks a flow? |
|---|---|---|---|
| **B0** | Admin Google OAuth credentials | 🔑 Rajan (Google Cloud console) | 🔴 YES — **nobody can sign into the admin panel in production**. Found by the 7 Aug 2026 admin audit; the endpoint now refuses with a logged reason instead of a raw 500. |
| **B1** | Razorpay webhook secret | 🔑 Rajan (Razorpay dashboard) | 🔴 YES — late payments never settle |
| **B2** | Cron not scheduled in prod | 🚀 Deploy step (`CRON_SECRET` on host) | 🔴 YES — expiry/refund/reminders/anomalies never run |
| **B3** | Reminder delivery (push/email) | 🔑 FCM + Resend keys | No — reminders are recorded, not delivered |
| **B4** | Cloudflare R2 | 🔑 Rajan (keys) | No — Supabase Storage is the interim store |
| **B5** | Redis / MSG91 / Resend / FCM | 🔑 Rajan (keys) | Varies — see the table at the end |
| **C2** | Checkout shows CGST+SGST, design shows one GST row | 🔵 Rajan's decision | No |
| **M6.3** | Story media never expires (public bucket, so signing is a no-op) | **B4** (R2 / private bucket) | No — anti-scrape only |
| **M11.6** | Sentry / provider-billing cards on A27 | 🔑 Sentry DSN + provider billing APIs | No — the cards say "not connected" rather than showing zeros |
| **M11.7** | Three of A22's six system actions have no worker | 🔵 Decide whether we want them | No — the endpoint refuses honestly instead of faking success |
| **A13.1** | 10 SMS + WhatsApp message templates have no sender to reach | 🔑 MSG91/DLT (**B5**) — the notification dispatcher delivers push + email only; WhatsApp is used solely by the admin "send message" path | No — the 15 email/push templates ARE live; these 10 are editable copy for channels that cannot send yet |
| **A13.2** | 3 email templates have no send path at all: `invoice`, `plan_expired_email`, `grievance_ack` | 🔵 Build the sends. `POST /billing/invoice/:id/email` only marks the invoice emailed; there is no `plan_expired` notify and no grievance flow | No — but the A20 screen offers copy for messages nobody sends |
| **A13.3** | **`ui_strings` is seeded with fake data** — 190 of 221 rows are auto-generated `*.auto_NNN` whose gu/hi contradict their en (`boost.auto_117`: en "Clear all 117" / hi "Apply filter 117") | 🔵 Rajan's OK to **purge the 190 fake rows** (destructive, so not done unilaterally). The resolver + the 31 real keys work today | No — but A20 presents 190 fake editable strings, and mass-wiring them would inject garbage into the UI. Violates CLAUDE.md rule 7 |
| **A13.4** | Multi-language (gu/hi) not launched | **A13.3** (the translations are untrustworthy) + the `multi_language` flag | No — `t()` always prefers `en` and only honours a translation once the flag is on and the column is genuinely filled |
| **A13.5** | **Disputes can never be created** — 0 rows, no insert path anywhere; only `resolveDispute` exists | 🔵 Build the open-a-dispute flow (who opens it, from where) | No — the A24 Disputes screen is permanently empty, and the seller has no dispute surface |
| **A13.6** | 6 feature flags gate features that are not built: `auction`, `home_loans`, `referrals`, `multi_language`, `number_masking`, `featured_collections` | 🔵 Build the feature, or retire the flag | No — the other 12 flags are wired and enforced |
| **A13.7** | `boost_rates` table is now unread (retired) | 🔵 Drop it in a later migration | No — the A22 Boost screen reads/writes `plan_catalog` boost rows, which is what checkout charges |

**Nothing on that list is a half-built feature.** Each is either a key we do not
have, a deploy step, or a decision — and in every case the code refuses honestly
rather than pretending.

### One behaviour change to review (Aug 2026 admin-wiring pass)
`pwa_prompt` is configured `scope=percentage, percent=10`. Now that the flag is
actually enforced, the install prompt reaches ~10% of users instead of everyone.
Set that rollout to 100 in A22 if every user should be prompted.

## KEYS AT LAUNCH — what each one needs, verified from the code (5 Aug 2026)

Rajan will hand over the keys at the end. This is the checklist for that moment —
which are optional, which is mandatory, and the exact env switch for each. Every
"skip" below was read out of the code, not assumed.

| Key | Skippable? | How it degrades / what to set | Verified at |
|---|---|---|---|
| **MSG91** | 🔴 **NO — required for prod** | OTP login. In the production band the dev OTP provider **throws** — with no MSG91, nobody can sign in. Set `OTP_PROVIDER=msg91` + its keys. A test deploy runs on the fixed code instead by declaring `APP_ENV=staging`. | `lib/auth/otp-provider.ts:34,47`, `lib/env.ts` → `envBand()` |
| **Google OAuth (admin)** | 🔴 **NO — required for prod** | ADMIN panel sign-in. The dev admin provider 404s in the production band (`APP_ENV=production`, and that is the default for any deploy that does not declare otherwise) by design, so without `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` **no staff member can enter the panel at all** — `POST /api/v1/admin/auth/start` refuses and logs which variables are missing. Set both on the host, with the callback at `https://account.homzlist.com/api/v1/admin/auth/google/callback`. | `lib/admin/auth-provider.ts:36-45`, `app/api/v1/admin/auth/start/route.ts` |
| **R2** | ✅ yes | Media already lives in Supabase Storage. Leave `STORAGE_DRIVER=supabase` (the default). Switching to R2 later is a config change + object migration, no code change. | `lib/storage.ts:12-18,89` |
| **Resend** | ✅ yes | Email send is guarded: `if (!resendApiKey) return { sent:false, reason:"no_credentials" }`. Emails are **recorded** in `notification_deliveries`, just not delivered. | `lib/notifications/email.ts:58` |
| **FCM** | ✅ yes | Push is guarded the same way — notifications are recorded, not pushed to the device. | `lib/notifications/push-client.ts:46` |
| **Redis** | ⚠️ partial | Cache runs without it: `KV_DRIVER=memory`. But that store is **per-process**, so it only holds on a SINGLE server, and the BullMQ crons (boost expiry, refund, reminders, anomalies — see **B2**) need a real Redis. | `lib/kv.ts:151-152` |

**Short version:** there are **two** hard blockers, one per door — **MSG91** for
the USER login and **Google OAuth** for the ADMIN login. Miss either and that
side of the product cannot be signed into at all. (This list said "only MSG91"
until the 7 Aug 2026 admin audit: Google OAuth was documented further down but
absent from this table, which is the one a launch actually reads.)
R2 / Resend / FCM can all be skipped and turned on later; the app runs and
records the work. Redis can be skipped for a single-server launch with
`KV_DRIVER=memory`, but the scheduled jobs need a real one.

## Closed by Module 11

| # | Was | Closed by |
|---|---|---|
| ~~A1~~ | Boost approval never happens | **P3** — A6 boost queue, approve/reject+refund on the real state machine |
| ~~A2~~ | Trial grants unreachable | **P5a** — A15 Grants, and migration 0099 gave a grant a catalog code it could actually use |
| ~~A3~~ | Boost never appears in feed/search | Module 9, verified from A6 |
| ~~A4~~ | Profile Block + Report do nothing | **P3** — A9 reports queue with six real actions |
| ~~A5~~ | Nothing a seller posts ever goes live | **P3** — A3/A4 listings queue and review |
| ~~M6.4~~ | Same gap as A1, from Module 6 | **P3** |
| ~~M11.1~~ | `number_patterns` has no reader anywhere | **P6** — one detector reads both rule tables; disabling a rule really stops it |
| ~~M11.2~~ | Anomaly banners have no detector | **P7** — `lib/admin/anomalies.ts` + `/api/v1/cron/anomalies`, five detectors, idempotent per window |
| ~~M11.3~~ | `device_bans` had no reader | Enforced at the OTP door (Module 1) |
| ~~M11.4~~ | Queued boosts with refunded orders | **P3** — `approveBoost` checks the money is still there |
| ~~M11.5~~ | A9 "High priority" had no qualifying data | Data, not code — the chip counts correctly |

### And three more the later parts found and closed in place

- **`rate_limits` and `velocity_rules` had no reader either** (found in P7).
  Thirteen rows of editable numbers that changed nothing, because every one of
  ~40 call sites hardcoded its own. The limiter reads the table now
  (`lib/auth/rate-limit.ts`), the blocks it issues are counted (migration
  0110), and A22's "Hits (24h)" is a query. The hardcoded values remain as the
  fallback, so a deleted or unreachable rule leaves the endpoint protected
  rather than open.
- **`broadcasts` had nine rows and no sender** (found in P6). No code in the
  repo could send one, so A20's "Delivered · 96%" column had nothing to count.
  There is a sender now, with a per-recipient ledger, batching, and a
  percentage over ATTEMPTED rather than audience size — so a send that has not
  run reads "—" instead of "0%".
- **Two guards that could never fire** (found in P6/P7). "Legally required page
  cannot be unpublished" tested `kind`, which is `'legal'` for the cookie
  policy and `'terms'` for nothing — Terms of Service was one click from a 404.
  "Authentication templates cannot be disabled" tested a `auth.` code prefix no
  template carries — OTP, the sign-in path for every user, was disableable.
  Both now match on the values the schema actually holds, and the check seeds
  its way to each refusal so they are exercised rather than assumed.

---

## M11.6 — A27's error and cost cards have no source

**What the design draws:** an "Errors" card (`Error rate: 0.02% (last 24h)`,
"Open Sentry ↗") and a "Cost alerts" card (SMS / WhatsApp / Storage / CDN spend
against a monthly cap).

**What exists:** neither. There is no Sentry project and no provider billing
integration on this environment.

**What P7 did:** rendered the cards as "not connected on this environment"
rather than printing `0.02%` and four zero bars. A fabricated error rate on the
screen an admin opens *during an incident* is the worst possible place for one.

### When the keys arrive — do this
1. Add `SENTRY_DSN` (and `SENTRY_AUTH_TOKEN` for the API read).
2. Cost alerts need per-provider billing endpoints — MSG91, Meta, R2,
   Cloudflare. Each is a separate credential; there is no combined source.
3. Replace the two `NoteStrip`s in `components/admin/ops/SystemScreen.tsx`.

---

## M11.7 — three of A22's six system actions have no worker

`Regenerate sitemaps`, `Resend failed notifications` and `Clear rate-limit
blocks` are **real** — they run and report what they did.

`Purge CDN cache`, `Rebuild search index` and `Recalculate area stats` have no
registered job. The endpoint looks the job up in `cron_jobs` and refuses with
*"No job named X is registered — it cannot be triggered yet"*, rather than
queueing a run nothing will pick up or showing a success toast over nothing.

**Decision needed:** whether we want these three at all.
- *CDN purge* only matters once R2/Cloudflare is live (**B4**).
- *Search reindex* only matters if we move off Postgres FTS.
- *Area stats* is genuinely useful and is the cheapest of the three to build.

---

## Found by Messages/Chat audit (6 Aug 2026)

Fixed in the same pass (no entry needed, listed for the trail): Chat Details sent
project chats to `/requirements/<id>` (404) → now uses the server's sealed
`pinnedCard.href`; the "Block user" row showed the wrong label once blocked;
composer **draft persistence** (Doc4 §36) and **50-message up-scroll pagination**
(Doc4 §36) were both missing and are now implemented; the **first-message safety
card** (Doc2 §10.2) renderer was dead — a client `SafetyNotice` now shows it.

**CHAT-4 — public numbers were treated as private in chat (fixed 6 Aug 2026).**
`numberAllowed()` only ever granted the number through an `allowed` number_request,
ignoring the two cases where the number is **already published on the post**:

* a **project** — Doc2 §6, a builder's number is always public and the project page
  shows Call/WhatsApp; and
* a **listing with `contact_public`** — Doc2 §10.1, "no number-request needed for
  the poster's number since public" (18 accepted threads in dev).

So the buyer was shown a "Request number" button for a number they could already
read on the page they arrived from — a control that changed nothing — and Chat
Details hid its Call button. `getThread` now also seals in the public value
(`publicContactNumber`) and returns `numberIsPublic`; the thread swaps that dead
button for a working **Call &lt;number&gt;** row in the same slot. For a listing the
public value is the LISTING's `contact_number`, never the poster's profile phone,
which may be a different private number. Regression-verified: a private thread with
no allowed request still returns **no `otherNumber` key at all**.

All three earlier follow-ups are also **CLOSED** (fixed 6 Aug 2026):

| # | Item | Resolution |
|---|---|---|
| **CHAT-1** | **"Price updated" system line** (Doc2 §10.2) — a pinned listing's price change should drop a system message in the thread, not just flash the bar. | ✅ `updateListing` (the one price-edit path) now calls `postListingPriceSystemLine` (`lib/chat/service.ts`), which writes a `system` line into every **accepted** thread on that listing (147 live targets) and pings both sides. Fires on up/down/on-request moves, best-effort (wrapped so a chat write can't fail the edit). The client bar flash stays as the live cue on top. |
| **CHAT-2** | **Pending-buyer composer** hid queued messages behind the "Waiting to accept" card. | ✅ Composer is now **disabled for both sides while pending** (Rajan's call, 6 Aug), with buyer-specific copy: "You can send more once {name} accepts your inquiry." No message can look lost. |
| **CHAT-3** | Optimistic **unblock/unarchive** dropped the row with no revert on API failure. | ✅ Both now re-fetch the true list and show an error toast if the server didn't take the change. |

## Found by Module 11 P3 (31 Jul 2026)

| # | Item | Belongs to | Costs money / breaks a flow? |
|---|---|---|---|
| **M11.1** | `number_patterns` has no reader anywhere in the app | A19 Master data (**P6**) | 🟡 The A19 "Number-regex editor (test box)" will edit a table that changes nothing |
| **M11.2** | Anomaly banners have no DETECTOR | A27 Cron (**P7**) | 🟡 A2 shows real `anomaly_events`, but only the seed ever writes one |
| **M11.3** | `device_bans` had no reader; now enforced at OTP only | Module 1 / A22 | ✅ Enforced — but only at sign-in, and only by hashed IP + push device label |
| **M11.4** | Five queued boosts had **refunded** orders | ✅ FIXED — `approveBoost` now refuses | 🔴 Would have started paid placement for refunded money |
| **M11.5** | A9's "High priority" needs ≥3 reports on one entity; the data has max 2 | data, not code | No — the chip is correct and simply reads 0 |

**M11.1 — the trap, so P6 does not walk into it.** The rows in
`number_patterns` are JavaScript regexes (`\b`, `(?i)`). Postgres uses POSIX
ARE, where `\b` is a BACKSPACE, so every pattern in that table returns FALSE
against the very sample it was written for. Confirmed:

```sql
select 'Call me at 9825012345' ~ '\b[6-9]\d{9}\b';   -- false  (JS dialect)
select 'Call me at 9825012345' ~ '\y[6-9][0-9]{9}\y'; -- true   (POSIX)
```

Wiring A19 up means deciding WHERE the patterns run (Node, where `\b` works, or
SQL, where it does not) and storing a dialect that matches. Migration 0096 has
the POSIX translation of the four detectors that actually run today.

**M11.2 — what to build.** `anomaly_events` is read by A2 and dismissed by a
real endpoint, both proven. Nothing DETECTS one. The three the design draws are
payment-failure spike, OTP spike and report spike; each is a windowed count that
belongs in the A27 job table alongside the existing crons.

**M11.3 — the limits, stated plainly.** A9's "Ban device/IP" now writes real
rows and `requestOtp` refuses a banned hashed IP (fail-open on error, so a
lookup failure can never lock out every user at once). It bans the IP hash
recorded at signup consent and any registered push-token device label — the app
stores no user session table, so there is nothing else to ban. An account with
neither is reported to the admin rather than silently "banned".

Everything below **fails closed** — nothing runs insecurely, the feature is just off.

---

# A-VERIFY. Deep multi-role live verification — 25 Jul 2026

Every major M1-7 screen exercised live across guest/owner/broker/builder, driving
real handlers via DOM (synthetic mouse clicks drop in this pane; `.click()` +
API/DB is the reliable path). All PASS:
- **Guest**: feed Save/Inquiry→login, More/Sort/City sheets, banner dismiss,
  requirement mode (masked ₹00L budgets = correct server-strip), Unlock→login.
- **Owner**: My Listings state machine (**Hide persisted, DB-verified**, reverted),
  options menu fully wired; Edit Profile (photo/city/phone-change sheets open,
  **Save persisted+reverted**); MyRequirements + ProposalsReceived (sender numbers,
  status filters, Accept&Chat/Open-chat buttons); Drafts, MyPlan, Payments (GST
  details sheet), BoostStatus, Trash all render.
- **Builder**: dashboard (empty + real projects), project detail owner controls,
  **plan wall shows for no-plan builder** (payment-first).
- **Module 7 chat (headline)**: number-sealing **DevTools-proof** (no digit leaks
  pre-allow); **request→allow→reveal verified end-to-end cross-role** (Rahul req →
  Amit allow → number revealed); **visit scheduler creates a real linked `visits`
  row** (DB-verified). All test mutations reverted.

**Observation (seed data, NOT a code bug):** some seeded listings were inserted
without going through slot consumption, so MyPlan shows "0/1 listings used" while
the owner has several live. The wall logic is correct (reads real slots); only the
seed is inconsistent. In production every listing consumes a slot via the create
flow, so there is no real over-post path. `npm run seed:demo` could reconcile it.

---

# A-SWEEP3. Cross-host 404s + guest gating — 25 Jul 2026 (deep multi-role pass)

Walking the feed as a **guest** and following every destination surfaced more of
the same class as the `/property` seller-404: routes linked from surfaces that
render on BOTH hosts, but which only exist on one.

- **`/profile/:username` 404'd on the seller host** — no `/seller/profile/[username]`
  route, so a logged-in user tapping ANY poster in the feed/suggested/proposals
  dead-ended. Added the seller alias. Verified (was 404 → now renders).
- **Requirement-mode paywall 404'd for guests** — `RequirementFeed` never got the
  `guest` flag, so "Unlock"/"Continue to Payment"/"Compare plans" pushed
  `/checkout` and `/plans` (seller-only) → 404 on the public host. Now `guest` is
  threaded in and those gate to the login sheet. Verified live (Unlock → login).
- **`RequirementDetail` paywall** (public, guest-viewable) — same `/checkout`
  `/plans` 404; now `isGuest` gates them to `/login`.
- **PropertyFeed empty-state "Post Requirement"** — pushed `/requirements/new`
  (seller-only) ungated → now guarded to login for guests.
- **OtherProfile guest gating** — Block/Report/Message now route a guest to
  `/login` instead of firing an auth-required API that 401s; the Message toast no
  longer falsely says "comes in the chat module" (chat exists — you inquire via a
  listing). Block/Report **DB-verified through the real UI** (reason=spam row).

---

# A-SWEEP. Detail/flow rewiring after Modules 6/6B/7 — 25 Jul 2026

A screen-by-screen live walk found several screens still carrying **placeholder
toasts** from before their owning module landed ("Chat opens with the messages
module", "Saved lists arrive…"). The controls looked done but wrote nothing.
Fixed and verified:

- **Seller `/property/:id` route** — was a hard **404 on the seller subdomain**
  (only the public group had it), so a logged-in user tapping any property card
  dead-ended. Added `app/(seller)/seller/property/[id]/page.tsx`. Verified live.
- **ListingDetail (P4)** — Save, More/Report/Share, Send Inquiry (×2) and Request
  Number were all toasts. Now wired to the real feed/chat sheets: Save →
  `saves`; Send Inquiry → `inquiries` + grows a pending `chat_threads` row;
  Request Number → same inquiry pipeline (number exchange continues in the
  thread); More → Share/Report/Not-interested. Guest gate: the public host strips
  the session, so `isGuest` is passed from the public page and every write action
  opens the login sheet. **DB-verified** (inquiry + thread rows written).
- **ProjectDetail (P4)** — Call/WhatsApp/Enquire were toasts AND the project DTO
  exposed **no contact number at all** despite Doc2 §6 ("builder number always
  public"). `getProject` now surfaces the builder's profile phone; Call → `tel:`,
  WhatsApp/Enquire → prefilled `wa.me`. Verified (number present in payload).
- **ProposalsReceived (P8)** — "Accept & Chat" / "Open chat" were toasts.
  `acceptProposal` now returns the grown `thread_id`, the received DTO exposes
  `threadId`, and both buttons navigate to `/messages/:threadId`. API-verified.
- **Visits (P8)** — "Message" was a toast; `visits.thread_id` now flows through
  `/visits/mine` → the button opens the linked thread.

**Batch 2 — profile + Module 5 CRM + boost (25 Jul 2026, all API/DB-verified):**
- **OtherProfile Block + Report** (PENDING **A4 — now RESOLVED**). Both were pure
  toasts — the safety-critical Block "protected" nobody and Report saved nothing.
  New `blockUserById` / `reportUserById` + `POST /api/v1/profile/moderation`;
  the sheet/dialog call them. **DB-verified**: `chat_blocks` + `reports`
  (`subject_type='user'`) rows written.
- **OwnProfile Create (+)** — dead toast → navigates to `/create` (Module 4).
- **BoostStatus "View listing"** — dead toast → `/property/:id` (boost DTO already
  had `listingId`).
- **Leads (P8) "Message" + "View property"** — toasts → the leads DTO now resolves
  the origin chat thread (one-thread-per-listing-buyer) + the listing id;
  buttons open `/messages/:threadId` and `/property/:id`. API-verified.
- **MyProposalsSent (P8) "Open chat"** — toast → `SentProposal.threadId` surfaced;
  opens the accepted thread. API-verified.

**Still open (found in these sweeps):**
- **OtherProfile "Message"** — there is no generic user-to-user DM; every chat is
  anchored to a listing/requirement (Doc2 §10). The profile Message button has no
  valid target, so it still toasts. Needs a product decision (route to their
  listings to inquire, or a contextless DM feature). Not a simple wire.
- **Verification "Cancel request"** (M2) — **NOW FIXED**: `cancelVerification()` +
  `POST /api/v1/profile/verification/cancel` delete the pending row so the user
  can re-submit. DB-verified (seeded pending → cancel → row gone). (RERA level has
  no cancel button in the design, so only ID was wired.)
- **Auth Details photo picker** (M1 registration) + **OwnProfile "Featured
  collections"** (M2) — each needs its own backend (photo upload during signup /
  a featured-collections table). Left honest; not faked. A profile photo can
  still be added later via Edit profile.
- **"Contact support"** across Plans/MyPlan/Payments/Checkout — no support surface
  (Module 12 CMS). Low priority.
- **Project Save** — `saves` is listing-scoped (`saves.listing_id`); a project
  can't be saved without a schema change (nullable listing_id + project_id, or a
  `project_saves` table) AND the P10 Saved UI rendering project tiles. The P4
  project header Save still toasts. Not faked. Owner: Module 6B follow-up.
- **Plans / Payments "Contact support"** — still a toast; a support surface isn't
  built (Module 12 CMS / settings). Low priority.

---

# A-M7. Module 7 (P7 — Chat, Inquiry & Number System) — built 24 Jul 2026

Shipped: full chat schema (0028 + 0029) + service + 17 API routes + the 4-tab
Messages home, Requests, Chat Thread (full bubble set + in-thread search), Chat
Details, realtime, notifications, photo upload, retention cron — all wired, seeded
(162 threads / 301 messages), and live-verified across broker/owner/builder roles.
DB-verified; number-sealing proven DevTools-proof; 401 + IDOR (404) sweeps pass.

**Now RESOLVED (were pending from earlier modules):**
- **A0.1** accept → real thread: `acceptProposal` + inquiry send now grow a
  `chat_threads` row (`ensureInquiry/ProposalThread`); "Accept" opens the thread.
- **A0.2** visit + lead origination: the in-chat visit scheduler creates real
  `visits` rows; the post-number continuity prompt writes/updates `leads`.
- **A4** Profile block + report: the chat block/report paths persist to
  `chat_blocks` / `reports` (report_subject extended with `message` + `user`).
  Profile-screen buttons can now call the same endpoints.

**Gap-closing pass — 24 Jul 2026 (all live-verified, 3 roles, no console errors):**
Re-seeded so EACH role hero (owner Rahul, broker Amit, builder Arjun) has ≥10
real threads in every one of the 4 tabs with a full status/state mix
(`scripts/seed-module7-roles.mjs`). DB now: 162 threads / 301 messages.

- **RESOLVED #1 · Realtime.** Now Supabase Realtime **broadcast** (RLS-independent,
  works with custom-JWT auth): server pings `chat:thread:<id>` / `chat:inbox:<uid>`
  via the Realtime HTTP API on every mutation (`lib/chat/realtime.ts`); client
  subscribes (`lib/chat/realtime-client.ts`) and refetches through the sealed API —
  no business data on the socket. Poll stays as fallback (thread 15s / list 20s).
  Broadcast endpoint verified 202. `Doc7 §16`.
- **RESOLVED #2 · Chat photo upload.** Attach sheet gallery/camera now runs the
  real `uploads/presign(kind:chat) → PUT → commit → send({photoUrl})` pipeline
  (`uploadChatPhoto` in `lib/chat/client.ts`). Uses the Supabase Storage driver
  (R2 swaps in via config, no call-site change). Verified end-to-end in browser.
- **RESOLVED #3 · Retention cron.** `/api/v1/cron/chat` (CRON_SECRET-guarded, in
  `vercel.json` @ 03:00) runs `runChatRetention()`: 12-month dormant-thread purge
  + 30-day tombstone purge (`lib/chat/retention.ts`). Auto-unarchive on new
  message already works in the send path.
- **RESOLVED #4 · Chat notifications.** `notifications` + `push_tokens` tables
  (0029, RLS deny-all). `notify()` (`lib/notifications/service.ts`) records an
  in-app row + best-effort FCM push (`lib/notifications/push.ts`, firebase-admin,
  service account in env) on inquiry-received / proposal-received / chat-accepted /
  number-requested / number-shared / new-message (mute-aware). Live send verified
  → real `new_message` notification row written.
- **RESOLVED #5 · In-thread search.** Menu → "Search in chat" → header input +
  warning-soft match highlight + "N of M" stepper (prev/next) + scroll-to-match,
  design-exact. Verified in browser.

**Design-completeness pass — 25 Jul 2026 (every screen walked vs design; all live-verified on the seller subdomain):**
- **Archived chats** (`/messages/archived`) + **Blocked users** (`/messages/blocked`)
  screens BUILT — the ⋯ menu items were dead 404 links before. New
  `getArchivedThreads`/`getBlockedUsers`/`unblockUserById` + `GET /chat/archived`,
  `GET|POST /chat/blocked`. Unarchive + unblock work; verified (archived thread →
  unarchive → returns to list).
- **Full-screen photo viewer** (`components/chat/PhotoViewer.tsx`) — tapping a photo
  bubble (Thread) or a shared photo (Details) opens the design's dim full-screen
  viewer; before, tapping did nothing. Verified.
- **Bulk multi-select** on the home — ⋯ → "Select chats" → checkboxes + "{n}
  selected" header + Mark-read / Mute / Archive / Delete bulk actions. Verified
  (2 selected → archive → both removed, count 8→7).
- **Composer pinned to the bottom** — was riding the page scroll; AppShell got a
  `scroll={false}` flex-column mode so the messages area scrolls and the composer
  stays fixed (design §10.2). Verified.
- **Seller routing bug fixed** — chat pages used `/seller/messages` which
  double-prefixed to 404 on the seller host; now bare paths + explicit `seller`
  flag. Nav + thread-open verified on `seller.localhost`.
- **Public host is now guest-only** — login redirects to the seller subdomain and
  any public session is stripped (middleware); authenticated chat lives on seller.
- **Nav icon swap** — Messages icon moved to the bottom nav (Saved slot); Saved
  moved to the feed header top-right. Composer attach icon changed `+ → image`.
- Fixed a `BottomNav` bug rendering a literal `0` under the message icon.

**Spec-completeness pass — 25 Jul 2026 (walked designs/P7 + design-prompts/p7 element-by-element; auditors run):**
- **Quoted-reply** now renders the quote block inside the bubble + tap-to-jump-and-flash the original (was: replyTo stored but never displayed).
- **"Seen HH:MM"** label under the last seen sent message (was: tick only).
- **Requests intent chips** ("Site visit?"/"Negotiable?") from the sender's ticked `inquiries.intents` (backend + UI).
- **Chat Details**: added the pinned Property card, the **Report** row + report sheet, the **Archive chat** row; "Search in chat" now opens the thread with search active (`?search=1`).
- **Archived screen** note ("auto-archived after 30 days…") + the **30-day auto-archive job** now runs in `runChatRetention()` (was a promise with no job).
- **Security-auditor: PASS** (no High/Crit; number-sealing + IDOR + RLS + secrets verified solid). Fixed its one Medium: **rate-limits added to 11 chat routes** (visit/block/state/continuity/details/read-all/archived/blocked/templates×2/push-register) + **template count capped at 30/user**.
- **qa-tester: BLOCKED** — the Browser pane isn't available to sub-agents (screenshots time out, synthetic input drops); it confirmed dev-server boot + seller-subdomain routing + auth redirect. Screens were live-verified by the primary session instead.

**Remaining P7 items — BUILT 25 Jul 2026 (user asked for all; typecheck clean, dev server serves with no errors):**
- **Typing indicator** — peer "typing" pings over the Supabase broadcast channel: a 3-dot bubble in the open thread + "Typing…" preview on the Messages row (the sender also pings the peer's inbox topic). `lib/chat/realtime-client.ts` (`subscribeChat` handlers + `broadcastTyping`), `dotb` keyframe in globals.css.
- **Swipe-to-reply** — swipe-right on a bubble → quick reply (reply arrow appears); long-press → Reply still works.
- **Sticky date separators** — the date pill now sticks to the top of the scroll area.
- **Offline queue** — a failed send keeps its pending-clock bubble + shows "No connection — messages will send automatically"; queued messages auto-resend on the `online` event → toast "Messages sent".
- **Price-update flash** — the pinned bar flashes accent-soft when the listing price changes between loads.
- **Shared listings** in Chat Details — real section from the thread's attached listing (deduped; hidden when none).

**Still open (needs a Module-4 hook or is a screen elsewhere):**
- Price-update **system line** ("Price updated ₹85 L → ₹78 L") in the thread — the client flash is done; the persisted system message needs a trigger in the listings price-update path (Module 4). Tracked here.
- In-chat visit **reschedule/cancel/outcome** — lives in the Visits screen (Module 5) today; not duplicated inside the chat card.

**Still genuinely pending (credential- or later-module-blocked):**
1. **FCM device push delivery** — the SERVER sender + token table + `/api/v1/push/
   register` are all built and firebase-admin initialises with the service-account
   key. Actual browser delivery still needs the **public** Firebase web config
   (`NEXT_PUBLIC_FIREBASE_*`) + a **VAPID** key so the client can obtain a device
   token to register. Until those are set, `sendPushToProfile` finds no tokens and
   no-ops; the in-app notification records still work. ⚠️ The service-account key
   was shared in chat — **rotate it** in the Firebase console.
2. **Link-preview server fetch** with SSRF guards (Doc9 §66) — link cards render
   from stored meta; a live URL-preview fetcher isn't built. Number-pattern +
   profanity flags ARE implemented server-side.
3. **A0.6 visit PATCH path** stays `/api/v1/visits/:id` (not re-homed under
   `/chat/visits/:id`); the chat visit *creation* is now `/chat/threads/:id/visit`.

---

# A0. Module 5 (P8 — Requirements/Proposals/Matching/Visits/Leads) — built 23 Jul 2026

Shipped fully, DB-verified, all screens live per role. What Module 5 deliberately
leaves for later modules (design-faithful — P8's own mock marks every chat action
"→ placeholder Chat"):

## A0.1 Accept → chat does not open a real thread (Module 6 — P7)

`acceptProposal` sets `status='accepted'`, `responded_at`, and the poster already
sees the sender's number (the number rule) — but no `chat_threads` row is created
because chat is Module 6. "Accept & Chat" / "Open chat" / "Message" all navigate
to a placeholder toast, exactly as the P8 design specifies.
**When Module 6 lands:** on accept, create the thread and set `proposals.thread_id`
(the column already exists), then point these buttons at it. Same for
`visits.thread_id` and the lead "Message" action.

## A0.2 Visit + lead ORIGINATION is chat-driven (Module 6)

Module 5 owns the **viewing + management** of visits (reschedule/cancel/outcome)
and leads (stage-move/note/CSV) and seeds every state. What it does NOT own:
- **Visit creation** — the visit scheduler lives inside a chat (Doc2 §10.2). Here
  visits are seeded; there is no non-chat "schedule a visit" entry (not in P8).
- **Lead auto-population** — a lead should be born from a chat inquiry / accepted
  proposal / visit. The **visit-outcome → stage nudge is already wired**
  (`setVisitOutcome` moves a matching lead to `visit`), but inquiry→lead and
  proposal-accept→lead need chat. Leads are seeded until then.
**When Module 6 lands:** create a lead on first inquiry/accepted-proposal; create
visits from the scheduler writing to the tables that already exist.

## A0.3 Builder match auto-notify — engine built, trigger + delivery pending

Doc2 §8.3 wants builders auto-notified of matching requirements (3/day live +
digest). The **matching cascade engine is built** (`lib/listings/matching.ts`,
reused by the reverse-match strip and `/match/for-requirement/:id`). Not built:
the **trigger** (requirement approve/edit → run match → notify) needs the admin
approve flow (**Module 11**), and **delivery** (push/email) needs the provider
layer (**Module 10** — same blocker as B3 reminders). Deliberately NOT writing
"notification intent" rows nothing consumes — that would be the dead placeholder
CLAUDE.md §7 warns against. Build the trigger + delivery together when both land.

## A0.4 Requirements "browse" is not yet a bottom-nav tab (Module 6 — P2)

P8 S3 shows Requirements as a bottom-nav CENTRE tab — but that is the P2
requirement-mode feed shell (Module 6), which owns the global `BottomNav`. Module
5 did not restructure the nav; `/requirements` (browse) is reachable via the
seller profile ⋯ menu ("Browse requirements") and links between the Module-5
screens. **UPDATE 23 Jul 2026 (Module 6 landed):** Rajan's call is ONE nav
everywhere — the P3 canonical Home/Search/Create/Saved/Profile. So Requirements
does **not** get a nav tab; `/requirements` stays route-reachable (⋯ menu +
inter-screen links). This item is closed by decision, not by build. See A0-M6.6.

## A0.5 Two deliberate reconciliations (design/Doc tension — resolved, noted)

- **Duplicate guard vs "a sender may send multiple" (Doc7 §71).** The P8 design
  draws a duplicate guard ("You've already sent a proposal for this requirement")
  and Doc2 §8.1 lists it. Doc7 §71's note that "a single sender may send multiple
  proposals" is read as *across different requirements* — re-proposing the **same**
  requirement is blocked while a pending/accepted proposal exists, allowed again
  only after a decline/expiry. Enforced by a partial unique index (0025) + the API
  `DUPLICATE_PROPOSAL` path. If Rajan intended multiple proposals to the *same*
  requirement, relax the index.
- **Visit PATCH path.** Doc7 §101 namespaces it `/chat/visits/:id`; chat isn't
  built, so it ships as `/api/v1/visits/:id`. Re-home under chat in Module 6 if
  desired (the client method is the only caller).

## A0.7 P8 Proposals screens overlap the P7 Messages tabs — REUSE, don't rebuild

Doc2 §10.3 gives the chat Messages screen four tabs; tabs **3. Requirement Leads
(proposals received)** and **4. My Responses (proposals sent)** are the SAME data
as Module 5's standalone **S5 ProposalsReceived** and **S6 MyProposalsSent**.
Nothing is thrown away: when Module 6 builds Messages, tabs 3+4 must call the
existing `proposalsApi.received` / `proposalsApi.mine` and render the same DTOs —
they are a second entry surface, not a second implementation. The standalone P8
screens stay (reached from My Requirements → proposals row, and the profile menu).
Do NOT re-model proposals in Module 6. (Note: P8 S2 "Leads Pipeline" — the
broker/builder CRM, Doc2 §10.4 — is a DIFFERENT thing from the "Requirement
Leads" Messages tab despite the shared word; the pipeline is not a Messages tab.)

## A0.6 Proposal-vs-requirement-OFF refund (Doc2 §15) — sealed by pre-check

`sendProposal` re-reads the requirement and refuses (no quota drawn) unless it is
`live` AND `is_active`, so a proposal is never charged against an OFF/deleted
requirement. The `refund_proposal` RPC (0003) remains wired for the create-failure
release path (`releaseQuota`, the 0024 pattern) and is available for any future
admin refund. 30-day no-response expiry is **non-refund** by design (Doc2 §8.1),
swept hourly by `expireStaleProposals()` on the billing cron.

---

# A0-M6. Module 6 (P2 — Feed & Stories) — built 23 Jul 2026

Shipped, DB-verified, live-verified guest + logged-in. Three new real tables
(`saves`, `inquiries`, `reports`) plus `feed_not_interested` and `story_seen`,
all RLS deny-all; `feed_banners` added 24 Jul (migration 0027).

## ⚠️ CLOSURE STATUS — Module 6 is NOT 100% closed (as of 24 Jul 2026)

Everything in Module 6's own scope is built and both live suites pass
(`test-module6-live.mjs` ALL PASS, `check:roles` ALL PASS). **Two items remain,
and neither can be closed from inside Module 6** — do not report Module 6 as
fully complete until both land:

| # | Remaining | Blocked on | Why it can't be done now |
|---|---|---|---|
| **M6.3** | Story media not signed / 24h-expiring | **B4 (R2 keys)** or a private bucket | Photos sit in a **public** Supabase bucket. Signing a publicly-readable object is theatre — the plain URL keeps working, so nothing expires. A real fix means moving media to a private bucket, which then forces signed reads across feed, detail AND profile. That is storage architecture, not a Module 6 bug. |
| **M6.4** | A paid boost can never become `active` | **Module 11 (Admin)** | Needs `POST /admin/boosts/:id/approve`, which needs the admin auth zone + panel. Money side is already safe (auto-refund after 48h in `pending_approval`) — see A1. |

Deliberately NOT faked for either: no signed-URL wrapper over a public object,
no self-approving boost. Both would look done and be false.

**Closed during the 24 Jul sweep** (were on this list): admin banner slot
(A0-M6.6), pull-to-refresh indicator + the "new listings" pill's `created_at`
bug (A0-M6.10), and the message badge (A0-M6.2).

What Module 6 leaves for later modules:

## A0-M6.1 Save / Inquiry / Report tables are seeds their owning modules extend
Per Rajan's decision, these persist for real now (no frontend-only toast). Owning
module for each, checked against Doc6's module list on 23 Jul 2026:
- **`saves`** → **Module 6B (P10 Saved)** builds the wishlist/collections UI on it.
  *P10 had NO module at all until 23 Jul 2026 — see A0-M6.7.*
- **`inquiries`** → **Module 7 (P7 Chat)** grows a thread from each inquiry (the
  `thread_id` column is already there); until then an inquiry is stored, not a chat.
- **`reports`** → the **Module 11 (Admin, P13-14-15)** Reports queue consumes them
  (status stays `open`; no admin action path exists yet).

Module map for the rest of this section (corrected 24 Jul 2026): **M6.2** message
badge → ✅ **closed inside Module 6** (it never needed Chat — the `inquiries`
table is enough; the earlier "→ Module 7" note was wrong), notification badge →
**Module 10**, "new matches" dot → Module 5 signal delivered by Module 10.
**M6.3** signed story media → no feature module; it rides **B4 (R2 keys)** /
a private bucket, single seam `storySegment`. **M6.4** boost→`active` →
**Module 11** (A1); search top-slots → **Module 9** placement on top of
**Module 8** search.

## A0-M6.2 Header badges — message ✅ CLOSED 24 Jul 2026, bell still Module 10
**Message badge — now REAL.** It does not need Chat to exist: Module 6 already
built `inquiries`, so "inquiries sent to me I haven't acted on" (`poster_id = me
AND status = 'sent'`) is a genuine, queryable count today — the same set P7's
"Requests" tab will own. Wired `headerBadges()` → `GET /api/v1/feed/badges` →
`FeedHome` → `FeedShell` → `FeedHeader`.
**DB-verified:** pending-inquiry counts are Sneha 7 / Amit 6 / RK 4 / Manish 4;
signed in as Amit the header renders **6**, guest renders none.

**Bell badge — still open (Module 10).** There is no notifications table, so the
endpoint returns `notifications: null` — deliberately NULL, not `0`. NULL means
"no source yet" and the header draws no badge; a `0` would imply "you have none",
and a hardcoded "3" would be a DB-lock violation (rule 12). When Module 10 lands,
fill that one field — the plumbing is already in place.

Also still open: the Requirements "new matches" dot (Module 5 signal, delivered
by Module 10). The bell/message taps route to `/notifications` and `/messages`,
which are placeholder screens until M10/M7.

## A0-M6.3 Story media is not yet signed-24h (public bucket)
Doc2 §9.3 wants story media as signed URLs that die after 24h (anti-scrape).
Listing photos live in the **public** Supabase bucket (same URLs the feed cards
use), so `storySegment` returns public URLs. The story VIEWER works with real
media; the anti-scrape signing needs a **private story-media bucket** (or R2, B4)
and a signed-read per segment. `storySegment` is the single seam to change.

**Re-examined 24 Jul 2026 — still open, and here is why it is not a quick fix.**
Wrapping the existing URLs in `createSignedUrl()` would be *theatre*: the object
stays publicly readable, so the plain URL keeps working after the signature
expires and nothing is actually protected. Making it real requires the object to
be private, and the moment the bucket goes private **every other surface that
renders the same photos breaks** — feed cards, listing detail, profile grid,
suggested strip — each would need signed reads too. That is a storage-layer
migration (B4 / R2), not a Module 6 change.

**When B4 lands, the order is:** private bucket → signed-read helper → point
`storySegment` at it → then the feed/detail/profile readers → then verify a
segment URL 404s after 24h. Do not sign against the public bucket and call it
done.

## A0-M6.4 Boost placement now READS active boosts (A3 partially closed)
The feed ranks active boosts first (FIFO by `starts_at`) and the story row puts
boosted posters first — so A3's "boost appears nowhere" is now closed **for the
feed + stories**. Still open: **boosts can't become `active`** without the admin
approve endpoint (A1), so today an active boost only exists if seeded directly;
and **search** top-slots (A3) are still unbuilt. Requirement-boost locked-but-top
is honoured (boosted-locked cards render first in requirement mode).

**Re-examined 24 Jul 2026 — still open.** Deliberately NOT worked around: an
auto-approve or a "activate on payment" shortcut would put a paid boost live with
no human review, which is exactly the control the admin queue exists to provide.
The money half is already safe — `timeoutStalePendingBoosts()` refunds anything
stuck in `pending_approval` past 48h — so the open risk is a *delayed* boost, not
a lost payment. Closes with **Module 11**'s approve/reject endpoints (see A1).

## A0-M6.5 New-listings pill is poll-based, not WebSocket
Per Doc7 §83 (server gives the count, client gates the ≥30s display), the pill
polls `GET /feed/new-count` every 20s. Full Supabase Realtime (WebSocket) is for
chat/notifications later; the feed does not need a socket.

## A0-M6.6 Nav split — RESOLVED (unified, 23 Jul 2026) + admin banner source
The feed shell briefly used a separate P2 nav (`FEED_NAV`:
Home/Search/Requirements/Messages/Profile). **Rajan's call: ONE nav everywhere** —
the profile/P3 canonical `DEFAULT_NAV` (Home/Search/Create/Saved/Profile). The
feed shell now renders plain `<BottomNav />` and `FEED_NAV` is deleted, so no
screen can diverge again (CLAUDE.md rule 6). Requirements browse therefore still
reaches its screens by route, not by a nav tab — see A0.4.

**Admin banner — ✅ CLOSED 24 Jul 2026** (was: "component exists but has no
server-driven source"). That was a design element with no data source, so the
slot was silently absent from the running app. Now DB-driven end to end:
`feed_banners` (migration 0027, RLS deny-all) → `activeFeedBanner()` →
`GET /api/v1/feed/banner` → `<AdminBanner>` between the story row and the mode
toggle, exactly where P2 puts it. Text/gradient or image, schedule window,
priority and dismiss all come from the row — nothing hardcoded. The P15 admin
CMS will edit these rows instead of inserting them.

## A0-M6.13 Clickable-flow sweep — 6 dead ends found (24 Jul 2026)
Rajan: the feed card only opened from the "View Property" button, and tapping a
poster did nothing. Walked every tappable target in the feed and followed each
destination to a real screen.

**Feed card was barely clickable.** Only the "View Property" button and the
project title opened anything; the photo's single tap was dead (it only recorded
a timestamp for double-tap detection) and title/price/meta/location were inert.
Now the whole info block and the photo open the detail:
- photo **single tap → open**, **double tap → heart + save** (unchanged). The
  single tap waits 300ms so a second tap can cancel the pending open.
- a `scrolledAt` guard drops taps within 400ms of a carousel scroll, so
  **swiping between photos no longer navigates away**.
- Save / Inquiry / More stay siblings of the info button, so they never
  trigger the card open. Verified: More opens its sheet, Save toggles, neither
  navigates.

**Poster was not clickable at all**, and the public profile behind it was
broken in two ways:
1. `PosterInfo` carried no `username`, and `/profile/:username` is how the
   public profile routes — so there was nothing to link to. Added server-side.
2. The profile then showed **"0 Listings"** — a hardcoded `listings: 0` with a
   `TODO(Module 4)` left in a shipped screen (rule 12 violation; Module 4 shipped
   long ago). Now `getPublicProfileCounts()`, **live + available only** so a
   visitor is never told how much unpublished stock a poster is sitting on.
   DB-verified: RK 12 / Amit 8 / Sneha 6 / Suresh 4 (+3 projects) / Rahul 3 —
   API matches SQL exactly.
3. The grid under it was a hardcoded **"No listings to show yet."** with no fetch
   — so a profile could claim 12 listings and show none. Added
   `GET /profile/:username/listings` + a real tab-filtered grid (Sell 8 / Rent 4
   = 12). Uses `listingCardDTO`, **not** `myListingDTO`, which would have leaked
   status badges, review notes and reject reasons to a stranger.

**Three routes 404'd** — same class as `/project/:id` (A0-M6.9):
| Tapped | Route | Was |
|---|---|---|
| Requirement card (unlocked) | `/requirements/:id` | **404 on public** — seller-only |
| Builder dashboard project tile | `/projects/:id` | **404 on public** — seller-only |
| Feed project card | `/project/:id` | **404 on seller** — public-only |

Fixed by making singular `/project/:id` canonical on **both** hosts (added the
seller alias) and pointing the builder dashboard at it; added public
`/requirements/:id`; "Post a Project" now goes to `/create`, which already
bridges to the seller host.

Paywall re-checked after opening the requirement route to guests: a guest gets
`access: "locked"` and **no budget field at all** in the payload.

Verified: 11/11 routes 200, Module 6 suite ALL PASS, `check:roles` ALL PASS,
`tsc` clean, zero console/server errors.

## A0-M6.12 DESIGN-LOCK OVERRIDE — card title left / price right (24 Jul 2026)
Second authorised departure from `designs/P2`, same day, same reason (Rajan's
call). P2 stacks the property card body as: price + sale badge, then meta, then
location. Rajan asked for **title on the left, price on the right, one row**,
title ellipsising when long.

Property feed cards **never carried a title** — only project cards did — so this
needed a server change too: `title` added to the listings SELECT and to the
property branch of `toCard()`. All 10 property cards now return one
(DB-verified).

Layout: `flex items-baseline`, title `min-w-0 flex-1 truncate`, price
`shrink-0`. The `min-w-0` matters — without it a flex item won't shrink below its
content and a long title would shove the price off the card instead of clipping.
**Verified live** with a 110-char title: title shows `…`, `text-overflow:
ellipsis`, title box stays 263px, price stays 72px and fully visible.
The sale badge + meta moved to the row below; the project card branch is
untouched (verified on feed page 2 — "Shivalik Heights" renders as before).

## A0-M6.11 DESIGN-LOCK OVERRIDE — feed card image 4:5 → 16:9 (24 Jul 2026)
The one place the app deliberately departs from `designs/P2`. Recorded here so
nobody "fixes" it back to the design later.

`designs/P2` specifies `aspect-ratio: 4/5` for all three feed card types, and the
app matched it exactly — this was NOT a deviation bug. Rajan judged the portrait
crop to read badly for real property photos and asked for housing.com's ratio.

Measured on housing.com at a 375px viewport (Rajkot flats listing, "Gallery Cover
Pic" card images): they use **two** — `262×194` (4:3, 1.35) and `262×142`
(16:9, 1.85). Rajan chose **16:9**.

Changed: one class in `components/feed/FeedCard.tsx`
(`aspect-[4/5]` → `aspect-[16/9]`). Card image is now 375×211 at 375px wide,
so roughly 2 cards fit a screen instead of ~1.

**Functionality untouched** — the carousel, scroll-snap, photo counter, dots and
Promoted/New-Project badges all size off that same container. Verified live:
counter steps 1/6 → 3/6 on scroll, `scroll-snap-type: x mandatory` and
`overflow-x: auto` unchanged, all 6 photos still in the carousel.

The 4:5 in `designs/P2` is now stale for this element. Everything else in P2
remains locked and unchanged.

## A0-M6.10 Design-vs-app sweep of P2 — 3 gaps found (24 Jul 2026)
Rajan asked why the design's "3 new listings" pill and banner weren't visible.
Walked every element in `designs/P2` against the running DOM. Present and
correct: header + scroll-morph, story row, mode toggle, filter chips + sort,
3 card types, Suggested strip, caught-up, guest strip, offline state, skeleton,
empty, bottom nav, and all 8 sheets (login/city/sort/more/inquiry/share/report/
paywall). Three were NOT:

1. **Admin banner — never rendered.** Component existed, was imported nowhere,
   and had no data source. Fixed: see A0-M6.6 (table + endpoint + slot).
2. **Pull-to-refresh indicator — never wired.** `PullSpinner` was defined in
   `primitives.tsx` and used by no one, so the design's pull indicator did not
   exist in the app. Now wired in `FeedShell`: arms only at `scrollTop 0`,
   damped 0.5× rubber-band, 64px threshold, spins until the refresh promise
   resolves. Verified with synthetic touch events — a 40px pull springs back
   without refreshing; an 88px pull pins at 64px and fires 4 refresh requests.
3. **🔴 "New listings" pill could never fire — wrong timestamp.** This is the
   real defect behind Rajan's question. `newCount()` counted
   `created_at > since`, but `created_at` is when the DRAFT row was made. A
   listing is drafted → moderated → published, so a listing that went live
   *right now* can have a `created_at` from days ago and was never counted.
   **Proof:** 3 listings set to `live_at = now()` → `new-count` returned **0**.
   After switching to `live_at` → returns **3**, and the pill renders live.

   Same wrong column was used for feed ORDER, the pagination CURSOR and
   `postedAgo`, so the feed also mis-ranked and lied about age ("2d ago" on
   something published today; 8 of 38 live rows have `live_at > created_at`).
   All four now key off `live_at` (with a `?? created_at` guard). Boosted-first
   ordering is unchanged. Cursor stays consistent because `nextCursor` is the
   same sort key.

Regression after the change: Module 6 suite **ALL PASS** (incl. boosted-first
and cursor pagination page 2), `check:roles` **ALL PASS**, `tsc --noEmit` clean.

## A0-M6.8 The PUBLIC host had no /login, /profile, /create, /messages, /notifications
Found 23 Jul 2026 by walking every destination the public feed links to. The
whole auth + nav surface existed only in the (seller) route group, so on
homzlist.com these all hit the 404 page:

| Tapped from | Went to | Was |
|---|---|---|
| Guest strip "Sign In", guest-gate sheet, profile sign-out | `/login` | **404** |
| Bottom nav — Profile | `/profile` | **404** (only `/profile/[username]` existed) |
| Bottom nav — Create (+) | `/create` | **404** |
| Feed header — bell | `/notifications` | **404** |
| Feed header — message | `/messages` | **404** |

Fixed, each in the honest way rather than one blanket placeholder:
- **`/login`** — real `AuthFlow`, same component the seller host uses. Session
  cookies are HOST-ONLY, so a guest on the public host must be able to get a
  session THERE; that is exactly what makes save/inquire/report work from the
  public feed. Login-bypass now sealed for the public zone too (middleware).
- **`/profile`** — real `OwnProfile`, server-gated (`getCurrentUser()`), guests
  redirected to `/login`.
- **`/create`** — a routing bridge, not a screen: creation is a seller surface
  (plan wall, slots, moderation), so it 307s to the same deployment's seller
  host, origin derived from the REQUEST host (not a fixed env URL).
- **`/notifications` (Module 10)** and **`/messages` (Module 7)** — shell +
  EmptyState, the accepted `/search` pattern. No fabricated lists.

## A0-M6.9 Demo content pass — what it exposed (23 Jul 2026)
`npm run seed:demo` (`scripts/seed-demo-content.mjs`) fills every screen with
design-density content. Building it surfaced five REAL defects, all fixed:

1. **No listing photo in the app resolved.** 61 `listing_photos` rows held
   `/uploads/...` local-disk paths from the dev `local` storage driver, and 6
   live listings had no photo row at all — every feed card was a grey box. Now
   every visible listing has 6 real images uploaded to the Supabase
   `listing-photos` bucket (repair + backfill are steps in the seed).
2. **Project cards in the feed 404'd.** `PropertyFeed` taps project cards to
   `/project/:id`; that route existed only on the seller host and under a
   different name (`/projects/:id`). Added `app/(public)/project/[id]`.
3. **Amenities rendered as raw codes.** The create form stores codes
   (`power_backup`), the detail payload echoed them straight to the screen.
   `getAmenityLabels()` now resolves code → label server-side for both the
   listing and the project DTO; unknown values pass through.
4. **City-scoped feed had content in ONE city.** The feed scopes to the viewer's
   city (correct), but every live listing was in Rajkot — so a Vadodara owner or
   a Surat builder opened the app to an empty home. Seeded Vadodara, Surat and
   Ahmedabad with their own areas, listings, buyers and requirements.
5. **QA artifacts were showing as content**: 4 "Flat QA owner" copies, 4
   duplicates of one seeded listing (₹8.5 Cr with `bhk: 1`), and 143 QA drafts
   filling the profile grid. Archived / trashed, survivors' attributes fixed.

**Photo licensing:** images are Pexels (Pexels License — free use, no
attribution). Google Images was deliberately NOT used — arbitrary copyright,
cannot be re-hosted in our bucket.

Verify with `npm run check:roles` (`ROLES_BASE=<url>`): guest + owner + broker +
builder walked through feed, detail, requirement mode, profile stats, listings,
leads, proposals, visits and the builder dashboard, asserting on what the SERVER
returned.

Still thin (needs the owning module, not data): proposals/visits/leads exist
only for the Rajkot Module-5 actors, and the newer city buyers have no plan, so
their requirement cards stay locked — which is the correct paywall behaviour.

## A0-M6.7 P10 had no module in the build plan — now Module 6B
Found 23 Jul 2026 while mapping M6.1-M6.4 to their owning modules: `build/Doc6`
lists Modules 0-17 and **P10 (Saved / Activity / Settings, 12 screens) appeared
in none of them** — it showed up only in Doc6's file list. So the `saves` table
Module 6 ships had no consumer with an owner, and the now-unified bottom nav
carries a **Saved** tab that nobody was scheduled to build a destination for.

**Fixed:** added `### MODULE 6B — SAVED, ACTIVITY & SETTINGS (P10)` to Doc6,
between Modules 6 and 7. Numbered **6B deliberately** — Modules 7/8/9/10/11 are
referenced by number throughout these docs, so renumbering would rot every one
of those references.

Until 6B is built, `/saved` is **not a 404** — it is the shell + EmptyState
placeholder (the accepted `/search` pattern), so the nav tab lands somewhere and
no fake saved-list is shown. The table underneath is real; nothing saved is lost.
(The screens table below still said "`/saved` 404s" — corrected.)

---

# A. Blocked on the ADMIN module, not on any key

These are the ones people forget, because no credential will ever fix them.

## RULE CHANGE — a builder reaches requirements through a PROJECT (29 Jul 2026)

Rajan's decision, and it **supersedes Doc2 §2 line 24** ("View requirements …
Builder ₹2,999") and the builder row of §4.2:

- A builder can no longer buy the requirement-only plan. `p2999.roles` is now
  `{owner, broker}` (migration 0087) — `getCatalog` hides it and the existing
  `item.roles.includes(profile.role)` guards in `/billing/quote` and
  `/billing/checkout` turn a direct attempt into a 403. No new code path.
- Requirement access comes WITH the ₹9,999 project plan (`requirement_access`
  is now a real `plan_catalog` column, true for p2999 and p9999).
- **A builder may only send a proposal while a project of theirs is `live`.**
  Enforced in `sendProposal` BEFORE the quota draw, so a blocked builder never
  has a unit spent and refunded; surfaced as `PROJECT_REQUIRED` (403) and as
  `canPropose:false` on the browse / requirement-mode / proposal-sheet payloads
  so the button is never dead.

Proven end-to-end: `npm run check:builder-req` — 23/23.

### Found while doing it: the requirement paywall had never worked

`hasRequirementAccess()` reads `user_plans.terms->>'requirement_access'` and
**no plan snapshot has ever carried that key**. The function therefore returned
false for every user who has ever paid: 80 `user_plans` rows, not one able to
unlock a requirement card, so the ₹2,999 "unlock all requirements" bought
nothing and every browse screen in the app was locked for everybody. 0087 makes
the flag a catalog column and backfills the existing snapshots (7 × p2999,
5 × p9999). Verified on screen: a broker holding p2999 now sees full budgets,
poster names and "30 proposals remaining" where the same account previously saw
blurred cards.

One builder holds a legacy p2999 bought before this rule. They keep it until it
expires (the snapshot is frozen by design) — but the live-project gate still
applies to their proposals, which is the half that matters.

## A5. Nothing a seller posts ever goes live — found 29 Jul 2026

Reported as "the project a builder publishes never shows on the home page", and
it is not a feed bug: `createProject` writes `status='pending_review'`
(`lib/listings/projects.ts`) and the ONLY transition to `live` is
`moderate(..., "approve")`, reachable only through
`POST /api/v1/admin/moderate/:subject/:id` behind the `staff` table. The
endpoint and the state machine both work. **What does not exist is a screen that
calls them** — `app/(admin)/account/` is a login and a placeholder page, so
in practice no human can ever approve anything.

The DB says it plainly: on 29 Jul the `projects` table held **14
`pending_review` rows against 6 `live`**, and `moderation_log` had **one**
project decision in its entire history — the live rows were seeded, not
approved. Listings are in the same shape (27 `pending_review` in Rajkot alone).
So a builder pays ₹9,999, fills five steps, and the project is invisible to
every user forever; the builder's own dashboard is the only place it exists, as
"Under review".

**Cleared on DEV 29 Jul 2026** on Rajan's instruction: all 14 were pushed
through the real staff endpoint (not raw SQL), so `moderation_log`, the
`listing_approved` notification and boost-resume all ran as they will in
production. `projects` is now 20/20 live. This is a one-time unblock of the
existing queue — **the next project posted goes straight back to
`pending_review`**, so the gap is open until Module 11 ships.

Deliberately NOT fixed by auto-approving on submit: that would put a ₹9,999
project (and every listing) in front of users with no review at all, which is
the control the queue exists to provide.

**Closes with Module 11 (P13-14-15)**: a staff review screen over
`reviewQueue("project" | "listing" | "requirement")` and the moderate endpoint —
both already built and tested.

## A1. ✅ CLOSED 26 Jul 2026 (Module 9) — a paid boost CAN now become active

`approveBoost()` in `lib/billing/boost.ts` is the transition that did not exist,
exposed at `POST /api/v1/admin/moderate/boost/:id` with
`{action: "approve" | "reject" | "pause" | "resume"}` and gated by the same
`staff` table as listing moderation (404 to everyone else, so the endpoint isn't
confirmable by probing). Approve sets `status='active'` with
`starts_at`/`ends_at`/`approved_at`/`approved_by`, **re-checks eligibility at the
moment of approval** (Doc2 §13's race seal — a listing that sold while it waited
is rejected + refunded instead of quietly going live), enforces
`billing_settings.boost_city_cap`, and queues consecutively behind any boost
already running on the same subject. Reject stores the reason and leaves
`refunded_at` null so the existing single-flight sweep owns the money. Every
decision writes a `boost_reviews` row and notifies the seller.

Verified live via `node scripts/check-boost-live.mjs`: staff approved a pending
₹1,499 boost → `active` with a 30-day window matching the duration paid for; a
second approve was refused (no doubled window); pause/resume returned the paused
time to `ends_at`; reject stored the reason with `refunded_at` still null.

The admin *screen* is still Module 11 — see **M9.6**. The safety valve below stays
in place as a backstop for boosts nobody reviews.

### Original gap, kept for history

## A1-orig. 🔴 A paid boost never becomes active

**The gap.** `activateBoostForOrder` sets a paid boost to `pending_approval`
(`lib/billing/service.ts:817`). **No code anywhere moves it to `active`.** Grep
`pending_approval` across `app/` and `lib/`: every hit only *reads* the state.

So today: the user pays ₹499 → boost sits in `pending_approval` forever → the
listing is never promoted → no refund is triggered either (only the *user* can
cancel, or an admin can reject — and the admin screen doesn't exist).

**What's needed** (Module 11 — Admin Panel, P13-14-15, Doc5 · the "Boosts" queue with its 3 actions):

1. `POST /api/v1/admin/boosts/:id/approve` — set `status='active'`,
   `approved_at=now()`, `starts_at=now()`, `ends_at=now() + duration_days`.
2. `POST /api/v1/admin/boosts/:id/reject` — set `status='rejected'` +
   `reject_reason`. The refund is already automatic: `refundRejectedBoosts()` in
   `lib/billing/reconcile.ts` sweeps `rejected` boosts hourly and refunds them
   (single-flight via `claim_boost_refund`, migration 0011).
3. An approval queue screen listing `pending_approval` boosts.

### ✅ Safety valve IMPLEMENTED (22 Jul 2026, migration 0012)

The money half is now closed. `timeoutStalePendingBoosts()` in
`lib/billing/reconcile.ts` marks any boost left in `pending_approval` past
`billing_settings.boost_pending_max_hours` (default **48**) as `rejected` with
reason "Not reviewed within 48 hours — automatically refunded"; the existing
single-flight refund sweep then returns the money in the same run.

Auto-**refund**, not auto-approve, on purpose: approving without review would
bypass the Doc2 §13 moderation gate. Refunding is always the safe direction.

Verified live: bought a real boost → aged it past the window → one cron run gave
`boostsTimedOut: 1, boostRefunds: 1`, and the boost ended `rejected` with
`refunded_at` set and both `orders` + `payments` at `refunded`. A boost bought
seconds earlier was untouched (`boostsTimedOut: 0`), so nothing refunds early.

**Tune or disable** by updating `billing_settings.boost_pending_max_hours` — no
deploy needed. Once the admin queue is live, raise it or set it very high.

**Still missing:** a boost can never become `active`. Until the admin endpoints
below exist, every boost purchase ends in a refund rather than a promotion.

**Verify when built:** buy a boost → approve → `boosts.status='active'` with
correct `starts_at`/`ends_at`, and the P11 Boost Status screen shows the live
progress bar. Then reject another → within the hour, `refunded_at` is set and
`orders`/`payments` both read `refunded`.

## A2. Trial plans are unreachable

`user_plans.is_trial` + `granted_by` exist and the My Plan screen renders a full
trial card (`lib/billing/dto.ts` → `trial`), but **nothing grants one** — trials
are admin-only by design (Doc2 §4). `plan_reminders`/`db:proof` show
`trial_plans = 0`; the code path has never executed.

**What's needed:** an admin "grant trial" action writing a `user_plans` row with
`is_trial=true`, `granted_by=<admin>`, and an `expires_at`.

**Verify when built:** granted user's My Plan shows the trial card and its
"Buying a plan ends the trial" note; buying a plan ends it.

## A3. ✅ CLOSED 26 Jul 2026 (Module 9) — boost placement is wired

Feed, story row, search results, the Explore 2×2 hero, area landing pages and the
requirement-mode feed all place boosts now, through one shared read path
(`lib/billing/placement.ts`) so no two surfaces can disagree about ranking.
Targeting is honoured against resolved location ids (migration 0038) — which is
what the old text-only `target_label` could never do — and requirement boosts are
locked-but-top for unpaid viewers. Full detail, plus the eight defects found on the
way, in **M9** at the bottom of this file.

### Original gap, kept for history

## A3-orig. Boost placement is not wired (Module 9)

Module 9's prompt is *"wire boost placement into feed/story/search (top slots,
"Promoted" tag, location targeting) … Requirement-boost = locked-but-top for
unpaid"*. None of that exists yet — grep `promoted`/`boosted` across the feed and
search code returns nothing. `boosts.targeting` and `target_label` are stored and
charged for, but no query ever reads them.

So even once Module 11 can approve a boost, it would be `active` in the DB and
**still invisible** — the user pays for placement that doesn't happen.

**Already done from Module 9's list** (built during Modules 3-4, don't redo):

- ✅ auto-stop on sold — `lib/listings/service.ts:499`, `lib/listings/lifecycle.ts:120`
- ✅ refund on admin-reject, atomic + race-sealed — `refundRejectedBoosts()`
- ✅ renew-1-tap — `POST /billing/boost/:id/renew`
- ✅ status-only, no user analytics — enforced in the P11 Boost Status screen

**Still to build in Module 9:** feed/story/search top slots, the "Promoted" tag,
location-targeted selection (area/city/state/india), and requirement-boost
locked-but-top for unpaid viewers.

## A4. Profile "Block" and "Report" are UI-only

`components/profile/OtherProfile.tsx:187` (Block) and `:181` (Report profile)
both just close the sheet and show a success toast — *"X blocked"* / *"Report
submitted — we'll review it"*. There is **no API call**, and no block/report
endpoint exists anywhere in `app/api`.

**Not a Module 2 miss.** Module 2's prompt covers "Other profile (public only,
no Views/Leads, suspended/deleted states)" — block/report aren't in it. They came
from the P9 design menu, which the design lock requires building. Their backends
belong to **Module 7** (block ↔ chat/number system) and **Module 11** (the admin
Reports queue).

**Until then, decide one:** (a) build a small `blocks` + `reports` table now so
the buttons tell the truth, or (b) hide the two menu items until their module
lands. Option (b) touches the locked design, so it needs Rajan's sign-off.

⚠️ Of the two, **Block is the one that matters** — a user who thinks they've
blocked someone but hasn't may keep receiving contact they believe is stopped.

---

# B. Blocked on credentials

## B1. 🔴 Razorpay webhook — ⏳ PENDING SECRET

**What's missing:** `RAZORPAY_WEBHOOK_SECRET` in `.env.local` holds a **locally
generated dev value**, not Razorpay's. It makes `npm run webhook:test` work; it
will **not** validate a real Razorpay delivery.

**What already works:** payment keys are live (`RAZORPAY_KEY_ID` /
`RAZORPAY_KEY_SECRET`) — real orders are created, and `/billing/verify` handles
the normal pay-and-return flow. Only the *webhook* half is inactive.

**Why it matters:** the webhook settles payments when the browser never comes
back — tab closed mid-payment, delayed UPI collect, network drop.

### When the secret arrives — do this

1. Razorpay Dashboard → Settings → Webhooks → Add.
2. URL: `https://<real-domain>/api/v1/billing/webhook/rzp-3f9c1a`
   (a tunnel works too, but Razorpay rejects `.loca.lt`; use `trycloudflare.com`,
   `ngrok-free.app`, or a Vercel preview URL).
3. Subscribe to exactly: `payment.captured`, `order.paid`, `payment.failed`.
4. Put the dashboard's signing secret in `.env.local` (and in the host's env for
   prod) as `RAZORPAY_WEBHOOK_SECRET=…` and restart.

### Then re-check these

- [ ] `npm run webhook:test` still passes against the real secret.
- [ ] `npm run webhook:test -- --bad-signature` → HTTP 401, DB unchanged.
- [ ] `npm run webhook:test -- --replay` → second delivery returns
      `duplicate: true`; still exactly 1 payment + 1 user_plan + 1 invoice.
- [ ] Real end-to-end: pay with a Razorpay test card, **close the tab before it
      redirects**, confirm the plan still activates from the webhook alone.
- [ ] `webhook_events` gets a row per delivery; a replayed `event_id` does NOT
      insert twice.
- [ ] Amount tamper: a delivery whose amount ≠ `orders.total_paise` is recorded
      `status='mismatch'` and grants nothing.
- [ ] Boost race (Doc2 §13): mark a listing sold, then deliver its boost's
      `payment.captured` — boost must end `rejected`, not `active`.

### ⚠️ Also unblocked by this: REAL REFUNDS are still unproven

Every payment in the dev DB was minted by `npm run webhook:test`, so
`payments.razorpay_payment_id` values are **synthetic** — Razorpay's API rejects
refunding them ("The id provided does not exist"). The refund *logic* is proven
(recovery sweep + single-flight race, `npm run test:refund-race`), but a refund
has **never actually been issued through Razorpay**.

- [ ] After one **real** test-card payment exists: cancel that boost and confirm
      a real refund object comes back, `payments.status='refunded'`,
      `orders.status='refunded'`, `boosts.refunded_at` set.
- [ ] Confirm `refund_claimed_at` is cleared/kept correctly on failure —
      `claim_boost_refund` releases on error so the hourly sweep retries.

**Code involved:** `app/api/v1/billing/webhook/rzp-3f9c1a/route.ts`,
`lib/billing/razorpay.ts` (`verifyWebhookSignature`), `lib/billing/service.ts`
(`activatePaidOrder`), `lib/billing/reconcile.ts`.

## B2. 🔴 Cron — scheduled in code, NOT yet live on a host

`vercel.json` now declares both schedules (added 22 Jul 2026):

| Path | Schedule (UTC) | Does |
|---|---|---|
| `/api/v1/cron/billing` | `0 * * * *` (hourly) | reconcile stuck/pending orders, refund rejected+cancelled boosts, **send expiry reminders**, expire plans + boosts |
| `/api/v1/cron/listings` | `30 20 * * *` (= 2:00 AM IST) | listing lifecycle chain |

Both routes accept **GET** (Vercel Cron uses GET) with the same constant-time
`CRON_SECRET` bearer check, and fail closed if the secret is unset.

### On first deploy — do this

1. Set `CRON_SECRET` in the host's environment (Vercel → Project → Settings →
   Environment Variables). **Without it every cron run 401s and silently does
   nothing.**
2. Deploy, then confirm Vercel → Cron Jobs lists both schedules.
3. Trigger once manually and check the JSON report is non-error.

### Then re-check these

- [ ] Unauthenticated GET → 401. Wrong secret → 401.
- [ ] A plan whose `expires_at` has passed actually flips to `expired`
      (today nothing is past expiry, so this has never fired in prod).
- [ ] A boost past `ends_at` flips to `expired`.
- [ ] Reminders fire once and only once per (plan, milestone).

## B3. Reminder delivery — recorded, not yet sent

`sendExpiryReminders()` works and is proven (7-day + 1-day, idempotent, opt-out
honoured). But `deliverExpiryReminder()` currently writes an auditable trace row
to `webhook_events` (`provider='reminder'`) **instead of sending a push or
email** — the FCM/Resend provider layer is Module 7.

So: the ledger is correct and no reminder is lost, but **the user is not
actually notified yet.**

### When FCM + Resend keys arrive — do this

1. Add `FCM_SERVICE_ACCOUNT_JSON` and `RESEND_API_KEY`.
2. Replace the body of `deliverExpiryReminder()` in `lib/billing/service.ts`
   with the real provider call. **Keep the ordering:** the `plan_reminders`
   insert must stay *before* delivery — it is what claims the send and makes the
   job idempotent.
3. Respect `notification_prefs.expiry_reminders` (already checked by the caller).

### Then re-check these

- [ ] A due reminder produces a real push/email, once.
- [ ] Re-running the cron in the same window sends nothing further.
- [ ] A user with `expiry_reminders=false` receives nothing.
- [ ] A delivery failure does not lose the row (decide: retry, or leave the
      ledger row and accept one missed send).

## B4. Cloudflare R2 — ⏳ PENDING KEYS (Supabase Storage is the interim store)

**What's missing:** all of `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_CDN_URL`.

**Current behaviour:** media lives in **Supabase Storage** (migration 0006):

| Bucket | Access | Holds |
|---|---|---|
| `listing-photos` | public read, CDN-served | listing imagery |
| `private-docs` | private, signed URLs only | ownership proofs, brochures |

`lib/storage.ts` picks its driver automatically: **r2 → supabase → local**, so
adding the keys switches new uploads with no code change. Every row records
which bucket it lives in (`listing_photos.bucket`, migration 0007), so a
half-finished migration still resolves correctly.

Uploads are direct browser → Supabase via a **server-minted signed upload URL**,
so bytes never transit our server.

### When the keys arrive — do this

1. Add all five `R2_*` values and restart.
2. Confirm the driver flipped: `POST /listings/:id/photos/presign` returns a
   grant whose `url` is `https://…r2.cloudflarestorage.com` (not `…supabase.co`).
3. **Move the existing objects across:**
   ```bash
   npm run storage:to-r2 -- --dry-run   # report what would move
   npm run storage:to-r2                # copy → repoint DB → delete source
   ```
   Re-runnable, copies before deleting. `--keep` leaves the originals.
4. Spot-check a migrated photo loads from the R2 CDN URL.

### Then re-check these

- [ ] Presigned PUT succeeds directly from the browser and `commit` attaches it.
- [ ] The returned `publicUrl` serves the image from the CDN.
- [ ] No `listing_photos` row still has `bucket = 'listing-photos'`.
- [ ] Migrated listings show the right cover (the script rebuilds `cover_url`).
- [ ] **`/api/v1/uploads/local` returns 404** — it must self-disable.
- [ ] Storage keys still server-minted (never derived from the filename).
- [ ] Content-type pinned in the signature: a PUT with a different
      `Content-Type` than requested must be rejected by R2.
- [ ] Per-role photo caps still enforced (Owner/Broker 10, Builder unlimited).
- [ ] Photo delete removes the R2 object, not just the DB row.
- [ ] ⚠️ **Ownership-proof docs must NOT be publicly readable** — verify the raw
      CDN path 403s and only a short-lived `signedReadUrl` works.

### ✅ The upload-validation gap is CLOSED (fixed 21 Jul 2026)

`commitPhotos` downloads each committed object and **magic-byte validates it
server-side** before the photo is usable — regardless of driver, without the
worker or Redis. A failing file is marked `failed` AND deleted from the bucket.

Verified: a `<script>` uploaded as `image/png` is accepted by the bucket (mime is
only a client claim) but rejected on commit, and its public URL then 404s.

The image **worker** is still a stub — optimisation only (WebP, watermark), not
security. Its absence costs image quality and CDN size, not safety.

**Code involved:** `lib/storage.ts`, `lib/listings/photos.ts`,
`app/api/v1/listings/[id]/photos/*`, `app/api/v1/uploads/local/route.ts`,
`lib/image-pipeline.ts`.

## B5. Other keys — same pattern

| Integration | Env var | Effect while missing | On arrival |
|---|---|---|---|
| Redis / BullMQ | `REDIS_URL` | Image optimisation + notification fan-out don't run. `KV_DRIVER=memory` covers auth/rate-limits **in dev only** — counters reset on restart, so OTP caps are not durable. | Set `REDIS_URL`, drop `KV_DRIVER=memory`, confirm rate-limit counters survive a restart. |
| Resend | `RESEND_API_KEY` | Invoice emails marked sent, not delivered. | Verify `POST /billing/invoice/:id/email` actually delivers; check the GST PDF attaches. |
| FCM | `FCM_SERVICE_ACCOUNT_JSON` | No web push (see B3). | Register a device token, confirm a push arrives. |
| MSG91 (OTP) | `MSG91_*` | OTP stays DEV mode (fixed code `123456`). **Must be `msg91` before production** — `assertProdSecrets()` already fails the build otherwise. | Switch provider, confirm a real SMS arrives and the dev code stops working. |

---

# C. Decisions, not credentials

## C1. ✅ `EXPIRED10` coupon — FIXED (22 Jul 2026, migration 0012)

It had no `expires_at`, so despite the name it validated as a **live ₹100
coupon**. Now backdated one day, which is what the name implied.

Verified live: `coupon/validate` → `{"valid":false,"message":"Invalid or expired
code"}` (generic, no enumeration leak) and checkout → `couponError: "EXPIRED"`.

If it was actually meant to be a live promo, rename it and clear the expiry.

## C3. ✅ Quota charged for something never created — FIXED (23 Jul 2026, migration 0024)

`consume_quota` draws a unit atomically, but the caller then inserted the
requirement in a **separate** statement. When that insert threw, nothing undid
the draw — the user was charged a requirement that does not exist.

Found in the dev DB, not in theory: `plan_consumptions` held 4 `requirement`
rows with `ref_id IS NULL` across **all three** roles, with `requirement_used`
incremented on those plans and **zero** matching `requirements` rows.

Fixed in three parts:
1. `release_quota()` (migration 0024) — decrements the counter and marks the
   consumption `reverted_at` + `revert_reason`. Failure-only: Doc2 §4.2 says
   ordinary delete/toggle-off does NOT return quota, so it is never wired there.
2. `createRequirement` and `submitListing` now wrap everything after the draw in
   a try/catch that releases on failure (the listing path could strand a slot
   the same way if `reserveSlot` threw).
3. A backfill in the same migration reverted the 4 already-stranded rows.

**Verified by fault injection**, not by absence: a CHECK constraint was added to
reject the exact row, the create returned HTTP 500, and `requirement_used`
came back unchanged (6 → 6) with the consumption marked
`'Requirement create failed'`. `npm run qa:module4` now carries a permanent
"QUOTA INTEGRITY" section so this cannot silently return.

## C2. Checkout shows CGST+SGST, the design shows one "GST (18%)" row

P6's mock has a single `GST (18%) ₹144` line; the app renders `CGST (9%)` +
`SGST (9%)` because the invoice must itemise them, and an inter-state buyer
needs a single `IGST` row that a hardcoded "GST (18%)" label can't express.

The split is believed correct for a GST tax invoice; the design likely predates
the tax work. **Confirm with Rajan** — design is otherwise locked.

## C3. Possession-date options were seeded forward, not copied from the design

designs/P5 reveals a **Possession date** select under `age = "Under
construction"`. Its sample options are `Dec 2025 · Jun 2026 · Dec 2026 · Jun
2027` — the first two are already in the past.

Migration 0016 seeds the same half-year cadence starting from the next one
(`Dec 2026 → Jun 2028`, plus "Later / not fixed"). It is a `field_definitions`
row, so the list is editable without a deploy — but it WILL go stale again.

**Decide:** either a) confirm the rolling list and add a job that appends a
half-year each cycle, or b) switch the control to a month picker like the
project form's. Design is otherwise locked, so this needs Rajan's call.

## C4. Ownership-proof upload works; nothing consumes the document yet

P5 section H is now built end to end — document type + upload to the **private**
bucket (`kind: "doc"`), key stored on `listings.ownership_proof_key`.

What does NOT exist yet: any screen that shows an admin the document, and any
effect of having supplied one. The section promises "Verified listings get more
genuine inquiries" — today that promise has no job behind it.

**Needs the admin module (P13-15):** a proof viewer in the listing review queue,
and whatever badge/ranking the verified state is supposed to earn.

## C5. Listing edit does not re-run the photo stage

`?edit=` on the listing form covers every field the create form has, and a major
change (location) already routes back to review via `updateListing`'s
`MAJOR_FIELDS`. Photos are edited from their own screen, so an edit never
re-opens the photo step.

Believed correct, but worth confirming against the design's `edit` screen, which
was never implemented as a separate screen — the create form does both jobs.

---

# D. Design coverage — audited 22 Jul 2026

Walked every design file against the routes that exist. This is the map of what
is BUILT vs what the design specifies, so an unbuilt screen is tracked rather
than rediscovered.

| Design | Screens | Built? |
|---|---|---|
| P1 Auth & Entry | s1–s9, legal | ✅ |
| P2 Feed + Stories + Global Shells | feed, story | ✅ built 23 Jul 2026 (Module 6) — property/requirement/builder feed + story row/viewer + all sheets; see A0-M6 |
| P3 Search / Explore | home, results, area, comingsoon | ❌ not built — `/search` 404s |
| P4 Detail Screens | property, project, requirement, viewer, sold, error | ⚠️ all four render; see D2 for what's missing inside them |
| P5 Creation A | plan, posttype, proptype, form, photos | ✅ |
| P6 Creation B | preview, checkout, success, reqform, projform, drafts, edit | ✅ (`edit` is the create form in edit mode — see C5) |
| P7 Messages & Chat | home, chat, requests, details, archived, blocked | ❌ not built |
| P8 Visits/Leads/Requirements/Proposals | visits, leads, reqBrowse, myReq, proposalsRx, myProp | ✅ built 23 Jul 2026 (Module 5) — chat-origination deferred, see A0 |
| P9 Profile suite | ownProfile, editProfile, verification, listings, listingStats, accountStatus, otp* | ✅ |
| P10 Saved/Activity/Settings | S1–S10 (12 screens) | ❌ none built — **Module 6B** owns it (added 23 Jul 2026, A0-M6.7); `/saved` = placeholder shell, not a 404 |
| P11 Plans/Payments/Boost/Notifications | plans, myplan, payments, boost, boostbuy, **notif** | ⚠️ five built; the **Notifications screen is missing** |
| P12 Help/Legal/Blog/System | help, legal, blog, system pages | ✅ built 3 Aug 2026 (Module 12) — all screens; see A0-M12 |

## D0. ✅ Module 4 completion pass — 22 Jul 2026 (migration 0019)

Closed in this pass, each verified against the DB:

- **Moderation exists.** `pending_review` was a terminal state — no code could
  approve anything, so nothing could ever go live on its own. Now:
  `lib/listings/moderation.ts` + `POST /admin/moderate/:subject/:id` +
  `GET /admin/queue/:subject`, staff-gated by the new `staff` table, with every
  decision written to `moderation_log`. **The admin DASHBOARD is still P13-15** —
  this is the state machine underneath it, driven by API for now.
  Seed a reviewer with `node scripts/seed-staff.mjs +91XXXXXXXXXX admin`.
- **`rejected` was a dead-end.** `submitListing` only accepted
  `draft`/`changes_requested`, so a rejected listing could never be resubmitted,
  `reject_count` could never exceed 1, and the documented 3-reject lock was
  unreachable code — while the seller's paid slot stayed consumed. `rejected` is
  now resubmittable; `is_locked` is what stops the loop.
- **`restore` was unreachable twice over**: `listMine` filters deleted rows out
  (no Trash view), and `setListingStatus` looked the row up through
  `getListingForViewer`, which 404s soft-deleted rows to everyone. Both fixed;
  Trash is now a collapsible section in My Listings with a server-computed
  `daysLeft`.
- **Vigha/Guntha conversion ran nowhere.** `toSqft()` was exported and called by
  nothing. `listings.area_sqft` now stores the canonical figure at write time —
  verified: 3 Vigha → 52,272 sq ft, seller's unit preserved in `attributes`.
- **Still-available had no answer UI.** The cron set the flag and auto-hid the
  listing 15 days later without the owner ever being asked. My Listings now
  shows the prompt with Yes / "No, it's sold".
- Also: pincode (the 6th cascade level), floor-plan upload per project unit,
  "Update Units" wired to its existing PATCH endpoint, Similar-properties rail
  (server-matched), photo viewer with pinch/double-tap zoom + swipe, and the
  owner-only under-review / rejected / sold states on the detail screen.

Crons need no code change — `vercel.json` already schedules both. They have
simply never run because nothing is deployed (B2).

## D0b. Module 4 verification pass — 23 Jul 2026

Design-lock + all-roles/all-types live verification + auditors.

**Verified live (each backend-driven, no browser state):**
- Role filtering: owner/broker → 13 types incl. PG; builder → 12, **no PG**; Project builder-only. From `property_types.roles`.
- All 13 property types: valid payload passes; empty payload rejects **exactly** the type's `required[]` (flat→bhk+builtup, farmhouse→plot_area only, commercial→carpet_area, plots→land_area, PG→none).
- Area conversion every unit: guntha→×1089, vigha→×17424, acre→×43560, sqft→×1, all matched `area_sqft`.
- Moderation: approve/request_changes/reject + 3-reject lock + resubmit-from-rejected + double-decision concurrency guard — full cycle, DB-proven with `moderation_log` trail.
- Trash restore (deleted→draft), still-available answer, attribute-label resolution, similar rail.

**security-auditor: PASS** (no High/Critical). Three Low findings — all fixed this pass:
1. `hashIp()` now peppered with `JWT_ACCESS_SECRET` (env `HASH_PEPPER` overrides) so a leaked `listing_views` export can't be reversed to guest IPs.
2. Listing PATCH now runs the same `^[6-9]\d{9}$` phone check as create on contact/alt/whatsapp numbers — verified live (bad → 422).
3. `PATCH /projects/:id/units` now rate-limited like every sibling mutation.

**qa-tester: PASS** with two real bugs it surfaced — both fixed + verified:
1. **Edit form blanked the location cascade** — 6/10 rows had `district_id`/`taluka_id` NULL (chain broken mid-way) while state/city/area were set, and the cascade needs every ancestor to unlock. Fixed two ways: the detail API now reconstructs the full chain from `parent_id` (`resolveLocationChain`, robust for any future gap), and migration 0021 backfilled the stored columns (0 broken chains now). Verified live: edit form re-opens on State→Area.
2. **Projects could never be approved** — `projects` was missing `submitted_at`/`review_notes`/`reject_reason`/`reject_count`/`is_locked`, so `reviewQueue('project')` errored to `[]` and no project reached review — same dead-end listings had, for projects. Migration 0022 added the columns; `reviewQueue` now orders by `created_at` (exists on all three tables) and fails loud instead of swallowing. Verified live e2e: project queue → approve → **live**, detail page renders.

(qa-tester also couldn't reach some flows because the app was being live-edited during its run — HMR churn swallowed clicks. Those were re-verified by hand afterward: house/farmhouse forms, edit cascade, project approve→live→detail.)

Wireframe + design-lock reference artifact built (every P5/P6/P4 screen, status, backend notes).

## D0c. ✅ House/farmhouse area fields — RESOLVED (migration 0020, 23 Jul 2026)

designs/P5 groups Flat+Bungalow+Tenement as `isFlatLike` (built-up + carpet, no
plot). Rajan asked me to research before changing a whole type. Findings
(99acres/civiconcepts): built-up sizes APARTMENTS; independent houses / villas /
bungalows are sized by **plot area + built-up + carpet**, and "tenement" in
Gujarat is a small independent house with its own plot. So the design's
flat-grouping is the oversight.

Applied:
- `bungalow` / `tenement` → **plot_area + builtup_area + carpet_area** (real
  independent-house set), required `[bhk, plot_area, builtup_area]`.
- `farmhouse` → `land_area` (Vigha/Guntha/Acre) + metric `construction_area`.
- Units are now **per-field** (`field_definitions.units`: land|built), so one
  form shows Vigha on the land row and sq ft on the construction row —
  `land_area`=land, `plot_area`/`builtup_area`/`carpet_area`/`construction_area`=built.

Config DB-verified; live browser check of the three forms pending (was mid qa-tester run).

## D1. 🔴 Two of the five bottom-nav items 404

`DEFAULT_NAV` in `components/nav/BottomNav.tsx` ships `/search` and `/saved`.
Neither route exists, so **on every screen that has a bottom nav, 2 of 5 taps
land on "Page not found"** — verified live.

That breaks CLAUDE.md rule 10 ("no dead buttons, no dead-ends") today, months
before P3/P10 are due.

**Do one of:** (a) build a "coming soon" screen for both — P3's design already
HAS a `comingsoon` screen, so this is design-supported; or (b) filter them out
of `items` until the modules land (the component is already documented as
feature-toggle safe and the row reflows). **(a) is closer to the design.**

## D0d. Module 4 pixel-diff pass — 23 Jul 2026

First run of a **true visual pixel-diff** of every Module 4 screen against the
locked prototypes. Tooling added (all reproducible):

```bash
node scripts/build-designcheck.mjs     # unpack designs/*.html → /_dx (offline)
node scripts/seed-module4-states.mjs   # a real row for every listing state
node scripts/pixdiff.mjs [id ...]      # design vs app → _shots/*.png + report.json
```

**Why screenshots did not work before.** Two independent causes, both fixed:

1. `designs/*.html` are *bundler archives* — the prototype is a JSON-encoded
   template that gets injected into a sandboxed iframe over `postMessage`, so a
   screenshot caught the green loading frame, never the design.
   `build-designcheck.mjs` unpacks the template, vendors React/Babel locally and
   serves it at `/_dx/P4.html` etc., driveable by URL hash and by state.
2. The in-app Browser pane cannot composite frames while it is not displayed —
   its screenshot call times out. `scripts/lib/cdp.mjs` drives a headless Chrome
   over the DevTools Protocol instead, which yields real PNG bytes on disk.
   `scripts/lib/pixels.mjs` diffs them with sharp (no scaling: a height
   mismatch shows as a difference instead of being resampled away).

**DB gaps the diff exposed.** Before this pass the database had **never** held a
listing in `pending_review`, `hidden` or `archived`, had never used
`availability` `sold`/`rented`, and **no draft or listing had a single photo** —
so screens 5, 6, 14, 17, 18 and 19 had literally never been rendered against
real data. `seed-module4-states.mjs` now creates each one through the real API
(checkout → signed webhook → slot → create → photos to R2 → submit → moderate),
so the states are proven, not asserted. Remaining unseeded: `payment_pending`.

**Screen-by-screen deviations found** (percentages are differing pixels at
390×760, so they include legitimate content differences — read them as "where
to look", not as a score):

| # | Screen | Diff | Status |
|---|--------|------|--------|
| 1 | Plan wall | 23.7% → **18.3%** | route corrected to the creation-flow wall; remaining delta is the per-role recommended plan (see below) |
| 2 | Post type | 14.4% → **7.0%** | ✅ prompt line, design card metrics, and the missing **slot counter strip** (server slot count + info dialog) |
| 3 | Property type | 12.9% | ✅ rebuilt to the design: flat category sections over a 3-up icon grid with a **Continue** step. It was collapsible accordions that navigated on tap — a different screen. |
| 4 | Listing form | 10.8% | ✅ field metrics to the design (label 13/600 + 6px, helper/error 11px + 6px) and the error line now carries the alert glyph the design draws |
| 5 | Photos | 73% → **60%** | ✅ title "Add photos", `n / max` counter (server cap), step dots, dashed add-tile, format-hint row, single "Continue to Preview" CTA, and the first-run tip rebuilt as the design's **centered dialog** (was a bottom sheet). Remaining delta is the four sample photos — placeholders, see below. |
| 6 | Photo editor | 70% → | ✅ 4:5 preview, segmented Crop/Rotate/Brightness control, crop chips, 52×44 rotate buttons, Reset-link + Save footer bar |
| 7 | Preview | 58% → **59%** | ✅ "Submit for review" in the top bar, Details/Amenities/Description in the design's order with server-resolved labels, 4-col spec strip, 44px feed action row, Submit at flex 1.4. **Fixed a real bug**: the feed-card meta line read `built_up_area`/`floor_no`, which are not the stored keys, so every card silently fell back to the bare type label. |
| 8 | Checkout | 16.8% | ✅ GSTIN input to 48px to match the coupon row. The CGST+SGST vs single-GST-row difference is a pricing decision, still tracked as C2 |
| 9 | Success | 15.7% → **9.8%** | ✅ 48px top padding, 290px sub, timeline spacing, info strip with its icon, and the CTA moved to a sticky bar |
| 10 | Requirement form | 16.0% | ✅ centred title. The design also shows **Save draft** — requirements have no draft path, so it is deliberately absent rather than faked (see below) |
| 11 | Project form | 12.8% | ✅ centred title and the design step line: count left, step NAME right in ink3, both 11/600 over a 4px track |
| 12 | Drafts | 7.4% → **4.3%** | ✅ counter in the bar, bordered rows with thumb + progress + expiry, info strip, ⋯ sheet replacing `window.confirm()` |
| 13 | Edit | **15.7%** | route corrected (see below) |
| 14 | Property detail | 49% → **36.7%** | ✅ see below |
| 15 | Project detail | 40.9% → **11.8%** | ✅ overlay morphing header, hero counter, chip rail, RERA strip, facts spacing, floor-plan-left unit rows, sentence-case section headings |
| 16 | Requirement detail | 15.6% | ✅ tags are 4px/11px uppercase per the design (were 13px pills); expired + fulfilled now render as full strips |
| 17 | Photo viewer | 38.7% | ✅ close moved LEFT, counter centred, **share added**, **thumbnail filmstrip added**, prev/next chevrons, caption above the strip |
| 18 | Sold / unavailable | 15% → **12.1%** | ✅ rebuilt as the design's S5 page (96px mark, 20px title, accent CTA + "Go to Home") |
| 19 | Under review | 45% → **37.4%** | ✅ watermark, review banner, owner stats strip, Edit/Boost/Mark as Sold |
| 20 | Error / 404 | 8.1% | ✅ rebuilt to the design (96px mark, 20px title, **Go to Home + Search properties**). Also added the missing crash boundary — see below |

### ✅ 14. Property detail — brought to the design (23 Jul 2026)

Was missing, now implemented and DB-driven:

- **overlay "morphing" header** — transparent over the hero with back / save /
  share / more, going solid with the title on scroll (was: opaque bar, back only)
- **hero overlays** — dot pager, `PROMOTED` badge (real `boosts` query,
  `service.isPromoted`), `UNDER REVIEW` watermark, counter at the design's offset
- **full-bleed status strips** for under-review / sold, replacing inset cards
- **price block** — `Negotiable` pill, `₹/sqft` (computed server-side from
  `price_paise` and the area attribute), `FOR SALE` / `FOR RENT` pill
- **location line with pincode** ("Mavdi, Rajkot – 360004")
- **4-tile key-spec strip** and **highlight chip row** — which fields fill them
  is per-type config in `property_types.field_config` (**migration 0023**), values
  resolved through `field_definitions`; nothing hardcoded in the component
- **Property Details** as the design's plain 2-column list (was a grey card)
- **sticky bar variants** — Request Number + Send Inquiry (private), call +
  WhatsApp + inquiry (public), Browse similar (sold), Edit / Boost / Mark as
  Sold with the owner stats strip (owner)

Removed: the prev/next chevrons over the hero, which the design does not have.

### ✅ 19. Under review — the route exists, the harness was pointed at the wrong host

An earlier note in this file claimed the owner had no route to their own
under-review listing. That was wrong, and it was a harness mapping mistake, not
a product gap: the owner's view lives on the **seller** host at
`seller.…/listings/:id` (`app/(seller)/seller/listings/[id]/page.tsx`, which
renders `ListingDetail`). The pixel-diff was pointing at the PUBLIC
`/property/:id`, where a 404 is the correct answer — session cookies are
host-only per subdomain (middleware.ts), so there is no owner there to
recognise.

The owner variant now renders the design's treatment: `UNDER REVIEW` watermark
over the hero, the blue review banner, the Views / Saves / Leads strip and the
Edit / Boost / Mark as Sold bar.

Same correction for **13. Edit**: the edit FORM is `/create/form?edit=<id>`;
`/listings/<id>` is the owner's detail screen (a P4 design, not P6 S7).

### 🔴 A photo commit hangs forever when Redis is down — FIXED

BullMQ requires `maxRetriesPerRequest: null` on its connection, so a command
issued while Redis is unreachable **never rejects** — ioredis queues it offline
and retries forever. `enqueueProcessing` in `lib/listings/photos.ts` has a
`catch` that marks the photos ready and carries on, and the comment above it
documents exactly that fallback — but the `catch` was unreachable, so the
request just hung. Observed live: the dev server stopped serving entirely
(every request timing out) after a run of photo commits with no local Redis.

Fixed by racing the enqueue against a 3s deadline so the documented fallback
actually runs. Worth reviewing the same pattern anywhere else a BullMQ enqueue
sits in a request path.

### ✅ 22. Trash — the screen did not exist; now built and DB-proven

`GET /listings/trash` and `restore` had existed since the first Module 4 pass,
but the only UI was a collapsed accordion buried inside My Listings, and
designs/P10 S4 is a screen of its own. Also missing: the design's **"Delete
now"** action had no endpoint at all — the only way a row ever left trash was
the 30-day cron.

Built:
- `components/listings/Trash.tsx` + `/seller/listings/trash` — info strip,
  56px dimmed thumb, type + "Deleted Nd ago · N days left" tags (warning tint
  inside the last week), Restore + Delete now, and the empty state.
- `POST /api/v1/listings/:id/purge` → `service.purgeListing`, which filters on
  `status = 'deleted'` **in the statement** so it can't hard-delete a live
  listing and two parallel calls can't race past the check. The consumed slot
  is deliberately not returned.
- My Listings now links to it instead of carrying a second list inside itself.

Proven live against Postgres — `npm run verify:trash`, **18/18 pass**:
soft-delete → appears in trash with a server-computed `daysLeft` → absent from
another user's trash → their purge is 404 (not 403) → anonymous purge is 401 →
restore returns it → purging a non-trashed listing is refused → delete now
removes the row AND its photo rows → purging twice is a clean 404.

### ✅ 20. There was no crash boundary at all

`app/error.tsx` did not exist, so any thrown render fell through to Next's
default error page — not a HomzList screen, and no way back. Added, matching
designs/P4 S6 `isCrash`: 96px mark, "Something went wrong", **Reload** +
**Contact Support**. The message is deliberately generic; an exception can
carry a query, an id or a stack frame and none of that belongs on screen
(Doc9 §7).

### ✅ 21. My Listings — the status filter chips were missing

designs/P9 S6 has a filter rail across the top with a **count on every chip**.
`GET /listings/mine` now returns a `filters` array computed from the same rows
the list is built from, so a chip and the list can never disagree, and a
filter the seller has nothing in shows an honest `0` rather than vanishing.

Verified live for a real seller: `All 19 · Live 5 · Pending 2 · Changes
requested 1 · Rejected 1 · Hidden 2 · Sold 3 · Rented 2 · Archived 5` — and
the totals moved by one immediately after `verify:trash` purged a row, which
is the proof they are live queries and not a cached constant.

Still missing from that design: the **plan strip** ("1 of 1 listing slots used
· Buy another slot"). It needs the same `pooled.listingSlotsLeft` the plan
wall already reads; not built yet.

### 🔴 10. Requirement form — "Save draft" has no backend

designs/P6 S4 puts a **Save draft** action in the requirement form's app bar.
There is no draft path for requirements: `createRequirement` writes
`status: 'pending_review'` directly, and the `draft` value in the
`requirement_state` enum **has never been written by any code**.

The button is therefore deliberately absent rather than wired to a toast —
a control that claims to save and doesn't is worse than a missing one.

To build it: a `POST /requirements` variant (or `?draft=1`) that writes
`status='draft'`, a `GET /requirements/mine` filter for drafts, and resume +
expiry to match listing drafts (90 days). Then add the button.

### The "recommended" plan is a hardcoded map, not config

`app/api/v1/billing/plans/route.ts` decides the highlighted plan with a literal
`{ owner: "p999", broker: "p2999", builder: "p9999" }`. That is exactly the
shape CLAUDE.md §7 asks to live in a config table — `plan_catalog` already
carries `roles`, `sort_order` and the quotas, so a `recommended_for` column
would let an admin move the highlight without a deploy. Low risk, not urgent,
but it is business logic sitting in a route handler.

(It also explains a diff that looked like a bug: the design's plan wall
highlights ₹999 because the design's actor is an OWNER; a broker correctly sees
₹2,999 highlighted.)

### 5. The photo-guide sample shots are placeholders

The design's first-run dialog shows four example photos (Exterior / Living room
/ Kitchen / Bedroom); the prototype hotlinks Unsplash. The dialog is now
pixel-correct but the four tiles render as empty surface-2 blocks — no invented
imagery, no hotlinked CDN. Drop four licensed sample images into `public/` and
wire them up; that closes most of screen 5's remaining diff.

### Dev-environment traps hit while doing this

- `KV_DRIVER=memory` with no local Redis means **every refresh session dies when
  the dev server restarts**, and OTP is capped at 10 sends/day/IP — two QA runs
  exhaust it for the day. The harness now caches cookies in `.qa-sessions.json`,
  refreshes rather than re-sending OTP, and gives each seeded actor its own
  forwarded client IP (the per-NUMBER cap stays fully in force).
- The dev server wedges into an endless `ECONNREFUSED 127.0.0.1:6379` retry loop
  and stops serving. Worth a look on its own — it is a real availability
  behaviour when Redis is unreachable.

## D2. P4 detail screens — what the design has and the app doesn't

Property detail renders price, attributes, description, amenities and a
contact bar. Still missing against designs/P4:

- **Save / heart** and **Share** actions (need P10's saved module)
- **Report listing** + its reason sheet (Fake listing, Wrong price, Wrong
  photos, Already sold, Abusive content)
- **Similar properties / Similar projects** rails
- **Area block** ("About Mavdi", "Nearby: Raiya Road", "Explore Mavdi")
- **Breadcrumb** (`Home › Rajkot › Mavdi › 3 BHK Flat`) — this one is SEO, and
  the public property page is the SEO surface
- **Price-drop history** ("Price dropped ₹5 Lakh on 12 Jan")
- **Guest gate sheet** ("Sign in to continue · Save properties, send inquiries
  and chat securely") — a signed-out visitor currently gets the full contact bar
- **Quick questions** presets (Site visit? Loan available? Documents ready?) —
  P7
- Photo **viewer** is a single-image lightbox: no swipe/next inside it, and the
  per-photo alt labels the design shows aren't surfaced

Dead-ends that will resolve with later modules but are live buttons **today**:
"Request phone number", "Send inquiry" (both toast), and "Update Units" on a
project.

## D3. Leads stat has no source — ✅ CLOSED 23 Jul 2026

Was: `/profile/me` returned a literal `leads: 0`, and `ownerListingStats`
returned `saves: null` / `leads: null` (the P4 strip rendered `—`), because no
`leads`/`saves` table existed yet.

Both tables now exist — `leads` (Module 5, migration 0025) and `saves`
(Module 6, migration 0026) — so the hardcoded zero was a live DB-lock violation
(rule 12) and is gone:
- `/api/v1/profile/me` → `countProfileLeads()` (`lib/listings/leads.ts`), same
  `is_relevant` filter the Leads pipeline uses, so tile and screen can't disagree.
- `ownerListingStats()` → real `views` + `saves` + `leads` counts per listing.

**DB-verified.** `leads` per owner: RK Properties 6, Suresh Reddy 3, Rahul Mehta
2. Rahul's profile now renders **Leads 2** (was 0), and listing
`5ac29249-…` returns `{"views":1,"saves":0,"leads":2}` to its owner — matching a
direct SQL count of the same three tables.

Still deliberately zero-ish elsewhere: nothing AUTO-creates a lead yet (chat is
Module 7) — see A0.2. Seeded + manually staged leads are real rows and now count.

## D4. Listing and requirement badges use two different vocabularies

`STATUS_BADGE` (listings) maps `pending_review → "pending"` and
`changes_requested → "grace"`; `REQ_STATUS_BADGE` now maps the same states to
`"under-review"` / `"changes-requested"`, which are the names `StatusBadge`
actually defines.

Both render, but they are different colours for the same meaning, and
CLAUDE.md asks for one badge language. Aligning listings would change existing
badge colours — **design-locked, so needs Rajan's call.**

## D5. Two non-overlapping "draft" systems, found during the 26 Jul QA pass

There are two entirely separate things both called a "draft", and neither
screen shows the other's items:

1. **Listing drafts** — real rows in `listings` with `status='draft'` (a
   listing that reached the DB). Shown as `DRAFT`-badged tiles in the seller's
   own-profile grid. Amit Shah (broker, `+919999000007`) has 2.
2. **Form auto-save drafts** — `GET /api/v1/listings/drafts`, a separate
   payload-blob table keyed by an in-progress CREATE FORM session, never
   promoted to a real listing. Shown on the "Drafts" screen reached via
   Create → "Continue from drafts". Amit Shah has 3 here (capped at 3,
   independently of the 2 above) — one is even a `godown` type that has no
   corresponding row in `listings` at all.

Both caps enforce "3" independently, so a seller could plausibly hit "Drafts
full" on the auto-save screen while their own-profile grid shows only 2 (or
0) draft tiles, with no visible link between the two counters. Whether this is
intended (form-recovery vs a real draft listing are legitimately different
concepts) or should be unified is a product call, not something to guess at —
**needs Rajan's decision**, not a blind merge.

---

# Regression suites (run these after any billing change)

```bash
npm run db:proof            # row counts + RLS + per-user state
npm run test:coupon-race    # coupon per-user/usage-cap under 12 parallel claims
npm run test:refund-race    # boost refund single-flight (10 parallel claims)
npm run test:billing-live   # real OTP → checkout → coupon gate → IDOR, all 3 roles
npm run webhook:test        # signed webhook, --bad-signature, --replay
node scripts/seed-staff.mjs --list   # who can moderate (dev)
npm run check:fields        # every property type's field list resolves, has
                            # options, and its show_if points at a field the
                            # type actually renders (all 13 types × 3 roles)
```

---

# M8. Module 8 — Search & SEO (P3), 26 Jul 2026

Built: search home + autocomplete + peek, results (5 tabs, cascade, zero-state),
filter sheet (dynamic per-type, nested location sheet, live count), area page /
programmatic landing matrix, city coming-soon, sitemaps, robots, OG images,
saved-search alerts. Migrations 0030-0036, all applied to dev.

## M8.0 — What the hunt FOUND (fixed inside this module)

These were pre-existing defects the module surfaced, not new work it created.

| # | Found | Impact before the fix | Fix |
|---|---|---|---|
| **F1** | `location_adjacency` had **0 rows** since migration 0005 | The "NEARBY:" location cascade in **search, the feed AND requirement matching** queried the table, got nothing, and silently degraded to "no nearby areas". No cascade section had ever rendered in this app. | 0030 seeds 42 symmetric adjacency pairs across all 4 cities. Cascade now fires — verified live. |
| **F2** | `field_definitions.furnishing` offers `full`, but Module 4 wrote `furnished` on 4 live listings | The "Fully furnished" filter chip could **never match anything**, forever. | 0032 normalises the drifted value. |
| **F3** | `locations.name_gu` was **NULL on all 35 rows** | "All-Indian-script Unicode search input" (Doc7 §108) was wired — trigram index on `name_gu`, no transliteration — but fed nothing, so a Gujarati query ran cleanly and matched zero. | 0035 populates real Gujarati names for all 31 Gujarat locations. `માવડી` now returns the same 15 results as `Mavdi`. |
| **F4** | Gujarati query resolved the area but still returned 0 | `parseQuery` stripped only the **English** name from the residue, so the Gujarati text fell through to a free-text ILIKE against English titles. | `stripName` now strips whichever language matched. |
| **F5** | Per-sqft was computed on **rent** listings | Cards showed "₹19/sqft" beside a ₹28,000 monthly rent — a number that looks like a price comparison but is rent-per-sqft-per-month. | Search hydrator omits per-sqft for rent. **See M8.1 — the feed has the same bug.** |
| **F6** | `hz_area_stats` averaged per-sqft across sale AND rent | One rented flat dragged an area's "Avg ₹5,600/sqft" down by hundreds, in the Areas tab, the autocomplete meta line and the area page stats strip. | 0033 makes per-sqft sale-only unless an intent is named. |
| **F7** | Mixed-intent pages quoted a monthly rent as the headline price | `/area/mavdi-rajkot` read "Prices from ₹14,471" next to ₹1.1 Cr sale inventory. | Price envelope is always single-intent; the strip labels it ("Sale range"), and the meta description drops the clause on mixed pages. |
| **F8** | `New construction` rendered **twice** in the filter sheet | Once as a per-type facet, once as a "More" toggle row. | 0034 drops the duplicate facet; the design's "More" row wins. |
| **F9** | `saved_searches.alerts_enabled` was a toggle with **no job behind it** | The classic "promise with nothing doing it" — and `notification_type` had no enum value for it, so an insert would have *raised* if anything had tried. | 0036 adds the enum value; `lib/search/alerts.ts` + `app/api/v1/cron/search` implement and trigger it. Verified: real notification row, watermark advances, re-run is idempotent. |
| **F10** | `city_interest_requests.notified_at` had nothing that would ever set it | "We'll notify you when we launch" would never have been kept. | `notifyLaunchedCities()` in the same cron marks and notifies on launch. |
| **F11** | `@vercel/og` crashed the response mid-pipe on Windows/Node runtime | OG image endpoint killed the socket (`.\file:\C:\…` invalid font path). | Route moved to the `edge` runtime it targets; data read over PostgREST. |
| **F12** | Partial dynamic segment `sitemap-[type].xml` | Not supported by the App Router — **all five sitemaps 404'd**. | Five explicit routes over one shared factory. |

## M8.1 — ✅ CLOSED 26 Jul 2026 — the FEED had bug F5 too

`lib/feed/service.ts · toCard()` computed `perSqft` for every card regardless of
`kind`, so the **home feed and stories** printed "₹19/sqft" on rent listings too.
Originally left out of scope, since the feed belongs to Module 6.

**Rajan, 26 Jul 2026 ("baki ke sab pending fix") → FIXED.** `lib/feed/service.ts`
now guards the `perSqft` calculation with `l.kind !== "rent"`, identical to
`lib/search/service.ts · hydrate()`. One line, no design change — a rent card
simply drops the meaningless third meta segment.

## M8.2 — ✅ CLOSED 26 Jul 2026 — `profiles.response_label` now computed

Doc2 §11 specifies an automatic response-time chip, and the P3 Brokers & Builders
row reads "24 listings · Usually responds in 2 hours". The column had existed
since Module 2 and was NULL on all 35 profiles, because nothing measured reply
latency — so search rendered only the honest half, "24 listings".

**Rajan, 26 Jul 2026 → FIXED.** Migration `0037_response_time.sql` adds
`hz_recompute_response_labels()`, run daily by `/api/v1/cron/search`:

- **Median**, not mean, first-reply latency per seller — one all-night reply must
  not brand somebody a slow responder, and "usually" means the median.
- A "first reply" is the seller's earliest message in a thread AFTER the other
  party's first one. Threads they never answered are excluded from the median
  rather than counted as infinite.
- **Below 3 answered threads → NULL**, no chip at all. Two data points is not
  "usually".
- Only the last **90 days** counts, and the function CLEARS the label on anyone
  who has gone quiet — a stale "responds in 2 hours" is worse than no chip.

Verified live: 7 sellers now carry a computed label, and the search row reads
"12 listings · Usually responds in 1 hour" while sellers without enough history
still show just the count.

## M8.3 — 🟡 Boost placement in search: done here, admin panel DEFERRED by Rajan

Search ranks active boosts first (`hz_search_listings` orders on the boost join)
and the Explore grid hoists a boosted listing into the 2×2 hero cell. This closes
the *search half* of **A3**. It remains unobservable in production for the same
reason as **A1**: no admin panel exists to approve a paid boost, so nothing can
reach `status='active'` except by seed.

**Rajan, 26 Jul 2026: "admin panel abhi banana nahi hai"** — Module 11 stays
deferred by decision, not by blocker. The search side needs no further work; the
moment a boost can reach `status='active'`, it ranks first and takes the 2×2
Explore hero with no code change.

## M8.4 — Meilisearch seam

Doc3 §5 says Postgres-indexed at launch, Meilisearch in Phase 2. The swap point
is deliberately one function: `lib/search/service.ts · runRpc()`. Everything else
(filter parsing, cascade, hydration, counts) is transport-agnostic. Trigram
indexes on title/area_label/name/name_gu are in 0030.

## M8.5 — Cron dependency

`/api/v1/cron/search` (daily 04:00) is registered in `vercel.json` and inherits
**B2**: like every other cron it does nothing until `CRON_SECRET` is set on the
host. Without it the route refuses (401) rather than running open.

# M9. Module 9 — Boost placement (P11 boost), 26 Jul 2026

Boost PURCHASE shipped in Module 3. Module 9 is everything that had to happen for
the thing being purchased to actually exist. It closes **A1** (the approval
transition) and **A3** (placement), and fixes eight defects found while walking
the prompt line by line.

## M9.1 — What was actually broken (found, not listed in the prompt)

1. **Nothing could approve a boost.** `pending_approval` → `active` had no code
   path anywhere, so every paid boost eventually hit the 48h timeout from
   migration 0012 and was refunded. This was A1; it is now `approveBoost()` in
   `lib/billing/boost.ts` behind `POST /api/v1/admin/moderate/boost/:id`.
2. **Targeting was decorative.** `boosts.targeting`/`target_label` were free text
   with no location ids behind them, and every placement query was a bare
   `status = 'active'`. It was wrong in both directions: a "this area only" boost
   (₹499, the cheapest reach) topped the entire city feed and every other city's
   search results, while "All India" (₹1,499, the same price as a city boost) did
   **literally nothing** — feed and search are city-scoped, so an out-of-city
   listing was never even a candidate row. Migration 0038 adds
   `target_area_id`/`target_city_id`/`target_state_id`, resolved server-side at
   purchase from the SUBJECT's own location; migration 0039 moves the match into
   the search RPC's boost join (that function also paginates, so a service-layer
   re-sort could not have fixed it).
3. **The client chose its own target label.** Checkout stored `body.targetLabel`
   verbatim, so a crafted request could make the boost status screen claim any
   reach it liked. The label is now composed from the `locations` table and the
   posted value is ignored entirely.
4. **Only listings could be boosted.** Doc2 §13 makes projects and requirements
   boostable too — the requirement case is §9.2's "locked-but-top", which was in
   this module's own prompt. `boosts.listing_id` is now a subject id qualified by
   `subject_kind`, and the picker, status screen, admin queue, eligibility check
   and "View listing" link are all subject-aware. `lib/listings/matching.ts` had
   `isBoosted: false, // boost placement is Module 9` hard-coded.
5. **Selling a listing before its boost was approved kept the money.** All three
   auto-stop call sites marked `pending_approval` boosts `stopped` alongside the
   running ones. `stopped` means "ran, no refund for unused days" — but this boost
   had never been placed for a single minute, AND `stopped` is a state the refund
   sweep does not look at, so nothing downstream would ever have caught it. One
   shared `stopBoostsForSubject()` now sends never-live boosts to `cancelled` —
   the same refundable state the user's own Cancel button produces.
6. **Hiding a listing burned boost days silently.** A hidden listing is placed
   nowhere, so the window ran down against something invisible. Hide now pauses
   (`paused`, new in migration 0038 — also Doc2 §13's "admin-hide → pause/resume",
   which previously had no state to sit in), and resume adds the paused duration
   back to `ends_at`.
7. **"Renew in 1 tap" had no producer.** The P11 banner was computed on read from
   `daysLeft <= 1`, so it existed only while the user was already looking at the
   boost screen, and the notification version of it in the P11 notifications
   design had no code at all. Doc2 §13 makes renewal a *notification* precisely
   because nothing auto-charges. `sendBoostExpiryReminders()` (migration 0040's
   `boost_reminders`, once-only per boost+milestone) runs on the hourly cron, and
   `expireBoostsAndNotify()` tells the seller when a boost actually ends.
8. **Boosted-but-seen story circles never stopped jumping the queue.** Doc2 §9.3
   says "boosted-seen → normal position (no re-first)"; the sort was
   `boosted ? -1 : 1` with no seen check, so the same gold ring held slot 0 all
   day. Separately, `target_label` on pre-Module-9 rows was placeholder or flatly
   wrong text ("City", or "Rajkot" on a Vadodara listing) — repaired by
   migration 0041.

Two smaller ones. `requirements.city_id` is nullable and some live rows have it
empty, which made an area- or city-targeted requirement boost resolve to
all-nulls and place nowhere; the city is now walked up from the first area, and a
scope that still cannot be resolved falls back to the widest one that can rather
than being sold as dead placement. And the Promoted BADGE was read from a
non-targeted query while the ORDER came from a targeted one, so a card could be
tagged "Promoted" for a viewer it was never placed for — both now come from the
same call.

## M9.2 — 🟡 "Story first" for a requirement boost is ambiguous — needs Rajan

Doc2 §13 says a requirement boost gets *"requirement-mode feed top + story first
+ locked-but-top for unpaid"*. The feed-top and locked-but-top halves are built
and verified live. **Story first is not**, because a requirement has no story:
stories are auto-generated from listing/project PHOTOS (Doc2 §9.3) and a
requirement has none. Rather than invent a requirement-story format, this is
flagged instead of guessed.

**Decide one:** (a) "story first" means only the boosted poster's existing listing
stories, in which case nothing further is needed; or (b) requirement boosts should
generate a story card of some kind, which needs a design.

## M9.3 — ✅ CLOSED by Module 10

`boost_approved`, `boost_rejected`, `boost_expiring`, `boost_expired` and
`boost_stopped` now render on the real P11 S7 screen, including the design's
inline "Renew — ₹1,499" button (the price is server-computed and written into
the row's `actions`, verified on screen). Nothing outstanding.

## M9.4 — Cron dependency

The boost expiry notice, the auto-expire sweep and the pending-approval timeout
all ride `/api/v1/cron/billing` (hourly). Inherits **B2**: nothing runs until
`CRON_SECRET` is set on the host. The route refuses (401) rather than running open.

## M9.5 — City boost cap is enforced but not editable in-app

`billing_settings.boost_city_cap` (default 10) is checked at approval, and the
queue row reports "City boost cap: N of M used" exactly as the P13-15 panel
designs it. Editing it is an admin-settings screen (Module 11); until then it is a
one-line SQL update, no deploy.

## M9.6 — Admin boost SCREEN is still Module 11

The API and the payload it needs are built and tested — `GET
/api/v1/admin/queue/boost` returns each pending boost with the amount paid, the
window being bought and the three eligibility checks the P13-15 right-sheet lists.
Rendering it is a UI job in Module 11, not a rewrite. Rajan deferred the admin
panel by decision (26 Jul 2026, "admin panel abhi banana nahi hai"), and unlike
before, a boost can now be approved without it via the staff-gated endpoint.

## Regression suite

```bash
node scripts/seed-module9.mjs
```

```bash
BOOST_BASE=http://localhost:3000 node scripts/check-boost-live.mjs
```

The sweep reseeds itself first, because it CONSUMES states (it approves, rejects,
pauses and sells). It needs a freshly started dev server: the OTP limiter is
5/hour per number and dev uses an in-memory KV, so a second run against the same
process is throttled and reports `[SKIP]` on the blocks that need a login.

---

# MODULE 10 — NOTIFICATIONS (P11 S7 + system-wide)

## M10.1 — 🔴 FCM credentials are the only thing between us and real push

The whole push path is built and wired: `public/sw.js` handles `push` +
`notificationclick` (tag-based replace = the shade-level half of the grouping
rule), `lib/notifications/push-client.ts` requests permission and mints a token
through the Firebase messaging SDK against OUR service-worker registration,
`/api/v1/push/register` stores it device-aware (browser / OS / standalone), and
`lib/notifications/push.ts` fans out with firebase-admin and prunes dead tokens.

What is missing is **only credentials**:

| env | half | used by |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | public | client SDK |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | public | client SDK |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | public | client SDK |
| `NEXT_PUBLIC_FCM_SENDER_ID` | public | client SDK |
| `NEXT_PUBLIC_FCM_VAPID_KEY` | public | client SDK |
| `FCM_SERVICE_ACCOUNT_JSON` | **server-only** | firebase-admin sender |

Until they exist `pushState().configured` is false, the UI says "Push isn't
configured on this environment yet" instead of pretending, and the delivery
ledger records `skipped / no_credentials` rather than a fake success. **The
in-app screen and email are unaffected** — this only gates the phone buzz.

## M10.2 — 🔴 Resend key not set → transactional email is skipped, not sent

`lib/notifications/email.ts` is a complete Resend sender with the DPDP-required
"Manage notification preferences" footer, and the engine's channel-dedup logic
around it is live and proven (see the `held → sent/skipped` ledger). It needs
`RESEND_API_KEY` + `EMAIL_FROM`, plus SPF/DKIM/DMARC on the sending domain
(Doc2 §14). Today every email delivery lands as `skipped / no_credentials`.

Second gap: **most profiles have no `email` column value** (phone-first signup).
Even with a key, `emailNotification` records `skipped / no_address` for those
users. Collecting the address is the Settings > Account screen (P10, Module 11).

## M10.3 — 🟡 WhatsApp Business is designed-for but not built

Doc2 §14 lists WhatsApp for critical events only (approval, payment,
number-allow) via pre-approved templates. The schema carries it —
`notification_deliveries.channel` accepts `'whatsapp'` and
`notification_prefs.whatsapp_enabled` exists, default **false** — but there is
no provider integration and no template registration. Needs a WhatsApp Business
API account + template approval before any code is worth writing.

## M10.4 — 🟡 Three admin-triggered events have an API but no SCREEN

`report_outcome`, `suspension_lifted` and `area_added` had no trigger anywhere:
the transitions themselves did not exist. Module 10 built them —
`lib/notifications/admin-events.ts` + the staff-gated
`POST /api/v1/admin/account-action` (`resolve_report` / `lift_suspension` /
`approve_area`) — so each state can now be entered and each notification really
fires. What is still missing is the P13-15 dashboard UI that calls them. Same
shape as M9.6: an API + payload that works, waiting on a rendering job.

## M10.5 — ✅ RESOLVED (Module 11) — appeals can be resolved

The design's rejected-listing row carries an "Appeal" button that, in the
prototype, only toasted. It writes a real `moderation_appeals` row (0044, one
open appeal per item per user). It was flagged here because nothing could ever
resolve one, so `status` stayed `'open'` forever.

Module 11 built the missing half: `components/admin/queues/AppealsQueue.tsx`
against `app/api/v1/admin/queues/[queue]/[id]/route.ts` (the `appeals` branch,
audited as `appeal_upheld` / `appeal_rejected`). Verified from the DB during the
Module 13 sweep — the state machine is genuinely exercised, not just wired:

    status     count
    upheld       59
    open          2
    rejected      3

Closing the entry: the dead-end this recorded no longer exists.

## M10.6 — 🟡 Cron dependency (inherits B2)

`/api/v1/cron/notifications` is scheduled hourly at `:15` in `vercel.json` and
runs: quiet-hours release · the "push seen → skip email" resolution · the 90-day
purge · requirement expiry 5d/1d **and the actual expiry** · plan grace notices ·
performance nudges · weekly digests. It fails **closed** without `CRON_SECRET`
(401), so on a host without it none of the above ever runs. Verified working
locally — one run released 6 held notifications and produced 8 digests.

## M10.7 — ⚪ Found while wiring: requirements never expired at all

Not a notification bug. `requirements.expires_at` was written at creation and
**no code ever acted on it** — a "live" requirement stayed live and kept
collecting proposals past its window forever. `expireRequirements()` in
`lib/notifications/jobs.ts` now flips them and tells the owner. Recording it
here because it belonged to Module 7, not Module 10.

## M10.8 — ⚪ Found while wiring: moderation decisions told nobody

Doc2 §5.4 says "Approve: live + story generated + **notification** + SEO ping".
`lib/listings/moderation.ts` changed the row and notified no one — a seller's
listing went live, or was rejected, and the only way to find out was to go and
look. Now wired (approve / request_changes / reject), with approvals batching
into "N listings approved — tap to review".

## M10.9 — ⚪ Found while wiring: the plan-expiry promise wrote to `webhook_events`

`deliverExpiryReminder` inserted an audit row into `webhook_events` and stopped.
The My Plan screen's "we'll notify you 7 days and 1 day before expiry" reached
nobody. It now goes through `notify()` like everything else, with trial copy for
`is_trial` plans.

## M10.10 — ⚪ Note: `city_launched` was firing as `saved_search_match`

`lib/search/alerts.ts` sent the city-launch notice with
`type: "saved_search_match" as never`. It rendered with the wrong icon and was
governed by the wrong preference toggle. It has its own type now.

## Regression suite — Module 10

```bash
node scripts/seed-module10.mjs
```

```bash
node scripts/check-notifications-live.mjs http://seller.localhost:3000
```

39 assertions: unauthenticated sweep, IDOR probes on notification ids, the real
number-request → notification → inline Allow → `number_requests.allowed` chain,
action idempotency, chip counts vs the DB, every filter, the locked preference
group, DPDP consent timestamping, mark-read / dismiss / mark-all, and the cron.
`--reset` on the seeder wipes only its own rows (`data ? 'seed'`).

## M10.11 — QA pass outcome (Doc6 §8)

Four findings came back; two were real and are fixed, two were not defects.

**Fixed**
- **Dead "How to enable" on P10 S7.** The inbox banner opened a real
  instructions sheet; the identical link on the preferences card only fired a
  toast, so it read as a dead control. Both now open the SAME
  `components/notifications/EnableSheet.tsx`. A denied permission cannot be
  re-prompted by script, so the sheet — not a silent retry — is the honest
  answer; "Try again" still covers the recoverable cases.
- **Duplicate rows in the inbox.** Not a producer bug: `seed-module10.mjs` was
  additive, and running it twice put a second copy of every row in the list,
  which reads exactly like a double-firing job. The seeder now **clears its own
  rows first by default** (`--keep` opts out); only rows tagged `data ? 'seed'`
  are touched. Verified: 0 duplicate (profile, title) groups remain.

**Not defects**
- *"MARKETING and WEEKLY DIGEST are sections beyond the locked P10 §7 design."*
  They are in the prototype. The reviewer read only the `NOTIF_GROUPS` array
  and missed the sections hardcoded in the render body after it —
  `<div class="section-hd">Marketing</div>` and
  `<div class="section-hd">Weekly digest</div>` are both there, with the exact
  labels and default states shipped. No design change was made or is needed.
- *"A 'purge probe' notification appeared."* That was the throwaway row used to
  prove `purge_old_notifications()` deletes past retention; it was consumed by
  the purge it was testing. Nothing produces it. 0 rows remain.

**Still unproven by QA tooling** (browser pane stopped compositing frames
mid-session — environment, not app): the touch-only swipe-to-dismiss gesture and
a live network-drop offline test. Both were exercised structurally, and the
dismiss API path is covered by the regression suite; a visual pass is worth
redoing when the pane is healthy.

## S7 profile photo + email (2026-07-27)

**Fixed here, not deferred**
- P1 S7 "Take photo" / "Choose from gallery" were toast stubs — no upload, no
  row. Both now run the real presign → PUT → commit pipeline. Because the S7
  window has no access token yet (only the OTP-verified register cookie),
  `lib/auth/uploader.ts` resolves either identity and gives the register cookie a
  narrower scope: `avatar` only, own `avatars/<id>/` prefix only.
- `completeRegistration` no longer writes `photo_url` from the request body. The
  photo is server-owned via commit, so the client can't hand us an arbitrary URL
  and a photo uploaded during S7 survives the registration update.
- **Edit profile → "Remove photo" never worked.** `PATCH /profile/me` does not
  whitelist `photoUrl`, so the call 200'd, the toast said "Photo removed", and
  `profiles.photo_url` kept its value. Both screens now use
  `DELETE /api/v1/uploads/avatar`, which clears the column *and* deletes the
  object. Replacing a photo also deletes the object it replaces (no orphans).

**Known remaining gap**
- Verification documents (`kind: "doc"`) are still committed with no
  object-lifecycle cleanup — re-submitting leaves the previous object in the
  private bucket. Avatars and logos are cleaned up in `uploads/commit` now; docs
  deliberately are not, because a replaced doc may still be under admin review
  and deleting it would break the reviewer's view. Needs a decision on doc
  retention before it can be cleaned up.
- `chat` uploads are one-shot (they attach to no column), so an abandoned
  composer leaves an orphan object. Unchanged by this work.

---

## Multi-account switching (P9 S1) — built 2026-07-27

**What was actually there before this work.** The switch sheet showed *only* the
current account. There was no second row, ever — multi-account (Doc2 §3.1
"Account switch — multi-account dropdown") had never been built, even though the
P9 design draws a second account row that switches on tap. "Add account" was a
`show("Add account — sign in with another number")` toast: a dead button.
"Log out" was real. `forgetAccount()` existed in `lib/auth/saved-accounts.ts`
and was called from nowhere.

**How it works now.** The active account still lives in `hz_at`/`hz_rt`
unchanged. Every *other* account signed in on the device keeps its real,
server-tracked refresh token in a second httpOnly cookie, `hz_accts`
(`lib/auth/account-pool.ts`). Switching is `POST /auth/switch`, which rotates
that account's genuine refresh session and swaps the active cookies. The client
never holds a token, a role, or an account list — the sheet's rows come from
`GET /auth/accounts`, a live Supabase read.

Authorization is the pool cookie, never the request body: a `profileId` that is
not already signed into this device is a 404, so the field cannot be used to
reach anyone else's account.

**Decisions Rajan made (2026-07-27), so they don't get re-litigated:**
- Instant server-side switch, not re-OTP per switch.
- Remove-from-switcher = **long-press a non-active row → confirm dialog**. The
  design has no visible remove control and none was added; the sheet is
  pixel-identical to P9.
- Log out with 2 accounts = land on the remaining account, not /login. Only the
  last account logging out clears the device.

**Known remaining edge (not fixable without weakening the session model)**
- `POST /auth/switch` rotates the target's refresh secret *before* the response
  reaches the browser. If that response is lost in flight (connection dropped
  mid-request), the server has rotated but the browser still holds the old pool
  cookie, so that one account falls out of the switcher and needs a fresh OTP to
  come back. It fails closed — no session leaks, no wrong account is entered,
  nothing is charged — and removing the rotation to avoid it would make a
  replayed pool cookie reusable. Left as-is deliberately.

**Fixed while building, would have shipped broken**
- Middleware bounced *every* authenticated hit on `/login` home, so "Add
  account" could never have worked at all. `/login?add=1` is now the one
  allowed case.
- `POST /auth/switch` and `/auth/accounts/remove` returned a **500 with an empty
  body** for a non-string `profileId` (`.trim()` on an object). Now a 422.
- The public host stripped `hz_at`/`hz_rt` from forwarded requests but not the
  new pool cookie; it now strips `hz_accts` too.
- `POST /auth/refresh` failing now revokes the background accounts as well,
  rather than leaving live sessions stranded behind a cleared cookie.

---

## Profile stat row + pinned listings (P9 S1) — 2026-07-27

**Stat row changed on Rajan's instruction.** Views left the profile tiles:
- Owner + Broker: **Listings · Requirements · Leads**
- Builder: **Listings · Projects · Messages · Leads**

`views` is still computed and still shown per listing in the manager — it just
isn't one of the profile tiles. Every tile is a real count against the same rows
the screen it opens reads (`countProfileRequirements`, `countThreads`,
`countProfileLeads`, `getProfileCounts`), so a tile can never disagree with its
destination. Verified live: broker 25/1/6 and builder 0/1/6/0 both matched a
direct SQL count exactly.

**Pinned listings: built, was never implemented.** The P9 design has drawn the
strip since day one, but nothing stored a pin — the profile only ever rendered
the helper line "Pin up to 3 listings…". Now:
- migration `0047_listing_pinned.sql` (applied to dev): `listings.pinned_at` +
  a partial index;
- `POST /listings/:id/pin`, `GET /listings/pinned`;
- Pin/Unpin in the My Listings options sheet, the strip on the profile, and the
  **pin badge the design already draws is the remove control** — tapping it asks
  to confirm, so no chrome was added to the tile.
- Cap of 3 is server-side, with a post-write re-check that gives the pin back if
  two requests raced. Live-and-available only, enforced in the API too
  (`pin` on an under-review / hidden / archived listing → `LISTING_STATE_LOCKED`).

**Found while building — a builder's project was invisible in the entire app.**
A project sits in `pending_review` after posting. The profile tile counted it,
but the builder dashboard queried `status = 'live'` only and My Listings holds
listings, not projects — so the one screen that lists projects said "No projects
yet" while the tile above said "1". A builder who had paid ₹9,999 could not see
their own project anywhere until an admin approved it. `builderDashboard` now
returns every non-draft, non-deleted project and the state leads the existing
stat line ("Under review · 0 leads") — no new element on the card. Requirement
matching still only runs off LIVE projects, so an unapproved project cannot
start pulling leads.

**Also fixed here**
- A pin is released whenever the listing leaves live (sold/rented/hidden/
  archived/restored). Without this, re-activating an old sold listing could push
  a profile past its 3 pins, and the strip would silently hide the overflow.
- The "What counts as a view?" dialog was left unreachable by the tile change —
  removed rather than kept as dead code.
- The Projects tile pushed to `/listings`, which shows listings and never a
  single project. It now opens the builder dashboard, where projects actually
  live.

**Superseded** — pinning was removed entirely on 27 Jul 2026; see the featured
collections section below.

---

## Pinned removed, featured collections built (P9 S1) — 2026-07-27

**Pinning is gone from the product**, on Rajan's instruction — the profile keeps
one curation surface. Migration `0048` drops `listings.pinned_at` (taking its
index), and the endpoints (`/listings/pinned`, `/listings/:id/pin`), the service
functions, the DTO fields, the My Listings sheet row and the profile strip are
all removed. Confirmed: 0 columns named `pinned_at`, and neither route exists in
the production build. (Chat thread pinning is a different feature and untouched.)

**Featured collections are now real.** They were the last placeholder on the
profile: the circle row rendered a single "+ New" whose only behaviour was
`show("Featured collections need listings — coming in the listings module")`.

- `featured_collections` + `featured_collection_items` (migration 0048, applied),
  RLS on both, deny-all for clients like the rest of the schema.
- `GET/POST /profile/featured`, `GET/DELETE /profile/featured/:id`.
- The **Create featured** sheet is the design's `Sheets.featured` exactly: Name
  field with the "e.g. Ready to move" placeholder, "Choose listings" 3-column
  grid where a picked tile takes a 2px accent outline, Create button.
- Tapping a circle opens what's inside; each tile opens its listing; **Remove
  collection** with a confirm. The design stops at creating one, so opening and
  removing reuse the existing BottomSheet/ConfirmDialog rather than new chrome.

**Rules the server owns** (none of them are client guesses): 10 collections per
profile, 20 listings per collection, 1–30 char name, and members must be the
caller's OWN listings — a payload of foreign ids creates nothing at all (verified:
422, and zero rows written, not even an empty shell).

**Visible ≠ member, deliberately.** A collection SHOWS only live+available
members but KEEPS membership. So hiding the only listing in a collection drops
its count to 0 and the sheet says "Nothing in this collection is live right now"
(verified live) — and the listing returns to its collection when it goes live
again, instead of silently falling out for good.

**Verified live in all three roles**: broker (create → open → tile opens the
listing → remove, items cascaded, listings untouched), owner ("Under 50 L"), and
builder ("Premium villas"), plus a builder with no live listings, who gets an
honest "You need a live listing before you can group one into a collection" and a
disabled Create rather than a dead button.

**Security**: all four endpoints 401 unauthenticated · another profile's
collection id → 404 · junk id → 404 · foreign listing ids → 422 with nothing
written · empty/31-char/non-string name and empty list → 422 · production bundle
clean.

**CORRECTION (same day).** An earlier note here claimed `OtherProfile` had no
featured row in the P9 design and that making collections public needed a
decision. That was wrong — P9 S2 draws the circle row on the visitor profile
too (`['Projects','Ready to move','Commercial']`, same `featcircle` markup,
no "+ New" because a visitor does not curate someone else's shelf). Collections
were always meant to be public, and the visitor side is now built — see below.

---

## Featured collections — visitor side + migration cleanup (2026-07-27)

**Migration history collapsed.** `0047_listing_pinned.sql` (add `pinned_at`) and
the `drop column` half of `0048` were an add-then-drop pair that no database
should ever replay. `0047` is deleted, its `_migrations` row removed from dev,
and `0048` no longer touches `listings` at all — it just creates the two
featured tables. Verified after the change: `migrate:status` shows a clean run
ending at `0048`, no `0047`, and 0 columns named `pinned_at` on `listings`.
Production, which has run neither, now never creates the column.

**Collections are public — the design always said so.** P9 S2 draws the circle
row on the VISITOR profile as well (`['Projects','Ready to move','Commercial']`),
which an earlier note in this file got wrong. Built:
- `GET /profile/:username/featured` and `GET /profile/:username/featured/:id`,
  both guest-readable;
- the circle row on `OtherProfile` — same 64px circle + name, **no "+ New"**
  (a visitor doesn't curate someone else's shelf);
- tapping a circle opens the same sheet **without the Remove row** (`onRemove` is
  optional), and a tile opens `/property/:id` — the visitor detail view with
  Request Number / Send Inquiry, not the owner's Edit/Boost view.

**Only published stock is exposed.** The public endpoints reuse the same
live+available rule as `getPublicProfileCounts`, and a collection with nothing
live in it isn't returned at all, so a visitor never sees an empty shelf or
learns about unpublished listings. Verified: every item came back
`live/available`, and the payload is the public card DTO — no phone, no private
fields.

**Verified live, all three roles, as a visitor**: broker "Ready to move" (3),
builder "Premium villas" (1), owner "Under 50 L" (1) — signed in as another user
on seller, and as a guest on the public host, light and dark.

**Security**: guest read 200 · a collection id belonging to a different profile
requested under this username → 404 · junk id → 404 · unknown username → 404 ·
`%` as a username (LIKE-wildcard probe) → 404 · DELETE against the public route →
405 · suspended profile → empty list and 404 on detail (restored after the test).
Production bundle clean.

---

## Profile tabs + Listing insights (P9 S1 / S5) — 2026-07-27

**Listing insights did not exist.** P9 S5 is a whole screen (`registerScreen
('listingStats', …)`) and nothing in the app rendered it — tapping a profile
tile opened the PUBLIC P4 detail instead, whose owner sticky bar had "Edit" and
"Mark as Sold" both pushing to `/listings/<id>`, i.e. to the page you were
already on. Two dead buttons on the seller's most-used screen.

Built at `/listings/:id/insights`, backed by `GET /listings/:id/insights`:
the 2-month availability check-in, the listing card with "Live since 12 Jun ·
Lifetime listing", four metric cards, the boost card, the advice card, the
sticky bar, and the ⋯ sheet.

**Shares had no table.** Three of the four metric cards had a real query behind
them; the fourth could only ever have been a hardcoded number. Migration `0049`
adds `listing_shares` (RLS on, deny-all for clients) with the same dedupe shape
as `listing_views`: unique on (listing, sharer, channel, IST day). `POST
/listings/:id/share` records it and the feed/detail/insights share sheets all
call it. Verified: the owner's own share returns 200 and writes **0 rows** —
which is what the screen's own footnote promises ("Your own views and shares
aren't counted") — a guest share writes 1, repeating the same channel stays at
1, a different channel adds 1, and the card then read 2.

**Nothing on the screen is a constant.** "Boost — from ₹499" is
`min(plan_catalog.price_paise) where kind='boost'`, so repricing a boost moves
the button. "Lifetime listing" is `user_plans.expires_at IS NULL` read through
the listing's slot; a listing with no slot prints nothing rather than being
told it lives forever. The advice card ("No inquiries in 30 days") only renders
when the observation is TRUE — live, 0 leads, ≥30 days — instead of the
design's always-on prototype copy.

**No dead controls, per state.** The third sticky slot and the ⋯ rows are
chosen from the listing's actual state: live → Mark as Sold/Rented, Hide;
hidden → Unhide; archived+rented → Re-activate; anything else → View. Boost
becomes "View boost status" once the listing is already promoted, rather than
selling a second boost. Verified live end-to-end with DB proof after each:
hide → `status=hidden`, unhide → `pending_review`, mark rented → `archived` +
`availability=rented` + the running boost `stopped`, re-activate →
`pending_review`, delete → `status=deleted` with a redirect to My Listings
(the screen's subject no longer exists, so it must not stay), edit → title
written and the listing correctly sent back to `pending_review`.

### Defects found and fixed

- **Stale-read after every mutation (real bug, fixed).** `lib/listings/client`
  and `lib/profile/client` issued their `fetch` with no `cache: "no-store"`.
  Every screen here re-reads the same URL right after mutating it, so the
  browser's HTTP cache answered the second GET from the first one's response:
  "Hide" wrote `status=hidden` to the database and the badge kept saying LIVE
  until a hard reload — indistinguishable from a dead button. Caught live.
- **"Mark as rented" hid a consequence.** The server stops a running boost with
  no refund for `rented` exactly as it does for `sold`, but the confirm copy
  promised only the upside ("re-activate for free"). Fixed in both the insights
  screen and My Listings.
- **Requirements tab was a dead card.** No chevron, no proposal count, no area
  chips, and nothing happened on tap. It now matches P9's `reqTabContent` and
  opens the requirement.
- **Builder's Projects tab showed listings.** `tab === "Projects"` fell through
  to "show everything they own", so a builder's projects were nowhere on their
  own profile. It now reads `GET /projects`; `projectDTO` gained a `badge` (the
  same `listing_state` vocabulary listings use — projects share the enum) and a
  `priceFrom` from the cheapest unit.
- **Grid tiles were missing everything the design draws on them**: the
  photo-count marker, the Promoted / Under Review chip and the diagonal
  SOLD / RENTED ribbon. `promoted` is a new batched `boosts` query on
  `/listings/mine`, not a client guess.
- **The grid/list toggle drew the wrong glyphs** — an image icon and a ⋯ — so
  the two view modes read as "photos" and "menu". Now P9's `gridic`/`listic`.

### Out of scope, recorded

- **`cache: "no-store"` is still missing** on `lib/billing/client`,
  `lib/chat/client`, `lib/feed/client` and `lib/search/client`. Same bug class
  as the one fixed above; those modules were not re-verified in this pass, so
  the one-line fix is deliberately not applied blind.
- **"Pin to profile" is absent from the ⋯ sheet on purpose.** P9's
  `Sheets.listingMore` lists it, but pinning was removed from the product on
  Rajan's instruction (migration `0048` — the profile keeps ONE curation
  surface, the featured circles). A row that pins nothing would be the dead
  control this whole pass is about. If it should come back as "Add to
  featured", say so and it is a small change.
- **Project detail badge row overflows** — `NEW PROJECT / READY TO MOVE /
  POSSESSION … / RERA APPROVED` clips at 375px on `/projects/:id`. Pre-existing
  (P6 S5), untouched here.
- **Seed data**: the builder `manishagarwal9b4e` has a mojibake byte in their
  bio ("Vadodara developer � RERA compliant projects").

**Verified in all three roles at 375px**: broker `rkproperties2f21` (28
listings covering draft / pending / changes-requested / rejected / live /
hidden / archived-sold / archived-rented), owner `snehapatel4da9` (14 listings,
11 requirements), builder `manishagarwal9b4e` (4 projects, 5 listings, both
tab sets). No horizontal overflow (`scrollWidth === innerWidth === 375`), no
console errors.

**Security**: insights unauthenticated → 401 · another seller's LIVE listing
(readable as a public detail page) → **404, byte-identical to a nonexistent
uuid**, so the endpoint can't be used to probe which ids are real · junk uuid →
404 · share with an invented channel → 422 · share with no body → 422 · both
new routes rate-limited per caller · production bundle contains no
`service_role`, no `SUPABASE_SERVICE_ROLE_KEY`, no `RAZORPAY_KEY_SECRET`,
no `R2_SECRET`.

---

## Boost reclaim, instant activation, save/share rules — 2026-07-27 (part 2)

### MAJOR 1 — unused boost days survive the subject (migration 0050)

**Before:** selling the flat destroyed the boost. `stopBoostsForSubject` set an
`active` boost to `stopped` and every remaining day was burned — a seller who
bought 30 days and sold on day 4 lost 26 days they had paid for. The copy even
said so ("Unused days aren't refunded").

**Now:** money still doesn't come back, but the DAYS do. `boost_credits` (RLS
on, unique on `source_boost_id` so a retried or racing stop can't mint two)
holds the whole days left over, spendable free on any other eligible listing,
project or requirement for 90 days.

**Verified live, end to end, with DB rows at each step:** a broker's boosted
₹1.75 L showroom (30-day boost, 28 days left) marked rented →
`listings.availability=rented`, `boosts.status=stopped`, and a `boost_credits`
row of **28 days**. Applying it to a different listing →  a new boost,
`status=active`, `price_paise=0`, `order_id=null`, `duration_days=28`,
`target_label='Ahmedabad'`. A second attempt → **422 `noCredit`**, so the same
days cannot be spent twice. The credit is claimed with `consumed_at is null` in
the UPDATE predicate (not a prior read), and released if the boost insert then
fails — the failure mode is "you still have your days", never "days gone, no
boost".

### MAJOR 2 — no admin approval for a boost on an approved subject

`activateBoostForOrder` used to park every paid boost in `pending_approval`.
A moderator clicking approve was never reviewing the boost: the SUBJECT had
already passed moderation, the money had cleared, and the duration, geography
and price are all the server's. `startBoostNow` opens the window as soon as
payment clears. The two gates with an actual reason are kept — the city cap
(falls back to `pending_approval` so a human can place it, rather than losing a
captured payment) and consecutive queueing.

Copy that had gone false was fixed with it: "Boosts start after admin approval"
and "Boosts need admin approval before going live" are both gone.

### MAJOR 2b — re-activating unedited content skips re-review

`listings/projects/requirements.edited_since_approval` (migration 0050) is set
by every content edit and cleared by `moderate(approve)`. Re-activate, unhide
and the requirement on/off switch now go **straight back to live** when the
subject was approved before AND has not been edited since; anything edited
still queues.

**Verified live:** unedited listing → `hide -> hidden | unhide -> live`. Then
one PATCH to its description → `hide -> hidden | unhide -> pending_review`.
That second case is the hole this closes: without the flag, "edit quietly, then
hide and unhide" would have been a way to push unreviewed content live, because
a description is not a MAJOR field and does not trigger re-review on its own.

### Save and share rules

- **Self-save was possible.** `toggleSave` selected the listing's `profile_id`
  and never compared it. An owner could save their own listing and inflate the
  Saves metric on their own insights screen with their own tap. Now refused
  server-side; verified 0 self-save rows exist. The heart is hidden on the
  detail screen, on feed cards and in search results (`isOwn`, server-set), and
  double-tap-to-save respects the same rule — otherwise it would have been the
  one remaining way to do it.
- **Share only on live.** A draft / under-review / hidden / sold subject 404s
  for everyone else, so offering Share there handed out a dead link. Gated on
  the listing detail, the listing insights ⋯ sheet and the project detail.
- **The project Save button was fake** — a `useState` toggle with a "Saved
  lists arrive with the Saved suite" toast, persisting nothing, and `saves` is
  keyed to `listings` so a project has never been savable. Removed rather than
  left pretending. **Project saves are not implemented** and are recorded here.

### Boost targeting and picker

- **"This area only" removed** — city, state, all-India are the three scopes.
  Enforced server-side, not just hidden: `TARGETINGS` no longer contains it and
  a request for `area` is **422** at the boundary (verified). Boosts SOLD with
  area targeting keep running on it — `resolveTarget` widens a legacy `area` to
  its city rather than refusing, so nobody loses placement they paid for.
- **Reach estimates removed.** "~2,400 users" came from an admin-typed settings
  blob, not a count of anything — a number the buyer could plan against that
  the product could not stand behind.
- **Picker thumbnails fixed.** The card is 120px wide *including* a 1.5px
  border, and the image was a hardcoded 120px child, so every thumbnail
  overflowed its content box by 3px and the cards came out unequal.
  `aspect-square w-full` tracks the content box.

### Project insights (migration 0051)

A project tile on the profile now opens **Project insights**, matching what a
property tile does. Projects had no analytics of any kind — every table is
foreign-keyed to `listings.id` — so `project_views` and `project_shares` were
built, mirroring `listing_views`/`listing_shares` including the per-IST-day
dedupe and the salted guest key.

**Two metric cards, not four, deliberately:** `saves` and `leads` are keyed to
listings, so a project genuinely has none and a "0 Saves" card would be a
fabricated number. Verified live: a guest view + share on a live project wrote
1 row each and the screen then read **Views 1 · Shares 1**.

### Also fixed

- `cache: "no-store"` applied to `lib/billing`, `lib/chat`, `lib/feed` and
  `lib/search` — the last four helpers with the stale-read bug.
- The builder seed bio's mojibake byte (`U+FFFD` → em dash), in 2 profiles.
- **Correction to an earlier note in this file:** the project detail's badge row
  is NOT an overflow bug. It is a deliberate horizontal scroll rail (`hz-x`,
  `overflow-x: auto`), which is what P4 S3 draws. Nothing to fix.

### Security

Project insights unauthenticated → 401 · another builder's project → **404,
identical to a nonexistent uuid** · boost credit GET/POST unauthenticated →
401 · a credit aimed at someone else's listing → 404 · `area` targeting → 422 ·
project share with an invented channel → 422 · both new routes rate-limited per
caller · production build clean of `service_role`, `SUPABASE_SERVICE_ROLE_KEY`,
`RAZORPAY_KEY_SECRET` and `R2_SECRET`. No horizontal overflow at 375px
(`scrollWidth === innerWidth === 375`), no console errors.

### Still open

- **Project saves** — no table, no endpoint. The fake control is gone; the
  feature is not built.
- **Requirement insights** — a requirement tile opens the requirement detail,
  which is the right screen for it (it already carries proposals, edit, delete).
  No insights screen was asked for and none was built.

---

## Project insights → Leads; profile chip legibility — 2026-07-27 (part 3)

**Project insights now shows ONE metric: Leads.** Views and shares are gone from
the screen — a builder's question is who wants the project, not how many people
scrolled past it.

**That meant building project leads, because they did not exist.** `leads`
carried `listing_id` and `requirement_id` only, and the chat thread a lead is
born from has the same two columns — so a builder has never had any record of
who contacted them about a project. The project detail's only contact
affordances are Call and WhatsApp, and both opened the dialler / wa.me leaving
no trace whatsoever. Migration `0051` adds `leads.project_id`, and
`POST /projects/:id/contact` (signed-in only — `lead_profile_id` is NOT NULL and
an anonymous "somebody rang" is not a lead a builder can act on) records it.

**Verified live, both directions:** the builder tapping their own project's
WhatsApp → 200 and **0 rows** (you are not your own lead). Sneha Patel tapping
Call → one row, `stage=new`, `source=inquiry`, "Tapped Call on the project".
Tapping WhatsApp again → still **1 row**, activity moved to "Tapped WhatsApp".
The builder's screen then read **Leads 1**, and their profile stat row moved
0 → 1 with it. A second person (RK Properties) → a second row, so the dedupe is
per person, not global.

**Migration 0051 was rewritten, not stacked.** It had created
`project_views`/`project_shares` earlier the same day; those tables are dropped
on dev, their `_migrations` row removed, and the file now only adds
`leads.project_id`. Production has run neither version, so it will never create
the two dead tables — same approach the 0047/0048 pair took.

**A real bug caught while verifying it:** the first version of the unique index
was PARTIAL (`where project_id is not null`). Postgres can only infer a partial
index for `ON CONFLICT` when the statement repeats the predicate, which
PostgREST does not emit — so the upsert failed silently and no lead was written,
while the endpoint still answered 200. Caught because the row count was checked
rather than the status code. The index is now plain; existing listing/requirement
leads are unaffected because their `project_id` is NULL and NULLs do not collide.

**Profile tile chips were illegible.** "Under review" was `bg-info-soft
text-info` — pale blue on pale blue — sitting on top of a photo, where it washed
out completely; "Changes requested" on a green cover was effectively invisible.
All tile chips now use Doc1 §7's on-photo treatment (60% black, white text), the
same one the Promoted chip already used. Same size, same position, same radius —
only readable now, on light covers, dark covers and the no-photo placeholder.

**Also:** the project detail's Share-only-when-live gating and the removed fake
Save button are unchanged from part 2; project shares have no table and the
screen no longer claims a number for them.

### Full re-check before shipping

`tsc --noEmit` clean · `next lint` 0 errors · `next build` succeeds · every
migration applied through `0051` · production bundle free of `service_role`,
`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `R2_SECRET`.

Unauthenticated: listing insights 401 · project insights 401 · boost credit
GET/POST 401 · project contact 401 · listing share 200 (guest shares are
counted by design). Signed in as a broker: own listing insights 200 · another
seller's project insights **404, identical to a nonexistent uuid** · contact
with an invented channel 422 · boost credit with no credit held 422 · boost
`targeting=area` **422** (the removed scope is refused at the boundary, not just
hidden) · self-save 200 with **0 rows written**.

DB state after the sweep: 0 self-save rows · 2 project leads · 1 spent boost
credit · 2 listing shares. No horizontal overflow at 375px on any screen
touched (`scrollWidth === innerWidth === 375`).

---

## Module 11 — Settings suite (P10 S6/S6b/S8/S9), part 1

Built and DB-verified: the ⋯ menu icon is now the hamburger `menu`; "Settings"
opens a real, server-driven Settings home (`GET /settings/overview` — every
count is a live query: Saved from `saves`, Blocked from `chat_blocks`, Login
devices from the session store, Drafts from `listDrafts`, plan from
`getActivePlans`, verification/account-status reused from P9). Leaf screens live:
Account status (reuses the P9 component), Login activity (`/auth/sessions` +
revoke), Language (persists `user_settings.locale`), Privacy (4 persisted
toggles). Migration `0052_user_settings.sql` applied; RLS deny-all; upsert
round-trip proven against a real profile row.

### Not yet wired (tracked here so a real user doesn't find them first)

- **Privacy toggles are stored but not yet ENFORCED at their effect points.**
  `show_number_default` should seed the "share number" default on the create-
  listing form; `show_last_seen` / `show_activity` should gate what the chat
  header/thread reveals; `findable_by_phone` should gate phone lookup in search.
  The source of truth (`user_settings`) exists and round-trips; the read at each
  of those three call-sites is the remaining work.
- **Settings rows that point at later modules of this same task** (Saved,
  Your activity, Archived, Help centre / Contact support / Report a problem,
  Terms / Privacy Policy / Refund / Grievance / About, Download-your-data,
  Deactivate / Delete account) navigate to routes built in Modules 2–5 (Saved,
  Activity, Archived, Help/Legal). Until each ships, those rows reach a
  placeholder or 404.
- **Login activity "Recent security alerts"** section from the design is omitted:
  there is no security-event data source, and seeding fake alerts would violate
  the DB-driven rule. Needs a real event feed before it can render.

---

## Module 11 — Saved / Activity / Archived (P10 S1, S2, S2b, S5), part 2

Built and DB-verified. The ⋯ menu now has **no placeholder toasts left except
Help** (P12 — deliberately out of scope, see below).

- **Saved (S1)** — `GET /saved`. Private collections (migration `0053`), chip
  counts as real GROUP BYs, and a genuine "changed" signal: `saves.saved_price_paise`
  snapshots the price at save time, so a drop is `current < snapshot` rather than
  a guess. `toggleSave` now writes that snapshot. Move/rename/delete/un-save all
  persist and are ownership-scoped.
- **Your activity (S2)** — `GET /activity`. Recently-viewed comes from
  `listing_views` on the viewer side (signed-in views are keyed by profile id),
  deduped per listing; Saved/Proposals/Visits/Saved-search counts are real
  queries. "Clear recently viewed" deletes only the caller's own rows.
- **Saved searches (S2b)** — reuses the existing `/search/saved` API; alerts
  toggle round-trips, a row re-runs its stored filters via `filtersToQuery`.
- **Archived (S5)** — `GET /listings/archived`, grid/list toggle, Restore wired
  to the `reactivate` action.

### Found while building (reported, not silently left)

- **The design's "Restore anytime" is not what the backend does.** `reactivate`
  only accepts `availability = 'rented'`; a **sold** listing is terminal. Every
  archived row in the dev DB is sold, so a blanket Restore button would 400 on
  every one of them. The screen therefore renders Restore only where the server
  says `canReactivate`, and the info strip says "Restore a rented one anytime".
  If sold should also be restorable, that is a backend rule change — flagging it
  rather than faking the button.
- **Login activity has no "Recent security alerts"** (design shows one): there is
  no security-event source. Omitted rather than seeded with fake alerts.
- **Privacy toggles still need enforcement at their effect points** (carried over
  from part 1): create-listing default number, chat last-seen/activity,
  find-by-phone.
- **Help (P12) is intentionally NOT built** — the user scoped Module 5 out. The
  ⋯ menu's "Help" row and the Settings Support/About/Danger-zone rows that point
  at `/help/*` and `/legal/*` remain unbuilt destinations.

### Verification actually run

`tsc --noEmit` clean · `next lint` **0 errors** · `next build` succeeds (all 10
new routes emitted) · migrations `0052`, `0053` applied to dev · production
bundle free of `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`,
`R2_SECRET`.

Unauthenticated sweep — 401 on every new endpoint (GET overview/prefs/saved/
activity/archived; PATCH prefs; POST+PATCH+DELETE saved collections; PATCH+DELETE
saved items; DELETE recently-viewed).

Live all-role sweep (`scripts/check-profile-menu-live.mjs`) — owner, broker and
builder each: overview 200 with integer counts, identity/plan/account-status from
the DB, prefs PATCH persisted and re-read, overview language reflecting the stored
locale, invalid locale **422**, saved/activity/archived 200, duplicate collection
name **422**. IDOR probe: another user's collection PATCH **404**, DELETE **404**,
a save that isn't yours **404**.

Populated-state check (`scripts/check-profile-menu-populated.mjs`) — seeded real
rows because a state with 0 rows has never run: 2 saved tiles, exactly one price
drop computed from the snapshot (**↓ ₹25,000** = ₹90,000 − ₹65,000), changedCount
1, collection filter narrowing 2→1, chip count falling to 0 after a move,
recently-viewed reading back 2 tiles, and Restore on a rented listing returning
200 → `pending_review` and leaving the archive. All seed rows deleted afterwards.

### Menu icons corrected to the design's icon map

The ⋯ button itself is now the hamburger `menu` (was the three-dot `more`);
functionality is unchanged. Inside the sheet, four rows were drawing the wrong
glyph against `designs/P9 → Sheets.profileMenu`: Drafts `image`→`file`, Account
status `alert`→`shield`, View as visitor `user`→`eye` (icon added), Help
`message`→`help-circle`. Settings/Saved/Activity/Archived took their correct
`settings`/`bookmark`/`clock`/`archive` glyphs when they were wired.

### Page-level auth gate + render proof

Every new screen 307s to `/login` for a guest (the wall is on the page, not only
the API): `/settings`, `/settings/privacy`, `/settings/language`,
`/settings/login-activity`, `/settings/account-status`, `/saved`, `/activity`,
`/activity/saved-searches`, `/archived`. Signed in, all nine render **200** with
no error boundary and the correct `<title>`.

One defect found and fixed during that check: `/settings/account-status` was a
`"use client"` page, so it could not export metadata and the tab read
"HomzList — Properties without spam calls". Split into a server page + client
wrapper (`AccountStatusScreen`); it now reads "Account status · HomzList".

### Not verified in this session

Visual/pixel QA in a real browser. The in-app browser pane cannot resolve the
`seller.localhost` host the seller zone requires, so design fidelity, the
long-press sheets, scroll behaviour and 60fps were NOT eyeballed live — only
HTTP-level rendering was proven. That check still needs to be run on a real
device/browser before this ships.

---

## Module 11 — Privacy toggles now ENFORCED (part 3)

The part-1/part-2 gap ("stored but not enforced") is closed for the two toggles
that have a real effect point, and honestly reported for the one that does not.

### 1. Chat presence — `show_last_seen` / `show_activity` (ENFORCED)

`lib/chat/thread.ts` built `online` and `lastSeen` straight from the other
person's `profiles.last_active_at`, so a user who switched their toggles off was
still broadcasting presence to everyone they chatted with. The thread payload now
reads the OTHER person's settings and strips the values server-side (Doc9 §4 —
never a CSS hide):

- `show_activity` off → `online: false`, always.
- `show_last_seen` off → `lastSeen: null`, no value to render.

Defaults (both on) apply when the user has never opened Privacy, matching the
design. `last_active_at` is exposed nowhere else — the inbox list does not carry
it — so this is the only leak point and it is closed.

### 2. New-listing number default — `show_number_default` (ENFORCED)

`POST /listings` hardcoded `contact_public: body.contactPublic === true`, so the
setting was decorative: omitting the field always produced `false`. The route now
falls back to the caller's stored preference, and the create form seeds its
toggle from the same value for a brand-new listing (an edit or a resumed draft
keeps its own). The server is the wall — a payload that omits the field gets the
user's real setting, not a client guess.

### 3. `findable_by_phone` — NO consumer exists (reported, not faked)

Searched the whole codebase: the only phone lookup is `lib/auth/service.ts`
(login by phone), which obviously must not be gated by a privacy toggle. There is
no "find a user by phone number" feature, so there is nothing to enforce this
against. The column stores the user's choice and is the source of truth for when
that feature is built. The row stays in the UI because it is in the design
(P10 S6b) — flagging it here rather than inventing a search to justify it, or
quietly leaving it looking wired.

### Live verification (`scripts/check-privacy-enforced.mjs`) — ALL PASS

Against a real accepted thread, toggling the other person's settings in the DB
and re-reading the live API each time:

| Settings | `online` | `lastSeen` |
|---|---|---|
| both on (default) | `true` | `"Just now"` |
| activity off | **`false`** | `"Just now"` |
| last-seen off | `true` | **`null`** |
| both off | **`false`** | **`null`** |

The rest of the person payload (name, role, verified) is unaffected.

New-listing default, proven with real rows by an account holding a paid slot
(the payment-first gate was NOT bypassed): pref `true` → `contact_public=true`,
pref `false` → `contact_public=false`, with the payload omitting `contactPublic`
both times. The probe returned the consumed slot and deleted its listings.

Regression after these changes: `tsc --noEmit` clean · `next lint` **0 errors** ·
`next build` succeeds · bundle secret-grep clean · the full all-role + IDOR sweep
still **ALL PASS**. Every test row created was deleted — `user_settings` and
`save_collections` are both back to 0 rows.

### Still not verified

Visual/pixel QA in a browser (unchanged from part 2): the in-app browser pane
cannot resolve the `seller.localhost` host the seller zone requires, so design
fidelity, the long-press sheets and scroll/60fps still need a pass on a real
device before shipping.

---

## Module 11 — MANUAL BROWSER VERIFICATION (done)

The one item previously marked "not verified" is now closed. The blocker was that
the seller zone routes by hostname (`seller.localhost`), which the browser could
not resolve. Solved with `scripts/dev-seller-proxy.mjs` — a dev-only proxy on
:3001 that forwards to the dev server with `Host: seller.localhost:3000`. It
touches NO application code and is not part of the build.

Zone proof (the login really did happen on the seller zone, not the public one):

| Path | Public zone (`Host: localhost`) | Via proxy (`Host: seller.localhost:3000`) |
|---|---|---|
| `/login` | 307 → seller.localhost/login (refuses) | **200 — serves the form** |
| `/settings` | **404** (not in that zone) | 307 → /login (exists, gated) |

### Clicked through in a real browser at 375×812, signed in as a broker

- **⋯ button** now renders the hamburger; sheet opens/closes correctly.
- **All 18 rows** render with the corrected design icons (Settings=gear,
  Saved=bookmark, Activity=clock, Drafts=file, Archived=archive,
  Account status=shield, View as visitor=eye, Help=help-circle).
- **Settings** — live data: name/phone/role, email, city Rajkot, verification
  badge "ID ✓ · RERA ✓", account status "Needs attention", Saved **3**,
  Drafts **3**, plan "Listing Plan", Login activity "1 device", Blocked "1".
- **Login activity** — correctly identified "Chrome on Windows · Active now";
  honest empty state for other sessions.
- **Privacy** — flipping "Show last seen" in the browser wrote
  `show_last_seen=false` to Supabase (verified by query), then restored.
- **Language** — native scripts, check mark on the stored choice.
- **Saved** — 3 real tiles with price chips; created a collection through the
  sheet and confirmed the row in `save_collections`; chip appeared with count 0.
- **Your activity** — 6 real inquiries with live status badges (Sent / Declined /
  Accepted), 16 proposals, 8 visits, 1 saved search. "Recently viewed" correctly
  absent (this user has no view rows) rather than an empty section.
- **Saved searches** — real row "3 BHK in Mavdi under ₹1 Cr · 5 matches · alerts on".
- **Archived** — 3 sold listings, **no Restore button on any** (sold is terminal,
  as built); grid/list toggle works, photos dimmed with SOLD chips.
- **Account status** — real moderation event, consistent with the "Needs
  attention" label in Settings; `<title>` fix confirmed.
- **QR code** — sheet renders with real name/role/city/handle.
- **View as visitor** — strip appears; private stats (Requirements, Leads) and
  the Edit/Share/QR buttons correctly disappear; Exit restores.
- **Drafts** — renders.

**Console errors: 0.** No horizontal overflow at 375px
(`scrollWidth === innerWidth === 375`). All 10 routes fetched 200 while signed in.

Every row created during this pass was deleted — `save_collections` and
`user_settings` are both back to 0.

---

## Public profile (P9 S2) — visual rebuild + a bug the rebuild exposed

Rebuilt on Rajan's explicit instruction (this overrides the DESIGN LOCK for this
screen only). **Functionality untouched** — the diff contains zero changes to
state, effects, handlers or API calls; every sheet, guard, report/block flow and
route push is byte-identical. Presentation only.

### What was actually wrong

- A single "Listings" stat sat beside an 84px avatar under `justify-around`,
  leaving a wide dead gap on every owner/broker profile.
- Featured labels were clipped to the 64px ring — "Ready to move" rendered as
  "Ready to m…".
- The 3-column grid gave each tile ~124px at 375px, so the price — the one thing
  a browser scans for — was the thing being cut ("₹1.05 Cr · Negotiable").
- Name at 15px had no more weight than the meta text; nothing led the page.

### What it is now

Name leads at 20px with the verified badge; role and city as pills; bio with
real line height; the counts in a bordered row that reads as deliberate whether
there are two tiles or three (builders get Projects). Message gained its icon and
an adjacent info button (the old 11px "About this account" text link). Featured
labels wrap to two lines. The grid is 2-up cards — 4:3 cover, price at full width
so it can never truncate, area with a pin beneath. Sticky tab bar with an inset
indicator. Real empty state instead of a bare sentence.

Tokens only, no hardcoded hex; verified in light AND dark; no horizontal overflow
at 375px; lint 0 errors; build clean.

### BUG FOUND — a builder's "Projects" tab is a lie (NOT fixed, needs backend)

On a builder profile, the **Projects** tab and the **Sell / Rent** tab render
byte-identical content: both fall through to `listings`. The header says
"1 Project" while the Projects tab shows 5 listings. Verified live on
`manishagarwal9b4e` by switching tabs and comparing.

This is pre-existing and is the exact bug that was already fixed on the OWN
profile (`OwnProfile` gained `listingsApi.myProjects()`); the visitor profile
never got the same treatment. It cannot be fixed here because **no public
projects endpoint exists** — `profileApi` has `publicListings` / `publicFeatured`
but no `publicProjects`, and `/api/v1/profile/[username]/listings` has no project
branch. Fixing it means a new endpoint + service query, which is beyond a visual
change, so it is recorded rather than silently left or silently scoped in.

### Live role verification (public host, as a guest)

- **Broker** `rkproperties2f21` — 11 Listings · Jul 2026, Rajkot pill, featured
  "Ready to move" fully legible, 11 cards across Sell/Rent, every price readable
  (₹82 Lakh … ₹2.1 Cr), scrolls to the last card with nothing clipped.
- **Owner** `rahulmehta9377` — 7 Listings, bio, response label; Sell and Rent
  tabs both populated and switching correctly.
- **Builder** `manishagarwal9b4e` — 5 Listings · 1 Project · Jul 2026 (singular
  "Project" correct), Builder pill, featured "Premium villas". Projects tab bug
  above.

Console: one dev-only React HMR warning naming `HotReload`, present before this
change (the diff touches no effects) and absent from production builds.

---

## Public profile — Projects tab fixed, ⋯ menu trimmed, own-link routing

### 1. Builder Projects tab — FIXED (the bug reported in the previous section)

The tab now has an endpoint behind it: `GET /api/v1/profile/:username/projects`
→ `listPublicProjectsByProfile()`, **live projects only**, mirroring the public
rule for listings so the tab and the header count can never disagree. Non-builders
get `{ items: [] }` (projects are Builder-only, Doc2 §6) rather than an error.

Proven live on `manishagarwal9b4e`: header "1 Project", Projects tab renders the
one real project (*Green Meadows Villas*, READY TO MOVE, Kalawad Road) and the
Sell / Rent tab renders 5 listings — **two different sets**, where before both
tabs rendered byte-identical content.

### 2. ⋯ menu — Copy link and Block user removed

- **Copy link** was byte-identical to Share profile: same clipboard write, same
  toast. The sheet offered one action twice under two names.
- **Block user** removed on Rajan's instruction. Blocking still exists where it
  has context — inside a chat thread (P7) and the Blocked-users settings screen —
  so `blockUserById`, the endpoint and `profileApi.blockUser` all stay; only this
  entry point is gone. The now-unreachable ConfirmDialog and its state were
  deleted rather than left as dead code.

The menu is now **Share profile** + **Report profile**.

### 3. Your own profile link now opens YOUR profile

Pasting your own profile URL (or tapping your own name from a thread) rendered
the VISITOR view of yourself: no stats, no Edit profile, and a Message / Report
set aimed at you. `seller/profile/[username]` now compares the session's username
server-side and renders `OwnProfile` on a match, so the correct screen paints
first with no flash. Case-insensitive, since usernames are stored lowercased.

Verified live: as Amit Shah, `/profile/amitshah1235` → own profile (8 Listings ·
3 Requirements · 0 Leads, Edit profile, Requirements tab, hamburger menu);
`/profile/rkproperties2f21` → still the visitor view. No regression.

NOTE — this is seller-host only by design. The public host strips the session in
middleware (it is the guest surface), so it cannot know who you are there.

### 4. Bio

Already rendered and still does — verified end-to-end: the API returns
`bio: "Vadodara developer — RERA compliant projects."` and the screen prints it
under the identity block. `rkproperties2f21` shows none because that row's `bio`
is **NULL in the database**, not because the screen drops it. No placeholder is
invented for an empty bio (CLAUDE.md §7).

### Live verification of the ⋯ actions (real rows, then cleaned up)

- **Share profile** — copies the link, toast shown.
- **Report profile** — as a guest it correctly bounces to Sign in; signed in, the
  sheet opens and submitting wrote a real row: `reports(subject_type='user',
  reason='spam', status='open')`. (The enum value is `user`, not `profile`.)
- **Block user** — before removal, confirmed it wrote `chat_blocks(Amit Shah →
  RK Properties)`; both test rows deleted afterwards.

Console errors: 0. `tsc` clean · lint **0 errors** · build succeeds · bundle
secret-free.

---

## Sell/Buy creation-flow audit (28 Jul 2026) — out-of-scope gaps found

Everything below was found while repairing the create flow (migrations 0054-0059).
None of it belongs to that module, so it is recorded here instead of being
discovered by a real user.

### 1. 104,608 cities are selectable but not "launched" — ADMIN-BLOCKED

The location master is now the whole India Post directory (36 states, 658
districts, 7,168 talukas, 104,612 cities/villages, 50,950 areas, 19,238
pincodes). A seller can list anywhere in the country, and that works.

`locations.is_launched` is still **true for only four cities** (Ahmedabad,
Rajkot, Surat, Vadodara) — deliberately: the flag gates SEO landing pages, the
sitemap and the "we're not in your city yet" screen, and flipping 104k rows to
launched would advertise thin pages for villages with no inventory.

The gap: there is **no admin control to launch a city**. Until Module 11 ships
one, launching Pune or Jaipur is a manual `update locations set is_launched`.
The seller-side flow does not depend on it; the buyer-side SEO surface does.

### 2. Desktop and tablet are still the mobile column

`AppShell` centres a 470px column at every viewport, so the create flow, the
photo grid and the detail screen render as a phone-width strip on a 1280px
screen. Verified there is **no horizontal overflow or clipping** at 360 / 375 /
414 / 768 / 1024 / 1280, so nothing is broken — but CLAUDE.md rule 2 asks for
separate native desktop/tablet layouts on the user side, and those do not exist
for these screens. That is its own piece of work; changing `AppShell` would move
every screen in the app at once.

### 3. The photo guide's example shots are grey boxes

`designs/P5 S5` draws four example photos (Exterior / Living room / Kitchen /
Bedroom) in the first-run dialog. There are no image assets for them, so the
dialog renders four empty `surface-2` rectangles with captions. The labels and
the checklist are real; only the sample imagery is missing.

### 4. Admin moderation screens have not been checked against the new fields

Migration 0055 took a Flat from 21 fields to 27 and a Godown from 8 to 22, and
grouped all of them. The seller form, the preview, the detail screen and the
search facets were all updated and verified. The **admin review queue**
(P13-14-15) was not looked at — if it prints attributes from its own list rather
than from `field_definitions`, the new fields will be invisible to a moderator.

### 5. Legacy rows still have a broken mid-chain

Listings created before the cascade existed have `district_id`/`taluka_id` null
(`resolveLocationChain` rebuilds them on read, so the edit form is fine). The
projects table was backfilled by migration 0056; `listings` was not, because
migration 0021 already tried and these rows predate the ids it needed. Harmless
today — a district-level filter on the buy side would miss them.

### 6. The preview screen has not been re-checked against the new field set

Deliberately out of scope this round (Rajan is taking it in the next prompt).
`components/listings/Preview.tsx` renders what the create flow collected, and
the create flow now collects 15 new field types, per-kind extras (`sell_fields`
/ `rent_fields`) and conditional fields. Two things to look at when it comes
up: whether the preview reads `attributeGroups` (which is correct and already
per-kind ordered) or re-derives its own list from `type.fields` (which would
now be missing the sell/rent extras), and whether it hides the same fields the
form hid.

### 7. Admin moderation has not been checked against project types

Item 4 above, for the other form. `project_types` (migration 0062) is new: a
project now carries a `project_type` and an `attributes` blob, and the admin
review queue was not looked at. A moderator approving a plotting scheme
probably cannot see its land-use zone, permitted floors or plot count.

### 8. No project facets on the buy side

Listings got facets for all 15 new fields (migration 0061). Projects have no
filter sheet of their own at all, so `project_type` — the single most obvious
thing to filter a project list by — is collected and stored but not searchable.
Needs a project search surface first; not a gap inside the create flow.

### 9. `possession` and `age` moved vocabulary; old rows were migrated, old
saved searches were not

Migration 0060 replaced `construction_status` new/resale with
ready_to_move/under_construction/new_launch and dropped the two non-age values
from `age`. Listing rows were rewritten in the same migration. A SAVED SEARCH
that filtered on `construction_status=resale` still holds the old code and
would now match nothing — it was not rewritten because the mapping for a
*filter* is not the mapping for a row (a user who asked for "resale" meant
"not new", which is not one new value).

Checked, and nothing is broken TODAY: `select count(*) filter (where
params::text like '%construction_status%' or params::text like '%age%') from
saved_searches` returns 0 of 1. This is only a hazard if the same vocabulary is
changed again once real users have saved searches — at which point the change
needs a params rewrite in the same migration.

### 10. The double-payment guard warns AFTER the sheet has already opened

`/billing/checkout` computes `duplicateWarning` (same user + same catalog code
paid inside `double_pay_window_minutes`) and returns it in the checkout session.
But `components/billing/Checkout.tsx` only reads it out of the *result* of
`payWithRazorpay`, which resolves after the Razorpay sheet has been opened and
possibly paid. The warning banner then renders in the `form` phase — i.e. the
only way to see "you already paid for this 4 minutes ago" is to have cancelled
the second payment yourself.

Doc2 §4.3 wants the guard to warn *instead of* charging again. Fixing it means
splitting the flow: ask the server whether this purchase is a duplicate before
creating the order (or return the warning from `/billing/quote`, which the
screen already calls on load), and gate the Pay button behind a confirm. That is
a flow change on a locked design screen, so it needs Rajan's call on what the
confirm looks like — not something to invent.

Found while fixing the Razorpay verify/webhook bugs (2026-07-28); the guard is
not wired to anything that can prevent a charge today.

### 11. UPI is switched OFF on the Razorpay account (dashboard action, not code)

Live check against the configured TEST key on 2026-07-28
(`GET https://api.razorpay.com/v1/preferences?key_id=…`):

```
upi        = false
upi_type   = { collect: 0, intent: 0 }
upi_intent = true
card       = true
netbanking = 40 banks
wallet     = airtelmoney, mobikwik, olamoney
paylater   = 9 providers
```

So the account cannot take a UPI payment at all — neither collect nor intent.
Confirmed in the browser: with UPI selected on our screen the Razorpay sheet
opened listing only Cards / Netbanking / Wallet / Pay Later.

The code side is now honest about it — `/billing/quote` returns the gateway's
live method list and the checkout screen only renders methods that are actually
chargeable, so UPI no longer appears. But **that is a workaround, not the fix**:
UPI is the method most Indian buyers expect, and today every one of them is
pushed onto a card.

Action is Rajan's, in the Razorpay dashboard (Settings → Payment Methods → UPI),
and it has to be done for the LIVE account too, not just test. Nothing in this
repo can enable it. Once it is on, the UPI row reappears by itself — the list is
read from `/preferences`, so no code change is needed.

Worth noting the UPI-collect "Payment processing… safe to close" screen
(`phase === "pending"` in `components/billing/Checkout.tsx`) is therefore
unreachable in production right now: nothing can produce a pending UPI order
while UPI is off. It has never run against a real payment.

## Create-flow sweep (28 Jul 2026) — observations left open

Found while walking all 21 property type × kind combinations and all 8 project
types live. Not bugs I fixed, because each is a product/config call:

- **`plot_approval` offers "NA order" on Kheti land.** On Agriculture Land and
  Farm Land the seller can set `na_kheti = Kheti` and still pick
  `plot_approval = NA order`, which is self-contradictory (NA order is exactly
  what converts Kheti to NA). The other four options (NA + TP, RERA, Gram
  Panchayat, Not approved yet) are all legitimate for Kheti. Fix would be a
  `show_if` on the option set, or a server cross-check — needs Rajan's call on
  which is intended.
- **"Shutters" sits under "Parking & utilities".** `field_definitions.shutter_count`
  carries `group = utilities`, so a shop's shutter count is printed under a
  heading about parking. Cosmetic; it's a config row, not code.
- **Redis is not running in dev.** Every request logs
  `ECONNREFUSED 127.0.0.1:6379`. Nothing in the create flow broke (the cache
  path falls through), but the dev log is unreadable and any queue-backed
  promise is not actually running locally.

## Create-gate rework (28 Jul 2026) — RESOLVED

A project used to spend a ₹999 LISTING slot: `createProject` called
`consumeQuota(profileId, "listing", 1)`, so any plan holding a listing slot
funded a builder scheme while the review step promised "₹9,999 · 6 months ·
1 project". Proven on dev: eight projects went out against a single 50-slot
₹999 grant.

Fixed in migrations 0065/0066 — `project` is now a first-class
`consumption_kind` with its own `project_quota` / `project_used` columns,
p9999 sells one project and zero listings, and the p9999 plans that already
existed (plus their consumption trace) were migrated rather than reset. The
Create screen, the plan wall and the PLAN_REQUIRED bounce all gate New Project
on that counter, and `POST /projects` refuses without it even when the account
holds listing slots.

Nothing left open here.

## Builder = projects only (28 Jul 2026) — both consequences now RESOLVED

Migration 0067 took Sell / Rent / Requirement away from the Builder role
(create, submit, un-hide, reopen and the active toggle are all refused
server-side; existing builder listings were hidden and requirements paused).
Two consequences were found, raised with Rajan, and fixed on his instruction.
Both are authorised departures from the locked design — recorded here so nobody
"fixes" them back:

- **DESIGN-LOCK OVERRIDE · "Compare plans" ₹9,999 column.** Both compare sheets
  (`components/billing/PlanWall.tsx` for the P5 wall, `components/billing/
  Plans.tsx` for P11) printed "Property listing ✓", "Listing validity 6 months"
  and "Requirement post 1" under ₹9,999. All three were already untrue before
  this change — `plan_catalog.p9999` has `listing_quota = 0` and
  `requirement_quota = 0` since migration 0065, it sells one project — and 0067
  made them unreachable for the only role that can buy the plan. All three cells
  now read "—". The 6-month window is the PROJECT's and is not lost: the plan
  card carries it in its own sub-label ("per project · 6 months"). Nothing else
  in either table moved; "Project posting ✓", "View others' requirements ·
  Matched only", "Proposals · Unlimited" and "Match alerts · Priority" are all
  still true of p9999. `test-builder-projects-only.mjs` now asserts the catalog
  row those cells claim to read, so the copy can't drift from the DB again.
- **DESIGN-LOCK OVERRIDE · builder PUBLIC profile.** `OtherProfile` gave the
  builder role tabs `["Projects", "Sell / Rent"]` and a "Listings" stat tile.
  Neither can be non-empty any more, so the tab is dropped (builder = one
  "Projects" tab) and the stat tile shows Projects instead of a permanent
  "0 Listings". `OwnProfile` is deliberately UNTOUCHED — its Sell / Rent and
  Requirements tabs are where a builder still sees and manages the rows 0067
  hid, so removing them there would strand that content.

## Feed cards redesigned (28 Jul 2026) — what was found, fixed, and left open

The home feed's PROJECT card was redesigned on Rajan's instruction, and the
property card was brought into the same visual language (`components/feed/
cardChrome.tsx` holds the shared chip/facts primitives). The image is unchanged:
still 16/9, still the same carousel. Everything the two cards now show is a real
column — `project_types.label`, `project_units` (price band + unit chips),
`possession_date`, `towers/floors/total_units/available_units`, `attributes`
(total_plots, site area), `property_types.label` and the listing's own
attributes for the property facts strip.

FIXED here (all were live defects, not cosmetics):

- **Save on a project card persisted nothing.** `saves.listing_id` is a FK to
  `listings`, so `toggleSave` looked a project id up in the wrong table, found
  nothing, and returned `{saved:false}` with a 200 — the UI toasted "Saved to
  wishlist" over a write that never happened. The heart is gone from the project
  card (same call the project detail already made) and Call / WhatsApp take its
  place, which write a real `leads` row.
- **Inquiry on a project card always failed.** Same root cause via
  `inquiries.listing_id`; the sheet ended in "Couldn't send that inquiry" every
  time. Projects have no chat pipeline (Doc2 §6) — contact is the builder's
  number, exactly as on the project detail.
- **"Promoted" and "New Project" drew on top of each other** (both at
  `left-3 top-3`), so a boosted project showed one badge over the other.
- **"Not interested" removed** (Rajan, 28 Jul 2026). It could never work on a
  project anyway: `feed_not_interested.type_code` references `property_types`,
  and a project's type lives in `project_types`.
- **The not-interested AREA filter was never applied to projects** — hiding an
  area still returned that area's project cards.
- **A signed-in user was treated as a guest by the whole feed** once their
  15-minute access token expired: `FeedHome.loadMe` used a plain `fetch`, which
  cannot refresh, so one 401 turned every Save/Inquiry/Call on every card into a
  login sheet. Now `apiFetch` + `no-store`.
- **A project lead was lost when the viewer tapped Call.** `location.href =
  tel:` starts unloading the page and the browser cancelled the in-flight POST;
  `recordProjectContact` now sends `keepalive: true`. Caught by the click walk
  (WhatsApp recorded a lead, Call did not).
- **The WhatsApp share was a bare URL** — it now names the property/project and
  its price and asks for more details.

Verified live: `scripts/check-feed-cards-live.mjs` (cross-role API sweep, guest
+ owner + broker + builder, with the DB row behind every claim) and
`scripts/check-feed-cards-ui.mjs` (a real browser clicking every control on both
cards, then reading the row it wrote). Both ALL PASS.

STILL OPEN (out of scope, not broken by this change):

- **Area units are hardcoded in the component.** `AREA_UNITS_LAND` /
  `AREA_UNITS_BUILT` live in `components/listings/FormControls.tsx` and the feed
  now mirrors that list in `AREA_UNIT_LABEL` (lib/feed/service.ts). Two copies of
  a vocabulary that CLAUDE.md rule 7 says belongs in a table. Needs an
  `area_units` master table + one loader.
- **The area control never persists its DEFAULT unit.** The `<select>` shows
  "sq ft" but only writes `unit` once the seller touches it, so a stored
  `{value: 50}` is ambiguous by luck rather than by design. Both readers assume
  sq ft; the form should write the unit it displays.
- **`ProjectDetail` reads `p.photoCount`, which the project DTO never returns**
  — so the "1/N" counter on the project cover can never appear. Projects have no
  photo table at all (only `projects.cover_url`), which is also why the feed's
  project card shows a single image and no carousel.
- **Project cards are only in the unfiltered feed.** The Buy/Rent filters
  exclude them by design (`filter === "all"`), so a builder's boost is invisible
  to a viewer sitting on the Buy tab. Worth a decision, not a bug.

### Follow-up (28 Jul 2026) — the pending items above, closed

- **Area units are a TABLE now** (migration 0068). `area_units` carries the
  label, the set (land/built/both) and the sq-ft factor; the form renders its
  picker from `/listings/config`, `toSqft`/`fromSqft` convert from the same rows,
  and the feed card labels from them. The three hardcoded copies are gone.
  Proven live: a listing created with `land_area = 5 vigha` still stores
  `area_sqft = 87120`.
- **The area control writes its default unit.** It showed "sq ft" and stored no
  `unit` at all until the seller touched the select, so every reader had to
  assume one. The unit is now written with the value.
- **`ProjectDetail`'s photo counter** compared an undefined `photoCount`; it is
  explicit `?? 0` now. Projects still have exactly one image (`cover_url`) —
  a project gallery is a module, not a fix, and stays on this list.
- **The Preview screen's "Feed card" tab is the REAL card.** It used to
  hand-draw its own copy (4:5 photo, no title, no facts, an action bar that no
  longer exists) under the caption "This is how your listing appears in the
  feed" — a promise that broke silently every time the card changed. It now
  renders `components/feed/FeedCard` off `GET /api/v1/listings/:id/card`
  (owner-only; 401 for a guest, NOT_FOUND for a stranger). The dead helpers it
  needed (`metaLine`, its own `Avatar`, the slide/poster state) are removed.
- **Long titles clamp to two lines with "…"** on both cards. Unclamped, a long
  scheme name pushed the price and the facts strip down the card.

STILL OPEN: project cards being absent from the Buy/Rent tabs — a product
decision, not a defect.

## Closed — 29 Jul 2026

- **Project photo galleries** (was: "one cover only"). Migration 0075 adds
  `project_photos` + `projects.photo_count`, `lib/listings/photos.ts` is now
  subject-parameterised so listings and projects share ONE presign → commit →
  magic-byte gate → reorder → cover implementation, and
  `/api/v1/projects/:id/photos{,/presign,/commit,/:photoId}` mirror the listing
  routes. The P5 photo grid serves both (`?project=`), reached from the project
  detail's ⋯ → Manage photos; every existing project's `cover_url` was
  backfilled as photo #1. Proven live: upload → row at position 1 with real
  width/height, Set-as-cover → position 0 + `projects.cover_url` updated,
  delete → positions closed and cover restored. IDOR probe on another builder's
  project: presign 404, PATCH 404, DELETE 404, cross-project commit key 422.
- **My Listings was empty for every builder.** `GET /listings/mine` only read
  the `listings` table, and migration 0067 stops a builder posting a property at
  all — so the screen named after their inventory said "No listings yet" while
  their `projects` rows existed. It returns projects too now, tagged
  `subjectKind`, sorted into the same list, counted by the same chips; the card
  routes to the project's pages and the sheet drops the actions a project has no
  endpoint for (sold / rented / hide / delete). `OwnProfile` filters them back
  out of its Sell / Rent grid, where they already have their own tab.
- **"Boost" looked like a dead button.** A subject that isn't boostable *yet*
  (still under review) pushed the seller to the Boosts LIST — "No boosts yet",
  no explanation, nothing to do. Both insights screens now open the buy screen,
  which draws the subject dimmed with its lock label ("Under review") exactly as
  designed. The buy screen's empty state fired on "nothing ELIGIBLE" and now
  fires only on "nothing AT ALL", and its "Go to My Listings" CTA went to `/`.
- **A query-string subject was trusted.** `/boost/new?listing=…` armed Continue
  for whatever id was in the URL, so an ineligible one reached checkout and was
  refused there — payment screen first, refusal after. The id is honoured only
  if the server's `eligible` says so.
- **`promotedListingIds` ignored `subject_kind`.** `boosts.listing_id` holds the
  id of a listing, project OR requirement; the batch lookup matched on id alone.
- **The image worker had never run.** `imageProcessor` reads `photoId` off the
  job and returns when it is missing — and `enqueueProcessing` never sent one,
  so no photo has ever been given WebP variants. The job now carries `photoId`
  and the `table` to write back to. Dormant in dev (no Redis → the documented
  "mark ready" fallback), so this was invisible until projects needed the same
  queue.

Found while fixing the two above, and CLOSED the same day (migration 0079) —
**a builder could not remove or pause a project.** A listing has had delete →
30-day trash → restore/purge, hide/unhide and sold/rented since Module 4. A
project had NONE of them: no `DELETE /api/v1/projects/:id`, no status route,
and the read paths filtered on a `deleted_at` that nothing in the product ever
wrote. A scheme that was finished, withdrawn or posted by mistake stayed on the
profile and in the feed permanently, and the ₹9,999 slot behind it could never
be released. Now shipped:

- `POST /projects/:id/status` — hide / unhide / restore. Hiding PAUSES a
  running boost (the project is placed nowhere, so days the builder paid for
  must not run down against an invisible row) and going live again RESUMES it.
  Hiding a project that is still under review is refused: it would strand the
  row outside the review queue, which has no entry for a hidden project.
  Restore returns it to `pending_review`, never straight to live — the row was
  out of moderation's sight for up to 30 days and it carries a RERA number.
- `DELETE /projects/:id` — soft delete → the same 30-day trash the listings
  use, one list, `subjectKind` per row. The slot comes back ONLY when the
  project never reached `live` (measured on `live_at`, not the current status,
  so a live-then-hidden project doesn't earn a refund); otherwise one ₹9,999
  plan could be recycled forever by publishing, deleting and re-posting. The
  refund credits `project_used`, not `listing_used` — `releaseSlotAndRefundQuota`
  took a `kind` for this.
- `POST /projects/:id/purge` — "Delete now", filtered on `status = 'deleted'`
  inside the statement so it can never hard-delete a live project.
- `lifecycle.purgeProjectTrash` — the 31st-day sweep, so the trash screen's
  "permanently deleted after 30 days" has a job behind it.

CLOSED the same day (migration 0080) — **purging orphaned every image.**
`project_photos` and `listing_photos` cascade on the DB delete, but the objects
they pointed at were only ever removed from storage when a photo was deleted
one at a time through the photo endpoint. Purge — the "Delete now" button AND
the 31st-day cron — dropped the row, cascaded the photo rows, and left the
files in the bucket forever with nothing left in the database that knew the
keys. A project's BROCHURE leaked worse: it is a column, not a photo row, so no
cascade would ever have reached it, and it sits in the PRIVATE bucket.

Two comments in `lib/listings/photos.ts` also pointed a failed delete at "the
7-day orphan sweep". There was no sweep. Now:

- `purgeSubjectStorage(ids, subject, reason)` deletes the objects BEFORE the
  rows go (while the keys are still readable), covering photos for both
  subjects plus the project brochure. Called from `purgeListing`,
  `purgeProject`, `purgeTrash` and `purgeProjectTrash`.
- `deleteObjectOrRecord` writes a failed delete into `storage_orphans` instead
  of swallowing it, and `lifecycle.sweepStorageOrphans` retries the queue every
  night (giving up after 10 attempts and leaving the row as the record of a
  real leak). It is deliberately NOT a bucket scanner: a job that enumerates
  the bucket and deletes what it cannot match to a row is one query bug away
  from wiping live photos, so the queue only ever holds keys the app itself
  asked to delete.
- `storage_orphans` has RLS on with NO policy — service-role only. Proven: with
  a row present, an anon REST select returns `[]` and an anon insert is 401,
  while the service role sees the row.

Proven live against the real bucket (`npm run check:purge-storage`, 27 checks):
purging a project removed its photo object from `listing-photos` and its
brochure from `private-docs`; purging a listing removed its photo; the cron
purge of 30-day-old trash did the same; a seeded failed-delete row was drained
by the sweep; and another builder's purge attempt left both the row and the
object untouched (404), unauthenticated 401.

- **An empty screen was being used to mean "the request failed".** Both the
  builder home (`BuilderDashboard`) and the seller's manager (`MyListings`)
  wrote `items: []` on ANY error and then rendered their empty state — so a
  401, a 500 or a dropped connection drew "No projects yet" / "No listings yet"
  over a real inventory. This is the "blank home page" a builder hits: the dev
  KV is in-memory (`lib/kv.ts`), every hot reload wipes the session store, the
  next `builder-dashboard` call 401s, and the screen reports it as an empty
  database. Both now separate offline (the design's banner) from a failed read
  (an error state with Retry) from genuinely empty, and neither invents an
  answer the server never gave.

---

## Messages / Chat audit (Module 7 re-walk) — open items

The chat module was walked line by line against the full Messages spec. What
was broken is fixed and proven live (`npm run check:messages` — 100 checks).
Three things are genuinely out of scope and are tracked here rather than left
to be discovered by a real user.

- **Admin read-only chat has no surface yet.** The spec says admin may read a
  reported message's context and can NEVER send (blocked at API level, even
  under impersonation). The API-level half is real today: every chat mutation
  goes through `requireActive()`, which is a plain participant check with no
  admin branch — an admin session is simply not a participant, so there is no
  path for an admin to post. The READ side does not exist because the admin
  module (P13-15) is not built: `reports` rows with `subject_type='message'`
  are being written and are waiting for a queue to display them. When that
  module lands it needs a service-role reader that shows deleted messages as
  "deleted by user" (the tombstone data is already retained for exactly this,
  for 30 days — `lib/chat/retention.ts`).

- **"Leads grouped by source" has no design.** The spec asks for property leads
  / requirement proposals / project leads as groups. The source is now a real,
  correct column on every lead (migration 0081 added `project` as a source, and
  accepting an inquiry/proposal files the row with its own kind), it is exposed
  as `sourceLabel` on the leads payload and as a Source column in the CSV
  export. The P8 Leads screen groups by STAGE, not source, and inventing a
  second grouping would be a design change — needs Rajan's call.

- **Chat retention purges dormant threads at 12 months.** "Chats survive
  listing archive / expiry / deletion" is satisfied structurally
  (`chat_threads.listing_id` is `on delete set null`, so the conversation
  outlives the listing). Separately, `runChatRetention()` deletes threads with
  no message in 365 days as a data-minimisation measure (Doc9 §26). That is a
  policy decision, not a bug, but it is the one way a thread can disappear —
  flagging it in case the intent is that chats are kept forever.

---

## Messages rebuilt around the subject (Rajan, 29 Jul 2026) — open items

The inbox is now a list of subjects (property / project / requirement) split
into two sections — Received (threads on my posts) and Sent (threads I opened on
someone else's). Projects became a chat subject at the same time (migration
0084). Proven live by `npm run check:inbox` (47 checks) with `npm run
check:messages` still at 105/105. What is NOT done, and why:

- **A project thread does not record WHICH unit the buyer asked about.** The
  builder's card was designed to prefix every chat with its unit type ("3 BHK ·
  Send the payment plan"). The unit exists only inside the message body today —
  a unit-level "Enquire" prefills the message with it, which is real but not
  queryable. Making that prefix real needs `chat_threads.unit_id` (→
  `project_units`) and a unit picker on the inquiry sheet. Deliberately not
  faked in the UI.

- **The old 4-tab endpoint is now unreferenced by any screen.**
  `GET /api/v1/chat/threads` and `getThreads()` (My Listings / My Inquiries /
  Requirement Leads / My Responses) are still served, still authorised, and
  still exercised by `check:messages` — but no component calls them since the
  inbox replaced the tabs. They should be retired once the new home has lived
  through a release; deleting them now would blind that suite for no gain.

- **A project inquiry writes no `inquiries` row.** That table is listing-only
  (`listing_id not null`, 0026), so a project inquiry's record IS its thread.
  Consequence: the intent chips ("Site visit?", "Negotiable?") and the
  share-number toggle do not exist for projects — the sheet hides them rather
  than showing controls that would persist nothing. If the spec later wants
  intents on a project, `inquiries` needs a nullable `listing_id` + `project_id`
  and every reader of it needs revisiting.

- **Two doors now open onto one project lead.** Tapping Call/WhatsApp on a
  project and starting a project chat both upsert the same
  `(owner, lead_profile, project)` row. Both now file it under source
  `project` — that was a real inconsistency, fixed here: `recordProjectLead`
  was writing `inquiry`, so a builder's pipeline showed project leads as
  "Property lead" depending on which door the person came through. Migration
  0085 repaired the 11 rows already written. Worth knowing that the row's
  `last_activity` is whichever door was used most recently.

- **Admin read-only chat still has no surface** (unchanged from the audit above)
  — and a project thread is now another thing that queue will need to render.

Found and fixed while walking this, rather than left for a user to hit:
  * the Requests screen opened on the "Verified" tab unconditionally, so a
    poster with five unverified requests and no verified ones saw "No message
    requests" while the header said 5 — it now opens on the tab that has them;
  * a project request arrived on that screen with no subject card at all
    (`getRequests` only ever built listing/requirement cards), so the builder
    was asked to accept a stranger with no way to see what they were asking
    about.

## P2 story viewer redesign (29 Jul 2026)

Found while rebuilding the fullscreen story on designs/P2A:

- **The "no longer available" state had never rendered for anybody.**
  `getStories` only returns `availability = 'available'` rows and the viewer
  read that list once at mount, so a listing that sold mid-window simply kept
  showing its price. `GET /api/v1/stories/:id` — the endpoint that exists to
  answer `available:false` — had NO caller anywhere in the app. The viewer now
  re-reads each segment as it comes on screen (and treats a 404, i.e. taken
  down entirely, the same way), which is what makes that screen reachable.

- **A view COUNT cannot be shown on a story, by construction.** Views/saves/
  leads are owner-only (`ownerExtras`, lib/listings/dto.ts) and Doc2 §9.3 bans
  exposing a story view-count. An owner-only line would also be dead code:
  `getStories` excludes the viewer's own listings (`neq profile_id`), so a
  poster can never open their own story. If poster-side story stats are wanted,
  they belong on P9/Insights, not in the viewer.

- **A project has no Save.** `saves` is listing-scoped (`listing_id not null`),
  so the project story shows View project + Send Inquiry and no bookmark,
  rather than a control that would persist nothing. Saving a project needs a
  `saves.project_id` (or a `saved_projects` table) and every reader revisited.

- **Story photos are still public-bucket URLs.** Unchanged from the earlier
  note — a private story bucket with signed 24h URLs is still the hardening.

Found and fixed while walking this, rather than left for a user to hit:
  * the cover photo was `object-cover`-ed into a 9:16 frame, so every landscape
    listing photo lost its top and bottom in the story — it is now the whole
    photo (`object-contain`) over a blurred copy of itself;
  * the strip was a `bhk · sqft · area` STRING, not the type's key specs, so a
    plot/shop/office story showed facts that type never had — it now runs the
    same `resolveKeySpecs` + `topUpSpecs` pair as the P4 detail;
  * a project's story printed the scheme NAME where every property printed a
    price, and no price anywhere — it now shows the unit price band;
  * `resolveKeySpecs` printed a bare "0" as a fact, so a villa scheme with
    `towers = 0` opened its strip with "Towers 0" — on the project story AND on
    the P4 project detail. Zero counts are dropped and the next candidate takes
    the slot; "0 / 4" (ground floor) and "0%" still stand.

---

## Messages rebuilt subject-first + project chat (29 Jul 2026) — open items

The inbox was rebuilt around the SUBJECT (property / project / requirement)
instead of the person, in two sections — Received (threads on my posts) and
Sent (threads I opened on someone else's). Migration 0084 made a project a chat
subject for the first time; 0086 made a project chat open live instead of
waiting behind Accept. Proven live by `npm run check:inbox` (78 checks) with
`npm run check:messages` (105) still green.

What is genuinely out of scope and is tracked here rather than left to be
discovered by a real user:

- ~~**A project chat has no unit dimension.**~~ **CLOSED (29 Jul 2026,
  migration 0087).** `chat_threads.unit_id` now records which unit a buyer
  tapped Enquire on; the builder's inbox row and the thread's subject strip are
  labelled with it ("1 BHK · What is the carpet area?"). The id is validated
  against the project server-side, so a unit from another builder's scheme
  cannot label the thread, and a DB check keeps a unit from ever existing on a
  non-project thread. Null stays a real answer: "Contact builder" is about the
  whole scheme. What is still NOT built: filtering or grouping the inbox BY
  unit — the label is shown, not yet a facet.

- **Two contact paths on a project detail now leave different traces.**
  "Contact builder" opens an in-app thread (a chat + a `project` lead the
  builder can answer). The WhatsApp icon beside it still hands the buyer to
  `wa.me` and records only a lead row with no conversation behind it. Both are
  on the same sticky bar. Which one survives is Rajan's call — removing the
  WhatsApp shortcut is a design change and was not made.

- **The old 4-tab inbox endpoint is now unreferenced by any screen.**
  `GET /api/v1/chat/threads` and `getThreads()` (the My Listings / My Inquiries
  / Requirement Leads / My Responses payload) are still live, still authorized
  and still exercised by `check:messages`, but nothing in the app calls them —
  `/chat/inbox` replaced them. They should be deleted once nothing references
  them; leaving them is dead surface area, not a bug.

- **A project chat can no longer be declined,** by design (0086): declining is a
  Requests-screen action and a project thread never reaches that screen. The
  cooldown branch in `sendProjectInquiry` is therefore only reachable for
  threads declined before the migration — all of which it repaired — so it now
  stands as a guard rather than a live path.

- **Site visits are property/project only.** The thread's "Site visit" button is
  hidden on a requirement thread because there is nothing to visit; a
  requirement poster who wants one has to ask in words. That matches the visit
  state machine (`visits` hangs off a listing), and widening it would be a new
  feature, not a fix.

- **Admin read-only chat still has no surface** (already tracked above). Project
  threads join the same gap: reports on them will queue with everything else
  once P13-15 lands.

---

## Profile ⋯ menu sweep — 29 Jul 2026 (out-of-scope findings)

Every row of the profile ⋯ menu was walked as a builder and as a broker, with
the sheets and three-dot options inside each destination. Six defects were fixed
in that pass (visitor preview, Settings verification badge, the builder's
requirement paywall, Unhide on a builder's hidden listing, the builder's My
Requirements controls, and rejections never reaching Account status). What was
found and deliberately NOT changed:

- **A `pending_review` requirement has no controls at all.** P8 S4 draws the
  toggle / Edit / Mark fulfilled / ⋯ row only for `live` and `paused`, so a
  requirement posted by mistake cannot be deleted or shared while it waits for
  moderation — the ⋯ that holds Delete is inside the same gate. It is not a
  permanent trap (approval or rejection moves it on), but the seller's only
  option is to wait. Adding the ⋯ to the pending card is a design change and was
  not made.

- **My Plan shows a builder listing slots they cannot spend.** Manish Agarwal
  (builder) holds five ₹999 Listing Plans from before 0067 and the screen prints
  "Property listings 1 / 1" and "1 Listing slots left". The rows are real and the
  screen is honestly reporting them, but `PostType` already hides the leftover
  slot hint from a builder for exactly this reason, so the two screens disagree.
  Either the plan card grows a role-aware line or those snapshots get a
  migration; both are Rajan's call.

- **A builder can still edit a listing 0067 hid.** `PATCH /listings/:id` has no
  role guard (unlike the requirement PATCH, which refuses a content edit for a
  builder). It is not a takedown bypass — an edit leaves `status` at `hidden`
  and unhide is refused — so it is pointless rather than dangerous.

- **Drafts is reachable from the ⋯ menu for a builder.** `/create/drafts` is a
  PROPERTY drafts screen and `PostType` deliberately hides its "Continue from
  drafts" link from builders. The menu row was left in place because a builder
  with a pre-0067 draft would otherwise have no way to reach it; its empty state
  now leads to `/create`, which for a builder is the project flow.

- **Help is still P12.** The ⋯ menu's Help row raises a toast rather than
  opening anything — unchanged, and already tracked above.

Data note: the fix that makes rejections visible was proven by rejecting one of
RK Properties' pending listings through the real staff endpoint
(`QA PG Rent Rajkot`, reject #1). That listing is now `rejected` in the dev DB
and RK's Account status is no longer "in good standing" — intentionally left in
place as the seeded proof of a state that had never had a row.

---

## Admin data seed (30 Jul 2026) — what the hunt turned up

`npm run seed:admin` fills every P13-14-15 screen with real, interlinked rows.
Three things had to be fixed in the schema before the data could exist at all,
and four are left open for the admin build.

**Fixed here**

- **A Super Admin could not exist.** `staff_level_check` allowed only `'staff'`
  and `'admin'`, so the whole Super tier of Doc3 §1.1 — plans/pricing, staff
  management, feature flags, audit log, evidence SOP, branding — had no role to
  hang off, and the "minimum 2 super admins" rule was unenforceable. Migration
  `0089_staff_super_level.sql` adds `'super'`.
- **The Appeals auto-flag tab could never have a row.** Doc5 A8 gives Appeals
  two tabs, but `moderation_appeals.subject` was limited to
  listing/requirement/project, so a user disputing a false positive on their own
  bio had nowhere to land. Migration `0090_appeals_auto_flag.sql` adds
  `'auto_flag'`.
- **35 admin tables did not exist.** Audit log, support desk, disputes, CMS,
  templates/strings, flags/limits/retention, blocklist, number patterns, cron,
  health, analytics, trash and exports were all missing. Migration
  `0088_admin_core.sql` creates them, RLS on, no policy — the same deny-by-
  default posture as every other table in this schema.

**Still open — for the admin build**

- **Nothing WRITES to most of the new tables yet.** `admin_audit_log`,
  `cron_runs`, `health_checks`, `queue_depths`, `analytics_events`,
  `platform_daily_stats`, `funnel_daily`, `story_aggregates` and `backups` are
  seeded so the screens are not empty, but no endpoint or job produces them.
  Every admin mutation must append to `admin_audit_log`, and the BullMQ workers
  must record their runs, or these screens will drift into fiction.
- **`trash_items` is a registry with no producer.** Soft-deletes across
  listings/requirements/projects/users/chats set their own `deleted_at`; nothing
  writes the row the Trash browser reads, and nothing purges on `purge_at`.
- **Reconciliation rows are synthetic.** `reconciliation_runs` / `_items` are
  seeded; the hourly Razorpay match job (Doc7 §17.12) must fill them for real,
  and the per-row "re-check" button needs an endpoint.
- **Two pre-existing boosts point at a listing that no longer exists** (from an
  earlier seed, not this one). Harmless today because the boost queue joins on
  the listing, but `boosts.listing_id` has no FK — worth adding one.

**Deliberately not seeded — Module 12.** Legal pages, CMS pages and blog posts
(P12 + Doc10) are left empty on Rajan's instruction: that module gets its own
prompt and its copy comes from Doc10, so seeding invented legal text now would
only have to be thrown away. `cms_pages`, `cms_page_versions` and `blog_posts`
exist and are empty. FAQs, banners and broadcasts ARE seeded — other admin
screens read them.

**Deliberately not done:** no admin Google whitelist was created. The staff rows
exist as DATA (so audit, ticket assignee, exports "by" and the Staff screen are
populated) but nobody can log in with them. Real admin accounts get created with
the admin build, when Rajan gives the emails.

## Module 11 · P1 — admin sign-in provider

**Google OAuth credentials are not configured.** `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET` are empty in `.env.local`, so the real Google
round-trip cannot be completed or proven. The panel therefore signs in through
`lib/admin/auth-provider.ts`, which mirrors the OTP layer's dev/real split.

What is NOT deferred: the whitelist check against `staff`, the active/revoked
branch, the role, the `staff_sessions` row, the rotating refresh token, the
`admin_login_attempts` log and the per-request re-verification are all real and
identical in both providers. Only "which Google account is this?" is stubbed,
and only outside the production band — `adminAuthProviderKind()`, `devIdentity()`
and the `/api/v1/admin/auth/dev` route each refuse to run unless
`lib/env` → `devAffordancesAllowed()` is true, i.e. `APP_ENV` is `staging`/`dev`.
A deploy that declares nothing counts as production and stays shut.

**To finish:** put the two credentials in the environment. The provider flips to
Google automatically; `googleAuthorizeUrl()` / `googleIdentityFromCode()` are
already written and no other code changes.

## Module 11 · P2 — what A1 + A2 found and left open

Four gaps the dashboard's own copy implies but P2 does not own. None of them is
key-blocked; each belongs to a screen a later part builds.

**1. Nothing DETECTS an anomaly.** The dashboard's banner row reads
`anomaly_events` and the × now persists a real dismissal — but the only rows in
that table were written by `seed-admin.mjs`. No job watches for a payment-failure
spike, an OTP spike or a report spike, so a real spike tomorrow puts nothing on
the screen. The detector belongs with A27 Cron & System (**P7**): it is a cron
job plus three thresholds, and the table, the banner, the link and the dismissal
are already there waiting for it.

**2. The two profile preferences are stored, not acted on.** "Email me on
escalations" and "Daily queue digest" write to `staff.notify_escalations` /
`staff.daily_digest` and read back (proven). Nothing sends either message —
there is no escalation mail and no digest job. Delivery needs Resend (**B5**)
and a cron entry, and the digest's contents are the queue tiles this part
already computes (`lib/admin/dashboard.ts`). Until then the switches are honest
about what they are: a stored preference.

**3. The super alert is a bell row, not an alert.** Doc5 A1 says "5+ failed
attempts → super alert". P2 raises a real `admin_notifications` row, once per
15-minute window, and it appears in the bell (proven live: 6 failures → 1 row).
Reaching a super admin who is NOT looking at the panel is email/push, i.e. the
same delivery gap as (2).

**4. Maintenance can be turned OFF from the banner, not ON.** The shell's red
banner is real (`maintenance_settings`) and its "Turn off" link works, super
only, audited. Turning it on, the message, the ETA and the bypass roles are A22
Settings (**P7**) — the banner would otherwise offer a link that does nothing.

### Two defects P2 fixed that were NOT in its prompt

- **The admin panel was unreachable after signing in.** `middleware.ts` gated
  the admin zone on the USER session (`hz_at`), which is host-only to the public
  and seller hosts and can therefore never be present on account.* — every
  successful admin sign-in was redirected straight back to /login. The zone now
  verifies the admin cookie (`lib/admin/edge.ts`).
- **Nothing ever spent the admin refresh token.** Access is 30 minutes,
  refresh is 12 hours, and `refreshAdminSession()` had no caller: half an hour
  into a shift an admin was thrown out to the login screen with a valid session
  in the jar. Middleware now rotates through `/api/v1/admin/auth/refresh`.
  Building that also surfaced that `req.url` inside a route handler reports the
  INTERNAL origin (localhost), so redirects built from it landed on the public
  host — including the OAuth `redirect_uri`, which would have failed against
  Google in production. Both now use the request's own Host / a relative
  Location (`lib/admin/oauth.ts`).

---

## Module 11 · P4 — A10 Users, A11 User detail, A12 Listings master, A31 Impersonation

### What P4 found and FIXED (none of it was in the prompt)

- **Every queue's City filter had been silently empty since P3.**
  `lib/admin/filter-options.ts` read `locations` with `.eq("kind","city")`, and
  that table's column is `level`. PostgREST errored, `data` came back null, and
  the pill opened onto no options at all. Now `level` + `is_launched` (the
  master table holds 104,612 cities).
- **"Grant trial" could never have worked.** `user_plans.catalog_code` is a
  foreign key into `plan_catalog(code)` and the endpoint invented `admin_trial`,
  so every grant 422'd behind a sheet the design draws a success toast for.
  Migration 0099 gives the grant its own inactive catalog row. The seeded trials
  had sidestepped this by reusing a SELLABLE code (`p2999`/`p9999`), which made
  a granted trial claim to be that paid plan in every screen that groups by
  catalog code.
- **A compliance edit wrote a moderation_log row that Postgres rejected.**
  That table's `action` is CHECK-constrained to approve/request_changes/reject,
  so the insert failed and was swallowed: a success toast over a trail entry
  that never existed. Removed — the edit does not belong there, and the audit
  row carries the reason and the old value, which is what the panel's banner
  actually promises.
- **"Remove story" had nothing it could write.** Stories are DERIVED from
  `live_at` inside 24h (`lib/feed/stories.ts`), so the button would have
  "removed" a story that came back on the next feed read. Migration 0098 adds
  `story_suppressed_at` to `listings` and `projects` and the story queries now
  honour it — all six read paths.
- **The bulk registry had never had a single entry.** `lib/admin/bulk.ts` and
  `/api/v1/admin/bulk/:resource/:action` shipped in P1b and 404'd every action,
  because `apply(me, id)` took no payload and every bulk action the design draws
  needs one (a reason, a message body, a grant's contents). The handler now
  takes the bar's input, and `lib/admin/bulk-actions.ts` registers A10's three
  and A12's three.

### Nothing is left open from P4

The four gaps the first pass recorded here were closed rather than tracked.
`npm run check:admin-p4` proves each one from the database.

1. **A project can be decided now.** `moderate()` always supported the subject;
   no admin screen ever called it with one, so a submitted project sat in
   `pending_review` forever — a builder could pay, post, and never be reviewed.
   Approve / Request changes / Reject now live in A12's panel (the one screen a
   project already appears on) and in the bulk bar, calling the SAME state
   machine A4 and the seller app obey. A3 keeps the five sub-tabs the design
   draws; nothing there changed. `request_changes` from A12 attaches the
   admin's reason as the review note, because `moderate()` correctly refuses to
   ask a seller to fix something unnamed.
2. **Every channel records what it actually did.** `admin_messages.delivery`
   (migration 0101) holds a per-channel result. In-app goes through the
   notification pipeline that owns preferences and quiet hours; email calls
   Resend; WhatsApp calls MSG91 through `lib/notifications/whatsapp.ts`, built
   to the same shape as the email sender. Where an environment has no keys the
   row records `no_credentials` and the toast NAMES the channel that failed —
   `delivered_at` is only set when something really went out. Adding the keys
   changes no code.
3. **The impersonated tab carries the A31 banner.** `ImpersonationBanner`
   renders in the seller shell, and only when the request resolves a live
   session — a real user never sees a pixel of it, so the locked design is
   untouched for them. Its "Exit session" is the single write the read-only
   wall permits by path, and it ends the row on the server, so closing the
   session and closing the tab are the same click.
4. **A10's view is no longer O(everything).** `admin_user_list` was CTEs that
   aggregated five whole tables per read (132 ms at 200 users, and the same
   shape at 50,000). Migration 0100 rebuilds it with LATERAL over the indexes
   0098 added: **8.6 ms** for a page of 50, asserted by the check so it cannot
   quietly regress.

---

# A0-M12. Module 12 (P12 — Help · Legal/CMS · Blog · Data rights · System) — built 3 Aug 2026

Shipped: 8 migrations (0113–0120), 6 services, 20 API routes, 17 screens across
the public and seller hosts, 52 help articles, 8 legal pages transcribed from
Doc10, and 8 blog posts (~6,300 words). Two auditors: `npm run check:module12`
(141 live checks) and `npm run check:module12-ui` (57 render/copy checks).

## What the hidden-issue hunt found (all fixed unless marked)

**1. The legal pages were serving junk.** `cms_pages.body_md` for all eight
pages read `"Published body 1785656601391"` — `scripts/check-admin-p6.mjs`
republishes each page with a throwaway body to prove the version machinery
works and never cleans up, and it had overwritten the real content. The genuine
Doc10 text was only in `cms_page_versions` v1.0. The seed now restores the full
Doc10 content and deletes the 11 `note = 'P6 check'` version rows.

**2. Eight columns and a whole feature existed only on the dev database.**
`cms_pages.kind/icon/sort_order/effective_date/reader`,
`cms_page_versions.effective_date/is_material`, `blog_posts.is_featured/badge`
and seven columns on `faqs` were added out of band during P6. Migration 0106's
own `admin_cms_list` view SELECTs `p.kind` and `p.effective_date` — so a fresh
`npm run migrate` built a database where a Module 11 view failed to compile.
All of it is written down in 0113, idempotently.

**3. `POST /support/tickets` was broken for every user.** The ticket number was
`2800 + count(*) + 1`. The numbers already in the table were not allocated
contiguously, so it landed on one that existed, the unique index rejected the
insert — and the insert error was returned as `VALIDATION_ERROR`, so "Submit
ticket" looked like a form problem and did nothing, forever. Now a Postgres
sequence (0119), and an insert failure returns `SERVER_ERROR`.

**4. Re-acceptance could never be recorded.** `auth_consents.kind` was
CHECK-constrained to `('age18','dpdp','tc')` since 0001; P12 keys consent by
page slug, so every insert was rejected — and `acceptLegal()` ignored the insert
error, so the endpoint answered 200 while writing nothing and the interstitial
would have come back on the next page load for ever. Constraint widened (0120),
error now read.

**5. The 7-day payment hold could never fire.** `getAccountLifecycle` filtered
payments on `status = 'captured'`, which is not a value in the `payment_status`
enum (`pending, success, failed, refunded, chargeback`). It matched nothing, so
deletion was available immediately after any payment. Found by the live check
forcing a hold and watching the delete path stay open.

**6. Two jump controls were dead.** `behavior: "smooth"` is a silent no-op
wherever smooth scrolling is disabled (headless Chrome, some webviews,
OS-level reduce-motion) — it killed all 19 entries in the legal Table of
contents. Separately, `AppShell` scrolls inside `<main>`, not the window, so
`window.scrollTo` moved nothing on the components gallery, killing all 15
section chips. `scrollToId()` in lib/utils.ts finds the real scroll container
and falls back to an instant jump when smooth does nothing.

**7. The data export had no abuse floor.** The in-flight guard looked like a
throttle and was not — the build runs inline and finishes in well under a
second, so every press of "Request data" ran an eight-table scan, wrote another
object, and fired another notification. A ready export in the same format is
now returned as-is, plus a 60-second floor between builds.

**8. `SettingsHome` rendered its section titles through
`dangerouslySetInnerHTML`** for the sake of one `&amp;`. Not exploitable — every
caller passed a literal — but it was XSS surface on a screen whose labels could
easily become admin-editable. Replaced with a text node.

## Decisions taken, that are Rajan's to reverse

- **`requires_reacceptance` is seeded FALSE on all 8 pages.** Turning it on
  walls every existing account behind the interstitial on their next page load.
  The flag is for a MATERIAL CHANGE, and v1.0 is the first version rather than a
  change to one. A20's toggle is the switch; the gate itself is proven working
  by `check:module12` §9, which publishes a version nobody has accepted and
  walks the whole flow.
- **Doc10's `[SQUARE BRACKET]` placeholders are carried through verbatim** —
  entity name, CIN, registered address, support email, grievance officer phone
  and hours. Doc10 says they are Rajan's to fill and that an advocate must
  review before go-live; inventing a legal entity name would be fabricating a
  legal record. The grievance officer's NAME and EMAIL do resolve, because A20
  already holds real values for them (`branding_settings.grievance_officer` =
  "Priya Shah"). Fill the rest in A20 → Branding; the public page follows
  immediately.
- **Help and Support are seller-only, not public.** P12 marks only the legal and
  blog screens `g-ok` (guest-readable); the help screens are not marked. Doc10's
  "Guest-accessible + SEO" line is about the legal/blog surfaces, and that is
  what was built. A public help centre would be a real SEO asset — say the word
  and it is a routing change, since the service layer is already guest-safe.
- **The design's demo hub (`s-home`) was not built.** It is the prototype's own
  navigation harness ("Other modules are placeholders"), not a product screen.
  Its real entry points are the Settings rows, which now all point at live
  routes instead of `/help/contact?topic=…` stubs.

## Production pass — 3 Aug 2026 (the three items above are now closed)

Closing them surfaced five more bugs, four of which would have destroyed the
content this module just shipped.

**Maintenance now freezes WRITES, not just pages.** MaintenanceGate stops a
visitor loading a screen; it never stopped an already-open tab from posting.
The freeze lives in `middleware.ts`, the one chokepoint every API request
passes. Middleware runs on the Edge, where supabase-js and ioredis are both
unreachable — so the flag is read over PostgREST with plain fetch (migration
0121 exposes a SECURITY DEFINER function returning ONLY what the public
maintenance endpoint already publishes; never `bypass_roles`). Cached 10s per
isolate, checked only on non-GET, fails open. `/admin`, `/auth`, `/cron` and
`/system/maintenance` stay open, or the window would lock out the people who
have to end it. Propagation is ~10s by design, and that is written down rather
than pretended away.

**Ticket attachments are real.** The design's three "Add screenshot" tiles are
on the same presign → PUT → commit pipeline as every other upload, into the
PRIVATE bucket (a failed-payment screenshot routinely carries a bank
reference), read back through an authenticated route rather than a signed URL.

**Blog covers were never an asset problem — they were a missing control.** The
admin blog editor had no cover field at all, so `cover_url` was unreachable by
anyone. It now has one, plus excerpt and both SEO fields.

### Found while closing them

1. **The CMS could delete a blog post by saving its title.** `saveBlogPost`
   nulled every field the form did not send, and the edit panel never LOADED
   the body — so a title change wrote an empty string over a 5,000-word article
   and reset "7 min read" to 1. It cleared the cover, excerpt and both SEO
   fields the same way. Absent now means unchanged, and the panel loads the
   real post before letting anyone edit it.
2. **A title save also silently rewrote the SLUG**, turning
   `/blog/mavdi-vs-university-road` into
   `/blog/mavdi-vs-university-road-which-area-fits-you` — 404-ing every shared
   link, every inbound link and the sitemap entry, with the post still sitting
   there under a different address. The slug is derived on create, or when an
   editor types one, and never re-derived.
3. **`published_at` was stamped with `now()` on every save**, so fixing a typo
   in a January post reprinted it as today's and jumped it to the top.
4. **The blog category dropdown was a hardcoded array** ("Buying Guide", "Area
   Guide", "Product", "Market") matching no chip on the live blog — a post saved
   from the admin landed in a category no filter could show. It reads
   `blog_categories` now, the same rows the public site does.
5. **A staff reply notified with `report_outcome`**, whose href points at a
   REPORT — the user got a notification about their ticket that deep-linked
   them somewhere unrelated. Now `support_ticket_replied`.

### Found by the follow-up security audit, and fixed

- **HIGH — a ticket could launder a read of any private-bucket object.**
  `ticketAttachmentBytes` checked that a key appears in the attachments on the
  caller's own ticket, which sounds like ownership and is not: the caller wrote
  that list. Attaching `docs/<someone>/<key>` to your own ticket and reading it
  back would have served another user's VERIFICATION DOCUMENT, since support
  screenshots and ID scans share the private bucket. Keys are now filtered
  against `support/<caller>/` on the WRITE — the wall that was missing. The
  auditor's own first version of this test passed for the wrong reason (the
  object did not exist); it now uploads a real doc and tries to launder it.
- **MEDIUM — the freeze exemption trusted the Host header.** It keyed off
  `zone !== "admin"`, and `zone` is derived from a header the client sets, so
  `Host: account.…` skipped the freeze with no admin session anywhere. The
  exemption is by PATH now. Host is fine for routing (those routes are gated
  again by `requireAdmin`); it is not something to hang a guard on.
- **LOW — the attachment response** now carries `X-Content-Type-Options:
  nosniff` and a `default-src 'none'; sandbox` CSP.

Auditors: `npm run check:module12` is 170 checks, `check:module12-ui` is 57.

## Still open — genuinely, and not ours to close

- **Doc10's `[SQUARE BRACKET]` placeholders.** Entity name, CIN, registered
  address, support email, grievance phone and hours. Doc10 says they are Rajan's
  to fill and that an advocate must review before go-live; inventing a legal
  entity name would be fabricating a legal record. Fill them in A20 → Branding
  and the public pages follow immediately — the officer's name and email already
  resolve from real values there.
- **Blog cover ART.** The pipeline is complete — an admin can set a cover and the
  post renders it — but no photographs exist yet, so all 8 posts fall back to the
  design's own tinted placeholder. Sourcing them is a content task; nothing here
  fabricates a property photo.
- **`requires_reacceptance` is seeded false** on all 8 legal pages. A decision,
  recorded above, not an omission.

## Next 15 upgrade (4 Aug 2026) — verification-script defects, all FIXED

None of these were application bugs and none were caused by the upgrade. They
were defects in the *verification* scripts, and they mattered because a broken
verifier makes a before/after comparison lie — which is the one thing an
upgrade cannot afford. All three are fixed and proven; nothing is left open.

- **FIXED · HIGH — `check:admin-p6` destroyed a real legal page on every run.**
  The page-picker read `where kind is null or kind not in ('terms','privacy',
  'grievance','refund')`, but `kind` holds `'legal'` or `'page'` — never a slug
  — so the test was always true and the check grabbed a real legal page,
  republished it with a 28-character throwaway body, and never put it back.
  (The unpublish guard further down the same file already carried this exact
  fix, with a comment saying the first version "never fired". Only half the bug
  had been caught.)

  Proven from the DB: `privacy` went 5798 → 28 chars at 02:58 on 4 Aug during
  the *Next 14 baseline* run, and `refund` went 3317 → 28 at 05:20 during the
  Next 15 run. Both restored with `npm run seed:module12`, which reported
  removing exactly 2 throwaway `P6 check` versions.

  Now: excludes by slug, prefers a page whose `kind` is not `'legal'`,
  snapshots the row it borrows and restores it — body, version, flags, SEO
  fields — then deletes the version rows it cut. Two new assertions prove the
  restore. Verified by dumping all 8 `cms_pages` before and after a run: byte
  identical, and the check passes.

- **FIXED · MEDIUM — `check:messages` was not idempotent.** The builder for the
  proposal walk was picked on "has a live project" alone, with no requirement
  that they could actually afford a proposal, so a builder with no active plan
  yielded `proposalBalance() = 0` and the walk failed with `NEED_TOPUP` for a
  reason unrelated to the code under test. `proposal_used` was also never
  rolled back, so on a finite plan every run burned one proposal for good.

  Now: selection mirrors the server's own rule in `lib/listings/proposals.ts`
  (an `active` plan row, either unlimited or with quota left), and the walk
  returns the quota it spent. Verified by running the check twice back to back
  — both green, where the second run used to fail.

- **FIXED · LOW — `check:bundle-secrets` reported 49 false positives.** Three
  `.env.local` values are byte-identical to hardcoded fallbacks in
  `lib/env.ts` (`REDIS_URL` = the `redis://127.0.0.1:6379` default at line 49,
  `EMAIL_FROM` = the `noreply@homzlist.com` default at line 70), and
  `FCM_PROJECT_ID` is a 12-character value that is a substring of the build
  path baked into every chunk. Next.js replaces non-`NEXT_PUBLIC_` env reads
  with `undefined` on the client, so what the grep found was the source
  default, not a secret. The real secrets all default to `""` and appear
  nowhere in the client bundle — the `serverEnv()` guard held throughout.

  Now: the gate skips values it cannot attribute — ones equal to their own
  fallback literal in `lib/env.ts`, and short ones that are substrings of the
  build path — and says why. The skip is by VALUE, not by name: a production
  `REDIS_URL` carrying real credentials no longer matches the default and is
  still checked. Result is now `PASS — 11 secret value(s) checked against 441
  client bundle file(s): 0 leak(s)`.

- **Not defects — network flakes.** `check:notifications`, `check:inbox` and
  `check:admin-p4` each failed once with `ETIMEDOUT :5432`, `Connection
  terminated unexpectedly` and `ECONNRESET`, and passed on retry. Network to
  the dev Supabase, not code.

## Still open after the Next 16 upgrade (4 Aug 2026) — `check:boost`

`check:boost` is the one verification script that does not end green, and it
did not end green before the upgrade either — it could not run at all, because
`seed-module9` threw on a precondition that cannot exist.

**Fixed, and it now gets most of the way through:**
- it opened a single hard-coded DB host, so it died with `ETIMEDOUT` whenever
  that host's IPv6 route dropped;
- `seed-module9` demanded "a builder with a live listing", which contradicts the
  product — builders post projects. Builders are matched on projects now and
  their boosts carry `subject_kind = project`, a subject the schema has always
  permitted and nothing had ever created (the table held 0 of them);
- `seed-module9` ranked sellers by total listings while the fixtures need
  live+available ones, and indexed `brokerListings[4]` where no broker in the
  demo data has five;
- the seed restores its own sellers' inventory before running.

**What is still wrong: the check pollutes the state it depends on.**

`check-boost-live.mjs` drives real flows — it marks a listing sold mid-approval,
it approves, rejects, pauses and resumes boosts — and it never puts any of it
back. Run it twice and the second run fails differently from the first:

    run 1   2 failures
    run 2   4 failures   (`alreadyDecided: true` — the boost was decided last run)

So its result depends on how many times it has been run since the last seed,
which makes it useless as a gate. The remaining failures are all downstream of
that: `staff APPROVE puts the boost live` gets `LISTING_STATE_LOCKED /
alreadyDecided`, and everything asserting on the resulting window, audit row,
pause and resume fails with it.

The fix is to make each flow restore what it touched — the same treatment
`check-admin-p6` got in this pass — but that is a rewrite of a verification
script, not upgrade work, so it is recorded rather than rushed.

**This does not describe a fault in the boost feature.** The application paths
it exercises answer correctly; it is the script's own leftovers that make the
second run disagree with the first.

---

## Carousel home feed (5 Aug 2026) — found while building it

**1. Brokers & Builders tab has no pagination.**
The tab's page size is now 100 (it was 20, applied *before* the "has live
inventory" filter — so a "21 builders" rail linked to a screen that listed 11).
The count and the list agree today, but a city with more than 100 active sellers
would show 100 under a header counting all of them. The Projects tab got a real
`Show more` in this pass; the sellers tab still needs one.

**2. A guest's city is not sent to the server.**
`FeedHome` stores a guest's chosen city in `localStorage` (UI-only preference,
no profile to hold it) and re-fetches — but `/api/v1/feed`, `/feed/sections` and
`/feed/section` all resolve the city from `profiles.city_id`, which a guest does
not have. So a signed-out visitor who picks "Rajkot" still gets the un-scoped
feed. This predates the carousel change (the old vertical feed had it too); the
fix is a `?city=` parameter validated server-side against `locations`, not
trusting it for anything but scope.

**3. `ptypes` / `roles` filters are not in the filter sheet.**
The rails' "View all" links carry `ptypes=<scheme type>` and `roles=builder|broker`
so the results page shows exactly what the rail showed. Both are parsed and
enforced server-side, but the P3 filter sheet has no chip for either, so they
can only be cleared with "Clear filters" (which does drop them). They are
deliberately left out of `activeFilterCount` — a badge for a chip that isn't in
the sheet would be worse than no badge.

**4. Scheme-type → property-type pairing has no admin screen yet.**
`project_types.property_type_codes` (migration 0123) decides which rail a scheme
type appears on. It is real data and editable by SQL, but the P14 master-data
screens do not expose the column, so changing the pairing today means a
migration. The feed reads it live, so an admin edit would take effect with no
deploy — only the UI is missing.

---

## Dashboard hub (seller feed header → grid icon) — 6 Aug 2026

Found while building the hub. None of these are caused by it; the hub only made
them easier to see, so they are recorded rather than quietly patched.

**1. "Dashboard" now names two different things for a builder.**
`components/feed/BuilderDashboard.tsx` is a builder's FEED CONTENT (their own
project stat cards + matched requirements). The new `/dashboard` is a
destination menu. A builder therefore has a feed that is a dashboard and a
header icon labelled Dashboard that opens something else. Nothing breaks, but
one of the two should be renamed before the word is in front of users.

**2. Role-filtering the nine — RESOLVED, and the answer is "do not".** *(closed
6 Aug 2026)*
This was raised as an open decision. It is not one: the server already answers
it, and `scripts/check-builder-requirements-live.mjs` asserts the answer.
A builder's requirement access ships WITH the ₹9,999 project plan (migration
0087), so the check requires that a "builder with ₹9,999 sees UNLOCKED
requirements", and that a "builder WITH a live project can send a proposal".
Hiding "Browse requirements" or "My proposals" from builders would hide two
screens they legitimately use and would break that script. What a builder
cannot do is BUY the ₹2,999 requirement-only plan — already refused server-side
(403 on quote and checkout, plan absent from their catalog).
All nine are gated by ENTITLEMENT (active plan / live project / quota), never by
role, and each screen renders its own locked state — which is where the upsell
lives. A hidden tile has no upsell. The reasoning is recorded on `HUB_GROUPS`
in `lib/dashboard/items.ts` so it is not "rediscovered" and reversed later. Any
future role rule must be enforced on the server first.

**3. "My visits" counts the viewer as the BUYER.**
The count reuses `myVisits()`'s own filter (`visits.buyer_id`), so the tile and
the screen agree — which is the property that matters. Worth knowing that
neither shows visits booked against a seller's own listings; that is the
poster-side view and no screen surfaces it yet.

**4. The hub is now the ONLY way into the nine (6 Aug 2026).**
They were removed from `ProfileMenuSheet` on Rajan's instruction, so the feed
header's grid icon is the single entry point. Two consequences worth knowing:
the icon renders only on the FEED, so from any other screen a seller taps Home
first; and it is seller-gated (`useRole()`), so it never appears on the public
host — correct today because the public host is the guest surface, but it means
`/dashboard` has no in-app entry point if a seller ever lands there logged in
on the public host.

---

## Requirement visibility sweep (6 Aug 2026) — found beyond the prompt

**1. RESOLVED (6 Aug 2026) — the guest city chip now scopes the PROPERTY feed too.**
Was: requirement mode honoured the chip and nothing else did, so a guest in
Mumbai saw Rajkot property under a header that said "Mumbai". Now every feed
read carries the validated `?city=` — `/feed`, `/feed/sections`,
`/feed/section`, `/feed/suggested`, `/feed/new-count` and `/stories` — resolved
by one helper (`lib/location/viewer-city`) that the requirement surfaces share,
with a signed-in profile's city always winning.
The empty-city question that was open here is answered the same way requirements
answer it, and it is now Doc4 §9's "+nearby auto" for real: a city with zero
live listings AND zero live projects widens to the rest of the state
(`lib/feed/scope.ts`), the rail counts widen with it (migration 0127 teaches
`hz_feed_type_counts` a state scope), and every subtitle then reads "in
<State>". A city with any inventory is untouched.
Closed too: `searchBrokers` now takes a `stateId` (migration 0128 gives
`profiles` a trigger-derived `state_id`), so the Top Builders / Top Brokers
rails in a widened request are scoped to the same state as the cards beside
them instead of dropping the location filter. Verified against the DB: Kachchh
widens to "20 builders … in Gujarat / 29 brokers … in Gujarat", which is exactly
what the state holds; Rajkot is unchanged at 17 / 22.

**2. RESOLVED (6 Aug 2026) — builder dashboard groups its cascade label.**
It rendered `m.tierLabel` inside the map, so five city-tier matches printed
"OTHER AREAS" five times — a heading repeated over each of the things it heads.
The label now appears when the group it names BEGINS, which is the rule the
requirement browse and feed already use. Nothing else about the card moved;
verified in the browser at 375px (1 heading over 5 cards, was 5).

**3. `requirements.city_id` can be NULL.**
`cityIdFor()` reads the FIRST preferred area's `parent_id`, which is the taluka
in the India Post master — so a requirement whose area sits directly under a
city resolves, and one that doesn't gets NULL. A NULL-city requirement is
reachable by direct link and by the all-India fallback, but never by a
city-scoped or state-scoped browse. Zero such rows live today (all 36 resolve to
Gujarat cities — verified 6 Aug 2026), so nothing is stranded right now; worth
watching as more cities open.

**4. RESOLVED (6 Aug 2026) — `check:story` seeds its own 24h window.**
Stories are DERIVED from `live_at >= now() - 24h`, and the dev seed is older
than that, so `scripts/check-story-live.mjs` opens with "0 circle(s)" and then
throws on the first segment it tries to inspect. Verified 6 Aug 2026 that this
is data, not code: bumping one listing's `live_at` to `now() - 2h` makes the
same script pass 17/17, and the timestamp was put straight back. Worth either
seeding a fresh row as part of the script or having it skip cleanly when the
window is empty — right now a green run depends on when the seed was last run.
Done: the script pulls the newest live listing into the window, runs, and
restores the timestamp — asserting the restore as its 18th check. The restore is
wired to SIGINT/SIGTERM/uncaught/EPIPE too, because a run killed mid-way (a bare
`| head` is enough) used to strand the row inside the window, which then
suppressed the next run's seeding and left the original `live_at`
unrecoverable — nothing in the schema remembers it.

## Notifications A-to-Z sweep (6 Aug 2026) — found beyond the prompt

**1. RESOLVED (6 Aug 2026) — every notification now leads to a real screen.**
The inbox renders only on `seller.<host>`, but several deep links pointed at
routes that exist on the PUBLIC host or nowhere at all: `verification_*` →
`/settings/verification` (404, the real screen is `/profile/verification`),
`area_added` → `/area/<slug>` (a public page; the seller rewrite 404s), and a
placeholder with no value trimmed `/property/{id}` back to `/property`, which is
not a route either. `report_outcome`, `new_device_login` and
`area_request_dismissed` had no template at all — 221 rows that were not
clickable, one of them carrying a "View status" button with nowhere to go.
Migration 0129 adds `notification_types.href_fallback` (a real seller route per
type), corrects the wrong templates, teaches `notify_upsert` never to store an
unresolved template, and repairs the rows already in people's inboxes.
Proven live: all 697 distinct stored links answer < 400, enforced from now on by
`npm run check:notifications`.

**2. RESOLVED (6 Aug 2026) — a moderation decision opened the wrong entity.**
`notifyModerationDecision` is shared by listings, projects and requirements, but
its three notification types are listing-shaped, so an approved PROJECT linked to
`/listings/<project id>` and an approved REQUIREMENT to `/listings/<requirement
id>` — a real page showing the wrong thing. The producer now derives the link
from `subject` (`/projects/<id>`, `/requirements/<id>`, and the matching `?edit=`
forms); migration 0130 repairs the 39 rows that were already wrong.

**3. RESOLVED (6 Aug 2026) — swipe-to-dismiss never completed on a real device.**
The row had `touch-action: auto` inside a vertically scrolling `<main>`, so the
browser owned both axes: it claimed the horizontal drag, fired `touchcancel`
instead of `touchend`, and the dismiss never ran — the row simply stuck
mid-swipe. It only ever "worked" under synthetic events, which is why the API
check passed while the gesture did not. Fixed with `touch-action: pan-y`, an
axis lock on the first move, and a `touchcancel` handler. Appearance unchanged.

**4. Seeds were writing links the real producers never write.**
`seed-admin.mjs` gave all 420 seeded rows `href = '/notifications'` (the inbox
pointing at itself) and `seed-module10.mjs` relied on `notify_upsert`'s old
`coalesce(p_href, t.href_template)`, which stored raw text like
`/requirements/{requirementId}`. Both are fixed — the admin seed now reads
`href_fallback` from the config table — but the lesson is the general one: a
seed that writes a shape the producer cannot produce turns every manual test
into a false pass.

**5. RESOLVED (6 Aug 2026) — `check:module12` failed on a date, not on the code.**
Its delete-path step restored a payment's real `created_at` and then expected the
7-day payment hold to be clear. Whether that passed depended on how long ago the
seed was run (`scripts/seed-admin.mjs` pins NOW to 30 Jul 2026), so on 6 Aug 2026
it returned a correct 403 and the script threw on the undefined `otpSession` — a
red run that said nothing about the app. It now pushes the payment safely OUTSIDE
the window to clear the hold and restores the true timestamps in a
`restorePayment()` wired to SIGINT/SIGTERM/uncaught/EPIPE, the same discipline
`check:story` already got, plus a clean message instead of a throw if the code is
ever refused. 170/170 passing, and no payment left sitting in the past.

**6. RESOLVED (6 Aug 2026) — the admin broadcast is clickable too.**
0129 left `admin_message` as the one type with no target, on the reasoning that
its content is the row itself. Overruled: the message is always ABOUT something.
The producers that know their subject now say so — a compliance edit or a hidden
listing opens that listing (the project form for a project, not the flat one), a
granted trial opens My Plan — and everything else lands on Account status, the
screen that already lists exactly these notices with their severity dots.
Migration 0132 repairs the 1276 existing rows and then ASSERTS the invariant:
zero notification rows with no link, zero types with no landing page. The check
script's exemption is gone with it, so nothing can quietly reintroduce a dead row.

---

## Home-feed reorder (8 Aug 2026) — found beyond the prompt

The prompt asked for seven blocks in a fixed order, the end-of-rail "View all"
tile gone, and a 1–2 card rail to adjust itself. Walking the six hidden-issue
questions against it turned up four things the prompt did not mention.

**1. FIXED IN THE SAME PASS — the Featured rail's "View all" would have lied.**
Every other rail's View all opens a search that contains exactly what the rail
was showing (the check script asserts it). "Boosted" is not a search filter, so
the same button on `Featured properties` opened 150 results under a heading that
counted 12. It now ships `viewAll: ""` and the pill is not rendered at all —
`SectionRail` hides it when there is no target. The rail is endlessly scrollable,
so nothing became unreachable.

**2. FIXED IN THE SAME PASS — rail counts undercounted boosts reaching in from
outside the city.** `hz_feed_type_counts` counts the scope; a boost bought for a
state or for All India puts a listing from ANOTHER city on the rail. In Bhavnagar
(one live listing) "Newly-added properties" printed **"1 property"** over **eight
cards**, every one of them paid to be there. `boostedCount` now also returns how
many boosted rows fall outside the counted scope and `getFeedSections` adds them,
so the number under a heading equals the number of cards handed out — verified by
walking the rail as each role rather than by recomputing the rule in the script.
This was pre-existing (the old per-type rails had it too); the reorder is what
made it visible, because one big rail now carries what nine small ones did.

**3. OPEN — the "in <City>" phrasing over cards that are not in that city.**
The count is now right, but the sentence is still "10 properties in Bhavnagar"
when nine of the ten are boosted in from elsewhere (each card carries its own
PROMOTED chip and its own real location). Housing.com and OLX both do this with
sponsored rows, so it is not obviously wrong — but it is a COPY decision, not a
code one, so it is not being changed unilaterally. Options if we want it exact:
"1 in Bhavnagar · 9 promoted", or drop the place from this subtitle.
→ **Needs Rajan's call.**

**4. OPEN (dated cleanup) — the retired `type:` / `ptype:` section keys.**
`/feed/section` still answers them, and `getFeedSectionItems` still resolves
them, purely so a PWA holding a bundle from before 8 Aug 2026 does not turn its
whole feed into retry rows. Nothing in the current UI produces these keys. They
can be deleted once we are satisfied no cached client is still asking — the
access logs for `/api/v1/feed/section?key=type:*` are the signal.
→ **Delete after ~30 days of zero hits.**

**5. FIXED IN THE SAME PASS (neighbouring suite) — `check:boost`'s wide-targeting
assertion had been failing on missing fixtures, not on the rule.**
`seed-module9.mjs` insisted the cross-city boost sit on a **Surat** listing, and
the fixtures have had zero live Surat listings for a while, so the seed printed
`! no live Surat listing`, created no state-targeted boost, and the check
reported `a state/All-India boost on an out-of-city listing exists to test with`
FAIL — for months, about data rather than about code. The seed now prefers Surat
and falls back to ANY live listing outside Rajkot; it picked an Ahmedabad shop
and `check:boost` is back to ALL CHECKS PASSED. This matters here because the
home-feed count fix (item 2 above) depends on exactly that reach rule, which
until now nothing was actually exercising.

**6. PARTLY ADDRESSED (8 Aug 2026) — nine live projects have no key specs at all.**
The card side is now handled: the strip is config-driven and hides below two
tiles, so those projects no longer draw a blank grey bar. `check:story` still
fails 1/17 because the STORY viewer promises every segment a strip, and these
rows have nothing to put in one.
`check:story` asserts "no segment shows an empty strip". Two seeded projects —
`QA Row House Scheme Rajkot` and `Green Acres Plots` — render `specs: (none)`,
because in the `projects` table `towers`, `floors`, `total_units`,
`available_units` and `possession_date` are ALL null and `attributes` is `{}`.
Nine live projects are in that state. Their `project_type` rows each configure
8 `key_specs`, so a project created through the real form would fill some;
`Green Acres Plots` is also typed `apartment` while being a plots scheme.
Deliberately NOT patched: backfilling project rows to turn a check green is the
same trap item 4 of the 6-Aug sweep warns about, and those rows are read by the
story, boost and detail suites. The real question is whether the project form can
legitimately produce an all-null project (→ the story strip needs an empty state)
or cannot (→ these fixtures are invalid and should be reseeded).
→ **Needs a decision before either fix.**

---

## 9 Aug 2026 — found while fixing the story viewer (out of that fix's scope)

**1. `next build` warns that the `middleware` file convention is deprecated
(Next 16) — "use `proxy` instead". ATTEMPTED 9 Aug AND REVERTED, ON PURPOSE.**
The rename itself is trivial (`middleware.ts` → `proxy.ts`, `export async
function middleware` → `proxy`; nothing else in the app imports it, every other
mention is a prose comment). It was done, then backed out, because of what the
migration silently changes underneath:

> `node_modules/next/dist/docs/.../file-conventions/proxy.md` §Runtime —
> *"Proxy defaults to using the Node.js runtime. The `runtime` config option is
> not available in Proxy files. Setting the `runtime` config option in Proxy
> will throw an error."*

Our file runs on the **edge** today — confirmed in the shipped build, whose
`middleware-manifest.json` entry points at `server/edge/chunks/*`. It verifies
both the user and the admin session with jose on every request its matcher
catches, which is nearly all of them. Renaming it therefore does not just rename
it: it moves the single hottest thing in the request path from edge to Node and
adds a cold start in front of every page load. That is a latency regression
bought with nothing but the removal of a build warning — and it directly
contradicts the decision already locked in `docs/UPGRADE-BASELINE.md`
("Decisions locked before starting" §1 and "Decisions carried into 16" §1),
taken during the Next 16 upgrade for exactly this reason.
→ **Stays `middleware.ts`. Revisit only when Next ships an edge story for
`proxy`.** Until then the build warning is the correct trade and should be
treated as expected output, not as a TODO.

**2. A guest feed load fires two requests that always 401 (`/api/v1/profile/me`
and `/api/v1/auth/refresh`), once per client navigation. HALF FIXED 9 Aug.**
`/api/v1/auth/refresh` is gone for guests: `lib/auth/api-fetch.ts` treated every
401 as "maybe the access token just expired" and answered it with a refresh POST,
so a browser with no refresh cookie re-asked a question the server had already
answered, on every single screen. A refresh that comes back with an explicit 401
now latches for the life of the document — the route only 401s when there is no
usable refresh token (no cookie, or a rotation failure that has just cleared the
cookies), so after one, there is provably nothing to refresh with. Failures that
say nothing about the session (offline, 5xx, parse error) deliberately do NOT
latch, so a signed-in user is never stranded on stale-token errors. Account
switching is a hard `window.location` navigation, so the latch cannot survive an
identity change.
`/api/v1/profile/me` still 401s once per navigation for a guest, and that one is
kept: it is the app honestly asking who it is talking to, and the 401 IS the
answer that renders the guest strip. Silencing it would mean a second,
non-httpOnly session-hint cookie written on login/logout/switch/register — a real
auth surface change, not a console cleanup.
→ **Guest console noise halved. The remaining single 401 per navigation is
expected, not a defect.**

**3. The checked-out `.next` production build was serving HTTP 500 for its own
JS chunks** (`/_next/static/chunks/*.js` → 500, `MIME type 'text/plain'`), so
`npm start` rendered the HTML and then never hydrated: every button on the site
was dead, including the story circles. It was a stale/corrupt build directory,
not a code fault. Rebuilt on 9 Aug and healthy. Worth recognising the signature —
"page looks right, nothing is clickable" means the build, not the component.

**4. `/area/*` and the `[landing]` SEO pages stay on the public host for a
signed-in user. BY DESIGN, 10 Aug.** Shares now always point at the main domain,
and a device with a session is handed on to `seller.*` so the signed-in view
opens (middleware, `SELLER_MIRRORED_SEGMENTS` + `lib/auth/session-hint.ts`). That
hand-off is limited to path segments the seller host actually serves. `area` and
the root-level `[landing]` city/locality pages exist ONLY under `app/(public)`,
so bouncing them would turn a working page into a 404 — they render as the
public page for everyone, signed in or not. If those two ever get seller
counterparts, add their segments to that one set and nothing else changes.
→ **Not a defect. Revisit only if area/landing pages are built for the seller host.**

**5. The session HINT cookie does not change the guest-401 note in item 2.**
`hz_sh` (added 10 Aug) is domain-wide but **httpOnly**, so no client code can
read it and `/api/v1/profile/me` is still how the feed asks who it is talking
to. The non-httpOnly variant item 2 describes was deliberately NOT built.

---

# Inquiry → Lead connection system (11 Aug 2026)

Chat was replaced by structured inquiries that become leads. **Nothing is
outstanding.** Two suites prove it, and both are runnable:

* `npm run check:leads-live` — **70/70**. Every claim checked against the row the
  database actually holds: guest 401 sweep, consent refusal, IDOR probes, the
  builder wall, config-driven chips, contact events, reports into the shared
  admin queue, the proposal→lead path, cooldown, the OTP round trip.
* `npm run check:leads-ui` — **19/19**, in a REAL hydrated Chrome. Hydration,
  taps, sheet stepping, consent gating, the number popup, in-screen search
  filtering, status writes. Screenshots land in `docs/_shots/leads`.

## The three bugs that made it look broken, and what they actually were

**1. Every client chunk was 403 — the app never hydrated on a subdomain host.**
Next 16 refuses a dev asset request whose Origin is not in `allowedDevOrigins`,
and answers with a 403 rather than a warning. The list had `localhost` and the
LAN IPs but not `*.localhost` or `lvh.me` — the very hosts this product routes
on and the one the cross-subdomain cookie work uses. So on `seller.lvh.me` every
`/_next/static` chunk was blocked, React never booted, and the whole app was
dead SSR HTML: no button worked, anywhere. Fixed in `next.config.mjs`.

**2. `crypto.randomUUID()` threw and took the Send Inquiry sheet down.**
It only exists in a SECURE context (https, or localhost). On plain http it is
undefined, so the idempotency key blew up inside an effect and the whole screen
fell into the error boundary. There is now one guarded `newIdempotencyKey()` in
`lib/utils`, used by the sheet and by payments.

**3. A sheet that opened a popup closed the popup a frame later.**
The parent sheet hid itself while the popup mounted; the closing layer's
`useBackClose` cleanup called `history.back()`, and that popstate shut the popup
that had just pushed its own layer. "Use a different number" opened and vanished
every time. The popup now stacks ON TOP (which is what a popup means — you come
back to Step 2 where you left it), and `useBackClose` additionally tags its
synthetic pops so one layer can never close another.

## Also fixed in this pass

* Leads header search searched **property search** and threw the user off the
  screen; it now searches their own leads in place, with a real sort/filter.
* Sending an inquiry twice silently overwrote the first; the sheet now shows the
  already-sent card and a re-send inside 6h is refused.
* Custom-number verification was impossible in the dev band (no code was ever
  returned); OTP, resend, reuse and the "no account is created" guarantee are
  all proved with rows.
* Lead cards render at the design's three weights; a worked lead no longer shows
  a stray bare "Call" line, and every card is openable.
* Publisher numbers go through the same OTP layer, without blocking creates
  (`test:create-flow` 573/582 — the 9 failures are PLAN_REQUIRED, unrelated).
* Projects carry their own contact/WhatsApp number; conversion per subject;
  the sender is asked "did they contact you?"; guests keep their intent through
  sign-in; admin has a read-only Lead panel and lead reports.

## Role matrix — owner · broker · builder · guest (11 Aug 2026)

`npm run check:leads-roles` — **53/53**. Every rule is asserted twice, at the
API and in a real hydrated browser, because a wall the server keeps but the
screen does not show is a dead button, and a wall the screen shows but the
server does not keep is not a wall.

| | property | project | requirement | own Leads |
|---|---|---|---|---|
| Owner | yes | yes | yes | yes |
| Broker | yes | yes | yes | yes |
| Builder | 403 | 403 | yes | yes |
| Guest | 401 | 401 | 401 | sent to sign in |

Two role holes were found and closed while testing:

**1. A builder was shown a Send Inquiry button the server then refused.** The
wall existed only in the API, so a builder could open the sheet, answer all
three steps and be refused at the end. The sheet now refuses up front from ONE
place (every entry point opens it) and says where they DO connect; the property
detail shows "Builders answer requirements · Browse" instead of a CTA that was
never going to work.

**2. Tapping Call on a project wrote a lead for a builder.**
`POST /projects/:id/contact` had no role gate, so the one connection route that
bypasses the inquiry sheet let a builder into another builder's pipeline. It now
drops the write silently, the same way it already did for a guest or an own
project, and `ProjectDetail` says so rather than pretending it worked.

RLS re-checked with the anon key: `leads`, `inquiries`,
`verified_contact_numbers`, `user_blocks`, `lead_contact_events` and
`inquiry_options` all return 0 rows to a browser key.

**Known legacy data, deliberately left alone.** 36 leads exist where a builder
is the sender on a property or project. Every one predates the rule (newest
9 Aug) and the gate now creates none. They record things that really happened
in the chat era, so they are not deleted — but a builder will see them in their
own Sent tab, and this is why.

## Note for the next person — testing this in a browser

Two different things made the app look dead in a browser, and both are fixed:

1. **Next 16 answered dev assets with 403** on any host missing from
   `allowedDevOrigins`. On `seller.lvh.me` every chunk was blocked, React never
   hydrated and nothing was interactive. `next.config.mjs` now lists
   `*.localhost` and `lvh.me` too.
2. **The in-app Browser pane blocks `lvh.me` itself** (`ERR_BLOCKED_BY_CLIENT`).
   Use **`http://seller.localhost:3000`** in the pane — there it hydrates, real
   taps work and screenshots are real. `computer{left_click}` often times out in
   the pane; `javascript_tool` with `el.click()` navigates fine.

For unattended runs use the CDP harness (`scripts/lib/cdp.mjs`, no dependencies)
behind `check:leads-ui`, `check:leads-roles` and `check:design-screens`. It
detects hydration by looking for React fiber keys, because
`__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers` reads 0 in headless Chrome and will
tell you a perfectly hydrated page is dead.

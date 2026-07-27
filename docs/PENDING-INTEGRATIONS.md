# PENDING — everything not finished, and exactly what to do when it unblocks

Status as of **24 Jul 2026**.

Three kinds of pending work, in priority order:

| # | Item | Blocked on | Costs money / breaks a flow? |
|---|---|---|---|
| **A1** | Boost approval never happens | **Module 11 — Admin Panel** (P13-14-15), not credentials | 🟡 Money is now safe (auto-refund after 48h), but boosts still can't go live |
| **A2** | Trial grants unreachable | Module 11 — Admin Panel (P13-14-15) | No — feature simply unusable |
| **B1** | Razorpay webhook secret | Rajan (dashboard) | 🔴 YES — late payments never settle |
| **B2** | Cron not scheduled in prod | Deploy step (`CRON_SECRET` on host) | 🔴 YES — expiry/refund/reminders never run |
| **A3** | Boost never appears in feed/search | **Module 9 — Boost placement** | 🟡 Even an approved boost would show nowhere |
| **A4** | Profile Block + Report buttons do nothing | **Module 7** (block) / **Module 11** (reports) | 🟡 UI claims success; nothing is saved |
| **B3** | Reminder delivery (push/email) | FCM + Resend keys (**Module 10 — Notifications**) | No — reminders are recorded, not delivered |
| **B4** | Cloudflare R2 | Rajan (keys) | No — Supabase Storage is the interim store |
| **B5** | Redis / MSG91 / Resend / FCM | Rajan (keys) | Varies — see table at the end |
| ~~C1~~ | ~~`EXPIRED10` has no expiry~~ | ✅ FIXED 22 Jul 2026 | — |
| ~~C3~~ | ~~Quota charged for a requirement/listing that was never created~~ | ✅ FIXED 23 Jul 2026, migration 0024 | — |
| **C2** | Checkout shows CGST+SGST, design shows one GST row | Rajan's decision | No |
| **M6.3** | Story media never expires (public bucket, so signing is a no-op) | **B4 (R2 / private bucket)** | No — anti-scrape only; story viewer works |
| **M6.4** | Same gap as A1, seen from Module 6 | **Module 11 — Admin Panel** | 🟡 Boost ranks correctly once active — it just can't get there |

**Module 6 is NOT 100% closed** — M6.3 + M6.4 above are the only two left, and
neither can be closed from inside Module 6. See the closure table in §A0-M6.

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
| P12 Help/Legal/Blog/System | help, legal, blog, system pages | ❌ not built |

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

## M10.5 — 🟡 Appeals: the user's half is real, the resolution half is Module 13-15

The design's rejected-listing row carries an "Appeal" button that, in the
prototype, only toasted. It now writes a real `moderation_appeals` row (0044,
one open appeal per item per user). **Nobody can resolve it yet** — there is no
admin appeals queue, so `status` stays `'open'` forever. Doc7 §137
(`POST /admin/appeal/:id/resolve`) is the missing half. Flagging it rather than
leaving a button that silently files into a void.

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

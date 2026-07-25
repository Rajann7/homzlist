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

## A1. 🔴 A paid boost never becomes active

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

## A3. Boost placement is not wired (Module 9)

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

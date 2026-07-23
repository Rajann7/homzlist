# PENDING — everything not finished, and exactly what to do when it unblocks

Status as of **22 Jul 2026**.

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

Everything below **fails closed** — nothing runs insecurely, the feature is just off.

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
| P2 Feed + Stories + Global Shells | feed, story | ⚠️ shell + bottom nav only — the feed itself is an EmptyState, stories nowhere |
| P3 Search / Explore | home, results, area, comingsoon | ❌ not built — `/search` 404s |
| P4 Detail Screens | property, project, requirement, viewer, sold, error | ⚠️ all four render; see D2 for what's missing inside them |
| P5 Creation A | plan, posttype, proptype, form, photos | ✅ |
| P6 Creation B | preview, checkout, success, reqform, projform, drafts, edit | ✅ (`edit` is the create form in edit mode — see C5) |
| P7 Messages & Chat | home, chat, requests, details, archived, blocked | ❌ not built |
| P8 Visits/Leads/Requirements/Proposals | leads, reqBrowse, myReq, myProp, proposalsRx | ❌ not built (own-requirement detail exists via P4) |
| P9 Profile suite | ownProfile, editProfile, verification, listings, listingStats, accountStatus, otp* | ✅ |
| P10 Saved/Activity/Settings | S1–S10 (12 screens) | ❌ none built — `/saved` 404s |
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

## D3. Leads stat has no source

Views became a real query in migration 0018. **Leads is still a literal `0`** in
`/profile/me` — there is no leads table because leads come from chat (P7).

Same gap on the property detail's owner stats strip (designs/P4 S1, added
23 Jul 2026): `service.ownerListingStats` returns a real `views` count and
`saves: null` / `leads: null`, and the strip renders `—` for the nulls rather
than a fabricated `0`. Fill them when the Saved suite (P10) and Leads (P8)
land.

Until then the profile shows a stat nobody can move. Either build it with P7 or
hide the tile; do not leave a permanent zero.

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

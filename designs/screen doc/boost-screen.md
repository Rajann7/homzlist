# Boost — Specification

> A paid, day-wise boost that gives a single **own, live** listing (property or project) extra visibility. Boost is its own separate screen; where it is reached from is out of scope here. Search/home ranking behaviour is defined on those screens — this spec covers buying, activating, and managing a boost.

---

## 1. Purpose & Scope
- Boost one **own LIVE** listing for extra visibility.
- Buyer / Broker → boost a **property**; Developer / Builder → boost a **project**. Own listings only.
- Boost is a **separate screen**; its entry points / placement are out of scope here.

---

## 2. What Boost Gives
- Extra visibility / top placement + a **"Boosted / Featured" tag** on the listing card and view screen.
- **Placement is identical across all plans** — plans differ **only by duration (days)**.

---

## 3. Plans (day-wise)
- Boost plans are **day-wise subscription plans** — each plan = a number of days at a price.
- The benefit / placement is the **same** in every plan; only the number of days differs.
- Flow: pick a day-wise plan → price → order summary.

---

## 4. Listing Selection
- Boost applies to **one specific own live listing** (pre-selected when entered from that listing).
- **Only LIVE listings** can be boosted — draft / pending / sold / hidden / expired cannot.
- Listing preview (thumbnail · title · reference ID) shown for confirmation.

---

## 5. Payment
- **Payment-first** (consistent with listing creation). **No refund.**
- Order summary + tax → pay → success / fail states.
- On payment failure, no boost is applied; the user can retry.
- Receipt / invoice for the boost purchase.

---

## 6. Activation
- On successful payment, the boost **auto-activates on the live listing — NO admin approval needed** (the listing is already live / approved).
- The **Boosted tag** appears on the card and view screen immediately.

---

## 7. Lifecycle & Listing-Status Interaction (core)
- **Active** → shows Active status + **days-left** (countdown to expiry).
- **Listing paused, or sent for re-approval after an edit (temporarily not-live) → boost pauses** — days stop counting and the boost **stays intact**; it resumes when the listing is live again. (Days consumed = active, unpaused days only.)
- **Listing sold / hidden / deleted by the user → boost expires; NO refund; NOT reusable.**
- **Admin rejects / removes the listing during boost → NO refund, but the boost is reusable** (see §8).
- **Expiry** → at 0 days-left the listing reverts to normal and the Boosted tag is removed. Re-boost = a **new plan purchase**.
- **One active boost per listing** (no stacking; re-boost only after expiry).

---

## 8. Reuse Rule (admin reject / remove only)
- **Trigger:** admin **rejects or removes** the boosted listing (NOT user sold / hidden / deleted).
- The boost becomes **reusable on another own live listing**.
- **Days already used are deducted** — only the **remaining days** carry over.
- No refund in any case.
- The user sees the **reusable boost (remaining days)** and applies it to another live listing, where it auto-activates.

---

## 9. Boost Status / Management
- Per boost: **Active** status · **days-left** · **leads count** — shown **both during the boost and as a total**.
- **No view count is shown** — only Active, days-left, and leads count.
- Active boosts list + boost history.
- **Empty state:** when nothing is boosted → prompt to buy the first boost.

---

## 10. Notifications
- **Boost activated** confirmation.
- **Expiry-soon** alert (in-app / email / WhatsApp) → renew prompt. Recommended trigger: ~1 day before expiry.

---

## 11. Rules & Edge Cases
- Only **live** listings are boostable; boost is tied to that listing (except the §8 admin-reject reuse).
- Boost **does not bypass** listing approval — the listing must already be live.
- Each listing is boosted separately; one active boost per listing.
- Role-gated: own property / own project only; login required.

---

## 12. Cross-screen Consistency
- Boosted tag → listing card + view screen (already specified).
- Ranking / placement → search / home screens (separate). Among multiple boosted listings (placement is identical across plans), the recommended ordering is **by recency** (most recently boosted / active first); the final ranking is defined on the search / home screen.
- Payment → same flow as plan purchase (payment-first, no refund).
